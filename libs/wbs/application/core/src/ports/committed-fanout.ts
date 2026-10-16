import type { ProjectEvent } from './project-event';
import type { RecordedEvent } from './recorded-event';

/** The exact row inserted by a committed command, never a request to publish another row. */
export interface CommittedProjectEvent {
  readonly projectId: string;
  readonly event: ProjectEvent;
  readonly recorded: RecordedEvent;
}

/** Delivery occurs after the writer releases its turn. */
export interface CommittedFanoutDelivery {
  now(): number;
  deliverCommitted(events: readonly CommittedProjectEvent[]): Promise<void>;
}
