import { Database } from 'bun:sqlite';

import {
  FORMAT3_IDENTITY,
  FORMAT4_IDENTITY,
  MIGRATIONS,
  type SqliteFormatIdentity,
} from './format';
import {
  assertConfiguration,
  assertExisting,
  SqliteOpenError,
  type SqliteOptions,
  validateOptions,
} from './open-stores';
import { readHistoryForFormat } from './read-history';
import { isBusy, RunStoreContentionError } from './run-store';
import {
  assertFormatCompatibility,
  configureDatabase,
  CURRENT_FORMAT,
  type FormatDescriptor,
  PREDECESSOR_FORMAT,
  validateDatabaseForFormat,
} from './schema';

export interface SqliteFormatTransition {
  readonly kind: 'upgraded' | 'downgraded';
  readonly before: SqliteFormatIdentity;
  readonly after: SqliteFormatIdentity;
}
export type SqliteTransitionFailure =
  | 'absent'
  | 'unreadable'
  | 'configuration'
  | 'incompatible'
  | 'corrupt'
  | 'used_history'
  | 'contention'
  | 'transition_failed'
  | 'cleanup_failed';
/** Reports intended complete identities and the failure phase; a committed cleanup failure never claims rollback. Original failures remain available through cause. */
export class SqliteFormatTransitionError extends Error {
  constructor(
    readonly failure: SqliteTransitionFailure,
    readonly path: string,
    readonly before: SqliteFormatIdentity,
    readonly after: SqliteFormatIdentity,
    readonly phase: 'preflight' | 'transaction' | 'committed',
    cause: unknown,
  ) {
    // Proof: T3M6CAUSE omitting Error cause lost the original SqliteOpenError in absent transition diagnostics; exact restoration passed.
    super(`run store format transition ${failure}: ${path}`, { cause });
    this.name = 'SqliteFormatTransitionError';
  }
}
function transactionIsOpen(database: Database): boolean {
  return database.inTransaction;
}
function classifyInspection(cause: unknown): SqliteTransitionFailure {
  if (cause instanceof SqliteOpenError) {
    if (cause.failure === 'exists') return 'configuration';
    // Proof: T3M6 changing SqliteOpenError category propagation mislabeled absent as corrupt; diagnostic-only; exact restoration passed.
    return cause.failure;
  }
  return cause instanceof Error && cause.message.includes('incompatible')
    ? 'incompatible'
    : 'corrupt';
}
/** Runs one explicit preserving transition under a single successfully acquired write transaction. BUSY attempts are bounded and occur before any transition statement. */
async function transitionFormat(
  input: SqliteOptions,
  before: FormatDescriptor,
  after: FormatDescriptor,
  kind: SqliteFormatTransition['kind'],
): Promise<SqliteFormatTransition> {
  let options: SqliteOptions;
  try {
    options = validateOptions(input);
  } catch (cause) {
    throw new SqliteFormatTransitionError(
      'configuration',
      input.path,
      before.identity,
      after.identity,
      'preflight',
      cause,
    );
  }
  let phase: SqliteFormatTransitionError['phase'] = 'preflight';
  let failure: SqliteTransitionFailure = 'corrupt';
  let database: Database | undefined;
  let primary: SqliteFormatTransitionError | undefined;
  try {
    assertExisting(options.path);
    for (let attempt = 1; ; attempt += 1) {
      try {
        failure = 'corrupt';
        const inspection = new Database(options.path, {
          readonly: true,
          create: false,
          strict: true,
        });
        let inspectionFailure: { readonly cause: unknown } | undefined;
        try {
          assertFormatCompatibility(inspection, before);
          assertConfiguration(inspection, options);
        } catch (cause) {
          inspectionFailure = { cause };
        }
        try {
          inspection.close();
        } catch (cause) {
          failure = 'cleanup_failed';
          throw new SqliteFormatTransitionError(
            'cleanup_failed',
            options.path,
            before.identity,
            after.identity,
            'preflight',
            inspectionFailure === undefined
              ? cause
              : new AggregateError(
                  [inspectionFailure.cause, cause],
                  'sqlite inspection and cleanup failed',
                  { cause },
                ),
          );
        }
        if (inspectionFailure !== undefined) throw inspectionFailure.cause;
        database = new Database(options.path, { create: false, strict: true });
        failure = 'configuration';
        configureDatabase(database);
        failure = 'transition_failed';
        database.run('BEGIN IMMEDIATE');
        break;
      } catch (cause) {
        if (cause instanceof SqliteFormatTransitionError || !isBusy(cause)) throw cause;
        try {
          database?.close();
        } catch (cleanupCause) {
          failure = 'cleanup_failed';
          throw new AggregateError([cause, cleanupCause], 'sqlite contention cleanup failed', {
            cause: cleanupCause,
          });
        }
        database = undefined;
        failure = 'contention';
        if (attempt === options.maxBusyAttempts) throw new RunStoreContentionError(attempt, cause);
        await Bun.sleep(options.busyDelayMilliseconds);
      }
    }
    phase = 'transaction';
    failure = 'corrupt';
    // Proof: T3M3PRE removing predecessor audit changed partial-successor corruption to later DDL failure; diagnostic-only, DDL retained refusal; exact restoration passed.
    validateDatabaseForFormat(database, before);
    assertConfiguration(database, options);
    const migration = MIGRATIONS[3];
    if (kind === 'downgraded') {
      const { catalog } = readHistoryForFormat(database, before);
      const counts = catalog.runtime.recovery.counts;
      failure = 'used_history';
      // Proof: T3M4API removing this precheck changed used_history to the later SQL CHECK failure; diagnostic-only, the down artifact retained refusal; exact restoration passed.
      if (
        Object.values(counts).some((count) => count !== 0) ||
        catalog.attempts.some(({ attempt }) => attempt.version !== 2)
      )
        throw new Error('recovery history is in use');
    }
    failure = 'transition_failed';
    const statements =
      kind === 'upgraded'
        ? migration.forwardStatements
        : migration.down
            .split('--> statement-breakpoint')
            .map((statement) => statement.trim())
            .filter((statement) => statement.length > 0);
    for (const statement of statements) database.run(statement);
    database
      .query('UPDATE run_format SET bundle_hash=? WHERE singleton=1')
      .run(after.identity.bundleHash);
    // Proof: T3M3POST removing successor audit committed a marker corrupted by the new publication trigger; exact restoration passed.
    validateDatabaseForFormat(database, after);
    database.run('COMMIT');
    // Proof: T3M7 omitting committed phase mislabeled successful commit followed by close failure as transaction; diagnostic-only; exact restoration passed.
    phase = 'committed';
  } catch (cause) {
    let retained: unknown = cause;
    if (database?.inTransaction === true) {
      try {
        // Proof: T3M5 omitting ROLLBACK left the transition connection inTransaction at its pre-close capture for both late upgrade and down aborts; exact restoration passed.
        database.run('ROLLBACK');
        if (transactionIsOpen(database))
          throw new Error('sqlite transition remains open after rollback', { cause });
      } catch (rollbackCause) {
        retained = new AggregateError(
          [cause, rollbackCause],
          'sqlite transition and rollback failed',
          { cause: rollbackCause },
        );
        failure = 'transition_failed';
      }
    }
    const category =
      cause instanceof SqliteOpenError
        ? classifyInspection(cause)
        : failure === 'corrupt'
          ? classifyInspection(cause)
          : failure;
    primary =
      cause instanceof SqliteFormatTransitionError
        ? cause
        : new SqliteFormatTransitionError(
            category,
            options.path,
            before.identity,
            after.identity,
            phase,
            retained,
          );
  }
  try {
    database?.close();
  } catch (cause) {
    throw new SqliteFormatTransitionError(
      'cleanup_failed',
      options.path,
      before.identity,
      after.identity,
      phase,
      primary === undefined
        ? cause
        : new AggregateError([primary, cause], 'sqlite transition cleanup failed', { cause }),
    );
  }
  if (primary !== undefined) throw primary;
  return { kind, before: before.identity, after: after.identity };
}
/** Upgrades an existing genuine format3 store without acquiring ownership or rewriting legacy records. Ordinary open never calls this operator boundary. */
export async function upgradeSqliteStores(options: SqliteOptions): Promise<SqliteFormatTransition> {
  return await transitionFormat(options, PREDECESSOR_FORMAT, CURRENT_FORMAT, 'upgraded');
}
/** Reverses only an unused recovery schema, preserving populated old history. Any valid recovery use or corrupt successor state refuses before destructive statements. */
export async function downgradeUnusedSqliteStores(
  options: SqliteOptions,
): Promise<SqliteFormatTransition> {
  return await transitionFormat(options, CURRENT_FORMAT, PREDECESSOR_FORMAT, 'downgraded');
}
export { FORMAT3_IDENTITY, FORMAT4_IDENTITY };
export type { SqliteFormatIdentity, SqliteMigrationIdentity } from './format';
