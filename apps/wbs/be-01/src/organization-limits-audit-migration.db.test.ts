import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openDatabase } from '@wbs/store-sqlite/db';
import { runMigrations } from '@wbs/store-sqlite/migrate';
import { afterEach, describe, expect, it } from 'bun:test';

const APP_ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const MIGRATIONS = join(APP_ROOT, 'drizzle');
const ORGANIZATION_LIMITS = '20261022130000_add_organization_limits';
const MEASURE = '20261023140000_add_measure';
/** The measure-keyed facts, which reverse first over legacy facts alone. */
const MEASURE_FACTS = '20261023150000_key_step_measure';
const MEASURE_ESTIMATES = '20261023160000_add_measure_estimate';
const WORK_ITEM_BUDGETS = '20261023170000_add_work_item_budget';
/** This change's two migrations (`wbs-shared-occupancy`), newer still, which reverse first. */
const SHARED_OCCUPANCY =
  '20261025100100_add_resource_directory_capacity, 20261025100000_widen_organization_audit_directory_capacity';
const LIMITS_AUDIT = '20261022130100_widen_organization_audit_organization_limits';
/** The two compute-provider migrations newer than the limits, which reverse first. */
const COMPUTE_PROVIDERS =
  '20261022140100_widen_organization_audit_compute_providers, 20261022140000_add_resource_provider';
const CLAIM_LEASE = '20261023100000_add_claim_lease';
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A store migrated to the latest, with one organization. */
function migratedStore(): { root: string; dbPath: string } {
  const root = mkdtempSync(join(tmpdir(), 'wbs-limits-audit-'));
  roots.push(root);
  cpSync(MIGRATIONS, join(root, 'drizzle'), { recursive: true });
  const dbPath = join(root, 'plan.db');
  runMigrations(dbPath, join(root, 'drizzle'));
  run(dbPath, ["INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1)"]);
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

function auditRows(dbPath: string): { action: string; subject_kind: string }[] {
  const sqlite = openDatabase(dbPath);
  try {
    return sqlite
      .query<{ action: string; subject_kind: string }, []>(
        'SELECT action, subject_kind FROM organization_audit ORDER BY id',
      )
      .all();
  } finally {
    sqlite.close();
  }
}

const audit = (id: string, action: string, kind: string) =>
  `INSERT INTO organization_audit (id, organization_id, actor_id, action, subject_kind, subject_id, detail, created_at) VALUES ('${id}', 'org-a', 'operator:dany', '${action}', '${kind}', 'org-a', '{}', 1)`;

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

/**
 * The audit vocabulary widening for the operator's limits CLI
 * (`wbs-organization-limits` task 5.1, design L13), over the real migration folder.
 */
describe(LIMITS_AUDIT, () => {
  it('admits the limits action and kind, and the outgoing release keeps writing', () => {
    const { dbPath } = migratedStore();
    run(dbPath, [
      audit('a1', 'organization_limits_changed', 'organization_limits'),
      audit('a2', 'session_policy_changed', 'session_policy'),
      audit('a3', 'machine_credential_created', 'machine_credential'),
      audit('a4', 'restricted_project_recovery', 'project'),
    ]);
    expect(auditRows(dbPath)).toHaveLength(4);
  });

  it('still refuses an unknown action or kind, and stays append-only', () => {
    const { dbPath } = migratedStore();
    expect(() => {
      run(dbPath, [audit('x1', 'organization_limits_teleported', 'organization_limits')]);
    }).toThrow(/CHECK/);
    expect(() => {
      run(dbPath, [audit('x2', 'organization_limits_changed', 'organization_limit')]);
    }).toThrow(/CHECK/);
    run(dbPath, [audit('a1', 'organization_limits_changed', 'organization_limits')]);
    expect(() => {
      run(dbPath, ['UPDATE organization_audit SET detail = \'{"x":1}\'']);
    }).toThrow(/append-only/);
    expect(() => {
      run(dbPath, ['DELETE FROM organization_audit']);
    }).toThrow(/append-only/);
  });

  it('rolls back over outgoing-release rows and comes forward again', async () => {
    const { root, dbPath } = migratedStore();
    run(dbPath, [audit('a2', 'session_policy_changed', 'session_policy')]);
    const down = await rollBack(root, dbPath, ORGANIZATION_LIMITS);
    expect(down.stderr).toBe('');
    expect(down.exitCode).toBe(0);
    expect(down.stdout).toContain(
      `rolled back: ${SHARED_OCCUPANCY}, ${WORK_ITEM_BUDGETS}, ${MEASURE_ESTIMATES}, ${MEASURE_FACTS}, ${MEASURE}, ${CLAIM_LEASE}, ${COMPUTE_PROVIDERS}, ${LIMITS_AUDIT}\n`,
    );
    expect(auditRows(dbPath)).toEqual([
      { action: 'session_policy_changed', subject_kind: 'session_policy' },
    ]);
    expect(() => {
      run(dbPath, [audit('a1', 'organization_limits_changed', 'organization_limits')]);
    }).toThrow(/CHECK/);
    run(dbPath, [audit('a3', 'machine_credential_created', 'machine_credential')]);
    expect(() => {
      run(dbPath, ['DELETE FROM organization_audit']);
    }).toThrow(/append-only/);
    runMigrations(dbPath, join(root, 'drizzle'));
    run(dbPath, [audit('a1', 'organization_limits_changed', 'organization_limits')]);
    expect(auditRows(dbPath)).toHaveLength(3);
  }, 60_000);

  // Proof: the new-vocabulary filter in `down.sql` replaced by `WHERE 0`
  // made this fail on the narrow table's CHECK instead of the named guard;
  // watched 2026-10-22.
  it('refuses rollback over one organization limits audit row, keeping it', async () => {
    const { root, dbPath } = migratedStore();
    run(dbPath, [audit('a1', 'organization_limits_changed', 'organization_limits')]);
    const down = await rollBack(root, dbPath, ORGANIZATION_LIMITS);
    expect(down.exitCode).not.toBe(0);
    expect(down.stderr).toContain('organization limits audit rows exist');
    expect(auditRows(dbPath)).toEqual([
      { action: 'organization_limits_changed', subject_kind: 'organization_limits' },
    ]);
  }, 60_000);
});
