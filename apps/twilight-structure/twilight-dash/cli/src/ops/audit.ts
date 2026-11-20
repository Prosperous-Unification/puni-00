import { type CommittedCatalogue, descriptorDigestOf, type JobType } from './catalogue';
import {
  descriptorOf,
  figure,
  HEURISTICS,
  incompleteness,
  measuresOf,
  nearestRankP95,
  tmpLowerBoundOf,
} from './measures';
import { type HostServiceBound, isAttributed, leftoverNote, type RunRecord } from './run-records';

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
type EnvelopeDimension = (typeof ENVELOPE_DIMENSIONS)[number];
const UNIT: Readonly<Record<EnvelopeDimension, string>> = {
  memoryGib: 'GiB',
  cpuCores: 'cores',
  tmpDiskGib: 'GiB',
};

/** The dimensions `head`'s provenance clamped to the pool's allocatable (task 6.25). */
function clampedOf(head: JobType): readonly EnvelopeDimension[] {
  return head.provenance.kind === 'calibrated' ? (head.provenance.clampedToAllocatable ?? []) : [];
}
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
  // Proof: dropping this check made `a throttled run stays drift while it runs; …`
  // (audit.test.ts) find a throttled calibration (2026-11-12).
  if (record.calibration === true) return null;
  const { memoryHighEvents, memoryGib } = measuresOf(record);
  // Proof: returning null for every count made `a throttled run is the first drift, naming its
  // envelope, peak and events` (audit.test.ts) find only the overrun, and the running-run test
  // find no drift (2026-11-12).
  if (memoryHighEvents === 0) return null;
  const envelope = descriptorOf(record).envelope.memoryGib;
  // A run still in progress keeps its throttle whatever HEAD says: it still holds the pool.
  // Proof: dropping this check made the same running-run test keep the drift under a HEAD
  // envelope raised to 8 GiB; dropping the `endedAt` term made it lose the drift of the run
  // still running under that envelope (2026-11-12).
  if (record.endedAt !== null && head.envelope.memoryGib > envelope) return null;
  const running = record.endedAt === null ? ', still running' : '';
  return {
    kind: 'throttled',
    type: record.type,
    line: `${record.type} throttled in run ${record.jobId}${running}: memory.events high ${String(memoryHighEvents)} under envelope memoryGib ${String(envelope)}, peak memoryGib ${memoryGib === null ? 'unmeasured' : figure(memoryGib)} (${record.cataloguePath}); calibrate the type (\`ops job calibrate --type ${record.type}\`) and \`ops job propose --type ${record.type}\`; the estimated envelope is below the job's real memory`,
  };
}

const MIB = 1024 ** 2;

/**
 * The host services that ran containers beside `record` (task 6.22), each with its declared
 * bounds and how many containers it started, or null when none did: background load the
 * operator declared, listed so it is seen, never added to the job's envelope (S22-A3).
 */
function hostServicesOf(record: RunRecord): string | null {
  const counted = new Map<string, { service: HostServiceBound; count: number }>();
  for (const container of record.containers) {
    if (container.verdict !== 'host-service') continue;
    const { name, memoryBytes, cpuCores } = container.hostService;
    const key = `${name}\0${String(memoryBytes)}\0${String(cpuCores)}`;
    const seen = counted.get(key);
    if (seen === undefined) counted.set(key, { service: container.hostService, count: 1 });
    else seen.count += 1;
  }
  if (counted.size === 0) return null;
  const listed = [...counted.values()].map(
    ({ service, count }) =>
      `${service.name} (${figure(service.memoryBytes / MIB)} MiB, ${figure(service.cpuCores)} ${service.cpuCores > 1 ? 'cpus' : 'cpu'}) ×${String(count)}`,
  );
  return `host services beside run ${record.jobId}: ${listed.join(', ')}`;
}

/**
 * The envelope drift of the run records against the audit's own catalogue at its HEAD
 * (`dash-host-jobs` J9, J16), each record judged by its job id whatever checkout it ran from
 * (a scratch worktree may be gone; the record pins the envelope it was admitted under), and
 * the notes on what was not judged:
 * - `throttled`: an ordinary run (not a calibration) whose scope sampled `memory.events high`
 *   above zero, its outcome recorded or not: the kernel held it at `MemoryHigh`, so the envelope
 *   is below the job's real memory. Kept while the run is in progress, and after it ends until
 *   the HEAD entry's `memoryGib` exceeds the envelope the run was throttled under.
 * - `overrun`: a run's peak above the envelope it ran under, in any dimension, kept however many
 *   runs follow until the HEAD entry's envelope covers the peak; overruns never age out, and a
 *   new provenance alone does not clear one.
 * - `waste`: a dimension's nearest-rank p95 below half the HEAD envelope over at least ten
 *   complete runs of the HEAD entry (memory from unthrottled, uncapped runs).
 * - `estimate_expired`: an `estimated` entry whose `until` ended before `now`.
 * - `attribution_incomplete`: a run during which a container ran unlabelled, unbounded or
 *   unverified, kept until a later run of the type saw a bounded job container and every
 *   other one a bounded host service (slice 4 assumption S4-A8, task 6.22).
 *
 * A run beside which declared host services started containers gets a note listing them with
 * their declared bounds (task 6.22); they are attributed, not drift. A run whose tmp samples saw
 * unreadable subtrees gets one note listing those paths (task 6.23): its tmp peak is a lower
 * bound, which still proves an overrun but never waste. An entry whose calibrated provenance
 * marks `tmpDiskGibLowerBound` is never judged for tmp waste, and a note says so. A run whose
 * scope still held processes after its session ended gets a note saying what ended them (task 6.24).
 * A dimension the HEAD entry's provenance clamped to the pool (task 6.25) gets a note: an
 * overrun there is expected, since the job measured more than the pool holds, and stays drift
 * so it remains visible; that dimension is never judged for waste.
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
    const services = hostServicesOf(record);
    if (services !== null) notes.push(services);
    const leftovers = leftoverNote(record);
    // Proof: dropping this note made `a run whose leftovers were ended gets one note naming them`
    // (audit.test.ts) find no note (2026-11-19, task 6.24).
    if (leftovers !== null) notes.push(leftovers);
    const lowerBound = tmpLowerBoundOf(record);
    // Proof: dropping this note made `a run with unreadable tmp subtrees gets one note listing
    // them` (audit.test.ts) find no note (2026-11-19, task 6.23).
    if (lowerBound !== null)
      notes.push(
        `tmp lower bound only in run ${record.jobId}: ${String(lowerBound.samples)} samples saw unreadable subtrees: ${lowerBound.paths.join(', ')}${lowerBound.omitted > 0 ? ` (and ${String(lowerBound.omitted)} more unlisted)` : ''}`,
      );
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
      // Proof: dropping the suffix made `an overrun of a clamped dimension stays drift, noted as
      // expected` (audit.test.ts) find the plain overrun line (2026-11-20, task 6.25).
      const expected = clampedOf(head).includes(dimension)
        ? '; expected: the HEAD entry is clamped to the pool'
        : '';
      drifts.push({
        kind: 'overrun',
        type: record.type,
        line: `${record.type} overrun ${dimension} ${figure(peak)} above envelope ${String(envelope[dimension])} in run ${record.jobId} at ${at} (${record.cataloguePath}); kept until an accepted envelope covers it${expected}`,
      });
    }
    if (record.attributionIncomplete) {
      const covered = records.slice(position + 1).some(
        (later) =>
          later.type === record.type &&
          later.endedAt !== null &&
          !later.attributionIncomplete &&
          // Proof: without it `a later run that started no container does not clear
          // attribution_incomplete` (audit.test.ts) found no drift (2026-11-02, review A13);
          // `.length > 0` in its place made `a later run that saw only host-service containers
          // does not clear attribution_incomplete` find no drift (2026-11-19, task 6.22).
          later.containers.some((container) => container.verdict === 'bounded') &&
          // Proof: requiring every container `bounded` made the same test find the drift after
          // a run with a bounded job container and a host service (2026-11-19, task 6.22).
          later.containers.every(isAttributed),
      );
      // Proof: dropping this kind made `a run with an unbounded container is
      // attribution_incomplete …` (audit.test.ts) find no drift (2026-11-02, Slice 4).
      if (!covered)
        drifts.push({
          kind: 'attribution_incomplete',
          type: record.type,
          line: `${record.type} attribution_incomplete in run ${record.jobId} at ${at}: ${record.guardLost === undefined ? '' : `${record.guardLost}; `}${record.containers
            // Proof: listing every non-bounded verdict made `are not named as unattributed in
            // an attribution_incomplete line` (audit.test.ts) name the host service (2026-11-19).
            .filter((container) => !isAttributed(container))
            .map((container) => `${container.id.slice(0, 12)} ${container.verdict}`)
            .join(
              ', ',
            )}; the type is not eligible for concurrency until a run sees a bounded job container and every other container attributed`,
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
    // A lower-bound tmp entry may be above the job's real need with nothing to show it.
    // Proof: dropping the skip below made `a lower-bound tmp entry is not waste-checkable`
    // (audit.test.ts) name a tmpDiskGib waste; dropping the note made it find no note
    // (2026-11-19, review S2-1).
    const tmpUnjudged =
      head.provenance.kind === 'calibrated' && head.provenance.tmpDiskGibLowerBound === true;
    if (tmpUnjudged)
      notes.push(
        `${head.id} tmp entry is a lower bound; waste cannot fire for tmpDiskGib (${location})`,
      );
    const clamped = clampedOf(head);
    // Proof: dropping these notes made `an overrun of a clamped dimension stays drift, noted as
    // expected` and `a clamped dimension the p95 fits is noted, never judged for waste`
    // (audit.test.ts) find no note (2026-11-20, task 6.25).
    if (head.provenance.kind === 'calibrated')
      for (const dimension of clamped) {
        const p95 = head.provenance.p95[dimension];
        const declared = head.envelope[dimension];
        notes.push(
          p95 > declared
            ? `${head.id} ${dimension} overruns a clamped envelope: p95 ${figure(p95)} ${UNIT[dimension]} measured, entry ${String(declared)} clamped to the pool; an overrun is expected and stays drift, waste is not judged (${location})`
            : `${head.id} ${dimension} is clamped to the pool: entry ${String(declared)} holds its p95 ${figure(p95)} ${UNIT[dimension]} without the heuristic's headroom; waste is not judged (${location})`,
        );
      }
    const digest = descriptorDigestOf(head);
    const runs = records.filter(
      (record) =>
        record.type === head.id &&
        record.descriptorDigest === digest &&
        incompleteness(record) === null,
    );
    if (runs.length < HEURISTICS.wasteRuns) continue;
    for (const dimension of ENVELOPE_DIMENSIONS) {
      if (dimension === 'tmpDiskGib' && tmpUnjudged) continue;
      // Proof: dropping this skip made `a clamped dimension the p95 fits is noted, never judged
      // for waste` (audit.test.ts) name a memoryGib waste (2026-11-20, task 6.25).
      if (clamped.includes(dimension)) continue;
      // A zero tmp envelope needs no skip: no p95 is below half of zero.
      const declared = head.envelope[dimension];
      const values = runs.flatMap((record) => {
        const measures = measuresOf(record);
        const unthrottled =
          measures.memoryHighEvents === 0 &&
          (record.calibration === true || descriptorOf(record).enforcement !== 'cap');
        if (dimension === 'memoryGib' && !unthrottled) return [];
        // A lower bound below half the envelope does not show the envelope too large.
        // Proof: counting it made `tmp lower bounds are not waste` (audit.test.ts) name a
        // tmpDiskGib waste (2026-11-19, task 6.23).
        if (dimension === 'tmpDiskGib' && tmpLowerBoundOf(record) !== null) return [];
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
