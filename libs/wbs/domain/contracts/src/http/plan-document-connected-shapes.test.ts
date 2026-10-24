import { type } from 'arktype';
import { expect, test } from 'bun:test';

import { documentConnected } from './plan-document-connected-shapes';

const evidence = () => ({
  kind: 'connected',
  projectId: 'B',
  mode: 'isolated',
  projects: [
    {
      projectId: 'B',
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
    idleProjects: ['B'],
  },
});
test('connected response requires each provenance and placement field independently', () => {
  expect(documentConnected(evidence()) instanceof type.errors).toBe(false);
  for (const field of ['projectId', 'projects', 'relationships', 'placement']) {
    const broken: Record<string, unknown> = evidence();
    Reflect.deleteProperty(broken, field);
    expect(documentConnected(broken) instanceof type.errors).toBe(true);
  }
  for (const field of [
    'projectId',
    'name',
    'abbreviation',
    'rank',
    'startDate',
    'timezone',
    'revision',
    'seq',
  ]) {
    const broken = evidence();
    Reflect.deleteProperty(broken.projects[0], field);
    expect(documentConnected(broken) instanceof type.errors).toBe(true);
  }
});
test('connected response refuses missing positions and nonfinite offsets', () => {
  for (const field of ['baseline', 'selected', 'stages', 'idleProjects', 'originOrdinal']) {
    const broken = evidence();
    Reflect.deleteProperty(broken.placement, field);
    expect(documentConnected(broken) instanceof type.errors).toBe(true);
  }
  const broken = {
    ...evidence(),
    placement: {
      ...evidence().placement,
      selected: [{ projectId: 'B', workItemId: 'b', stepId: null, start: Infinity, finish: 2 }],
    },
  };
  expect(documentConnected(broken) instanceof type.errors).toBe(true);
});
