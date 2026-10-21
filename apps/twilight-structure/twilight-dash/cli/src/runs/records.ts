import type * as codecs from './record-codecs';

export type StoreId = typeof codecs.StoreIdCodec.infer;
export type OrganizationId = typeof codecs.OrganizationIdCodec.infer;
export type OwnerId = typeof codecs.OwnerIdCodec.infer;
export type RunId = typeof codecs.RunIdCodec.infer;
export type AttemptId = typeof codecs.AttemptIdCodec.infer;
export type ProjectId = typeof codecs.ProjectIdCodec.infer;
export type WorkItemId = typeof codecs.WorkItemIdCodec.infer;
export type OccurrenceId = typeof codecs.OccurrenceIdCodec.infer;
export type OperationKey = typeof codecs.OperationKeyCodec.infer;
export type ClaimId = typeof codecs.ClaimIdCodec.infer;
export type PersonId = typeof codecs.PersonIdCodec.infer;
export type AgentRunId = typeof codecs.AgentRunIdCodec.infer;
export type ManifestDigest = typeof codecs.ManifestDigestCodec.infer;
export type ArtifactDigest = typeof codecs.ArtifactDigestCodec.infer;
export type Revision = number;
export type Epoch = number;
export type Ordinal = number;
export type Timestamp = number;

export interface Ownership {
  readonly version: 1;
  readonly storeId: StoreId;
  readonly organizationId: OrganizationId;
  readonly ownerId: OwnerId;
  readonly epoch: Epoch;
  readonly expiresAt: Timestamp;
}
export interface OwnershipStatus {
  readonly storeId: StoreId;
  readonly organizationId: OrganizationId;
  readonly epoch: Epoch;
  readonly owner: Ownership | null;
}
export interface ArtifactRef {
  readonly version: 1;
  readonly digest: ArtifactDigest;
  readonly byteLength: number;
  readonly mediaType: string;
  readonly retention: 'retain';
}
export interface Manifest {
  readonly version: 1;
  readonly digest: ManifestDigest;
  readonly bindingVersion: number;
  readonly canonicalBinding: string;
  readonly prompts: readonly ArtifactRef[];
  readonly toolPolicies: readonly ArtifactRef[];
  readonly executorVersions: Readonly<Record<string, string>>;
  readonly credentialReferences: readonly string[];
}
export interface Run {
  readonly version: 1;
  readonly runId: RunId;
  readonly revision: Revision;
  readonly projectId: ProjectId;
  readonly workItemId: WorkItemId;
  readonly manifestDigest: ManifestDigest;
  readonly maxAttempts: number;
}
export interface ActivityIdentity {
  readonly version: 1;
  readonly runId: RunId;
  readonly occurrenceId: OccurrenceId;
  readonly operationKey: OperationKey;
}
export interface ClaimAuthority {
  readonly version: 1;
  readonly claimId: ClaimId;
  readonly personId: PersonId;
  readonly agentRunId: AgentRunId;
  readonly runId: RunId;
  readonly attemptId: AttemptId;
  readonly projectId: ProjectId;
  readonly workItemId: WorkItemId;
  readonly occurrenceId: OccurrenceId;
}
export interface AttemptState {
  readonly kind: 'queued';
  readonly claim: ClaimAuthority | null;
}
export interface Attempt {
  readonly version: 1;
  readonly attemptId: AttemptId;
  readonly identity: ActivityIdentity;
  readonly ordinal: Ordinal;
  readonly revision: Revision;
  readonly admittedEpoch: Epoch;
  readonly state: AttemptState;
  readonly holdsCapacity: boolean;
}
export interface Admission {
  readonly attemptId: AttemptId;
  readonly identity: ActivityIdentity;
  readonly ordinal: Ordinal;
}
/** Admission-only snapshot; execution/outbox/inbox records are added with their semantic operations. */
export interface RunSnapshot {
  readonly version: 1;
  readonly run: Run;
  readonly attempts: readonly Attempt[];
  readonly capacity: { readonly limit: number; readonly reserved: number };
}
