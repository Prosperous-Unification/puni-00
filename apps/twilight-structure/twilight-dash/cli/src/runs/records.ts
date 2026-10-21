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
export type ExecutionCommandId = typeof codecs.ExecutionCommandIdCodec.infer;
export type CommandId = typeof codecs.CommandIdCodec.infer;
export type CorrelationKey = typeof codecs.CorrelationKeyCodec.infer;
export type DecisionId = typeof codecs.DecisionIdCodec.infer;
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
export interface Locator {
  readonly version: 1;
  readonly workerId: string;
  readonly sessionId: string;
  readonly operationKey: OperationKey;
}
export interface Quiescence {
  readonly version: 1;
  readonly operationKey: OperationKey;
  readonly observedAt: Timestamp;
  readonly evidence: ArtifactRef;
  readonly effect: 'absent' | 'succeeded' | 'failed' | 'unknown';
}
export interface HumanWait {
  readonly version: 1;
  readonly correlationKey: CorrelationKey;
  readonly prompt: ArtifactRef;
  readonly choices: readonly string[];
}
export interface AttemptOutcome {
  readonly version: 1;
  readonly kind: 'succeeded' | 'failed' | 'cancelled';
  readonly artifacts: readonly ArtifactRef[];
  readonly summary: string;
}
export interface ProgressIntent {
  readonly version: 1;
  readonly commandId: CommandId;
  readonly authority: ClaimAuthority;
  readonly expectedWbsRevision: string;
  readonly outcome: AttemptOutcome;
  readonly commandDigest: ArtifactDigest;
}
export interface CommandReceipt {
  readonly version: 1;
  readonly commandId: CommandId;
  readonly commandDigest: ArtifactDigest;
  readonly authority: ClaimAuthority;
  readonly acceptedWbsRevision: string;
  readonly evidence: ArtifactRef;
}
export interface Decision {
  readonly version: 1;
  readonly decisionId: DecisionId;
  readonly attemptId: AttemptId;
  readonly correlationKey: CorrelationKey;
  readonly choice: string;
  readonly actorId: PersonId;
  readonly authorizationEvidence: ArtifactRef;
}
export type AttemptState =
  | { readonly kind: 'queued'; readonly claim: ClaimAuthority | null }
  | { readonly kind: 'running'; readonly claim: ClaimAuthority; readonly locator: Locator }
  | {
      readonly kind: 'reconciling';
      readonly claim: ClaimAuthority | null;
      readonly locator: Locator | null;
      readonly reason: string;
    }
  | {
      readonly kind: 'unresolved';
      readonly claim: ClaimAuthority | null;
      readonly locator: Locator | null;
      readonly reason: string;
      readonly evidence: ArtifactRef;
    }
  | {
      readonly kind: 'interrupted';
      readonly claim: ClaimAuthority | null;
      readonly quiescence: Quiescence;
    }
  | {
      readonly kind: 'waiting_for_person';
      readonly claim: ClaimAuthority;
      readonly wait: HumanWait;
      readonly quiescence: Quiescence;
    }
  | {
      readonly kind: 'outcome_pending_progress';
      readonly claim: ClaimAuthority;
      readonly outcome: AttemptOutcome;
      readonly commandId: CommandId;
      readonly quiescence: Quiescence;
    }
  | {
      readonly kind: 'terminal';
      readonly claim: ClaimAuthority;
      readonly outcome: AttemptOutcome;
      readonly receipt: CommandReceipt;
      readonly quiescence: Quiescence;
    };
export type ExecutionFact =
  | { readonly kind: 'claim_acquired'; readonly claim: ClaimAuthority }
  | { readonly kind: 'launch_recorded'; readonly claim: ClaimAuthority; readonly locator: Locator }
  | { readonly kind: 'recovery_required'; readonly reason: string }
  | { readonly kind: 'unresolved'; readonly reason: string; readonly evidence: ArtifactRef }
  | { readonly kind: 'interrupted'; readonly quiescence: Quiescence }
  | {
      readonly kind: 'waiting';
      readonly claim: ClaimAuthority;
      readonly wait: HumanWait;
      readonly quiescence: Quiescence;
    };
export interface ExecutionCommand {
  readonly commandId: ExecutionCommandId;
  readonly fact: ExecutionFact;
}
export interface Completion {
  readonly outcome: AttemptOutcome;
  readonly intent: ProgressIntent;
  readonly quiescence: Quiescence;
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
/** Consistent run state and store-wide local capacity, independent of ownership. */
export interface RunSnapshot {
  readonly version: 1;
  readonly run: Run;
  readonly attempts: readonly Attempt[];
  readonly pendingIntents: readonly ProgressIntent[];
  readonly receipts: readonly CommandReceipt[];
  readonly decisions: readonly Decision[];
  readonly consumedDecisionIds: readonly DecisionId[];
  readonly capacity: { readonly limit: number; readonly reserved: number };
}
