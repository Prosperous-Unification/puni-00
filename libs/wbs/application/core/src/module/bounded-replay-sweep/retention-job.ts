import type { EventLogService } from '../event-log/event-log.resource';
import type { PlanEventService } from '../plan-event/plan-event.resource';

export function runRetention(
  events: EventLogService,
  opts: { maxPerSubscription: number },
): Promise<number> {
  return events.pruneEvents(opts.maxPerSubscription);
}

/**
 * Takes the old end off the plan's history, and answers how many events went.
 *
 * **By age, and that is the whole rule.** The event log is pruned by count
 * because it is a resume buffer and a client that has been away long enough is
 * refused rather than served stale events; a history pruned by count would evict
 * the morning's estimate changes on an afternoon of editing, which is the
 * property that already disqualifies `command_journal` from being a history at
 * all. See {@link PLAN_EVENT_RETENTION_DAYS}.
 *
 * A separate function from {@link runRetention} rather than an argument to it:
 * the two sweeps prune different tables by different rules, and one function
 * taking a mode would have to be read twice to see which rule ran.
 */
export function runPlanEventRetention(
  events: PlanEventService,
  opts: { now: number; retainDays: number },
): Promise<number> {
  return events.pruneHistory(opts.now, opts.retainDays);
}
