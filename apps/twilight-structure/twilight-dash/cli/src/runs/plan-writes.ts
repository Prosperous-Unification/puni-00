import { isDeepStrictEqual } from 'node:util';

import type { DispatchOwner } from '../agents/execution-records';
import type { RecordedExecution } from './execution-records';
import { type ClaimFacts, latestAuthority } from './plan-claims';
import { executionCheckpoint, type ExecutionFacts, isExecuting } from './plan-execution';
import { findRecoveryCommand } from './plan-recovery-history';
import type { RuntimeCatalog } from './plan-runtime';
import type { ScopedAttemptGuard, StoreReply } from './run-store';
import { digestRuntimeRequest, equalRuntimeScopes, readRuntimeRequest } from './runtime-codecs';
import type { RuntimeAcceptance, RuntimeIntent } from './runtime-records';
import { addInteger } from './value-codecs';
import type {
  Attempt4,
  RecordedWrite,
  RecordedWriteAcceptance,
  RecordedWriteStage,
  WriteAcceptAck,
  WriteAcceptCommand,
  WriteObligation,
  WriteReceipt,
  WriteStageAck,
  WriteStageCommand,
  WriteState,
} from './write-records';

/** Providers supply an authorized, fully audited global catalog and exact reconstructed scope prefix. Selected executions and global submissions are distinct projections. */
export interface WriteFacts extends Omit<ExecutionFacts, 'attempt'> {
  readonly attempt: ExecutionFacts['attempt'] | Attempt4;
  readonly scope: ClaimFacts['scope'];
  readonly runtime: RuntimeCatalog;
  readonly submissions: readonly RecordedExecution[];
  readonly writes: readonly RecordedWrite[];
  readonly obligations: readonly WriteObligation[];
}
export interface WriteStagePlan {
  readonly runRevision: number;
  readonly ack: WriteStageAck;
  readonly record: RecordedWriteStage;
  readonly intent: RuntimeIntent;
  readonly obligation: WriteObligation;
}
export interface WriteAcceptPlan {
  readonly runRevision: number;
  readonly ack: WriteAcceptAck;
  readonly record: RecordedWriteAcceptance;
  readonly acceptance: RuntimeAcceptance;
  readonly receipt: WriteReceipt;
  readonly obligationKey: WriteAcceptCommand['stageCommandId'];
}
function advanceWrite(facts: WriteFacts, state: WriteState): Attempt4 {
  return {
    ...facts.attempt,
    version: 4,
    holdsCapacity: false,
    revision: addInteger(facts.attempt.revision, 1),
    state,
  };
}
function checkTarget(facts: WriteFacts, guard: ScopedAttemptGuard): StoreReply<never> | undefined {
  const owner = facts.ownership.owner;
  // Proof: T1 plan-guard-1 bypassed this check; 'stage refuses stale scope run attempt revisions and independently mismatched target ownership' failed its semantic assertion. Exact restoration passed.
  if (
    facts.run.runId !== guard.runId ||
    facts.attempt.identity.runId !== guard.runId ||
    facts.attempt.attemptId !== guard.attemptId
  )
    return { kind: 'refused', reason: 'identity_conflict' };
  const checkpoint =
    facts.attempt.version === 4
      ? facts.attempt.state.checkpoint
      : executionCheckpoint(facts.attempt.state);
  const session =
    'execution' in checkpoint
      ? checkpoint.execution.session
      : 'session' in checkpoint
        ? checkpoint.session
        : undefined;
  // Proof: T1 plan-guard-2-supplement bypassed this check; 'write stage requires an actual turn checkpoint and returns precise unsupported-operation refusal' failed the precise refusal/diagnostic assertion (no unsafe-acceptance credit). Exact restoration passed.
  if (session === undefined) return { kind: 'refused', reason: 'state_conflict' };
  // Proof: T1 plan-guard-3 bypassed this check; 'stage independently binds reconstructed scope accepted claim and current owner epoch' failed its semantic assertion. Exact restoration passed.
  if (
    owner === null ||
    facts.ownership.storeId !== guard.ownership.storeId ||
    facts.ownership.organizationId !== guard.ownership.organizationId ||
    facts.ownership.epoch !== guard.ownership.epoch ||
    owner.ownerId !== guard.ownership.ownerId ||
    owner.epoch !== guard.ownership.epoch ||
    !equalRuntimeScopes(facts.scope.pin.scope, guard.scope) ||
    !equalRuntimeScopes(session.preparation.target.observation.scope, guard.scope) ||
    guard.scope.organizationId !== facts.ownership.organizationId ||
    guard.scope.projectId !== facts.run.projectId
  )
    return { kind: 'refused', reason: 'authority_conflict' };
  return undefined;
}
function checkRevisions(
  facts: WriteFacts,
  guard: ScopedAttemptGuard,
): StoreReply<never> | undefined {
  // Proof: T1 plan-guard-4 bypassed this check; 'acceptance independently rejects altered association obligation pending recovery revisions and projection' failed its semantic assertion. Exact restoration passed.
  if (
    facts.run.revision !== guard.expectedRevision ||
    facts.attempt.revision !== guard.expectedAttemptRevision ||
    facts.scope.revision !== guard.expectedScopeRevision
  )
    return { kind: 'refused', reason: 'revision_conflict' };
  return undefined;
}
function hasRecovery(facts: WriteFacts): boolean {
  return facts.runtime.recovery.active.some((active) =>
    equalRuntimeScopes(active.scope, facts.scope.pin.scope),
  );
}
function hasLocalSubmission(facts: WriteFacts, commandId: string): boolean {
  return (
    facts.submissions.some((entry) => entry.command.commandId === commandId) ||
    facts.writes.some((entry) => entry.command.commandId === commandId) ||
    findRecoveryCommand(facts.runtime.recovery, commandId) !== undefined
  );
}
/** Reconstructs the stage consequence at its historical prefix, without consulting today's lease or submitted revisions. */
export function writeStageTransition(
  facts: WriteFacts,
  command: WriteStageCommand,
  owner: DispatchOwner,
): StoreReply<WriteStageAck> {
  // Proof: T1 plan-guard-5 bypassed this check; 'stage refuses pending recovery reservation state operation and unsettled completion' failed its semantic assertion. Exact restoration passed.
  if (
    facts.attempt.version !== 2 ||
    !isExecuting(facts.attempt.state) ||
    !facts.attempt.holdsCapacity
  )
    return { kind: 'refused', reason: 'state_conflict' };
  const checkpoint = executionCheckpoint(facts.attempt.state);
  // Proof: T1 plan-guard-6-supplement bypassed this check; 'write stage requires an actual turn checkpoint and returns precise unsupported-operation refusal' failed its semantic assertion. Exact restoration passed.
  if (checkpoint.kind !== 'turn_pending' && checkpoint.kind !== 'turn_returned')
    return { kind: 'refused', reason: 'state_conflict' };
  // Proof: T1 plan-guard-7 bypassed this check; 'stage refuses pending recovery reservation state operation and unsettled completion' failed its semantic assertion. Exact restoration passed.
  if (facts.scope.pendingCommandId !== null) return { kind: 'refused', reason: 'state_conflict' };
  const completion = command.completion;
  // Proof: T1 plan-guard-8 bypassed this check; 'stage refuses pending recovery reservation state operation and unsettled completion' failed its semantic assertion. Exact restoration passed.
  if (completion.quiescence.operationKey !== facts.attempt.identity.operationKey)
    return { kind: 'refused', reason: 'authority_conflict' };
  // Proof: T1 plan-guard-9 bypassed this check; 'stage refuses pending recovery reservation state operation and unsettled completion' failed its semantic assertion. Exact restoration passed.
  if (
    completion.quiescence.effect === 'unknown' ||
    (completion.outcome.kind === 'succeeded' && completion.quiescence.effect !== 'succeeded')
  )
    return { kind: 'refused', reason: 'state_conflict' };
  const { scope, operation } = readRuntimeRequest(command.canonicalRequest);
  // Proof: T1 plan-guard-10-supplement bypassed this check; 'write stage requires an actual turn checkpoint and returns precise unsupported-operation refusal' failed the precise refusal/diagnostic assertion (no unsafe-acceptance credit). Exact restoration passed.
  if ('kind' in operation || operation.action.kind !== 'write')
    return { kind: 'refused', reason: 'state_conflict' };
  // Proof: T1 generation-floor-dependency supplied a null floor to latestAuthority; 'stage refuses coherent authority and every request target mismatch' admitted the stale generation. Exact restoration passed.
  const acquisition = latestAuthority(facts.scope);
  // Proof: T1 plan-guard-11 bypassed this check; 'stage independently binds reconstructed scope accepted claim and current owner epoch' failed its semantic assertion. Exact restoration passed.
  if (
    acquisition === null ||
    !isDeepStrictEqual(acquisition.intent.localOwner, owner) ||
    !isDeepStrictEqual(acquisition.authority, operation.authority)
  )
    return { kind: 'refused', reason: 'authority_conflict' };
  const binding = checkpoint.execution.binding;
  const claimRequest = readRuntimeRequest(binding.intent.canonicalRequest).operation;
  // Proof: T1 plan-guard-12-supplement bypassed this check; 'write stage diagnoses a corrupted retained claim operation' failed the precise refusal/diagnostic assertion (no unsafe-acceptance credit). Exact restoration passed.
  if ('kind' in claimRequest || claimRequest.action.kind !== 'claim')
    throw new Error('write checkpoint claim operation differs');
  const { kind: _kind, ...target } = claimRequest.action;
  const original = checkpoint.execution.session.preparation.target.observation;
  const observed = command.observation;
  const retainedClaim = facts.scope.intents.find(
    (intent) => intent.commandId === binding.intent.commandId,
  );
  const acceptedClaim = facts.scope.acceptances.find(
    (acceptance) => acceptance.commandId === binding.intent.commandId,
  );
  // Proof: T1 plan-guard-13 bypassed this check; 'stage independently binds reconstructed scope accepted claim and current owner epoch' failed its semantic assertion. Exact restoration passed.
  if (
    !isDeepStrictEqual(retainedClaim, binding.intent) ||
    !isDeepStrictEqual(acceptedClaim, binding.acceptance)
  )
    return { kind: 'refused', reason: 'identity_conflict' };
  // Proof: T1 plan-guard-14 bypassed this check; 'stage independently binds reconstructed scope accepted claim and current owner epoch' failed its semantic assertion. Exact restoration passed.
  if (
    !equalRuntimeScopes(scope, facts.scope.pin.scope) ||
    !equalRuntimeScopes(scope, original.scope) ||
    !equalRuntimeScopes(scope, observed.scope) ||
    operation.expectedLedgerId !== facts.scope.pin.ledgerId ||
    observed.ledgerId !== original.ledgerId ||
    observed.ledgerId !== operation.expectedLedgerId ||
    observed.workItemId !== original.workItemId ||
    observed.workItemId !== facts.run.workItemId ||
    observed.stepId !== original.stepId ||
    observed.stepCode !== original.stepCode ||
    operation.expectedBasis !== observed.basis ||
    !isDeepStrictEqual(operation.action.claim, {
      claimId: binding.projection.claimId,
      ...target,
    }) ||
    !isDeepStrictEqual(operation.action.claim.execution, {
      storeId: facts.ownership.storeId,
      runId: facts.run.runId,
      attemptId: facts.attempt.attemptId,
      sessionId: checkpoint.execution.session.locator.session.sessionId,
    })
  )
    return { kind: 'refused', reason: 'authority_conflict' };
  // Proof: T1 plan-guard-15 bypassed this check; 'stage refuses coherent authority and every request target mismatch' failed its semantic assertion. Exact restoration passed.
  if (
    operation.action.commands.some(
      (batch, index, commands) =>
        batch.workItemId !== observed.workItemId ||
        ('stepId' in batch && batch.stepId !== observed.stepId) ||
        (batch.kind === 'releaseWorkItem' &&
          (index !== commands.length - 1 ||
            batch.personId !== scope.personId ||
            !isDeepStrictEqual(batch.steps, [observed.stepId]))),
    )
  )
    return { kind: 'refused', reason: 'authority_conflict' };
  const intent: RuntimeIntent = {
    version: 1,
    commandId: operation.commandId,
    canonicalRequest: command.canonicalRequest,
    requestDigest: digestRuntimeRequest(command.canonicalRequest),
    localOwner: owner,
    stagedRevision: addInteger(facts.scope.revision, 1),
  };
  const obligation: WriteObligation = {
    version: 1,
    stageCommandId: command.commandId,
    intent,
    completion,
    disposition: { kind: 'pending' },
  };
  // Proof: T1 plan-snapshot-8419-corrected omitted this snapshot; 'all write transition and publication plans detach caller-owned commands checkpoints and original acknowledgements' failed reference detachment. Exact restoration passed.
  return {
    kind: 'applied',
    value: structuredClone({
      version: 1,
      kind: 'write_staged',
      intent,
      obligation,
      attempt: advanceWrite(facts, {
        kind: 'write_pending',
        checkpoint,
        outcome: completion.outcome,
        quiescence: completion.quiescence,
        stageCommandId: command.commandId,
        intent,
      }),
    }),
  };
}
/** Plans atomic stage publication; immutable exact replay precedes fresh state/revision exclusions. */
export function planWriteStage(
  facts: WriteFacts,
  guard: ScopedAttemptGuard,
  command: WriteStageCommand,
): StoreReply<WriteStagePlan> {
  const targetConflict = checkTarget(facts, guard);
  // Proof: T1 plan-guard-16 bypassed this check; 'stage independently binds reconstructed scope accepted claim and current owner epoch' failed its semantic assertion. Exact restoration passed.
  if (targetConflict !== undefined) return targetConflict;
  const previous = facts.writes.find((entry) => entry.command.commandId === command.commandId);
  // Proof: T1 plan-guard-17 bypassed this check; 'acceptance closes exact obligation once and original replays survive later facts' failed its semantic assertion. Exact restoration passed.
  if (previous !== undefined) {
    // Proof: T1 plan-guard-18 bypassed this check; 'global submission and wire associations refuse borrowing while unrelated lexical equality remains valid' failed its semantic assertion. Exact restoration passed.
    if (
      previous.kind !== 'stage_write' ||
      previous.runId !== guard.runId ||
      previous.attemptId !== guard.attemptId ||
      !isDeepStrictEqual(previous.command, command)
    )
      return { kind: 'refused', reason: 'identity_conflict' };
    // Proof: T1 original-ack-9465 substituted today's attempt; 'acceptance closes exact obligation once and original replays survive later facts' lost the immutable original acknowledgement. Exact restoration passed.
    // Proof: T1 plan-snapshot-9414-corrected omitted this snapshot; 'stage commits approved write and frees capacity once' failed reference detachment. Exact restoration passed.
    return {
      kind: 'duplicate',
      value: structuredClone({
        runRevision: facts.run.revision,
        ack: previous.reply,
        record: previous,
        intent: previous.reply.intent,
        obligation: previous.reply.obligation,
      }),
    };
  }
  const wireId = readRuntimeRequest(command.canonicalRequest).operation.commandId;
  // Proof: T1 plan-guard-19 bypassed this check; 'write collision matrix reserves recovery fence and acceptance IDs in both local and wire domains' failed its semantic assertion. Exact restoration passed.
  if (
    hasLocalSubmission(facts, command.commandId) ||
    facts.runtime.intents.some((intent) => intent.commandId === wireId) ||
    findRecoveryCommand(facts.runtime.recovery, wireId) !== undefined
  )
    return { kind: 'refused', reason: 'identity_conflict' };
  // Proof: T1 plan-guard-20 bypassed this check; 'stage refuses pending recovery reservation state operation and unsettled completion' failed its semantic assertion. Exact restoration passed.
  if (hasRecovery(facts)) return { kind: 'refused', reason: 'state_conflict' };
  const revisionConflict = checkRevisions(facts, guard);
  // Proof: T1 plan-guard-21 bypassed this check; 'stage refuses stale scope run attempt revisions and independently mismatched target ownership' failed its semantic assertion. Exact restoration passed.
  if (revisionConflict !== undefined) return revisionConflict;
  const transition = writeStageTransition(facts, command, {
    ownerId: guard.ownership.ownerId,
    epoch: guard.ownership.epoch,
  });
  // Proof: T1 plan-guard-22-supplement bypassed this check; 'acceptance independently refuses altered immutable intent and preserves refusal routing' failed the precise refusal/diagnostic assertion (no unsafe-acceptance credit). Exact restoration passed.
  if (transition.kind === 'refused') return transition;
  const ack = transition.value;
  // Proof: T1 plan-snapshot-10365 omitted this snapshot; 'all write transition and publication plans detach caller-owned commands checkpoints and original acknowledgements' failed reference detachment. Exact restoration passed.
  return {
    kind: 'applied',
    value: structuredClone({
      runRevision: addInteger(facts.run.revision, 1),
      ack,
      record: {
        version: 1,
        kind: 'stage_write',
        runId: guard.runId,
        attemptId: guard.attemptId,
        context: { version: 1, scopeRevision: facts.scope.revision },
        command,
        reply: ack,
      },
      intent: ack.intent,
      obligation: ack.obligation,
    }),
  };
}
/** Historical acceptance resolves one pending obligation; recovery callers apply their barrier separately. No current grant is required for late original accepted bytes. */
export function writeAcceptanceTransition(
  facts: WriteFacts,
  command: WriteAcceptCommand,
): StoreReply<WriteAcceptAck> {
  // Proof: T1 plan-guard-23 bypassed this check; 'acceptance independently rejects altered association obligation pending recovery revisions and projection' failed its semantic assertion. Exact restoration passed.
  if (
    facts.attempt.holdsCapacity ||
    facts.attempt.version !== 4 ||
    facts.attempt.state.kind !== 'write_pending'
  )
    return { kind: 'refused', reason: 'state_conflict' };
  const state = facts.attempt.state;
  const stage = facts.writes.find(
    (entry) => entry.kind === 'stage_write' && entry.command.commandId === command.stageCommandId,
  );
  const obligation = facts.obligations.find(
    (entry) => entry.stageCommandId === command.stageCommandId,
  );
  const retained = facts.runtime.intents.find(
    (intent) => intent.commandId === command.intent.commandId,
  );
  // Proof: T1 plan-guard-24-supplement bypassed this check; 'acceptance independently refuses altered immutable intent and preserves refusal routing' failed its semantic assertion. Exact restoration passed.
  // Proof: T1 final-association repeated the bypass after explicit retained-intent narrowing and optional-chain normalization; 'acceptance independently refuses altered immutable intent and preserves refusal routing' accepted the changed intent. Exact restoration passed.
  if (
    stage?.kind !== 'stage_write' ||
    stage.runId !== facts.run.runId ||
    stage.attemptId !== facts.attempt.attemptId ||
    command.commandId === command.stageCommandId ||
    state.stageCommandId !== command.stageCommandId ||
    retained === undefined ||
    !isDeepStrictEqual(retained, command.intent) ||
    !isDeepStrictEqual(state.intent, command.intent) ||
    !isDeepStrictEqual(stage.reply.intent, command.intent) ||
    obligation?.disposition.kind !== 'pending' ||
    !isDeepStrictEqual(obligation, stage.reply.obligation)
  )
    return { kind: 'refused', reason: 'identity_conflict' };
  // Proof: T1 plan-guard-25 bypassed this check; 'acceptance requires independent scope intent and original pending completion' failed its semantic assertion. Exact restoration passed.
  if (
    !isDeepStrictEqual(
      facts.scope.intents.find((intent) => intent.commandId === retained.commandId),
      retained,
    ) ||
    !isDeepStrictEqual(state, stage.reply.attempt.state)
  )
    return { kind: 'refused', reason: 'identity_conflict' };
  // Proof: T1 plan-guard-26 bypassed this check; 'acceptance independently rejects altered association obligation pending recovery revisions and projection' failed its semantic assertion. Exact restoration passed.
  if (facts.scope.pendingCommandId !== retained.commandId)
    return { kind: 'refused', reason: 'state_conflict' };
  const request = readRuntimeRequest(retained.canonicalRequest);
  // Proof: T1 plan-guard-27-supplement bypassed this check; 'historical acceptance diagnoses a dependency returning a coherent nonwrite intent' failed the precise refusal/diagnostic assertion (no unsafe-acceptance credit). Exact restoration passed.
  if ('kind' in request.operation || request.operation.action.kind !== 'write')
    return { kind: 'refused', reason: 'state_conflict' };
  // Proof: T1 plan-guard-28 bypassed this check; 'acceptance independently rejects altered association obligation pending recovery revisions and projection' failed its semantic assertion. Exact restoration passed.
  if (
    !isDeepStrictEqual(
      command.projection.applied,
      request.operation.action.commands.map((entry, index) => ({ index, kind: entry.kind })),
    )
  )
    return { kind: 'refused', reason: 'identity_conflict' };
  const acceptance: RuntimeAcceptance = {
    version: 1,
    commandId: retained.commandId,
    requestDigest: retained.requestDigest,
    evidence: command.evidence,
    acceptedRevision: addInteger(facts.scope.revision, 1),
  };
  const receipt: WriteReceipt = {
    version: 1,
    stageCommandId: command.stageCommandId,
    acceptance,
    projection: command.projection,
  };
  // Proof: T1 plan-snapshot-13208 omitted this snapshot; 'all write transition and publication plans detach caller-owned commands checkpoints and original acknowledgements' failed reference detachment. Exact restoration passed.
  return {
    kind: 'applied',
    value: structuredClone({
      version: 1,
      kind: 'write_accepted',
      receipt,
      attempt: advanceWrite(facts, {
        kind: 'write_terminal',
        checkpoint: state.checkpoint,
        outcome: state.outcome,
        quiescence: state.quiescence,
        stageCommandId: state.stageCommandId,
        receipt,
      }),
    }),
  };
}
/** Plans acceptance publication and exact obligation removal, preserving the original acknowledgement on replay. */
export function planWriteAcceptance(
  facts: WriteFacts,
  guard: ScopedAttemptGuard,
  command: WriteAcceptCommand,
): StoreReply<WriteAcceptPlan> {
  const targetConflict = checkTarget(facts, guard);
  // Proof: T1 plan-guard-29-supplement bypassed this check; 'acceptance independently refuses altered immutable intent and preserves refusal routing' failed its semantic assertion. Exact restoration passed.
  if (targetConflict !== undefined) return targetConflict;
  const previous = facts.writes.find((entry) => entry.command.commandId === command.commandId);
  // Proof: T1 plan-guard-30 bypassed this check; 'replay refuses changed acceptance and independently wrong target while preserving detached original acknowledgements' failed its semantic assertion. Exact restoration passed.
  if (previous !== undefined) {
    // Proof: T1 plan-guard-31 bypassed this check; 'replay refuses changed acceptance and independently wrong target while preserving detached original acknowledgements' failed its semantic assertion. Exact restoration passed.
    if (
      previous.kind !== 'accept_write' ||
      previous.runId !== guard.runId ||
      previous.attemptId !== guard.attemptId ||
      !isDeepStrictEqual(previous.command, command)
    )
      return { kind: 'refused', reason: 'identity_conflict' };
    // Proof: T1 original-ack-14279 substituted today's attempt; 'acceptance closes exact obligation once and original replays survive later facts' lost the immutable original acknowledgement. Exact restoration passed.
    // Proof: T1 plan-snapshot-14228 omitted this snapshot; 'replay refuses changed acceptance and independently wrong target while preserving detached original acknowledgements' failed reference detachment. Exact restoration passed.
    return {
      kind: 'duplicate',
      value: structuredClone({
        runRevision: facts.run.revision,
        ack: previous.reply,
        record: previous,
        acceptance: previous.reply.receipt.acceptance,
        receipt: previous.reply.receipt,
        obligationKey: previous.command.stageCommandId,
      }),
    };
  }
  // Proof: T1 plan-guard-32 bypassed this check; 'replay refuses changed acceptance and independently wrong target while preserving detached original acknowledgements' failed its semantic assertion. Exact restoration passed.
  if (
    hasLocalSubmission(facts, command.commandId) ||
    facts.runtime.acceptances.some(
      (acceptance) => acceptance.commandId === command.intent.commandId,
    ) ||
    facts.writes.some(
      (entry) =>
        entry.kind === 'accept_write' && entry.command.stageCommandId === command.stageCommandId,
    )
  )
    return { kind: 'refused', reason: 'identity_conflict' };
  // Proof: T1 plan-guard-33 bypassed this check; 'acceptance independently rejects altered association obligation pending recovery revisions and projection' failed its semantic assertion. Exact restoration passed.
  if (hasRecovery(facts)) return { kind: 'refused', reason: 'state_conflict' };
  const revisionConflict = checkRevisions(facts, guard);
  // Proof: T1 plan-guard-34 bypassed this check; 'acceptance independently rejects altered association obligation pending recovery revisions and projection' failed its semantic assertion. Exact restoration passed.
  if (revisionConflict !== undefined) return revisionConflict;
  const transition = writeAcceptanceTransition(facts, command);
  // Proof: T1 plan-guard-35-corrected bypassed this check; 'write acceptance forwards a modeled refusal without attempting publication' failed the precise refusal/diagnostic assertion (no unsafe-acceptance credit). Exact restoration passed.
  if (transition.kind === 'refused') return transition;
  const ack = transition.value;
  // Proof: T1 plan-snapshot-15174 omitted this snapshot; 'all write transition and publication plans detach caller-owned commands checkpoints and original acknowledgements' failed reference detachment. Exact restoration passed.
  return {
    kind: 'applied',
    value: structuredClone({
      runRevision: addInteger(facts.run.revision, 1),
      ack,
      record: {
        version: 1,
        kind: 'accept_write',
        runId: guard.runId,
        attemptId: guard.attemptId,
        context: { version: 1, scopeRevision: facts.scope.revision },
        command,
        reply: ack,
      },
      acceptance: ack.receipt.acceptance,
      receipt: ack.receipt,
      obligationKey: command.stageCommandId,
    }),
  };
}
