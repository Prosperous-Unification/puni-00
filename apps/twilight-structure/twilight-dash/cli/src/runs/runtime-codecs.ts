import { createHash } from 'node:crypto';

import { parseOrThrow, type } from '@shared/validation';
import { matchesRuntimeScope, parseCanonicalRuntimeRequest } from '@wbs/contracts';

import {
  artifactDigest,
  ArtifactDigestCodec,
  ArtifactRefCodec,
  OwnerIdCodec,
  OwnershipCodec,
} from './record-codecs';
import type {
  RuntimeAcceptance,
  RuntimeAcceptanceInput,
  RuntimeGuard,
  RuntimeIntent,
  RuntimePin,
  RuntimeScope,
} from './runtime-records';

const identity = type('string > 0');
const integer = type('number.integer >= 0').atMost(Number.MAX_SAFE_INTEGER);
const positive = integer.atLeast(1);
const scopeCodec = type({
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
  expectedRevision: integer,
}).onDeepUndeclaredKey('reject');
const intentCodec = type({
  version: '1',
  commandId: identity,
  canonicalRequest: identity,
  requestDigest: ArtifactDigestCodec,
  localOwner: { ownerId: OwnerIdCodec, epoch: positive },
  stagedRevision: positive,
}).onDeepUndeclaredKey('reject');
const acceptanceCodec = type({
  version: '1',
  commandId: identity,
  requestDigest: ArtifactDigestCodec,
  evidence: ArtifactRefCodec,
  acceptedRevision: positive,
}).onDeepUndeclaredKey('reject');
const inputCodec = type({ intent: intentCodec, evidence: ArtifactRefCodec }).onDeepUndeclaredKey(
  'reject',
);

/** Strict detached boundary snapshot; WBS identities preserve their unbounded nonempty string domain. */
export function decodeRuntimeScope(input: unknown): RuntimeScope {
  return structuredClone(parseOrThrow(scopeCodec, input));
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
  return artifactDigest(createHash('sha256').update(canonicalRequest, 'utf8').digest('hex'));
}
/** Uses the existing strict canonical request parser for all supported and unsupported operation shapes. */
export function readRuntimeRequest(canonicalRequest: string) {
  // Proof: F55 trimmed noncanonical bytes before the shared parser; 'canonical bytes and supported' failed and exact restoration passed.
  return parseCanonicalRuntimeRequest(canonicalRequest);
}
/** Compares complete already validated addresses without introducing another scope contract. */
export function equalRuntimeScopes(left: RuntimeScope, right: RuntimeScope): boolean {
  return matchesRuntimeScope(left, right);
}
/** Collision-free physical identity for the complete ordered scope address. */
export function runtimeScopeKey(scope: RuntimeScope): string {
  return JSON.stringify([scope.organizationId, scope.projectId, scope.personId]);
}
