import type { EventLogStore } from '../../ports/event-log-store';
import type { PlanEventStore } from '../../ports/plan-event-store';
import type { Intervals } from '../../ports/timers';
import type { RetentionTimer, Swept } from './retention-timer';

/**
 * What a host must supply to install {@link boundedReplaySweepModule}.
 *
 * Both stores are repository ports, and that is existing K3 debt this
 * extraction preserves rather than fixes — the same preserved debt
 * `libs/wbs/application/core/src/module/plan-history/contract.ts` records for
 * `HistoryService`. Closing it needs resource-services over these two stores
 * that no accepted change supplies, so `adopt-di-composition` records it as
 * open and this module claims no K3 compliance either.
 *
 * `onSweep` is optional because a process that does not care to log a sweep's
 * counts still needs the sweep to run; `onError` is required for the reason
 * `retention-timer.ts`'s own JSDoc gives: a silently dead timer looks identical
 * to a healthy one from outside.
 */
export interface BoundedReplaySweepRequirements {
  readonly eventLog: EventLogStore;
  readonly planEvents: PlanEventStore;
  readonly intervals: Intervals;
  readonly now: () => number;
  readonly maxPerSubscription: number;
  readonly planEventRetentionDays: number;
  readonly intervalMs: number;
  readonly onSweep?: (removed: Swept) => void;
  readonly onError: (err: unknown) => void;
}

/** What installing {@link boundedReplaySweepModule} adds to a host graph. */
export interface BoundedReplaySweepExports {
  readonly retention: RetentionTimer;
}

/**
 * The DI Bag label this module's private bindings are named under.
 *
 * `application` is the ring, matching `module.application.plan-history`'s; the
 * wiki module identifier is `module.application.bounded-replay-sweep` and the
 * label drops the `module.` prefix.
 */
export const BOUNDED_REPLAY_SWEEP_LABEL = 'application.bounded-replay-sweep';
