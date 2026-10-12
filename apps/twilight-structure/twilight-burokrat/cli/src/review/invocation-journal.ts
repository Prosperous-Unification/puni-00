import { readFileSync } from 'node:fs';

import { parseOrThrow, type } from '@shared/validation';

import { IsoInstant, OpaqueId, SchemaVersion } from '../contracts/records';
import { hashBytes, hashCanonical, serializeCanonical } from '../evidence/content-manifest';
import {
  ColdHarnessOutput,
  ColdHarnessRequest,
  decodeColdHarnessOutput,
  decodeInformedHarnessOutput,
  decodeReviewEvidence,
  InformedHarnessOutput,
  InformedHarnessRequest,
  ReviewEvidence,
  type ReviewEvidence as ReviewEvidenceRecord,
  ReviewInvocationRequest,
  type ReviewInvocationRequest as ReviewInvocationRequestRecord,
  type VerifiedTelemetry,
} from './protocol';

const Sha256 = type(/^[0-9a-f]{64}$/);
// Proof: widening this boundary to accept `trusted-harness` let a relabeled local journal pass
// the provenance CLI; the test observed `Expected: 1, Received: 0`.
const LocalTrustScope = type("'local-cooperative'");

export const InvocationRegistration = type({
  invocationId: OpaqueId,
  receiptId: OpaqueId,
  registeredAt: IsoInstant,
  harnessArgv: 'string[]',
  stdinArtifact: Sha256,
  stdinBytes: 'string',
})
  .onUndeclaredKey('reject')
  .narrow((registration, context) =>
    // Proof: accepting every identity let a forged registration stdinArtifact pass journal
    // reading; the exact-bytes test reported "function did not throw".
    registration.stdinArtifact === hashBytes(registration.stdinBytes)
      ? true
      : context.mustBe('a stdinArtifact identifying the exact canonical stdin bytes'),
  );
export type InvocationRegistration = typeof InvocationRegistration.infer;

const ExitedProcess = type({
  kind: "'exited'",
  exitCode: 'number.integer',
}).onUndeclaredKey('reject');
const SignaledProcess = type({
  kind: "'signaled'",
  signalCode: 'string>=1',
}).onUndeclaredKey('reject');
const UnresolvedProcessExit = type({
  kind: "'unresolved'",
  exitCode: 'null',
  signalCode: 'string|null',
}).onUndeclaredKey('reject');
const LaunchFailedProcess = type({
  kind: "'launch-failed'",
  message: 'string>=1',
}).onUndeclaredKey('reject');

export const ProcessObservation = type({
  phase: "'cold'|'informed'",
  startedAt: IsoInstant,
  endedAt: IsoInstant,
  stdinArtifact: Sha256,
  stdinBytes: 'string',
  stdoutArtifact: Sha256,
  stdoutBase64: 'string',
  stderrArtifact: Sha256,
  stderrBase64: 'string',
  exit: ExitedProcess.or(SignaledProcess).or(UnresolvedProcessExit).or(LaunchFailedProcess),
})
  .onUndeclaredKey('reject')
  .narrow((observation, context) => {
    // Proof: bypassing this comparison changed a forged stdinArtifact rejection to the downstream
    // telemetry mismatch; the exact-bytes test expected the stdinArtifact boundary itself.
    if (observation.stdinArtifact !== hashBytes(observation.stdinBytes)) {
      return context.mustBe('a stdinArtifact identifying the exact phase stdin bytes');
    }
    const stdout = decodeBase64(observation.stdoutBase64, 'stdoutBase64');
    // Proof: bypassing this comparison let a forged stdoutArtifact pass journal reading; the
    // exact-bytes test reported "function did not throw" at the stdoutArtifact assertion.
    if (observation.stdoutArtifact !== hashBytes(stdout)) {
      return context.mustBe('a stdoutArtifact identifying the exact raw stdout bytes');
    }
    const stderr = decodeBase64(observation.stderrBase64, 'stderrBase64');
    // Proof: bypassing this comparison let rewritten retained stderr pass journal reading; the
    // exact-bytes test reported "function did not throw" at the stderrArtifact assertion.
    if (observation.stderrArtifact !== hashBytes(stderr)) {
      return context.mustBe('a stderrArtifact identifying the exact raw stderr bytes');
    }
    return Date.parse(observation.endedAt) >= Date.parse(observation.startedAt)
      ? true
      : context.mustBe('a process observation whose end is not before its start');
  });
export type ProcessObservation = typeof ProcessObservation.infer;

export const ColdAttempt = type({
  observation: ProcessObservation,
  output: ColdHarnessOutput.or('null'),
  decodeFailure: 'string|null',
}).onUndeclaredKey('reject');
export type ColdAttempt = typeof ColdAttempt.infer;

export const InformedAttempt = type({
  observation: ProcessObservation,
  output: InformedHarnessOutput.or('null'),
  decodeFailure: 'string|null',
}).onUndeclaredKey('reject');
export type InformedAttempt = typeof InformedAttempt.infer;

export const ColdAcknowledgement = type({
  acknowledgedAt: IsoInstant,
  attempt: ColdAttempt,
}).onUndeclaredKey('reject');
export type ColdAcknowledgement = typeof ColdAcknowledgement.infer;

const ReviewedTerminal = type({
  status: "'reviewed'",
  completedAt: IsoInstant,
  informed: InformedAttempt,
  evidence: ReviewEvidence,
}).onUndeclaredKey('reject');

const ColdUnverifiedTerminal = type({
  status: "'unverified'",
  completedAt: IsoInstant,
  phase: "'cold'",
  reason: 'string>=1',
  attempt: ColdAttempt,
  evidence: 'null',
}).onUndeclaredKey('reject');

const InformedUnverifiedTerminal = type({
  status: "'unverified'",
  completedAt: IsoInstant,
  phase: "'informed'",
  reason: 'string>=1',
  attempt: InformedAttempt,
  evidence: 'null',
}).onUndeclaredKey('reject');

export const InvocationTerminal = ReviewedTerminal.or(ColdUnverifiedTerminal).or(
  InformedUnverifiedTerminal,
);
export type InvocationTerminal = typeof InvocationTerminal.infer;

const RegisteredInvocation = type({
  state: "'registered'",
  registration: InvocationRegistration,
}).onUndeclaredKey('reject');

const ColdAcknowledgedInvocation = type({
  state: "'cold-acknowledged'",
  registration: InvocationRegistration,
  cold: ColdAcknowledgement,
}).onUndeclaredKey('reject');

const TerminalInvocation = type({
  state: "'terminal'",
  registration: InvocationRegistration,
  'cold?': ColdAcknowledgement,
  terminal: InvocationTerminal,
}).onUndeclaredKey('reject');

export const InvocationJournalRecord = type({
  schemaVersion: SchemaVersion,
  journalId: OpaqueId,
  trustScope: LocalTrustScope,
  entries: RegisteredInvocation.or(ColdAcknowledgedInvocation).or(TerminalInvocation).array(),
})
  .onUndeclaredKey('reject')
  .narrow((journal, context) =>
    new Set(journal.entries.map(({ registration }) => registration.invocationId)).size ===
    journal.entries.length
      ? true
      : context.mustBe('entries with unique invocationId'),
  );
export type InvocationJournalRecord = typeof InvocationJournalRecord.infer;

export interface DurableAcceptance {
  status: 'durable';
  journalId: string;
  invocationId: string;
  artifact: string;
}

export interface InvocationJournal {
  readonly journalId: string;
  readonly trustScope: 'local-cooperative';
  register(registration: InvocationRegistration): DurableAcceptance;
  acknowledgeCold(invocationId: string, cold: ColdAcknowledgement): DurableAcceptance;
  complete(invocationId: string, terminal: InvocationTerminal): DurableAcceptance;
  read(): InvocationJournalRecord;
}

export interface ReviewInvoker {
  invoke(request: ReviewInvocationRequestRecord): ReviewInvocationResult;
}

export type ReviewInvocationResult =
  | { status: 'verified'; evidence: ReviewEvidenceRecord }
  | { status: 'unverified'; invocationId: string; reason: string };

function decodeBase64(source: string, subject: string): Uint8Array {
  const bytes = Buffer.from(source, 'base64');
  if (bytes.toString('base64') !== source) throw new Error(`${subject} is not canonical base64`);
  return bytes;
}

function decodeUtf8(bytes: Uint8Array, subject: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`${subject} is not UTF-8: ${detail}`, { cause });
  }
}

function decodeJson(source: string, subject: string): unknown {
  try {
    return JSON.parse(source) as unknown;
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`${subject} is malformed JSON: ${detail}`, { cause });
  }
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** Decodes the registered stdin as the exact canonical review request its registration names. */
export function decodeInvocationRegistration(
  registration: InvocationRegistration,
): ReviewInvocationRequestRecord {
  const request = parseOrThrow(
    ReviewInvocationRequest,
    decodeJson(registration.stdinBytes, 'registered review request'),
  );
  if (serializeCanonical(request) !== registration.stdinBytes) {
    throw new Error(`registered review request is not exact canonical stdin`);
  }
  if (
    request.invocationId !== registration.invocationId ||
    request.receiptId !== registration.receiptId
  ) {
    throw new Error(`registered review request identity differs from journal registration`);
  }
  return request;
}

/**
 * Builds the cold stdin without informed context identities or payloads.
 *
 * Proof: adding `informedContextIds` here and to the cold schema made the production harness exit
 * 31 (`review harness exited 31`) in the durable-boundary test.
 */
export function coldHarnessRequest(
  request: ReviewInvocationRequestRecord,
): typeof ColdHarnessRequest.infer {
  return parseOrThrow(ColdHarnessRequest, {
    schemaVersion: 1,
    messageKind: 'cold-request',
    invocationId: request.invocationId,
    receiptId: request.receiptId,
    protocol: request.protocol,
    subject: request.subject,
  });
}

/** Builds the informed stdin from the request and the durable cold acknowledgement's judgment. */
export function informedHarnessRequest(
  request: ReviewInvocationRequestRecord,
  cold: ColdAcknowledgement,
): typeof InformedHarnessRequest.infer {
  if (cold.attempt.output === null) throw new Error(`cold acknowledgement has no decoded output`);
  return parseOrThrow(InformedHarnessRequest, {
    schemaVersion: 1,
    messageKind: 'informed-request',
    invocationId: request.invocationId,
    receiptId: request.receiptId,
    protocol: request.protocol,
    subject: request.subject,
    cold: cold.attempt.output.cold,
    coldArtifact: hashCanonical(cold.attempt.output.cold),
    informedContextIds: request.informedContextIds,
  });
}

function decodeAttemptOutput<T>(
  observation: ProcessObservation,
  retained: T | null,
  decode: (input: unknown) => T,
): T | null {
  if (retained === null) return null;
  const bytes = decodeBase64(observation.stdoutBase64, 'stdoutBase64');
  let decoded: T;
  try {
    decoded = decode(
      decodeJson(decodeUtf8(bytes, 'retained phase stdout'), 'retained phase stdout'),
    );
  } catch (cause) {
    throw new Error(`retained output is not decodable from exact stdout: ${errorMessage(cause)}`, {
      cause,
    });
  }
  // Proof: removing the retained-vs-decoded comparison let a rewritten payload and telemetry
  // charge pass readInvocationJournal; the exact-stdout test reported "function did not throw".
  if (hashCanonical(decoded) !== hashCanonical(retained)) {
    throw new Error(`retained output differs from exact stdout`);
  }
  return decoded;
}

function reconcileTelemetry(
  telemetry: VerifiedTelemetry,
  observation: ProcessObservation,
  registeredAt: string,
  invocationId: string,
): void {
  // Proof: bypassing this comparison made a cold receipt for `invocation.forged` verify; the
  // telemetry-invalid test received `verified` instead of `unverified`.
  if (telemetry.receipt.invocationId !== invocationId) {
    throw new Error(`telemetry invocationId differs from registered invocation`);
  }
  if (telemetry.receipt.inputArtifact !== observation.stdinArtifact) {
    throw new Error(`telemetry inputArtifact differs from exact phase stdin`);
  }
  if (Date.parse(telemetry.receipt.startedAt) < Date.parse(registeredAt)) {
    throw new Error(`telemetry starts before durable invocation registration`);
  }
}

/**
 * Reconciles retained bytes without treating an invalid protocol claim as invalid journal data.
 *
 * Proof: moving the protocol comparison into this byte reconciliation made terminal persistence
 * throw `cold output protocol, subject or invocation differs from registered request`.
 */
function reconcileColdAttempt(
  registration: InvocationRegistration,
  attempt: ColdAttempt,
): ColdHarnessOutput | null {
  const request = decodeInvocationRegistration(registration);
  if (attempt.observation.phase !== 'cold') throw new Error(`cold attempt has informed phase`);
  const expectedInput = serializeCanonical(coldHarnessRequest(request));
  if (attempt.observation.stdinBytes !== expectedInput) {
    throw new Error(`cold attempt stdin differs from cold-only request`);
  }
  const output = decodeAttemptOutput(attempt.observation, attempt.output, decodeColdHarnessOutput);
  if (output === null) return null;
  return output;
}

function reconcileInformedAttempt(
  registration: InvocationRegistration,
  cold: ColdAcknowledgement,
  attempt: InformedAttempt,
): InformedHarnessOutput | null {
  const request = decodeInvocationRegistration(registration);
  if (attempt.observation.phase !== 'informed') throw new Error(`informed attempt has cold phase`);
  const expected = informedHarnessRequest(request, cold);
  if (attempt.observation.stdinBytes !== serializeCanonical(expected)) {
    throw new Error(`informed attempt stdin differs from acknowledged cold boundary`);
  }
  const output = decodeAttemptOutput(
    attempt.observation,
    attempt.output,
    decodeInformedHarnessOutput,
  );
  if (output === null) return null;
  return output;
}

function assertSuccessfulAttempt<T extends ColdHarnessOutput | InformedHarnessOutput>(
  attempt: ColdAttempt | InformedAttempt,
  output: T | null,
): asserts output is T & { telemetry: VerifiedTelemetry } {
  if (attempt.observation.exit.kind === 'launch-failed') {
    throw new Error(`launch failed: ${attempt.observation.exit.message}`);
  }
  // Proof: returning here let a signal attempt reach null telemetry; both production harness
  // tests received `null is not an object (evaluating 'output.telemetry')` instead of SIGTERM.
  if (attempt.observation.exit.kind === 'signaled') {
    throw new Error(`review harness terminated by ${attempt.observation.exit.signalCode}`);
  }
  if (attempt.observation.exit.kind === 'unresolved') {
    throw new Error(
      attempt.observation.exit.signalCode === ''
        ? `review harness returned no exit code and an empty signal code`
        : `review harness returned neither an exit code nor a signal code`,
    );
  }
  if (attempt.observation.exit.exitCode !== 0) {
    throw new Error(`review harness exited ${String(attempt.observation.exit.exitCode)}`);
  }
  if (attempt.decodeFailure !== null) throw new Error(attempt.decodeFailure);
  if (output === null) throw new Error(`review harness produced no decodable output`);
  // Proof: accepting unverified telemetry here launched informed; the partial-telemetry test
  // received informed `verified` telemetry instead of retained cold `unverified` telemetry.
  if (output.telemetry.status === 'unverified') throw new Error(output.telemetry.reason);
  if (output.telemetry.receipt.status !== 'completed') {
    throw new Error(`invocation status ${output.telemetry.receipt.status}`);
  }
}

/** Derives the review evidence two verified phases with one executor and price identity prove. */
export function deriveReviewEvidence(
  request: ReviewInvocationRequestRecord,
  cold: ColdHarnessOutput,
  informed: InformedHarnessOutput,
  journalId: string,
): ReviewEvidenceRecord {
  if (cold.telemetry.status !== 'verified' || informed.telemetry.status !== 'verified') {
    throw new Error(`review evidence requires verified phase telemetry`);
  }
  if (
    hashCanonical(cold.telemetry.receipt.executor) !==
      hashCanonical(informed.telemetry.receipt.executor) ||
    hashCanonical(cold.telemetry.receipt.priceIdentity) !==
      hashCanonical(informed.telemetry.receipt.priceIdentity)
  ) {
    throw new Error(`review phases require one compatible executor and price identity`);
  }
  const coldArtifact = hashCanonical(cold.cold);
  return parseOrThrow(ReviewEvidence, {
    schemaVersion: 1,
    receipt: {
      schemaVersion: 1,
      receiptKind: 'review',
      receiptId: request.receiptId,
      invocationId: request.invocationId,
      executor: informed.telemetry.receipt.executor,
      suppliedContextIds: [
        request.protocol.protocolBlob,
        request.subject.contentIdentity,
        ...request.informedContextIds,
      ],
      observedReadIds: [...cold.cold.observedReadIds, ...informed.informed.observedReadIds],
      rawResponseArtifact: hashBytes(informed.rawResponse.payload),
      rawUsage: [...cold.telemetry.receipt.rawUsage, ...informed.telemetry.receipt.rawUsage],
      priceIdentity: informed.telemetry.receipt.priceIdentity,
      trust: { scope: 'local-cooperative', journalId },
    },
    protocolEvidence: {
      schemaVersion: 1,
      protocol: request.protocol,
      subject: request.subject,
      cold: cold.cold,
      expansion: {
        sequence: 2,
        coldJudgmentArtifact: coldArtifact,
        suppliedContextIds: request.informedContextIds,
      },
      informed: informed.informed,
    },
    // Proof: swapping these receipts made the cold cost assertion receive 14000 µUSD instead of
    // 11000 µUSD, so phase costs cannot collapse into an aggregate.
    phaseReceipts: { cold: cold.telemetry, informed: informed.telemetry },
    phaseTools: { cold: cold.actualTools, informed: informed.actualTools },
    // Proof: filtering out the repeated cold tool made the phase-order test receive two tool
    // observations instead of the exact three-entry sequence (including its duplicate).
    actualTools: [...cold.actualTools, ...informed.actualTools],
    rawResponse: {
      artifact: hashBytes(informed.rawResponse.payload),
      retention: informed.rawResponse.retention,
    },
  });
}

/** Reconciles a cold acknowledgement against its registration; throws unless the cold phase succeeded. */
export function reconcileColdAcknowledgement(
  registration: InvocationRegistration,
  cold: ColdAcknowledgement,
): ColdHarnessOutput {
  const request = decodeInvocationRegistration(registration);
  const output = reconcileColdAttempt(registration, cold.attempt);
  assertSuccessfulAttempt(cold.attempt, output);
  reconcileTelemetry(
    output.telemetry,
    cold.attempt.observation,
    registration.registeredAt,
    registration.invocationId,
  );
  if (
    output.invocationId !== request.invocationId ||
    hashCanonical(output.protocol) !== hashCanonical(request.protocol) ||
    hashCanonical(output.subject) !== hashCanonical(request.subject)
  ) {
    throw new Error(`cold output protocol, subject or invocation differs from registered request`);
  }
  return output;
}

/** Reconciles a successful informed attempt against its registration and cold acknowledgement. */
export function reconcileReviewedInformed(
  registration: InvocationRegistration,
  cold: ColdAcknowledgement,
  attempt: InformedAttempt,
): InformedHarnessOutput {
  const request = decodeInvocationRegistration(registration);
  const expected = informedHarnessRequest(request, cold);
  const output = reconcileInformedAttempt(registration, cold, attempt);
  assertSuccessfulAttempt(attempt, output);
  reconcileTelemetry(
    output.telemetry,
    attempt.observation,
    registration.registeredAt,
    registration.invocationId,
  );
  if (
    output.invocationId !== request.invocationId ||
    hashCanonical(output.protocol) !== hashCanonical(request.protocol) ||
    hashCanonical(output.subject) !== hashCanonical(request.subject) ||
    output.coldArtifact !== expected.coldArtifact
  ) {
    throw new Error(`informed output differs from acknowledged cold boundary or request`);
  }
  return output;
}

/** Reconciles one journal entry's retained bytes; a reviewed terminal must re-derive its evidence. */
export function reconcileJournalEntry(
  entry: InvocationJournalRecord['entries'][number],
  journalId: string,
): void {
  const request = decodeInvocationRegistration(entry.registration);
  if (entry.state === 'registered') return;
  if (entry.state === 'cold-acknowledged') {
    reconcileColdAcknowledgement(entry.registration, entry.cold);
    return;
  }
  if (entry.terminal.status === 'unverified') {
    if (entry.terminal.phase === 'cold') {
      reconcileColdAttempt(entry.registration, entry.terminal.attempt);
    } else {
      if (entry.cold === undefined)
        throw new Error(`informed terminal has no cold acknowledgement`);
      reconcileColdAcknowledgement(entry.registration, entry.cold);
      reconcileInformedAttempt(entry.registration, entry.cold, entry.terminal.attempt);
    }
    return;
  }
  if (entry.cold === undefined) throw new Error(`reviewed terminal has no cold acknowledgement`);
  const cold = reconcileColdAcknowledgement(entry.registration, entry.cold);
  const informed = reconcileReviewedInformed(
    entry.registration,
    entry.cold,
    entry.terminal.informed,
  );
  const derived = deriveReviewEvidence(request, cold, informed, journalId);
  if (hashCanonical(derived) !== hashCanonical(entry.terminal.evidence)) {
    throw new Error(`retained review evidence differs from exact phase outputs and request`);
  }
}

/** Reads and reconciles every retained field against canonical request and process bytes. */
export function readInvocationJournal(path: string): InvocationJournalRecord {
  let bytes: Uint8Array;
  try {
    bytes = readFileSync(path);
  } catch (cause) {
    throw new Error(`cannot read invocation journal ${path}: ${errorMessage(cause)}`, { cause });
  }
  const journal = parseOrThrow(
    InvocationJournalRecord,
    decodeJson(decodeUtf8(bytes, `invocation journal ${path}`), `invocation journal ${path}`),
  );
  for (const entry of journal.entries) reconcileJournalEntry(entry, journal.journalId);
  return journal;
}

export type ProvenanceRequirement = 'allow-local' | 'require-external';

export interface ProvenanceValidation {
  status: 'verified';
  scope: 'local-cooperative';
  satisfiesExternal: false;
}

/** Re-derives writer evidence from exact retained phase bytes before comparison. */
export function validateReviewProvenance(
  journal: InvocationJournalRecord,
  submitted: unknown,
  requirement: ProvenanceRequirement,
): ProvenanceValidation {
  const evidence = decodeReviewEvidence(submitted);
  const entry = journal.entries.find(
    ({ registration }) => registration.invocationId === evidence.receipt.invocationId,
  );
  // Proof: falling back to the first entry changed a forged-id CLI rejection from
  // `unknown invocation: invocation.forged` to a generic evidence mismatch.
  if (entry === undefined) throw new Error(`unknown invocation: ${evidence.receipt.invocationId}`);
  if (
    entry.state !== 'terminal' ||
    entry.terminal.status !== 'reviewed' ||
    entry.cold === undefined
  ) {
    throw new Error(
      `invocation is not a verified reviewed terminal: ${evidence.receipt.invocationId}`,
    );
  }
  const request = decodeInvocationRegistration(entry.registration);
  const cold = reconcileColdAcknowledgement(entry.registration, entry.cold);
  const informed = reconcileReviewedInformed(
    entry.registration,
    entry.cold,
    entry.terminal.informed,
  );
  const recorded = deriveReviewEvidence(request, cold, informed, journal.journalId);
  // Proof: removing this durable-cold comparison changed the production negative to the generic
  // `review evidence differs from exact journal observations`, missing the cold-boundary failure.
  if (
    hashCanonical(evidence.protocolEvidence.cold) !== hashCanonical(cold.cold) ||
    evidence.protocolEvidence.expansion.coldJudgmentArtifact !== hashCanonical(cold.cold)
  ) {
    throw new Error(`submitted cold judgment differs from durable cold acknowledgement`);
  }
  // Proof: bypassing this canonical comparison made the altered raw-response CLI exit 0; the
  // provenance negative observed `Expected: 1, Received: 0`.
  if (hashCanonical(evidence) !== hashCanonical(recorded)) {
    throw new Error(`review evidence differs from exact journal observations`);
  }
  // Proof: bypassing this refusal made the require-external CLI return 0; the provenance test
  // observed `Expected: 1, Received: 0`.
  if (requirement === 'require-external') {
    throw new Error(`review has no independently authenticated external provenance binding`);
  }
  return { status: 'verified', scope: 'local-cooperative', satisfiesExternal: false };
}
