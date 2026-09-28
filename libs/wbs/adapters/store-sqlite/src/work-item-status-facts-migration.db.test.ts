import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDatabase } from './db';
import { runMigrations } from './migrate';
import { readMigrationFolders, rollbackTo } from './migrate-down';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const STATUS_FACTS = '20260928200000_add_work_item_status_facts';
/** The migration below this one, where every rollback here stops. */
const BASELINE = readMigrationFolders(FOLDER)
  .map(({ name }) => name)
  .filter((name) => name < STATUS_FACTS)
  .at(-1);
let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-status-facts-migration-'));
  path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function withDatabase<T>(read: (sqlite: Database) => T): T {
  const sqlite = openDatabase(path);
  try {
    return read(sqlite);
  } finally {
    sqlite.close();
  }
}

function seed(sqlite: Database): void {
  sqlite.run(
    "INSERT INTO users (id, username, password_hash, created_at) VALUES ('u','owner','x',1)",
  );
  sqlite.run(
    "INSERT INTO project (id, name, owner_id, restricted, estimate_method, revision, created_at) VALUES ('p','Project','u',0,'pert',0,1)",
  );
  // The outgoing colour's insert names neither column.
  sqlite.run(
    "INSERT INTO work_item (id, project_id, position, name, revision) VALUES ('a','p',1,'A',0),('b','p',2,'B',0)",
  );
}

const columnsOfWorkItem = (sqlite: Database) =>
  sqlite
    .query<{ name: string }, []>("SELECT name FROM pragma_table_info('work_item')")
    .all()
    .map((column) => column.name);

describe(STATUS_FACTS, () => {
  it('adds two nullable columns an older insert leaves null', () => {
    withDatabase((sqlite) => {
      seed(sqlite);
      expect(columnsOfWorkItem(sqlite)).toContain('readiness');
      expect(columnsOfWorkItem(sqlite)).toContain('hold');
      expect(
        sqlite
          .query<{ readiness: string | null; hold: string | null }, []>(
            "SELECT readiness, hold FROM work_item WHERE id = 'a'",
          )
          .get(),
      ).toEqual({ readiness: null, hold: null });
    });
  });

  it('accepts each vocabulary and refuses anything else', () => {
    withDatabase((sqlite) => {
      seed(sqlite);
      sqlite.run("UPDATE work_item SET readiness = 'ready', hold = 'on_hold' WHERE id = 'a'");
      sqlite.run("UPDATE work_item SET readiness = 'draft', hold = 'blocked' WHERE id = 'b'");
      expect(() => sqlite.run("UPDATE work_item SET hold = 'paused' WHERE id = 'a'")).toThrow(
        'CHECK constraint failed',
      );
      expect(() => sqlite.run("UPDATE work_item SET readiness = 'done' WHERE id = 'a'")).toThrow(
        'CHECK constraint failed',
      );
    });
  });

  it('rolls back with readiness but no hold, and reapplies', () => {
    withDatabase((sqlite) => {
      seed(sqlite);
      sqlite.run("UPDATE work_item SET readiness = 'ready' WHERE id = 'a'");
    });
    if (BASELINE === undefined) throw new Error('no migration below the status facts');
    expect(rollbackTo(path, FOLDER, BASELINE)).toContain(STATUS_FACTS);
    withDatabase((sqlite) => {
      expect(columnsOfWorkItem(sqlite)).not.toContain('readiness');
      expect(columnsOfWorkItem(sqlite)).not.toContain('hold');
    });
    runMigrations(path, FOLDER);
    withDatabase((sqlite) => {
      expect(columnsOfWorkItem(sqlite)).toContain('hold');
    });
  });

  /**
   * Proof: the three guard statements removed from `down.sql` made this case
   * fail on `Received function did not throw` — the rollback dropped the hold
   * and its migration record; watched 2026-09-29.
   */
  it('refuses rollback over a hold and keeps the hold and the migration record', () => {
    withDatabase((sqlite) => {
      seed(sqlite);
      sqlite.run("UPDATE work_item SET hold = 'on_hold' WHERE id = 'a'");
    });
    if (BASELINE === undefined) throw new Error('no migration below the status facts');
    expect(() => rollbackTo(path, FOLDER, BASELINE)).toThrow(
      'docs/runbook-prod-deploy.md#work-item-status-facts-rollback',
    );
    withDatabase((sqlite) => {
      expect(
        sqlite
          .query<{ hold: string | null }, []>("SELECT hold FROM work_item WHERE id = 'a'")
          .get(),
      ).toEqual({ hold: 'on_hold' });
      expect(
        sqlite
          .query<{ name: string | null }, [string]>(
            'SELECT name FROM __drizzle_migrations WHERE name = ?1',
          )
          .all(STATUS_FACTS),
      ).toHaveLength(1);
    });
  });
});
