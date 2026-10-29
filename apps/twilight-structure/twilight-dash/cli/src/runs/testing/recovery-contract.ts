import { rejects } from 'node:assert/strict';

import { afterEach, describe, expect, test } from 'bun:test';

import type { ArtifactStore } from '../artifact-store';
import { acceptClaimReceipt, stageClaimRequest } from '../claim-history';
import { executionCheckpoint } from '../plan-execution';
import { executionCommandId } from '../record-codecs';
import { decodeDecision, decodeReceipt, ownerId } from '../record-codecs';
import type { RecoveryBeginCall } from '../recovery-records';
import { closeFixtures } from './close-fixtures';
import {
  createCompletion,
  createExecutionCommand,
  prepareClaimed,
  prepareSession,
  retainClaimReceipt,
  unwrapReply,
} from './fixtures';
import type { StoreFixture } from './run-store-contract';
import {
  authorityRequest,
  runtimeEvidence,
  runtimePin,
  runtimeScope,
} from './runtime-history-contract';

/** Exercises the same recovery admission and immutable replay contract against independent providers. */
export function recoveryContract(
  name: string,
  create: () => Promise<StoreFixture & { artifacts: ArtifactStore }>,
): void {
  describe(name, () => {
    const opened: StoreFixture[] = [];
    afterEach(async () => {
      await closeFixtures(opened.splice(0));
    });
    async function createAuthorityFixture() {
      const stores = await create();
      opened.push(stores);
      const ownership = unwrapReply(await stores.runs.acquireOwnership(ownerId('local-A'), 0));
      unwrapReply(await stores.runs.pinRuntimeScope(ownership, runtimePin));
      const original = unwrapReply(
        await stores.runs.stageRuntimeRequest(
          { ownership, scope: runtimeScope, expectedRevision: 0 },
          authorityRequest('original', 2),
        ),
      );
      const call: RecoveryBeginCall = {
        kind: 'authority',
        guard: { ownership, scope: runtimeScope, expectedRevision: 1, expectedRecoveryRevision: 0 },
        intent: {
          version: 1,
          recoveryId: 'recover-authority',
          target: { kind: 'authority', original },
          begunScopeRevision: 1,
          resolver: { ownerId: ownership.ownerId, epoch: ownership.epoch },
        },
      };
      return { ...stores, ownership, original, call };
    }
    async function createClaimFixture() {
      const stores = await create();
      opened.push(stores);
      const setup = await prepareSession(stores);
      const stageCommandId = executionCommandId('stage-claim');
      const staged = unwrapReply(
        await stageClaimRequest(setup.runs, setup.artifacts, await setup.scopedGuard(), {
          commandId: stageCommandId,
          canonicalRequest: setup.canonicalRequest,
          stateEvidence: setup.preparationInput.stateEvidence,
        }),
      );
      const call: Extract<RecoveryBeginCall, { kind: 'claim' }> = {
        kind: 'claim',
        guard: { ...(await setup.scopedGuard()), expectedRecoveryRevision: 0 },
        intent: {
          version: 1,
          recoveryId: 'recover-claim',
          target: {
            kind: 'claim',
            original: staged.intent,
            runId: setup.run.runId,
            attemptId: setup.admission.attemptId,
            stageCommandId,
            acceptanceCommandId: 'accept-claim',
          },
          begunScopeRevision: staged.intent.stagedRevision,
          resolver: setup.owner,
        },
      };
      return { ...setup, call, staged };
    }
    test('claim begin preserves target and capacity while refusing fresh acceptance', async () => {
      const setup = await createClaimFixture();
      const before = await setup.runs.readRun(setup.run.runId);
      expect(before).toMatchObject({ version: 3, recoveries: [] });
      expect(
        await setup.runs.readExecutionHistory(setup.run.runId, setup.admission.attemptId),
      ).toMatchObject({ version: 2, recoveries: [] });
      unwrapReply(await setup.runs.beginRecovery(setup.call));
      expect(await setup.runs.readRun(setup.run.runId)).toEqual(before);
      const evidence = await retainClaimReceipt(setup, setup.staged.intent);
      expect(
        await acceptClaimReceipt(setup.runs, setup.artifacts, await setup.scopedGuard(), {
          commandId: executionCommandId('accept-claim'),
          intent: setup.staged.intent,
          evidence,
        }),
      ).toEqual({ kind: 'refused', reason: 'state_conflict' });
      expect(await setup.runs.readRun(setup.run.runId)).toEqual(before);
    });
    test('active claim inherited outcome receipt and decision gates preserve checkpoint and capacity', async () => {
      const setup = await createClaimFixture();
      unwrapReply(await setup.runs.beginRecovery(setup.call));
      const before = await setup.runs.readRun(setup.run.runId);
      const claim = {
        version: 1 as const,
        commandId: setup.staged.intent.commandId,
        requestDigest: setup.staged.intent.requestDigest,
        runId: setup.run.runId,
        attemptId: setup.admission.attemptId,
      };
      const completion = createCompletion(claim, {
        version: 1,
        operationKey: setup.admission.identity.operationKey,
        observedAt: 1000,
        evidence: setup.preparationInput.stateEvidence,
        effect: 'failed',
      });
      expect(await setup.runs.commitOutcome(await setup.currentGuard(), completion)).toEqual({
        kind: 'refused',
        reason: 'state_conflict',
      });
      const receipt = decodeReceipt({
        version: 2,
        commandId: completion.intent.commandId,
        commandDigest: completion.intent.commandDigest,
        claim,
        acceptedWbsRevision: 'wbs-2',
        evidence: setup.preparationInput.stateEvidence,
      });
      expect(await setup.runs.reconcileReceipt(await setup.currentGuard(), receipt)).toEqual({
        kind: 'refused',
        reason: 'state_conflict',
      });
      const decision = decodeDecision({
        version: 1,
        decisionId: 'decision',
        attemptId: setup.admission.attemptId,
        correlationKey: 'unretained-wait',
        choice: 'yes',
        actorId: 'actor',
        authorizationEvidence: setup.preparationInput.stateEvidence,
      });
      expect(await setup.runs.receiveDecision(setup.ownership, decision)).toEqual({
        kind: 'refused',
        reason: 'decision_conflict',
      });
      await rejects(
        setup.runs.consumeDecision(await setup.currentGuard(), decision.decisionId),
        /decision does not exist/,
      );
      expect(await setup.runs.readRun(setup.run.runId)).toEqual(before);
      expect(
        await stageClaimRequest(setup.runs, setup.artifacts, await setup.scopedGuard(), {
          commandId: executionCommandId('stage-claim'),
          canonicalRequest: setup.canonicalRequest,
          stateEvidence: setup.preparationInput.stateEvidence,
        }),
      ).toEqual({ kind: 'duplicate', value: setup.staged });
      expect(await setup.runs.readRun(setup.run.runId)).toEqual(before);
    });
    test('active claim allows uncertainty evidence and exact execution replay but refuses reattachment', async () => {
      const setup = await createClaimFixture();
      unwrapReply(await setup.runs.beginRecovery(setup.call));
      const original = executionCheckpoint(setup.staged.attempt);
      expect(
        await setup.runs.recordExecution(
          await setup.currentGuard(),
          createExecutionCommand(
            {
              kind: 'session_reattached',
              locator: setup.locator,
              owner: setup.owner,
              evidence: setup.preparationInput.stateEvidence,
            },
            'reattach',
          ),
        ),
      ).toEqual({ kind: 'refused', reason: 'state_conflict' });
      const guard = await setup.currentGuard();
      const command = createExecutionCommand(
        { kind: 'recovery_required', reason: 'claim uncertain' },
        'uncertain',
      );
      const uncertain = unwrapReply(await setup.runs.recordExecution(guard, command));
      expect(executionCheckpoint(uncertain)).toEqual(original);
      expect(uncertain.holdsCapacity).toBe(true);
      expect(await setup.runs.recordExecution(guard, command)).toEqual({
        kind: 'duplicate',
        value: uncertain,
      });
      expect((await setup.runs.readRun(setup.run.runId)).capacity.reserved).toBe(1);
      expect(await setup.runs.beginRecovery(setup.call)).toMatchObject({ kind: 'duplicate' });
    });
    for (const family of [
      'runtime',
      'execution',
      'claim local',
      'claim wire',
      'acceptance',
      'turn',
    ] as const)
      test(`fresh ${family} cannot borrow recovery command identity but unrelated work proceeds`, async () => {
        const stores = await create();
        opened.push(stores);
        const setup =
          family === 'turn' ? await prepareClaimed(stores) : await prepareSession(stores);
        const staged =
          family === 'acceptance'
            ? unwrapReply(
                await stageClaimRequest(setup.runs, setup.artifacts, await setup.scopedGuard(), {
                  commandId: executionCommandId('stage-claim'),
                  canonicalRequest: setup.canonicalRequest,
                  stateEvidence: setup.preparationInput.stateEvidence,
                }),
              )
            : undefined;
        const scope = { ...runtimeScope, personId: 'isolated' };
        unwrapReply(await setup.runs.pinRuntimeScope(setup.ownership, { ...runtimePin, scope }));
        const original = unwrapReply(
          await setup.runs.stageRuntimeRequest(
            { ownership: setup.ownership, scope, expectedRevision: 0 },
            authorityRequest('isolated-original', null, scope),
          ),
        );
        unwrapReply(
          await setup.runs.beginRecovery({
            kind: 'authority',
            guard: {
              ownership: setup.ownership,
              scope,
              expectedRevision: 1,
              expectedRecoveryRevision: 0,
            },
            intent: {
              version: 1,
              recoveryId: 'recover-isolated',
              target: { kind: 'authority', original },
              begunScopeRevision: 1,
              resolver: setup.owner,
            },
          }),
        );
        const before = await setup.runs.readRun(setup.run.runId);
        async function invoke(identity: string) {
          if (family === 'runtime') {
            const other = { ...runtimeScope, personId: 'fresh-scope' };
            unwrapReply(
              await setup.runs.pinRuntimeScope(setup.ownership, { ...runtimePin, scope: other }),
            );
            return await setup.runs.stageRuntimeRequest(
              { ownership: setup.ownership, scope: other, expectedRevision: 0 },
              authorityRequest(identity, null, other),
            );
          }
          if (family === 'execution')
            return await setup.runs.recordExecution(
              await setup.currentGuard(),
              createExecutionCommand(
                {
                  kind: 'session_reattached',
                  locator: setup.locator,
                  owner: setup.owner,
                  evidence: setup.preparationInput.stateEvidence,
                },
                identity,
              ),
            );
          if (family === 'claim local' || family === 'claim wire') {
            return await stageClaimRequest(setup.runs, setup.artifacts, await setup.scopedGuard(), {
              commandId: executionCommandId(family === 'claim local' ? identity : 'fresh-stage'),
              canonicalRequest:
                family === 'claim wire'
                  ? setup.canonicalRequest.replace(
                      '"commandId":"wire-claim"',
                      '"commandId":' + JSON.stringify(identity),
                    )
                  : setup.canonicalRequest,
              stateEvidence: setup.preparationInput.stateEvidence,
            });
          }
          if (family === 'acceptance') {
            if (staged === undefined) throw new Error('missing staged claim');
            return await acceptClaimReceipt(
              setup.runs,
              setup.artifacts,
              await setup.scopedGuard(),
              {
                commandId: executionCommandId(identity),
                intent: staged.intent,
                evidence: await retainClaimReceipt(setup, staged.intent),
              },
            );
          }
          return await setup.runs.stageTurn(await setup.scopedGuard(), {
            version: 2,
            kind: 'stage_turn',
            commandId: executionCommandId(identity),
            request: {
              version: 1,
              turnKey: 'turn',
              owner: setup.owner,
              cause: { kind: 'initial' },
              input: 'work',
            },
          });
        }
        expect(await invoke('recover-isolated')).toEqual({
          kind: 'refused',
          reason: 'identity_conflict',
        });
        expect(await setup.runs.readRun(setup.run.runId)).toEqual(before);
        expect(await invoke('fresh-local')).toMatchObject({ kind: 'applied' });
      });
    test('reserved claim acceptance ID cannot be borrowed by fresh uncertainty execution', async () => {
      const setup = await createClaimFixture();
      unwrapReply(await setup.runs.beginRecovery(setup.call));
      const before = await setup.runs.readRun(setup.run.runId);
      expect(
        await setup.runs.recordExecution(
          await setup.currentGuard(),
          createExecutionCommand(
            { kind: 'recovery_required', reason: 'uncertain' },
            'accept-claim',
          ),
        ),
      ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
      expect(await setup.runs.readRun(setup.run.runId)).toEqual(before);
    });
    for (const fault of [
      'scope',
      'original',
      'cut',
      'resolver',
      'scope revision',
      'recovery revision',
      'command collision',
      'active',
    ] as const)
      test(`authority begin refuses ${fault} before publication`, async () => {
        const setup = await createAuthorityFixture();
        const call = structuredClone(setup.call);
        if (fault === 'scope')
          Object.assign(call.guard, { scope: { ...runtimeScope, personId: 'other' } });
        if (fault === 'original')
          Object.assign(call.intent.target.original.localOwner, { ownerId: 'other' });
        if (fault === 'cut') Object.assign(call.intent, { begunScopeRevision: 2 });
        if (fault === 'resolver') Object.assign(call.intent.resolver, { ownerId: 'other' });
        if (fault === 'scope revision') Object.assign(call.guard, { expectedRevision: 0 });
        if (fault === 'recovery revision')
          Object.assign(call.guard, { expectedRecoveryRevision: 1 });
        if (fault === 'command collision') Object.assign(call.intent, { recoveryId: 'original' });
        if (fault === 'active') {
          unwrapReply(await setup.runs.beginRecovery(call));
          Object.assign(call.intent, { recoveryId: 'second' });
        }
        const before = await setup.runs.readRuntimeScope(runtimeScope);
        const reason =
          fault === 'scope' || fault === 'resolver'
            ? 'authority_conflict'
            : fault === 'scope revision' || fault === 'recovery revision'
              ? 'revision_conflict'
              : fault === 'active'
                ? 'state_conflict'
                : 'identity_conflict';
        expect(await setup.runs.beginRecovery(call)).toEqual({ kind: 'refused', reason });
        expect(await setup.runs.readRuntimeScope(runtimeScope)).toEqual(before);
      });
    for (const fault of [
      'stage',
      'other stage',
      'acceptance identity',
      'run',
      'attempt',
      'run revision',
      'attempt revision',
      'checkpoint',
    ] as const)
      test(`claim begin refuses ${fault} before publication`, async () => {
        const setup = await createClaimFixture();
        const call = structuredClone(setup.call);
        if (fault === 'stage') Object.assign(call.intent.target, { stageCommandId: 'missing' });
        if (fault === 'other stage')
          Object.assign(call.intent.target, { stageCommandId: setup.preparationInput.commandId });
        if (fault === 'acceptance identity')
          Object.assign(call.intent.target, { acceptanceCommandId: setup.staged.intent.commandId });
        if (fault === 'run') Object.assign(call.intent.target, { runId: 'wrong' });
        if (fault === 'attempt') Object.assign(call.intent.target, { attemptId: 'wrong' });
        if (fault === 'run revision') Object.assign(call.guard, { expectedRevision: 0 });
        if (fault === 'attempt revision') Object.assign(call.guard, { expectedAttemptRevision: 0 });
        if (fault === 'checkpoint') {
          unwrapReply(
            await setup.runs.recordExecution(
              await setup.currentGuard(),
              createExecutionCommand(
                {
                  kind: 'session_reattached',
                  locator: setup.locator,
                  owner: setup.owner,
                  evidence: setup.preparationInput.stateEvidence,
                },
                'before-begin',
              ),
            ),
          );
          Object.assign(call.guard, await setup.scopedGuard());
        }
        const before = await setup.runs.readRun(setup.run.runId);
        expect(await setup.runs.beginRecovery(call)).toEqual({
          kind: 'refused',
          reason:
            fault === 'run revision' || fault === 'attempt revision'
              ? 'revision_conflict'
              : fault === 'checkpoint'
                ? 'state_conflict'
                : 'identity_conflict',
        });
        expect(await setup.runs.readRun(setup.run.runId)).toEqual(before);
        expect(await setup.runs.readRuntimeScope(setup.scope)).toMatchObject({
          activeRecoveryId: null,
          recoveries: [],
        });
      });
    test('begin replay cannot borrow another scope guard', async () => {
      const stores = await createAuthorityFixture();
      unwrapReply(await stores.runs.beginRecovery(stores.call));
      const before = await stores.runs.readRuntimeScope(runtimeScope);
      const call = structuredClone(stores.call);
      Object.assign(call.guard, { scope: { ...runtimeScope, personId: 'other' } });
      expect(await stores.runs.beginRecovery(call)).toEqual({
        kind: 'refused',
        reason: 'authority_conflict',
      });
      expect(await stores.runs.readRuntimeScope(runtimeScope)).toEqual(before);
    });
    test('claim replay cannot borrow a different run or attempt guard', async () => {
      const setup = await createClaimFixture();
      unwrapReply(await setup.runs.beginRecovery(setup.call));
      for (const field of ['runId', 'attemptId'] as const) {
        const call = structuredClone(setup.call);
        Object.assign(call.guard, { [field]: 'wrong' });
        expect(await setup.runs.beginRecovery(call)).toEqual({
          kind: 'refused',
          reason: 'identity_conflict',
        });
      }
    });
    test('authority begin cannot claim a retained claim operation', async () => {
      const setup = await createClaimFixture();
      expect(
        await setup.runs.beginRecovery({
          kind: 'authority',
          guard: {
            ownership: setup.ownership,
            scope: setup.scope,
            expectedRevision: setup.staged.intent.stagedRevision,
            expectedRecoveryRevision: 0,
          },
          intent: {
            ...setup.call.intent,
            target: { kind: 'authority', original: setup.staged.intent },
          },
        }),
      ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
    });
    test('begin retains revision zero and blocks fresh acceptance without changing scope revision', async () => {
      const stores = await createAuthorityFixture();
      const journal = unwrapReply(await stores.runs.beginRecovery(stores.call));
      expect(journal).toEqual({
        version: 1,
        intent: stores.call.intent,
        revision: 0,
        fences: [],
        observations: [],
        closure: null,
      });
      expect(await stores.runs.beginRecovery(stores.call)).toEqual({
        kind: 'duplicate',
        value: journal,
      });
      expect(
        await stores.runs.recordRuntimeAcceptance(
          { ownership: stores.ownership, scope: runtimeScope, expectedRevision: 1 },
          { intent: stores.original, evidence: runtimeEvidence },
        ),
      ).toEqual({ kind: 'refused', reason: 'state_conflict' });
      expect(await stores.runs.readRuntimeScope(runtimeScope)).toMatchObject({
        version: 2,
        revision: 1,
        pendingCommandId: 'original',
        activeRecoveryId: 'recover-authority',
        recoveries: [journal],
      });
    });
    test('acceptance before begin refuses recovery and preserves exact stored acceptance replay', async () => {
      const stores = await createAuthorityFixture();
      const guard = { ownership: stores.ownership, scope: runtimeScope, expectedRevision: 1 };
      const input = { intent: stores.original, evidence: runtimeEvidence };
      const accepted = unwrapReply(await stores.runs.recordRuntimeAcceptance(guard, input));
      expect(
        await stores.runs.beginRecovery({
          ...stores.call,
          guard: { ...stores.call.guard, expectedRevision: 2 },
        }),
      ).toEqual({ kind: 'refused', reason: 'state_conflict' });
      expect(await stores.runs.recordRuntimeAcceptance(guard, input)).toEqual({
        kind: 'duplicate',
        value: accepted,
      });
    });
    test('fresh begin rejects expired ownership before decoding a malformed target', async () => {
      const stores = await createAuthorityFixture();
      const before = await stores.runs.readRuntimeScope(runtimeScope);
      stores.clock.advance(101);
      expect(await stores.runs.beginRecovery(stores.call)).toEqual({
        kind: 'refused',
        reason: 'owner_stale',
      });
      const malformed = structuredClone(stores.call);
      Object.assign(malformed.intent, { target: null });
      expect(await stores.runs.beginRecovery(malformed)).toEqual({
        kind: 'refused',
        reason: 'owner_stale',
      });
      expect(await stores.runs.readRuntimeScope(runtimeScope)).toEqual(before);
    });
    test('begin snapshots intent before the clock dependency can mutate caller input', async () => {
      const stores = await createAuthorityFixture();
      const submitted = structuredClone(stores.call);
      const read = stores.clock.read.bind(stores.clock);
      stores.clock.read = () => {
        Object.assign(submitted.intent, { recoveryId: 'mutated-during-clock-read' });
        return read();
      };
      try {
        const journal = unwrapReply(await stores.runs.beginRecovery(submitted));
        expect(journal.intent.recoveryId).toBe('recover-authority');
      } finally {
        stores.clock.read = read;
      }
      expect(await stores.runs.beginRecovery(stores.call)).toMatchObject({ kind: 'duplicate' });
    });
    test('begin detaches queued input and returned journal from retained intent', async () => {
      const stores = await createAuthorityFixture();
      const submitted = structuredClone(stores.call);
      const pending = stores.runs.beginRecovery(submitted);
      Object.assign(submitted.intent, { recoveryId: 'mutated-after-submit' });
      const journal = unwrapReply(await pending);
      expect(journal.intent.recoveryId).toBe('recover-authority');
      Object.assign(journal.intent, { recoveryId: 'mutated-after-return' });
      expect(await stores.runs.beginRecovery(stores.call)).toMatchObject({
        kind: 'duplicate',
        value: { intent: { recoveryId: 'recover-authority' } },
      });
      expect(await stores.runs.readRuntimeScope(runtimeScope)).toMatchObject({
        activeRecoveryId: 'recover-authority',
        recoveries: [{ intent: { recoveryId: 'recover-authority' } }],
      });
    });
    test('begin immutable replay precedes stale revisions but current owner still fences it', async () => {
      const stores = await createAuthorityFixture();
      const journal = unwrapReply(await stores.runs.beginRecovery(stores.call));
      expect(
        await stores.runs.beginRecovery({
          ...stores.call,
          guard: { ...stores.call.guard, expectedRevision: 0, expectedRecoveryRevision: 99 },
        }),
      ).toEqual({ kind: 'duplicate', value: journal });
      expect(
        await stores.runs.beginRecovery({
          ...stores.call,
          intent: { ...stores.call.intent, begunScopeRevision: 2 },
        }),
      ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
      stores.clock.advance(101);
      expect(await stores.runs.beginRecovery(stores.call)).toEqual({
        kind: 'refused',
        reason: 'owner_stale',
      });
    });
  });
}
