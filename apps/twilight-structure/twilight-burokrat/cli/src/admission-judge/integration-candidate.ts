import { isAbsolute, normalize } from 'node:path';

import { parseOrThrow, type } from '@shared/validation';

import {
  CheckReceipt,
  type CheckReceipt as CheckReceiptValue,
  ExecutorIdentity,
  OpaqueId,
  ReviewReceipt,
  type ReviewReceipt as ReviewReceiptValue,
} from '../contracts/records';
import {
  compareCanonicalText,
  hashBytes,
  hashCanonical,
  serializeCanonical,
} from '../evidence/content-manifest';
import type { AdmissionPacket } from './packet-codec';

/** The three SHA-256 identities that freeze one submitted candidate. */
export interface SubmissionIdentity {
  readonly patchIdentity: string;
  readonly candidateDiffIdentity: string;
  readonly contentIdentity: string;
}

export interface AdmissionSubmissionReport extends SubmissionIdentity {
  readonly status: 'submitted';
  readonly sessionId: string;
  readonly generation: number;
  readonly candidateTree: string;
  readonly baseRelationship: 'index-based-on-packet-head' | 'commit-descends-from-packet-base';
  readonly changedPaths: readonly string[];
  readonly scope: 'publication violations were detected and refused at submission; editing-time writes were not prevented';
}

const Sha256 = /^[0-9a-f]{64}$/;
const Term = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const Sha256Identity = type(Sha256);
const IntegrationPathSelectorRecord = type({
  kind: "'path'|'prefix'",
  path: 'string>=1',
}).onUndeclaredKey('reject');
const IntegrationCheckSpecRecord = type({
  checkId: OpaqueId,
  command: 'string[]',
  cwdIdentity: OpaqueId,
  journalId: OpaqueId,
  toolIdentity: Sha256Identity,
  resourceLane: OpaqueId,
}).onUndeclaredKey('reject');
const IntegrationReviewSpecRecord = type({
  reviewId: OpaqueId,
  journalId: OpaqueId,
  trustScope: "'trusted-harness'|'external-verifier'",
  executor: ExecutorIdentity,
}).onUndeclaredKey('reject');
const IntegrationConsumerRecord = type({
  interfaceId: OpaqueId,
  implementationSelectors: IntegrationPathSelectorRecord.array(),
}).onUndeclaredKey('reject');
const IntegrationContractRuleRecord = type({
  contractId: OpaqueId,
  requiredConsumers: IntegrationConsumerRecord.array(),
}).onUndeclaredKey('reject');
// Proof: widening this boundary to `glob` made `strict policy decoding rejects unknown selector
// kinds and malformed primitive fields` fail on `Received function did not throw` and print it.
const IntegrationSelectorRuleRecord = type({
  kind: "'path'|'prefix'",
  path: 'string>=1',
  checks: OpaqueId.array(),
  reviews: OpaqueId.array(),
}).onUndeclaredKey('reject');
const IntegrationPolicyRecord = type({
  schemaVersion: '1',
  policyIdentity: Sha256Identity,
  mappingIdentity: Sha256Identity,
  checkSpecs: IntegrationCheckSpecRecord.array(),
  reviewSpecs: IntegrationReviewSpecRecord.array(),
  contractRules: IntegrationContractRuleRecord.array(),
  selectorRules: IntegrationSelectorRuleRecord.array(),
}).onUndeclaredKey('reject');
export type IntegrationPolicy = typeof IntegrationPolicyRecord.infer;
export type IntegrationCheckSpec = typeof IntegrationCheckSpecRecord.infer;
export type IntegrationReviewSpec = typeof IntegrationReviewSpecRecord.infer;

export interface SubmittedCandidate {
  readonly packet: AdmissionPacket;
  readonly patch: Uint8Array;
  readonly report: AdmissionSubmissionReport;
}

export interface IntegrationRequest {
  readonly policy: IntegrationPolicy;
  readonly submissions: readonly SubmittedCandidate[];
}

export interface IntegrationGenerationSnapshot {
  readonly sessionId: string;
  readonly generation: number;
  readonly status: 'submitted';
  readonly packetIdentity: string;
  readonly patchIdentity: string;
}

export interface IntegrationCandidateBody {
  readonly schemaVersion: 1;
  readonly status: 'unchecked';
  readonly baseCommit: string;
  readonly baseTree: string;
  readonly candidateTree: string;
  readonly contentManifestIdentity: string;
  readonly candidateDiffIdentity: string;
  readonly declarationIdentity: string;
  readonly policyIdentity: string;
  readonly mappingIdentity: string;
  readonly changedPaths: readonly string[];
  readonly selectedChecks: readonly string[];
  readonly selectedReviews: readonly string[];
  readonly selectedCheckSpecs: readonly IntegrationCheckSpec[];
  readonly selectedReviewSpecs: readonly IntegrationReviewSpec[];
  readonly submissions: readonly IntegrationGenerationSnapshot[];
  readonly publicationBoundary: '5.2 must atomically recheck authority and target ref before publication';
}

export interface UncheckedIntegrationCandidate extends IntegrationCandidateBody {
  readonly compositionIdentity: string;
}

export interface IntegrationEvidence {
  readonly compositionIdentity: string;
  readonly candidateTree: string;
  readonly contentManifestIdentity: string;
  readonly candidateDiffIdentity: string;
  readonly declarationIdentity: string;
  readonly policyIdentity: string;
  readonly mappingIdentity: string;
  readonly selectedChecks: readonly string[];
  readonly selectedReviews: readonly string[];
  readonly checks: readonly { readonly checkId: string; readonly receipt: unknown }[];
  readonly reviews: readonly { readonly reviewId: string; readonly receipt: unknown }[];
}

export interface VerifiedIntegrationReceipt {
  readonly obligationId: string;
  readonly receiptIdentity: string;
  readonly compositionIdentity: string;
  readonly journalId: string;
  readonly invocationId: string;
}

export interface IntegrationEvidenceVerifier {
  verifyCheck(request: {
    readonly obligationId: string;
    readonly receiptBytes: string;
    readonly compositionIdentity: string;
  }): VerifiedIntegrationReceipt;
  verifyReview(request: {
    readonly obligationId: string;
    readonly receiptBytes: string;
    readonly compositionIdentity: string;
  }): VerifiedIntegrationReceipt;
}

export interface CheckedIntegrationCandidate extends Omit<IntegrationCandidateBody, 'status'> {
  readonly status: 'checked';
  readonly compositionIdentity: string;
  readonly evidenceIdentity: string;
  readonly checkReceipts: readonly CheckReceiptValue[];
  readonly reviewReceipts: readonly ReviewReceiptValue[];
  readonly receiptVerifications: readonly VerifiedIntegrationReceipt[];
}

/** Re-authenticates the immutable composition fields carried by a checked candidate. */
export function assertCheckedIntegrationCandidate(candidate: CheckedIntegrationCandidate): void {
  const {
    checkReceipts: _checks,
    compositionIdentity: _composition,
    evidenceIdentity: _evidence,
    receiptVerifications: _verifications,
    reviewReceipts: _reviews,
    status: _status,
    ...body
  } = candidate;
  const unchecked: IntegrationCandidateBody = { ...body, status: 'unchecked' };
  if (hashCanonical(unchecked) !== candidate.compositionIdentity) {
    throw new Error('checked integration candidate identity mismatch');
  }
}

function policyBody(policy: IntegrationPolicy): Omit<IntegrationPolicy, 'policyIdentity'> {
  const { policyIdentity: _identity, ...body } = policy;
  return body;
}

function assertFields(input: object, expected: readonly string[], subject: string): void {
  const actual = Object.keys(input).sort(compareCanonicalText);
  const canonical = [...expected].sort(compareCanonicalText);
  if (
    actual.length !== canonical.length ||
    actual.some((field, index) => field !== canonical[index])
  ) {
    throw new Error(`${subject} has undeclared or missing fields`);
  }
}

function assertTerms(values: readonly string[], subject: string): void {
  const sorted = [...values].sort(compareCanonicalText);
  for (let index = 0; index < sorted.length; index += 1) {
    const value = sorted[index];
    if (!Term.test(value)) throw new Error(`invalid integration ${subject}: ${value}`);
    if (index > 0 && sorted[index - 1] === value) {
      throw new Error(`duplicate integration ${subject}: ${value}`);
    }
  }
}

function assertUnique(values: readonly string[], subject: string): void {
  const sorted = [...values].sort(compareCanonicalText);
  if (sorted.some((value, index) => index > 0 && sorted[index - 1] === value)) {
    throw new Error(`duplicate integration ${subject}`);
  }
}

function assertRelativePath(path: string): void {
  if (
    path.length === 0 ||
    path.includes('\0') ||
    path.includes('\\') ||
    isAbsolute(path) ||
    normalize(path) !== path ||
    path === '..' ||
    path.startsWith('../')
  ) {
    throw new Error(`invalid integration selector path: ${path}`);
  }
}

/** Strictly decodes the externally selected policy and authenticates its canonical bytes. */
export function decodeIntegrationPolicy(input: unknown): IntegrationPolicy {
  const policy = parseOrThrow(IntegrationPolicyRecord, input);
  // Proof: accepting a caller label here let a candidate substitute a policy carrying no gate
  // selectors; `refuses caller-labelled weakened policy bytes before composition` failed with
  // `Received function did not throw` and showed only `check.gate` selected.
  if (
    !Sha256.test(policy.policyIdentity) ||
    hashCanonical(policyBody(policy)) !== policy.policyIdentity
  ) {
    throw new Error('integration policy identity mismatch');
  }
  const contracts = policy.contractRules.map(({ contractId }) => contractId);
  assertTerms(contracts, 'contract rule');
  for (const rule of policy.contractRules) {
    const consumers = rule.requiredConsumers.map(({ interfaceId }) => interfaceId);
    assertTerms(consumers, 'required consumer interface');
    if (consumers.length === 0)
      throw new Error(`integration contract has no consumers: ${rule.contractId}`);
    for (const consumer of rule.requiredConsumers) {
      if (consumer.implementationSelectors.length === 0) {
        throw new Error(
          `integration consumer has no implementation selector: ${consumer.interfaceId}`,
        );
      }
      const selectorIds = consumer.implementationSelectors.map(
        (selector) => `${selector.kind}:${selector.path}`,
      );
      assertUnique(selectorIds, 'consumer implementation selector');
      for (const selector of consumer.implementationSelectors) assertRelativePath(selector.path);
    }
  }
  const selectors = policy.selectorRules.map((rule) => `${rule.kind}:${rule.path}`);
  assertUnique(selectors, 'selector rule');
  for (const rule of policy.selectorRules) {
    assertRelativePath(rule.path);
    assertTerms(rule.checks, 'selected check');
    assertTerms(rule.reviews, 'selected review');
  }
  assertTerms(
    policy.checkSpecs.map(({ checkId }) => checkId),
    'check specification',
  );
  for (const specification of policy.checkSpecs) {
    if (specification.command.length === 0) {
      throw new Error(`integration check command is empty: ${specification.checkId}`);
    }
  }
  assertTerms(
    policy.reviewSpecs.map(({ reviewId }) => reviewId),
    'review specification',
  );
  return policy;
}

function candidateBody(candidate: UncheckedIntegrationCandidate): IntegrationCandidateBody {
  const { compositionIdentity: _identity, ...body } = candidate;
  return body;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/** Certifies an already-frozen candidate only with exact candidate-bound check and review receipts. */
export function certifyIntegrationCandidate(
  candidate: UncheckedIntegrationCandidate,
  evidence: IntegrationEvidence,
  verifier: IntegrationEvidenceVerifier,
): CheckedIntegrationCandidate {
  // Proof: bypassing this self-authentication moved a tampered candidate to the later evidence
  // diagnostic; `certification requires the whole selected receipt set and exact review/check
  // bindings` received `evidence candidate binding mismatch`, not the candidate identity refusal.
  if (hashCanonical(candidateBody(candidate)) !== candidate.compositionIdentity) {
    throw new Error('unchecked integration candidate identity mismatch');
  }
  assertFields(
    evidence,
    [
      'candidateDiffIdentity',
      'candidateTree',
      'checks',
      'compositionIdentity',
      'contentManifestIdentity',
      'declarationIdentity',
      'mappingIdentity',
      'policyIdentity',
      'reviews',
      'selectedChecks',
      'selectedReviews',
    ],
    'integration evidence',
  );
  const bindingMatches =
    evidence.compositionIdentity === candidate.compositionIdentity &&
    evidence.candidateTree === candidate.candidateTree &&
    evidence.contentManifestIdentity === candidate.contentManifestIdentity &&
    evidence.candidateDiffIdentity === candidate.candidateDiffIdentity &&
    evidence.declarationIdentity === candidate.declarationIdentity &&
    evidence.policyIdentity === candidate.policyIdentity &&
    evidence.mappingIdentity === candidate.mappingIdentity &&
    sameStrings(evidence.selectedChecks, candidate.selectedChecks) &&
    sameStrings(evidence.selectedReviews, candidate.selectedReviews);
  // Proof: bypassing the composition binding let evidence carrying another composition identity
  // certify this candidate; `certification requires the whole selected receipt set and exact
  // review/check bindings` failed on `Received function did not throw` with a checked candidate.
  if (!bindingMatches) throw new Error('evidence candidate binding mismatch');
  const checkSpecs = new Map(
    candidate.selectedCheckSpecs.map((specification) => [specification.checkId, specification]),
  );
  const reviewSpecs = new Map(
    candidate.selectedReviewSpecs.map((specification) => [specification.reviewId, specification]),
  );
  const receiptIdentities = new Set<string>();
  const verifications: VerifiedIntegrationReceipt[] = [];
  const authenticate = (
    kind: 'check' | 'review',
    obligationId: string,
    receipt: CheckReceiptValue | ReviewReceiptValue,
    expectedJournalId: string,
    expectedInvocationId?: string,
  ): void => {
    const receiptBytes = serializeCanonical(receipt);
    const receiptIdentity = hashBytes(receiptBytes);
    // Proof: bypassing this set let the same receipt reach a second obligation;
    // `authenticated receipt obligations cannot be relabeled, duplicated, or envelope-rewritten`
    // received `integration verifier binding mismatch` instead of the duplicate-identity refusal.
    if (receiptIdentities.has(receiptIdentity)) {
      throw new Error(`duplicate integration receipt identity: ${receiptIdentity}`);
    }
    receiptIdentities.add(receiptIdentity);
    const request = {
      compositionIdentity: candidate.compositionIdentity,
      obligationId,
      receiptBytes,
    };
    const verification =
      kind === 'check' ? verifier.verifyCheck(request) : verifier.verifyReview(request);
    assertFields(
      verification,
      ['compositionIdentity', 'invocationId', 'journalId', 'obligationId', 'receiptIdentity'],
      'integration receipt verification',
    );
    // Proof: bypassing this comparison let a receipt registered for another obligation pass;
    // `authenticated receipt obligations cannot be relabeled, duplicated, or envelope-rewritten`
    // failed on `Received function did not throw` and printed a checked candidate.
    if (
      verification.obligationId !== obligationId ||
      verification.receiptIdentity !== receiptIdentity ||
      verification.compositionIdentity !== candidate.compositionIdentity ||
      verification.journalId !== expectedJournalId ||
      !Term.test(verification.invocationId)
    ) {
      throw new Error(`integration verifier binding mismatch: ${obligationId}`);
    }
    if (expectedInvocationId !== undefined && verification.invocationId !== expectedInvocationId) {
      throw new Error(`integration verifier invocation mismatch: ${obligationId}`);
    }
    verifications.push(verification);
  };
  const checks = new Map<string, CheckReceiptValue>();
  for (const entry of evidence.checks) {
    assertFields(entry, ['checkId', 'receipt'], 'integration check evidence');
    if (checks.has(entry.checkId))
      throw new Error(`duplicate integration check receipt: ${entry.checkId}`);
    const receipt = parseOrThrow(CheckReceipt, entry.receipt);
    const specification = checkSpecs.get(entry.checkId);
    if (specification === undefined)
      throw new Error(`unauthorized integration check: ${entry.checkId}`);
    // Proof: comparing candidateManifest to content alone let a content-only receipt certify the
    // full composition; `equal trees cannot reuse evidence across policy, mapping, declaration,
    // or generation identity` failed on `Received function did not throw` with a checked candidate.
    // Bypassing the command comparison let a differently executed receipt satisfy the
    // selected spec; `authenticated receipt obligations cannot be relabeled, duplicated, or
    // envelope-rewritten` failed on `Received function did not throw` and printed it as checked.
    if (
      receipt.candidateManifest !== candidate.compositionIdentity ||
      receipt.status !== 'passed' ||
      receipt.exitCode !== 0 ||
      receipt.skips.length !== 0 ||
      !sameStrings(receipt.command, specification.command) ||
      receipt.cwdIdentity !== specification.cwdIdentity ||
      receipt.toolIdentity !== specification.toolIdentity ||
      receipt.resourceLane !== specification.resourceLane
    ) {
      throw new Error(`integration check receipt does not certify candidate: ${entry.checkId}`);
    }
    authenticate('check', entry.checkId, receipt, specification.journalId);
    checks.set(entry.checkId, receipt);
  }
  const reviews = new Map<string, ReviewReceiptValue>();
  for (const entry of evidence.reviews) {
    assertFields(entry, ['receipt', 'reviewId'], 'integration review evidence');
    if (reviews.has(entry.reviewId))
      throw new Error(`duplicate integration review receipt: ${entry.reviewId}`);
    const receipt = parseOrThrow(ReviewReceipt, entry.receipt);
    const specification = reviewSpecs.get(entry.reviewId);
    if (specification === undefined)
      throw new Error(`unauthorized integration review: ${entry.reviewId}`);
    // Proof: bypassing the journal comparison let a nonexistent caller-labelled journal satisfy
    // `review provenance requires the externally supplied journal verifier`; it failed on
    // `Received function did not throw` and printed the receipt as checked. Bypassing the executor
    // comparison let an unauthorized reviewer satisfy the selected
    // spec; `authenticated receipt obligations cannot be relabeled, duplicated, or
    // envelope-rewritten` failed on `Received function did not throw` and printed it as checked.
    if (
      !receipt.suppliedContextIds.includes(candidate.compositionIdentity) ||
      !receipt.observedReadIds.includes(candidate.compositionIdentity) ||
      receipt.trust.scope !== specification.trustScope ||
      receipt.trust.journalId !== specification.journalId ||
      hashCanonical(receipt.executor) !== hashCanonical(specification.executor)
    ) {
      throw new Error(`integration review receipt does not certify candidate: ${entry.reviewId}`);
    }
    authenticate('review', entry.reviewId, receipt, specification.journalId, receipt.invocationId);
    reviews.set(entry.reviewId, receipt);
  }
  // Proof: bypassing completeness made `certification requires the whole selected receipt set and
  // exact review/check bindings` fail with `Received function did not throw` and print one receipt.
  if (!sameStrings([...checks.keys()].sort(compareCanonicalText), candidate.selectedChecks)) {
    throw new Error('integration check receipt set is incomplete');
  }
  // Proof: bypassing completeness made `certification requires the whole selected receipt set and
  // exact review/check bindings` fail with `Received function did not throw` and print one review.
  if (!sameStrings([...reviews.keys()].sort(compareCanonicalText), candidate.selectedReviews)) {
    throw new Error('integration review receipt set is incomplete');
  }
  const { status: _status, ...uncheckedBody } = candidateBody(candidate);
  return {
    ...uncheckedBody,
    checkReceipts: [...checks.entries()]
      .sort(([left], [right]) => compareCanonicalText(left, right))
      .map(([, receipt]) => receipt),
    compositionIdentity: candidate.compositionIdentity,
    evidenceIdentity: hashCanonical(evidence),
    receiptVerifications: verifications.sort((left, right) =>
      compareCanonicalText(left.obligationId, right.obligationId),
    ),
    reviewReceipts: [...reviews.entries()]
      .sort(([left], [right]) => compareCanonicalText(left, right))
      .map(([, receipt]) => receipt),
    status: 'checked',
  };
}
