import { describe, expect, test } from 'bun:test';

import { peakCpuCores } from './measures';
import { type Partition, proposeEnvelope } from './propose';
import {
  CATALOGUE_PATH,
  committedCatalogue,
  type FixtureRun,
  HOST_CLASS,
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

function propose(type: string, runs: readonly FixtureRun[]) {
  return proposeEnvelope(
    type,
    catalogue,
    runs.map((run) => runRecord(catalogue, { type, ...run })),
    partition,
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
