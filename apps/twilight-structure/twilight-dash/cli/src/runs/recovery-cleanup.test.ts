import { rejects } from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { organizationId } from './record-codecs';
import { bootstrapSqliteStores } from './sqlite/open-stores';
import { FixtureClock } from './testing/fixtures';
import {
  acquireReceiverAuthority,
  closeRecoveryResources,
  createRecoveryReceiver,
  readReceiverState,
  waitForReceiver,
} from './testing/recovery-receiver';

type InspectedHarness = Parameters<NonNullable<Parameters<typeof createRecoveryReceiver>[0]>>[0];

for (const cleanupFails of [false, true])
  test(
    'receiver cleanup drains rejected delivery and preserves disposal cause ' +
      String(cleanupFails),
    async () => {
      let harness: InspectedHarness | undefined;
      const receiver = await createRecoveryReceiver((owned) => {
        harness = owned;
      });
      if (harness === undefined) throw new Error('inspection missing');
      const owned = harness;
      const token = owned.token;
      const dispose = owned.closeComposed;
      const deliveryFailure = new Error('token failure after actual barrier entry');
      const cleanupFailure = new Error('independent harness disposal failure');
      let disposals = 0;
      let delivery: ReturnType<typeof acquireReceiverAuthority> | undefined;
      owned.closeComposed = async () => {
        disposals += 1;
        await dispose.call(owned);
        if (cleanupFails) throw cleanupFailure;
      };
      try {
        const barrier = receiver.pause('cleanup-rejection');
        delivery = acquireReceiverAuthority(receiver, 'cleanup-rejection', null);
        await waitForReceiver(barrier.entered);
        owned.token = () => {
          throw deliveryFailure;
        };
        const [closed] = await Promise.allSettled([receiver.close()]);
        const exchange = await delivery;
        expect(exchange.reply).toMatchObject({
          kind: 'failure',
          failure: { code: 'transport', cause: deliveryFailure },
        });
        expect(closed.status).toBe('rejected');
        if (closed.status !== 'rejected') throw new Error('close did not reject');
        if (cleanupFails) {
          expect(closed.reason).toBeInstanceOf(AggregateError);
          expect((closed.reason as AggregateError).errors).toEqual([
            deliveryFailure,
            cleanupFailure,
          ]);
          expect((closed.reason as AggregateError).errors[0]).toBe(deliveryFailure);
          expect((closed.reason as AggregateError).errors[1]).toBe(cleanupFailure);
        } else expect(closed.reason).toBe(deliveryFailure);
        expect(disposals).toBe(1);
      } finally {
        owned.token = token;
        owned.closeComposed = dispose;
        try {
          await receiver.close();
        } finally {
          try {
            if (delivery !== undefined) await delivery;
          } finally {
            await dispose.call(owned);
          }
        }
      }
    },
  );

test('receiver cleanup waits for every actual delivery before disposal', async () => {
  let harness: InspectedHarness | undefined;
  const receiver = await createRecoveryReceiver((owned) => {
    harness = owned;
  });
  if (harness === undefined) throw new Error('inspection missing');
  const owned = harness;
  const token = owned.token;
  const dispose = owned.closeComposed;
  const request = owned.app.handle;
  const entered = Promise.withResolvers<undefined>();
  const release = Promise.withResolvers<undefined>();
  const failure = new Error('first token fails');
  let disposals = 0;
  let closeSettled = false;
  let closed: Promise<PromiseSettledResult<void>> | undefined;
  const deliveries: ReturnType<typeof acquireReceiverAuthority>[] = [];
  owned.closeComposed = async () => {
    disposals += 1;
    await dispose.call(owned);
  };
  owned.app.handle = async (incoming) => {
    if (incoming.method === 'POST') {
      entered.resolve(undefined);
      await waitForReceiver(release.promise);
    }
    return request.call(owned.app, incoming);
  };
  try {
    const first = receiver.pause('cleanup-first');
    deliveries.push(acquireReceiverAuthority(receiver, 'cleanup-first', null));
    await waitForReceiver(first.entered);
    const second = receiver.pause('cleanup-second');
    deliveries.push(acquireReceiverAuthority(receiver, 'cleanup-second', null));
    await waitForReceiver(second.entered);
    let tokens = 0;
    owned.token = (...args) => {
      if (++tokens === 1) throw failure;
      return token.call(owned, ...args);
    };
    closed = Promise.allSettled([receiver.close()]).then(([settled]) => {
      closeSettled = true;
      return settled;
    });
    await waitForReceiver(entered.promise);
    await deliveries[0];
    await readReceiverState(receiver);
    expect(closeSettled).toBe(false);
    expect(disposals).toBe(0);
    release.resolve(undefined);
    const settlement = await closed;
    expect(settlement.status).toBe('rejected');
    if (settlement.status !== 'rejected') throw new Error('close did not retain failure');
    expect(settlement.reason).toBe(failure);
    expect((await deliveries[1]).reply.kind).toBe('success');
    expect(disposals).toBe(1);
  } finally {
    release.resolve(undefined);
    owned.token = token;
    owned.app.handle = request;
    owned.closeComposed = dispose;
    try {
      if (closed !== undefined) await closed;
    } finally {
      try {
        await Promise.all(deliveries);
      } finally {
        await dispose.call(owned);
      }
    }
  }
});

for (const cleanupFails of [false, true])
  test(
    'receiver construction preserves inspection and disposal failures ' + String(cleanupFails),
    async () => {
      const setupFailure = new Error('inspection failed before fixture return');
      const cleanupFailure = new Error('construction disposal failure');
      let restore: (() => Promise<void>) | undefined;
      let disposals = 0;
      try {
        const [created] = await Promise.allSettled([
          createRecoveryReceiver((owned) => {
            const dispose = owned.closeComposed;
            restore = async () => {
              owned.closeComposed = dispose;
              await dispose.call(owned);
            };
            owned.closeComposed = async () => {
              disposals += 1;
              await dispose.call(owned);
              if (cleanupFails) throw cleanupFailure;
            };
            throw setupFailure;
          }),
        ]);
        expect(created.status).toBe('rejected');
        if (created.status !== 'rejected') throw new Error('construction unexpectedly returned');
        if (cleanupFails) {
          expect(created.reason).toBeInstanceOf(AggregateError);
          expect((created.reason as AggregateError).errors[0]).toBe(setupFailure);
          expect((created.reason as AggregateError).errors[1]).toBe(cleanupFailure);
        } else expect(created.reason).toBe(setupFailure);
        expect(disposals).toBe(1);
      } finally {
        if (restore !== undefined) await restore();
      }
    },
  );

for (const storeFails of [false, true])
  test(
    'paired cleanup closes actual SQLite store after receiver failure ' + String(storeFails),
    async () => {
      const directory = mkdtempSync(join(tmpdir(), 'recovery-cleanup-'));
      const stores = await bootstrapSqliteStores({
        path: join(directory, 'runs.sqlite'),
        organizationId: organizationId('org-a'),
        capacity: 1,
        leaseMilliseconds: 100,
        clock: new FixtureClock(),
        maxBusyAttempts: 2,
        busyDelayMilliseconds: 1,
      });
      let harness: InspectedHarness | undefined;
      let receiver: Awaited<ReturnType<typeof createRecoveryReceiver>> | undefined;
      let restore: (() => Promise<void>) | undefined;
      const receiverFailure = new Error('receiver disposal reported failure');
      const storeFailure = new Error('independent store disposal failure');
      try {
        receiver = await createRecoveryReceiver((owned) => {
          harness = owned;
        });
        if (harness === undefined) throw new Error('inspection missing');
        const owned = harness;
        const dispose = owned.closeComposed;
        restore = async () => {
          owned.closeComposed = dispose;
          await dispose.call(owned);
        };
        owned.closeComposed = async () => {
          await dispose.call(owned);
          throw receiverFailure;
        };
        const [closed] = await Promise.allSettled([
          closeRecoveryResources([
            receiver,
            {
              async close() {
                await stores.close();
                if (storeFails) throw storeFailure;
              },
            },
          ]),
        ]);
        expect(closed.status).toBe('rejected');
        if (closed.status !== 'rejected') throw new Error('cleanup failure absent');
        if (storeFails) {
          expect(closed.reason).toBeInstanceOf(AggregateError);
          expect((closed.reason as AggregateError).errors[0]).toBe(receiverFailure);
          expect((closed.reason as AggregateError).errors[1]).toBe(storeFailure);
        } else expect(closed.reason).toBe(receiverFailure);
        await rejects(stores.runs.readRuntimeScope(receiver.scope), /run store is closed/);
      } finally {
        try {
          if (restore !== undefined) await restore();
        } finally {
          try {
            await stores.close();
          } finally {
            rmSync(directory, { recursive: true });
          }
        }
      }
    },
  );
