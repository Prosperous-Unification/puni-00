import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { parseOrThrow, type } from '@shared/validation';

import { hashBytes } from '../judge-facade';
import type { OfflineVerifierObservation } from './review-attestation';
import type { ReviewJournalRegistration } from './review-journal';
import type { RetrievedReviewJournal } from './review-retrieval';

const PredicateDigest = /^[0-9a-f]{64}$/;
const PredicateCommit = /^[0-9a-f]{40}$/;
const ReviewPredicateV1 = type({
  schemaVersion: '1',
  kind: "'tool-wiki-review'",
  descriptorIdentity: PredicateDigest,
  manifestIdentity: PredicateDigest,
  receiptAudience: 'string>=1',
  journalIssuerId: 'string>=1',
  journalId: 'string>=1',
  effectKey: PredicateDigest,
  payloadDigest: PredicateDigest,
  requestIdentity: PredicateDigest,
  reviewId: 'string>=1',
  attempt: 'number.integer>=0',
  invocationId: 'string>=1',
  selectionIdentity: PredicateDigest,
  execution: type({
    executorId: 'string>=1',
    modelId: 'string>=1',
    protocolIdentity: PredicateDigest,
    promptIdentity: PredicateDigest,
    programIdentity: PredicateDigest,
    actionIdentity: PredicateDigest,
    runtimeIdentity: PredicateDigest,
    toolPolicyIdentity: PredicateDigest,
  }).onUndeclaredKey('reject'),
  attestor: type({
    ownerId: 'number.integer>=1',
    repositoryId: 'number.integer>=1',
    workflowId: 'number.integer>=1',
    sourceCommitSha: PredicateCommit,
    signerDigest: PredicateCommit,
    runId: 'number.integer>=1',
    runAttempt: 'number.integer>=1',
  }).onUndeclaredKey('reject'),
  phases: type({
    phase: "'cold'|'informed'",
    obligationIdentity: PredicateDigest,
    submissionDigest: PredicateDigest,
    sourceEvidenceDigest: PredicateDigest,
    status: "'passed'|'failed'|'skipped'",
  })
    .onUndeclaredKey('reject')
    .array(),
}).onUndeclaredKey('reject');

/** Parses an untrusted statement claim; no signature or issuer authority follows from this shape. */
export function parseUntrustedReviewPredicate(claim: unknown): typeof ReviewPredicateV1.infer {
  const predicate = parseOrThrow(ReviewPredicateV1, claim);
  // Proof: unsafe_attempt and unsafe_run admitted integers beyond exact JSON
  // precision when this safe-integer fence was omitted.
  if (
    !Number.isSafeInteger(predicate.attempt) ||
    !Number.isSafeInteger(predicate.attestor.ownerId) ||
    !Number.isSafeInteger(predicate.attestor.repositoryId) ||
    !Number.isSafeInteger(predicate.attestor.workflowId) ||
    !Number.isSafeInteger(predicate.attestor.runId) ||
    !Number.isSafeInteger(predicate.attestor.runAttempt)
  )
    throw new Error('review predicate integer outside exact range');
  const cold = predicate.phases.at(0);
  const informed = predicate.phases.at(1);
  // Proof: phase_empty, phase_order, phase_lone_pass and phase_failed_pair
  // each admitted its malformed signed-claim sequence when this shape fence was omitted.
  if (
    cold?.phase !== 'cold' ||
    !(
      (predicate.phases.length === 1 && cold.status !== 'passed') ||
      (predicate.phases.length === 2 && informed?.phase === 'informed' && cold.status === 'passed')
    )
  )
    throw new Error('review predicate phase sequence malformed');
  return predicate;
}

type RegisteredClaimFields = Pick<
  ReviewJournalRegistration,
  | 'descriptorIdentity'
  | 'manifestIdentity'
  | 'journalIssuerId'
  | 'journalId'
  | 'effectKey'
  | 'payloadDigest'
  | 'requestIdentity'
  | 'reviewId'
  | 'attempt'
  | 'invocationId'
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Checks one verified-process observation against independently protected registration values; this structural join grants no authenticity by itself. */
export function assertRegisteredReviewClaim(
  observation: OfflineVerifierObservation,
  expected: {
    readonly registration: RegisteredClaimFields;
    readonly receiptAudience: string;
    readonly selectionIdentity: string;
  },
): ReturnType<typeof parseUntrustedReviewPredicate> {
  const output = observation.untrustedCliOutput;
  // Proof: missing output and verification records separately changed the
  // named typed refusal when their respective record predicates were omitted.
  if (!isRecord(output) || !isRecord(output['verificationResult']))
    throw new Error('review verifier observation malformed');
  const statement = output['verificationResult']['statement'];
  // Proof: missing statement lost its typed refusal when this check was omitted.
  if (!isRecord(statement)) throw new Error('review verifier statement malformed');
  const predicate = parseUntrustedReviewPredicate(statement['predicate']);
  const registered = expected.registration;
  // Proof: twelve separately re-signed wrong registered fields passed real
  // gh; each comparator except manifest identity failed its isolated omission.
  // The observation-digest and protected-manifest comparators had distinct
  // mismatch witnesses, each of which failed when only that guard was omitted.
  if (
    predicate.manifestIdentity !== observation.manifestDigest ||
    predicate.descriptorIdentity !== registered.descriptorIdentity ||
    predicate.manifestIdentity !== registered.manifestIdentity ||
    predicate.journalIssuerId !== registered.journalIssuerId ||
    predicate.journalId !== registered.journalId ||
    predicate.effectKey !== registered.effectKey ||
    predicate.payloadDigest !== registered.payloadDigest ||
    predicate.requestIdentity !== registered.requestIdentity ||
    predicate.reviewId !== registered.reviewId ||
    predicate.attempt !== registered.attempt ||
    predicate.invocationId !== registered.invocationId ||
    predicate.receiptAudience !== expected.receiptAudience ||
    predicate.selectionIdentity !== expected.selectionIdentity
  )
    throw new Error('review predicate differs from protected registration');
  return predicate;
}

/** Joins structured verified-certificate claims to pinned policy and the signed run claim; historical Actions metadata is still required. */
export function assertReviewCertificateClaim(
  observation: OfflineVerifierObservation,
  expected: {
    readonly repository: string;
    readonly certIdentity: string;
    readonly issuer: string;
    readonly signerDigest: string;
    readonly sourceDigest: string;
    readonly sourceRef: string;
    readonly ownerId: number;
    readonly repositoryId: number;
  },
): void {
  const output = observation.untrustedCliOutput;
  // Proof: missing output and verification records independently lost their
  // typed refusal under one-predicate omissions.
  if (!isRecord(output) || !isRecord(output['verificationResult']))
    throw new Error('review verifier observation malformed');
  const statement = output['verificationResult']['statement'];
  // Proof: a real gh observation whose statement run ID was changed while a
  // caller supplied the old predicate passed before this direct statement join.
  if (!isRecord(statement)) throw new Error('review verifier statement malformed');
  const predicate = parseUntrustedReviewPredicate(statement['predicate']);
  const signature = output['verificationResult']['signature'];
  // Proof: missing signature and missing certificate independently lost their
  // typed refusal under one-predicate omissions.
  if (!isRecord(signature) || !isRecord(signature['certificate']))
    throw new Error('review verifier certificate malformed');
  const certificate = signature['certificate'];
  // Proof: malformed protected repository changed its refusal when this
  // lexical check was omitted.
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(expected.repository))
    throw new Error('review protected repository malformed');
  const [owner] = expected.repository.split('/');
  const runUri = `https://github.com/${expected.repository}/actions/runs/${String(predicate.attestor.runId)}/attempts/${String(predicate.attestor.runAttempt)}`;
  // Proof: separately reissued owner-ID, repository-ID and run-URI leaves
  // passed real offline gh. Fifteen isolated altered verifier-field tests and
  // four re-signed attestor tests each failed under only its matching omitted
  // comparator; these structural checks remain unauthorizing without metadata.
  if (
    certificate['subjectAlternativeName'] !== expected.certIdentity ||
    certificate['issuer'] !== expected.issuer ||
    certificate['buildSignerURI'] !== expected.certIdentity ||
    certificate['buildSignerDigest'] !== expected.signerDigest ||
    certificate['sourceRepositoryURI'] !== `https://github.com/${expected.repository}` ||
    certificate['sourceRepositoryDigest'] !== expected.sourceDigest ||
    certificate['sourceRepositoryRef'] !== expected.sourceRef ||
    certificate['sourceRepositoryIdentifier'] !== String(expected.repositoryId) ||
    certificate['sourceRepositoryOwnerURI'] !== `https://github.com/${owner}` ||
    certificate['sourceRepositoryOwnerIdentifier'] !== String(expected.ownerId) ||
    certificate['runnerEnvironment'] !== 'github-hosted' ||
    certificate['buildConfigURI'] !== expected.certIdentity ||
    certificate['buildConfigDigest'] !== expected.signerDigest ||
    certificate['buildTrigger'] !== 'workflow_dispatch' ||
    certificate['runInvocationURI'] !== runUri ||
    predicate.attestor.ownerId !== expected.ownerId ||
    predicate.attestor.repositoryId !== expected.repositoryId ||
    predicate.attestor.sourceCommitSha !== expected.sourceDigest ||
    predicate.attestor.signerDigest !== expected.signerDigest
  )
    throw new Error('review certificate differs from protected review');
}

/** Checks only the shape and joins of supplied Actions projections; the caller must separately authenticate exact route responses. */
export function assertUntrustedReviewMetadataProjection(
  runResponse: unknown,
  workflowResponse: unknown,
  expected: {
    readonly attestor: ReturnType<typeof parseUntrustedReviewPredicate>['attestor'];
    readonly workflowPath: string;
  },
): void {
  // Proof: missing run, repository, owner and workflow records each changed
  // its typed refusal under only the corresponding shape-guard omission.
  const repository = isRecord(runResponse) ? runResponse['repository'] : undefined;
  const owner = isRecord(repository) ? repository['owner'] : undefined;
  if (
    !isRecord(runResponse) ||
    !isRecord(repository) ||
    !isRecord(owner) ||
    !isRecord(workflowResponse)
  )
    throw new Error('review workflow metadata malformed');
  const attestor = expected.attestor;
  // Proof: eight isolated foreign run/workflow projection fields each passed
  // when only its comparator was removed from this application check.
  if (
    runResponse['id'] !== attestor.runId ||
    runResponse['run_attempt'] !== attestor.runAttempt ||
    runResponse['workflow_id'] !== attestor.workflowId ||
    runResponse['head_sha'] !== attestor.sourceCommitSha ||
    repository['id'] !== attestor.repositoryId ||
    owner['id'] !== attestor.ownerId ||
    workflowResponse['id'] !== attestor.workflowId ||
    workflowResponse['path'] !== expected.workflowPath
  )
    throw new Error('review workflow metadata differs from protected run');
}

const Sha256 = /^[0-9a-f]{64}$/;
const MaximumManifestBytes = 65_536;
const MaximumBundleBytes = 1_048_576;
const MaximumArtifactBytes = 4_194_304;
const MaximumArtifacts = 64;
const MaximumCandidates = 16;

function readStagedBytes(
  directory: string,
  path: string,
  role: 'manifest' | 'bundle' | 'artifact',
  identity: string,
  ceiling: number,
): Buffer {
  // Proof: path_outside admitted a real foreign file when exact owned locator comparison was omitted.
  if (resolve(directory) !== directory || path !== join(directory, `${role}-${identity}`))
    throw new Error('review authentication staged path malformed');
  const descriptor = openSync(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  let bytes: Buffer | undefined;
  let primary: { cause: unknown } | undefined;
  try {
    const entry = fstatSync(descriptor);
    const uid = process.getuid?.();
    // Proof: symlink, group-mode and hard-link faults reached the reader before their inode predicates were restored.
    if (
      uid === undefined ||
      !entry.isFile() ||
      entry.uid !== uid ||
      entry.nlink !== 1 ||
      (entry.mode & 0o077) !== 0
    )
      throw new Error('review authentication staged file malformed');
    // Proof: oversized_bundle reached the reader without this pre-read ceiling.
    if (entry.size > ceiling) throw new Error('review authentication staged file too large');
    const buffer = Buffer.alloc(ceiling + 1);
    let count = 0;
    while (count < buffer.length) {
      const read = readSync(descriptor, buffer, count, buffer.length - count, count);
      if (read === 0) break;
      count += read;
    }
    if (count > ceiling) throw new Error('review authentication staged file too large');
    bytes = buffer.subarray(0, count);
    // Proof: changed_bundle admitted the overwritten staged bytes without rehash.
    if (hashBytes(bytes) !== identity)
      throw new Error('review authentication staged digest differs');
  } catch (cause) {
    primary = { cause };
  }
  let closeFailure: { cause: unknown } | undefined;
  try {
    closeSync(descriptor);
  } catch (cause) {
    closeFailure = { cause };
  }
  // Proof: close_failure previously replaced a staged digest error; the
  // mounted test now observes both exact causes.
  if (closeFailure !== undefined)
    throw new AggregateError(
      primary === undefined ? [closeFailure.cause] : [primary.cause, closeFailure.cause],
      'review authentication staged file close failed',
    );
  if (primary !== undefined) throw primary.cause;
  if (bytes === undefined) throw new Error('review authentication staged bytes unavailable');
  return bytes;
}

/** Reopens retrieved files as private, bounded, digest-addressed bytes; this grants no authentication or receipt authority. */
export function rereadReviewJournal(
  retrieved: RetrievedReviewJournal,
  manifestIdentity: string,
): {
  readonly manifestBytes: Buffer;
  readonly artifacts: readonly {
    readonly kind: string;
    readonly identity: string;
    readonly bytes: Buffer;
  }[];
  readonly bundleCandidates: readonly { readonly identity: string; readonly bytes: Buffer }[];
} {
  if (!Sha256.test(manifestIdentity))
    throw new Error('review authentication manifest identity malformed');
  const directory = retrieved.directory;
  const directoryEntry = lstatSync(directory);
  const uid = process.getuid?.();
  if (
    uid === undefined ||
    !directoryEntry.isDirectory() ||
    directoryEntry.uid !== uid ||
    (directoryEntry.mode & 0o077) !== 0
  )
    throw new Error('review authentication staging directory malformed');
  // Proof: count_candidates and count_artifacts separately admitted 17 candidate
  // and 65 artifact entries when their respective bounds were omitted.
  if (
    retrieved.bundleCandidates.length > MaximumCandidates ||
    retrieved.artifacts.length > MaximumArtifacts
  )
    throw new Error('review authentication staged resource count exceeded');
  const manifestBytes = readStagedBytes(
    directory,
    retrieved.manifestPath,
    'manifest',
    manifestIdentity,
    MaximumManifestBytes,
  );
  const artifacts = retrieved.artifacts.map((artifact) => {
    if (!Sha256.test(artifact.identity))
      throw new Error('review authentication artifact identity malformed');
    return {
      kind: artifact.kind,
      identity: artifact.identity,
      bytes: readStagedBytes(
        directory,
        artifact.path,
        'artifact',
        artifact.identity,
        MaximumArtifactBytes,
      ),
    };
  });
  const bundleCandidates = retrieved.bundleCandidates.map((candidate) => {
    if (!Sha256.test(candidate.identity))
      throw new Error('review authentication bundle identity malformed');
    return {
      identity: candidate.identity,
      bytes: readStagedBytes(
        directory,
        candidate.path,
        'bundle',
        candidate.identity,
        MaximumBundleBytes,
      ),
    };
  });
  return { manifestBytes, artifacts, bundleCandidates };
}
