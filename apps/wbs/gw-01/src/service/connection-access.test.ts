import { describe, expect, it } from 'bun:test';

import { ConnectionAccess } from './connection-access';
import {
  ACCESS_CHECK_DEADLINE_MS,
  type CheckProjectAccess,
  LEASE_RENEW_MS,
  type ProjectAccessVerdict,
} from './project-access';

/** A clock that moves only when the test says so. */
class ManualTimers {
  now = 0;
  private pending: { at: number; fire: () => void }[] = [];

  get pendingCount(): number {
    return this.pending.length;
  }

  nowMs = (): number => this.now;

  schedule = (ms: number, fire: () => void): (() => void) => {
    const entry = { at: this.now + ms, fire };
    this.pending.push(entry);
    return () => {
      this.pending = this.pending.filter((other) => other !== entry);
    };
  };

  async advanceTo(at: number): Promise<void> {
    for (;;) {
      const due = this.pending
        .filter((entry) => entry.at <= at)
        .sort((left, right) => left.at - right.at)
        .at(0);
      if (due === undefined) break;
      this.pending = this.pending.filter((entry) => entry !== due);
      this.now = due.at;
      due.fire();
      await flush();
    }
    this.now = at;
    await flush();
  }
}

async function flush(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
}

function harness(check: CheckProjectAccess) {
  const timers = new ManualTimers();
  const connection = new AbortController();
  const revoked: { subscription: string; at: number }[] = [];
  const closes: string[] = [];
  const access = new ConnectionAccess({
    check,
    timers,
    signal: connection.signal,
    onRevoked: (subscription) => revoked.push({ subscription, at: timers.now }),
    onUnauthenticated: () => closes.push('unauthenticated'),
    onUnavailable: () => closes.push('unavailable'),
  });
  return { timers, connection, revoked, closes, access };
}

describe('ConnectionAccess', () => {
  it('keeps the production constants inside the five-second revocation bound', () => {
    expect(LEASE_RENEW_MS + ACCESS_CHECK_DEADLINE_MS).toBeLessThan(5_000);
  });

  it('revokes within the lease bound when access is lost just after a renewal', async () => {
    // The worst case: the membership is removed the instant a round has
    // answered granted, so only the next round can see it.
    const removal: { at: number | null } = { at: null };
    const timers = new ManualTimers();
    const revoked: number[] = [];
    const access = new ConnectionAccess({
      check: () => {
        if (removal.at !== null) return Promise.resolve('denied');
        removal.at = timers.now;
        return Promise.resolve('granted');
      },
      timers,
      signal: new AbortController().signal,
      onRevoked: () => revoked.push(timers.now),
      onUnauthenticated: () => undefined,
      onUnavailable: () => undefined,
    });
    access.hold('project:p', 'p');
    await timers.advanceTo(20_000);

    expect(removal.at).not.toBeNull();
    expect(revoked).toHaveLength(1);
    // Proof: renewing every 6000 ms instead of LEASE_RENEW_MS made this
    // observe the revocation 6000 ms after removal (2026-10-11).
    expect((revoked[0] ?? Infinity) - (removal.at ?? 0)).toBeLessThanOrEqual(
      LEASE_RENEW_MS + ACCESS_CHECK_DEADLINE_MS,
    );
  });

  it('closes as unavailable when a check outlives its deadline', async () => {
    const { timers, closes, access } = harness(() => new Promise(() => undefined));
    const admission = access.admit('p');
    await timers.advanceTo(ACCESS_CHECK_DEADLINE_MS);

    expect(await admission).toBe('closed');
    expect(closes).toEqual(['unavailable']);
  });

  it('applies a subscription change only after the one queued before it', async () => {
    let answer: (verdict: ProjectAccessVerdict) => void = () => undefined;
    const { access } = harness(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    const order: string[] = [];
    const subscribing = access.run(async () => {
      order.push(`subscribe ${await access.admit('p')}`);
    });
    const unsubscribing = access.run(() => {
      order.push('unsubscribe');
    });
    await flush();
    answer('granted');
    await Promise.all([subscribing, unsubscribing]);

    // Proof: running each change at once instead of after the queue made the
    // unsubscribe land first (2026-10-11).
    expect(order).toEqual(['subscribe granted', 'unsubscribe']);
  });

  it('stops leasing once the connection closes', async () => {
    let checks = 0;
    const { timers, connection, access } = harness(() => {
      checks += 1;
      return Promise.resolve('granted');
    });
    access.hold('project:p', 'p');
    await timers.advanceTo(LEASE_RENEW_MS);
    connection.abort();

    // Proof: dropping the abort listener left the next lease round scheduled
    // (1 instead of 0) (2026-10-11).
    expect(timers.pendingCount).toBe(0);
    await timers.advanceTo(LEASE_RENEW_MS * 4);
    expect(checks).toBe(1);
  });
});
