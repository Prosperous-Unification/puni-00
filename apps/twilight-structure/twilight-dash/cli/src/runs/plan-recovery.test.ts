import { expect, test } from 'bun:test';

import { planRecoveryFence, planRecoveryObservation } from './plan-recovery';
import { organizationId, ownerId } from './record-codecs';
import type { RecoveryBeginCall } from './recovery-records';
import { FixtureClock, unwrapReply } from './testing/fixtures';
import { createMemoryStores } from './testing/memory-stores';
import {
  createRecoveryFenceCall,
  createRecoveryObservationCall,
} from './testing/recovery-contract';
import { authorityRequest, runtimePin, runtimeScope } from './testing/runtime-history-contract';
import type { HistoryCatalog } from './validate-history';

async function createPlannerFixture() {
  const stores = createMemoryStores({
    organizationId: organizationId('organization'),
    capacity: 1,
    leaseMilliseconds: 100,
    clock: new FixtureClock(),
  });
  const ownership = unwrapReply(await stores.runs.acquireOwnership(ownerId('owner'), 0));
  unwrapReply(await stores.runs.pinRuntimeScope(ownership, runtimePin));
  const original = unwrapReply(
    await stores.runs.stageRuntimeRequest(
      { ownership, scope: runtimeScope, expectedRevision: 0 },
      authorityRequest('original', 2),
    ),
  );
  const begin: RecoveryBeginCall = {
    kind: 'authority',
    guard: { ownership, scope: runtimeScope, expectedRevision: 1, expectedRecoveryRevision: 0 },
    intent: {
      version: 1,
      recoveryId: 'recover',
      target: { kind: 'authority', original },
      begunScopeRevision: 1,
      resolver: { ownerId: ownership.ownerId, epoch: ownership.epoch },
    },
  };
  const history = unwrapReply(await stores.runs.beginRecovery(begin));
  const catalog: HistoryCatalog = {
    ownership: {
      storeId: ownership.storeId,
      organizationId: ownership.organizationId,
      epoch: ownership.epoch,
      owner: ownership,
    },
    runtime: {
      scopes: [{ pin: runtimePin, revision: 1 }],
      intents: [original],
      acceptances: [],
      recovery: {
        histories: [history],
        barriers: [],
        active: [{ scope: runtimeScope, recoveryId: 'recover' }],
        counts: { journals: 1, fences: 0, observations: 0, closures: 0, barriers: 0, active: 1 },
      },
    },
    manifests: [],
    runs: [],
    attempts: [],
    executions: [],
    consumptions: [],
    completions: [],
    receipts: [],
    decisions: [],
    reservations: [],
    capacity: 1,
  };
  const call = await createRecoveryFenceCall(stores.artifacts, begin);
  return { catalog, call, stores, begin };
}

test('recovery fence planner computes recovery revision without mutating its audited predecessor', async () => {
  const { catalog, call } = await createPlannerFixture();
  const before = structuredClone(catalog);
  expect(planRecoveryFence(catalog, call)).toEqual({ kind: 'applied', value: call.input.fence });
  expect(catalog).toEqual(before);
});

test('recovery fence planner rejects missing named journal instead of defaulting', async () => {
  const { catalog, call } = await createPlannerFixture();
  Object.assign(call, { recoveryId: 'absent' });
  expect(() => planRecoveryFence(catalog, call)).toThrow('recovery journal does not exist');
});

test('recovery fence planner refuses malformed canonical digest before retained identity replay', async () => {
  const { catalog, call } = await createPlannerFixture();
  Object.assign(call.input.fence, { requestDigest: 'f'.repeat(64) });
  expect(() => planRecoveryFence(catalog, call)).toThrow('recovery fence canonical digest differs');
});

test('recovery observation planner is pure and retains full detached reply', async () => {
  const { catalog, call, stores } = await createPlannerFixture();
  const fence = unwrapReply(await stores.runs.stageRecoveryFence(call));
  const observation = await createRecoveryObservationCall(stores.artifacts, call);
  Object.assign(catalog.runtime.recovery.histories[0], { revision: 1, fences: [fence] });
  Object.assign(catalog.runtime.recovery.counts, { fences: 1 });
  const before = structuredClone(catalog);
  expect(planRecoveryObservation(catalog, observation)).toEqual({
    kind: 'applied',
    value: { ...observation.input, version: 1, observedRevision: 2 },
  });
  expect(catalog).toEqual(before);
});
