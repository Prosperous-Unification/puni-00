import {
  type DependencyEdge,
  type PlannedRow,
  SCHEDULER_CONTRACT_VERSION,
  type Slice,
  sliceKey,
  SOLVER_QUANTUM,
} from '@wbs/domain';
import { describe, expect, it } from 'bun:test';

import { buildSolverRequest, type SolverRequestPlan, type SolverSpawn } from './build-solver-request';
import { quantisedFastBaseline } from './quantised-baseline';
import { STAGE_BUDGET_SPLIT } from './stage-budget';
import { SOLVER_REQUEST_KEYS, SOLVER_WIRE_VERSION } from './wire-types';

const rowOf = (id: string, parentId: string | null, priority: number | null): PlannedRow => ({
  id,
  parentId,
  position: 0,
  frozenNumber: null,
  priority,
});

const sliceOf = (
  workItemId: string,
  stepId: string | null,
  days: number | null,
  extra: Partial<Slice> = {},
): Slice => ({
  workItemId,
  stepId,
  days,
  personId: null,
  width: 1,
  poolIds: [],
  ...extra,
});

/**
 * A parent with two leaves: `A` has two steps and one pool, `B` has one step
 * and a floor written on the parent.
 *
 * Small on purpose. This file proves the assembly — which seams run, in which
 * order, and what lands in which field — and every rule the seams hold is
 * proved in the seam's own test. A larger plan here would re-prove the
 * projection and hide the wiring.
 */
const rows: readonly PlannedRow[] = [
  rowOf('P', null, 5),
  rowOf('A', 'P', null),
  rowOf('B', 'P', 1),
];
const slices: readonly Slice[] = [
  sliceOf('A', 'design', 2, { poolIds: ['team-x'] }),
  sliceOf('A', 'dev', 4, { poolIds: ['team-x'], width: 2 }),
  sliceOf('B', 'dev', 3, { personId: 'ann' }),
];
const edges: readonly DependencyEdge[] = [{ predecessorId: 'A', successorId: 'B' }];

const planOf = (over: Partial<SolverRequestPlan> = {}): SolverRequestPlan => ({
  rows,
  edges,
  slices,
  notBefore: new Map([['P', 3]]),
  poolSizes: new Map([['team-x', 2]]),
  reach: 'whole-item',
  deadlines: new Map(),
  ...over,
});

/**
 * The baseline from 2.11, over the same plan — an oracle rather than a literal.
 *
 * Hand-writing the offsets here would let this file agree with a builder that
 * keys its slices differently from the one the coordinator will actually feed,
 * which is the exact divergence the key-set refusal below exists to catch.
 */
const baselineOf = (plan: SolverRequestPlan) =>
  quantisedFastBaseline(
    plan.rows,
    plan.edges,
    plan.slices,
    plan.notBefore,
    plan.poolSizes,
    plan.reach,
  );

const spawnOf = (plan: SolverRequestPlan, over: Partial<SolverSpawn> = {}): SolverSpawn => ({
  baselineOffsets: baselineOf(plan),
  solverVersion: '0.1.0',
  budgetMs: 30_000,
  ...over,
});

/** The `ok: true` arm, or a failure the test did not ask for. */
const requestOf = (plan: SolverRequestPlan, spawn: SolverSpawn = spawnOf(plan)) => {
  const built = buildSolverRequest(plan, 'pri', spawn);
  if (!built.ok) throw new Error(`expected a request, got ${built.failure}: ${built.detail}`);
  return built.request;
};

describe('buildSolverRequest', () => {
  it('fills every member the schema requires, and no other', () => {
    // The schema's `required` lists all thirteen and the branch is
    // `additionalProperties: false`, so a missing one and an invented one are
    // the same class of fault and this is the assertion that sees both.
    expect(Object.keys(requestOf(planOf())).sort()).toEqual([...SOLVER_REQUEST_KEYS].sort());
  });

  it('carries the two constants and both halves of contractVersion', () => {
    const request = requestOf(planOf());
    expect(request.wireVersion).toBe(SOLVER_WIRE_VERSION);
    expect(request.quantum).toBe(SOLVER_QUANTUM);
    expect(request.solverVersion).toBe('0.1.0');
    // The solver's version alone would describe none of the durations, the leaf
    // expansion or the baseline — all of which Bun produced.
    expect(request.contractVersion).toBe(`${String(SCHEDULER_CONTRACT_VERSION)}+0.1.0`);
  });

  it('projects the slices, the graph and only the pools the request names', () => {
    const request = requestOf(planOf());
    expect(request.slices.map((slice) => slice.key)).toEqual([
      sliceKey('A', 'design'),
      sliceKey('A', 'dev'),
      sliceKey('B', 'dev'),
    ]);
    // The chain first, then the join: A's LAST slice to B's FIRST, whole-item.
    expect(request.edges).toEqual([
      { predecessorKey: sliceKey('A', 'design'), successorKey: sliceKey('A', 'dev') },
      { predecessorKey: sliceKey('A', 'dev'), successorKey: sliceKey('B', 'dev') },
    ]);
    expect(request.pools).toEqual({ 'team-x': 2 });
    // `team-y` is sized in the project and named by no slice, so it stays out:
    // the request is hashed as a cache key, and shipping it would invalidate
    // this plan's cached result on an edit to a team the plan does not use.
    const sizedTwice = planOf({ poolSizes: new Map([['team-x', 2], ['team-y', 9]]) });
    expect(requestOf(sizedTwice).pools).toEqual({ 'team-x': 2 });
    // The floor is written on the PARENT and lands on both of its leaves, in
    // units: day 3 is a start bound, so `3 × quantum` with no `+ 1`.
    for (const slice of request.slices) {
      expect(slice.notBeforeUnits).toBe(3 * SOLVER_QUANTUM);
      expect(slice.deadlineUnits).toBeNull();
    }
  });

  it('sends the baseline twice, as the same map', () => {
    // Two different questions with one answer today — MOVEMENT's origin and the
    // search's starting assignment — and the wire keeps them apart so a later
    // warm start cannot silently move the objective's origin.
    const plan = planOf();
    const spawn = spawnOf(plan);
    const request = requestOf(plan, spawn);
    expect(request.baselineOffsets).toEqual(spawn.baselineOffsets);
    expect(request.fastHint).toEqual(spawn.baselineOffsets);
    expect(Object.keys(request.baselineOffsets).sort()).toEqual(
      request.slices.map((slice) => slice.key).sort(),
    );
  });

  it('changes exactly one field between the two objectives', () => {
    // PRI and Time are two runs over one canonical input. Anything else that
    // differed would be two plans being compared rather than two objectives.
    const plan = planOf();
    const spawn = spawnOf(plan);
    const pri = buildSolverRequest(plan, 'pri', spawn);
    const time = buildSolverRequest(plan, 'time', spawn);
    if (!pri.ok || !time.ok) throw new Error('expected two requests');
    expect(pri.request.objective).toBe('pri');
    expect(time.request.objective).toBe('time');
    expect({ ...pri.request, objective: 'time' }).toEqual(time.request);
  });

  it('defaults the stage split to the constant and refuses one that is not a split', () => {
    expect(requestOf(planOf()).stageBudgetSplit).toEqual(STAGE_BUDGET_SPLIT);
    const plan = planOf();
    expect(() =>
      buildSolverRequest(plan, 'pri', spawnOf(plan, { stageBudgetSplit: [0.5, 0.25, 0.15] })),
    ).toThrow('does not spend the budget exactly once');
  });

  it('returns the pre-spawn failure instead of a request, rather than throwing', () => {
    // A horizon past CP-SAT's own variable domain. The token is what the cached
    // row records, so it is a value and not an exception.
    const long = sliceOf('A', 'design', 100_000_000);
    const plan = planOf({ rows: [rowOf('A', null, null)], edges: [], slices: [long] });
    const built = buildSolverRequest(plan, 'pri', {
      baselineOffsets: { [sliceKey('A', 'design')]: 0 },
      solverVersion: '0.1.0',
      budgetMs: 30_000,
    });
    expect(built.ok).toBe(false);
    if (built.ok) throw new Error('expected a refusal');
    expect(built.failure).toBe('horizon-overflow');
  });

  it('refuses a baseline offset for a slice the request does not name', () => {
    // The direction `preflightSolverRequest` does not check: it throws on a
    // slice with no baseline, and this is a baseline with no slice. `fastHint`
    // is the solver's starting assignment, so a stale key is a hint about a
    // variable the model does not have.
    const plan = planOf();
    const stale = { ...baselineOf(plan), [sliceKey('A', 'gone')]: 0 };
    expect(() => buildSolverRequest(plan, 'pri', spawnOf(plan, { baselineOffsets: stale }))).toThrow(
      'which this request has no slice for',
    );
  });

  it('groups before it projects, so a slice for a parent is refused as a plan fault', () => {
    // Ordering, not a new rule: `groupSlicesByLeaf` owns this refusal. Run the
    // grouping after the projection and the same slice is keyed first and
    // refused later by a message about positions in a group.
    const plan = planOf({ slices: [...slices, sliceOf('P', 'dev', 1)] });
    expect(() =>
      buildSolverRequest(plan, 'pri', {
        baselineOffsets: {},
        solverVersion: '0.1.0',
        budgetMs: 30_000,
      }),
    ).toThrow('slice for P, which is not a leaf of this project');
  });

  it('refuses a canonical input with no slices at all', () => {
    // `slices` is `minItems: 1`: a plan with no slices allocates nothing and
    // spawns nothing, so an empty array is a request this builder would have
    // written against the schema it validates with.
    const plan = planOf({ rows: [rowOf('A', null, null)], edges: [], slices: [] });
    expect(() =>
      buildSolverRequest(plan, 'pri', {
        baselineOffsets: {},
        solverVersion: '0.1.0',
        budgetMs: 30_000,
      }),
    ).toThrow('no slices');
  });
});
