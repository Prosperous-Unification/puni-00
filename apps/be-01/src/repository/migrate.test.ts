import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { openDatabase } from './db';
import { runMigrations } from './migrate';
import { rollbackTo } from './migrate-down';

const FOLDER = new URL('../../drizzle', import.meta.url).pathname;
const USERS = '20260804194845_add_users';
const WBS = '20260805154500_add_wbs_domain';
const DEPS = '20260806084828_add_dependencies';
const ACCESS = '20260806160000_add_project_access';

const WBS_TABLES = ['project', 'work_item', 'role', 'estimate'] as const;
// Its own migration, reversed with the domain because it references `work_item`.
const DEPENDENCY_TABLES = ['dependency'] as const;
// Also its own, and also reversed with the domain: it references `project`.
const ACCESS_TABLES = ['project_access'] as const;

function tempDb(): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'wbs-migrate-'));
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

describe('the WBS domain migration', () => {
  it('creates the four domain tables', () => {
    const db = tempDb();
    try {
      runMigrations(db.path, FOLDER);
      for (const t of [...WBS_TABLES, ...DEPENDENCY_TABLES, ...ACCESS_TABLES])
        expect(tables(db.path)).toContain(t);
    } finally {
      db.cleanup();
    }
  });

  it('reverses to the accounts schema without touching it', () => {
    const db = tempDb();
    try {
      runMigrations(db.path, FOLDER);

      const reversed = rollbackTo(db.path, FOLDER, USERS);

      expect(reversed).toEqual([ACCESS, DEPS, WBS]);
      for (const t of [...WBS_TABLES, ...DEPENDENCY_TABLES, ...ACCESS_TABLES])
        expect(tables(db.path)).not.toContain(t);
      // Reversing the domain must not take the accounts with it: the two
      // migrations are separately deployable and a failed domain release
      // leaves everyone still able to log in.
      expect(tables(db.path)).toContain('users');
      expect(tables(db.path)).toContain('examples');
    } finally {
      db.cleanup();
    }
  });
});
