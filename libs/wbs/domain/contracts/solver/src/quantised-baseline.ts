import {
  type DependencyEdge,
  type DependencyReach,
  durationUnits,
  type Elsewhere,
  expandToLeaves,
  groupSlicesByLeaf,
  indexTree,
  leafFloorsOf,
  leavesUnderOf,
  type PlannedRow,
  type PoolSizes,
  schedule,
  type Slice,
  sliceKey,
  SOLVER_QUANTUM,
  type TypedDependency,
} from '@wbs/domain';

import { buildSolverEdges } from './build-solver-edges';
import { elsewhereUnitsOf, notBeforeUnitsOf } from './solver-units';
import type { SolverElsewhere, SolverOffsetMap } from './wire-types';

/**
 * Fast's placement re-run over rounded durations, in integer solver units.
 * An FF edge whose real-materialization bound exceeds the integer finish bound
 * can invalidate that pass. In that case a serial topological placement supplies
 * a feasible integer reference; Python checks it against deadlines before it
 * installs any hint or objective bound.
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
 * The common path re-runs `schedule()` with rescaled input, preserving Fast's
 * placement rules. The exceptional serial path exists only when that schedule
 * violates the extra FF weight that real durations require.
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
 * Deadlines do not enter this placement call. Rounding can make a real plan
 * miss a deadline only in the integer model (49 slices of 0.02 day need 49
 * units, though real Fast finishes before day 1). Python probes the complete
 * model before installing this map as a hint or objective bound. A missed
 * deadline here is never a certificate that the real plan is infeasible.
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
  /** The typed dependencies; required, so the baseline cannot drop one the request carries. */
  typed: readonly TypedDependency[],
  /**
   * Bookings elsewhere in workdays; absent for a plan nothing outranks. The
   * baseline is placed around the same unit intervals the request carries
   * ({@link elsewhereUnitsOf}), so it is feasible against them.
   */
  elsewhere?: Elsewhere,
): SolverOffsetMap {
  const away = elsewhereUnitsOf(elsewhere);
  const placed = schedule(
    rows,
    edges,
    slices.map(onTheUnitAxis),
    scaleFloors(notBefore),
    poolSizes,
    reach,
    // No deadlines, as before typed dependencies took the eighth slot: the
    // The common-path baseline is the unit-axis Fast placement.
    new Map(),
    typed,
    undefined,
    // Proof: `undefined` here made `places the baseline around the bookings
    // the request carries` (`quantised-baseline.test.ts`) put Ann's slice on
    // her booking; watched 2026-09-29.
    onTheUnitAxisAway(away),
  );

  const offsets: Record<string, number> = {};
  for (const [key, slice] of placed.slices) {
    const { earliestStart } = slice;
    // The second net, and MEASURED to be the second rather than assumed to be
    // the first: with the rounding dropped from `onTheUnitAxis` — real
    // durations on the unit axis — four of this file's tests fail, and every
    // one of them fails at that function's product guard, `slice A is
    // 9.600000000000001 units across 5 people`. An unrounded duration is
    // caught before the placement runs, because a fractional duration times a
    // width is not a safe integer either. So this check is not what makes the
    // rescale exact; it is what stops a PLACEMENT that somehow produced a
    // fractional start from putting it on the wire as a `type: integer`
    // violation of a request Bun itself wrote, to be diagnosed there as a
    // malformed request. Safe-integer rather than `Number.isInteger` because
    // the objective sums these and `2**53` is where a sum stops being able to
    // tell two offsets apart. `sliceKey`'s NUL is written as an ESCAPE below
    // and never typed — a literal one makes git call the file binary, and this
    // package has walked into that twice.
    if (!Number.isSafeInteger(earliestStart) || earliestStart < 0) {
      throw new Error(
        `quantised baseline put slice ${key.replace('\u0000', '/')} at ${String(earliestStart)}, which is not a whole unit offset`,
      );
    }
    offsets[key] = earliestStart;
  }
  const index = indexTree(rows);
  const grouped = groupSlicesByLeaf(index.leafIds, slices);
  const slicesOf = (leafId: string): readonly Slice[] => {
    const own = grouped.get(leafId);
    if (own === undefined) throw new Error(`no slice for work item ${leafId}`);
    return own;
  };
  const wireEdges = buildSolverEdges(index.leafIds, slicesOf, expandToLeaves(index, edges), reach, {
    dependencies: typed,
    leavesUnder: leavesUnderOf(index),
  });
  const durationByKey = new Map(
    slices.map((slice) => [sliceKey(slice.workItemId, slice.stepId), durationUnits(slice)]),
  );
  const violatesFF = wireEdges.some(
    (edge) =>
      edge.type === 'FF' &&
      offsets[edge.successorKey] < offsets[edge.predecessorKey] + edge.startWeightUnits,
  );
  // Proof: returning the raw rounded Fast offsets here put the 0.030/0.021
  // FF successor at unit 0; the focused baseline test observed 12 pass / 1 fail.
  if (!violatesFF) return offsets;

  // The rounded Fast pass can miss the extra FF unit. A serial topological
  // placement is a conservative feasible hint: it satisfies every typed edge,
  // person and pool capacity, including zero-duration precedence nodes.
  // Python separately checks deadlines before installing the hint or bound.
  const pending = new Map<string, number>(Object.keys(offsets).map((key) => [key, 0]));
  const outgoing = new Map<string, (typeof wireEdges)[number][]>();
  for (const edge of wireEdges) {
    pending.set(edge.successorKey, (pending.get(edge.successorKey) ?? 0) + 1);
    const own = outgoing.get(edge.predecessorKey) ?? [];
    own.push(edge);
    outgoing.set(edge.predecessorKey, own);
  }
  const floors = leafFloorsOf(notBefore, index);
  const byKey = new Map(slices.map((slice) => [sliceKey(slice.workItemId, slice.stepId), slice]));
  const ready = [...pending]
    .filter(([, count]) => count === 0)
    .map(([key]) => key)
    .sort();
  const serial: Record<string, number> = {};
  const predecessorBounds = new Map<string, number>();
  // The serial hint starts after the last booking elsewhere: from there it
  // is clear of every one, whoever holds them.
  let cursor = Math.max(0, ...Object.values(away).flatMap((held) => held.map(([, end]) => end)));
  while (ready.length > 0) {
    const key = ready.shift();
    if (key === undefined) throw new Error('ready slice disappeared');
    const slice = byKey.get(key);
    const duration = durationByKey.get(key);
    if (slice === undefined || duration === undefined) throw new Error(`no canonical slice ${key}`);
    // Proof: omitting the predecessor bound left the 5e-10-day FF predecessor
    // and unknown successor at the same unit; the focused baseline test failed.
    const start = Math.max(
      cursor,
      notBeforeUnitsOf(floors, slice.workItemId),
      predecessorBounds.get(key) ?? 0,
    );
    serial[key] = start;
    cursor = start + duration;
    for (const edge of outgoing.get(key) ?? []) {
      const weight = edge.type === 'FF' ? edge.startWeightUnits : edge.type === 'FS' ? duration : 0;
      predecessorBounds.set(
        edge.successorKey,
        Math.max(predecessorBounds.get(edge.successorKey) ?? 0, start + weight),
      );
      const remaining = pending.get(edge.successorKey);
      if (remaining === undefined) throw new Error(`no successor slice ${edge.successorKey}`);
      pending.set(edge.successorKey, remaining - 1);
      if (remaining === 1) ready.push(edge.successorKey);
    }
    ready.sort();
  }
  if (Object.keys(serial).length !== slices.length) throw new Error('cyclic solver slice graph');
  return serial;
}

/**
 * One slice as the rescaled run sees it: the same block, its duration rounded up
 * to whole units and restated as an estimate on the unit axis.
 *
 * `personId`, `poolIds` and `width` are carried over untouched — they are who,
 * where and how many, none of which the axis change touches — and `stepId` with
 * them, because the key the offset is returned under is built from it.
 *
 * `days` is synthesised, so a slice nobody estimated arrives here as an
 * explicit zero — {@link durationUnits} of an unknown length. That is the
 * intended reading and not a leak: zero is already the schedule time the real
 * placement used, and the rescaled schedule's `estimated` flag is read by
 * nobody — this function returns starts.
 */
function onTheUnitAxis(slice: Slice): Slice {
  const units = durationUnits(slice);
  const days = units * slice.width;
  // The exactness of `(u × w) / w` is conditional on this product being
  // representable, and everything downstream — integer offsets, an integer
  // MOVEMENT, a hint CP-SAT can hold — rests on that exactness. A plan this big
  // is refused before it can be silently mis-scheduled instead.
  //
  // It is also, measured, the guard that catches the rounding going missing at
  // all: with `durationUnits` swapped for the real duration, this throws on
  // `9.600000000000001 units across 5 people` before any slice is placed, and
  // four of this file's tests go red there. A fraction times a width is not a
  // safe integer, so the two faults arrive at the same door.
  if (!Number.isSafeInteger(days)) {
    throw new Error(
      `slice ${slice.workItemId} is ${String(units)} units across ${String(slice.width)} people, which has no exact duration on the unit axis`,
    );
  }
  return { ...slice, days };
}

/**
 * The request's unit intervals as an {@link Elsewhere} on the unit axis, for
 * the rescaled placement. Merging made the holders unrecoverable, and the
 * baseline reads starts only, so each interval names a placeholder holder.
 */
function onTheUnitAxisAway(away: SolverElsewhere): Elsewhere {
  return new Map(
    Object.entries(away).map(([personId, intervals]) => [
      personId,
      intervals.map(([start, end], at) => ({
        start,
        end,
        projectId: 'elsewhere',
        workItemId: `${personId}#${String(at)}`,
      })),
    ]),
  );
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
