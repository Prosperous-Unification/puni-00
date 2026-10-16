/**
 * The only Twilight Burokrat surface Twilight Dash may reach: the admission and activation judges.
 * Every export answers "is this artifact allowed?" or "do these bytes reconcile?" from a Git
 * revision plus bytes; none takes a store, reads a clock or reaches the network. Dash's runtime
 * authority (store, claims, generations, composition and publication) and its activation
 * controller and review invoker call these through `@twilight-burokrat/judge`; Burokrat never
 * imports Dash. `judge-facade.test.ts` pins the runtime export list and scans every module this
 * file reaches for store, clock and network imports.
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
  type CheckRun,
  CheckRunLedger,
  ClassificationPolicy,
  ContentClass,
  EvidenceRecordKind,
  RelationshipDeclaration,
  RelationshipRequest,
  RelativePath,
} from './contracts/records';
export {
  type ArtifactDecoderFiles,
  type ArtifactGraphLimits,
  ArtifactGraphRuleV1,
  buildArtifactGraph,
  type BuiltArtifactGraph,
  identifyArtifactDecoder,
  verifyArtifactGraph,
} from './evidence/artifact-graph';
export {
  compareCanonicalText,
  hashBytes,
  hashCanonical,
  serializeCanonical,
} from './evidence/content-manifest';
export { type ClassifiedEntry, classifyEntries } from './inventory/classify-entries';
export {
  type CandidateEntry,
  CandidateReadError,
  type CandidateRequest,
  type CandidateSnapshot,
  parseCommittedTreeEntries,
  readCandidate,
  resolveCandidateRoot,
} from './inventory/read-candidate';
export {
  type CheckRunAuthority,
  checkRunDigest,
  checkRunLayout,
  type CheckRunPlan,
  CheckRunRefusal,
  type CheckRunRefusalReason,
  type JudgedCheckRun,
  planCandidateCheckRuns,
  type PlannedCheckRun,
  readCheckRuns,
} from './policy/check-runs';
export { extractRelationships } from './relationships';
export {
  type DeclarationSource,
  type DeclaredRelationships,
  extractDeclaredRelationships,
  extractDeclaredRelationshipsFromSource,
  identifyDeclarationExtractor,
} from './relationships/declarations';
export { type NxRelationships } from './relationships/nx';
export { type ExtractorIdentity } from './relationships/typescript';
export { AuditFinding } from './review/audit';
export {
  type ExhaustiveFreezeDocuments,
  freezeExhaustivePlan,
  freezeExhaustivePlanFromSource,
  verifyExhaustivePlanFromSource,
} from './review/exhaustive-coverage';
export {
  ColdAcknowledgement,
  ColdAttempt,
  coldHarnessRequest,
  decodeInvocationRegistration,
  deriveReviewEvidence,
  type DurableAcceptance,
  InformedAttempt,
  informedHarnessRequest,
  type InvocationJournal,
  InvocationJournalRecord,
  InvocationRegistration,
  InvocationTerminal,
  ProcessObservation,
  readInvocationJournal,
  reconcileColdAcknowledgement,
  reconcileJournalEntry,
  reconcileReviewedInformed,
  type ReviewInvocationResult,
  type ReviewInvoker,
} from './review/invocation-journal';
export {
  ColdHarnessOutput,
  decodeColdHarnessOutput,
  decodeInformedHarnessOutput,
  decodeReviewEvidence,
  InformedHarnessOutput,
  ReviewEvidence,
  ReviewInvocationRequest,
  ReviewSubject,
} from './review/protocol';
