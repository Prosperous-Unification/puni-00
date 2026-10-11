import { type Timers, withinDeadline } from '@wbs/runtime-portable';

import {
  ACCESS_CHECK_DEADLINE_MS,
  type CheckProjectAccess,
  LEASE_RENEW_MS,
} from './project-access';

/** What one access decision left the connection with. `closed` means it is being closed. */
export type Admission = 'granted' | 'denied' | 'closed';

export interface ConnectionAccessDeps {
  check: CheckProjectAccess;
  timers: Timers;
  /** Aborted when the connection closes; no check starts or reports after it. */
  signal: AbortSignal;
  /** A held project subscription lost access: the composition unsubscribes it. */
  onRevoked: (subscription: string) => void;
  /** The credential no longer proves anyone: the composition closes the socket with 1008. */
  onUnauthenticated: () => void;
  /** be-01 could not answer: the composition reports it and closes the socket. */
  onUnavailable: (caught: unknown) => void;
  leaseRenewMs?: number;
  checkDeadlineMs?: number;
}

/**
 * One socket's project authorization: admission, the lease that keeps it, and
 * the order in which subscription changes take effect.
 *
 * Fails closed. A check be-01 cannot answer never grants: the socket is closed
 * so the client reconnects and asks again, rather than being left subscribed
 * on stale authority or silently unsubscribed.
 *
 * Subscription changes run through {@link run} one at a time, so a slow
 * `subscribe` check cannot complete after the `unsubscribe` sent behind it, and
 * a lease round cannot revoke a subscription the client already left.
 */
export class ConnectionAccess {
  private readonly held = new Map<string, string>();
  private queue: Promise<unknown> = Promise.resolve();
  private cancelLease: (() => void) | null = null;
  private closed = false;

  constructor(private readonly deps: ConnectionAccessDeps) {
    // Proof: dropping this listener left a lease round scheduled after close in
    // `stops leasing once the connection closes` (2026-10-11).
    deps.signal.addEventListener('abort', () => {
      this.stop();
    });
  }

  /** Runs `change` after every change queued before it. */
  run<T>(change: () => Promise<T> | T): Promise<T> {
    // Proof: starting each change at once made `applies a subscription change
    // only after the one queued before it` see the unsubscribe first (2026-10-11).
    const next = this.queue.then(change);
    this.queue = next.catch(() => undefined);
    return next;
  }

  /**
   * Asks be-01 once. `unauthenticated` and an unanswered check close the
   * connection through the deps hooks and answer `closed`.
   */
  async admit(projectId: string): Promise<Admission> {
    if (this.closed || this.deps.signal.aborted) return 'closed';
    let verdict;
    try {
      verdict = await withinDeadline(
        this.deps.timers,
        this.deps.checkDeadlineMs ?? ACCESS_CHECK_DEADLINE_MS,
        (signal) => this.deps.check(projectId, signal),
        this.deps.signal,
      );
    } catch (caught) {
      // Re-read after the await: the connection may have closed meanwhile.
      if (isAborted(this.deps.signal)) return 'closed';
      // Proof: answering `granted` here kept the subscription and the socket
      // open in `closes the socket when be-01 cannot answer, and grants
      // nothing` (project-authorization.integration.test.ts, 2026-10-11).
      this.close(() => {
        this.deps.onUnavailable(caught);
      });
      return 'closed';
    }
    if (verdict === 'unauthenticated') {
      this.close(this.deps.onUnauthenticated);
      return 'closed';
    }
    return verdict;
  }

  /** Starts leasing `subscription`, which names `projectId`, after it was admitted. */
  hold(subscription: string, projectId: string): void {
    this.held.set(subscription, projectId);
    if (this.cancelLease === null && !this.closed) this.scheduleRound();
  }

  /** Stops leasing `subscription`; the client left it or it was revoked. */
  release(subscription: string): void {
    this.held.delete(subscription);
  }

  private scheduleRound(): void {
    this.cancelLease = this.deps.timers.schedule(this.deps.leaseRenewMs ?? LEASE_RENEW_MS, () => {
      this.cancelLease = null;
      if (this.closed || this.held.size === 0) return;
      // The next round is scheduled before this one checks anything, so the
      // cadence is fixed and the revocation bound does not grow by check time.
      this.scheduleRound();
      void this.run(() => this.renew());
    });
  }

  /**
   * Proof: returning at once left the removed member subscribed in `drops a
   * removed member's live subscription when its lease is renewed`; renewing
   * every 6000 ms failed `revokes within the lease bound when access is lost
   * just after a renewal` (2026-10-11).
   */
  private async renew(): Promise<void> {
    for (const [subscription, projectId] of [...this.held]) {
      if (this.held.get(subscription) !== projectId) continue;
      const admission = await this.admit(projectId);
      if (admission === 'closed') return;
      if (admission === 'denied') {
        this.held.delete(subscription);
        this.deps.onRevoked(subscription);
      }
    }
  }

  private close(hook: () => void): void {
    if (this.closed) return;
    this.stop();
    hook();
  }

  private stop(): void {
    this.closed = true;
    this.held.clear();
    this.cancelLease?.();
    this.cancelLease = null;
  }
}

/** Reads `signal.aborted` afresh; a direct read after an await is narrowed stale by TypeScript. */
function isAborted(signal: AbortSignal): boolean {
  return signal.aborted;
}
