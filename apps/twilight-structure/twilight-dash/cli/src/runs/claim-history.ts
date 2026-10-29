import { parseOrThrow, type } from '@shared/validation';
import { selectWorkflowActivity } from '@twilight-burokrat/contracts';

import type { ArtifactStore } from './artifact-store';
import type { ClaimProjection, TargetObservation } from './claim-records';
import { ClaimProjectionCodec, decodeScopedAttemptGuard } from './execution-codecs';
import type { ClaimAcceptAck, ClaimStageAck, ExecutionHistory } from './execution-records';
import { readManifestBinding } from './manifest-binding';
import { equalRecords } from './record-codecs';
import { readTargetObservation } from './record-preparation';
import type { ArtifactRef, AttemptId, ExecutionCommandId, RunId } from './records';
import type { RunStore, ScopedAttemptGuard, StoreReply } from './run-store';
import {
  equalRuntimeScopes,
  intentCodec,
  readRuntimeRequest,
  runtimeScopeKey,
} from './runtime-codecs';
import { readRuntimeHistory } from './runtime-history';
import { verifyRuntimeReceipt } from './runtime-receipt';
import type { RuntimeIntent, RuntimeScope } from './runtime-records';
import { ArtifactRefCodec, ExecutionCommandIdCodec } from './value-codecs';
import { verifyArtifacts } from './verify-artifacts';

const stageInputCodec = type({
  commandId: ExecutionCommandIdCodec,
  canonicalRequest: 'string>=1',
  stateEvidence: ArtifactRefCodec,
}).onUndeclaredKey('reject');
const acceptInputCodec = type({
  commandId: ExecutionCommandIdCodec,
  intent: intentCodec,
  evidence: ArtifactRefCodec,
}).onUndeclaredKey('reject');

/** Verifies a fresh state artifact for the immutable prepared target, then retains exact canonical claim bytes without sending them. */
export async function stageClaimRequest(
  runs: Pick<RunStore, 'readExecutionHistory' | 'stageClaim'>,
  artifacts: ArtifactStore,
  guard: ScopedAttemptGuard,
  input: {
    readonly commandId: ExecutionCommandId;
    readonly canonicalRequest: string;
    readonly stateEvidence: ArtifactRef;
  },
): Promise<StoreReply<ClaimStageAck>> {
  const snapshotGuard = decodeScopedAttemptGuard(guard);
  const snapshot = structuredClone(parseOrThrow(stageInputCodec, input));
  const history = structuredClone(
    await runs.readExecutionHistory(snapshotGuard.runId, snapshotGuard.attemptId),
  );
  // Proof: Task2 F43 removed/broke this dependency; 'claim helper verifies returned history target' failed with Missing expected rejection. Restored subset passed; helper rejection only, no provider-publication inference.
  if (
    history.run.runId !== snapshotGuard.runId ||
    history.attempt.attemptId !== snapshotGuard.attemptId
  )
    throw new Error('claim history target differs');
  const preparation = history.executions.find(
    (entry) =>
      entry.command.kind === 'execution' && entry.command.fact.kind === 'preparation_intended',
  );
  // Proof: Task2 F44 removed this diagnostic; 'missing preparation retains its intentional diagnostic' expected the named error and received the natural downstream TypeError. Diagnostic-only proof; restored test also observed no stageClaim call.
  if (
    preparation?.command.kind !== 'execution' ||
    preparation.command.fact.kind !== 'preparation_intended'
  )
    throw new Error('claim preparation does not exist');
  const target = preparation.command.fact.intent.target.observation;
  const observation = await readTargetObservation(artifacts, snapshot.stateEvidence, target);
  const request = readRuntimeRequest(snapshot.canonicalRequest);
  if ('kind' in request.operation || request.operation.action.kind !== 'claim')
    throw new Error('claim request kind differs');
  return await runs.stageClaim(snapshotGuard, {
    version: 2,
    kind: 'stage_claim',
    commandId: snapshot.commandId,
    canonicalRequest: snapshot.canonicalRequest,
    observation,
  });
}

/** Uses the single full receipt-byte verifier and retains only receiver-generated claim fields locally. */
export async function acceptClaimReceipt(
  runs: Pick<RunStore, 'recordClaimAcceptance'>,
  artifacts: ArtifactStore,
  guard: ScopedAttemptGuard,
  input: {
    readonly commandId: ExecutionCommandId;
    readonly intent: RuntimeIntent;
    readonly evidence: ArtifactRef;
  },
): Promise<StoreReply<ClaimAcceptAck>> {
  const snapshotGuard = decodeScopedAttemptGuard(guard);
  const snapshot = structuredClone(parseOrThrow(acceptInputCodec, input));
  // Proof: Task2 F39 removed/broke this dependency; 'claim acceptance refuses actual receipt command' failed with Missing expected rejection. Restored subset passed; helper rejection only, no provider-publication inference.
  const receipt = await verifyRuntimeReceipt(artifacts, snapshot.intent, snapshot.evidence);
  if (receipt.acceptance.kind !== 'claim') throw new Error('claim receipt kind differs');
  const projection: ClaimProjection = parseOrThrow(ClaimProjectionCodec, {
    version: 1,
    claimId: receipt.acceptance.claim.claimId,
    actorId: receipt.actorId,
    basisAfter: receipt.acceptance.basisAfter,
  });
  return await runs.recordClaimAcceptance(snapshotGuard, {
    version: 2,
    kind: 'accept_claim',
    commandId: snapshot.commandId,
    intent: snapshot.intent,
    evidence: snapshot.evidence,
    projection,
  });
}

async function verifyObservation(
  artifacts: ArtifactStore,
  observation: TargetObservation,
): Promise<void> {
  const projected = await readTargetObservation(artifacts, observation.evidence, observation);
  // Proof: Task2 F42 removed/broke this dependency; 'verified preparation history rejects coherent observation' failed with Missing expected rejection. Restored subset passed; helper rejection only, no provider-publication inference.
  if (!equalRecords(projected, observation))
    throw new Error('retained target projection differs from artifact');
}

/** Rechecks independently retained binding, state, claim and recovery bytes after the provider's complete consistent history audit. No transport authenticity or live lease is asserted. */
export async function readExecutionHistory(
  runs: Pick<RunStore, 'readExecutionHistory' | 'readManifest' | 'readRuntimeScope'>,
  artifacts: ArtifactStore,
  runId: RunId,
  attemptId: AttemptId,
): Promise<ExecutionHistory> {
  const history = structuredClone(await runs.readExecutionHistory(runId, attemptId));
  // Proof: Task2 F45 removed/broke this dependency; 'verified history checks returned target' failed with Missing expected rejection. Restored subset passed; helper rejection only, no provider-publication inference.
  if (history.run.runId !== runId || history.attempt.attemptId !== attemptId)
    throw new Error('execution history target differs');
  const { manifest, binding } = await readManifestBinding(
    runs,
    artifacts,
    history.run.manifestDigest,
  );
  for (const entry of history.executions) {
    const command = entry.command;
    if (command.kind === 'stage_claim') await verifyObservation(artifacts, command.observation);
    else if (command.kind === 'accept_claim') {
      const receipt = await verifyRuntimeReceipt(artifacts, command.intent, command.evidence);
      if (receipt.acceptance.kind !== 'claim')
        throw new Error('historical claim receipt kind differs');
      const projection = {
        version: 1,
        claimId: receipt.acceptance.claim.claimId,
        actorId: receipt.actorId,
        basisAfter: receipt.acceptance.basisAfter,
      };
      // Proof: Task2 F40 removed/broke this dependency; 'verified history rejects coherently retained generated claimId' failed with Missing expected rejection. Restored subset passed; helper rejection only, no provider-publication inference.
      if (!equalRecords(command.projection, projection))
        throw new Error('historical claim projection differs from artifact');
    } else if (command.kind === 'execution') {
      const fact = command.fact;
      if (fact.kind === 'preparation_intended') {
        const intent = fact.intent;
        const selected = selectWorkflowActivity(
          binding,
          intent.selection.requestedType,
          intent.selection.stepCode,
        );
        const selection = {
          bindingDigest: selected.bindingDigest,
          requestedType: selected.requestedType,
          matchedType: selected.matchedType,
          stepCode: selected.stepCode,
          className: selected.className,
        };
        // Proof: Task2 F41 removed/broke this dependency; 'verified preparation history rejects coherent selection' failed with Missing expected rejection. Restored subset passed; helper rejection only, no provider-publication inference.
        if (
          intent.manifestDigest !== manifest.digest ||
          !equalRecords(intent.selection, selection) ||
          !Object.hasOwn(manifest.executorVersions, selected.settings.executor) ||
          intent.executor.kind !== selected.settings.executor ||
          intent.executor.version !== manifest.executorVersions[selected.settings.executor]
        )
          throw new Error('historical preparation selection differs');
        await verifyObservation(artifacts, intent.target.observation);
      } else if (fact.kind === 'session_reattached' || fact.kind === 'unresolved')
        await verifyArtifacts(artifacts, [fact.evidence]);
      else if (fact.kind === 'interrupted')
        await verifyArtifacts(artifacts, [fact.quiescence.evidence]);
      else if (fact.kind === 'waiting')
        await verifyArtifacts(artifacts, [fact.wait.prompt, fact.quiescence.evidence]);
    }
  }
  for (const decision of history.decisions)
    await verifyArtifacts(artifacts, [decision.authorizationEvidence]);
  if (history.completion !== null)
    await verifyArtifacts(artifacts, [
      ...history.completion.completion.outcome.artifacts,
      ...history.completion.completion.intent.outcome.artifacts,
      history.completion.completion.quiescence.evidence,
    ]);
  if (history.receipt !== null)
    await verifyArtifacts(artifacts, [history.receipt.receipt.evidence]);
  if (history.version === 2) {
    const scopes = new Map<string, RuntimeScope>();
    for (const entry of history.executions) {
      if (
        entry.command.kind === 'execution' &&
        entry.command.fact.kind === 'preparation_intended'
      ) {
        const scope = entry.command.fact.intent.target.observation.scope;
        scopes.set(runtimeScopeKey(scope), scope);
      }
    }
    for (const closure of history.recoveries) {
      const scope = readRuntimeRequest(closure.original.canonicalRequest).scope;
      scopes.set(runtimeScopeKey(scope), scope);
    }
    for (const scope of scopes.values()) {
      // Proof: R2F13 replaced only this new verified read with raw scope inspection; active witness substitution lost rejection. Exact restoration passed.
      const runtime = await readRuntimeHistory(runs, artifacts, scope);
      if (runtime.version !== 2 || runtime.kind !== 'pinned')
        // Proof: R2F50 removed only this check; 'verified successor execution refuses predecessor scope without recovery witnesses' lost rejection. Exact restoration passed.
        throw new Error('execution recovery scope differs from complete runtime history');
      for (const closure of history.recoveries) {
        if (
          equalRuntimeScopes(readRuntimeRequest(closure.original.canonicalRequest).scope, scope) &&
          !runtime.recoveries.some((journal) => equalRecords(journal.closure, closure))
        )
          // Proof: R2F51 removed only this check; 'verified execution rejects closure absent from the complete runtime journal' lost rejection. Exact restoration passed.
          throw new Error('execution recovery closure differs from complete runtime history');
      }
    }
  }
  return history;
}
