import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ProjectAct, StoredTypedDependency } from '@wbs/core';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { afterEach, beforeEach, expect, it } from 'bun:test';
import { DrizzleQueryError } from 'drizzle-orm';

import { type Connection, openConnection, openDatabase, SQLiteError } from './db';
import { WriteCoordinator } from './gate';
import { runMigrations } from './migrate';
import { ProjectRepository } from './project';
import { isSqliteCleanupUnknown } from './sqlite-cleanup';
import { seedDependencyAuthority } from './testing/dependency-activation';
import { TypedDependencyRepository } from './typed-dependency';
import { WorkItemRepository } from './work-item';
import { WorkPackageRepository } from './work-package';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
let directory: string,
  sqlite: ReturnType<typeof openDatabase>,
  connection: Connection,
  gate: WriteCoordinator,
  store: ProjectRepository;
let nativeWrappers = 0;
interface MoveFixtureResources {
  directory?: string;
  closeConnection?: () => void;
  closeSqlite?: () => void;
  disposed: boolean;
  uncertain: boolean;
  connectionClosed: boolean;
  sqliteClosed: boolean;
  directoryRemoved: boolean;
}
let acquired: MoveFixtureResources = freshMoveFixtureResources();
function freshMoveFixtureResources(): MoveFixtureResources {
  return {
    disposed: false,
    uncertain: false,
    connectionClosed: false,
    sqliteClosed: false,
    directoryRemoved: false,
  };
}
/** Attempts independent acquired closes once; uncertain resources keep their owned directory. */
function cleanupMoveFixture(resources: MoveFixtureResources): unknown[] {
  if (resources.disposed) return [];
  resources.disposed = true;
  const failures: unknown[] = [];
  if (resources.closeConnection !== undefined) {
    try {
      resources.closeConnection();
      resources.connectionClosed = true;
    } catch (failure: unknown) {
      failures.push(failure);
    }
  }
  if (resources.closeSqlite !== undefined) {
    try {
      resources.closeSqlite();
      resources.sqliteClosed = true;
    } catch (failure: unknown) {
      failures.push(failure);
    }
  }
  if (
    resources.directory !== undefined &&
    !resources.uncertain &&
    (resources.closeConnection === undefined || resources.connectionClosed) &&
    (resources.closeSqlite === undefined || resources.sqliteClosed)
  ) {
    try {
      rmSync(resources.directory, { recursive: true });
      resources.directoryRemoved = true;
    } catch (failure: unknown) {
      failures.push(failure);
    }
  }
  return failures;
}

const act = (id = 'move'): ProjectAct => ({
  actor: { kind: 'user', userId: 'creator' },
  at: 75,
  auditId: id,
});
async function packageAt(id: string, parent: string, org = 'org') {
  const created = await new WorkPackageRepository(connection.db, gate).createInOrganization(
    workPackageRow({ id, projectId: parent, name: id, createdAt: 42 }),
    [
      {
        id: id + '-dev',
        workPackageId: id,
        name: 'Dev',
        code: 'dev',
        position: 10,
        allowancePercent: 0,
        estimateUnit: 'workdays',
      },
    ],
    { at: 42, by: 'creator' },
    org,
    { id: id + '-grant', auditId: id + '-granted' },
  );
  if (typeof created === 'string') throw Error('fixture package birth refused ' + created);
  await new WorkItemRepository(connection.db, gate).insert(
    workItemRow({ id: id + '-leaf', workPackageId: id }),
    [],
    { at: 42, by: 'creator' },
  );
}
beforeEach(async () => {
  acquired = freshMoveFixtureResources();
  try {
    directory = mkdtempSync(join(tmpdir(), 'work-package-move-'));
    acquired.directory = directory;
    const path = join(directory, 'store.db');
    runMigrations(path, FOLDER);
    // Synthetic storage authority only; no runtime compatibility or operational activation claim.
    acquired.uncertain = true;
    seedDependencyAuthority(path);
    acquired.uncertain = false;
    sqlite = openDatabase(path);
    acquired.closeSqlite = sqlite.close.bind(sqlite, true);
    connection = openConnection(path, undefined, () => {
      nativeWrappers++;
    });
    acquired.closeConnection = connection.close.bind(connection);
    gate = new WriteCoordinator();
    store = new ProjectRepository(connection.db, gate);
    sqlite.run("INSERT INTO users(id,username,created_at) VALUES('creator','Creator',1)");
    sqlite.run(
      "INSERT INTO organization(id,name,created_at) VALUES('org','Org',1),('foreign','Foreign',1)",
    );
    sqlite.run(
      "UPDATE organization_activation SET state='activated',activated_at=1 WHERE singleton=1",
    );
    for (const org of ['org', 'foreign'])
      sqlite.run(
        "INSERT INTO organization_membership(organization_id,user_id,role,created_at) VALUES(?,'creator','member',1)",
        [org],
      );
    for (const id of ['source', 'target', 'third', 'foreign-parent']) {
      const org = id === 'foreign-parent' ? 'foreign' : 'org';
      const created = await store.create(
        { id, organizationId: org, name: id },
        {
          actor: { kind: 'user', userId: 'creator' },
          at: 42,
          grantId: id + '-grant',
          projectAuditId: id + '-created',
          grantAuditId: id + '-granted',
        },
      );
      if (typeof created === 'string' || created.kind !== 'created')
        throw Error('fixture project birth refused');
    }
    await packageAt('w', 'source');
    await packageAt('source-neighbor', 'source');
    await packageAt('target-neighbor', 'target');
    await packageAt('third-neighbor', 'third');
    await packageAt('foreign-w', 'foreign-parent', 'foreign');
    nativeWrappers = 0;
  } catch (primary: unknown) {
    if (isSqliteCleanupUnknown(primary)) acquired.uncertain = true;
    const cleanup = cleanupMoveFixture(acquired);
    if (cleanup.length === 0 && !acquired.uncertain) throw primary;
    throw new AggregateError(
      [primary, ...cleanup],
      'move fixture setup/cleanup failed; retained directory ' + String(acquired.directory),
      { cause: primary },
    );
  }
});
afterEach(() => {
  const cleanup = cleanupMoveFixture(acquired);
  if (cleanup.length !== 0)
    throw new AggregateError(
      cleanup,
      'move fixture cleanup failed; retained directory ' + String(acquired.directory),
      { cause: cleanup[0] },
    );
});
function snapshot() {
  return sqlite
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map(({ name }) => ({
      name,
      rows: sqlite
        .query('SELECT * FROM "' + name.replaceAll('"', '""') + '"')
        .all()
        .map((row) => JSON.stringify(row))
        .sort(),
    }));
}
function edge(id: string, predecessor: string, successor: string): StoredTypedDependency {
  return {
    id,
    workPackageId: successor,
    predecessor: { scope: 'whole', workPackageId: predecessor, workItemId: predecessor + '-leaf' },
    successor: { scope: 'whole', workPackageId: successor, workItemId: successor + '-leaf' },
    type: 'FS',
  };
}
async function addEdge(id: string, predecessor: string, successor: string) {
  await new TypedDependencyRepository(connection.db, gate).add(edge(id, predecessor, successor), {
    at: 42,
    by: 'creator',
  });
}
/** Awaits the actual operation; only Drizzle's known query wrapper may expose its native cause. */
async function expectFailure(operation: Promise<unknown>, diagnostic: string, native = false) {
  let rejected = false;
  try {
    await operation;
  } catch (caught: unknown) {
    rejected = true;
    let failure = caught;
    expect(failure).not.toBeInstanceOf(AggregateError);
    while (failure instanceof DrizzleQueryError) {
      failure = failure.cause;
      expect(failure).not.toBeInstanceOf(AggregateError);
    }
    expect(failure).toBeInstanceOf(Error);
    if (!(failure instanceof Error))
      throw new Error('native move refusal absent', { cause: caught });
    if (native) {
      expect(failure).toBeInstanceOf(SQLiteError);
      expect(failure.message).toBe(diagnostic);
    } else expect(failure.message).toContain(diagnostic);
  }
  expect(rejected).toBe(true);
}

it('moves the actual package and both project revisions with one exact destination audit', async () => {
  const before = sqlite
    .query<Record<string, unknown>, []>("SELECT * FROM work_package WHERE id='w'")
    .get();
  if (before === null) throw new Error('fixture selected package row is absent');
  const grants = sqlite.query('SELECT * FROM access_grant ORDER BY id').all(),
    steps = sqlite.query('SELECT * FROM step ORDER BY id').all(),
    addresses = sqlite
      .query('SELECT * FROM work_package_abbreviation ORDER BY work_package_id')
      .all();
  expect(await store.moveWorkPackage('org', 'w', 'target', act())).toEqual({
    kind: 'moved',
    workPackageId: 'w',
    projectId: 'target',
    revision: 1,
    sourceProject: { id: 'source', revision: 1 },
    targetProject: { id: 'target', revision: 1 },
  });
  expect(nativeWrappers).toBe(1);
  expect(sqlite.query("SELECT * FROM work_package WHERE id='w'").get()).toEqual({
    ...before,
    project_id: 'target',
    revision: 1,
    updated_at: 75,
  });
  expect(
    sqlite
      .query(
        "SELECT id,revision,updated_at FROM project WHERE id IN ('source','target') ORDER BY id",
      )
      .all(),
  ).toEqual([
    { id: 'source', revision: 1, updated_at: 75 },
    { id: 'target', revision: 1, updated_at: 75 },
  ]);
  expect(
    sqlite
      .query(
        "SELECT id,subject_kind,subject_id,actor_id,detail,created_at FROM organization_audit WHERE id='move'",
      )
      .get(),
  ).toEqual({
    id: 'move',
    subject_kind: 'project',
    subject_id: 'target',
    actor_id: 'creator',
    detail: JSON.stringify({
      workPackageId: 'w',
      fromProjectId: 'source',
      toProjectId: 'target',
      workPackageRevision: 1,
      sourceProjectRevision: 1,
      targetProjectRevision: 1,
    }),
    created_at: 75,
  });
  expect(sqlite.query('SELECT * FROM access_grant ORDER BY id').all()).toEqual(grants);
  expect(sqlite.query('SELECT * FROM step ORDER BY id').all()).toEqual(steps);
  expect(
    sqlite.query('SELECT * FROM work_package_abbreviation ORDER BY work_package_id').all(),
  ).toEqual(addresses);
  expect(
    sqlite.query("SELECT name,created_at,created_by FROM work_package WHERE id='w'").get(),
  ).toMatchObject({ name: 'w', created_at: 42, created_by: 'creator' });
  expect(before).toBeTruthy();
});
it('keeps same-parent state and audit byte-identical even when existing incident edges cross projects', async () => {
  await addEdge('already-cross', 'w', 'target-neighbor');
  const before = snapshot();
  expect(await store.moveWorkPackage('org', 'w', 'source', act())).toEqual({
    kind: 'unchanged',
    workPackageId: 'w',
    projectId: 'source',
    revision: 0,
    sourceProject: { id: 'source', revision: 0 },
    targetProject: { id: 'source', revision: 0 },
  });
  expect(snapshot()).toEqual(before);
});
for (const [id, target, expected] of [
  ['missing', 'target', 'not_found'],
  ['foreign-w', 'target', 'not_found'],
  ['w', 'missing', 'not_found'],
  ['w', 'foreign-parent', 'cross_organization'],
] as const)
  it('refuses direct move ' + id + '→' + target + ' without writes', async () => {
    const before = snapshot();
    expect(await store.moveWorkPackage('org', id, target, act())).toBe(expected);
    expect(snapshot()).toEqual(before);
  });
for (const direction of ['outgoing', 'incoming'] as const)
  it('blocks actual ' + direction + ' dependencies left in the source', async () => {
    await addEdge(
      'blocked',
      direction === 'outgoing' ? 'w' : 'source-neighbor',
      direction === 'outgoing' ? 'source-neighbor' : 'w',
    );
    const before = snapshot();
    expect(await store.moveWorkPackage('org', 'w', 'target', act())).toEqual({
      kind: 'dependency_crosses_project',
      dependencyIds: ['blocked'],
    });
    expect(snapshot()).toEqual(before);
  });
it('blocks authored held dependencies instead of dropping them from the move', async () => {
  await addEdge('held', 'w', 'source-neighbor');
  sqlite.run("UPDATE work_item SET hold='on_hold' WHERE id='w-leaf'");
  const before = snapshot();
  expect(await store.moveWorkPackage('org', 'w', 'target', act())).toEqual({
    kind: 'dependency_crosses_project',
    dependencyIds: ['held'],
  });
  expect(snapshot()).toEqual(before);
});
it('allows destination counterpart edges and local edges while preserving exact relationships', async () => {
  await addEdge('destination', 'w', 'target-neighbor');
  await new WorkItemRepository(connection.db, gate).insert(
    workItemRow({ id: 'w-second', workPackageId: 'w', position: 200 }),
    [],
    { at: 42, by: 'creator' },
  );
  await new TypedDependencyRepository(connection.db, gate).add(
    {
      ...edge('local', 'w', 'w'),
      successor: { scope: 'whole', workPackageId: 'w', workItemId: 'w-second' },
    },
    { at: 42, by: 'creator' },
  );
  const external = sqlite.query('SELECT * FROM external_dependency ORDER BY id').all(),
    local = sqlite.query('SELECT * FROM typed_dependency ORDER BY id').all();
  expect(await store.moveWorkPackage('org', 'w', 'target', act())).toMatchObject({
    kind: 'moved',
    revision: 1,
  });
  expect(sqlite.query('SELECT * FROM external_dependency ORDER BY id').all()).toEqual(external);
  expect(sqlite.query('SELECT * FROM typed_dependency ORDER BY id').all()).toEqual(local);
});
it('returns deterministic unique BINARY blocker IDs from both directions and other projects', async () => {
  await addEdge('z', 'w', 'source-neighbor');
  await addEdge('ä', 'source-neighbor', 'w');
  await new TypedDependencyRepository(connection.db, gate).add(
    { ...edge('A', 'w', 'third-neighbor'), type: 'SS' },
    { at: 42, by: 'creator' },
  );
  const before = snapshot();
  expect(await store.moveWorkPackage('org', 'w', 'target', act())).toEqual({
    kind: 'dependency_crosses_project',
    dependencyIds: ['A', 'z', 'ä'],
  });
  expect(snapshot()).toEqual(before);
});
for (const [name, table, condition] of [
  ['package', 'work_package', "NEW.id='w'"],
  ['source project', 'project', "NEW.id='source'"],
  ['target project', 'project', "NEW.id='target'"],
  ['audit', 'organization_audit', "NEW.id='move'"],
] as const)
  it('rolls back the complete actual owner after ' + name + ' write failure', async () => {
    sqlite.run(
      'CREATE TRIGGER refuse_move BEFORE ' +
        (table === 'organization_audit' ? 'INSERT' : 'UPDATE') +
        ' ON ' +
        table +
        ' WHEN ' +
        condition +
        " BEGIN SELECT RAISE(ABORT,'selected move write failure'); END",
    );
    const before = snapshot();
    await expectFailure(
      store.moveWorkPackage('org', 'w', 'target', act()),
      'selected move write failure',
      true,
    );
    expect(snapshot()).toEqual(before);
  });
for (const [table, id] of [
  ['work_package', 'w'],
  ['project', 'source'],
  ['project', 'target'],
] as const)
  it('refuses ' + table + '/' + id + ' revision overflow before any write', async () => {
    sqlite.run('UPDATE ' + table + ' SET revision=? WHERE id=?', [Number.MAX_SAFE_INTEGER, id]);
    const before = snapshot();
    await expectFailure(store.moveWorkPackage('org', 'w', 'target', act()), 'revision overflow');
    expect(snapshot()).toEqual(before);
  });
it('retains the actual act before its real owner waits', async () => {
  const entered = Promise.withResolvers<undefined>(),
    release = Promise.withResolvers<undefined>();
  const held = gate.enter(async () => {
    entered.resolve(undefined);
    await release.promise;
  });
  await entered.promise;
  const retained = {
    actor: { kind: 'user' as const, userId: 'creator' },
    at: 75,
    auditId: 'retained',
  };
  let pending: Promise<unknown>;
  try {
    pending = store.moveWorkPackage('org', 'w', 'target', retained);
    retained.actor.userId = 'other';
    retained.at = 999;
    retained.auditId = 'changed';
  } finally {
    release.resolve(undefined);
    await held;
  }
  expect(await pending).toMatchObject({ kind: 'moved' });
  expect(
    sqlite.query("SELECT actor_id,created_at FROM organization_audit WHERE id='retained'").get(),
  ).toEqual({ actor_id: 'creator', created_at: 75 });
});

/** Creates only the declared fixture corruption, then restores exact trigger text/FK enforcement before any move. */
function corruptMoveFixture(triggerNames: readonly string[], mutate: () => void) {
  const schema = sqlite
    .query('SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name')
    .all();
  const selected = triggerNames.map((name) => {
    const row = sqlite
      .query<{ sql: string }, [string]>(
        "SELECT sql FROM sqlite_schema WHERE type='trigger' AND name=?",
      )
      .get(name);
    if (row === null || typeof row.sql !== 'string')
      throw new Error('required fixture trigger absent: ' + name);
    return { name, sql: row.sql };
  });
  expect(sqlite.query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
  const failures: unknown[] = [];
  try {
    sqlite.run('PRAGMA foreign_keys=OFF');
    for (const { name } of selected) sqlite.run('DROP TRIGGER "' + name + '"');
    mutate();
  } catch (failure: unknown) {
    failures.push(failure);
  }
  for (const { sql } of selected) {
    try {
      sqlite.run(sql);
    } catch (failure: unknown) {
      failures.push(failure);
    }
  }
  try {
    sqlite.run('PRAGMA foreign_keys=ON');
    expect(sqlite.query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
    expect(
      sqlite.query('SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name').all(),
    ).toEqual(schema);
  } catch (failure: unknown) {
    failures.push(failure);
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(failures, 'move fixture corruption/restoration failed', {
      cause: failures[0],
    });
}
for (const selected of [
  'source-parent-missing',
  'source-parent-malformed',
  'selected-mapping-missing',
  'selected-mapping-empty',
  'counterpart-parent-missing',
  'counterpart-parent-malformed',
  'counterpart-mapping-missing',
  'counterpart-mapping-foreign',
] as const)
  it('refuses SQL move trusted state/' + selected + ' without writes', async () => {
    const counterpart = selected.startsWith('counterpart');
    if (counterpart) await addEdge('incident', 'w', 'third-neighbor');
    const packageId = counterpart ? 'third-neighbor' : 'w',
      parentId = counterpart ? 'third' : 'source';
    let diagnostic: string;
    if (selected.endsWith('parent-missing')) {
      corruptMoveFixture([], () => sqlite.run('DELETE FROM project WHERE id=?', [parentId]));
      diagnostic = 'stored work package parent is absent';
    } else if (selected.endsWith('parent-malformed')) {
      sqlite.run('UPDATE project SET revision=? WHERE id=?', ['malformed', parentId]);
      diagnostic = 'stored project revision is malformed';
    } else if (selected.endsWith('mapping-missing')) {
      corruptMoveFixture(['work_package_organization_frozen_delete'], () =>
        sqlite.run('DELETE FROM work_package_organization WHERE resource_id=?', [packageId]),
      );
      diagnostic = counterpart
        ? 'requires matching organization ownership'
        : 'stored work package organization is absent';
    } else {
      corruptMoveFixture(['work_package_organization_frozen_update'], () =>
        sqlite.run('UPDATE work_package_organization SET organization_id=? WHERE resource_id=?', [
          selected.endsWith('empty') ? '' : 'foreign',
          packageId,
        ]),
      );
      diagnostic = counterpart
        ? 'requires matching organization ownership'
        : 'stored work package organization is malformed';
    }
    const before = snapshot();
    await expectFailure(store.moveWorkPackage('org', 'w', 'target', act()), diagnostic);
    expect(snapshot()).toEqual(before);
  });
it('cleans its acquired directory after a real migration setup refusal', () => {
  const interrupted = freshMoveFixtureResources();
  interrupted.directory = mkdtempSync(join(tmpdir(), 'move-migration-refusal-'));
  let primary: unknown,
    refused = false;
  try {
    runMigrations(
      join(interrupted.directory, 'store.db'),
      join(interrupted.directory, 'missing-migrations'),
    );
  } catch (failure: unknown) {
    primary = failure;
    refused = true;
    interrupted.uncertain = isSqliteCleanupUnknown(failure);
  }
  const cleanup = cleanupMoveFixture(interrupted);
  expect(refused).toBe(true);
  expect(primary).toBeInstanceOf(Error);
  expect(cleanup).toEqual([]);
  expect(interrupted.uncertain).toBe(false);
  expect(interrupted.directoryRemoved).toBe(true);
  expect(existsSync(interrupted.directory)).toBe(false);
});
it('attempts both acquired fixture closes and conservatively retains a throwing close directory', () => {
  const selected = freshMoveFixtureResources();
  let otherCalls = 0,
    clientCalls = 0;
  const returned: { connection: boolean; sqlite: boolean } = { connection: false, sqlite: false };
  const failures: unknown[] = [];
  try {
    selected.directory = mkdtempSync(join(tmpdir(), 'move-close-refusal-'));
    const path = join(selected.directory, 'store.db'),
      client = openDatabase(path);
    const closeClient = client.close.bind(client, true);
    selected.closeSqlite = () => {
      clientCalls++;
      closeClient();
      returned.sqlite = true;
    };
    const other = openConnection(path),
      closeOther = other.close.bind(other);
    const sentinel = new Error('selected post-close fixture failure');
    selected.closeConnection = () => {
      otherCalls++;
      closeOther();
      returned.connection = true;
      throw sentinel;
    };
    const cleanup = cleanupMoveFixture(selected);
    expect(cleanup).toEqual([sentinel]);
    expect(otherCalls).toBe(1);
    expect(clientCalls).toBe(1);
    expect(selected.connectionClosed).toBe(false);
    expect(selected.sqliteClosed).toBe(true);
    expect(selected.directoryRemoved).toBe(false);
    expect(existsSync(selected.directory)).toBe(true);
    expect(cleanupMoveFixture(selected)).toEqual([]);
    expect(otherCalls).toBe(1);
    expect(clientCalls).toBe(1);
  } catch (failure: unknown) {
    failures.push(failure);
    selected.uncertain = isSqliteCleanupUnknown(failure);
  }
  failures.push(...cleanupMoveFixture(selected));
  // This test alone observes both actual native delegates return before the wrapper throw.
  // Its separate post-observation removal is not a successful selected-close receipt.
  if (selected.directory !== undefined && returned.connection && returned.sqlite) {
    try {
      rmSync(selected.directory, { recursive: true });
    } catch (failure: unknown) {
      failures.push(failure);
    }
  } else
    failures.push(
      new Error(
        'actual extra fixture native close remained uncertain; retained ' +
          String(selected.directory),
      ),
    );
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(failures, 'extra fixture control and cleanup failed', {
      cause: failures[0],
    });
});
/** Restores actual enforcement/schema before the production read while intentionally retaining only fixture corruption. */
function corruptCurrentIncident(
  triggerNames: readonly string[],
  ignoreChecks: boolean,
  mutate: () => void,
): void {
  const schema = sqlite
    .query('SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name')
    .all();
  const triggers = triggerNames.map((name) => {
    const selected = sqlite
      .query<{ sql: unknown }, [string]>(
        "SELECT sql FROM sqlite_schema WHERE type='trigger' AND name=?",
      )
      .get(name);
    if (selected === null || typeof selected.sql !== 'string')
      throw new Error('required current incident fixture trigger absent: ' + name);
    return { name, sql: selected.sql };
  });
  expect(sqlite.query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
  expect(sqlite.query('PRAGMA ignore_check_constraints').get()).toEqual({
    ignore_check_constraints: 0,
  });
  const failures: unknown[] = [];
  try {
    sqlite.run('PRAGMA foreign_keys=OFF');
    expect(sqlite.query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 0 });
    if (ignoreChecks) sqlite.run('PRAGMA ignore_check_constraints=ON');
    expect(sqlite.query('PRAGMA ignore_check_constraints').get()).toEqual({
      ignore_check_constraints: ignoreChecks ? 1 : 0,
    });
    for (const trigger of triggers) sqlite.run('DROP TRIGGER "' + trigger.name + '"');
    mutate();
  } catch (failure: unknown) {
    failures.push(failure);
  }
  for (const trigger of triggers) {
    try {
      sqlite.run(trigger.sql);
    } catch (failure: unknown) {
      failures.push(failure);
    }
  }
  try {
    sqlite.run('PRAGMA ignore_check_constraints=OFF');
    expect(sqlite.query('PRAGMA ignore_check_constraints').get()).toEqual({
      ignore_check_constraints: 0,
    });
  } catch (failure: unknown) {
    failures.push(failure);
  }
  try {
    sqlite.run('PRAGMA foreign_keys=ON');
    expect(sqlite.query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
  } catch (failure: unknown) {
    failures.push(failure);
  }
  try {
    expect(
      sqlite.query('SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name').all(),
    ).toEqual(schema);
  } catch (failure: unknown) {
    failures.push(failure);
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(failures, 'current incident fixture mutation/restoration failed', {
      cause: failures[0],
    });
}

/** Awaits the owning read and requires its exact decoder diagnostic, without normalizing query/rollback failures. */
async function expectExactIncidentFailure(operation: Promise<unknown>, diagnostic: string) {
  let rejected = false;
  try {
    await operation;
  } catch (failure: unknown) {
    rejected = true;
    expect(failure).toBeInstanceOf(Error);
    if (!(failure instanceof Error))
      throw new Error('current incident refusal was not an Error', { cause: failure });
    expect(failure.message).toBe(diagnostic);
  }
  expect(rejected).toBe(true);
}

async function addLocalCurrentIncident(id: string): Promise<StoredTypedDependency> {
  await new WorkItemRepository(connection.db, gate).insert(
    workItemRow({ id: 'w-second', workPackageId: 'w', position: 200 }),
    [],
    { at: 42, by: 'creator' },
  );
  const dependency: StoredTypedDependency = {
    id,
    workPackageId: 'w',
    predecessor: { scope: 'whole', workPackageId: 'w', workItemId: 'w-leaf' },
    successor: { scope: 'whole', workPackageId: 'w', workItemId: 'w-second' },
    type: 'FS',
  };
  await new TypedDependencyRepository(connection.db, gate).add(dependency, {
    at: 42,
    by: 'creator',
  });
  return dependency;
}

it('refuses current incident missing work-item evidence after constraints restore', async () => {
  await addEdge('incident', 'w', 'third-neighbor');
  corruptCurrentIncident([], false, () =>
    sqlite.run("DELETE FROM work_item WHERE id='third-neighbor-leaf'"),
  );
  const before = snapshot();
  await expectExactIncidentFailure(
    store.moveWorkPackage('org', 'w', 'target', act()),
    'typed dependency incident names work item third-neighbor-leaf outside work package third-neighbor',
  );
  expect(snapshot()).toEqual(before);
});

it('refuses current incident missing step evidence after constraints restore', async () => {
  await new TypedDependencyRepository(connection.db, gate).add(
    {
      ...edge('incident', 'w', 'third-neighbor'),
      predecessor: {
        scope: 'node',
        workPackageId: 'w',
        workItemId: 'w-leaf',
        stepId: 'w-dev',
      },
    },
    { at: 42, by: 'creator' },
  );
  corruptCurrentIncident([], false, () => sqlite.run("DELETE FROM step WHERE id='w-dev'"));
  const before = snapshot();
  await expectExactIncidentFailure(
    store.moveWorkPackage('org', 'w', 'target', act()),
    'typed dependency incident names step w-dev outside work package w',
  );
  expect(snapshot()).toEqual(before);
});

it('refuses current incident recorded organization mismatch after constraints restore', async () => {
  await addEdge('incident', 'w', 'third-neighbor');
  corruptCurrentIncident([], false, () =>
    sqlite.run("UPDATE external_dependency SET organization_id='foreign' WHERE id='incident'"),
  );
  const before = snapshot();
  await expectExactIncidentFailure(
    store.moveWorkPackage('org', 'w', 'target', act()),
    'typed dependency incident has inconsistent organization ownership',
  );
  expect(snapshot()).toEqual(before);
});

it('refuses current incident hidden cross-representation identity after trigger restore', async () => {
  await addLocalCurrentIncident('duplicate');
  corruptCurrentIncident(['external_dependency_cross_identity_insert'], false, () =>
    sqlite.run(
      "INSERT INTO external_dependency(id,organization_id,predecessor_work_package_id,successor_work_package_id,predecessor_work_item_id,predecessor_scope,successor_work_item_id,successor_scope,type,created_at,updated_at,created_by) VALUES('duplicate','org','target-neighbor','third-neighbor','target-neighbor-leaf','whole','third-neighbor-leaf','whole','FS',42,42,'creator')",
    ),
  );
  expect(sqlite.query("SELECT id FROM typed_dependency WHERE id='duplicate'").all()).toEqual([
    { id: 'duplicate' },
  ]);
  expect(sqlite.query("SELECT id FROM external_dependency WHERE id='duplicate'").all()).toEqual([
    { id: 'duplicate' },
  ]);
  const before = snapshot();
  await expectExactIncidentFailure(
    store.moveWorkPackage('org', 'w', 'target', act()),
    'duplicate unified dependency duplicate',
  );
  expect(snapshot()).toEqual(before);
});

for (const malformed of ['type', 'scope'] as const)
  it(
    'refuses current incident malformed stored relationship after checks restore/' + malformed,
    async () => {
      await addLocalCurrentIncident('malformed');
      corruptCurrentIncident([], true, () => {
        if (malformed === 'type')
          sqlite.run("UPDATE typed_dependency SET type='SF' WHERE id='malformed'");
        else
          sqlite.run("UPDATE typed_dependency SET predecessor_scope='future' WHERE id='malformed'");
      });
      const before = snapshot();
      await expectExactIncidentFailure(
        store.moveWorkPackage('org', 'w', 'target', act()),
        malformed === 'type'
          ? 'typed dependency malformed has unknown relationship type SF'
          : 'typed dependency malformed has unknown predecessor scope future',
      );
      expect(snapshot()).toEqual(before);
    },
  );

it('keeps the current incident union pinned across a rival representation commit', async () => {
  const local = await addLocalCurrentIncident('union');
  const external: StoredTypedDependency = {
    ...local,
    predecessor: {
      scope: 'whole',
      workPackageId: 'target-neighbor',
      workItemId: 'target-neighbor-leaf',
    },
  };
  const unchanged = snapshot().filter(
    ({ name }) => name !== 'typed_dependency' && name !== 'external_dependency',
  );
  const extra = freshMoveFixtureResources();
  const failures: unknown[] = [];
  let callbackEntries = 0,
    committed = false,
    armed = true;
  try {
    const coherent = openConnection(join(directory, 'store.db'), {
      logQuery(query) {
        if (!armed || !query.startsWith('select') || !query.includes('from "external_dependency"'))
          return;
        armed = false;
        callbackEntries++;
        sqlite.transaction(() => {
          sqlite.run("DELETE FROM typed_dependency WHERE id='union'");
          sqlite.run(
            "INSERT INTO external_dependency(id,organization_id,predecessor_work_package_id,successor_work_package_id,predecessor_work_item_id,predecessor_scope,successor_work_item_id,successor_scope,type,created_at,updated_at,created_by) VALUES('union','org','target-neighbor','w','target-neighbor-leaf','whole','w-second','whole','FS',42,42,'creator')",
          );
        })();
        committed = true;
      },
    });
    extra.closeConnection = coherent.close.bind(coherent);
    const original = await new TypedDependencyRepository(coherent.db, gate).listIncident(['w']);
    expect(callbackEntries).toBe(1);
    expect(committed).toBe(true);
    expect(original).toEqual([local]);
    const fresh = await new TypedDependencyRepository(connection.db, gate).listIncident(['w']);
    expect(fresh).toEqual([external]);
    expect(
      snapshot().filter(
        ({ name }) => name !== 'typed_dependency' && name !== 'external_dependency',
      ),
    ).toEqual(unchanged);
  } catch (failure: unknown) {
    failures.push(failure);
    if (isSqliteCleanupUnknown(failure)) acquired.uncertain = true;
  }
  const cleanup = cleanupMoveFixture(extra);
  if (cleanup.length !== 0) acquired.uncertain = true;
  failures.push(...cleanup);
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(failures, 'current incident snapshot observation/cleanup failed', {
      cause: failures[0],
    });
});
