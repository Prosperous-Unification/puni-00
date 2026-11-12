import { type CommittedCatalogue, descriptorDigestOf, type JobType } from './catalogue';
import {
  descriptorOf,
  figure,
  HEURISTICS,
  incompleteness,
  measuresOf,
  nearestRankP95,
} from './measures';
import type { RunRecord } from './run-records';

/** The envelope drifts `ops job audit` names (J9, J16), most urgent first. */
export type DriftKind =
  'throttled' | 'overrun' | 'waste' | 'estimate_expired' | 'attribution_incomplete';

/** One drift: its kind, the job type and the line the audit prints. */
export interface Drift {
  kind: DriftKind;
  type: string;
  line: string;
}

const ENVELOPE_DIMENSIONS = ['memoryGib', 'cpuCores', 'tmpDiskGib'] as const;
const DAY_MS = 86_400_000;

/** The instant an `estimated` entry's `until` date ends: its last UTC millisecond (Burokrat's reading). */
function endOfDay(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`) + DAY_MS - 1;
}

/**
 * The `throttled` drift of `record` against its type's HEAD entry, or null: see {@link auditDrift}.
 * A calibration runs without `MemoryHigh`, so its high events never mean throttling.
 */
function throttleOf(record: RunRecord, head: JobType): Drift | null {
  // Proof: dropping this check made `a throttled run still running is drift; a calibration or a
  // raised envelope is not` (audit.test.ts) find a throttled calibration (2026-11-12).
  if (record.calibration === true) return null;
  const { memoryHighEvents, memoryGib } = measuresOf(record);
  // Proof: returning null for every count made `a throttled run is the first drift, naming its
  // envelope, peak and events` (audit.test.ts) find only the overrun, and the running-run test
  // find no drift (2026-11-12).
  if (memoryHighEvents === 0) return null;
  const envelope = descriptorOf(record).envelope.memoryGib;
  // Proof: dropping this check made the same running-run test keep the drift under a HEAD
  // envelope raised to 8 GiB (2026-11-12).
  if (head.envelope.memoryGib > envelope) return null;
  const running = record.endedAt === null ? ', still running' : '';
  return {
    kind: 'throttled',
    type: record.type,
    line: `${record.type} throttled in run ${record.jobId}${running}: memory.events high ${String(memoryHighEvents)} under envelope memoryGib ${String(envelope)}, peak memoryGib ${memoryGib === null ? 'unmeasured' : figure(memoryGib)} (${record.cataloguePath}); calibrate the type (\`ops job calibrate --type ${record.type}\`) and \`ops job propose --type ${record.type}\`; the estimated envelope is below the job's real memory`,
  };
}

/**
 * The envelope drift of the run records against the audit's own catalogue at its HEAD
 * (`dash-host-jobs` J9, J16), each record judged by its job id whatever checkout it ran from
 * (a scratch worktree may be gone; the record pins the envelope it was admitted under), and
 * the notes on what was not judged:
 * - `throttled`: an ordinary run (not a calibration) whose scope sampled `memory.events high`
 *   above zero, its outcome recorded or not: the kernel held it at `MemoryHigh`, so the envelope
 *   is below the job's real memory. Kept until the HEAD entry's `memoryGib` exceeds the envelope
 *   the run was throttled under.
 * - `overrun`: a run's peak above the envelope it ran under, in any dimension, kept however many
 *   runs follow until the HEAD entry's envelope covers the peak; overruns never age out, and a
 *   new provenance alone does not clear one.
 * - `waste`: a dimension's nearest-rank p95 below half the HEAD envelope over at least ten
 *   complete runs of the HEAD entry (memory from unthrottled, uncapped runs).
 * - `estimate_expired`: an `estimated` entry whose `until` ended before `now`.
 * - `attribution_incomplete`: a run during which a container ran unlabelled, unbounded or
 *   unverified, kept until a later run of the type saw containers and every one bounded
 *   (slice 4 assumption S4-A8).
 */
export function auditDrift(
  records: readonly RunRecord[],
  catalogue: CommittedCatalogue,
  now: number,
): { drifts: Drift[]; notes: string[] } {
  const drifts: Drift[] = [];
  const notes: string[] = [];
  const headOf = (record: RunRecord): JobType | undefined =>
    catalogue.jobs.find((job) => job.id === record.type);
  const retired = new Set<string>();
  const unended: string[] = [];
  for (const [position, record] of records.entries()) {
    const head = headOf(record);
    if (head === undefined) {
      retired.add(record.type);
      continue;
    }
    const throttle = throttleOf(record, head);
    if (throttle !== null) drifts.push(throttle);
    if (record.endedAt === null) {
      unended.push(record.jobId);
      continue;
    }
    const measures = measuresOf(record);
    const envelope = descriptorOf(record).envelope;
    const at = new Date(record.startedAt).toISOString();
    for (const dimension of ENVELOPE_DIMENSIONS) {
      const peak = measures[dimension];
      if (peak === null || peak <= envelope[dimension]) continue;
      // Proof: also treating a run as superseded once five later runs of its type followed made
      // `an overrun is drift eight runs later` (audit.test.ts) find no drift (2026-11-02, Slice 4);
      // also clearing it on a changed `calibrated` entry made `a calibrated entry that does not
      // cover the peak keeps the overrun` find no drift (2026-11-02, review A1).
      if (head.envelope[dimension] >= peak) continue;
      drifts.push({
        kind: 'overrun',
        type: record.type,
        line: `${record.type} overrun ${dimension} ${figure(peak)} above envelope ${String(envelope[dimension])} in run ${record.jobId} at ${at} (${record.cataloguePath}); kept until an accepted envelope covers it`,
      });
    }
    if (record.attributionIncomplete) {
      const covered = records.slice(position + 1).some(
        (later) =>
          later.type === record.type &&
          later.endedAt !== null &&
          !later.attributionIncomplete &&
          // Proof: without it `a later run that started no container does not clear
          // attribution_incomplete` (audit.test.ts) found no drift (2026-11-02, review A13).
          later.containers.length > 0 &&
          later.containers.every((container) => container.verdict === 'bounded'),
      );
      // Proof: dropping this kind made `a run with an unbounded container is
      // attribution_incomplete …` (audit.test.ts) find no drift (2026-11-02, Slice 4).
      if (!covered)
        drifts.push({
          kind: 'attribution_incomplete',
          type: record.type,
          line: `${record.type} attribution_incomplete in run ${record.jobId} at ${at}: ${record.guardLost === undefined ? '' : `${record.guardLost}; `}${record.containers
            .filter((container) => container.verdict !== 'bounded')
            .map((container) => `${container.id.slice(0, 12)} ${container.verdict}`)
            .join(
              ', ',
            )}; the type is not eligible for concurrency until a run sees every container bounded`,
        });
    }
  }
  for (const head of catalogue.jobs) {
    const location = `${catalogue.cataloguePath} at ${catalogue.revision}`;
    // Proof: comparing against the start of the `until` day made `an expired estimate is
    // drift, valid through its until day` (audit.test.ts) name estimate_expired at
    // 23:59:59.999 on that day (2026-11-02, Slice 4).
    if (head.provenance.kind === 'estimated' && now > endOfDay(head.provenance.until))
      drifts.push({
        kind: 'estimate_expired',
        type: head.id,
        line: `${head.id} estimate_expired: provenance estimated until ${head.provenance.until}, now ${new Date(now).toISOString()} (${location})`,
      });
    const digest = descriptorDigestOf(head);
    const runs = records.filter(
      (record) =>
        record.type === head.id &&
        record.descriptorDigest === digest &&
        incompleteness(record) === null,
    );
    if (runs.length < HEURISTICS.wasteRuns) continue;
    for (const dimension of ENVELOPE_DIMENSIONS) {
      // A zero tmp envelope needs no skip: no p95 is below half of zero.
      const declared = head.envelope[dimension];
      const values = runs.flatMap((record) => {
        const measures = measuresOf(record);
        const unthrottled =
          measures.memoryHighEvents === 0 &&
          (record.calibration === true || descriptorOf(record).enforcement !== 'cap');
        if (dimension === 'memoryGib' && !unthrottled) return [];
        const value = measures[dimension];
        return value === null ? [] : [value];
      });
      if (values.length < HEURISTICS.wasteRuns) continue;
      const p95 = nearestRankP95(values);
      // Proof: dropping this kind made `a p95 below half the envelope over ten runs is waste`
      // (audit.test.ts) find no drift (2026-11-02, Slice 4).
      if (p95 < declared / 2)
        drifts.push({
          kind: 'waste',
          type: head.id,
          line: `${head.id} waste ${dimension}: p95 ${figure(p95)} below half the envelope ${String(declared)} over ${String(values.length)} complete runs (${location})`,
        });
    }
  }
  for (const type of retired)
    notes.push(
      `not judged: runs of ${type}, which ${catalogue.cataloguePath} at HEAD does not name`,
    );
  if (unended.length > 0)
    notes.push(
      `not judged beyond throttling: ${String(unended.length)} runs without an outcome: ${unended.join(', ')}`,
    );
  const order: DriftKind[] = [
    'throttled',
    'overrun',
    'waste',
    'estimate_expired',
    'attribution_incomplete',
  ];
  drifts.sort((left, right) => order.indexOf(left.kind) - order.indexOf(right.kind));
  return { drifts, notes };
}
