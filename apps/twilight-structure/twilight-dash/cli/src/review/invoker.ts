import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { parseOrThrow } from '@shared/validation';
import type { ColdHarnessOutput, InformedHarnessOutput } from '@twilight-burokrat/judge';
import {
  ColdAcknowledgement,
  ColdAttempt,
  coldHarnessRequest,
  decodeColdHarnessOutput,
  decodeInformedHarnessOutput,
  decodeInvocationRegistration,
  deriveReviewEvidence,
  type DurableAcceptance,
  hashBytes,
  hashCanonical,
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
  type ReviewEvidence as ReviewEvidenceRecord,
  ReviewInvocationRequest,
  type ReviewInvocationRequest as ReviewInvocationRequestRecord,
  type ReviewInvocationResult,
  type ReviewInvoker,
  serializeCanonical,
} from '@twilight-burokrat/judge';

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

function syncDirectory(path: string): void {
  const descriptor = openSync(path, 'r');
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function createDurably(path: string, journal: InvocationJournalRecord): void {
  const descriptor = openSync(path, 'wx', 0o600);
  try {
    writeFileSync(descriptor, serializeCanonical(journal), 'utf8');
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  syncDirectory(dirname(path));
}

function replaceDurably(path: string, journal: InvocationJournalRecord): void {
  const replacement = join(
    dirname(path),
    `.${basename(path)}.${String(process.pid)}.${crypto.randomUUID()}.new`,
  );
  const descriptor = openSync(replacement, 'wx', 0o600);
  try {
    writeFileSync(descriptor, serializeCanonical(journal), 'utf8');
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  renameSync(replacement, path);
  syncDirectory(dirname(path));
}

function isExistingLock(cause: unknown): boolean {
  return cause instanceof Error && Reflect.get(cause, 'code') === 'EEXIST';
}

/** Waits on the host clock for at most `waitMs`, polling every 10 ms. */
function createLockDirectory(path: string, waitMs: number): void {
  const deadline = Date.now() + waitMs;
  let lastConflict: unknown;
  do {
    try {
      mkdirSync(path, { mode: 0o700 });
      return;
    } catch (cause) {
      if (!isExistingLock(cause)) throw cause;
      // Proof: deleting an existing lock here let one completion worker finish and another fail
      // while the owner still held it; the overlap test observed `[1, 0]`, not `[null, null]`.
      lastConflict = cause;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
  } while (Date.now() < deadline);
  throw new Error(`timed out waiting for invocation journal lock: ${path}`, {
    cause: lastConflict,
  });
}

/** An owned cross-process lock; stale locks are never stolen. */
export class FileJournalLock {
  private isReleased = false;

  private constructor(
    readonly path: string,
    private readonly owner: string,
  ) {}

  static acquire(journalPath: string, waitMs = 5000): FileJournalLock {
    const path = `${journalPath}.lock`;
    createLockDirectory(path, waitMs);
    const owner = `${String(process.pid)}.${crypto.randomUUID()}\n`;
    try {
      writeFileSync(join(path, 'owner'), owner, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      syncDirectory(path);
    } catch (cause) {
      rmSync(join(path, 'owner'), { force: true });
      rmdirSync(path);
      throw cause;
    }
    return new FileJournalLock(path, owner);
  }

  release(): void {
    if (this.isReleased) throw new Error(`invocation journal lock already released: ${this.path}`);
    const observed = readFileSync(join(this.path, 'owner'), 'utf8');
    // Proof: bypassing this comparison let a contender delete another owner's lock; the overlap
    // test reported "function did not throw" at the ownership assertion.
    if (observed !== this.owner) {
      throw new Error(`invocation journal lock ownership changed: ${this.path}`);
    }
    unlinkSync(join(this.path, 'owner'));
    rmdirSync(this.path);
    syncDirectory(dirname(this.path));
    this.isReleased = true;
  }
}

function withJournalLock<T>(path: string, waitMs: number, action: () => T): T {
  // Proof: bypassing this lock let both held-lock registration workers finish early; the overlap
  // test observed `[0, 0]` instead of `[null, null]` before the owner released the lock.
  const lock = FileJournalLock.acquire(path, waitMs);
  try {
    return action();
  } finally {
    lock.release();
  }
}

/** A canonical invocation journal with serialized, fsynced, read-back transitions. */
export class FileInvocationJournal implements InvocationJournal {
  readonly trustScope = 'local-cooperative' as const;

  private constructor(
    private readonly path: string,
    readonly journalId: string,
    private readonly lockWaitMs: number,
  ) {}

  static create(path: string, journalId: string, lockWaitMs = 5000): FileInvocationJournal {
    return withJournalLock(path, lockWaitMs, () => {
      const journal = parseOrThrow(InvocationJournalRecord, {
        schemaVersion: 1,
        journalId,
        trustScope: 'local-cooperative',
        entries: [],
      });
      createDurably(path, journal);
      const stored = readInvocationJournal(path);
      if (hashCanonical(stored) !== hashCanonical(journal)) {
        throw new Error(`durable invocation journal creation differs after read-back: ${path}`);
      }
      return new FileInvocationJournal(path, journalId, lockWaitMs);
    });
  }

  static open(path: string, lockWaitMs = 5000): FileInvocationJournal {
    const journal = readInvocationJournal(path);
    return new FileInvocationJournal(path, journal.journalId, lockWaitMs);
  }

  read(): InvocationJournalRecord {
    const journal = readInvocationJournal(this.path);
    if (journal.journalId !== this.journalId) {
      throw new Error(`invocation journal identity changed at ${this.path}`);
    }
    return journal;
  }

  register(registration: InvocationRegistration): DurableAcceptance {
    const checked = parseOrThrow(InvocationRegistration, registration);
    // Proof: bypassing this preflight durably appended `invocation.malformed-json`; the unchanged-
    // byte assertion reported `Expected - 0 / Received + 306` before any duplicate could apply.
    decodeInvocationRegistration(checked);
    return withJournalLock(this.path, this.lockWaitMs, () => {
      const journal = this.read();
      if (
        journal.entries.some((entry) => entry.registration.invocationId === checked.invocationId)
      ) {
        throw new Error(`invocation already registered: ${checked.invocationId}`);
      }
      return this.persist(
        checked.invocationId,
        parseOrThrow(InvocationJournalRecord, {
          ...journal,
          entries: [...journal.entries, { state: 'registered', registration: checked }],
        }),
        { state: 'registered', registration: checked },
      );
    });
  }

  acknowledgeCold(invocationId: string, cold: ColdAcknowledgement): DurableAcceptance {
    const checked = parseOrThrow(ColdAcknowledgement, cold);
    return withJournalLock(this.path, this.lockWaitMs, () => {
      const journal = this.read();
      const index = journal.entries.findIndex(
        (entry) => entry.registration.invocationId === invocationId,
      );
      if (index < 0)
        throw new Error(`cannot acknowledge cold for unknown invocation: ${invocationId}`);
      const current = journal.entries[index];
      if (current.state === 'terminal') {
        // Proof: returning the terminal acceptance here made acknowledgeCold succeed after
        // completion; the terminal-safety test reported "function did not throw".
        throw new Error(`cannot acknowledge cold after terminal invocation: ${invocationId}`);
      }
      if (current.state === 'cold-acknowledged') {
        if (hashCanonical(current.cold) === hashCanonical(checked)) {
          return this.acceptance(invocationId, current);
        }
        throw new Error(`invocation already has a different cold acknowledgement: ${invocationId}`);
      }
      reconcileColdAcknowledgement(current.registration, checked);
      const next = {
        state: 'cold-acknowledged' as const,
        registration: current.registration,
        cold: checked,
      };
      const entries = [...journal.entries];
      entries[index] = next;
      return this.persist(
        invocationId,
        parseOrThrow(InvocationJournalRecord, { ...journal, entries }),
        next,
      );
    });
  }

  complete(invocationId: string, terminal: InvocationTerminal): DurableAcceptance {
    const checked = parseOrThrow(InvocationTerminal, terminal);
    return withJournalLock(this.path, this.lockWaitMs, () => {
      const journal = this.read();
      const index = journal.entries.findIndex(
        (entry) => entry.registration.invocationId === invocationId,
      );
      if (index < 0) throw new Error(`cannot complete unknown invocation: ${invocationId}`);
      const current = journal.entries[index];
      if (current.state === 'terminal') {
        // Proof: accepting every repeated completion made a changed completedAt return durable;
        // the terminal-safety test reported "function did not throw".
        if (hashCanonical(current.terminal) === hashCanonical(checked)) {
          return this.acceptance(invocationId, current);
        }
        throw new Error(`invocation already has a different terminal completion: ${invocationId}`);
      }
      const next = {
        state: 'terminal' as const,
        registration: current.registration,
        ...(current.state === 'cold-acknowledged' ? { cold: current.cold } : {}),
        terminal: checked,
      };
      reconcileJournalEntry(next, journal.journalId);
      const entries = [...journal.entries];
      entries[index] = next;
      return this.persist(
        invocationId,
        parseOrThrow(InvocationJournalRecord, { ...journal, entries }),
        next,
      );
    });
  }

  private acceptance(invocationId: string, observation: unknown): DurableAcceptance {
    return {
      status: 'durable',
      journalId: this.journalId,
      invocationId,
      artifact: hashCanonical(observation),
    };
  }

  private persist(
    invocationId: string,
    journal: InvocationJournalRecord,
    observation: unknown,
  ): DurableAcceptance {
    replaceDurably(this.path, journal);
    const stored = this.read().entries.find(
      (entry) => entry.registration.invocationId === invocationId,
    );
    if (stored === undefined || hashCanonical(stored) !== hashCanonical(observation)) {
      throw new Error(`durable invocation transition differs after read-back: ${invocationId}`);
    }
    return this.acceptance(invocationId, observation);
  }
}

/** Records the host clock around the harness run: a Twilight Dash measurement, not a judgment. */
function phaseObservation(
  phase: 'cold' | 'informed',
  stdinBytes: string,
  harnessArgv: readonly string[],
): { observation: ProcessObservation; stdout: Uint8Array } {
  const startedAt = new Date().toISOString();
  let processResult: Bun.SyncSubprocess<'pipe', 'pipe'>;
  // Only a throw from Bun.spawnSync is a launch failure. Proof: routing a returned SIGTERM through
  // this recovery erased both streams; the cold negative observed exact stdout base64 versus `""`,
  // and the informed negative observed the same loss for its phase.
  try {
    processResult = Bun.spawnSync([...harnessArgv], {
      stdin: Buffer.from(stdinBytes, 'utf8'),
      stdout: 'pipe',
      stderr: 'pipe',
    });
  } catch (cause) {
    const endedAt = new Date().toISOString();
    const empty = new Uint8Array();
    return {
      observation: parseOrThrow(ProcessObservation, {
        phase,
        startedAt,
        endedAt,
        stdinArtifact: hashBytes(stdinBytes),
        stdinBytes,
        stdoutArtifact: hashBytes(empty),
        stdoutBase64: '',
        stderrArtifact: hashBytes(empty),
        stderrBase64: '',
        exit: { kind: 'launch-failed', message: errorMessage(cause) },
      }),
      stdout: empty,
    };
  }
  const endedAt = new Date().toISOString();
  const signalCode = processResult.signalCode;
  const exit =
    // Proof: classifying returned SIGTERM as unresolved made both production harness negatives
    // receive `{ kind: "unresolved", exitCode: null }` instead of the signaled observation.
    typeof signalCode === 'string' && signalCode.length > 0
      ? { kind: 'signaled' as const, signalCode }
      : typeof processResult.exitCode === 'number'
        ? { kind: 'exited' as const, exitCode: processResult.exitCode }
        : {
            // Proof: treating null/no-signal as exited made the production path throw
            // `exit.exitCode must be a number (was null)` instead of persisting its streams.
            kind: 'unresolved' as const,
            exitCode: null,
            signalCode: signalCode ?? null,
          };
  return {
    observation: parseOrThrow(ProcessObservation, {
      phase,
      startedAt,
      endedAt,
      stdinArtifact: hashBytes(stdinBytes),
      stdinBytes,
      stdoutArtifact: hashBytes(processResult.stdout),
      stdoutBase64: Buffer.from(processResult.stdout).toString('base64'),
      stderrArtifact: hashBytes(processResult.stderr),
      stderrBase64: Buffer.from(processResult.stderr).toString('base64'),
      exit,
    }),
    stdout: processResult.stdout,
  };
}

function coldAttempt(stdinBytes: string, harnessArgv: readonly string[]): ColdAttempt {
  const captured = phaseObservation('cold', stdinBytes, harnessArgv);
  if (captured.observation.exit.kind === 'launch-failed') {
    return parseOrThrow(ColdAttempt, {
      observation: captured.observation,
      output: null,
      decodeFailure: `launch failed: ${captured.observation.exit.message}`,
    });
  }
  try {
    return parseOrThrow(ColdAttempt, {
      observation: captured.observation,
      output: decodeColdHarnessOutput(
        decodeJson(decodeUtf8(captured.stdout, 'cold stdout'), 'cold stdout'),
      ),
      decodeFailure: null,
    });
  } catch (cause) {
    return parseOrThrow(ColdAttempt, {
      observation: captured.observation,
      output: null,
      decodeFailure: errorMessage(cause),
    });
  }
}

function informedAttempt(stdinBytes: string, harnessArgv: readonly string[]): InformedAttempt {
  const captured = phaseObservation('informed', stdinBytes, harnessArgv);
  if (captured.observation.exit.kind === 'launch-failed') {
    return parseOrThrow(InformedAttempt, {
      observation: captured.observation,
      output: null,
      decodeFailure: `launch failed: ${captured.observation.exit.message}`,
    });
  }
  try {
    return parseOrThrow(InformedAttempt, {
      observation: captured.observation,
      output: decodeInformedHarnessOutput(
        decodeJson(decodeUtf8(captured.stdout, 'informed stdout'), 'informed stdout'),
      ),
      decodeFailure: null,
    });
  } catch (cause) {
    return parseOrThrow(InformedAttempt, {
      observation: captured.observation,
      output: null,
      decodeFailure: errorMessage(cause),
    });
  }
}

/**
 * Invokes cold and informed phases with a durable acknowledgement between their launches. It
 * launches processes and stamps the journal from the host clock; Burokrat's
 * `validate-review-provenance` judges the journal it writes.
 */
export class ProcessReviewInvoker implements ReviewInvoker {
  constructor(
    private readonly journal: InvocationJournal,
    private readonly harnessArgv: readonly string[],
  ) {
    if (harnessArgv.length === 0) throw new Error('review harness argv must not be empty');
  }

  invoke(request: ReviewInvocationRequestRecord): ReviewInvocationResult {
    const checked = parseOrThrow(ReviewInvocationRequest, request);
    const registrationBytes = serializeCanonical(checked);
    const registration = parseOrThrow(InvocationRegistration, {
      invocationId: checked.invocationId,
      receiptId: checked.receiptId,
      registeredAt: new Date().toISOString(),
      harnessArgv: [...this.harnessArgv],
      stdinArtifact: hashBytes(registrationBytes),
      stdinBytes: registrationBytes,
    });
    // Proof: bypassing registration let the cold harness run first and the production path failed
    // on `cannot complete unknown invocation: invocation.integration-test`.
    const registered = this.journal.register(registration);
    if (registered.invocationId !== checked.invocationId) {
      throw new Error(`invocation journal did not durably accept ${checked.invocationId}`);
    }

    const coldInput = serializeCanonical(coldHarnessRequest(checked));
    const cold = coldAttempt(coldInput, this.harnessArgv);
    const coldAcknowledgement = parseOrThrow(ColdAcknowledgement, {
      acknowledgedAt: new Date().toISOString(),
      attempt: cold,
    });
    let coldOutput: ColdHarnessOutput | null = null;
    let coldSemanticFailure: string | null = null;
    try {
      coldOutput = reconcileColdAcknowledgement(registration, coldAcknowledgement);
    } catch (cause) {
      coldSemanticFailure = errorMessage(cause);
    }
    const coldFailure = coldSemanticFailure;
    if (coldFailure !== null || coldOutput === null) {
      const terminal = parseOrThrow(InvocationTerminal, {
        status: 'unverified',
        completedAt: new Date().toISOString(),
        phase: 'cold',
        reason: coldFailure ?? 'cold output unavailable',
        attempt: cold,
        evidence: null,
      });
      // Proof: bypassing this completion left a nonzero process merely `registered`; the failure
      // persistence test threw `expected unverified terminal`.
      this.journal.complete(checked.invocationId, terminal);
      return {
        status: 'unverified',
        invocationId: checked.invocationId,
        reason: coldFailure ?? 'cold output unavailable',
      };
    }

    // Proof: bypassing this transition let the informed harness see only `registered`; the
    // production path failed on `informed terminal has no cold acknowledgement`.
    const acknowledged = this.journal.acknowledgeCold(checked.invocationId, coldAcknowledgement);
    if (acknowledged.invocationId !== checked.invocationId) {
      throw new Error(
        `invocation journal did not durably acknowledge cold ${checked.invocationId}`,
      );
    }

    const informedInput = serializeCanonical(informedHarnessRequest(checked, coldAcknowledgement));
    const informed = informedAttempt(informedInput, this.harnessArgv);
    let informedOutput: InformedHarnessOutput | null = null;
    let informedSemanticFailure: string | null = null;
    try {
      informedOutput = reconcileReviewedInformed(registration, coldAcknowledgement, informed);
    } catch (cause) {
      informedSemanticFailure = errorMessage(cause);
    }
    let informedFailure = informedSemanticFailure;
    let evidence: ReviewEvidenceRecord | null = null;
    if (informedFailure === null && informedOutput !== null) {
      try {
        evidence = deriveReviewEvidence(
          checked,
          coldOutput,
          informedOutput,
          this.journal.journalId,
        );
      } catch (cause) {
        informedFailure = errorMessage(cause);
      }
    }
    if (informedFailure !== null || informedOutput === null || evidence === null) {
      const terminal = parseOrThrow(InvocationTerminal, {
        status: 'unverified',
        completedAt: new Date().toISOString(),
        phase: 'informed',
        reason: informedFailure ?? 'informed output unavailable',
        attempt: informed,
        evidence: null,
      });
      // Proof: bypassing this completion left a nonzero informed process at `cold-acknowledged`;
      // the informed-failure test threw `expected unverified terminal`.
      this.journal.complete(checked.invocationId, terminal);
      return {
        status: 'unverified',
        invocationId: checked.invocationId,
        reason: informedFailure ?? 'informed output unavailable',
      };
    }
    const terminal = parseOrThrow(InvocationTerminal, {
      status: 'reviewed',
      completedAt: new Date().toISOString(),
      informed,
      evidence,
    });
    this.journal.complete(checked.invocationId, terminal);
    return { status: 'verified', evidence };
  }
}
