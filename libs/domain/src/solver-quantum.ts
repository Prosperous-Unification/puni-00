import { durationOf, type Slice } from './schedule';
import { snapWorkdays } from './workday';

/**
 * How many integer units the solver's time axis cuts one workday into.
 *
 * CP-SAT places integers. Fast places doubles — `days / width` for every legal
 * width 1–1000 over an arbitrary finite non-negative estimate — so no
 * denominator makes every duration exact and quantisation is a lossy step with
 * a policy rather than a conversion. 48 is a half-hour on an eight-hour day and
 * divides by 2, 3, 4, 6, 8, 12, 16 and 24, which covers every width a plan
 * actually uses; the widths outside that set are the ones {@link durationUnits}
 * rounds.
 *
 * **The direction of the rounding is the whole of its correctness.** Every
 * quantised duration is at or above its real duration and every start is an
 * exact unit multiple, so any schedule feasible in the quantised model is
 * feasible in the real one — no predecessor, floor, assignee or pool constraint
 * can be broken by dividing the offsets back down and materialising them.
 * Quantisation therefore costs optimality and never validity. Rounding down
 * would invert that: the solver would hand back a plan that overlaps a pool the
 * moment it was materialised, and the re-validator would reject the solver's
 * own answer.
 *
 * Covered by `SCHEDULER_CONTRACT_VERSION`, because changing it changes every
 * cached result's meaning and not just its precision.
 */
export const SOLVER_QUANTUM = 48;

/**
 * One slice's duration on the solver's integer axis.
 *
 * `durationOf(slice) × SOLVER_QUANTUM`, **snapped to an exact multiple first
 * and rounded up only if it is genuinely not one.** Both halves are load
 * bearing and they guard opposite directions:
 *
 * - The ceiling is what makes a width outside 48's divisors legal at all. Three
 *   serial slices at `days: 1, width: 5` are 0.2 workdays each, 9.6 units, and
 *   the solver cannot start the second at 9.6.
 * - The snap is what stops the ceiling inventing a unit out of floating-point
 *   residue. `days: 65/6, width: 5` is exactly 13/6 workdays, which is exactly
 *   104 units — but the double arrives as `104.00000000000001`, and a bare
 *   ceiling reads that as 105. That slice would then be a half-hour longer in
 *   the solver's model than in Fast's for no reason anybody could find in the
 *   estimate, and two estimates that are equal as real numbers would quantise
 *   differently depending on which arithmetic produced them.
 *
 * The window is {@link snapWorkdays}' own, which is the point: the drift here is
 * the same accumulated-division drift that function exists for, so borrowing it
 * keeps one 1e-9 window in the domain instead of two that agree until one is
 * edited. It is applied to units rather than to workdays, and deliberately
 * after the multiplication rather than before: `durationOf`'s result is a
 * genuine fraction that must not be snapped (0.2 is not drift), and only the
 * product is supposed to be an integer.
 *
 * Never rounds a real duration down, so {@link SOLVER_QUANTUM}'s feasibility
 * argument holds for every slice.
 */
export function durationUnits(slice: Slice): number {
  return quantise(slice).units;
}

/**
 * Whether {@link durationUnits} had to round this slice up — the per-slice
 * rounding the request records.
 *
 * It exists so the request builder can report the rounding without recomputing
 * it. The alternative is for the builder to multiply and compare against its own
 * drift window, which is this file's arithmetic written a second time in another
 * package, and the second copy would be the one that disagrees after an edit.
 */
export function durationRoundedUp(slice: Slice): boolean {
  return quantise(slice).rounded;
}

/**
 * The single multiplication and the single drift window both exported readers
 * above are answers about.
 */
function quantise(slice: Slice): { units: number; rounded: boolean } {
  const exact = snapWorkdays(durationOf(slice) * SOLVER_QUANTUM);
  const units = Math.ceil(exact);
  return { units, rounded: units !== exact };
}
