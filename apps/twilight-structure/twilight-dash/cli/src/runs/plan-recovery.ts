import type { ClaimAcceptCommand, RecordedExecution } from './execution-records';
import { claimAcceptTransition } from './plan-claims';
import { checkAttempt, executionCheckpoint } from './plan-execution';
import type { RecoveryBarrier, RecoveryCatalog } from './plan-recovery-history';
import { findRecoveryCommand } from './plan-recovery-history';
import { inspectRuntimeScope } from './plan-runtime';
import { addInteger, equalRecords } from './record-codecs';
import type { Run } from './records';
import { deriveRecoveryClaimCommand } from './recovery-evidence';
import type {
  Attempt3,
  RecoveryBeginCall,
  RecoveryCall,
  RecoveryClosure,
  RecoveryContext,
  RecoveryExchange,
  RecoveryExchangeValue,
  RecoveryFence,
  RecoveryFenceInput,
  RecoveryFenceReplyInput,
  RecoveryHistory,
  RecoveryHold,
  RecoveryObservation,
  RecoveryResolveCall,
} from './recovery-records';
import type { StoreReply } from './run-store';
import { digestRuntimeRequest, equalRuntimeScopes, readRuntimeRequest } from './runtime-codecs';
import type { RuntimeAcceptance } from './runtime-records';
import type { HistoryCatalog } from './validate-history';

/** Plans only journal/index admission from an owner-authorized, completely audited catalog. Exact immutable replay precedes fresh revision and checkpoint checks. */
export function planRecoveryBegin(
  catalog: HistoryCatalog,
  call: RecoveryBeginCall,
): StoreReply<RecoveryHistory> {
  const { intent, guard } = call;
  const target = intent.target;
  const request = readRuntimeRequest(target.original.canonicalRequest);
  // Proof: T3B2 removed this check; a changed guard replayed in the matching recovery contract; exact restoration passed.
  if (
    call.kind !== target.kind ||
    !equalRuntimeScopes(request.scope, guard.scope) ||
    guard.scope.organizationId !== guard.ownership.organizationId
  )
    return { kind: 'refused', reason: 'authority_conflict' };
  // Proof: T3B9G removed this check; a changed guard replayed in the matching recovery contract; exact restoration passed.
  if (
    call.kind === 'claim' &&
    (call.guard.runId !== call.intent.target.runId ||
      call.guard.attemptId !== call.intent.target.attemptId)
  )
    return { kind: 'refused', reason: 'identity_conflict' };
  const prior = catalog.runtime.recovery.histories.find(
    (history) => history.intent.recoveryId === intent.recoveryId,
  );
  if (prior !== undefined)
    // Proof: T3B3 removed only this new dependency; begin immutable replay admitted a changed immutable replay; exact restoration passed.
    return equalRecords(prior.intent, intent)
      ? { kind: 'duplicate', value: prior }
      : { kind: 'refused', reason: 'identity_conflict' };
  const snapshot = inspectRuntimeScope(catalog.runtime, guard.scope, catalog.ownership);
  if (snapshot.kind !== 'pinned') throw new Error('runtime scope is not pinned');
  if (snapshot.version !== 2) throw new Error('recovery requires current runtime scope');
  // Proof: T3B4 removed only this new dependency; acceptance before begin admitted the forbidden begin; exact restoration passed.
  if (snapshot.pendingCommandId !== target.original.commandId || snapshot.activeRecoveryId !== null)
    return { kind: 'refused', reason: 'state_conflict' };
  // Proof: T3B5 removed only this new dependency; the wrong-original, cut and operation-kind tests observed applied journals; exact restoration passed.
  if (
    !snapshot.intents.some((retained) => equalRecords(retained, target.original)) ||
    intent.begunScopeRevision !== target.original.stagedRevision ||
    (target.kind === 'authority') !== 'kind' in request.operation
  )
    return { kind: 'refused', reason: 'identity_conflict' };
  // Proof: T3B6 removed only this new dependency; the resolver-mismatch test observed an applied journal; exact restoration passed.
  if (
    !equalRecords(intent.resolver, {
      ownerId: guard.ownership.ownerId,
      epoch: guard.ownership.epoch,
    })
  )
    return { kind: 'refused', reason: 'authority_conflict' };
  // Proof: T3B7 removed only this new dependency; the stale scope/recovery revision tests observed applied journals; exact restoration passed.
  if (
    guard.expectedRecoveryRevision !== 0 ||
    snapshot.revision !==
      (call.kind === 'authority' ? call.guard.expectedRevision : call.guard.expectedScopeRevision)
  )
    return { kind: 'refused', reason: 'revision_conflict' };
  const occupied = new Set([
    ...catalog.runtime.intents.map((entry) => entry.commandId),
    ...catalog.executions.map((entry) => entry.command.commandId),
    ...catalog.runtime.recovery.histories.flatMap((history) => [
      history.intent.recoveryId,
      ...(history.intent.target.kind === 'claim'
        ? [history.intent.target.acceptanceCommandId]
        : []),
      ...history.fences.map(
        (fence) => readRuntimeRequest(fence.canonicalRequest).operation.commandId,
      ),
    ]),
  ]);
  // Proof: T3B8A removed only this new dependency; the recovery-command collision test observed an applied journal; exact restoration passed.
  if (occupied.has(intent.recoveryId)) return { kind: 'refused', reason: 'identity_conflict' };
  if (call.kind === 'claim') {
    const claim = call.intent.target;
    // Proof: T3B8B removed only this new dependency; the acceptance-ID collision test observed an applied journal; exact restoration passed.
    if (occupied.has(claim.acceptanceCommandId) || claim.acceptanceCommandId === intent.recoveryId)
      return { kind: 'refused', reason: 'identity_conflict' };
    const attempt = catalog.attempts.find(
      (entry) => entry.attempt.attemptId === claim.attemptId,
    )?.attempt;
    const run = catalog.runs.find((entry) => entry.run.runId === claim.runId)?.run;
    if (attempt === undefined || run === undefined)
      throw new Error('recovery target does not exist');
    const stage = catalog.executions.find(
      (entry) => entry.command.commandId === claim.stageCommandId,
    );
    const checkpoint = executionCheckpoint(attempt);
    // Proof: T3B9DIAG removing stage refinement changed identity_conflict to the remaining checkpoint state_conflict; diagnostic-only; exact restoration passed.
    if (
      attempt.identity.runId !== claim.runId ||
      stage?.reply.kind !== 'claim_staged' ||
      stage.reply.attempt.attemptId !== claim.attemptId ||
      !equalRecords(stage.reply.intent, claim.original)
    )
      return { kind: 'refused', reason: 'identity_conflict' };
    // Proof: T3B9C removed this check; a fresh begin with changed checkpoint applied in the matching recovery contract; exact restoration passed.
    if (
      attempt.version !== 2 ||
      !attempt.holdsCapacity ||
      checkpoint.kind !== 'claiming' ||
      stage.reply.attempt.state.kind !== 'claiming' ||
      !equalRecords(checkpoint.intent, claim.original) ||
      !equalRecords(checkpoint.session, stage.reply.attempt.state.session)
    )
      return { kind: 'refused', reason: 'state_conflict' };
    if (!equalRuntimeScopes(checkpoint.session.preparation.target.observation.scope, guard.scope))
      return { kind: 'refused', reason: 'authority_conflict' };
    // Proof: T3B10 removed only this new dependency; the stale claim run/attempt revision tests observed applied journals; exact restoration passed.
    const conflict = checkAttempt({ attempt, run }, call.guard);
    if (conflict !== undefined) return conflict;
  }
  return {
    kind: 'applied',
    value: { version: 1, intent, revision: 0, fences: [], observations: [], closure: null },
  };
}

/** Identifies only the exact active claim target; an authority journal does not freeze unrelated scope work. */
export function isActiveRecoveryAttempt(
  runtime: HistoryCatalog['runtime'],
  attemptId: string,
): boolean {
  return runtime.recovery.histories.some(
    (history) =>
      history.closure === null &&
      history.intent.target.kind === 'claim' &&
      history.intent.target.attemptId === attemptId,
  );
}

/** Plans one exact receiver CAS from trusted detached projections. The caller owns current-owner authorization and the complete predecessor audit; this function neither reads artifacts nor proves transport chronology. Immutable replay retains its original owner and recovery revision. Complete predecessor audits imply open journals name their active pending target and closed journals retain an accepted last fence; the accepted-observation guard therefore refuses fresh staging after closure. Closure or supersession changes must revisit that implication. */
export function planRecoveryFence(
  catalog: HistoryCatalog,
  call: RecoveryCall<RecoveryFenceInput>,
): StoreReply<RecoveryFence> {
  const { guard } = call;
  const fence = call.input.fence;
  const request = readRuntimeRequest(fence.canonicalRequest);
  // Proof: T4F01 removing canonical digest equality admitted the malformed fresh fence in both providers. Exact restoration passed.
  if (digestRuntimeRequest(fence.canonicalRequest) !== fence.requestDigest)
    throw new Error('recovery fence canonical digest differs');
  const history = catalog.runtime.recovery.histories.find(
    (entry) => entry.intent.recoveryId === call.recoveryId,
  );
  // Proof: T4F02 removing the missing-journal refinement replaced its named rejection with TypeError; diagnostic only. Exact restoration passed.
  if (history === undefined) throw new Error('recovery journal does not exist');
  const target = history.intent.target;
  const original = readRuntimeRequest(target.original.canonicalRequest);
  // Proof: T4F03 removing target-kind correspondence admitted the substituted call kind in both providers. Exact restoration passed.
  if (call.kind !== target.kind || fence.recoveryId !== call.recoveryId)
    return { kind: 'refused', reason: 'identity_conflict' };
  // Proof: T4F04 removing scope correspondence replayed a fence under another scope guard. Exact restoration passed.
  if (
    !equalRuntimeScopes(guard.scope, original.scope) ||
    guard.scope.organizationId !== guard.ownership.organizationId
  )
    return { kind: 'refused', reason: 'authority_conflict' };
  // Proof: T4F05 removing claim target correspondence admitted wrong run/attempt guards. Exact restoration passed.
  if (
    call.kind === 'claim' &&
    target.kind === 'claim' &&
    (call.guard.runId !== target.runId || call.guard.attemptId !== target.attemptId)
  )
    return { kind: 'refused', reason: 'identity_conflict' };
  const commandId = request.operation.commandId;
  const prior = history.fences.find(
    (entry) => readRuntimeRequest(entry.canonicalRequest).operation.commandId === commandId,
  );
  if (prior !== undefined)
    // Proof: T4F06 bypassing immutable equality replayed changed canonical bytes under the retained identity. Exact restoration passed.
    return equalRecords(prior, fence)
      ? { kind: 'duplicate', value: prior }
      : { kind: 'refused', reason: 'identity_conflict' };
  // Proof: T4F07 removing the global namespace check admitted runtime, recovery and local execution identity collisions in both providers. Exact restoration passed.
  if (
    findRecoveryCommand(catalog.runtime.recovery, commandId) !== undefined ||
    catalog.runtime.intents.some((entry) => entry.commandId === commandId) ||
    catalog.executions.some((entry) => entry.command.commandId === commandId)
  )
    return { kind: 'refused', reason: 'identity_conflict' };
  // Proof: T4F08 removing owner correspondence admitted fresh foreign provenance. Exact restoration passed.
  if (
    !equalRecords(fence.owner, { ownerId: guard.ownership.ownerId, epoch: guard.ownership.epoch })
  )
    return { kind: 'refused', reason: 'authority_conflict' };
  const snapshot = inspectRuntimeScope(catalog.runtime, guard.scope, catalog.ownership);
  if (snapshot.kind !== 'pinned' || snapshot.version !== 2)
    throw new Error('recovery scope is not current and pinned');
  // Proof: T4F10 removing revision correspondence admitted stale guards and an incorrect staged revision. Exact restoration passed.
  if (
    history.revision !== guard.expectedRecoveryRevision ||
    fence.stagedRevision !== addInteger(history.revision, 1) ||
    snapshot.revision !==
      (call.kind === 'authority' ? call.guard.expectedRevision : call.guard.expectedScopeRevision)
  )
    return { kind: 'refused', reason: 'revision_conflict' };
  if (call.kind === 'claim' && target.kind === 'claim') {
    const attempt = catalog.attempts.find(
      (entry) => entry.attempt.attemptId === target.attemptId,
    )?.attempt;
    const run = catalog.runs.find((entry) => entry.run.runId === target.runId)?.run;
    if (attempt === undefined || run === undefined)
      throw new Error('recovery target does not exist');
    const conflict = checkAttempt({ attempt, run }, call.guard);
    // Proof: T4F11 omitting the attempt revision refusal admitted stale run/attempt guards. Exact restoration passed.
    if (conflict !== undefined) return conflict;
  }
  // Proof: T4F12 removing the ordinal/budget check admitted a gap and fourth fence in both providers. Exact restoration passed.
  if (fence.ordinal !== history.fences.length + 1 || history.fences.length >= 3)
    return { kind: 'refused', reason: 'state_conflict' };
  // Proof: T4F13 removing request correspondence admitted wrong scope/ledger; claim-kind substitution remained blocked by state-generation equality. Exact restoration passed.
  if (
    !('kind' in request.operation) ||
    !equalRuntimeScopes(request.scope, original.scope) ||
    request.operation.expectedLedgerId !== snapshot.pin.ledgerId
  )
    return { kind: 'refused', reason: 'identity_conflict' };
  const basis = fence.basis;
  const state = basis.state.body.value;
  const generation = state.authority.kind === 'held' ? state.authority.generation : null;
  const threshold =
    'kind' in original.operation
      ? original.operation.expectedGeneration
      : original.operation.authority.generation;
  // Proof: T4F14 removing state correspondence admitted wrong state scope/ledger and CAS expectation. Exact restoration passed.
  if (
    !equalRuntimeScopes(state.scope, original.scope) ||
    state.ledgerId !== snapshot.pin.ledgerId ||
    request.operation.expectedGeneration !== generation
  )
    return { kind: 'refused', reason: 'identity_conflict' };
  // Proof: T4F15 removing domination admitted state1 and null against original expected2. Exact restoration passed.
  if (threshold !== null && (generation === null || generation < threshold))
    return { kind: 'refused', reason: 'state_conflict' };
  // The receiver must be able to perform the exact successor increment.
  // Proof: T4F16 omitting safe successor arithmetic admitted MAX_SAFE_INTEGER as a fence expectation. Exact restoration passed.
  addInteger(generation ?? 0, 1);
  const previous = history.fences.at(-1);
  if (previous === undefined) {
    // Proof: T4F17 removing initial-basis discrimination admitted superseding basis for the first fence. Exact restoration passed.
    if (basis.kind !== 'initial') return { kind: 'refused', reason: 'state_conflict' };
    // Proof: T4F18 omitting initial exchange comparison admitted wrong context/body reference. Exact restoration passed.
    if (
      !matchesRecoveryExchange(
        basis.state,
        original.scope,
        snapshot.pin.ledgerId,
        { kind: 'initial_state', recoveryId: call.recoveryId },
        { kind: 'state' },
        200,
      )
    )
      return { kind: 'refused', reason: 'identity_conflict' };
  } else {
    const previousRequest = readRuntimeRequest(previous.canonicalRequest).operation;
    if (!('kind' in previousRequest)) throw new Error('retained recovery fence is not authority');
    // Proof: T4F19 removing supersession constraints admitted wrong previous ordinal and generation regression. Exact restoration passed.
    if (
      basis.kind !== 'superseding' ||
      basis.previousOrdinal !== previous.ordinal ||
      generation === null ||
      (previousRequest.expectedGeneration !== null &&
        generation <= previousRequest.expectedGeneration) ||
      history.observations.some(
        (entry) => entry.fence.ordinal === previous.ordinal && entry.kind === 'accepted',
      )
    )
      return { kind: 'refused', reason: 'state_conflict' };
    // Proof: T4F20 omitting supersession-state comparison admitted the wrong previous digest. Exact restoration passed.
    if (
      !matchesRecoveryExchange(
        basis.state,
        original.scope,
        snapshot.pin.ledgerId,
        {
          kind: 'supersession_state',
          recoveryId: call.recoveryId,
          previousOrdinal: previous.ordinal,
          previousRequestDigest: previous.requestDigest,
        },
        { kind: 'state' },
        200,
      )
    )
      return { kind: 'refused', reason: 'identity_conflict' };
    // Proof: T4F21 omitting supersession lookup comparison admitted wrong state linkage and status200. Exact restoration passed.
    if (
      !matchesRecoveryExchange(
        basis.lookup,
        original.scope,
        snapshot.pin.ledgerId,
        {
          kind: 'supersession_lookup',
          recoveryId: call.recoveryId,
          previousOrdinal: previous.ordinal,
          stateExchange: basis.state.envelope.artifact,
        },
        { kind: 'lookup', commandId: previousRequest.commandId },
        404,
      )
    )
      return { kind: 'refused', reason: 'identity_conflict' };
  }
  return { kind: 'applied', value: fence };
}

/** Compares purpose and reference associations only; the trusted value is not an artifact authenticity brand. */
function matchesRecoveryExchange(
  pair: RecoveryExchangeValue<unknown>,
  scope: RecoveryExchange['scope'],
  ledgerId: string,
  context: RecoveryContext,
  request: RecoveryExchange['request'],
  status: number,
): boolean {
  const exchange = pair.envelope.value;
  // Proof: T4F22 returning true from this matcher admitted wrong state request/status. Exact restoration passed.
  return (
    equalRecords(exchange.body, pair.body.artifact) &&
    equalRuntimeScopes(exchange.scope, scope) &&
    exchange.ledgerId === ledgerId &&
    equalRecords(exchange.context, context) &&
    equalRecords(exchange.request, request) &&
    exchange.status === status
  );
}

/** Plans one immutable reply for the latest staged fence from an owner-authorized audited catalog. Exact replay retains historical provenance and precedes fresh revisions. Trusted pairs establish correspondence only, never byte integrity or transport chronology. Complete predecessor audits imply the pinned scope, target rows and authority request exist; their refinements are diagnostics, not additional admission guards. A closed journal already observed its final fence, so exact replay or latest-stage refusal covers it. */
export function planRecoveryObservation(
  catalog: HistoryCatalog,
  call: RecoveryCall<RecoveryFenceReplyInput>,
): StoreReply<RecoveryObservation> {
  const { guard, input } = call;
  const history = catalog.runtime.recovery.histories.find(
    (entry) => entry.intent.recoveryId === call.recoveryId,
  );
  // Proof: T5O01 removing missing-journal refinement changed its named rejection to TypeError; diagnostic only. Exact restoration passed.
  if (history === undefined) throw new Error('recovery journal does not exist');
  const target = history.intent.target;
  const original = readRuntimeRequest(target.original.canonicalRequest);
  // Proof: T5O02 removing target-kind correspondence admitted a claim call for an authority journal. Exact restoration passed.
  if (call.kind !== target.kind || input.fence.recoveryId !== call.recoveryId)
    return { kind: 'refused', reason: 'identity_conflict' };
  // Proof: T5O03 removing scope correspondence replayed an observation under a foreign scope guard. Exact restoration passed.
  if (
    !equalRuntimeScopes(guard.scope, original.scope) ||
    guard.scope.organizationId !== guard.ownership.organizationId
  )
    return { kind: 'refused', reason: 'authority_conflict' };
  // Proof: T5O04 removing claim target correspondence admitted wrong run/attempt guards. Exact restoration passed.
  if (
    call.kind === 'claim' &&
    target.kind === 'claim' &&
    (call.guard.runId !== target.runId || call.guard.attemptId !== target.attemptId)
  )
    return { kind: 'refused', reason: 'identity_conflict' };
  const fence = history.fences.find((entry) => entry.ordinal === input.fence.ordinal);
  // Proof: T5O05 removing retained-fence equality admitted altered fence provenance. Exact restoration passed.
  if (fence === undefined || !equalRecords(fence, input.fence))
    return { kind: 'refused', reason: 'identity_conflict' };
  const prior = history.observations.find((entry) => entry.fence.ordinal === fence.ordinal);
  // Proof: T5O06 bypassing immutable equality replayed a changed receipt actor. Exact restoration passed.
  if (prior !== undefined)
    return equalRecords(prior, { ...input, version: 1, observedRevision: prior.observedRevision })
      ? { kind: 'duplicate', value: prior }
      : { kind: 'refused', reason: 'identity_conflict' };
  // A complete predecessor implies a closed journal already observed its last fence.
  // Proof: T5O07 removing latest-stage correspondence admitted a late observation for a superseded fence. Exact restoration passed.
  if (history.fences.at(-1)?.ordinal !== fence.ordinal || history.revision !== fence.stagedRevision)
    return { kind: 'refused', reason: 'state_conflict' };
  const snapshot = inspectRuntimeScope(catalog.runtime, guard.scope, catalog.ownership);
  if (snapshot.kind !== 'pinned' || snapshot.version !== 2)
    throw new Error('recovery scope is not current and pinned');
  // Proof: T5O08 removing revision correspondence admitted stale recovery/scope guards. Exact restoration passed.
  if (
    history.revision !== guard.expectedRecoveryRevision ||
    snapshot.revision !==
      (call.kind === 'authority' ? call.guard.expectedRevision : call.guard.expectedScopeRevision)
  )
    return { kind: 'refused', reason: 'revision_conflict' };
  if (call.kind === 'claim' && target.kind === 'claim') {
    const attempt = catalog.attempts.find(
      (entry) => entry.attempt.attemptId === target.attemptId,
    )?.attempt;
    const run = catalog.runs.find((entry) => entry.run.runId === target.runId)?.run;
    if (attempt === undefined || run === undefined)
      throw new Error('recovery target does not exist');
    const conflict = checkAttempt({ attempt, run }, call.guard);
    // Proof: T5O09 ignoring the attempt revision refusal admitted stale run/attempt guards. Exact restoration passed.
    if (conflict !== undefined) return conflict;
  }
  const request = readRuntimeRequest(fence.canonicalRequest);
  if (!('kind' in request.operation)) throw new Error('retained recovery fence is not authority');
  // Proof: T5O10 omitting exchange correspondence admitted wrong context, body reference, scope, ledger, request and status. Exact restoration passed.
  if (
    !matchesRecoveryExchange(
      input.reply,
      original.scope,
      snapshot.pin.ledgerId,
      {
        kind: 'fence_reply',
        recoveryId: call.recoveryId,
        ordinal: fence.ordinal,
        requestDigest: fence.requestDigest,
        stagedRevision: fence.stagedRevision,
      },
      input.kind === 'accepted' && input.reply.envelope.value.request.kind === 'lookup'
        ? { kind: 'lookup', commandId: request.operation.commandId }
        : { kind: 'authority', canonicalRequest: fence.canonicalRequest },
      input.kind === 'accepted' ? 200 : 409,
    )
  )
    return { kind: 'refused', reason: 'identity_conflict' };
  if (input.kind === 'accepted') {
    const receipt = input.reply.body.value;
    // Proof: T5O11 removing receipt identity checks admitted wrong scope, ledger, command and digest. Exact restoration passed.
    if (
      !equalRuntimeScopes(receipt.scope, request.scope) ||
      receipt.ledgerId !== request.operation.expectedLedgerId ||
      receipt.commandId !== request.operation.commandId ||
      receipt.requestDigest !== fence.requestDigest
    )
      return { kind: 'refused', reason: 'identity_conflict' };
    // Proof: T5O12 removing authority correspondence admitted a foreign owner and non-successor generation. Exact restoration passed.
    if (
      receipt.acceptance.authority.ownerId !== request.operation.ownerId ||
      receipt.acceptance.authority.generation !==
        addInteger(request.operation.expectedGeneration ?? 0, 1)
    )
      return { kind: 'refused', reason: 'identity_conflict' };
  }
  return {
    kind: 'applied',
    value: { ...input, version: 1, observedRevision: addInteger(history.revision, 1) },
  };
}

export interface RecoveryResolutionPlan {
  readonly closure: RecoveryClosure;
  readonly originalAcceptance: RuntimeAcceptance | null;
  readonly originalExecution: Extract<RecordedExecution, { command: ClaimAcceptCommand }> | null;
  readonly barrier: RecoveryBarrier;
  readonly attempt: Attempt3 | null;
  readonly run: Run | null;
  readonly history: RecoveryHistory;
  readonly counts: RecoveryCatalog['counts'];
  readonly active: RecoveryCatalog['active'];
}

/** Checks target identity before immutable closure replay. Providers call this after current-owner fencing and complete audit, before constructing a fresh plan. Stale revisions do not invalidate an exact historical replay. */
export function replayRecoveryResolution(
  catalog: HistoryCatalog,
  call: RecoveryResolveCall,
): StoreReply<RecoveryClosure> | undefined {
  const history = catalog.runtime.recovery.histories.find(
    (entry) => entry.intent.recoveryId === call.recoveryId,
  );
  // Proof: T6C01 removing missing-journal refinement produced TypeError instead of the named error; diagnostic only. Restoration passed.
  if (history === undefined) throw new Error('recovery journal does not exist');
  const target = history.intent.target;
  const original = readRuntimeRequest(target.original.canonicalRequest);
  // Proof: T6C02 removing kind correspondence admitted a claim call for an authority target after the test eliminated an unrelated status refusal. Restoration passed.
  if (call.kind !== target.kind) return { kind: 'refused', reason: 'identity_conflict' };
  // Proof: T6C03 removing scope correspondence replayed a closed journal through a foreign scope guard. Restoration passed.
  if (
    !equalRuntimeScopes(call.guard.scope, original.scope) ||
    call.guard.scope.organizationId !== call.guard.ownership.organizationId
  )
    return { kind: 'refused', reason: 'authority_conflict' };
  // Proof: T6C04 removing target correspondence admitted wrong run/attempt guards. Restoration passed.
  if (
    call.kind === 'claim' &&
    target.kind === 'claim' &&
    (call.guard.runId !== target.runId || call.guard.attemptId !== target.attemptId)
  )
    return { kind: 'refused', reason: 'identity_conflict' };
  if (history.closure === null) return undefined;
  // Proof: T6C05 bypassing immutable equality replayed changed decision evidence. Restoration passed.
  return equalRecords(history.closure.fence, call.fence) &&
    equalRecords(history.closure.decision, call.decision)
    ? { kind: 'duplicate', value: history.closure }
    : { kind: 'refused', reason: 'identity_conflict' };
}

/** Computes all closure consequences at one owner-authorized, completely audited open predecessor. Providers must run {@link replayRecoveryResolution} first. No IO or operational acceptance planner is invoked; old provenance survives the current resolver's independent authority check. */
export function planRecoveryResolution(
  catalog: HistoryCatalog,
  call: RecoveryResolveCall,
): StoreReply<RecoveryResolutionPlan> {
  const history = catalog.runtime.recovery.histories.find(
    (entry) => entry.intent.recoveryId === call.recoveryId,
  );
  if (history?.closure !== null) throw new Error('fresh recovery predecessor is not open');
  // Complete predecessor audit and replay establish target/stage/session/pending/capacity and nonregressing owner epochs. Remaining refinements diagnose broken internal preconditions, not independent admission checks.
  const target = history.intent.target;
  const original = target.original;
  const request = readRuntimeRequest(original.canonicalRequest);
  const snapshot = inspectRuntimeScope(catalog.runtime, call.guard.scope, catalog.ownership);
  if (snapshot.kind !== 'pinned' || snapshot.version !== 2)
    throw new Error('recovery scope is not current and pinned');
  const observation = history.observations.at(-1);
  // Proof: T6C06 removing retained accepted-fence equality admitted an altered immutable observation. Restoration passed.
  if (
    observation?.kind !== 'accepted' ||
    !equalRecords(call.fence, { fence: history.fences.at(-1), observation })
  )
    return { kind: 'refused', reason: 'identity_conflict' };
  // Proof: T6C07 removing revision correspondence admitted stale recovery/scope guards. Restoration passed.
  if (
    history.revision !== call.guard.expectedRecoveryRevision ||
    snapshot.revision !==
      (call.kind === 'authority' ? call.guard.expectedRevision : call.guard.expectedScopeRevision)
  )
    return { kind: 'refused', reason: 'revision_conflict' };
  const decision = call.decision;
  // Proof: T6C08 removing lookup correspondence admitted pre-fence context and unbound body/scope/ledger/request/status. Restoration passed.
  if (
    !matchesRecoveryExchange(
      decision.lookup,
      request.scope,
      snapshot.pin.ledgerId,
      {
        kind: 'original_lookup',
        recoveryId: call.recoveryId,
        ordinal: observation.fence.ordinal,
        observationRevision: observation.observedRevision,
        fenceExchange: observation.reply.envelope.artifact,
        fenceReceipt: observation.reply.body.artifact,
      },
      { kind: 'lookup', commandId: original.commandId },
      decision.kind === 'accepted' ? 200 : 404,
    )
  )
    return { kind: 'refused', reason: 'identity_conflict' };
  const floor = observation.reply.body.value.acceptance.authority.generation;
  let originalAcceptance: RuntimeAcceptance | null = null;
  let originalExecution: RecoveryResolutionPlan['originalExecution'] = null;
  let originalReply: RecoveryClosure['originalReply'] = null;
  let attempt: Attempt3 | null = null;
  let run: Run | null = null;
  if (decision.kind === 'accepted') {
    const receipt = decision.lookup.body.value;
    // Proof: T6C09 removing receipt identity admitted changed command/digest/scope/ledger. Restoration passed.
    if (
      !equalRuntimeScopes(receipt.scope, request.scope) ||
      receipt.ledgerId !== snapshot.pin.ledgerId ||
      receipt.commandId !== original.commandId ||
      receipt.requestDigest !== original.requestDigest
    )
      return { kind: 'refused', reason: 'identity_conflict' };
    if ('kind' in request.operation) {
      // Proof: T6C10 removing authority correspondence admitted wrong owner/generation; T6C10F removed only strict domination and admitted original3/fence3. Restoration passed.
      if (
        receipt.acceptance.kind !== 'authority' ||
        'command' in decision ||
        receipt.acceptance.authority.ownerId !== request.operation.ownerId ||
        receipt.acceptance.authority.generation !==
          addInteger(request.operation.expectedGeneration ?? 0, 1) ||
        floor <= receipt.acceptance.authority.generation
      )
        return { kind: 'refused', reason: 'identity_conflict' };
      originalAcceptance = {
        version: 1,
        commandId: original.commandId,
        requestDigest: original.requestDigest,
        evidence: decision.lookup.body.artifact,
        acceptedRevision: addInteger(snapshot.revision, 1),
      };
      originalReply = { kind: 'authority', acceptance: originalAcceptance };
    } else {
      if (request.operation.action.kind !== 'claim' || receipt.acceptance.kind !== 'claim')
        return { kind: 'refused', reason: 'identity_conflict' };
      const { claimId: _claimId, ...claimed } = receipt.acceptance.claim;
      const { kind: _kind, ...requested } = request.operation.action;
      // Proof: T6C12 removing claim receipt correspondence admitted a changed target/authority while all inherited claim guards remained. Restoration passed.
      if (
        !equalRecords(claimed, requested) ||
        !equalRecords(receipt.acceptance.authority, request.operation.authority)
      )
        return { kind: 'refused', reason: 'identity_conflict' };
    }
  }
  if (call.kind === 'claim' && target.kind === 'claim') {
    const predecessor = catalog.attempts.find(
      (entry) => entry.attempt.attemptId === target.attemptId,
    )?.attempt;
    const retainedRun = catalog.runs.find((entry) => entry.run.runId === target.runId)?.run;
    if (predecessor === undefined || retainedRun === undefined)
      throw new Error('recovery target does not exist');
    const conflict = checkAttempt({ attempt: predecessor, run: retainedRun }, call.guard);
    // Proof: T6C13 ignoring the attempt revision refusal admitted stale run/attempt guards. Restoration passed.
    if (conflict !== undefined) return conflict;
    const checkpoint = executionCheckpoint(predecessor);
    // Complete predecessor validation already proves the exact stage, session, original intent and reserved capacity.
    if (predecessor.version !== 2 || checkpoint.kind !== 'claiming')
      throw new Error('recovery predecessor is not claiming');
    let hold: RecoveryHold;
    let heldPredecessor = predecessor;
    if (call.decision.kind === 'accepted') {
      // Proof: T6C14 removing actual receipt-derived command equality admitted substituted command IDs and invented claim IDs. Restoration passed.
      if (
        !equalRecords(
          call.decision.command,
          deriveRecoveryClaimCommand({ ...history.intent, target }, call.decision.lookup),
        )
      )
        return { kind: 'refused', reason: 'identity_conflict' };
      const manifest = catalog.manifests.find(
        (entry) => entry.digest === retainedRun.manifestDigest,
      );
      if (manifest === undefined) throw new Error('recovery manifest does not exist');
      const accepted = claimAcceptTransition(
        {
          run: retainedRun,
          attempt: predecessor,
          manifest,
          ownership: catalog.ownership,
          executions: catalog.executions,
          runtime: catalog.runtime,
          scope: snapshot,
        },
        call.decision.command,
      );
      if (accepted.kind === 'refused') return accepted;
      const ack = accepted.value;
      if (ack.attempt.state.kind !== 'ready')
        throw new Error('claim acceptance did not produce ready');
      originalAcceptance = ack.acceptance;
      originalExecution = {
        version: 1,
        command: call.decision.command,
        context: { version: 1, scopeRevision: snapshot.revision },
        reply: ack,
      };
      originalReply = { kind: 'claim', command: call.decision.command, ack };
      heldPredecessor = ack.attempt;
      hold = {
        kind: 'recovery_hold',
        cause: 'claim_accepted_fenced',
        closureId: call.recoveryId,
        checkpoint: ack.attempt.state,
      };
    } else
      hold = {
        kind: 'recovery_hold',
        cause: 'claim_nonaccepted',
        closureId: call.recoveryId,
        checkpoint,
      };
    attempt = {
      ...heldPredecessor,
      version: 3,
      revision: addInteger(heldPredecessor.revision, 1),
      holdsCapacity: true,
      state: hold,
    };
    run = {
      ...retainedRun,
      revision: addInteger(retainedRun.revision, decision.kind === 'accepted' ? 2 : 1),
    };
  }
  const scopeAfter = addInteger(snapshot.revision, decision.kind === 'accepted' ? 2 : 1);
  const closure: RecoveryClosure = {
    version: 1,
    recoveryId: call.recoveryId,
    original,
    fence: call.fence,
    decision,
    resolvedRevision: addInteger(history.revision, 1),
    resolver: { ownerId: call.guard.ownership.ownerId, epoch: call.guard.ownership.epoch },
    scopeBefore: snapshot.revision,
    scopeAfter,
    originalReply,
    attemptReply: attempt,
  };
  const recovery = catalog.runtime.recovery;
  return {
    kind: 'applied',
    value: {
      closure,
      originalAcceptance,
      originalExecution,
      attempt,
      run,
      barrier: {
        recoveryId: call.recoveryId,
        scope: request.scope,
        scopeBefore: snapshot.revision,
        scopeAfter,
        generationFloor: floor,
      },
      history: { ...history, revision: closure.resolvedRevision, closure },
      counts: {
        ...recovery.counts,
        closures: addInteger(recovery.counts.closures, 1),
        barriers: addInteger(recovery.counts.barriers, 1),
        active: recovery.counts.active - 1,
      },
      active: recovery.active.filter((entry) => entry.recoveryId !== call.recoveryId),
    },
  };
}
