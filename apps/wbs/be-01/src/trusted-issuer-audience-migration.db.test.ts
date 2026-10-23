import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openDatabase } from '@wbs/store-sqlite/db';
import { runMigrations } from '@wbs/store-sqlite/migrate';
import { afterEach, describe, expect, it } from 'bun:test';

const APP_ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const MIGRATIONS = join(APP_ROOT, 'drizzle');
const ID_SHAPE = '20261022110100_check_machine_credential_id';
const AUDIENCE_SCOPE = '20261022120000_scope_trusted_issuer_audience';
/** The newer organization limits migrations, which reverse first. */
const ORGANIZATION_LIMITS = '20261022130000_add_organization_limits';
const MEASURE = '20261023140000_add_measure';
/** The measure-keyed facts, which reverse first over legacy facts alone. */
const MEASURE_FACTS = '20261023150000_key_step_measure';
const MEASURE_ESTIMATES = '20261023160000_add_measure_estimate';
const WORK_ITEM_BUDGETS = '20261023170000_add_work_item_budget';
const LIMITS_AUDIT = '20261022130100_widen_organization_audit_organization_limits';
const ISSUER = 'https://token.actions.githubusercontent.com';
const SUBJECT = 'repo:acme/wbs:ref:refs/heads/main';
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/**
 * A store migrated to the latest with organizations A and B, each with an
 * agent bound to its admin and a registration of one shared issuer URL under
 * its own audience.
 */
function migratedStore(): { root: string; dbPath: string } {
  const root = mkdtempSync(join(tmpdir(), 'wbs-trusted-issuer-audience-'));
  roots.push(root);
  cpSync(MIGRATIONS, join(root, 'drizzle'), { recursive: true });
  const dbPath = join(root, 'plan.db');
  runMigrations(dbPath, join(root, 'drizzle'));
  run(dbPath, [
    "INSERT INTO users (id, username, password_hash, created_at) VALUES ('ada', 'ada', 'x', 1), ('bob', 'bob', 'x', 1)",
    "INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1), ('org-b', 'B', 1)",
    "INSERT INTO person (id, name, kind, account_id) VALUES ('a-agent', 'A', 'agent', 'ada'), ('b-agent', 'B', 'agent', 'bob')",
    `INSERT INTO organization_trusted_issuer (id, organization_id, issuer, jwks_uri, default_audience, created_at) VALUES ('ti-a', 'org-a', '${ISSUER}', '${ISSUER}/.well-known/jwks', 'wbs:org:org-a', 1), ('ti-b', 'org-b', '${ISSUER}', '${ISSUER}/.well-known/jwks', 'wbs:org:org-b', 1)`,
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

/** An OIDC credential `n` of `organization` under trusted issuer `ti` for SUBJECT. */
const oidc = (n: number, organization: string, person: string, ti: string) =>
  `INSERT INTO machine_credential (id, organization_id, person_id, issued_by, name, created_at, source, issuer, subject, trusted_issuer_id) VALUES ('00000000-0000-4000-8000-00000000000${String(n)}', '${organization}', '${person}', '${person === 'a-agent' ? 'ada' : 'bob'}', 'c${String(n)}', 1, 'oidc', '${ISSUER}', '${SUBJECT}', '${ti}')`;

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

describe(AUDIENCE_SCOPE, () => {
  // Proof: the insert trigger's WHEN replaced by `WHEN 0` made this store a
  // trusted issuer with no audience; watched 2026-10-22.
  it('refuses a trusted issuer without an audience', () => {
    const { dbPath } = migratedStore();
    expect(() => {
      run(dbPath, [
        `INSERT INTO organization_trusted_issuer (id, organization_id, issuer, jwks_uri, created_at) VALUES ('ti-c', 'org-a', 'https://other.example', 'https://other.example/jwks', 1)`,
      ]);
    }).toThrow(/audience is required/);
    expect(() => {
      run(dbPath, [
        "UPDATE organization_trusted_issuer SET default_audience = NULL WHERE id = 'ti-a'",
      ]);
    }).toThrow(/audience is required/);
  });

  it('keeps one (issuer, audience) across the deployment', () => {
    const { dbPath } = migratedStore();
    expect(() => {
      run(dbPath, [
        `INSERT INTO organization_trusted_issuer (id, organization_id, issuer, jwks_uri, default_audience, created_at) VALUES ('ti-c', 'org-b', '${ISSUER}', '${ISSUER}/jwks', 'wbs:org:org-a', 1)`,
      ]);
    }).toThrow(/UNIQUE/);
  });

  // Proof: the subject index made non-unique made this store the second
  // credential under one trusted issuer; watched 2026-10-22.
  it('keeps one subject per trusted issuer, and lets two issuers share it', () => {
    const { dbPath } = migratedStore();
    run(dbPath, [oidc(1, 'org-a', 'a-agent', 'ti-a'), oidc(2, 'org-b', 'b-agent', 'ti-b')]);
    expect(() => {
      run(dbPath, [oidc(3, 'org-a', 'a-agent', 'ti-a')]);
    }).toThrow(/UNIQUE/);
  });

  it('rolls back when no subject is shared, and comes forward again', async () => {
    const { root, dbPath } = migratedStore();
    run(dbPath, [oidc(1, 'org-a', 'a-agent', 'ti-a')]);
    const down = await rollBack(root, dbPath, ID_SHAPE);
    expect(down.stderr).toBe('');
    expect(down.exitCode).toBe(0);
    expect(down.stdout).toContain(
      `rolled back: ${WORK_ITEM_BUDGETS}, ${MEASURE_ESTIMATES}, ${MEASURE_FACTS}, ${MEASURE}, ${LIMITS_AUDIT}, ${ORGANIZATION_LIMITS}, ${AUDIENCE_SCOPE}`,
    );
    runMigrations(dbPath, join(root, 'drizzle'));
  }, 60_000);

  // Proof: the guard's INSERT in `down.sql` replaced by one inserting 0 made
  // this fail on the bare unique index, the guard's message absent; watched
  // 2026-10-22.
  it('refuses rollback while two organizations bind one subject', async () => {
    const { root, dbPath } = migratedStore();
    run(dbPath, [oidc(1, 'org-a', 'a-agent', 'ti-a'), oidc(2, 'org-b', 'b-agent', 'ti-b')]);
    const down = await rollBack(root, dbPath, ID_SHAPE);
    expect(down.exitCode).not.toBe(0);
    expect(down.stderr).toContain('two OIDC machine credentials share an issuer and subject');
    const sqlite = openDatabase(dbPath);
    try {
      expect(sqlite.query('SELECT id FROM machine_credential').all()).toHaveLength(2);
    } finally {
      sqlite.close();
    }
  }, 60_000);
});
