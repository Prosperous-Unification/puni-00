import { expect, test } from 'bun:test';

import { readPersonLoad } from './person-load-shapes';
import { validateSchema } from './schema-shape';
import { readSpaceRollUps } from './space-shapes';

const rolledUp = {
  kind: 'rolled_up' as const,
  dates: null,
  finalTotal: 2.5,
  status: 'ready' as const,
  counts: {
    byStatus: {
      unknown: 0,
      draft: 0,
      ready: 1,
      in_progress: 0,
      blocked_by_proxy: 0,
      on_hold: 0,
      blocked: 0,
      done: 0,
    },
    leaves: 1,
    estimated: 1,
  },
  waitingForPerson: 0,
  waitingForCapacity: 0,
  displayed: null,
  projectRevision: 3,
  seq: 7,
};

test('space roll-up boundary preserves exact connected reasons and nullable displayed engine', async () => {
  for (const scheduleError of [
    {
      kind: 'dependency_calendar_missing' as const,
      projects: [{ projectId: 'remote', abbreviation: 'REM', name: 'Remote' }],
    },
    {
      kind: 'engine_unavailable' as const,
      engine: 'optimized' as const,
      projects: ['remote'],
      reason: 'adapter_missing' as const,
    },
    {
      kind: 'engine_unavailable' as const,
      engine: 'optimized' as const,
      projects: ['remote'],
      reason: 'connected_optimization_not_supported' as const,
    },
  ]) {
    const reply = { rollUps: { target: { ...rolledUp, scheduleError } } };
    expect(await validateSchema(readSpaceRollUps.responses[0].schema, reply)).toEqual({
      value: reply,
    });
  }
});

test('space roll-up boundary rejects incomplete or invented connected evidence', async () => {
  for (const scheduleError of [
    'dependency_calendar_missing',
    { kind: 'dependency_calendar_missing' },
    { kind: 'dependency_calendar_missing', projects: [] },
    { kind: 'dependency_calendar_missing', projects: [{ projectId: 'remote', name: 'Remote' }] },
    { kind: 'engine_unavailable', engine: 'optimized', projects: [], reason: 'adapter_missing' },
    { kind: 'engine_unavailable', engine: 'fast', projects: ['remote'], reason: 'adapter_missing' },
    { kind: 'engine_unavailable', engine: 'optimized', projects: ['remote'], reason: 'invented' },
  ]) {
    expect(
      (
        await validateSchema(readSpaceRollUps.responses[0].schema, {
          rollUps: { target: { ...rolledUp, scheduleError } },
        })
      ).issues,
    ).toBeDefined();
  }
});

test('person load boundary admits the coarse missing-calendar reason without arbitrary reasons', async () => {
  const reply = {
    person: { id: 'ana', name: 'Ana' },
    projects: [],
    overlaps: [],
    undated: [],
    unavailable: [
      { projectId: 'target', name: 'Target', reason: 'dependency_calendar_missing' as const },
    ],
  };
  expect(await validateSchema(readPersonLoad.responses[0].schema, reply)).toEqual({ value: reply });
  expect(
    (
      await validateSchema(readPersonLoad.responses[0].schema, {
        ...reply,
        unavailable: [{ projectId: 'target', name: 'Target', reason: 'invented' }],
      })
    ).issues,
  ).toBeDefined();
});
