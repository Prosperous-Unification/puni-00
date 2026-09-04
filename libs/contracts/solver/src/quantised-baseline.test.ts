import { readFileSync } from 'node:fs';

import {
  type DependencyEdge,
  indexTree,
  leafFloorsOf,
  type PlannedRow,
  schedule,
  type Slice,
  sliceKey,
  SOLVER_QUANTUM,
} from '@wbs/domain';
import { describe, expect, it } from 'bun:test';

import { buildSolverEdges } from './build-solver-edges';
import { buildSolverRequest } from './build-solver-request';
import { buildSolverSlices, type LeafConstraintMaps } from './build-solver-slices';
import { quantisedFastBaseline } from './quantised-baseline';
import { revalidateSolverResult } from './revalidate-solver-result';
import {
  SOLVER_REQUEST_KEYS,
  SOLVER_SLICE_KEYS,
  type SolverObjectiveValues,
  type SolverOffsetMap,
  type SolverRequest,
  type SolverResponse,
} from './wire-types';

const row = (id: string, position: number, parentId: string | null = null): PlannedRow => ({
  id,
  parentId,
  position,
  frozenNumber: null,
  priority: null,
});

const sliceOf = (
  workItemId: string,
  stepId: string | null,
  days: number | null,
  extra: Partial<Slice> = {},
): Slice => ({ workItemId, stepId, days, personId: null, width: 1, poolIds: [], ...extra });

/** Keys read back with the NUL written as an escape, so a failure prints something. */
const readable = (offsets: SolverOffsetMap): Record<string, number> =>
  Object.fromEntries(Object.entries(offsets).map(([key, at]) => [key.replace('\u0000', '/'), at]));

/**
 * 2.11's fixture, and the one that proves the earlier plan was wrong: three
 * serial slices at `days: 1, width: 5`.
 *
 * 0.2 workdays each, so real Fast finishes at 0.6 workdays = 28.8 units — a
 * number the quantised model cannot hold — while each duration rounds up to 10
 * and the same three slices need 30.
 */
const fiveWide = {
  rows: [row('A', 0)],
  edges: [] as readonly DependencyEdge[],
  slices: [
    sliceOf('A', 'one', 1, { width: 5 }),
    sliceOf('A', 'two', 1, { width: 5 }),
    sliceOf('A', 'three', 1, { width: 5 }),
  ] as readonly Slice[],
};

/**
 * Every constraint the wire carries that the baseline must already satisfy,
 * checked against the request's own projections rather than against this file's
 * arithmetic — which is what "the hint is feasible" means.
 *
 * The edges are `buildSolverEdges`', the durations and floors are
 * `buildSolverSlices`', so a baseline that agreed with a rule written here and
 * disagreed with the one on the wire would still fail.
 */
const infeasibilities = (
  offsets: SolverOffsetMap,
  slices: readonly Slice[],
  leafIds: readonly string[],
  edges: readonly DependencyEdge[],
  leaf: LeafConstraintMaps,
): string[] => {
  const wire = buildSolverSlices(slices, leaf);
  const slicesOf = (leafId: string): readonly Slice[] =>
    slices.filter((slice) => slice.workItemId === leafId);
  const found: string[] = [];
  const at = (key: string): number => {
    // `Object.hasOwn` rather than `=== undefined`: `SolverOffsetMap` indexes to
    // `number`, so the narrowing form is dead to the type checker and eslint
    // deletes it — `buildSolverEdges`' bounds check names the same trap. A
    // missing key would otherwise read as `undefined`, compare false against
    // every bound, and let an absent slice pass as feasible.
    if (!Object.hasOwn(offsets, key)) {
      found.push(`no offset for ${key.replace('\u0000', '/')}`);
      return 0;
    }
    return offsets[key];
  };
  for (const slice of wire) {
    if (at(slice.key) < slice.notBeforeUnits) {
      found.push(`${slice.key.replace('\u0000', '/')} starts before its floor`);
    }
  }
  const durationOf = new Map(wire.map((slice) => [slice.key, slice.durationUnits]));
  for (const edge of buildSolverEdges(leafIds, slicesOf, edges, 'whole-item')) {
    const finish = at(edge.predecessorKey) + (durationOf.get(edge.predecessorKey) ?? 0);
    if (at(edge.successorKey) < finish) {
      found.push(
        `${edge.successorKey.replace('\u0000', '/')} starts before ${edge.predecessorKey.replace('\u0000', '/')} finishes`,
      );
    }
  }
  return found;
};

const noConstraints: LeafConstraintMaps = {
  floors: new Map(),
  deadlines: new Map(),
  weights: new Map(),
};

describe('quantisedFastBaseline', () => {
  it('rounds up to whole units rather than carrying real Fast onto the wire', () => {
    const { rows, edges, slices } = fiveWide;

    // What real Fast actually does, so the fixture proves its own premise
    // rather than restating it. Written as the literals the arithmetic produces
    // and not as 9.6/19.2/28.8: the prefix sum of 0.2 drifts, so converting
    // real Fast would put the second slice at 9.600000000000001 — which is
    // neither an integer NOR the number the plan quotes, and rounding it here
    // would be the quantisation happening in the wrong place, unrecorded.
    const real = schedule(rows, edges, slices);
    expect([...real.slices.values()].map((each) => each.earliestStart * SOLVER_QUANTUM)).toEqual([
      0, 9.600000000000001, 19.200000000000003,
    ]);
    const realFinish =
      Math.max(...[...real.slices.values()].map((each) => each.earliestFinish)) * SOLVER_QUANTUM;
    expect(realFinish).toBeCloseTo(28.8, 10);
    expect(Number.isInteger(realFinish)).toBe(false);

    const offsets = quantisedFastBaseline(rows, edges, slices, new Map(), new Map(), 'whole-item');
    expect(readable(offsets)).toEqual({ 'A/one': 0, 'A/two': 10, 'A/three': 20 });
  });

  it('hands MOVEMENT and the hint whole units on that fixture', () => {
    const { rows, edges, slices } = fiveWide;
    const offsets = quantisedFastBaseline(rows, edges, slices, new Map(), new Map(), 'whole-item');

    // MOVEMENT is `Σ |start(s) − baselineOffsets[s]|` over integer starts, so it
    // is defined as an integer exactly when every baseline offset is one.
    for (const start of Object.values(offsets)) expect(Number.isSafeInteger(start)).toBe(true);
    expect(infeasibilities(offsets, slices, ['A'], edges, noConstraints)).toEqual([]);
  });

  it('is the same key set the request projects, one offset per slice', () => {
    const { rows, edges, slices } = fiveWide;
    const offsets = quantisedFastBaseline(rows, edges, slices, new Map(), new Map(), 'whole-item');
    expect(Object.keys(offsets).sort()).toEqual(
      buildSolverSlices(slices, noConstraints)
        .map((slice) => slice.key)
        .sort(),
    );
  });

  it('takes the placement whole, so a pool the plan cannot widen still serialises it', () => {
    const rows = [row('A', 0), row('B', 1)];
    const slices = [
      sliceOf('A', null, 1, { poolIds: ['team'] }),
      sliceOf('B', null, 1, { poolIds: ['team'] }),
    ];
    // One slot, two whole-day blocks, no dependency between them: only the
    // capacity profile can separate these, and a baseline assembled by summing
    // durations per leaf would put both at zero.
    const offsets = quantisedFastBaseline(
      rows,
      [],
      slices,
      new Map(),
      new Map([['team', 1]]),
      'whole-item',
    );
    expect(readable(offsets)).toEqual({ 'A/': 0, 'B/': SOLVER_QUANTUM });
  });

  it('takes a person queue and a dependency the same way', () => {
    const rows = [row('A', 0), row('B', 1), row('C', 2)];
    const edges: readonly DependencyEdge[] = [{ predecessorId: 'A', successorId: 'C' }];
    const slices = [
      sliceOf('A', null, 1),
      sliceOf('B', null, 2, { personId: 'kat' }),
      sliceOf('C', null, 1, { personId: 'kat' }),
    ];
    // `C` waits for `A` (one day) and for kat (two days); the later wins.
    expect(
      readable(quantisedFastBaseline(rows, edges, slices, new Map(), new Map(), 'whole-item')),
    ).toEqual({ 'A/': 0, 'B/': 0, 'C/': 2 * SOLVER_QUANTUM });
  });

  it('scales a manual floor onto the unit axis, and takes the fold from the tree', () => {
    const rows = [row('parent', 0), row('leaf', 0, 'parent')];
    const slices = [sliceOf('leaf', null, 1)];
    // Declared on the PARENT, so the answer is `leafFloorsOf`'s walk and not a
    // lookup: day 2 begins at unit 96.
    const notBefore = new Map([['parent', 2]]);
    const offsets = quantisedFastBaseline(rows, [], slices, notBefore, new Map(), 'whole-item');
    expect(readable(offsets)).toEqual({ 'leaf/': 2 * SOLVER_QUANTUM });

    // And it is the floor the wire carries, not merely a floor.
    const floors = leafFloorsOf(notBefore, indexTree(rows));
    expect(infeasibilities(offsets, slices, ['leaf'], [], { ...noConstraints, floors })).toEqual(
      [],
    );
  });

  it('keeps a width outside 48 divisors exact rather than drifting on it', () => {
    const rows = [row('A', 0)];
    // 65/6 days over 5 people is exactly 13/6 workdays, which is exactly 104
    // units — the `snapWorkdays` case, where the double arrives as
    // 104.00000000000001 and a bare ceiling would invent a 105th unit.
    const slices = [
      sliceOf('A', 'one', 65 / 6, { width: 5 }),
      sliceOf('A', 'two', 1, { width: 5 }),
    ];
    expect(
      readable(quantisedFastBaseline(rows, [], slices, new Map(), new Map(), 'whole-item')),
    ).toEqual({ 'A/one': 0, 'A/two': 104 });
  });

  it('refuses a slice whose duration has no exact form on the unit axis', () => {
    const rows = [row('A', 0)];
    // `u × w` past 2**53: the product is no longer represented exactly, so
    // `(u × w) / w` is no longer provably `u` and every offset downstream of it
    // is a guess. Refused here, where the slice can still be named.
    const slices = [sliceOf('A', null, 2 ** 52, { width: 1000 })];
    expect(() =>
      quantisedFastBaseline(rows, [], slices, new Map(), new Map(), 'whole-item'),
    ).toThrow(/no exact duration on the unit axis/);
  });
});

/**
 * 2.11's feasibility assertion, and it is deliberately **not** written against
 * {@link infeasibilities}.
 *
 * That helper is this file's own reading of two rules — floors and edges — and
 * it says nothing about pools, people or the variable domain. "The hint is
 * feasible" is a claim about the constraint pass that gates a *published*
 * solver result, and that pass exists: `revalidateSolverResult` is what stands
 * between a wrong solver and a served schedule (2.4). Feeding the baseline back
 * through it is therefore the proof, and it is the only form of the proof that
 * cannot drift from the thing it is protecting — a baseline that satisfied a
 * feasibility rule written here and violated the one on the wire would be
 * refused in production and green in this file.
 *
 * **MOVEMENT is structurally zero and is asserted as such**, because the
 * response's offsets *are* the request's `baselineOffsets`:
 * `Σ |start − baseline|` over a map compared with itself. It is the one term
 * that needs no oracle, and a non-zero value would mean the request carried a
 * baseline other than the one the hint was built from — which is exactly the
 * key-set-and-values divergence `buildSolverRequest` refuses on shape and
 * nobody was checking on value.
 */
describe('the quantised baseline as a solver response', () => {
  /**
   * Deliberately the assembly fixture rather than `fiveWide`: a floor written
   * on a parent, an authored edge, a two-step leaf, a shared pool of two and a
   * person queue. `fiveWide` proves the rounding and reaches none of those, and
   * a feasibility claim checked on a plan with no pool and no person is a claim
   * about a third of the pass.
   */
  const rows: readonly PlannedRow[] = [
    row('P', 0),
    row('A', 0, 'P'),
    { ...row('B', 1, 'P'), priority: 1 },
  ];
  const edges: readonly DependencyEdge[] = [{ predecessorId: 'A', successorId: 'B' }];
  const slices: readonly Slice[] = [
    sliceOf('A', 'design', 2, { poolIds: ['team-x'] }),
    sliceOf('A', 'dev', 4, { poolIds: ['team-x'], width: 2 }),
    sliceOf('B', 'dev', 3, { personId: 'ann' }),
  ];
  const notBefore = new Map([['P', 3]]);
  const poolSizes = new Map([['team-x', 2]]);

  const requestFor = (baselineOffsets: SolverOffsetMap): SolverRequest => {
    const built = buildSolverRequest(
      { rows, edges, slices, notBefore, poolSizes, reach: 'whole-item', deadlines: new Map() },
      'pri',
      { baselineOffsets, solverVersion: '0.1.0', budgetMs: 30_000 },
    );
    if (!built.ok) throw new Error(`expected a request, got ${built.failure}: ${built.detail}`);
    return built.request;
  };

  /**
   * The three cost terms of 5.2 computed from the **request's own** projections
   * — `durationUnits` and `priorityWeight` as `buildSolverSlices` wrote them,
   * never as this file would compute them — so an objective mismatch here is
   * the offsets disagreeing with the arithmetic rather than two readings of a
   * duration disagreeing with each other.
   */
  const valuesFor = (request: SolverRequest, offsets: SolverOffsetMap): SolverObjectiveValues => {
    const term = (value: number) => ({
      value,
      stageValue: value,
      bound: value,
      status: 'feasible' as const,
    });
    const finishOf = (slice: SolverRequest['slices'][number]) =>
      offsets[slice.key] + slice.durationUnits;
    return {
      makespan: term(Math.max(0, ...request.slices.map(finishOf))),
      priority: term(
        request.slices.reduce((sum, slice) => sum + slice.priorityWeight * finishOf(slice), 0),
      ),
      movement: term(
        request.slices.reduce(
          (sum, slice) => sum + Math.abs(offsets[slice.key] - request.baselineOffsets[slice.key]),
          0,
        ),
      ),
    };
  };

  const responseOf = (request: SolverRequest, offsets: SolverOffsetMap): SolverResponse => ({
    wireVersion: 1,
    status: 'feasible',
    offsets,
    objectiveValues: valuesFor(request, offsets),
  });

  it('passes the re-validator that gates a published result, which is what feasible means', () => {
    const baseline = quantisedFastBaseline(rows, edges, slices, notBefore, poolSizes, 'whole-item');
    const request = requestFor(baseline);

    // The hint is what the solver is handed as its starting point, so it is the
    // hint that has to be feasible — asserted equal to the baseline first, so a
    // builder that stopped copying one into the other could not make this test
    // pass by validating the other map.
    expect(request.fastHint).toEqual(baseline);
    expect(revalidateSolverResult(request, responseOf(request, request.fastHint))).toEqual({
      ok: true,
      published: true,
    });
    expect(valuesFor(request, request.fastHint).movement.value).toBe(0);
  });

  it('is a check that can fail: one slice pulled under its predecessor is refused', () => {
    const baseline = quantisedFastBaseline(rows, edges, slices, notBefore, poolSizes, 'whole-item');
    const request = requestFor(baseline);
    // `B/dev` waits on the whole of `A`. Moved back onto the floor it is a
    // legal offset in the variable domain and an illegal one in the graph,
    // which is the distinction the placement rules exist to make — so the
    // refusal below is a dependency verdict rather than a domain one.
    const broken = {
      ...request.fastHint,
      [sliceKey('B', 'dev')]: request.slices[0].notBeforeUnits,
    };
    const result = revalidateSolverResult(request, responseOf(request, broken));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure).toBe('edge-violated');
  });
});

/**
 * 2.11's last clause: the request must **carry** the quantised offsets, checked
 * against the golden corpus rather than against this file's own arithmetic.
 *
 * `request/valid-quantised-baseline.json` is the same three-slice fixture on the
 * wire. A change that made the builder emit real Fast's numbers would still
 * agree with every assertion above — they are all derived from the builder —
 * and would disagree with this file, which is checked in and read as bytes.
 *
 * **The manifest entry beside it is not yet checked by anything in this suite,
 * and that was measured rather than assumed.** `parse-solver-response.test.ts`
 * filters the corpus to `branch === 'response'`, and nothing anywhere filters it
 * to `request`: the request branch's seven fixtures exist for the Python
 * entrypoint's `jsonschema` validation, which is 2.x's and does not exist yet.
 * So the structural check below is `SOLVER_REQUEST_KEYS` and
 * `SOLVER_SLICE_KEYS` — constants `wire-types.test.ts` pins to
 * `solver-wire.v1.json` member for member — rather than a validator this
 * package does not have. It catches a fixture that has drifted from the schema's
 * shape; it does not catch one that has drifted from its value ranges, and
 * saying otherwise would be claiming a gate that is not there.
 */
const golden = JSON.parse(
  readFileSync(
    new URL('../fixtures/request/valid-quantised-baseline.json', import.meta.url),
    'utf8',
  ),
) as SolverRequest;

describe('the quantised baseline the golden request carries', () => {
  it('is what quantisedFastBaseline produces from the plan behind it', () => {
    const { rows, edges, slices } = fiveWide;
    const offsets = quantisedFastBaseline(rows, edges, slices, new Map(), new Map(), 'whole-item');
    expect(offsets).toEqual(golden.baselineOffsets);
    // Never real Fast's, which is the whole of 2.11: 9.600000000000001 is what
    // this entry would hold if the baseline were converted instead of re-run.
    expect(readable(golden.baselineOffsets)['A/two']).toBe(10);
  });

  it('and the projections beside it are the same builders, on the same plan', () => {
    const { slices } = fiveWide;
    const slicesOf = (leafId: string): readonly Slice[] =>
      slices.filter((slice) => slice.workItemId === leafId);
    expect(buildSolverSlices(slices, noConstraints)).toEqual(golden.slices);
    expect(buildSolverEdges(['A'], slicesOf, [], 'whole-item')).toEqual(golden.edges);
  });

  it('is shaped like the request the schema defines, member for member', () => {
    expect(Object.keys(golden).sort()).toEqual([...SOLVER_REQUEST_KEYS].sort());
    for (const slice of golden.slices) {
      expect(Object.keys(slice).sort()).toEqual([...SOLVER_SLICE_KEYS].sort());
    }
  });

  it('satisfies the three cross-field invariants JSON Schema cannot state', () => {
    // (1) fastHint and baselineOffsets are equal AS MAPS — the wire carries two
    // copies of one value and the schema cannot say they agree.
    expect(golden.fastHint).toEqual(golden.baselineOffsets);
    // (2) key-set equality with slices[].key, no extra and no missing.
    const keys = golden.slices.map((slice) => slice.key).sort();
    expect(Object.keys(golden.baselineOffsets).sort()).toEqual(keys);
    expect(Object.keys(golden.fastHint).sort()).toEqual(keys);
    // (3) every offset within the horizon. 30 is the quantised finish; real
    // Fast's 28.8 would fit too, which is why (1) and the assertion above are
    // what actually pin the numbers.
    for (const offset of Object.values(golden.baselineOffsets)) {
      expect(offset).toBeLessThanOrEqual(golden.horizonUnits);
    }
  });
});
