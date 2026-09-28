import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDatabase } from './db';
import { runMigrations } from './migrate';
import { rollbackTo } from './migrate-down';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const ORGANIZATION_BRIDGE = '20260927190000_add_organization_bridge';
const ORGANIZATION_FROZEN = '20260927200000_freeze_organization_ownership';
/** Stamped after the freeze, so a rollback to the bridge reverses it first. */
const TYPED_DEPENDENCY = '20260927213000_add_typed_dependency';

/** Each side table with its root table and the root row seeded for it. */
const SIDES = [
  ['project_organization', 'project', 'p1', false],
  ['saved_plan_organization', 'saved_plan', 'sp1', false],
  ['person_organization', 'person', 'pe1', true],
  ['service_team_organization', 'service_team', 'st1', true],
  ['service_organization', 'service', 's1', true],
  ['tag_organization', 'tag', 't1', true],
  ['work_item_type_organization', 'work_item_type', 'w1', true],
  ['external_system_organization', 'external_system', 'e1', true],
] as const;

let dir: string;
let path: string;
let db: Database;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-ownership-freeze-'));
  path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
  db = openDatabase(path);
  for (const statement of [
    "INSERT INTO organization (id, name, legacy, created_at) VALUES ('org-a', 'A', 1, 1)",
    "INSERT INTO organization (id, name, created_at) VALUES ('org-b', 'B', 1)",
    "INSERT INTO users (id, username, created_at) VALUES ('u1', 'u1', 1)",
    "INSERT INTO project (id, name, owner_id, created_at) VALUES ('p1', 'Plan', 'u1', 1)",
    "INSERT INTO person (id, name) VALUES ('pe1', 'Ada')",
    "INSERT INTO service_team (id, name) VALUES ('st1', 'Platform')",
    "INSERT INTO service (id, name) VALUES ('s1', 'Billing')",
    "INSERT INTO tag (id, name) VALUES ('t1', 'urgent')",
    "INSERT INTO work_item_type (id, name) VALUES ('w1', 'Bug')",
    "INSERT INTO external_system (id, name) VALUES ('e1', 'Jira')",
    `INSERT INTO saved_plan (id, project_id, name, created_by, created_at, input_schema_version, input_bytes, input_sha256, schedule_absent_reason)
     VALUES ('sp1', 'p1', 'Baseline', 'u1', 1, 1, 0, 'x', 'not-scheduled')`,
  ]) {
    db.run(statement);
  }
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

/** The owner the bridge wrote for `id`, which is the legacy organization. */
function ownerOf(side: string, id: string): unknown {
  return db.query(`SELECT organization_id FROM ${side} WHERE resource_id = ?`).get(id);
}

describe.each(SIDES)('%s', (side, root, id, catalog) => {
  it('maps the root to the legacy organization through the bridge', () => {
    expect(ownerOf(side, id)).toEqual({ organization_id: 'org-a' });
  });

  it('refuses moving the root to another organization', () => {
    expect(() =>
      db.run(`UPDATE ${side} SET organization_id = 'org-b' WHERE resource_id = ?`, [id]),
    ).toThrow('organization ownership is immutable');
    expect(ownerOf(side, id)).toEqual({ organization_id: 'org-a' });
  });

  it('refuses unmapping a live root, and a second or replacing mapping', () => {
    expect(() => db.run(`DELETE FROM ${side} WHERE resource_id = ?`, [id])).toThrow(
      'organization ownership is immutable',
    );
    const columns = catalog
      ? '(resource_id, organization_id, name)'
      : '(resource_id, organization_id)';
    const values = catalog ? "(?, 'org-b', 'moved')" : "(?, 'org-b')";
    for (const verb of ['INSERT', 'INSERT OR REPLACE']) {
      expect(() => db.run(`${verb} INTO ${side} ${columns} VALUES ${values}`, [id])).toThrow(
        'organization ownership is immutable',
      );
    }
    expect(ownerOf(side, id)).toEqual({ organization_id: 'org-a' });
  });

  it("lets the root's own deletion take its mapping", () => {
    db.run(`DELETE FROM ${root} WHERE id = ?`, [id]);
    expect(ownerOf(side, id)).toBeNull();
  });

  if (catalog) {
    it("refuses replacing another root's display name", () => {
      // Two more live roots, left unmapped by dropping the bridge that would
      // map them; what is under test is only the freeze.
      db.run(`DROP TRIGGER ${side}_bridge`);
      db.run(
        `INSERT INTO ${root} (id, name) VALUES ('second', 'second-root'), ('third', 'third-root')`,
      );
      db.run(
        `INSERT INTO ${side} (resource_id, organization_id, name) VALUES ('third', 'org-a', 'third')`,
      );
      const held = db.query(`SELECT name FROM ${side} WHERE resource_id = ?`).get(id) as {
        name: string;
      };
      for (const statement of [
        `INSERT OR REPLACE INTO ${side} (resource_id, organization_id, name) VALUES ('second', 'org-a', ?)`,
        `UPDATE OR REPLACE ${side} SET name = ? WHERE resource_id = 'third'`,
      ]) {
        expect(() => db.run(statement, [held.name])).toThrow('organization ownership is immutable');
      }
      expect(ownerOf(side, id)).toEqual({ organization_id: 'org-a' });
    });

    it('still lets a display name change', () => {
      db.run(`UPDATE ${side} SET name = 'renamed' WHERE resource_id = ?`, [id]);
      expect(db.query(`SELECT name FROM ${side} WHERE resource_id = ?`).get(id)).toEqual({
        name: 'renamed',
      });
    });
  }
});

it('rolls back to the bridge and reapplies', () => {
  db.close();
  expect(rollbackTo(path, FOLDER, ORGANIZATION_BRIDGE)).toEqual([
    '20260928030000_add_delegation_use',
    '20260928010000_add_project_solution',
    '20260927220000_add_organization_audit',
    TYPED_DEPENDENCY,
    ORGANIZATION_FROZEN,
  ]);
  db = openDatabase(path);
  db.run("UPDATE tag_organization SET organization_id = 'org-b' WHERE resource_id = 't1'");
  db.run("UPDATE tag_organization SET organization_id = 'org-a' WHERE resource_id = 't1'");
  db.close();
  runMigrations(path, FOLDER);
  db = openDatabase(path);
  expect(() =>
    db.run("UPDATE tag_organization SET organization_id = 'org-b' WHERE resource_id = 't1'"),
  ).toThrow('organization ownership is immutable');
});
