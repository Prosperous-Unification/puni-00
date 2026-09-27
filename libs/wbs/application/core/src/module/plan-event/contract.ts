import type { PlanEventStore } from '../../ports/plan-event-store';
import type { PlanEventService } from './plan-event.resource';

/** Store required to install retained plan history over one scope. */
export interface PlanEventRequirements {
  readonly events: PlanEventStore;
}

/** Public resource supplied by this sealed module. */
export interface PlanEventExports {
  readonly planEvents: PlanEventService;
}

/** DI Bag label for retained plan history. */
export const PLAN_EVENT_LABEL = 'application.plan-event';
