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
