import { appendFileSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { openDatabase } from './db';
import { runMigrations } from './migrate';
import {
  type AppliedMigration,
  migrationsToRollback,
  readMigrationFolders,
  ROLLBACK_ALL,
  rollbackTo,
} from './migrate-down';

const FOLDER = new URL('../../drizzle', import.meta.url).pathname;
const INIT = '20260426171432_talented_smiling_tiger';
const USERS = '20260804194845_add_users';
const WBS = '20260805154500_add_wbs_domain';
const DEPS = '20260806084828_add_dependencies';
const ACCESS = '20260806160000_add_project_access';
const METHOD = '20260806170000_add_estimate_method';

function tempDb(): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'wbs-migrate-down-'));
  return {
    path: join(dir, 'test.db'),
    cleanup: () => {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function tables(dbPath: string): string[] {
  const db = openDatabase(dbPath);
  try {
    return db
      .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => r.name);
  } finally {
    db.close();
  }
}

function appliedNames(dbPath: string): string[] {
  const db = openDatabase(dbPath);
  try {
    return db
      .query<AppliedMigration, []>(
        'SELECT id, hash, created_at, name FROM __drizzle_migrations ORDER BY created_at',
      )
      .all()
      .map((r) => r.name ?? '(unnamed)');
  } finally {
    db.close();
  }
}

const row = (name: string, created_at: number): AppliedMigration => ({
  id: created_at,
  hash: `hash-${name}`,
  created_at,
  name,
});

describe('migrationsToRollback', () => {
  const applied = [row('a', 100), row('b', 200), row('c', 300)];

  it('returns everything after the target, newest first', () => {
    expect(migrationsToRollback(applied, 'a').map((m) => m.name)).toEqual(['c', 'b']);
  });

  it('returns nothing when the target is already the newest', () => {
    expect(migrationsToRollback(applied, 'c')).toEqual([]);
  });

  it('returns everything, newest first, for an empty baseline', () => {
    expect(migrationsToRollback(applied, ROLLBACK_ALL).map((m) => m.name)).toEqual(['c', 'b', 'a']);
  });

  it('refuses a target that is not recorded as applied', () => {
    // The two other readings — roll back nothing, roll back everything —
    // differ by the entire database, so guessing is not available.
    expect(() => migrationsToRollback(applied, 'nope')).toThrow(/not recorded as applied/);
  });
});

describe('readMigrationFolders', () => {
  it('pairs every migration on disk with a down script', () => {
    const folders = readMigrationFolders(FOLDER);
    expect(folders.map((f) => f.name)).toEqual([INIT, USERS, WBS, DEPS, ACCESS, METHOD]);
    for (const f of folders) expect(f.downSql.trim()).not.toBe('');
  });

  it('refuses a migration with no down script', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wbs-nodown-'));
    try {
      const mig = join(dir, '20260101000000_orphan');
      mkdirSync(mig);
      writeFileSync(join(mig, 'migration.sql'), 'CREATE TABLE t (id text);');
      expect(() => readMigrationFolders(dir)).toThrow(/no down\.sql/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('rollbackTo, against a real database', () => {
  it('reverses the newest migration and leaves the earlier one applied', () => {
    const db = tempDb();
    try {
      runMigrations(db.path, FOLDER);
      expect(tables(db.path)).toContain('users');
      expect(appliedNames(db.path)).toEqual([INIT, USERS, WBS, DEPS, ACCESS, METHOD]);

      const reversed = rollbackTo(db.path, FOLDER, INIT);

      expect(reversed).toEqual([METHOD, ACCESS, DEPS, WBS, USERS]);
      expect(tables(db.path)).not.toContain('users');
      // The earlier migration's tables are untouched, which is the difference
      // between a rollback and a reset.
      expect(tables(db.path)).toContain('examples');
      expect(appliedNames(db.path)).toEqual([INIT]);
    } finally {
      db.cleanup();
    }
  });

  it('re-applies cleanly after a rollback', () => {
    // The bookkeeping row and the schema must come off together. If the row
    // survived, this second migrate would skip the migration and leave the
    // database missing the table it believes is there.
    const db = tempDb();
    try {
      runMigrations(db.path, FOLDER);
      rollbackTo(db.path, FOLDER, INIT);
      runMigrations(db.path, FOLDER);

      expect(tables(db.path)).toContain('users');
      expect(appliedNames(db.path)).toEqual([INIT, USERS, WBS, DEPS, ACCESS, METHOD]);
    } finally {
      db.cleanup();
    }
  });

  it('unwinds every migration when there was no baseline', () => {
    const db = tempDb();
    try {
      runMigrations(db.path, FOLDER);
      const reversed = rollbackTo(db.path, FOLDER, ROLLBACK_ALL);

      expect(reversed).toEqual([METHOD, ACCESS, DEPS, WBS, USERS, INIT]);
      for (const t of [
        'users',
        'examples',
        'event_log',
        'event_sequencer',
        'project',
        'work_item',
        'role',
        'estimate',
      ]) {
        expect(tables(db.path)).not.toContain(t);
      }
      expect(appliedNames(db.path)).toEqual([]);
    } finally {
      db.cleanup();
    }
  });

  it('does nothing when the target is already the newest applied', () => {
    const db = tempDb();
    try {
      runMigrations(db.path, FOLDER);
      expect(rollbackTo(db.path, FOLDER, METHOD)).toEqual([]);
      expect(tables(db.path)).toContain('users');
    } finally {
      db.cleanup();
    }
  });

  it('refuses when the applied migration no longer matches the file on disk', () => {
    // A forward migration edited after it was applied means its down.sql
    // describes a different change than the one in the database.
    const db = tempDb();
    const copy = mkdtempSync(join(tmpdir(), 'wbs-drift-'));
    try {
      runMigrations(db.path, FOLDER);
      cpSync(FOLDER, copy, { recursive: true });
      appendFileSync(join(copy, USERS, 'migration.sql'), '\n-- edited after the fact\n');

      expect(() => rollbackTo(db.path, copy, INIT)).toThrow(/hash differs/);
      expect(tables(db.path)).toContain('users');
    } finally {
      db.cleanup();
      rmSync(copy, { recursive: true, force: true });
    }
  });
});
