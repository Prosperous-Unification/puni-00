import { type } from 'arktype';
import { expect, test } from 'bun:test';

import { documentConnected } from './plan-document-connected-shapes';

const evidence = () => ({
  kind: 'connected',
  workPackageId: 'B',
  mode: 'isolated',
  workPackages: [
    {
      workPackageId: 'B',
      name: 'Build',
      abbreviation: 'BLD',
      rank: 1,
      startDate: null,
      timezone: 'UTC',
      revision: 2,
      seq: 3,
    },
  ],
  relationships: [],
  placement: {
    kind: 'scheduled',
    originOrdinal: null,
    baseline: [],
    selected: [],
    stages: [],
    idleWorkPackages: ['B'],
  },
});
test('connected response requires each provenance and placement field independently', () => {
  expect(documentConnected(evidence()) instanceof type.errors).toBe(false);
  for (const field of ['workPackageId', 'workPackages', 'relationships', 'placement']) {
    const broken: Record<string, unknown> = evidence();
    Reflect.deleteProperty(broken, field);
    expect(documentConnected(broken) instanceof type.errors).toBe(true);
  }
  for (const field of [
    'workPackageId',
    'name',
    'abbreviation',
    'rank',
    'startDate',
    'timezone',
    'revision',
    'seq',
  ]) {
    const broken = evidence();
    Reflect.deleteProperty(broken.workPackages[0], field);
    expect(documentConnected(broken) instanceof type.errors).toBe(true);
  }
});
test('connected response refuses missing positions and nonfinite offsets', () => {
  for (const field of ['baseline', 'selected', 'stages', 'idleWorkPackages', 'originOrdinal']) {
    const broken = evidence();
    Reflect.deleteProperty(broken.placement, field);
    expect(documentConnected(broken) instanceof type.errors).toBe(true);
  }
  const broken = {
    ...evidence(),
    placement: {
      ...evidence().placement,
      selected: [{ workPackageId: 'B', workItemId: 'b', stepId: null, start: Infinity, finish: 2 }],
    },
  };
  expect(documentConnected(broken) instanceof type.errors).toBe(true);
});
