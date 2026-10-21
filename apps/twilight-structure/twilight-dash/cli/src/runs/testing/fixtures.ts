import { randomUUID } from 'node:crypto';

import type { WallClock } from '../../clock';
import type { ArtifactStore } from '../artifact-store';
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
} from '../record-codecs';
import type {
  ClaimAuthority,
  Completion,
  ExecutionCommand,
  ExecutionFact,
  Manifest,
  Quiescence,
  Run,
} from '../records';
import type { AttemptGuard, RunStore, StoreReply } from '../run-store';
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
  claim: ClaimAuthority,
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
    version: 1 as const,
    commandId: 'command',
    authority: claim,
    expectedWbsRevision: 'wbs-1',
    outcome,
    commandDigest: artifactDigest('0'.repeat(64)),
  };
  const completion = {
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
  return { commandId: executionCommandId(commandId), fact };
}

export function createRunGuard(guard: AttemptGuard) {
  return {
    ownership: guard.ownership,
    runId: guard.runId,
    expectedRevision: guard.expectedRevision,
  };
}
