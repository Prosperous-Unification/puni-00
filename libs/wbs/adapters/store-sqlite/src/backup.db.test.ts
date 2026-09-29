import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';

import { restoreDatabase, snapshotDatabase, verifySnapshot } from './backup';
import { openConnection } from './db';
import { runMigrations } from './migrate';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const SKELETON = '20260426171432_talented_smiling_tiger';

function scratch(): string {
  return mkdtempSync(join(tmpdir(), 'wbs-backup-'));
}

/** A database at the pre-product skeleton ledger, with one marker row outside the schema. */
function skeletonDatabase(dir: string): string {
  const folder = join(dir, 'skeleton-drizzle');
  mkdirSync(folder);
  cpSync(join(FOLDER, SKELETON), join(folder, SKELETON), { recursive: true });
  const dbPath = join(dir, 'wbs.db');
  runMigrations(dbPath, folder);
  const connection = openConnection(dbPath);
  try {
    connection.db.run(sql.raw('CREATE TABLE backup_marker (v TEXT NOT NULL)'));
    connection.db.run(sql.raw("INSERT INTO backup_marker (v) VALUES ('before')"));
  } finally {
    connection.close();
  }
  return dbPath;
}

function markers(dbPath: string): string[] {
  const connection = openConnection(dbPath);
  try {
    return connection.db
      .all<{ v: string }>(sql.raw('SELECT v FROM backup_marker ORDER BY rowid'))
      .map(({ v }) => v);
  } finally {
    connection.close();
  }
}

describe('snapshotDatabase and restoreDatabase', () => {
  it('restores the pre-deploy database after a forward deploy migrated and wrote to it', () => {
    const dir = scratch();
    const dbPath = skeletonDatabase(dir);
    const snapshotPath = join(dir, 'backups', 'wbs-pre-deploy.db');

    const snapshot = snapshotDatabase(dbPath, snapshotPath);
    expect(snapshot.migrations).toEqual([SKELETON]);
    expect(snapshot.path).toBe(snapshotPath);

    runMigrations(dbPath, FOLDER);
    const connection = openConnection(dbPath);
    try {
      connection.db.run(sql.raw("INSERT INTO backup_marker (v) VALUES ('after')"));
    } finally {
      connection.close();
    }
    expect(markers(dbPath)).toEqual(['before', 'after']);

    const restore = restoreDatabase(snapshotPath, dbPath, '20260929T000000Z');

    expect(restore.displaced).toContain(`${dbPath}.displaced-20260929T000000Z`);
    expect(verifySnapshot(dbPath).migrations).toEqual([SKELETON]);
    expect(markers(dbPath)).toEqual(['before']);
    expect(existsSync(`${dbPath}.displaced-20260929T000000Z`)).toBe(true);
  });

  // Proof: leaving `-wal` out of restoreDatabase's displaced set made this
  // case fail (6 pass, 1 fail, 2026-09-29): the stale WAL stayed beside the
  // restored database instead of being moved aside.
  it('moves a live WAL and shared-memory file aside so SQLite cannot replay them', () => {
    const dir = scratch();
    const dbPath = skeletonDatabase(dir);
    const snapshotPath = join(dir, 'snapshot.db');
    snapshotDatabase(dbPath, snapshotPath);

    // A writer that died without checkpointing: its WAL holds the 'after' row.
    const writer = openConnection(dbPath);
    writer.db.run(sql.raw("INSERT INTO backup_marker (v) VALUES ('after')"));
    const walCopy = readFileSync(`${dbPath}-wal`);
    const shmCopy = readFileSync(`${dbPath}-shm`);
    writer.close();
    writeFileSync(`${dbPath}-wal`, walCopy);
    writeFileSync(`${dbPath}-shm`, shmCopy);
    expect(walCopy.byteLength).toBeGreaterThan(0);

    const restore = restoreDatabase(snapshotPath, dbPath, 'wal');

    expect(restore.displaced).toEqual([
      `${dbPath}.displaced-wal`,
      `${dbPath}-wal.displaced-wal`,
      `${dbPath}-shm.displaced-wal`,
    ]);
    expect(markers(dbPath)).toEqual(['before']);
  });

  it('refuses to overwrite an existing snapshot', () => {
    const dir = scratch();
    const dbPath = skeletonDatabase(dir);
    const snapshotPath = join(dir, 'taken.db');
    writeFileSync(snapshotPath, 'someone else');

    expect(() => snapshotDatabase(dbPath, snapshotPath)).toThrow(/already exists/);
    expect(readFileSync(snapshotPath, 'utf8')).toBe('someone else');
  });

  it('refuses an absent source without creating it', () => {
    const dir = scratch();
    const dbPath = join(dir, 'absent.db');

    expect(() => snapshotDatabase(dbPath, join(dir, 'copy.db'))).toThrow(/does not exist/);
    expect(existsSync(dbPath)).toBe(false);
  });

  it('refuses to publish a copy without a migration ledger', () => {
    const dir = scratch();
    const dbPath = join(dir, 'bare.db');
    openConnection(dbPath).close();
    const snapshotPath = join(dir, 'bare-copy.db');

    expect(() => snapshotDatabase(dbPath, snapshotPath)).toThrow(/__drizzle_migrations/);
    expect(existsSync(snapshotPath)).toBe(false);
  });

  it('refuses a corrupted snapshot and leaves the database untouched', () => {
    const dir = scratch();
    const dbPath = skeletonDatabase(dir);
    const snapshotPath = join(dir, 'snapshot.db');
    snapshotDatabase(dbPath, snapshotPath);
    const bytes = readFileSync(snapshotPath);
    bytes.fill(0x5a, 4096, 8192);
    writeFileSync(snapshotPath, bytes);
    const before = readFileSync(dbPath);

    expect(() => restoreDatabase(snapshotPath, dbPath, 'stamp')).toThrow();
    expect(readFileSync(dbPath).equals(before)).toBe(true);
    expect(existsSync(`${dbPath}.displaced-stamp`)).toBe(false);
  });

  it('refuses a stamp whose displaced name is taken, before moving anything', () => {
    const dir = scratch();
    const dbPath = skeletonDatabase(dir);
    const snapshotPath = join(dir, 'snapshot.db');
    snapshotDatabase(dbPath, snapshotPath);
    writeFileSync(`${dbPath}.displaced-stamp`, 'earlier');

    expect(() => restoreDatabase(snapshotPath, dbPath, 'stamp')).toThrow(/already exist/);
    expect(verifySnapshot(dbPath).migrations).toEqual([SKELETON]);
  });
});
