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
import { createSqliteRunStore, isBusy, RunStoreContentionError } from './run-store';
import {
  assertCompatibleFormat,
  configureDatabase,
  DOWN_HASH,
  FORMAT_HASH,
  MIGRATION_HASH,
  MIGRATIONS,
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
function validateOptions(options: SqliteOptions): SqliteOptions {
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
function assertExisting(path: string): void {
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
function assertConfiguration(database: Database, options: SqliteOptions): void {
  const meta = readMeta(database);
  // Proof: independently bypassing persisted organization, capacity and lease comparisons accepted each changed opening configuration.
  if (
    meta.ownership.organizationId !== options.organizationId ||
    meta.capacity !== options.capacity ||
    meta.lease_milliseconds !== options.leaseMilliseconds
  )
    throw new SqliteOpenError('configuration', options.path);
}
async function connect(options: SqliteOptions) {
  assertExisting(options.path);
  for (let attempt = 1; ; attempt += 1) {
    let database: Database | undefined;
    try {
      const inspection = new Database(options.path, {
        readonly: true,
        create: false,
        strict: true,
      });
      try {
        // Proof: F24b removed pre-configuration compatibility inspection and changed original bytes; 'genuine format1' failed and exact restoration passed.
        // Proof: F177 omitted this inspection refusal; the genuine format2 test still refused later but detected changed original database bytes. Restored test passed.
        assertCompatibleFormat(inspection);
      } finally {
        inspection.close();
      }
      database = new Database(options.path, { create: false, strict: true });
      configureDatabase(database);
      database.run('BEGIN');
      validateDatabase(database);
      assertConfiguration(database, options);
      const ownership = readMeta(database).ownership;
      database.run('COMMIT');
      return { ...createSqliteRunStore(database, options), ownership };
    } catch (cause) {
      database?.close();
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
      for (const migration of MIGRATIONS)
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
