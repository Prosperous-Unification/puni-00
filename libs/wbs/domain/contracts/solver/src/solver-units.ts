import {
  durationOf,
  durationUnits,
  type Elsewhere,
  type Slice,
  SOLVER_QUANTUM,
  withinDrift,
} from '@wbs/domain';

import type { SolverElsewhere } from './wire-types';

/**
 * The FF start bound protects real finish order after integer placement.
 * Ceiling the unsnapped difference is conservative even when two canonical
 * durations differ by less than the duration quantiser's drift window.
 * The integer finish bound remains independently active.
 */
export function ffStartWeightUnits(predecessor: Slice, successor: Slice): number {
  const integerFinishWeight = durationUnits(predecessor) - durationUnits(successor);
  const realFinishWeight = Math.ceil(
    SOLVER_QUANTUM * (durationOf(predecessor) - durationOf(successor)),
  );
  if (!Number.isSafeInteger(realFinishWeight)) {
    throw new Error(`FF relationship has no safe integer start weight`);
  }
  // Proof: restoring the snap made the 0.03+1e-12/0.03 production request
  // emit weight 0 and the upper fractional-unit round trip emit 1 instead of 2.
  // Proof: replacing this max with integerFinishWeight made the 0.030/0.021
  // baseline test fail (B=0, expected >=1) and forgery test accept weight 0;
  // observed 56 pass / 2 fail, then restored.
  return Math.max(integerFinishWeight, realFinishWeight);
}

/**
 * The two calendar constraints converted from whole workdays into the solver's
 * integer unit axis — the last step before either reaches the wire.
 *
 * They are separated from the folds that produce them (`leafFloorsOf`,
 * `leafDeadlinesOf` in `@wbs/domain`) because the folds are Fast's own rules
 * and are shared with the placement, while the conversions below exist only
 * because CP-SAT places integers. Nothing in the domain has an opinion about
 * `SOLVER_QUANTUM`'s arithmetic; nothing here has an opinion about which
 * ancestor binds.
 *
 * **This module opens `libs/wbs/domain/contracts` → `@wbs/domain`, which did not exist
 * before 2026-09-03.** It is a deliberate boundary decision rather than a side
 * effect, and it is the one the design already required: the request builder
 * lives in `libs/wbs/domain/contracts/solver/src/` and Bun owns duration and graph
 * derivation, so it must read the domain's seams rather than restate them. The
 * tag constraints permit it — both libraries are `scope:shared` +
 * `runtime:isomorphic`. Worth knowing while reading:
 * `@nx/enforce-module-boundaries` is **skipped** in the gate this repository
 * runs (`No cached ProjectGraph is available`), so it would not have caught a
 * bad edge, and this one is argued rather than lint-approved.
 */

/**
 * A leaf's floor on the solver's axis: whole workdays × {@link SOLVER_QUANTUM}.
 *
 * Absence is day zero, which is what an unconstrained leaf means and what
 * `leafFloorsOf` says by omitting it. Reading it here rather than making the
 * builder remember `?? 0` keeps the default beside the conversion.
 *
 * A floor is a **start** bound, so it converts straight: day `N` begins at unit
 * `N × quantum`. This is the half that needs no `+ 1`, and it is written beside
 * the one that does for exactly that reason.
 */
export function notBeforeUnitsOf(floors: ReadonlyMap<string, number>, leafId: string): number {
  return (floors.get(leafId) ?? 0) * SOLVER_QUANTUM;
}

/**
 * A leaf's effective deadline on the solver's axis, or `null` for unconstrained.
 *
 * **`(D + 1) × quantum`, and the `+ 1` is the whole of its correctness.** A
 * deadline names a day the work must be *finished within*, inclusive — "due on
 * the 12th" is satisfied by work that runs to the end of the 12th. The solver
 * bounds a finish *instant*, and the last instant of day `D` is the first
 * instant of day `D + 1`. Converting `D × quantum` instead would silently
 * require the work to be finished by the **start** of its own due day, losing a
 * whole workday on every deadline in the plan and making a one-day task due the
 * day it starts infeasible.
 *
 * So the returned number is an **exclusive** upper bound on the finish, which
 * is the form CP-SAT wants and the form `deadlineUnits` is documented as on the
 * wire.
 *
 * `null` rather than a large sentinel: an unstated deadline is the absence of a
 * bound, not a distant one, and `leafDeadlinesOf` deliberately omits such a
 * leaf rather than seeding it. A sentinel here would put a constraint in the
 * model that nobody authored and that no error message could attribute.
 */
export function deadlineUnitsOf(
  deadlines: ReadonlyMap<string, number>,
  leafId: string,
): number | null {
  const day = deadlines.get(leafId);
  return day === undefined ? null : (day + 1) * SOLVER_QUANTUM;
}

/**
 * One instant of a booking on the solver's axis, rounded the conservative way:
 * a start down and an end up, so the unit interval always covers the booking.
 * A value within {@link withinDrift} of a whole unit is that unit, so a
 * booking ending on day 2 by way of `2.0000000000000004` does not take a
 * spurious 97th unit.
 */
function unitOf(workdays: number, round: (value: number) => number): number {
  const scaled = workdays * SOLVER_QUANTUM;
  const whole = Math.round(scaled);
  return withinDrift(scaled, whole) ? whole : round(scaled);
}

/**
 * Each person's bookings elsewhere on the solver's axis, as wire 3 carries
 * them (`#/$defs/request.properties.elsewhere`).
 *
 * **Conservative, never tighter than the booking**: each interval is widened
 * to whole units (start floored, end ceiled), clamped at unit 0 — nothing is
 * placed before it — and dropped when it ends there. Widening can make two
 * bookings of one person overlap on the unit axis, so overlapping intervals are
 * merged; touching ones stay apart, since occupancy is half-open. A placement
 * clear of these units is therefore clear of the real bookings, which is what
 * lets the materialiser place an optimized answer around the real bookings
 * without a second, finer check.
 *
 * Persons are emitted in byte order, so one plan has one request.
 *
 * @throws when a unit is not a safe integer: the wire says so, and a booking
 * past `2**53` units is a broken caller, never a plan.
 */
export function elsewhereUnitsOf(elsewhere: Elsewhere | undefined): SolverElsewhere {
  const units: Record<string, [number, number][]> = {};
  const people = [...(elsewhere ?? new Map<string, never[]>())].sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  for (const [personId, bookings] of people) {
    const merged: [number, number][] = [];
    for (const booking of bookings) {
      const start = Math.max(0, unitOf(booking.start, Math.floor));
      const end = unitOf(booking.end, Math.ceil);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
        throw new Error(`booking elsewhere for ${personId} has no safe integer unit interval`);
      }
      if (end <= start) continue;
      const last = merged.at(-1);
      // Proof: merging only when strictly contained made `merges bookings the
      // rounding made overlap` (`solver-units.test.ts`) emit two overlapping
      // intervals; watched 2026-09-29.
      if (last !== undefined && start < last[1]) last[1] = Math.max(last[1], end);
      else merged.push([start, end]);
    }
    if (merged.length > 0) units[personId] = merged;
  }
  return units;
}
