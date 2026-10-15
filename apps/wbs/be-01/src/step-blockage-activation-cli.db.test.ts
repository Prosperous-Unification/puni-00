import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openReadOnlyConnection } from '@wbs/store-sqlite/db';
import { runMigrations } from '@wbs/store-sqlite/migrate';
import { afterEach, beforeEach, expect, setDefaultTimeout, test } from 'bun:test';

setDefaultTimeout(30_000);

const cli = new URL('./step-blockage-activation-cli.ts', import.meta.url).pathname;
const migrations = new URL('../drizzle', import.meta.url).pathname;
const receipt = {
  protocol: 'step-blockage-activation',
  version: 1,
  activationId: 'attended-attempt',
  candidateImage: `registry/be@sha256:${'a'.repeat(64)}`,
  rollbackImage: `registry/be@sha256:${'b'.repeat(64)}`,
  databaseIdentity: '/srv/wbs/plan.db:1:2',
  activatedAt: 1792051200000,
};
let directory: string;
let path: string;
let file: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'step-blockage-cli-'));
  path = join(directory, 'plan.db');
  file = join(directory, 'receipt.json');
  runMigrations(path, migrations);
  writeFileSync(file, JSON.stringify(receipt));
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

function run(args: string[], dbPath = path) {
  const env = { ...process.env };
  env['DB_PATH'] = dbPath;
  return Bun.spawnSync([process.execPath, cli, ...args], { env, stdout: 'pipe', stderr: 'pipe' });
}

function state() {
  const connection = openReadOnlyConnection(path);
  try {
    return connection.db.all('SELECT * FROM step_blockage_activation');
  } finally {
    connection.close();
  }
}

test('inspect leaves disabled authority and database bytes unchanged', () => {
  const bytes = readFileSync(path);
  const inspected = run(['inspect']);
  expect(inspected.exitCode).toBe(0);
  expect(JSON.parse(inspected.stdout.toString())).toEqual({ state: 'DISABLED', receipt: null });
  expect(readFileSync(path)).toEqual(bytes);
  expect(state()).toEqual([{ id: 1, state: 'DISABLED' }]);
});

test('image-local activate and exact retry return the durable receipt; conflict refuses', () => {
  for (let attempt = 0; attempt < 2; attempt++) {
    const activated = run(['activate', file]);
    expect(activated.exitCode).toBe(0);
    expect(JSON.parse(activated.stdout.toString())).toEqual({ state: 'ENABLED', receipt });
  }
  writeFileSync(file, JSON.stringify({ ...receipt, activationId: 'different' }));
  const conflict = run(['activate', file]);
  expect(conflict.exitCode).not.toBe(0);
  expect(conflict.stderr.toString()).toContain('conflicting');
  expect(JSON.parse(run(['inspect']).stdout.toString())).toEqual({ state: 'ENABLED', receipt });
});

for (const args of [
  [],
  ['inspect', 'extra'],
  ['activate'],
  ['activate', ''],
  ['enable', 'receipt'],
  ['activate', 'receipt', 'extra'],
]) {
  test(`refuses unexpected arguments ${JSON.stringify(args)}`, () => {
    const refused = run(args);
    expect(refused.exitCode).not.toBe(0);
    expect(refused.stderr.toString()).toContain('usage:');
    expect(state()).toEqual([{ id: 1, state: 'DISABLED' }]);
  });
}

test('refuses absent and empty DB_PATH', () => {
  const env = { ...process.env };
  delete env['DB_PATH'];
  const missing = Bun.spawnSync([process.execPath, cli, 'inspect'], {
    env,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(missing.exitCode).not.toBe(0);
  expect(missing.stderr.toString()).toContain('DB_PATH must be set');
  const empty = run(['inspect'], '');
  expect(empty.exitCode).not.toBe(0);
  expect(empty.stderr.toString()).toContain('DB_PATH must be set');
});

test('refuses a missing database without creating it', () => {
  const absent = join(directory, 'absent.db');
  for (const args of [['inspect'], ['activate', file]]) {
    expect(run(args, absent).exitCode).not.toBe(0);
    expect(existsSync(absent)).toBe(false);
  }
});

test('refuses unreadable database and receipt', () => {
  chmodSync(path, 0);
  try {
    for (const args of [['inspect'], ['activate', file]]) expect(run(args).exitCode).not.toBe(0);
  } finally {
    chmodSync(path, 0o600);
  }
  chmodSync(file, 0);
  try {
    expect(run(['activate', file]).exitCode).not.toBe(0);
  } finally {
    chmodSync(file, 0o600);
  }
  expect(state()).toEqual([{ id: 1, state: 'DISABLED' }]);
});

for (const content of [
  'not json',
  '{}',
  JSON.stringify({ ...receipt, candidateImage: 'mutable:tag' }),
]) {
  test(`refuses malformed receipt ${content}`, () => {
    writeFileSync(file, content);
    expect(run(['activate', file]).exitCode).not.toBe(0);
    expect(state()).toEqual([{ id: 1, state: 'DISABLED' }]);
  });
}

test('refuses an absent receipt file', () => {
  expect(run(['activate', join(directory, 'missing.json')]).exitCode).not.toBe(0);
  expect(state()).toEqual([{ id: 1, state: 'DISABLED' }]);
});

test('inspect accepts a read-only database while activation refuses it', () => {
  chmodSync(path, 0o400);
  try {
    expect(run(['inspect']).exitCode).toBe(0);
    expect(run(['activate', file]).exitCode).not.toBe(0);
  } finally {
    chmodSync(path, 0o600);
  }
  expect(state()).toEqual([{ id: 1, state: 'DISABLED' }]);
});

test('inspect refuses a write attempted by a broken inspection dependency', () => {
  const preload = join(directory, 'broken-inspection.ts');
  writeFileSync(
    preload,
    `import { mock } from 'bun:test';
mock.module('@wbs/store-sqlite/step-blockage-receipt', () => ({
  inspectStepBlockageReceipt(db) {
    db.run("UPDATE step_blockage_activation SET state='ENABLED'");
    throw new Error('broken inspection completed its write');
  },
  activateStepBlockages() { throw new Error('unexpected activation'); },
  parseStepBlockageReceipt() { throw new Error('unexpected receipt parse'); },
}));`,
  );
  const inspected = Bun.spawnSync([process.execPath, '--preload', preload, cli, 'inspect'], {
    env: { ...process.env, DB_PATH: path },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(inspected.exitCode).not.toBe(0);
  expect(inspected.stderr.toString()).toContain('readonly');
  expect(state()).toEqual([{ id: 1, state: 'DISABLED' }]);
});
