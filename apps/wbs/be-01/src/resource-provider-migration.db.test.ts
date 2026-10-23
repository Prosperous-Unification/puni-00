import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openDatabase } from '@wbs/store-sqlite/db';
import { runMigrations } from '@wbs/store-sqlite/migrate';
import { afterEach, describe, expect, it } from 'bun:test';

const APP_ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const MIGRATIONS = join(APP_ROOT, 'drizzle');
const LIMITS_AUDIT = '20261022130100_widen_organization_audit_organization_limits';
const RESOURCE_PROVIDER = '20261022140000_add_resource_provider';
const AUDIT_WIDENING = '20261022140100_widen_organization_audit_compute_providers';
const NEWER = [
  '20261023100000_add_claim_lease',
  '20261022213000_add_optimization_boundary_certificates',
  '20261022212000_add_cross_project_dependency_activation',
  '20261022211000_add_external_dependencies',
  '20261022210000_add_project_abbreviations',
] as const;
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A store migrated to the latest, with an organization, an account, an agent person and a resource. */
function migratedStore(): { root: string; dbPath: string } {
  const root = mkdtempSync(join(tmpdir(), 'wbs-resource-provider-'));
  roots.push(root);
  cpSync(MIGRATIONS, join(root, 'drizzle'), { recursive: true });
  const dbPath = join(root, 'plan.db');
  runMigrations(dbPath, join(root, 'drizzle'));
  run(dbPath, [
    "INSERT INTO users (id, username, password_hash, created_at) VALUES ('dany', 'dany', 'x', 1)",
    "INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1)",
    "INSERT INTO person (id, name, kind, account_id) VALUES ('dash', 'Dash', 'agent', 'dany')",
    "INSERT INTO resource (id, name, kind, unit_label) VALUES ('ram', 'h4claw ram', 'divisible', 'GB')",
  ]);
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

/**
 * The stored `sqlite_master` text of `organization_audit`, its indexes and its
 * triggers; the primary key's automatic index stores no text.
 */
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

/** A store migrated only through `LIMITS_AUDIT`: the schema the compute-provider migrations find. */
function limitsOnlyStore(): string {
  const root = mkdtempSync(join(tmpdir(), 'wbs-resource-provider-baseline-'));
  roots.push(root);
  cpSync(MIGRATIONS, join(root, 'drizzle'), { recursive: true });
  for (const name of [RESOURCE_PROVIDER, AUDIT_WIDENING, ...NEWER])
    rmSync(join(root, 'drizzle', name), { recursive: true });
  const dbPath = join(root, 'plan.db');
  runMigrations(dbPath, join(root, 'drizzle'));
  return dbPath;
}

function columnsOf(dbPath: string, table: string): string[] {
  const sqlite = openDatabase(dbPath);
  try {
    return sqlite
      .query<{ name: string }, []>(`SELECT name FROM pragma_table_info('${table}')`)
      .all()
      .map((row) => row.name);
  } finally {
    sqlite.close();
  }
}

const instance = (id: string, name: string, organization = 'org-a') =>
  `INSERT INTO compute_provider (id, organization_id, kind, name, locator, created_at) VALUES ('${id}', '${organization}', 'ssh_host', '${name}', 'puni1@${name}', 1)`;

const report = (columns: string, values: string) =>
  `INSERT INTO resource_capacity_report (resource_id, provider_id, observed_at, cadence_seconds, reported_by_person_id, reported_at, ${columns}) VALUES ('ram', 'h4claw', 1, 300, 'dash', 2, ${values})`;

const audit = (id: string, action: string, kind: string) =>
  `INSERT INTO organization_audit (id, organization_id, actor_id, action, subject_kind, subject_id, detail, created_at) VALUES ('${id}', 'org-a', 'dany', '${action}', '${kind}', 'subject', '{}', 1)`;

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

/** The provider instance, the resource reference and the capacity report (`compute-providers` task 1.1). */
describe(RESOURCE_PROVIDER, () => {
  it('adds the reference as a nullable column the outgoing release never names', () => {
    const { dbPath } = migratedStore();
    expect(columnsOf(dbPath, 'resource')).toContain('provider_id');
    run(dbPath, [
      // The outgoing release's insert names no provider and reads null.
      "INSERT INTO resource (id, name, kind, unit_label) VALUES ('disk', 'h2puni disk', 'divisible', 'GB')",
    ]);
    expect(count(dbPath, 'SELECT count(*) AS n FROM resource WHERE provider_id IS NULL')).toBe(2);
  });

  it('keeps one instance name per organization', () => {
    const { dbPath } = migratedStore();
    run(dbPath, [
      "INSERT INTO organization (id, name, created_at) VALUES ('org-b', 'B', 1)",
      instance('h4claw', 'h4claw'),
      instance('h4claw-b', 'h4claw', 'org-b'),
    ]);
    expect(() => {
      run(dbPath, [instance('again', 'h4claw')]);
    }).toThrow(/UNIQUE/);
    expect(() => {
      run(dbPath, [
        "INSERT INTO compute_provider (id, organization_id, kind, name, locator, created_at) VALUES ('x', 'org-a', 'lambda', 'x', 'x', 1)",
      ]);
    }).toThrow(/CHECK/);
  });

  it('refuses a report whose columns contradict its outcome', () => {
    const { dbPath } = migratedStore();
    run(dbPath, [instance('h4claw', 'h4claw')]);
    for (const [columns, values] of [
      ['outcome, capacity_units, usage_units, reason', "'measured', 15, 8, 'why'"],
      ['outcome, capacity_units', "'measured', 15"],
      ['outcome, capacity_units, usage_units, reason', "'unreachable', 15, 8, 'down'"],
      ['outcome, reason', "'unreachable', ''"],
      ['outcome, capacity_units, usage_units', "'measured', -1, 0"],
    ])
      expect(() => {
        run(dbPath, [report(columns, values)]);
      }).toThrow(/CHECK/);
    run(dbPath, [report('outcome, capacity_units, usage_units', "'measured', 15, 8")]);
    expect(count(dbPath, 'SELECT count(*) AS n FROM resource_capacity_report')).toBe(1);
  });

  it("removes a resource's report with the resource, as the outgoing release deletes it", () => {
    const { dbPath } = migratedStore();
    run(dbPath, [
      instance('h4claw', 'h4claw'),
      report('outcome, reason', "'unreachable', 'ssh: timed out'"),
      "DELETE FROM resource WHERE id = 'ram'",
    ]);
    expect(count(dbPath, 'SELECT count(*) AS n FROM resource_capacity_report')).toBe(0);
  });

  it('rolls back an empty change and comes forward again', async () => {
    const { root, dbPath } = migratedStore();
    const down = await rollBack(root, dbPath, LIMITS_AUDIT);
    expect(down.stderr).toBe('');
    expect(down.exitCode).toBe(0);
    expect(down.stdout).toBe(
      `rolled back: ${[...NEWER, AUDIT_WIDENING, RESOURCE_PROVIDER].join(', ')}\n`,
    );
    expect(columnsOf(dbPath, 'resource')).not.toContain('provider_id');
    expect(columnsOf(dbPath, 'compute_provider')).toEqual([]);
    runMigrations(dbPath, join(root, 'drizzle'));
    expect(columnsOf(dbPath, 'resource')).toContain('provider_id');
  }, 60_000);

  // Proof: the guard trigger's `WHEN NEW.held > 0` replaced by `WHEN 0` made
  // this observe the rollback succeed, the instance deleted and the reference
  // dropped with the column; watched 2026-10-22.
  it('refuses rollback over one referencing resource, keeping it', async () => {
    const { root, dbPath } = migratedStore();
    run(dbPath, [instance('h4claw', 'h4claw'), "UPDATE resource SET provider_id = 'h4claw'"]);
    const down = await rollBack(root, dbPath, LIMITS_AUDIT);
    expect(down.exitCode).not.toBe(0);
    expect(down.stderr).toContain(
      '2 compute provider instances, resource references or capacity reports exist',
    );
    expect(down.stderr).toContain('DELETE /api/organization/compute-providers/<id>?cascade=true');
    expect(count(dbPath, "SELECT count(*) AS n FROM resource WHERE provider_id = 'h4claw'")).toBe(
      1,
    );
    expect(count(dbPath, 'SELECT count(*) AS n FROM compute_provider')).toBe(1);
  }, 60_000);
});

/** The audit vocabulary widening for compute providers (`compute-providers` task 1.4). */
describe(AUDIT_WIDENING, () => {
  // Proof: `organization_limits_changed` dropped from the forward script's
  // action CHECK made this fail with `CHECK constraint failed` on `a6`;
  // watched 2026-10-22.
  it('admits the three new actions and the kind, and the outgoing release keeps writing', () => {
    const { dbPath } = migratedStore();
    run(dbPath, [
      audit('a1', 'compute_provider_registered', 'compute_provider'),
      audit('a2', 'compute_provider_updated', 'compute_provider'),
      audit('a3', 'compute_provider_removed', 'compute_provider'),
      audit('a4', 'machine_credential_created', 'machine_credential'),
      audit('a5', 'restricted_project_recovery', 'project'),
      // The outgoing release carries the organization limits CLI (`LIMITS_AUDIT`).
      audit('a6', 'organization_limits_changed', 'organization_limits'),
    ]);
    expect(count(dbPath, 'SELECT count(*) AS n FROM organization_audit')).toBe(6);
    expect(() => {
      run(dbPath, [audit('x1', 'compute_provider_dialled', 'compute_provider')]);
    }).toThrow(/CHECK/);
    expect(() => {
      run(dbPath, ['DELETE FROM organization_audit']);
    }).toThrow(/append-only/);
  });

  it('rolls back over outgoing-release rows, keeping them and the organization limits vocabulary', async () => {
    const { root, dbPath } = migratedStore();
    run(dbPath, [
      audit('a4', 'machine_credential_created', 'machine_credential'),
      audit('a6', 'organization_limits_changed', 'organization_limits'),
    ]);
    const down = await rollBack(root, dbPath, RESOURCE_PROVIDER);
    expect(down.stderr).toBe('');
    expect(down.exitCode).toBe(0);
    expect(count(dbPath, 'SELECT count(*) AS n FROM organization_audit')).toBe(2);
    // The outgoing release keeps writing its limits changes after the rollback.
    run(dbPath, [
      audit('a5', 'trusted_issuer_registered', 'trusted_issuer'),
      audit('a7', 'organization_limits_changed', 'organization_limits'),
    ]);
    expect(() => {
      run(dbPath, [audit('a1', 'compute_provider_registered', 'compute_provider')]);
    }).toThrow(/CHECK/);
    expect(() => {
      run(dbPath, ['DELETE FROM organization_audit']);
    }).toThrow(/append-only/);
  }, 60_000);

  // Proof: `organization_limits_changed` dropped from the restored action
  // CHECK in `down.sql` made this fail on the differing table text; watched
  // 2026-10-22.
  it('restores the table, index and triggers the organization limits rebuild left, byte for byte', async () => {
    const baseline = auditSchemaOf(limitsOnlyStore());
    expect(baseline.map(({ type, name }) => `${type} ${name}`)).toEqual([
      'index organization_audit_organization_created',
      'index sqlite_autoindex_organization_audit_1',
      'table organization_audit',
      'trigger organization_audit_no_delete',
      'trigger organization_audit_no_update',
    ]);
    const { root, dbPath } = migratedStore();
    expect(auditSchemaOf(dbPath)).not.toEqual(baseline);
    const down = await rollBack(root, dbPath, LIMITS_AUDIT);
    expect(down.stderr).toBe('');
    expect(down.exitCode).toBe(0);
    expect(auditSchemaOf(dbPath)).toEqual(baseline);
  }, 60_000);

  // Proof: the compute-provider filter in `down.sql` replaced by `WHERE 0`
  // made this fail on the narrow table's CHECK instead of the named guard;
  // watched 2026-10-22.
  it('refuses rollback over one compute provider audit row, keeping it', async () => {
    const { root, dbPath } = migratedStore();
    run(dbPath, [audit('a1', 'compute_provider_registered', 'compute_provider')]);
    const down = await rollBack(root, dbPath, RESOURCE_PROVIDER);
    expect(down.exitCode).not.toBe(0);
    expect(down.stderr).toContain('compute provider audit rows exist');
    expect(count(dbPath, 'SELECT count(*) AS n FROM organization_audit')).toBe(1);
  }, 60_000);
});
