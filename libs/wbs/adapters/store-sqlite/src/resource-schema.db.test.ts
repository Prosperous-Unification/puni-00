import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDatabase } from './db';
import { runMigrations } from './migrate';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;

let dir: string;
let db: Database;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-resource-schema-'));
  const path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
  db = openDatabase(path);
  for (const statement of [
    "INSERT INTO users (id, username, created_at) VALUES ('u1', 'u1', 1)",
    "INSERT INTO project (id, name, owner_id, created_at) VALUES ('p1', 'Plan', 'u1', 1)",
    "INSERT INTO work_item (id, project_id, name, position, revision) VALUES ('w1', 'p1', 'Build', 1, 0)",
    "INSERT INTO resource (id, name, kind, unit_label) VALUES ('ram', 'h2puni ram', 'divisible', 'GB')",
    "INSERT INTO resource (id, name, kind, unit_label) VALUES ('stage', 'staging', 'exclusive', 'env')",
  ])
    db.run(statement);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function count(table: string): number {
  const row = db.query<{ n: number }, []>(`SELECT count(*) AS n FROM ${table}`).get();
  if (row === null) throw new Error(`no count from ${table}`);
  return row.n;
}

describe('20261020120000_add_resources', () => {
  it('refuses a kind outside exclusive and divisible', () => {
    expect(() =>
      db.run(
        "INSERT INTO resource (id, name, kind, unit_label) VALUES ('x', 'x', 'renewable', 'h')",
      ),
    ).toThrow('CHECK constraint failed: resource_kind');
  });

  it('refuses a second resource of one name', () => {
    expect(() =>
      db.run(
        "INSERT INTO resource (id, name, kind, unit_label) VALUES ('ram2', 'h2puni ram', 'exclusive', 'GB')",
      ),
    ).toThrow('UNIQUE constraint failed: resource.name');
  });

  it('holds a capacity of 0 or more whole units, one per project and resource', () => {
    db.run(
      "INSERT INTO project_resource_capacity (project_id, resource_id, units) VALUES ('p1', 'stage', 0)",
    );
    for (const units of ['-1', '1.5'])
      expect(() =>
        db.run(
          `INSERT INTO project_resource_capacity (project_id, resource_id, units) VALUES ('p1', 'ram', ${units})`,
        ),
      ).toThrow('CHECK constraint failed: project_resource_capacity_units');
    db.run(
      "INSERT INTO project_resource_capacity (project_id, resource_id, units) VALUES ('p1', 'ram', 32)",
    );
    expect(() =>
      db.run(
        "INSERT INTO project_resource_capacity (project_id, resource_id, units) VALUES ('p1', 'ram', 16)",
      ),
    ).toThrow('UNIQUE constraint failed');
  });

  it('holds a demand of 1 or more whole units, one per work item and resource', () => {
    for (const units of ['0', '2.5'])
      expect(() =>
        db.run(
          `INSERT INTO work_item_resource_demand (work_item_id, resource_id, units) VALUES ('w1', 'ram', ${units})`,
        ),
      ).toThrow('CHECK constraint failed: work_item_resource_demand_units');
    db.run(
      "INSERT INTO work_item_resource_demand (work_item_id, resource_id, units) VALUES ('w1', 'ram', 4)",
    );
    expect(() =>
      db.run(
        "INSERT INTO work_item_resource_demand (work_item_id, resource_id, units) VALUES ('w1', 'ram', 2)",
      ),
    ).toThrow('UNIQUE constraint failed');
  });

  it('takes a demand with its work item, and demands and capacities with their resource', () => {
    db.run(
      "INSERT INTO work_item (id, project_id, name, position, revision) VALUES ('w2', 'p1', 'Test', 2, 0)",
    );
    db.run(
      "INSERT INTO work_item_resource_demand (work_item_id, resource_id, units) VALUES ('w1', 'ram', 4)",
    );
    db.run(
      "INSERT INTO work_item_resource_demand (work_item_id, resource_id, units) VALUES ('w2', 'stage', 1)",
    );
    db.run(
      "INSERT INTO project_resource_capacity (project_id, resource_id, units) VALUES ('p1', 'ram', 32)",
    );
    db.run("DELETE FROM work_item WHERE id = 'w2'");
    expect(count('work_item_resource_demand')).toBe(1);
    db.run("DELETE FROM resource WHERE id = 'ram'");
    expect(count('work_item_resource_demand')).toBe(0);
    expect(count('project_resource_capacity')).toBe(0);
  });

  it('takes a capacity with its project', () => {
    db.run(
      "INSERT INTO project_resource_capacity (project_id, resource_id, units) VALUES ('p1', 'ram', 32)",
    );
    db.run("DELETE FROM work_item WHERE project_id = 'p1'");
    db.run("DELETE FROM project WHERE id = 'p1'");
    expect(count('project_resource_capacity')).toBe(0);
  });
});
