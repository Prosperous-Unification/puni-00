import { Database } from 'bun:sqlite';

import type { SqliteFormatIdentity } from './format';
import {
  assertConfiguration,
  assertExisting,
  SqliteOpenError,
  type SqliteOptions,
  validateOptions,
} from './open-stores';
import { isBusy, RunStoreContentionError } from './run-store';
import {
  assertFormatCompatibility,
  configureDatabase,
  type FormatDescriptor,
  validateDatabaseForFormat,
} from './schema';

/** Migration-specific work prepared after the predecessor audit. Unused-history refusal precedes all transition writes. */
export interface PreparedTransition {
  readonly assertUnused: (() => void) | undefined;
  apply(): void;
}

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
    // Proof: Task3 053 changed category propagation; absent and unreadable preflight cases were mislabeled corrupt. Diagnostic-only; refusal remained.
    return cause.failure;
  }
  return cause instanceof Error && cause.message.includes('incompatible')
    ? 'incompatible'
    : 'corrupt';
}
/** Runs one explicit preserving transition under a single successfully acquired write transaction. BUSY attempts are bounded and occur before any transition statement. */
export async function transitionFormat(
  input: SqliteOptions,
  before: FormatDescriptor,
  after: FormatDescriptor,
  kind: SqliteFormatTransition['kind'],
  prepare: (database: Database) => PreparedTransition,
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
    const transition = prepare(database);
    if (transition.assertUnused !== undefined) {
      failure = 'used_history';
      // Proof: fix-round1 010 omitted this dispatch; both API pairs lost used_history while their raw down CHECK still refused. Diagnostic-only.
      transition.assertUnused();
    }
    failure = 'transition_failed';
    // Proof: fix-round1 009 omitted this dispatch; both genuine predecessor round trips failed the retained successor audit. Functional dependency, not independent refusal credit.
    transition.apply();
    // Proof: T3M3POST removing successor audit committed a marker corrupted by the new publication trigger; exact restoration passed.
    // Proof: Task3 039 removed this audit; an AFTER publication trigger deleted run5_usage and upgrade committed. Restored 042 refused and rolled back the complete predecessor state.
    // Proof: fix-round1 011 omitted the shared audit; both actual publication-trigger corruptions committed. All other guards remained installed.
    validateDatabaseForFormat(database, after);
    database.run('COMMIT');
    // Proof: T3M7 omitting committed phase mislabeled successful commit followed by close failure as transaction; diagnostic-only; exact restoration passed.
    // Proof: Task3 052 omitted committed phase; successful commit followed by native close failure was mislabeled transaction. Diagnostic-only.
    phase = 'committed';
  } catch (cause) {
    let retained: unknown = cause;
    if (database?.inTransaction === true) {
      try {
        // Proof: T3M5 omitting ROLLBACK left the transition connection inTransaction at its pre-close capture for both late upgrade and down aborts; exact restoration passed.
        // Proof: Task3 051 omitted ROLLBACK; late down abort left the actual transition connection inTransaction immediately before native close.
        // Proof: fix-round1 012 omitted the shared rollback; both legacy abort directions and identity down observed inTransaction at native close.
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
