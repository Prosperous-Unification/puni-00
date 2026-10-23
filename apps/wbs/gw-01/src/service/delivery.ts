import { DeadlineExceeded, type Timers, withinDeadline } from '@wbs/runtime-portable';

import type { FrameOutcome } from './socket-writer';

/** Bun acceptance, or a connection retired before a frame could be accepted. */
export type DeliveryOutcome = Exclude<FrameOutcome, 'dropped'> | 'retired';

/** Every application producer awaits the same per-connection delivery boundary. */
export interface DeliverySocket {
  send(payload: string): Promise<DeliveryOutcome>;
}

/** Why a connection stopped accepting application frames. */
export type Retirement = 'overflow' | 'deadline' | 'failure' | 'dropped' | 'incompatible';

export interface DeliveryDependencies {
  /** Fresh authority read for this FIFO head, canceled by the enqueue budget or connection. */
  admit: (signal: AbortSignal) => Promise<'admitted' | 'incompatible'>;
  /** Physical acceptance must be synchronous: no scheduling gap after the final admission checks. */
  write: (payload: string) => FrameOutcome;
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
 * before and after fresh authority admission even when timer callbacks are delayed.
 * Failure, incompatibility, expiry or overflow retires the connection, preventing
 * later replay acknowledgements after a missing frame. Authority errors retain
 * their cause separately from incompatible authority. Bun's -1 is accepted
 * buffering, not a retry or client receipt. Cancellation settles producers even
 * when authority ignores its signal; the physical writer remains synchronous.
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
    let outcome: FrameOutcome | 'incompatible';
    try {
      // Proof: replacing this budget with 5000ms times out bounds a signal-ignoring admission by deadline and never starts its queued successor.
      outcome = await withinDeadline(
        this.deps.timers,
        this.deps.deadlineMs,
        async (signal) => {
          // Proof: bypassing this wait writes ack before replay in orders producers and counts Bun backpressure.
          await previous;
          // Proof: removing this check starts the queued successor after deadline retirement.
          signal.throwIfAborted();
          // Proof: removing this check asks authority after expiry in mounted
          // expired FIFO head never asks authority even when timer callback is withheld.
          if (this.deps.timers.nowMs() >= expiresAt)
            throw new DeadlineExceeded('socket delivery deadline exceeded before write');
          // Proof: bypassing admission sends the sentinel/ack in mounted
          // fresh admission stops replay when authority changes after the first accepted event.
          const admission = await this.deps.admit(signal);
          if (admission === 'incompatible') return 'incompatible' as const;
          // Proof: removing this check writes after cancellation in mounted push cannot write after held admission cancellation or exact expiry with withheld timer.
          signal.throwIfAborted();
          // Proof: removing this check writes at exact expiry in mounted push cannot write after held admission cancellation or exact expiry with withheld timer.
          if (this.deps.timers.nowMs() >= expiresAt)
            throw new DeadlineExceeded('socket delivery deadline exceeded after admission');
          return this.deps.write(payload);
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
    // Proof: bypassing terminal retirement leaves mounted retained sockets open on incompatibility.
    // Keeping callback failures outside the catch preserves the producer rejection in
    // incompatible retirement callback failures remain observable to the producer.
    if (outcome === 'incompatible') {
      this.retire('incompatible');
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
