import { randomUUID } from 'node:crypto';

import {
  acceptWorkflowBinding,
  canonicalJson,
  checkWorkflowBinding,
  decodeWorkflowBinding,
  selectWorkflowActivity,
} from '@twilight-burokrat/contracts';
import {
  canonicalRuntimeRequest,
  parseCanonicalRuntimeRequest,
  type RuntimeState,
} from '@wbs/contracts';

import type { TurnRequest } from '../../agents/execution-records';
import type { ExecutorLocator, Preparation } from '../../agents/execution-records';
import type { WallClock } from '../../clock';
import type { ArtifactStore } from '../artifact-store';
import { acceptClaimReceipt, stageClaimRequest } from '../claim-history';
import type { ClaimRef } from '../claim-records';
import { claimReference } from '../plan-execution';
import {
  artifactDigest,
  decodeAdmission,
  decodeClaimAuthority,
  decodeCompletion,
  decodeManifest,
  decodeRun,
  digestIntent,
  digestManifest,
  executionCommandId,
  manifestDigest,
  organizationId,
  ownerId,
  runId,
} from '../record-codecs';
import { recordPreparation } from '../record-preparation';
import type {
  Completion,
  ExecutionCommand,
  ExecutionFact,
  Manifest,
  Ownership,
  Quiescence,
  Run,
} from '../records';
import type { ScopedAttemptGuard } from '../run-store';
import type { AttemptGuard, RunStore, StoreReply } from '../run-store';
import { acceptRuntimeReceipt } from '../runtime-history';
import type { RuntimeIntent } from '../runtime-records';
import { createMemoryStores } from './memory-stores';

export class FixtureClock implements WallClock {
  #timestamp = 1000;
  read(): number {
    return this.#timestamp;
  }
  advance(milliseconds: number): void {
    this.#timestamp += milliseconds;
  }
}

export function unwrapReply<T>(reply: StoreReply<T>): T {
  if (reply.kind === 'refused') throw new Error(`unexpected refusal: ${reply.reason}`);
  return reply.value;
}

export function createManifest(overrides: Partial<Manifest> = {}): Manifest {
  const manifest = {
    version: 1,
    digest: manifestDigest('0'.repeat(64)),
    bindingVersion: 1,
    canonicalBinding: '{"binding":"fixture"}',
    prompts: [],
    toolPolicies: [],
    executorVersions: { executor: '1' },
    credentialReferences: [],
    ...overrides,
  };
  return decodeManifest({ ...manifest, digest: digestManifest(manifest) });
}

export function createRun(overrides: Partial<Run> = {}): Run {
  return decodeRun({
    version: 1,
    runId: 'run',
    revision: 0,
    projectId: 'project',
    workItemId: 'work',
    manifestDigest: createManifest().digest,
    maxAttempts: 3,
    ...overrides,
  });
}

export async function createAdmissionFixture(options: {
  capacity: number;
  leaseMilliseconds: number;
}) {
  const clock = new FixtureClock();
  const stores = createMemoryStores({
    ...options,
    organizationId: organizationId('organization'),
    clock,
  });
  const ownership = unwrapReply(
    await stores.runs.acquireOwnership(ownerId('owner'), stores.ownership.epoch),
  );
  unwrapReply(await stores.runs.retainManifest(ownership, createManifest()));
  const run = unwrapReply(await stores.runs.createRun(ownership, createRun()));
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
  return {
    runs: stores.runs,
    clock,
    ownership,
    run,
    admission,
    close: () => {
      stores.close();
    },
  };
}

export interface OutcomeFixture {
  readonly runs: RunStore;
  readonly artifacts: ArtifactStore;
  readonly ownership: { readonly epoch: number };
  readonly clock: FixtureClock;
  close(): void;
}

export async function prepareAttempt(stores: OutcomeFixture) {
  const ownership = unwrapReply(
    await stores.runs.acquireOwnership(ownerId('owner'), stores.ownership.epoch),
  );
  unwrapReply(await stores.runs.retainManifest(ownership, createManifest()));
  const run = unwrapReply(await stores.runs.createRun(ownership, createRun()));
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
  unwrapReply(
    await stores.runs.admitAttempt({ ownership, runId: run.runId, expectedRevision: 0 }, admission),
  );
  const claim = decodeClaimAuthority({
    version: 1,
    claimId: 'claim',
    personId: 'person',
    agentRunId: 'agent-run',
    runId: run.runId,
    attemptId: admission.attemptId,
    projectId: run.projectId,
    workItemId: run.workItemId,
    occurrenceId: admission.identity.occurrenceId,
  });
  const retained = await stores.artifacts.retainArtifact(
    new TextEncoder().encode('quiescence evidence'),
    'text/plain',
  );
  if (retained.kind !== 'retained') throw new Error('expected artifact');
  const quiescence: Quiescence = {
    version: 1,
    operationKey: admission.identity.operationKey,
    observedAt: 1000,
    evidence: retained.reference,
    effect: 'failed',
  };
  const guard: AttemptGuard = {
    ownership,
    runId: run.runId,
    expectedRevision: 1,
    attemptId: admission.attemptId,
    expectedAttemptRevision: 0,
  };
  async function currentGuard(): Promise<AttemptGuard> {
    const snapshot = await stores.runs.readRun(run.runId);
    const attempt = snapshot.attempts.find(
      (candidate) => candidate.attemptId === admission.attemptId,
    );
    if (attempt === undefined) throw new Error('missing fixture attempt');
    return {
      ...guard,
      expectedRevision: snapshot.run.revision,
      expectedAttemptRevision: attempt.revision,
    };
  }
  return { ...stores, run, ownership, admission, claim, quiescence, guard, currentGuard };
}

export function createCompletion(
  claim: ClaimRef,
  quiescence: Quiescence,
  changes: Partial<Completion> = {},
): Completion {
  const outcome = {
    version: 1 as const,
    kind: 'succeeded' as const,
    artifacts: [quiescence.evidence],
    summary: 'validated output',
  };
  const intent = {
    version: 2 as const,
    commandId: 'command',
    claim,
    expectedWbsRevision: 'wbs-1',
    outcome,
    commandDigest: artifactDigest('0'.repeat(64)),
  };
  const completion = {
    version: 2 as const,
    outcome,
    intent,
    quiescence: { ...quiescence, effect: 'succeeded' },
    ...changes,
  };
  return decodeCompletion({
    ...completion,
    intent: { ...completion.intent, commandDigest: digestIntent(completion.intent) },
  });
}

/** Each invocation is a fresh command unless a test deliberately supplies an identity for redelivery. */
export function createExecutionCommand(
  fact: ExecutionFact,
  commandId: string = randomUUID(),
): ExecutionCommand {
  return { version: 2, kind: 'execution', commandId: executionCommandId(commandId), fact };
}

export function createRunGuard(guard: AttemptGuard) {
  return {
    ownership: guard.ownership,
    runId: guard.runId,
    expectedRevision: guard.expectedRevision,
  };
}

/** Admits a real accepted binding and schema-valid WBS observation without preparing a session. */
export async function admitExecution(
  stores: OutcomeFixture,
  context?: { readonly ownership: Ownership; readonly suffix: string },
  manifestChanges: Partial<Manifest> = {},
) {
  const suffix = context === undefined ? '' : '-' + context.suffix;
  const label = (value: string) => value + suffix;
  const ownership =
    context === undefined
      ? unwrapReply(await stores.runs.acquireOwnership(ownerId('owner'), stores.ownership.epoch))
      : context.ownership;
  const prompt = new TextEncoder().encode('Prepare the selected activity.');
  const retainedPrompt = await stores.artifacts.retainArtifact(prompt, 'text/plain');
  if (retainedPrompt.kind !== 'retained') throw new Error('fixture prompt refused');
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
  const manifest = createManifest({
    canonicalBinding: canonicalJson(accepted.snapshot),
    prompts: [retainedPrompt.reference],
    executorVersions: { human: 'human-1' },
    ...manifestChanges,
  });
  unwrapReply(await stores.runs.retainManifest(ownership, manifest));
  const run = unwrapReply(
    await stores.runs.createRun(
      ownership,
      createRun({ runId: runId(label('run')), manifestDigest: manifest.digest }),
    ),
  );
  const admission = decodeAdmission({
    attemptId: label('attempt'),
    identity: {
      version: 1,
      runId: run.runId,
      occurrenceId: 'occurrence',
      operationKey: 'operation',
    },
    ordinal: 1,
  });
  const attempt = unwrapReply(
    await stores.runs.admitAttempt({ ownership, runId: run.runId, expectedRevision: 0 }, admission),
  );
  const scope = {
    organizationId: ownership.organizationId,
    projectId: run.projectId,
    personId: 'person',
  };
  unwrapReply(
    await stores.runs.pinRuntimeScope(ownership, { version: 1, scope, ledgerId: 'ledger' }),
  );
  const authority = unwrapReply(
    await stores.runs.stageRuntimeRequest(
      { ownership, scope, expectedRevision: 0 },
      canonicalRuntimeRequest(scope, {
        schemaVersion: 1,
        kind: 'authority',
        commandId: 'authority',
        expectedLedgerId: 'ledger',
        ownerId: 'receiver-owner',
        expectedGeneration: null,
      }),
    ),
  );
  const authorityArtifact = await stores.artifacts.retainArtifact(
    new TextEncoder().encode(
      JSON.stringify({
        schemaVersion: 1,
        ledgerId: 'ledger',
        scope,
        commandId: authority.commandId,
        requestDigest: authority.requestDigest,
        actorId: 'account',
        acceptance: { kind: 'authority', authority: { ownerId: 'receiver-owner', generation: 1 } },
      }),
    ),
    'application/json',
  );
  if (authorityArtifact.kind !== 'retained') throw new Error('fixture authority refused');
  unwrapReply(
    await acceptRuntimeReceipt(
      stores.runs,
      stores.artifacts,
      { ownership, scope, expectedRevision: 1 },
      authority,
      authorityArtifact.reference,
    ),
  );
  const state: RuntimeState = {
    schemaVersion: 1,
    ledgerId: 'ledger',
    scope,
    basis: 'rb1:' + 'a'.repeat(64),
    facts: {
      projectRevision: 0,
      workItems: [{ id: run.workItemId, parentId: null, revision: 0, externalRefs: [] }],
      steps: [{ id: 'step', code: 'plan', position: 0 }],
    },
    authority: { kind: 'held', ownerId: 'receiver-owner', generation: 1 },
    claims: [],
  };
  const retained = await stores.artifacts.retainArtifact(
    new TextEncoder().encode(JSON.stringify(state)),
    'application/json',
  );
  if (retained.kind !== 'retained') throw new Error('fixture state refused');
  const preparation: Preparation = {
    version: 1,
    identity: admission.identity,
    attemptId: admission.attemptId,
    creationKey: label('creation'),
  };
  const selected = selectWorkflowActivity(accepted, 'feature', 'plan');
  const locator: ExecutorLocator = {
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
      sessionId: label('session'),
      operationKey: admission.identity.operationKey,
    },
  };
  async function currentGuard(): Promise<AttemptGuard> {
    const snapshot = await stores.runs.readRun(run.runId);
    const current = snapshot.attempts.find(
      (candidate) => candidate.attemptId === admission.attemptId,
    );
    if (current === undefined) throw new Error('fixture attempt missing');
    return {
      ownership,
      runId: run.runId,
      expectedRevision: snapshot.run.revision,
      attemptId: admission.attemptId,
      expectedAttemptRevision: current.revision,
    };
  }
  async function scopedGuard(): Promise<ScopedAttemptGuard> {
    const snapshot = await stores.runs.readRuntimeScope(scope);
    if (snapshot.kind !== 'pinned') throw new Error('fixture scope missing');
    return { ...(await currentGuard()), scope, expectedScopeRevision: snapshot.revision };
  }
  const preparationInput = {
    commandId: executionCommandId(label('prepare')),
    preparation,
    requestedType: 'feature',
    stepCode: 'plan',
    stepId: 'step',
    scope,
    parentClaimId: null,
    stateEvidence: retained.reference,
    executor: { kind: 'human' as const, version: 'human-1' },
  };
  const canonicalRequest = canonicalRuntimeRequest(scope, {
    schemaVersion: 1,
    commandId: label('wire-claim'),
    expectedLedgerId: 'ledger',
    authority: { ownerId: 'receiver-owner', generation: 1 },
    expectedBasis: state.basis,
    action: {
      kind: 'claim',
      workItemId: run.workItemId,
      stepId: 'step',
      parentClaimId: null,
      execution: {
        storeId: ownership.storeId,
        runId: run.runId,
        attemptId: attempt.attemptId,
        sessionId: locator.session.sessionId,
      },
    },
  });
  return {
    ...stores,
    suffix,
    ownership,
    run,
    admission,
    attempt,
    manifest,
    scope,
    state,
    preparationInput,
    locator,
    canonicalRequest,
    currentGuard,
    scopedGuard,
  };
}

export async function retainClaimReceipt(stores: OutcomeFixture, intent: RuntimeIntent) {
  const { scope, operation } = parseCanonicalRuntimeRequest(intent.canonicalRequest);
  if ('kind' in operation || operation.action.kind !== 'claim')
    throw new Error('fixture claim required');
  const { kind: _kind, ...target } = operation.action;
  const receipt = {
    schemaVersion: 1,
    ledgerId: operation.expectedLedgerId,
    scope,
    commandId: intent.commandId,
    requestDigest: intent.requestDigest,
    actorId: 'account',
    acceptance: {
      kind: 'claim',
      authority: operation.authority,
      claim: { claimId: 'claim', ...target },
      basisAfter: 'rb1:' + 'b'.repeat(64),
    },
  };
  const retained = await stores.artifacts.retainArtifact(
    new TextEncoder().encode(JSON.stringify(receipt)),
    'application/json',
  );
  if (retained.kind !== 'retained') throw new Error('fixture claim receipt refused');
  return retained.reference;
}

/** Prepares a retained session through the verified binding and target operation. */
export async function prepareSession(
  stores: OutcomeFixture,
  context?: { readonly ownership: Ownership; readonly suffix: string },
) {
  const setup = await admitExecution(stores, context);
  const guard = await setup.currentGuard();
  const owner = { ownerId: setup.ownership.ownerId, epoch: setup.ownership.epoch };
  const preparedIntent = unwrapReply(
    await recordPreparation(stores.runs, stores.artifacts, guard, setup.preparationInput),
  );
  const opened = createExecutionCommand(
    { kind: 'session_prepared', locator: setup.locator, owner },
    'opened' + setup.suffix,
  );
  const prepared = unwrapReply(
    await stores.runs.recordExecution(await setup.currentGuard(), opened),
  );
  return { ...setup, guard, owner, preparedIntent, opened, prepared };
}

/** Builds a claim through the real canonical stage and verified receipt acceptance. */
export async function prepareClaimed(
  stores: OutcomeFixture,
  context?: { readonly ownership: Ownership; readonly suffix: string },
) {
  const setup = await prepareSession(stores, context);
  const staged = unwrapReply(
    await stageClaimRequest(stores.runs, stores.artifacts, await setup.scopedGuard(), {
      commandId: executionCommandId('stage-claim' + setup.suffix),
      canonicalRequest: setup.canonicalRequest,
      stateEvidence: setup.preparationInput.stateEvidence,
    }),
  );
  const evidence = await retainClaimReceipt(stores, staged.intent);
  const accepted = unwrapReply(
    await acceptClaimReceipt(stores.runs, stores.artifacts, await setup.scopedGuard(), {
      commandId: executionCommandId('accept-claim' + setup.suffix),
      intent: staged.intent,
      evidence,
    }),
  );
  if (accepted.attempt.state.kind !== 'ready') throw new Error('fixture expected ready claim');
  const claim = claimReference(accepted.attempt.state);
  const quiescence: Quiescence = {
    version: 1,
    operationKey: setup.admission.identity.operationKey,
    observedAt: 1000,
    evidence,
    effect: 'failed',
  };
  return {
    ...setup,
    execution: accepted.attempt.state.execution,
    claim,
    quiescence,
    staged,
    accepted,
  };
}

export async function stageFixtureTurn(
  setup: Awaited<ReturnType<typeof prepareClaimed>>,
  cause: TurnRequest['cause'] = { kind: 'initial' },
  turnKey = 'turn',
) {
  return unwrapReply(
    await setup.runs.stageTurn(await setup.scopedGuard(), {
      version: 2,
      kind: 'stage_turn',
      commandId: executionCommandId('stage-' + turnKey + setup.suffix),
      request: { version: 1, turnKey, owner: setup.owner, cause, input: 'work' },
    }),
  );
}

export async function prepareTurn(
  stores: OutcomeFixture,
  context?: { readonly ownership: Ownership; readonly suffix: string },
) {
  const setup = await prepareClaimed(stores, context);
  const turn = await stageFixtureTurn(setup);
  const checkpoint = turn.attempt.state;
  if (checkpoint.kind !== 'turn_pending') throw new Error('fixture expected pending turn');
  return { ...setup, turn, checkpoint };
}
