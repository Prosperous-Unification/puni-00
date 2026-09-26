import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDatabase, openDrizzle } from './db';
import { runMigrations } from './migrate';
import { rollbackTo } from './migrate-down';
import { OrganizationOwnershipRepository, OWNED_ROOT_KINDS } from './organization-ownership';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const ORGANIZATION_RECORDS = '20260927120000_add_organization_records';
const ORGANIZATION_OWNERSHIP = '20260927130000_add_organization_ownership';

let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-organization-ownership-'));
  path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** One root of every kind, written the way the outgoing release writes them: unmapped. */
const ROOTS = [
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
  "INSERT INTO organization (id, name, legacy, created_at) VALUES ('legacy', 'Legacy', 1, 1)",
  "INSERT INTO organization (id, name, created_at) VALUES ('org-b', 'B', 1)",
];

function seed(statements: readonly string[]): void {
  const db = openDatabase(path);
  try {
    for (const statement of statements) db.run(statement);
  } finally {
    db.close();
  }
}

describe('OrganizationOwnershipRepository.findUnmappedRoots', () => {
  it('reports an unmapped root of every kind', async () => {
    seed(ROOTS);
    const unmapped = await new OrganizationOwnershipRepository(
      openDrizzle(path),
    ).findUnmappedRoots();

    // Migrations seed some catalog rows of their own, so each kind appears at
    // least once rather than exactly once.
    expect([...new Set(unmapped.map((root) => root.kind))]).toEqual([...OWNED_ROOT_KINDS]);
  });

  it('answers empty once every root is mapped', async () => {
    seed([
      ...ROOTS,
      "INSERT INTO project_organization SELECT id, 'legacy' FROM project",
      "INSERT INTO saved_plan_organization SELECT id, 'legacy' FROM saved_plan",
      ...['person', 'service_team', 'service', 'tag', 'work_item_type', 'external_system'].map(
        (table) => `INSERT INTO ${table}_organization SELECT id, 'legacy', name FROM ${table}`,
      ),
    ]);

    expect(
      await new OrganizationOwnershipRepository(openDrizzle(path)).findUnmappedRoots(),
    ).toEqual([]);
  });
});

describe('20260927130000_add_organization_ownership', () => {
  it('holds the same catalog name in two organizations, once each', () => {
    // Storage capability only: the legacy `tag_name` index still refuses a
    // second `tag.name`, so each organization's `urgent` is a separate backing
    // row. Live two-organization naming is task 3.2's mounted test.
    seed([
      ...ROOTS,
      "INSERT INTO tag (id, name) VALUES ('t2', 'urgent-b')",
      "INSERT INTO tag (id, name) VALUES ('t3', 'urgent-again')",
      "INSERT INTO tag_organization VALUES ('t1', 'legacy', 'urgent')",
      "INSERT INTO tag_organization VALUES ('t2', 'org-b', 'urgent')",
    ]);
    const db = openDatabase(path);
    try {
      expect(() => db.run("INSERT INTO tag_organization VALUES ('t3', 'org-b', 'urgent')")).toThrow(
        'UNIQUE constraint failed',
      );
      expect(() => db.run("INSERT INTO tag (id, name) VALUES ('t4', 'urgent')")).toThrow(
        'UNIQUE constraint failed',
      );
    } finally {
      db.close();
    }
  });

  it('lets the outgoing release delete a mapped root', () => {
    seed([...ROOTS, "INSERT INTO tag_organization VALUES ('t1', 'legacy', 'urgent')"]);
    const db = openDatabase(path);
    try {
      db.run("DELETE FROM tag WHERE id = 't1'");
      expect(
        db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM tag_organization').get()?.n,
      ).toBe(0);
    } finally {
      db.close();
    }
  });

  it('rolls back before activation, keeping every root', () => {
    seed([...ROOTS, "INSERT INTO tag_organization VALUES ('t1', 'legacy', 'urgent')"]);

    expect(rollbackTo(path, FOLDER, ORGANIZATION_RECORDS)).toEqual([ORGANIZATION_OWNERSHIP]);

    const db = openDatabase(path);
    try {
      const sideTables = db
        .query<{ n: number }, []>(
          "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name LIKE '%\\_organization' ESCAPE '\\'",
        )
        .get()?.n;
      expect(sideTables).toBe(0);
      expect(db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM tag').get()?.n).toBe(1);
      expect(db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM saved_plan').get()?.n).toBe(1);
    } finally {
      db.close();
    }
  });
});
