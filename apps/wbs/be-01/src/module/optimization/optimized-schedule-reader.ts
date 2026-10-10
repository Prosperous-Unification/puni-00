import type {
  OptimizationVariantState,
  OptimizedScheduleAsk,
  OptimizedScheduleRead,
} from '@wbs/core';

export type {
  OptimizationVariantState,
  OptimizedScheduleAsk,
  OptimizedScheduleRead,
} from '@wbs/core';

/** Apply slot/queue liveness to the adapter's cached-state projection. */
export function applyVariantLiveness(
  state: OptimizationVariantState,
  live: boolean,
): OptimizationVariantState {
  if (!live) return state;
  if (state.state === 'idle') return { state: 'pending' };
  if (state.state === 'failed' || state.state === 'corrupt') return { state: 'retrying' };
  return state;
}

/**
 * The plan read's one question of the optimized cache: *what is the published
 * and live state for exactly this plan?*
 *
 * It returns the identity, both variants' seven-state projection, and both
 * materialized schedules. `WorkItemService` therefore chooses Fast from `ready`
 * versus every other state, and compares every ready variant with Fast, without
 * re-decoding cache rows or guessing whether a slot is live.
 *
 * The live implementation awaits only the source's persistence turn, never a
 * solver. Captured reads remain synchronous on their borrowed snapshot.
 *
 * **It may not throw for anything the cache models.** The plan read calls it
 * outside its own `try`, so a throw is a defect and is reported as one rather
 * than being relabelled "your dependencies run in a circle".
 */
export type OptimizedScheduleReader = (ask: OptimizedScheduleAsk) => Promise<OptimizedScheduleRead>;
