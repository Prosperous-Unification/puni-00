import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import { isAbsolute, join, resolve, sep } from 'node:path';

import { parseOrThrow, type } from '@shared/validation';
import { Database } from 'bun:sqlite';

import { hashBytes, hashCanonical, serializeCanonical } from '../evidence/content-manifest';
import type { ReviewExpectation } from './controller';
import { assertActivationRequest } from './request';

const Sha256 = /^[0-9a-f]{64}$/;
// Linux O_CLOEXEC is absent from Node's fs.constants type.
const CloseOnExec = 0o2000000;
const ReviewJournalRegistration = type({
  schemaVersion: '1',
  kind: "'review-journal-registration'",
  registrationKey: Sha256,
  requestIdentity: Sha256,
  reviewId: 'string>=1',
  attempt: 'number.integer>=0',
  invocationId: 'string>=1',
  coldObligationIdentity: Sha256,
  informedObligationIdentity: Sha256,
  effectKey: Sha256,
  payloadDigest: Sha256,
  descriptorIdentity: Sha256,
  journalIssuerId: 'string>=1',
  executorId: 'string>=1',
  protocolIdentity: Sha256,
  promptIdentity: Sha256,
  journalId: 'string>=1',
  manifestIdentity: Sha256,
}).onUndeclaredKey('reject');
export type ReviewJournalRegistration = typeof ReviewJournalRegistration.infer;

const ReviewJournalManifest = type({
  schemaVersion: '1',
  kind: "'review-journal-manifest'",
  descriptorIdentity: Sha256,
  journalIssuerId: 'string>=1',
  executorId: 'string>=1',
  protocolIdentity: Sha256,
  promptIdentity: Sha256,
  journalId: 'string>=1',
  effectKey: Sha256,
  payloadDigest: Sha256,
  requestIdentity: Sha256,
  reviewId: 'string>=1',
  attempt: 'number.integer>=0',
  invocationId: 'string>=1',
  phases: type({
    phase: "'cold'|'informed'",
    obligationIdentity: Sha256,
    submissionDigest: Sha256,
    sourceEvidenceDigest: Sha256,
    status: "'passed'|'failed'|'skipped'",
  })
    .onUndeclaredKey('reject')
    .array(),
  artifacts: type({
    kind: "'cold-output'|'informed-output'|'review-evidence'|'required-read'|'raw-response'|'telemetry'",
    identity: Sha256,
  })
    .onUndeclaredKey('reject')
    .array(),
}).onUndeclaredKey('reject');
export type ReviewJournalManifest = typeof ReviewJournalManifest.infer;

const StoredRegistration = type({
  request_identity: Sha256,
  review_id: 'string>=1',
  attempt: 'number.integer>=0',
  invocation_id: 'string>=1',
}).onUndeclaredKey('reject');
const StoredRequestAuthority = type({
  request_identity: Sha256,
  request_bytes: 'string>=1',
  bootstrap_identity: Sha256,
  evaluation_plan_identity: Sha256,
}).onUndeclaredKey('reject');
const StoredDispatch = type({
  effect_key: Sha256,
  request_identity: Sha256,
  plan_identity: Sha256,
  review_id: 'string>=1',
  attempt: 'number.integer>=0',
  invocation_id: 'string>=1',
  cold_obligation_identity: Sha256,
  informed_obligation_identity: Sha256,
  authority_identity: Sha256,
  target_bytes: 'string>=1',
  payload_bytes: 'string>=1',
  payload_digest: Sha256,
}).onUndeclaredKey('reject');
export type ReviewJournalDispatch = typeof StoredDispatch.infer;
const ReservedPayload = type({
  request: 'unknown',
  planIdentity: Sha256,
  reviewId: 'string>=1',
  attempt: 'number.integer>=0',
  invocationId: 'string>=1',
  coldObligationIdentity: Sha256,
  informedObligationIdentity: Sha256,
  authorityIdentity: Sha256,
  target: type({
    kind: "'reviewer'",
    providerId: 'string>=1',
    executorId: 'string>=1',
  }).onUndeclaredKey('reject'),
  protocolIdentity: Sha256,
  promptIdentity: Sha256,
}).onUndeclaredKey('reject');

function registrationKey(expected: ReviewExpectation): string {
  return hashCanonical({
    kind: 'review-journal-registration',
    requestIdentity: expected.requestIdentity,
    reviewId: expected.reviewId,
    attempt: expected.attempt,
    invocationId: expected.invocationId,
  });
}

function protectedRegistrationBytes(root: string, key: string): string {
  // Proof: root_lexical omitted this predicate and admitted a `${root}/.` registry.
  if (!isAbsolute(root) || resolve(root) !== root || root.includes('\0'))
    throw new Error('review journal registration root malformed');
  const serviceUid = process.getuid?.();
  if (serviceUid === undefined) throw new Error('review journal owner unavailable');
  const rootUid = lstatSync(sep).uid;
  let ancestor: string = sep;
  for (const component of root.split(sep).filter(Boolean)) {
    ancestor = join(ancestor, component);
    const entry = lstatSync(ancestor);
    // Proof: ancestor_owner, ancestor_type and root_mode each omitted one predicate;
    // each admitted its foreign-owner, nondirectory or replaceable-root fixture.
    if (
      !entry.isDirectory() ||
      (entry.uid !== rootUid && entry.uid !== serviceUid) ||
      ((entry.mode & 0o022) !== 0 && !((entry.mode & 0o1000) !== 0 && entry.uid === rootUid))
    )
      throw new Error('review journal registration ancestor malformed');
  }
  const path = join(root, `${key}.json`);
  let descriptor: number;
  try {
    // Proof: leaf_nofollow admitted a symlinked registration when O_NOFOLLOW
    // was omitted. nonblock timed out the FIFO child at exit 124 rather than
    // producing the required prompt file-malformed refusal.
    descriptor = openSync(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK | CloseOnExec,
    );
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')
      throw new Error('review journal registration absent', { cause });
    throw new Error('review journal registration unreadable', { cause });
  }
  try {
    const entry = fstatSync(descriptor);
    // Proof: leaf_type, leaf_nlink, leaf_owner and leaf_mode independently admitted
    // the nonfile, hard-linked, foreign-owner and group-readable fixtures.
    if (
      !entry.isFile() ||
      entry.nlink !== 1 ||
      (entry.uid !== rootUid && entry.uid !== serviceUid) ||
      (entry.mode & 0o077) !== 0
    )
      throw new Error('review journal registration file malformed');
    const buffer = Buffer.alloc(65_537);
    let count = 0;
    while (count < buffer.length) {
      const read = readSync(descriptor, buffer, count, buffer.length - count, count);
      if (read === 0) break;
      count += read;
    }
    // Proof: registration_size omitted this cap and admitted a canonical
    // protected registration one byte above the allowed size.
    if (count > 65_536) throw new Error('review journal registration too large');
    // Proof: fatal_utf8 omitted fatal decoding and admitted a canonical-looking
    // protected record with an invalid byte inside its journal ID.
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, count));
  } finally {
    closeSync(descriptor);
  }
}

/** Reads an immutable protected registration selected only by the persisted review expectation. */
export function lookupReviewJournalRegistration(options: {
  readonly databasePath: string;
  readonly registrationRoot: string;
  readonly descriptorIdentity: string;
  readonly trustedProviderId: string;
  readonly expected: ReviewExpectation;
}): { readonly registration: ReviewJournalRegistration; readonly dispatch: ReviewJournalDispatch } {
  if (!Sha256.test(options.descriptorIdentity))
    throw new Error('review journal descriptor identity malformed');
  const key = registrationKey(options.expected);
  const bytes = protectedRegistrationBytes(options.registrationRoot, key);
  let registration: ReviewJournalRegistration;
  try {
    const parsed: unknown = JSON.parse(bytes);
    // Proof: registration_version and registration_kind relaxed only their schema
    // literals; the corresponding protected lookup then admitted the foreign record.
    registration = parseOrThrow(ReviewJournalRegistration, parsed);
    // Proof: registration_canonical omitted this comparison and admitted
    // whitespace-reformatted protected registration bytes.
    if (serializeCanonical(registration) !== bytes)
      throw new Error('review journal registration not canonical');
  } catch (cause) {
    throw new Error('review journal registration malformed', { cause });
  }
  const database = new Database(options.databasePath, { readonly: true });
  try {
    const requestRow: unknown = database
      .query(
        'SELECT request_identity, request_bytes, bootstrap_identity, evaluation_plan_identity FROM activation_request WHERE request_identity = ?',
      )
      .get(options.expected.requestIdentity);
    if (requestRow === null) throw new Error('review journal frozen request absent');
    const storedRequest = parseOrThrow(StoredRequestAuthority, requestRow);
    const stored: unknown = database
      .query(
        'SELECT request_identity, review_id, attempt, invocation_id FROM activation_review_attempt WHERE request_identity = ? AND review_id = ? AND attempt = ?',
      )
      .get(options.expected.requestIdentity, options.expected.reviewId, options.expected.attempt);
    if (stored === null) throw new Error('review journal invocation registration absent');
    const invocation = parseOrThrow(StoredRegistration, stored);
    const source: unknown = database
      .query(
        `SELECT effect_key, request_identity, plan_identity, review_id, attempt, invocation_id,
        cold_obligation_identity, informed_obligation_identity, authority_identity,
        target_bytes, payload_bytes, payload_digest FROM activation_review_dispatch
        WHERE request_identity = ? AND review_id = ? AND attempt = ?`,
      )
      .get(options.expected.requestIdentity, options.expected.reviewId, options.expected.attempt);
    if (source === null) throw new Error('review journal dispatch reservation absent');
    const dispatch = parseOrThrow(StoredDispatch, source);
    const computedEffectKey = hashCanonical({
      kind: 'review-dispatch',
      requestIdentity: options.expected.requestIdentity,
      reviewId: options.expected.reviewId,
      attempt: options.expected.attempt,
    });
    // Proof: reg_key/request/review/attempt/invocation/payload/executor/protocol/prompt
    // and the earlier registration/dispatch field watches each omitted one join;
    // each admitted its foreign protected registration in the named lookup test.
    if (
      registration.registrationKey !== key ||
      registration.requestIdentity !== options.expected.requestIdentity ||
      registration.reviewId !== options.expected.reviewId ||
      registration.attempt !== options.expected.attempt ||
      registration.invocationId !== options.expected.invocationId ||
      invocation.invocation_id !== options.expected.invocationId ||
      dispatch.invocation_id !== options.expected.invocationId ||
      dispatch.effect_key !== computedEffectKey ||
      registration.effectKey !== computedEffectKey ||
      registration.payloadDigest !== dispatch.payload_digest ||
      registration.descriptorIdentity !== options.descriptorIdentity ||
      registration.journalIssuerId !== options.expected.journalIssuerId ||
      registration.executorId !== options.expected.executorId ||
      registration.protocolIdentity !== options.expected.protocolIdentity ||
      registration.promptIdentity !== options.expected.promptIdentity ||
      registration.coldObligationIdentity !== dispatch.cold_obligation_identity ||
      registration.informedObligationIdentity !== dispatch.informed_obligation_identity
    )
      throw new Error('review journal registration differs from reserved invocation');
    const selected =
      options.expected.phase === 'cold'
        ? registration.coldObligationIdentity
        : registration.informedObligationIdentity;
    // Proof: selected_phase omitted this join and admitted a foreign selected
    // obligation locator under an otherwise valid protected registration.
    if (selected !== options.expected.obligationIdentity)
      throw new Error('review journal obligation differs from registered phase');
    // Proof: payload_digest omitted this check and admitted changed reserved
    // payload bytes whose stored digest and registration had not changed.
    if (hashBytes(dispatch.payload_bytes) !== dispatch.payload_digest)
      throw new Error('review journal reserved payload digest changed');
    let payload: typeof ReservedPayload.infer;
    try {
      const parsed: unknown = JSON.parse(dispatch.payload_bytes);
      payload = parseOrThrow(ReservedPayload, parsed);
    } catch (cause) {
      throw new Error('review journal reserved payload malformed', { cause });
    }
    const request = assertActivationRequest(payload.request);
    let persisted: unknown;
    try {
      persisted = JSON.parse(storedRequest.request_bytes);
    } catch (cause) {
      throw new Error('review journal frozen request malformed', { cause });
    }
    assertActivationRequest(persisted);
    // Proof: request_identity and request_authority each removed one join;
    // coherent payload/row repins then admitted a foreign frozen request or
    // authority under the selected request key.
    if (
      request.requestIdentity !== options.expected.requestIdentity ||
      request.authorityIdentity !== dispatch.authority_identity
    )
      throw new Error('review journal request differs from reservation');
    // Proof: payload_canonical omitted this comparison and admitted a
    // noncanonical but digest-matching stored dispatch payload.
    if (serializeCanonical(payload) !== dispatch.payload_bytes)
      throw new Error('review journal reserved payload not canonical');
    // Proof: stored_bytes/bootstrap/plan each omitted one persisted-request
    // comparison and admitted its changed source row in the mounted lookup.
    if (
      serializeCanonical(request) !== storedRequest.request_bytes ||
      storedRequest.bootstrap_identity !== dispatch.authority_identity ||
      storedRequest.evaluation_plan_identity !== dispatch.plan_identity
    )
      throw new Error('review journal frozen request or plan differs from reservation');
    // Proof: payload_plan/review/attempt/invocation/cold/informed/authority/
    // executor/prompt/target each omitted one frozen join and admitted its
    // coherently rehashed foreign reservation. The executor fixture also
    // changes stored target bytes to isolate its exact predicate.
    if (
      payload.planIdentity !== dispatch.plan_identity ||
      payload.reviewId !== options.expected.reviewId ||
      payload.attempt !== options.expected.attempt ||
      payload.invocationId !== options.expected.invocationId ||
      payload.coldObligationIdentity !== dispatch.cold_obligation_identity ||
      payload.informedObligationIdentity !== dispatch.informed_obligation_identity ||
      payload.authorityIdentity !== dispatch.authority_identity ||
      payload.target.providerId !== options.trustedProviderId ||
      payload.target.executorId !== options.expected.executorId ||
      payload.protocolIdentity !== options.expected.protocolIdentity ||
      payload.promptIdentity !== options.expected.promptIdentity ||
      serializeCanonical(payload.target) !== dispatch.target_bytes
    )
      throw new Error('review journal reserved payload differs from frozen expectation');
    return { registration, dispatch };
  } finally {
    database.close();
  }
}

/** Validates a journal manifest's own identity and its registered phase, without authenticating a signature. */
export function decodeReviewJournalManifest(
  bytes: string,
  registration: ReviewJournalRegistration,
  expected: ReviewExpectation,
): ReviewJournalManifest {
  // Proof: manifest_size omitted this byte cap and admitted a schema-valid,
  // digest-matching manifest larger than 1 MiB.
  if (Buffer.byteLength(bytes, 'utf8') > 1_048_576)
    throw new Error('review journal manifest too large');
  let manifest: ReviewJournalManifest;
  try {
    const parsed: unknown = JSON.parse(bytes);
    // Proof: manifest_version and manifest_kind relaxed only their schema literals;
    // each admitted a digest-matching unsupported manifest through this decoder.
    manifest = parseOrThrow(ReviewJournalManifest, parsed);
  } catch (cause) {
    throw new Error('review journal manifest malformed', { cause });
  }
  // Proof: manifest_canonical omitted this check and admitted a reordered
  // digest-matching manifest encoding.
  if (serializeCanonical(manifest) !== bytes)
    throw new Error('review journal manifest not canonical');
  // Proof: manifest_digest omitted this check and admitted a manifest whose
  // exact bytes differed from the protected registration digest.
  if (hashBytes(bytes) !== registration.manifestIdentity)
    throw new Error('review journal manifest differs from registration');
  // Proof: manifest_issuer/executor/protocol/prompt/journal/effect/payload/
  // request/review/attempt/invocation each omitted one binding and admitted
  // its canonical digest-matching foreign manifest.
  if (
    manifest.descriptorIdentity !== registration.descriptorIdentity ||
    manifest.journalIssuerId !== expected.journalIssuerId ||
    manifest.executorId !== expected.executorId ||
    manifest.protocolIdentity !== expected.protocolIdentity ||
    manifest.promptIdentity !== expected.promptIdentity ||
    manifest.journalId !== registration.journalId ||
    manifest.effectKey !== registration.effectKey ||
    manifest.payloadDigest !== registration.payloadDigest ||
    manifest.requestIdentity !== expected.requestIdentity ||
    manifest.reviewId !== expected.reviewId ||
    manifest.attempt !== expected.attempt ||
    manifest.invocationId !== expected.invocationId
  )
    throw new Error('review journal manifest differs from registration');
  const cold = manifest.phases.find((phase) => phase.phase === 'cold');
  const informed = manifest.phases.find((phase) => phase.phase === 'informed');
  // Proof: shape_artifacts, shape_passed_cold and shape_failed_informed each
  // admitted its invalid canonical manifest when its one condition was omitted;
  // the earlier whole-shape fault admitted duplicate cold records.
  if (
    cold === undefined ||
    !(
      (manifest.phases.length === 1 && informed === undefined && cold.status !== 'passed') ||
      (manifest.phases.length === 2 && informed !== undefined && cold.status === 'passed')
    ) ||
    manifest.artifacts.length === 0
  )
    throw new Error('review journal manifest phase set malformed');
  // Proof: pair_cold and pair_informed independently omitted one registered
  // phase join; each admitted a digest-matching foreign opposite phase.
  if (
    cold.obligationIdentity !== registration.coldObligationIdentity ||
    (informed !== undefined &&
      informed.obligationIdentity !== registration.informedObligationIdentity)
  )
    throw new Error('review journal manifest pair differs from registration');
  const phase = manifest.phases.find((entry) => entry.phase === expected.phase);
  // Proof: manifest_phase omitted this locator join and admitted a manifest
  // whose selected obligation differed from the trusted expectation.
  if (phase?.obligationIdentity !== expected.obligationIdentity)
    throw new Error('review journal manifest phase differs from expectation');
  return manifest;
}
