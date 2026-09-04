import { describe, expect, it } from 'bun:test';

import { preflightSolverRequest } from './solver-preflight';
import { SOLVER_HORIZON_UNITS_MAX, type SolverSlice } from './wire-types';

const sliceOf = (over: Partial<SolverSlice> = {}): SolverSlice => ({
  key: 'k',
  durationUnits: 48,
  width: 1,
  personId: null,
  poolIds: [],
  priorityWeight: 0,
  notBeforeUnits: 0,
  deadlineUnits: null,
  ...over,
});

/**
 * One entry for the one key every slice above carries — the tests below are
 * about the horizon and the priority product, and a baseline of zero leaves
 * MOVEMENT's own worst case at `horizonUnits` per slice, which none of them is
 * near. MOVEMENT gets its own block at the end.
 */
const atZero = { k: 0 };

describe('preflightSolverRequest', () => {
  it('is the SERIAL bound: the latest floor plus every duration', () => {
    const preflight = preflightSolverRequest(
      [
        sliceOf({ durationUnits: 10, notBeforeUnits: 5 }),
        sliceOf({ durationUnits: 7, notBeforeUnits: 100 }),
      ],
      atZero,
    );
    expect(preflight).toEqual({ ok: true, horizonUnits: 117 });
  });

  it('seeds the floor with zero, so a plan with no manual floors has a horizon', () => {
    // The common case: an unseeded max over an empty set has no value.
    expect(preflightSolverRequest([sliceOf({ durationUnits: 3 })], atZero)).toEqual({
      ok: true,
      horizonUnits: 3,
    });
    expect(preflightSolverRequest([], atZero)).toEqual({ ok: true, horizonUnits: 0 });
  });

  it('accepts a horizon exactly at the maximum', () => {
    const preflight = preflightSolverRequest(
      [sliceOf({ durationUnits: SOLVER_HORIZON_UNITS_MAX })],
      atZero,
    );
    expect(preflight).toEqual({ ok: true, horizonUnits: SOLVER_HORIZON_UNITS_MAX });
  });

  it('refuses one unit past it with horizon-overflow', () => {
    const preflight = preflightSolverRequest(
      [sliceOf({ durationUnits: SOLVER_HORIZON_UNITS_MAX }), sliceOf({ durationUnits: 1 })],
      atZero,
    );
    expect(preflight.ok).toBe(false);
    if (preflight.ok) throw new Error('unreachable');
    expect(preflight.failure).toBe('horizon-overflow');
  });

  it('counts a floor toward the horizon, not only the durations', () => {
    const preflight = preflightSolverRequest(
      [sliceOf({ durationUnits: 1, notBeforeUnits: SOLVER_HORIZON_UNITS_MAX })],
      atZero,
    );
    expect(preflight.ok).toBe(false);
    if (preflight.ok) throw new Error('unreachable');
    expect(preflight.failure).toBe('horizon-overflow');
  });

  it('sums in bigint, so the check cannot pass by having already lost precision', () => {
    // Three slices whose Number sum rounds: 2^53 - 1 twice over is not a safe
    // integer, and a Number accumulator would compare a value it had already
    // corrupted. The horizon check must catch this, not the objective one.
    const preflight = preflightSolverRequest(
      [
        sliceOf({ durationUnits: Number.MAX_SAFE_INTEGER }),
        sliceOf({ durationUnits: Number.MAX_SAFE_INTEGER }),
        sliceOf({ durationUnits: 1 }),
      ],
      atZero,
    );
    expect(preflight.ok).toBe(false);
    if (preflight.ok) throw new Error('unreachable');
    expect(preflight.failure).toBe('horizon-overflow');
    expect(preflight.detail).toContain('18014398509481983');
  });

  it('refuses a priority worst case above MAX_SAFE_INTEGER with objective-overflow', () => {
    // Horizon is comfortably legal; the product is not. Weight x horizon is the
    // coefficient the solver would carry, and above MAX_SAFE_INTEGER it stops
    // surviving the round trip through Bun and JSON.
    const preflight = preflightSolverRequest(
      [sliceOf({ durationUnits: 1_000_000_000, priorityWeight: 10_000_000 })],
      atZero,
    );
    expect(preflight.ok).toBe(false);
    if (preflight.ok) throw new Error('unreachable');
    expect(preflight.failure).toBe('objective-overflow');
  });

  it('checks the horizon FIRST, so an over-horizon plan is not misreported', () => {
    // Both bounds are broken here. The horizon is the cause and the objective
    // failure is its consequence; naming the consequence would send a user to
    // their priorities when the plan is simply too long.
    const preflight = preflightSolverRequest(
      [sliceOf({ durationUnits: Number.MAX_SAFE_INTEGER, priorityWeight: 1_000_000 })],
      atZero,
    );
    expect(preflight.ok).toBe(false);
    if (preflight.ok) throw new Error('unreachable');
    expect(preflight.failure).toBe('horizon-overflow');
  });

  it('passes a plan whose weights are all zero, whatever the horizon', () => {
    // Nobody prioritised anything, which is most plans. The product is zero and
    // the objective bound is not in play.
    expect(
      preflightSolverRequest([sliceOf({ durationUnits: SOLVER_HORIZON_UNITS_MAX })], atZero).ok,
    ).toBe(true);
  });
});

describe("preflightSolverRequest's MOVEMENT bound", () => {
  const two = [sliceOf({ key: 'a', durationUnits: 60 }), sliceOf({ key: 'b', durationUnits: 40 })];

  it('accepts a baseline anywhere on the axis', () => {
    // Horizon 100. Worst case is max(b, 100 - b) per slice — 70 and 100 — which
    // is nowhere near MAX_SAFE_INTEGER and must not be refused.
    expect(preflightSolverRequest(two, { a: 30, b: 100 })).toEqual({
      ok: true,
      horizonUnits: 100,
    });
  });

  it('throws on a slice with no baseline, rather than reporting it to a user', () => {
    // The key sets are equal by construction — one grouping produces slices,
    // baselineOffsets and fastHint — so a gap is this package's bug. Every
    // failure token here is a sentence a client shows somebody; this is not one.
    expect(() => preflightSolverRequest(two, { a: 0 })).toThrow(/no baseline offset for slice b/);
  });

  it('cannot overflow below roughly four million slices, which is why no test spends one', () => {
    // Stated as arithmetic rather than as a fixture, because the fixture does
    // not exist: the check runs only after the horizon passed, so every term is
    // at most SOLVER_HORIZON_UNITS_MAX and the sum needs that many terms to
    // reach MAX_SAFE_INTEGER. The guard is therefore against a future horizon
    // bound, not against a plan anybody has — and the honest version of that
    // sentence is this assertion, not a comment.
    const termsNeeded = Math.ceil(Number.MAX_SAFE_INTEGER / SOLVER_HORIZON_UNITS_MAX);
    expect(termsNeeded).toBeGreaterThan(4_000_000);
    expect(SOLVER_HORIZON_UNITS_MAX * 4_000_000).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });
});
