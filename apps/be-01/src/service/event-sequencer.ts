import type { EventLogRepo, RecordedEvent } from '../repository/event-log';

export type { RecordedEvent } from '../repository/event-log';

export class EventSequencer {
  constructor(
    private readonly repo: EventLogRepo,
    private readonly now: () => number = Date.now,
  ) {}

  recordEvent(subscription: string, message: unknown): Promise<RecordedEvent> {
    return this.repo.recordEvent(subscription, message, this.now());
  }
}
