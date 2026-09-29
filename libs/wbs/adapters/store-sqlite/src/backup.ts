import { createHash } from 'node:crypto';
import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { sql } from 'drizzle-orm';

import { openConnection, openReadOnlyConnection } from './db';

/** A verified copy of the database and the migration ledger it carries. */
export interface DatabaseSnapshot {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
  /** Applied migration names, oldest first. Never empty. */
  readonly migrations: readonly string[];
}

/** What {@link restoreDatabase} put in place and where the files it replaced went. */
export interface DatabaseRestore {
  readonly snapshot: DatabaseSnapshot;
  /** The database, WAL and shared-memory files moved aside, in that order when present. */
  readonly displaced: readonly string[];
}

function sha256Of(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** Forces a file's or directory's contents to stable storage; a failure throws. */
function syncPath(path: string): void {
  const fd = openSync(path, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/**
 * Renames `partialPath` onto `finalPath` durably: the file's bytes are synced
 * before the rename can publish them, and the directory after it, so a power
 * loss cannot leave `finalPath` naming a file whose pages never reached disk.
 */
function publishDurably(partialPath: string, finalPath: string): void {
  syncPath(partialPath);
  renameSync(partialPath, finalPath);
  syncPath(dirname(finalPath));
}

/**
 * Proves one SQLite file is a WBS database worth restoring: `integrity_check`
 * answers `ok` and the Drizzle ledger holds at least one migration.
 *
 * @throws When the file is absent, fails `integrity_check`, or has no ledger or
 * an empty one.
 */
export function verifySnapshot(path: string): DatabaseSnapshot {
  if (!existsSync(path)) throw new Error(`${path} does not exist`);
  const connection = openReadOnlyConnection(path);
  let migrations: string[];
  try {
    const integrity = connection.db.all<{ integrity_check: string }>(
      sql.raw('PRAGMA integrity_check'),
    );
    if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok') {
      throw new Error(`${path} failed integrity_check`);
    }
    const ledger = connection.db.all<{ name: string }>(
      sql.raw("SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'"),
    );
    if (ledger.length === 0) throw new Error(`${path} has no __drizzle_migrations table`);
    migrations = connection.db
      .all<{ name: string | null }>(
        sql.raw('SELECT name FROM __drizzle_migrations ORDER BY created_at, id'),
      )
      .map(({ name }) => {
        if (name === null) throw new Error(`${path} has a migration row without a name`);
        return name;
      });
  } finally {
    connection.close();
  }
  if (migrations.length === 0) throw new Error(`${path} has no applied migrations`);
  const bytes = readFileSync(path).byteLength;
  return { path, sha256: sha256Of(path), bytes, migrations };
}

/**
 * Writes a verified, application-consistent copy of a live WAL database with
 * `VACUUM INTO`, which reads one transaction snapshot and takes no writer
 * lock, so the serving colour keeps writing while it runs. The copy is
 * verified before it is renamed into place, so `snapshotPath` never names an
 * unverified file.
 *
 * @throws When the source is absent (a copy of nothing is not a backup), when
 * `snapshotPath` already exists (a backup never overwrites another), or when
 * the copy fails {@link verifySnapshot}.
 */
export function snapshotDatabase(sourcePath: string, snapshotPath: string): DatabaseSnapshot {
  if (!existsSync(sourcePath)) throw new Error(`database ${sourcePath} does not exist`);
  if (existsSync(snapshotPath)) throw new Error(`${snapshotPath} already exists`);
  mkdirSync(dirname(snapshotPath), { recursive: true });
  const partialPath = join(dirname(snapshotPath), `.${basename(snapshotPath)}.partial`);
  rmSync(partialPath, { force: true });
  const source = openConnection(sourcePath);
  try {
    source.db.run(sql`VACUUM INTO ${partialPath}`);
  } finally {
    source.close();
  }
  // Proof: replacing this with an unverified digest made `refuses to publish
  // a copy without a migration ledger` in backup.db.test.ts publish the copy
  // (4 pass, 2 fail, 2026-09-29).
  const verified = verifySnapshot(partialPath);
  publishDurably(partialPath, snapshotPath);
  return { ...verified, path: snapshotPath };
}

/**
 * Puts a verified snapshot back at `dbPath`. Every process that opens
 * `dbPath` must be stopped first: the current database and its `-wal` and
 * `-shm` files are moved aside under `.displaced-<stamp>`, never deleted, and
 * the snapshot's copy is verified against the snapshot's own digest before it
 * is renamed into place.
 *
 * @throws When the snapshot fails {@link verifySnapshot} or its copy differs
 * from it; in both cases `dbPath` is left untouched.
 */
export function restoreDatabase(
  snapshotPath: string,
  dbPath: string,
  stamp: string,
): DatabaseRestore {
  // Proof: replacing this with an unverified digest made `refuses a corrupted
  // snapshot and leaves the database untouched` fail: the corrupted copy
  // replaced the database (5 pass, 1 fail, 2026-09-29).
  const snapshot = verifySnapshot(snapshotPath);
  const partialPath = `${dbPath}.restore.partial`;
  rmSync(partialPath, { force: true });
  copyFileSync(snapshotPath, partialPath);
  if (sha256Of(partialPath) !== snapshot.sha256) {
    rmSync(partialPath, { force: true });
    throw new Error(`copy of ${snapshotPath} does not match its digest; ${dbPath} untouched`);
  }
  const present = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`].filter((path) => existsSync(path));
  const taken = present.map((path) => `${path}.displaced-${stamp}`).filter((p) => existsSync(p));
  if (taken.length > 0) {
    rmSync(partialPath, { force: true });
    throw new Error(`${taken.join(', ')} already exist; ${dbPath} untouched`);
  }
  const displaced: string[] = [];
  for (const path of present) {
    const aside = `${path}.displaced-${stamp}`;
    renameSync(path, aside);
    displaced.push(aside);
  }
  publishDurably(partialPath, dbPath);
  return { snapshot, displaced };
}
