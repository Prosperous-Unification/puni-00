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

import { planRecoveryResolution, replayRecoveryResolution } from './plan-recovery';
import { reconstructRuntimePrefix } from './plan-recovery-history';
import { createRecoveryResolveCall } from './testing/recovery-contract';
import { authorityReceipt } from './testing/runtime-history-contract';

for (const replacement of [false, true])
  test(
    'recovery closure planner exposes exact authority 1 3 4 historical cuts replacement=' +
      String(replacement),
    async () => {
      const { stores, catalog, begin } = await createPlannerFixture();
      // A complete independent baseline with floor1 followed by original expects2.
      const firstRequest = authorityRequest('first', null);
      const first = {
        ...begin.intent.target.original,
        commandId: 'first',
        canonicalRequest: firstRequest,
        requestDigest: (await import('./runtime-codecs')).digestRuntimeRequest(firstRequest),
        stagedRevision: 1,
      };
      const saved = await stores.artifacts.retainArtifact(
        new TextEncoder().encode(JSON.stringify(authorityReceipt(first))),
        'application/json',
      );
      if (saved.kind !== 'retained') throw new Error('fixture first receipt missing');
      const original = { ...begin.intent.target.original, stagedRevision: 3 };
      const intent = {
        ...begin.intent,
        target: { kind: 'authority' as const, original },
        begunScopeRevision: 3,
      };
      const ownership = begin.guard.ownership;
      const owner = replacement
        ? { ...ownership, epoch: 2, ownerId: ownerId('replacement') }
        : ownership;
      const initial = catalog.runtime.recovery.histories[0];
      Object.assign(catalog, { ownership: { ...catalog.ownership, epoch: owner.epoch, owner } });
      Object.assign(catalog.runtime, {
        scopes: [{ pin: runtimePin, revision: 3 }],
        intents: [first, original],
        acceptances: [
          {
            version: 1,
            commandId: 'first',
            requestDigest: first.requestDigest,
            evidence: saved.reference,
            acceptedRevision: 2,
          },
        ],
      });
      const laterBegin: RecoveryBeginCall = {
        kind: 'authority',
        guard: { ...begin.guard, ownership: owner, expectedRevision: 3 },
        intent: { ...intent, resolver: { ownerId: owner.ownerId, epoch: owner.epoch } },
      };
      const staged = await createRecoveryFenceCall(stores.artifacts, laterBegin, 3);
      const input = await createRecoveryObservationCall(stores.artifacts, staged);
      if (input.input.kind !== 'accepted') throw new Error('accepted fixture missing');
      const observation = { ...input.input, version: 1 as const, observedRevision: 2 };
      Object.assign(initial, {
        intent: laterBegin.intent,
        revision: 2,
        fences: [staged.input.fence],
        observations: [observation],
      });
      Object.assign(catalog.runtime.recovery.counts, { fences: 1, observations: 1 });
      // Use the same real evidence reader for original lookup, supplying a fixture-only port for already-retained fence replies.
      const call = await createRecoveryResolveCall(
        {
          artifacts: stores.artifacts,
          runs: {
            ...stores.runs,
            stageRecoveryFence: () =>
              Promise.resolve({ kind: 'duplicate', value: staged.input.fence }),
            recordRecoveryFence: () => Promise.resolve({ kind: 'duplicate', value: observation }),
          },
        },
        laterBegin,
        true,
      );
      const before = structuredClone(catalog);
      expect(replayRecoveryResolution(catalog, call)).toBeUndefined();
      const plan = unwrapReply(planRecoveryResolution(catalog, call));
      expect(catalog).toEqual(before);
      expect(plan).toMatchObject({
        originalAcceptance: { acceptedRevision: 4 },
        originalExecution: null,
        attempt: null,
        run: null,
        closure: { scopeBefore: 3, scopeAfter: 5 },
        barrier: { generationFloor: 4 },
        counts: { closures: 1, barriers: 1, active: 0 },
        active: [],
      });
      const runtime = {
        ...catalog.runtime,
        scopes: [{ pin: runtimePin, revision: 5 }],
        acceptances: [...catalog.runtime.acceptances, plan.originalAcceptance!],
        recovery: {
          histories: [plan.history],
          barriers: [plan.barrier],
          active: plan.active,
          counts: plan.counts,
        },
      };
      for (const [revision, floor, generation] of [
        [3, 1, 1],
        [4, 3, 3],
        [5, 4, null],
      ] as const) {
        const prefix = reconstructRuntimePrefix(
          runtime.scopes[0],
          runtime,
          catalog.ownership,
          revision,
        );
        expect(prefix.generationFloor).toBe(floor);
        expect(prefix.grant?.authority.generation ?? null).toBe(replacement ? null : generation);
        expect('activeRecoveryId' in prefix).toBe(false);
        expect('recoveries' in prefix).toBe(false);
      }
      await stores.close();
    },
  );
