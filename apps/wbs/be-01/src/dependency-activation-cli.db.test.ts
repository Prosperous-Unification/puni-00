import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { inspectDependencyActivation } from '@wbs/store-sqlite/cross-project-dependency-activation';
import { openConnection, openReadOnlyConnection } from '@wbs/store-sqlite/db';
import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { afterEach, expect, it } from 'bun:test';

import { runMigrations } from './repository/migrate';

const CLI = new URL('./dependency-activation-cli.ts', import.meta.url).pathname;
const FOLDER = new URL('../drizzle', import.meta.url).pathname;
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function database(migrate = true): string {
  const directory = mkdtempSync(join(tmpdir(), 'dependency-inspect-'));
  directories.push(directory);
  const path = join(directory, 'plan.db');
  if (migrate) runMigrations(path, FOLDER);
  return path;
}
function inspect(path: string | undefined, args = ['inspect']) {
  const env = { ...process.env };
  delete env['DB_PATH'];
  if (path !== undefined) env['DB_PATH'] = path;
  return Bun.spawnSync([process.execPath, CLI, ...args], { env, cwd: tmpdir() });
}
function snapshot(path: string): Buffer {
  return readFileSync(path);
}
for (const enabled of [false, true])
  it(`reads ${enabled ? 'ENABLED empty' : 'DISABLED'} authority without mutation`, () => {
    const path = database();
    if (enabled) seedDependencyAuthority(path);
    const connection = openReadOnlyConnection(path);
    let expected;
    try {
      expected = inspectDependencyActivation(connection.db);
    } finally {
      connection.close();
    }
    const before = snapshot(path);
    const execution = inspect(path);
    expect(execution.exitCode).toBe(0);
    expect(execution.stderr.toString()).toBe('');
    expect(JSON.parse(execution.stdout.toString())).toEqual(expected);
    expect(snapshot(path)).toEqual(before);
  });
for (const args of [[], ['activate'], ['remove'], ['inspect', 'extra']])
  it(`refuses arguments ${JSON.stringify(args)}`, () => {
    const execution = inspect(database(), args);
    expect(execution.exitCode).not.toBe(0);
    expect(execution.stdout.toString()).toBe('');
  });
for (const path of [undefined, '', ' '])
  it(`requires explicit nonempty DB_PATH ${String(path)}`, () => {
    const execution = inspect(path);
    expect(execution.exitCode).not.toBe(0);
    expect(execution.stderr.toString()).toContain('requires explicit DB_PATH');
  });
it('refuses an absent database without creating it', () => {
  const path = database(false);
  expect(inspect(path).exitCode).not.toBe(0);
  expect(existsSync(path)).toBe(false);
});
it('refuses an unreadable database without mutation', () => {
  const path = database();
  const before = readFileSync(path);
  chmodSync(path, 0);
  try {
    expect(inspect(path).exitCode).not.toBe(0);
  } finally {
    chmodSync(path, 0o600);
  }
  expect(readFileSync(path)).toEqual(before);
});
for (const fault of [
  'DELETE FROM cross_project_dependency_activation',
  'DROP TABLE cross_project_dependency_activation_receipt',
  'DROP TABLE cross_project_dependency_activation',
  "PRAGMA ignore_check_constraints=ON; UPDATE cross_project_dependency_activation SET state='UNKNOWN'",
  "UPDATE cross_project_dependency_activation SET state='ENABLED'; INSERT INTO cross_project_dependency_activation_receipt VALUES (1,'{}')",
  'DROP TABLE __drizzle_migrations',
  "DELETE FROM __drizzle_migrations WHERE name='20261022212000_add_cross_project_dependency_activation'",
  "UPDATE cross_project_dependency_activation SET state='ENABLED'",
  "INSERT INTO cross_project_dependency_activation_receipt VALUES (1,'{}')",
  'DROP TRIGGER external_dependency_admit_update',
])
  it(`refuses corrupt authority without mutation: ${fault}`, () => {
    const path = database();
    const connection = openConnection(path);
    try {
      for (const statement of fault.split(';')) connection.db.run(statement);
    } finally {
      connection.close();
    }
    const before = snapshot(path);
    const execution = inspect(path);
    expect(execution.exitCode).not.toBe(0);
    expect(execution.stdout.toString()).toBe('');
    expect(snapshot(path)).toEqual(before);
  });

it('SQLite refuses a real write attempted by the inspector dependency', () => {
  const path = database();
  const preload = join(path, '..', 'write-inspector.ts');
  const inspector = new URL(
    '../../../../libs/wbs/adapters/store-sqlite/src/cross-project-dependency-activation.ts',
    import.meta.url,
  ).pathname;
  writeFileSync(
    preload,
    `import { mock } from 'bun:test';
import { inspectDependencyActivation as inspect } from ${JSON.stringify(inspector)};
mock.module('@wbs/store-sqlite/cross-project-dependency-activation', () => ({ inspectDependencyActivation(db) {
  db.run('CREATE TABLE forbidden_inspection_write (id INTEGER)');
  return inspect(db);
} }));`,
  );
  const before = readFileSync(path);
  const execution = Bun.spawnSync([process.execPath, '--preload', preload, CLI, 'inspect'], {
    env: { ...process.env, DB_PATH: path },
  });
  const connection = openReadOnlyConnection(path);
  try {
    expect(
      connection.db.all("SELECT name FROM sqlite_master WHERE name='forbidden_inspection_write'"),
    ).toEqual([]);
  } finally {
    connection.close();
  }
  expect(execution.exitCode).not.toBe(0);
  expect(execution.stderr.toString()).toContain('readonly');
  expect(readFileSync(path)).toEqual(before);
});
