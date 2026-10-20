import type { PlannedRow, ResourceDemand, Slice } from '@wbs/domain';

import type { SolverRequestPlan } from './build-solver-request';

/**
 * The two resource plans the shared golden corpus carries as wire 4 requests
 * (`request/valid-staging-resource.json`, `request/valid-divisible-resource.json`),
 * named once so the Bun builder test and the fixtures cannot describe two
 * different plans. Python solves the same bytes (`tests/test_resources.py`).
 */
const leaf = (id: string, position: number): PlannedRow => ({
  id,
  parentId: null,
  position,
  frozenNumber: null,
  priority: null,
});

const demanding = (workItemId: string, demands: readonly ResourceDemand[]): Slice => ({
  workItemId,
  stepId: 'dev',
  days: 1,
  personId: null,
  width: 1,
  poolIds: [],
  demands,
});

const plan = (
  ids: readonly string[],
  demands: readonly ResourceDemand[],
  capacities: ReadonlyMap<string, number>,
): SolverRequestPlan => ({
  rows: ids.map((id, at) => leaf(id, (at + 1) * 10)),
  edges: [],
  slices: ids.map((id) => demanding(id, demands)),
  notBefore: new Map(),
  poolSizes: new Map(),
  reach: 'whole-item',
  deadlines: new Map(),
  typed: [],
  resourceCapacities: capacities,
});

/** The spec's scenario: two equal leaves, each demanding the exclusive `staging` at capacity 1. */
export const STAGING_PLAN = plan(
  ['wi-a', 'wi-b'],
  [{ resourceId: 'staging', units: 1 }],
  new Map([['staging', 1]]),
);

/** 32 GB of RAM and three leaves of 16: two fit at once, the third waits. */
export const DIVISIBLE_PLAN = plan(
  ['wi-a', 'wi-b', 'wi-c'],
  [{ resourceId: 'ram', units: 16 }],
  new Map([['ram', 32]]),
);
