import { type } from '@wbs/validation';

/**
 * Three durations in days for one work item and one role.
 *
 * Days, not hours, and fractional days are allowed: half a day is a real
 * estimate and rounding it up is a lie the plan then carries.
 *
 * The ordering is part of the type rather than a rule the callers remember.
 * `optimistic` is the run where no unknown unknowns appear, `pessimistic` is the
 * one where every unknown you can sense does, and `realistic` is a best guess
 * rather than the midpoint of the two — which is why it is asserted to sit
 * between them and not computed from them.
 */
export const ThreePointEstimate = type({
  optimistic: 'number>=0',
  realistic: 'number>=0',
  pessimistic: 'number>=0',
}).narrow((estimate, ctx) => {
  if (estimate.optimistic <= estimate.realistic && estimate.realistic <= estimate.pessimistic) {
    return true;
  }
  return ctx.mustBe('ordered optimistic <= realistic <= pessimistic');
});
export type ThreePointEstimate = typeof ThreePointEstimate.infer;

/** A three-point estimate together with the role it was given for. */
export const RoleEstimate = type({
  roleId: 'string',
  estimate: ThreePointEstimate,
});
export type RoleEstimate = typeof RoleEstimate.infer;

/**
 * The PERT expected duration of a three-point estimate, in days.
 *
 * `(optimistic + 4 × realistic + pessimistic) / 6`. The realistic figure is
 * weighted four times because it is the one someone actually thought about; the
 * other two are the edges of the distribution and pull the answer only as far as
 * they deserve. Which is why this is not the midpoint of optimistic and
 * pessimistic, and why a `2 / 3 / 10` estimate expects 4 days rather than 6.
 *
 * Fractional on purpose. Rounding here would compound across a chain of forty
 * work items into days that never existed.
 */
export function expectedDays(estimate: ThreePointEstimate): number {
  return (estimate.optimistic + 4 * estimate.realistic + estimate.pessimistic) / 6;
}

/**
 * How a project turns its three-point estimates into the one number it plans
 * with.
 *
 * PERT is the default and the reason three points are collected at all. The
 * other three are the honest answers to "we are quoting the best case" and
 * "this date has to hold": a team committing a deadline plans on `pessimistic`,
 * a team quoting a possibility plans on `optimistic`, and `realistic` is the
 * single figure most people mean when they say "the estimate". Which one a
 * project uses is a decision about risk appetite, not a calculation, so it is
 * stored rather than inferred.
 */
export const ESTIMATE_METHODS = ['pert', 'optimistic', 'realistic', 'pessimistic'] as const;
export type EstimateMethod = (typeof ESTIMATE_METHODS)[number];

/** Whether `value` is one of the four methods — the boundary check for stored and posted data. */
export function isEstimateMethod(value: unknown): value is EstimateMethod {
  return typeof value === 'string' && (ESTIMATE_METHODS as readonly string[]).includes(value);
}

/**
 * The one number a project plans this estimate with, in days.
 *
 * The single place the choice is applied. The schedule's durations and the
 * figure shown beside the trio must be the same number — two implementations
 * of "the final estimate" is exactly how a table comes to disagree with the
 * dates printed next to it.
 */
export function finalDays(estimate: ThreePointEstimate, method: EstimateMethod): number {
  if (method === 'pert') return expectedDays(estimate);
  // Not a defensive flourish: `estimate[method]` for a method this does not
  // know returns `undefined`, and the arithmetic downstream turns that into
  // `NaN` — a schedule of NaN days that renders as blank cells and reports
  // itself as estimated. Caught here, it is one loud error naming the value.
  if (!isEstimateMethod(method)) {
    throw new Error(`unknown estimate method: ${JSON.stringify(method)}`);
  }
  return estimate[method];
}
