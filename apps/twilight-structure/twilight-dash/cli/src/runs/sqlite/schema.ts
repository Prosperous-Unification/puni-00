import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import type { Database } from 'bun:sqlite';

import { decodeAttemptRow, decodeManifestRow, decodeMeta, decodeRunRow } from './row-codecs';

export const SCHEMA_VERSION = 1;
export const MIGRATION = readFileSync(
  new URL('./migrations/0001-run-store/migration.sql', import.meta.url),
  'utf8',
);
export const DOWN = readFileSync(
  new URL('./migrations/0001-run-store/down.sql', import.meta.url),
  'utf8',
);
export const MIGRATION_HASH = createHash('sha256').update(MIGRATION).digest('hex');
export const DOWN_HASH = createHash('sha256').update(DOWN).digest('hex');

/** Configures each connection and rejects a driver/filesystem that cannot honor durability settings. */
export function configureDatabase(database: Database): void {
  database.run('PRAGMA busy_timeout=0');
  database.run('PRAGMA foreign_keys=ON');
  database.run('PRAGMA journal_mode=WAL');
  database.run('PRAGMA synchronous=FULL');
  const foreign = database.query<{ foreign_keys: number }, []>('PRAGMA foreign_keys').get();
  const journal = database.query<{ journal_mode: string }, []>('PRAGMA journal_mode').get();
  const synchronous = database.query<{ synchronous: number }, []>('PRAGMA synchronous').get();
  // Proof: bypassing selected-mode verification accepted real injected foreign_keys OFF, journal DELETE and synchronous OFF settings.
  if (
    foreign?.foreign_keys !== 1 ||
    journal?.journal_mode !== 'wal' ||
    synchronous?.synchronous !== 2
  )
    throw new Error('sqlite required foreign_keys WAL FULL settings unavailable');
}
/** Reads required metadata rather than inventing an empty store. */
export function readMeta(database: Database) {
  return decodeMeta(
    database
      .query(
        'SELECT schema_version,migration_hash,down_hash,ownership,capacity,lease_milliseconds,last_observed_at FROM run_meta WHERE singleton=1',
      )
      .get(),
  );
}
/** Validates the published store, including every portable record and relational invariant. No migration runs here. */
export function validateDatabase(database: Database): void {
  const meta = readMeta(database);
  // Proof: independently bypassing version, migration hash and down hash checks accepted each corresponding persisted alteration.
  if (
    meta.schema_version !== SCHEMA_VERSION ||
    meta.migration_hash !== MIGRATION_HASH ||
    meta.down_hash !== DOWN_HASH
  )
    throw new Error('incompatible sqlite schema version or migration hash');
  // Proof: bypassing this diagnostic accepted an injected non-ok SQLite integrity response through the real open path.
  if (database.query<{ quick_check: string }, []>('PRAGMA quick_check').get()?.quick_check !== 'ok')
    throw new Error('corrupt sqlite database');
  // Proof: bypassing this check accepted a real orphan reservation inserted with foreign keys disabled.
  if (database.query('PRAGMA foreign_key_check').all().length !== 0)
    throw new Error('corrupt sqlite foreign key references');
  for (const row of database.query('SELECT * FROM run_manifest').all()) decodeManifestRow(row);
  for (const row of database.query('SELECT * FROM run_record').all()) decodeRunRow(row);
  for (const row of database.query('SELECT * FROM run_attempt').all()) decodeAttemptRow(row);
  const broken = database
    .query(
      `SELECT a.attempt_id FROM run_attempt a LEFT JOIN run_reservation r ON r.attempt_id=a.attempt_id WHERE json_extract(a.record,'$.holdsCapacity') != (r.attempt_id IS NOT NULL)`,
    )
    .all();
  const reservations = database
    .query<{ count: number }, []>('SELECT count(*) AS count FROM run_reservation')
    .get();
  // Proof: independently bypassing held-row matching and the capacity ceiling accepted missing reservations and two held slots under limit one on reopen.
  if (broken.length !== 0 || reservations === null || reservations.count > meta.capacity)
    throw new Error('corrupt sqlite capacity reservations');
}
