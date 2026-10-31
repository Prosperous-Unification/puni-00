import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openDatabase } from '@wbs/store-sqlite/db';
import { runMigrations } from '@wbs/store-sqlite/migrate';
import { afterEach, describe, expect, it } from 'bun:test';

const APP_ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const MIGRATIONS = join(APP_ROOT, 'drizzle');
const PERSON_ACCOUNT = '20261019130000_add_person_account';
const IDENTITY_PERSON = '20261019130100_add_external_identity_person';
/** Newer than both, empty here, so they reverse first on every rollback below them. */
const RESOURCES = '20261020120000_add_resources';
const OCCUPANCY = '20261020130000_add_claim_occupancy';
const MACHINE_CREDENTIAL = '20261022100000_add_machine_credential';
const AUDIT_WIDENING = '20261022110000_widen_organization_audit_machine_credentials';
const ID_SHAPE = '20261022110100_check_machine_credential_id';
const AUDIENCE_SCOPE = '20261022120000_scope_trusted_issuer_audience';
/** The two compute-provider migrations newer than the organization limits, newest first. */
const COMPUTE_PROVIDERS =
  '20261022140100_widen_organization_audit_compute_providers, 20261022140000_add_resource_provider';
/** The organization limits migrations, which reverse after the compute providers. */
const ORGANIZATION_LIMITS = '20261022130000_add_organization_limits';
const MEASURE = '20261023140000_add_measure';
/** The measure-keyed facts, which reverse first over legacy facts alone. */
const MEASURE_FACTS = '20261023150000_key_step_measure';
const MEASURE_ESTIMATES = '20261023160000_add_measure_estimate';
const WORK_ITEM_BUDGETS = '20261023170000_add_work_item_budget';
const LIMITS_AUDIT = '20261022130100_widen_organization_audit_organization_limits';
const CLAIM_LEASE = '20261023100000_add_claim_lease';
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** The migration this pair rolls back to: the one immediately before `add_person_account`. */
function baseline(): string {
  const names = readdirSync(MIGRATIONS).sort();
  const at = names.indexOf(PERSON_ACCOUNT);
  const before = at < 1 ? undefined : names.at(at - 1);
  if (before === undefined) throw new Error(`${PERSON_ACCOUNT} has no predecessor on disk`);
  return before;
}

/** A store migrated through both additions, with one account, two persons and a credential. */
function migratedStore(): { root: string; dbPath: string } {
  const root = mkdtempSync(join(tmpdir(), 'wbs-person-account-'));
  roots.push(root);
  cpSync(MIGRATIONS, join(root, 'drizzle'), { recursive: true });
  const dbPath = join(root, 'plan.db');
  runMigrations(dbPath, join(root, 'drizzle'));
  const sqlite = openDatabase(dbPath);
  try {
    sqlite.run(
      "INSERT INTO users (id, username, password_hash, created_at) VALUES ('dany', 'dany', 'x', 1)",
    );
    sqlite.run(
      "INSERT INTO person (id, name, kind) VALUES ('claire', 'Claire', 'agent'), ('kat', 'Kat', 'person')",
    );
    sqlite.run(
      "INSERT INTO external_identity (id, user_id, issuer, subject, created_at) VALUES ('fleet', 'dany', 'https://idp.example/', 'm2m-claire', 1)",
    );
  } finally {
    sqlite.close();
  }
  return { root, dbPath };
}

function run(dbPath: string, sql: string): void {
  const sqlite = openDatabase(dbPath);
  try {
    sqlite.run(sql);
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
      .map(({ name }) => name);
  } finally {
    sqlite.close();
  }
}

function appliedNames(dbPath: string): string[] {
  const sqlite = openDatabase(dbPath);
  try {
    return sqlite
      .query<{ name: string }, []>('SELECT name FROM __drizzle_migrations ORDER BY created_at')
      .all()
      .map(({ name }) => name);
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

describe('person account and credential pin migrations', () => {
  it('add both nullable columns forward and remove them on an empty rollback', async () => {
    const { root, dbPath } = migratedStore();
    expect(columnsOf(dbPath, 'person')).toContain('account_id');
    expect(columnsOf(dbPath, 'external_identity')).toContain('person_id');
    run(dbPath, "UPDATE person SET account_id = 'dany' WHERE id = 'claire'");
    run(dbPath, "UPDATE person SET account_id = 'dany' WHERE id = 'kat'");
    run(dbPath, "UPDATE external_identity SET person_id = 'claire' WHERE id = 'fleet'");
    expect(() => {
      run(dbPath, "UPDATE person SET account_id = 'nobody' WHERE id = 'kat'");
    }).toThrow(/FOREIGN KEY/);
    expect(() => {
      run(dbPath, "UPDATE external_identity SET person_id = 'nobody' WHERE id = 'fleet'");
    }).toThrow(/FOREIGN KEY/);
    run(dbPath, 'UPDATE external_identity SET person_id = NULL');
    run(dbPath, 'UPDATE person SET account_id = NULL');

    const down = await rollBack(root, dbPath, baseline());
    expect(down.stderr).toBe('');
    expect(down.exitCode).toBe(0);
    expect(down.stdout).toContain(
      `rolled back: 20261028100100_widen_organization_audit_agent_pools, 20261028100000_add_agent_pool, 20261026130000_widen_organization_audit_machine_tokens, 20261026120000_add_command_journal_person, 20261025130000_add_resource_runtime, 20261025120000_add_resource_use, ${WORK_ITEM_BUDGETS}, ${MEASURE_ESTIMATES}, ${MEASURE_FACTS}, ${MEASURE}, ${CLAIM_LEASE}, ${COMPUTE_PROVIDERS}, ${LIMITS_AUDIT}, ${ORGANIZATION_LIMITS}, 20261022121000_add_runtime_commands, ${AUDIENCE_SCOPE}, ${ID_SHAPE}, ${AUDIT_WIDENING}, ${MACHINE_CREDENTIAL}, ${OCCUPANCY}, ${RESOURCES}, ${IDENTITY_PERSON}, ${PERSON_ACCOUNT}`,
    );
    expect(columnsOf(dbPath, 'person')).not.toContain('account_id');
    expect(columnsOf(dbPath, 'external_identity')).not.toContain('person_id');
    expect(appliedNames(dbPath).at(-1)).toBe(baseline());

    runMigrations(dbPath, join(root, 'drizzle'));
    expect(columnsOf(dbPath, 'person')).toContain('account_id');
    expect(columnsOf(dbPath, 'external_identity')).toContain('person_id');
  }, 60_000);

  // Proof: the guard's INSERT in `add_person_account/down.sql` replaced with
  // `SELECT 0` made this exit 0 and drop `person.account_id` with both bindings
  // in it (watched 2026-10-19).
  it('refuses rollback while a person is bound, naming the count and the unbind', async () => {
    const { root, dbPath } = migratedStore();
    run(dbPath, "UPDATE person SET account_id = 'dany'");

    const down = await rollBack(root, dbPath, baseline());
    expect(down.exitCode).not.toBe(0);
    expect(down.stderr).toContain(`rolling back ${PERSON_ACCOUNT} failed`);
    expect(down.stderr).toContain(
      '2 people are bound to accounts; unbind each with a patchPerson command carrying accountId null',
    );
    expect(columnsOf(dbPath, 'person')).toContain('account_id');
    expect(appliedNames(dbPath).at(-1)).toBe(PERSON_ACCOUNT);
  }, 60_000);

  // Proof: the guard's INSERT in `add_external_identity_person/down.sql`
  // replaced with `SELECT 0` made this exit 0 and drop
  // `external_identity.person_id` with the pin in it (watched 2026-10-19).
  it('refuses rollback while a credential is pinned, naming the count and the unlink', async () => {
    const { root, dbPath } = migratedStore();
    run(dbPath, "UPDATE person SET account_id = 'dany' WHERE id = 'claire'");
    run(dbPath, "UPDATE external_identity SET person_id = 'claire'");

    const down = await rollBack(root, dbPath, PERSON_ACCOUNT);
    expect(down.exitCode).not.toBe(0);
    expect(down.stderr).toContain(`rolling back ${IDENTITY_PERSON} failed`);
    expect(down.stderr).toContain(
      '1 credentials are pinned to persons; unlink each with link-credential-cli.ts --unlink',
    );
    expect(columnsOf(dbPath, 'external_identity')).toContain('person_id');
    expect(appliedNames(dbPath).at(-1)).toBe(IDENTITY_PERSON);
  }, 60_000);
});
