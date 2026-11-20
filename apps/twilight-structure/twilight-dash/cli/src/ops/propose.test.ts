import { describe, expect, test } from 'bun:test';

import { peakCpuCores } from './measures';
import { type Partition, proposeEnvelope } from './propose';
import {
  CATALOGUE_PATH,
  committedCatalogue,
  type FixtureRun,
  HOST_CLASS,
  ROOMY_POOL,
  runRecord,
  TOOLCHAIN,
} from './run-record.test.fixture';
import type { RunSample } from './run-records';

/**
 * `dash-host-jobs` task 4.1, `ops job propose` over synthetic run records: the scenarios of the
 * requirement "Calibration proposes and the audit names drift; neither writes the catalogue".
 * The command itself, over a real ledger, is in calibrate.test.ts.
 */
const NOW = Date.parse('2026-11-02T12:00:00.000Z');
const catalogue = committedCatalogue([
  { id: 'gate', cpuCores: 4, memoryGib: 6, tmpDiskGib: 8, exclusive: ['gate_tree'] },
  { id: 'release-build', cpuCores: 1, memoryGib: 2, tmpDiskGib: 2 },
  { id: 'capped', cpuCores: 1, memoryGib: 2, enforcement: 'cap' },
]);
const partition: Partition = { argumentProfile: '', hostClass: HOST_CLASS, toolchain: TOOLCHAIN };

function propose(type: string, runs: readonly FixtureRun[], allocatable = ROOMY_POOL) {
  return proposeEnvelope(
    type,
    catalogue,
    runs.map((run) => runRecord(catalogue, { type, ...run })),
    partition,
    allocatable,
    NOW,
  );
}

function calibrations(...memoryGib: number[]): FixtureRun[] {
  return memoryGib.map((memory, index) => ({
    id: `calibration-${String(index + 1)}`,
    calibration: true,
    memoryGib: memory,
    cpuCores: 2 + index * 0.5,
    tmpGib: 1 + index,
    seconds: 600 + index * 60,
  }));
}

describe('ops job propose (task 4.1, J9)', () => {
  test('a calibration proposes', () => {
    const proposal = propose('gate', calibrations(4.1, 4.4, 4.3));
    if (proposal.kind !== 'proposed') throw new Error(proposal.reason);
    expect(proposal.lines).toContain(
      'memoryGib: 6 (p95 4.4 GiB over 3 uncapped, unthrottled records: calibration-1, calibration-2, calibration-3)',
    );
    expect(proposal.lines).toContain(
      'cpuCores: 4 (p95 3 cores over 3 calibration records: calibration-1, calibration-2, calibration-3)',
    );
    expect(proposal.lines).toContain(
      'tmpDiskGib: 4 (p95 3 GiB over 3 records: calibration-1, calibration-2, calibration-3)',
    );
    expect(proposal.lines).toContain(
      'durationSeconds: reported only, the catalogue has no duration field (p95 720 s over 3 calibration records: calibration-1, calibration-2, calibration-3)',
    );
    expect(proposal.entry.envelope).toEqual({
      cpuCores: 4,
      memoryGib: 6,
      tmpDiskGib: 4,
      exclusive: ['gate_tree'],
    });
    expect(proposal.entry.provenance).toEqual({
      kind: 'calibrated',
      hostClass: HOST_CLASS,
      calibratedAt: '2026-11-02T12:00:00.000Z',
      recordCount: 3,
      p95: { cpuCores: 3, memoryGib: 4.4, tmpDiskGib: 3 },
      recordIds: ['calibration-1', 'calibration-2', 'calibration-3'],
    });
    expect(proposal.lines.at(-1)).toBe(
      `replacement for jobs[0] (id gate) in ${CATALOGUE_PATH}; nothing was written:`,
    );
  });

  test('a throttled run does not lower the proposal', () => {
    // Nearest rank over 20 records is the 19th value: with the throttled 3 GiB run counted,
    // the p95 would fall from 4.4 to 4.0 GiB and the proposal from 6 to 5.
    const ordinary = Array.from({ length: 16 }, (_, index) => ({
      id: `run-${String(index + 1)}`,
      memoryGib: 4,
    }));
    const proposal = propose('gate', [
      ...calibrations(4.4, 4, 4),
      ...ordinary,
      { id: 'throttled', memoryGib: 3, memoryHighEvents: 12 },
    ]);
    if (proposal.kind !== 'proposed') throw new Error(proposal.reason);
    expect(proposal.entry.envelope.memoryGib).toBe(6);
    expect(proposal.lines).toContain(
      'excluded run throttled from memoryGib: throttled at MemoryHigh (memory.events high 12)',
    );
    expect(
      proposal.entry.provenance.kind === 'calibrated' && proposal.entry.provenance.recordIds,
    ).not.toContain('throttled');
  });

  test('a record not measured in one dimension is not cited', () => {
    // A complete calibration whose tmp directory was never sized: it feeds memory, CPU and
    // duration, is named on the tmp line, and the provenance cites only records that fed every
    // dimension they could (S4-A16).
    const runs = calibrations(4.4, 4, 4, 4);
    const records = runs.map((run) => runRecord(catalogue, { type: 'gate', ...run }));
    const unsized = records.at(3);
    if (unsized === undefined) throw new Error('fixture has four records');
    const proposal = proposeEnvelope(
      'gate',
      catalogue,
      [...records.slice(0, 3), { ...unsized, peakTmpBytes: null }],
      partition,
      ROOMY_POOL,
      NOW,
    );
    if (proposal.kind !== 'proposed') throw new Error(proposal.reason);
    expect(proposal.lines).toContain(
      'excluded calibration calibration-4 from tmpDiskGib: not measured',
    );
    expect(
      proposal.entry.provenance.kind === 'calibrated' && proposal.entry.provenance.recordIds,
    ).toEqual(['calibration-1', 'calibration-2', 'calibration-3']);
  });

  test('too few records', () => {
    const proposal = propose('release-build', [
      ...calibrations(1, 1.2),
      ...Array.from({ length: 5 }, (_, index) => ({ id: `run-${String(index + 1)}` })),
    ]);
    expect(proposal.kind).toBe('refused');
    if (proposal.kind !== 'refused') throw new Error('proposed');
    expect(proposal.reason).toBe(
      'ops job propose: release-build has 2 calibration records for cpuCores and durationSeconds; at least 3 complete records per dimension are needed (provisional); no patch printed',
    );
  });

  test('a capped run is left out of memory, named', () => {
    const proposal = propose('capped', [
      ...calibrations(1, 1, 1),
      { id: 'capped-run', memoryGib: 2 },
    ]);
    if (proposal.kind !== 'proposed') throw new Error(proposal.reason);
    expect(proposal.entry.envelope.memoryGib).toBe(2);
    expect(proposal.lines).toContain(
      'excluded run capped-run from memoryGib: capped (enforcement cap)',
    );
  });

  test('records of another partition, incomplete or without a toolchain are named and left out', () => {
    const proposal = propose('gate', [
      ...calibrations(4, 4, 4),
      { id: 'elsewhere', calibration: true, memoryGib: 9, hostClass: 'linux-x64-24c-30g' },
      { id: 'older-bun', calibration: true, memoryGib: 9, toolchain: 'bun 1.3.0+0' },
      { id: 'other-profile', calibration: true, memoryGib: 9, argumentProfile: '<sha>' },
      { id: 'failed', calibration: true, memoryGib: 9, exitCode: 1 },
      { id: 'running', calibration: true, memoryGib: 9, ended: false },
      { id: 'slice-3', calibration: true, memoryGib: 9, toolchain: null },
    ]);
    if (proposal.kind !== 'proposed') throw new Error(proposal.reason);
    expect(proposal.entry.envelope.memoryGib).toBe(5);
    expect(proposal.lines.filter((line) => line.startsWith('excluded'))).toEqual([
      'excluded calibration elsewhere: another partition: host class linux-x64-24c-30g',
      'excluded calibration older-bun: another partition: toolchain bun 1.3.0+0',
      'excluded calibration other-profile: another partition: argument profile "<sha>"',
      'excluded calibration failed: incomplete: payload exit 1',
      'excluded calibration running: incomplete: no outcome recorded (running, or its launcher died)',
      'excluded calibration slice-3: no toolchain identity (recorded before slice 4)',
    ]);
  });

  test('a record from another catalogue is named and left out', () => {
    const proposal = propose('gate', [
      ...calibrations(4, 4, 4),
      {
        id: 'scratch',
        calibration: true,
        memoryGib: 9,
        cataloguePath: '/scratch/infra/jobs/catalogue.json',
      },
    ]);
    if (proposal.kind !== 'proposed') throw new Error(proposal.reason);
    expect(proposal.entry.envelope.memoryGib).toBe(5);
    expect(proposal.lines).toContain(
      'excluded calibration scratch: another catalogue: /scratch/infra/jobs/catalogue.json',
    );
  });

  test('each kind of incomplete record is named and left out', () => {
    const proposal = propose('gate', [
      ...calibrations(4, 4, 4),
      { id: 'telemetry', calibration: true, memoryGib: 9, telemetryFailure: 'interval: gone' },
      { id: 'ledger', calibration: true, memoryGib: 9, ledgerFailure: 'exit unrecorded' },
      {
        id: 'unattributed',
        calibration: true,
        memoryGib: 9,
        containers: [{ id: 'abc', verdict: 'unlabelled', reason: 'no puni.job label' }],
      },
      { id: 'no-exit', calibration: true, memoryGib: 9, noExitSample: true },
    ]);
    if (proposal.kind !== 'proposed') throw new Error(proposal.reason);
    // Proof: dropping any one of these four branches of `incompleteness` (measures.ts) made
    // this test propose memoryGib 12 from that record's 9 GiB (2026-11-02, review A13).
    expect(proposal.entry.envelope.memoryGib).toBe(5);
    expect(proposal.lines.filter((line) => line.startsWith('excluded'))).toEqual([
      'excluded calibration telemetry: incomplete: telemetry failure: interval: gone',
      'excluded calibration ledger: incomplete: ledger failure: exit unrecorded',
      'excluded calibration unattributed: incomplete: container attribution incomplete',
      'excluded calibration no-exit: incomplete: no exit sample',
    ]);
  });

  test('a record whose only other container is a bounded host service is complete (task 6.22)', () => {
    const proposal = propose('gate', [
      ...calibrations(4, 4),
      {
        id: 'beside-goaccess',
        calibration: true,
        memoryGib: 4,
        containers: [
          { id: 'beef', verdict: 'bounded', reason: 'labelled, bounded' },
          {
            id: 'cafe',
            verdict: 'host-service',
            reason: 'host service goaccess-reports',
            hostService: { name: 'goaccess-reports', memoryBytes: 512 * 1024 ** 2, cpuCores: 1 },
          },
        ],
      },
    ]);
    if (proposal.kind !== 'proposed') throw new Error(proposal.reason);
    expect(proposal.lines.filter((line) => line.startsWith('excluded'))).toEqual([]);
    expect(proposal.entry.provenance).toMatchObject({
      recordIds: ['calibration-1', 'calibration-2', 'beside-goaccess'],
    });
  });

  test('CPU is the peak rate over a ten-second window, or the whole of a shorter run', () => {
    const sample = (second: number, usec: number): RunSample => ({
      kind: 'interval',
      observedAt: second * 1000,
      counters: {
        memoryPeak: 0,
        memoryCurrent: 0,
        cpuUsageUsec: usec,
        cpuUserUsec: 0,
        cpuSystemUsec: 0,
        pidsCurrent: 1,
        memoryHighEvents: 0,
      },
      tmpBytes: 0,
      tmpUnreadable: [],
      tmpUnreadableOmitted: 0,
      containers: null,
      failure: null,
    });
    // 1 core for 10 s, 3 cores for the next 10 s, then a 2 s burst at 8 cores.
    expect(peakCpuCores([sample(0, 0), sample(10, 10e6), sample(20, 40e6), sample(22, 56e6)])).toBe(
      3,
    );
    expect(peakCpuCores([sample(0, 0), sample(4, 6e6)])).toBe(1.5);
    expect(peakCpuCores([sample(0, 0)])).toBeNull();
  });
});

describe('ops job propose with tmp lower bounds (task 6.23, A-TMP-TELEMETRY-1)', () => {
  const PATH = 'wbs-shared-process-XYrBbJ/inaccessible';
  const lowerBounds = (runs: FixtureRun[]): FixtureRun[] =>
    runs.map((run) => ({ ...run, tmpUnreadable: [PATH] }));

  test('three records whose only defect is unreadable tmp subtrees propose memory, cpu and duration; tmp is a lower bound only', () => {
    const proposal = propose('gate', lowerBounds(calibrations(4.1, 4.4, 4.3)));
    if (proposal.kind !== 'proposed') throw new Error(proposal.reason);
    // 600, 660 and 720 s of ten-second samples, each after the gate sample.
    for (const [id, samples] of [
      ['calibration-1', 60],
      ['calibration-2', 66],
      ['calibration-3', 72],
    ] as const)
      expect(proposal.lines).toContain(
        `used as a lower bound calibration ${id} in tmpDiskGib: tmp lower bound only: ${String(samples)} samples saw unreadable subtrees (${PATH})`,
      );
    expect(proposal.lines).not.toContainEqual(expect.stringContaining('excluded'));
    expect(proposal.lines).toContain(
      'memoryGib: 6 (p95 4.4 GiB over 3 uncapped, unthrottled records: calibration-1, calibration-2, calibration-3)',
    );
    expect(proposal.lines).toContain(
      'cpuCores: 4 (p95 3 cores over 3 calibration records: calibration-1, calibration-2, calibration-3)',
    );
    expect(proposal.lines).toContain(
      'durationSeconds: reported only, the catalogue has no duration field (p95 720 s over 3 calibration records: calibration-1, calibration-2, calibration-3)',
    );
    // The lower bounds' 4 GiB would lower the entry's 8: it stays.
    expect(proposal.lines).toContain(
      "tmpDiskGib: 8 (lower bound only, at least the entry's 8, provenance tmpDiskGibLowerBound: p95 3 GiB over 3 records: calibration-1, calibration-2, calibration-3)",
    );
    expect(proposal.entry.envelope).toEqual({
      cpuCores: 4,
      memoryGib: 6,
      tmpDiskGib: 8,
      exclusive: ['gate_tree'],
    });
    expect(proposal.entry.provenance).toMatchObject({
      recordCount: 3,
      recordIds: ['calibration-1', 'calibration-2', 'calibration-3'],
      tmpDiskGibLowerBound: true,
    });
  });

  test('two measured records and one lower bound make a mixed lower bound', () => {
    const runs = calibrations(4.1, 4.4, 4.3);
    const proposal = propose('gate', [...runs.slice(0, 2), ...lowerBounds(runs.slice(2))]);
    if (proposal.kind !== 'proposed') throw new Error(proposal.reason);
    expect(proposal.lines).toContain(
      "tmpDiskGib: 8 (lower bound from 2 measured + 1 lower bounds, at least the entry's 8, provenance tmpDiskGibLowerBound: p95 3 GiB over 3 records: calibration-1, calibration-2, calibration-3)",
    );
    expect(proposal.entry.provenance).toMatchObject({ tmpDiskGibLowerBound: true });
  });

  test('a lower bound above the entry raises its tmp disk', () => {
    // release-build declares 2 GiB; the lower bounds' p95 of 3 GiB needs at least 4.
    const proposal = propose('release-build', lowerBounds(calibrations(1, 1, 1)));
    if (proposal.kind !== 'proposed') throw new Error(proposal.reason);
    expect(proposal.entry.envelope.tmpDiskGib).toBe(4);
  });

  test('two records do not propose from lower bounds either', () => {
    const proposal = propose('gate', lowerBounds(calibrations(4.1, 4.4)));
    expect(proposal.kind).toBe('refused');
  });

  test('a record with unreadable tmp subtrees beside three measured ones is not cited', () => {
    const proposal = propose('gate', [
      ...calibrations(4.1, 4.4, 4.3),
      ...lowerBounds([
        {
          id: 'fixture-run',
          calibration: true,
          memoryGib: 4,
          cpuCores: 2,
          tmpGib: 9,
          seconds: 600,
        },
      ]),
    ]);
    if (proposal.kind !== 'proposed') throw new Error(proposal.reason);
    expect(proposal.lines).toContain(
      'tmpDiskGib: 4 (p95 3 GiB over 3 records: calibration-1, calibration-2, calibration-3)',
    );
    expect(proposal.lines).toContain(
      `excluded calibration fixture-run from tmpDiskGib: tmp lower bound only: 60 samples saw unreadable subtrees (${PATH})`,
    );
    expect(proposal.entry.provenance).toMatchObject({
      recordIds: ['calibration-1', 'calibration-2', 'calibration-3'],
    });
    expect(proposal.entry.provenance).not.toHaveProperty('tmpDiskGibLowerBound');
  });
});

describe('ops job propose clamps to the pool (task 6.25, A-ENVELOPE-CLAMP-1)', () => {
  /** Three calibrations shaped like h4claw's gate: p95 10.01 GiB, 6.88 cores, 8.01 GiB tmp. */
  const measured: FixtureRun[] = [
    {
      id: 'calibration-1',
      calibration: true,
      memoryGib: 9.5,
      cpuCores: 6.5,
      tmpGib: 7.5,
      seconds: 600,
    },
    {
      id: 'calibration-2',
      calibration: true,
      memoryGib: 10.01,
      cpuCores: 6.88,
      tmpGib: 8.01,
      seconds: 660,
    },
    {
      id: 'calibration-3',
      calibration: true,
      memoryGib: 9.8,
      cpuCores: 6.7,
      tmpGib: 7.9,
      seconds: 720,
    },
  ];
  const IDS = 'calibration-1, calibration-2, calibration-3';

  test("a heuristic above the pool's allocatable is clamped to it, and marked", () => {
    // h4claw's pool: 7 cores, 10 GiB, 48 GiB of disk units.
    const proposal = propose('gate', measured, { cpuCores: 7, memoryGib: 10, tmpDiskGib: 48 });
    if (proposal.kind !== 'proposed') throw new Error(proposal.reason);
    expect(proposal.lines).toContain(
      `memoryGib: 10 (clamped to allocatable 10 GiB; heuristic 13 from p95 10.01 GiB over 3 uncapped, unthrottled records: ${IDS})`,
    );
    expect(proposal.lines).toContain(
      `cpuCores: 7 (clamped to allocatable 7 cores; heuristic 9 from p95 6.88 cores over 3 calibration records: ${IDS})`,
    );
    expect(proposal.lines).toContain(`tmpDiskGib: 11 (p95 8.01 GiB over 3 records: ${IDS})`);
    expect(proposal.entry.envelope).toEqual({
      cpuCores: 7,
      memoryGib: 10,
      tmpDiskGib: 11,
      exclusive: ['gate_tree'],
    });
    expect(proposal.entry.provenance).toMatchObject({
      p95: { cpuCores: 6.88, memoryGib: 10.01, tmpDiskGib: 8.01 },
      clampedToAllocatable: ['cpuCores', 'memoryGib'],
      heuristic: { cpuCores: 9, memoryGib: 13 },
    });
  });

  test("h2puni's smaller pool clamps further, as the landed entry is clamped by hand", () => {
    const proposal = propose('gate', measured, { cpuCores: 6, memoryGib: 9, tmpDiskGib: 12 });
    if (proposal.kind !== 'proposed') throw new Error(proposal.reason);
    expect(proposal.entry.envelope).toMatchObject({ cpuCores: 6, memoryGib: 9, tmpDiskGib: 11 });
    expect(proposal.entry.provenance).toMatchObject({
      clampedToAllocatable: ['cpuCores', 'memoryGib'],
      heuristic: { cpuCores: 9, memoryGib: 13 },
    });
  });

  test('a heuristic equal to allocatable is not clamped', () => {
    const proposal = propose('gate', measured, { cpuCores: 9, memoryGib: 13, tmpDiskGib: 11 });
    if (proposal.kind !== 'proposed') throw new Error(proposal.reason);
    expect(proposal.entry.envelope).toMatchObject({ cpuCores: 9, memoryGib: 13, tmpDiskGib: 11 });
    expect(proposal.entry.provenance).not.toHaveProperty('clampedToAllocatable');
    expect(proposal.entry.provenance).not.toHaveProperty('heuristic');
    expect(proposal.lines).not.toContainEqual(expect.stringContaining('clamped'));
  });

  test("tmp disk clamps to the whole GiB the pool's disk units hold", () => {
    const proposal = propose('gate', measured, { cpuCores: 9, memoryGib: 13, tmpDiskGib: 10 });
    if (proposal.kind !== 'proposed') throw new Error(proposal.reason);
    expect(proposal.lines).toContain(
      `tmpDiskGib: 10 (clamped to allocatable 10 GiB; heuristic 11 from p95 8.01 GiB over 3 records: ${IDS})`,
    );
    expect(proposal.entry.envelope.tmpDiskGib).toBe(10);
    expect(proposal.entry.provenance).toMatchObject({
      clampedToAllocatable: ['tmpDiskGib'],
      heuristic: { tmpDiskGib: 11 },
    });
  });

  test("a tmp lower bound clamps after it is raised to the entry's figure", () => {
    // Lower bounds only: the 8.01 GiB p95 needs 11, the entry holds 8, the pool 9.
    const lower = measured.map((run) => ({ ...run, tmpUnreadable: ['fixture/inaccessible'] }));
    const proposal = propose('gate', lower, { cpuCores: 9, memoryGib: 13, tmpDiskGib: 9 });
    if (proposal.kind !== 'proposed') throw new Error(proposal.reason);
    expect(proposal.lines).toContain(
      `tmpDiskGib: 9 (clamped to allocatable 9 GiB; heuristic 11 from lower bound only, at least the entry's 8, provenance tmpDiskGibLowerBound: p95 8.01 GiB over 3 records: ${IDS})`,
    );
    expect(proposal.entry.provenance).toMatchObject({
      tmpDiskGibLowerBound: true,
      clampedToAllocatable: ['tmpDiskGib'],
      heuristic: { tmpDiskGib: 11 },
    });
  });
});
