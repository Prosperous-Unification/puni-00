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
    expect(() =>
      withConnection((db) => removeSavedTypedDependencies(db, { ...snapshot, version: 2 })),
    ).toThrow('invalid typed dependency save format or version');
    expect(rowCount()).toBe(2);
  });

  /**
   * Through restore into an emptied table, so no later comparison can refuse
   * in the parser's place: each case names the guard that must answer.
   *
   * Proof: each guard disabled in turn made its own case fail on the
   * restore resolving or on a different message — the format/version check
   * (`null`, `version 2`, `extra key`), the column count (`missing column`,
   * `extra column`) and the column names (`renamed column`), `readString` (`numeric id`),
   * `readNullableString` (`numeric step`) and `readNullableNumber` (`text
   * timestamp`, `fractional timestamp`); watched 2026-09-27.
   */
  it('refuses a malformed save with the parser’s own reason and restores nothing', () => {
    const snapshot = saved();
    const first = snapshot.rows.at(0);
    const second = snapshot.rows.at(1);
    if (first === undefined || second === undefined) throw new Error('the seed holds two rows');
    const { createdBy: _dropped, ...missing } = first;
    const cases: [string, unknown, string][] = [
      ['null', null, 'invalid typed dependency save format or version'],
      ['version 2', { ...snapshot, version: 2 }, 'invalid typed dependency save format or version'],
      ['extra key', { ...snapshot, note: 'x' }, 'invalid typed dependency save format or version'],
      ['missing column', { ...snapshot, rows: [missing, second] }, 'saved row columns'],
      [
        'renamed column',
        { ...snapshot, rows: [{ ...missing, creator: 'u' }, second] },
        'saved row columns',
      ],
      [
        'extra column',
        { ...snapshot, rows: [{ ...first, extra: 1 }, second] },
        'saved row columns',
      ],
      ['numeric id', { ...snapshot, rows: [{ ...first, id: 7 }] }, 'id must be a string'],
      [
        'numeric step',
        { ...snapshot, rows: [{ ...first, predecessorStepId: 7 }] },
        'predecessorStepId must be a string',
      ],
      [
        'text timestamp',
        { ...snapshot, rows: [{ ...first, createdAt: 'ten' }] },
        'createdAt must be an integer or null',
      ],
      [
        'fractional timestamp',
        { ...snapshot, rows: [{ ...first, createdAt: 1.5 }] },
        'createdAt must be an integer or null',
      ],
    ];
    const sqlite = openDatabase(path);
    try {
      sqlite.run('DELETE FROM typed_dependency');
    } finally {
      sqlite.close();
    }
    for (const [name, malformed, reason] of cases) {
      let refusal = '(restored without refusing)';
      try {
        withConnection((db) => restoreTypedDependencies(db, malformed));
      } catch (error) {
        refusal = error instanceof Error ? error.message : String(error);
      }
      expect(refusal, name).toContain(reason);
      expect(rowCount(), name).toBe(0);
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
