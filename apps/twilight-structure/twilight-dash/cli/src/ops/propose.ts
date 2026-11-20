import type { PoolEnvelope } from '../resources/runtime';
import { type CommittedCatalogue, type JobType, parseCatalogueJobs } from './catalogue';
import {
  descriptorOf,
  type Dimension,
  dimensionStandings,
  figure,
  HEURISTICS,
  measuresOf,
  nearestRankP95,
} from './measures';
import type { RunRecord } from './run-records';

/** The records a proposal compares: one argument profile, host class and toolchain (J9). */
export interface Partition {
  readonly argumentProfile: string;
  readonly hostClass: string;
  readonly toolchain: string;
}

/** `ops job propose`'s answer: the lines it prints, and the replacement entry or the refusal. */
export type Proposal =
  | { kind: 'proposed'; lines: string[]; entry: JobType }
  | { kind: 'refused'; lines: string[]; reason: string };

/** Which records each dimension's p95 is taken from (J9). */
const SOURCE: Readonly<Record<Dimension, string>> = {
  memoryGib: 'uncapped, unthrottled records',
  cpuCores: 'calibration records',
  tmpDiskGib: 'records',
  durationSeconds: 'calibration records',
};
const UNIT: Readonly<Record<Dimension, string>> = {
  memoryGib: 'GiB',
  cpuCores: 'cores',
  tmpDiskGib: 'GiB',
  durationSeconds: 's',
};
const DIMENSIONS = ['memoryGib', 'cpuCores', 'tmpDiskGib', 'durationSeconds'] as const;
/** The envelope dimensions a pool bounds, in the order a clamp names them (task 6.25). */
const CLAMPED = ['cpuCores', 'memoryGib', 'tmpDiskGib'] as const;

/** `p95 × headroom`, rounded up to a whole unit, at least `floor`. */
function withHeadroom(p95: number, floor: number): number {
  // Twelve significant digits first, so 4.4 × 1.25 is 5.5 and 4 × 1.25 is 5, not 5.000…1.
  return Math.max(floor, Math.ceil(Number((p95 * HEURISTICS.headroom).toPrecision(12))));
}

/**
 * The catalogue patch for `typeId` from the run records (`dash-host-jobs` J9), printed as the
 * replacement entry for that job in `catalogue`; nothing is written. Comparable records are the
 * type's records from this catalogue on `partition`; complete ones feed each dimension's
 * nearest-rank p95: memory from every uncapped, unthrottled record (`memory.events high` 0),
 * CPU (the peak ten-second interval) and duration from calibration records alone, tmp disk from
 * every record (slice 4 assumption S4-A5). Each p95 is multiplied by 1.25 and rounded up. Every
 * record left out is named with why. A record whose tmp samples saw an unreadable subtree is a
 * tmp lower bound only (task 6.23): it feeds memory, CPU and duration, and is left out of tmp
 * disk, named `excluded`. When fewer than three records measured tmp disk but at least three
 * did with the lower bounds, tmp disk is proposed from the p95 of them all, those records named `used as a
 * lower bound`, never below the entry's current `tmpDiskGib`; the line says how many were
 * measured and the provenance carries `tmpDiskGibLowerBound: true` (S23-A4).
 * Refused, naming the count, when any dimension has fewer than three records; duration is
 * reported and counted but the catalogue has no field for it.
 * A figure above `allocatable`, the largest envelope this pool admits, is clamped to it, since
 * an envelope the pool cannot hold is refused 73 on every run (J5, task 6.25,
 * A-ENVELOPE-CLAMP-1): the line says `clamped to allocatable` with the heuristic figure, and the
 * provenance names the dimensions in `clampedToAllocatable` and their unclamped figures in
 * `heuristic`. The clamped figure may be below the p95: the job measured more than the pool.
 * @throws Error when the catalogue does not name `typeId` (the caller refuses first).
 */
export function proposeEnvelope(
  typeId: string,
  catalogue: CommittedCatalogue,
  records: readonly RunRecord[],
  partition: Partition,
  allocatable: PoolEnvelope,
  now: number,
): Proposal {
  const index = catalogue.jobs.findIndex((job) => job.id === typeId);
  const jobType = catalogue.jobs.at(index);
  if (jobType === undefined) throw new Error(`no job type ${typeId} in ${catalogue.cataloguePath}`);
  const lines = [
    `proposal for ${typeId} in ${catalogue.cataloguePath} at ${catalogue.revision}: argument profile ${JSON.stringify(partition.argumentProfile)}, host class ${partition.hostClass}, toolchain ${partition.toolchain}; provisional heuristics: nearest-rank p95 × ${String(HEURISTICS.headroom)} rounded up, at least ${String(HEURISTICS.minimumRecords)} records per dimension`,
  ];
  const sources: Record<Dimension, { id: string; value: number }[]> = {
    memoryGib: [],
    cpuCores: [],
    tmpDiskGib: [],
    durationSeconds: [],
  };
  /** Records left out of some dimension: not cited in the provenance (S4-A16). */
  const partial = new Set<string>();
  /** Complete records whose tmp figure is a lower bound only (task 6.23). */
  const tmpLowerBounds: { id: string; value: number; kind: string; reason: string }[] = [];
  for (const record of records) {
    if (record.type !== typeId) continue;
    const kind = record.calibration === true ? 'calibration' : 'run';
    const exclude = (reason: string): void => {
      lines.push(`excluded ${kind} ${record.jobId}: ${reason}`);
    };
    // Proof: skipping these silently made `a record from another catalogue is named and left
    // out` (propose.test.ts) find no `excluded` line (2026-11-02, Slice 4 review A8).
    if (record.cataloguePath !== catalogue.cataloguePath) {
      exclude(`another catalogue: ${record.cataloguePath}`);
      continue;
    }
    if (record.toolchain === undefined) {
      exclude('no toolchain identity (recorded before slice 4)');
      continue;
    }
    const other = [
      record.argumentProfile !== partition.argumentProfile &&
        `argument profile ${JSON.stringify(record.argumentProfile)}`,
      record.hostClass !== partition.hostClass && `host class ${record.hostClass}`,
      record.toolchain !== partition.toolchain && `toolchain ${record.toolchain}`,
    ].filter((difference) => difference !== false);
    if (other.length > 0) {
      exclude(`another partition: ${other.join(', ')}`);
      continue;
    }
    const standings = dimensionStandings(record);
    // Memory's standing is the whole record's: only tmp disk may be a lower bound.
    if (standings.memoryGib.kind === 'incomplete') {
      exclude(`incomplete: ${standings.memoryGib.reason}`);
      continue;
    }
    const measures = measuresOf(record);
    const take = (dimension: Dimension): void => {
      const value = measures[dimension];
      const standing = standings[dimension];
      // Proof: taking the figure regardless made `three records whose only defect is
      // unreadable tmp subtrees propose memory, cpu and duration; tmp is a lower bound only`
      // (propose.test.ts) print `tmpDiskGib: 4 (p95 3 GiB over 3 records` (2026-11-19, task 6.23).
      // Named once the fallback is decided below: excluded, or used as a lower bound.
      if (standing.kind === 'lower-bound' && value !== null) {
        tmpLowerBounds.push({ id: record.jobId, value, kind, reason: standing.reason });
        return;
      }
      if (value === null) {
        // A record missing from one dimension is not cited, as a throttled one is not (S4-A16).
        // Proof: without it `a record not measured in one dimension is not cited`
        // (propose.test.ts) found the record in recordIds (2026-11-02, Slice 6b, S3 follow-up a).
        partial.add(record.jobId);
        lines.push(`excluded ${kind} ${record.jobId} from ${dimension}: not measured`);
        return;
      }
      sources[dimension].push({ id: record.jobId, value });
    };
    const capped = record.calibration !== true && descriptorOf(record).enforcement === 'cap';
    // Proof: taking every complete record for memory made `a throttled run does not lower the
    // proposal` (propose.test.ts) propose memoryGib 5 and name nothing excluded (2026-11-02, Slice 4).
    if (measures.memoryHighEvents > 0) {
      partial.add(record.jobId);
      lines.push(
        `excluded ${kind} ${record.jobId} from memoryGib: throttled at MemoryHigh (memory.events high ${String(measures.memoryHighEvents)})`,
      );
    }
    // Proof: without the capped branch `a capped run is left out of memory, named`
    // (propose.test.ts) proposed memoryGib 3 from the capped run (2026-11-02, review A13).
    else if (capped) {
      partial.add(record.jobId);
      lines.push(`excluded ${kind} ${record.jobId} from memoryGib: capped (enforcement cap)`);
    } else take('memoryGib');
    take('tmpDiskGib');
    if (record.calibration === true) {
      take('cpuCores');
      take('durationSeconds');
    }
  }
  // Tmp disk falls back to its lower bounds only when the measured records are too few; the
  // three-record minimum still holds over the records it is then taken from.
  // Proof: never falling back made the lower-bound tests (propose.test.ts) refuse with `0
  // records for tmpDiskGib` (2026-11-19, task 6.23).
  const tmpLowerBoundOnly =
    sources.tmpDiskGib.length < HEURISTICS.minimumRecords &&
    sources.tmpDiskGib.length + tmpLowerBounds.length >= HEURISTICS.minimumRecords;
  const tmpMeasured = sources.tmpDiskGib.length;
  // Proof: printing `excluded` whatever the fallback made `three records whose only defect is
  // unreadable tmp subtrees …` (propose.test.ts) find `excluded calibration calibration-1 from
  // tmpDiskGib` for a record it used (2026-11-19, review S3-2).
  for (const lowerBound of tmpLowerBounds)
    lines.push(
      `${tmpLowerBoundOnly ? 'used as a lower bound' : 'excluded'} ${lowerBound.kind} ${lowerBound.id} ${tmpLowerBoundOnly ? 'in' : 'from'} tmpDiskGib: ${lowerBound.reason}`,
    );
  if (tmpLowerBoundOnly)
    sources.tmpDiskGib.push(...tmpLowerBounds.map(({ id, value }) => ({ id, value })));
  // Proof: never citing them made the same lower-bound test (propose.test.ts) refuse the patch
  // in validation, `provenance.recordCount must be at least 1 (was 0)`; citing them beside three
  // measured records made `a record with unreadable tmp subtrees beside three measured ones is
  // not cited` find it in recordIds (2026-11-19, task 6.23).
  else for (const lowerBound of tmpLowerBounds) partial.add(lowerBound.id);
  const short = DIMENSIONS.filter(
    (dimension) => sources[dimension].length < HEURISTICS.minimumRecords,
  );
  // Proof: lowering the minimum to one made `too few records` (propose.test.ts) print a patch
  // from two calibration records (2026-11-02, Slice 4).
  if (short.length > 0) {
    const counts = new Map<string, Dimension[]>();
    for (const dimension of short) {
      const key = `${String(sources[dimension].length)} ${SOURCE[dimension]}`;
      counts.set(key, [...(counts.get(key) ?? []), dimension]);
    }
    const named = [...counts].map(
      ([count, dimensions]) => `${count} for ${dimensions.join(' and ')}`,
    );
    return {
      kind: 'refused',
      lines,
      reason: `ops job propose: ${typeId} has ${named.join('; ')}; at least ${String(HEURISTICS.minimumRecords)} complete records per dimension are needed (provisional); no patch printed`,
    };
  }
  const p95Of = (dimension: Dimension): number =>
    nearestRankP95(sources[dimension].map((source) => source.value));
  const p95: Record<Dimension, number> = {
    memoryGib: p95Of('memoryGib'),
    cpuCores: p95Of('cpuCores'),
    tmpDiskGib: p95Of('tmpDiskGib'),
    durationSeconds: p95Of('durationSeconds'),
  };
  const heuristic = {
    cpuCores: withHeadroom(p95.cpuCores, 1),
    memoryGib: withHeadroom(p95.memoryGib, 1),
    // A lower bound may raise the entry's tmp disk, never lower it (S23-A4).
    // Proof: without the entry term the lower-bound test (propose.test.ts) proposed
    // tmpDiskGib 4 under the entry's 8 (2026-11-19, task 6.23).
    tmpDiskGib: tmpLowerBoundOnly
      ? Math.max(jobType.envelope.tmpDiskGib, withHeadroom(p95.tmpDiskGib, 0))
      : withHeadroom(p95.tmpDiskGib, 0),
  };
  // Proof: `fit` returning the heuristic made `a heuristic above the pool's allocatable is
  // clamped to it, and marked` (propose.test.ts) propose `memoryGib: 13` on a 10 GiB pool;
  // clamping at `>=` made `a heuristic equal to allocatable is not clamped` find
  // clampedToAllocatable `[cpuCores, memoryGib, tmpDiskGib]` (2026-11-20, task 6.25).
  const clamped = CLAMPED.filter((dimension) => heuristic[dimension] > allocatable[dimension]);
  const fit = (dimension: (typeof CLAMPED)[number]): number =>
    Math.min(heuristic[dimension], allocatable[dimension]);
  const envelope = {
    ...jobType.envelope,
    cpuCores: fit('cpuCores'),
    memoryGib: fit('memoryGib'),
    tmpDiskGib: fit('tmpDiskGib'),
  };
  for (const dimension of DIMENSIONS) {
    const used = sources[dimension];
    const proposed =
      dimension === 'durationSeconds'
        ? 'reported only, the catalogue has no duration field'
        : String(envelope[dimension]);
    const clamp =
      dimension !== 'durationSeconds' && clamped.includes(dimension)
        ? `clamped to allocatable ${String(allocatable[dimension])} ${UNIT[dimension]}; heuristic ${String(heuristic[dimension])} from `
        : '';
    // Proof: one wording for every fallback made `two measured records and one lower bound
    // make a mixed lower bound` (propose.test.ts) read `lower bound only` (2026-11-19, S3-3).
    const pool =
      tmpMeasured === 0
        ? 'lower bound only'
        : `lower bound from ${String(tmpMeasured)} measured + ${String(tmpLowerBounds.length)} lower bounds`;
    const bound =
      dimension === 'tmpDiskGib' && tmpLowerBoundOnly
        ? `${pool}, at least the entry's ${String(jobType.envelope.tmpDiskGib)}, provenance tmpDiskGibLowerBound: `
        : '';
    lines.push(
      `${dimension}: ${proposed} (${clamp}${bound}p95 ${figure(p95[dimension])} ${UNIT[dimension]} over ${String(used.length)} ${SOURCE[dimension]}: ${used.map((source) => source.id).join(', ')})`,
    );
  }
  // The provenance cites only records that fed every dimension they could: a throttled or
  // capped run fed tmp disk but is named on the memory line as excluded, so it is not cited.
  // Proof: citing every source made `a throttled run does not lower the proposal`
  // (propose.test.ts) find `throttled` in recordIds (2026-11-02, Slice 4 review A9).
  const recordIds = [
    ...new Set(DIMENSIONS.flatMap((dimension) => sources[dimension].map((source) => source.id))),
  ].filter((id) => !partial.has(id));
  // The stated p95 is rounded to hundredths. The heuristic stays above it, as JOB-CATALOGUE
  // requires: ⌈1.25·p⌉ ≥ p + 0.005 for every p ≥ 0.02, and below that the figure is 1 or p is 0.
  // An unclamped envelope is its heuristic; a clamped one is judged by its `heuristic`.
  const stated = (value: number): number => Math.round(value * 100) / 100;
  const entry: JobType = {
    ...jobType,
    envelope,
    provenance: {
      kind: 'calibrated',
      hostClass: partition.hostClass,
      calibratedAt: new Date(now).toISOString(),
      recordCount: recordIds.length,
      p95: {
        cpuCores: stated(p95.cpuCores),
        memoryGib: stated(p95.memoryGib),
        tmpDiskGib: stated(p95.tmpDiskGib),
      },
      recordIds,
      // Any lower bound in the pool makes the tmp p95 one; the durable entry says so (S23-A4).
      // Proof: omitting it made the lower-bound and mixed tests (propose.test.ts) find no marker,
      // and `a lower-bound tmp entry is not waste-checkable` (audit.test.ts) name a tmpDiskGib
      // waste for the entry it proposes (2026-11-19, review S2-1).
      ...(tmpLowerBoundOnly ? { tmpDiskGibLowerBound: true as const } : {}),
      // Proof: omitting these made the four clamping tests of propose.test.ts find no
      // clampedToAllocatable or heuristic (2026-11-20, task 6.25).
      ...(clamped.length > 0
        ? {
            clampedToAllocatable: clamped,
            heuristic: Object.fromEntries(
              clamped.map((dimension) => [dimension, heuristic[dimension]]),
            ),
          }
        : {}),
    },
  };
  // The patch must be one the catalogue's own contract accepts.
  const checked = parseCatalogueJobs({ schemaVersion: 1, jobs: [entry] }).at(0);
  if (checked === undefined) throw new Error('proposed entry vanished in validation');
  lines.push(
    `replacement for jobs[${String(index)}] (id ${typeId}) in ${catalogue.cataloguePath}; nothing was written:`,
  );
  return { kind: 'proposed', lines, entry: checked };
}
