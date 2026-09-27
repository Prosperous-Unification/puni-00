import type { AuthenticatedUser, InternalIdentity } from '@wbs/contracts';

import type { EventLogService } from '../event-log/event-log.resource';
import type { PlanEventService } from '../plan-event/plan-event.resource';
import { runPlanEventRetention, runRetention } from './retention-job';

export interface RetentionSweepGraph {
  readonly eventLog: EventLogService;
  readonly planEvents: PlanEventService;
  readonly maxPerSubscription: number;
  readonly retainDays: number;
  readonly now: () => number;
}

export interface RetentionSweepInput {
  readonly principal: InternalIdentity | AuthenticatedUser;
}

export type RetentionSweepOutcome =
  | {
      readonly outcome: 'swept';
      readonly eventLogRemoved: number;
      readonly planEventsRemoved: number;
    }
  | { readonly outcome: 'forbidden' };

/** Runs both bounded retention rules for an internally admitted trigger. */
export async function retentionSweep(
  graph: RetentionSweepGraph,
  input: RetentionSweepInput,
): Promise<RetentionSweepOutcome> {
  if (!('kind' in input.principal)) {
    return { outcome: 'forbidden' };
  }
  const eventLogRemoved = await runRetention(graph.eventLog, {
    maxPerSubscription: graph.maxPerSubscription,
  });
  // Proof (2026-09-27): returning zero here without pruning history failed
  // `prunes the history by age on every tick` and `keeps sweeping after a
  // history sweep fails` (6 pass, 2 fail).
  const planEventsRemoved = await runPlanEventRetention(graph.planEvents, {
    now: graph.now(),
    retainDays: graph.retainDays,
  });
  return { outcome: 'swept', eventLogRemoved, planEventsRemoved };
}
