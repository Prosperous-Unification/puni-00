import { describe, expect, test } from 'bun:test';

import {
  type DimensionStanding,
  dimensionStandings,
  incompleteness,
  tmpLowerBoundOf,
} from './measures';
import { committedCatalogue, runRecord } from './run-record.test.fixture';

/**
 * `dash-host-jobs` task 6.23, completeness per dimension: a record whose tmp samples saw an
 * unreadable subtree is complete for memory, CPU and duration and a lower bound for tmp disk;
 * every other defect still voids every dimension.
 */
const catalogue = committedCatalogue([
  { id: 'gate', cpuCores: 4, memoryGib: 6, tmpDiskGib: 8, exclusive: ['gate_tree'] },
]);
const PATH = 'wbs-shared-process-XYrBbJ/inaccessible';

describe('dimensionStandings (task 6.23, A-TMP-TELEMETRY-1)', () => {
  test('a complete record is complete in every dimension', () => {
    const record = runRecord(catalogue, { id: 'clean', tmpGib: 1 });
    expect(tmpLowerBoundOf(record)).toBeNull();
    expect(dimensionStandings(record)).toEqual({
      memoryGib: { kind: 'complete' },
      cpuCores: { kind: 'complete' },
      tmpDiskGib: { kind: 'complete' },
      durationSeconds: { kind: 'complete' },
    });
  });

  test('a record whose only defect is unreadable tmp subtrees is a lower bound for tmp alone', () => {
    const record = runRecord(catalogue, { id: 'fixture', tmpGib: 1, tmpUnreadable: [PATH] });
    expect(incompleteness(record)).toBeNull();
    expect(tmpLowerBoundOf(record)).toEqual({ samples: 3, paths: [PATH], omitted: 0 });
    expect(dimensionStandings(record)).toEqual({
      memoryGib: { kind: 'complete' },
      cpuCores: { kind: 'complete' },
      tmpDiskGib: {
        kind: 'lower-bound',
        reason: `tmp lower bound only: 3 samples saw unreadable subtrees (${PATH})`,
      },
      durationSeconds: { kind: 'complete' },
    });
  });

  test('a real telemetry failure voids every dimension, unreadable subtrees or not', () => {
    const record = runRecord(catalogue, {
      id: 'broken',
      tmpUnreadable: [PATH],
      telemetryFailure: 'interval: scope counter memory.peak unreadable',
    });
    const incomplete: DimensionStanding = {
      kind: 'incomplete',
      reason: 'telemetry failure: interval: scope counter memory.peak unreadable',
    };
    expect(dimensionStandings(record)).toEqual({
      memoryGib: incomplete,
      cpuCores: incomplete,
      tmpDiskGib: incomplete,
      durationSeconds: incomplete,
    });
  });

  test('the paths of every sample are listed once, in first-seen order', () => {
    const record = runRecord(catalogue, { id: 'two', tmpUnreadable: [PATH, 'b'] });
    const first = record.samples.at(1);
    if (first === undefined) throw new Error('fixture has no interval sample');
    first.tmpUnreadable = ['a', PATH];
    first.tmpUnreadableOmitted = 2;
    expect(tmpLowerBoundOf(record)).toEqual({ samples: 3, paths: ['a', PATH, 'b'], omitted: 2 });
  });
});
