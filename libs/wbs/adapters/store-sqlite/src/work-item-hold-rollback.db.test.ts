import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openConnection, openDatabase } from './db';
import { runMigrations } from './migrate';
import { readMigrationFolders, rollbackTo } from './migrate-down';
import {
  removeSavedWorkItemHolds,
  restoreWorkItemHolds,
  saveWorkItemHolds,
} from './work-item-hold-rollback';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const STATUS_FACTS = '20260928200000_add_work_item_status_facts';
const BASELINE = readMigrationFolders(FOLDER)
  .map(({ name }) => name)
  .filter((name) => name < STATUS_FACTS)
  .at(-1);
let directory: string;
let path: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'wbs-hold-rollback-'));
  path = join(directory, 'plan.db');
  runMigrations(path, FOLDER);
  const sqlite = openDatabase(path);
  try {
    sqlite.run(
      "INSERT INTO users (id,username,password_hash,created_at) VALUES ('u','owner','x',1)",
    );
    sqlite.run(
      "INSERT INTO project (id,name,owner_id,restricted,estimate_method,revision,created_at) VALUES ('p','Project','u',0,'pert',0,1)",
    );
    sqlite.run(
      "INSERT INTO work_item (id,project_id,parent_id,position,name,revision,hold,readiness) VALUES ('a','p',NULL,1,'A',0,'on_hold','ready'),('b','p',NULL,2,'B',0,'blocked',NULL),('c','p',NULL,3,'C',0,NULL,'draft')",
    );
  } finally {
    sqlite.close();
  }
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

function withConnection<T>(run: (db: ReturnType<typeof openConnection>['db']) => T): T {
  const connection = openConnection(path);
  try {
    return run(connection.db);
  } finally {
    connection.close();
  }
}

function withSqlite<T>(run: (sqlite: Database) => T): T {
  const sqlite = openDatabase(path);
  try {
    return run(sqlite);
  } finally {
    sqlite.close();
  }
}

const holds = () =>
  withSqlite((sqlite) =>
    sqlite
      .query<{ id: string; hold: string | null }, []>('SELECT id, hold FROM work_item ORDER BY id')
      .all(),
  );

describe('work item hold rollback', () => {
  it('saves, removes, rolls back, migrates forward and restores every hold', () => {
    const saved = withConnection(saveWorkItemHolds);
    expect(saved).toEqual({
      format: 'work-item-hold-save',
      version: 1,
      rows: [
        { workItemId: 'a', hold: 'on_hold' },
        { workItemId: 'b', hold: 'blocked' },
      ],
    });
    expect(withConnection((db) => removeSavedWorkItemHolds(db, saved, 5))).toBe(2);
    if (BASELINE === undefined) throw new Error('no migration below the status facts');
    expect(rollbackTo(path, FOLDER, BASELINE)).toContain(STATUS_FACTS);
    runMigrations(path, FOLDER);
    expect(withConnection((db) => restoreWorkItemHolds(db, saved, 6))).toBe(2);
    expect(holds()).toEqual([
      { id: 'a', hold: 'on_hold' },
      { id: 'b', hold: 'blocked' },
      { id: 'c', hold: null },
    ]);
  });

  /**
   * Proof: the comparison replaced by a count comparison made this case fail
   * on `Received function did not throw`; watched 2026-09-29.
   */
  it('refuses to remove a save that no longer matches the table', () => {
    const saved = withConnection(saveWorkItemHolds);
    withSqlite((sqlite) => sqlite.run("UPDATE work_item SET hold = 'blocked' WHERE id = 'a'"));
    expect(() => withConnection((db) => removeSavedWorkItemHolds(db, saved, 5))).toThrow(
      'work item hold save does not match current holds',
    );
    expect(holds().map(({ hold }) => hold)).toEqual(['blocked', 'blocked', null]);
  });

  it('refuses the whole restore when a saved work item is gone or has become a parent', () => {
    const saved = withConnection(saveWorkItemHolds);
    withConnection((db) => removeSavedWorkItemHolds(db, saved, 5));
    withSqlite((sqlite) =>
      sqlite.run(
        "INSERT INTO work_item (id,project_id,parent_id,position,name,revision) VALUES ('a1','p','a',1,'A1',0)",
      ),
    );
    expect(() => withConnection((db) => restoreWorkItemHolds(db, saved, 6))).toThrow(
      'saved hold on a, which is no longer a leaf',
    );
    withSqlite((sqlite) => sqlite.run("DELETE FROM work_item WHERE id IN ('a1','b')"));
    expect(() => withConnection((db) => restoreWorkItemHolds(db, saved, 6))).toThrow(
      'saved hold on b, which is no longer a work item',
    );
    expect(holds().map(({ hold }) => hold)).toEqual([null, null]);
  });

  it('refuses a malformed save', () => {
    for (const saved of [
      null,
      { format: 'typed-dependency-save', version: 1, rows: [] },
      { format: 'work-item-hold-save', version: 2, rows: [] },
      { format: 'work-item-hold-save', version: 1, rows: [{ workItemId: 'a', hold: 'paused' }] },
      { format: 'work-item-hold-save', version: 1, rows: [{ workItemId: 7, hold: 'on_hold' }] },
      {
        format: 'work-item-hold-save',
        version: 1,
        rows: [{ workItemId: 'a', hold: 'on_hold', extra: 1 }],
      },
    ]) {
      expect(() => withConnection((db) => restoreWorkItemHolds(db, saved, 6))).toThrow(
        /invalid work item hold save/,
      );
    }
  });
});
