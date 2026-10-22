import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { StoredTypedDependency } from '@wbs/core';
import { afterEach, beforeEach, expect, it } from 'bun:test';

import {
  inspectDependencyActivation,
  readDependencyAuthoring,
} from './cross-project-dependency-activation';
import { openConnection, SQLiteError } from './db';
import { OPEN } from './gate';
import { runMigrations } from './migrate';
import { rollbackTo } from './migrate-down';
import { openSqliteSource } from './source';
import { TypedDependencyRepository } from './typed-dependency';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const MIGRATION = '20261022212000_add_cross_project_dependency_activation';
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
  directory = mkdtempSync(join(tmpdir(), 'wbs-dependency-authority-'));
  path = join(directory, 'plan.db');
  runMigrations(path, FOLDER);
  connection = openConnection(path);
});
afterEach(() => {
  connection.close();
  rmSync(directory, { recursive: true, force: true });
});
function seed(): void {
  connection.db.run(
    "INSERT INTO users(id,username,password_hash,created_at) VALUES ('u','owner','x',1)",
  );
  connection.db.run("INSERT INTO organization(id,name,created_at) VALUES ('org','Org',1)");
  for (const id of ['a', 'b', 'b2']) {
    if (id !== 'b2') {
      connection.db.run(
        `INSERT INTO project(id,name,owner_id,created_at) VALUES ('${id}','${id}','u',1)`,
      );
      connection.db.run(
        `INSERT INTO project_organization(resource_id,organization_id) VALUES ('${id}','org')`,
      );
    }
    connection.db.run(
      `INSERT INTO work_item(id,project_id,name,position,revision) VALUES ('${id}','${id === 'b2' ? 'b' : id}','${id}',1,0)`,
    );
  }
}
function link(): StoredTypedDependency {
  return {
    id: 'edge',
    projectId: 'b',
    predecessor: { projectId: 'a', scope: 'whole', workItemId: 'a' },
    successor: { projectId: 'b', scope: 'whole', workItemId: 'b' },
    type: 'FS',
  };
}
function snapshot(): unknown[] {
  return [
    'external_dependency',
    'typed_dependency',
    'project',
    'work_item',
    'command_journal',
    'event_log',
    'event_sequencer',
  ].map((table) => connection.db.all(`SELECT * FROM ${table}`));
}
/** Synthetic persisted authority exercises storage semantics only; it proves no participant fence. */
function enable(): void {
  connection.db.run(
    `INSERT INTO cross_project_dependency_activation_receipt VALUES (1,'${JSON.stringify(RECEIPT)}')`,
  );
  connection.db.run("UPDATE cross_project_dependency_activation SET state='ENABLED'");
}
it('migrates to durable disabled authority and rereads on every authoring access', () => {
  expect(inspectDependencyActivation(connection.db)).toEqual({ state: 'DISABLED', receipt: null });
  const authoring = readDependencyAuthoring(connection.db);
  expect(authoring.state).toBe('inactive');
  connection.db.run('DELETE FROM cross_project_dependency_activation');
  expect(() => authoring.state).toThrow();
});
it('restarts without changing disabled authority or existing local audit', async () => {
  seed();
  const repository = new TypedDependencyRepository(connection.db, OPEN);
  await repository.add(
    { ...link(), predecessor: { projectId: 'b', scope: 'whole', workItemId: 'b2' } },
    { at: 2, by: 'u' },
  );
  const before = snapshot();
  runMigrations(path, FOLDER);
  expect(snapshot()).toEqual(before);
  expect(inspectDependencyActivation(connection.db)).toEqual({ state: 'DISABLED', receipt: null });
});
for (const action of ['insert', 'update', 'delete'] as const) {
  it(`refuses dormant repository ${action} atomically`, async () => {
    seed();
    const repository = new TypedDependencyRepository(connection.db, OPEN);
    if (action !== 'insert') {
      enable();
      await repository.add(link(), { at: 2, by: 'u' });
      connection.db.run("UPDATE cross_project_dependency_activation SET state='DISABLED'");
      connection.db.run('DELETE FROM cross_project_dependency_activation_receipt');
    }
    const before = snapshot();
    const write =
      action === 'insert'
        ? repository.add(link(), { at: 3, by: 'u' })
        : action === 'update'
          ? repository.update({ ...link(), type: 'SS' }, { at: 3, by: 'u' })
          : repository.remove('edge', { at: 3, by: 'u' });
    let observed: unknown;
    try {
      await write;
    } catch (failure) {
      observed = failure;
    }
    expect(nativeMessage(observed)).toBe('external_dependencies_inactive');
    expect(snapshot()).toEqual(before);
  });
}
for (const fault of [
  'DROP TABLE cross_project_dependency_activation',
  'DROP TABLE cross_project_dependency_activation_receipt',
  "DROP TABLE cross_project_dependency_activation; CREATE TABLE cross_project_dependency_activation(id,state); INSERT INTO cross_project_dependency_activation VALUES (1,'DISABLED'),(1,'DISABLED')",
  `DELETE FROM __drizzle_migrations WHERE name='${MIGRATION}'`,
  'DELETE FROM cross_project_dependency_activation',
  'PRAGMA ignore_check_constraints=ON; UPDATE cross_project_dependency_activation SET id=2',
  "PRAGMA ignore_check_constraints=ON; UPDATE cross_project_dependency_activation SET state='UNKNOWN'",
  "DROP TABLE cross_project_dependency_activation; CREATE TABLE cross_project_dependency_activation(id,state); INSERT INTO cross_project_dependency_activation VALUES (1,'DISABLED')",
  "INSERT INTO cross_project_dependency_activation_receipt VALUES (1,'{}')",
  "UPDATE cross_project_dependency_activation SET state='ENABLED'",
  'DROP TABLE cross_project_dependency_activation_receipt; CREATE TABLE cross_project_dependency_activation_receipt(id,receipt)',
]) {
  it(`refuses corrupt trusted authority: ${fault}`, () => {
    for (const statement of fault.split(';')) connection.db.run(statement);
    expect(() => inspectDependencyActivation(connection.db)).toThrow();
  });
}
for (const action of ['insert', 'update', 'delete']) {
  for (const altered of [false, true]) {
    it(`refuses ${altered ? 'altered' : 'missing'} ${action} trigger`, () => {
      connection.db.run(`DROP TRIGGER external_dependency_admit_${action}`);
      if (altered)
        connection.db.run(
          `CREATE TRIGGER external_dependency_admit_${action} BEFORE ${action.toUpperCase()} ON external_dependency BEGIN SELECT 1; END`,
        );
      expect(() => inspectDependencyActivation(connection.db)).toThrow(
        'invalid dependency activation triggers',
      );
    });
  }
}
it('refuses unreadable connection', () => {
  const closed = openConnection(path);
  closed.close();
  expect(() => inspectDependencyActivation(closed.db)).toThrow();
});
it('reads exact enabled receipt and refuses malformed persisted receipt', () => {
  enable();
  expect(inspectDependencyActivation(connection.db)).toEqual({
    state: 'ENABLED',
    receipt: RECEIPT,
  });
  connection.db.run("UPDATE cross_project_dependency_activation_receipt SET receipt='{}'");
  expect(() => inspectDependencyActivation(connection.db)).toThrow(
    'invalid dependency activation receipt',
  );
});
it('refuses enabled-empty rollback without losing authority or ledger', () => {
  enable();
  const ledger = connection.db.all('SELECT * FROM __drizzle_migrations');
  expect(() => rollbackTo(path, FOLDER, '20261022211000_add_external_dependencies')).toThrow(
    'dependency activation requires compatible recovery',
  );
  expect(connection.db.all('SELECT * FROM __drizzle_migrations')).toEqual(ledger);
  expect(inspectDependencyActivation(connection.db).state).toBe('ENABLED');
});
it('rolls dormant authority back without changing local rows', async () => {
  seed();
  const repository = new TypedDependencyRepository(connection.db, OPEN);
  await repository.add(
    { ...link(), predecessor: { projectId: 'b', scope: 'whole', workItemId: 'b2' } },
    { at: 2, by: 'u' },
  );
  const before = snapshot();
  rollbackTo(path, FOLDER, '20261022211000_add_external_dependencies');
  expect(snapshot()).toEqual(before);
});
it('refuses preexisting external rows atomically in the real migration runner', async () => {
  rollbackTo(path, FOLDER, '20261022211000_add_external_dependencies');
  seed();
  const repository = new TypedDependencyRepository(connection.db, OPEN);
  await repository.add(link(), { at: 2, by: 'u' });
  const before = snapshot();
  const ledger = connection.db.all('SELECT * FROM __drizzle_migrations');
  let observed: unknown;
  try {
    runMigrations(path, FOLDER);
  } catch (failure) {
    observed = failure;
  }
  expect(nativeMessage(observed)).toContain('external dependencies precede activation authority');
  expect(snapshot()).toEqual(before);
  expect(connection.db.all('SELECT * FROM __drizzle_migrations')).toEqual(ledger);
  expect(
    connection.db.all(
      "SELECT name FROM sqlite_master WHERE name='cross_project_dependency_activation'",
    ),
  ).toEqual([]);
});

function nativeMessage(failure: unknown): string {
  if (failure instanceof SQLiteError) return failure.message;
  if (failure instanceof Error) return nativeMessage(failure.cause);
  throw new Error('expected native SQLite failure');
}

for (const action of ['insert', 'update', 'delete'] as const) {
  for (const fault of [
    "UPDATE cross_project_dependency_activation SET state='DISABLED'",
    "DROP TABLE cross_project_dependency_activation; CREATE TABLE cross_project_dependency_activation(id,state); INSERT INTO cross_project_dependency_activation VALUES (1,'ENABLED'),(1,'ENABLED')",
    'DROP TABLE cross_project_dependency_activation_receipt; CREATE TABLE cross_project_dependency_activation_receipt(id,receipt); INSERT INTO cross_project_dependency_activation_receipt VALUES (1,\'{"protocol":"wbs-dependency-activation","version":1}\'),(1,\'{"protocol":"wbs-dependency-activation","version":1}\')',
    'DELETE FROM cross_project_dependency_activation',
    'PRAGMA ignore_check_constraints=ON; UPDATE cross_project_dependency_activation SET id=2',
    "PRAGMA ignore_check_constraints=ON; UPDATE cross_project_dependency_activation SET state='UNKNOWN'",
    'DELETE FROM cross_project_dependency_activation_receipt',
    'PRAGMA ignore_check_constraints=ON; UPDATE cross_project_dependency_activation_receipt SET id=2',
    "UPDATE cross_project_dependency_activation_receipt SET receipt='{}'",
    "UPDATE cross_project_dependency_activation_receipt SET receipt=json_set(receipt,'$.protocol','wrong')",
    "UPDATE cross_project_dependency_activation_receipt SET receipt=json_set(receipt,'$.version',2)",
  ]) {
    it(`independent ${action} writer refuses invalid authority: ${fault}`, async () => {
      seed();
      enable();
      if (action !== 'insert')
        await new TypedDependencyRepository(connection.db, OPEN).add(link(), { at: 2, by: 'u' });
      for (const statement of fault.split(';')) connection.db.run(statement);
      const before = snapshot();
      const repository = new TypedDependencyRepository(connection.db, OPEN);
      let observed: unknown;
      try {
        if (action === 'insert') await repository.add(link(), { at: 3, by: 'u' });
        else if (action === 'update')
          await repository.update({ ...link(), type: 'SS' }, { at: 3, by: 'u' });
        else await repository.remove('edge', { at: 3, by: 'u' });
      } catch (failure) {
        observed = failure;
      }
      expect(nativeMessage(observed)).toBe('external_dependencies_inactive');
      expect(snapshot()).toEqual(before);
    });
  }
}

for (const fault of [
  'DELETE FROM cross_project_dependency_activation',
  'PRAGMA ignore_check_constraints=ON; UPDATE cross_project_dependency_activation SET id=2',
  "PRAGMA ignore_check_constraints=ON; UPDATE cross_project_dependency_activation SET state='UNKNOWN'",
  "INSERT INTO cross_project_dependency_activation_receipt VALUES (1,'{}')",
  'DROP TABLE cross_project_dependency_activation',
  'DROP TABLE cross_project_dependency_activation_receipt',
]) {
  it(`rollback refuses corrupt authority without changing ledger: ${fault}`, () => {
    for (const statement of fault.split(';')) connection.db.run(statement);
    const ledger = connection.db.all('SELECT * FROM __drizzle_migrations');
    expect(() => rollbackTo(path, FOLDER, '20261022211000_add_external_dependencies')).toThrow();
    expect(connection.db.all('SELECT * FROM __drizzle_migrations')).toEqual(ledger);
  });
}

for (const table of [
  'cross_project_dependency_activation',
  'cross_project_dependency_activation_receipt',
]) {
  it(`rollback refuses replaced ${table} schema`, () => {
    connection.db.run(`DROP TABLE ${table}`);
    connection.db.run(
      `CREATE TABLE ${table} (id,${table.endsWith('_receipt') ? 'receipt' : 'state'})`,
    );
    if (!table.endsWith('_receipt'))
      connection.db.run(`INSERT INTO ${table} VALUES (1,'DISABLED')`);
    const ledger = connection.db.all('SELECT * FROM __drizzle_migrations');
    expect(() => rollbackTo(path, FOLDER, '20261022211000_add_external_dependencies')).toThrow();
    expect(connection.db.all('SELECT * FROM __drizzle_migrations')).toEqual(ledger);
  });
}

it('refuses wrong receipt identity even with a valid receipt body', () => {
  enable();
  connection.db.run('PRAGMA ignore_check_constraints=ON');
  connection.db.run('UPDATE cross_project_dependency_activation_receipt SET id=2');
  expect(() => inspectDependencyActivation(connection.db)).toThrow(
    'enabled dependency authority has no exact receipt',
  );
});

it('keeps local relationship add update and remove usable while disabled', async () => {
  seed();
  const repository = new TypedDependencyRepository(connection.db, OPEN);
  const local = {
    ...link(),
    predecessor: { projectId: 'b', scope: 'whole' as const, workItemId: 'b2' },
  };
  await repository.add(local, { at: 2, by: 'u' });
  await repository.update({ ...local, type: 'SS' }, { at: 3, by: 'u' });
  expect((await repository.listByProject('b')).at(0)?.type).toBe('SS');
  await repository.remove('edge', { at: 4, by: 'u' });
  expect(await repository.listByProject('b')).toEqual([]);
});

it('refuses dormant rollback with retained external rows and preserves the full ledger', async () => {
  seed();
  enable();
  await new TypedDependencyRepository(connection.db, OPEN).add(link(), { at: 2, by: 'u' });
  connection.db.run("UPDATE cross_project_dependency_activation SET state='DISABLED'");
  connection.db.run('DELETE FROM cross_project_dependency_activation_receipt');
  const before = snapshot();
  const ledger = connection.db.all('SELECT * FROM __drizzle_migrations');
  expect(() => rollbackTo(path, FOLDER, '20261022211000_add_external_dependencies')).toThrow();
  expect(snapshot()).toEqual(before);
  expect(connection.db.all('SELECT * FROM __drizzle_migrations')).toEqual(ledger);
});

it('rolls back earlier command writes through the real source unit of work', async () => {
  seed();
  const source = openSqliteSource({ dbPath: path });
  try {
    const before = snapshot();
    let observed: unknown;
    try {
      await source.uow.run(async ({ stores }) => {
        source.db.run("UPDATE project SET revision=revision+1,name='changed' WHERE id='b'");
        await stores.typedDependencies.add(link(), { at: 3, by: 'u' });
        return { commit: true, value: 'committed' };
      });
    } catch (failure) {
      observed = failure;
    }
    expect(nativeMessage(observed)).toBe('external_dependencies_inactive');
    expect(snapshot()).toEqual(before);
  } finally {
    await source.close();
  }
});

for (const statement of [
  'UPDATE cross_project_dependency_activation SET id=2',
  "UPDATE cross_project_dependency_activation SET state='UNKNOWN'",
  'UPDATE cross_project_dependency_activation SET state=NULL',
  "INSERT INTO cross_project_dependency_activation_receipt VALUES (2,'{}')",
  "INSERT INTO cross_project_dependency_activation_receipt VALUES (1,'malformed')",
  'INSERT INTO cross_project_dependency_activation_receipt VALUES (1,NULL)',
]) {
  it(`constrained authority refuses independent corruption: ${statement}`, () => {
    expect(() => connection.db.run(statement)).toThrow();
    expect(inspectDependencyActivation(connection.db)).toEqual({
      state: 'DISABLED',
      receipt: null,
    });
  });
}

it('refuses unknown marker state even with an exact receipt', () => {
  enable();
  connection.db.run('PRAGMA ignore_check_constraints=ON');
  connection.db.run("UPDATE cross_project_dependency_activation SET state='UNKNOWN'");
  expect(() => inspectDependencyActivation(connection.db)).toThrow(
    'invalid dependency activation marker',
  );
});
