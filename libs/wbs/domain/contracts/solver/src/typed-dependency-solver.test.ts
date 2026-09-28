import type { PlannedRow, Slice, TypedDependency } from '@wbs/domain';
import { describe, expect, it } from 'bun:test';

import { buildSolverRequest, type SolverRequestPlan } from './build-solver-request';
import { materialiseOptimized } from './materialise-optimized';
import { quantisedFastBaseline } from './quantised-baseline';
import { revalidateSolverResult } from './revalidate-solver-result';
import type { SolverObjectiveTerm, SolverObjectiveValues, SolverResponse } from './wire-types';

/**
 * Typed dependencies through the solver request (WBS 010.4.6, task 8): a
 * parent relationship expands to one FS edge per leaf pair on the wire, and
 * independent revalidation refuses a response that violates any one of them.
 *
 * P holds P1 and P2; B is a root. Each leaf has Dev then QA. Whole P → whole B
 * resolves to P1.qa → B.dev and P2.qa → B.dev.
 */
const DEV = 'step-dev';
const QA = 'step-qa';
const row = (id: string, parentId: string | null, position: number): PlannedRow => ({
  id,
  parentId,
  position,
  frozenNumber: null,
  priority: null,
});
const slices = (days: Record<string, [number, number]>): Slice[] =>
  Object.entries(days).flatMap(([workItemId, [dev, qa]]) => [
    { workItemId, stepId: DEV, days: dev, personId: null, width: 1, poolIds: [] },
    { workItemId, stepId: QA, days: qa, personId: null, width: 1, poolIds: [] },
  ]);
const wholePToB: TypedDependency = {
  id: 'r1',
  predecessor: { scope: 'whole', workItemId: 'P' },
  successor: { scope: 'whole', workItemId: 'B' },
  type: 'FS',
};
const plan: SolverRequestPlan = {
  rows: [row('P', null, 10), row('P1', 'P', 10), row('P2', 'P', 20), row('B', null, 20)],
  edges: [],
  slices: slices({ P1: [1, 1], P2: [3, 1], B: [1, 1] }),
  notBefore: new Map(),
  poolSizes: new Map(),
  reach: 'whole-item',
  deadlines: new Map(),
  typed: [wholePToB],
};
const key = (workItemId: string, stepId: string): string => `${workItemId}\u0000${stepId}`;

function requestFor(input: SolverRequestPlan) {
  const baselineOffsets = quantisedFastBaseline(
    input.rows,
    input.edges,
    input.slices,
    input.notBefore,
    input.poolSizes,
    input.reach,
    input.typed,
  );
  const built = buildSolverRequest(input, 'time', {
    baselineOffsets,
    solverVersion: '0.1.3',
    budgetMs: 1_000,
  });
  if (!built.ok) throw new Error(`the request refused: ${JSON.stringify(built)}`);
  return built.request;
}

const term = (value: number): SolverObjectiveValues[SolverObjectiveTerm] => ({
  value,
  stageValue: value,
  bound: value,
  status: 'feasible',
});
const feasible = (offsets: Record<string, number>): SolverResponse => ({
  wireVersion: 1,
  status: 'feasible',
  offsets,
  objectiveValues: { makespan: term(0), priority: term(0), movement: term(0) },
});

describe('typed dependencies on the solver wire', () => {
  /**
   * Proof: `buildSolverRequest` handing `buildSolverEdges` an empty typed list
   * made this case fail on the two authored edges missing from the wire;
   * watched 2026-09-27.
   */
  it('carries one FS edge per resolved leaf pair of a parent relationship', () => {
    const request = requestFor(plan);
    const wire = request.edges.map((edge) => `${edge.predecessorKey}→${edge.successorKey}`);
    expect(wire).toContain(`${key('P1', QA)}→${key('B', DEV)}`);
    expect(wire).toContain(`${key('P2', QA)}→${key('B', DEV)}`);
  });

  it('starts the baseline after both predecessor leaves', () => {
    const request = requestFor(plan);
    // P2 runs 3 + 1 days: B.dev waits until day 4, on the 48-unit axis.
    expect(request.baselineOffsets[key('B', DEV)]).toBe(4 * 48);
  });

  it('refuses a response that honours one expanded pair and violates the other', () => {
    const request = requestFor(plan);
    // B.dev placed after P1.qa (finishes at day 2) but before P2.qa (day 4).
    const offsets = { ...request.baselineOffsets, [key('B', DEV)]: 2 * 48, [key('B', QA)]: 3 * 48 };
    const result = revalidateSolverResult(request, feasible(offsets));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure).toBe('edge-violated');
  });
});

describe('typed dependencies when an optimized answer is materialised', () => {
  /**
   * Proof: `materialiseOptimized` handing `schedule()` an empty typed list made
   * this case fail on `Received function did not throw` — the optimized
   * answer was materialised with B.dev before P2.qa finished; watched
   * 2026-09-27.
   */
  it('refuses offsets that violate one expanded pair, independently of the wire', () => {
    const request = requestFor(plan);
    const offsets = { ...request.baselineOffsets, [key('B', DEV)]: 2 * 48, [key('B', QA)]: 3 * 48 };
    expect(() =>
      materialiseOptimized(
        plan.rows,
        plan.edges,
        plan.slices,
        plan.notBefore,
        plan.poolSizes,
        plan.reach,
        plan.typed,
        offsets,
      ),
    ).toThrow();
  });

  it('materialises offsets that honour every expanded pair', () => {
    const request = requestFor(plan);
    expect(() =>
      materialiseOptimized(
        plan.rows,
        plan.edges,
        plan.slices,
        plan.notBefore,
        plan.poolSizes,
        plan.reach,
        plan.typed,
        request.baselineOffsets,
      ),
    ).not.toThrow();
  });
});
