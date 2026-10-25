import type { DispatchOwner } from '../agents/execution-records';
import type { ClaimBinding, TurnIntent } from './claim-records';
import type {
  ClaimAcceptAck,
  ClaimAcceptCommand,
  ClaimStageAck,
  ClaimStageCommand,
  TurnStageAck,
  TurnStageCommand,
} from './execution-records';
import {
  advanceAttempt,
  checkAttempt,
  claimReference,
  executionCheckpoint,
  type ExecutionFacts,
} from './plan-execution';
import type { RuntimeCatalog } from './plan-runtime';
import { addInteger, equalRecords } from './record-codecs';
import type { ScopedAttemptGuard, StoreReply } from './run-store';
import { digestRuntimeRequest, equalRuntimeScopes, readRuntimeRequest } from './runtime-codecs';
import type { RuntimeAcceptance, RuntimeIntent, RuntimeScopeSnapshot } from './runtime-records';

export interface ClaimFacts extends ExecutionFacts {
  readonly scope: Extract<RuntimeScopeSnapshot, { kind: 'pinned' }>;
  readonly runtime: RuntimeCatalog;
}
export interface CoupledChange<Ack> {
  readonly runRevision: number;
  readonly ack: Ack;
}
/** Derives the latest accepted acquisition in this exact complete prefix, never today's grant projection or an older matching acquisition. */
export function latestAuthority(scope: Extract<RuntimeScopeSnapshot, { kind: 'pinned' }>) {
  for (let index = scope.acceptances.length - 1; index >= 0; index -= 1) {
    const acceptance = scope.acceptances.at(index);
    if (acceptance === undefined) throw new Error('runtime acceptance index missing');
    const intent = scope.intents.find((candidate) => candidate.commandId === acceptance.commandId);
    if (intent === undefined) throw new Error('runtime acceptance intent missing');
    const request = readRuntimeRequest(intent.canonicalRequest);
    if ('kind' in request.operation)
      return {
        intent,
        authority: {
          ownerId: request.operation.ownerId,
          generation:
            request.operation.expectedGeneration === null
              ? 1
              : addInteger(request.operation.expectedGeneration, 1),
        },
      };
  }
  return null;
}
function checkScoped(facts: ClaimFacts, guard: ScopedAttemptGuard): StoreReply<never> | undefined {
  if (facts.attempt.identity.runId !== guard.runId)
    return { kind: 'refused', reason: 'identity_conflict' };
  const checkpoint = executionCheckpoint(facts.attempt.state);
  const session =
    'session' in checkpoint
      ? checkpoint.session
      : 'execution' in checkpoint
        ? checkpoint.execution.session
        : undefined;
  if (session === undefined) return { kind: 'refused', reason: 'state_conflict' };
  if (
    !equalRuntimeScopes(guard.scope, session.preparation.target.observation.scope) ||
    !equalRuntimeScopes(facts.scope.pin.scope, guard.scope) ||
    guard.scope.organizationId !== guard.ownership.organizationId ||
    guard.scope.projectId !== facts.run.projectId
  )
    return { kind: 'refused', reason: 'authority_conflict' };
  const conflict = checkAttempt(facts, guard);
  if (conflict !== undefined) return conflict;
  // Proof: Task2 F21 removed the scope revision comparison; the stale expectedScopeRevision stage applied. Exact restored subset passed.
  if (facts.scope.revision !== guard.expectedScopeRevision)
    return { kind: 'refused', reason: 'revision_conflict' };
  return undefined;
}
/** Pure stage consequence at the caller's independently reconstructed scope prefix. */
export function claimStageTransition(
  facts: ClaimFacts,
  command: ClaimStageCommand,
  owner: DispatchOwner,
): StoreReply<ClaimStageAck> {
  // Proof: Task2 F18 unwrapped reconciling-prepared before this direct-state check; fresh claim stage applied instead of refusing uncertainty. Exact restored subset passed.
  const state = facts.attempt.state;
  if (state.kind !== 'prepared') return { kind: 'refused', reason: 'state_conflict' };
  // Proof: Task2 F17 removed this pending check; claim stage applied while authority was pending. Exact restored subset passed.
  if (facts.scope.pendingCommandId !== null) return { kind: 'refused', reason: 'state_conflict' };
  const { scope, operation } = readRuntimeRequest(command.canonicalRequest);
  if ('kind' in operation || operation.action.kind !== 'claim')
    return { kind: 'refused', reason: 'state_conflict' };
  const session = state.session;
  // Proof: F02/F03 independently removed the attachment epoch/label comparisons; the corresponding 'history rejects claim stage owner' negatives resolved. Exact restoration passed.
  if (
    owner.epoch < session.attachment.owner.epoch ||
    (owner.epoch === session.attachment.owner.epoch &&
      owner.ownerId !== session.attachment.owner.ownerId)
  )
    return { kind: 'refused', reason: 'authority_conflict' };
  const preparation = session.preparation;
  const original = preparation.target.observation;
  const observed = command.observation;
  const acquisition = latestAuthority(facts.scope);
  // Proof: Task2 F19 disabled this acquisition comparison; a coherent wrong authority generation was applied. Exact restored subset passed.
  // Proof: Task2 F47 broke only P22 authority owner; 'claim stage refuses coherent authority owner' received applied instead of the intended refusal. Exact restored subset passed.
  if (
    acquisition === null ||
    !equalRecords(acquisition.intent.localOwner, owner) ||
    !equalRecords(acquisition.authority, operation.authority)
  )
    return { kind: 'refused', reason: 'authority_conflict' };
  // Proof: Task2 F20 disabled this target correspondence guard; a coherent different request scope was applied. Exact restored subset passed; other members retain separate negatives.
  // Proof: Task2 F46 broke only P23 remaining14 target samples; 'claim stage refuses coherent (ledger|basis|work|step|parent|store|run|attempt|session|observation work|observation step|observation code|observation ledger|observation scope) mismatch' received applied instead of the intended refusal in all14 distinct target cases. Exact restored subset passed.
  if (
    !equalRuntimeScopes(scope, facts.scope.pin.scope) ||
    !equalRuntimeScopes(scope, original.scope) ||
    !equalRuntimeScopes(scope, observed.scope) ||
    operation.expectedLedgerId !== facts.scope.pin.ledgerId ||
    observed.ledgerId !== original.ledgerId ||
    observed.ledgerId !== operation.expectedLedgerId ||
    observed.workItemId !== original.workItemId ||
    observed.stepId !== original.stepId ||
    observed.stepCode !== original.stepCode ||
    operation.expectedBasis !== observed.basis ||
    operation.action.workItemId !== observed.workItemId ||
    operation.action.stepId !== observed.stepId ||
    operation.action.parentClaimId !== preparation.target.parentClaimId ||
    !equalRecords(operation.action.execution, {
      storeId: facts.ownership.storeId,
      runId: facts.run.runId,
      attemptId: facts.attempt.attemptId,
      sessionId: session.locator.session.sessionId,
    })
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
  return {
    kind: 'applied',
    value: {
      version: 1,
      kind: 'claim_staged',
      intent,
      attempt: advanceAttempt(
        facts.attempt,
        { kind: 'claiming', session, intent, observation: observed },
        true,
      ),
    },
  };
}
/** Fresh claim identities cannot borrow a preexisting wire stage association. */
export function planClaimStage(
  facts: ClaimFacts,
  guard: ScopedAttemptGuard,
  command: ClaimStageCommand,
): StoreReply<CoupledChange<ClaimStageAck>> {
  const operation = readRuntimeRequest(command.canonicalRequest).operation;
  // Proof: Task2 F63 broke only P24 global wire association; 'claim wire association is globally' received applied instead of the intended refusal. Exact restored subset passed.
  if (facts.runtime.intents.some((intent) => intent.commandId === operation.commandId))
    return { kind: 'refused', reason: 'identity_conflict' };
  const conflict = checkScoped(facts, guard);
  if (conflict !== undefined) return conflict;
  const reply = claimStageTransition(facts, command, {
    ownerId: guard.ownership.ownerId,
    epoch: guard.ownership.epoch,
  });
  if (reply.kind === 'refused') return reply;
  return {
    kind: 'applied',
    value: { runRevision: addInteger(facts.run.revision, 1), ack: reply.value },
  };
}
/**
 * Resolves a claiming checkpoint, including uncertainty wrappers, without changing opened provenance.
 * Requires boundary-decoded commands and a completely audited scope/attempt prefix. Raw storage
 * retains receiver-generated fields; {@link acceptClaimReceipt} must verify their actual artifact
 * bytes before submission, and verified history must compare those bytes again on recovery.
 * Reconstructing receipt fields from this same request cannot establish correspondence independently.
 */
export function claimAcceptTransition(
  facts: ClaimFacts,
  command: ClaimAcceptCommand,
): StoreReply<ClaimAcceptAck> {
  const state = facts.attempt.state;
  // Proof: Task2 F64 broke only P25 settled claiming predecessor; 'claim acceptance cannot reopen' received applied instead of the intended refusal. Exact restored subset passed.
  if (state.kind !== 'claiming' && state.kind !== 'reconciling' && state.kind !== 'unresolved')
    return { kind: 'refused', reason: 'state_conflict' };
  const checkpoint = executionCheckpoint(state);
  // Proof: F232 removed this checkpoint refusal; 'review guard claim acceptance refuses reconciling prepared checkpoint' received identity_conflict instead of state_conflict. Refusal-priority only; exact restoration passed.
  if (checkpoint.kind !== 'claiming') return { kind: 'refused', reason: 'state_conflict' };
  const retained = facts.scope.intents.find(
    (intent) => intent.commandId === command.intent.commandId,
  );
  if (
    // Proof: I2-B removed only retained-intent absence rejection for a canonically re-keyed, re-digested unretained intent; 'I2-B control' threw 'canonical JSON cannot carry undefined' from canonicalJson(undefined) instead of identity_conflict. Rows stayed unchanged; refusal-contract only; exact restoration passed.
    retained === undefined ||
    // Proof: F231 removed this submitted-intent comparison; 'review guard claim acceptance rejects different submitted intent' received applied instead of identity_conflict. Exact restoration passed.
    !equalRecords(retained, command.intent) ||
    // Proof: I2-C changed only the consumed claiming intent's localOwner.ownerId after real history/attempt validation, then removed this equality; 'I2-C negative' received applied instead of identity_conflict. Dependency-fault proof only; exact restoration passed.
    !equalRecords(checkpoint.intent, retained)
  )
    return { kind: 'refused', reason: 'identity_conflict' };
  // Proof: I2-D replaced only the consumed pendingCommandId with null after real scope reconstruction, then removed this correspondence; 'I2-D negative' received applied instead of state_conflict. Dependency-fault proof only; exact restoration passed.
  if (facts.scope.pendingCommandId !== retained.commandId)
    return { kind: 'refused', reason: 'state_conflict' };
  const { operation } = readRuntimeRequest(retained.canonicalRequest);
  // Proof: I2-E parsed the real retained request, substituted schema-valid authority output at this consumption, then removed this whole compound predicate; 'I2-E negative' received applied instead of state_conflict. Dependency-fault proof only; exact restoration passed.
  // Proof: I2-F parsed the real retained request, substituted schema-valid write output at this consumption, then removed only the nonclaim-action arm, retaining the authority arm; 'I2-F negative' received applied instead of state_conflict. Dependency-fault proof only; exact restoration passed.
  if ('kind' in operation || operation.action.kind !== 'claim')
    return { kind: 'refused', reason: 'state_conflict' };
  const acceptance: RuntimeAcceptance = {
    version: 1,
    commandId: retained.commandId,
    requestDigest: retained.requestDigest,
    evidence: command.evidence,
    acceptedRevision: addInteger(facts.scope.revision, 1),
  };
  const binding: ClaimBinding = {
    version: 1,
    intent: retained,
    acceptance,
    projection: command.projection,
  };
  return {
    kind: 'applied',
    value: {
      version: 1,
      kind: 'claim_accepted',
      acceptance,
      binding,
      attempt: advanceAttempt(
        facts.attempt,
        {
          kind: 'ready',
          execution: { version: 1, session: checkpoint.session, binding },
          cause: { kind: 'initial' },
        },
        true,
      ),
    },
  };
}
export function planClaimAcceptance(
  facts: ClaimFacts,
  guard: ScopedAttemptGuard,
  command: ClaimAcceptCommand,
): StoreReply<CoupledChange<ClaimAcceptAck>> {
  // Proof: Task2 F65 removed this association-priority check; the existing replay test expected identity_conflict and received state_conflict. Refusal-contract-only proof; no unsafe-acceptance credit. Exact restoration passed.
  if (
    facts.runtime.acceptances.some(
      (acceptance) => acceptance.commandId === command.intent.commandId,
    )
  )
    return { kind: 'refused', reason: 'identity_conflict' };
  const conflict = checkScoped(facts, guard);
  if (conflict !== undefined) return conflict;
  const reply = claimAcceptTransition(facts, command);
  if (reply.kind === 'refused') return reply;
  return {
    kind: 'applied',
    value: { runRevision: addInteger(facts.run.revision, 1), ack: reply.value },
  };
}
/** Pure turn admission uses the latest accepted acquisition at its independent retained context and complete immutable request history. */
export function turnStageTransition(
  facts: ClaimFacts,
  command: TurnStageCommand,
): StoreReply<TurnStageAck> {
  // Proof: Task2 F56 broke only P28 direct ready checkpoint; 'turn stage refuses reconciling ready' received applied instead of the intended refusal. Exact restored subset passed.
  const state = facts.attempt.state;
  // Proof: F07 removed the pending-prefix condition; 'independent context rejects pending prefix' accepted a coherently paired older grant. Exact restoration passed.
  if (state.kind !== 'ready' || facts.scope.pendingCommandId !== null)
    return { kind: 'refused', reason: 'state_conflict' };
  const acquisition = latestAuthority(facts.scope);
  // Proof: Task2 F57 broke only P28 latest acquisition and attachment; 'exact claim acceptance resolves direct claiming without reattaching late=true' received applied instead of the intended refusal. Exact restored subset passed.
  if (
    acquisition === null ||
    !equalRecords(acquisition.intent.localOwner, command.request.owner) ||
    !equalRecords(state.execution.session.attachment.owner, command.request.owner)
  )
    return { kind: 'refused', reason: 'authority_conflict' };
  // Proof: Task2 F22 removed cause equality; a different decision cause was applied to an initial ready checkpoint. Exact restored subset passed.
  if (!equalRecords(state.cause, command.request.cause))
    return { kind: 'refused', reason: 'identity_conflict' };
  const intent: TurnIntent = {
    version: 1,
    locator: state.execution.session.locator,
    claim: claimReference(state),
    grantCommandId: acquisition.intent.commandId,
    request: command.request,
  };
  const prior = facts.executions.findLast(
    (entry) =>
      entry.reply.attempt.attemptId === facts.attempt.attemptId &&
      entry.command.kind === 'stage_turn' &&
      entry.command.request.turnKey === command.request.turnKey,
  );
  if (prior !== undefined) {
    // Proof: Task2 F55 broke only P28 retained retry payload; 'exact not_started turn reply resolves only its pending identity from direct$' received applied instead of the intended refusal. Exact restored subset passed.
    if (prior.reply.kind !== 'turn_staged' || !equalRecords(prior.reply.intent, intent))
      return { kind: 'refused', reason: 'identity_conflict' };
    const observed = facts.executions.some(
      (entry) =>
        entry.reply.attempt.attemptId === facts.attempt.attemptId &&
        entry.reply.attempt.revision > prior.reply.attempt.revision &&
        entry.command.kind === 'execution' &&
        entry.command.fact.kind === 'turn_observed' &&
        entry.command.fact.reply.kind === 'not_started' &&
        equalRecords(entry.command.fact.reply.identity, {
          locator: intent.locator,
          turnKey: intent.request.turnKey,
          owner: intent.request.owner,
        }),
    );
    if (!observed) return { kind: 'refused', reason: 'identity_conflict' };
  }
  return {
    kind: 'applied',
    value: {
      version: 1,
      kind: 'turn_staged',
      intent,
      attempt: advanceAttempt(
        facts.attempt,
        { kind: 'turn_pending', execution: state.execution, turn: intent },
        true,
      ),
    },
  };
}
export function planTurnStage(
  facts: ClaimFacts,
  guard: ScopedAttemptGuard,
  command: TurnStageCommand,
): StoreReply<CoupledChange<TurnStageAck>> {
  const conflict = checkScoped(facts, guard);
  if (conflict !== undefined) return conflict;
  // Proof: Task2 F23 removed current-submission owner equality; an old request owner applied after takeover when old grant and attachment still agreed. Exact restored subset passed.
  if (
    !equalRecords(command.request.owner, {
      ownerId: guard.ownership.ownerId,
      epoch: guard.ownership.epoch,
    })
  )
    return { kind: 'refused', reason: 'authority_conflict' };
  const reply = turnStageTransition(facts, command);
  if (reply.kind === 'refused') return reply;
  return {
    kind: 'applied',
    value: { runRevision: addInteger(facts.run.revision, 1), ack: reply.value },
  };
}
