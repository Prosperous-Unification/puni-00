import { type JobTypeDescriptor, jobTypeDescriptor } from '../resources/host-pool';
import type { RunRecord, RunSample } from './run-records';

const GIB = 1024 ** 3;

/**
 * The provisional heuristics of `dash-host-jobs` J9, labelled so in `infra/jobs/README.md`:
 * they change after the first calibrations, never silently.
 */
export const HEURISTICS = {
  /** The proposal multiplies each p95 by this and rounds up. */
  headroom: 1.25,
  /** The fewest complete records a dimension's p95 is taken from. */
  minimumRecords: 3,
  /** The fewest complete runs a `waste` drift is judged over. */
  wasteRuns: 10,
  /** The CPU figure is the peak rate over a window at least this long. */
  cpuWindowMs: 10_000,
} as const;

/** The dimensions a proposal and the audit measure; duration has no catalogue field. */
export type Dimension = 'memoryGib' | 'cpuCores' | 'tmpDiskGib' | 'durationSeconds';

/** What one run record measured, per dimension; null where its samples cannot say. */
export interface RunMeasures {
  /** The largest `memory.peak` sampled, GiB. */
  memoryGib: number | null;
  /** The peak rate of `cpu.stat usage_usec` over a {@link HEURISTICS} window, in cores. */
  cpuCores: number | null;
  /** The largest tmp directory sample, GiB: a lower bound (J7). */
  tmpDiskGib: number | null;
  /** Gate to outcome, seconds. */
  durationSeconds: number | null;
  /** The largest `memory.events high` sampled: above zero, the scope was throttled. */
  memoryHighEvents: number;
}

/**
 * The peak CPU rate of `samples` in cores: for each sample, the window to the first later
 * sample at least `cpuWindowMs` on; a run shorter than one window is measured over its whole
 * span. Null with fewer than two counter readings or no time between them.
 */
export function peakCpuCores(samples: readonly RunSample[]): number | null {
  const readings = samples.flatMap((sample) =>
    sample.counters === null ? [] : [{ at: sample.observedAt, usec: sample.counters.cpuUsageUsec }],
  );
  const first = readings.at(0);
  const last = readings.at(-1);
  if (first === undefined || last === undefined || last.at <= first.at) return null;
  let peak: number | null = null;
  for (const [index, start] of readings.entries()) {
    const end = readings
      .slice(index + 1)
      .find((later) => later.at - start.at >= HEURISTICS.cpuWindowMs);
    if (end === undefined) break;
    const rate = (end.usec - start.usec) / ((end.at - start.at) * 1000);
    peak = peak === null ? rate : Math.max(peak, rate);
  }
  // Proof: returning null for a run shorter than one window made `three calibrations record
  // calibration records; propose …` (calibrate.test.ts) exit 1, not 0: its instant payloads
  // left cpuCores with no records (2026-11-02, Slice 4).
  return peak ?? (last.usec - first.usec) / ((last.at - first.at) * 1000);
}

/** What `record` measured; see {@link RunMeasures}. */
export function measuresOf(record: RunRecord): RunMeasures {
  return {
    memoryGib: record.peakMemoryBytes === null ? null : record.peakMemoryBytes / GIB,
    cpuCores: peakCpuCores(record.samples),
    tmpDiskGib: record.peakTmpBytes === null ? null : record.peakTmpBytes / GIB,
    durationSeconds: record.wallMs === null ? null : record.wallMs / 1000,
    memoryHighEvents: Math.max(
      0,
      ...record.samples.flatMap((sample) =>
        sample.counters === null ? [] : [sample.counters.memoryHighEvents],
      ),
    ),
  };
}

/**
 * Why `record` is not a complete measurement, or null when it is: ended with status 0, every
 * sample read, its ledger write and its container attribution complete, an exit sample present.
 * A failed or partly measured run says nothing reliable about what the job needs. A tmp walk
 * that could not read some subtree is not a telemetry failure and leaves the record complete:
 * only its tmp figure is a lower bound ({@link dimensionStandings}, task 6.23).
 */
export function incompleteness(record: RunRecord): string | null {
  if (record.endedAt === null) return 'no outcome recorded (running, or its launcher died)';
  if (record.exitCode !== 0) return `payload exit ${String(record.exitCode)}`;
  if (record.telemetryFailure !== null) return `telemetry failure: ${record.telemetryFailure}`;
  if (record.ledgerFailure !== null) return `ledger failure: ${record.ledgerFailure}`;
  if (record.attributionIncomplete) return 'container attribution incomplete';
  if (!record.samples.some((sample) => sample.kind === 'exit' && sample.counters !== null))
    return 'no exit sample';
  return null;
}

/** The samples of a run whose tmp walk could not read some subtree (task 6.23). */
export interface TmpLowerBound {
  /** How many samples saw an unreadable subtree. */
  samples: number;
  /** Every unreadable path the samples listed, deduplicated, in first-seen order. */
  paths: string[];
  /** Unreadable paths the samples counted beyond those they listed (the largest such count). */
  omitted: number;
}

/**
 * Where `record`'s tmp samples saw unreadable subtrees, or null when none did: its tmp peak
 * is then a lower bound only (task 6.23).
 */
export function tmpLowerBoundOf(record: RunRecord): TmpLowerBound | null {
  const partial = record.samples.filter(
    (sample) => sample.tmpUnreadable.length > 0 || sample.tmpUnreadableOmitted > 0,
  );
  if (partial.length === 0) return null;
  return {
    samples: partial.length,
    paths: [...new Set(partial.flatMap((sample) => sample.tmpUnreadable))],
    omitted: Math.max(...partial.map((sample) => sample.tmpUnreadableOmitted)),
  };
}

/** How one record stands for one {@link Dimension}. */
export type DimensionStanding =
  | { kind: 'complete' }
  /** Measured, but the figure is only a lower bound: not a peak a proposal may take. */
  | { kind: 'lower-bound'; reason: string }
  | { kind: 'incomplete'; reason: string };

/**
 * Whether `record` is a complete measurement per dimension (task 6.23): every dimension is
 * {@link incompleteness}'s whole-record answer, except that a record whose tmp samples saw an
 * unreadable subtree is `lower-bound` for `tmpDiskGib` and stays complete for the rest. A
 * dimension's own `null` measure is the caller's to judge, as before.
 */
export function dimensionStandings(record: RunRecord): Record<Dimension, DimensionStanding> {
  const incomplete = incompleteness(record);
  const whole: DimensionStanding =
    incomplete === null ? { kind: 'complete' } : { kind: 'incomplete', reason: incomplete };
  const lower = tmpLowerBoundOf(record);
  // Proof: answering `whole` for tmp made `a record whose only defect is unreadable tmp
  // subtrees is a lower bound for tmp alone` (measures.test.ts) find tmp complete (2026-11-19).
  const tmp: DimensionStanding =
    whole.kind === 'complete' && lower !== null
      ? {
          kind: 'lower-bound',
          reason: `tmp lower bound only: ${String(lower.samples)} samples saw unreadable subtrees (${lower.paths.at(0) ?? `${String(lower.omitted)} unlisted`})`,
        }
      : whole;
  return { memoryGib: whole, cpuCores: whole, tmpDiskGib: tmp, durationSeconds: whole };
}

/**
 * The descriptor `record` was admitted with. Only Dash writes run records, so a malformed one
 * throws rather than defaulting.
 */
export function descriptorOf(record: RunRecord): JobTypeDescriptor {
  return jobTypeDescriptor.assert(record.descriptor);
}

/** The nearest-rank p95 of `values`: the value at rank ⌈0.95·n⌉ of the sorted list. */
export function nearestRankP95(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const value = sorted.at(Math.ceil(0.95 * sorted.length) - 1);
  if (value === undefined) throw new Error('p95 of no values');
  return value;
}

/** `value` with at most two decimals, as a line prints it. */
export function figure(value: number): string {
  return String(Number(value.toFixed(2)));
}
