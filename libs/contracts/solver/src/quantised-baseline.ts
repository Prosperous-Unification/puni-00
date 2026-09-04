import {
  type DependencyEdge,
  type DependencyReach,
  durationUnits,
  type PlannedRow,
  type PoolSizes,
  schedule,
  type Slice,
  SOLVER_QUANTUM,
} from '@wbs/domain';

import type { SolverOffsetMap } from './wire-types';

/**
 * Fast's own placement re-run over the **rounded** durations, in integer solver
 * units — the request's `baselineOffsets`, and the same map again as `fastHint`.
 *
 * **Real Fast's answer is not a legal answer to the question the solver is
 * asked**, and that is the whole reason this exists. Three serial slices at
 * `days: 1, width: 5` are 0.2 workdays each; Fast finishes them at 0.6 workdays,
 * which is 28.8 units, and 28.8 is not a value any CP-SAT variable can hold.
 * Rounding each duration up to 10 units makes the same three slices need 30.
 * Feeding real Fast's 28.8 in as stage 1's upper bound would hand the search a
 * bound its own arithmetic cannot meet, and the hint would be infeasible in the
 * very model it hints. So the baseline is re-derived in the quantised model
 * rather than converted from the real one.
 *
 * **It re-runs `schedule()` rather than reimplementing the placement.** The
 * baseline has to be Fast's answer — same eligibility ranking, same person
 * queues, same pool windows, same tie-breaks — and a second placement written
 * to agree with that one is a divergence waiting for either to be edited. What
 * is rescaled is the *input*, so the pass itself is untouched and unaware.
 *
 * ## The rescale, and why it is exact
 *
 * `schedule()`'s time axis is workdays and its durations come from
 * `durationOf` = `days / width`. Multiplying that axis by {@link SOLVER_QUANTUM}
 * turns one unit into one "day", and on that axis the duration owed is
 * `durationUnits(slice)` — an integer. So each slice is handed over with
 * `days = durationUnits(slice) × width` and its width untouched, and
 * `durationOf` gives `(u × w) / w`.
 *
 * That is **exactly** `u`, not `u` to within a rounding: `u × w` is an integer
 * product of integers, so where it is a safe integer it is represented with no
 * error at all, the real quotient is `u`, `u` is representable, and IEEE-754
 * division is correctly rounded — the only representable value it may return is
 * the exact one. The safe-integer condition is therefore load bearing and is
 * checked rather than assumed. It is also not close: `horizonUnits` is refused
 * above `2**31 - 1` (2.10) and a width is at most 1000, so a plan that reaches
 * here at all is bounded by about `2**41`.
 *
 * Width is people and a pool size is slots — both dimensionless — so neither
 * scales, and the capacity profile bounds the rescaled run exactly as it bounds
 * the real one. Floors are the one other calendar quantity, and they scale by
 * the same constant. The **fold** stays inside `schedule()`: `leafFloorsOf`
 * takes each leaf's own floor and its ancestors' as a maximum, and
 * `max(k·a, k·b) === k·max(a, b)` for `k > 0`, so scaling the map before the
 * fold and scaling the fold's answer are the same number. One walk, still the
 * domain's.
 *
 * Deadlines are deliberately absent: they constrain the solver, not Fast, and
 * this is Fast's schedule. A plan whose quantised baseline misses a deadline is
 * a plan whose *real* baseline missed it too — that is 4.11b's comparison and
 * 3.1's `plan-infeasible`, and pretending otherwise here would make the
 * baseline a different schedule from the one the guard measures against.
 *
 * ## What the caller gets
 *
 * One offset per slice, keyed by `sliceKey`, with the same key set
 * `buildSolverSlices` projects — both walk the same `groupSlicesByLeaf`
 * grouping, which refuses a slice that is not a leaf's, and `schedule()` refuses
 * a leaf with no slice. Every value is a non-negative safe integer, checked
 * below rather than promised.
 *
 * Throws whatever `schedule()` throws, `ScheduleCycleError` included: a plan Fast
 * cannot schedule has no baseline to hint with, and inventing one would be
 * answering for a plan nobody has.
 */
export function quantisedFastBaseline(
  rows: readonly PlannedRow[],
  edges: readonly DependencyEdge[],
  slices: readonly Slice[],
  notBefore: ReadonlyMap<string, number>,
  poolSizes: PoolSizes,
  reach: DependencyReach,
): SolverOffsetMap {
  const placed = schedule(
    rows,
    edges,
    slices.map(onTheUnitAxis),
    scaleFloors(notBefore),
    poolSizes,
    reach,
  );

  const offsets: Record<string, number> = {};
  for (const [key, slice] of placed.slices) {
    const { earliestStart } = slice;
    // The one thing the rescale is for. A start that is not a whole unit means
    // some duration reached the placement unrounded, and the offset would go to
    // the wire as a `type: integer` violation of a request Bun itself wrote —
    // diagnosed there as a malformed request rather than here as the rescale
    // coming apart. Safe-integer rather than `Number.isInteger` because the
    // objective sums these and `2**53` is where a sum stops being able to tell
    // two offsets apart. `sliceKey`'s NUL is written as an ESCAPE below and
    // never typed — a literal one makes git call the file binary, and this
    // package has walked into that twice.
    if (!Number.isSafeInteger(earliestStart) || earliestStart < 0) {
      throw new Error(
        `quantised baseline put slice ${key.replace('\u0000', '/')} at ${String(earliestStart)}, which is not a whole unit offset`,
      );
    }
    offsets[key] = earliestStart;
  }
  return offsets;
}

/**
 * One slice as the rescaled run sees it: the same block, its duration rounded up
 * to whole units and restated as an estimate on the unit axis.
 *
 * `personId`, `poolIds` and `width` are carried over untouched — they are who,
 * where and how many, none of which the axis change touches — and `stepId` with
 * them, because the key the offset is returned under is built from it.
 *
 * `days` is synthesised, so a slice nobody estimated arrives here estimated,
 * carrying {@link durationUnits}' fold of `ASSUMED_SLICE_WORKDAYS`. That is the
 * intended reading and not a leak: the assumption is already the duration the
 * real placement used, `durationUnits` is the one function that folds it, and
 * the rescaled schedule's `estimated` flag is read by nobody — this function
 * returns starts.
 */
function onTheUnitAxis(slice: Slice): Slice {
  const units = durationUnits(slice);
  const days = units * slice.width;
  // The exactness of `(u × w) / w` is conditional on this product being
  // representable, and everything downstream — integer offsets, an integer
  // MOVEMENT, a hint CP-SAT can hold — rests on that exactness. A plan this big
  // is refused before it can be silently mis-scheduled instead.
  if (!Number.isSafeInteger(days)) {
    throw new Error(
      `slice ${slice.workItemId} is ${String(units)} units across ${String(slice.width)} people, which has no exact duration on the unit axis`,
    );
  }
  return { ...slice, days };
}

/**
 * The manual floors on the unit axis: day `N` begins at unit `N × quantum`.
 *
 * The same conversion `notBeforeUnitsOf` performs for the wire, and deliberately
 * the same constant, because the baseline must be feasible against the floors
 * the request actually carries. It is applied to the caller's **unfolded** map
 * — the fold is a maximum and commutes with the scale, so `schedule()` keeps
 * doing its own walk over the tree.
 */
function scaleFloors(notBefore: ReadonlyMap<string, number>): Map<string, number> {
  const scaled = new Map<string, number>();
  for (const [workItemId, day] of notBefore) scaled.set(workItemId, day * SOLVER_QUANTUM);
  return scaled;
}
