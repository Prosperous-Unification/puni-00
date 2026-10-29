import { checkAttempt, executionCheckpoint } from './plan-execution';
import { inspectRuntimeScope } from './plan-runtime';
import { equalRecords } from './record-codecs';
import type { RecoveryBeginCall, RecoveryHistory } from './recovery-records';
import type { StoreReply } from './run-store';
import { equalRuntimeScopes, readRuntimeRequest } from './runtime-codecs';
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
