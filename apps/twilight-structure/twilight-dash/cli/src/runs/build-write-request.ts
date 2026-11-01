import { parseOrThrow, type } from '@shared/validation';
import { canonicalRuntimeRequest, type RuntimePlanCommand } from '@wbs/contracts';

import type { ArtifactStore } from './artifact-store';
import { readExecutionHistory } from './claim-history';
import { decodeScopedAttemptGuard } from './execution-codecs';
import { latestAuthority } from './plan-claims';
import { executionCheckpoint, isExecuting } from './plan-execution';
import { equalRecords } from './record-codecs';
import type { ArtifactRef } from './records';
import type { RunStore, ScopedAttemptGuard, StoreRefusal } from './run-store';
import { equalRuntimeScopes, readRuntimeRequest } from './runtime-codecs';
import { readRuntimeHistory } from './runtime-history';
import { readRuntimeStateArtifact } from './runtime-state';
import { ArtifactRefCodec } from './value-codecs';
import { readWriteObservation } from './write-history';

export type WriteRequestReply =
  | {
      readonly kind: 'built';
      readonly request: { readonly canonicalRequest: string; readonly stateEvidence: ArtifactRef };
    }
  | { readonly kind: 'refused'; readonly reason: StoreRefusal };
const inputCodec = type({
  commandId: 'string>=1',
  commands: 'unknown[]',
  stateEvidence: ArtifactRefCodec,
}).onUndeclaredKey('reject');
/** Constructs exact initial conditional write bytes using independently submitted cuts and actual fresh live state. No retention, renewal or dispatch occurs. Exact retries reuse retained bytes rather than building a replacement. */
export async function buildWriteRequest(
  runs: Pick<RunStore, 'readExecutionHistory' | 'readManifest' | 'readRuntimeScope'>,
  artifacts: ArtifactStore,
  guard: ScopedAttemptGuard,
  input: {
    readonly commandId: string;
    readonly commands: readonly RuntimePlanCommand[];
    readonly stateEvidence: ArtifactRef;
  },
): Promise<WriteRequestReply> {
  // Proof: boundary-builder-guard broke “write builder rejects malformed guard before history IO”; exact source hash restored.
  const capturedGuard = decodeScopedAttemptGuard(guard);
  // Proof: boundary-builder-input broke “write builder rejects malformed input before history IO”; exact source hash restored.
  const captured = structuredClone(parseOrThrow(inputCodec, input));
  const history = await readExecutionHistory(
    runs,
    artifacts,
    capturedGuard.runId,
    capturedGuard.attemptId,
  );
  // Proof: boundary-builder-state broke “write builder refuses actual already_staged association without publication”; exact source hash restored.
  if (history.attempt.version !== 2 || !isExecuting(history.attempt.state))
    return { kind: 'refused', reason: 'state_conflict' };
  const checkpoint = executionCheckpoint(history.attempt);
  if (checkpoint.kind !== 'turn_pending' && checkpoint.kind !== 'turn_returned')
    return { kind: 'refused', reason: 'state_conflict' };
  if (
    // Proof: builder-submitted-run broke “write builder preserves independently submitted stale run cut without mutation”; exact source hash restored.
    history.run.revision !== capturedGuard.expectedRevision ||
    history.attempt.revision !== capturedGuard.expectedAttemptRevision
  )
    return { kind: 'refused', reason: 'revision_conflict' };
  const scope = await readRuntimeHistory(runs, artifacts, capturedGuard.scope);
  if (scope.kind !== 'pinned') return { kind: 'refused', reason: 'authority_conflict' };
  // Proof: builder-submitted-scope broke “write builder preserves independently submitted stale scope cut without mutation”; exact source hash restored.
  if (scope.revision !== capturedGuard.expectedScopeRevision)
    return { kind: 'refused', reason: 'revision_conflict' };
  const acquisition = latestAuthority(scope);
  const original = checkpoint.execution.session.preparation.target.observation;
  if (
    // Proof: builder-owner broke “write builder refuses actual owner association without publication”; exact source hash restored.
    !equalRuntimeScopes(capturedGuard.scope, original.scope) ||
    capturedGuard.scope.organizationId !== capturedGuard.ownership.organizationId ||
    !equalRuntimeScopes(scope.pin.scope, capturedGuard.scope) ||
    scope.pin.ledgerId !== original.ledgerId ||
    acquisition === null ||
    !equalRecords(acquisition.intent.localOwner, {
      ownerId: capturedGuard.ownership.ownerId,
      epoch: capturedGuard.ownership.epoch,
    })
  )
    return { kind: 'refused', reason: 'authority_conflict' };
  const state = await readRuntimeStateArtifact(artifacts, captured.stateEvidence);
  const claim = readRuntimeRequest(checkpoint.execution.binding.intent.canonicalRequest).operation;
  if ('kind' in claim || claim.action.kind !== 'claim')
    throw new Error('write builder retained claim differs');
  const { kind: _kind, ...target } = claim.action;
  const canonicalRequest = canonicalRuntimeRequest(capturedGuard.scope, {
    schemaVersion: 1,
    commandId: captured.commandId,
    expectedLedgerId: scope.pin.ledgerId,
    authority: acquisition.authority,
    expectedBasis: state.basis,
    action: {
      kind: 'write',
      claim: { claimId: checkpoint.execution.binding.projection.claimId, ...target },
      commands: captured.commands,
    },
  });
  const request = readRuntimeRequest(canonicalRequest).operation;
  if ('kind' in request || request.action.kind !== 'write')
    throw new Error('write builder encoder returned another operation');
  if (
    // Proof: builder-batch broke “write builder refuses actual work association without publication”; exact source hash restored.
    request.action.commands.some(
      (command, index, commands) =>
        command.workItemId !== original.workItemId ||
        ('stepId' in command && command.stepId !== original.stepId) ||
        (command.kind === 'releaseWorkItem' &&
          (index !== commands.length - 1 ||
            command.personId !== capturedGuard.scope.personId ||
            !equalRecords(command.steps, [original.stepId]))),
    )
  )
    return { kind: 'refused', reason: 'authority_conflict' };
  // Proof: builder-actual-observation broke “write builder refuses actual state_claim association without publication”; exact source hash restored.
  await readWriteObservation(artifacts, history, captured.stateEvidence, canonicalRequest);
  return { kind: 'built', request: { canonicalRequest, stateEvidence: captured.stateEvidence } };
}
