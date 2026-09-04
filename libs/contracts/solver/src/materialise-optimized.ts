import {
  type DependencyEdge,
  type DependencyReach,
  type PlannedRow,
  type PoolSizes,
  schedule,
  type Schedule,
  ScheduleInvalidOptimizedStartError,
  type Slice,
  SOLVER_QUANTUM,
} from '@wbs/domain';

import type { SolverOffsetMap } from './wire-types';

/**
 * The solver's answer, materialised into a real schedule — 4.11's wiring, and
 * the exact inverse of {@link quantisedFastBaseline}.
 *
 * The baseline turns Fast's workday axis into whole solver units so a hint can
 * go on the wire; this turns the units the solver answers in back into
 * workdays and hands them to `schedule()` as pinned starts. The two live beside
 * each other on purpose: the quantum is the only fact either one knows that the
 * domain does not, and a second file that also divided by it would be the copy
 * that disagreed after an edit.
 *
 * ## Why this is not in `libs/domain`
 *
 * `schedule()` already takes `pinnedStarts` and is the ONE placement pass —
 * 4.9's whole point. What this adds is the boundary between a wire answer and
 * that parameter: the unit conversion, and the two refusals below. Adding it as
 * a second `libs/domain` entry point would put the wire's units inside the
 * engine, which is the direction the quantum is deliberately kept out of.
 *
 * ## What it refuses, and what it deliberately does not
 *
 * A pinned start that the plan itself rejects — before a floor, or inside a
 * full pool — is `schedule()`'s refusal and stays there, as is a slice the map
 * carries no offset for. All three raise
 * {@link ScheduleInvalidOptimizedStartError}, which the caller already maps
 * onto the `invalid-output` disposition and falls back to Fast for, so a
 * malformed answer and an infeasible one reach the caller as one thing.
 *
 * Two refusals are this boundary's own, because `schedule()` cannot make them:
 *
 * - **An offset that is not a whole non-negative unit.** The wire parser checks
 *   this on a parsed response, but this function is also the path a *hint* or a
 *   re-materialisation takes, and dividing 24.5 by the quantum yields a start
 *   half a unit off the axis every other start is on — a placement nothing in
 *   the model could have produced, silently accepted as a plan.
 * - **An offset key naming no slice in this plan.** `schedule()` refuses a
 *   slice with no offset and cannot refuse the converse: `pinnedStarts` is read
 *   through the node list, so a surplus key is invisible to it. A solver answer
 *   carrying a key this plan has no slice for answered a different question —
 *   most likely a stale plan's — and the starts it did return are not
 *   trustworthy either.
 *
 * The surplus check runs **after** the placement rather than before it, which
 * costs a wasted pass on a malformed answer and buys the exactness that matters:
 * the legal key set is the node set `schedule()` itself built, so comparing
 * against `placed.slices` cannot drift from it. Deriving the same set here would
 * be a second copy of the leaf grouping and the leaf refusal.
 *
 * ## The one thing this does NOT yet answer
 *
 * `offset / SOLVER_QUANTUM` is a single correctly-rounded IEEE division, so it
 * is the nearest double to the exact rational — but the floors it is compared
 * against are Fast's own accumulated `days / width` arithmetic, and `pinFloor`
 * compares them with `===` and `<`. A floor whose exact value is a unit
 * multiple but whose double drifted a ulp above it would make a perfectly
 * feasible pin read as "before its floor" and throw. That hazard is real,
 * bounded to about a ulp, and NOT closed here: it needs its own fixture and its
 * own watched red, and `snapWorkdays`' 1e-9 window is the tool for it. Written
 * down rather than smoothed over.
 */
export function materialiseOptimized(
  rows: readonly PlannedRow[],
  edges: readonly DependencyEdge[],
  slices: readonly Slice[],
  notBefore: ReadonlyMap<string, number>,
  poolSizes: PoolSizes,
  reach: DependencyReach,
  offsets: SolverOffsetMap,
): Schedule {
  const pinnedStarts = new Map<string, number>();
  for (const [key, offset] of Object.entries(offsets)) {
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new ScheduleInvalidOptimizedStartError(
        key,
        `${String(offset)} is not a whole non-negative unit offset`,
      );
    }
    pinnedStarts.set(key, offset / SOLVER_QUANTUM);
  }

  const placed = schedule(rows, edges, slices, notBefore, poolSizes, reach, pinnedStarts);

  for (const key of pinnedStarts.keys()) {
    if (!placed.slices.has(key)) {
      throw new ScheduleInvalidOptimizedStartError(
        key.replace('\u0000', '/'),
        'this plan has no such slice',
      );
    }
  }

  return placed;
}
