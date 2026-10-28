import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDatabase } from '@wbs/store-sqlite/db';
import { runMigrations } from '@wbs/store-sqlite/migrate';
import { afterEach, beforeEach, describe, expect, it, setDefaultTimeout } from 'bun:test';

const cli = new URL('./mcp-service-settings-check-cli.ts', import.meta.url).pathname;
const migrations = new URL('../drizzle', import.meta.url).pathname;
const SETTINGS = {
  INTERNAL_AUTH_SECRET: 'internal-auth-secret-for-the-check-0123456789',
  MCP_BE_INTERNAL_SECRET: 'mcp-be-internal-secret-for-the-check-0123456789',
  WBS_MACHINE_GRANT_SIGNING_KEY_CURRENT: 'machine-grant-signing-key-for-the-check-0123456789',
  WBS_MCP_AUTHORIZATION_SERVER: 'https://wbs.example/mcp/oauth',
} as const;
let directory: string;
let path: string;

// Each run spawns the CLI, about two seconds apiece.
setDefaultTimeout(30_000);

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'mcp-settings-check-cli-'));
  path = join(directory, 'plan.db');
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

/** Migrates every folder ordered before `before`, or all of them. */
function migrate(before?: string): void {
  const staged = join(directory, 'drizzle');
  mkdirSync(staged);
  for (const name of readdirSync(migrations))
    if (before === undefined || name < before)
      cpSync(join(migrations, name), join(staged, name), { recursive: true });
  runMigrations(path, staged);
}

function sqlite(statement: string): void {
  const database = openDatabase(path);
  try {
    database.run(statement);
    database.run('PRAGMA wal_checkpoint(TRUNCATE)');
  } finally {
    database.close();
  }
}

function activate(): void {
  sqlite(
    "UPDATE organization_activation SET state = 'activated', activated_at = 5 WHERE singleton = 1",
  );
}

function run(env: Record<string, string | undefined>, args: string[] = []) {
  const merged: Record<string, string | undefined> = {
    ...process.env,
    DB_PATH: path,
    INTERNAL_AUTH_SECRET: undefined,
    MCP_BE_INTERNAL_SECRET: undefined,
    WBS_MACHINE_GRANT_SIGNING_KEY_CURRENT: undefined,
    WBS_MACHINE_GRANT_SIGNING_KEY_PREVIOUS: undefined,
    WBS_MCP_AUTHORIZATION_SERVER: undefined,
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

function reported(stdout: string): { activation: string; authorizationServer: string | null } {
  return JSON.parse(stdout) as { activation: string; authorizationServer: string | null };
}

describe('the machine grant settings preflight', () => {
  it('passes a pre-activation store without the settings, reporting them', () => {
    migrate();
    const ran = run({});
    expect(ran.exitCode).toBe(0);
    expect(JSON.parse(ran.stdout)).toEqual({
      activation: 'pre_activation',
      authorizationServer: null,
      missing: [
        'MCP_BE_INTERNAL_SECRET',
        'WBS_MACHINE_GRANT_SIGNING_KEY_CURRENT',
        'WBS_MCP_AUTHORIZATION_SERVER',
      ],
      invalid: [],
    });
  });

  it('refuses an activated store without a setting, naming it and not changing the store', () => {
    migrate();
    activate();
    const before = readFileSync(path);
    for (const name of Object.keys(SETTINGS).filter((key) => key !== 'INTERNAL_AUTH_SECRET')) {
      const ran = run({ ...SETTINGS, [name]: undefined });
      expect(ran.exitCode).toBe(4);
      expect(ran.stderr).toContain(`${name} is missing`);
      for (const value of Object.values(SETTINGS)) expect(ran.stderr).not.toContain(value);
    }
    expect(readFileSync(path)).toEqual(before);
  });

  it('refuses an activated store with a weak grant key', () => {
    migrate();
    activate();
    const ran = run({ ...SETTINGS, WBS_MACHINE_GRANT_SIGNING_KEY_CURRENT: 'a'.repeat(40) });
    expect(ran.exitCode).toBe(4);
    expect(ran.stderr).toContain('WBS_MACHINE_GRANT_SIGNING_KEY_CURRENT');
  });

  it('passes an activated store with every setting, reporting the server', () => {
    migrate();
    activate();
    const ran = run(SETTINGS);
    expect(ran.exitCode).toBe(0);
    expect(reported(ran.stdout)).toMatchObject({
      activation: 'activated',
      authorizationServer: SETTINGS.WBS_MCP_AUTHORIZATION_SERVER,
    });
  });

  it('reads a store the marker migration has not reached as not migrated', () => {
    migrate('20260927180000_add_organization_activation');
    const ran = run({});
    expect(ran.exitCode).toBe(0);
    expect(reported(ran.stdout).activation).toBe('not_migrated');
  });

  it('refuses a ledger that names the marker migration without its table', () => {
    migrate();
    sqlite('DROP TABLE organization_activation');
    const ran = run(SETTINGS);
    expect(ran.exitCode).not.toBe(0);
    expect(ran.stderr).toContain('organization activation marker is absent');
    expect(ran.stdout).toBe('');
  });

  it('refuses a store without a migration ledger', () => {
    migrate('20260927180000_add_organization_activation');
    sqlite('DROP TABLE __drizzle_migrations');
    const ran = run({});
    expect(ran.exitCode).not.toBe(0);
    expect(ran.stderr).toContain('__drizzle_migrations is absent');
  });

  it('refuses settings boot would refuse, whatever the activation', () => {
    migrate();
    const ran = run({ ...SETTINGS, MCP_BE_INTERNAL_SECRET: SETTINGS.INTERNAL_AUTH_SECRET });
    expect(ran.exitCode).not.toBe(0);
    expect(ran.stderr).toContain('must differ');
  });

  it('refuses arguments before opening the database', () => {
    const ran = run({ DB_PATH: join(directory, 'absent.db') }, ['--apply']);
    expect(ran.exitCode).not.toBe(0);
    expect(ran.stderr).toContain('usage:');
  });
});
