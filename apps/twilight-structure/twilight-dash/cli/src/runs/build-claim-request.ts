import { parseOrThrow, type } from '@shared/validation';
import { canonicalRuntimeRequest } from '@wbs/contracts';

import type { ArtifactStore } from './artifact-store';
import { readExecutionHistory } from './claim-history';
import { decodeScopedAttemptGuard } from './execution-codecs';
import { equalRecords } from './record-codecs';
import { readTargetObservation } from './record-preparation';
import type { ArtifactRef } from './records';
import type { RunStore, ScopedAttemptGuard, StoreRefusal } from './run-store';
import { equalRuntimeScopes } from './runtime-codecs';
import { readRuntimeHistory } from './runtime-history';
import { ArtifactRefCodec } from './value-codecs';

export interface BuiltClaimRequest {
  readonly canonicalRequest: string;
  readonly stateEvidence: ArtifactRef;
}
export type ClaimRequestReply =
  | { readonly kind: 'built'; readonly request: BuiltClaimRequest }
  | { readonly kind: 'refused'; readonly reason: StoreRefusal };

// Proof: C05 removed only strict unknown-field rejection; 'rejects malformed submitted extra input before reads' failed. Exact restoration passed.
const inputCodec = type({
  commandId: 'string>=1',
  stateEvidence: ArtifactRefCodec,
}).onUndeclaredKey('reject');

/**
 * Constructs initial immutable claim bytes for a directly prepared session using independently
 * submitted local revisions and retained actual target evidence. Only basis/evidence may refresh.
 * The verified local grant is construction evidence, never live receiver admission or execution
 * permission. No writes, retention, renewal or network occur; retries reuse this exact output.
 * Missing, unreadable or corrupt trusted history/artifacts throw. Atomic staging and the receiver
 * remain responsible for authority changes after these reads.
 */
export async function buildClaimRequest(
  runs: Pick<RunStore, 'readExecutionHistory' | 'readManifest' | 'readRuntimeScope'>,
  artifacts: ArtifactStore,
  guard: ScopedAttemptGuard,
  input: { readonly commandId: string; readonly stateEvidence: ArtifactRef },
): Promise<ClaimRequestReply> {
  // Proof: C01 bypassed this decoder and malformed guard reached a history read; C02 validated then aliased it and the held-history snapshot test refused after caller edits. Exact restoration passed.
  const snapshotGuard = decodeScopedAttemptGuard(guard);
  // Proof: C03 skipped parsing and malformed command/evidence reached history; C04 removed detachment and both held-read snapshot tests failed. Exact restoration passed.
  const snapshot = structuredClone(parseOrThrow(inputCodec, input));
  // Proof: C06 replaced this verified read with raw provider history; 'consumes verified execution history artifacts' lost its expected rejection. Existing verifier stayed unchanged; exact restoration passed.
  const history = await readExecutionHistory(
    runs,
    artifacts,
    snapshotGuard.runId,
    snapshotGuard.attemptId,
  );
  const state = history.attempt.state;
  // Proof: C08 unwrapped reconciling-prepared here; 'refuses direct non-prepared checkpoint reconciling' built instead of refusing. Exact restoration passed.
  if (state.kind !== 'prepared') return { kind: 'refused', reason: 'state_conflict' };
  // Proof: C09/C10 separately removed run/attempt revision comparisons; each stale independently submitted revision test built instead of refusing. Exact restoration passed.
  if (
    history.run.revision !== snapshotGuard.expectedRevision ||
    history.attempt.revision !== snapshotGuard.expectedAttemptRevision
  )
    return { kind: 'refused', reason: 'revision_conflict' };
  const original = state.session.preparation.target.observation;
  // Proof: C11 omitted prepared scope correspondence with a real alternate pinned grant; C12 omitted ownership organization correspondence. Their named scope/organization tests built instead of refusing; exact restoration passed.
  if (
    !equalRuntimeScopes(snapshotGuard.scope, original.scope) ||
    snapshotGuard.scope.organizationId !== snapshotGuard.ownership.organizationId
  )
    return { kind: 'refused', reason: 'authority_conflict' };
  // Proof: C07 used raw scope inspection here; 'consumes verified runtime history artifacts' lost its expected rejection. Existing verifier stayed unchanged; exact restoration passed.
  const scope = await readRuntimeHistory(runs, artifacts, snapshotGuard.scope);
  // Proof: C13 omitted this typed refusal; 'refuses retained authority unpinned conflict' got revision_conflict from the later check. Diagnostic proof only; exact restoration passed.
  if (scope.kind !== 'pinned') return { kind: 'refused', reason: 'authority_conflict' };
  // Proof: C14 omitted this comparison; stale independently submitted expectedScopeRevision built instead of refusing. Exact restoration passed.
  if (scope.revision !== snapshotGuard.expectedScopeRevision)
    return { kind: 'refused', reason: 'revision_conflict' };
  const owner = {
    ownerId: snapshotGuard.ownership.ownerId,
    epoch: snapshotGuard.ownership.epoch,
  };
  const grant = scope.grant;
  // Proof: C18 selected the first intent regardless of grant identity; retained grant provenance conflict built instead of refusing. Exact restoration passed.
  const acquisition = scope.intents.find((intent) => intent.commandId === grant?.commandId);
  // Proof: C15/C16/C17/C20 separately omitted pin scope/ledger, grant epoch and local-owner checks; their named authority negatives built. C19 omitted missing acquisition handling and replaced the typed refusal with TypeError (diagnostic only). Exact restoration passed.
  if (
    !equalRuntimeScopes(snapshotGuard.scope, scope.pin.scope) ||
    original.ledgerId !== scope.pin.ledgerId ||
    grant?.localEpoch !== owner.epoch ||
    acquisition === undefined ||
    !equalRecords(acquisition.localOwner, owner)
  )
    return { kind: 'refused', reason: 'authority_conflict' };
  // Proof: C21 substituted the original projection for this actual read; absent/unreadable/malformed/invalid-UTF8/schema refreshed-artifact tests lost expected rejection. Existing reader stayed unchanged; exact restoration passed.
  const observation = await readTargetObservation(artifacts, snapshot.stateEvidence, original);
  // Proof: C22 removed this correspondence; the actual refreshed different-ledger test built instead of refusing. The earlier pin comparison also binds this observed ledger to the pin; exact restoration passed.
  if (observation.ledgerId !== original.ledgerId)
    return { kind: 'refused', reason: 'authority_conflict' };
  return {
    kind: 'built',
    request: {
      // Proof: C23 substituted operation-only JSON and the existing parser rejected actual output. C24-C35 independently changed command/ledger/authority/basis/work/step/parent/store/run/attempt/session/evidence; complete-field, refreshed-basis/evidence or non-null-parent assertions failed. Exact restoration passed.
      canonicalRequest: canonicalRuntimeRequest(snapshotGuard.scope, {
        schemaVersion: 1,
        commandId: snapshot.commandId,
        expectedLedgerId: scope.pin.ledgerId,
        authority: grant.authority,
        expectedBasis: observation.basis,
        action: {
          kind: 'claim',
          workItemId: original.workItemId,
          stepId: original.stepId,
          parentClaimId: state.session.preparation.target.parentClaimId,
          execution: {
            storeId: snapshotGuard.ownership.storeId,
            runId: history.run.runId,
            attemptId: history.attempt.attemptId,
            sessionId: state.session.locator.session.sessionId,
          },
        },
      }),
      stateEvidence: snapshot.stateEvidence,
    },
  };
}
