import { rejects } from 'node:assert/strict';

import { afterEach, describe, expect, test } from 'bun:test';

import type { ArtifactStore } from '../artifact-store';
import { acceptClaimReceipt, readExecutionHistory, stageClaimRequest } from '../claim-history';
import { executionCheckpoint } from '../plan-execution';
import { artifactDigest, executionCommandId } from '../record-codecs';
import { decodeDecision, decodeReceipt, ownerId } from '../record-codecs';
import { readRecoveryExchange } from '../recovery-evidence';
import type {
  RecoveryBeginCall,
  RecoveryCall,
  RecoveryContext,
  RecoveryExchange,
  RecoveryFence,
  RecoveryFenceInput,
  RecoveryFenceReplyInput,
} from '../recovery-records';
import { decodeRuntimeIntent, digestRuntimeRequest, readRuntimeRequest } from '../runtime-codecs';
import { readRuntimeHistory } from '../runtime-history';
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
  authorityReceipt,
  authorityRequest,
  runtimeEvidence,
  runtimePin,
  runtimeScope,
} from './runtime-history-contract';

/** Captures actual JSON bytes before constructing the trusted staging input. */
export async function createRecoveryFenceCall(
  artifacts: ArtifactStore,
  begin: RecoveryBeginCall,
  generation: number | null = 2,
  previous?: RecoveryFence,
): Promise<RecoveryCall<RecoveryFenceInput>> {
  const recoveryId = begin.intent.recoveryId;
  const scope = begin.guard.scope;
  async function retain(value: unknown) {
    const retained = await artifacts.retainArtifact(
      new TextEncoder().encode(JSON.stringify(value)),
      'application/json',
    );
    if (retained.kind !== 'retained') throw new Error('recovery fixture artifact refused');
    return retained.reference;
  }
  async function capture(
    value: unknown,
    context: RecoveryContext,
    request: RecoveryExchange['request'],
    status: number,
  ) {
    const body = await retain(value);
    return await retain({ version: 1, scope, ledgerId: 'ledger', context, request, status, body });
  }
  const state = await readRecoveryExchange(
    artifacts,
    await capture(
      {
        schemaVersion: 1,
        ledgerId: 'ledger',
        scope,
        basis: 'rb1:' + 'a'.repeat(64),
        facts: { projectRevision: 0, workItems: [], steps: [] },
        claims: [],
        authority:
          generation === null
            ? { kind: 'uninitialized' }
            : { kind: 'held', ownerId: 'receiver-owner', generation },
      },
      previous === undefined
        ? { kind: 'initial_state', recoveryId }
        : {
            kind: 'supersession_state',
            recoveryId,
            previousOrdinal: previous.ordinal,
            previousRequestDigest: previous.requestDigest,
          },
      { kind: 'state' },
      200,
    ),
    { kind: 'state' },
  );
  if (state.kind !== 'state') throw new Error('recovery fixture state missing');
  const ordinal = previous === undefined ? 1 : previous.ordinal + 1;
  const canonicalRequest = authorityRequest('fence-' + String(ordinal), generation, scope);
  let basis: RecoveryFence['basis'] = { kind: 'initial', state: state.exchange };
  if (previous !== undefined) {
    const lookup = await readRecoveryExchange(
      artifacts,
      await capture(
        { error: 'runtime_receipt_not_found' },
        {
          kind: 'supersession_lookup',
          recoveryId,
          previousOrdinal: previous.ordinal,
          stateExchange: state.exchange.envelope.artifact,
        },
        {
          kind: 'lookup',
          commandId: readRuntimeRequest(previous.canonicalRequest).operation.commandId,
        },
        404,
      ),
      { kind: 'absent' },
    );
    if (lookup.kind !== 'absent') throw new Error('recovery fixture absence missing');
    basis = {
      kind: 'superseding',
      previousOrdinal: previous.ordinal,
      state: state.exchange,
      lookup: lookup.exchange,
    };
  }
  const fence: RecoveryFence = {
    version: 1,
    recoveryId,
    ordinal,
    canonicalRequest,
    requestDigest: digestRuntimeRequest(canonicalRequest),
    owner: begin.intent.resolver,
    stagedRevision: ordinal,
    basis,
  };
  return begin.kind === 'authority'
    ? {
        kind: 'authority',
        guard: { ...begin.guard, expectedRecoveryRevision: ordinal - 1 },
        recoveryId,
        input: { fence },
      }
    : {
        kind: 'claim',
        guard: { ...begin.guard, expectedRecoveryRevision: ordinal - 1 },
        recoveryId,
        input: { fence },
      };
}

/** Retains simulated receiver response bytes and verifies them through the production reader. No network chronology is asserted. */
export async function createRecoveryObservationCall(
  artifacts: ArtifactStore,
  staged: RecoveryCall<RecoveryFenceInput>,
  kind: 'accepted' | 'generation_conflict' = 'accepted',
  lookup = false,
): Promise<RecoveryCall<RecoveryFenceReplyInput>> {
  const fence = staged.input.fence;
  const wire = decodeRuntimeIntent({
    version: 1,
    commandId: readRuntimeRequest(fence.canonicalRequest).operation.commandId,
    canonicalRequest: fence.canonicalRequest,
    requestDigest: fence.requestDigest,
    localOwner: fence.owner,
    stagedRevision: fence.stagedRevision,
  });
  const receipt = authorityReceipt(wire);
  const retain = async (value: unknown) => {
    const retained = await artifacts.retainArtifact(
      new TextEncoder().encode(JSON.stringify(value)),
      'application/json',
    );
    if (retained.kind !== 'retained') throw new Error('fixture observation retention refused');
    return retained.reference;
  };
  const body = await retain(
    kind === 'accepted'
      ? {
          ...receipt,
          scope: staged.guard.scope,
          serverExtension: 'retained',
          acceptance: {
            ...receipt.acceptance,
            authority: { ...receipt.acceptance.authority, serverExtension: 'nested' },
          },
        }
      : { error: 'runtime_generation_conflict' },
  );
  const envelope = await retain({
    version: 1,
    context: {
      kind: 'fence_reply',
      recoveryId: fence.recoveryId,
      ordinal: fence.ordinal,
      requestDigest: fence.requestDigest,
      stagedRevision: fence.stagedRevision,
    },
    scope: staged.guard.scope,
    ledgerId: 'ledger',
    request: lookup
      ? { kind: 'lookup', commandId: wire.commandId }
      : { kind: 'authority', canonicalRequest: fence.canonicalRequest },
    status: kind === 'accepted' ? 200 : 409,
    body,
  });
  const verified = await readRecoveryExchange(
    artifacts,
    envelope,
    kind === 'accepted' ? { kind: 'authority', intent: wire } : { kind: 'generation_conflict' },
  );
  if (verified.kind !== 'authority' && verified.kind !== 'generation_conflict')
    throw new Error('fixture observation subject differs');
  const input: RecoveryFenceReplyInput =
    verified.kind === 'authority'
      ? { kind: 'accepted', fence, reply: verified.exchange }
      : { kind: 'generation_conflict', fence, reply: verified.exchange };
  return staged.kind === 'authority'
    ? {
        ...staged,
        guard: { ...staged.guard, expectedRecoveryRevision: fence.stagedRevision },
        input,
      }
    : {
        ...staged,
        guard: { ...staged.guard, expectedRecoveryRevision: fence.stagedRevision },
        input,
      };
}

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
    async function createAuthorityFixture(generation: number | null = 2) {
      const stores = await create();
      opened.push(stores);
      const ownership = unwrapReply(await stores.runs.acquireOwnership(ownerId('local-A'), 0));
      unwrapReply(await stores.runs.pinRuntimeScope(ownership, runtimePin));
      const original = unwrapReply(
        await stores.runs.stageRuntimeRequest(
          { ownership, scope: runtimeScope, expectedRevision: 0 },
          authorityRequest('original', generation),
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
    for (const kind of ['accepted', 'generation_conflict'] as const)
      for (const generation of [null, 2])
        test(
          'recovery observation retains exact reply ' + kind + ' generation ' + String(generation),
          async () => {
            const stores = await createAuthorityFixture(generation);
            unwrapReply(await stores.runs.beginRecovery(stores.call));
            const staged = await createRecoveryFenceCall(stores.artifacts, stores.call, generation);
            const fence = unwrapReply(await stores.runs.stageRecoveryFence(staged));
            const call = await createRecoveryObservationCall(stores.artifacts, staged, kind);
            const before = await stores.runs.readRuntimeScope(call.guard.scope);
            const observed = unwrapReply(await stores.runs.recordRecoveryFence(call));
            expect(observed).toEqual({ ...call.input, version: 1, observedRevision: 2 });
            expect(observed.observedRevision).toBe(fence.stagedRevision + 1);
            expect(await stores.runs.recordRecoveryFence(call)).toEqual({
              kind: 'duplicate',
              value: observed,
            });
            const scope = await stores.runs.readRuntimeScope(call.guard.scope);
            if (
              scope.kind !== 'pinned' ||
              scope.version !== 2 ||
              before.kind !== 'pinned' ||
              before.version !== 2
            )
              throw new Error('fixture recovery scope missing');
            expect(
              scope.recoveries.find((history) => history.intent.recoveryId === fence.recoveryId),
            ).toMatchObject({
              revision: observed.observedRevision,
              observations: [observed],
              closure: null,
            });
            expect({ ...scope, recoveries: [] }).toEqual({ ...before, recoveries: [] });
            expect(
              await readRuntimeHistory(stores.runs, stores.artifacts, call.guard.scope),
            ).toEqual(scope);
            const original = structuredClone(observed);
            Object.assign(observed.reply.body.value, { serverExtension: 'mutated' });
            stores.clock.advance(101);
            const current = unwrapReply(await stores.runs.acquireOwnership(ownerId('local-B'), 1));
            Object.assign(call.guard, {
              ownership: current,
              expectedRecoveryRevision: 0,
              expectedRevision: 0,
            });
            expect(await stores.runs.recordRecoveryFence(call)).toEqual({
              kind: 'duplicate',
              value: original,
            });
          },
        );
    test('recovery observation accepts verified lookup and rejects changed immutable reply', async () => {
      const stores = await createAuthorityFixture();
      unwrapReply(await stores.runs.beginRecovery(stores.call));
      const staged = await createRecoveryFenceCall(stores.artifacts, stores.call);
      unwrapReply(await stores.runs.stageRecoveryFence(staged));
      const call = await createRecoveryObservationCall(stores.artifacts, staged, 'accepted', true);
      unwrapReply(await stores.runs.recordRecoveryFence(call));
      Object.assign(call.input.reply.body.value, { actorId: 'another' });
      expect(await stores.runs.recordRecoveryFence(call)).toEqual({
        kind: 'refused',
        reason: 'identity_conflict',
      });
    });
    for (const fault of [
      'fence',
      'future fence',
      'foreign fence',
      'missing journal',
      'kind',
      'scope guard',
      'stale revision',
      'stale scope',
      'context recovery',
      'context ordinal',
      'context digest',
      'context revision',
      'body reference',
      'envelope scope',
      'envelope ledger',
      'request',
      'status',
      'receipt scope',
      'receipt ledger',
      'receipt command',
      'receipt digest',
      'receipt owner',
      'receipt generation',
      'malformed',
    ])
      test('recovery observation rejects ' + fault, async () => {
        const stores = await createAuthorityFixture();
        unwrapReply(await stores.runs.beginRecovery(stores.call));
        const staged = await createRecoveryFenceCall(stores.artifacts, stores.call);
        unwrapReply(await stores.runs.stageRecoveryFence(staged));
        const call = await createRecoveryObservationCall(stores.artifacts, staged);
        if (call.input.kind !== 'accepted') throw new Error('fixture receipt missing');
        const input = call.input;
        const exchange = input.reply.envelope.value;
        const receipt = input.reply.body.value;
        if (fault === 'fence') Object.assign(input.fence.owner, { epoch: 2 });
        if (fault === 'future fence') Object.assign(input.fence, { ordinal: 2 });
        if (fault === 'foreign fence') Object.assign(input.fence, { recoveryId: 'foreign' });
        if (fault === 'missing journal') Object.assign(call, { recoveryId: 'missing' });
        if (fault === 'kind')
          Object.assign(call, {
            kind: 'claim',
            guard: {
              ...call.guard,
              runId: 'run',
              attemptId: 'attempt',
              expectedAttemptRevision: 0,
              expectedScopeRevision: 1,
            },
          });
        if (fault === 'scope guard')
          Object.assign(call.guard, { scope: { ...runtimeScope, personId: 'other' } });
        if (fault === 'stale revision') Object.assign(call.guard, { expectedRecoveryRevision: 0 });
        if (fault === 'stale scope') Object.assign(call.guard, { expectedRevision: 0 });
        if (fault === 'context recovery') Object.assign(exchange.context, { recoveryId: 'other' });
        if (fault === 'context ordinal') Object.assign(exchange.context, { ordinal: 2 });
        if (fault === 'context digest')
          Object.assign(exchange.context, { requestDigest: artifactDigest('f'.repeat(64)) });
        if (fault === 'context revision') Object.assign(exchange.context, { stagedRevision: 2 });
        if (fault === 'body reference') Object.assign(exchange, { body: runtimeEvidence });
        if (fault === 'envelope scope')
          Object.assign(exchange, { scope: { ...runtimeScope, personId: 'other' } });
        if (fault === 'envelope ledger') Object.assign(exchange, { ledgerId: 'other' });
        if (fault === 'request')
          Object.assign(exchange, { request: { kind: 'lookup', commandId: 'other' } });
        if (fault === 'status') Object.assign(exchange, { status: 409 });
        if (fault === 'receipt scope')
          Object.assign(receipt, { scope: { ...runtimeScope, personId: 'other' } });
        if (fault === 'receipt ledger') Object.assign(receipt, { ledgerId: 'other' });
        if (fault === 'receipt command') Object.assign(receipt, { commandId: 'other' });
        if (fault === 'receipt digest')
          Object.assign(receipt, { requestDigest: artifactDigest('f'.repeat(64)) });
        if (fault === 'receipt owner')
          Object.assign(receipt.acceptance.authority, { ownerId: 'other' });
        if (fault === 'receipt generation')
          Object.assign(receipt.acceptance.authority, { generation: 4 });
        if (fault === 'malformed') Object.assign(input.reply.body.value, { schemaVersion: 2 });
        const before = await stores.runs.readRuntimeScope(runtimeScope);
        if (fault === 'missing journal')
          await rejects(stores.runs.recordRecoveryFence(call), /recovery journal does not exist/);
        else if (fault === 'malformed') await rejects(stores.runs.recordRecoveryFence(call));
        else expect(await stores.runs.recordRecoveryFence(call)).toMatchObject({ kind: 'refused' });
        expect(await stores.runs.readRuntimeScope(runtimeScope)).toEqual(before);
      });
    test('recovery observation replay refuses another scope guard', async () => {
      const stores = await createAuthorityFixture();
      unwrapReply(await stores.runs.beginRecovery(stores.call));
      const staged = await createRecoveryFenceCall(stores.artifacts, stores.call);
      unwrapReply(await stores.runs.stageRecoveryFence(staged));
      const call = await createRecoveryObservationCall(stores.artifacts, staged);
      unwrapReply(await stores.runs.recordRecoveryFence(call));
      Object.assign(call.guard, { scope: { ...runtimeScope, personId: 'other' } });
      expect(await stores.runs.recordRecoveryFence(call)).toEqual({
        kind: 'refused',
        reason: 'authority_conflict',
      });
    });
    test('recovery observation current owner precedes malformed input and replay', async () => {
      const stores = await createAuthorityFixture();
      unwrapReply(await stores.runs.beginRecovery(stores.call));
      const staged = await createRecoveryFenceCall(stores.artifacts, stores.call);
      unwrapReply(await stores.runs.stageRecoveryFence(staged));
      const call = await createRecoveryObservationCall(stores.artifacts, staged);
      unwrapReply(await stores.runs.recordRecoveryFence(call));
      stores.clock.advance(101);
      expect(await stores.runs.recordRecoveryFence(call)).toEqual({
        kind: 'refused',
        reason: 'owner_stale',
      });
      Object.assign(call, { input: null });
      expect(await stores.runs.recordRecoveryFence(call)).toEqual({
        kind: 'refused',
        reason: 'owner_stale',
      });
    });
    test('recovery observation snapshots before clock and queue', async () => {
      const stores = await createAuthorityFixture();
      unwrapReply(await stores.runs.beginRecovery(stores.call));
      const staged = await createRecoveryFenceCall(stores.artifacts, stores.call);
      unwrapReply(await stores.runs.stageRecoveryFence(staged));
      const call = await createRecoveryObservationCall(stores.artifacts, staged);
      const submitted = structuredClone(call);
      const read = stores.clock.read.bind(stores.clock);
      stores.clock.read = () => {
        Object.assign(submitted.input.reply.body.value, { actorId: 'clock' });
        return read();
      };
      try {
        const pending = stores.runs.recordRecoveryFence(submitted);
        Object.assign(submitted.input.reply.body.value, { actorId: 'queued' });
        expect(await pending).toEqual({
          kind: 'applied',
          value: { ...call.input, version: 1, observedRevision: 2 },
        });
      } finally {
        stores.clock.read = read;
      }
      expect(await stores.runs.recordRecoveryFence(call)).toEqual({
        kind: 'duplicate',
        value: { ...call.input, version: 1, observedRevision: 2 },
      });
    });
    for (const field of [
      'runId',
      'attemptId',
      'expectedRevision',
      'expectedAttemptRevision',
      'expectedScopeRevision',
    ] as const)
      test('recovery observation claim guard rejects ' + field, async () => {
        const setup = await createClaimFixture();
        unwrapReply(await setup.runs.beginRecovery(setup.call));
        const staged = await createRecoveryFenceCall(setup.artifacts, setup.call, 1);
        unwrapReply(await setup.runs.stageRecoveryFence(staged));
        const call = await createRecoveryObservationCall(setup.artifacts, staged);
        const before = await setup.runs.readRun(setup.run.runId);
        Object.assign(call.guard, {
          [field]: field === 'runId' || field === 'attemptId' ? 'wrong' : 999,
        });
        expect(await setup.runs.recordRecoveryFence(call)).toMatchObject({ kind: 'refused' });
        expect(await setup.runs.readRun(setup.run.runId)).toEqual(before);
      });
    test('recovery observation claim preserves complete attempt and capacity', async () => {
      const setup = await createClaimFixture();
      unwrapReply(await setup.runs.beginRecovery(setup.call));
      const staged = await createRecoveryFenceCall(setup.artifacts, setup.call, 1);
      unwrapReply(await setup.runs.stageRecoveryFence(staged));
      const call = await createRecoveryObservationCall(setup.artifacts, staged);
      const before = await setup.runs.readRun(setup.run.runId);
      const observed = unwrapReply(await setup.runs.recordRecoveryFence(call));
      expect(
        await readExecutionHistory(
          setup.runs,
          setup.artifacts,
          setup.run.runId,
          setup.admission.attemptId,
        ),
      ).toEqual(await setup.runs.readExecutionHistory(setup.run.runId, setup.admission.attemptId));
      await rejects(
        readExecutionHistory(
          setup.runs,
          {
            ...setup.artifacts,
            async readArtifact(reference) {
              if (reference.digest === observed.reply.body.artifact.digest)
                throw new Error('observation receipt unreadable');
              return await setup.artifacts.readArtifact(reference);
            },
          },
          setup.run.runId,
          setup.admission.attemptId,
        ),
        /observation receipt unreadable/,
      );
      expect(await setup.runs.readRun(setup.run.runId)).toEqual(before);
    });
    test('recovery observation retains old conflict bytes after a later accepted fence', async () => {
      const stores = await createAuthorityFixture();
      unwrapReply(await stores.runs.beginRecovery(stores.call));
      const first = await createRecoveryFenceCall(stores.artifacts, stores.call);
      unwrapReply(await stores.runs.stageRecoveryFence(first));
      const conflict = await createRecoveryObservationCall(
        stores.artifacts,
        first,
        'generation_conflict',
      );
      const old = unwrapReply(await stores.runs.recordRecoveryFence(conflict));
      const second = await createRecoveryFenceCall(
        stores.artifacts,
        stores.call,
        3,
        first.input.fence,
      );
      Object.assign(second.guard, { expectedRecoveryRevision: 2 });
      Object.assign(second.input.fence, { stagedRevision: 3 });
      unwrapReply(await stores.runs.stageRecoveryFence(second));
      const accepted = await createRecoveryObservationCall(stores.artifacts, second);
      const newest = unwrapReply(await stores.runs.recordRecoveryFence(accepted));
      expect(newest.observedRevision).toBe(4);
      expect(await stores.runs.recordRecoveryFence(conflict)).toEqual({
        kind: 'duplicate',
        value: old,
      });
      const snapshot = await readRuntimeHistory(stores.runs, stores.artifacts, runtimeScope);
      expect(snapshot).toMatchObject({
        recoveries: [{ revision: 4, observations: [old, newest] }],
      });
      for (const reference of [old.reply.envelope.artifact, old.reply.body.artifact]) {
        for (const failure of ['missing', 'unreadable']) {
          const artifacts = {
            ...stores.artifacts,
            async readArtifact(requested: typeof reference) {
              if (requested.digest === reference.digest) throw new Error('historical ' + failure);
              return await stores.artifacts.readArtifact(requested);
            },
          };
          await rejects(
            readRuntimeHistory(stores.runs, artifacts, runtimeScope),
            new RegExp('historical ' + failure),
          );
        }
      }
    });
    test('recovery observation refuses late unobserved superseded fence', async () => {
      const stores = await createAuthorityFixture();
      unwrapReply(await stores.runs.beginRecovery(stores.call));
      const first = await createRecoveryFenceCall(stores.artifacts, stores.call);
      unwrapReply(await stores.runs.stageRecoveryFence(first));
      const second = await createRecoveryFenceCall(
        stores.artifacts,
        stores.call,
        3,
        first.input.fence,
      );
      unwrapReply(await stores.runs.stageRecoveryFence(second));
      const call = await createRecoveryObservationCall(stores.artifacts, first);
      Object.assign(call.guard, { expectedRecoveryRevision: 2 });
      expect(await stores.runs.recordRecoveryFence(call)).toEqual({
        kind: 'refused',
        reason: 'state_conflict',
      });
    });
    test('recovery fence preserves scope and replays exact provenance after supersession and takeover', async () => {
      const stores = await createAuthorityFixture();
      unwrapReply(await stores.runs.beginRecovery(stores.call));
      const call = await createRecoveryFenceCall(stores.artifacts, stores.call);
      const before = await stores.runs.readRuntimeScope(call.guard.scope);
      const staged = unwrapReply(await stores.runs.stageRecoveryFence(call));
      expect(staged.stagedRevision).toBe(call.guard.expectedRecoveryRevision + 1);
      expect(await stores.runs.stageRecoveryFence(call)).toEqual({
        kind: 'duplicate',
        value: staged,
      });
      const changed = structuredClone(call);
      Object.assign(changed.input.fence, { requestDigest: artifactDigest('f'.repeat(64)) });
      await rejects(stores.runs.stageRecoveryFence(changed));
      const second = await createRecoveryFenceCall(stores.artifacts, stores.call, 3, staged);
      unwrapReply(await stores.runs.stageRecoveryFence(second));
      const after = await stores.runs.readRuntimeScope(call.guard.scope);
      if (before.kind !== 'pinned' || after.kind !== 'pinned' || after.version !== 2)
        throw new Error('fixture pin missing');
      expect(after.revision).toBe(before.revision);
      expect(after.pendingCommandId).toBe(before.pendingCommandId);
      expect(after.recoveries[0]).toMatchObject({
        revision: 2,
        fences: [staged, second.input.fence],
      });
      expect(await readRuntimeHistory(stores.runs, stores.artifacts, call.guard.scope)).toEqual(
        after,
      );
      stores.clock.advance(101);
      const current = unwrapReply(await stores.runs.acquireOwnership(ownerId('local-B'), 1));
      Object.assign(call.guard, { ownership: current });
      expect(await stores.runs.stageRecoveryFence(call)).toEqual({
        kind: 'duplicate',
        value: staged,
      });
    });
    for (const generation of [null, 2] as const)
      test('recovery fence accepts matching initial generation ' + String(generation), async () => {
        const stores = await createAuthorityFixture(generation);
        unwrapReply(await stores.runs.beginRecovery(stores.call));
        const call = await createRecoveryFenceCall(stores.artifacts, stores.call, generation);
        expect(await stores.runs.stageRecoveryFence(call)).toEqual({
          kind: 'applied',
          value: call.input.fence,
        });
        expect(await stores.runs.readRuntimeScope(runtimeScope)).toMatchObject({
          recoveries: [{ revision: 1, fences: [call.input.fence] }],
        });
      });
    for (const generation of [1, null, Number.MAX_SAFE_INTEGER] as const)
      test(
        'recovery fence refuses insufficient or overflowing generation ' + String(generation),
        async () => {
          const stores = await createAuthorityFixture();
          unwrapReply(await stores.runs.beginRecovery(stores.call));
          const call = await createRecoveryFenceCall(stores.artifacts, stores.call, generation);
          const before = await stores.runs.readRuntimeScope(runtimeScope);
          if (generation === Number.MAX_SAFE_INTEGER)
            await rejects(stores.runs.stageRecoveryFence(call));
          else
            expect(await stores.runs.stageRecoveryFence(call)).toEqual({
              kind: 'refused',
              reason: 'state_conflict',
            });
          expect(await stores.runs.readRuntimeScope(runtimeScope)).toEqual(before);
        },
      );
    test('recovery fence changed valid canonical bytes under retained identity conflict', async () => {
      const stores = await createAuthorityFixture();
      unwrapReply(await stores.runs.beginRecovery(stores.call));
      const call = await createRecoveryFenceCall(stores.artifacts, stores.call);
      unwrapReply(await stores.runs.stageRecoveryFence(call));
      const canonicalRequest = authorityRequest('fence-1', 3);
      const changed = {
        ...call,
        input: {
          fence: {
            ...call.input.fence,
            canonicalRequest,
            requestDigest: digestRuntimeRequest(canonicalRequest),
          },
        },
      };
      const before = await stores.runs.readRuntimeScope(runtimeScope);
      expect(await stores.runs.stageRecoveryFence(changed)).toEqual({
        kind: 'refused',
        reason: 'identity_conflict',
      });
      expect(await stores.runs.readRuntimeScope(runtimeScope)).toEqual(before);
    });
    for (const fault of [
      'scope',
      'kind',
      'recovery',
      'owner',
      'revision',
      'staged revision',
      'ordinal',
      'command',
      'state scope',
      'ledger',
      'expected',
      'context',
      'body ref',
    ] as const)
      test('recovery fence rejects initial ' + fault, async () => {
        const stores = await createAuthorityFixture();
        unwrapReply(await stores.runs.beginRecovery(stores.call));
        const call = await createRecoveryFenceCall(stores.artifacts, stores.call);
        const fence = call.input.fence;
        if (fault === 'scope')
          Object.assign(call.guard, { scope: { ...runtimeScope, personId: 'other' } });
        if (fault === 'kind')
          Object.assign(call, {
            kind: 'claim',
            guard: {
              ...call.guard,
              runId: 'missing',
              attemptId: 'missing',
              expectedAttemptRevision: 0,
              expectedScopeRevision: 1,
            },
          });
        if (fault === 'recovery') Object.assign(fence, { recoveryId: 'other' });
        if (fault === 'owner') Object.assign(fence.owner, { ownerId: 'other' });
        if (fault === 'revision') Object.assign(call.guard, { expectedRecoveryRevision: 1 });
        if (fault === 'staged revision') Object.assign(fence, { stagedRevision: 2 });
        if (fault === 'ordinal') Object.assign(fence, { ordinal: 2 });
        if (fault === 'command' || fault === 'expected') {
          const canonicalRequest = authorityRequest(
            fault === 'command' ? 'recover-authority' : 'fence-1',
            fault === 'expected' ? 3 : 2,
          );
          Object.assign(fence, {
            canonicalRequest,
            requestDigest: digestRuntimeRequest(canonicalRequest),
          });
        }
        if (fault === 'state scope')
          Object.assign(fence.basis.state.body.value, {
            scope: { ...runtimeScope, personId: 'other' },
          });
        if (fault === 'ledger') Object.assign(fence.basis.state.body.value, { ledgerId: 'other' });
        if (fault === 'context')
          Object.assign(fence.basis.state.envelope.value.context, { recoveryId: 'other' });
        if (fault === 'body ref')
          Object.assign(fence.basis.state.envelope.value, { body: runtimeEvidence });
        const before = await stores.runs.readRuntimeScope(runtimeScope);
        expect(await stores.runs.stageRecoveryFence(call)).toMatchObject({ kind: 'refused' });
        expect(await stores.runs.readRuntimeScope(runtimeScope)).toEqual(before);
      });
    for (const fault of [
      'previous ordinal',
      'previous digest',
      'state link',
      'receipt found',
      'regression',
      'gap',
      'fourth',
    ] as const)
      test('recovery fence rejects supersession ' + fault, async () => {
        const stores = await createAuthorityFixture();
        unwrapReply(await stores.runs.beginRecovery(stores.call));
        let call = await createRecoveryFenceCall(stores.artifacts, stores.call);
        let previous = unwrapReply(await stores.runs.stageRecoveryFence(call));
        for (let ordinal = 2; fault === 'fourth' && ordinal <= 3; ordinal += 1) {
          call = await createRecoveryFenceCall(
            stores.artifacts,
            stores.call,
            ordinal + 1,
            previous,
          );
          previous = unwrapReply(await stores.runs.stageRecoveryFence(call));
        }
        call = await createRecoveryFenceCall(
          stores.artifacts,
          stores.call,
          fault === 'regression' ? 2 : previous.ordinal + 2,
          previous,
        );
        const basis = call.input.fence.basis;
        if (basis.kind !== 'superseding') throw new Error('missing supersession');
        if (fault === 'previous ordinal') Object.assign(basis, { previousOrdinal: 2 });
        if (fault === 'previous digest')
          Object.assign(basis.state.envelope.value.context, {
            previousRequestDigest: artifactDigest('f'.repeat(64)),
          });
        if (fault === 'state link')
          Object.assign(basis.lookup.envelope.value.context, { stateExchange: runtimeEvidence });
        if (fault === 'receipt found') Object.assign(basis.lookup.envelope.value, { status: 200 });
        if (fault === 'gap') Object.assign(call.input.fence, { ordinal: 3 });
        const before = await stores.runs.readRuntimeScope(runtimeScope);
        expect(await stores.runs.stageRecoveryFence(call)).toMatchObject({ kind: 'refused' });
        expect(await stores.runs.readRuntimeScope(runtimeScope)).toEqual(before);
      });
    test('recovery fence claim preserves reservation and rejects authority substitution', async () => {
      const setup = await createClaimFixture();
      unwrapReply(await setup.runs.beginRecovery(setup.call));
      const call = await createRecoveryFenceCall(setup.artifacts, setup.call, 1);
      const before = await setup.runs.readRun(setup.run.runId);
      unwrapReply(await setup.runs.stageRecoveryFence(call));
      expect(await setup.runs.readRun(setup.run.runId)).toEqual(before);
      expect(
        await setup.runs.stageRecoveryFence({
          kind: 'authority',
          guard: {
            ownership: setup.ownership,
            scope: setup.scope,
            expectedRevision: 0,
            expectedRecoveryRevision: 0,
          },
          recoveryId: call.recoveryId,
          input: call.input,
        }),
      ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
      expect(await setup.runs.readRun(setup.run.runId)).toEqual(before);
    });
    test('recovery fence owner fencing precedes malformed input and replay', async () => {
      const stores = await createAuthorityFixture();
      unwrapReply(await stores.runs.beginRecovery(stores.call));
      const call = await createRecoveryFenceCall(stores.artifacts, stores.call);
      unwrapReply(await stores.runs.stageRecoveryFence(call));
      stores.clock.advance(101);
      expect(await stores.runs.stageRecoveryFence(call)).toEqual({
        kind: 'refused',
        reason: 'owner_stale',
      });
      Object.assign(call.input, { fence: null });
      expect(await stores.runs.stageRecoveryFence(call)).toEqual({
        kind: 'refused',
        reason: 'owner_stale',
      });
    });
    test('recovery fence snapshots before clock and detaches returned fence', async () => {
      const stores = await createAuthorityFixture();
      unwrapReply(await stores.runs.beginRecovery(stores.call));
      const call = await createRecoveryFenceCall(stores.artifacts, stores.call);
      const submitted = structuredClone(call);
      const read = stores.clock.read.bind(stores.clock);
      stores.clock.read = () => {
        Object.assign(submitted.input.fence, { ordinal: 2 });
        return read();
      };
      let staged: RecoveryFence;
      try {
        staged = unwrapReply(await stores.runs.stageRecoveryFence(submitted));
        expect(staged.ordinal).toBe(1);
      } finally {
        stores.clock.read = read;
      }
      Object.assign(staged, { ordinal: 3 });
      expect(await stores.runs.stageRecoveryFence(call)).toEqual({
        kind: 'duplicate',
        value: call.input.fence,
      });
    });
    test('recovery fence detaches queued caller input', async () => {
      const stores = await createAuthorityFixture();
      unwrapReply(await stores.runs.beginRecovery(stores.call));
      const call = await createRecoveryFenceCall(stores.artifacts, stores.call);
      const submitted = structuredClone(call);
      const pending = stores.runs.stageRecoveryFence(submitted);
      Object.assign(submitted.input.fence, { ordinal: 3 });
      expect(await pending).toEqual({ kind: 'applied', value: call.input.fence });
    });
    test('recovery fence replay precedes stale guard revisions', async () => {
      const stores = await createAuthorityFixture();
      unwrapReply(await stores.runs.beginRecovery(stores.call));
      const call = await createRecoveryFenceCall(stores.artifacts, stores.call);
      const staged = unwrapReply(await stores.runs.stageRecoveryFence(call));
      Object.assign(call.guard, { expectedRevision: 0, expectedRecoveryRevision: 99 });
      expect(await stores.runs.stageRecoveryFence(call)).toEqual({
        kind: 'duplicate',
        value: staged,
      });
    });
    for (const field of [
      'runId',
      'attemptId',
      'expectedRevision',
      'expectedAttemptRevision',
      'expectedScopeRevision',
    ] as const)
      test('recovery fence claim guard rejects ' + field, async () => {
        const setup = await createClaimFixture();
        unwrapReply(await setup.runs.beginRecovery(setup.call));
        const call = await createRecoveryFenceCall(setup.artifacts, setup.call, 1);
        Object.assign(call.guard, {
          [field]: field === 'runId' || field === 'attemptId' ? 'other' : 0,
        });
        const before = await setup.runs.readRun(setup.run.runId);
        expect(await setup.runs.stageRecoveryFence(call)).toMatchObject({ kind: 'refused' });
        expect(await setup.runs.readRun(setup.run.runId)).toEqual(before);
      });
    for (const identity of ['original', 'recover-authority'] as const)
      test('recovery fence global identity rejects ' + identity, async () => {
        const stores = await createAuthorityFixture();
        unwrapReply(await stores.runs.beginRecovery(stores.call));
        const call = await createRecoveryFenceCall(stores.artifacts, stores.call);
        const canonicalRequest = authorityRequest(identity, 2);
        Object.assign(call.input.fence, {
          canonicalRequest,
          requestDigest: digestRuntimeRequest(canonicalRequest),
        });
        expect(await stores.runs.stageRecoveryFence(call)).toEqual({
          kind: 'refused',
          reason: 'identity_conflict',
        });
      });
    test('recovery fence global identity rejects local execution and reserved acceptance IDs', async () => {
      const setup = await createClaimFixture();
      unwrapReply(await setup.runs.beginRecovery(setup.call));
      for (const commandId of ['stage-claim', 'accept-claim']) {
        const call = await createRecoveryFenceCall(setup.artifacts, setup.call, 1);
        const canonicalRequest = authorityRequest(commandId, 1, setup.scope);
        Object.assign(call.input.fence, {
          canonicalRequest,
          requestDigest: digestRuntimeRequest(canonicalRequest),
        });
        expect(await setup.runs.stageRecoveryFence(call)).toEqual({
          kind: 'refused',
          reason: 'identity_conflict',
        });
      }
    });
    test('recovery fence identity interlocks later ordinary runtime and execution commands', async () => {
      const setup = await createClaimFixture();
      unwrapReply(await setup.runs.beginRecovery(setup.call));
      const call = await createRecoveryFenceCall(setup.artifacts, setup.call, 1);
      unwrapReply(await setup.runs.stageRecoveryFence(call));
      const other = { ...runtimeScope, personId: 'other' };
      unwrapReply(
        await setup.runs.pinRuntimeScope(setup.ownership, { ...runtimePin, scope: other }),
      );
      expect(
        await setup.runs.stageRuntimeRequest(
          { ownership: setup.ownership, scope: other, expectedRevision: 0 },
          authorityRequest('fence-1', null, other),
        ),
      ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
      expect(
        await setup.runs.recordExecution(
          await setup.currentGuard(),
          createExecutionCommand({ kind: 'recovery_required', reason: 'uncertain' }, 'fence-1'),
        ),
      ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
    });
    test('recovery fence fresh malformed digest throws before publication', async () => {
      const stores = await createAuthorityFixture();
      unwrapReply(await stores.runs.beginRecovery(stores.call));
      const call = await createRecoveryFenceCall(stores.artifacts, stores.call);
      Object.assign(call.input.fence, { requestDigest: artifactDigest('f'.repeat(64)) });
      const before = await stores.runs.readRuntimeScope(runtimeScope);
      await rejects(stores.runs.stageRecoveryFence(call), /canonical digest differs/);
      expect(await stores.runs.readRuntimeScope(runtimeScope)).toEqual(before);
    });
    test('recovery fence replay rejects another scope guard', async () => {
      const stores = await createAuthorityFixture();
      unwrapReply(await stores.runs.beginRecovery(stores.call));
      const call = await createRecoveryFenceCall(stores.artifacts, stores.call);
      unwrapReply(await stores.runs.stageRecoveryFence(call));
      Object.assign(call.guard, { scope: { ...runtimeScope, personId: 'other' } });
      expect(await stores.runs.stageRecoveryFence(call)).toEqual({
        kind: 'refused',
        reason: 'authority_conflict',
      });
    });
    for (const fault of [
      'request scope',
      'request ledger',
      'request kind',
      'initial basis',
      'state request',
      'state status',
      'malformed shape',
    ] as const)
      test('recovery fence rejects boundary ' + fault, async () => {
        const stores = await createAuthorityFixture();
        unwrapReply(await stores.runs.beginRecovery(stores.call));
        const call = await createRecoveryFenceCall(stores.artifacts, stores.call);
        const fence = call.input.fence;
        if (fault === 'request scope' || fault === 'request ledger') {
          const canonicalRequest =
            fault === 'request scope'
              ? authorityRequest('fence-1', 2, { ...runtimeScope, personId: 'other' })
              : fence.canonicalRequest.replace(
                  '"expectedLedgerId":"ledger"',
                  '"expectedLedgerId":"other"',
                );
          Object.assign(fence, {
            canonicalRequest,
            requestDigest: digestRuntimeRequest(canonicalRequest),
          });
        }
        if (fault === 'request kind') {
          const setup = await createClaimFixture();
          Object.assign(fence, {
            canonicalRequest: setup.canonicalRequest,
            requestDigest: digestRuntimeRequest(setup.canonicalRequest),
          });
        }
        if (fault === 'initial basis') {
          const next = await createRecoveryFenceCall(stores.artifacts, stores.call, 3, fence);
          if (next.input.fence.basis.kind !== 'superseding')
            throw new Error('fixture supersession missing');
          Object.assign(fence.basis, {
            kind: 'superseding',
            previousOrdinal: 1,
            lookup: next.input.fence.basis.lookup,
          });
        }
        if (fault === 'state request')
          Object.assign(fence.basis.state.envelope.value, {
            request: { kind: 'lookup', commandId: 'fence-1' },
          });
        if (fault === 'state status')
          Object.assign(fence.basis.state.envelope.value, { status: 404 });
        if (fault === 'malformed shape') Object.assign(fence, { version: 2 });
        const before = await stores.runs.readRuntimeScope(runtimeScope);
        if (fault === 'malformed shape') await rejects(stores.runs.stageRecoveryFence(call));
        else expect(await stores.runs.stageRecoveryFence(call)).toMatchObject({ kind: 'refused' });
        expect(await stores.runs.readRuntimeScope(runtimeScope)).toEqual(before);
      });
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
