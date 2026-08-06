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
