import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ORGANIZATION_AUDIT_ACTIONS, ORGANIZATION_AUDIT_SUBJECT_KINDS } from '@wbs/core';
import { openDatabase } from '@wbs/store-sqlite/db';
import { runMigrations } from '@wbs/store-sqlite/migrate';
import { afterEach, describe, expect, it } from 'bun:test';

const APP_ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const MIGRATIONS = join(APP_ROOT, 'drizzle');
/** The latest migration before this change's two. */
const WORK_ITEM_BUDGETS = '20261023170000_add_work_item_budget';
const AUDIT_WIDENING = '20261025100000_widen_organization_audit_directory_capacity';
const DIRECTORY_CAPACITY = '20261025100100_add_resource_directory_capacity';
/** What the widening adds; every other value of the two vocabularies was admitted before it. */
const NEW_ACTION = 'directory_capacity_changed';
const NEW_KIND = 'resource';
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A store migrated to the latest, with an organization, an account and a resource. */
function migratedStore(): { root: string; dbPath: string } {
  const root = mkdtempSync(join(tmpdir(), 'wbs-directory-capacity-'));
  roots.push(root);
  cpSync(MIGRATIONS, join(root, 'drizzle'), { recursive: true });
  const dbPath = join(root, 'plan.db');
  runMigrations(dbPath, join(root, 'drizzle'));
  run(dbPath, [
    "INSERT INTO users (id, username, password_hash, created_at) VALUES ('dany', 'dany', 'x', 1)",
    "INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1)",
    "INSERT INTO resource (id, name, kind, unit_label) VALUES ('ram', 'host ram', 'divisible', 'GB')",
  ]);
  return { root, dbPath };
}

/** A store migrated only through {@link WORK_ITEM_BUDGETS}: the schema this change finds. */
function baselineStore(): { root: string; dbPath: string } {
  const root = mkdtempSync(join(tmpdir(), 'wbs-directory-capacity-baseline-'));
  roots.push(root);
  cpSync(MIGRATIONS, join(root, 'drizzle'), { recursive: true });
  const dbPath = join(root, 'plan.db');
  for (const name of [AUDIT_WIDENING, DIRECTORY_CAPACITY])
    rmSync(join(root, 'drizzle', name), { recursive: true });
  runMigrations(dbPath, join(root, 'drizzle'));
  return { root, dbPath };
}

function run(dbPath: string, statements: string[]): void {
  const sqlite = openDatabase(dbPath);
  try {
    for (const statement of statements) sqlite.run(statement);
  } finally {
    sqlite.close();
  }
}

function count(dbPath: string, sql: string): number {
  const sqlite = openDatabase(dbPath);
  try {
    return sqlite.query<{ n: number }, []>(sql).get()?.n ?? -1;
  } finally {
    sqlite.close();
  }
}

function auditSchemaOf(dbPath: string): { type: string; name: string; sql: string | null }[] {
  const sqlite = openDatabase(dbPath);
  try {
    return sqlite
      .query<{ type: string; name: string; sql: string | null }, []>(
        "SELECT type, name, sql FROM sqlite_master WHERE tbl_name = 'organization_audit' ORDER BY type, name",
      )
      .all();
  } finally {
    sqlite.close();
  }
}

const audit = (id: string, action: string, kind: string) =>
  `INSERT INTO organization_audit (id, organization_id, actor_id, action, subject_kind, subject_id, detail, created_at) VALUES ('${id}', 'org-a', 'dany', '${action}', '${kind}', 'subject', '{}', 1)`;

const stated = (units: string) =>
  `INSERT INTO resource_directory_capacity (resource_id, units) VALUES ('ram', ${units})`;

async function rollBack(root: string, dbPath: string, to: string) {
  const child = Bun.spawn(
    [process.execPath, 'run', join(APP_ROOT, 'src', 'migrate-down-cli.ts'), `--to=${to}`],
    { cwd: root, env: { ...process.env, DB_PATH: dbPath }, stdout: 'pipe', stderr: 'pipe' },
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

/** The audit vocabulary widening (`wbs-shared-occupancy` task 1.0). */
describe(AUDIT_WIDENING, () => {
  const earlierActions = ORGANIZATION_AUDIT_ACTIONS.filter((action) => action !== NEW_ACTION);
  const earlierKinds = ORGANIZATION_AUDIT_SUBJECT_KINDS.filter((kind) => kind !== NEW_KIND);

  // Proof: with `compute_provider_removed` dropped from the rebuilt CHECK in
  // `migration.sql`, the forward run threw on the rebuild's copy (a
  // DrizzleQueryError from `runMigrations`); watched 2026-10-25.
  it('keeps one row of every earlier action and subject kind through the rebuild', () => {
    const { dbPath } = baselineStore();
    run(dbPath, [
      "INSERT INTO users (id, username, password_hash, created_at) VALUES ('dany', 'dany', 'x', 1)",
      "INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1)",
      ...earlierActions.map((action, index) => audit(`a${String(index)}`, action, 'project')),
      ...earlierKinds.map((kind, index) =>
        audit(`k${String(index)}`, 'restricted_project_recovery', kind),
      ),
    ]);
    // The whole folder: the baseline's own copy lacks this change's migrations.
    runMigrations(dbPath, MIGRATIONS);
    expect(
      count(
        dbPath,
        "SELECT count(*) AS n FROM sqlite_master WHERE name = 'resource_directory_capacity'",
      ),
    ).toBe(1);
    expect(count(dbPath, 'SELECT count(*) AS n FROM organization_audit')).toBe(
      earlierActions.length + earlierKinds.length,
    );
    for (const action of earlierActions)
      expect(
        count(dbPath, `SELECT count(*) AS n FROM organization_audit WHERE action = '${action}'`),
        action,
      ).toBeGreaterThan(0);
    for (const kind of earlierKinds)
      expect(
        count(
          dbPath,
          `SELECT count(*) AS n FROM organization_audit WHERE subject_kind = '${kind}'`,
        ),
        kind,
      ).toBeGreaterThan(0);
  });

  it('admits the new action and kind, refuses an unknown one, and stays append-only', () => {
    const { dbPath } = migratedStore();
    run(dbPath, [audit('d1', NEW_ACTION, NEW_KIND)]);
    expect(count(dbPath, 'SELECT count(*) AS n FROM organization_audit')).toBe(1);
    expect(() => {
      run(dbPath, [audit('x1', 'directory_capacity_guessed', NEW_KIND)]);
    }).toThrow(/CHECK/);
    expect(() => {
      run(dbPath, [audit('x2', NEW_ACTION, 'host')]);
    }).toThrow(/CHECK/);
    expect(() => {
      run(dbPath, ['DELETE FROM organization_audit']);
    }).toThrow(/append-only/);
  });

  it('restores the table, index and triggers the compute provider rebuild left, byte for byte', async () => {
    const baseline = auditSchemaOf(baselineStore().dbPath);
    const { root, dbPath } = migratedStore();
    expect(auditSchemaOf(dbPath)).not.toEqual(baseline);
    const down = await rollBack(root, dbPath, WORK_ITEM_BUDGETS);
    expect(down.stderr).toBe('');
    expect(down.exitCode).toBe(0);
    expect(down.stdout).toContain(`rolled back: ${DIRECTORY_CAPACITY}, ${AUDIT_WIDENING}\n`);
    expect(auditSchemaOf(dbPath)).toEqual(baseline);
  }, 60_000);

  // Proof: with the filter in `down.sql` replaced by `WHERE 0`, this failed
  // on the narrow table's CHECK instead of the named guard; watched 2026-10-25.
  it('refuses rollback over one directory capacity audit row, keeping it', async () => {
    const { root, dbPath } = migratedStore();
    run(dbPath, [audit('d1', NEW_ACTION, NEW_KIND)]);
    const down = await rollBack(root, dbPath, WORK_ITEM_BUDGETS);
    expect(down.exitCode).not.toBe(0);
    expect(down.stderr).toContain('directory capacity audit rows exist');
    expect(count(dbPath, 'SELECT count(*) AS n FROM organization_audit')).toBe(1);
  }, 60_000);
});

/** The directory capacity table (`wbs-shared-occupancy` task 1.1). */
describe(DIRECTORY_CAPACITY, () => {
  // Proof: with the `typeof` half of the CHECK removed from `migration.sql`,
  // this stored the text 'sixteen' (a text '16' takes the column's integer
  // affinity and is stored as 16 either way); watched 2026-10-25.
  it('refuses a negative or a text directory capacity', () => {
    const { dbPath } = migratedStore();
    for (const units of ["'sixteen'", '-1', '1.5', 'NULL'])
      expect(() => {
        run(dbPath, [stated(units)]);
      }, units).toThrow(/constraint failed/);
    run(dbPath, [stated('0')]);
    expect(count(dbPath, 'SELECT count(*) AS n FROM resource_directory_capacity')).toBe(1);
  });

  it('goes with its resource', () => {
    const { dbPath } = migratedStore();
    run(dbPath, [stated('16'), "DELETE FROM resource WHERE id = 'ram'"]);
    expect(count(dbPath, 'SELECT count(*) AS n FROM resource_directory_capacity')).toBe(0);
  });

  it('rolls back an empty table and comes forward again', async () => {
    const { root, dbPath } = migratedStore();
    const down = await rollBack(root, dbPath, AUDIT_WIDENING);
    expect(down.stderr).toBe('');
    expect(down.exitCode).toBe(0);
    expect(down.stdout).toContain(`rolled back: ${DIRECTORY_CAPACITY}\n`);
    expect(
      count(
        dbPath,
        "SELECT count(*) AS n FROM sqlite_master WHERE name = 'resource_directory_capacity'",
      ),
    ).toBe(0);
    runMigrations(dbPath, join(root, 'drizzle'));
    run(dbPath, [stated('16')]);
    expect(count(dbPath, 'SELECT count(*) AS n FROM resource_directory_capacity')).toBe(1);
  }, 60_000);

  // Proof: with the guard's comparison made `>= 0` in `down.sql`, this
  // dropped the table with the row; watched 2026-10-25.
  it('refuses rollback over a stated directory capacity, keeping it', async () => {
    const { root, dbPath } = migratedStore();
    run(dbPath, [stated('16')]);
    const down = await rollBack(root, dbPath, AUDIT_WIDENING);
    expect(down.exitCode).not.toBe(0);
    expect(down.stderr).toContain('directory capacities are stated');
    expect(count(dbPath, 'SELECT count(*) AS n FROM resource_directory_capacity')).toBe(1);
  }, 60_000);
});
