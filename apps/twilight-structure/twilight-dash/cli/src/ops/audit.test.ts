import { describe, expect, test } from 'bun:test';

import { auditDrift } from './audit';
import type { CommittedCatalogue } from './catalogue';
import {
  CATALOGUE_PATH,
  committedCatalogue,
  type FixtureRun,
  runRecord,
} from './run-record.test.fixture';
import type { RunRecord } from './run-records';

/**
 * `dash-host-jobs` task 4.2, `ops job audit` over synthetic run records: one fixture per drift
 * kind, overruns kept until superseded, and `no drift` on a clean ledger. The command, its exit
 * code and its weekly units are in calibrate.test.ts and audit-units.test.ts.
 */
const NOW = Date.parse('2026-11-02T12:00:00.000Z');
const types = [
  { id: 'gate', cpuCores: 4, memoryGib: 6, tmpDiskGib: 8, exclusive: ['gate_tree'] },
  { id: 'release-build', cpuCores: 1, memoryGib: 2, tmpDiskGib: 2 },
];
const atRun = committedCatalogue(types);

function audit(
  runs: readonly FixtureRun[],
  head: CommittedCatalogue = atRun,
  now = NOW,
): { drifts: string[]; notes: string[]; kinds: string[] } {
  const records: RunRecord[] = runs.map((run, index) =>
    runRecord(atRun, { startedAt: 1_800_000_000_000 + index * 3_600_000, ...run }),
  );
  const { drifts, notes } = auditDrift(records, new Map([[CATALOGUE_PATH, head]]), now);
  return {
    drifts: drifts.map((drift) => drift.line),
    notes,
    kinds: drifts.map((drift) => drift.kind),
  };
}

/** Ordinary runs inside the gate envelope, as many as `count`. */
function fitting(count: number, from = 1): FixtureRun[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `run-${String(from + index)}`,
    memoryGib: 5,
    cpuCores: 3,
    tmpGib: 5,
  }));
}

describe('ops job audit (task 4.2, J9, J16)', () => {
  test('a clean ledger has no drift', () => {
    expect(audit(fitting(3))).toEqual({ drifts: [], notes: [], kinds: [] });
  });

  test('an overrun is drift eight runs later', () => {
    const { drifts } = audit([
      { id: 'overran', memoryGib: 7, cpuCores: 3, tmpGib: 5 },
      ...fitting(8),
    ]);
    expect(drifts).toEqual([
      `gate overrun memoryGib 7 above envelope 6 in run overran at 2027-01-15T08:00:00.000Z (${CATALOGUE_PATH}); kept until an accepted envelope covers it`,
    ]);
  });

  test('an overrun is superseded by an accepted envelope of at least its peak', () => {
    const runs = [{ id: 'overran', memoryGib: 7, cpuCores: 3, tmpGib: 5 }, ...fitting(8)];
    const raised = committedCatalogue(types, (jobs) =>
      jobs.map((job) =>
        job.id === 'gate' ? { ...job, envelope: { ...job.envelope, memoryGib: 7 } } : job,
      ),
    );
    expect(audit(runs, raised).drifts).toEqual([]);
    const notEnough = committedCatalogue(types, (jobs) =>
      jobs.map((job) =>
        job.id === 'gate' ? { ...job, envelope: { ...job.envelope, cpuCores: 8 } } : job,
      ),
    );
    expect(audit(runs, notEnough).kinds).toEqual(['overrun']);
  });

  test('an overrun is superseded once the entry changes to calibrated provenance', () => {
    const calibrated = committedCatalogue(types, (jobs) =>
      jobs.map((job) =>
        job.id === 'gate'
          ? {
              ...job,
              provenance: {
                kind: 'calibrated',
                hostClass: 'linux-x64-8c-15g',
                calibratedAt: '2026-11-01T00:00:00.000Z',
                recordCount: 3,
                p95: { cpuCores: 3, memoryGib: 4.8, tmpDiskGib: 5 },
                recordIds: ['c1', 'c2', 'c3'],
              },
            }
          : job,
      ),
    );
    expect(
      audit([{ id: 'overran', memoryGib: 7, cpuCores: 3, tmpGib: 5 }], calibrated).drifts,
    ).toEqual([]);
  });

  test('a peak above the envelope in CPU or tmp disk is an overrun too', () => {
    expect(audit([{ id: 'busy', memoryGib: 5, cpuCores: 4.5, tmpGib: 9 }]).drifts).toEqual([
      `gate overrun cpuCores 4.5 above envelope 4 in run busy at 2027-01-15T08:00:00.000Z (${CATALOGUE_PATH}); kept until an accepted envelope covers it`,
      `gate overrun tmpDiskGib 9 above envelope 8 in run busy at 2027-01-15T08:00:00.000Z (${CATALOGUE_PATH}); kept until an accepted envelope covers it`,
    ]);
  });

  test('a p95 below half the envelope over ten runs is waste', () => {
    const small = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        id: `small-${String(index + 1)}`,
        type: 'release-build',
        memoryGib: 0.5,
        cpuCores: 0.75,
        tmpGib: 1.5,
      }));
    expect(audit(small(9)).drifts).toEqual([]);
    expect(audit(small(10)).drifts).toEqual([
      `release-build waste memoryGib: p95 0.5 below half the envelope 2 over 10 complete runs (${CATALOGUE_PATH} at ${'a'.repeat(40)})`,
    ]);
  });

  test('an expired estimate is drift, valid through its until day', () => {
    const until = committedCatalogue(types, (jobs) =>
      jobs.map((job) =>
        job.id === 'gate'
          ? {
              ...job,
              provenance: { kind: 'estimated', basis: 'test fixture', until: '2026-12-01' },
            }
          : job,
      ),
    );
    expect(audit([], until, Date.parse('2026-12-01T23:59:59.999Z')).drifts).toEqual([]);
    expect(audit([], until, Date.parse('2026-12-02T00:00:00.000Z')).drifts).toEqual([
      `gate estimate_expired: provenance estimated until 2026-12-01, now 2026-12-02T00:00:00.000Z (${CATALOGUE_PATH} at ${'a'.repeat(40)})`,
    ]);
  });

  test('a run with an unbounded container is attribution_incomplete until a run sees every container bounded', () => {
    const unbounded = {
      id: 'unbounded',
      memoryGib: 5,
      cpuCores: 3,
      tmpGib: 5,
      containers: [
        { id: 'c0ffee0123456789', verdict: 'unbounded' as const, reason: 'no --memory' },
      ],
    };
    expect(audit([unbounded, ...fitting(2)]).drifts).toEqual([
      'gate attribution_incomplete in run unbounded at 2027-01-15T08:00:00.000Z: c0ffee012345 unbounded; the type is not eligible for concurrency until a run sees every container bounded',
    ]);
    const bounded = {
      ...fitting(1, 9)[0],
      id: 'bounded',
      containers: [{ id: 'beef', verdict: 'bounded' as const, reason: 'labelled, bounded' }],
    };
    expect(audit([unbounded, bounded]).drifts).toEqual([]);
  });

  test('runs without an outcome and of retired types are noted, not judged', () => {
    const retired = committedCatalogue(types, (jobs) =>
      jobs.filter((job) => job.id !== 'release-build'),
    );
    const { drifts, notes } = audit(
      [
        { id: 'running', memoryGib: 9, ended: false },
        { id: 'old', type: 'release-build', memoryGib: 9 },
      ],
      retired,
    );
    expect(drifts).toEqual([]);
    expect(notes).toEqual([
      `not judged: runs of release-build (${CATALOGUE_PATH}), which the catalogue at HEAD no longer names`,
      'not judged: 1 runs without an outcome: running',
    ]);
  });
});
