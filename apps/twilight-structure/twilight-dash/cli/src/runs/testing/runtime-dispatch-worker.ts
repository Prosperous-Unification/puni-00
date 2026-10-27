import { strict as assert } from 'node:assert';
import { readFileSync, statSync } from 'node:fs';

import { parseOrThrow, type } from '@shared/validation';
import {
  acceptWorkflowBinding,
  canonicalJson,
  checkWorkflowBinding,
  decodeWorkflowBinding,
  selectWorkflowActivity,
} from '@twilight-burokrat/contracts';
import { canonicalRuntimeRequest, fetchTransport } from '@wbs/contracts';

import type { ActivityExecutor, ActivitySession } from '../../agents/activity-executor';
import { createClaimClient } from '../../bridge/claim-client';
import { createRuntimeClient } from '../../bridge/runtime-client';
import { buildClaimRequest } from '../build-claim-request';
import { claimActivity } from '../claim-activity';
import { dispatchAuthority } from '../dispatch-authority';
import { dispatchTurn } from '../dispatch-turn';
import { prepareActivity } from '../prepare-activity';
import {
  decodeAdmission,
  executionCommandId,
  organizationId,
  ownerId,
  projectId,
} from '../record-codecs';
import type { ScopedAttemptGuard } from '../run-store';
import { bootstrapSqliteStores, openSqliteStores } from '../sqlite/open-stores';
import { createManifest, createRun, FixtureClock, unwrapReply } from './fixtures';

async function awaitPhase<T>(promise: Promise<T>, phase: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_accept, reject) => {
        timer = setTimeout(() => {
          reject(new Error('worker phase expired: ' + phase));
        }, 8000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
function sendPhase(message: object) {
  if (process.send === undefined) throw new Error('worker IPC unavailable');
  process.send(message);
}
function disconnectWorker() {
  if (process.disconnect === undefined) throw new Error('worker IPC disconnect unavailable');
  process.disconnect();
}
const commands: unknown[] = [];
let waiting: ReturnType<typeof Promise.withResolvers<unknown>> | undefined;
process.on('message', (message: unknown) => {
  if (waiting !== undefined) waiting.resolve(message);
  else commands.push(message);
});
async function receiveCommand(expected: string) {
  const message =
    commands.length > 0
      ? commands.shift()
      : await awaitPhase((waiting = Promise.withResolvers<unknown>()).promise, expected);
  waiting = undefined;
  assert.equal(message, expected, 'unexpected worker command');
}
const configPath = parseOrThrow(type('string>=1'), process.argv[2]);
assert.equal(statSync(configPath).mode & 0o777, 0o600, 'private configuration mode');
const config = parseOrThrow(
  type({
    base: 'string>=1',
    credential: 'string>=1',
    organizationId: 'string>=1',
    projectId: 'string>=1',
    path: 'string>=1',
  }).onUndeclaredKey('reject'),
  JSON.parse(readFileSync(configPath, 'utf8')),
);
const base = new URL(config.base);
assert.equal(base.hostname, '127.0.0.1');
assert.equal(base.protocol, 'http:');
const options = {
  path: config.path,
  organizationId: organizationId(config.organizationId),
  capacity: 1,
  leaseMilliseconds: 10000,
  clock: new FixtureClock(),
  maxBusyAttempts: 20,
  busyDelayMilliseconds: 1,
};
const writer = await bootstrapSqliteStores(options);
let observer: Awaited<ReturnType<typeof openSqliteStores>> | undefined;
let posts = 0;
let turns = 0;
try {
  observer = await openSqliteStores(options);
  const reader = observer;
  const cancellation = AbortSignal.timeout(25000);
  // The same authenticated public transport serves the runtime and live-claim readers.
  const transport = fetchTransport(config.base, async (url, init) => {
    const headers = new Headers(init.headers);
    headers.set('authorization', 'Bearer ' + config.credential);
    headers.set('origin', 'http://localhost');
    headers.set('X-WBS-Expected-Organization', config.organizationId);
    const conditional =
      init.method === 'POST' && new URL(url).pathname.endsWith('/runtime-commands');
    if (conditional) {
      posts += 1;
      const history = await reader.runs.readExecutionHistory(run.runId, attempt.attemptId);
      // Proof: O2 premature POST adds a second send; the boot assertion rejects it.
      assert.equal(history.attempt.state.kind, 'claiming', 'claim intent must commit before HTTP');
      // Proof: R1 corrupts the reader locator; the boot assertion rejects it.
      assert.deepEqual(
        history.attempt.state.session.locator,
        session.locator,
        'locator must commit before conditional HTTP',
      );
    }
    const response = await fetch(url, { ...init, headers });
    if (conditional) {
      assert.equal(response.status, 200, 'original conditional acceptance');
      await response.arrayBuffer();
      throw new TypeError('controlled response loss after actual receiver acceptance');
    }
    return response;
  });
  const runtime = createRuntimeClient(transport);
  const claims = createClaimClient(transport);
  const ownership = unwrapReply(
    await writer.runs.acquireOwnership(ownerId('local-owner'), writer.ownership.epoch),
  );
  const scope = {
    organizationId: ownership.organizationId,
    projectId: config.projectId,
    personId: 'person',
  };
  const discovery = await runtime.readState({
    params: { id: config.projectId },
    query: { personId: 'person' },
    signal: cancellation,
  });
  if (discovery.reply.kind !== 'success') throw new Error('runtime discovery refused');
  const initial = discovery.reply.body;
  unwrapReply(
    await writer.runs.pinRuntimeScope(ownership, { version: 1, scope, ledgerId: initial.ledgerId }),
  );
  const authority = await dispatchAuthority(
    writer.runs,
    writer.artifacts,
    runtime,
    { ownership, scope, expectedRevision: 0 },
    canonicalRuntimeRequest(scope, {
      schemaVersion: 1,
      kind: 'authority',
      commandId: 'authority',
      expectedLedgerId: initial.ledgerId,
      ownerId: 'receiver-owner',
      expectedGeneration: null,
    }),
    cancellation,
  );
  assert.equal(authority.kind, 'accepted');
  const prompt = new TextEncoder().encode('Prepare the selected activity.');
  const accepted = acceptWorkflowBinding(
    checkWorkflowBinding(
      decodeWorkflowBinding({
        version: 1,
        types: { default: { plan: { class: 'planner' } } },
        classes: { planner: { executor: 'human', prompt: 'plan.md' } },
      }),
      ['plan'],
    ),
    [{ path: 'plan.md', bytes: prompt }],
  );
  const promptArtifact = await writer.artifacts.retainArtifact(prompt, 'text/plain');
  if (promptArtifact.kind !== 'retained') throw new Error('prompt retention refused');
  const manifest = createManifest({
    canonicalBinding: canonicalJson(accepted.snapshot),
    prompts: [promptArtifact.reference],
    executorVersions: { human: 'human-1' },
  });
  unwrapReply(await writer.runs.retainManifest(ownership, manifest));
  const run = unwrapReply(
    await writer.runs.createRun(
      ownership,
      createRun({ projectId: projectId(config.projectId), manifestDigest: manifest.digest }),
    ),
  );
  const admission = decodeAdmission({
    attemptId: 'attempt',
    identity: {
      version: 1,
      runId: run.runId,
      occurrenceId: 'occurrence',
      operationKey: 'operation',
    },
    ordinal: 1,
  });
  const attempt = unwrapReply(
    await writer.runs.admitAttempt({ ownership, runId: run.runId, expectedRevision: 0 }, admission),
  );
  const state = await runtime.readState({
    params: { id: config.projectId },
    query: { personId: 'person', expectedLedgerId: initial.ledgerId },
    signal: cancellation,
  });
  if (state.reply.kind !== 'success' || state.response === null)
    throw new Error('target observation missing');
  const evidence = await writer.artifacts.retainArtifact(state.response.bytes, 'application/json');
  if (evidence.kind !== 'retained') throw new Error('target retention refused');
  const preparation = {
    version: 1 as const,
    identity: admission.identity,
    attemptId: attempt.attemptId,
    creationKey: 'creation',
  };
  const selected = selectWorkflowActivity(accepted, 'feature', 'plan');
  const session: ActivitySession = {
    locator: {
      version: 1,
      executor: 'human',
      executorVersion: 'human-1',
      preparation,
      selection: {
        bindingDigest: selected.bindingDigest,
        requestedType: selected.requestedType,
        matchedType: selected.matchedType,
        stepCode: selected.stepCode,
        className: selected.className,
      },
      session: {
        version: 1,
        workerId: 'worker',
        sessionId: 'session',
        operationKey: admission.identity.operationKey,
      },
    },
  };
  async function readGuard(): Promise<ScopedAttemptGuard> {
    const history = await writer.runs.readExecutionHistory(run.runId, attempt.attemptId);
    const retained = await writer.runs.readRuntimeScope(scope);
    if (retained.kind !== 'pinned') throw new Error('runtime scope missing');
    return {
      ownership,
      scope,
      runId: run.runId,
      attemptId: attempt.attemptId,
      expectedRevision: history.run.revision,
      expectedAttemptRevision: history.attempt.revision,
      expectedScopeRevision: retained.revision,
    };
  }
  const rejectRecovery = () => Promise.reject(new Error('unexpected executor recovery or release'));
  const executor: ActivityExecutor = {
    kind: 'human',
    version: 'human-1',
    capabilities: {
      locateSession: 'unsupported',
      resumeSession: 'unsupported',
      deduplicatePreparation: 'unsupported',
      deduplicateTurn: 'unsupported',
      inspectEffect: 'unsupported',
      cancelPhysicalWork: 'unsupported',
      observeQuiescence: 'unsupported',
    },
    async open() {
      const history = await reader.runs.readExecutionHistory(run.runId, attempt.attemptId);
      // Proof: O1 calls open before preparation; the boot assertion rejects it.
      assert.equal(history.attempt.state.kind, 'preparing', 'preparation must commit before open');
      return { kind: 'opened', session };
    },
    async turn(live, request) {
      assert.equal(live, session, 'turn must consume original opaque session');
      const history = await reader.runs.readExecutionHistory(run.runId, attempt.attemptId);
      // Proof: O3 enters the executor before staging; the boot assertion rejects it.
      assert.equal(
        history.attempt.state.kind,
        'turn_pending',
        'turn stage must commit before executor entry',
      );
      // Proof: R2 hides the reader acceptance; the boot assertion rejects it.
      assert.equal(
        history.executions.filter((entry) => entry.command.kind === 'accept_claim').length,
        1,
        'claim acceptance must precede turn',
      );
      turns += 1;
      return {
        kind: 'completed',
        identity: { locator: live.locator, turnKey: request.turnKey, owner: request.owner },
        outcome: {
          text: 'controlled turn\ncomplete',
          usage: { kind: 'measured', inputTokens: 0, outputTokens: 0 },
          finish: 'end_turn',
        },
      };
    },
    lookupSession: rejectRecovery,
    resumeSession: rejectRecovery,
    inspectEffect: rejectRecovery,
    cancel: rejectRecovery,
    observeQuiescence: rejectRecovery,
    close: rejectRecovery,
  };
  const {
    scope: _scope,
    expectedScopeRevision: _scopeRevision,
    ...preparationGuard
  } = await readGuard();
  const prepared = await prepareActivity(
    writer.runs,
    writer.artifacts,
    executor,
    preparationGuard,
    {
      preparation: {
        commandId: executionCommandId('prepare'),
        preparation,
        requestedType: 'feature',
        stepCode: 'plan',
        stepId: 'step',
        scope,
        parentClaimId: null,
        stateEvidence: evidence.reference,
        executor: { kind: 'human', version: 'human-1' },
      },
      openedCommandId: executionCommandId('opened'),
    },
    cancellation,
  );
  assert.equal(prepared.kind, 'prepared');
  assert.equal(prepared.session, session);
  const originalGuard = await readGuard();
  const built = await buildClaimRequest(writer.runs, writer.artifacts, originalGuard, {
    commandId: 'receiver-claim',
    stateEvidence: evidence.reference,
  });
  if (built.kind !== 'built') throw new Error('claim build refused');
  const input = {
    ...built.request,
    commandId: executionCommandId('claim-stage'),
    acceptanceCommandId: executionCommandId('claim-accepted'),
  };
  const dispatchClaim = (cut = originalGuard) =>
    claimActivity(writer.runs, writer.artifacts, runtime, cut, input, cancellation);
  sendPhase({ phase: 'ready' });
  await receiveCommand('go');
  const original = dispatchClaim();
  await Promise.race([
    receiveCommand('duplicate'),
    original.then((reply) => {
      throw new Error('original ended before duplicate: ' + JSON.stringify(reply), {
        cause:
          reply.kind === 'pending' &&
          reply.observation.kind === 'unconfirmed' &&
          reply.observation.failure.code === 'transport'
            ? reply.observation.failure.cause
            : undefined,
      });
    }),
  ]);
  const duplicate = await awaitPhase(dispatchClaim(), 'duplicate lookup');
  assert.equal(duplicate.kind, 'pending');
  if (duplicate.observation.kind !== 'receiver_refused')
    throw new Error('duplicate absence missing');
  assert.equal(duplicate.observation.reply.status, 404);
  assert.equal(posts, 1);
  sendPhase({ phase: 'absent', status: duplicate.observation.reply.status, posts });
  const lost = await awaitPhase(original, 'lost original response');
  assert.equal(lost.kind, 'pending');
  assert.equal(lost.observation.kind, 'unconfirmed');
  assert.deepEqual(lost.intent, duplicate.intent);
  sendPhase({ phase: 'lost' });
  await receiveCommand('reconcile');
  const old = await awaitPhase(dispatchClaim(), 'old-cut lookup');
  assert.equal(old.kind, 'pending', 'duplicate must not refresh submitted old revisions');
  assert.deepEqual(old.observation, { kind: 'local_refused', reason: 'revision_conflict' });
  const reconciled = await awaitPhase(dispatchClaim(await readGuard()), 'explicit reconciliation');
  assert.equal(reconciled.kind, 'accepted');
  assert.deepEqual(reconciled.intent, lost.intent);
  assert.equal(posts, 1);
  const retainedBytes = await writer.artifacts.readArtifact(reconciled.ack.acceptance.evidence);
  const reopenedBefore = await openSqliteStores(options);
  try {
    const duplicateAck = await claimActivity(
      reopenedBefore.runs,
      reopenedBefore.artifacts,
      runtime,
      originalGuard,
      input,
      cancellation,
    );
    assert.deepEqual(
      duplicateAck,
      reconciled,
      'reopen must preserve original paired acknowledgement',
    );
    assert.deepEqual(
      await reopenedBefore.artifacts.readArtifact(reconciled.ack.acceptance.evidence),
      retainedBytes,
    );
  } finally {
    reopenedBefore.close();
  }
  sendPhase({
    phase: 'claimed',
    intent: reconciled.intent,
    ack: reconciled.ack,
    evidence: new TextDecoder().decode(retainedBytes),
  });
  await receiveCommand('turn');
  const reply = await dispatchTurn(
    writer.runs,
    writer.artifacts,
    runtime,
    claims,
    executor,
    prepared.session,
    await readGuard(),
    {
      stageCommandId: executionCommandId('turn-stage'),
      observedCommandId: executionCommandId('turn-observed'),
      request: {
        version: 1,
        turnKey: 'turn',
        owner: { ownerId: ownership.ownerId, epoch: ownership.epoch },
        cause: { kind: 'initial' },
        input: 'work',
      },
    },
    {
      signal: cancellation,
      onPart() {
        throw new Error('controlled executor emitted unexpected streaming part');
      },
    },
  );
  assert.equal(reply.kind, 'observed');
  const observed = await reader.runs.readExecutionHistory(run.runId, attempt.attemptId);
  // Proof: O4 returns a fabricated observation acknowledgement; the boot assertion rejects it.
  assert.deepEqual(observed.attempt, reply.attempt, 'observation must commit before stored reply');
  assert.equal(observed.attempt.state.kind, 'turn_returned');
  assert.equal(observed.attempt.holdsCapacity, true);
  assert.equal(observed.completion, null);
  assert.equal(observed.receipt, null);
  assert.equal((await writer.runs.readRun(run.runId)).attempts.length, 1);
  observer.close();
  observer = await openSqliteStores(options);
  assert.deepEqual(
    (await observer.runs.readExecutionHistory(run.runId, attempt.attemptId)).attempt,
    reply.attempt,
  );
  sendPhase({
    phase: 'complete',
    turns,
    posts,
    reopened: true,
    holdsCapacity: observed.attempt.holdsCapacity,
  });
} finally {
  try {
    observer?.close();
  } finally {
    try {
      writer.close();
    } finally {
      disconnectWorker();
    }
  }
}
