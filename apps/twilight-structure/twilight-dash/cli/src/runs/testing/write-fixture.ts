import {
  canonicalRuntimeRequest,
  parseCanonicalRuntimeRequest,
  type RuntimeState,
} from '@wbs/contracts';

import type { WriteFacts } from '../plan-writes';
import { executionCommandId } from '../value-codecs';
import type { WriteCompletion, WriteStageCommand } from '../write-records';
import { type OutcomeFixture, prepareTurn } from './fixtures';

/** Real prepared/claimed turn with separately retained current WBS state and caller-approved batch. The caller owns stores.close(). */
async function prepareWriteTarget(
  stores: OutcomeFixture,
  context?: Parameters<typeof prepareTurn>[1],
) {
  const setup = await prepareTurn(stores, context);
  const binding = setup.execution.binding;
  const claimed = parseCanonicalRuntimeRequest(binding.intent.canonicalRequest).operation;
  if ('kind' in claimed || claimed.action.kind !== 'claim')
    throw new Error('fixture requires claim');
  const { kind: _kind, ...target } = claimed.action;
  const live = { claimId: binding.projection.claimId, ...target };
  const state: RuntimeState = {
    ...setup.state,
    basis: binding.projection.basisAfter,
    claims: [
      {
        kind: 'runtime',
        claim: {
          id: live.claimId,
          workItemId: live.workItemId,
          stepId: live.stepId,
          personId: setup.scope.personId,
          runId: setup.locator.session.sessionId,
          parentClaimId: live.parentClaimId,
          accountId: binding.projection.actorId,
        },
        binding: live,
      },
    ],
  };
  const retained = await stores.artifacts.retainArtifact(
    new TextEncoder().encode(JSON.stringify(state)),
    'application/json',
  );
  if (retained.kind !== 'retained') throw new Error('fixture write state refused');
  const canonicalRequest = canonicalRuntimeRequest(setup.scope, {
    schemaVersion: 1,
    commandId: 'wire-write' + setup.suffix,
    expectedLedgerId: state.ledgerId,
    authority: claimed.authority,
    expectedBasis: state.basis,
    action: {
      kind: 'write',
      claim: live,
      commands: [
        { kind: 'setProgress', workItemId: live.workItemId, stepId: live.stepId, state: 'done' },
        {
          kind: 'releaseWorkItem',
          workItemId: live.workItemId,
          personId: setup.scope.personId,
          steps: [live.stepId],
        },
      ],
    },
  });
  const completion: WriteCompletion = {
    version: 1,
    outcome: {
      version: 1,
      kind: 'succeeded',
      artifacts: [setup.quiescence.evidence],
      summary: 'validated output',
    },
    quiescence: { ...setup.quiescence, effect: 'succeeded' },
  };
  const guard = await setup.scopedGuard();
  const snapshot = await stores.runs.readRun(guard.runId);
  const history = await stores.runs.readExecutionHistory(guard.runId, guard.attemptId);
  const scope = await stores.runs.readRuntimeScope(guard.scope);
  if (scope.kind !== 'pinned') throw new Error('fixture write scope missing');
  const command: WriteStageCommand = {
    version: 1,
    kind: 'stage_write',
    commandId: executionCommandId('stage-write' + setup.suffix),
    completion,
    canonicalRequest,
    observation: {
      version: 1,
      evidence: retained.reference,
      scope: state.scope,
      ledgerId: state.ledgerId,
      basis: state.basis,
      workItemId: snapshot.run.workItemId,
      stepId: live.stepId,
      stepCode: 'plan',
    },
  };
  const prepared = {
    ...setup,
    guard,
    command,
    state,
    stateEvidence: retained.reference,
    completion,
    canonicalRequest,
    currentGuard: setup.scopedGuard,
  };
  return {
    target: prepared,
    setup,
    snapshot,
    history,
    scope,
    guard,
    command,
    state,
    stateEvidence: retained.reference,
    completion,
    canonicalRequest,
  };
}
type WriteTarget = Awaited<ReturnType<typeof prepareWriteTarget>>['target'];
type WriteFixture = WriteTarget & { readonly facts: WriteFacts };
/** Original one-argument calls construct a fresh single-target pure-plan witness. Explicit context arguments produce only an actual prepared target; they cannot claim to enumerate a complete global catalog. Empty suffixes and explicit undefined select the context form by argument presence. */
export function createWriteFixture(
  stores: OutcomeFixture,
  context: Parameters<typeof prepareTurn>[1],
): Promise<WriteTarget>;
export function createWriteFixture(stores: OutcomeFixture): Promise<WriteFixture>;
export async function createWriteFixture(
  stores: OutcomeFixture,
  ...contexts: [] | [Parameters<typeof prepareTurn>[1]]
): Promise<WriteTarget | WriteFixture> {
  const prepared = await prepareWriteTarget(stores, contexts[0]);
  if (contexts.length !== 0) return prepared.target;
  const {
    setup,
    snapshot,
    history,
    scope,
    guard,
    command,
    state,
    stateEvidence,
    completion,
    canonicalRequest,
  } = prepared;
  const facts: WriteFacts = {
    run: snapshot.run,
    attempt: history.attempt,
    manifest: setup.manifest,
    ownership: {
      storeId: setup.ownership.storeId,
      organizationId: setup.ownership.organizationId,
      epoch: setup.ownership.epoch,
      owner: setup.ownership,
    },
    executions: history.executions,
    submissions: history.executions,
    scope,
    runtime: {
      scopes: [{ pin: scope.pin, revision: scope.revision }],
      intents: scope.intents,
      acceptances: scope.acceptances,
      recovery: {
        histories: [],
        barriers: [],
        active: [],
        counts: { journals: 0, fences: 0, observations: 0, closures: 0, barriers: 0, active: 0 },
      },
    },
    writes: [],
    obligations: [],
  };
  return {
    ...setup,
    guard,
    command,
    facts,
    state,
    stateEvidence,
    completion,
    canonicalRequest,
    currentGuard: setup.scopedGuard,
  };
}
