import type { EventLogStore, RecordedEvent } from '../../ports/event-log-store';

/** Durable subscription history and count retention over one repository scope. */
export class EventLogService {
  constructor(private readonly events: EventLogStore) {}

  /** Record an event once and return its assigned sequence. */
  recordEvent(subscription: string, message: unknown, createdAt: number): Promise<RecordedEvent> {
    return this.events.recordEvent(subscription, message, createdAt);
  }

  /** Read the latest committed sequence, or -1 for an empty subscription. */
  readLatestSequence(subscription: string): Promise<number> {
    return this.events.latestSeq(subscription);
  }

  /** Read retained events after a sequence in repository order. */
  readEvents(subscription: string, sinceSeq: number): Promise<readonly RecordedEvent[]> {
    return this.events.rangeSince(subscription, sinceSeq);
  }

  /** Keep only the newest requested count per subscription. */
  pruneEvents(maxPerSubscription: number): Promise<number> {
    // Proof (2026-09-27): returning zero without pruning failed `records,
    // reads, and prunes durable subscription events` (4 pass, 1 fail).
    return this.events.pruneBeyond(maxPerSubscription);
  }
}
