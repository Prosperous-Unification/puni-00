import { parseOrThrow } from '@shared/validation';
import type { UIMessageChunk } from 'ai';

import {
  type ActivityExecutor,
  type ActivitySession,
  snapshotExecutorLocator,
  snapshotTurnReply,
  snapshotTurnRequest,
  type TurnRequest,
} from '../agents/activity-executor';
import type { ClaimClient } from '../bridge/claim-client';
import type { RuntimeClient } from '../bridge/runtime-client';
import type { ArtifactStore } from './artifact-store';
import { readExecutionHistory } from './claim-history';
import type { TurnIntent } from './claim-records';
import { decodeScopedAttemptGuard, decodeTurnStageCommand } from './execution-codecs';
import type { TurnStageAck } from './execution-records';
import { latestAuthority } from './plan-claims';
import { addInteger, equalRecords } from './record-codecs';
import { recordExecution } from './record-execution';
import type { Attempt, ExecutionCommandId } from './records';
import type { RunStore, ScopedAttemptGuard, StoreRefusal } from './run-store';
import { equalRuntimeScopes, readRuntimeRequest } from './runtime-codecs';
import { readRuntimeHistory } from './runtime-history';
import { TurnDispatchError } from './turn-dispatch-error';
import { ExecutionCommandIdCodec } from './value-codecs';

type RuntimeObservation = Awaited<ReturnType<RuntimeClient['readState']>>['reply'];
type LeaseObservation = Awaited<ReturnType<ClaimClient['readClaims']>>;
type Unconfirmed<Observation extends { kind: string }> = Exclude<Observation, { kind: 'success' }>;
type ReadObservation<Observation extends RuntimeObservation | LeaseObservation> =
  | Extract<Observation, { kind: 'refusal' }>
  | {
      readonly kind: 'failure';
      readonly failure: Extract<
        Extract<Observation, { kind: 'failure' }>['failure'],
        { code: 'cancelled' | 'transport' }
      >;
    };
/** Pending staging does not authorize another physical turn or settle business progress. */
export type TurnDispatchReply =
  | { readonly kind: 'observed'; readonly intent: TurnIntent; readonly attempt: Attempt }
  | {
      readonly kind: 'pending';
      readonly intent: TurnIntent;
      readonly ack: TurnStageAck;
      readonly observation:
        | { readonly kind: 'duplicate' | 'cancelled_before_dispatch' }
        | { readonly kind: 'local_refused'; readonly reason: StoreRefusal };
    }
  | { readonly kind: 'refused'; readonly reason: StoreRefusal }
  | {
      readonly kind: 'unconfirmed';
      readonly operation: 'runtime_state';
      readonly observation: ReadObservation<RuntimeObservation>;
    }
  | {
      readonly kind: 'unconfirmed';
      readonly operation: 'claim_lease';
      readonly observation: ReadObservation<LeaseObservation>;
    };
type TurnRuns = Pick<
  RunStore,
  | 'readExecutionHistory'
  | 'readManifest'
  | 'readRuntimeScope'
  | 'stageTurn'
  | 'recordExecution'
  | 'renewOwnership'
>;
function refuseTurn(reason: StoreRefusal): Extract<TurnDispatchReply, { kind: 'refused' }> {
  return { kind: 'refused', reason };
}
function checkFailure(
  observation: Unconfirmed<RuntimeObservation | LeaseObservation>,
): asserts observation is ReadObservation<RuntimeObservation | LeaseObservation> {
  // Proof: T41/T88 removed trusted-failure rejection; 'keeps invalid/unknown_status observation distinct' failed.
  if (
    observation.kind === 'failure' &&
    observation.failure.code !== 'cancelled' &&
    observation.failure.code !== 'transport'
  )
    throw new Error('Turn observation rejected exchange', { cause: observation.failure });
}
/**
 * Stages one immutable turn after separate current runtime and server-clock lease reads.
 * Historical stages delegate replay before fresh-ready checks and never dispatch again.
 * Post-stage uncertainty retains exact intent and capacity; observation uses the submitted cut.
 */
export async function dispatchTurn(
  runs: TurnRuns,
  artifacts: ArtifactStore,
  runtime: Pick<RuntimeClient, 'readState'>,
  claims: ClaimClient,
  executor: ActivityExecutor,
  session: ActivitySession,
  guard: ScopedAttemptGuard,
  input: {
    readonly stageCommandId: ExecutionCommandId;
    readonly observedCommandId: ExecutionCommandId;
    readonly request: TurnRequest;
  },
  control: { readonly signal: AbortSignal; readonly onPart: (part: UIMessageChunk) => void },
): Promise<TurnDispatchReply> {
  // Proof: T01–T06 bypassed snapshots, codecs, distinct IDs or captured controls; named snapshot/invalid/distinct tests failed.
  const snapshotGuard = decodeScopedAttemptGuard(guard);
  const command = decodeTurnStageCommand({
    version: 2,
    kind: 'stage_turn',
    commandId: input.stageCommandId,
    request: input.request,
  });
  const observedCommandId = parseOrThrow(ExecutionCommandIdCodec, input.observedCommandId);
  if (command.commandId === observedCommandId)
    throw new Error('turn stage and observation command identities must differ');
  const { signal, onPart } = control;
  const isCancelled = () => signal.aborted;
  // Proof: T07 bypassed artifact verification; 'verified history rejects missing retained preparation artifact' failed.
  const history = await readExecutionHistory(
    runs,
    artifacts,
    snapshotGuard.runId,
    snapshotGuard.attemptId,
  );
  async function stageTurn() {
    return await runs.stageTurn(snapshotGuard, command);
  }
  function createPendingReply(
    ack: TurnStageAck,
    observation: Extract<TurnDispatchReply, { kind: 'pending' }>['observation'],
  ): TurnDispatchReply {
    return { kind: 'pending', intent: ack.intent, ack, observation };
  }
  // Same-family and cross-family identities both belong to provider replay/collision semantics.
  // Proof: T08–T10/T83 bypassed replay priority, original ack, refusal or duplicate checks; historical replay/collision tests failed.
  if (history.executions.some((entry) => entry.command.commandId === command.commandId)) {
    const replay = await stageTurn();
    if (replay.kind === 'refused') return replay;
    if (replay.kind !== 'duplicate') throw new Error('historical turn stage was applied again');
    return createPendingReply(structuredClone(replay.value), { kind: 'duplicate' });
  }
  // Proof: T89 removed fresh observation-ID exclusion; 'new stage after not_started requires fresh observation identity' failed through actual providers.
  if (history.executions.some((entry) => entry.command.commandId === observedCommandId))
    return refuseTurn('identity_conflict');
  // Proof: T11–T19/T84/T87 removed ready, revision, scope, owner or executor correspondence; named preflight tests failed.
  const state = history.attempt.state;
  if (state.kind !== 'ready') return refuseTurn('state_conflict');
  if (
    history.run.revision !== snapshotGuard.expectedRevision ||
    history.attempt.revision !== snapshotGuard.expectedAttemptRevision
  )
    return refuseTurn('revision_conflict');
  const located = state.execution.session;
  const owner = { ownerId: snapshotGuard.ownership.ownerId, epoch: snapshotGuard.ownership.epoch };
  if (
    !equalRuntimeScopes(located.preparation.target.observation.scope, snapshotGuard.scope) ||
    snapshotGuard.scope.organizationId !== snapshotGuard.ownership.organizationId ||
    snapshotGuard.scope.projectId !== history.run.projectId ||
    !equalRecords(located.attachment.owner, owner) ||
    !equalRecords(command.request.owner, owner)
  )
    return refuseTurn('authority_conflict');
  if (
    !equalRecords(snapshotExecutorLocator(session.locator), located.locator) ||
    executor.kind !== located.locator.executor ||
    executor.version !== located.locator.executorVersion
  )
    return refuseTurn('identity_conflict');
  // Proof: T20 bypassed runtime artifact verification; 'verified runtime history requires retained authority artifact' failed.
  const scope = await readRuntimeHistory(runs, artifacts, snapshotGuard.scope);
  // Proof: T21–T23/T76–T82 removed pin/revision/latest-grant predicates; preflight and runtime-prefix tests failed.
  if (scope.kind !== 'pinned') return refuseTurn('authority_conflict');
  if (scope.revision !== snapshotGuard.expectedScopeRevision)
    return refuseTurn('revision_conflict');
  const acquisition = latestAuthority(scope);
  if (
    !equalRuntimeScopes(scope.pin.scope, snapshotGuard.scope) ||
    scope.pin.ledgerId !== located.preparation.target.observation.ledgerId ||
    scope.pendingCommandId !== null ||
    scope.grant?.localEpoch !== owner.epoch ||
    acquisition === null ||
    !equalRecords(acquisition.intent.localOwner, owner) ||
    scope.grant.commandId !== acquisition.intent.commandId ||
    !equalRecords(scope.grant.authority, acquisition.authority)
  )
    return refuseTurn('authority_conflict');
  const request = readRuntimeRequest(state.execution.binding.intent.canonicalRequest);
  if ('kind' in request.operation || request.operation.action.kind !== 'claim')
    throw new Error('retained turn claim kind differs');
  const target = request.operation.action;
  const claimId = state.execution.binding.projection.claimId;
  // Proof: T24 changed expected ledger; 'live reads use exact pinned project person ledger and captured signal' failed.
  const runtimeObservation = (
    await runtime.readState({
      params: { id: snapshotGuard.scope.projectId },
      query: { personId: snapshotGuard.scope.personId, expectedLedgerId: scope.pin.ledgerId },
      signal,
    })
  ).reply;
  // Proof: T39 removed endpoint outcome routing; runtime_state refusal/transport/cancelled/invalid tests failed.
  if (runtimeObservation.kind !== 'success') {
    checkFailure(runtimeObservation);
    return { kind: 'unconfirmed', operation: 'runtime_state', observation: runtimeObservation };
  }
  const live = structuredClone(runtimeObservation.body);
  // Proof: T25–T38 removed runtime scope, grant, cardinality, runtime kind or claim/binding checks; named inventory tests failed. T27 used shared-client-valid compatible extras.
  const inventory = live.claims.filter((candidate) => candidate.claim.id === claimId);
  const selected = inventory[0];
  if (
    live.ledgerId !== scope.pin.ledgerId ||
    !equalRuntimeScopes(live.scope, snapshotGuard.scope) ||
    live.authority.kind !== 'held' ||
    live.authority.ownerId !== acquisition.authority.ownerId ||
    live.authority.generation !== acquisition.authority.generation ||
    inventory.length !== 1 ||
    selected.kind !== 'runtime' ||
    !equalRecords(selected.binding, {
      claimId,
      workItemId: target.workItemId,
      stepId: target.stepId,
      parentClaimId: target.parentClaimId,
      execution: target.execution,
    }) ||
    selected.claim.personId !== snapshotGuard.scope.personId ||
    selected.claim.workItemId !== target.workItemId ||
    selected.claim.stepId !== target.stepId ||
    selected.claim.parentClaimId !== target.parentClaimId ||
    selected.claim.runId !== located.locator.session.sessionId
  )
    return refuseTurn('authority_conflict');
  const leaseObservation = await claims.readClaims({
    params: { id: snapshotGuard.scope.projectId },
    signal,
  });
  // Proof: T40 removed endpoint outcome routing; claim_lease refusal/transport/cancelled/invalid tests failed.
  if (leaseObservation.kind !== 'success') {
    checkFailure(leaseObservation);
    return { kind: 'unconfirmed', operation: 'claim_lease', observation: leaseObservation };
  }
  const leases = structuredClone(leaseObservation.body);
  // Proof: T42 removed finite server timestamps; each 'nonfinite successful lease' test failed.
  if (
    !Number.isFinite(leases.readAt) ||
    leases.claims.some(
      (claim) =>
        !Number.isFinite(claim.claimedAt) ||
        (claim.leaseExpiresAt !== null && !Number.isFinite(claim.leaseExpiresAt)) ||
        (claim.leaseRevokedAt !== null && !Number.isFinite(claim.leaseRevokedAt)),
    )
  )
    throw new Error('nonfinite successful claim observation');
  // Proof: T43–T51 removed lease cardinality, identity, revocation or strict server-clock expiry; named fresh-live tests failed.
  const matches = leases.claims.filter((claim) => claim.claimId === claimId);
  const lease = matches[0];
  if (
    matches.length !== 1 ||
    lease.holder.personId !== snapshotGuard.scope.personId ||
    lease.workItemId !== target.workItemId ||
    lease.stepId !== target.stepId ||
    lease.parentClaimId !== target.parentClaimId ||
    lease.runId !== located.locator.session.sessionId ||
    lease.leaseRevokedAt !== null ||
    (lease.leaseExpiresAt !== null && lease.leaseExpiresAt <= leases.readAt)
  )
    return refuseTurn('authority_conflict');
  // Proof: T52 dispatched before staging; 'awaits stage renewal and observation commits with submitted cuts' failed.
  const staged = await stageTurn();
  // Proof: T53 removed local-refusal routing; fresh local stage refusal test failed.
  if (staged.kind === 'refused') return staged;
  // Proof: T54 retained mutable provider ack; 'retained stage acknowledgement detaches before renewal await' failed.
  const ack = structuredClone(staged.value);
  const intent = structuredClone(ack.intent);
  // Proof: T55 removed race-duplicate routing; fresh staging race duplicate test observed another turn and failed.
  if (staged.kind === 'duplicate') return createPendingReply(ack, { kind: 'duplicate' });
  try {
    // Proof: T56 removed cancellation before renewal; cancellation-before-renewal test failed.
    if (isCancelled()) return createPendingReply(ack, { kind: 'cancelled_before_dispatch' });
    // Proof: T57/T58 skipped renewal await/refusal; commit-order and renewal-refusal tests failed.
    const renewed = await runs.renewOwnership(snapshotGuard.ownership);
    if (renewed.kind === 'refused')
      return createPendingReply(ack, { kind: 'local_refused', reason: renewed.reason });
    // Proof: T59 removed cancellation after renewal; cancellation-during-renewal test failed.
    if (isCancelled()) return createPendingReply(ack, { kind: 'cancelled_before_dispatch' });
    // Proof: T60/T61/T85 removed final locator/executor rechecks; final identity tests failed after held renewal.
    if (
      !equalRecords(snapshotExecutorLocator(session.locator), intent.locator) ||
      executor.kind !== intent.locator.executor ||
      executor.version !== intent.locator.executorVersion
    )
      throw new Error('live executor identity changed before turn');
    // Proof: T62–T65 bypassed immutable request/original session, corrupted full reply or removed reply identity; executor/full-outcome/wrong-reply tests failed.
    const reply = snapshotTurnReply(
      await executor.turn(session, snapshotTurnRequest(intent.request), { signal, onPart }),
    );
    if (
      !equalRecords(reply.identity, {
        locator: intent.locator,
        turnKey: intent.request.turnKey,
        owner: intent.request.owner,
      })
    )
      throw new Error('turn reply identity differs');
    // Proof: T66–T69 changed submitted revisions, skipped observation await or refusal; commit-order and refused-save tests failed.
    const observed = await recordExecution(
      runs,
      artifacts,
      {
        ownership: snapshotGuard.ownership,
        runId: snapshotGuard.runId,
        attemptId: snapshotGuard.attemptId,
        expectedRevision: addInteger(snapshotGuard.expectedRevision, 1),
        expectedAttemptRevision: ack.attempt.revision,
      },
      {
        version: 2,
        kind: 'execution',
        commandId: observedCommandId,
        fact: { kind: 'turn_observed', reply },
      },
    );
    if (observed.kind === 'refused')
      return createPendingReply(ack, { kind: 'local_refused', reason: observed.reason });
    // Proof: T90–T92 removed acknowledged stage-cut identity/revision; each observation acknowledgement test failed; same-stage concurrent duplicate remains accepted.
    if (
      observed.value.attemptId !== snapshotGuard.attemptId ||
      observed.value.identity.runId !== snapshotGuard.runId ||
      observed.value.revision !== addInteger(ack.attempt.revision, 1)
    )
      throw new Error('turn observation acknowledgement differs', { cause: observed });
    return { kind: 'observed', intent, attempt: observed.value };
  } catch (cause) {
    // Proof: T70 discarded correlated provenance; throw_save/throw_turn tests failed.
    throw new TurnDispatchError(intent, cause);
  }
}
