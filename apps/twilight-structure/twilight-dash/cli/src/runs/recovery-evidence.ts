import { parseOrThrow, type } from '@shared/validation';
import {
  acquireRuntimeAuthority,
  type AuthorityReceipt,
  type ClaimReceipt,
  lookupRuntimeReceipt,
  readRuntimeState,
  type RuntimeState,
  validateSchema,
} from '@wbs/contracts';

import { verifyArtifactContent } from './artifact-integrity';
import type { ArtifactStore } from './artifact-store';
import { decodeClaimAcceptCommand } from './execution-codecs';
import type { ClaimAcceptCommand } from './execution-records';
import { decodeArtifactRef } from './record-codecs';
import type { ArtifactRef } from './records';
import { decodeRecoveryExchange } from './recovery-codecs';
import type {
  ClaimRecoveryTarget,
  RecoveryExchange,
  RecoveryExchangeValue,
  RecoveryGenerationConflict,
  RecoveryIntent,
  RecoveryReceiptAbsent,
} from './recovery-records';
import {
  digestRuntimeRequest,
  equalRuntimeScopes,
  intentCodec,
  readRuntimeRequest,
} from './runtime-codecs';
import { verifyRuntimeReceipt } from './runtime-receipt';
import type { RuntimeIntent } from './runtime-records';

export type RecoveryEvidenceSubject =
  | { readonly kind: 'state' }
  | { readonly kind: 'authority'; readonly intent: RuntimeIntent }
  | { readonly kind: 'claim'; readonly intent: RuntimeIntent }
  | { readonly kind: 'absent' }
  | { readonly kind: 'generation_conflict' };
export type VerifiedRecoveryExchange =
  | { readonly kind: 'state'; readonly exchange: RecoveryExchangeValue<RuntimeState> }
  | { readonly kind: 'authority'; readonly exchange: RecoveryExchangeValue<AuthorityReceipt> }
  | { readonly kind: 'claim'; readonly exchange: RecoveryExchangeValue<ClaimReceipt> }
  | { readonly kind: 'absent'; readonly exchange: RecoveryExchangeValue<RecoveryReceiptAbsent> }
  | {
      readonly kind: 'generation_conflict';
      readonly exchange: RecoveryExchangeValue<RecoveryGenerationConflict>;
    };
const subjectCodec = type({ kind: "'state' | 'absent' | 'generation_conflict'" })
  .or({ kind: "'authority' | 'claim'", intent: intentCodec })
  .onDeepUndeclaredKey('reject');

/** Reads each retained JSON artifact independently; dependency failures propagate without inventing evidence. */
async function readJson(artifacts: ArtifactStore, reference: ArtifactRef): Promise<unknown> {
  // Proof: E3 removed this check; both envelope/body media negatives lost rejection.
  if (reference.mediaType !== 'application/json')
    throw new Error('recovery evidence requires application/json');
  const content = new Uint8Array(await artifacts.readArtifact(reference));
  // Proof: E4/E22 bypassed only this dependency; digest/length and same-reference state substitution lost rejection.
  verifyArtifactContent(content, reference);
  // Proof: E5R disabled fatal decoding; both embedded UTF8 negatives lost rejection with otherwise parseable JSON.
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(content));
}

/** Checks capture purpose only. Journal identity and committed chronology require the later locked planner. */
function verifyPurpose(exchange: RecoveryExchange, subject: RecoveryEvidenceSubject): void {
  const { request, context, status } = exchange;
  const isLookup = request.kind === 'lookup';
  const isFence = context.kind === 'fence_reply';
  const isOriginal = context.kind === 'original_lookup';
  const isSupersession = context.kind === 'supersession_lookup';
  const matches =
    subject.kind === 'state'
      ? status === 200 &&
        request.kind === 'state' &&
        (context.kind === 'initial_state' || context.kind === 'supersession_state')
      : subject.kind === 'absent'
        ? status === 404 && isLookup && (isOriginal || isSupersession)
        : subject.kind === 'generation_conflict'
          ? status === 409 && request.kind === 'authority' && isFence
          : subject.kind === 'claim'
            ? status === 200 && isLookup && isOriginal
            : status === 200 &&
              ((request.kind === 'authority' && isFence) ||
                (isLookup && (isFence || isOriginal || isSupersession)));
  // Proof: E6 removed this check; wrong state status/request/context and refusal purposes were accepted.
  if (!matches) throw new Error('recovery evidence purpose differs');
  if (request.kind === 'authority') {
    const { scope, operation } = readRuntimeRequest(request.canonicalRequest);
    // Proof: E16 removed this correspondence; the conflict capture test lost rejection on its scope mismatch.
    if (
      !('kind' in operation) ||
      !equalRuntimeScopes(scope, exchange.scope) ||
      operation.expectedLedgerId !== exchange.ledgerId ||
      context.kind !== 'fence_reply' ||
      context.requestDigest !== digestRuntimeRequest(request.canonicalRequest)
    )
      throw new Error('recovery authority capture differs');
  }
  if (subject.kind === 'authority' || subject.kind === 'claim') {
    const { scope, operation } = readRuntimeRequest(subject.intent.canonicalRequest);
    // Proof: E15 removed this check; five lookup scope/ledger/command/fence correspondence negatives lost rejection.
    if (
      !equalRuntimeScopes(scope, exchange.scope) ||
      operation.expectedLedgerId !== exchange.ledgerId ||
      (isLookup && request.commandId !== subject.intent.commandId) ||
      (request.kind === 'authority' &&
        request.canonicalRequest !== subject.intent.canonicalRequest) ||
      (isFence &&
        (context.requestDigest !== subject.intent.requestDigest ||
          context.stagedRevision !== subject.intent.stagedRevision))
    )
      throw new Error('recovery receipt capture differs');
  }
}

/** Verifies actual envelope and body bytes through public schemas. Typed pairs establish neither transport authenticity nor journal association. */
export async function readRecoveryExchange(
  artifacts: ArtifactStore,
  envelope: ArtifactRef,
  subject: RecoveryEvidenceSubject,
): Promise<VerifiedRecoveryExchange> {
  // Proof: E1 removed the clone and the pre-IO snapshot test failed; E18 bypassed reference decoding and version2 was accepted.
  const reference = structuredClone(decodeArtifactRef(envelope));
  // Proof: E2 removed the clone and the snapshot test failed; E17 bypassed subject decoding and an extra field was accepted.
  const snapshot: RecoveryEvidenceSubject = structuredClone(parseOrThrow(subjectCodec, subject));
  // Proof: E19 bypassed this decoder; the actual retained version2 envelope lost rejection.
  const captured = decodeRecoveryExchange(await readJson(artifacts, reference));
  verifyPurpose(captured, snapshot);
  const wire = await readJson(artifacts, captured.body);
  const pair = <T>(value: T): RecoveryExchangeValue<T> => ({
    envelope: { artifact: reference, value: captured },
    body: { artifact: captured.body, value: structuredClone(value) },
  });
  if (snapshot.kind === 'state') {
    // Proof: E7 bypassed this public-schema dependency; an otherwise complete version2 state was accepted.
    const checked = await validateSchema(readRuntimeState.responses[0].schema, wire);
    if (checked.issues !== undefined) throw new Error('recovery state schema differs');
    // Proof: E8 removed correspondence; state scope and ledger negatives lost rejection.
    if (
      !equalRuntimeScopes(checked.value.scope, captured.scope) ||
      checked.value.ledgerId !== captured.ledgerId
    )
      throw new Error('recovery state capture differs');
    return { kind: 'state', exchange: pair(checked.value) };
  }
  if (snapshot.kind === 'absent' || snapshot.kind === 'generation_conflict') {
    const responses =
      snapshot.kind === 'absent' ? lookupRuntimeReceipt.refusals : acquireRuntimeAuthority.refusals;
    const response = responses.findLast((candidate) => candidate.status === captured.status);
    // Proof: E20 made the new schema selection absent; both valid refusal readers threw this diagnostic. Diagnostic-only dependency proof.
    if (response === undefined) throw new Error('recovery response schema missing');
    // Proof: E21 injected schema issues at this new call; both valid refusal readers failed closed. Dependency proof, not an independent publication guard.
    const checked = await validateSchema<{ readonly error: string }>(response.schema, wire);
    if (checked.issues !== undefined) throw new Error('recovery refusal schema differs');
    // Proof: E13/E14 bypassed these subject comparisons; unknown_person/runtime_authority_stale were accepted as recovery evidence.
    if (snapshot.kind === 'absent' && checked.value.error === 'runtime_receipt_not_found')
      return { kind: 'absent', exchange: pair({ error: 'runtime_receipt_not_found' }) };
    if (
      snapshot.kind === 'generation_conflict' &&
      checked.value.error === 'runtime_generation_conflict'
    )
      return {
        kind: 'generation_conflict',
        exchange: pair({ error: 'runtime_generation_conflict' }),
      };
    throw new Error('recovery refusal subject differs');
  }
  // Proof: E9 bypassed this new verifier call; receipt bytes for another canonical command lost rejection.
  const receipt = await verifyRuntimeReceipt(artifacts, snapshot.intent, captured.body);
  if (snapshot.kind === 'authority') {
    // Proof: E10 bypassed this public-schema call; the claim-as-authority subject swap was accepted.
    const checked = await validateSchema(acquireRuntimeAuthority.responses[0].schema, receipt);
    if (checked.issues !== undefined) throw new Error('recovery authority schema differs');
    return { kind: 'authority', exchange: pair(checked.value) };
  }
  // Proof: E11 removed this check; the authority-as-claim subject swap was accepted.
  if (receipt.acceptance.kind !== 'claim') throw new Error('recovery claim subject differs');
  return { kind: 'claim', exchange: pair({ ...receipt, acceptance: receipt.acceptance }) };
}

/** Derives the existing complete claim command from verified receipt fields and retained local acceptance identity. The caller owns verification and journal association. */
export function deriveRecoveryClaimCommand(
  intent: RecoveryIntent<ClaimRecoveryTarget>,
  lookup: RecoveryExchangeValue<ClaimReceipt>,
): ClaimAcceptCommand {
  const receipt = lookup.body.value;
  // Proof: E12 bypassed this existing projection boundary; an empty generated claimId returned a command.
  return decodeClaimAcceptCommand({
    version: 2,
    kind: 'accept_claim',
    commandId: intent.target.acceptanceCommandId,
    intent: intent.target.original,
    evidence: lookup.body.artifact,
    projection: {
      version: 1,
      claimId: receipt.acceptance.claim.claimId,
      actorId: receipt.actorId,
      basisAfter: receipt.acceptance.basisAfter,
    },
  });
}
