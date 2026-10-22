import { parseOrThrow, type } from '@shared/validation';
import { canonicalJson, digestWithout, verifyDigest } from '@twilight-burokrat/contracts';

import {
  ActivityIdentityCodec,
  AgentRunIdCodec,
  artifactDigest,
  ArtifactDigestCodec,
  ArtifactRefCodec,
  AttemptIdCodec,
  ClaimIdCodec,
  CommandIdCodec,
  CorrelationKeyCodec,
  DecisionIdCodec,
  ExecutionCommandIdCodec,
  Integer,
  LocatorCodec,
  manifestDigest,
  ManifestDigestCodec,
  OccurrenceIdCodec,
  OperationKeyCodec,
  OwnershipCodec,
  PersonIdCodec,
  Positive,
  ProjectIdCodec,
  RunIdCodec,
  WorkItemIdCodec,
} from './value-codecs';

export {
  ActivityIdentityCodec,
  addInteger,
  AgentRunIdCodec,
  artifactDigest,
  ArtifactDigestCodec,
  ArtifactRefCodec,
  assertInteger,
  attemptId,
  AttemptIdCodec,
  ClaimIdCodec,
  CommandIdCodec,
  CorrelationKeyCodec,
  decisionId,
  DecisionIdCodec,
  decodeArtifactRef,
  decodeOwnership,
  executionCommandId,
  ExecutionCommandIdCodec,
  Integer,
  LocatorCodec,
  manifestDigest,
  ManifestDigestCodec,
  occurrenceId,
  OccurrenceIdCodec,
  operationKey,
  OperationKeyCodec,
  organizationId,
  OrganizationIdCodec,
  ownerId,
  OwnerIdCodec,
  OwnershipCodec,
  OwnershipStatusCodec,
  PersonIdCodec,
  Positive,
  projectId,
  ProjectIdCodec,
  runId,
  RunIdCodec,
  storeId,
  StoreIdCodec,
  workItemId,
  WorkItemIdCodec,
} from './value-codecs';

export const ManifestCodec = type({
  version: '1',
  digest: ManifestDigestCodec,
  bindingVersion: Positive,
  canonicalBinding: 'string>=1',
  prompts: ArtifactRefCodec.array(),
  toolPolicies: ArtifactRefCodec.array(),
  executorVersions: { '[string]': 'string>=1' },
  credentialReferences: 'string[]',
}).onUndeclaredKey('reject');
// Proof: allowing undeclared fields made the portable-codec test accept an unknown persisted run field.
export const RunCodec = type({
  version: '1',
  runId: RunIdCodec,
  revision: Integer,
  projectId: ProjectIdCodec,
  workItemId: WorkItemIdCodec,
  manifestDigest: ManifestDigestCodec,
  maxAttempts: Positive,
}).onUndeclaredKey('reject');
export const ClaimAuthorityCodec = type({
  version: '1',
  claimId: ClaimIdCodec,
  personId: PersonIdCodec,
  agentRunId: AgentRunIdCodec,
  runId: RunIdCodec,
  attemptId: AttemptIdCodec,
  projectId: ProjectIdCodec,
  workItemId: WorkItemIdCodec,
  occurrenceId: OccurrenceIdCodec,
}).onUndeclaredKey('reject');
export const AdmissionCodec = type({
  attemptId: AttemptIdCodec,
  identity: ActivityIdentityCodec,
  ordinal: Positive,
}).onUndeclaredKey('reject');
export const QuiescenceCodec = type({
  version: '1',
  operationKey: OperationKeyCodec,
  observedAt: Integer,
  evidence: ArtifactRefCodec,
  effect: "'absent' | 'succeeded' | 'failed' | 'unknown'",
}).onUndeclaredKey('reject');
export const HumanWaitCodec = type({
  version: '1',
  correlationKey: CorrelationKeyCodec,
  prompt: ArtifactRefCodec,
  // Proof: bypassing wait choice nonempty enforcement failed 'memory execution > waiting requires exact claim unique choices and determinate quiescence'.
  choices: type('string>=1').array().atLeastLength(1),
})
  .onUndeclaredKey('reject')
  .narrow(
    (wait, context) =>
      // Proof: bypassing wait choice unique enforcement failed 'memory execution > waiting requires exact claim unique choices and determinate quiescence'.
      new Set(wait.choices).size === wait.choices.length || context.mustBe('unique wait choices'),
  );
export const AttemptOutcomeCodec = type({
  version: '1',
  kind: "'succeeded' | 'failed' | 'cancelled'",
  artifacts: ArtifactRefCodec.array(),
  summary: 'string',
}).onUndeclaredKey('reject');
export const ProgressIntentCodec = type({
  version: '1',
  commandId: CommandIdCodec,
  authority: ClaimAuthorityCodec,
  expectedWbsRevision: 'string>=1',
  outcome: AttemptOutcomeCodec,
  commandDigest: ArtifactDigestCodec,
}).onUndeclaredKey('reject');
export const CommandReceiptCodec = type({
  version: '1',
  commandId: CommandIdCodec,
  commandDigest: ArtifactDigestCodec,
  authority: ClaimAuthorityCodec,
  acceptedWbsRevision: 'string>=1',
  evidence: ArtifactRefCodec,
}).onUndeclaredKey('reject');
export const DecisionCodec = type({
  version: '1',
  decisionId: DecisionIdCodec,
  attemptId: AttemptIdCodec,
  correlationKey: CorrelationKeyCodec,
  choice: 'string>=1',
  actorId: PersonIdCodec,
  authorizationEvidence: ArtifactRefCodec,
}).onUndeclaredKey('reject');
export const AttemptStateCodec = type({ kind: "'queued'", claim: ClaimAuthorityCodec.or('null') })
  .onUndeclaredKey('reject')
  .or(
    type({ kind: "'running'", claim: ClaimAuthorityCodec, locator: LocatorCodec }).onUndeclaredKey(
      'reject',
    ),
  )
  .or(
    type({
      kind: "'reconciling'",
      claim: ClaimAuthorityCodec.or('null'),
      locator: LocatorCodec.or('null'),
      reason: 'string>=1',
    }).onUndeclaredKey('reject'),
  )
  .or(
    type({
      kind: "'unresolved'",
      claim: ClaimAuthorityCodec.or('null'),
      locator: LocatorCodec.or('null'),
      reason: 'string>=1',
      evidence: ArtifactRefCodec,
    }).onUndeclaredKey('reject'),
  )
  .or(
    type({
      kind: "'interrupted'",
      claim: ClaimAuthorityCodec.or('null'),
      quiescence: QuiescenceCodec,
    }).onUndeclaredKey('reject'),
  )
  .or(
    type({
      kind: "'waiting_for_person'",
      claim: ClaimAuthorityCodec,
      wait: HumanWaitCodec,
      quiescence: QuiescenceCodec,
    }).onUndeclaredKey('reject'),
  )
  .or(
    type({
      kind: "'outcome_pending_progress'",
      claim: ClaimAuthorityCodec,
      outcome: AttemptOutcomeCodec,
      commandId: CommandIdCodec,
      quiescence: QuiescenceCodec,
    }).onUndeclaredKey('reject'),
  )
  .or(
    type({
      kind: "'terminal'",
      claim: ClaimAuthorityCodec,
      outcome: AttemptOutcomeCodec,
      receipt: CommandReceiptCodec,
      quiescence: QuiescenceCodec,
    }).onUndeclaredKey('reject'),
  );
export const ExecutionFactCodec = type({ kind: "'claim_acquired'", claim: ClaimAuthorityCodec })
  .onUndeclaredKey('reject')
  .or(
    type({
      kind: "'launch_recorded'",
      claim: ClaimAuthorityCodec,
      locator: LocatorCodec,
    }).onUndeclaredKey('reject'),
  )
  .or(type({ kind: "'recovery_required'", reason: 'string>=1' }).onUndeclaredKey('reject'))
  .or(
    type({ kind: "'unresolved'", reason: 'string>=1', evidence: ArtifactRefCodec }).onUndeclaredKey(
      'reject',
    ),
  )
  .or(type({ kind: "'interrupted'", quiescence: QuiescenceCodec }).onUndeclaredKey('reject'))
  .or(
    type({
      kind: "'waiting'",
      claim: ClaimAuthorityCodec,
      wait: HumanWaitCodec,
      quiescence: QuiescenceCodec,
    }).onUndeclaredKey('reject'),
  );
export const CompletionCodec = type({
  outcome: AttemptOutcomeCodec,
  intent: ProgressIntentCodec,
  quiescence: QuiescenceCodec,
}).onUndeclaredKey('reject');

// Proof: allowing arbitrary attempt state kinds failed the portable-codec test on an unknown state with an otherwise valid claim payload.
export const AttemptCodec = type({
  version: '1',
  attemptId: AttemptIdCodec,
  identity: ActivityIdentityCodec,
  ordinal: Positive,
  revision: Integer,
  admittedEpoch: Positive,
  state: AttemptStateCodec,
  holdsCapacity: 'boolean',
}).onUndeclaredKey('reject');
export const RunGuardCodec = type({
  ownership: OwnershipCodec,
  runId: RunIdCodec,
  expectedRevision: Integer,
}).onUndeclaredKey('reject');

export const decodeRun = (value: unknown) => parseOrThrow(RunCodec, value);
export const decodeAdmission = (value: unknown) => parseOrThrow(AdmissionCodec, value);
/** Validates portable attempt state as well as capacity/effect invariants, including valid-shaped persisted corruption. */
export function decodeAttempt(value: unknown) {
  const attempt = parseOrThrow(AttemptCodec, value);
  const state = attempt.state;
  const requiresCapacity =
    state.kind === 'queued' ||
    state.kind === 'running' ||
    state.kind === 'reconciling' ||
    state.kind === 'unresolved';
  // Proof: bypassing attempt capacity state enforcement failed 'open rejects queued recorded without held capacity even when reservation agrees'.
  if (attempt.holdsCapacity !== requiresCapacity) throw new Error('corrupt attempt state capacity');
  // Proof: bypassing attempt settled effect enforcement failed 'open rejects interrupted releasing capacity with unknown effect'.
  if ('quiescence' in state && state.quiescence.effect === 'unknown')
    throw new Error('corrupt unsettled attempt quiescence');
  // Proof: removing settled operation binding failed 'open rejects interrupted quiescence bound to another operation'.
  if ('quiescence' in state && state.quiescence.operationKey !== attempt.identity.operationKey)
    throw new Error('corrupt attempt quiescence operation');
  return attempt;
}
export const decodeRunGuard = (value: unknown) => parseOrThrow(RunGuardCodec, value);

/** Decodes manifest content and verifies its complete canonical identity; referenced bytes are verified by the later artifact boundary. */
export function decodeManifest(value: unknown) {
  const manifest = parseOrThrow(ManifestCodec, value);
  const binding: unknown = JSON.parse(manifest.canonicalBinding);
  // Proof: bypassing canonicalization failed `manifest hash and canonical binding integrity refuse before persistence` on noncanonical JSON carrying a recomputed matching digest.
  if (canonicalJson(binding) !== manifest.canonicalBinding)
    throw new Error('manifest binding is not canonical JSON');
  // Proof: removing digest verification failed that manifest integrity test on changed content and on an incorrect digest.
  verifyDigest(manifest, 'digest');
  return manifest;
}

/** Computes the identity of a complete manifest payload, excluding only its digest. */
export function digestManifest(value: unknown) {
  const manifest = parseOrThrow(ManifestCodec, value);
  return manifestDigest(digestWithout(manifest, 'digest'));
}

/** Compares portable JSON values independent of object property insertion order. */
export function equalRecords(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

export const AttemptGuardCodec = type({
  ownership: OwnershipCodec,
  runId: RunIdCodec,
  expectedRevision: Integer,
  attemptId: AttemptIdCodec,
  expectedAttemptRevision: Integer,
}).onUndeclaredKey('reject');
export const decodeAttemptGuard = (value: unknown) => parseOrThrow(AttemptGuardCodec, value);
export const decodeExecutionFact = (value: unknown) => parseOrThrow(ExecutionFactCodec, value);
export const decodeClaimAuthority = (value: unknown) => parseOrThrow(ClaimAuthorityCodec, value);
/** Validates complete immutable command identity, including its canonical record digest. */
export function decodeProgressIntent(value: unknown) {
  const intent = parseOrThrow(ProgressIntentCodec, value);
  // Proof: bypassing intent digest enforcement failed 'memory outcomes > completion refuses stale revisions wrong authority outcome mismatch and unsettled effects without mutations'.
  verifyDigest(intent, 'commandDigest');
  return intent;
}
/** Computes command identity without its self-referential digest. */
export function digestIntent(value: unknown) {
  return artifactDigest(digestWithout(parseOrThrow(ProgressIntentCodec, value), 'commandDigest'));
}
/** Validates the full completion before artifact verification or persistence. */
export function decodeCompletion(value: unknown) {
  const completion = parseOrThrow(CompletionCodec, value);
  decodeProgressIntent(completion.intent);
  return completion;
}

export const ExecutionCommandCodec = type({
  commandId: ExecutionCommandIdCodec,
  fact: ExecutionFactCodec,
}).onUndeclaredKey('reject');
export const decodeExecutionCommand = (value: unknown) =>
  parseOrThrow(ExecutionCommandCodec, value);

export const decodeDecision = (value: unknown) => parseOrThrow(DecisionCodec, value);
export const decodeReceipt = (value: unknown) => parseOrThrow(CommandReceiptCodec, value);
