import { parseOrThrow, type } from '@shared/validation';

import type { ArtifactStore } from './artifact-store';
import { readExecutionHistory } from './claim-history';
import { decodeScopedAttemptGuard, TargetObservationCodec } from './execution-codecs';
import type { ExecutionHistory } from './execution-records';
import { executionCheckpoint } from './plan-execution';
import { equalRecords } from './record-codecs';
import type { ArtifactRef, ExecutionCommandId } from './records';
import type { RunStore, ScopedAttemptGuard, StoreReply } from './run-store';
import { equalRuntimeScopes, intentCodec, readRuntimeRequest } from './runtime-codecs';
import { readRuntimeHistory } from './runtime-history';
import { verifyRuntimeReceipt } from './runtime-receipt';
import type { RuntimeIntent } from './runtime-records';
import { readRuntimeStateArtifact } from './runtime-state';
import { ArtifactRefCodec, ExecutionCommandIdCodec } from './value-codecs';
import { verifyArtifacts } from './verify-artifacts';
import { decodeWriteCompletion, projectWriteReceipt, WriteCompletionCodec } from './write-codecs';
import type { WriteAcceptAck, WriteCompletion, WriteStageAck } from './write-records';

const stageInput = type({
  commandId: ExecutionCommandIdCodec,
  completion: WriteCompletionCodec,
  canonicalRequest: 'string>=1',
  stateEvidence: ArtifactRefCodec,
}).onUndeclaredKey('reject');
const acceptanceInput = type({
  commandId: ExecutionCommandIdCodec,
  stageCommandId: ExecutionCommandIdCodec,
  intent: intentCodec,
  evidence: ArtifactRefCodec,
}).onUndeclaredKey('reject');

type WriteReads = Pick<RunStore, 'readExecutionHistory' | 'readManifest' | 'readRuntimeScope'>;

/** Verifies the actual state's complete live binding, authority and target against the retained claimed turn and supplied request. Metadata does not establish receiver freshness or transport authenticity. */
export async function readWriteObservation(
  artifacts: ArtifactStore,
  history: ExecutionHistory,
  evidence: ArtifactRef,
  canonicalRequest: string,
) {
  const checkpoint = executionCheckpoint(history.attempt);
  if (checkpoint.kind !== 'turn_pending' && checkpoint.kind !== 'turn_returned')
    throw new Error('write history has no claimed turn');
  const binding = checkpoint.execution.binding;
  const original = checkpoint.execution.session.preparation.target.observation;
  const claim = readRuntimeRequest(binding.intent.canonicalRequest).operation;
  const request = readRuntimeRequest(canonicalRequest);
  if (
    'kind' in claim ||
    claim.action.kind !== 'claim' ||
    'kind' in request.operation ||
    request.operation.action.kind !== 'write'
  )
    throw new Error('write request kind differs');
  const { kind: _kind, ...target } = claim.action;
  const expected = { claimId: binding.projection.claimId, ...target };
  const state = await readRuntimeStateArtifact(artifacts, evidence);
  const work = state.facts.workItems.filter((entry) => entry.id === original.workItemId);
  const steps = state.facts.steps.filter((entry) => entry.id === original.stepId);
  const inventory = state.claims.filter((entry) => entry.claim.id === binding.projection.claimId);
  const live = inventory[0];
  const { kind: _authorityKind, ...authority } = state.authority;
  // Proof: T2 actual-state-association removed this guard; twelve actual-state negatives lost their expected wrapper rejection. This proves the byte-verification boundary, not receipt authenticity.
  if (
    !equalRuntimeScopes(state.scope, original.scope) ||
    !equalRuntimeScopes(state.scope, request.scope) ||
    state.ledgerId !== original.ledgerId ||
    state.ledgerId !== request.operation.expectedLedgerId ||
    state.basis !== request.operation.expectedBasis ||
    state.authority.kind !== 'held' ||
    !equalRecords(authority, request.operation.authority) ||
    work.length !== 1 ||
    steps.length !== 1 ||
    steps[0]?.code !== original.stepCode ||
    inventory.length !== 1 ||
    live.kind !== 'runtime' ||
    !equalRecords(live.binding, expected) ||
    !equalRecords(request.operation.action.claim, expected) ||
    // Proof: S15 removing only the session run binding admitted local Dash run substitution against authentic receiver-shaped state. The actual builder RED exposed this domain mismatch; exact restoration passed.
    !equalRecords(live.claim, {
      id: expected.claimId,
      workItemId: expected.workItemId,
      stepId: expected.stepId,
      personId: state.scope.personId,
      runId: expected.execution.sessionId,
      parentClaimId: expected.parentClaimId,
      accountId: binding.projection.actorId,
    })
  )
    throw new Error('write state claim authority or target differs');
  return parseOrThrow(TargetObservationCodec, {
    version: 1,
    evidence,
    scope: state.scope,
    ledgerId: state.ledgerId,
    basis: state.basis,
    workItemId: original.workItemId,
    stepId: original.stepId,
    stepCode: original.stepCode,
  });
}

/** Snapshots all submitted values, verifies complete retained histories and actual outcome/state bytes, then invokes one trusted atomic stage. */
export async function stageWriteRequest(
  runs: WriteReads & Pick<RunStore, 'stageWrite'>,
  artifacts: ArtifactStore,
  guard: ScopedAttemptGuard,
  input: {
    readonly commandId: ExecutionCommandId;
    readonly completion: WriteCompletion;
    readonly canonicalRequest: string;
    readonly stateEvidence: ArtifactRef;
  },
): Promise<StoreReply<WriteStageAck>> {
  // Proof: T2 wrapper-stage-snapshot-guard/command independently aliased these values; caller mutation across the actual evidence await failed the snapshot contract. Exact restorations passed.
  const capturedGuard = decodeScopedAttemptGuard(guard);
  const captured = structuredClone(parseOrThrow(stageInput, input));
  const completion = decodeWriteCompletion(captured.completion);
  const history = await readExecutionHistory(
    runs,
    artifacts,
    capturedGuard.runId,
    capturedGuard.attemptId,
  );
  await readRuntimeHistory(runs, artifacts, capturedGuard.scope);
  // Proof: T2 wrapper-output-verification removed this dependency; actual absent and unreadable independent output reached publication. Exact restoration passed.
  await verifyArtifacts(artifacts, [
    ...completion.outcome.artifacts,
    completion.quiescence.evidence,
  ]);
  const observation = await readWriteObservation(
    artifacts,
    history,
    captured.stateEvidence,
    captured.canonicalRequest,
  );
  return await runs.stageWrite(capturedGuard, {
    version: 1,
    kind: 'stage_write',
    commandId: captured.commandId,
    completion,
    canonicalRequest: captured.canonicalRequest,
    observation,
  });
}

/** Derives only the local projection from complete verified original receipt bytes; no receipt is recanonicalized or authenticated by matching. */
export async function acceptWriteReceipt(
  runs: Pick<RunStore, 'recordWriteAcceptance'>,
  artifacts: ArtifactStore,
  guard: ScopedAttemptGuard,
  input: {
    readonly commandId: ExecutionCommandId;
    readonly stageCommandId: ExecutionCommandId;
    readonly intent: RuntimeIntent;
    readonly evidence: ArtifactRef;
  },
): Promise<StoreReply<WriteAcceptAck>> {
  // Proof: T2 wrapper-accept-snapshot-guard/command independently aliased these values; caller mutation across the actual receipt await failed the snapshot contract. Exact restorations passed.
  const capturedGuard = decodeScopedAttemptGuard(guard);
  const captured = structuredClone(parseOrThrow(acceptanceInput, input));
  // Proof: T2 wrapper-memory/sqlite-receipt-verifier replaced this verifier with raw JSON; both actual providers accepted wrong-command receipt bytes. Exact restorations passed.
  const receipt = await verifyRuntimeReceipt(artifacts, captured.intent, captured.evidence);
  if (receipt.acceptance.kind !== 'write') throw new Error('write receipt kind differs');
  // Proof: P02 reverting only ordinary selection rejected an actual client-accepted additive entry in both providers. Compatibility proof; exact restoration passed.
  const projection = projectWriteReceipt({
    actorId: receipt.actorId,
    acceptance: receipt.acceptance,
  });
  return await runs.recordWriteAcceptance(capturedGuard, {
    version: 1,
    kind: 'accept_write',
    ...captured,
    projection,
  });
}

/** Rechecks every write stage state/outcome artifact and every original acceptance projection after the provider's complete provenance audit. */
export async function verifyWriteHistory(
  artifacts: ArtifactStore,
  history: ExecutionHistory,
): Promise<void> {
  switch (history.version) {
    case 1:
    case 2:
      return;
    case 3:
      break;
    default:
      throw new Error('unsupported execution history version');
  }
  for (const entry of history.writes) {
    if (entry.kind === 'stage_write') {
      // Proof: T2 history-output-verification omitted this dependency; pending and terminal readers accepted independently unreadable outcome and quiescence bytes. Exact restoration passed.
      await verifyArtifacts(artifacts, [
        ...entry.command.completion.outcome.artifacts,
        entry.command.completion.quiescence.evidence,
      ]);
      const observation = await readWriteObservation(
        artifacts,
        history,
        entry.command.observation.evidence,
        entry.command.canonicalRequest,
      );
      if (!equalRecords(observation, entry.command.observation))
        throw new Error('historical write observation differs from artifact');
    } else {
      const receipt = await verifyRuntimeReceipt(
        artifacts,
        entry.command.intent,
        entry.command.evidence,
      );
      if (
        // Proof: receipt-history-projection broke “coherent retained write projection remains bound to original receipt bytes”; exact source hash restored.
        receipt.acceptance.kind !== 'write' ||
        // Proof: P03 comparing raw additive entries rejected independently stored correct projections in both providers. Compatibility proof; exact restoration passed.
        !equalRecords(
          entry.command.projection,
          projectWriteReceipt({ actorId: receipt.actorId, acceptance: receipt.acceptance }),
        )
      )
        throw new Error('historical write projection differs from artifact');
    }
  }
}
