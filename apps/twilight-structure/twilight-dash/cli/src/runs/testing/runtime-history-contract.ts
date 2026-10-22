import { rejects } from 'node:assert/strict';

import {
  canonicalRuntimeRequest,
  parseCanonicalRuntimeRequest,
  type RuntimeOperation,
  type RuntimeScope,
} from '@wbs/contracts';
import { afterEach, describe, expect, test } from 'bun:test';

import type { ArtifactStore } from '../artifact-store';
import { artifactDigest, ownerId } from '../record-codecs';
import type { ArtifactRef } from '../records';
import { digestRuntimeRequest } from '../runtime-codecs';
import { acceptRuntimeReceipt } from '../runtime-history';
import type { RuntimeGuard, RuntimeIntent } from '../runtime-records';
import { createManifest, createRun, unwrapReply } from './fixtures';
import type { StoreFixture } from './run-store-contract';

export const runtimeScope: RuntimeScope = {
  organizationId: 'organization',
  projectId: 'project',
  personId: 'person',
};
export const runtimePin = { version: 1 as const, scope: runtimeScope, ledgerId: 'ledger' };
export function authorityRequest(
  commandId = 'acquire',
  expectedGeneration: number | null = null,
  scope = runtimeScope,
): string {
  return canonicalRuntimeRequest(scope, {
    schemaVersion: 1,
    kind: 'authority',
    commandId,
    expectedLedgerId: 'ledger',
    ownerId: 'receiver-owner',
    expectedGeneration,
  });
}
export const runtimeEvidence: ArtifactRef = {
  version: 1,
  digest: artifactDigest('a'.repeat(64)),
  byteLength: 1,
  mediaType: 'application/json',
  retention: 'retain',
};
export function authorityReceipt(intent: RuntimeIntent) {
  const { operation } = parseCanonicalRuntimeRequest(intent.canonicalRequest);
  if (!('kind' in operation)) throw new Error('fixture requires authority');
  return {
    schemaVersion: 1,
    ledgerId: 'ledger',
    scope: runtimeScope,
    commandId: intent.commandId,
    requestDigest: intent.requestDigest,
    actorId: 'account',
    acceptance: {
      kind: 'authority',
      authority: {
        ownerId: 'receiver-owner',
        generation: operation.expectedGeneration === null ? 1 : operation.expectedGeneration + 1,
      },
    },
  };
}

/** One semantic authority-history contract exercises both independently persisted providers. */
export function runtimeHistoryContract(
  name: string,
  create: () => Promise<StoreFixture & { artifacts: ArtifactStore }>,
): void {
  describe(name, () => {
    const opened: StoreFixture[] = [];
    afterEach(() => {
      for (const fixture of opened.splice(0)) fixture.close();
    });
    async function fixture() {
      const stores = await create();
      opened.push(stores);
      const ownership = unwrapReply(await stores.runs.acquireOwnership(ownerId('local-A'), 0));
      const guard: RuntimeGuard = {
        ownership,
        scope: structuredClone(runtimeScope),
        expectedRevision: 0,
      };
      return { ...stores, guard };
    }
    test('authority history port exists before any run', async () => {
      const stores = await fixture();
      expect(typeof stores.runs.pinRuntimeScope).toBe('function');
      expect(typeof stores.runs.readRuntimeScope).toBe('function');
      expect(typeof stores.runs.stageRuntimeRequest).toBe('function');
      expect(typeof stores.runs.recordRuntimeAcceptance).toBe('function');
      expect(await stores.runs.readRuntimeScope(runtimeScope)).toEqual({
        version: 1,
        kind: 'uninitialized',
        scope: runtimeScope,
        ownerEpoch: 1,
      });
      await rejects(
        stores.runs.stageRuntimeRequest(stores.guard, authorityRequest()),
        /runtime scope is not pinned/,
      );
    });
    test('pin is immutable and authority history never changes runs or capacity', async () => {
      const stores = await fixture();
      unwrapReply(await stores.runs.retainManifest(stores.guard.ownership, createManifest()));
      const run = unwrapReply(await stores.runs.createRun(stores.guard.ownership, createRun()));
      const before = await stores.runs.readRun(run.runId);
      expect(await stores.runs.pinRuntimeScope(stores.guard.ownership, runtimePin)).toEqual({
        kind: 'applied',
        value: runtimePin,
      });
      expect(await stores.runs.pinRuntimeScope(stores.guard.ownership, runtimePin)).toEqual({
        kind: 'duplicate',
        value: runtimePin,
      });
      expect(
        await stores.runs.pinRuntimeScope(stores.guard.ownership, {
          ...runtimePin,
          ledgerId: 'other',
        }),
      ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
      const intent = unwrapReply(
        await stores.runs.stageRuntimeRequest(stores.guard, authorityRequest()),
      );
      expect(intent.localOwner).toEqual({ ownerId: ownerId('local-A'), epoch: 1 });
      expect(intent.stagedRevision).toBe(1);
      const accepted = unwrapReply(
        await stores.runs.recordRuntimeAcceptance(
          { ...stores.guard, expectedRevision: 1 },
          { intent, evidence: runtimeEvidence },
        ),
      );
      expect(accepted.acceptedRevision).toBe(2);
      expect(await stores.runs.readRuntimeScope(runtimeScope)).toMatchObject({
        revision: 2,
        pendingCommandId: null,
        grant: {
          localEpoch: 1,
          commandId: intent.commandId,
          authority: { ownerId: 'receiver-owner', generation: 1 },
        },
      });
      expect(await stores.runs.readRun(run.runId)).toEqual(before);
    });
    test('one pending command serializes requests and exact duplicates precede old revision checks', async () => {
      const stores = await fixture();
      unwrapReply(await stores.runs.pinRuntimeScope(stores.guard.ownership, runtimePin));
      const intent = unwrapReply(
        await stores.runs.stageRuntimeRequest(stores.guard, authorityRequest()),
      );
      expect(await stores.runs.stageRuntimeRequest(stores.guard, authorityRequest())).toEqual({
        kind: 'duplicate',
        value: intent,
      });
      expect(
        await stores.runs.stageRuntimeRequest(
          { ...stores.guard, expectedRevision: 1 },
          authorityRequest('next'),
        ),
      ).toEqual({ kind: 'refused', reason: 'state_conflict' });
      expect(
        await stores.runs.stageRuntimeRequest(stores.guard, authorityRequest('acquire', 2)),
      ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
      expect(
        await stores.runs.recordRuntimeAcceptance(stores.guard, {
          intent,
          evidence: runtimeEvidence,
        }),
      ).toEqual({ kind: 'refused', reason: 'revision_conflict' });
      const accepted = unwrapReply(
        await stores.runs.recordRuntimeAcceptance(
          { ...stores.guard, expectedRevision: 1 },
          { intent, evidence: runtimeEvidence },
        ),
      );
      expect(
        await stores.runs.recordRuntimeAcceptance(stores.guard, {
          intent,
          evidence: runtimeEvidence,
        }),
      ).toEqual({ kind: 'duplicate', value: accepted });
      expect(
        await stores.runs.recordRuntimeAcceptance(stores.guard, {
          intent,
          evidence: { ...runtimeEvidence, byteLength: 2 },
        }),
      ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
      expect(
        await stores.runs.recordRuntimeAcceptance(stores.guard, {
          intent: { ...intent, localOwner: { ...intent.localOwner, epoch: 2 } },
          evidence: runtimeEvidence,
        }),
      ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
      expect(
        await stores.runs.stageRuntimeRequest(
          { ...stores.guard, expectedRevision: 2 },
          authorityRequest('next'),
        ),
      ).toEqual({ kind: 'refused', reason: 'authority_conflict' });
      expect(
        await stores.runs.stageRuntimeRequest(stores.guard, authorityRequest('next', 1)),
      ).toEqual({ kind: 'refused', reason: 'revision_conflict' });
    });
    test('replacement records old acceptance as history and maps only its own epoch', async () => {
      const stores = await fixture();
      unwrapReply(await stores.runs.pinRuntimeScope(stores.guard.ownership, runtimePin));
      const old = unwrapReply(
        await stores.runs.stageRuntimeRequest(stores.guard, authorityRequest()),
      );
      stores.clock.advance(100);
      const owner = unwrapReply(await stores.runs.acquireOwnership(ownerId('local-B'), 1));
      const guard = { ...stores.guard, ownership: owner, expectedRevision: 1 };
      const accepted = unwrapReply(
        await stores.runs.recordRuntimeAcceptance(guard, {
          intent: old,
          evidence: runtimeEvidence,
        }),
      );
      expect(await stores.runs.readRuntimeScope(runtimeScope)).toMatchObject({
        grant: null,
        ownerEpoch: 2,
        revision: 2,
      });
      const own = unwrapReply(
        await stores.runs.stageRuntimeRequest(
          { ...guard, expectedRevision: 2 },
          authorityRequest('replacement', 5),
        ),
      );
      unwrapReply(
        await stores.runs.recordRuntimeAcceptance(
          { ...guard, expectedRevision: 3 },
          { intent: own, evidence: runtimeEvidence },
        ),
      );
      const current = await stores.runs.readRuntimeScope(runtimeScope);
      expect(current).toMatchObject({
        revision: 4,
        grant: {
          localEpoch: 2,
          commandId: own.commandId,
          authority: { ownerId: 'receiver-owner', generation: 6 },
        },
      });
      expect(
        await stores.runs.stageRuntimeRequest(
          { ...guard, expectedRevision: 0 },
          old.canonicalRequest,
        ),
      ).toEqual({ kind: 'duplicate', value: old });
      expect(
        await stores.runs.recordRuntimeAcceptance(
          { ...guard, expectedRevision: 0 },
          { intent: old, evidence: runtimeEvidence },
        ),
      ).toEqual({ kind: 'duplicate', value: accepted });
      expect(await stores.runs.readRuntimeScope(runtimeScope)).toEqual(current);
    });
    test('late acceptance across increasing local epochs preserves historical order and maps only the latest epoch', async () => {
      const stores = await fixture();
      unwrapReply(await stores.runs.pinRuntimeScope(stores.guard.ownership, runtimePin));
      let ownership = stores.guard.ownership;
      for (const [commandId, expectedGeneration, expectedRevision, nextOwner] of [
        ['epoch-1', null, 0, 'local-B'],
        ['epoch-2', 1, 2, 'local-C'],
        ['epoch-3', 2, 4, null],
      ] as const) {
        const intent = unwrapReply(
          await stores.runs.stageRuntimeRequest(
            { ownership, scope: runtimeScope, expectedRevision },
            authorityRequest(commandId, expectedGeneration),
          ),
        );
        if (nextOwner !== null) {
          stores.clock.advance(100);
          ownership = unwrapReply(
            await stores.runs.acquireOwnership(ownerId(nextOwner), ownership.epoch),
          );
        }
        const artifact = await stores.artifacts.retainArtifact(
          new TextEncoder().encode(JSON.stringify(authorityReceipt(intent))),
          'application/json',
        );
        if (artifact.kind !== 'retained') throw new Error('fixture receipt refused');
        unwrapReply(
          await acceptRuntimeReceipt(
            stores.runs,
            stores.artifacts,
            { ownership, scope: runtimeScope, expectedRevision: expectedRevision + 1 },
            intent,
            artifact.reference,
          ),
        );
        if (nextOwner !== null)
          expect(await stores.runs.readRuntimeScope(runtimeScope)).toMatchObject({ grant: null });
      }
      const history = await stores.runs.readRuntimeScope(runtimeScope);
      expect(history.kind).toBe('pinned');
      if (history.kind !== 'pinned') throw new Error('fixture history not pinned');
      expect(history.intents.map((intent) => intent.localOwner.epoch)).toEqual([1, 2, 3]);
      expect(history).toMatchObject({
        revision: 6,
        ownerEpoch: 3,
        pendingCommandId: null,
        grant: {
          localEpoch: 3,
          commandId: 'epoch-3',
          authority: { ownerId: 'receiver-owner', generation: 3 },
        },
      });
    });
    test('owner fencing precedes corrupt or absent targets and scope mismatch refuses', async () => {
      const stores = await fixture();
      stores.clock.advance(100);
      const guard = { ...stores.guard, scope: { ...runtimeScope, personId: 'absent' } };
      expect(await stores.runs.stageRuntimeRequest(guard, 'corrupt')).toEqual({
        kind: 'refused',
        reason: 'owner_stale',
      });
      expect(
        await stores.runs.recordRuntimeAcceptance(guard, {
          intent: {
            version: 1,
            commandId: 'absent',
            canonicalRequest: authorityRequest('absent'),
            requestDigest: artifactDigest('a'.repeat(64)),
            localOwner: { ownerId: guard.ownership.ownerId, epoch: guard.ownership.epoch },
            stagedRevision: 1,
          },
          evidence: runtimeEvidence,
        }),
      ).toEqual({ kind: 'refused', reason: 'owner_stale' });
      expect(await stores.runs.pinRuntimeScope(guard.ownership, runtimePin)).toEqual({
        kind: 'refused',
        reason: 'owner_stale',
      });
      const owner = unwrapReply(await stores.runs.acquireOwnership(ownerId('local-B'), 1));
      expect(
        await stores.runs.pinRuntimeScope(owner, {
          ...runtimePin,
          scope: { ...runtimeScope, organizationId: 'foreign' },
        }),
      ).toEqual({ kind: 'refused', reason: 'authority_conflict' });
      await rejects(stores.runs.readRuntimeScope({ ...runtimeScope, organizationId: 'foreign' }));
      unwrapReply(await stores.runs.pinRuntimeScope(owner, runtimePin));
      unwrapReply(
        await stores.runs.pinRuntimeScope(owner, {
          ...runtimePin,
          scope: { ...runtimeScope, personId: 'other' },
        }),
      );
      expect(
        await stores.runs.stageRuntimeRequest(
          { ...stores.guard, ownership: owner },
          authorityRequest('other', null, { ...runtimeScope, personId: 'other' }),
        ),
      ).toEqual({ kind: 'refused', reason: 'authority_conflict' });
    });
    test('canonical bytes and supported authority requests are strict without a new identity cap', async () => {
      const stores = await fixture();
      unwrapReply(await stores.runs.pinRuntimeScope(stores.guard.ownership, runtimePin));
      expect(
        await stores.runs.stageRuntimeRequest(
          stores.guard,
          authorityRequest().replace('"expectedLedgerId":"ledger"', '"expectedLedgerId":"other"'),
        ),
      ).toEqual({ kind: 'refused', reason: 'authority_conflict' });
      await rejects(stores.runs.stageRuntimeRequest(stores.guard, ' ' + authorityRequest()));
      await rejects(
        stores.runs.stageRuntimeRequest(
          stores.guard,
          authorityRequest().replace(
            '"ownerId":"receiver-owner"',
            '"ownerId":"receiver-owner","extra":true',
          ),
        ),
      );
      const operation: RuntimeOperation = {
        schemaVersion: 1,
        commandId: 'claim',
        expectedLedgerId: 'ledger',
        authority: { ownerId: 'receiver-owner', generation: 1 },
        expectedBasis: `rb1:${'a'.repeat(64)}`,
        action: {
          kind: 'claim',
          workItemId: 'work',
          stepId: 'step',
          parentClaimId: null,
          execution: { storeId: 'store', runId: 'run', attemptId: 'attempt', sessionId: 'session' },
        },
      };
      expect(
        await stores.runs.stageRuntimeRequest(
          stores.guard,
          canonicalRuntimeRequest(runtimeScope, operation),
        ),
      ).toEqual({ kind: 'refused', reason: 'state_conflict' });
      const write: RuntimeOperation = {
        ...operation,
        commandId: 'write',
        action: {
          kind: 'write',
          claim: {
            workItemId: 'work',
            stepId: 'step',
            parentClaimId: null,
            claimId: 'claim',
            execution: {
              storeId: 'store',
              runId: 'run',
              attemptId: 'attempt',
              sessionId: 'session',
            },
          },
          commands: [{ kind: 'setProgress', workItemId: 'work', stepId: 'step', state: 'done' }],
        },
      };
      expect(
        await stores.runs.stageRuntimeRequest(
          stores.guard,
          canonicalRuntimeRequest(runtimeScope, write),
        ),
      ).toEqual({ kind: 'refused', reason: 'state_conflict' });
      expect(
        (await stores.runs.stageRuntimeRequest(stores.guard, authorityRequest('x'.repeat(300))))
          .kind,
      ).toBe('applied');
    });
    test('global command identities cannot cross scopes and submitted replies are detached', async () => {
      const stores = await fixture();
      const pin = structuredClone(runtimePin);
      const pending = stores.runs.pinRuntimeScope(stores.guard.ownership, pin);
      Object.assign(pin.scope, { personId: 'mutated' });
      const pinned = unwrapReply(await pending);
      expect(pinned).toEqual(runtimePin);
      const secondScope = { ...runtimeScope, personId: 'second' };
      unwrapReply(
        await stores.runs.pinRuntimeScope(stores.guard.ownership, {
          ...runtimePin,
          scope: secondScope,
        }),
      );
      const intent = unwrapReply(
        await stores.runs.stageRuntimeRequest(stores.guard, authorityRequest()),
      );
      expect(
        await stores.runs.stageRuntimeRequest(
          { ...stores.guard, scope: secondScope },
          authorityRequest('acquire', null, secondScope),
        ),
      ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
      const original = structuredClone(intent);
      const input = { intent: structuredClone(intent), evidence: structuredClone(runtimeEvidence) };
      const accepting = stores.runs.recordRuntimeAcceptance(
        { ...stores.guard, expectedRevision: 1 },
        input,
      );
      Object.assign(input.intent.localOwner, { ownerId: 'mutated' });
      Object.assign(input.evidence, { byteLength: 2 });
      const accepted = unwrapReply(await accepting);
      Object.assign(intent.localOwner, { ownerId: 'mutated' });
      Object.assign(accepted.evidence, { byteLength: 3 });
      const snapshot = await stores.runs.readRuntimeScope(runtimeScope);
      expect(snapshot).toMatchObject({
        intents: [original],
        acceptances: [{ evidence: runtimeEvidence }],
      });
      if (snapshot.kind !== 'pinned') throw new Error('expected pin');
      Object.assign(snapshot.pin.scope, { personId: 'mutated' });
      expect(await stores.runs.readRuntimeScope(runtimeScope)).toMatchObject({ pin: runtimePin });
    });
    test('expired local lease retains inspectable epoch mapping until takeover', async () => {
      const stores = await fixture();
      unwrapReply(await stores.runs.pinRuntimeScope(stores.guard.ownership, runtimePin));
      const intent = unwrapReply(
        await stores.runs.stageRuntimeRequest(stores.guard, authorityRequest()),
      );
      unwrapReply(
        await stores.runs.recordRuntimeAcceptance(
          { ...stores.guard, expectedRevision: 1 },
          { intent, evidence: runtimeEvidence },
        ),
      );
      stores.clock.advance(100);
      expect(await stores.runs.readRuntimeScope(runtimeScope)).toMatchObject({
        ownerEpoch: 1,
        grant: { localEpoch: 1, authority: { ownerId: 'receiver-owner', generation: 1 } },
      });
      expect(await stores.runs.stageRuntimeRequest(stores.guard, intent.canonicalRequest)).toEqual({
        kind: 'refused',
        reason: 'owner_stale',
      });
      unwrapReply(await stores.runs.acquireOwnership(ownerId('local-B'), 1));
      expect(await stores.runs.readRuntimeScope(runtimeScope)).toMatchObject({
        ownerEpoch: 2,
        grant: null,
      });
    });
    test('receiver generation overflow throws before accepting or changing history', async () => {
      const stores = await fixture();
      unwrapReply(await stores.runs.pinRuntimeScope(stores.guard.ownership, runtimePin));
      const intent = unwrapReply(
        await stores.runs.stageRuntimeRequest(
          stores.guard,
          authorityRequest('overflow', Number.MAX_SAFE_INTEGER),
        ),
      );
      const before = await stores.runs.readRuntimeScope(runtimeScope);
      await rejects(
        stores.runs.recordRuntimeAcceptance(
          { ...stores.guard, expectedRevision: 1 },
          { intent, evidence: runtimeEvidence },
        ),
      );
      expect(await stores.runs.readRuntimeScope(runtimeScope)).toEqual(before);
    });
  });
}

/** A valid unsupported wire write used only to prove dependent response-order validation before the authority-only persistence boundary. */
export function dependentReceiptFixture() {
  const operation: RuntimeOperation = {
    schemaVersion: 1,
    commandId: 'write-fixture',
    expectedLedgerId: 'ledger',
    authority: { ownerId: 'receiver-owner', generation: 1 },
    expectedBasis: `rb1:${'a'.repeat(64)}`,
    action: {
      kind: 'write',
      claim: {
        claimId: 'claim',
        workItemId: 'work',
        stepId: 'step',
        parentClaimId: null,
        execution: { storeId: 'store', runId: 'run', attemptId: 'attempt', sessionId: 'session' },
      },
      commands: [{ kind: 'setProgress', workItemId: 'work', stepId: 'step', state: 'done' }],
    },
  };
  if (operation.action.kind !== 'write') throw new Error('fixture write missing');
  const canonicalRequest = canonicalRuntimeRequest(runtimeScope, operation);
  const intent: RuntimeIntent = {
    version: 1,
    commandId: operation.commandId,
    canonicalRequest,
    requestDigest: digestRuntimeRequest(canonicalRequest),
    localOwner: { ownerId: ownerId('local'), epoch: 1 },
    stagedRevision: 1,
  };
  return {
    intent,
    receipt: {
      schemaVersion: 1,
      ledgerId: 'ledger',
      scope: runtimeScope,
      commandId: intent.commandId,
      requestDigest: intent.requestDigest,
      actorId: 'account',
      acceptance: {
        kind: 'write',
        authority: operation.authority,
        claim: operation.action.claim,
        basisAfter: `rb1:${'b'.repeat(64)}`,
        applied: [{ index: 1, kind: 'setProgress' }],
      },
    },
  };
}
