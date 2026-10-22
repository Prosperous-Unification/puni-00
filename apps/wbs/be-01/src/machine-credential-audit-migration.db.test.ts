import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openDatabase } from '@wbs/store-sqlite/db';
import { runMigrations } from '@wbs/store-sqlite/migrate';
import { afterEach, describe, expect, it } from 'bun:test';

const APP_ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const MIGRATIONS = join(APP_ROOT, 'drizzle');
const MACHINE_CREDENTIAL = '20261022100000_add_machine_credential';
const AUDIT_WIDENING = '20261022110000_widen_organization_audit_machine_credentials';
const ID_SHAPE = '20261022110100_check_machine_credential_id';
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A store migrated to the latest, with an organization, an account and an agent person. */
function migratedStore(): { root: string; dbPath: string } {
  const root = mkdtempSync(join(tmpdir(), 'wbs-machine-credential-audit-'));
  roots.push(root);
  cpSync(MIGRATIONS, join(root, 'drizzle'), { recursive: true });
  const dbPath = join(root, 'plan.db');
  runMigrations(dbPath, join(root, 'drizzle'));
  run(dbPath, [
    "INSERT INTO users (id, username, password_hash, created_at) VALUES ('dany', 'dany', 'x', 1)",
    "INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1)",
    "INSERT INTO person (id, name, kind, account_id) VALUES ('claire', 'Claire', 'agent', 'dany')",
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
  `INSERT INTO organization_audit (id, organization_id, actor_id, action, subject_kind, subject_id, detail, created_at) VALUES ('${id}', 'org-a', 'dany', '${action}', '${kind}', 'subject', '{}', 1)`;

const credential = (id: string) =>
  `INSERT INTO machine_credential (id, organization_id, person_id, issued_by, source, name, created_at) VALUES ('${id}', 'org-a', 'claire', 'dany', 'api_key', '${id}', 1)`;

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
 * The audit vocabulary widening for machine credentials and trusted issuers
 * (`wbs-machine-credentials` task 2.1, design A17), and the credential id's
 * UUID shape (task 2.5's note), over the real migration folder.
 */
describe(AUDIT_WIDENING, () => {
  it('admits the five new actions and two kinds, and the outgoing release keeps writing', () => {
    const { dbPath } = migratedStore();
    run(dbPath, [
      audit('a1', 'machine_credential_created', 'machine_credential'),
      audit('a2', 'machine_credential_rotated', 'machine_credential'),
      audit('a3', 'machine_credential_revoked', 'machine_credential'),
      audit('a4', 'trusted_issuer_registered', 'trusted_issuer'),
      audit('a5', 'trusted_issuer_removed', 'trusted_issuer'),
      audit('a6', 'restricted_project_recovery', 'project'),
      audit('a7', 'provisioning_token_issued', 'provisioning_token'),
    ]);
    expect(auditRows(dbPath)).toHaveLength(7);
  });

  it('still refuses an unknown action or kind, and stays append-only', () => {
    const { dbPath } = migratedStore();
    expect(() => {
      run(dbPath, [audit('x1', 'machine_credential_exported', 'machine_credential')]);
    }).toThrow(/CHECK/);
    expect(() => {
      run(dbPath, [audit('x2', 'machine_credential_created', 'api_key')]);
    }).toThrow(/CHECK/);
    run(dbPath, [audit('a1', 'machine_credential_created', 'machine_credential')]);
    expect(() => {
      run(dbPath, ['UPDATE organization_audit SET detail = \'{"x":1}\'']);
    }).toThrow(/append-only/);
    expect(() => {
      run(dbPath, ['DELETE FROM organization_audit']);
    }).toThrow(/append-only/);
  });

  it('rolls back over outgoing-release rows and comes forward again', async () => {
    const { root, dbPath } = migratedStore();
    run(dbPath, [audit('a6', 'restricted_project_recovery', 'project')]);
    const down = await rollBack(root, dbPath, MACHINE_CREDENTIAL);
    expect(down.stderr).toBe('');
    expect(down.exitCode).toBe(0);
    expect(down.stdout).toContain(`rolled back: ${ID_SHAPE}, ${AUDIT_WIDENING}`);
    expect(auditRows(dbPath)).toEqual([
      { action: 'restricted_project_recovery', subject_kind: 'project' },
    ]);
    expect(() => {
      run(dbPath, [audit('a1', 'machine_credential_created', 'machine_credential')]);
    }).toThrow(/CHECK/);
    expect(() => {
      run(dbPath, ['DELETE FROM organization_audit']);
    }).toThrow(/append-only/);
    runMigrations(dbPath, join(root, 'drizzle'));
    run(dbPath, [audit('a1', 'machine_credential_created', 'machine_credential')]);
    expect(auditRows(dbPath)).toHaveLength(2);
  }, 60_000);

  // Proof: the new-vocabulary filter in `down.sql` replaced by `WHERE 0`
  // made this fail on the narrow table's CHECK instead of the named guard;
  // watched 2026-10-22.
  it('refuses rollback over one machine credential audit row, keeping it', async () => {
    const { root, dbPath } = migratedStore();
    run(dbPath, [audit('a1', 'machine_credential_created', 'machine_credential')]);
    const down = await rollBack(root, dbPath, MACHINE_CREDENTIAL);
    expect(down.exitCode).not.toBe(0);
    expect(down.stderr).toContain('machine credential or trusted issuer audit rows exist');
    expect(auditRows(dbPath)).toEqual([
      { action: 'machine_credential_created', subject_kind: 'machine_credential' },
    ]);
  }, 60_000);
});

describe(ID_SHAPE, () => {
  // Proof: the insert trigger's WHEN replaced by `WHEN 0` made this store
  // the misplaced-hyphen id, which the older CHECK admits; watched 2026-10-22.
  it('refuses a credential id that is not a lowercase UUID', () => {
    const { dbPath } = migratedStore();
    for (const id of [
      '0000000000000-4000-8000-000000000001',
      '------------------------------------',
      'AAAAAAAA-0000-4000-8000-000000000001',
    ])
      expect(() => {
        run(dbPath, [credential(id)]);
      }).toThrow(/lowercase UUID/);
    const minted = crypto.randomUUID();
    run(dbPath, [credential(minted)]);
    expect(() => {
      run(dbPath, [
        `UPDATE machine_credential SET id = '${'-'.repeat(36)}' WHERE id = '${minted}'`,
      ]);
    }).toThrow(/lowercase UUID/);
  });
});
