import type { PlannedRow, Slice } from '@wbs/domain';
import { describe, expect, it } from 'bun:test';

import { buildSolverRequest, type SolverRequestPlan } from './build-solver-request';
import { quantisedFastBaseline } from './quantised-baseline';
import { revalidateSolverResult } from './revalidate-solver-result';
import { SOLVER_WIRE_VERSION, type SolverResponse } from './wire-types';

/**
 * 2.11's remaining clause: **the hint is feasible**.
 *
 * The claim the whole quantised baseline exists to make is that
 * `baselineOffsets` is a feasible solution of *exactly the model the solver
 * receives* — otherwise stage 1's upper bound is a bound the search cannot
 * meet, and the hint is infeasible in the model it hints. Real Fast's answer is
 * not that: three serial slices at `days: 1, width: 5` finish at 28.8 units,
 * which no CP-SAT variable holds, while the rounded model needs 30.
 *
 * **The checker already existed and is not reimplemented here.**
 * `revalidateSolverResult` is the same constraint pass that stands between a
 * solver's answer and a published schedule — offsets in domain, key sets equal,
 * every edge respected, every floor respected, no pool over capacity, no person
 * double-booked. Feeding the baseline back through it *as a response* asks the
 * feasibility question with the code that will ask it in production, rather
 * than with a second copy of the rules that could agree with the baseline by
 * being written from it.
 *
 * The response is assembled here rather than round-tripped through the parser
 * because the parser proves bytes and this proves placement; the three
 * objective values are hand-computed below and are part of the proof, since the
 * re-validator recomputes `value` from the offsets and refuses a mismatch.
 */

/** 2.11's plan: one leaf, three serial steps, `days: 1` across five people. */
const rows: readonly PlannedRow[] = [
  { id: 'A', parentId: null, position: 0, frozenNumber: null, priority: null },
];
const slices: readonly Slice[] = ['one', 'two', 'three'].map((stepId) => ({
  workItemId: 'A',
  stepId,
  days: 1,
  personId: null,
  width: 5,
  poolIds: [],
}));

const plan: SolverRequestPlan = {
  rows,
  edges: [],
  slices,
  notBefore: new Map(),
  poolSizes: new Map(),
  reach: 'whole-item',
  deadlines: new Map(),
};

const requestOf = () => {
  const built = buildSolverRequest(plan, 'pri', {
    baselineOffsets: quantisedFastBaseline(
      plan.rows,
      plan.edges,
      plan.slices,
      plan.notBefore,
      plan.poolSizes,
      plan.reach,
    ),
    solverVersion: '0.1.0',
    budgetMs: 30_000,
  });
  if (!built.ok) throw new Error(`expected a request, got ${built.failure}: ${built.detail}`);
  return built.request;
};

/**
 * The baseline, dressed as the response a solver that found exactly it would
 * send.
 *
 * The three terms are the definitions in `revalidate-solver-result.ts`, worked
 * out by hand on this plan rather than recomputed from the offsets:
 * `MAKESPAN = max finish` is `20 + 10 = 30`; `PRIORITY = Σ w(s) · finish(s)` is
 * `0`, because no row in this plan carries a priority and an absent leaf weighs
 * 0; `MOVEMENT = Σ |start − baseline|` is `0`, necessarily, because the offsets
 * ARE the baseline. `stageValue` and `bound` are null and `status` is
 * `unknown`: they are statements about a stage, and no stage ran.
 */
const asResponse = (offsets: Readonly<Record<string, number>>): SolverResponse => ({
  wireVersion: SOLVER_WIRE_VERSION,
  status: 'feasible',
  offsets,
  objectiveValues: {
    makespan: { value: 30, stageValue: null, bound: null, status: 'unknown' },
    priority: { value: 0, stageValue: null, bound: null, status: 'unknown' },
    movement: { value: 0, stageValue: null, bound: null, status: 'unknown' },
  },
});

describe('the quantised baseline as a solution the solver could publish', () => {
  it('passes the same re-validation a real solver answer has to pass', () => {
    const request = requestOf();
    expect(revalidateSolverResult(request, asResponse(request.baselineOffsets))).toEqual({
      ok: true,
      published: true,
    });
  });

  it('and the check is live on this plan, not vacuous', () => {
    // Without this, the assertion above would still pass if the re-validator
    // never looked at the edges. One slice pulled back on top of its
    // predecessor breaks the intra-item step chain the request carries, and the
    // failure names the constraint rather than the arithmetic.
    const request = requestOf();
    const [, second] = request.slices;
    const collided = { ...request.baselineOffsets, [second.key]: 0 };
    const refused = revalidateSolverResult(request, asResponse(collided));
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error('expected a refusal');
    expect(refused.failure).toBe('edge-violated');
  });

  it('measures MOVEMENT as zero against itself, which is what makes it the origin', () => {
    // Not a tautology worth skipping: MOVEMENT is the one term whose definition
    // reads `baselineOffsets` out of the REQUEST, so this fails the moment the
    // builder ships a baseline that is not the map the offsets came from — the
    // divergence a wire carrying two copies of one value invites.
    const request = requestOf();
    const moved = { ...request.baselineOffsets, [request.slices[2].key]: 25 };
    const refused = revalidateSolverResult(request, asResponse(moved));
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error('expected a refusal');
    // 25 is still after slice two's finish at 20, so the chain holds and the
    // arithmetic is what breaks: MAKESPAN becomes 35 and MOVEMENT 5.
    expect(refused.failure).toBe('objective-mismatch');
  });
});
