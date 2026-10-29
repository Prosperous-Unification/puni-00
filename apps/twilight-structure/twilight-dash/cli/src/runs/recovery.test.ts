import { organizationId } from './record-codecs';
import { FixtureClock } from './testing/fixtures';
import { createMemoryStores } from './testing/memory-stores';
import { recoveryContract } from './testing/recovery-contract';

recoveryContract('memory recovery', async () => {
  const clock = new FixtureClock();
  return await Promise.resolve({
    ...createMemoryStores({
      organizationId: organizationId('organization'),
      capacity: 1,
      leaseMilliseconds: 100,
      clock,
    }),
    clock,
  });
});

import { rejects } from 'node:assert/strict';

import { test } from 'bun:test';

import type { Run } from './records';
import { prepareSession, unwrapReply } from './testing/fixtures';
import {
  createRecoveryFenceCall,
  createRecoveryObservationCall,
} from './testing/recovery-contract';
import { authorityRequest, runtimePin, runtimeScope } from './testing/runtime-history-contract';

test('memory recovery fence complete audit rejects unrelated run drift before immutable replay', async () => {
  const clock = new FixtureClock();
  const stores = {
    ...createMemoryStores({
      organizationId: organizationId('organization'),
      capacity: 1,
      leaseMilliseconds: 100,
      clock,
    }),
    clock,
  };
  let retained: Run | undefined;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- Restored below; the captured method always receives its original Map receiver.
  const set = Map.prototype.set;
  Map.prototype.set = function (identity, value) {
    if (
      typeof value === 'object' &&
      value !== null &&
      'runId' in value &&
      'manifestDigest' in value &&
      'revision' in value
    )
      retained = value as Run;
    return set.call(this, identity, value);
  };
  let setup: Awaited<ReturnType<typeof prepareSession>>;
  try {
    setup = await prepareSession(stores);
  } finally {
    Map.prototype.set = set;
  }
  const scope = { ...runtimeScope, personId: 'isolated' };
  unwrapReply(await stores.runs.pinRuntimeScope(setup.ownership, { ...runtimePin, scope }));
  const original = unwrapReply(
    await stores.runs.stageRuntimeRequest(
      { ownership: setup.ownership, scope, expectedRevision: 0 },
      authorityRequest('isolated-original', 2, scope),
    ),
  );
  const begin = {
    kind: 'authority' as const,
    guard: { ownership: setup.ownership, scope, expectedRevision: 1, expectedRecoveryRevision: 0 },
    intent: {
      version: 1 as const,
      recoveryId: 'recover-isolated',
      target: { kind: 'authority' as const, original },
      begunScopeRevision: 1,
      resolver: setup.owner,
    },
  };
  unwrapReply(await stores.runs.beginRecovery(begin));
  const call = await createRecoveryFenceCall(stores.artifacts, begin);
  unwrapReply(await stores.runs.stageRecoveryFence(call));
  if (retained === undefined) throw new Error('fixture did not capture retained run');
  Object.assign(retained, { revision: retained.revision + 1 });
  await rejects(stores.runs.stageRecoveryFence(call), /run.*revision|revision.*run/);
});

test('memory recovery observation complete audit rejects unrelated run drift before immutable replay', async () => {
  const clock = new FixtureClock();
  const stores = {
    ...createMemoryStores({
      organizationId: organizationId('organization'),
      capacity: 1,
      leaseMilliseconds: 100,
      clock,
    }),
    clock,
  };
  let retained: Run | undefined;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- Restored below; the captured method always receives its original Map receiver.
  const set = Map.prototype.set;
  Map.prototype.set = function (identity, value) {
    if (
      typeof value === 'object' &&
      value !== null &&
      'runId' in value &&
      'manifestDigest' in value &&
      'revision' in value
    )
      retained = value as Run;
    return set.call(this, identity, value);
  };
  let setup: Awaited<ReturnType<typeof prepareSession>>;
  try {
    setup = await prepareSession(stores);
  } finally {
    Map.prototype.set = set;
  }
  const scope = { ...runtimeScope, personId: 'isolated' };
  unwrapReply(await stores.runs.pinRuntimeScope(setup.ownership, { ...runtimePin, scope }));
  const original = unwrapReply(
    await stores.runs.stageRuntimeRequest(
      { ownership: setup.ownership, scope, expectedRevision: 0 },
      authorityRequest('isolated-original', 2, scope),
    ),
  );
  const begin = {
    kind: 'authority' as const,
    guard: { ownership: setup.ownership, scope, expectedRevision: 1, expectedRecoveryRevision: 0 },
    intent: {
      version: 1 as const,
      recoveryId: 'recover-isolated',
      target: { kind: 'authority' as const, original },
      begunScopeRevision: 1,
      resolver: setup.owner,
    },
  };
  unwrapReply(await stores.runs.beginRecovery(begin));
  const call = await createRecoveryFenceCall(stores.artifacts, begin);
  unwrapReply(await stores.runs.stageRecoveryFence(call));
  const observedCall = await createRecoveryObservationCall(stores.artifacts, call);
  unwrapReply(await stores.runs.recordRecoveryFence(observedCall));
  if (retained === undefined) throw new Error('fixture did not capture retained run');
  Object.assign(retained, { revision: retained.revision + 1 });
  await rejects(stores.runs.recordRecoveryFence(observedCall), /run.*revision|revision.*run/);
});
