import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openConnection, openDatabase } from './db';
import { OPEN } from './gate';
import { runMigrations } from './migrate';
import { rollbackTo } from './migrate-down';
import { typedDependency } from './schema';
import { TypedDependencyRepository } from './typed-dependency';
import {
  removeSavedTypedDependencies,
  restoreTypedDependencies,
  saveTypedDependencies,
} from './typed-dependency-rollback';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const STEP_CODE = '20260927150000_add_step_code';
let directory: string;
let path: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'wbs-typed-rollback-'));
  path = join(directory, 'plan.db');
  runMigrations(path, FOLDER);
  const sqlite = openDatabase(path);
  try {
    sqlite.run(
      "INSERT INTO users (id,username,password_hash,created_at) VALUES ('u','owner','x',1)",
    );
    sqlite.run(
      "INSERT INTO project (id,name,owner_id,restricted,estimate_method,revision,created_at) VALUES ('p','Project','u',0,'pert',0,1),('q','Other','u',0,'pert',0,1)",
    );
    sqlite.run(
      "INSERT INTO step (id,project_id,name,code) VALUES ('s','p','Dev','dev'),('t','q','Dev','dev')",
    );
    sqlite.run(
      "INSERT INTO work_item (id,project_id,position,name,revision) VALUES ('a','p',1,'A',0),('b','p',2,'B',0),('c','p',3,'C',0),('foreign','q',1,'Foreign',0)",
    );
    sqlite.run(
      "INSERT INTO typed_dependency (id,project_id,predecessor_work_item_id,predecessor_scope,predecessor_step_id,successor_work_item_id,successor_scope,type,created_at,updated_at,created_by) VALUES ('first','p','a','node','s','b','whole','FS',10,11,'u'),('second','p','b','whole',NULL,'c','whole','FS',20,NULL,NULL)",
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

function saved() {
  return withConnection(saveTypedDependencies);
}

function rowCount(): number {
  return withConnection((db) => db.select().from(typedDependency).all().length);
}

describe('typed dependency rollback', () => {
  it('saves all columns in id order, removes, rolls back, reapplies and restores readable rows', async () => {
    const snapshot = saved();
    expect(snapshot).toEqual({
      format: 'typed-dependency-save',
      version: 1,
      rows: [
        {
          id: 'first',
          projectId: 'p',
          predecessorWorkItemId: 'a',
          predecessorScope: 'node',
          predecessorStepId: 's',
          successorWorkItemId: 'b',
          successorScope: 'whole',
          successorStepId: null,
          type: 'FS',
          createdAt: 10,
          updatedAt: 11,
          createdBy: 'u',
        },
        {
          id: 'second',
          projectId: 'p',
          predecessorWorkItemId: 'b',
          predecessorScope: 'whole',
          predecessorStepId: null,
          successorWorkItemId: 'c',
          successorScope: 'whole',
          successorStepId: null,
          type: 'FS',
          createdAt: 20,
          updatedAt: null,
          createdBy: null,
        },
      ],
    });
    expect(withConnection((db) => removeSavedTypedDependencies(db, snapshot))).toBe(2);
    expect(rollbackTo(path, FOLDER, STEP_CODE)).toEqual(['20260927213000_add_typed_dependency']);
    runMigrations(path, FOLDER);
    expect(withConnection((db) => restoreTypedDependencies(db, snapshot))).toBe(2);
    const connection = openConnection(path);
    try {
      expect(await new TypedDependencyRepository(connection.db, OPEN).listByProject('p')).toEqual([
        {
          id: 'first',
          projectId: 'p',
          predecessor: { scope: 'node', workItemId: 'a', stepId: 's' },
          successor: { scope: 'whole', workItemId: 'b' },
          type: 'FS',
        },
        {
          id: 'second',
          projectId: 'p',
          predecessor: { scope: 'whole', workItemId: 'b' },
          successor: { scope: 'whole', workItemId: 'c' },
          type: 'FS',
        },
      ]);
      expect(saveTypedDependencies(connection.db)).toEqual(snapshot);
    } finally {
      connection.close();
    }
  });

  it('refuses a same-count save with a different id or column and deletes nothing', () => {
    const snapshot = saved();
    for (const rows of [
      [{ ...snapshot.rows[0], id: 'stale' }, snapshot.rows[1]],
      [{ ...snapshot.rows[0], updatedAt: 12 }, snapshot.rows[1]],
    ]) {
      expect(() =>
        withConnection((db) => removeSavedTypedDependencies(db, { ...snapshot, rows })),
      ).toThrow('does not match');
      expect(rowCount()).toBe(2);
    }
  });

  it('refuses malformed saved input before removing rows', () => {
    const snapshot = saved();
    for (const malformed of [
      null,
      { ...snapshot, version: 2 },
      { ...snapshot, rows: [{ ...snapshot.rows[0], createdAt: 'ten' }, snapshot.rows[1]] },
    ]) {
      expect(() => withConnection((db) => removeSavedTypedDependencies(db, malformed))).toThrow();
      expect(rowCount()).toBe(2);
    }
  });

  it('refuses the whole restore when a node endpoint became a parent', () => {
    const snapshot = saved();
    withConnection((db) => removeSavedTypedDependencies(db, snapshot));
    const sqlite = openDatabase(path);
    try {
      sqlite.run(
        "INSERT INTO work_item (id,project_id,parent_id,position,name,revision) VALUES ('child','p','a',1,'Child',0)",
      );
    } finally {
      sqlite.close();
    }
    expect(() => withConnection((db) => restoreTypedDependencies(db, snapshot))).toThrow(
      'a parent',
    );
    expect(rowCount()).toBe(0);
  });

  it('refuses the whole restore when a row names another project', () => {
    const snapshot = saved();
    withConnection((db) => removeSavedTypedDependencies(db, snapshot));
    const rows = [{ ...snapshot.rows[0], predecessorWorkItemId: 'foreign' }, snapshot.rows[1]];
    expect(() =>
      withConnection((db) => restoreTypedDependencies(db, { ...snapshot, rows })),
    ).toThrow('outside project');
    expect(rowCount()).toBe(0);
  });

  it('refuses the whole restore when a saved row has an unreadable relationship', () => {
    const snapshot = saved();
    withConnection((db) => removeSavedTypedDependencies(db, snapshot));
    const rows = [{ ...snapshot.rows[0], type: 'SS' }, snapshot.rows[1]];
    expect(() =>
      withConnection((db) => restoreTypedDependencies(db, { ...snapshot, rows })),
    ).toThrow('unknown relationship type');
    expect(rowCount()).toBe(0);
  });
});
