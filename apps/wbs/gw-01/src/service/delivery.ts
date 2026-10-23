import { DeadlineExceeded, type Timers, withinDeadline } from '@wbs/runtime-portable';

import type { FrameOutcome } from './socket-writer';

/** Bun acceptance, or a connection retired before a frame could be accepted. */
export type DeliveryOutcome = Exclude<FrameOutcome, 'dropped'> | 'retired';

/** Every application producer awaits the same per-connection delivery boundary. */
export interface DeliverySocket {
  send(payload: string): Promise<DeliveryOutcome>;
}

/** Why a connection stopped accepting application frames. */
export type Retirement = 'overflow' | 'deadline' | 'failure' | 'dropped';

export interface DeliveryDependencies {
  /** Production binds the synchronous physical socket writer; async adapters must honor cancellation before writing. */
  write: (payload: string, signal: AbortSignal) => FrameOutcome | Promise<FrameOutcome>;
  signal: AbortSignal;
  timers: Timers;
  capacity: number;
  deadlineMs: number;
  /** Synchronous retirement removes subscriptions and closes the transport; failures are reported here. */
  onRetired: (reason: Retirement, caught?: unknown) => void;
}

/**
 * Bounded FIFO shared by presence, push, replay and control frames on one socket.
 * The budget includes time queued; its absolute expiry is rechecked synchronously
 * before invoking the writer even when deadline timer callbacks are delayed. A failed/expired/full queue retires the whole
 * connection, so later replay acknowledgements cannot follow a missing frame.
 * Writer rejection is a modeled retirement reported through `onRetired`; it is
 * never detached. Bun's -1 is accepted buffering, not a retry or client receipt.
 * Cancellation settles callers even for an adapter that ignores its signal; only
 * cooperative adapters can prevent their own side effects after cancellation.
 */
export class SocketDelivery implements DeliverySocket {
  private tail: Promise<void> = Promise.resolve();
  private pending = 0;
  private readonly cancellation = new AbortController();

  constructor(private readonly deps: DeliveryDependencies) {
    // Proof: removing validation accepts zero/infinite limits in invalid queue limits cannot disable delivery bounds.
    if (
      !Number.isSafeInteger(deps.capacity) ||
      deps.capacity < 1 ||
      !Number.isFinite(deps.deadlineMs) ||
      deps.deadlineMs <= 0
    ) {
      throw new Error('delivery requires finite positive capacity and deadline');
    }
    const cancel = () => {
      this.cancellation.abort(deps.signal.reason);
    };
    // Proof: ignoring an already-aborted parent starts a writer in an already closed connection starts no physical writer.
    if (deps.signal.aborted) cancel();
    else deps.signal.addEventListener('abort', cancel, { once: true });
  }

  send(payload: string): Promise<DeliveryOutcome> {
    // Proof: the already-closed and cancellation tests require zero subsequent writes.
    if (this.cancellation.signal.aborted) return Promise.resolve('retired');
    // Proof: removing capacity retirement leaves overflow waiting until deadline in overflow retires once.
    if (this.pending >= this.deps.capacity) {
      this.retire('overflow');
      return Promise.resolve('retired');
    }
    this.pending++;
    const previous = this.tail;
    const expiresAt = this.deps.timers.nowMs() + this.deps.deadlineMs;
    const sending = this.deliver(previous, payload, expiresAt).finally(() => {
      this.pending--;
    });
    // Queue continuity owns no error: a failing retirement callback still rejects
    // the original `sending` promise returned to its producer.
    this.tail = sending.then(
      () => undefined,
      () => undefined,
    );
    return sending;
  }

  private async deliver(
    previous: Promise<void>,
    payload: string,
    expiresAt: number,
  ): Promise<DeliveryOutcome> {
    let outcome: FrameOutcome;
    try {
      // Proof: replacing this budget with 5000ms times out bounds a signal-ignoring writer under a 200ms test deadline.
      outcome = await withinDeadline(
        this.deps.timers,
        this.deps.deadlineMs,
        async (signal) => {
          // Proof: bypassing this wait writes ack before replay in orders producers and counts Bun backpressure.
          await previous;
          // Proof: removing this check starts the queued successor after deadline retirement.
          signal.throwIfAborted();
          // Proof: removing this clock check writes an expired frame in withheld
          // deadline callbacks never allow an expired queued frame to reach its writer.
          if (this.deps.timers.nowMs() >= expiresAt)
            throw new DeadlineExceeded('socket delivery deadline exceeded before write');
          return this.deps.write(payload, signal);
        },
        // Proof: omitting the parent signal delays connection cancellation beyond its independent 25ms observation.
        this.cancellation.signal,
      );
    } catch (caught) {
      // Proof: unconditionally retiring here reports duplicate failures for overflow and normal connection cancellation.
      if (!this.cancellation.signal.aborted)
        this.retire(caught instanceof DeadlineExceeded ? 'deadline' : 'failure', caught);
      return 'retired';
    }
    // Proof: ignoring dropped returns a false non-retired outcome in writer rejection and physical drop.
    if (outcome === 'dropped') {
      this.retire('dropped');
      return 'retired';
    }
    return outcome;
  }

  private retire(reason: Retirement, caught?: unknown): void {
    this.cancellation.abort(new Error(`delivery ${reason}`));
    // Proof: omitting caught loses the original transport failure in writer rejection and physical drop.
    this.deps.onRetired(reason, caught);
  }
}
