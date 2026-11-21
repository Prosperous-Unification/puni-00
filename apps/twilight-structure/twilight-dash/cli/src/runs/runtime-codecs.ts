import { createHash } from 'node:crypto';

import { parseOrThrow, type } from '@shared/validation';
import {
  parseCanonicalRuntimeRequest,
  readRuntimeReceiptScope,
  readRuntimeStateScope,
  type RetainedRuntimeState,
  type RuntimeReceipt,
  type RuntimeScope as CurrentRuntimeScope,
} from '@wbs/contracts';

import type {
  RuntimeAcceptance,
  RuntimeAcceptanceInput,
  RuntimeGuard,
  RuntimeIntent,
  RuntimePin,
  RuntimeScope,
} from './runtime-records';
import {
  artifactDigest,
  ArtifactDigestCodec,
  ArtifactRefCodec,
  Integer,
  OwnerIdCodec,
  OwnershipCodec,
  Positive,
} from './value-codecs';

const identity = type('string > 0');
// Proof: dash-local-unknown-owner-field: ignoring an extra competing local owner field.
// 'published local scope and pin bytes and physical tuple keys remain project-keyed' failed; exact restoration passed.
export const scopeCodec = type({
  organizationId: identity,
  projectId: identity,
  personId: identity,
}).onDeepUndeclaredKey('reject');
// Proof: F56b accepted an unknown local pin field; 'trusted runtime scope unknown field' failed and exact restoration passed.
const pinCodec = type({ version: '1', scope: scopeCodec, ledgerId: identity }).onDeepUndeclaredKey(
  'reject',
);
const guardCodec = type({
  ownership: OwnershipCodec,
  scope: scopeCodec,
  expectedRevision: Integer,
}).onDeepUndeclaredKey('reject');
export const intentCodec = type({
  version: '1',
  commandId: identity,
  canonicalRequest: identity,
  requestDigest: ArtifactDigestCodec,
  localOwner: { ownerId: OwnerIdCodec, epoch: Positive },
  stagedRevision: Positive,
}).onDeepUndeclaredKey('reject');
export const acceptanceCodec = type({
  version: '1',
  commandId: identity,
  requestDigest: ArtifactDigestCodec,
  evidence: ArtifactRefCodec,
  acceptedRevision: Positive,
}).onDeepUndeclaredKey('reject');
const inputCodec = type({ intent: intentCodec, evidence: ArtifactRefCodec }).onDeepUndeclaredKey(
  'reject',
);

/** Projects only an already validated raw receipt address; receipt generation and original evidence remain unchanged. */
export function readReceiptScope(receipt: RuntimeReceipt): RuntimeScope {
  // Proof: dash-receipt-local-accessor: returning a different owner from the raw receipt local accessor.
  // 'Dash receipt local scope accessor preserves owner distinctions in both raw formats' failed; exact restoration passed.
  // First original1 accessor equality; current2 is separately healthy.
  return mapLocalScope(readRuntimeReceiptScope(receipt));
}
/** Projects a validated raw state address for frozen local correspondence; the original state is never rewritten. */
export function readStateScope(state: RetainedRuntimeState): RuntimeScope {
  // Proof: dash-retained-state-local-accessor: returning a different owner from the local state accessor.
  // 'Dash recovery state2 keeps original raw body through embedded decoding' failed; exact restoration passed.
  // Valid recovery-pair consistency refusal at fault-era recovery-evidence.ts153; no per-conjunct authority claim.
  return mapLocalScope(readRuntimeStateScope(state));
}
/** Strict detached boundary snapshot; WBS identities preserve their unbounded nonempty string domain. */
export function decodeRuntimeScope(input: unknown): RuntimeScope {
  return structuredClone(parseOrThrow(scopeCodec, input));
}
/** Maps a validated local address to current WBS fields; conversion establishes no authority or freshness. */
export function mapCurrentScope(scope: RuntimeScope): CurrentRuntimeScope {
  return {
    organizationId: scope.organizationId,
    // Proof: dash-current-address-map: returning wrong-owner from the complete current-scope map.
    // 'complete current scope mapping copies all local fields without retaining caller aliases' failed; exact restoration passed.
    // Only the first full map equality is observed, not a separate alias-detachment fault.
    workPackageId: scope.projectId,
    personId: scope.personId,
  };
}
/** Maps validated current WBS meaning into the unchanged local address, never into historical wire evidence. */
export function mapLocalScope(scope: CurrentRuntimeScope): RuntimeScope {
  return {
    organizationId: scope.organizationId,
    // Proof: dash-local-address-map: returning wrong-owner from the complete local-scope map.
    // 'complete local scope mapping copies all current fields without retaining caller aliases' failed; exact restoration passed.
    // Only the first full map equality is observed, not a separate alias-detachment fault.
    projectId: scope.workPackageId,
    personId: scope.personId,
  };
}
export function decodeRuntimePin(input: unknown): RuntimePin {
  return structuredClone(parseOrThrow(pinCodec, input));
}
export function decodeRuntimeGuard(input: unknown): RuntimeGuard {
  // Proof: F40 aliased the submitted guard through an artifact await; 'verified operation snapshots' failed and exact restoration passed.
  return structuredClone(parseOrThrow(guardCodec, input));
}
export function decodeRuntimeIntent(input: unknown): RuntimeIntent {
  // Proof: F41 aliased submitted intent provenance through an artifact await; 'verified operation snapshots' failed and exact restoration passed.
  return structuredClone(parseOrThrow(intentCodec, input));
}
export function decodeRuntimeAcceptance(input: unknown): RuntimeAcceptance {
  return structuredClone(parseOrThrow(acceptanceCodec, input));
}
export function decodeRuntimeAcceptanceInput(input: unknown): RuntimeAcceptanceInput {
  return structuredClone(parseOrThrow(inputCodec, input));
}
/** Computes the independent digest of exact UTF-8 bytes, never a recanonicalized substitute. */
export function digestRuntimeRequest(canonicalRequest: string) {
  // Proof: dash-independent-original-digest: hashing different canonical bytes in the independent digest dependency.
  // 'Dash verifies genuine raw receipt1 authority without changing its tag or bytes' failed; exact restoration passed.
  // Valid captured receipt consistency refusal, not an admission bypass.
  return artifactDigest(createHash('sha256').update(canonicalRequest, 'utf8').digest('hex'));
}
/** Reads original canonical1/current2 through the public strict parser, then returns only a local semantic view. Original strings, tags and independently hashed bytes are never replaced or recanonicalized. */
export function readRuntimeRequest(canonicalRequest: string) {
  // Proof: F55 trimmed noncanonical bytes before the shared parser; 'canonical bytes and supported' failed and exact restoration passed.
  // Proof: dash-original-canonical-strict-bytes: trimming noncanonical request bytes before the strict parser.
  // 'genuine canonical1 grant retains original bytes and digest while reading local scope' failed; exact restoration passed.
  // 'current canonical2 is an explicit local view without retagging its original bytes' failed; exact restoration passed.
  // One trim fault reaches grant1 and current2, not every operation.
  const parsed = parseCanonicalRuntimeRequest(canonicalRequest);
  // Proof: dash-canonical-local-view: returning the current owner vocabulary without the local projection.
  // 'current canonical2 is an explicit local view without retagging its original bytes' failed; exact restoration passed.
  return { scope: mapLocalScope(parsed.scope), operation: parsed.operation };
}
/** Compares every field of the validated immutable local address; current wire keys are never read from legacy local objects. */
export function equalRuntimeScopes(left: RuntimeScope, right: RuntimeScope): boolean {
  // Proof: the mutable current matcher returned true for different validated legacy owners;
  // 'local runtime equality rejects independently different projectId' failed before this repair.
  return (
    // Proof: dash-scope-equality-organizationId: replacing only the organization comparison with true.
    // 'local runtime equality rejects independently different organizationId' failed; exact restoration passed.
    left.organizationId === right.organizationId &&
    // Proof: dash-scope-equality-projectId: replacing only the local owner comparison with true.
    // 'local runtime equality rejects independently different projectId' failed; exact restoration passed.
    left.projectId === right.projectId &&
    // Proof: dash-scope-equality-personId: replacing only the person comparison with true.
    // 'local runtime equality rejects independently different personId' failed; exact restoration passed.
    left.personId === right.personId
  );
}
/** Collision-free physical identity for the complete ordered scope address. */
export function runtimeScopeKey(scope: RuntimeScope): string {
  // Proof: dash-physical-ordered-tuple: swapping owner and person in the physical tuple.
  // 'published local scope and pin bytes and physical tuple keys remain project-keyed' failed; exact restoration passed.
  // Exact tuple serialization; native old-store compatibility remains separate evidence.
  return JSON.stringify([scope.organizationId, scope.projectId, scope.personId]);
}
