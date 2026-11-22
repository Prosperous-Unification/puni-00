import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { StoredTypedDependency } from '@wbs/core';
import { expect, test } from 'bun:test';

import {
  inspectDependencyActivation,
  readDependencyAuthoring,
} from './cross-work-package-dependency-activation';
import { assertDependencyRollbackAdmitted } from './cross-work-package-dependency-rollback';
import { openConnection, openDatabase, SQLiteError } from './db';
import { OPEN } from './gate';
import { inspectLegacyDependencyActivation } from './legacy-dependency-activation';
import { runMigrations } from './migrate';
import {
  type AppliedMigration,
  readMigrationFolders,
  rollbackAppliedRows,
  rollbackTo,
} from './migrate-down';
import { openSqliteSource } from './source';
import { migrateEmptyCatalogueFixture } from './testing/catalogue-database';
import { CAPABLE_BACKEND_DEPENDENCY_CAPABILITY } from './testing/dependency-capability';
import { copyRecoveryPrefix } from './testing/recovery-state';
import { TypedDependencyRepository } from './typed-dependency';

const CURRENT = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
let migrations: string;
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
let path: string;
let connection: ReturnType<typeof openConnection>;
/** Each case opens its native connection only after its chosen migration owner settles.
 * A failed bootstrap, open or close leaves the directory intact.
 */
function registerCase(
  epoch: 'catalogue' | 'historical',
  name: string,
  check: () => void | Promise<void>,
) {
  test(name, async () => {
    const directory = mkdtempSync(join(tmpdir(), 'wbs-dependency-authority-'));
    path = join(directory, 'plan.db');
    if (epoch === 'catalogue') {
      migrations = CURRENT;
      migrateEmptyCatalogueFixture({ path, directory, reportedAt: 1 }, { hasUnknownOwner: false });
    } else {
      migrations = copyRecoveryPrefix(directory, '20261103110000_add_initial_access_offers');
      runMigrations(path, migrations);
    }
    connection = openConnection(path);
    try {
      await check();
    } finally {
      connection.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
const current = registerCase.bind(null, 'catalogue');
const historical = registerCase.bind(null, 'historical');

function seed(layout: 'catalogue' | 'historical' = 'catalogue'): void {
  connection.db.run(
    "INSERT INTO users(id,username,password_hash,created_at) VALUES ('u','owner','x',1)",
  );
  connection.db.run("INSERT INTO organization(id,name,created_at) VALUES ('org','Org',1)");
  if (layout === 'catalogue') {
    connection.db.run(
      "INSERT INTO project(id,name,organization_id,created_at) VALUES('parent','Parent','org',1)",
    );
    connection.db.run(
      "INSERT INTO work_package(id,name,created_by,project_id,created_at) VALUES('a','a','u','parent',1),('b','b','u','parent',1)",
    );
    connection.db.run(
      "INSERT INTO work_package_organization(resource_id,organization_id) VALUES('a','org'),('b','org')",
    );
    connection.db.run(
      "INSERT INTO work_item(id,work_package_id,name,position,revision) VALUES('a','a','a',1,0),('b','b','b',1,0),('b2','b','b2',1,0)",
    );
  } else {
    connection.db.run(
      "INSERT INTO project(id,name,owner_id,created_at) VALUES('a','a','u',1),('b','b','u',1)",
    );
    connection.db.run(
      "INSERT INTO project_organization(resource_id,organization_id) VALUES('a','org'),('b','org')",
    );
    connection.db.run(
      "INSERT INTO work_item(id,project_id,name,position,revision) VALUES('a','a','a',1,0),('b','b','b',1,0),('b2','b','b2',1,0)",
    );
  }
}
function link(): StoredTypedDependency {
  return {
    id: 'edge',
    workPackageId: 'b',
    predecessor: { workPackageId: 'a', scope: 'whole', workItemId: 'a' },
    successor: { workPackageId: 'b', scope: 'whole', workItemId: 'b' },
    type: 'FS',
  };
}
function snapshot(packageTable: 'project' | 'work_package' = 'work_package'): unknown[] {
  return [
    'external_dependency',
    'typed_dependency',
    packageTable,
    'work_item',
    'command_journal',
    'event_log',
    'event_sequencer',
  ].map((table) => connection.db.all(`SELECT * FROM ${table}`));
}
/** Complete schema, ledger and persisted table rows certifying a refused rollback. */
function rollbackCertificate(): unknown {
  const schema = connection.db.all<{ name: string; type: string; sql: string | null }>(
    'SELECT name,type,sql FROM sqlite_master ORDER BY type,name',
  );
  return {
    schema,
    tables: schema
      .filter((entry) => entry.type === 'table')
      .map(({ name }) => ({
        name,
        rows: connection.db.all(`SELECT * FROM "${name.replaceAll('"', '""')}"`),
      })),
  };
}

/** Synthetic persisted authority exercises storage semantics only; it proves no participant fence. */
function enable(
  marker:
    | 'cross_project_dependency_activation'
    | 'cross_work_package_dependency_activation' = 'cross_work_package_dependency_activation',
): void {
  connection.db.run(`INSERT INTO ${marker}_receipt VALUES (1,'${JSON.stringify(RECEIPT)}')`);
  connection.db.run(`UPDATE ${marker} SET state='ENABLED'`);
}
current('migrates to durable disabled authority and rereads on every authoring access', () => {
  expect(inspectDependencyActivation(connection.db)).toEqual({ state: 'DISABLED', receipt: null });
  const authoring = readDependencyAuthoring(connection.db);
  expect(authoring.state).toBe('inactive');
  connection.db.run('DELETE FROM cross_work_package_dependency_activation');
  expect(() => authoring.state).toThrow();
});
current('restarts without changing disabled authority or existing local audit', async () => {
  seed();
  const repository = new TypedDependencyRepository(connection.db, OPEN);
  await repository.add(
    { ...link(), predecessor: { workPackageId: 'b', scope: 'whole', workItemId: 'b2' } },
    { at: 2, by: 'u' },
  );
  const before = snapshot();
  runMigrations(path, migrations);
  expect(snapshot()).toEqual(before);
  expect(inspectDependencyActivation(connection.db)).toEqual({ state: 'DISABLED', receipt: null });
});
for (const action of ['insert', 'update', 'delete'] as const) {
  current(`refuses dormant repository ${action} atomically`, async () => {
    seed();
    const repository = new TypedDependencyRepository(connection.db, OPEN);
    if (action !== 'insert') {
      enable();
      await repository.add(link(), { at: 2, by: 'u' });
      connection.db.run("UPDATE cross_work_package_dependency_activation SET state='DISABLED'");
      connection.db.run('DELETE FROM cross_work_package_dependency_activation_receipt');
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
  'DROP TABLE cross_work_package_dependency_activation',
  'DROP TABLE cross_work_package_dependency_activation_receipt',
  "DROP TABLE cross_work_package_dependency_activation; CREATE TABLE cross_work_package_dependency_activation(id,state); INSERT INTO cross_work_package_dependency_activation VALUES (1,'DISABLED'),(1,'DISABLED')",
  `DELETE FROM __drizzle_migrations WHERE name='${MIGRATION}'`,
  'DELETE FROM cross_work_package_dependency_activation',
  'PRAGMA ignore_check_constraints=ON; UPDATE cross_work_package_dependency_activation SET id=2',
  "PRAGMA ignore_check_constraints=ON; UPDATE cross_work_package_dependency_activation SET state='UNKNOWN'",
  "DROP TABLE cross_work_package_dependency_activation; CREATE TABLE cross_work_package_dependency_activation(id,state); INSERT INTO cross_work_package_dependency_activation VALUES (1,'DISABLED')",
  "INSERT INTO cross_work_package_dependency_activation_receipt VALUES (1,'{}')",
  "UPDATE cross_work_package_dependency_activation SET state='ENABLED'",
  'DROP TABLE cross_work_package_dependency_activation_receipt; CREATE TABLE cross_work_package_dependency_activation_receipt(id,receipt)',
]) {
  current(`refuses corrupt trusted authority: ${fault}`, () => {
    for (const statement of fault.split(';')) connection.db.run(statement);
    expect(() => inspectDependencyActivation(connection.db)).toThrow();
  });
}
for (const action of ['insert', 'update', 'delete']) {
  for (const altered of [false, true]) {
    current(`refuses ${altered ? 'altered' : 'missing'} ${action} trigger`, () => {
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
current('refuses unreadable connection', () => {
  const closed = openConnection(path);
  closed.close();
  expect(() => inspectDependencyActivation(closed.db)).toThrow();
});
current('reads exact enabled receipt and refuses malformed persisted receipt', () => {
  enable();
  expect(inspectDependencyActivation(connection.db)).toEqual({
    state: 'ENABLED',
    receipt: RECEIPT,
  });
  connection.db.run("UPDATE cross_work_package_dependency_activation_receipt SET receipt='{}'");
  expect(() => inspectDependencyActivation(connection.db)).toThrow(
    'invalid dependency activation receipt',
  );
});
current('refuses enabled-empty rollback without losing authority or ledger', () => {
  enable();
  const ledger = connection.db.all('SELECT * FROM __drizzle_migrations');
  const certificate = rollbackCertificate();
  expect(() => rollbackTo(path, migrations, '20261022211000_add_external_dependencies')).toThrow(
    'dependency activation requires compatible recovery',
  );
  expect(connection.db.all('SELECT * FROM __drizzle_migrations')).toEqual(ledger);
  expect(rollbackCertificate()).toEqual(certificate);
  expect(inspectDependencyActivation(connection.db).state).toBe('ENABLED');
});
historical('rolls dormant authority back without changing local rows', () => {
  rollbackTo(path, migrations, MIGRATION);
  seed('historical');
  connection.db.run(
    "INSERT INTO typed_dependency(id,project_id,predecessor_work_item_id,predecessor_scope,successor_work_item_id,successor_scope,type,created_at,created_by) VALUES('edge','b','b2','whole','b','whole','FS',2,'u')",
  );
  const before = snapshot('project');
  rollbackTo(path, migrations, '20261022211000_add_external_dependencies');
  expect(snapshot('project')).toEqual(before);
});
historical('refuses preexisting external rows atomically in the real migration runner', () => {
  rollbackTo(path, migrations, '20261022211000_add_external_dependencies');
  seed('historical');
  connection.db.run(
    "INSERT INTO external_dependency(id,organization_id,predecessor_project_id,successor_project_id,predecessor_work_item_id,predecessor_scope,successor_work_item_id,successor_scope,type,created_at,created_by) VALUES('edge','org','a','b','a','whole','b','whole','FS',2,'u')",
  );
  const before = snapshot('project');
  const ledger = connection.db.all('SELECT * FROM __drizzle_migrations');
  const certificate = rollbackCertificate();
  let observed: unknown;
  try {
    runMigrations(path, migrations);
  } catch (failure) {
    observed = failure;
  }
  expect(nativeMessage(observed)).toContain('external dependencies precede activation authority');
  expect(snapshot('project')).toEqual(before);
  expect(connection.db.all('SELECT * FROM __drizzle_migrations')).toEqual(ledger);
  expect(rollbackCertificate()).toEqual(certificate);
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
    "UPDATE cross_work_package_dependency_activation SET state='DISABLED'",
    "DROP TABLE cross_work_package_dependency_activation; CREATE TABLE cross_work_package_dependency_activation(id,state); INSERT INTO cross_work_package_dependency_activation VALUES (1,'ENABLED'),(1,'ENABLED')",
    'DROP TABLE cross_work_package_dependency_activation_receipt; CREATE TABLE cross_work_package_dependency_activation_receipt(id,receipt); INSERT INTO cross_work_package_dependency_activation_receipt VALUES (1,\'{"protocol":"wbs-dependency-activation","version":1}\'),(1,\'{"protocol":"wbs-dependency-activation","version":1}\')',
    'DELETE FROM cross_work_package_dependency_activation',
    'PRAGMA ignore_check_constraints=ON; UPDATE cross_work_package_dependency_activation SET id=2',
    "PRAGMA ignore_check_constraints=ON; UPDATE cross_work_package_dependency_activation SET state='UNKNOWN'",
    'DELETE FROM cross_work_package_dependency_activation_receipt',
    'PRAGMA ignore_check_constraints=ON; UPDATE cross_work_package_dependency_activation_receipt SET id=2',
    "UPDATE cross_work_package_dependency_activation_receipt SET receipt='{}'",
    "UPDATE cross_work_package_dependency_activation_receipt SET receipt=json_set(receipt,'$.protocol','wrong')",
    "UPDATE cross_work_package_dependency_activation_receipt SET receipt=json_set(receipt,'$.version',2)",
    "UPDATE cross_work_package_dependency_activation_receipt SET receipt=json_set(receipt,'$.version',json('true'))",
  ]) {
    current(`independent ${action} writer refuses invalid authority: ${fault}`, async () => {
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
  'DELETE FROM cross_work_package_dependency_activation',
  'PRAGMA ignore_check_constraints=ON; UPDATE cross_work_package_dependency_activation SET id=2',
  "PRAGMA ignore_check_constraints=ON; UPDATE cross_work_package_dependency_activation SET state='UNKNOWN'",
  "INSERT INTO cross_work_package_dependency_activation_receipt VALUES (1,'{}')",
  'DROP TABLE cross_work_package_dependency_activation',
  'DROP TABLE cross_work_package_dependency_activation_receipt',
]) {
  current(`rollback refuses corrupt authority without changing ledger: ${fault}`, () => {
    for (const statement of fault.split(';')) connection.db.run(statement);
    const ledger = connection.db.all('SELECT * FROM __drizzle_migrations');
    const certificate = rollbackCertificate();
    expect(() =>
      rollbackTo(path, migrations, '20261022211000_add_external_dependencies'),
    ).toThrow();
    expect(connection.db.all('SELECT * FROM __drizzle_migrations')).toEqual(ledger);
    expect(rollbackCertificate()).toEqual(certificate);
  });
}

for (const table of [
  'cross_work_package_dependency_activation',
  'cross_work_package_dependency_activation_receipt',
]) {
  current(`rollback refuses replaced ${table} schema`, () => {
    connection.db.run(`DROP TABLE ${table}`);
    connection.db.run(
      `CREATE TABLE ${table} (id,${table.endsWith('_receipt') ? 'receipt' : 'state'})`,
    );
    if (!table.endsWith('_receipt'))
      connection.db.run(`INSERT INTO ${table} VALUES (1,'DISABLED')`);
    const ledger = connection.db.all('SELECT * FROM __drizzle_migrations');
    const certificate = rollbackCertificate();
    expect(() =>
      rollbackTo(path, migrations, '20261022211000_add_external_dependencies'),
    ).toThrow();
    expect(connection.db.all('SELECT * FROM __drizzle_migrations')).toEqual(ledger);
    expect(rollbackCertificate()).toEqual(certificate);
  });
}

current('refuses wrong receipt identity even with a valid receipt body', () => {
  enable();
  connection.db.run('PRAGMA ignore_check_constraints=ON');
  connection.db.run('UPDATE cross_work_package_dependency_activation_receipt SET id=2');
  expect(() => inspectDependencyActivation(connection.db)).toThrow(
    'enabled dependency authority has no exact receipt',
  );
});

current('keeps local relationship add update and remove usable while disabled', async () => {
  seed();
  const repository = new TypedDependencyRepository(connection.db, OPEN);
  const local = {
    ...link(),
    predecessor: { workPackageId: 'b', scope: 'whole' as const, workItemId: 'b2' },
  };
  await repository.add(local, { at: 2, by: 'u' });
  await repository.update({ ...local, type: 'SS' }, { at: 3, by: 'u' });
  expect((await repository.listByWorkPackage('b')).at(0)?.type).toBe('SS');
  await repository.remove('edge', { at: 4, by: 'u' });
  expect(await repository.listByWorkPackage('b')).toEqual([]);
});

current(
  'refuses dormant rollback with retained external rows and preserves the full ledger',
  async () => {
    seed();
    enable();
    await new TypedDependencyRepository(connection.db, OPEN).add(link(), { at: 2, by: 'u' });
    connection.db.run("UPDATE cross_work_package_dependency_activation SET state='DISABLED'");
    connection.db.run('DELETE FROM cross_work_package_dependency_activation_receipt');
    const before = snapshot();
    const ledger = connection.db.all('SELECT * FROM __drizzle_migrations');
    const certificate = rollbackCertificate();
    expect(() =>
      rollbackTo(path, migrations, '20261022211000_add_external_dependencies'),
    ).toThrow();
    expect(snapshot()).toEqual(before);
    expect(connection.db.all('SELECT * FROM __drizzle_migrations')).toEqual(ledger);
    expect(rollbackCertificate()).toEqual(certificate);
  },
);

current('rolls back earlier command writes through the real source unit of work', async () => {
  seed();
  const source = openSqliteSource({
    dependencyCapability: CAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
    dbPath: path,
  });
  try {
    const before = snapshot();
    let observed: unknown;
    try {
      await source.uow.run(async ({ stores }) => {
        source.db.run("UPDATE work_package SET revision=revision+1,name='changed' WHERE id='b'");
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
  'UPDATE cross_work_package_dependency_activation SET id=2',
  "UPDATE cross_work_package_dependency_activation SET state='UNKNOWN'",
  'UPDATE cross_work_package_dependency_activation SET state=NULL',
  "INSERT INTO cross_work_package_dependency_activation_receipt VALUES (2,'{}')",
  "INSERT INTO cross_work_package_dependency_activation_receipt VALUES (1,'malformed')",
  'INSERT INTO cross_work_package_dependency_activation_receipt VALUES (1,NULL)',
]) {
  current(`constrained authority refuses independent corruption: ${statement}`, () => {
    expect(() => connection.db.run(statement)).toThrow();
    expect(inspectDependencyActivation(connection.db)).toEqual({
      state: 'DISABLED',
      receipt: null,
    });
  });
}

current('refuses unknown marker state even with an exact receipt', () => {
  enable();
  connection.db.run('PRAGMA ignore_check_constraints=ON');
  connection.db.run("UPDATE cross_work_package_dependency_activation SET state='UNKNOWN'");
  expect(() => inspectDependencyActivation(connection.db)).toThrow(
    'invalid dependency activation marker',
  );
});

for (const version of ['1.0', '1e0']) {
  current(`accepts numeric JSON version ${version} for independent writes`, async () => {
    seed();
    enable();
    connection.db.run(
      `UPDATE cross_work_package_dependency_activation_receipt SET receipt=json_set(receipt,'$.version',json('${version}'))`,
    );
    expect(inspectDependencyActivation(connection.db)).toEqual({
      state: 'ENABLED',
      receipt: RECEIPT,
    });
    const repository = new TypedDependencyRepository(connection.db, OPEN);
    await repository.add(link(), { at: 2, by: 'u' });
    await repository.update({ ...link(), type: 'SS' }, { at: 3, by: 'u' });
    expect((await repository.listByWorkPackage('b')).at(0)?.type).toBe('SS');
    await repository.remove('edge', { at: 4, by: 'u' });
    expect(await repository.listByWorkPackage('b')).toEqual([]);
  });
}

for (const action of ['insert', 'update', 'delete']) {
  current(`rollback refuses missing ${action} trigger before newer downs`, () => {
    connection.db.run(`DROP TRIGGER external_dependency_admit_${action}`);
    const certificate = rollbackCertificate();
    expect(() => rollbackTo(path, migrations, '20261022211000_add_external_dependencies')).toThrow(
      'invalid dependency activation triggers',
    );
    expect(rollbackCertificate()).toEqual(certificate);
  });
}

current('rollback refuses missing activation ledger before newer downs', () => {
  const folders = new Map(readMigrationFolders(migrations).map((folder) => [folder.name, folder]));
  const selected = connection.db.all<AppliedMigration>(
    `SELECT * FROM __drizzle_migrations WHERE name >= '${MIGRATION}' ORDER BY created_at DESC`,
  );
  expect(selected.some(({ name }) => name === MIGRATION)).toBe(true);
  connection.db.run(`DELETE FROM __drizzle_migrations WHERE name='${MIGRATION}'`);
  const certificate = rollbackCertificate();
  const native = openDatabase(path);
  try {
    expect(() => rollbackAppliedRows(native, folders, selected)).toThrow(
      'missing dependency activation migration',
    );
  } finally {
    native.close();
  }
  expect(rollbackCertificate()).toEqual(certificate);
});

historical('unrelated newer rollback and no-op do not inspect enabled authority', () => {
  enable('cross_project_dependency_activation');
  const newer = connection.db
    .all<{ name: string }>('SELECT name FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1')
    .at(0);
  if (newer === undefined) throw new Error('missing newest fixture migration');
  expect(rollbackTo(path, migrations, newer.name)).toEqual([]);
  const reversed = rollbackTo(path, migrations, MIGRATION);
  expect(reversed.length).toBeGreaterThan(0);
  expect(inspectLegacyDependencyActivation(connection.db).state).toBe('ENABLED');
});

current('rollback admission refuses unreadable native connection', () => {
  const closed = openDatabase(path);
  closed.close();
  expect(() => {
    assertDependencyRollbackAdmitted(closed, [MIGRATION]);
  }).toThrow();
  expect(() => {
    assertDependencyRollbackAdmitted(closed, []);
  }).not.toThrow();
  expect(() => {
    assertDependencyRollbackAdmitted(closed, ['unrelated']);
  }).not.toThrow();
});

historical('independent SQL down guard refuses enabled authority without runner admission', () => {
  enable('cross_project_dependency_activation');
  const certificate = rollbackCertificate();
  const activation = readMigrationFolders(migrations).find(({ name }) => name === MIGRATION);
  if (activation === undefined) throw new Error('missing activation migration fixture');
  const native = openDatabase(path);
  try {
    native.run('BEGIN');
    expect(() => {
      for (const statement of activation.downSql.split('--> statement-breakpoint')) {
        if (statement.trim() !== '') native.run(statement.trim());
      }
    }).toThrow('dependency activation requires compatible recovery');
  } finally {
    native.run('ROLLBACK');
    native.close();
  }
  expect(rollbackCertificate()).toEqual(certificate);
});
