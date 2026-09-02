import type { EventLogRepo } from '../repository/event-log';
import { type Broadcaster, type ProjectEvent, subscriptionFor } from './broadcast';
import { type Clock, clockOf } from './clock';
import type { PushClient } from './push-client';
import type { ReplayBuffer } from './replay-buffer';

export interface GatewayBroadcasterOptions {
  /**
   * The durable log, written straight rather than through a wrapper.
   *
   * `EventSequencer` stood here until 2026-09-02 and did nothing but pass the
   * two calls through, reading a clock on the way — which is what a
   * {@link Clock} is for. The sequence numbers were always the log's own, out of
   * `event_sequencer` in one statement (see `DrizzleEventLogRepo.recordEvent`);
   * nothing about them was ever this layer's.
   */
  eventLog: EventLogRepo;
  /** The instant each event is recorded at — see {@link Clock}. */
  clock?: Clock;
  push: PushClient;
  /**
   * The same buffer the replay orchestrator reads. Required: a broadcaster that
   * did not fill it would leave every resume falling through to a database
   * query, and the buffer would look healthy while being permanently empty.
   */
  buffer: ReplayBuffer;
  /** Called when the gateway could not be reached; the write itself already committed. */
  onPushFailed?: (err: unknown, subscription: string) => void;
}

/**
 * Records each project event in the durable log, then pushes it to gw-01.
 *
 * The order matters and is not interchangeable. Recording first means a client
 * that reconnects can replay what it missed even if the push never landed; the
 * log is the record and the push is only the fast path. So a failed push is
 * logged and swallowed rather than thrown: the mutation it describes is already
 * committed, and turning a delivery problem into a failed API call would tell
 * the caller their edit did not happen when it did.
 */
export class GatewayBroadcaster implements Broadcaster {
  private readonly clock: Clock;

  constructor(private readonly opts: GatewayBroadcasterOptions) {
    this.clock = opts.clock ?? clockOf();
  }

  latestSeq(projectId: string): Promise<number> {
    return this.opts.eventLog.latestSeq(subscriptionFor(projectId));
  }

  async publish(projectId: string, event: ProjectEvent): Promise<void> {
    const subscription = subscriptionFor(projectId);
    const recorded = await this.opts.eventLog.recordEvent(subscription, event, this.clock.now());
    this.opts.buffer.record(subscription, recorded.seq, event);
    try {
      await this.opts.push.push({ subscription, seq: recorded.seq, message: event });
    } catch (err) {
      this.opts.onPushFailed?.(err, subscription);
    }
  }
}
