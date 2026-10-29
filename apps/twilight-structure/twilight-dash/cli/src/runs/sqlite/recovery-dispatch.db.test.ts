import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { organizationId } from '../record-codecs';
import { FixtureClock } from '../testing/fixtures';
import { recoveryDispatchContract } from '../testing/recovery-dispatch-contract';
import { bootstrapSqliteStores } from './open-stores';

recoveryDispatchContract('sqlite', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'recovery-dispatch-'));
  const clock = new FixtureClock();
  const stores = await bootstrapSqliteStores({
    path: join(directory, 'runs.sqlite'),
    organizationId: organizationId('org-a'),
    capacity: 1,
    leaseMilliseconds: 100,
    clock,
    maxBusyAttempts: 2,
    busyDelayMilliseconds: 1,
  });
  return {
    ...stores,
    clock,
    async close() {
      await closeRecoveryResources([
        stores,
        {
          close: () => {
            rmSync(directory, { recursive: true });
          },
        },
      ]);
    },
  };
});

import { expect, test } from 'bun:test';

import { dispatchRecovery } from '../dispatch-recovery';
import { beginAuthority } from '../testing/recovery-dispatch-contract';
import { closeRecoveryResources, createRecoveryReceiver } from '../testing/recovery-receiver';
import { openSqliteStores } from './open-stores';

for (const cut of ['before-send', 'lost-reply'] as const)
  test('SQLite reopens exact receiver fence after ' + cut, async () => {
    const directory = mkdtempSync(join(tmpdir(), 'recovery-reopen-'));
    const clock = new FixtureClock();
    const options = {
      path: join(directory, 'runs.sqlite'),
      organizationId: organizationId('org-a'),
      capacity: 1,
      leaseMilliseconds: 100,
      clock,
      maxBusyAttempts: 2,
      busyDelayMilliseconds: 1,
    };
    let stores = await bootstrapSqliteStores(options);
    const receiver = await createRecoveryReceiver();
    try {
      const { call } = await beginAuthority({ ...stores, clock }, receiver, null);
      const cancellation = new AbortController();
      const reply = await dispatchRecovery(
        {
          ...stores.runs,
          async stageRecoveryFence(input) {
            const ack = await stores.runs.stageRecoveryFence(input);
            if (cut === 'before-send') cancellation.abort();
            return ack;
          },
        },
        stores.artifacts,
        {
          ...receiver.client,
          async acquireAuthority(input) {
            await receiver.client.acquireAuthority(input);
            return {
              reply: {
                kind: 'failure',
                failure: { code: 'transport', cause: new Error('reply lost') },
              },
              response: null,
            };
          },
        },
        call,
        cancellation.signal,
      );
      expect(reply).toMatchObject({ kind: 'pending' });
      const before = await stores.runs.readRuntimeScope(receiver.scope);
      if (before.kind !== 'pinned' || before.version !== 2) throw new Error('scope absent');
      await stores.close();
      stores = await openSqliteStores(options);
      expect(await stores.runs.readRuntimeScope(receiver.scope)).toEqual(before);
      expect(
        await dispatchRecovery(
          stores.runs,
          stores.artifacts,
          receiver.client,
          {
            ...call,
            guard: { ...call.guard, expectedRecoveryRevision: before.recoveries[0].revision },
          },
          new AbortController().signal,
        ),
      ).toMatchObject({ kind: 'resolved' });
      expect(await stores.runs.readRuntimeScope(receiver.scope)).toMatchObject({
        recoveries: [{ fences: before.recoveries[0].fences }],
      });
    } finally {
      await closeRecoveryResources([
        receiver,
        stores,
        {
          close: () => {
            rmSync(directory, { recursive: true });
          },
        },
      ]);
    }
  });
