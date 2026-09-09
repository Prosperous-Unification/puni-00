import type {
  OptimizationVariantState,
  OptimizedScheduleAsk,
  OptimizedScheduleRead,
} from '@wbs/core';

import type { CachedOutcome } from '../repository/optimized-schedule-cache';
export type {
  OptimizationVariantState,
  OptimizedScheduleAsk,
  OptimizedScheduleRead,
} from '@wbs/core';

/** Add the full-key liveness fact to one stored-row outcome. */
export function optimizationVariantState(
  outcome: CachedOutcome,
  live: boolean,
): OptimizationVariantState {
  if (outcome.kind === 'ok') return { state: 'ready' };
  if (outcome.kind === 'miss') return { state: live ? 'pending' : 'idle' };
  if (outcome.kind === 'failed') {
    return live ? { state: 'retrying' } : { state: 'failed', reason: outcome.reason };
  }
  if (outcome.kind === 'corrupt') {
    return live ? { state: 'retrying' } : { state: 'corrupt', message: outcome.reason };
  }
  return { state: 'plan-infeasible', items: outcome.certificate.items };
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
 * Synchronous, because every implementation is a SQLite read on the same
 * connection the plan read is already using and 4.1's `readOptimizedPair` is
 * itself synchronous. An `async` port here would make the plan read await a
 * promise that never yields, and would let a future implementation wait on a
 * solve — which is the timer-shaped coupling slice 4 is built to refuse.
 *
 * **It may not throw for anything the cache models.** The plan read calls it
 * outside its own `try`, so a throw is a defect and is reported as one rather
 * than being relabelled "your dependencies run in a circle".
 */
export type OptimizedScheduleReader = (ask: OptimizedScheduleAsk) => OptimizedScheduleRead;
