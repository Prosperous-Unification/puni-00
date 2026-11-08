import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, it } from 'bun:test';

import {
  activateDependencies,
  inspectDependencyActivation,
} from './cross-project-dependency-activation';
import { openConnection } from './db';
import { runMigrations } from './migrate';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const RECEIPT = {
  protocol: 'wbs-dependency-activation',
  version: 1,
  activationId: 'attempt',
  databaseIdentity: 'db',
  candidateImage: `wbs@sha256:${'a'.repeat(64)}`,
  rollbackImage: `wbs@sha256:${'b'.repeat(64)}`,
  participantProofSha256: 'c'.repeat(64),
  migrationCaptureSha256: 'd'.repeat(64),
  activatedAt: 1,
} as const;
let directory: string;
let path: string;
let connection: ReturnType<typeof openConnection>;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'wbs-activation-write-'));
  path = join(directory, 'plan.db');
  runMigrations(path, FOLDER);
  connection = openConnection(path);
});
afterEach(() => {
  connection.close();
  rmSync(directory, { recursive: true, force: true });
});

it('atomically persists exact authority and permits identical retries with no live edges', () => {
  expect(activateDependencies(path, FOLDER, RECEIPT)).toEqual({
    state: 'ENABLED',
    receipt: RECEIPT,
  });
  expect(inspectDependencyActivation(connection.db)).toEqual({
    state: 'ENABLED',
    receipt: RECEIPT,
  });
  expect(connection.db.all('SELECT * FROM external_dependency')).toEqual([]);
  expect(activateDependencies(path, FOLDER, RECEIPT)).toEqual({
    state: 'ENABLED',
    receipt: RECEIPT,
  });
});

it('refuses a conflicting receipt and preserves enabled authority', () => {
  activateDependencies(path, FOLDER, RECEIPT);
  expect(() => activateDependencies(path, FOLDER, { ...RECEIPT, activationId: 'other' })).toThrow(
    'conflicting',
  );
  expect(inspectDependencyActivation(connection.db)).toEqual({
    state: 'ENABLED',
    receipt: RECEIPT,
  });
});

for (const [label, fault] of [
  [
    'receipt insert',
    "CREATE TRIGGER refuse_receipt BEFORE INSERT ON cross_project_dependency_activation_receipt BEGIN SELECT RAISE(ABORT,'injected receipt failure'); END",
  ],
  [
    'marker flip',
    "CREATE TRIGGER refuse_flip BEFORE UPDATE ON cross_project_dependency_activation BEGIN SELECT RAISE(ABORT,'injected flip failure'); END",
  ],
  [
    'receipt readback',
    "CREATE TRIGGER change_receipt AFTER INSERT ON cross_project_dependency_activation_receipt BEGIN UPDATE cross_project_dependency_activation_receipt SET receipt=json_set(receipt,'$.activationId','changed'); END",
  ],
  [
    'marker readback',
    'CREATE TRIGGER ignore_flip BEFORE UPDATE ON cross_project_dependency_activation BEGIN SELECT RAISE(IGNORE); END',
  ],
  [
    'disabled readback',
    "CREATE TRIGGER reset_authority AFTER UPDATE ON cross_project_dependency_activation WHEN NEW.state='ENABLED' BEGIN UPDATE cross_project_dependency_activation SET state='DISABLED'; DELETE FROM cross_project_dependency_activation_receipt; END",
  ],
] as const) {
  it(`rolls back both writes after ${label} failure`, () => {
    connection.db.run(fault);
    expect(() => activateDependencies(path, FOLDER, RECEIPT)).toThrow();
    expect(inspectDependencyActivation(connection.db)).toEqual({
      state: 'DISABLED',
      receipt: null,
    });
  });
}

for (const fault of [
  'DROP TABLE cross_project_dependency_activation_receipt',
  'DROP TABLE cross_project_dependency_activation',
  'DROP TABLE __drizzle_migrations',
  "UPDATE __drizzle_migrations SET hash='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' WHERE name='20261022212000_add_cross_project_dependency_activation'",
  "DELETE FROM __drizzle_migrations WHERE name='20261022211000_add_external_dependencies'",
  "UPDATE __drizzle_migrations SET hash='edited' WHERE name=(SELECT min(name) FROM __drizzle_migrations)",
  "UPDATE __drizzle_migrations SET name='unknown' WHERE name=(SELECT min(name) FROM __drizzle_migrations)",
  'INSERT INTO __drizzle_migrations(hash,created_at,name) SELECT hash,created_at,name FROM __drizzle_migrations LIMIT 1',
  'DELETE FROM __drizzle_migrations WHERE name=(SELECT min(name) FROM __drizzle_migrations)',
  'DROP TRIGGER external_dependency_admit_update',
  'DELETE FROM cross_project_dependency_activation',
  "UPDATE cross_project_dependency_activation SET state='ENABLED'",
] as const) {
  it(`refuses damaged trusted state: ${fault}`, () => {
    connection.db.run(fault);
    const before = connection.db.all('SELECT type,name,sql FROM sqlite_master ORDER BY name');
    expect(() => activateDependencies(path, FOLDER, RECEIPT)).toThrow();
    expect(connection.db.all('SELECT type,name,sql FROM sqlite_master ORDER BY name')).toEqual(
      before,
    );
  });
}

it('refuses an existing unconstrained replacement receipt table', () => {
  connection.db.run('DROP TABLE cross_project_dependency_activation_receipt');
  connection.db.run(
    'CREATE TABLE cross_project_dependency_activation_receipt(id INTEGER,receipt TEXT)',
  );
  expect(() => activateDependencies(path, FOLDER, RECEIPT)).toThrow(
    'invalid dependency activation schema',
  );
  expect(connection.db.all('SELECT * FROM cross_project_dependency_activation_receipt')).toEqual(
    [],
  );
  expect(connection.db.all('SELECT state FROM cross_project_dependency_activation')).toEqual([
    { state: 'DISABLED' },
  ]);
});

it('never creates an absent database', () => {
  const absent = join(directory, 'absent.db');
  expect(() => activateDependencies(absent, FOLDER, RECEIPT)).toThrow();
  expect(existsSync(absent)).toBe(false);
});

it('refuses an unreadable existing database', () => {
  chmodSync(path, 0);
  try {
    expect(() => activateDependencies(path, FOLDER, RECEIPT)).toThrow();
  } finally {
    chmodSync(path, 0o600);
  }
  expect(inspectDependencyActivation(connection.db)).toEqual({ state: 'DISABLED', receipt: null });
});

it('refuses malformed existing database bytes without replacing them', () => {
  const malformed = join(directory, 'malformed.db');
  writeFileSync(malformed, 'not SQLite');
  expect(() => activateDependencies(malformed, FOLDER, RECEIPT)).toThrow();
  expect(readFileSync(malformed, 'utf8')).toBe('not SQLite');
});

it('requires the external dependency identity even when omitted from both artifacts and ledger', () => {
  const staged = join(directory, 'migrations');
  mkdirSync(staged);
  const omitted = '20261022211000_add_external_dependencies';
  for (const name of readdirSync(FOLDER)) {
    if (name !== omitted) cpSync(join(FOLDER, name), join(staged, name), { recursive: true });
  }
  connection.db.run(`DELETE FROM __drizzle_migrations WHERE name='${omitted}'`);
  expect(() => activateDependencies(path, staged, RECEIPT)).toThrow('migration identities differ');
  expect(inspectDependencyActivation(connection.db)).toEqual({ state: 'DISABLED', receipt: null });
});

it('refuses an enabled malformed exact receipt without overwriting it', () => {
  activateDependencies(path, FOLDER, RECEIPT);
  connection.db.run(
    "UPDATE cross_project_dependency_activation_receipt SET receipt=json_set(receipt,'$.activatedAt',-1)",
  );
  const before = connection.db.all('SELECT * FROM cross_project_dependency_activation_receipt');
  expect(() => activateDependencies(path, FOLDER, RECEIPT)).toThrow(
    'invalid dependency activation receipt',
  );
  expect(connection.db.all('SELECT * FROM cross_project_dependency_activation_receipt')).toEqual(
    before,
  );
});
