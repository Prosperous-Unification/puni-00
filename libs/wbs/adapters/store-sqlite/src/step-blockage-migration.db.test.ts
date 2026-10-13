import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDatabase } from './db';
import { runMigrations } from './migrate';
import { rollbackTo } from './migrate-down';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const MIGRATION = '20261013140000_add_step_node_blockages';
const BASELINE = '20261012130000_add_step_estimate_unit';
let directory: string;
let path: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'wbs-step-blockage-migration-'));
  path = join(directory, 'plan.db');
  runMigrations(path, FOLDER);
  const sqlite = openDatabase(path);
  try {
    sqlite.run(
      "INSERT INTO users (id, username, password_hash, created_at) VALUES ('u','owner','x',1)",
    );
    sqlite.run(
      "INSERT INTO project (id,name,owner_id,revision,created_at) VALUES ('p','Plan','u',0,1),('foreign','Foreign','u',0,1)",
    );
    sqlite.run(
      "INSERT INTO step (id,project_id,name,position) VALUES ('dev','p','Dev',1),('foreign','foreign','Dev',1)",
    );
    sqlite.run(
      "INSERT INTO work_item (id,project_id,name,position,revision) VALUES ('a','p','A',1,0),('b','p','B',2,0)",
    );
  } finally {
    sqlite.close();
  }
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

function withDatabase<T>(read: (sqlite: ReturnType<typeof openDatabase>) => T): T {
  const sqlite = openDatabase(path);
  try {
    return read(sqlite);
  } finally {
    sqlite.close();
  }
}

const insert = (sqlite: ReturnType<typeof openDatabase>, owner = 'a', step = 'dev', at = 1) =>
  sqlite.run('INSERT INTO step_blockage (work_item_id,step_id,blocked_at) VALUES (?,?,?)', [
    owner,
    step,
    at,
  ]);

describe(MIGRATION, () => {
  it('adds sparse audited facts and preserves outgoing writer inserts', () => {
    withDatabase((sqlite) => {
      expect(
        sqlite.query("SELECT name FROM sqlite_master WHERE name = 'step_blockage'").all(),
      ).toHaveLength(1);
      insert(sqlite);
      expect(sqlite.query('SELECT * FROM step_blockage').all()).toEqual([
        {
          work_item_id: 'a',
          step_id: 'dev',
          blocked_at: 1,
          created_at: null,
          updated_at: null,
          created_by: null,
        },
      ]);
    });
  });

  it('refuses duplicate pairs, missing references, cross-project steps and parent owners', () => {
    withDatabase((sqlite) => {
      insert(sqlite);
      expect(() => insert(sqlite)).toThrow(/UNIQUE/);
      expect(() => insert(sqlite, 'gone')).toThrow(/FOREIGN KEY/);
      expect(() => insert(sqlite, 'b', 'gone')).toThrow(/FOREIGN KEY/);
      expect(() => insert(sqlite, 'b', 'foreign')).toThrow(/step blockage project mismatch/);
      expect(() =>
        sqlite.run(
          "INSERT INTO step_blockage (work_item_id,step_id,blocked_at,created_by) VALUES ('b','dev',1,'gone')",
        ),
      ).toThrow(/FOREIGN KEY/);
      sqlite.run(
        "INSERT INTO work_item (id,project_id,parent_id,name,position,revision) VALUES ('child','p','b','Child',1,0)",
      );
      expect(() => insert(sqlite, 'b')).toThrow(/step blockage owner is not a leaf/);
      expect(() =>
        sqlite.run("UPDATE step_blockage SET work_item_id = 'b' WHERE work_item_id = 'a'"),
      ).toThrow(/step blockage owner is not a leaf/);
      expect(() =>
        sqlite.run("UPDATE step_blockage SET step_id = 'foreign' WHERE work_item_id = 'a'"),
      ).toThrow(/step blockage project mismatch/);
    });
  });

  it('cascades deleted work while refusing step deletion over retained facts', () => {
    withDatabase((sqlite) => {
      insert(sqlite);
      expect(() => sqlite.run("DELETE FROM step WHERE id='dev'")).toThrow(/FOREIGN KEY/);
      sqlite.run("DELETE FROM work_item WHERE id='a'");
      expect(sqlite.query('SELECT * FROM step_blockage').all()).toEqual([]);
    });
  });

  it('refuses fractional and unsafe blocked timestamps', () => {
    withDatabase((sqlite) => {
      for (const at of [1.5, Number.MAX_SAFE_INTEGER + 1])
        expect(() => insert(sqlite, 'a', 'dev', at)).toThrow(/step_blockage_time/);
    });
  });

  it('refuses rollback over a fact, keeping the schema and migration ledger', () => {
    withDatabase((sqlite) => insert(sqlite));
    expect(() => rollbackTo(path, FOLDER, BASELINE)).toThrow(/step-blockage-rollback-cli.ts/);
    withDatabase((sqlite) => {
      expect(sqlite.query('SELECT blocked_at FROM step_blockage').all()).toEqual([
        { blocked_at: 1 },
      ]);
      expect(
        sqlite.query('SELECT name FROM __drizzle_migrations WHERE name = ?').all(MIGRATION),
      ).toHaveLength(1);
    });
  });

  it('rolls an empty table back and reapplies without changing existing plan rows', () => {
    expect(rollbackTo(path, FOLDER, BASELINE)).toEqual([MIGRATION]);
    withDatabase((sqlite) => {
      expect(
        sqlite.query("SELECT name FROM sqlite_master WHERE name = 'step_blockage'").all(),
      ).toEqual([]);
    });
    runMigrations(path, FOLDER);
    withDatabase((sqlite) => {
      insert(sqlite);
      expect(sqlite.query('SELECT id FROM work_item ORDER BY id').all()).toEqual([
        { id: 'a' },
        { id: 'b' },
      ]);
    });
  });
});
