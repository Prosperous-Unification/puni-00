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

  /** Where the stream has reached, or `-1` if nothing has been recorded on it. */
  latestSeq(subscription: string): Promise<number> {
    return this.repo.latestSeq(subscription);
  }
}
