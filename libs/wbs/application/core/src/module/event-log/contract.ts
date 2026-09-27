import type { EventLogStore } from '../../ports/event-log-store';
import type { EventLogService } from './event-log.resource';

/** Store required to install durable subscription history over one scope. */
export interface EventLogRequirements {
  readonly events: EventLogStore;
}

/** Public resource supplied by this sealed module. */
export interface EventLogExports {
  readonly eventLog: EventLogService;
}

/** DI Bag label for durable subscription history. */
export const EVENT_LOG_LABEL = 'application.event-log';
