/**
 * The only Twilight Burokrat surface Twilight Dash may reach: the admission judge. Every export
 * answers "is this artifact allowed?" from a Git revision plus bytes; none takes an authority
 * store, reads a clock or reaches the network. Dash's runtime authority (store, claims,
 * generations, composition and publication) calls these through `@twilight-burokrat/judge`;
 * Burokrat never imports Dash. `judge-facade.test.ts` pins the runtime export list and scans
 * every module this file reaches for store, clock and network imports.
 */
export {
  assertAuthorityClaimPath,
  assertAuthorityConflictGroup,
  assertAuthorityPathAccess,
  assertAuthoritySessionId,
  assertAuthorityWorktreePath,
  type AuthorityClaim,
  type GroupClaim,
  type PathAccess,
  type PathClaim,
} from './admission-judge/authority-identities';
export {
  type AdmissionSubmissionReport,
  assertCheckedIntegrationCandidate,
  certifyIntegrationCandidate,
  type CheckedIntegrationCandidate,
  decodeIntegrationPolicy,
  type IntegrationCandidateBody,
  type IntegrationEvidence,
  type IntegrationEvidenceVerifier,
  type IntegrationGenerationSnapshot,
  type IntegrationPolicy,
  type IntegrationRequest,
  type SubmissionIdentity,
  type SubmittedCandidate,
  type UncheckedIntegrationCandidate,
  type VerifiedIntegrationReceipt,
} from './admission-judge/integration-candidate';
export {
  type AdmissionBase,
  type AdmissionPacket,
  type AdmissionPacketIntent,
  type AdmissionReadDependency,
  assertAdmissionPacket,
  assertNarrative,
  canonicalPaths,
  decodeAdmissionPacket,
  decodeAdmissionPacketBody,
  packetBody,
  packetBodyBytes,
  uniqueSorted,
  withPacketIdentity,
} from './admission-judge/packet-codec';
export {
  assertUnambiguousPath,
  canonicalRepository,
  packetAuthorityClaims,
  readBaseEntries,
  validatePacketAgainstBase,
} from './admission-judge/packet-judgment';
export {
  compareCanonicalText,
  hashBytes,
  hashCanonical,
  serializeCanonical,
} from './evidence/content-manifest';
export {
  type CandidateEntry,
  CandidateReadError,
  type CandidateRequest,
  type CandidateSnapshot,
  readCandidate,
  resolveCandidateRoot,
} from './inventory/read-candidate';
