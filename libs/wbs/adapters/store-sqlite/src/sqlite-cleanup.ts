import type { Database } from 'bun:sqlite';

declare const sqliteCleanupUnknown: unique symbol;

/** Opaque adapter cleanup failure; only the internal identity boundary may recognize it. */
export interface SqliteCleanupUnknown extends Error {
  readonly [sqliteCleanupUnknown]: true;
}

interface SqliteCleanupAttempt {
  readonly client: Database;
  readonly original: Database['close'];
  readonly receiver: Database;
  readonly args: Parameters<Database['close']>;
  readonly phase: 'initialization' | 'connection-wrapper';
  state: 'not-entered' | 'entered' | 'returned' | 'threw';
  cause: unknown;
}

interface MigrationCleanupAttempt extends Omit<SqliteCleanupAttempt, 'phase'> {
  readonly phase: 'migration';
}

const failures = new WeakMap<
  object,
  | { readonly primary: unknown; readonly attempt: SqliteCleanupAttempt }
  | { readonly operationFailures: readonly unknown[]; readonly attempt: MigrationCleanupAttempt }
>();

class SqliteCleanupFailure extends AggregateError implements SqliteCleanupUnknown {
  declare readonly [sqliteCleanupUnknown]: true;
}

/**
 * Internal initialization and wrapper boundary: retains the acquired client and exact attempted close
 * after that close throws. Existing aggregate diagnostics keep their primary cause and order;
 * private custody survives mutation of those diagnostics while this failure remains held.
 * This creates no keeper or strong owner root after the failure itself is discarded.
 */
export function createSqliteCleanupFailure(
  primary: unknown,
  attempt: SqliteCleanupAttempt,
): SqliteCleanupUnknown {
  const failure = new SqliteCleanupFailure(
    [primary, attempt.cause],
    attempt.phase === 'initialization'
      ? 'SQLite initialization and cleanup failed'
      : 'SQLite connection wrapper and cleanup failed',
    { cause: primary },
  );
  // Proof: finite I omitted this registration; readonly initialization after-return
  // failed classification after 12 provenance checks (13 total). SAME exact-restored
  // consumer passed (2026-11-03); identity registration only, not private-field/GC necessity.
  failures.set(failure, { primary, attempt });
  return failure;
}

/** Recognizes only failures registered by the internal boundary, without inspecting diagnostics. */
export function isSqliteCleanupUnknown(cause: unknown): cause is SqliteCleanupUnknown {
  // Proof: bypassing SQLite membership wrongly accepted the genuine snapshot identity
  // in the cleanup identity diagnostic consumer; SAME restored consumer passed (2026-11-03).
  // Cross-registry rejection only; later negative assertions were unobserved.
  return typeof cause === 'object' && cause !== null && failures.has(cause);
}

/**
 * Retains an uncertain migration close in the existing private custody registry.
 * Errors stay chronological; an empty preceding list has no fabricated primary/cause,
 * while a present thrown undefined remains a real first failure. Recognition never
 * infers native closure from mutable public diagnostics or retries the selected close.
 */
export function createMigrationCleanupFailure(
  operationFailures: readonly unknown[],
  attempt: MigrationCleanupAttempt,
): SqliteCleanupUnknown {
  const failure = new SqliteCleanupFailure(
    [...operationFailures, attempt.cause],
    'SQLite migration cleanup failed',
    operationFailures.length === 0 ? undefined : { cause: operationFailures[0] },
  );
  failures.set(failure, { operationFailures: [...operationFailures], attempt });
  return failure;
}
