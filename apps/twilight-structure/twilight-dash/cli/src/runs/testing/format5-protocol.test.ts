import { expect, test } from 'bun:test';

import { decodeOwnership } from '../record-codecs';
import { organizationId } from '../record-codecs';
import { createRun } from './fixtures';
import { FixtureClock, unwrapReply } from './fixtures';
import type { createFormat3Fixture } from './format3-fixture';
import type { Format3Mutation } from './format3-protocol';
import type { createFormat5Fixture } from './format5-fixture';
import {
  decodeFormat5Command,
  decodeFormat5Envelope,
  decodeFormat5Payload,
  decodeFormat5Response,
} from './format5-protocol';
import { createMemoryStores } from './memory-stores';
import { createWriteFixture } from './write-fixture';
type LegacyWorker = Awaited<ReturnType<typeof createFormat3Fixture>>;
type Format5Worker = Awaited<ReturnType<typeof createFormat5Fixture>>;
const legacyRoutes: Exclude<
  Parameters<LegacyWorker['prepareMutation']>[0],
  Format3Mutation
> extends never
  ? true
  : false = true;
const recoveryRoutes: Exclude<
  'beginRecovery' | 'stageRecoveryFence' | 'recordRecoveryFence' | 'resolveRecovery',
  Parameters<Format5Worker['prepareMutation']>[0]
> extends never
  ? true
  : false = true;
const legacyObservationExcluded: 'observeRecovery' extends keyof LegacyWorker ? false : true = true;
test('historical worker signatures select their actual legacy or recovery command domain', () => {
  expect(legacyRoutes).toBe(true);
  expect(legacyObservationExcluded).toBe(true);
  expect(recoveryRoutes).toBe(true);
});
const ownership = decodeOwnership({
  version: 1,
  storeId: 'store',
  organizationId: 'organization',
  ownerId: 'owner',
  epoch: 1,
  expiresAt: 1100,
});
test('format5 prepare payload retains its selected legacy tuple without leaking the envelope action', () => {
  const command = {
    method: 'createRun' as const,
    parameters: [ownership, createRun()] as [typeof ownership, ReturnType<typeof createRun>],
  };
  expect(() => decodeFormat5Payload({ action: 'prepare', ...command })).not.toThrow();
  expect(decodeFormat5Payload({ action: 'prepare', ...command })).toEqual({
    action: 'prepare',
    ...command,
  });
  expect(() => decodeFormat5Payload({ action: 'prepare', ...command, unexpected: true })).toThrow();
});
test('format5 historical admission rejects a valid current Attempt4 at the version boundary', async () => {
  const clock = new FixtureClock();
  const stores = createMemoryStores({
    organizationId: organizationId('organization'),
    capacity: 1,
    leaseMilliseconds: 100,
    clock,
  });
  try {
    const setup = await createWriteFixture({ ...stores, clock });
    const stage = unwrapReply(await stores.runs.stageWrite(setup.guard, setup.command));
    expect(stage.attempt.version).toBe(4);
    expect(() =>
      decodeFormat5Payload({
        action: 'invoke',
        method: 'admitAttempt',
        value: { kind: 'duplicate', value: stage.attempt },
      }),
    ).toThrow('unsupported historical format5 attempt');
  } finally {
    await stores.close();
  }
});
test('format5 command boundary preserves legacy tuple arity and strict unknown fields', () => {
  expect(decodeFormat5Command({ method: 'renewOwnership', parameters: [ownership] })).toEqual({
    method: 'renewOwnership',
    parameters: [ownership],
  });
  expect(() =>
    decodeFormat5Command({ method: 'renewOwnership', parameters: [ownership, ownership] }),
  ).toThrow();
  expect(() =>
    decodeFormat5Command({ method: 'renewOwnership', parameters: [ownership], extra: true }),
  ).toThrow();
});
test('format5 response rejects an independently valid wrong action and preserves nested original errors', () => {
  const reply = decodeFormat5Envelope({
    kind: 'reply',
    requestId: '1',
    payload: { action: 'capture', value: { schema: [], tables: [] } },
  });
  if (reply.kind === 'ready') throw new Error('reply absent');
  expect(() => decodeFormat5Response(reply, { kind: 'invoke', method: 'renewOwnership' })).toThrow(
    'action differs',
  );
  const failure = decodeFormat5Envelope({
    kind: 'error',
    requestId: '1',
    operation: { action: 'invoke', method: 'renewOwnership' },
    error: {
      name: 'Error',
      message: 'outer',
      cause: { name: 'SQLiteError', message: 'original', code: 'SQLITE_BUSY', cause: null },
    },
  });
  if (failure.kind === 'ready') throw new Error('failure absent');
  expect(
    decodeFormat5Response(failure, { kind: 'invoke', method: 'renewOwnership' }),
  ).toMatchObject({
    kind: 'error',
    error: { cause: { code: 'SQLITE_BUSY', message: 'original' } },
  });
  expect(() => decodeFormat5Response(failure, { kind: 'invoke', method: 'createRun' })).toThrow(
    'method differs',
  );
});

test('format5 response rejects an independently valid wrong method', () => {
  const response = decodeFormat5Envelope({
    kind: 'reply',
    requestId: 'correlated',
    payload: {
      action: 'invoke',
      method: 'renewOwnership',
      value: { kind: 'refused', reason: 'owner_stale' },
    },
  });
  if (response.kind === 'ready') throw Error('reply absent');
  expect(() =>
    decodeFormat5Response(response, { kind: 'invoke', method: 'acquireOwnership' }),
  ).toThrow('format5 response method differs');
});
