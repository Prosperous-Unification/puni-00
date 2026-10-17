import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDatabase } from '@wbs/store-sqlite/db';
import { runMigrations } from '@wbs/store-sqlite/migrate';
import { afterEach, beforeEach, expect, test } from 'bun:test';

const cli = new URL('./organization-ownership-preflight-cli.ts', import.meta.url).pathname;
const migrations = new URL('../drizzle', import.meta.url).pathname;
const databaseModule = new URL(
  '../../../../libs/wbs/adapters/store-sqlite/src/db.ts',
  import.meta.url,
).pathname;
let directory: string;
let path: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ownership-preflight-cli-'));
  path = join(directory, 'plan.db');
  runMigrations(path, migrations);
  // Migrations seed external systems; keep these focused fixtures explicitly empty.
  const database = openDatabase(path);
  try {
    database.run('DELETE FROM external_system');
  } finally {
    database.close();
  }
});

afterEach(() => {
  chmodSync(path, 0o600);
  rmSync(directory, { recursive: true, force: true });
});

function run(args: string[] = [], dbPath = path, preload?: string) {
  const env = { ...process.env };
  env['DB_PATH'] = dbPath;
  return Bun.spawnSync(
    [process.execPath, ...(preload === undefined ? [] : ['--preload', preload]), cli, ...args],
    { cwd: directory, env, stdout: 'pipe', stderr: 'pipe' },
  );
}

function expectRefusal(invocation: ReturnType<typeof run>, message?: string): void {
  expect(invocation.exitCode).not.toBe(0);
  expect(invocation.stdout.toString()).toBe('');
  expect(invocation.stderr.toString().length).toBeGreaterThan(0);
  if (message !== undefined) expect(invocation.stderr.toString()).toContain(message);
}

test('prints complete JSON with findings and preserves database bytes', () => {
  const database = openDatabase(path);
  try {
    database.run("INSERT INTO tag (id, name) VALUES ('unmapped', 'Unmapped')");
    database.run('PRAGMA wal_checkpoint(TRUNCATE)');
  } finally {
    database.close();
  }
  const before = readFileSync(path);
  const invocation = run();
  expect(invocation.stderr.toString()).toBe('');
  expect(invocation.exitCode).toBe(0);
  expect(JSON.parse(invocation.stdout.toString())).toEqual({
    marker: 'pre_activation',
    unmappedRoots: [{ kind: 'tag', id: 'unmapped' }],
    catalogNameDrift: [],
    ownershipConflicts: [],
  });
  expect(readFileSync(path)).toEqual(before);
});

test('refuses unexpected arguments before opening the database', () => {
  expectRefusal(run(['activate'], join(directory, 'absent.db')), 'usage:');
});

test('refuses absent and empty DB_PATH from a clean cwd', () => {
  const env = { ...process.env };
  delete env['DB_PATH'];
  const missing = Bun.spawnSync([process.execPath, cli], {
    cwd: directory,
    env,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expectRefusal(missing, 'DB_PATH must be set');
  expectRefusal(run([], ''), 'DB_PATH must be set');
});

test('refuses a missing database without creating it', () => {
  const missing = join(directory, 'absent.db');
  expectRefusal(run([], missing));
  expect(existsSync(missing)).toBe(false);
});

test('refuses a permission-unreadable database without stdout', () => {
  chmodSync(path, 0);
  try {
    expectRefusal(run());
  } finally {
    chmodSync(path, 0o600);
  }
});

test('refuses invalid SQLite separately from file permission failure', () => {
  const garbage = join(directory, 'garbage.db');
  writeFileSync(garbage, Buffer.alloc(8192, 0x5a));
  expectRefusal(run([], garbage));
});

for (const [state, statement] of [
  ['absent', 'DROP TABLE organization_activation'],
  ['unreadable', 'ALTER TABLE organization_activation RENAME COLUMN state TO lost_state'],
  ['malformed', 'DELETE FROM organization_activation'],
]) {
  test(`refuses ${state} marker with no stdout`, () => {
    const database = openDatabase(path);
    try {
      database.run('DROP TRIGGER organization_activation_no_delete');
      database.run(statement);
    } finally {
      database.close();
    }
    expectRefusal(run(), `marker is ${state}`);
  });
}

test('refuses unavailable ownership query state despite a valid marker', () => {
  const database = openDatabase(path);
  try {
    database.run('ALTER TABLE tag_organization RENAME TO hidden_tag_organization');
  } finally {
    database.close();
  }
  expectRefusal(run(), 'tag_organization');
});

test('the actual connection opened by the CLI refuses an injected write', () => {
  const preload = join(directory, 'check-readonly.ts');
  const proof = join(directory, 'write-refused.txt');
  writeFileSync(
    preload,
    `
    import { spyOn } from 'bun:test';
    import { writeFileSync } from 'node:fs';
    import * as connections from ${JSON.stringify(databaseModule)};
    const readonlyOpen = connections.openReadOnlyConnection;
    const writableOpen = connections.openExistingConnection;
    function inspectConnection(connection) {
      let refused = false;
      try {
        connection.db.run('UPDATE organization_activation SET state = state');
      } catch (error) {
        if (!(error instanceof Error) ||
            !(error.cause instanceof connections.SQLiteError) ||
            error.cause.code !== 'SQLITE_READONLY') throw error;
        refused = true;
      }
      if (!refused) {
        connection.close();
        throw new Error('actual CLI connection accepted injected write');
      }
      writeFileSync(${JSON.stringify(proof)}, 'readonly refusal observed');
      return connection;
    }
    spyOn(connections, 'openReadOnlyConnection').mockImplementation((path) =>
      inspectConnection(readonlyOpen(path)));
    spyOn(connections, 'openExistingConnection').mockImplementation((path) =>
      inspectConnection(writableOpen(path)));
  `,
  );
  const invocation = run([], path, preload);
  expect(invocation.stderr.toString()).toBe('');
  expect(invocation.exitCode).toBe(0);
  expect(JSON.parse(invocation.stdout.toString())).toMatchObject({ marker: 'pre_activation' });
  expect(readFileSync(proof, 'utf8')).toBe('readonly refusal observed');
});
