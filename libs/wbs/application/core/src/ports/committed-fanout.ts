import type { WorkPackageEvent } from './work-package-event';
import type { RecordedEvent } from './recorded-event';

/** The exact row inserted by a committed command, never a request to publish another row. */
export interface CommittedWorkPackageEvent {
  readonly workPackageId: string;
  readonly event: WorkPackageEvent;
  readonly recorded: RecordedEvent;
}

/** Delivery occurs after the writer releases its turn. */
export interface CommittedFanoutDelivery {
  now(): number;
  deliverCommitted(events: readonly CommittedWorkPackageEvent[]): Promise<void>;
}
