import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'bun:test';

import { revalidateSolverResult } from './revalidate-solver-result';
import type {
  SolverObjectiveValues,
  SolverRequest,
  SolverResponse,
  SolverSlice,
} from './wire-types';

/**
 * 2.5's re-validation half. Every violation 2.4's placement rules name gets one
 * case, and each of them is paired with the nearest legal neighbour — a floor
 * met exactly, an edge met exactly, a pool filled exactly — because a check
 * that rejects the violation and its neighbour alike is a check that has not
 * been aimed.
 */

const slice = (over: Partial<SolverSlice> & { key: string }): SolverSlice => ({
  durationUnits: 10,
  width: 1,
  personId: null,
  poolIds: ['team'],
  priorityWeight: 0,
  notBeforeUnits: 0,
  deadlineUnits: null,
  ...over,
});

const request = (over: Partial<SolverRequest> = {}): SolverRequest => ({
  wireVersion: 1,
  contractVersion: '7+0.1.0',
  solverVersion: '0.1.0',
  objective: 'pri',
  budgetMs: 30_000,
  stageBudgetSplit: [0.6, 0.25, 0.15],
  quantum: 48,
  horizonUnits: 100,
  slices: [slice({ key: 'a' }), slice({ key: 'b' })],
  edges: [],
  pools: { team: 2 },
  baselineOffsets: { a: 0, b: 0 },
  fastHint: { a: 0, b: 0 },
  ...over,
});

const TERM = { value: 0, stageValue: 0, bound: 0, status: 'feasible' } as const;
const VALUES: SolverObjectiveValues = { makespan: TERM, priority: TERM, movement: TERM };

const feasible = (offsets: Record<string, number>): SolverResponse => ({
  wireVersion: 1,
  status: 'feasible',
  offsets,
  objectiveValues: VALUES,
});

const rejects = (
  result: ReturnType<typeof revalidateSolverResult>,
  failure: string,
): void => {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.failure).toBe(failure as never);
};

describe('revalidateSolverResult accepts', () => {
  it('a schedule that meets every placement rule', () => {
    const result = revalidateSolverResult(request(), feasible({ a: 0, b: 0 }));
    expect(result).toEqual({ ok: true, published: true });
  });

  it('a non-publishing response with nothing checked', () => {
    for (const status of ['infeasible', 'unknown'] as const) {
      const result = revalidateSolverResult(request(), { wireVersion: 1, status });
      // `published: false` is the point: the response is acceptable AND there is
      // no plan, and a caller that reads `ok` alone would publish nothing at all.
      expect(result).toEqual({ ok: true, published: false });
    }
  });
});

describe('revalidateSolverResult refuses the request it cannot judge', () => {
  it('a duplicate slice key', () => {
    const twice = request({ slices: [slice({ key: 'a' }), slice({ key: 'a' })] });
    rejects(revalidateSolverResult(twice, feasible({ a: 0 })), 'malformed-request');
  });

  it('an edge naming a slice that does not exist', () => {
    const dangling = request({ edges: [{ predecessorKey: 'a', successorKey: 'ghost' }] });
    rejects(revalidateSolverResult(dangling, feasible({ a: 0, b: 0 })), 'malformed-request');
  });

  it('a pool membership with no capacity', () => {
    const unfunded = request({ pools: {} });
    rejects(revalidateSolverResult(unfunded, feasible({ a: 0, b: 0 })), 'malformed-request');
  });
});

describe('revalidateSolverResult checks the offset map', () => {
  it('rejects an offset map that omits a slice', () => {
    rejects(revalidateSolverResult(request(), feasible({ a: 0 })), 'offset-key-mismatch');
  });

  it('rejects an offset map that carries a slice the request never sent', () => {
    rejects(
      revalidateSolverResult(request(), feasible({ a: 0, b: 0, c: 0 })),
      'offset-key-mismatch',
    );
  });

  it('rejects a fractional, negative, or past-horizon offset (2.9)', () => {
    for (const offset of [0.5, -1, 101]) {
      rejects(revalidateSolverResult(request(), feasible({ a: offset, b: 0 })), 'offset-domain');
    }
  });

  it('accepts an offset sitting exactly on the horizon', () => {
    expect(revalidateSolverResult(request(), feasible({ a: 100, b: 0 })).ok).toBe(true);
  });
});

describe('revalidateSolverResult checks floors and edges', () => {
  it('rejects a slice starting before its floor, and accepts one starting on it', () => {
    const floored = request({ slices: [slice({ key: 'a', notBeforeUnits: 5 }), slice({ key: 'b' })] });
    rejects(revalidateSolverResult(floored, feasible({ a: 4, b: 0 })), 'floor-violated');
    expect(revalidateSolverResult(floored, feasible({ a: 5, b: 0 })).ok).toBe(true);
  });

  it('rejects a successor starting before its predecessor finishes', () => {
    const chained = request({ edges: [{ predecessorKey: 'a', successorKey: 'b' }] });
    rejects(revalidateSolverResult(chained, feasible({ a: 0, b: 9 })), 'edge-violated');
    // The hand-off instant belongs to the successor: occupancy is half-open, so
    // finish == start is met exactly and not a violation by one unit.
    expect(revalidateSolverResult(chained, feasible({ a: 0, b: 10 })).ok).toBe(true);
  });
});

describe('revalidateSolverResult checks capacity', () => {
  it('rejects a pool over capacity and accepts one filled exactly', () => {
    const heavy = request({
      slices: [slice({ key: 'a', width: 2 }), slice({ key: 'b', width: 1 })],
    });
    rejects(revalidateSolverResult(heavy, feasible({ a: 0, b: 0 })), 'pool-overcapacity');
    // Same widths, no shared instant: the release runs before the acquisition.
    expect(revalidateSolverResult(heavy, feasible({ a: 0, b: 10 })).ok).toBe(true);
  });

  it('counts the whole width in EVERY pool a slice names, not just the first', () => {
    // `a` fits `team` and would fit `guild` alone; the overload exists only in
    // the second membership, so a check reading one pool per slice passes here.
    const shared = request({
      pools: { team: 4, guild: 1 },
      slices: [
        slice({ key: 'a', width: 2, poolIds: ['team', 'guild'] }),
        slice({ key: 'b', width: 1, poolIds: ['guild'] }),
      ],
    });
    rejects(revalidateSolverResult(shared, feasible({ a: 0, b: 0 })), 'pool-overcapacity');
  });

  it('rejects a double-booked assignee and accepts consecutive slices', () => {
    const person = request({
      slices: [slice({ key: 'a', personId: 'p-1' }), slice({ key: 'b', personId: 'p-1' })],
    });
    rejects(revalidateSolverResult(person, feasible({ a: 0, b: 5 })), 'assignee-double-booked');
    expect(revalidateSolverResult(person, feasible({ a: 0, b: 10 })).ok).toBe(true);
  });
});

describe('the golden corpus proves the schema cannot answer this question', () => {
  const read = (path: string): unknown =>
    JSON.parse(readFileSync(new URL(`../fixtures/${path}`, import.meta.url), 'utf8'));

  it("rejects the corpus's own schema-valid request and response", () => {
    // `request/valid-two-slices.json` is valid on purpose and draws a width-5
    // slice against a capacity-2 pool; `response/valid-feasible.json` answers it
    // with offsets that satisfy the edge. Both pass their schema branch. The
    // pair is still unpublishable, which is the whole reason 2.4 exists.
    const corpusRequest = read('request/valid-two-slices.json') as SolverRequest;
    const corpusResponse = read('response/valid-feasible.json') as SolverResponse;
    rejects(revalidateSolverResult(corpusRequest, corpusResponse), 'pool-overcapacity');
  });
});
