import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDatabase } from './db';
import { runMigrations } from './migrate';
import { rollbackTo } from './migrate-down';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const TYPED = '20260927213000_add_typed_dependency';
const STEP_CODE = '20260927150000_add_step_code';
let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-typed-migration-'));
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
  sqlite.run("INSERT INTO step (id, project_id, name, code) VALUES ('s','p','Dev','dev')");
  sqlite.run(
    "INSERT INTO work_item (id, project_id, position, name, revision) VALUES ('a','p',1,'A',0),('b','p',2,'B',0)",
  );
}

function insert(
  sqlite: Database,
  id: string,
  predecessorScope = 'whole',
  predecessorStep: string | null = null,
  successorScope = 'whole',
  successorStep: string | null = null,
  type = 'FS',
): void {
  sqlite.run(
    'INSERT INTO typed_dependency (id, project_id, predecessor_work_item_id, predecessor_scope, predecessor_step_id, successor_work_item_id, successor_scope, successor_step_id, type) VALUES (?,?,?,?,?,?,?,?,?)',
    [id, 'p', 'a', predecessorScope, predecessorStep, 'b', successorScope, successorStep, type],
  );
}

describe(TYPED, () => {
  it('adds its columns and five indexes', () => {
    withDatabase((sqlite) => {
      const columns = sqlite
        .query<{ name: string }, []>("SELECT name FROM pragma_table_info('typed_dependency')")
        .all()
        .map((column) => column.name);
      expect(columns).toEqual([
        'id',
        'project_id',
        'predecessor_work_item_id',
        'predecessor_scope',
        'predecessor_step_id',
        'successor_work_item_id',
        'successor_scope',
        'successor_step_id',
        'type',
        'created_at',
        'updated_at',
        'created_by',
      ]);
      const indexes = sqlite
        .query<{ name: string }, []>("SELECT name FROM pragma_index_list('typed_dependency')")
        .all()
        .map((index) => index.name);
      for (const name of [
        'typed_dependency_endpoints',
        'typed_dependency_project',
        'typed_dependency_by_successor',
        'typed_dependency_by_predecessor_step',
        'typed_dependency_by_successor_step',
      ])
        expect(indexes).toContain(name);
    });
  });

  it('refuses invalid scope, step pairing and unknown type', () => {
    withDatabase((sqlite) => {
      seed(sqlite);
      expect(() => {
        insert(sqlite, 'bad-whole', 'whole', 's');
      }).toThrow();
      expect(() => {
        insert(sqlite, 'bad-node', 'node');
      }).toThrow();
      expect(() => {
        insert(sqlite, 'bad-type', 'whole', null, 'whole', null, 'XX');
      }).toThrow();
    });
  });

  it('encodes whole endpoints in uniqueness and keeps legacy inserts working', () => {
    withDatabase((sqlite) => {
      seed(sqlite);
      insert(sqlite, 'first');
      expect(() => {
        insert(sqlite, 'duplicate');
      }).toThrow('UNIQUE constraint failed');
      insert(sqlite, 'node', 'node', 's');
      sqlite.run(
        "INSERT INTO dependency (id,project_id,predecessor_id,successor_id) VALUES ('old','p','a','b')",
      );
      expect(sqlite.query<{ id: string }, []>('SELECT id FROM dependency').all()).toEqual([
        { id: 'old' },
      ]);
    });
  });

  it('cascades a work-item delete and restricts a referenced step delete', () => {
    withDatabase((sqlite) => {
      seed(sqlite);
      insert(sqlite, 'node', 'node', 's');
      expect(() => sqlite.run("DELETE FROM step WHERE id='s'")).toThrow(
        'FOREIGN KEY constraint failed',
      );
      sqlite.run("DELETE FROM work_item WHERE id='a'");
      expect(sqlite.query<{ id: string }, []>('SELECT id FROM typed_dependency').all()).toEqual([]);
    });
  });

  it('rolls an empty table back and reapplies', () => {
    expect(rollbackTo(path, FOLDER, STEP_CODE)).toEqual([TYPED]);
    expect(
      withDatabase((sqlite) =>
        sqlite
          .query<{ name: string }, []>(
            "SELECT name FROM sqlite_master WHERE name='typed_dependency'",
          )
          .all(),
      ),
    ).toEqual([]);
    runMigrations(path, FOLDER);
    expect(
      withDatabase((sqlite) =>
        sqlite
          .query<{ name: string }, []>(
            "SELECT name FROM sqlite_master WHERE name='typed_dependency'",
          )
          .all(),
      ),
    ).toEqual([{ name: 'typed_dependency' }]);
  });

  /**
   * Proof: the three guard statements removed from `down.sql` made this case
   * and `refuses rollback when the typed table is missing` fail on `Received
   * function did not throw` — the rollback dropped the typed row; watched
   * 2026-09-27.
   */
  it('refuses rollback with typed rows and retains the row and migration record', () => {
    withDatabase((sqlite) => {
      seed(sqlite);
      insert(sqlite, 'first');
    });
    const applied = withDatabase((sqlite) =>
      sqlite
        .query<{ id: number; hash: string; created_at: number; name: string | null }, []>(
          'SELECT id, hash, created_at, name FROM __drizzle_migrations ORDER BY id',
        )
        .all(),
    );
    expect(() => rollbackTo(path, FOLDER, STEP_CODE)).toThrow(
      'docs/runbook-prod-deploy.md#typed-dependency-rollback',
    );
    withDatabase((sqlite) => {
      expect(sqlite.query<{ id: string }, []>('SELECT id FROM typed_dependency').all()).toEqual([
        { id: 'first' },
      ]);
      expect(
        sqlite
          .query<{ id: number; hash: string; created_at: number; name: string | null }, []>(
            'SELECT id, hash, created_at, name FROM __drizzle_migrations ORDER BY id',
          )
          .all(),
      ).toEqual(applied);
    });
  });

  it('refuses rollback when the typed table is missing', () => {
    withDatabase((sqlite) => {
      sqlite.run('DROP TABLE typed_dependency');
    });
    expect(() => rollbackTo(path, FOLDER, STEP_CODE)).toThrow('no such table: typed_dependency');
  });
});
