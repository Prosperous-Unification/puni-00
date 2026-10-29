import { deepEqual, rejects } from 'node:assert/strict';

import { expect, test } from 'bun:test';

import { decodeRecordedExecution } from './execution-codecs';
import { executionCheckpoint, isExecuting } from './plan-execution';
import { decodeAttempt, decodeCurrentAttempt, organizationId } from './record-codecs';
import { FixtureClock, prepareClaimed, stageFixtureTurn } from './testing/fixtures';
import { createMemoryStores } from './testing/memory-stores';

test('recovery hold reserves capacity and preserves the exact old claim acknowledgement', async () => {
  const clock = new FixtureClock();
  const stores = {
    ...createMemoryStores({
      organizationId: organizationId('organization'),
      capacity: 2,
      leaseMilliseconds: 100,
      clock,
    }),
    clock,
  };
  const setup = await prepareClaimed(stores);
  const attempt = setup.accepted.attempt;
  if (attempt.state.kind !== 'ready') throw new Error('expected ready fixture');
  const held = decodeCurrentAttempt({
    ...attempt,
    version: 3,
    state: {
      kind: 'recovery_hold',
      cause: 'claim_accepted_fenced',
      closureId: 'recover-claim',
      checkpoint: attempt.state,
    },
  });
  expect(held.holdsCapacity).toBe(true);
  expect(isExecuting(held.state)).toBe(true);
  expect(() => decodeAttempt(held)).toThrow();
  expect(executionCheckpoint(held)).toEqual(attempt.state);
  const history = await stores.runs.readExecutionHistory(setup.run.runId, attempt.attemptId);
  const accepted = history.executions.find((entry) => entry.command.kind === 'accept_claim');
  if (accepted === undefined) throw new Error('missing claim acknowledgement');
  deepEqual(decodeRecordedExecution(accepted), accepted);
  expect(decodeRecordedExecution(accepted).reply.attempt.version).toBe(2);
  expect(() =>
    decodeRecordedExecution({ ...accepted, reply: { ...accepted.reply, attempt: held } }),
  ).toThrow();
  expect(() => decodeCurrentAttempt({ ...held, holdsCapacity: false })).toThrow();
  expect(() =>
    decodeCurrentAttempt({
      ...setup.staged.attempt,
      version: 3,
      state: {
        kind: 'recovery_hold',
        cause: 'claim_accepted_fenced',
        closureId: 'wrong-checkpoint',
        checkpoint: setup.staged.attempt.state,
      },
    }),
  ).toThrow();
  await stageFixtureTurn(setup);
  const stagedHistory = await stores.runs.readExecutionHistory(setup.run.runId, attempt.attemptId);
  for (const entry of stagedHistory.executions)
    expect(() =>
      decodeRecordedExecution({ ...entry, reply: { ...entry.reply, attempt: held } }),
    ).toThrow();

  expect(() =>
    decodeCurrentAttempt({ ...held, state: { ...held.state, cause: 'claim_nonaccepted' } }),
  ).toThrow();
});

import { referenceArtifact } from './artifact-integrity';
import { auditRecoveryCatalog, reconstructRuntimePrefix } from './plan-recovery-history';
import { reconstructRuntimeScope, type RuntimeCatalog } from './plan-runtime';
import { decodeOwnership, storeId } from './record-codecs';
import { decodeRecoveryHistory } from './recovery-codecs';
import { decodeRuntimeIntent, digestRuntimeRequest } from './runtime-codecs';
import {
  authorityReceipt,
  authorityRequest,
  runtimePin,
  runtimeScope,
} from './testing/runtime-history-contract';

const recoveryBytes = new Map<string, Uint8Array>();
function pair<T>(value: T, context: unknown, request: unknown, status = 200) {
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const body = { artifact: referenceArtifact(encoded, 'application/json'), value };
  recoveryBytes.set(body.artifact.digest, encoded);
  const exchange = {
    version: 1,
    scope: runtimeScope,
    ledgerId: 'ledger',
    context,
    request,
    status,
    body: body.artifact,
  };
  const envelopeBytes = new TextEncoder().encode(JSON.stringify(exchange));
  const envelope = {
    artifact: referenceArtifact(envelopeBytes, 'application/json'),
    value: exchange,
  };
  recoveryBytes.set(envelope.artifact.digest, envelopeBytes);
  return { body, envelope };
}
function authorityCatalog(epoch = 1) {
  const owner = { ownerId: 'local', epoch: 1 };
  const createIntent = (commandId: string, generation: number | null, stagedRevision: number) => {
    const canonicalRequest = authorityRequest(commandId, generation);
    return decodeRuntimeIntent({
      version: 1,
      commandId,
      canonicalRequest,
      requestDigest: digestRuntimeRequest(canonicalRequest),
      localOwner: owner,
      stagedRevision,
    });
  };
  const prior = createIntent('prior', null, 1);
  const original = createIntent('original', 2, 3);
  const recoveryId = 'recover-authority';
  const resolver = { ownerId: 'local', epoch };
  const state = pair(
    {
      schemaVersion: 1,
      ledgerId: 'ledger',
      scope: runtimeScope,
      basis: 'rb1:' + 'a'.repeat(64),
      facts: { projectRevision: 0, workItems: [], steps: [] },
      authority: { kind: 'held', ownerId: 'receiver-owner', generation: 3 },
      claims: [],
    },
    { kind: 'initial_state', recoveryId },
    { kind: 'state' },
  );
  const fenceIntent = createIntent('fence', 3, 1);
  const fence = {
    version: 1,
    recoveryId,
    ordinal: 1,
    canonicalRequest: fenceIntent.canonicalRequest,
    requestDigest: fenceIntent.requestDigest,
    owner: resolver,
    stagedRevision: 1,
    basis: { kind: 'initial', state },
  };
  const reply = pair(
    authorityReceipt(fenceIntent),
    {
      kind: 'fence_reply',
      recoveryId,
      ordinal: 1,
      requestDigest: fence.requestDigest,
      stagedRevision: 1,
    },
    { kind: 'authority', canonicalRequest: fence.canonicalRequest },
  );
  const observation = { version: 1, kind: 'accepted', fence, reply, observedRevision: 2 };
  const lookup = pair(
    authorityReceipt(original),
    {
      kind: 'original_lookup',
      recoveryId,
      ordinal: 1,
      observationRevision: 2,
      fenceExchange: reply.envelope.artifact,
      fenceReceipt: reply.body.artifact,
    },
    { kind: 'lookup', commandId: original.commandId },
  );
  const acceptance = {
    version: 1 as const,
    commandId: original.commandId,
    requestDigest: original.requestDigest,
    evidence: lookup.body.artifact,
    acceptedRevision: 4,
  };
  const history = decodeRecoveryHistory({
    version: 1,
    intent: {
      version: 1,
      recoveryId,
      target: { kind: 'authority', original },
      begunScopeRevision: 3,
      resolver,
    },
    revision: 3,
    fences: [fence],
    observations: [observation],
    closure: {
      version: 1,
      recoveryId,
      original,
      fence: { fence, observation },
      decision: { kind: 'accepted', lookup },
      resolvedRevision: 3,
      resolver,
      scopeBefore: 3,
      scopeAfter: 5,
      originalReply: { kind: 'authority', acceptance },
      attemptReply: null,
    },
  });
  const catalog: RuntimeCatalog = {
    scopes: [{ pin: runtimePin, revision: 5 }],
    intents: [prior, original],
    acceptances: [
      {
        version: 1,
        commandId: prior.commandId,
        requestDigest: prior.requestDigest,
        evidence: pair(authorityReceipt(prior), {}, {}).body.artifact,
        acceptedRevision: 2,
      },
      acceptance,
    ],
    recovery: {
      histories: [history],
      barriers: [
        { recoveryId, scope: runtimeScope, scopeBefore: 3, scopeAfter: 5, generationFloor: 4 },
      ],
      active: [],
      counts: { journals: 1, fences: 1, observations: 1, closures: 1, barriers: 1, active: 0 },
    },
  };
  const ownership = {
    storeId: storeId('store'),
    organizationId: organizationId('organization'),
    epoch,
    owner: decodeOwnership({
      version: 1,
      storeId: 'store',
      organizationId: 'organization',
      ownerId: 'local',
      epoch,
      expiresAt: 10000,
    }),
  };
  return { catalog, ownership, retained: catalog.scopes[0] };
}
for (const epoch of [1, 2])
  test(`authority recovery exact cuts and epoch projection ${String(epoch)}`, () => {
    const { catalog, ownership, retained } = authorityCatalog(epoch);
    auditRecoveryCatalog(catalog, ownership);
    for (const [revision, generationFloor, grant] of [
      [3, 1, 1],
      [4, 3, 3],
      [5, 4, null],
    ] as const) {
      const prefix = reconstructRuntimePrefix(retained, catalog, ownership, revision);
      expect(prefix.generationFloor).toBe(generationFloor);
      expect(prefix.grant?.authority.generation ?? null).toBe(epoch === 2 ? null : grant);
      expect(Object.hasOwn(prefix, 'activeRecoveryId')).toBe(false);
      expect(Object.hasOwn(prefix, 'recoveries')).toBe(false);
    }
    expect(reconstructRuntimeScope(retained, catalog, ownership)).toMatchObject({
      version: 2,
      pendingCommandId: null,
      generationFloor: 4,
      activeRecoveryId: null,
    });
  });
for (const corruption of ['count', 'active', 'barrier', 'observation', 'original'] as const)
  test(`complete recovery catalog rejects ${corruption}`, () => {
    const { catalog, ownership } = authorityCatalog();
    const corrupted = structuredClone(catalog);
    if (corruption === 'count') Object.assign(corrupted.recovery.counts, { fences: 0 });
    if (corruption === 'active') {
      Object.assign(corrupted.recovery, {
        active: [{ scope: runtimeScope, recoveryId: 'recover-authority' }],
      });
      Object.assign(corrupted.recovery.counts, { active: 1 });
    }
    if (corruption === 'barrier') Object.assign(corrupted.recovery.barriers[0], { scopeAfter: 4 });
    if (corruption === 'observation')
      Object.assign(corrupted.recovery.histories[0].observations[0], { observedRevision: 1 });
    if (corruption === 'original')
      Object.assign(corrupted.recovery.histories[0].closure!.originalReply!, {
        acceptance: { ...catalog.acceptances[1], acceptedRevision: 3 },
      });
    expect(() => {
      auditRecoveryCatalog(corrupted, ownership);
    }).toThrow();
  });

import type { HistoryCatalog } from './validate-history';
import { validateHistory } from './validate-history';

async function claimCatalog(accepted: boolean, epoch = 1) {
  const clock = new FixtureClock();
  const stores = {
    ...createMemoryStores({
      organizationId: organizationId('organization'),
      capacity: 2,
      leaseMilliseconds: 100,
      clock,
    }),
    clock,
  };
  const setup = await prepareClaimed(stores);
  const current = await stores.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId);
  const scope = await stores.runs.readRuntimeScope(setup.scope);
  if (scope.kind !== 'pinned') throw new Error('missing fixture scope');
  const original = setup.staged.intent;
  const recoveryId = 'recover-claim';
  const resolver = { ownerId: setup.ownership.ownerId, epoch };
  const canonicalRequest = authorityRequest('claim-fence', 1, setup.scope);
  const fenceIntent = decodeRuntimeIntent({
    version: 1,
    commandId: 'claim-fence',
    canonicalRequest,
    requestDigest: digestRuntimeRequest(canonicalRequest),
    localOwner: resolver,
    stagedRevision: 1,
  });
  const state = pair(setup.state, { kind: 'initial_state', recoveryId }, { kind: 'state' });
  const fence = {
    version: 1,
    recoveryId,
    ordinal: 1,
    canonicalRequest,
    requestDigest: fenceIntent.requestDigest,
    owner: resolver,
    stagedRevision: 1,
    basis: { kind: 'initial', state },
  };
  const reply = pair(
    authorityReceipt(fenceIntent),
    {
      kind: 'fence_reply',
      recoveryId,
      ordinal: 1,
      requestDigest: fence.requestDigest,
      stagedRevision: 1,
    },
    { kind: 'authority', canonicalRequest },
  );
  const observation = { version: 1, kind: 'accepted', fence, reply, observedRevision: 2 };
  const originalReceipt: unknown = JSON.parse(
    new TextDecoder().decode(
      await stores.artifacts.readArtifact(setup.accepted.acceptance.evidence),
    ),
  );
  const lookup = pair(
    accepted ? originalReceipt : { error: 'runtime_receipt_not_found' },
    {
      kind: 'original_lookup',
      recoveryId,
      ordinal: 1,
      observationRevision: 2,
      fenceExchange: reply.envelope.artifact,
      fenceReceipt: reply.body.artifact,
    },
    { kind: 'lookup', commandId: original.commandId },
    accepted ? 200 : 404,
  );
  const execution = current.executions.find((entry) => entry.command.kind === 'accept_claim');
  if (execution?.command.kind !== 'accept_claim') throw new Error('missing fixture acceptance');
  const predecessor = accepted ? setup.accepted.attempt : setup.staged.attempt;
  if (predecessor.state.kind !== (accepted ? 'ready' : 'claiming'))
    throw new Error('wrong fixture checkpoint');
  const held = decodeCurrentAttempt({
    ...predecessor,
    version: 3,
    revision: predecessor.revision + 1,
    state: {
      kind: 'recovery_hold',
      cause: accepted ? 'claim_accepted_fenced' : 'claim_nonaccepted',
      closureId: recoveryId,
      checkpoint: predecessor.state,
    },
  });
  const history = decodeRecoveryHistory({
    version: 1,
    intent: {
      version: 1,
      recoveryId,
      target: {
        kind: 'claim',
        original,
        runId: setup.run.runId,
        attemptId: predecessor.attemptId,
        stageCommandId: 'stage-claim',
        acceptanceCommandId: 'accept-claim',
      },
      begunScopeRevision: 3,
      resolver,
    },
    revision: 3,
    fences: [fence],
    observations: [observation],
    closure: {
      version: 1,
      recoveryId,
      original,
      fence: { fence, observation },
      decision: accepted
        ? { kind: 'accepted', lookup, command: execution.command }
        : { kind: 'fenced_nonaccepted', lookup },
      resolvedRevision: 3,
      resolver,
      scopeBefore: 3,
      scopeAfter: accepted ? 5 : 4,
      originalReply: accepted
        ? { kind: 'claim', command: execution.command, ack: setup.accepted }
        : null,
      attemptReply: held,
    },
  });
  const catalog: HistoryCatalog = {
    ownership: { ...stores.ownership, epoch, owner: { ...setup.ownership, epoch } },
    runtime: {
      scopes: [{ pin: scope.pin, revision: accepted ? 5 : 4 }],
      intents: scope.intents,
      acceptances: accepted
        ? scope.acceptances
        : scope.acceptances.filter((entry) => entry.commandId !== original.commandId),
      recovery: {
        histories: [history],
        barriers: [
          {
            recoveryId,
            scope: setup.scope,
            scopeBefore: 3,
            scopeAfter: accepted ? 5 : 4,
            generationFloor: 2,
          },
        ],
        active: [],
        counts: { journals: 1, fences: 1, observations: 1, closures: 1, barriers: 1, active: 0 },
      },
    },
    manifests: [setup.manifest],
    runs: [{ run: { ...current.run, revision: held.revision + 1 }, initial: setup.run }],
    attempts: [{ attempt: held, admission: setup.admission }],
    executions: accepted
      ? current.executions
      : current.executions.filter((entry) => entry.command.kind !== 'accept_claim'),
    consumptions: [],
    completions: [],
    receipts: [],
    decisions: [],
    reservations: [held.attemptId],
    capacity: 2,
  };
  return { catalog, setup, held, history };
}
for (const accepted of [true, false])
  for (const epoch of [1, 2])
    test(`claim recovery exact cuts accepted=${String(accepted)} epoch=${String(epoch)}`, async () => {
      const { catalog, setup, held } = await claimCatalog(accepted, epoch);
      const retained = catalog.runtime.scopes[0];
      for (const revision of accepted ? [3, 4, 5] : [3, 4]) {
        const prefix = reconstructRuntimePrefix(
          retained,
          catalog.runtime,
          catalog.ownership,
          revision,
        );
        expect(prefix.generationFloor).toBe(revision === retained.revision ? 2 : 1);
        expect(prefix.grant?.authority.generation ?? null).toBe(
          epoch === 2 || revision === retained.revision ? null : 1,
        );
        expect(Object.hasOwn(prefix, 'activeRecoveryId')).toBe(false);
        expect(Object.hasOwn(prefix, 'recoveries')).toBe(false);
      }
      const histories = validateHistory(catalog);
      expect(histories[0].attempt).toEqual(held);
      expect(histories[0].version).toBe(2);
      expect(histories[0].attempt.holdsCapacity).toBe(true);
      if (accepted)
        expect(
          histories[0].executions.find((entry) => entry.command.kind === 'accept_claim')!.reply,
        ).toEqual(setup.accepted);
      else expect(held.state).not.toHaveProperty('execution');
    });

import { latestAuthority } from './plan-claims';
import { planExecutionTransition } from './plan-execution';

for (const fault of [
  'target',
  'resolver',
  'fence_sequence',
  'fence_identity',
  'fence_basis',
  'state_context',
  'observation_sequence',
  'receipt_identity',
  'receipt_generation',
  'closure',
  'lookup_context',
  'original_evidence',
  'hold_closure',
  'hold_checkpoint',
  'stage_link',
  'original_ack',
  'capacity',
  'run_revision',
] as const) {
  test(`recovery audit rejects independent ${fault}`, async () => {
    const { catalog } = await claimCatalog(true);
    const corrupted = structuredClone(catalog);
    const journal = corrupted.runtime.recovery.histories[0];
    const closure = journal.closure!;
    if (fault === 'target') Object.assign(journal.intent, { begunScopeRevision: 2 });
    if (fault === 'resolver') Object.assign(journal.intent.resolver, { epoch: 2 });
    if (fault === 'fence_sequence') Object.assign(journal.fences[0], { ordinal: 2 });
    if (fault === 'fence_identity')
      Object.assign(journal.fences[0], { requestDigest: 'a'.repeat(64) });
    if (fault === 'fence_basis')
      Object.assign(journal.fences[0].basis.state.body.value.authority, { generation: 2 });
    if (fault === 'state_context')
      Object.assign(journal.fences[0].basis.state.envelope.value.context, { recoveryId: 'other' });
    if (fault === 'observation_sequence')
      Object.assign(journal.observations[0], { observedRevision: 3 });
    if (fault === 'receipt_identity')
      Object.assign(journal.observations[0].reply.body.value, { actorId: '', commandId: 'other' });
    if (fault === 'receipt_generation') {
      const observed = journal.observations[0];
      if (observed.kind !== 'accepted') throw new Error('expected accepted fence');
      Object.assign(observed.reply.body.value.acceptance.authority, { generation: 3 });
    }
    if (fault === 'closure') Object.assign(closure, { resolvedRevision: 4 });
    if (fault === 'lookup_context')
      Object.assign(closure.decision.lookup.envelope.value.context, { observationRevision: 1 });
    if (fault === 'original_evidence')
      Object.assign(closure.decision.lookup.body.artifact, { digest: 'a'.repeat(64) });
    if (fault === 'hold_closure')
      Object.assign(closure.attemptReply!.state, { closureId: 'other' });
    if (fault === 'hold_checkpoint') {
      const hold = closure.attemptReply!;
      if (hold.state.cause !== 'claim_accepted_fenced') throw new Error('expected ready hold');
      Object.assign(hold.state, { checkpoint: structuredClone(hold.state.checkpoint) });
      Object.assign(hold.state.checkpoint, { cause: { kind: 'decision', decisionId: 'invented' } });
      Object.assign(corrupted.attempts[0], { attempt: hold });
    }
    if (fault === 'stage_link') Object.assign(journal.intent.target, { stageCommandId: 'other' });
    if (fault === 'original_ack') {
      if (closure.originalReply?.kind !== 'claim') throw new Error('expected claim ack');
      Object.assign(closure.originalReply.ack.attempt, { revision: 99 });
    }
    if (fault === 'capacity') Object.assign(corrupted, { reservations: [] });
    if (fault === 'run_revision') Object.assign(corrupted.runs[0].run, { revision: 100 });
    expect(() => validateHistory(corrupted)).toThrow();
  });
}
test('recovery active journal requires the actual claiming checkpoint and exact index', async () => {
  const { catalog, setup } = await claimCatalog(false);
  const journal = catalog.runtime.recovery.histories[0];
  const active: HistoryCatalog = {
    ...catalog,
    runtime: {
      ...catalog.runtime,
      scopes: [{ ...catalog.runtime.scopes[0], revision: 3 }],
      recovery: {
        histories: [{ ...journal, revision: 0, fences: [], observations: [], closure: null }],
        barriers: [],
        active: [{ scope: setup.scope, recoveryId: journal.intent.recoveryId }],
        counts: { journals: 1, fences: 0, observations: 0, closures: 0, barriers: 0, active: 1 },
      },
    },
    attempts: [{ ...catalog.attempts[0], attempt: setup.staged.attempt }],
    runs: [
      {
        ...catalog.runs[0],
        run: { ...catalog.runs[0].run, revision: setup.staged.attempt.revision + 1 },
      },
    ],
  };
  expect(validateHistory(active)[0].attempt).toEqual(setup.staged.attempt);
  const wrong = structuredClone(active);
  Object.assign(wrong.runtime.recovery, { active: [] });
  Object.assign(wrong.runtime.recovery.counts, { active: 0 });
  expect(() => validateHistory(wrong)).toThrow('corrupt recovery active index');
  const changed = structuredClone(active);
  Object.assign(changed.runtime.recovery.histories[0].intent.target, { stageCommandId: 'other' });
  expect(() => validateHistory(changed)).toThrow('corrupt recovery claim stage association');
  if (setup.staged.attempt.state.kind !== 'claiming') throw new Error('fixture is not claiming');
  const fact = {
    kind: 'session_reattached' as const,
    locator: setup.staged.attempt.state.session.locator,
    owner: { ownerId: setup.ownership.ownerId, epoch: setup.ownership.epoch },
    evidence: setup.accepted.acceptance.evidence,
  };
  const transition = planExecutionTransition(
    {
      run: active.runs[0].run,
      attempt: setup.staged.attempt,
      manifest: setup.manifest,
      ownership: active.ownership,
      executions: active.executions,
    },
    fact,
  );
  if (transition.kind !== 'applied') throw new Error('fixture reattachment refused');
  const attached = advanceAttempt(setup.staged.attempt, transition.value, true);
  const reattached: HistoryCatalog = {
    ...active,
    attempts: [{ ...active.attempts[0], attempt: attached }],
    runs: [{ ...active.runs[0], run: { ...active.runs[0].run, revision: attached.revision + 1 } }],
    executions: [
      ...active.executions,
      decodeRecordedExecution({
        version: 1,
        command: { version: 2, kind: 'execution', commandId: 'reattach-during-recovery', fact },
        context: null,
        reply: { version: 1, kind: 'execution', attempt: attached },
      }),
    ],
  };
  expect(() => validateHistory(reattached)).toThrow('corrupt active recovery claim checkpoint');
});
test('applied barrier removes latest authority while hold capacity cannot authorize generic execution', async () => {
  const { catalog, held, setup } = await claimCatalog(true);
  const scope = reconstructRuntimePrefix(
    catalog.runtime.scopes[0],
    catalog.runtime,
    catalog.ownership,
    5,
  );
  expect(latestAuthority(scope)).toBeNull();
  expect(
    planExecutionTransition(
      {
        run: catalog.runs[0].run,
        attempt: held,
        manifest: setup.manifest,
        ownership: catalog.ownership,
        executions: catalog.executions,
      },
      { kind: 'recovery_required', reason: 'retry' },
    ),
  ).toEqual({ kind: 'refused', reason: 'state_conflict' });
});
test('public runtime read reaches complete claim recovery stage audit', async () => {
  const { catalog, setup } = await claimCatalog(true);
  const corrupted = structuredClone(catalog);
  Object.assign(corrupted.runtime.recovery.histories[0].intent.target, {
    stageCommandId: 'missing-stage',
  });
  const clone = globalThis.structuredClone;
  try {
    globalThis.structuredClone = function <T>(value: T, options?: StructuredSerializeOptions): T {
      if (
        typeof value === 'object' &&
        value !== null &&
        'runtime' in value &&
        'attempts' in value &&
        'manifests' in value
      )
        return clone(corrupted) as T;
      return clone(value, options);
    };
    await rejects(
      setup.runs.readRuntimeScope(setup.scope),
      /corrupt recovery claim stage association/,
    );
  } finally {
    globalThis.structuredClone = clone;
  }
});

import { buildClaimRequest } from './build-claim-request';
import { prepareSession } from './testing/fixtures';

test('claim builder refuses an acquisition below the published barrier floor', async () => {
  const clock = new FixtureClock();
  const stores = {
    ...createMemoryStores({
      organizationId: organizationId('organization'),
      capacity: 2,
      leaseMilliseconds: 100,
      clock,
    }),
    clock,
  };
  const setup = await prepareSession(stores);
  const scope = await stores.runs.readRuntimeScope(setup.scope);
  if (scope.kind !== 'pinned') throw new Error('expected pinned scope');
  const runs = {
    ...stores.runs,
    readRuntimeScope() {
      return Promise.resolve({
        ...scope,
        version: 2 as const,
        generationFloor: 2,
        activeRecoveryId: null,
        recoveries: [],
      });
    },
  };
  expect(
    await buildClaimRequest(runs, stores.artifacts, await setup.scopedGuard(), {
      commandId: 'after-barrier',
      stateEvidence: setup.preparationInput.stateEvidence,
    }),
  ).toEqual({ kind: 'refused', reason: 'authority_conflict' });
});
test('raw runtime audit rejects a hold linked to another closure', async () => {
  const { catalog } = await claimCatalog(true);
  Object.assign(catalog.runtime.recovery.histories[0].closure!.attemptReply!.state, {
    closureId: 'other',
  });
  expect(() => {
    auditRecoveryCatalog(catalog.runtime, catalog.ownership);
  }).toThrow();
});

import { readExecutionHistory } from './claim-history';
test('verified execution rejects closure absent from the complete runtime journal', async () => {
  const { catalog, setup } = await claimCatalog(true);
  const history = validateHistory(catalog)[0];
  const scope = await setup.runs.readRuntimeScope(setup.scope);
  if (scope.kind !== 'pinned') throw new Error('expected pinned scope');
  const runs = {
    ...setup.runs,
    readExecutionHistory: () => Promise.resolve(history),
    readRuntimeScope: () =>
      Promise.resolve({
        ...scope,
        version: 2 as const,
        recoveries: [],
        activeRecoveryId: null,
        generationFloor: 1,
      }),
  };
  await rejects(
    readExecutionHistory(runs, setup.artifacts, setup.run.runId, setup.attempt.attemptId),
    /execution recovery.*differs/,
  );
});

test('raw recovery audit preserves public receipt authority additions', () => {
  const { catalog, ownership } = authorityCatalog();
  const extend = (candidate: unknown): void => {
    if (typeof candidate !== 'object' || candidate === null) return;
    if ('ownerId' in candidate && 'generation' in candidate)
      Object.assign(candidate, { serverExtension: 'retained' });
    for (const value of Object.values(candidate)) extend(value);
  };
  extend(catalog.recovery);
  auditRecoveryCatalog(catalog, ownership);
});

function visitRecords(candidate: unknown, change: (record: Record<string, unknown>) => void): void {
  if (typeof candidate !== 'object' || candidate === null) return;
  const record = candidate as Record<string, unknown>;
  change(record);
  for (const value of Object.values(record)) visitRecords(value, change);
}
for (const fault of [
  'receipt_identity',
  'authority_receipt',
  'journal_target',
  'fence_sequence',
  'fence_identity',
  'initial_basis',
  'duplicate_observation',
  'observation_sequence',
  'orphan_observation',
  'closure_revision',
  'original_acceptance',
  'final_revision',
  'orphan_barrier',
] as const)
  test('coherent recovery witness rejects ' + fault, () => {
    const { catalog, ownership } = authorityCatalog();
    const journal = catalog.recovery.histories[0];
    const closure = journal.closure;
    if (closure === null) throw new Error('expected closure');
    if (fault === 'receipt_identity')
      visitRecords(journal, (record) => {
        if ('schemaVersion' in record && 'acceptance' in record && record['commandId'] === 'fence')
          record['commandId'] = 'other';
      });
    if (fault === 'authority_receipt') {
      visitRecords(journal, (record) => {
        if ('ownerId' in record && record['generation'] === 4) record['generation'] = 5;
      });
      Object.assign(catalog.recovery.barriers[0], { generationFloor: 5 });
    }
    if (fault === 'journal_target') {
      Object.assign(journal.intent.target.original, { localOwner: { ownerId: 'other', epoch: 1 } });
      Object.assign(closure.original, { localOwner: { ownerId: 'other', epoch: 1 } });
    }
    if (fault === 'fence_sequence')
      visitRecords(journal, (record) => {
        if ('ordinal' in record) record['ordinal'] = 2;
      });
    if (fault === 'fence_identity') {
      const digest = journal.fences[0].requestDigest;
      visitRecords(journal, (record) => {
        if (record['requestDigest'] === digest) record['requestDigest'] = 'a'.repeat(64);
      });
    }
    if (fault === 'initial_basis')
      visitRecords(journal, (record) => {
        if (record['kind'] === 'initial' && 'state' in record)
          Object.assign(record, {
            kind: 'superseding',
            previousOrdinal: 1,
            lookup: pair(
              { error: 'runtime_receipt_not_found' },
              {
                kind: 'supersession_lookup',
                recoveryId: 'recover-authority',
                previousOrdinal: 1,
                stateExchange: journal.fences[0].basis.state.envelope.artifact,
              },
              { kind: 'lookup', commandId: 'unused' },
              404,
            ),
          });
      });
    if (fault === 'duplicate_observation') {
      Object.assign(journal, {
        observations: [...journal.observations, structuredClone(journal.observations[0])],
      });
      Object.assign(catalog.recovery.counts, { observations: 2 });
    }
    if (fault === 'observation_sequence') {
      visitRecords(journal, (record) => {
        if ('observedRevision' in record) record['observedRevision'] = 3;
        if ('observationRevision' in record) record['observationRevision'] = 3;
      });
      Object.assign(journal, { revision: 4 });
      Object.assign(closure, { resolvedRevision: 4 });
    }
    if (fault === 'orphan_observation') {
      const orphan = structuredClone(journal.observations[0]);
      Object.assign(orphan.fence, { ordinal: 2 });
      Object.assign(journal, { observations: [...journal.observations, orphan] });
      Object.assign(catalog.recovery.counts, { observations: 2 });
    }
    if (fault === 'closure_revision') {
      Object.assign(closure, { resolvedRevision: 99 });
      Object.assign(journal, { revision: 99 });
    }
    if (fault === 'original_acceptance') {
      Object.assign(catalog.acceptances[1], { acceptedRevision: 99 });
      if (closure.originalReply?.kind !== 'authority') throw new Error('expected authority ack');
      Object.assign(closure.originalReply.acceptance, { acceptedRevision: 99 });
    }
    if (fault === 'final_revision') Object.assign(journal, { revision: 99 });
    if (fault === 'orphan_barrier') {
      Object.assign(catalog.recovery, {
        barriers: [
          ...catalog.recovery.barriers,
          { ...catalog.recovery.barriers[0], recoveryId: 'orphan' },
        ],
      });
      Object.assign(catalog.recovery.counts, { barriers: 2 });
    }
    expect(() => {
      auditRecoveryCatalog(catalog, ownership);
    }).toThrow();
  });
test('coherent recovery claim value cannot replace receipt-derived command projection', async () => {
  const { catalog } = await claimCatalog(true);
  const closure = catalog.runtime.recovery.histories[0].closure;
  if (
    closure?.decision.kind !== 'accepted' ||
    !('command' in closure.decision) ||
    closure.originalReply?.kind !== 'claim'
  )
    throw new Error('expected accepted claim');
  Object.assign(closure.decision.command.projection, { claimId: 'forged' });
  Object.assign(closure.originalReply.command.projection, { claimId: 'forged' });
  expect(() => {
    auditRecoveryCatalog(catalog.runtime, catalog.ownership);
  }).toThrow();
});
test('coherent recovery claim receipt cannot replace original claim target', async () => {
  const { catalog } = await claimCatalog(true);
  const closure = catalog.runtime.recovery.histories[0].closure;
  if (closure?.decision.kind !== 'accepted' || !('command' in closure.decision))
    throw new Error('expected accepted claim');
  Object.assign(closure.decision.lookup.body.value.acceptance.claim, { workItemId: 'forged' });
  expect(() => {
    auditRecoveryCatalog(catalog.runtime, catalog.ownership);
  }).toThrow();
});
test('coherent recovery active target cannot already be accepted', () => {
  const { catalog, ownership } = authorityCatalog();
  const journal = catalog.recovery.histories[0];
  const open: RuntimeCatalog = {
    ...catalog,
    scopes: [{ ...catalog.scopes[0], revision: 4 }],
    recovery: {
      histories: [{ ...journal, revision: 0, fences: [], observations: [], closure: null }],
      barriers: [],
      active: [{ scope: runtimeScope, recoveryId: journal.intent.recoveryId }],
      counts: { journals: 1, fences: 0, observations: 0, closures: 0, barriers: 0, active: 1 },
    },
  };
  expect(() => {
    auditRecoveryCatalog(open, ownership);
  }).toThrow();
});

function supersedingCatalog(previousReply: 'none' | 'conflict' | 'accepted') {
  const fixture = authorityCatalog();
  const journal = fixture.catalog.recovery.histories[0];
  const closure = journal.closure;
  if (closure?.decision.kind !== 'accepted') throw new Error('expected closure');
  const recoveryId = journal.intent.recoveryId;
  const priorRequest = authorityRequest('prior-fence', 2);
  const priorIntent = decodeRuntimeIntent({
    version: 1,
    commandId: 'prior-fence',
    canonicalRequest: priorRequest,
    requestDigest: digestRuntimeRequest(priorRequest),
    localOwner: journal.intent.resolver,
    stagedRevision: 1,
  });
  const priorState = {
    ...journal.fences[0].basis.state.body.value,
    authority: { kind: 'held', ownerId: 'receiver-owner', generation: 2 },
  };
  const prior = {
    ...journal.fences[0],
    canonicalRequest: priorRequest,
    requestDigest: priorIntent.requestDigest,
    basis: {
      kind: 'initial',
      state: pair(priorState, { kind: 'initial_state', recoveryId }, { kind: 'state' }),
    },
  };
  const state = pair(
    journal.fences[0].basis.state.body.value,
    {
      kind: 'supersession_state',
      recoveryId,
      previousOrdinal: 1,
      previousRequestDigest: prior.requestDigest,
    },
    { kind: 'state' },
  );
  const absence = pair(
    { error: 'runtime_receipt_not_found' },
    {
      kind: 'supersession_lookup',
      recoveryId,
      previousOrdinal: 1,
      stateExchange: state.envelope.artifact,
    },
    { kind: 'lookup', commandId: priorIntent.commandId },
    404,
  );
  const stagedRevision = previousReply === 'none' ? 2 : 3;
  const fence = {
    ...journal.fences[0],
    ordinal: 2,
    stagedRevision,
    basis: { kind: 'superseding', previousOrdinal: 1, state, lookup: absence },
  };
  const reply = pair(
    closure.fence.observation.reply.body.value,
    {
      kind: 'fence_reply',
      recoveryId,
      ordinal: 2,
      requestDigest: fence.requestDigest,
      stagedRevision,
    },
    { kind: 'authority', canonicalRequest: fence.canonicalRequest },
  );
  const observation = {
    version: 1,
    kind: 'accepted',
    fence,
    reply,
    observedRevision: stagedRevision + 1,
  };
  const lookup = pair(
    closure.decision.lookup.body.value,
    {
      kind: 'original_lookup',
      recoveryId,
      ordinal: 2,
      observationRevision: observation.observedRevision,
      fenceExchange: reply.envelope.artifact,
      fenceReceipt: reply.body.artifact,
    },
    { kind: 'lookup', commandId: journal.intent.target.original.commandId },
  );
  const earlier = {
    version: 1,
    kind: previousReply === 'accepted' ? 'accepted' : 'generation_conflict',
    fence: prior,
    observedRevision: 2,
    reply: pair(
      previousReply === 'accepted'
        ? authorityReceipt(priorIntent)
        : { error: 'runtime_generation_conflict' },
      {
        kind: 'fence_reply',
        recoveryId,
        ordinal: 1,
        requestDigest: prior.requestDigest,
        stagedRevision: 1,
      },
      { kind: 'authority', canonicalRequest: prior.canonicalRequest },
      previousReply === 'accepted' ? 200 : 409,
    ),
  };
  const history = decodeRecoveryHistory({
    ...journal,
    revision: stagedRevision + 2,
    fences: [prior, fence],
    observations: previousReply === 'none' ? [observation] : [earlier, observation],
    closure: {
      ...closure,
      fence: { fence, observation },
      decision: { kind: 'accepted', lookup },
      resolvedRevision: stagedRevision + 2,
    },
  });
  const catalog: RuntimeCatalog = {
    ...fixture.catalog,
    recovery: {
      ...fixture.catalog.recovery,
      histories: [history],
      counts: {
        ...fixture.catalog.recovery.counts,
        fences: 2,
        observations: previousReply === 'none' ? 1 : 2,
      },
    },
  };
  return { ...fixture, catalog };
}
for (const previousReply of ['none', 'conflict'] as const)
  test('recovery supersession retains complete ordered ' + previousReply + ' witnesses', () => {
    const { catalog, ownership, retained } = supersedingCatalog(previousReply);
    expect(reconstructRuntimeScope(retained, catalog, ownership).generationFloor).toBe(4);
    expect(reconstructRuntimePrefix(retained, catalog, ownership, 4).generationFloor).toBe(3);
  });
test('recovery supersession rejects prior ordinal substitution', () => {
  const { catalog, ownership } = supersedingCatalog('conflict');
  visitRecords(catalog.recovery, (record) => {
    if (record['kind'] === 'superseding') record['previousOrdinal'] = 2;
  });
  expect(() => {
    auditRecoveryCatalog(catalog, ownership);
  }).toThrow();
});
test('recovery supersession rejects an already accepted prior fence', () => {
  const { catalog, ownership } = supersedingCatalog('accepted');
  expect(() => {
    auditRecoveryCatalog(catalog, ownership);
  }).toThrow();
});

test('recovery nonacceptance cannot publish an original claim acknowledgement', async () => {
  const { catalog, setup } = await claimCatalog(false);
  const closure = catalog.runtime.recovery.histories[0].closure;
  const accepted = (
    await setup.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId)
  ).executions.find((entry) => entry.command.kind === 'accept_claim');
  if (closure === null || accepted?.command.kind !== 'accept_claim')
    throw new Error('expected fixture');
  Object.assign(closure, {
    originalReply: { kind: 'claim', command: accepted.command, ack: setup.accepted },
  });
  expect(() =>
    reconstructRuntimeScope(catalog.runtime.scopes[0], catalog.runtime, catalog.ownership),
  ).toThrow();
});
test('runtime prefix cannot fold future events beyond the retained scope cut', () => {
  const { catalog, ownership } = authorityCatalog();
  const runtime: RuntimeCatalog = {
    ...catalog,
    scopes: [{ ...catalog.scopes[0], revision: 2 }],
    acceptances: [catalog.acceptances[0]],
    recovery: {
      histories: [],
      barriers: [],
      active: [],
      counts: { journals: 0, fences: 0, observations: 0, closures: 0, barriers: 0, active: 0 },
    },
  };
  expect(() => reconstructRuntimePrefix(runtime.scopes[0], runtime, ownership, 3)).toThrow();
});

import { planRuntimeStage } from './plan-runtime';
test('recovery barrier refuses fresh authority below its floor and preserves exact stage replay', () => {
  const { catalog, ownership } = authorityCatalog();
  const guard = { ownership: ownership.owner, scope: runtimeScope, expectedRevision: 5 };
  expect(planRuntimeStage(catalog, guard, authorityRequest('next', 3), ownership)).toEqual({
    kind: 'refused',
    reason: 'authority_conflict',
  });
  expect(planRuntimeStage(catalog, guard, authorityRequest('next', 4), ownership).kind).toBe(
    'applied',
  );
  expect(planRuntimeStage(catalog, guard, catalog.intents[1].canonicalRequest, ownership)).toEqual({
    kind: 'duplicate',
    value: catalog.intents[1],
  });
});
test('recovery claim acceptance identity cannot borrow an existing stage command', async () => {
  const { catalog } = await claimCatalog(false);
  Object.assign(catalog.runtime.recovery.histories[0].intent.target, {
    acceptanceCommandId: 'stage-claim',
  });
  expect(() => validateHistory(catalog)).toThrow();
});

import { advanceAttempt } from './plan-execution';
import { verifyRecoveryHistory } from './recovery-history';
for (const accepted of [true, false])
  test(
    'complete claim recovery verifies actual exchanges accepted=' + String(accepted),
    async () => {
      const { history, setup } = await claimCatalog(accepted);
      const artifacts = {
        ...setup.artifacts,
        readArtifact(reference: Parameters<typeof setup.artifacts.readArtifact>[0]) {
          const content = recoveryBytes.get(reference.digest);
          if (content === undefined) throw new Error('missing retained test recovery bytes');
          return Promise.resolve(new Uint8Array(content));
        },
      };
      await verifyRecoveryHistory(artifacts, history);
      if (history.closure?.decision.kind === 'accepted' && 'command' in history.closure.decision) {
        Object.assign(history.closure.decision.command.projection, { claimId: 'forged' });
        await rejects(
          verifyRecoveryHistory(artifacts, history),
          /command differs from actual receipt/,
        );
      }
    },
  );
test('recovery hold cannot advance through an ordinary Attempt2 acknowledgement', async () => {
  const { held } = await claimCatalog(true);
  expect(() => advanceAttempt(held, executionCheckpoint(held), true)).toThrow();
});
test('recovery identities cannot borrow an existing execution command', async () => {
  const { catalog } = await claimCatalog(false);
  visitRecords(catalog.runtime.recovery, (record) => {
    if ('recoveryId' in record) record['recoveryId'] = 'stage-claim';
    if ('closureId' in record) record['closureId'] = 'stage-claim';
  });
  Object.assign(catalog.attempts[0].attempt.state, { closureId: 'stage-claim' });
  expect(() => validateHistory(catalog)).toThrow();
});

test('recovery claim kind retains its precise refinement diagnostic', async () => {
  const { catalog } = await claimCatalog(true);
  const closure = catalog.runtime.recovery.histories[0].closure;
  if (closure?.decision.kind !== 'accepted') throw new Error('expected acceptance');
  const lookup = closure.decision.lookup;
  Object.assign(closure, {
    decision: {
      kind: 'accepted',
      lookup: {
        ...lookup,
        body: {
          ...lookup.body,
          value: {
            ...lookup.body.value,
            acceptance: {
              kind: 'authority',
              authority: { ownerId: 'receiver-owner', generation: 1 },
            },
          },
        },
      },
    },
  });
  expect(() => {
    auditRecoveryCatalog(catalog.runtime, catalog.ownership);
  }).toThrow('corrupt recovery claim receipt kind');
});
test('recovery active scope retains its diagnostic after the association lookup dependency changes', () => {
  const { catalog, ownership } = authorityCatalog();
  const journal = catalog.recovery.histories[0];
  const scopes = [{ ...catalog.scopes[0], revision: 3 }];
  const find = scopes.find.bind(scopes);
  let finds = 0;
  Object.defineProperty(scopes, 'find', {
    value: (predicate: (scope: (typeof scopes)[number]) => boolean) => {
      finds++;
      return finds === 2 ? undefined : find(predicate);
    },
  });
  const open: RuntimeCatalog = {
    ...catalog,
    scopes,
    acceptances: [catalog.acceptances[0]],
    recovery: {
      histories: [{ ...journal, revision: 0, fences: [], observations: [], closure: null }],
      barriers: [],
      active: [{ scope: runtimeScope, recoveryId: journal.intent.recoveryId }],
      counts: { journals: 1, fences: 0, observations: 0, closures: 0, barriers: 0, active: 1 },
    },
  };
  expect(() => {
    auditRecoveryCatalog(open, ownership);
  }).toThrow('corrupt recovery target scope');
});

test('open recovery cannot retain a future closure barrier', () => {
  const { catalog, ownership } = authorityCatalog();
  const journal = catalog.recovery.histories[0];
  const open: RuntimeCatalog = {
    ...catalog,
    scopes: [{ ...catalog.scopes[0], revision: 3 }],
    acceptances: catalog.acceptances.filter((acceptance) => acceptance.commandId === 'prior'),
    recovery: {
      histories: [{ ...journal, revision: 0, fences: [], observations: [], closure: null }],
      barriers: [],
      active: [{ scope: runtimeScope, recoveryId: journal.intent.recoveryId }],
      counts: { journals: 1, fences: 0, observations: 0, closures: 0, barriers: 0, active: 1 },
    },
  };
  auditRecoveryCatalog(open, ownership);
  const corrupt: RuntimeCatalog = {
    ...open,
    recovery: {
      ...open.recovery,
      barriers: catalog.recovery.barriers,
      counts: { ...open.recovery.counts, barriers: 1 },
    },
  };
  expect(() => {
    auditRecoveryCatalog(corrupt, ownership);
  }).toThrow('corrupt open recovery barrier');
});

test('recovery current hold retains its precise provenance diagnostic', async () => {
  const { catalog, held } = await claimCatalog(true);
  const corrupted: HistoryCatalog = {
    ...catalog,
    attempts: [{ ...catalog.attempts[0], attempt: { ...held, revision: held.revision + 1 } }],
  };
  expect(() => validateHistory(corrupted)).toThrow('corrupt recovery current hold');
});
test('recovery subsequent event retains its precise hold diagnostic', async () => {
  const { catalog, held, setup } = await claimCatalog(true);
  if (held.version !== 3 || held.state.cause !== 'claim_accepted_fenced')
    throw new Error('expected ready hold');
  const predecessor = decodeAttempt({ ...held, version: 2, state: held.state.checkpoint });
  const fact = {
    kind: 'session_reattached' as const,
    locator: held.state.checkpoint.execution.session.locator,
    owner: { ownerId: setup.ownership.ownerId, epoch: setup.ownership.epoch },
    evidence: setup.accepted.acceptance.evidence,
  };
  const transition = planExecutionTransition(
    {
      run: catalog.runs[0].run,
      attempt: predecessor,
      manifest: setup.manifest,
      ownership: catalog.ownership,
      executions: catalog.executions,
    },
    fact,
  );
  if (transition.kind !== 'applied') throw new Error('fixture reattachment refused');
  const following = decodeRecordedExecution({
    version: 1,
    command: { version: 2, kind: 'execution', commandId: 'reattach-after-hold', fact },
    context: null,
    reply: {
      version: 1,
      kind: 'execution',
      attempt: advanceAttempt(predecessor, transition.value, true),
    },
  });
  expect(() =>
    validateHistory({ ...catalog, executions: [...catalog.executions, following] }),
  ).toThrow('recovery hold has a subsequent attempt event');
});

import { spyOn } from 'bun:test';

import * as executionPlanner from './plan-execution';

test('recovery hold predecessor retains its precise checkpoint dependency diagnostic', async () => {
  const { catalog } = await claimCatalog(true);
  const original = executionPlanner.executionCheckpoint;
  const checkpoint = spyOn(executionPlanner, 'executionCheckpoint').mockImplementation(
    (candidate) =>
      'state' in candidate && candidate.version === 2 && candidate.state.kind === 'ready'
        ? { kind: 'queued' }
        : original(candidate),
  );
  try {
    expect(() => validateHistory(catalog)).toThrow('corrupt recovery hold predecessor');
  } finally {
    checkpoint.mockRestore();
  }
});

test('recovery missing hold retains its diagnostic after audited local value changes', async () => {
  const { catalog } = await claimCatalog(true);
  const closure = catalog.runtime.recovery.histories[0].closure;
  if (closure === null) throw new Error('expected closed recovery');
  const retained = [...catalog.attempts];
  Object.defineProperty(catalog.attempts, Symbol.iterator, {
    value: function* () {
      Object.assign(closure, { attemptReply: null });
      yield* retained;
    },
  });
  expect(() => validateHistory(catalog)).toThrow('claim closure has no hold');
});
