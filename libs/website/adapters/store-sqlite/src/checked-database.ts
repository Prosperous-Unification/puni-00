import { createHash } from 'node:crypto';
import { accessSync, constants, readFileSync, realpathSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';

import { websiteMigrations } from './migration-catalogue';

interface MigrationRow {
  name: string;
  checksum: string;
}

interface SchemaRow {
  type: string;
  name: string;
  tbl_name: string;
  sql: string | null;
}

/** Bounded wait for another process's SQLite write lock (blue/green share one file); SQLite then throws SQLITE_BUSY. */
export const busyTimeoutMilliseconds = 5000;

const migrationTable =
  'CREATE TABLE IF NOT EXISTS schema_migration (name TEXT PRIMARY KEY, checksum TEXT NOT NULL)';
const schemaQuery =
  "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE type IN ('table', 'index', 'view', 'trigger') AND name NOT LIKE 'sqlite_%' ORDER BY type, name";

/**
 * Refuses absent or inaccessible database files without creating a path.
 * `purpose` names the maintenance command in the refusal.
 */
export function existingDatabasePath(
  databasePath: string,
  writable: boolean,
  purpose: string,
): string {
  const details = statSync(databasePath);
  // Proof: removing the file-kind or permission checks fails the directory, unreadable and unwritable fixtures.
  if (
    !details.isFile() ||
    (details.mode & 0o444) === 0 ||
    (writable && (details.mode & 0o222) === 0)
  )
    throw new Error(`${purpose} requires a readable existing SQLite file`);
  accessSync(databasePath, writable ? constants.R_OK | constants.W_OK : constants.R_OK);
  return realpathSync(databasePath);
}

/**
 * Compares the selected database with every catalogued migration and the resulting schema, so
 * maintenance never runs against a database the API has not migrated.
 *
 * @throws when integrity, the applied migration set or the schema differs.
 */
export function validateDatabase(database: Database, purpose: string): void {
  const integrity = database.query<{ integrity_check: string }, []>('PRAGMA integrity_check').get();
  // Proof: injecting a failed SQLite integrity result made inspection refuse the supported fixture.
  if (integrity?.integrity_check !== 'ok') throw new Error(`${purpose} database integrity failed`);

  const expected = new Database(':memory:');
  try {
    expected.run(migrationTable);
    const migrations = websiteMigrations();
    const applied = database
      .query<MigrationRow, []>('SELECT name, checksum FROM schema_migration ORDER BY name')
      .all();
    // Proof: unknown and edited migration fixtures fail when the count or checksum checks are removed.
    if (applied.length !== migrations.length)
      throw new Error(`${purpose} requires the current website migrations`);
    for (const migration of migrations) {
      const forward = readFileSync(join(migration.directory, 'migration.sql'), 'utf8');
      readFileSync(join(migration.directory, 'down.sql'), 'utf8');
      const checksum = createHash('sha256').update(forward).digest('hex');
      if (!applied.some((row) => row.name === migration.name && row.checksum === checksum))
        throw new Error(`${purpose} found an unexpected or edited migration`);
      expected.run(forward);
    }
    const actualSchema = database.query<SchemaRow, []>(schemaQuery).all();
    const expectedSchema = expected.query<SchemaRow, []>(schemaQuery).all();
    // Proof: extra tables and delete triggers are accepted if this schema comparison is removed.
    if (JSON.stringify(actualSchema) !== JSON.stringify(expectedSchema))
      throw new Error(`${purpose} requires the current website schema`);
  } finally {
    expected.close();
  }
}

/**
 * Opens an existing, fully migrated website database for a maintenance command that writes
 * (the retention journal commands), with foreign keys and the bounded busy wait. Never creates
 * or migrates a file.
 *
 * @throws as {@link existingDatabasePath} and {@link validateDatabase}.
 */
export function openMaintenanceDatabase(databasePath: string, purpose: string): Database {
  const path = existingDatabasePath(databasePath, true, purpose);
  const database = new Database(path, { readwrite: true });
  try {
    database.run('PRAGMA foreign_keys = ON');
    database.run(`PRAGMA busy_timeout = ${String(busyTimeoutMilliseconds)}`);
    validateDatabase(database, purpose);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}
