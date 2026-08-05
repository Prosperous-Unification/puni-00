import type { Broadcaster, ProjectEvent } from './broadcast';
import type { EventSequencer } from './event-sequencer';
import type { PushClient } from './push-client';

export interface GatewayBroadcasterOptions {
  sequencer: EventSequencer;
  push: PushClient;
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
  constructor(private readonly opts: GatewayBroadcasterOptions) {}

  async publish(projectId: string, event: ProjectEvent): Promise<void> {
    const subscription = `project:${projectId}`;
    const recorded = await this.opts.sequencer.recordEvent(subscription, event);
    try {
      await this.opts.push.push({ subscription, seq: recorded.seq, message: event });
    } catch (err) {
      this.opts.onPushFailed?.(err, subscription);
    }
  }
}
