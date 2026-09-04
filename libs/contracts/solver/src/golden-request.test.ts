import { readFileSync } from 'node:fs';

import type { PlannedRow, Slice } from '@wbs/domain';
import { describe, expect, it } from 'bun:test';

import { buildSolverRequest, type SolverRequestPlan } from './build-solver-request';
import { quantisedFastBaseline } from './quantised-baseline';

/**
 * The **request** branch of the golden corpus, run against the builder that has
 * to produce it.
 *
 * ## The gap this closes
 *
 * Until the assembly existed the request branch had **no TypeScript consumer at
 * all**: `parse-solver-response.test.ts` filters the manifest to
 * `branch === 'response'` and nothing filtered to `'request'`. Those fixtures
 * were checked in for the Python entrypoint's `jsonschema` pass, which does not
 * exist yet, so a manifest entry proved only that somebody wrote a file — not
 * that the schema validates it and not that any code produces it. The
 * structural pin in `wire-types.test.ts` catches shape drift and says nothing
 * about values.
 *
 * This is the value oracle, and it runs in the one direction that matters: the
 * fixture is **bytes on disk**, so a builder that agrees with it agrees with
 * something nobody derived from the builder. Every assertion in
 * `build-solver-request.test.ts` is computed from the same seams the builder
 * calls; this one is not.
 *
 * ## Why only one of the two valid request fixtures is built here
 *
 * `valid-quantised-baseline.json` is 2.11's own fixture and the manifest says
 * so. `valid-two-slices.json` is a **schema** fixture, and no plan this builder
 * can be handed produces it — measured from `priorityWeights`, not assumed. It
 * carries `priorityWeight` 2 on one slice and 0 on the other. The rank is dense
 * over the distinct priorities of the **whole** canonical input, so a weight of
 * 2 needs two distinct priorities present, while a weight of 0 is `absence`
 * from `priorityByLeaf` and not a low rank. Two leaves cannot supply both: if
 * the second leaf carried the second distinct priority its weight would be 1.
 * So the fixture implies a **third** prioritised leaf, and a third leaf with no
 * slice of its own is one `schedule()` refuses — which means it also has no
 * quantised baseline, and therefore no request. Valid against the schema, which
 * is all its manifest entry claims; not a builder output.
 */

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(`${import.meta.dir}/../fixtures/request/${name}`, 'utf8'));

/**
 * 2.11's plan: one leaf, three serial steps, `days: 1` across five people.
 *
 * Real Fast finishes these at 0.6 workdays = 28.8 units, which no CP-SAT
 * variable can hold; each duration rounds up to 10 and the quantised model
 * needs 30. The fixture's `0 / 10 / 20` are the rounded model's, and that
 * difference is the whole reason the baseline is re-derived rather than
 * converted.
 */
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

/** The request the coordinator would spawn with, for this plan. */
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

describe('the golden request corpus', () => {
  it('is what buildSolverRequest produces, field for field', () => {
    // Deep equality against the file, not against a field list: a builder that
    // dropped `fastHint`, quantised a duration downwards, or wrote real Fast's
    // 9.6 into an offset all fail here, and each of them passes a key-set pin.
    expect(requestOf()).toEqual(fixture('valid-quantised-baseline.json'));
  });

  it('rounds the durations up, so the offsets are the model the solver receives', () => {
    // Stated separately from the deep equality because it is the ONE number the
    // fixture exists to hold: real Fast's 9.6 and 19.2 are not values any
    // variable in the request's own model can take.
    const request = requestOf();
    expect(Object.values(request.baselineOffsets)).toEqual([0, 10, 20]);
    expect(request.horizonUnits).toBe(30);
  });
});
