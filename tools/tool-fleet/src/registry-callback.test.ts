import { expect, test } from 'bun:test';

import { admitRegistryBackup } from './registry-backup-admission';
import { openRegistryBackupVersions } from './registry-backup-provider';
import { invokeRegistryCallback } from './registry-callback';
import { registryClusterFixture } from './registry-maintenance-cluster.fixture';
import { requireRejection } from './registry-rejection.fixture';

for (const [name, value] of [
  ['undefined', undefined],
  ['null', null],
  ['false', false],
  ['zero', 0],
  ['string', 'owned'],
  ['object', { owned: true }],
  ['error-value', new Error('owned fulfilled error')],
] as const) {
  test(
    'callback adapter invokes once immediately and fulfills the exact value: ' + name,
    async () => {
      let calls = 0;
      const pending = invokeRegistryCallback(() => {
        calls++;
        return value;
      });
      expect(calls).toBe(1);
      expect(pending).toBeInstanceOf(Promise);
      expect(await pending).toBe(value);
      expect(calls).toBe(1);
    },
  );
}
for (const [name, cause] of [
  ['error', new Error('owned throw')],
  ['aggregate', new AggregateError([new Error('owned member')], 'owned aggregate')],
  ['undefined', undefined],
  ['null', null],
  ['string', 'owned throw'],
] as const) {
  test(
    'callback adapter converts a synchronous throw into exact Promise rejection: ' + name,
    async () => {
      let calls = 0;
      const pending = invokeRegistryCallback(() => {
        calls++;
        // This intentional malformed throw verifies that nullish rejection is never mistaken for callback completion.
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw cause;
      });
      expect(calls).toBe(1);
      expect((await requireRejection(pending)).cause).toBe(cause);
      expect(calls).toBe(1);
    },
  );
}
test('callback adapter adopts native fulfillment into a fresh Promise with the existing async ordering', async () => {
  const value = { owned: true };
  const original = Promise.resolve(value);
  const trace: string[] = ['before'];
  const pending = invokeRegistryCallback(() => {
    trace.push('body');
    return original;
  });
  expect(trace).toEqual(['before', 'body']);
  expect(pending).not.toBe(original);
  trace.push('after');
  const settled = pending.then((received) => {
    expect(received).toBe(value);
    trace.push('fulfilled');
  });
  queueMicrotask(() => {
    trace.push('tick');
  });
  await settled;
  expect(trace).toEqual(['before', 'body', 'after', 'tick', 'fulfilled']);
});
test('callback adapter adopts a rejected native Promise without reusing it or replacing its cause', async () => {
  const cause = new Error('owned returned rejection');
  const original = Promise.reject(cause);
  const pending = invokeRegistryCallback(() => original);
  const refused = await requireRejection(pending);
  expect(pending).not.toBe(original);
  expect(refused.cause).toBe(cause);
});
test('callback adapter adopts a foreign thenable with exact fulfillment', async () => {
  const value = { owned: true };
  let calls = 0;
  const thenable = {
    then(resolve: (received: typeof value) => void) {
      calls++;
      resolve(value);
    },
  };
  const pending = invokeRegistryCallback(() => thenable);
  expect(pending).toBeInstanceOf(Promise);
  expect(await pending).toBe(value);
  expect(calls).toBe(1);
});
test('callback adapter retains the exact error of a synchronous then getter', async () => {
  const cause = new Error('owned then getter');
  let calls = 0;
  const thenable = {
    get then(): never {
      calls++;
      throw cause;
    },
  };
  const pending = invokeRegistryCallback(() => thenable);
  expect(calls).toBe(1);
  expect((await requireRejection(pending)).cause).toBe(cause);
});

for (const [name, invoke] of [
  ['backup admission', admitRegistryBackup],
  ['backup versions', openRegistryBackupVersions],
] as const) {
  test('registry port keeps unavailable input as a rejected native Promise: ' + name, async () => {
    const pending: unknown = Reflect.apply(invoke, undefined, []);
    expect((await requireRejection(pending)).cause).toBeInstanceOf(Error);
  });
}
test('cluster fixture reader keeps a synchronous lookup failure as exact Promise rejection', async () => {
  const proof = registryClusterFixture();
  const cause = new Error('owned lookup failure');
  const selected = {
    get kind(): never {
      throw cause;
    },
    name: 'owned',
  };
  const pending: unknown = Reflect.apply(proof.read, undefined, ['management', selected]);
  expect((await requireRejection(pending)).cause).toBe(cause);
});

test('backup admission remains closed before a storage effect', async () => {
  let stored = false;
  const admission: unknown = Reflect.apply(admitRegistryBackup, undefined, []);
  const refusal = await requireRejection(
    Promise.resolve(admission).then(() => {
      stored = true;
    }),
  );
  expect(refusal.cause).toMatchObject({ code: 'backup-budget-unavailable' });
  expect(stored).toBe(false);
});
