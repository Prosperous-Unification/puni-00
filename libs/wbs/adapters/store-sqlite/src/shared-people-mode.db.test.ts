import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDatabase, openDrizzle } from './db';
import { rollbackTo } from './migrate-down';
import { readCapacityMode } from './shared-people-mode';
import { MIGRATIONS_FOLDER, openSpaceDatabase } from './testing/space-database';

let directory: string;
let path: string;
beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'wbs-shared-mode-'));
  path = await openSpaceDatabase(directory);
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

function execute(statement: string) {
  const db = openDatabase(path);
  try {
    return db.query(statement).all();
  } finally {
    db.close();
  }
}

describe('shared people mode storage', () => {
  it('strictly reads both stored modes and refuses corrupt or missing trusted state', () => {
    const db = openDrizzle(path);
    expect(readCapacityMode(db, 'org-a')).toBe('isolated');
    execute("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    expect(readCapacityMode(db, 'org-a')).toBe('shared');
    expect(() => readCapacityMode(db, 'absent')).toThrow('organization absent is missing');
    const connection = openDatabase(path);
    try {
      connection.run('PRAGMA ignore_check_constraints = ON');
      for (const value of ['2', '0.5', "'invalid'"]) {
        connection.run(`UPDATE organization SET shared_people = ${value} WHERE id = 'org-a'`);
        expect(() => readCapacityMode(db, 'org-a')).toThrow('invalid stored shared_people');
      }
    } finally {
      connection.close();
    }
  });

  it('defaults every existing organization to isolated and constrains the stored mode', () => {
    const modes = execute('SELECT shared_people FROM organization');
    expect(modes.length).toBeGreaterThan(0);
    expect(
      modes.every(
        (row) => typeof row === 'object' && row !== null && Reflect.get(row, 'shared_people') === 0,
      ),
    ).toBe(true);
    execute("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    for (const value of ['2', '-1', '0.5', 'NULL', "'shared'"])
      expect(() => execute(`UPDATE organization SET shared_people = ${value}`)).toThrow();
  });

  it('refuses column rollback with a shared organization, preserving schema and ledger', () => {
    execute("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    const ledger = execute('SELECT * FROM __drizzle_migrations');
    expect(() => rollbackTo(path, MIGRATIONS_FOLDER, '20260929180000_add_project_rank')).toThrow(
      'shared-people-rollback-cli.ts',
    );
    expect(execute("SELECT shared_people FROM organization WHERE id = 'org-a'")).toEqual([
      { shared_people: 1 },
    ]);
    expect(execute('SELECT * FROM __drizzle_migrations')).toEqual(ledger);
  });

  it('independently refuses column rollback while a rank exists', () => {
    execute(
      "INSERT INTO project_rank (project_id, organization_id, position, created_at, created_by) VALUES ('a1','org-a',1,1,'ada')",
    );
    expect(() => rollbackTo(path, MIGRATIONS_FOLDER, '20260929180000_add_project_rank')).toThrow(
      'project ranks exist',
    );
    expect(execute('SELECT shared_people FROM organization')).toHaveLength(2);
    expect(execute('SELECT * FROM project_rank')).toHaveLength(1);
  });
});
