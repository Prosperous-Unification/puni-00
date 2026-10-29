import { rejects } from 'node:assert/strict';

import { test } from 'bun:test';

import { organizationId } from './record-codecs';
import { decodeRecoveryHistory } from './recovery-codecs';
import { verifyRecoveryHistory } from './recovery-history';
import { decodeRuntimeIntent, digestRuntimeRequest } from './runtime-codecs';
import { FixtureClock } from './testing/fixtures';
import { createMemoryStores } from './testing/memory-stores';
import { authorityRequest, runtimeScope } from './testing/runtime-history-contract';

async function fixture() {
  const stores = createMemoryStores({
    organizationId: organizationId('organization'),
    capacity: 2,
    leaseMilliseconds: 100,
    clock: new FixtureClock(),
  });
  const retain = async (value: unknown) => {
    const retained = await stores.artifacts.retainArtifact(
      new TextEncoder().encode(JSON.stringify(value)),
      'application/json',
    );
    if (retained.kind !== 'retained') throw new Error('fixture retention refused');
    return retained.reference;
  };
  const state = {
    serverExtension: 'retained',
    schemaVersion: 1,
    ledgerId: 'ledger',
    scope: runtimeScope,
    basis: 'rb1:' + 'a'.repeat(64),
    facts: { projectRevision: 0, workItems: [], steps: [] },
    authority: { kind: 'held', ownerId: 'receiver-owner', generation: 3 },
    claims: [],
  };
  const body = await retain(state);
  const exchange = {
    version: 1,
    context: { kind: 'initial_state', recoveryId: 'recover' },
    scope: runtimeScope,
    ledgerId: 'ledger',
    request: { kind: 'state' },
    status: 200,
    body,
  };
  const envelope = await retain(exchange);
  const canonicalRequest = authorityRequest('original', 2);
  const original = decodeRuntimeIntent({
    version: 1,
    commandId: 'original',
    canonicalRequest,
    requestDigest: digestRuntimeRequest(canonicalRequest),
    localOwner: { ownerId: 'owner', epoch: 1 },
    stagedRevision: 1,
  });
  const history = decodeRecoveryHistory({
    version: 1,
    intent: {
      version: 1,
      recoveryId: 'recover',
      target: { kind: 'authority', original },
      begunScopeRevision: 1,
      resolver: original.localOwner,
    },
    revision: 1,
    fences: [
      {
        version: 1,
        recoveryId: 'recover',
        ordinal: 1,
        canonicalRequest: authorityRequest('fence', 3),
        requestDigest: digestRuntimeRequest(authorityRequest('fence', 3)),
        owner: original.localOwner,
        stagedRevision: 1,
        basis: {
          kind: 'initial',
          state: {
            envelope: { artifact: envelope, value: exchange },
            body: { artifact: body, value: state },
          },
        },
      },
    ],
    observations: [],
    closure: null,
  });
  return { stores, history };
}
test('verified recovery rereads complete values and rejects a coherent same-reference rewrite', async () => {
  const { stores, history } = await fixture();
  await verifyRecoveryHistory(stores.artifacts, history);
  const rewritten = structuredClone(history);
  Object.assign(rewritten.fences[0].basis.state.body.value, { basis: 'rb1:' + 'b'.repeat(64) });
  await rejects(verifyRecoveryHistory(stores.artifacts, rewritten));
});
test('verified recovery rejects substituted envelope values with retained original references', async () => {
  const { stores, history } = await fixture();
  const rewritten = structuredClone(history);
  Object.assign(rewritten.fences[0].basis.state.envelope.value, { ledgerId: 'other' });
  await rejects(verifyRecoveryHistory(stores.artifacts, rewritten));
});

import { readExecutionHistory } from './claim-history';
import { readRuntimeHistory } from './runtime-history';
import { prepareSession } from './testing/fixtures';

test('verified runtime read checks active recovery witnesses', async () => {
  const { stores, history } = await fixture();
  const rewritten = structuredClone(history);
  Object.assign(rewritten.fences[0].basis.state.body.value, { basis: 'rb1:' + 'b'.repeat(64) });
  const runs = {
    readRuntimeScope: () =>
      Promise.resolve({
        version: 2 as const,
        kind: 'pinned' as const,
        pin: { version: 1 as const, scope: runtimeScope, ledgerId: 'ledger' },
        revision: 1,
        ownerEpoch: 1,
        intents: [history.intent.target.original],
        acceptances: [],
        pendingCommandId: history.intent.target.original.commandId,
        grant: null,
        generationFloor: null,
        activeRecoveryId: history.intent.recoveryId,
        recoveries: [rewritten],
      }),
  };
  await rejects(readRuntimeHistory(runs, stores.artifacts, runtimeScope));
});
test('verified execution read checks active journals even before a closure exists', async () => {
  const { stores, history: recovery } = await fixture();
  const setup = await prepareSession({ ...stores, clock: new FixtureClock() });
  const history = await stores.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId);
  const scope = await stores.runs.readRuntimeScope(setup.scope);
  if (scope.kind !== 'pinned') throw new Error('expected pinned scope');
  const rewritten = structuredClone(recovery);
  Object.assign(rewritten.fences[0].basis.state.body.value, { basis: 'rb1:' + 'b'.repeat(64) });
  const runs = {
    ...stores.runs,
    readExecutionHistory: () =>
      Promise.resolve({ ...history, version: 2 as const, recoveries: [] }),
    readRuntimeScope: () =>
      Promise.resolve({
        ...scope,
        version: 2 as const,
        generationFloor: 1,
        activeRecoveryId: recovery.intent.recoveryId,
        recoveries: [rewritten],
      }),
  };
  await rejects(
    readExecutionHistory(runs, stores.artifacts, setup.run.runId, setup.attempt.attemptId),
  );
});

test('verified recovery compares allowed public extensions against actual bytes', async () => {
  const { stores, history } = await fixture();
  await verifyRecoveryHistory(stores.artifacts, history);
  Object.assign(history.fences[0].basis.state.body.value, { serverExtension: 'rewritten' });
  await rejects(verifyRecoveryHistory(stores.artifacts, history));
});

test('verified successor execution refuses predecessor scope without recovery witnesses', async () => {
  const { stores } = await fixture();
  const setup = await prepareSession({ ...stores, clock: new FixtureClock() });
  const history = await stores.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId);
  const runs = {
    ...stores.runs,
    readRuntimeScope: async (scope: Parameters<typeof stores.runs.readRuntimeScope>[0]) => {
      const current = await stores.runs.readRuntimeScope(scope);
      if (current.kind !== 'pinned') throw new Error('expected pinned fixture scope');
      return {
        version: 1 as const,
        kind: 'pinned' as const,
        pin: current.pin,
        revision: current.revision,
        ownerEpoch: current.ownerEpoch,
        intents: current.intents,
        acceptances: current.acceptances,
        pendingCommandId: current.pendingCommandId,
        grant: current.grant,
      };
    },
    readExecutionHistory: () =>
      Promise.resolve({ ...history, version: 2 as const, recoveries: [] }),
  };
  await rejects(
    readExecutionHistory(runs, stores.artifacts, setup.run.runId, setup.attempt.attemptId),
    /execution recovery scope differs/,
  );
});
