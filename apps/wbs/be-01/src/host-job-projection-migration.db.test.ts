import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openDatabase } from '@wbs/store-sqlite/db';
import { runMigrations } from '@wbs/store-sqlite/migrate';
import { afterEach, describe, expect, it } from 'bun:test';

const APP_ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const MIGRATIONS = join(APP_ROOT, 'drizzle');
const HOST_JOB_PROJECTION = '20261101120000_add_host_job_projection';
const AGENT_POOL_AUDIT = '20261028100100_widen_organization_audit_agent_pools';
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/**
 * A store migrated to the latest from a copy of the real folder, holding one provider instance,
 * one resource it fulfils, one agent person and one authority bound to the instance.
 */
function migratedStore() {
  const root = mkdtempSync(join(tmpdir(), 'wbs-host-job-projection-'));
  roots.push(root);
  const folder = join(root, 'drizzle');
  cpSync(MIGRATIONS, folder, { recursive: true });
  const dbPath = join(root, 'plan.db');
  runMigrations(dbPath, folder);
  run(dbPath, [
    "INSERT INTO users (id, username, password_hash, created_at) VALUES ('dany', 'dany', 'x', 1)",
    "INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1)",
    "INSERT INTO person (id, name, kind, account_id) VALUES ('dash', 'Dash', 'agent', 'dany')",
    "INSERT INTO compute_provider (id, organization_id, kind, name, locator, created_at) VALUES ('h2puni', 'org-a', 'ssh_host', 'h2puni', 'puni1@h2puni', 1)",
    "INSERT INTO resource (id, name, kind, unit_label, provider_id) VALUES ('ram', 'h2puni ram', 'divisible', 'GiB', 'h2puni')",
    "INSERT INTO resource_authority (authority_id, organization_id, provider_id, credential_id, epoch, created_at, created_by) VALUES ('dash-h2', 'org-a', 'h2puni', 'c1', 'e1', 1, 'dany')",
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
    const row = sqlite.query<{ n: number }, []>(sql).get();
    if (row === null) throw new Error('count answered no row');
    return row.n;
  } finally {
    sqlite.close();
  }
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

/** The outgoing release's report insert: it names no `reserved_units`. */
const preChangeReport =
  "INSERT INTO resource_capacity_report (resource_id, provider_id, observed_at, cadence_seconds, outcome, capacity_units, usage_units, reported_by_person_id, reported_at) VALUES ('ram', 'h2puni', 1, 300, 'measured', 15, 8, 'dash', 2)";
const hostJob =
  "INSERT INTO resource_host_job (use_id, authority_id, organization_id, provider_id, incarnation, revision, declaration, state, registered_at) VALUES ('job-1', 'dash-h2', 'org-a', 'h2puni', 'i1', 1, '{}', 'registered', 1)";

/** `dash-host-jobs` tasks 5.1 and 5.2: reserved units on the report and the host job projection. */
describe(HOST_JOB_PROJECTION, () => {
  it('keeps the outgoing release report insert working, with reserved units null', () => {
    const { dbPath } = migratedStore();
    run(dbPath, [preChangeReport]);
    expect(
      count(
        dbPath,
        'SELECT COUNT(*) AS n FROM resource_capacity_report WHERE reserved_units IS NULL',
      ),
    ).toBe(1);
    run(dbPath, [
      "UPDATE resource_capacity_report SET reserved_units = 12, reserved_dimension = 'memoryGib'",
    ]);
    // Only a measured report carries reserved units, and only whole numbers in range.
    for (const update of [
      'UPDATE resource_capacity_report SET reserved_units = 1.5',
      'UPDATE resource_capacity_report SET reserved_units = 1000000001',
      'UPDATE resource_capacity_report SET reserved_dimension = NULL',
      'UPDATE resource_capacity_report SET reserved_units = NULL',
      "UPDATE resource_capacity_report SET outcome = 'unreachable', capacity_units = NULL, usage_units = NULL, reason = 'down'",
    ])
      expect(() => {
        run(dbPath, [update]);
      }).toThrow(/CHECK/);
  });

  it('keeps a host job registered or returned, never between', () => {
    const { dbPath } = migratedStore();
    run(dbPath, [hostJob]);
    expect(() => {
      run(dbPath, ["UPDATE resource_host_job SET state = 'release_verified', revision = 2"]);
    }).toThrow(/CHECK/);
    run(dbPath, [
      `UPDATE resource_host_job SET state = 'release_verified', revision = 2, released_at = 3, evidence = '{"disposition":"returned"}'`,
    ]);
    expect(() => {
      run(dbPath, ["UPDATE resource_host_job SET state = 'returned'"]);
    }).toThrow(/CHECK/);
  });

  it('rolls back over reports alone, dropping the column and the table', async () => {
    const { root, dbPath } = migratedStore();
    run(dbPath, [
      preChangeReport,
      "UPDATE resource_capacity_report SET reserved_units = 12, reserved_dimension = 'memoryGib'",
    ]);
    const down = await rollBack(root, dbPath, AGENT_POOL_AUDIT);
    expect(down.stderr).toBe('');
    expect(down.exitCode).toBe(0);
    expect(down.stdout).toContain(`rolled back: ${HOST_JOB_PROJECTION}\n`);
    expect(columnsOf(dbPath, 'resource_capacity_report')).not.toContain('reserved_units');
    expect(columnsOf(dbPath, 'resource_capacity_report')).not.toContain('reserved_dimension');
    expect(columnsOf(dbPath, 'resource_host_job')).toEqual([]);
    expect(count(dbPath, 'SELECT COUNT(*) AS n FROM resource_capacity_report')).toBe(1);
  }, 60_000);

  // Proof: with the guard's count replaced by `0`, this rollback exited 0; watched 2026-11-01
  // (verify.md Slice 5).
  it('refuses rollback over one host job, keeping it', async () => {
    const { root, dbPath } = migratedStore();
    run(dbPath, [hostJob]);
    const down = await rollBack(root, dbPath, AGENT_POOL_AUDIT);
    expect(down.exitCode).not.toBe(0);
    expect(down.stderr).toContain('host jobs are projected from a resource authority');
    expect(count(dbPath, 'SELECT COUNT(*) AS n FROM resource_host_job')).toBe(1);
    expect(columnsOf(dbPath, 'resource_capacity_report')).toContain('reserved_units');
  }, 60_000);
});
