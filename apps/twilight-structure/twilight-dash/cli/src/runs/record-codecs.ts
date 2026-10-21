import { parseOrThrow, type } from '@shared/validation';
import { canonicalJson, digestWithout, verifyDigest } from '@twilight-burokrat/contracts';

// Proof: permitting unbounded strings failed `portable codecs reject unknown versions kinds malformed IDs and unsafe integers`.
const Identifier = type('1 <= string <= 256');
// Proof: accepting arbitrary digest strings failed `manifest codecs reject invalid references and digest spellings`.
const Digest = type(/^[0-9a-f]{64}$/);
export const StoreIdCodec = Identifier.brand('StoreId');
export const OrganizationIdCodec = Identifier.brand('OrganizationId');
export const OwnerIdCodec = Identifier.brand('OwnerId');
export const RunIdCodec = Identifier.brand('RunId');
export const AttemptIdCodec = Identifier.brand('AttemptId');
export const ProjectIdCodec = Identifier.brand('ProjectId');
export const WorkItemIdCodec = Identifier.brand('WorkItemId');
export const OccurrenceIdCodec = Identifier.brand('OccurrenceId');
export const OperationKeyCodec = Identifier.brand('OperationKey');
export const ClaimIdCodec = Identifier.brand('ClaimId');
export const PersonIdCodec = Identifier.brand('PersonId');
export const AgentRunIdCodec = Identifier.brand('AgentRunId');
export const ManifestDigestCodec = Digest.brand('ManifestDigest');
export const ArtifactDigestCodec = Digest.brand('ArtifactDigest');
// Proof: loosening safe integer bounds or allowing zero ordinals independently failed the portable-codec test.
const Integer = type('number.integer >= 0').atMost(Number.MAX_SAFE_INTEGER);
const Positive = Integer.atLeast(1);
// Proof: allowing arbitrary portable versions failed the portable-codec test; the same v1 literal protects each record below.
export const OwnershipCodec = type({
  version: '1',
  storeId: StoreIdCodec,
  organizationId: OrganizationIdCodec,
  ownerId: OwnerIdCodec,
  epoch: Positive,
  expiresAt: Integer,
}).onUndeclaredKey('reject');
export const OwnershipStatusCodec = type({
  storeId: StoreIdCodec,
  organizationId: OrganizationIdCodec,
  epoch: Integer,
  owner: OwnershipCodec.or('null'),
}).onUndeclaredKey('reject');
export const ArtifactRefCodec = type({
  version: '1',
  digest: ArtifactDigestCodec,
  byteLength: Integer,
  mediaType: 'string>=1',
  retention: "'retain'",
}).onUndeclaredKey('reject');
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
export const ActivityIdentityCodec = type({
  version: '1',
  runId: RunIdCodec,
  occurrenceId: OccurrenceIdCodec,
  operationKey: OperationKeyCodec,
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
// Proof: allowing arbitrary attempt state kinds failed the portable-codec test on an unknown state with an otherwise valid claim payload.
export const AttemptCodec = type({
  version: '1',
  attemptId: AttemptIdCodec,
  identity: ActivityIdentityCodec,
  ordinal: Positive,
  revision: Integer,
  admittedEpoch: Positive,
  state: type({ kind: "'queued'", claim: ClaimAuthorityCodec.or('null') }).onUndeclaredKey(
    'reject',
  ),
  holdsCapacity: 'boolean',
}).onUndeclaredKey('reject');
export const RunGuardCodec = type({
  ownership: OwnershipCodec,
  runId: RunIdCodec,
  expectedRevision: Integer,
}).onUndeclaredKey('reject');

export const storeId = (value: unknown) => parseOrThrow(StoreIdCodec, value);
export const organizationId = (value: unknown) => parseOrThrow(OrganizationIdCodec, value);
export const ownerId = (value: unknown) => parseOrThrow(OwnerIdCodec, value);
export const runId = (value: unknown) => parseOrThrow(RunIdCodec, value);
export const attemptId = (value: unknown) => parseOrThrow(AttemptIdCodec, value);
export const projectId = (value: unknown) => parseOrThrow(ProjectIdCodec, value);
export const workItemId = (value: unknown) => parseOrThrow(WorkItemIdCodec, value);
export const occurrenceId = (value: unknown) => parseOrThrow(OccurrenceIdCodec, value);
export const operationKey = (value: unknown) => parseOrThrow(OperationKeyCodec, value);
export const manifestDigest = (value: unknown) => parseOrThrow(ManifestDigestCodec, value);
export const artifactDigest = (value: unknown) => parseOrThrow(ArtifactDigestCodec, value);
export const decodeOwnership = (value: unknown) => parseOrThrow(OwnershipCodec, value);
export const decodeRun = (value: unknown) => parseOrThrow(RunCodec, value);
export const decodeAdmission = (value: unknown) => parseOrThrow(AdmissionCodec, value);
export const decodeAttempt = (value: unknown) => parseOrThrow(AttemptCodec, value);
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

/** Rejects invalid trusted integer values and arithmetic overflow. */
export function assertInteger(value: number, minimum = 0): void {
  // Proof: bypassing integer validation failed `bootstrap requires valid configuration and clock and closed stores reject every operation`.
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error('invalid run store integer');
}

/** Adds exact integer counters or timestamps without permitting overflow. */
export function addInteger(value: number, increment: number): number {
  assertInteger(value);
  assertInteger(increment);
  const sum = value + increment;
  // Proof: removing overflow rejection failed `trusted missing records and arithmetic overflow throw without reservations`.
  assertInteger(sum);
  return sum;
}
