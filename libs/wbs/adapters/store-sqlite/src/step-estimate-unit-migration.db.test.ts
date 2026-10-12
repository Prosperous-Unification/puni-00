import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDatabase } from './db';
import { runMigrations } from './migrate';
import { rollbackTo } from './migrate-down';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
let directory: string;
let path: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'wbs-step-unit-'));
  path = join(directory, 'plan.db');
  runMigrations(path, FOLDER);
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});
function seed() {
  const sqlite = openDatabase(path);
  sqlite.run(
    "INSERT INTO users (id, username, password_hash, created_at) VALUES ('u','owner','x',1)",
  );
  sqlite.run("INSERT INTO project (id,name,owner_id,created_at) VALUES ('p','Project','u',1)");
  sqlite.run("INSERT INTO step (id,project_id,name,position) VALUES ('s','p','Dev',10)");
  return sqlite;
}
describe('step estimate unit migration', () => {
  it('applies and an old-writer insert reads workdays', () => {
    const sqlite = seed();
    try {
      expect(sqlite.query("SELECT estimate_unit FROM step WHERE id='s'").get()).toEqual({
        estimate_unit: 'workdays',
      });
    } finally {
      sqlite.close();
    }
  });
  it('refuses hours through its CHECK', () => {
    const sqlite = seed();
    try {
      expect(() => sqlite.run("UPDATE step SET estimate_unit='hours'")).toThrow('CHECK');
    } finally {
      sqlite.close();
    }
  });
  it('refuses rollback over a minutes step naming the recovery CLI', () => {
    const sqlite = seed();
    try {
      sqlite.run("UPDATE step SET estimate_unit='minutes'");
      expect(() => rollbackTo(path, FOLDER, '20261012120000_add_step_node_attempts')).toThrow(
        'estimate-unit-rollback-cli.ts',
      );
      expect(sqlite.query('SELECT estimate_unit FROM step').get()).toEqual({
        estimate_unit: 'minutes',
      });
    } finally {
      sqlite.close();
    }
  });
  it('rolls back and reapplies over workday steps', () => {
    const sqlite = seed();
    sqlite.close();
    rollbackTo(path, FOLDER, '20261012120000_add_step_node_attempts');
    const older = openDatabase(path);
    try {
      expect(
        older
          .query<{ name: string }, []>('PRAGMA table_info(step)')
          .all()
          .map((column) => column.name),
      ).not.toContain('estimate_unit');
    } finally {
      older.close();
    }
    runMigrations(path, FOLDER);
    const newer = openDatabase(path);
    try {
      expect(newer.query('SELECT estimate_unit FROM step').get()).toEqual({
        estimate_unit: 'workdays',
      });
    } finally {
      newer.close();
    }
  });
});
