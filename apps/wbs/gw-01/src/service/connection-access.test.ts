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
  for (let turn = 0; turn < 100; turn += 1) await Promise.resolve();
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
    onRevoked: (subscription) => {
      revoked.push({ subscription, at: timers.now });
    },
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
      onRevoked: () => {
        revoked.push(timers.now);
      },
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

  it('keeps the bound and serves a subscribe with five held projects and a slow be-01', async () => {
    const timers = new ManualTimers();
    let readable = true;
    const revoked: { subscription: string; at: number }[] = [];
    const access = new ConnectionAccess({
      // be-01 answers every check after 1.4 s, inside the 1.5 s deadline.
      check: () =>
        new Promise((resolve) => {
          const verdict = readable ? 'granted' : 'denied';
          timers.schedule(1_400, () => {
            resolve(verdict);
          });
        }),
      timers,
      signal: new AbortController().signal,
      onRevoked: (subscription) => {
        revoked.push({ subscription, at: timers.now });
      },
      onUnauthenticated: () => undefined,
      onUnavailable: () => undefined,
    });
    for (const index of [1, 2, 3, 4, 5])
      access.hold(`project:p${String(index)}`, `p${String(index)}`);

    // The first round starts at 3000 and has answered granted by 4400.
    await timers.advanceTo(4_400);
    readable = false;
    const removedAt = timers.now;
    // A subscribe issued while the next round is running.
    await timers.advanceTo(6_500);
    const subscribed: { at: number | null } = { at: null };
    void access
      .run(async () => {
        await access.admit('fresh');
      })
      .then(() => {
        subscribed.at = timers.now;
      });
    await timers.advanceTo(20_000);

    expect(revoked).toHaveLength(5);
    for (const { at } of revoked) {
      expect(at - removedAt).toBeLessThanOrEqual(LEASE_RENEW_MS + ACCESS_CHECK_DEADLINE_MS);
    }
    // After the round it queued behind (7400) plus its own check: 8800.
    expect(subscribed.at).not.toBeNull();
    expect((subscribed.at ?? Infinity) - 6_500).toBeLessThanOrEqual(
      LEASE_RENEW_MS + ACCESS_CHECK_DEADLINE_MS,
    );
  });

  it('queues at most one lease round behind busy subscription changes', async () => {
    const timers = new ManualTimers();
    const checked: string[] = [];
    const access = new ConnectionAccess({
      check: (projectId) =>
        new Promise((resolve) => {
          checked.push(projectId);
          timers.schedule(1_400, () => {
            resolve('granted');
          });
        }),
      timers,
      signal: new AbortController().signal,
      onRevoked: () => undefined,
      onUnauthenticated: () => undefined,
      onUnavailable: () => undefined,
    });
    access.hold('project:held', 'held');
    // Seven subscribes keep the queue busy from 2900 to 12700, across three
    // lease cadences (3000, 6000, 9000).
    await timers.advanceTo(2_900);
    for (const index of [1, 2, 3, 4, 5, 6, 7])
      void access.run(async () => {
        await access.admit(`new${String(index)}`);
      });
    await timers.advanceTo(12_000);

    // Proof: dropping the `rounding` guard queued a round per cadence, so
    // `held` was checked more than once by 14200 (2026-10-11).
    await timers.advanceTo(12_699);
    const heldChecksBy12699 = checked.filter((projectId) => projectId === 'held').length;
    await timers.advanceTo(14_200);
    expect(heldChecksBy12699).toBe(0);
    expect(checked.filter((projectId) => projectId === 'held')).toHaveLength(1);
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

it('reports a rejected asynchronous revocation and retires its lease', async () => {
  const timers = new ManualTimers();
  const failure = new Error('revocation delivery infrastructure failed');
  const reported: unknown[] = [];
  const access = new ConnectionAccess({
    check: () => Promise.resolve('denied'),
    timers,
    signal: new AbortController().signal,
    onRevoked: () => Promise.reject(failure),
    onUnauthenticated: () => {
      throw new Error('unexpected authentication refusal');
    },
    onUnavailable: (caught) => {
      reported.push(caught);
    },
  });
  access.hold('project:held', 'held');
  await timers.advanceTo(LEASE_RENEW_MS);
  expect(reported).toEqual([failure]);
  expect(timers.pendingCount).toBe(0);
});
