import type { AttemptOutcome } from './stored-vocabularies';

/**
 * One **attempt** (`CONTEXT.md`): one run at a step node's work. Running while
 * its end and outcome are both null; ended once both are set. The union makes
 * the two other pairings unrepresentable, as the migration's `CHECK`s make them
 * unstorable (`openspec/changes/step-node-attempts/design.md` D1).
 */
export type Attempt = RunningAttempt | EndedAttempt;

interface AttemptFacts {
  /** 1 for a node's first attempt; the node's highest plus one after, never reused. */
  readonly attemptNumber: number;
  /** Epoch milliseconds, UTC. */
  readonly startedAt: number;
  readonly executorPersonId: string | null;
  /** A URL or a label naming the evidence. */
  readonly reference: string | null;
  readonly note: string | null;
}

export interface RunningAttempt extends AttemptFacts {
  readonly endedAt: null;
  readonly outcome: null;
}

export interface EndedAttempt extends AttemptFacts {
  readonly endedAt: number;
  readonly outcome: AttemptOutcome;
}

/** An attempt's row as storage or a document holds it, before the pairing is checked. */
export interface AttemptRow extends AttemptFacts {
  readonly endedAt: number | null;
  readonly outcome: AttemptOutcome | null;
}

/**
 * An {@link Attempt} from a row, refusing the pairings the type cannot hold.
 *
 * Stored rows are trusted state and the database's checks already refuse these,
 * so a throw here is a schema that drifted from the checks, never a user's
 * mistake; an import validates before it calls this.
 *
 * @throws on a number below 1, an end without an outcome, an outcome without an
 * end, or an end before its start.
 */
export function attemptOf(row: AttemptRow): Attempt {
  if (!Number.isSafeInteger(row.attemptNumber) || row.attemptNumber < 1) {
    throw new Error(
      `attempt number must be a whole number from 1, got ${String(row.attemptNumber)}`,
    );
  }
  // Proof: the two pairing checks deleted and `a running attempt has no outcome
  // and no end` failed on the first `toThrow`; watched 2026-10-12.
  if (row.endedAt === null) {
    if (row.outcome !== null) {
      throw new Error(`running attempt carries an outcome: ${row.outcome}`);
    }
    return { ...row, endedAt: null, outcome: null };
  }
  if (row.outcome === null) throw new Error(`ended attempt has no outcome`);
  if (row.endedAt < row.startedAt) {
    throw new Error(`attempt ${String(row.attemptNumber)} ends before it starts`);
  }
  return { ...row, endedAt: row.endedAt, outcome: row.outcome };
}

/** Whether an attempt is still running. */
export function isRunning(attempt: Attempt): attempt is RunningAttempt {
  return attempt.endedAt === null;
}

/**
 * When a node's, or a leaf's, attempts ran: earliest start to latest end, the
 * end `null` while any runs. Derived on every read and never stored.
 */
export interface Span {
  readonly start: number;
  readonly end: number | null;
}

/**
 * The {@link Span} of some attempts — one node's, or every node's of a leaf,
 * which is the same fold — or `undefined` with none.
 *
 * Instants, not numbers, decide the ends: a later attempt may carry an earlier
 * `at`, and the span is when work ran.
 */
export function spanOfAttempts(attempts: readonly Attempt[]): Span | undefined {
  if (attempts.length === 0) return undefined;
  let start = Number.POSITIVE_INFINITY;
  let end: number | null = Number.NEGATIVE_INFINITY;
  for (const attempt of attempts) {
    start = Math.min(start, attempt.startedAt);
    // Proof: the open branch dropped (a running attempt skipped, so the span
    // closed at the last end) and `spanOfAttempts is first start to last end,
    // open while one runs, absent with none` read `end: 200` for `null`;
    // watched 2026-10-12.
    if (end !== null) end = attempt.endedAt === null ? null : Math.max(end, attempt.endedAt);
  }
  return { start, end };
}
