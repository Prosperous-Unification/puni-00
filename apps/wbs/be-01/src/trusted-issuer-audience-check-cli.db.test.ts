import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDatabase } from '@wbs/store-sqlite/db';
import { runMigrations } from '@wbs/store-sqlite/migrate';
import { afterEach, beforeEach, describe, expect, it, setDefaultTimeout } from 'bun:test';

const cli = new URL('./trusted-issuer-audience-check-cli.ts', import.meta.url).pathname;
const migrations = new URL('../drizzle', import.meta.url).pathname;
const SERVER = 'https://wbs.example/mcp/oauth';
/** Credential ids are lowercase UUIDs (a table trigger); these order as listed. */
const CREDENTIAL = {
  default: '00000000-0000-4000-8000-000000000001',
  narrowedGood: '00000000-0000-4000-8000-000000000002',
  narrowedBad: '00000000-0000-4000-8000-000000000003',
  revoked: '00000000-0000-4000-8000-000000000004',
} as const;
let directory: string;
let path: string;

// Each run spawns the CLI, about two seconds apiece.
setDefaultTimeout(30_000);

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'audience-check-cli-'));
  path = join(directory, 'plan.db');
  runMigrations(path, migrations);
  const database = openDatabase(path);
  try {
    database.run("INSERT INTO users (id, username, created_at) VALUES ('dany', 'dany', 1)");
    for (const id of ['org-a', 'org-b'])
      database.run('INSERT INTO organization (id, name, created_at) VALUES (?, ?, 1)', [id, id]);
    database.run("INSERT INTO person (id, name, kind) VALUES ('claire', 'claire', 'agent')");
    database.run(
      "INSERT INTO person_organization (resource_id, organization_id, name) VALUES ('claire', 'org-a', 'claire')",
    );
    database.run('PRAGMA wal_checkpoint(TRUNCATE)');
  } finally {
    database.close();
  }
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

function register(id: string, organizationId: string, audience: string): void {
  const database = openDatabase(path);
  try {
    database.run(
      `INSERT INTO organization_trusted_issuer (id, organization_id, issuer, jwks_uri, default_audience, created_at)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [id, organizationId, `https://ci-${id}.example`, `https://ci-${id}.example/jwks`, audience],
    );
    database.run('PRAGMA wal_checkpoint(TRUNCATE)');
  } finally {
    database.close();
  }
}

function credential(id: string, trustedIssuerId: string, audience: string | null): void {
  const database = openDatabase(path);
  try {
    database.run(
      `INSERT INTO machine_credential (id, organization_id, person_id, issued_by, source, name, issuer, subject, audience, trusted_issuer_id, created_at, created_by)
       VALUES (?, 'org-a', 'claire', 'dany', 'oidc', ?, 'https://ci.example', ?, ?, ?, 1, 'dany')`,
      [id, `name-${id}`, `subject-${id}`, audience, trustedIssuerId],
    );
    database.run('PRAGMA wal_checkpoint(TRUNCATE)');
  } finally {
    database.close();
  }
}

function run(env: Record<string, string | undefined>, args: string[] = []) {
  const merged: Record<string, string | undefined> = {
    ...process.env,
    DB_PATH: path,
    WBS_MCP_AUTHORIZATION_SERVER: SERVER,
    WBS_ACCEPT_BREAKING_AUDIENCES: undefined,
    ...env,
  };
  const defined = Object.fromEntries(
    Object.entries(merged).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  const ran = Bun.spawnSync([process.execPath, cli, ...args], {
    cwd: directory,
    env: defined,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return { exitCode: ran.exitCode, stdout: ran.stdout.toString(), stderr: ran.stderr.toString() };
}

function listed(stdout: string): { kind: string; id: string }[] {
  const check = JSON.parse(stdout) as { unaccepted: { kind: string; id: string }[] };
  return check.unaccepted.map(({ kind, id }) => ({ kind, id }));
}

describe('the trusted issuer audience preflight', () => {
  it('lists a wbs:org registration and its credentials, changes nothing, and exits non-zero', () => {
    register('ti-legacy', 'org-a', 'wbs:org:org-a');
    register('ti-good', 'org-b', `${SERVER}/org/org-b`);
    credential(CREDENTIAL.default, 'ti-legacy', null);
    credential(CREDENTIAL.narrowedGood, 'ti-legacy', `${SERVER}/deploy`);
    credential(CREDENTIAL.narrowedBad, 'ti-good', 'deploy');
    const before = readFileSync(path);
    const ran = run({});
    expect(ran.exitCode).toBe(3);
    expect(listed(ran.stdout)).toEqual([
      { kind: 'registration', id: 'ti-legacy' },
      { kind: 'credential', id: CREDENTIAL.default },
      { kind: 'credential', id: CREDENTIAL.narrowedBad },
    ]);
    expect(ran.stderr).toContain('registration ti-legacy');
    expect(readFileSync(path)).toEqual(before);
  });

  it('exits 0 when every listed row is accepted, and only by its own id', () => {
    register('ti-legacy', 'org-a', 'wbs:org:org-a');
    credential(CREDENTIAL.default, 'ti-legacy', null);
    const partly = run({ WBS_ACCEPT_BREAKING_AUDIENCES: 'ti-legacy' });
    expect(partly.exitCode).toBe(3);
    expect(listed(partly.stdout)).toEqual([{ kind: 'credential', id: CREDENTIAL.default }]);
    const wholly = run({ WBS_ACCEPT_BREAKING_AUDIENCES: `ti-legacy,${CREDENTIAL.default}` });
    expect(wholly.exitCode).toBe(0);
    expect(listed(wholly.stdout)).toEqual([]);
  });

  it('lists what a changed issuer would break', () => {
    register('ti-good', 'org-a', `${SERVER}/org/org-a`);
    expect(run({}).exitCode).toBe(0);
    const moved = run({ WBS_MCP_AUTHORIZATION_SERVER: 'https://wbs.example/mcp2/oauth' });
    expect(moved.exitCode).toBe(3);
    expect(listed(moved.stdout)).toEqual([{ kind: 'registration', id: 'ti-good' }]);
  });

  it('ignores a revoked credential', () => {
    register('ti-good', 'org-a', `${SERVER}/org/org-a`);
    credential(CREDENTIAL.revoked, 'ti-good', 'deploy');
    const database = openDatabase(path);
    try {
      database.run('UPDATE machine_credential SET revoked_at = 2 WHERE id = ?', [
        CREDENTIAL.revoked,
      ]);
      database.run('PRAGMA wal_checkpoint(TRUNCATE)');
    } finally {
      database.close();
    }
    expect(run({}).exitCode).toBe(0);
  });

  it('refuses arguments before opening the database', () => {
    const ran = run({ DB_PATH: join(directory, 'absent.db') }, ['--apply']);
    expect(ran.exitCode).not.toBe(0);
    expect(ran.stdout).toBe('');
    expect(ran.stderr).toContain('usage:');
  });

  it('refuses a missing or non-canonical authorization server, and a malformed accept list', () => {
    for (const env of [
      { WBS_MCP_AUTHORIZATION_SERVER: undefined },
      { WBS_MCP_AUTHORIZATION_SERVER: `${SERVER}/` },
      { WBS_ACCEPT_BREAKING_AUDIENCES: 'ti-a,,ti-b' },
    ]) {
      const ran = run(env);
      expect(ran.exitCode).not.toBe(0);
      expect(ran.exitCode).not.toBe(3);
      expect(ran.stdout).toBe('');
    }
  });

  it('passes a store the trusted issuer migration has not reached', () => {
    const before = join(directory, 'before.db');
    const staged = join(directory, 'drizzle');
    mkdirSync(staged);
    for (const name of readdirSync(migrations))
      if (name < '20261022100000_add_machine_credential')
        cpSync(join(migrations, name), join(staged, name), { recursive: true });
    runMigrations(before, staged);
    const ran = run({ DB_PATH: before });
    expect(ran.exitCode).toBe(0);
    expect(JSON.parse(ran.stdout)).toEqual({
      authorizationServer: SERVER,
      notMigrated: '20261022100000_add_machine_credential',
      breaking: [],
      unaccepted: [],
    });
  });

  it('refuses a trusted issuer table the ledger does not record', () => {
    const database = openDatabase(path);
    try {
      database.run(
        "DELETE FROM __drizzle_migrations WHERE name = '20261022100000_add_machine_credential'",
      );
    } finally {
      database.close();
    }
    const ran = run({});
    expect(ran.exitCode).not.toBe(0);
    expect(ran.exitCode).not.toBe(3);
    expect(ran.stderr).toContain('the ledger lacks 20261022100000_add_machine_credential');
  });
});
