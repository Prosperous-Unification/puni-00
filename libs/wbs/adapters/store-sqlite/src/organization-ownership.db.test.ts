import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDatabase, openDrizzle } from './db';
import { runMigrations } from './migrate';
import { rollbackTo } from './migrate-down';
import { OrganizationOwnershipRepository, type UnmappedRoot } from './organization-ownership';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const ORGANIZATION_RECORDS = '20260927120000_add_organization_records';
const ORGANIZATION_OWNERSHIP = '20260927130000_add_organization_ownership';
const ORGANIZATION_ACTIVATION = '20260927180000_add_organization_activation';
/** The step code column `address-step-nodes` adds, reversed first. */
const STEP_CODE = '20260927150000_add_step_code';
/** The step allowance column `add-project-step-estimate-allowances` adds, stamped after {@link STEP_CODE}. */
const STEP_ALLOWANCE = '20260927170000_add_step_allowance';
/**
 * The legacy bridge triggers, stamped after
 * {@link ORGANIZATION_ACTIVATION} and reversed before it.
 */
const ORGANIZATION_BRIDGE = '20260927190000_add_organization_bridge';
/**
 * The newest: the triggers that freeze organization ownership, stamped after
 * {@link ORGANIZATION_BRIDGE} and reversed before it.
 */
const ORGANIZATION_FROZEN = '20260927200000_freeze_organization_ownership';
const TYPED_DEPENDENCY = '20260927213000_add_typed_dependency';

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

/** Every row of every table the previous release knows, as JSON, for byte comparison. */
function legacyRows(): Record<string, unknown[]> {
  const db = openDatabase(path);
  try {
    const tables = db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations' ORDER BY name",
      )
      .all()
      .map((row) => row.name);
    return Object.fromEntries(
      tables.map((table) => [table, db.query(`SELECT * FROM "${table}" ORDER BY rowid`).all()]),
    );
  } finally {
    db.close();
  }
}

function seed(statements: readonly string[]): void {
  const db = openDatabase(path);
  try {
    for (const statement of statements) db.run(statement);
  } finally {
    db.close();
  }
}

/**
 * Reverses the bridge triggers, so roots written after the legacy organization
 * stay unmapped, as the outgoing release leaves them when no bridge exists.
 */
function withoutBridge(): void {
  rollbackTo(path, FOLDER, ORGANIZATION_ACTIVATION);
}

describe('OrganizationOwnershipRepository.findUnmappedRoots', () => {
  it('reports an unmapped root of every kind, and only the unmapped ones', async () => {
    withoutBridge();
    seed([
      ...ROOTS,
      "INSERT INTO tag (id, name) VALUES ('t2', 'mapped')",
      "INSERT INTO tag_organization VALUES ('t2', 'legacy', 'mapped')",
    ]);
    const unmapped = await new OrganizationOwnershipRepository(
      openDrizzle(path),
    ).findUnmappedRoots();

    // Written out rather than read from `OWNED_ROOT_KINDS`, so a kind dropped
    // from the production list is a red here and not a shorter expectation.
    const expected: UnmappedRoot[] = [
      { kind: 'project', id: 'p1' },
      { kind: 'person', id: 'pe1' },
      { kind: 'service_team', id: 'st1' },
      { kind: 'service', id: 's1' },
      { kind: 'tag', id: 't1' },
      { kind: 'work_item_type', id: 'w1' },
      { kind: 'external_system', id: 'e1' },
      { kind: 'saved_plan', id: 'sp1' },
    ];
    for (const root of expected) expect(unmapped).toContainEqual(root);
    expect(unmapped).not.toContainEqual({ kind: 'tag', id: 't2' });
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
    withoutBridge();
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

  const ROOT_IDS: readonly (readonly [string, string])[] = [
    ['project', 'p1'],
    ['person', 'pe1'],
    ['service_team', 'st1'],
    ['service', 's1'],
    ['tag', 't1'],
    ['work_item_type', 'w1'],
    ['external_system', 'e1'],
    ['saved_plan', 'sp1'],
  ];
  const CATALOGS = new Set([
    'person',
    'service_team',
    'service',
    'tag',
    'work_item_type',
    'external_system',
  ]);
  const mapping = (table: string, id: string, organization: string | null, name = 'n'): string => {
    const owner = organization === null ? 'NULL' : `'${organization}'`;
    return CATALOGS.has(table)
      ? `INSERT INTO ${table}_organization VALUES ('${id}', ${owner}, '${name}')`
      : `INSERT INTO ${table}_organization VALUES ('${id}', ${owner})`;
  };

  for (const [table, id] of ROOT_IDS)
    it(`refuses a malformed ${table} ownership row`, () => {
      // Without the freeze, whose insert trigger would answer before this
      // migration's own primary key could be seen to.
      rollbackTo(path, FOLDER, ORGANIZATION_BRIDGE);
      seed(ROOTS);
      const db = openDatabase(path);
      try {
        expect(() => db.run(mapping(table, id, null))).toThrow('NOT NULL constraint failed');
        expect(() => db.run(mapping(table, id, 'no-such-organization'))).toThrow(
          'FOREIGN KEY constraint failed',
        );
        expect(() => db.run(mapping(table, 'no-such-root', 'legacy'))).toThrow(
          'FOREIGN KEY constraint failed',
        );
        db.run(mapping(table, id, 'legacy'));
        expect(() => db.run(mapping(table, id, 'org-b', 'other'))).toThrow(
          `UNIQUE constraint failed: ${table}_organization.resource_id`,
        );
      } finally {
        db.close();
      }
    });

  for (const table of CATALOGS)
    it(`refuses one ${table} name twice in one organization`, () => {
      withoutBridge();
      seed([...ROOTS, `INSERT INTO ${table} (id, name) VALUES ('second', 'second-name')`]);
      const db = openDatabase(path);
      try {
        const [, first] = ROOT_IDS.find(([kind]) => kind === table) ?? [];
        if (first === undefined) throw new Error(`no seeded ${table}`);
        db.run(mapping(table, first, 'legacy', 'same'));
        db.run(mapping(table, 'second', 'org-b', 'same'));
        db.run(`DELETE FROM ${table}_organization WHERE resource_id = 'second'`);
        expect(() => db.run(mapping(table, 'second', 'legacy', 'same'))).toThrow(
          `UNIQUE constraint failed: ${table}_organization.organization_id, ${table}_organization.name`,
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

  it('round-trips a populated previous schema, leaving every legacy row as it was', () => {
    // The previous release's schema, populated the way it populates it, then
    // this migration applied, used by both releases, and reversed.
    expect(rollbackTo(path, FOLDER, ORGANIZATION_RECORDS)).toEqual([
      TYPED_DEPENDENCY,
      ORGANIZATION_FROZEN,
      ORGANIZATION_BRIDGE,
      ORGANIZATION_ACTIVATION,
      STEP_ALLOWANCE,
      STEP_CODE,
      ORGANIZATION_OWNERSHIP,
    ]);
    seed([
      ...ROOTS,
      "INSERT INTO work_item (id, project_id, parent_id, position, name) VALUES ('wi1', 'p1', NULL, 0, 'Root')",
      "INSERT INTO work_item_tag (work_item_id, tag_id) VALUES ('wi1', 't1')",
    ]);
    const before = legacyRows();

    runMigrations(path, FOLDER);
    seed([
      "INSERT INTO tag_organization VALUES ('t1', 'legacy', 'urgent')",
      "INSERT INTO project_organization VALUES ('p1', 'legacy')",
      // The outgoing release keeps writing roots it cannot map.
      "INSERT INTO tag (id, name) VALUES ('t-old', 'written-by-old')",
      "DELETE FROM tag WHERE id = 't-old'",
    ]);
    expect(rollbackTo(path, FOLDER, ORGANIZATION_RECORDS)).toEqual([
      TYPED_DEPENDENCY,
      ORGANIZATION_FROZEN,
      ORGANIZATION_BRIDGE,
      ORGANIZATION_ACTIVATION,
      STEP_ALLOWANCE,
      STEP_CODE,
      ORGANIZATION_OWNERSHIP,
    ]);

    expect(legacyRows()).toEqual(before);
    const db = openDatabase(path);
    try {
      expect(
        db
          .query<{ n: number }, []>(
            "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name LIKE '%\\_organization' ESCAPE '\\'",
          )
          .get()?.n,
      ).toBe(0);
    } finally {
      db.close();
    }
  });
});
