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

/** The envelope drifts `ops job audit` names (J9, J16). */
export type DriftKind = 'overrun' | 'waste' | 'estimate_expired' | 'attribution_incomplete';

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
 * Whether `head`, the entry at the catalogue's HEAD, supersedes a drift seen under the entry
 * `record` ran with: its envelope now covers `peak`, or the entry changed since the run and its
 * provenance is `calibrated`, an accepted envelope from measured runs (J9).
 */
function supersedes(
  head: JobType,
  record: RunRecord,
  dimension: (typeof ENVELOPE_DIMENSIONS)[number],
  peak: number,
): boolean {
  return (
    head.envelope[dimension] >= peak ||
    (head.provenance.kind === 'calibrated' && descriptorDigestOf(head) !== record.descriptorDigest)
  );
}

/**
 * The envelope drift of the run records against each catalogue at its HEAD (`dash-host-jobs`
 * J9, J16), and the notes on what was not judged:
 * - `overrun`: a run's peak above the envelope it ran under, in any dimension, kept however many
 *   runs follow until {@link supersedes} holds; overruns never age out.
 * - `waste`: a dimension's nearest-rank p95 below half the HEAD envelope over at least ten
 *   complete runs of the HEAD entry (memory from unthrottled, uncapped runs).
 * - `estimate_expired`: an `estimated` entry whose `until` ended before `now`.
 * - `attribution_incomplete`: a run during which a container ran unlabelled, unbounded or
 *   unverified, kept until a later run of the type saw containers and every one bounded
 *   (slice 4 assumption S4-A8).
 * `catalogues` maps each catalogue path to its HEAD reading; every record's must be present.
 * @throws Error when a record names a catalogue missing from `catalogues`.
 */
export function auditDrift(
  records: readonly RunRecord[],
  catalogues: ReadonlyMap<string, CommittedCatalogue>,
  now: number,
): { drifts: Drift[]; notes: string[] } {
  const drifts: Drift[] = [];
  const notes: string[] = [];
  const headOf = (record: RunRecord): JobType | undefined => {
    const catalogue = catalogues.get(record.cataloguePath);
    if (catalogue === undefined)
      throw new Error(
        `run ${record.jobId} names catalogue ${record.cataloguePath}, which was not read`,
      );
    return catalogue.jobs.find((job) => job.id === record.type);
  };
  const retired = new Set<string>();
  const unended: string[] = [];
  for (const [position, record] of records.entries()) {
    const head = headOf(record);
    if (head === undefined) {
      retired.add(`${record.type} (${record.cataloguePath})`);
      continue;
    }
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
      // `an overrun is drift eight runs later` (audit.test.ts) find no drift (2026-11-02, Slice 4).
      if (supersedes(head, record, dimension, peak)) continue;
      drifts.push({
        kind: 'overrun',
        type: record.type,
        line: `${record.type} overrun ${dimension} ${figure(peak)} above envelope ${String(envelope[dimension])} in run ${record.jobId} at ${at} (${record.cataloguePath}); kept until an accepted envelope covers it`,
      });
    }
    if (record.attributionIncomplete) {
      const covered = records
        .slice(position + 1)
        .some(
          (later) =>
            later.type === record.type &&
            later.cataloguePath === record.cataloguePath &&
            later.endedAt !== null &&
            !later.attributionIncomplete &&
            later.containers.length > 0 &&
            later.containers.every((container) => container.verdict === 'bounded'),
        );
      // Proof: dropping this kind made `a run with an unbounded container is
      // attribution_incomplete …` (audit.test.ts) find no drift (2026-11-02, Slice 4).
      if (!covered)
        drifts.push({
          kind: 'attribution_incomplete',
          type: record.type,
          line: `${record.type} attribution_incomplete in run ${record.jobId} at ${at}: ${record.containers
            .filter((container) => container.verdict !== 'bounded')
            .map((container) => `${container.id.slice(0, 12)} ${container.verdict}`)
            .join(
              ', ',
            )}; the type is not eligible for concurrency until a run sees every container bounded`,
        });
    }
  }
  for (const catalogue of catalogues.values()) {
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
          record.cataloguePath === catalogue.cataloguePath &&
          record.descriptorDigest === digest &&
          incompleteness(record) === null,
      );
      if (runs.length < HEURISTICS.wasteRuns) continue;
      for (const dimension of ENVELOPE_DIMENSIONS) {
        const declared = head.envelope[dimension];
        if (declared === 0) continue;
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
  }
  for (const type of retired)
    notes.push(`not judged: runs of ${type}, which the catalogue at HEAD no longer names`);
  if (unended.length > 0)
    notes.push(
      `not judged: ${String(unended.length)} runs without an outcome: ${unended.join(', ')}`,
    );
  const order: DriftKind[] = ['overrun', 'waste', 'estimate_expired', 'attribution_incomplete'];
  drifts.sort((left, right) => order.indexOf(left.kind) - order.indexOf(right.kind));
  return { drifts, notes };
}
