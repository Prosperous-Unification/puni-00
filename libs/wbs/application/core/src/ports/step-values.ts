import type { AllowancePercent, EstimateUnit } from '@wbs/domain';

export interface Step {
  id: string;
  projectId: string;
  name: string;
  /**
   * Where this step sits in the project's step order — see `schema.ts` for why
   * the order has to be stored rather than read off the rows as they arrive.
   */
  position: number;
  /**
   * The step's step code — `dev` in the reference `010.s1-dev` — or `null` while
   * the step is **uncoded**: an older release inserted it mid-swap without one,
   * and the post-swap backfill has not run yet. `null` is that modeled state,
   * never a default: an uncoded step's nodes have no step reference but keep
   * their step node IDs. Immutable once set; a rename keeps it.
   */
  code: string | null;
  /**
   * This step's estimate allowance, applied to every estimate for the step
   * before rounding — see `chargedDays` in `@wbs/domain`. Zero unless a planner
   * set one; there is no per-work-item override.
   */
  allowancePercent: AllowancePercent;
  /** Unit of every trio on this step; changing it over estimates is refused (ADR 0042). */
  estimateUnit: EstimateUnit;
}
