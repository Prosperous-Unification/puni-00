import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

import { parseOrThrow, type } from '@shared/validation';

import { hashBytes, serializeCanonical } from '../evidence/content-manifest';
import {
  assertExternalReviewProvider,
  decodeBootstrapConfiguration,
  type ExternalReviewBootstrap,
  type TrustedBootstrapPin,
} from './bootstrap';
import type { ReviewSubmission, VerifiedReview } from './controller';

const Sha256 = /^[0-9a-f]{64}$/;
const CommitSha = /^[0-9a-f]{40}$/;
const AuthorityId = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const GitHubName = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const Https = /^https:\/\/[A-Za-z0-9.-]+(?::[0-9]+)?(?:\/[^\s]*)?$/;
const Origin = /^https:\/\/[A-Za-z0-9.-]+(?::[0-9]+)?$/;
const WorkflowPath = /^\.github\/workflows\/[A-Za-z0-9._-]+\.ya?ml$/;
const QualifiedRef = /^refs\/(?:heads|tags)\/[A-Za-z0-9._/-]+$/;
const ProtectedPath = /^\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/;
const ClaudeModel =
  /^claude-(?:opus|sonnet|haiku)-([1-9][0-9]*)(?:-([1-9][0-9]*))?(?:-(20[0-9]{6}))?$/;

function assertImmutableModelId(modelId: string): void {
  const parts = ClaudeModel.exec(modelId);
  const major = Number(parts?.[1]);
  const minor = parts?.[2] === undefined ? undefined : Number(parts[2]);
  const dated = parts?.[3] !== undefined;
  // Proof: the isolated alias/whitespace omission admitted mutable 4.5 aliases and malformed
  // bytes; restored tests preserve dated 4.5 and exact dateless 4.6+/5 snapshots.
  if (
    parts === null ||
    !Number.isSafeInteger(major) ||
    (minor !== undefined && !Number.isSafeInteger(minor)) ||
    (dated
      ? !(major < 4 || (major === 4 && (minor ?? 0) < 6))
      : !(major > 4 || (major === 4 && (minor ?? 0) >= 6)))
  ) {
    throw new Error('review model snapshot identity malformed');
  }
}

// Proof: removing a required schema field admitted 35 absent pins in final-byte tests;
// six omissions changed only diagnostics and four were masked, including modelId by
// the independent immutable-model guard (see verify.md).
const ReviewProviderRecord = type({
  schemaVersion: '1',
  kind: "'github-actions-attestation-review'",
  control: type({
    owner: GitHubName,
    repository: GitHubName,
    ownerId: 'number.integer>=1',
    repositoryId: 'number.integer>=1',
    workflowId: 'number.integer>=1',
    workflowPath: WorkflowPath,
    dispatchRef: QualifiedRef,
    sourceCommitSha: CommitSha,
    // GitHub BuildSignerDigest is the job_workflow_sha commit, not a SHA-256 artifact digest.
    // Proof: replacing this 40-hex contract with Sha256 admitted a 64-hex signer field.
    signerDigest: CommitSha,
    programIdentity: Sha256,
    actionIdentity: Sha256,
    runtimeIdentity: Sha256,
    runnerPolicy: "'github-hosted-only'",
  }).onUndeclaredKey('reject'),
  attestation: type({
    apiOrigin: "'https://api.github.com'",
    apiVersion: /^20[0-9]{2}-[0-9]{2}-[0-9]{2}$/,
    issuer: "'https://token.actions.githubusercontent.com'",
    signerIdentity: Https,
    trustedRootIdentity: Sha256,
    trustedRootPath: ProtectedPath,
    verifierId: AuthorityId,
    verifierIdentity: Sha256,
    verifierVersion: /^[0-9]+\.[0-9]+\.[0-9]+$/,
    verifierExecutablePath: ProtectedPath,
    verifierRuntimeIdentity: Sha256,
    predicateType: Https,
    predicateVersion: 'number.integer>=1',
    receiptAudience: AuthorityId,
    signingAudience: AuthorityId,
    retrievalOrigins: type(Origin).array(),
    redirectPolicy: "'reject'",
    registrationOrigin: Origin,
    registrationIdentity: Sha256,
    retentionDays: 'number.integer>=1',
    visibility: "'public'|'private'|'internal'",
    enterpriseEntitlement: "'public-repository'|'enterprise-cloud-verified'",
  }).onUndeclaredKey('reject'),
  journal: type({
    issuerId: AuthorityId,
    providerId: AuthorityId,
    executorId: AuthorityId,
    accessPolicy: "'authenticated-exact-retrieval'",
  }).onUndeclaredKey('reject'),
  model: type({
    origin: "'https://api.anthropic.com'",
    apiVersion: /^20[0-9]{2}-[0-9]{2}-[0-9]{2}$/,
    modelId: 'string>=1',
    protocolIdentity: Sha256,
    promptIdentity: Sha256,
    toolPolicyIdentity: Sha256,
    entitlementIdentity: Sha256,
    credentialReference: /^\/[A-Za-z0-9._/-]+$/,
  }).onUndeclaredKey('reject'),
}).onUndeclaredKey('reject');

export type ReviewProviderDescriptor = typeof ReviewProviderRecord.infer;
export interface ReviewProviderPin {
  readonly identity: string;
}

export interface ReviewProviderAuthority {
  readonly bootstrap: ExternalReviewBootstrap;
  readonly descriptor: ReviewProviderDescriptor;
}

function readProtectedBytes(path: string, subject: string): Buffer {
  // Proof: removing lexical locator validation admitted a `subdir/../` alias of a pinned file.
  if (!isAbsolute(path) || resolve(path) !== path || path.includes('\0')) {
    throw new Error(`${subject} path malformed`);
  }
  let descriptor: number;
  try {
    // Proof: nofollow admitted a symlinked file; nonblock omission held the FIFO test process
    // until its explicit two-second timeout, whereas the restored reader refused promptly.
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') {
      throw new Error(`${subject} absent`, { cause });
    }
    throw new Error(`${subject} unreadable`, { cause });
  }
  try {
    const entry = fstatSync(descriptor);
    // Proof: nlink and mode omissions admitted hard-linked and 0644 files. Removing isFile
    // changed the FIFO refusal to a read error, without admitting source bytes.
    if (!entry.isFile() || entry.nlink !== 1 || (entry.mode & 0o077) !== 0) {
      throw new Error(`${subject} file malformed`);
    }
    const bytes = Buffer.alloc(65_537);
    let count = 0;
    while (count < bytes.length) {
      const read = readSync(descriptor, bytes, count, bytes.length - count, count);
      if (read === 0) break;
      count += read;
    }
    // Proof: omitting the ceiling admitted an exactly 65,537-byte canonical descriptor.
    if (count > 65_536) throw new Error(`${subject} too large`);
    return bytes.subarray(0, count);
  } finally {
    closeSync(descriptor);
  }
}

function assertCanonicalPath(path: string): void {
  if (
    !isAbsolute(path) ||
    resolve(path) !== path ||
    path.split('/').some((part) => part === '.' || part === '..')
  ) {
    throw new Error('review provider protected path malformed');
  }
}

/** Reads only an exact independently pinned external-review descriptor. */
export function readReviewProviderDescriptor(
  path: string,
  pin: ReviewProviderPin,
): ReviewProviderDescriptor {
  if (!Sha256.test(pin.identity)) throw new Error('review provider independent pin malformed');
  const source = readProtectedBytes(path, 'review provider descriptor');
  let descriptor: ReviewProviderDescriptor;
  try {
    // Proof: lossy UTF-8 decoding admitted the same invalid raw bytes under their exact pin.
    const bytes = new TextDecoder('utf-8', { fatal: true }).decode(source);
    const parsed: unknown = JSON.parse(bytes);
    descriptor = parseOrThrow(ReviewProviderRecord, parsed);
    assertImmutableModelId(descriptor.model.modelId);
    // Proof: omitting canonical equality accepted pretty-printed, independently pinned bytes.
    if (serializeCanonical(descriptor) !== bytes)
      throw new Error('review provider descriptor not canonical');
    // Proof: dot-traversal omissions admitted a pinned executable or trust-root path outside its literal directory.
    assertCanonicalPath(descriptor.attestation.verifierExecutablePath);
    assertCanonicalPath(descriptor.attestation.trustedRootPath);
    assertCanonicalPath(descriptor.model.credentialReference);
  } catch (cause) {
    throw new Error('review provider descriptor malformed', { cause });
  }
  // Proof: omitting the raw-byte pin comparison admitted a foreign canonical descriptor.
  if (hashBytes(source) !== pin.identity)
    throw new Error('review provider descriptor differs from pin');
  // Proof: independently omitting the retrieval-empty or retention ceiling predicate admitted
  // each coherent wrong policy; the named tests passed after restoration.
  if (
    descriptor.attestation.retrievalOrigins.length === 0 ||
    descriptor.attestation.retentionDays > 3650
  ) {
    throw new Error('review provider retrieval or retention policy malformed');
  }
  if (
    descriptor.attestation.visibility !== 'public' &&
    descriptor.attestation.enterpriseEntitlement !== 'enterprise-cloud-verified'
  ) {
    // Proof: omitting the private entitlement predicate admitted public-only entitlement.
    throw new Error('private review attestation entitlement absent');
  }
  if (
    descriptor.attestation.visibility === 'public' &&
    descriptor.attestation.enterpriseEntitlement !== 'public-repository'
  ) {
    // Proof: omitting only this predicate admitted a coherent public descriptor with
    // private enterprise entitlement in the named mounted test.
    throw new Error('review attestation visibility differs from entitlement');
  }
  // Proof: omitting each independent ID/version predicate admitted an integer beyond safe precision.
  if (
    !Number.isSafeInteger(descriptor.control.ownerId) ||
    !Number.isSafeInteger(descriptor.control.repositoryId) ||
    !Number.isSafeInteger(descriptor.control.workflowId) ||
    !Number.isSafeInteger(descriptor.attestation.predicateVersion)
  ) {
    throw new Error('review provider numeric authority malformed');
  }
  return descriptor;
}

/** Joins a protected descriptor to the independently pinned v2 bootstrap. No provider call occurs. */
export function readReviewProviderAuthority(
  bootstrapPath: string,
  pin: TrustedBootstrapPin,
  descriptorPath: string,
  descriptorPin: ReviewProviderPin,
): ReviewProviderAuthority {
  // Proof: replacing the protected bootstrap read with readFileSync held the mounted FIFO
  // child until its two-second timeout; the restored path refused before pin evaluation.
  const bootstrapBytes = readProtectedBytes(bootstrapPath, 'bootstrap configuration');
  const bootstrap = decodeBootstrapConfiguration(
    new TextDecoder('utf-8', { fatal: true }).decode(bootstrapBytes),
    pin,
  );
  const descriptor = readReviewProviderDescriptor(descriptorPath, descriptorPin);
  // Proof: omitting this join admitted a valid independently repinned descriptor under a
  // different v2 bootstrap descriptor identity in the mounted authority test.
  if (
    bootstrap.schemaVersion === 2 &&
    bootstrap.reviewProvider.descriptorIdentity !== descriptorPin.identity
  ) {
    throw new Error('review provider descriptor differs from bootstrap pin');
  }
  // Proof: seven isolated comparison removals each admitted a coherently repinned foreign
  // descriptor in its named test, then passed after restoration.
  if (
    descriptor.journal.issuerId !== bootstrap.journal.issuerId ||
    descriptor.journal.providerId !== bootstrap.reviewer.providerId ||
    descriptor.journal.executorId !== bootstrap.reviewer.executorId ||
    descriptor.attestation.verifierId !== bootstrap.journal.verifierId ||
    descriptor.model.protocolIdentity !== bootstrap.reviewer.protocolIdentity ||
    descriptor.model.promptIdentity !== bootstrap.reviewer.promptIdentity ||
    !descriptor.attestation.retrievalOrigins.includes(new URL(bootstrap.journal.endpoint).origin)
  ) {
    throw new Error('review provider descriptor differs from bootstrap authority');
  }
  // Proof: removing this production composition guard admitted a registered audit phase
  // under v1; restored refusal invoked no verifier and preserved all evidence rows.
  assertExternalReviewProvider(bootstrap);
  return { bootstrap, descriptor };
}

/** Composes pinned provider authority with a separately installed external verifier port. */
export function composeReviewProviderVerification(options: {
  readonly bootstrapPath: string;
  readonly bootstrapPin: TrustedBootstrapPin;
  readonly descriptorPath: string;
  readonly descriptorPin: ReviewProviderPin;
  readonly verify: (submission: ReviewSubmission) => Promise<VerifiedReview>;
}): (submission: ReviewSubmission) => Promise<VerifiedReview> {
  return async (submission) => {
    readReviewProviderAuthority(
      options.bootstrapPath,
      options.bootstrapPin,
      options.descriptorPath,
      options.descriptorPin,
    );
    return options.verify(submission);
  };
}
