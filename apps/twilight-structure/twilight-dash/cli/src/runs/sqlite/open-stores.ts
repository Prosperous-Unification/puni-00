import { randomUUID } from 'node:crypto';
import {
  accessSync,
  closeSync,
  constants,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  rmSync,
} from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

import { parseOrThrow, type } from '@shared/validation';
import { Database } from 'bun:sqlite';

import type { WallClock } from '../../clock';
import { assertInteger, organizationId, storeId } from '../record-codecs';
import type { OrganizationId, OwnershipStatus } from '../records';
import { inspectFormat, SqliteInspectionError } from './inspect-format';
import { createSqliteRunStore, isBusy, RunStoreContentionError } from './run-store';
import {
  assertCompatibleFormat,
  configureAdmissionConnection,
  configureDatabase,
  DOWN_HASH,
  FORMAT_HASH,
  MIGRATION_HASH,
  MIGRATIONS,
  readJournalMode,
  readMeta,
  SCHEMA_VERSION,
  validateDatabase,
} from './schema';

export interface SqliteOptions {
  readonly path: string;
  readonly organizationId: OrganizationId;
  readonly capacity: number;
  readonly leaseMilliseconds: number;
  readonly clock: WallClock;
  readonly maxBusyAttempts: number;
  readonly busyDelayMilliseconds: number;
}
export type SqliteOpenFailure =
  'absent' | 'unreadable' | 'exists' | 'corrupt' | 'incompatible' | 'configuration';
/** Lifecycle refusals distinguish absence/access failures from invalid trusted state. */
export class SqliteOpenError extends Error {
  constructor(
    readonly failure: SqliteOpenFailure,
    path: string,
    cause?: unknown,
  ) {
    super(`run store ${failure}: ${path}`, { cause });
    this.name = 'SqliteOpenError';
  }
}
function hasCode(cause: unknown, code: string): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === code;
}
/** Validates explicit lifecycle/transition configuration and resolves its path; absent clocks and invalid numeric limits throw. */
export function validateOptions(options: SqliteOptions): SqliteOptions {
  // Proof: independently bypassing path, integer and clock boundary validation failed each named required-setting test.
  if (typeof options.path !== 'string' || options.path.length === 0)
    throw new Error('run store path is required');
  assertInteger(options.capacity, 1);
  assertInteger(options.leaseMilliseconds, 1);
  assertInteger(options.maxBusyAttempts, 1);
  assertInteger(options.busyDelayMilliseconds);
  parseOrThrow(type({ read: 'Function' }), options.clock);
  return {
    ...options,
    path: isAbsolute(options.path) ? options.path : resolve(options.path),
    organizationId: organizationId(options.organizationId),
  };
}
function assertAccessible(path: string): void {
  try {
    // Proof: bypassing file access validation misclassified mode-000 trusted state in the non-root unreadability test.
    accessSync(path, constants.R_OK | constants.W_OK);
    accessSync(dirname(path), constants.R_OK | constants.W_OK | constants.X_OK);
  } catch (cause) {
    throw new SqliteOpenError('unreadable', path, cause);
  }
}
/** Requires an existing accessible regular store file and writable parent; preserves absent, unreadable and corrupt path categories. */
export function assertExisting(path: string): void {
  try {
    if (!lstatSync(path).isFile()) throw new SqliteOpenError('corrupt', path);
  } catch (cause) {
    if (hasCode(cause, 'ENOENT')) throw new SqliteOpenError('absent', path, cause);
    // Proof: bypassing access-error classification failed the independent mode-000 parent case.
    if (hasCode(cause, 'EACCES') || hasCode(cause, 'EPERM'))
      throw new SqliteOpenError('unreadable', path, cause);
    throw cause;
  }
  assertAccessible(path);
}
/** Requires the persisted organization, capacity and lease to match explicit options before lifecycle or format transitions. */
export function assertConfiguration(database: Database, options: SqliteOptions): void {
  const meta = readMeta(database);
  // Proof: independently bypassing persisted organization, capacity and lease comparisons accepted each changed opening configuration.
  if (
    meta.ownership.organizationId !== options.organizationId ||
    meta.capacity !== options.capacity ||
    meta.lease_milliseconds !== options.leaseMilliseconds
  )
    throw new SqliteOpenError('configuration', options.path);
}
/** Reads native transaction state after SQL effects without relying on property narrowing. */
function admissionTransactionIsOpen(database: Database): boolean {
  return database.inTransaction;
}
/** Native exclusion owns complete current-format/config/history admission. The configuration phase retains EXCLUSIVE locks after COMMIT; final normal admission publishes no semantic work. */
function auditAdmission(
  database: Database,
  options: SqliteOptions,
  begin = 'BEGIN IMMEDIATE',
): OwnershipStatus {
  database.run(begin);
  // Proof: admission-full-history broke “nonwal protected admission refuses history before persistent conversion”; exact source hash restored.
  try {
    assertCompatibleFormat(database);
    validateDatabase(database);
    // Proof: admission-configuration bypassed this dependency; the actual non-WAL capacity mismatch lost refusal before conversion. Exact hash restored.
    assertConfiguration(database, options);
    const ownership = readMeta(database).ownership;
    database.run('COMMIT');
    return ownership;
  } catch (cause) {
    // Proof: native-cleanup-rollback-observation broke “nonwal configuration retains rollback_ignored cause and exact native closure boundary”; exact source hash restored.
    if (database.inTransaction) {
      try {
        // Proof: native-cleanup-rollback-dispatch omitted this call; audit_commit observed inTransaction at native close. Exact hash restored.
        database.run('ROLLBACK');
        // Proof: current-rollback-observation omitted this native readback; rollback_ignored lost the expected diagnostic. Native close still rolls back; diagnostic-only. Exact hash restored.
        if (admissionTransactionIsOpen(database))
          throw new Error('sqlite admission remains open after rollback', { cause });
      } catch (rollbackCause) {
        // Proof: current-rollback-cause discarded the rollback dependency; the named rollback case lost its original cleanup cause. Exact hash restored.
        throw new AggregateError([cause, rollbackCause], 'sqlite admission and rollback failed', {
          cause: rollbackCause,
        });
      }
    }
    throw cause;
  }
}
async function connect(options: SqliteOptions) {
  assertExisting(options.path);
  for (let attempt = 1; ; attempt += 1) {
    let database: Database | undefined;
    try {
      // Proof: inspector-public-preflight broke “ordinary opener refuses genuine format5 before creating sidecars or changing bytes”; exact source hash restored.
      await inspectFormat(options, (inspection) => {
        // Proof: F24b removed pre-configuration compatibility inspection and changed original bytes; 'genuine format1' failed and exact restoration passed.
        // Proof: F177 omitted this inspection refusal; the genuine format2 test still refused later but detected changed original database bytes. Restored test passed.
        assertCompatibleFormat(inspection);
      });
      database = new Database(options.path, { create: false, strict: true });
      configureAdmissionConnection(database);
      if (readJournalMode(database) !== 'wal') {
        // Proof: admission-native-lease broke “supported DELETE configuration retains exclusion then fresh normal admission refuses a later down”; exact source hash restored.
        database.run('PRAGMA locking_mode=EXCLUSIVE');
        // Proof: admission-protected-check broke “raced incompatible DELETE admission preserves logical state and persistent settings”; exact source hash restored.
        auditAdmission(database, options, 'BEGIN EXCLUSIVE');
        configureDatabase(database);
        const configured = database;
        database = undefined;
        // Proof: admission-close-cause broke “nonwal configuration retains configuration_close cause and exact native closure boundary”; exact source hash restored.
        try {
          configured.close();
        } catch (cause) {
          throw new SqliteOpenError(
            'corrupt',
            options.path,
            new Error('configuration connection closure unestablished: ' + options.path, { cause }),
          );
        }
        database = new Database(options.path, { create: false, strict: true });
        configureAdmissionConnection(database);
      }
      // Proof: admission-final-normal-check broke “supported DELETE configuration retains exclusion then fresh normal admission refuses a later down”; exact source hash restored.
      const ownership = auditAdmission(database, options);
      if (readJournalMode(database) !== 'wal')
        throw new SqliteOpenError(
          'configuration',
          options.path,
          new Error('sqlite required foreign_keys WAL FULL settings unavailable'),
        );
      return { ...createSqliteRunStore(database, options), ownership };
    } catch (cause) {
      // Proof: native-cleanup-combined-cause broke “nonwal configuration retains conversion_and_close cause and exact native closure boundary”; exact source hash restored.
      try {
        database?.close();
      } catch (closeCause) {
        throw new SqliteOpenError(
          'corrupt',
          options.path,
          new AggregateError([cause, closeCause], 'sqlite admission and native close failed', {
            cause,
          }),
        );
      }
      // Proof: inspector-public-category broke “ordinary opener preserves private inspection main_unreadable”; exact source hash restored.
      if (cause instanceof SqliteInspectionError) {
        if (cause.failure === 'contention')
          throw new RunStoreContentionError(options.maxBusyAttempts, cause);
        throw new SqliteOpenError(cause.failure, options.path, cause);
      }
      // Proof: bypassing this branch mislabeled a real exclusive SQLite lock as corruption instead of exhausting the bounded contention budget.
      if (isBusy(cause)) {
        if (attempt === options.maxBusyAttempts) throw new RunStoreContentionError(attempt, cause);
        await Bun.sleep(options.busyDelayMilliseconds);
        continue;
      }
      if (cause instanceof SqliteOpenError) throw cause;
      throw new SqliteOpenError(
        cause instanceof Error && cause.message.includes('incompatible')
          ? 'incompatible'
          : 'corrupt',
        options.path,
        cause,
      );
    }
  }
}

function syncPath(path: string): void {
  const descriptor = openSync(path, 'r');
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}
/** Opens existing trusted state only. It never creates parents, bootstraps, migrates or resets corruption. */
export async function openSqliteStores(input: SqliteOptions) {
  // Proof: replacing open with bootstrap created trusted state and failed the absent-file/parent assertions.
  return await Promise.resolve(connect(validateOptions(input)));
}
/** Publishes a fully initialized sibling exclusively; an existing target is never replaced. */
export async function bootstrapSqliteStores(input: SqliteOptions) {
  const options = validateOptions(input);
  try {
    // Proof: bypassing this check exposed raw EACCES instead of unreadable for a non-root inaccessible bootstrap parent.
    accessSync(dirname(options.path), constants.R_OK | constants.W_OK | constants.X_OK);
  } catch (cause) {
    throw new SqliteOpenError(
      hasCode(cause, 'ENOENT') ? 'absent' : 'unreadable',
      options.path,
      cause,
    );
  }
  const staging = `${options.path}.initializing-${randomUUID()}`;
  const descriptor = openSync(staging, 'wx', 0o600);
  closeSync(descriptor);
  try {
    const database = new Database(staging, { create: false, strict: true });
    try {
      configureDatabase(database);
      const observedAt = options.clock.read();
      assertInteger(observedAt);
      const ownership: OwnershipStatus = {
        storeId: storeId(randomUUID()),
        organizationId: options.organizationId,
        epoch: 0,
        owner: null,
      };
      database.run('BEGIN IMMEDIATE');
      for (const migration of MIGRATIONS.slice(0, SCHEMA_VERSION))
        // Proof: F34c restored whole-script forward SQL and published after an intermediate CHECK failure; 'intermediate required migration' failed and exact restoration passed.
        for (const statement of migration.forwardStatements) database.run(statement);
      database
        .query(
          'INSERT INTO run_meta(singleton,schema_version,migration_hash,down_hash,ownership,capacity,lease_milliseconds,last_observed_at) VALUES (1,?,?,?,?,?,?,?)',
        )
        .run(
          SCHEMA_VERSION,
          MIGRATION_HASH,
          DOWN_HASH,
          JSON.stringify(ownership),
          options.capacity,
          options.leaseMilliseconds,
          observedAt,
        );
      database
        .query(
          'INSERT INTO run_format(singleton,bundle_hash,scope_count,intent_count,acceptance_count) VALUES (1,?,0,0,0)',
        )
        .run(FORMAT_HASH);
      database.run('COMMIT');
      database.run('PRAGMA wal_checkpoint(TRUNCATE)');
    } finally {
      database.close();
    }
    syncPath(staging);
    try {
      // Proof: replacing exclusive link with rename overwrote an independently initialized winner and failed the publication-race assertion.
      linkSync(staging, options.path);
    } catch (cause) {
      if (hasCode(cause, 'EEXIST')) throw new SqliteOpenError('exists', options.path, cause);
      throw cause;
    }
    syncPath(dirname(options.path));
  } finally {
    for (const suffix of ['', '-wal', '-shm']) rmSync(`${staging}${suffix}`, { force: true });
  }
  return await Promise.resolve(connect(options));
}
