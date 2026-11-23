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
  workPackageRevision: 3,
  seq: 7,
};

/** Complete current grouped wire fixture; each negative changes only the child's connected reason. */
function projectReply(scheduleError: unknown) {
  return {
    projects: [
      {
        project: { id: 'engagement', name: 'Engagement' },
        position: 10,
        rollUp: {
          kind: 'rolled_up',
          dates: null,
          finalTotal: 2.5,
          status: 'ready',
          counts: rolledUp.counts,
          waitingForPerson: 0,
          waitingForCapacity: 0,
        },
        workPackages: [
          {
            workPackage: {
              id: 'target',
              name: 'Target',
              abbreviation: 'TAR',
              projectId: 'engagement',
              restricted: false,
              estimateMethod: 'pert',
              depReach: 'whole-item',
              pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
              estimateRounding: 'exact',
              startDate: null,
              solutionRef: null,
              revision: 3,
              createdAt: 1,
              optimizationEnabled: false,
              scheduleEngine: 'fast',
              scheduleObjective: 'pri',
              createdByName: 'Author',
              lastOpenedAt: null,
            },
            rollUp: { ...rolledUp, scheduleError },
          },
        ],
      },
    ],
  };
}

test('space roll-up boundary preserves exact connected reasons and nullable displayed engine', async () => {
  for (const scheduleError of [
    {
      kind: 'dependency_calendar_missing' as const,
      workPackages: [{ workPackageId: 'remote', abbreviation: 'REM', name: 'Remote' }],
    },
    {
      kind: 'engine_unavailable' as const,
      engine: 'optimized' as const,
      workPackages: ['remote'],
      reason: 'adapter_missing' as const,
    },
    {
      kind: 'engine_unavailable' as const,
      engine: 'optimized' as const,
      workPackages: ['remote'],
      reason: 'connected_optimization_not_supported' as const,
    },
  ]) {
    const reply = projectReply(scheduleError);
    const validated: unknown = await validateSchema(readSpaceRollUps.responses[0].schema, reply);
    expect(validated).toEqual({
      value: reply,
    });
  }
});

test('space roll-up boundary rejects incomplete or invented connected evidence', async () => {
  for (const scheduleError of [
    'dependency_calendar_missing',
    { kind: 'dependency_calendar_missing' },
    { kind: 'dependency_calendar_missing', workPackages: [] },
    {
      kind: 'dependency_calendar_missing',
      workPackages: [{ workPackageId: 'remote', name: 'Remote' }],
    },
    {
      kind: 'engine_unavailable',
      engine: 'optimized',
      workPackages: [],
      reason: 'adapter_missing',
    },
    {
      kind: 'engine_unavailable',
      engine: 'fast',
      workPackages: ['remote'],
      reason: 'adapter_missing',
    },
    {
      kind: 'engine_unavailable',
      engine: 'optimized',
      workPackages: ['remote'],
      reason: 'invented',
    },
  ]) {
    expect(
      (await validateSchema(readSpaceRollUps.responses[0].schema, projectReply(scheduleError)))
        .issues,
    ).toBeDefined();
  }
});

test('person load boundary admits the coarse missing-calendar reason without arbitrary reasons', async () => {
  const reply = {
    person: { id: 'ana', name: 'Ana' },
    workPackages: [],
    overlaps: [],
    undated: [],
    unavailable: [
      { workPackageId: 'target', name: 'Target', reason: 'dependency_calendar_missing' as const },
    ],
  };
  expect(await validateSchema(readPersonLoad.responses[0].schema, reply)).toEqual({ value: reply });
  expect(
    (
      await validateSchema(readPersonLoad.responses[0].schema, {
        ...reply,
        unavailable: [{ workPackageId: 'target', name: 'Target', reason: 'invented' }],
      })
    ).issues,
  ).toBeDefined();
});
