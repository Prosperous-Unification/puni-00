import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
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
const AUDIENCE_SCOPE = '20261022120000_scope_trusted_issuer_audience';
const TABLES = ['organization_trusted_issuer', 'machine_credential', 'machine_credential_secret'];
const CREDENTIAL = '00000000-0000-4000-8000-000000000001';
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** The migration immediately before `add_machine_credential`. */
function baseline(): string {
  const names = readdirSync(MIGRATIONS).sort();
  const before = names.at(names.indexOf(MACHINE_CREDENTIAL) - 1);
  if (before === undefined || names.indexOf(MACHINE_CREDENTIAL) < 1)
    throw new Error(`${MACHINE_CREDENTIAL} has no predecessor on disk`);
  return before;
}

/** A store migrated to the latest, with an organization, an account and an agent person. */
function migratedStore(): { root: string; dbPath: string } {
  const root = mkdtempSync(join(tmpdir(), 'wbs-machine-credential-'));
  roots.push(root);
  cpSync(MIGRATIONS, join(root, 'drizzle'), { recursive: true });
  const dbPath = join(root, 'plan.db');
  runMigrations(dbPath, join(root, 'drizzle'));
  run(dbPath, [
    "INSERT INTO users (id, username, password_hash, created_at) VALUES ('dany', 'dany', 'x', 1)",
    "INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1)",
    "INSERT INTO person (id, name, kind, account_id) VALUES ('claire', 'Claire', 'agent', 'dany')",
    "INSERT INTO organization_trusted_issuer (id, organization_id, issuer, jwks_uri, default_audience, created_at) VALUES ('ti', 'org-a', 'https://token.example', 'https://token.example/jwks', 'wbs', 1)",
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

function tablesOf(dbPath: string): string[] {
  const sqlite = openDatabase(dbPath);
  try {
    return sqlite
      .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map(({ name }) => name);
  } finally {
    sqlite.close();
  }
}

const credential = (columns: string, values: string) =>
  `INSERT INTO machine_credential (id, organization_id, person_id, issued_by, name, created_at, ${columns}) VALUES ('${CREDENTIAL}', 'org-a', 'claire', 'dany', 'claire', 1, ${values})`;

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

describe(MACHINE_CREDENTIAL, () => {
  it('stores an API key and its secret digest, and refuses a malformed digest', () => {
    const { dbPath } = migratedStore();
    run(dbPath, [
      credential('source', "'api_key'"),
      `INSERT INTO machine_credential_secret (id, credential_id, digest, created_at) VALUES ('s1', '${CREDENTIAL}', '${'a'.repeat(64)}', 1)`,
    ]);
    expect(() => {
      run(dbPath, [
        `INSERT INTO machine_credential_secret (id, credential_id, digest, created_at) VALUES ('s3', '${CREDENTIAL}', 'not-a-digest', 1)`,
      ]);
    }).toThrow(/CHECK/);
  });

  // Proof: the per-source CHECK replaced by `CHECK (1)` made this store an
  // API key carrying a subject; watched 2026-10-22.
  it('refuses a credential whose columns contradict its source', () => {
    const { dbPath } = migratedStore();
    for (const [columns, values] of [
      ['source, subject', "'api_key', 'repo:acme/wbs'"],
      ['source, issuer, subject', "'oidc', 'https://token.example', 'repo:acme/wbs'"],
      ['source, mcp_family_id, subject', "'mcp_consent', 'family-1', 'x'"],
      ['source', "'auth0'"],
    ])
      expect(() => {
        run(dbPath, [credential(columns, values)]);
      }).toThrow(/CHECK/);
    expect(() => {
      run(dbPath, [
        "INSERT INTO machine_credential (id, organization_id, person_id, issued_by, name, created_at, source) VALUES ('NOT-A-UUID', 'org-a', 'claire', 'dany', 'x', 1, 'api_key')",
      ]);
    }).toThrow(/CHECK|lowercase UUID/);
  });

  // Proof: the partial pair index made non-unique made this store the second
  // credential; watched 2026-10-22. Since `20261022120000_scope_trusted_issuer_audience`
  // the pair is held per trusted issuer (`machine_credential_trusted_subject`).
  it('keeps one OIDC pair on one credential', () => {
    const { dbPath } = migratedStore();
    run(dbPath, [
      credential(
        'source, issuer, subject, trusted_issuer_id',
        "'oidc', 'https://token.example', 'repo:acme/wbs', 'ti'",
      ),
    ]);
    expect(() => {
      run(dbPath, [
        "INSERT INTO machine_credential (id, organization_id, person_id, issued_by, name, created_at, source, issuer, subject, trusted_issuer_id) VALUES ('00000000-0000-4000-8000-000000000002', 'org-a', 'claire', 'dany', 'second', 1, 'oidc', 'https://token.example', 'repo:acme/wbs', 'ti')",
      ]);
    }).toThrow(/UNIQUE/);
  });

  it('rolls back when empty and comes forward again', async () => {
    const { root, dbPath } = migratedStore();
    run(dbPath, ['DELETE FROM organization_trusted_issuer']);
    const down = await rollBack(root, dbPath, baseline());
    expect(down.stderr).toBe('');
    expect(down.exitCode).toBe(0);
    expect(down.stdout).toContain(
      `rolled back: ${AUDIENCE_SCOPE}, ${ID_SHAPE}, ${AUDIT_WIDENING}, ${MACHINE_CREDENTIAL}`,
    );
    for (const table of TABLES) expect(tablesOf(dbPath)).not.toContain(table);
    runMigrations(dbPath, join(root, 'drizzle'));
    for (const table of TABLES) expect(tablesOf(dbPath)).toContain(table);
  }, 60_000);

  // Proof: the guard's INSERT in `down.sql` replaced by one inserting 0 made
  // this exit 0 and drop the credential with its table; watched 2026-10-22.
  it('refuses rollback while one credential exists, keeping it', async () => {
    const { root, dbPath } = migratedStore();
    run(dbPath, ['DELETE FROM organization_trusted_issuer', credential('source', "'api_key'")]);
    const down = await rollBack(root, dbPath, baseline());
    expect(down.exitCode).not.toBe(0);
    expect(down.stderr).toContain('machine credentials or trusted issuers exist');
    const sqlite = openDatabase(dbPath);
    try {
      expect(sqlite.query('SELECT id FROM machine_credential').all()).toEqual([{ id: CREDENTIAL }]);
    } finally {
      sqlite.close();
    }
  }, 60_000);

  it('refuses rollback while a trusted issuer exists', async () => {
    const { root, dbPath } = migratedStore();
    const down = await rollBack(root, dbPath, baseline());
    expect(down.exitCode).not.toBe(0);
    expect(down.stderr).toContain('machine credentials or trusted issuers exist');
    expect(tablesOf(dbPath)).toContain('organization_trusted_issuer');
  }, 60_000);
});
