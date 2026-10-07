import { readFileSync } from 'node:fs';

import { parseOrThrow, type } from '@shared/validation';
import { Database } from 'bun:sqlite';

import { hashBytes, hashCanonical, serializeCanonical } from '../evidence/content-manifest';
import { AuditFinding } from '../review/audit';
import {
  ColdHarnessOutput,
  decodeColdHarnessOutput,
  decodeInformedHarnessOutput,
  decodeReviewEvidence,
  InformedHarnessOutput,
  ReviewEvidence,
} from '../review/protocol';
import { readBootstrapConfiguration, type TrustedBootstrapPin } from './bootstrap';
import {
  type CheckInvocationManifest,
  CheckManifestRefusal,
  decodeCheckInvocationManifest,
} from './check-manifest';
import { type ObservedActivationCandidate, prepareObservedRequest } from './ingress';
import {
  type ActivationRequest,
  ActivationSubject,
  createActivationRequest,
  decodeActivationRequest,
} from './request';

export type ObservedCandidate = ObservedActivationCandidate;

const RequestStage = type(
  "'observed'|'evaluating'|'verified'|'published'|'admitted'|'merge-requested'|'merged'|'merged-certified'|'host-ready'|'failed'|'superseded'",
);
export type RequestStage = typeof RequestStage.infer;

const EvaluationObligation = type({
  identity: /^[0-9a-f]{64}$/,
  kind: "'check'",
  executorId: 'string>=1',
  protocolIdentity: /^[0-9a-f]{64}$/,
  commandIdentity: /^[0-9a-f]{64}$/,
})
  .onUndeclaredKey('reject')
  .or(
    type({
      identity: /^[0-9a-f]{64}$/,
      kind: "'audit'",
      reviewId: 'string>=1',
      executorId: 'string>=1',
      protocolIdentity: /^[0-9a-f]{64}$/,
      phase: "'cold'|'informed'",
    }).onUndeclaredKey('reject'),
  );
export type EvaluationObligation = typeof EvaluationObligation.infer;

const EvaluationPlan = type({
  requestIdentity: /^[0-9a-f]{64}$/,
  policyIdentity: /^[0-9a-f]{64}$/,
  obligations: EvaluationObligation.array(),
}).onUndeclaredKey('reject');
export type EvaluationPlan = typeof EvaluationPlan.infer;

const AuthenticatedReceipt = type({
  receiptIdentity: /^[0-9a-f]{64}$/,
  issuerId: 'string>=1',
  requestIdentity: /^[0-9a-f]{64}$/,
  obligationIdentity: /^[0-9a-f]{64}$/,
  kind: "'check'",
  attempt: 'number.integer>=0',
  executorId: 'string>=1',
  protocolIdentity: /^[0-9a-f]{64}$/,
  commandIdentity: /^[0-9a-f]{64}$/,
  status: "'passed'|'failed'|'skipped'",
})
  .onUndeclaredKey('reject')
  .or(
    type({
      receiptIdentity: /^[0-9a-f]{64}$/,
      issuerId: 'string>=1',
      requestIdentity: /^[0-9a-f]{64}$/,
      obligationIdentity: /^[0-9a-f]{64}$/,
      kind: "'audit'",
      reviewId: 'string>=1',
      invocationId: 'string>=1',
      attempt: 'number.integer>=0',
      executorId: 'string>=1',
      protocolIdentity: /^[0-9a-f]{64}$/,
      phase: "'cold'|'informed'",
      status: "'passed'|'failed'|'skipped'",
    }).onUndeclaredKey('reject'),
  );
export type AuthenticatedReceipt = typeof AuthenticatedReceipt.infer;

const StoredObligation = type({
  request_identity: /^[0-9a-f]{64}$/,
  obligation_identity: /^[0-9a-f]{64}$/,
  kind: "'check'|'audit'",
  review_id: 'string|null',
  executor_id: 'string>=1',
  protocol_identity: /^[0-9a-f]{64}$/,
  command_identity: type(/^[0-9a-f]{64}$/).or('null'),
  phase: "'cold'|'informed'|null",
  attempt: 'number.integer>=0',
  state: "'pending'|'passed'|'failed'|'skipped'",
  receipt_identity: type(/^[0-9a-f]{64}$/).or('null'),
}).onUndeclaredKey('reject');

function reconstructFrozenPlan(
  request: ActivationRequest,
  rows: readonly (typeof StoredObligation.infer)[],
): EvaluationPlan {
  const obligations = rows.map((entry) => {
    const common = {
      identity: entry.obligation_identity,
      executorId: entry.executor_id,
      protocolIdentity: entry.protocol_identity,
    };
    if (entry.kind === 'check') {
      // Proof: a check row with an audit phase otherwise reconstructs as a valid
      // check and can preserve the frozen-plan digest despite malformed storage.
      if (entry.command_identity === null || entry.phase !== null) {
        throw new Error('stored check obligation malformed');
      }
      return parseOrThrow(EvaluationObligation, {
        ...common,
        kind: 'check',
        commandIdentity: entry.command_identity,
      });
    }
    // Proof: an audit row with a command identity otherwise reconstructs as a
    // valid audit and can preserve the frozen-plan digest despite malformed storage.
    if (entry.command_identity !== null || entry.phase === null) {
      throw new Error('stored audit obligation malformed');
    }
    return parseOrThrow(EvaluationObligation, {
      ...common,
      kind: 'audit',
      reviewId: entry.review_id,
      phase: entry.phase,
    });
  });
  return parseOrThrow(EvaluationPlan, {
    requestIdentity: request.requestIdentity,
    policyIdentity: request.policyIdentity,
    obligations,
  });
}

const StoredAttempt = type({
  request_identity: /^[0-9a-f]{64}$/,
  obligation_identity: /^[0-9a-f]{64}$/,
  attempt: 'number.integer>=0',
  receipt_identity: /^[0-9a-f]{64}$/,
  receipt_bytes: 'string>=1',
  authentication_bytes: 'string>=1',
  status: "'passed'|'failed'|'skipped'",
}).onUndeclaredKey('reject');

const StoredReviewAttempt = type({
  request_identity: /^[0-9a-f]{64}$/,
  review_id: 'string>=1',
  attempt: 'number.integer>=0',
  invocation_id: 'string>=1',
}).onUndeclaredKey('reject');

const ReviewDispatchInput = type({
  reviewId: 'string>=1',
  attempt: 'number.integer>=0',
  invocationId: 'string>=1',
  deadlineAt: 'number.integer>=0',
  maxDispatchAttempts: 'number.integer>=1',
}).onUndeclaredKey('reject');
export type ReviewDispatchInput = typeof ReviewDispatchInput.infer;

const StoredReviewDispatch = type({
  effect_key: /^[0-9a-f]{64}$/,
  request_identity: /^[0-9a-f]{64}$/,
  plan_identity: /^[0-9a-f]{64}$/,
  review_id: 'string>=1',
  attempt: 'number.integer>=0',
  invocation_id: 'string>=1',
  cold_obligation_identity: /^[0-9a-f]{64}$/,
  informed_obligation_identity: /^[0-9a-f]{64}$/,
  authority_identity: /^[0-9a-f]{64}$/,
  target_bytes: 'string>=1',
  payload_bytes: 'string>=1',
  payload_digest: /^[0-9a-f]{64}$/,
  created_at: 'number.integer>=0',
  deadline_at: 'number.integer>=0',
  max_dispatch_attempts: 'number.integer>=1',
  state: "'reserved'",
  owner_epoch: 'number.integer>=0',
  owner_id: 'string>=1',
  version: 'number.integer>=0',
}).onUndeclaredKey('reject');

export interface ReviewDispatchReservation {
  readonly effectKey: string;
  readonly requestIdentity: string;
  readonly target: {
    readonly kind: 'reviewer';
    readonly providerId: string;
    readonly executorId: string;
  };
  readonly payloadBytes: string;
  readonly payloadDigest: string;
  readonly createdAt: number;
  readonly deadlineAt: number;
  readonly maxDispatchAttempts: number;
}

export interface ReviewDispatchObservation {
  readonly effectKey: string;
  readonly requestIdentity: string;
  readonly target: ReviewDispatchReservation['target'];
  readonly payloadDigest: string;
  readonly invocationId: string;
  readonly remoteDispatchId: string;
  readonly evidenceBytes: string;
}

export interface ReviewDispatchPort {
  /** Authenticated lookup for this exact effect key; an unreadable lookup is not absence. */
  readonly query: (
    reservation: ReviewDispatchReservation,
  ) => Promise<
    | { readonly kind: 'absent' }
    | { readonly kind: 'unavailable' }
    | { readonly kind: 'accepted'; readonly observed: ReviewDispatchObservation }
  >;
  /** A concrete adapter must fence ownership and immutable target/payload at acceptance. */
  readonly send: (
    reservation: ReviewDispatchReservation,
    fence: { readonly workerId: string; readonly leaseEpoch: number },
  ) => Promise<
    | { readonly kind: 'uncertain' }
    | { readonly kind: 'accepted'; readonly observed: ReviewDispatchObservation }
  >;
}

export interface ReviewDispatchQueryPort {
  /** Query only: an orphaned request has no authority to initiate another send. */
  readonly query: ReviewDispatchPort['query'];
}

const HistoricalAuthorityRegistry = type({
  schemaVersion: '1',
  authorities: type({
    bootstrapPath: 'string>=1',
    pin: type({
      identity: /^[0-9a-f]{64}$/,
      journalIssuerId: 'string>=1',
      publisherIssuerId: 'string>=1',
    }).onUndeclaredKey('reject'),
  })
    .onUndeclaredKey('reject')
    .array(),
}).onUndeclaredKey('reject');

export interface HistoricalAuthorityRegistryPin {
  readonly path: string;
  readonly digest: string;
}

export interface ReviewDispatchProgress {
  readonly effectKey: string;
  readonly state: 'reserved' | 'dispatching' | 'uncertain' | 'acknowledged' | 'exhausted';
  readonly dispatchAttempts: number;
  readonly ownerEpoch: number;
  readonly ownerId: string;
}

const StoredDispatchProgress = type({
  effect_key: /^[0-9a-f]{64}$/,
  state: "'reserved'|'dispatching'|'uncertain'|'acknowledged'|'exhausted'",
  dispatch_attempts: 'number.integer>=0',
  owner_epoch: 'number.integer>=0',
  owner_id: 'string>=1',
  version: 'number.integer>=0',
}).onUndeclaredKey('reject');

interface DispatchRows {
  readonly stored: typeof StoredReviewDispatch.infer;
  readonly progress: typeof StoredDispatchProgress.infer;
  readonly reservation: ReviewDispatchReservation;
}

const LogicalReviewTarget = type({
  kind: "'reviewer'",
  providerId: 'string>=1',
  executorId: 'string>=1',
}).onUndeclaredKey('reject');

const DispatchObservation = type({
  effectKey: /^[0-9a-f]{64}$/,
  requestIdentity: /^[0-9a-f]{64}$/,
  target: LogicalReviewTarget,
  payloadDigest: /^[0-9a-f]{64}$/,
  invocationId: 'string>=1',
  remoteDispatchId: 'string>=1',
  evidenceBytes: 'string>=1',
}).onUndeclaredKey('reject');

const DispatchQuery = type({ kind: "'absent'" })
  .onUndeclaredKey('reject')
  .or(type({ kind: "'unavailable'" }).onUndeclaredKey('reject'))
  .or(type({ kind: "'accepted'", observed: DispatchObservation }).onUndeclaredKey('reject'));
const DispatchSend = type({ kind: "'uncertain'" })
  .onUndeclaredKey('reject')
  .or(type({ kind: "'accepted'", observed: DispatchObservation }).onUndeclaredKey('reject'));

function deriveDispatchIdentity(
  request: ActivationRequest,
  planIdentity: string,
  registration: Pick<ReviewDispatchInput, 'reviewId' | 'attempt' | 'invocationId'>,
  cold: typeof StoredObligation.infer,
  informed: typeof StoredObligation.infer,
  bootstrap: ReturnType<typeof readBootstrapConfiguration>,
  authorityIdentity: string,
) {
  const target = {
    kind: 'reviewer' as const,
    providerId: bootstrap.reviewer.providerId,
    executorId: bootstrap.reviewer.executorId,
  };
  const targetBytes = serializeCanonical(target);
  const payloadBytes = serializeCanonical({
    request,
    planIdentity,
    reviewId: registration.reviewId,
    attempt: registration.attempt,
    invocationId: registration.invocationId,
    coldObligationIdentity: cold.obligation_identity,
    informedObligationIdentity: informed.obligation_identity,
    authorityIdentity,
    target,
    protocolIdentity: bootstrap.reviewer.protocolIdentity,
    promptIdentity: bootstrap.reviewer.promptIdentity,
  });
  return {
    target,
    targetBytes,
    payloadBytes,
    payloadDigest: hashBytes(payloadBytes),
    effectKey: hashCanonical({
      kind: 'review-dispatch',
      requestIdentity: request.requestIdentity,
      reviewId: registration.reviewId,
      attempt: registration.attempt,
    }),
  };
}

export interface ReviewAttemptRegistration {
  readonly requestIdentity: string;
  readonly reviewId: string;
  readonly attempt: number;
  readonly invocationId: string;
}

const StoredRow = type({
  request_identity: /^[0-9a-f]{64}$/,
  repository_id: 'number.integer>=1',
  subject_key: 'string>=1',
  request_bytes: 'string>=1',
  bootstrap_identity: /^[0-9a-f]{64}$/,
  stage: RequestStage,
  version: 'number.integer>=0',
  lease_epoch: 'number.integer>=0',
  lease_owner: 'string|null',
  lease_expires_at: 'number.integer|null',
  evaluation_plan_identity: type(/^[0-9a-f]{64}$/).or('null'),
  evidence_set_identity: type(/^[0-9a-f]{64}$/).or('null'),
  pairing_version: '0|1',
  current: '0|1',
}).onUndeclaredKey('reject');
type StoredRow = typeof StoredRow.infer;

export interface StoredRequest {
  readonly request: ActivationRequest;
  readonly stage: RequestStage;
  readonly version: number;
  readonly leaseEpoch: number;
  readonly current: boolean;
  readonly evidenceSetIdentity: string | null;
}

export interface RequestLease {
  readonly requestIdentity: string;
  readonly leaseEpoch: number;
  readonly version: number;
  readonly workerId: string;
}

export interface ActivationControllerOptions {
  readonly databasePath: string;
  readonly bootstrapPath: string;
  readonly pin: TrustedBootstrapPin;
  /** Independently pinned, retained authority history for query-only orphan reconciliation. */
  readonly historicalAuthorityRegistry?: HistoricalAuthorityRegistryPin;
  readonly clock: () => number;
  readonly readyCandidates: () => Promise<readonly ObservedCandidate[]>;
  readonly currentCandidate: (
    repositoryId: number,
    subject: ActivationSubject,
  ) => Promise<
    { readonly kind: 'ready'; readonly candidate: ObservedCandidate } | { readonly kind: 'closed' }
  >;
  readonly selectObligations: (request: ActivationRequest) => EvaluationPlan;
  /** Authenticates a check receipt only; audit obligations never use this port. */
  readonly authenticateCheck?: (receiptBytes: string) => Promise<unknown>;
  /** Independently controlled immutable resolver, keyed only by the frozen command identity. */
  readonly resolveCheckManifest?: (commandIdentity: string) => Promise<unknown>;
  /** Authenticates one registered review invocation and its retained phase evidence. */
  readonly verifyReview?: (submission: ReviewSubmission) => Promise<VerifiedReview>;
}

export interface PreparedSelectedCheck {
  readonly requestIdentity: string;
  readonly obligationIdentity: string;
  readonly attempt: number;
  readonly commandIdentity: string;
  readonly planIdentity: string;
  readonly executorId: string;
  readonly protocolIdentity: string;
  readonly manifest: CheckInvocationManifest;
}

export interface ReviewExpectation {
  readonly requestIdentity: string;
  readonly reviewId: string;
  readonly obligationIdentity: string;
  readonly attempt: number;
  readonly phase: 'cold' | 'informed';
  readonly invocationId: string;
  readonly executorId: string;
  readonly protocolIdentity: string;
  readonly promptIdentity: string;
  readonly journalIssuerId: string;
}

export interface ReviewSubmission {
  readonly exactSubmissionBytes: string;
  readonly expected: ReviewExpectation;
}

interface ReviewBinding extends ReviewExpectation {
  readonly exactSubmissionDigest: string;
  readonly sourceEvidenceDigest: string;
  readonly journalId: string;
}

export interface VerifiedCompleteReview {
  readonly binding: ReviewBinding;
  readonly evidence: ReviewEvidence;
  readonly cold: ColdHarnessOutput;
  readonly informed: InformedHarnessOutput;
  readonly findings: readonly (typeof AuditFinding.infer)[];
  readonly status: 'passed' | 'failed' | 'skipped';
}

export interface VerifiedColdTerminal {
  readonly binding: ReviewBinding;
  readonly cold: ColdHarnessOutput;
  readonly terminal: { readonly status: 'failed' | 'skipped'; readonly reason: string };
}

export type VerifiedReview = VerifiedCompleteReview | VerifiedColdTerminal;

const ReviewBindingRecord = type({
  exactSubmissionDigest: /^[0-9a-f]{64}$/,
  sourceEvidenceDigest: /^[0-9a-f]{64}$/,
  requestIdentity: /^[0-9a-f]{64}$/,
  reviewId: 'string>=1',
  obligationIdentity: /^[0-9a-f]{64}$/,
  attempt: 'number.integer>=0',
  phase: "'cold'|'informed'",
  invocationId: 'string>=1',
  executorId: 'string>=1',
  protocolIdentity: /^[0-9a-f]{64}$/,
  promptIdentity: /^[0-9a-f]{64}$/,
  journalIssuerId: 'string>=1',
  journalId: 'string>=1',
}).onUndeclaredKey('reject');

const CompleteReviewVerificationRecord = type({
  binding: ReviewBindingRecord,
  evidence: ReviewEvidence,
  cold: ColdHarnessOutput,
  informed: InformedHarnessOutput,
  findings: AuditFinding.array(),
  status: "'passed'|'failed'|'skipped'",
}).onUndeclaredKey('reject');

const ColdTerminalVerificationRecord = type({
  binding: ReviewBindingRecord,
  cold: ColdHarnessOutput,
  // Proof: widening this terminal status to passed made the mounted passed-relabel
  // receipt commit instead of refusing before any evidence write.
  terminal: type({ status: "'failed'|'skipped'", reason: 'string>=1' }).onUndeclaredKey('reject'),
}).onUndeclaredKey('reject');

const ReviewVerificationRecord = CompleteReviewVerificationRecord.or(
  ColdTerminalVerificationRecord,
);

function authenticatedReview(submission: ReviewSubmission, verification: unknown): VerifiedReview {
  const source = parseOrThrow(ReviewVerificationRecord, verification);
  const { expected } = submission;
  const binding = source.binding;
  const claimedExpectation: ReviewExpectation = {
    requestIdentity: binding.requestIdentity,
    reviewId: binding.reviewId,
    obligationIdentity: binding.obligationIdentity,
    attempt: binding.attempt,
    phase: binding.phase,
    invocationId: binding.invocationId,
    executorId: binding.executorId,
    protocolIdentity: binding.protocolIdentity,
    promptIdentity: binding.promptIdentity,
    journalIssuerId: binding.journalIssuerId,
  };
  // Proof: omitting exact expected-binding equality let a cold phase label complete an
  // informed obligation in the mounted public recordReceipt test.
  if (hashCanonical(claimedExpectation) !== hashCanonical(expected)) {
    throw new Error('review verification differs from frozen invocation');
  }
  // Proof: omitting exact-submission binding accepted an authenticated digest for other bytes.
  if (binding.exactSubmissionDigest !== hashBytes(submission.exactSubmissionBytes)) {
    throw new Error('review verification submission digest differs from exact bytes');
  }
  // Proof: omitting this check accepted changed retained source bytes after controller restart.
  // The cold-only branch independently accepted an unbound source digest when omitted.
  const sourceDigest =
    'terminal' in source
      ? hashCanonical({ cold: source.cold, terminal: source.terminal })
      : hashCanonical({
          evidence: source.evidence,
          cold: source.cold,
          informed: source.informed,
          findings: source.findings,
          status: source.status,
        });
  if (binding.sourceEvidenceDigest !== sourceDigest) {
    throw new Error('review verification source digest differs from authenticated bytes');
  }
  if ('terminal' in source) {
    // Proof: omitting the phase guard changed the mounted informed-terminal refusal to the
    // later transaction refusal; neither path can complete informed work with cold-only source.
    if (expected.phase !== 'cold')
      throw new Error('cold terminal review phase differs from frozen obligation');
    const cold = decodeColdHarnessOutput(source.cold);
    if (
      // Proof: omitting this comparison accepted a schema-valid foreign cold invocation.
      cold.invocationId !== expected.invocationId ||
      // Proof: omitting this comparison accepted a schema-valid foreign protocol blob.
      cold.protocol.protocolBlob !== expected.protocolIdentity ||
      // Proof: omitting the status check changed the modeled unverified-telemetry refusal
      // to a TypeError at the following receipt access; it did not grant authority.
      cold.telemetry.status !== 'verified' ||
      // Proof: omitting this comparison accepted a verified receipt for another invocation.
      cold.telemetry.receipt.invocationId !== expected.invocationId ||
      // Proof: omitting this check accepted a schema-valid cold source with empty raw response.
      cold.rawResponse.payload.length === 0 ||
      // Proof: omitting this check accepted cold evidence with no observed reads.
      cold.cold.observedReadIds.length === 0
    ) {
      throw new Error('cold terminal review evidence incomplete or inconsistent');
    }
    return { ...source, cold };
  }
  const evidence = decodeReviewEvidence(source.evidence);
  const cold = decodeColdHarnessOutput(source.cold);
  const informed = decodeInformedHarnessOutput(source.informed);
  const coldArtifact = hashCanonical(cold.cold);
  const derivedSource = {
    executor: informed.telemetry.status === 'verified' ? informed.telemetry.receipt.executor : null,
    priceIdentity:
      informed.telemetry.status === 'verified' ? informed.telemetry.receipt.priceIdentity : null,
    suppliedContextIds: [
      evidence.protocolEvidence.protocol.protocolBlob,
      evidence.protocolEvidence.subject.contentIdentity,
      ...evidence.protocolEvidence.expansion.suppliedContextIds,
    ],
    observedReadIds: [...cold.cold.observedReadIds, ...informed.informed.observedReadIds],
    rawUsage:
      cold.telemetry.status === 'verified' && informed.telemetry.status === 'verified'
        ? [...cold.telemetry.receipt.rawUsage, ...informed.telemetry.receipt.rawUsage]
        : null,
    retention: informed.rawResponse.retention,
  };
  const reportedSource = {
    executor: evidence.receipt.executor,
    priceIdentity: evidence.receipt.priceIdentity,
    suppliedContextIds: evidence.receipt.suppliedContextIds,
    observedReadIds: evidence.receipt.observedReadIds,
    rawUsage: evidence.receipt.rawUsage,
    retention: evidence.rawResponse.retention,
  };
  // Proof: omitting the phase-to-record join accepted a review receipt that retained no reads.
  if (hashCanonical(derivedSource) !== hashCanonical(reportedSource)) {
    throw new Error('review verification source record differs from phase observations');
  }
  // Proof: independent mounted omissions of external scope, journal identity, cold artifact,
  // and nonempty raw response each accepted a malformed review before this guard was restored.
  if (
    evidence.receipt.trust.scope !== 'external-verifier' ||
    evidence.receipt.trust.journalId !== binding.journalId ||
    evidence.receipt.invocationId !== expected.invocationId ||
    cold.invocationId !== expected.invocationId ||
    informed.invocationId !== expected.invocationId ||
    cold.telemetry.status !== 'verified' ||
    informed.telemetry.status !== 'verified' ||
    cold.telemetry.receipt.invocationId !== expected.invocationId ||
    informed.telemetry.receipt.invocationId !== expected.invocationId ||
    hashCanonical(cold.protocol) !== hashCanonical(evidence.protocolEvidence.protocol) ||
    hashCanonical(informed.protocol) !== hashCanonical(evidence.protocolEvidence.protocol) ||
    cold.protocol.protocolBlob !== expected.protocolIdentity ||
    hashCanonical(cold.subject) !== hashCanonical(evidence.protocolEvidence.subject) ||
    hashCanonical(informed.subject) !== hashCanonical(evidence.protocolEvidence.subject) ||
    hashCanonical(cold.cold) !== hashCanonical(evidence.protocolEvidence.cold) ||
    hashCanonical(informed.informed) !== hashCanonical(evidence.protocolEvidence.informed) ||
    informed.coldArtifact !== coldArtifact ||
    evidence.protocolEvidence.expansion.coldJudgmentArtifact !== coldArtifact ||
    hashCanonical(cold.telemetry) !== hashCanonical(evidence.phaseReceipts.cold) ||
    hashCanonical(informed.telemetry) !== hashCanonical(evidence.phaseReceipts.informed) ||
    hashCanonical(cold.actualTools) !== hashCanonical(evidence.phaseTools.cold) ||
    hashCanonical(informed.actualTools) !== hashCanonical(evidence.phaseTools.informed) ||
    hashCanonical([...cold.actualTools, ...informed.actualTools]) !==
      hashCanonical(evidence.actualTools) ||
    cold.rawResponse.payload.length === 0 ||
    informed.rawResponse.payload.length === 0 ||
    evidence.rawResponse.artifact !== hashBytes(informed.rawResponse.payload) ||
    evidence.receipt.rawResponseArtifact !== evidence.rawResponse.artifact ||
    cold.cold.observedReadIds.length === 0 ||
    informed.informed.observedReadIds.length === 0 ||
    // Proof: omitting this condition accepted a passing receipt with an unresolved finding.
    (source.findings.length > 0 && source.status === 'passed')
  ) {
    throw new Error('review verification source evidence incomplete or inconsistent');
  }
  return { ...source, evidence, cold, informed };
}

const DeliveryRecord = type({
  sourceId: /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/,
  deliveryId: /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/,
  payloadDigest: /^[0-9a-f]{64}$/,
  repositoryId: 'number.integer>=1',
  subject: ActivationSubject,
}).onUndeclaredKey('reject');
export type ObservedDelivery = typeof DeliveryRecord.infer;

function subjectKey(subject: ActivationSubject): string {
  if (subject.kind === 'pull-request') return `pr:${String(subject.number)}`;
  if (subject.kind === 'merge-group') return `group:${subject.groupRef}`;
  return `protected:${subject.ref}`;
}

function readRow(database: Database, identity: string): StoredRow | undefined {
  const row: unknown = database
    .query('SELECT * FROM activation_request WHERE request_identity = ?')
    .get(identity);
  return row === null ? undefined : parseOrThrow(StoredRow, row);
}

function storedRequest(row: StoredRow): StoredRequest {
  const request = decodeActivationRequest(row.request_bytes);
  if (
    request.requestIdentity !== row.request_identity ||
    request.repositoryId !== row.repository_id
  ) {
    throw new Error('durable activation request identity differs from stored columns');
  }
  return {
    request,
    stage: row.stage,
    version: row.version,
    leaseEpoch: row.lease_epoch,
    current: row.current === 1,
    evidenceSetIdentity: row.evidence_set_identity,
  };
}

function nowFrom(clock: () => number): number {
  const now = clock();
  if (!Number.isSafeInteger(now) || now < 0)
    throw new Error('activation controller clock malformed');
  return now;
}

function isExpiredLease(expiresAt: number | null, now: number): boolean {
  return expiresAt !== null && expiresAt <= now;
}

function transaction<T>(database: Database, body: () => T): T {
  database.run('BEGIN IMMEDIATE');
  try {
    const answer = body();
    database.run('COMMIT');
    return answer;
  } catch (cause) {
    database.run('ROLLBACK');
    throw cause;
  }
}

function createReviewDispatchTable(database: Database): void {
  // Proof: splitting v4 migration after this table left it behind when the later index conflicted.
  database.run(`CREATE TABLE activation_review_dispatch (
    effect_key TEXT PRIMARY KEY,
    request_identity TEXT NOT NULL,
    plan_identity TEXT NOT NULL,
    review_id TEXT NOT NULL,
    attempt INTEGER NOT NULL CHECK (attempt >= 0),
    invocation_id TEXT NOT NULL,
    cold_obligation_identity TEXT NOT NULL,
    informed_obligation_identity TEXT NOT NULL,
    authority_identity TEXT NOT NULL,
    target_bytes TEXT NOT NULL,
    payload_bytes TEXT NOT NULL,
    payload_digest TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    deadline_at INTEGER NOT NULL,
    max_dispatch_attempts INTEGER NOT NULL CHECK (max_dispatch_attempts >= 1),
    state TEXT NOT NULL CHECK (state = 'reserved'),
    owner_epoch INTEGER NOT NULL CHECK (owner_epoch >= 0),
    owner_id TEXT NOT NULL,
    version INTEGER NOT NULL CHECK (version >= 0),
    UNIQUE (request_identity, review_id, attempt),
    FOREIGN KEY (request_identity, review_id, attempt)
      REFERENCES activation_review_attempt(request_identity, review_id, attempt)
  )`);
  database.run(
    'CREATE INDEX activation_dispatch_request ON activation_review_dispatch(request_identity)',
  );
}

function createReviewDispatchRecoveryTables(database: Database): void {
  // Proof: moving this DDL outside the v5 upgrade transaction left a partial progress table
  // after the subsequent fact-table conflict instead of preserving the complete v5 schema.
  database.run(`CREATE TABLE activation_review_dispatch_progress (
    effect_key TEXT PRIMARY KEY,
    state TEXT NOT NULL CHECK (state IN ('reserved', 'dispatching', 'uncertain', 'acknowledged', 'exhausted')),
    dispatch_attempts INTEGER NOT NULL CHECK (dispatch_attempts >= 0),
    owner_epoch INTEGER NOT NULL CHECK (owner_epoch >= 0),
    owner_id TEXT NOT NULL,
    version INTEGER NOT NULL CHECK (version >= 0),
    FOREIGN KEY (effect_key) REFERENCES activation_review_dispatch(effect_key)
  )`);
  database.run(`CREATE TABLE activation_review_dispatch_fact (
    effect_key TEXT PRIMARY KEY,
    observation_bytes TEXT NOT NULL,
    observation_digest TEXT NOT NULL,
    FOREIGN KEY (effect_key) REFERENCES activation_review_dispatch(effect_key)
  )`);
  database.run(`INSERT INTO activation_review_dispatch_progress (
    effect_key, state, dispatch_attempts, owner_epoch, owner_id, version
  ) SELECT effect_key, 'reserved', 0, owner_epoch, owner_id, 0
    FROM activation_review_dispatch`);
}

function initialize(database: Database): void {
  database.run('PRAGMA busy_timeout = 5000');
  const metadata: unknown = database.query('PRAGMA user_version').get();
  const version = parseOrThrow(type({ user_version: 'number.integer>=0' }), metadata).user_version;
  if (
    version !== 0 &&
    version !== 2 &&
    version !== 3 &&
    version !== 4 &&
    version !== 5 &&
    version !== 6
  )
    // Proof: accepting old version 1 silently reopened storage without durable subject high-water.
    throw new Error(`unsupported activation store schema ${String(version)}`);
  if (version === 0) {
    const existing: unknown = database
      .query("SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'activation_request'")
      .get();
    if (existing !== null)
      throw new Error('unversioned activation request store cannot be defaulted');
    transaction(database, () => {
      database.run(`CREATE TABLE activation_request (
        request_identity TEXT PRIMARY KEY,
        repository_id INTEGER NOT NULL,
        subject_key TEXT NOT NULL,
        request_bytes TEXT NOT NULL,
        bootstrap_identity TEXT NOT NULL,
        stage TEXT NOT NULL,
        version INTEGER NOT NULL,
        lease_epoch INTEGER NOT NULL,
        lease_owner TEXT,
        lease_expires_at INTEGER,
        evaluation_plan_identity TEXT,
        evidence_set_identity TEXT,
        pairing_version INTEGER NOT NULL CHECK (pairing_version IN (0, 1)),
        current INTEGER NOT NULL CHECK (current IN (0, 1))
      )`);
      database.run(
        'CREATE UNIQUE INDEX activation_current_subject ON activation_request(repository_id, subject_key) WHERE current = 1',
      );
      database.run(`CREATE TABLE activation_delivery (
        source_id TEXT NOT NULL,
        delivery_id TEXT NOT NULL,
        payload_digest TEXT NOT NULL,
        PRIMARY KEY (source_id, delivery_id)
      )`);
      database.run(`CREATE TABLE activation_subject (
        repository_id INTEGER NOT NULL,
        subject_key TEXT NOT NULL,
        high_water_generation INTEGER NOT NULL CHECK (high_water_generation >= 0),
        observation_version INTEGER NOT NULL CHECK (observation_version >= 1),
        PRIMARY KEY (repository_id, subject_key)
      )`);
      database.run(`CREATE TABLE activation_obligation (
        request_identity TEXT NOT NULL,
        obligation_identity TEXT NOT NULL,
        kind TEXT NOT NULL,
        review_id TEXT,
        executor_id TEXT NOT NULL,
        protocol_identity TEXT NOT NULL,
        command_identity TEXT,
        phase TEXT,
        attempt INTEGER NOT NULL CHECK (attempt >= 0),
        state TEXT NOT NULL,
        receipt_identity TEXT,
        PRIMARY KEY (request_identity, obligation_identity),
        FOREIGN KEY (request_identity) REFERENCES activation_request(request_identity)
      )`);
      database.run(`CREATE TABLE activation_attempt (
        request_identity TEXT NOT NULL,
        obligation_identity TEXT NOT NULL,
        attempt INTEGER NOT NULL CHECK (attempt >= 0),
        receipt_identity TEXT NOT NULL,
        receipt_bytes TEXT NOT NULL,
        authentication_bytes TEXT NOT NULL,
        status TEXT NOT NULL,
        PRIMARY KEY (request_identity, obligation_identity, attempt),
        UNIQUE (receipt_identity),
        FOREIGN KEY (request_identity, obligation_identity)
          REFERENCES activation_obligation(request_identity, obligation_identity)
      )`);
      database.run(`CREATE TABLE activation_review_attempt (
        request_identity TEXT NOT NULL,
        review_id TEXT NOT NULL,
        attempt INTEGER NOT NULL CHECK (attempt >= 0),
        invocation_id TEXT NOT NULL UNIQUE,
        PRIMARY KEY (request_identity, review_id, attempt),
        FOREIGN KEY (request_identity) REFERENCES activation_request(request_identity)
      )`);
      createReviewDispatchTable(database);
      createReviewDispatchRecoveryTables(database);
      database.run('PRAGMA user_version = 6');
    });
  }
  if (version === 2 || version === 3) {
    // Proof: a late v4 table conflict after the v2 attempt-table writes must leave the
    // original version and complete schema intact, not a committed intermediate v3.
    transaction(database, () => {
      if (version === 2) {
        database.run('ALTER TABLE activation_request ADD COLUMN evidence_set_identity TEXT');
        database.run(`CREATE TABLE activation_attempt (
        request_identity TEXT NOT NULL,
        obligation_identity TEXT NOT NULL,
        attempt INTEGER NOT NULL CHECK (attempt >= 0),
        receipt_identity TEXT NOT NULL,
        receipt_bytes TEXT NOT NULL,
        authentication_bytes TEXT NOT NULL,
        status TEXT NOT NULL,
        PRIMARY KEY (request_identity, obligation_identity, attempt),
        UNIQUE (receipt_identity),
        FOREIGN KEY (request_identity, obligation_identity)
          REFERENCES activation_obligation(request_identity, obligation_identity)
        )`);
      }
      // Proof: legacy unpaired obligations remain readable but cannot inherit a guessed review pair.
      database.run(
        'ALTER TABLE activation_request ADD COLUMN pairing_version INTEGER NOT NULL DEFAULT 0 CHECK (pairing_version IN (0, 1))',
      );
      database.run('ALTER TABLE activation_obligation ADD COLUMN review_id TEXT');
      database.run(`CREATE TABLE activation_review_attempt (
        request_identity TEXT NOT NULL,
        review_id TEXT NOT NULL,
        attempt INTEGER NOT NULL CHECK (attempt >= 0),
        invocation_id TEXT NOT NULL UNIQUE,
        PRIMARY KEY (request_identity, review_id, attempt),
        FOREIGN KEY (request_identity) REFERENCES activation_request(request_identity)
      )`);
      createReviewDispatchTable(database);
      createReviewDispatchRecoveryTables(database);
      database.run('PRAGMA user_version = 6');
    });
  }
  if (version === 4) {
    transaction(database, () => {
      createReviewDispatchTable(database);
      createReviewDispatchRecoveryTables(database);
      database.run('PRAGMA user_version = 6');
    });
  }
  if (version === 5) {
    transaction(database, () => {
      createReviewDispatchRecoveryTables(database);
      database.run('PRAGMA user_version = 6');
    });
  }
}

/**
 * Owns local durable request stages. The independently controlled deployment, authenticated
 * provider and publisher remain required before this controller can issue trusted admission.
 */
export class ActivationController {
  readonly #database: Database;

  constructor(private readonly options: ActivationControllerOptions) {
    this.#database = new Database(options.databasePath, { create: true, strict: true });
    initialize(this.#database);
  }

  close(): void {
    this.#database.close();
  }

  #subjectVersion(repositoryId: number, key: string): number {
    const observed: unknown = this.#database
      .query(
        'SELECT observation_version FROM activation_subject WHERE repository_id = ? AND subject_key = ?',
      )
      .get(repositoryId, key);
    return observed === null
      ? 0
      : parseOrThrow(type({ observation_version: 'number.integer>=1' }), observed)
          .observation_version;
  }

  observe(candidate: ObservedCandidate): ActivationRequest {
    const frozen = prepareObservedRequest(this.options.bootstrapPath, this.options.pin, candidate);
    nowFrom(this.options.clock);
    return transaction(this.#database, () => this.#observeIn(candidate, frozen.request));
  }

  #observeIn(candidate: ObservedCandidate, frozen: ActivationRequest): ActivationRequest {
    const key = subjectKey(candidate.subject);
    const active: unknown = this.#database
      .query(
        'SELECT * FROM activation_request WHERE repository_id = ? AND subject_key = ? AND current = 1',
      )
      .get(candidate.repositoryId, key);
    const previous = active === null ? undefined : parseOrThrow(StoredRow, active);
    const subjectGeneration: unknown = this.#database
      .query(
        'SELECT high_water_generation FROM activation_subject WHERE repository_id = ? AND subject_key = ?',
      )
      .get(candidate.repositoryId, key);
    const highWater =
      subjectGeneration === null
        ? 0
        : parseOrThrow(type({ high_water_generation: 'number.integer>=0' }), subjectGeneration)
            .high_water_generation;
    if (previous !== undefined) {
      const current = storedRequest(previous).request;
      // Proof: omitting this check let a missing trusted high-water row silently reuse a current request.
      if (highWater < current.auditGeneration)
        throw new Error('activation subject generation absent');
      const { auditGeneration: _generation, requestIdentity: _oldDigest, ...oldIdentity } = current;
      const {
        auditGeneration: _baseGeneration,
        requestIdentity: _newDigest,
        ...newIdentity
      } = frozen;
      // Proof: omitting the pairing version reused the exact old request identity for
      // authoritative same-tuple legacy history instead of allocating a new generation.
      if (
        previous.bootstrap_identity === this.options.pin.identity &&
        previous.pairing_version === 1 &&
        hashCanonical(oldIdentity) === hashCanonical(newIdentity)
      ) {
        // Proof: omitting this fence let an older held B source read supersede a newer unchanged A observation.
        this.#database
          .query(
            'UPDATE activation_subject SET observation_version = observation_version + 1 WHERE repository_id = ? AND subject_key = ?',
          )
          .run(candidate.repositoryId, key);
        return current;
      }
    }
    const configuration = readBootstrapConfiguration(this.options.bootstrapPath, this.options.pin);
    // Proof: removing the durable high-water read made close/reopen reuse the first request PK.
    const generation = Math.max(configuration.authorityGeneration, highWater + 1);
    if (previous !== undefined && generation <= storedRequest(previous).request.auditGeneration) {
      throw new Error('activation subject generation regressed');
    }
    const next = createActivationRequest({
      ...candidate,
      authorityIdentity: this.options.pin.identity,
      auditGeneration: generation,
    });
    if (previous !== undefined) {
      this.#database
        .query(
          "UPDATE activation_request SET current = 0, stage = 'superseded', version = version + 1 WHERE request_identity = ? AND current = 1",
        )
        .run(previous.request_identity);
    }
    this.#database
      .query(
        `INSERT INTO activation_request (
          request_identity, repository_id, subject_key, request_bytes, bootstrap_identity,
          stage, version, lease_epoch, lease_owner, lease_expires_at, pairing_version, current
        ) VALUES (?, ?, ?, ?, ?, 'observed', 0, 0, NULL, NULL, 1, 1)`,
      )
      .run(next.identity, candidate.repositoryId, key, next.bytes, this.options.pin.identity);
    // Proof: omitting the high-water write let a restarted controller reuse a closed request PK.
    this.#database
      .query(
        `INSERT INTO activation_subject (repository_id, subject_key, high_water_generation, observation_version)
          VALUES (?, ?, ?, 1) ON CONFLICT(repository_id, subject_key)
          DO UPDATE SET high_water_generation = excluded.high_water_generation,
                        observation_version = activation_subject.observation_version + 1`,
      )
      .run(candidate.repositoryId, key, generation);
    return next.request;
  }

  /** Re-observes source truth; an event payload alone never chooses the candidate request. */
  async observeDelivery(input: ObservedDelivery): Promise<ActivationRequest | undefined> {
    const delivery = parseOrThrow(DeliveryRecord, input);
    return this.#observeAuthoritative(delivery.repositoryId, delivery.subject, delivery);
  }

  async #observeAuthoritative(
    repositoryId: number,
    subject: ActivationSubject,
    delivery?: ObservedDelivery,
  ): Promise<ActivationRequest | undefined> {
    const key = subjectKey(subject);
    for (let observationAttempt = 0; observationAttempt < 3; observationAttempt += 1) {
      const observedVersion = this.#subjectVersion(repositoryId, key);
      const authoritative = await this.options.currentCandidate(repositoryId, subject);
      if (
        authoritative.kind === 'ready' &&
        (authoritative.candidate.repositoryId !== repositoryId ||
          subjectKey(authoritative.candidate.subject) !== key)
      ) {
        // Proof: omitting this source-subject join let a delayed group delivery select another PR.
        throw new Error('authoritative candidate differs from delivery subject');
      }
      const frozen =
        authoritative.kind === 'ready'
          ? prepareObservedRequest(
              this.options.bootstrapPath,
              this.options.pin,
              authoritative.candidate,
            )
          : undefined;
      const accepted = transaction(this.#database, () => {
        // Proof: removing the subject-version comparison let a delayed A response supersede newer B.
        if (this.#subjectVersion(repositoryId, key) !== observedVersion) {
          return { kind: 'stale' as const };
        }
        const recorded: unknown =
          delivery === undefined
            ? null
            : this.#database
                .query(
                  'SELECT payload_digest FROM activation_delivery WHERE source_id = ? AND delivery_id = ?',
                )
                .get(delivery.sourceId, delivery.deliveryId);
        if (delivery !== undefined && recorded !== null) {
          const prior = parseOrThrow(type({ payload_digest: /^[0-9a-f]{64}$/ }), recorded);
          if (prior.payload_digest !== delivery.payloadDigest) {
            // Proof: omission accepted the same authenticated delivery ID with changed bytes.
            throw new Error('delivery ID reused with different payload');
          }
        }
        let request: ActivationRequest | undefined;
        if (authoritative.kind === 'ready' && frozen !== undefined) {
          request = this.#observeIn(authoritative.candidate, frozen.request);
        } else {
          this.#database
            .query(
              "UPDATE activation_request SET current = 0, stage = 'superseded', version = version + 1 WHERE repository_id = ? AND subject_key = ? AND current = 1",
            )
            .run(repositoryId, key);
          // Proof: without a first-close tombstone, held ready at version 0 committed after close.
          // Proof: skipping a repeated closed observation let an older held ready response reopen the subject.
          this.#database
            .query(
              `INSERT INTO activation_subject (repository_id, subject_key, high_water_generation, observation_version)
                VALUES (?, ?, 0, 1) ON CONFLICT(repository_id, subject_key)
                DO UPDATE SET observation_version = activation_subject.observation_version + 1`,
            )
            .run(repositoryId, key);
        }
        if (delivery !== undefined && recorded === null) {
          this.#database
            .query(
              'INSERT INTO activation_delivery (source_id, delivery_id, payload_digest) VALUES (?, ?, ?)',
            )
            .run(delivery.sourceId, delivery.deliveryId, delivery.payloadDigest);
        }
        return { kind: 'accepted' as const, request };
      });
      if (accepted.kind === 'accepted') {
        return accepted.request;
      }
    }
    throw new Error('authoritative subject observation did not converge');
  }

  async reconcileReady(): Promise<readonly ActivationRequest[]> {
    const candidates = await this.options.readyCandidates();
    const subjects = new Map<
      string,
      { readonly repositoryId: number; readonly subject: ActivationSubject }
    >();
    for (const candidate of candidates) {
      const repositoryId = parseOrThrow(type('number.integer>=1'), candidate.repositoryId);
      const subject = parseOrThrow(ActivationSubject, candidate.subject);
      subjects.set(`${String(repositoryId)}:${subjectKey(subject)}`, { repositoryId, subject });
    }
    // Proof: polling only ready candidates left a durable active request current after a lost close event.
    const activeRows: unknown[] = this.#database
      .query('SELECT * FROM activation_request WHERE current = 1')
      .all();
    for (const activeRow of activeRows) {
      const active = storedRequest(parseOrThrow(StoredRow, activeRow)).request;
      subjects.set(`${String(active.repositoryId)}:${subjectKey(active.subject)}`, {
        repositoryId: active.repositoryId,
        subject: active.subject,
      });
    }
    const requests: ActivationRequest[] = [];
    for (const { repositoryId, subject } of subjects.values()) {
      // Proof: using the timer-listed candidate directly persisted stale A after source advanced to B.
      const request = await this.#observeAuthoritative(repositoryId, subject);
      if (request !== undefined) requests.push(request);
    }
    return requests;
  }

  readRequest(identity: string): StoredRequest | undefined {
    const row = readRow(this.#database, identity);
    return row === undefined ? undefined : storedRequest(row);
  }

  listRequests(): readonly StoredRequest[] {
    const rows: unknown[] = this.#database
      .query('SELECT * FROM activation_request ORDER BY rowid')
      .all();
    return rows.map((row) => storedRequest(parseOrThrow(StoredRow, row)));
  }

  listObligations(
    identity: string,
  ): readonly { readonly identity: string; readonly kind: 'check' | 'audit' }[] {
    const rows: unknown[] = this.#database
      .query('SELECT * FROM activation_obligation WHERE request_identity = ? ORDER BY rowid')
      .all(identity);
    return rows.map((row) => {
      const obligation = parseOrThrow(StoredObligation, row);
      return { identity: obligation.obligation_identity, kind: obligation.kind };
    });
  }

  claim(identity: string, workerId: string, leaseMilliseconds: number): RequestLease {
    if (!workerId || !Number.isSafeInteger(leaseMilliseconds) || leaseMilliseconds < 1) {
      throw new Error('activation worker lease malformed');
    }
    const now = nowFrom(this.options.clock);
    return transaction(this.#database, () => {
      const row = readRow(this.#database, identity);
      if (row === undefined) throw new Error('activation request absent');
      // Proof: removing this guard made a legacy-marked observed request acquire a lease.
      if (row.pairing_version !== 1) throw new Error('legacy review pairing absent');
      // Proof: omitting current changed the superseded-claim refusal to a stage refusal.
      if (row.current !== 1) throw new Error('activation request superseded');
      // Proof: omitting stage granted a new lease to an already evaluating request.
      if (row.stage !== 'observed') throw new Error('activation request stage changed');
      // Proof: omitting the active-lease check let a second worker replace an unexpired owner.
      if (row.lease_owner !== null && row.lease_expires_at !== null && row.lease_expires_at > now) {
        throw new Error('activation request lease held');
      }
      const leaseEpoch = row.lease_epoch + 1;
      const version = row.version + 1;
      this.#database
        .query(
          'UPDATE activation_request SET lease_owner = ?, lease_expires_at = ?, lease_epoch = ?, version = ? WHERE request_identity = ?',
        )
        .run(workerId, now + leaseMilliseconds, leaseEpoch, version, identity);
      return { requestIdentity: identity, leaseEpoch, version, workerId };
    });
  }

  /** Renews or takes over only a current evaluating request; each acquisition fences old work. */
  recoverEvaluationLease(
    identity: string,
    workerId: string,
    leaseMilliseconds: number,
  ): RequestLease {
    if (!workerId || !Number.isSafeInteger(leaseMilliseconds) || leaseMilliseconds < 1) {
      throw new Error('activation worker lease malformed');
    }
    const now = nowFrom(this.options.clock);
    const expiresAt = now + leaseMilliseconds;
    if (!Number.isSafeInteger(expiresAt))
      throw new Error('activation worker lease expiry malformed');
    return transaction(this.#database, () => {
      const row = readRow(this.#database, identity);
      if (row === undefined) throw new Error('activation request absent');
      // Proof: omission renewed unpaired history instead of requiring a trusted replan.
      if (row.pairing_version !== 1) throw new Error('legacy review pairing absent');
      // Proof: omission recovered a superseded row whose stale stage remained evaluating.
      if (row.current !== 1) throw new Error('activation request superseded');
      // Proof: omission recovered an observed request before its obligations were frozen.
      if (row.stage !== 'evaluating') throw new Error('activation request is not evaluating');
      const request = storedRequest(row).request;
      const subject: unknown = this.#database
        .query(
          'SELECT high_water_generation FROM activation_subject WHERE repository_id = ? AND subject_key = ?',
        )
        .get(request.repositoryId, subjectKey(request.subject));
      // Proof: omission recovered a request after durable subject high-water advanced.
      if (
        subject === null ||
        parseOrThrow(type({ high_water_generation: 'number.integer>=0' }), subject)
          .high_water_generation !== request.auditGeneration
      ) {
        throw new Error('activation request generation changed');
      }
      // Proof: omission recovered after the pinned bootstrap file changed on disk.
      readBootstrapConfiguration(this.options.bootstrapPath, this.options.pin);
      // Proof: omission renewed a request under a second valid pinned bootstrap authority.
      if (
        row.bootstrap_identity !== this.options.pin.identity ||
        request.authorityIdentity !== this.options.pin.identity
      ) {
        throw new Error('activation request authority changed');
      }
      // Proof: omission let another worker take an unexpired evaluating lease.
      if (
        row.lease_owner !== null &&
        row.lease_owner !== workerId &&
        row.lease_expires_at !== null &&
        row.lease_expires_at > now
      ) {
        throw new Error('activation request lease held');
      }
      // Proof: omission let a worker renew a persisted lease with absent expiry.
      if (row.lease_owner !== null && row.lease_expires_at === null) {
        throw new Error('activation request lease expiry absent');
      }
      const leaseEpoch = row.lease_epoch + 1;
      const version = row.version + 1;
      this.#database
        .query(
          'UPDATE activation_request SET lease_owner = ?, lease_expires_at = ?, lease_epoch = ?, version = ? WHERE request_identity = ?',
        )
        .run(workerId, expiresAt, leaseEpoch, version, identity);
      return { requestIdentity: identity, leaseEpoch, version, workerId };
    });
  }

  /** Freezes trusted check and audit obligations; later transitions require their own evidence APIs. */
  beginEvaluation(lease: RequestLease): StoredRequest {
    const now = nowFrom(this.options.clock);
    // Proof: splitting the transaction after the check INSERT left that row when the audit INSERT failed.
    return transaction(this.#database, () => {
      const row = readRow(this.#database, lease.requestIdentity);
      if (row === undefined) throw new Error('activation request absent');
      // Proof: removing this guard froze new obligations under a legacy-marked lease.
      if (row.pairing_version !== 1) throw new Error('legacy review pairing absent');
      // Proof: omitting current changed the superseded-evaluation refusal to a lease refusal.
      if (row.current !== 1) throw new Error('activation request superseded');
      // Proof: independently omitting epoch, owner, version, expiry and null-expiry checks
      // let the corresponding stale or malformed lease advance to evaluating.
      if (
        row.lease_epoch !== lease.leaseEpoch ||
        row.lease_owner !== lease.workerId ||
        row.version !== lease.version ||
        row.lease_expires_at === null ||
        isExpiredLease(row.lease_expires_at, now)
      ) {
        throw new Error('activation request lease changed');
      }
      // Proof: omitting stage retried evaluation until its obligation PK failed instead of refusing.
      if (row.stage !== 'observed') {
        throw new Error('activation request stage changed');
      }
      const request = storedRequest(row).request;
      // Proof: omitting this reread froze obligations after the pinned bootstrap disappeared.
      readBootstrapConfiguration(this.options.bootstrapPath, this.options.pin);
      // Proof: omitting this authority join froze old-request obligations under a new valid pin.
      if (request.authorityIdentity !== this.options.pin.identity) {
        throw new Error('activation request authority changed');
      }
      const plan = parseOrThrow(EvaluationPlan, this.options.selectObligations(request));
      // Proof: omitting the plan/request binding let another request's obligations enter evaluation.
      if (
        plan.requestIdentity !== request.requestIdentity ||
        plan.policyIdentity !== request.policyIdentity
      ) {
        throw new Error('evaluation obligations differ from request policy');
      }
      const identities = new Set(plan.obligations.map((obligation) => obligation.identity));
      // Proof: removing either kind or duplicate guard let an incomplete/ambiguous plan advance.
      if (
        identities.size !== plan.obligations.length ||
        !plan.obligations.some((obligation) => obligation.kind === 'check') ||
        !plan.obligations.some((obligation) => obligation.kind === 'audit')
      ) {
        throw new Error('evaluation obligations incomplete or duplicated');
      }
      const reviewPhases = new Map<string, Set<'cold' | 'informed'>>();
      for (const obligation of plan.obligations) {
        if (obligation.kind !== 'audit') continue;
        const phases = reviewPhases.get(obligation.reviewId) ?? new Set();
        // Proof: omitting the pair/cardinality guard let a lone cold or duplicate phase freeze.
        if (phases.has(obligation.phase)) throw new Error('selected review pair duplicated');
        phases.add(obligation.phase);
        reviewPhases.set(obligation.reviewId, phases);
      }
      if (
        [...reviewPhases.values()].some(
          (phases) => phases.size !== 2 || !phases.has('cold') || !phases.has('informed'),
        )
      ) {
        throw new Error('selected review pair incomplete');
      }
      for (const obligation of plan.obligations) {
        this.#database
          .query(
            `INSERT INTO activation_obligation (
            request_identity, obligation_identity, kind, review_id, executor_id, protocol_identity,
            command_identity, phase, attempt, state, receipt_identity
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'pending', NULL)`,
          )
          .run(
            request.requestIdentity,
            obligation.identity,
            obligation.kind,
            obligation.kind === 'audit' ? obligation.reviewId : null,
            obligation.executorId,
            obligation.protocolIdentity,
            obligation.kind === 'check' ? obligation.commandIdentity : null,
            obligation.kind === 'audit' ? obligation.phase : null,
          );
      }
      this.#database
        .query(
          "UPDATE activation_request SET stage = 'evaluating', evaluation_plan_identity = ?, version = version + 1 WHERE request_identity = ?",
        )
        .run(hashCanonical(plan), lease.requestIdentity);
      const advanced = readRow(this.#database, lease.requestIdentity);
      if (advanced === undefined) throw new Error('advanced activation request absent');
      return storedRequest(advanced);
    });
  }

  #selectedCheckIn(lease: RequestLease, obligationIdentity: string) {
    const row = readRow(this.#database, lease.requestIdentity);
    // Proof: independently omitting current or evaluating stage returned a
    // selected-check descriptor for a superseded or terminal request.
    if (row?.current !== 1 || row.stage !== 'evaluating') {
      throw new Error('selected check request is not current evaluating');
    }
    // Proof: omitting pairing refused no longer and prepared a legacy review plan.
    if (row.pairing_version !== 1) throw new Error('legacy review pairing absent');
    const now = nowFrom(this.options.clock);
    // Proof: separate epoch, owner, null-expiry and elapsed-expiry omissions
    // each returned a descriptor after the held resolver changed that lease field.
    if (
      row.lease_epoch !== lease.leaseEpoch ||
      row.lease_owner !== lease.workerId ||
      row.lease_expires_at === null ||
      isExpiredLease(row.lease_expires_at, now)
    ) {
      throw new Error('selected check lease changed');
    }
    const request = storedRequest(row).request;
    // Proof: omitting the pinned-bootstrap reread returned a descriptor after
    // the trusted bootstrap file disappeared during manifest resolution.
    readBootstrapConfiguration(this.options.bootstrapPath, this.options.pin);
    // Proof: omitting authority equality prepared under a changed stored pin.
    if (
      row.bootstrap_identity !== this.options.pin.identity ||
      request.authorityIdentity !== this.options.pin.identity
    ) {
      throw new Error('selected check authority changed');
    }
    const subject: unknown = this.#database
      .query(
        'SELECT high_water_generation FROM activation_subject WHERE repository_id = ? AND subject_key = ?',
      )
      .get(request.repositoryId, subjectKey(request.subject));
    // Proof: separate changed and missing high-water rows each returned a
    // descriptor for the wrong subject generation when this fence was omitted.
    if (
      subject === null ||
      parseOrThrow(type({ high_water_generation: 'number.integer>=0' }), subject)
        .high_water_generation !== request.auditGeneration
    ) {
      throw new Error('selected check generation changed');
    }
    const rawObligations: unknown[] = this.#database
      .query('SELECT * FROM activation_obligation WHERE request_identity = ? ORDER BY rowid')
      .all(request.requestIdentity);
    const obligations = rawObligations.map((entry) => parseOrThrow(StoredObligation, entry));
    // Proof: omitting reconstruction returned a descriptor after an unrelated
    // frozen audit row changed while the selected check row stayed intact.
    if (
      row.evaluation_plan_identity === null ||
      row.evaluation_plan_identity !== hashCanonical(reconstructFrozenPlan(request, obligations))
    ) {
      throw new Error('selected check frozen plan changed');
    }
    const matches = obligations.filter((entry) => entry.obligation_identity === obligationIdentity);
    if (matches.length !== 1) {
      throw new Error('selected check obligation unavailable');
    }
    const selected = matches[0];
    // Proof: omitting this selected check guard returned a descriptor for a
    // no-longer-pending obligation after the resolver wait.
    if (
      selected.kind !== 'check' ||
      selected.command_identity === null ||
      selected.state !== 'pending'
    ) {
      throw new Error('selected check obligation unavailable');
    }
    return {
      requestIdentity: request.requestIdentity,
      obligationIdentity: selected.obligation_identity,
      attempt: selected.attempt,
      commandIdentity: selected.command_identity,
      planIdentity: row.evaluation_plan_identity,
      executorId: selected.executor_id,
      protocolIdentity: selected.protocol_identity,
    };
  }

  /** Resolves a frozen check manifest without granting permission to launch a worker. */
  async prepareSelectedCheck(
    lease: RequestLease,
    obligationIdentity: string,
  ): Promise<PreparedSelectedCheck> {
    const selected = transaction(this.#database, () =>
      this.#selectedCheckIn(lease, obligationIdentity),
    );
    const resolver = this.options.resolveCheckManifest;
    if (resolver === undefined) throw new Error('check invocation manifest resolver absent');
    let bytes: unknown;
    try {
      bytes = await resolver(selected.commandIdentity);
    } catch (cause) {
      if (cause instanceof CheckManifestRefusal) throw cause;
      if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') {
        throw new Error('check invocation manifest absent', { cause });
      }
      throw new Error('check invocation manifest unreadable', { cause });
    }
    const manifest = decodeCheckInvocationManifest(bytes, selected.commandIdentity);
    const current = transaction(this.#database, () =>
      this.#selectedCheckIn(lease, obligationIdentity),
    );
    // Proof: omitting exact attempt equality after resolution returned the
    // old attempt's prepared descriptor when only the selected attempt advanced.
    if (hashCanonical(current) !== hashCanonical(selected)) {
      throw new Error('selected check changed during manifest resolution');
    }
    return { ...current, manifest };
  }

  /** Reserves one authenticated invocation for a frozen review pair before external dispatch. */
  registerReviewAttempt(
    lease: RequestLease,
    reviewId: string,
    attempt: number,
    invocationId: string,
  ): ReviewAttemptRegistration {
    const registration = parseOrThrow(
      type({ reviewId: 'string>=1', attempt: 'number.integer>=0', invocationId: 'string>=1' }),
      { reviewId, attempt, invocationId },
    );
    return transaction(this.#database, () => this.#registerReviewAttemptIn(lease, registration));
  }

  #registerReviewAttemptIn(
    lease: RequestLease,
    registration: {
      readonly reviewId: string;
      readonly attempt: number;
      readonly invocationId: string;
    },
  ): ReviewAttemptRegistration {
    const row = readRow(this.#database, lease.requestIdentity);
    if (row === undefined) throw new Error('activation request absent');
    // Proof: removing this guard registered an invocation on unpaired history.
    if (row.pairing_version !== 1) throw new Error('legacy review pairing absent');
    // Proof: omission registered an invocation on a superseded row whose stale stage
    // was deliberately held at evaluating in the mounted two-generation fixture.
    if (row.current !== 1) throw new Error('activation request superseded');
    // Proof: omission registered an invocation after the request left evaluating.
    if (row.stage !== 'evaluating') throw new Error('activation request is not evaluating');
    const now = nowFrom(this.options.clock);
    // Proof: independently omitting epoch, owner, null-expiry or elapsed-expiry checks
    // registered an invocation for the corresponding stale/malformed lease.
    if (
      row.lease_epoch !== lease.leaseEpoch ||
      row.lease_owner !== lease.workerId ||
      row.lease_expires_at === null ||
      isExpiredLease(row.lease_expires_at, now)
    ) {
      throw new Error('activation request lease changed');
    }
    const request = storedRequest(row).request;
    // Proof: omitting the pinned-file reread registered an invocation after bootstrap vanished.
    readBootstrapConfiguration(this.options.bootstrapPath, this.options.pin);
    // Proof: omission registered an invocation under a second valid pinned authority.
    if (request.authorityIdentity !== this.options.pin.identity) {
      throw new Error('activation request authority changed');
    }
    const rawPhases: unknown[] = this.#database
      .query(
        "SELECT * FROM activation_obligation WHERE request_identity = ? AND review_id = ? AND kind = 'audit' ORDER BY obligation_identity",
      )
      .all(request.requestIdentity, registration.reviewId);
    const phases = rawPhases.map((entry) => parseOrThrow(StoredObligation, entry));
    // Proof: omitting the attempt comparison let an unreserved attempt-1 invocation register;
    // the selected-pair test refused a missing/duplicate phase before any registration.
    if (
      phases.length !== 2 ||
      !phases.some((phase) => phase.phase === 'cold') ||
      !phases.some((phase) => phase.phase === 'informed') ||
      phases.some((phase) => phase.attempt !== registration.attempt)
    ) {
      throw new Error('review attempt differs from frozen pair');
    }
    const existing: unknown = this.#database
      .query(
        'SELECT * FROM activation_review_attempt WHERE request_identity = ? AND review_id = ? AND attempt = ?',
      )
      .get(request.requestIdentity, registration.reviewId, registration.attempt);
    if (existing !== null) {
      const prior = parseOrThrow(StoredReviewAttempt, existing);
      // Proof: changing the invocation for an already registered review attempt refused instead of reminting authority.
      if (prior.invocation_id !== registration.invocationId) {
        throw new Error('review attempt registration conflicts');
      }
      return { requestIdentity: request.requestIdentity, ...registration };
    }
    const borrowed: unknown = this.#database
      .query('SELECT * FROM activation_review_attempt WHERE invocation_id = ?')
      .get(registration.invocationId);
    // Proof: omitting the named cross-review refusal surfaced SQLite UNIQUE instead of
    // the modeled pre-dispatch conflict in the mounted two-review registration test.
    if (borrowed !== null) throw new Error('review invocation already registered');
    this.#database
      .query(
        'INSERT INTO activation_review_attempt (request_identity, review_id, attempt, invocation_id) VALUES (?, ?, ?, ?)',
      )
      .run(
        request.requestIdentity,
        registration.reviewId,
        registration.attempt,
        registration.invocationId,
      );
    return { requestIdentity: request.requestIdentity, ...registration };
  }

  /** Atomically registers one review invocation and reserves its immutable logical dispatch. */
  reserveReviewDispatch(
    lease: RequestLease,
    input: ReviewDispatchInput,
  ): ReviewDispatchReservation {
    // Proof: omitting strict input parsing accepted a caller-supplied reviewer target override.
    const reservation = parseOrThrow(ReviewDispatchInput, input);
    // Proof: splitting this transaction after registration retained an invocation when the
    // real dispatch INSERT failed, instead of restoring both rows together.
    return transaction(this.#database, () => {
      const registered = this.#registerReviewAttemptIn(lease, reservation);
      const row = readRow(this.#database, registered.requestIdentity);
      // Proof: omitting the absent-plan check changed the modeled refusal to a later
      // SQLite NOT NULL failure; the partial registration still rolled back.
      if (row?.evaluation_plan_identity == null)
        throw new Error('review dispatch evaluation plan absent');
      const request = storedRequest(row).request;
      const frozenRows: unknown[] = this.#database
        .query('SELECT * FROM activation_obligation WHERE request_identity = ? ORDER BY rowid')
        .all(request.requestIdentity);
      const frozenObligations = frozenRows.map((entry) => parseOrThrow(StoredObligation, entry));
      // Proof: omitting this persisted-plan join reserved an invocation after a cold
      // obligation identity changed while the original plan digest remained stored.
      if (
        row.evaluation_plan_identity !==
        hashCanonical(reconstructFrozenPlan(request, frozenObligations))
      )
        throw new Error('review dispatch differs from frozen evaluation plan');
      const subject: unknown = this.#database
        .query(
          'SELECT high_water_generation FROM activation_subject WHERE repository_id = ? AND subject_key = ?',
        )
        .get(request.repositoryId, subjectKey(request.subject));
      // Proof: omitting the generation comparison reserved a stale dispatch. Omitting
      // the absent-subject arm changed its modeled refusal to an ArkType null error.
      if (
        subject === null ||
        parseOrThrow(type({ high_water_generation: 'number.integer>=0' }), subject)
          .high_water_generation !== request.auditGeneration
      )
        throw new Error('review dispatch generation changed');
      const bootstrap = readBootstrapConfiguration(this.options.bootstrapPath, this.options.pin);
      // Proof: omission reserved a dispatch after the request's stored authority row changed.
      if (
        row.bootstrap_identity !== this.options.pin.identity ||
        request.authorityIdentity !== this.options.pin.identity
      )
        throw new Error('review dispatch authority changed');
      const now = nowFrom(this.options.clock);
      // Proof: omission reserved an already elapsed deadline.
      if (reservation.deadlineAt <= now) throw new Error('review dispatch deadline elapsed');
      const phases = frozenObligations.filter(
        (entry) => entry.kind === 'audit' && entry.review_id === reservation.reviewId,
      );
      const cold = phases.find((phase) => phase.phase === 'cold');
      const informed = phases.find((phase) => phase.phase === 'informed');
      // Proof: omission reserved a cold phase with a foreign executor despite the pinned target.
      if (
        phases.length !== 2 ||
        cold === undefined ||
        informed === undefined ||
        cold.attempt !== reservation.attempt ||
        informed.attempt !== reservation.attempt ||
        cold.executor_id !== bootstrap.reviewer.executorId ||
        informed.executor_id !== bootstrap.reviewer.executorId
      )
        throw new Error('review dispatch frozen pair differs from authority');
      // Proof: omission reserved a valid frozen pair whose protocol could never
      // authenticate against the pinned reviewer protocol in the mounted owner.
      if (
        cold.protocol_identity !== bootstrap.reviewer.protocolIdentity ||
        informed.protocol_identity !== bootstrap.reviewer.protocolIdentity
      )
        throw new Error('review dispatch protocol differs from pinned reviewer');
      const { target, targetBytes, payloadBytes, payloadDigest, effectKey } =
        deriveDispatchIdentity(
          request,
          row.evaluation_plan_identity,
          reservation,
          cold,
          informed,
          bootstrap,
          this.options.pin.identity,
        );
      const existing: unknown = this.#database
        .query('SELECT * FROM activation_review_dispatch WHERE effect_key = ?')
        .get(effectKey);
      if (existing !== null) {
        const prior = parseOrThrow(StoredReviewDispatch, existing);
        // Proof: independently omitting target, payload or retry-budget comparisons accepted
        // conflicting bytes for the same deterministic effect key on mounted replay.
        if (
          prior.request_identity !== request.requestIdentity ||
          prior.plan_identity !== row.evaluation_plan_identity ||
          prior.review_id !== reservation.reviewId ||
          prior.attempt !== reservation.attempt ||
          prior.invocation_id !== reservation.invocationId ||
          prior.cold_obligation_identity !== cold.obligation_identity ||
          prior.informed_obligation_identity !== informed.obligation_identity ||
          prior.authority_identity !== this.options.pin.identity ||
          prior.target_bytes !== targetBytes ||
          prior.payload_bytes !== payloadBytes ||
          prior.payload_digest !== payloadDigest ||
          prior.deadline_at !== reservation.deadlineAt ||
          prior.max_dispatch_attempts !== reservation.maxDispatchAttempts
        )
          throw new Error('review dispatch reservation conflicts');
        return {
          effectKey,
          requestIdentity: request.requestIdentity,
          target,
          payloadBytes: prior.payload_bytes,
          payloadDigest: prior.payload_digest,
          createdAt: prior.created_at,
          deadlineAt: prior.deadline_at,
          maxDispatchAttempts: prior.max_dispatch_attempts,
        };
      }
      this.#database
        .query(
          `INSERT INTO activation_review_dispatch (
        effect_key, request_identity, plan_identity, review_id, attempt, invocation_id,
        cold_obligation_identity, informed_obligation_identity, authority_identity,
        target_bytes, payload_bytes, payload_digest, created_at, deadline_at,
        max_dispatch_attempts, state, owner_epoch, owner_id, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'reserved', ?, ?, 0)`,
        )
        .run(
          effectKey,
          request.requestIdentity,
          row.evaluation_plan_identity,
          reservation.reviewId,
          reservation.attempt,
          reservation.invocationId,
          cold.obligation_identity,
          informed.obligation_identity,
          this.options.pin.identity,
          targetBytes,
          payloadBytes,
          payloadDigest,
          now,
          reservation.deadlineAt,
          reservation.maxDispatchAttempts,
          lease.leaseEpoch,
          lease.workerId,
        );
      this.#database
        .query(
          `INSERT INTO activation_review_dispatch_progress (
          effect_key, state, dispatch_attempts, owner_epoch, owner_id, version
        ) VALUES (?, 'reserved', 0, ?, ?, 0)`,
        )
        .run(effectKey, lease.leaseEpoch, lease.workerId);
      return {
        effectKey,
        requestIdentity: request.requestIdentity,
        target,
        payloadBytes,
        payloadDigest,
        createdAt: now,
        deadlineAt: reservation.deadlineAt,
        maxDispatchAttempts: reservation.maxDispatchAttempts,
      };
    });
  }

  #dispatchRowsIn(effectKey: string): DispatchRows {
    const rawReservation: unknown = this.#database
      .query('SELECT * FROM activation_review_dispatch WHERE effect_key = ?')
      .get(effectKey);
    if (rawReservation === null) throw new Error('review dispatch reservation absent');
    const stored = parseOrThrow(StoredReviewDispatch, rawReservation);
    const rawProgress: unknown = this.#database
      .query('SELECT * FROM activation_review_dispatch_progress WHERE effect_key = ?')
      .get(effectKey);
    // Proof: synthesizing a missing progress row reached the provider query; bypassing
    // schema validation for malformed progress likewise reached the send path.
    if (rawProgress === null) throw new Error('review dispatch progress absent');
    const progress = parseOrThrow(StoredDispatchProgress, rawProgress);
    // Proof: changing only the persisted digest reached send when this check was omitted.
    if (hashBytes(stored.payload_bytes) !== stored.payload_digest)
      throw new Error('review dispatch payload digest changed');
    const target = parseOrThrow(LogicalReviewTarget, JSON.parse(stored.target_bytes));
    const reservation: ReviewDispatchReservation = {
      effectKey: stored.effect_key,
      requestIdentity: stored.request_identity,
      target,
      payloadBytes: stored.payload_bytes,
      payloadDigest: stored.payload_digest,
      createdAt: stored.created_at,
      deadlineAt: stored.deadline_at,
      maxDispatchAttempts: stored.max_dispatch_attempts,
    };
    return { stored, progress, reservation };
  }

  #historicalBootstrapIn(authorityIdentity: string) {
    const registryPin = this.options.historicalAuthorityRegistry;
    // Proof: substituting current bootstrap when history was unconfigured let an orphan query proceed.
    if (registryPin === undefined) throw new Error('review dispatch historical authority absent');
    if (!/^[0-9a-f]{64}$/.test(registryPin.digest))
      throw new Error('review dispatch historical authority pin malformed');
    let bytes: string;
    try {
      bytes = readFileSync(registryPin.path, 'utf8');
    } catch (cause) {
      // Proof: omitting the absent classification changed the mounted refusal to unreadable.
      if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')
        throw new Error('review dispatch historical authority registry absent', { cause });
      // Proof: omitting unreadable classification leaked EISDIR instead of the trusted-state refusal.
      throw new Error('review dispatch historical authority registry unreadable', { cause });
    }
    let registry: typeof HistoricalAuthorityRegistry.infer;
    try {
      registry = parseOrThrow(HistoricalAuthorityRegistry, JSON.parse(bytes));
      // Proof: omitting the digest check treated a canonical but unpinned registry as authoritative.
      if (serializeCanonical(registry) !== bytes || hashBytes(bytes) !== registryPin.digest)
        throw new Error('historical authority registry pin differs');
    } catch (cause) {
      // Proof: omitting malformed classification leaked a parser error on invalid retained bytes.
      throw new Error('review dispatch historical authority registry malformed', { cause });
    }
    const matches = registry.authorities.filter(
      (entry) => entry.pin.identity === authorityIdentity,
    );
    if (matches.length !== 1) throw new Error('review dispatch historical authority unavailable');
    const authority = matches[0];
    return readBootstrapConfiguration(authority.bootstrapPath, authority.pin);
  }

  #orphanDispatchIn(effectKey: string): DispatchRows {
    const rows = this.#dispatchRowsIn(effectKey);
    const request = readRow(this.#database, rows.stored.request_identity);
    // Proof: omitting the terminal-stage fence let an evaluating request use the query-only path.
    if (request === undefined || (request.stage !== 'failed' && request.stage !== 'superseded'))
      throw new Error('review dispatch request is not terminal');
    const selected = storedRequest(request).request;
    // Proof: omitting the original row-authority join queried after its bootstrap identity changed.
    if (
      selected.authorityIdentity !== rows.stored.authority_identity ||
      request.bootstrap_identity !== rows.stored.authority_identity
    )
      throw new Error('review dispatch original authority changed');
    const bootstrap = this.#historicalBootstrapIn(rows.stored.authority_identity);
    const frozenRows: unknown[] = this.#database
      .query('SELECT * FROM activation_obligation WHERE request_identity = ? ORDER BY rowid')
      .all(selected.requestIdentity);
    const obligations = frozenRows.map((entry) => parseOrThrow(StoredObligation, entry));
    // Proof: omitting persisted-plan reconstruction queried after a check command changed.
    if (
      request.evaluation_plan_identity === null ||
      request.evaluation_plan_identity !== rows.stored.plan_identity ||
      hashCanonical(reconstructFrozenPlan(selected, obligations)) !== rows.stored.plan_identity
    )
      throw new Error('review dispatch original plan changed');
    const rawRegistration: unknown = this.#database
      .query(
        'SELECT * FROM activation_review_attempt WHERE request_identity = ? AND review_id = ? AND attempt = ?',
      )
      .get(selected.requestIdentity, rows.stored.review_id, rows.stored.attempt);
    // Proof: omitting the registration join queried under a changed invocation ID.
    if (
      rawRegistration === null ||
      parseOrThrow(StoredReviewAttempt, rawRegistration).invocation_id !== rows.stored.invocation_id
    )
      throw new Error('review dispatch original invocation changed');
    const phases = obligations.filter(
      (entry) => entry.kind === 'audit' && entry.review_id === rows.stored.review_id,
    );
    const cold = phases.find((phase) => phase.phase === 'cold');
    const informed = phases.find((phase) => phase.phase === 'informed');
    // A terminal request may select a later attempt after this effect was sent;
    // the immutable reservation and registration retain the original attempt.
    if (
      phases.length !== 2 ||
      cold === undefined ||
      informed === undefined ||
      cold.executor_id !== bootstrap.reviewer.executorId ||
      informed.executor_id !== bootstrap.reviewer.executorId ||
      cold.protocol_identity !== bootstrap.reviewer.protocolIdentity ||
      informed.protocol_identity !== bootstrap.reviewer.protocolIdentity
    )
      throw new Error('review dispatch original pair changed');
    const expected = deriveDispatchIdentity(
      selected,
      rows.stored.plan_identity,
      {
        reviewId: rows.stored.review_id,
        attempt: rows.stored.attempt,
        invocationId: rows.stored.invocation_id,
      },
      cold,
      informed,
      bootstrap,
      rows.stored.authority_identity,
    );
    // Proof: omitting target or canonical-payload equality independently queried changed bytes.
    if (
      rows.stored.effect_key !== expected.effectKey ||
      rows.stored.target_bytes !== expected.targetBytes ||
      rows.stored.payload_bytes !== expected.payloadBytes ||
      rows.stored.cold_obligation_identity !== cold.obligation_identity ||
      rows.stored.informed_obligation_identity !== informed.obligation_identity
    )
      throw new Error('review dispatch original reservation changed');
    const retained = this.#retainedRemoteDispatchFactIn(rows.stored);
    // Proof: omitting initiated-effect selection queried a reservation with zero sends and no fact.
    if (rows.progress.dispatch_attempts === 0 && retained === null)
      throw new Error('review dispatch was never initiated');
    return rows;
  }

  #currentDispatchIn(lease: RequestLease, effectKey: string): DispatchRows {
    const rows = this.#dispatchRowsIn(effectKey);
    // Proof: changing only the stored request identity reached send when this join was omitted.
    if (rows.stored.request_identity !== lease.requestIdentity)
      throw new Error('review dispatch request changed');
    const request = readRow(this.#database, lease.requestIdentity);
    // Proof: independent current and stage omissions each sent a noncurrent request.
    if (request?.current !== 1 || request.stage !== 'evaluating')
      throw new Error('review dispatch request no longer current evaluating');
    const selected = storedRequest(request).request;
    const frozenRows: unknown[] = this.#database
      .query('SELECT * FROM activation_obligation WHERE request_identity = ? ORDER BY rowid')
      .all(selected.requestIdentity);
    const obligations = frozenRows.map((entry) => parseOrThrow(StoredObligation, entry));
    // Proof: changing the persisted cold protocol after reservation otherwise let
    // recovery send under a plan digest that no longer described the frozen rows.
    if (
      request.evaluation_plan_identity === null ||
      request.evaluation_plan_identity !== rows.stored.plan_identity ||
      hashCanonical(reconstructFrozenPlan(selected, obligations)) !== rows.stored.plan_identity
    )
      throw new Error('review dispatch differs from frozen evaluation plan');
    const rawRegistration: unknown = this.#database
      .query(
        'SELECT * FROM activation_review_attempt WHERE request_identity = ? AND review_id = ? AND attempt = ?',
      )
      .get(selected.requestIdentity, rows.stored.review_id, rows.stored.attempt);
    // Proof: changing the durable invocation after reservation otherwise sent a
    // payload that could not join its registered review attempt.
    if (
      rawRegistration === null ||
      parseOrThrow(StoredReviewAttempt, rawRegistration).invocation_id !== rows.stored.invocation_id
    )
      throw new Error('review dispatch invocation registration changed');
    const subject: unknown = this.#database
      .query(
        'SELECT high_water_generation FROM activation_subject WHERE repository_id = ? AND subject_key = ?',
      )
      .get(selected.repositoryId, subjectKey(selected.subject));
    // Proof: omitting this recovery-time fence sent a reservation after the subject's
    // durable generation advanced while its stale request row still appeared current.
    if (
      subject === null ||
      parseOrThrow(type({ high_water_generation: 'number.integer>=0' }), subject)
        .high_water_generation !== selected.auditGeneration
    )
      throw new Error('review dispatch generation changed');
    const now = nowFrom(this.options.clock);
    // Proof: omitting the epoch check sent after the persisted lease advanced.
    if (
      request.lease_epoch !== lease.leaseEpoch ||
      request.lease_owner !== lease.workerId ||
      request.lease_expires_at === null ||
      isExpiredLease(request.lease_expires_at, now)
    )
      throw new Error('review dispatch lease changed');
    const bootstrap = readBootstrapConfiguration(this.options.bootstrapPath, this.options.pin);
    // Proof: omitting the stored pin comparison sent under a foreign authority row.
    if (
      request.bootstrap_identity !== this.options.pin.identity ||
      rows.stored.authority_identity !== this.options.pin.identity ||
      selected.authorityIdentity !== this.options.pin.identity
    )
      throw new Error('review dispatch authority changed');
    const phases = obligations.filter(
      (entry) => entry.kind === 'audit' && entry.review_id === rows.stored.review_id,
    );
    const cold = phases.find((phase) => phase.phase === 'cold');
    const informed = phases.find((phase) => phase.phase === 'informed');
    // Proof: independently omitting cold or informed attempt equality sent a
    // post-reservation attempt change; the frozen-plan hash excludes attempt.
    if (
      phases.length !== 2 ||
      cold === undefined ||
      informed === undefined ||
      cold.attempt !== rows.stored.attempt ||
      informed.attempt !== rows.stored.attempt ||
      cold.executor_id !== bootstrap.reviewer.executorId ||
      informed.executor_id !== bootstrap.reviewer.executorId ||
      cold.protocol_identity !== bootstrap.reviewer.protocolIdentity ||
      informed.protocol_identity !== bootstrap.reviewer.protocolIdentity
    )
      throw new Error('review dispatch frozen pair differs from authority');
    const expected = deriveDispatchIdentity(
      selected,
      rows.stored.plan_identity,
      {
        reviewId: rows.stored.review_id,
        attempt: rows.stored.attempt,
        invocationId: rows.stored.invocation_id,
      },
      cold,
      informed,
      bootstrap,
      this.options.pin.identity,
    );
    // Proof: omitting this check sent a persisted foreign reviewer target.
    if (rows.stored.target_bytes !== expected.targetBytes)
      throw new Error('review dispatch target changed');
    // Proof: independent canonical-payload and deterministic-effect omissions sent
    // a changed head or renamed effect under the original frozen request.
    if (
      rows.stored.effect_key !== expected.effectKey ||
      rows.stored.payload_bytes !== expected.payloadBytes ||
      rows.stored.cold_obligation_identity !== cold.obligation_identity ||
      rows.stored.informed_obligation_identity !== informed.obligation_identity
    )
      throw new Error('review dispatch canonical reservation changed');
    return rows;
  }

  #dispatchProgressIn(effectKey: string): ReviewDispatchProgress {
    const progress = this.#dispatchRowsIn(effectKey).progress;
    return {
      effectKey,
      state: progress.state,
      dispatchAttempts: progress.dispatch_attempts,
      ownerEpoch: progress.owner_epoch,
      ownerId: progress.owner_id,
    };
  }

  #retainedRemoteDispatchFactIn(
    stored: typeof StoredReviewDispatch.infer,
  ): ReviewDispatchObservation | null {
    const rawFact: unknown = this.#database
      .query(
        'SELECT observation_bytes, observation_digest FROM activation_review_dispatch_fact WHERE effect_key = ?',
      )
      .get(stored.effect_key);
    if (rawFact === null) return null;
    const retained = parseOrThrow(
      type({
        observation_bytes: 'string>=1',
        observation_digest: /^[0-9a-f]{64}$/,
      }).onUndeclaredKey('reject'),
      rawFact,
    );
    // Proof: corrupting the retained fact after acknowledgement was previously ignored by replay.
    if (hashBytes(retained.observation_bytes) !== retained.observation_digest)
      throw new Error('review dispatch remote fact digest changed');
    const fact = parseOrThrow(DispatchObservation, JSON.parse(retained.observation_bytes));
    if (
      fact.effectKey !== stored.effect_key ||
      fact.requestIdentity !== stored.request_identity ||
      serializeCanonical(fact.target) !== stored.target_bytes ||
      fact.payloadDigest !== stored.payload_digest ||
      fact.invocationId !== stored.invocation_id
    )
      throw new Error('review dispatch remote fact differs from reservation');
    return fact;
  }

  #markDispatchUncertain(
    lease: RequestLease,
    effectKey: string,
    version: number,
  ): ReviewDispatchProgress {
    return transaction(this.#database, () => {
      const rows = this.#dispatchRowsIn(effectKey);
      if (
        rows.progress.version === version &&
        rows.progress.owner_epoch === lease.leaseEpoch &&
        rows.progress.owner_id === lease.workerId &&
        rows.progress.state !== 'acknowledged'
      )
        this.#database
          .query(
            `UPDATE activation_review_dispatch_progress
          SET state = 'uncertain', version = version + 1 WHERE effect_key = ?`,
          )
          .run(effectKey);
      return this.#dispatchProgressIn(effectKey);
    });
  }

  #retainRemoteDispatchFact(
    stored: typeof StoredReviewDispatch.infer,
    observed: ReviewDispatchObservation,
  ): void {
    transaction(this.#database, () => {
      this.#retainRemoteDispatchFactIn(stored, observed);
    });
  }

  #retainRemoteDispatchFactIn(
    stored: typeof StoredReviewDispatch.infer,
    observed: ReviewDispatchObservation,
  ): void {
    const fact = parseOrThrow(DispatchObservation, observed);
    // Proof: independently omitting effect, request, target, payload or invocation
    // comparison retained the corresponding foreign fact before the later ack refused.
    if (
      fact.effectKey !== stored.effect_key ||
      fact.requestIdentity !== stored.request_identity ||
      serializeCanonical(fact.target) !== stored.target_bytes ||
      fact.payloadDigest !== stored.payload_digest ||
      fact.invocationId !== stored.invocation_id
    )
      throw new Error('review dispatch remote fact differs from reservation');
    const bytes = serializeCanonical(fact);
    const prior: unknown = this.#database
      .query(
        'SELECT observation_bytes, observation_digest FROM activation_review_dispatch_fact WHERE effect_key = ?',
      )
      .get(stored.effect_key);
    if (prior !== null) {
      const retained = parseOrThrow(
        type({
          observation_bytes: 'string>=1',
          observation_digest: /^[0-9a-f]{64}$/,
        }).onUndeclaredKey('reject'),
        prior,
      );
      // Proof: removing this conflict check accepted changed remote-dispatch bytes and
      // acknowledged using an earlier retained fact.
      if (retained.observation_bytes !== bytes || retained.observation_digest !== hashBytes(bytes))
        throw new Error('review dispatch remote fact conflicts');
      return;
    }
    this.#database
      .query(
        `INSERT INTO activation_review_dispatch_fact
        (effect_key, observation_bytes, observation_digest) VALUES (?, ?, ?)`,
      )
      .run(stored.effect_key, bytes, hashBytes(bytes));
  }

  #acknowledgeCurrentDispatch(
    lease: RequestLease,
    effectKey: string,
    version: number,
  ): ReviewDispatchProgress {
    return transaction(this.#database, () => {
      const rows = this.#dispatchRowsIn(effectKey);
      if (this.#retainedRemoteDispatchFactIn(rows.stored) === null)
        throw new Error('review dispatch remote fact absent');
      if (rows.progress.state === 'acknowledged') return this.#dispatchProgressIn(effectKey);
      const request = readRow(this.#database, lease.requestIdentity);
      // Proof: omitting progress version or owner granted stale acknowledgement;
      // omitting current or lease changed the modeled retained-fact outcome to a throw.
      if (
        request?.current !== 1 ||
        request.stage !== 'evaluating' ||
        request.lease_epoch !== lease.leaseEpoch ||
        request.lease_owner !== lease.workerId ||
        request.lease_expires_at === null ||
        isExpiredLease(request.lease_expires_at, nowFrom(this.options.clock)) ||
        rows.progress.version !== version ||
        rows.progress.owner_epoch !== lease.leaseEpoch ||
        rows.progress.owner_id !== lease.workerId
      )
        return this.#dispatchProgressIn(effectKey);
      // Proof: omitting the post-await current/authority recheck acknowledged a
      // remote fact after the persisted bootstrap authority changed.
      this.#currentDispatchIn(lease, effectKey);
      this.#database
        .query(
          `UPDATE activation_review_dispatch_progress
        SET state = 'acknowledged', version = version + 1 WHERE effect_key = ?`,
        )
        .run(effectKey);
      return this.#dispatchProgressIn(effectKey);
    });
  }

  /** Reconciles a reserved effect before any fake-provider send; no live adapter is installed. */
  async recoverReviewDispatch(
    lease: RequestLease,
    effectKey: string,
    port: ReviewDispatchPort,
  ): Promise<ReviewDispatchProgress> {
    if (!/^[0-9a-f]{64}$/.test(effectKey)) throw new Error('review dispatch effect key malformed');
    const intent = transaction(this.#database, () => {
      const rows = this.#currentDispatchIn(lease, effectKey);
      if (rows.progress.state === 'acknowledged') {
        // Proof: omitting this check replayed acknowledged progress after its fact was deleted.
        if (this.#retainedRemoteDispatchFactIn(rows.stored) === null)
          throw new Error('review dispatch remote fact absent');
        return { kind: 'done' as const, progress: this.#dispatchProgressIn(effectKey) };
      }
      // Proof: omitting durable intent left the effect reserved while a provider query ran.
      this.#database
        .query(
          `UPDATE activation_review_dispatch_progress SET
        state = 'dispatching', owner_epoch = ?, owner_id = ?, version = version + 1
        WHERE effect_key = ?`,
        )
        .run(lease.leaseEpoch, lease.workerId, effectKey);
      const updated = this.#dispatchRowsIn(effectKey);
      return {
        kind: 'active' as const,
        stored: updated.stored,
        reservation: updated.reservation,
        version: updated.progress.version,
      };
    });
    if (intent.kind === 'done') return intent.progress;
    // Proof: bypassing the query blindly resent an accepted effect; bypassing its schema
    // treated malformed output as an absent fact and reached the send path.
    const queried = parseOrThrow(DispatchQuery, await port.query(intent.reservation));
    // Proof: omitting unavailable handling sent while the remote disposition was unknown.
    if (queried.kind === 'unavailable')
      return this.#markDispatchUncertain(lease, effectKey, intent.version);
    // Proof: omitting accepted handling attempted a new send despite authenticated acceptance.
    if (queried.kind === 'accepted') {
      this.#retainRemoteDispatchFact(intent.stored, queried.observed);
      return this.#acknowledgeCurrentDispatch(lease, effectKey, intent.version);
    }
    const permission = transaction(this.#database, () => {
      const rows = this.#currentDispatchIn(lease, effectKey);
      // Proof: omitting the progress-version comparison let two same-owner queries both send.
      if (
        rows.progress.version !== intent.version ||
        rows.progress.owner_epoch !== lease.leaseEpoch ||
        rows.progress.owner_id !== lease.workerId
      )
        throw new Error('review dispatch ownership changed before send');
      const fact: unknown = this.#database
        .query('SELECT effect_key FROM activation_review_dispatch_fact WHERE effect_key = ?')
        .get(effectKey);
      if (fact !== null)
        throw new Error('review dispatch local fact conflicts with remote absence');
      const now = nowFrom(this.options.clock);
      // Proof: independent deadline and attempt-budget omissions each caused an extra send.
      if (
        now >= rows.stored.deadline_at ||
        rows.progress.dispatch_attempts >= rows.stored.max_dispatch_attempts
      ) {
        this.#database
          .query(
            `UPDATE activation_review_dispatch_progress
          SET state = 'exhausted', version = version + 1 WHERE effect_key = ?`,
          )
          .run(effectKey);
        return { kind: 'exhausted' as const, progress: this.#dispatchProgressIn(effectKey) };
      }
      // Proof: omitting this increment hid a pre-await send attempt from durable recovery.
      this.#database
        .query(
          `UPDATE activation_review_dispatch_progress
        SET dispatch_attempts = dispatch_attempts + 1, version = version + 1
        WHERE effect_key = ?`,
        )
        .run(effectKey);
      return { kind: 'send' as const, version: this.#dispatchRowsIn(effectKey).progress.version };
    });
    if (permission.kind === 'exhausted') return permission.progress;
    const sent = parseOrThrow(
      DispatchSend,
      await port.send(intent.reservation, {
        workerId: lease.workerId,
        leaseEpoch: lease.leaseEpoch,
      }),
    );
    if (sent.kind === 'uncertain')
      return this.#markDispatchUncertain(lease, effectKey, permission.version);
    this.#retainRemoteDispatchFact(intent.stored, sent.observed);
    return this.#acknowledgeCurrentDispatch(lease, effectKey, permission.version);
  }

  /** Queries a previously initiated terminal request effect without restoring send authority. */
  async reconcileOrphanReviewDispatch(
    effectKey: string,
    port: ReviewDispatchQueryPort,
  ): Promise<
    | { readonly kind: 'absent' | 'unavailable' }
    | { readonly kind: 'retained'; readonly observed: ReviewDispatchObservation }
  > {
    if (!/^[0-9a-f]{64}$/.test(effectKey)) throw new Error('review dispatch effect key malformed');
    const reservation = transaction(
      this.#database,
      () => this.#orphanDispatchIn(effectKey).reservation,
    );
    // Proof: injecting a send here made the mounted query-only call log query then send.
    const queried = parseOrThrow(DispatchQuery, await port.query(reservation));
    if (queried.kind === 'unavailable') return { kind: 'unavailable' };
    if (queried.kind === 'absent') {
      return transaction(this.#database, () => {
        // Proof: omitting this post-await check reported absence despite a prior accepted
        // fact, including one retained while an absent query was held.
        const rows = this.#orphanDispatchIn(effectKey);
        if (this.#retainedRemoteDispatchFactIn(rows.stored) !== null)
          throw new Error('review dispatch remote absence conflicts with retained fact');
        return { kind: 'absent' };
      });
    }
    return transaction(this.#database, () => {
      // Proof: replacing this post-await validation with a raw row read retained a fact after
      // the independently pinned history changed while the provider query was held.
      const rows = this.#orphanDispatchIn(effectKey);
      this.#retainRemoteDispatchFactIn(rows.stored, queried.observed);
      const observed = this.#retainedRemoteDispatchFactIn(rows.stored);
      // Proof: omitting this check reported success after a trigger deleted the inserted fact.
      if (observed === null) throw new Error('review dispatch remote fact absent');
      // Proof: injecting a terminal→evaluating write here revived the superseded request;
      // the mounted full-row snapshot also covers its replacement, lease and obligations.
      return { kind: 'retained', observed };
    });
  }

  /** Authenticates the persisted obligation kind before committing exact receipt evidence. */
  async recordReceipt(
    lease: RequestLease,
    obligationIdentity: string,
    receiptBytes: string,
  ): Promise<StoredRequest> {
    // Proof: omission sent absent bytes to the verifier and lost the boundary refusal.
    if (typeof receiptBytes !== 'string' || receiptBytes.length === 0) {
      throw new Error('activation receipt bytes absent');
    }
    if (!/^[0-9a-f]{64}$/.test(obligationIdentity)) {
      throw new Error('activation obligation locator malformed');
    }
    const before = readRow(this.#database, lease.requestIdentity);
    if (before === undefined) throw new Error('activation request absent');
    if (before.pairing_version !== 1) throw new Error('legacy review pairing absent');
    const request = storedRequest(before).request;
    if (
      request.authorityIdentity !== this.options.pin.identity ||
      before.bootstrap_identity !== this.options.pin.identity
    ) {
      throw new Error('activation request authority changed');
    }
    const rawObligation: unknown = this.#database
      .query(
        'SELECT * FROM activation_obligation WHERE request_identity = ? AND obligation_identity = ?',
      )
      .get(request.requestIdentity, obligationIdentity);
    if (rawObligation === null) throw new Error('activation obligation absent');
    const obligation = parseOrThrow(StoredObligation, rawObligation);
    const configuration = readBootstrapConfiguration(this.options.bootstrapPath, this.options.pin);
    let receipt: AuthenticatedReceipt;
    let review: VerifiedReview | null = null;
    if (obligation.kind === 'check') {
      const authenticate = this.options.authenticateCheck;
      if (authenticate === undefined) throw new Error('activation check verifier absent');
      receipt = parseOrThrow(AuthenticatedReceipt, await authenticate(receiptBytes));
      if (receipt.kind !== 'check') {
        throw new Error('authenticated receipt kind differs from frozen obligation');
      }
    } else {
      const verifyReview = this.options.verifyReview;
      // Proof: the mounted generic-authenticator bypass RED accepted audit evidence with
      // no trusted review port; mandatory dispatch refuses before any generic callback.
      if (verifyReview === undefined) throw new Error('trusted review verifier absent');
      if (obligation.review_id === null || obligation.phase === null) {
        throw new Error('frozen review obligation malformed');
      }
      const rawRegistration: unknown = this.#database
        .query(
          'SELECT * FROM activation_review_attempt WHERE request_identity = ? AND review_id = ? AND attempt = ?',
        )
        .get(request.requestIdentity, obligation.review_id, obligation.attempt);
      if (rawRegistration === null) throw new Error('review invocation absent');
      const registration = parseOrThrow(StoredReviewAttempt, rawRegistration);
      const expected: ReviewExpectation = {
        requestIdentity: request.requestIdentity,
        reviewId: obligation.review_id,
        obligationIdentity,
        attempt: obligation.attempt,
        phase: obligation.phase,
        invocationId: registration.invocation_id,
        executorId: obligation.executor_id,
        protocolIdentity: obligation.protocol_identity,
        promptIdentity: configuration.reviewer.promptIdentity,
        journalIssuerId: configuration.journal.issuerId,
      };
      review = authenticatedReview(
        { exactSubmissionBytes: receiptBytes, expected },
        await verifyReview({ exactSubmissionBytes: receiptBytes, expected }),
      );
      receipt = {
        receiptIdentity: hashBytes(receiptBytes),
        issuerId: review.binding.journalIssuerId,
        requestIdentity: expected.requestIdentity,
        obligationIdentity,
        kind: 'audit',
        reviewId: expected.reviewId,
        invocationId: expected.invocationId,
        attempt: expected.attempt,
        executorId: expected.executorId,
        protocolIdentity: expected.protocolIdentity,
        phase: expected.phase,
        status: 'terminal' in review ? review.terminal.status : review.status,
      };
    }
    // Proof: replacing exact-byte identity let a verifier relabel receipt bytes for another obligation.
    if (receipt.receiptIdentity !== hashBytes(receiptBytes)) {
      throw new Error('authenticated receipt digest differs from exact bytes');
    }
    return this.#recordAuthenticatedReceipt(
      lease,
      obligationIdentity,
      receiptBytes,
      receipt,
      review,
    );
  }

  #recordAuthenticatedReceipt(
    lease: RequestLease,
    obligationIdentity: string,
    receiptBytes: string,
    receipt: AuthenticatedReceipt,
    review: VerifiedReview | null,
  ): StoredRequest {
    return transaction(this.#database, () => {
      const now = nowFrom(this.options.clock);
      const row = readRow(this.#database, lease.requestIdentity);
      if (row === undefined) throw new Error('activation request absent');
      // Proof: omission changed both v2/v3 legacy receipt refusals into later malformed-plan
      // validation, losing the explicit no-implicit-pairing boundary.
      if (row.pairing_version !== 1) throw new Error('legacy review pairing absent');
      // Proof: omitting current changed held-verifier supersession into a later generation refusal.
      if (row.current !== 1) throw new Error('activation request superseded');
      const request = storedRequest(row).request;
      const subject: unknown = this.#database
        .query(
          'SELECT high_water_generation FROM activation_subject WHERE repository_id = ? AND subject_key = ?',
        )
        .get(request.repositoryId, subjectKey(request.subject));
      // Proof: omitting this join accepted a receipt against inconsistent subject high-water history.
      if (
        subject === null ||
        parseOrThrow(type({ high_water_generation: 'number.integer>=0' }), subject)
          .high_water_generation !== request.auditGeneration
      ) {
        throw new Error('activation request generation changed');
      }
      const configuration = readBootstrapConfiguration(
        this.options.bootstrapPath,
        this.options.pin,
      );
      // Proof: bypassing the pin reread let receipt recording continue after the trusted file disappeared.
      // Proof: omitting the old-request authority comparison accepted a second valid bootstrap pin.
      if (
        request.authorityIdentity !== this.options.pin.identity ||
        row.bootstrap_identity !== this.options.pin.identity
      ) {
        throw new Error('activation request authority changed');
      }
      // Proof: issuer omission accepted another journal identity in the mounted receipt owner.
      if (receipt.issuerId !== configuration.journal.issuerId) {
        throw new Error('authenticated receipt issuer differs from pinned journal');
      }
      // Proof: request omission accepted a receipt authenticated for another canonical request.
      if (receipt.requestIdentity !== request.requestIdentity) {
        throw new Error('authenticated receipt request differs from current request');
      }
      const rawObligation: unknown = this.#database
        .query(
          'SELECT * FROM activation_obligation WHERE request_identity = ? AND obligation_identity = ?',
        )
        .get(request.requestIdentity, obligationIdentity);
      // Proof: omission lost the named refusal for a foreign obligation identity.
      if (rawObligation === null) throw new Error('authenticated receipt obligation absent');
      const obligation = parseOrThrow(StoredObligation, rawObligation);
      if (receipt.obligationIdentity !== obligationIdentity) {
        throw new Error('authenticated receipt differs from obligation locator');
      }
      // Proof: kind omission changed the explicit kind refusal into a later shape refusal.
      if (receipt.kind !== obligation.kind) {
        throw new Error('authenticated receipt kind differs from frozen obligation');
      }
      // Proof: independently removing executor, protocol, command and phase comparisons
      // accepted receipts with the corresponding wrong frozen-plan binding.
      if (
        receipt.executorId !== obligation.executor_id ||
        receipt.protocolIdentity !== obligation.protocol_identity ||
        (receipt.kind === 'check'
          ? receipt.commandIdentity !== obligation.command_identity
          : receipt.phase !== obligation.phase)
      ) {
        throw new Error('authenticated receipt differs from frozen obligation');
      }
      // Proof: attempt omission accepted a receipt for an unreserved attempt number.
      if (receipt.attempt !== obligation.attempt) {
        throw new Error('authenticated receipt attempt differs from reserved attempt');
      }
      if (receipt.kind === 'audit') {
        if (review === null) throw new Error('trusted review source evidence absent');
        // Proof: omission let another registered review's invocation complete this obligation.
        if (receipt.reviewId !== obligation.review_id) {
          throw new Error('authenticated receipt review differs from frozen pair');
        }
        const rawRegistration: unknown = this.#database
          .query(
            'SELECT * FROM activation_review_attempt WHERE request_identity = ? AND review_id = ? AND attempt = ?',
          )
          .get(request.requestIdentity, receipt.reviewId, receipt.attempt);
        // Proof: omitting the registration join let an unregistered cold receipt complete evaluation.
        if (rawRegistration === null) throw new Error('review invocation absent');
        const registered = parseOrThrow(StoredReviewAttempt, rawRegistration);
        // Proof: omission accepted a different invocation for the registered review attempt;
        // the held cold-terminal verifier independently showed that replacement after await.
        if (registered.invocation_id !== receipt.invocationId) {
          throw new Error('authenticated receipt invocation differs from registration');
        }
      }
      const authenticationBytes = serializeCanonical(
        receipt.kind === 'audit' ? { receipt, review } : receipt,
      );
      const existing: unknown = this.#database
        .query(
          'SELECT * FROM activation_attempt WHERE request_identity = ? AND obligation_identity = ? AND attempt = ?',
        )
        .get(request.requestIdentity, obligation.obligation_identity, receipt.attempt);
      if (existing !== null) {
        const prior = parseOrThrow(StoredAttempt, existing);
        // Proof: omitting the whole immutable comparison replaced a conflicting attempt's refusal.
        if (
          prior.receipt_identity !== receipt.receiptIdentity ||
          prior.receipt_bytes !== receiptBytes ||
          prior.authentication_bytes !== authenticationBytes
        ) {
          throw new Error('authenticated receipt attempt conflicts with immutable evidence');
        }
        return storedRequest(row);
      }
      // Proof: stage omission let a failed request return to evaluating on another receipt.
      if (row.stage !== 'evaluating') throw new Error('activation request is not evaluating');
      // Proof: independent epoch, owner, null-expiry and elapsed-expiry omissions
      // accepted a stale or malformed completion at the receipt owner.
      if (
        row.lease_epoch !== lease.leaseEpoch ||
        row.lease_owner !== lease.workerId ||
        row.lease_expires_at === null ||
        isExpiredLease(row.lease_expires_at, now)
      ) {
        throw new Error('activation request lease changed');
      }
      // Proof: omission accepted a nonpending obligation whose selected attempt was absent.
      if (obligation.state !== 'pending' || obligation.receipt_identity !== null) {
        throw new Error('activation obligation already completed');
      }
      // Proof: broadening this query to any review or omitting its attempt predicate
      // accepted informed evidence with only another pair's or another attempt's cold.
      if (receipt.kind === 'audit' && receipt.phase === 'informed') {
        if (review === null) throw new Error('trusted review source evidence absent');
        if ('terminal' in review)
          throw new Error('cold terminal evidence cannot complete informed audit');
        const rawCold: unknown[] = this.#database
          .query(
            "SELECT * FROM activation_obligation WHERE request_identity = ? AND review_id = ? AND kind = 'audit' AND phase = 'cold' AND attempt = ?",
          )
          .all(request.requestIdentity, receipt.reviewId, receipt.attempt);
        if (rawCold.length !== 1) {
          throw new Error('informed audit requires completed cold audit');
        }
        const cold = parseOrThrow(StoredObligation, rawCold[0]);
        if (cold.state !== 'passed' || cold.receipt_identity === null) {
          throw new Error('informed audit requires completed cold audit');
        }
        const rawColdAttempt: unknown = this.#database
          .query(
            'SELECT * FROM activation_attempt WHERE request_identity = ? AND obligation_identity = ? AND attempt = ?',
          )
          .get(request.requestIdentity, cold.obligation_identity, cold.attempt);
        if (rawColdAttempt === null) throw new Error('committed cold source absent');
        const coldAttempt = parseOrThrow(StoredAttempt, rawColdAttempt);
        let coldAuthentication: {
          readonly receipt: AuthenticatedReceipt;
          readonly review: VerifiedReview;
        };
        try {
          const retained: unknown = JSON.parse(coldAttempt.authentication_bytes);
          coldAuthentication = parseOrThrow(
            type({
              receipt: AuthenticatedReceipt,
              review: ReviewVerificationRecord,
            }).onUndeclaredKey('reject'),
            retained,
          );
        } catch (cause) {
          throw new Error('committed cold source malformed', { cause });
        }
        if (
          coldAttempt.receipt_identity !== cold.receipt_identity ||
          coldAttempt.status !== 'passed' ||
          hashBytes(coldAttempt.receipt_bytes) !== coldAttempt.receipt_identity ||
          coldAuthentication.receipt.kind !== 'audit' ||
          coldAuthentication.receipt.phase !== 'cold' ||
          coldAuthentication.receipt.status !== 'passed' ||
          coldAuthentication.receipt.receiptIdentity !== coldAttempt.receipt_identity ||
          coldAuthentication.receipt.requestIdentity !== request.requestIdentity ||
          coldAuthentication.receipt.obligationIdentity !== cold.obligation_identity ||
          coldAuthentication.receipt.reviewId !== receipt.reviewId ||
          coldAuthentication.receipt.attempt !== receipt.attempt ||
          coldAuthentication.receipt.invocationId !== receipt.invocationId
        ) {
          throw new Error('committed cold source differs from selected review');
        }
        const committedCold = authenticatedReview(
          {
            exactSubmissionBytes: coldAttempt.receipt_bytes,
            expected: {
              requestIdentity: request.requestIdentity,
              reviewId: receipt.reviewId,
              obligationIdentity: cold.obligation_identity,
              attempt: receipt.attempt,
              phase: 'cold',
              invocationId: receipt.invocationId,
              executorId: cold.executor_id,
              protocolIdentity: cold.protocol_identity,
              promptIdentity: configuration.reviewer.promptIdentity,
              journalIssuerId: configuration.journal.issuerId,
            },
          },
          coldAuthentication.review,
        );
        // Proof: omitting this persisted-source comparison let an internally consistent
        // alternate cold judgment complete the informed phase and verify the request.
        if (
          hashCanonical(review.cold) !== hashCanonical(committedCold.cold) ||
          review.informed.coldArtifact !== hashCanonical(committedCold.cold.cold)
        ) {
          throw new Error('informed audit differs from committed cold');
        }
      }
      // Proof: splitting commit immediately after this insert left a second receipt attempt
      // after the verified-stage write failed, while the earlier check remained committed.
      // The cold-terminal split independently left its failed attempt after a later stage fault.
      this.#database
        .query(
          `INSERT INTO activation_attempt (
        request_identity, obligation_identity, attempt, receipt_identity,
        receipt_bytes, authentication_bytes, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          request.requestIdentity,
          obligation.obligation_identity,
          receipt.attempt,
          receipt.receiptIdentity,
          receiptBytes,
          authenticationBytes,
          receipt.status,
        );
      // Proof: omitting the selected-obligation update left both receipts recorded but never verified.
      this.#database
        .query(
          'UPDATE activation_obligation SET state = ?, receipt_identity = ? WHERE request_identity = ? AND obligation_identity = ?',
        )
        .run(
          receipt.status,
          receipt.receiptIdentity,
          request.requestIdentity,
          obligation.obligation_identity,
        );
      const selectedRows: unknown[] = this.#database
        .query('SELECT * FROM activation_obligation WHERE request_identity = ? ORDER BY rowid')
        .all(request.requestIdentity);
      const selected = selectedRows.map((entry) => parseOrThrow(StoredObligation, entry));
      const frozenPlan = reconstructFrozenPlan(request, selected);
      // Proof: omitting the frozen-plan join let one surviving passed obligation verify
      // after the other required row had disappeared from the durable plan.
      if (row.evaluation_plan_identity !== hashCanonical(frozenPlan)) {
        throw new Error('authenticated receipts differ from frozen evaluation plan');
      }
      for (const entry of selected) {
        if (entry.state !== 'passed') continue;
        const rawAttempt: unknown = this.#database
          .query(
            'SELECT * FROM activation_attempt WHERE request_identity = ? AND obligation_identity = ? AND attempt = ?',
          )
          .get(request.requestIdentity, entry.obligation_identity, entry.attempt);
        // Proof: deleting the previously selected check attempt still left the check row
        // marked passed and let the later audit verify without this retained-evidence join.
        if (rawAttempt === null) throw new Error('selected receipt evidence absent');
        const saved = parseOrThrow(StoredAttempt, rawAttempt);
        let registeredInvocation: string | null = null;
        if (entry.kind === 'audit') {
          const registration: unknown = this.#database
            .query(
              'SELECT * FROM activation_review_attempt WHERE request_identity = ? AND review_id = ? AND attempt = ?',
            )
            .get(request.requestIdentity, entry.review_id, entry.attempt);
          // Proof: removing this retained join let a prior cold phase verify after its
          // selected review invocation registration was deleted.
          if (registration === null) throw new Error('selected review invocation absent');
          registeredInvocation = parseOrThrow(StoredReviewAttempt, registration).invocation_id;
        }
        let authenticated: AuthenticatedReceipt;
        try {
          const retained: unknown = JSON.parse(saved.authentication_bytes);
          if (entry.kind === 'audit') {
            const envelope = parseOrThrow(
              type({
                receipt: AuthenticatedReceipt,
                review: ReviewVerificationRecord,
              }).onUndeclaredKey('reject'),
              retained,
            );
            authenticated = envelope.receipt;
            if (
              authenticated.kind !== 'audit' ||
              entry.review_id === null ||
              entry.phase === null
            ) {
              throw new Error('selected review evidence malformed');
            }
            authenticatedReview(
              {
                exactSubmissionBytes: saved.receipt_bytes,
                expected: {
                  requestIdentity: request.requestIdentity,
                  reviewId: entry.review_id,
                  obligationIdentity: entry.obligation_identity,
                  attempt: entry.attempt,
                  phase: entry.phase,
                  invocationId: registeredInvocation ?? '',
                  executorId: entry.executor_id,
                  protocolIdentity: entry.protocol_identity,
                  promptIdentity: configuration.reviewer.promptIdentity,
                  journalIssuerId: configuration.journal.issuerId,
                },
              },
              envelope.review,
            );
          } else {
            authenticated = parseOrThrow(AuthenticatedReceipt, retained);
          }
        } catch (cause) {
          throw new Error('selected receipt evidence malformed', { cause });
        }
        // Proof: independently omitting the retained review or invocation comparison
        // let schema-valid foreign cold authentication verify; omitting the registration
        // join and trusting its claimed invocation let a deleted registration verify.
        // Earlier, a schema-valid wrong executor verified when that binding was removed.
        if (
          entry.receipt_identity === null ||
          saved.receipt_identity !== entry.receipt_identity ||
          saved.request_identity !== request.requestIdentity ||
          saved.obligation_identity !== entry.obligation_identity ||
          saved.attempt !== entry.attempt ||
          saved.status !== 'passed' ||
          hashBytes(saved.receipt_bytes) !== saved.receipt_identity ||
          (entry.kind === 'check' &&
            serializeCanonical(authenticated) !== saved.authentication_bytes) ||
          authenticated.receiptIdentity !== saved.receipt_identity ||
          authenticated.issuerId !== configuration.journal.issuerId ||
          authenticated.requestIdentity !== request.requestIdentity ||
          authenticated.obligationIdentity !== entry.obligation_identity ||
          authenticated.attempt !== entry.attempt ||
          authenticated.kind !== entry.kind ||
          authenticated.status !== 'passed' ||
          authenticated.executorId !== entry.executor_id ||
          authenticated.protocolIdentity !== entry.protocol_identity ||
          (authenticated.kind === 'check'
            ? authenticated.commandIdentity !== entry.command_identity
            : authenticated.phase !== entry.phase ||
              authenticated.reviewId !== entry.review_id ||
              authenticated.invocationId !== registeredInvocation)
        ) {
          throw new Error('selected receipt evidence differs from frozen obligation');
        }
      }
      // Proof: forcing completeness after only the first receipt advanced before the audit existed.
      const complete = selected.every(
        (entry) => entry.state === 'passed' && entry.receipt_identity !== null,
      );
      // Proof: omitting terminal failure handling left a failed required receipt evaluating.
      const nextStage: RequestStage =
        receipt.status !== 'passed' ? 'failed' : complete ? 'verified' : 'evaluating';
      // Proof: replacing the selected-set digest with an empty-set digest failed the exact identity assertion.
      const evidenceSetIdentity = complete
        ? hashCanonical(
            selected
              .toSorted((left, right) =>
                left.obligation_identity < right.obligation_identity
                  ? -1
                  : left.obligation_identity > right.obligation_identity
                    ? 1
                    : 0,
              )
              .map((entry) => ({
                obligationIdentity: entry.obligation_identity,
                receiptIdentity: entry.receipt_identity,
              })),
          )
        : null;
      const updated = this.#database
        .query(
          'UPDATE activation_request SET stage = ?, evidence_set_identity = ?, version = version + 1 WHERE request_identity = ? AND version = ?',
        )
        .run(nextStage, evidenceSetIdentity, request.requestIdentity, row.version);
      // Proof: omitting this affected-row check returned success when a trigger ignored
      // the verified update; the owner instead rolls back the second receipt atomically.
      if (updated.changes !== 1) throw new Error('activation request version changed');
      const advanced = readRow(this.#database, request.requestIdentity);
      if (advanced === undefined) throw new Error('activation request absent after receipt');
      return storedRequest(advanced);
    });
  }
}

/** Opens the persisted controller state without relying on candidate checkout storage. */
export function openActivationController(
  options: ActivationControllerOptions,
): ActivationController {
  return new ActivationController(options);
}
