import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ProjectCaller } from '@wbs/core/ports/project-administration';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { UnknownPermissionRow } from '@wbs/domain';
import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { afterEach, beforeEach, expect, it } from 'bun:test';
import { DrizzleQueryError } from 'drizzle-orm';

import { AccessDecisionRepository } from './access-decisions';
import { SqliteCommandAccess } from './command-access';
import {
  type Connection,
  drizzleOuterTransaction,
  openConnection,
  openDatabase,
  SQLiteError,
} from './db';
import { WriteCoordinator } from './gate';
import { MachineCredentialRepository } from './machine-credential';
import { runMigrations } from './migrate';
import { SqliteOrganizationAccess } from './organization-access';
import { SqliteProjectAdministration } from './project-administration';
import { isSqliteCleanupUnknown } from './sqlite-cleanup';
import { seedDependencyAuthority } from './testing/dependency-activation';
import { TypedDependencyRepository } from './typed-dependency';
import { WorkItemRepository } from './work-item';
import { WorkPackageRepository } from './work-package';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
let sqlite: ReturnType<typeof openDatabase>, connection: Connection, gate: WriteCoordinator;
let administration: SqliteProjectAdministration;
let statements: string[];
let selectedOrganization = 'org';
let refuseMoveRollback = false;
const fresh = () => ({
  directory: undefined as string | undefined,
  closeConnection: undefined as (() => void) | undefined,
  closeSqlite: undefined as (() => void) | undefined,
  disposed: false,
  uncertain: false,
  connectionClosed: false,
  sqliteClosed: false,
});
let acquired = fresh();

/** Independently closes acquired resources once; uncertain storage keeps its private directory. */
function cleanupFixture(): unknown[] {
  if (acquired.disposed) return [];
  acquired.disposed = true;
  const failures: unknown[] = [];
  if (acquired.closeConnection !== undefined)
    try {
      acquired.closeConnection();
      acquired.connectionClosed = true;
    } catch (failure) {
      failures.push(failure);
    }
  if (acquired.closeSqlite !== undefined)
    try {
      acquired.closeSqlite();
      acquired.sqliteClosed = true;
    } catch (failure) {
      failures.push(failure);
    }
  if (
    acquired.directory !== undefined &&
    !acquired.uncertain &&
    (acquired.closeConnection === undefined || acquired.connectionClosed) &&
    (acquired.closeSqlite === undefined || acquired.sqliteClosed)
  )
    try {
      rmSync(acquired.directory, { recursive: true });
    } catch (failure) {
      failures.push(failure);
    }
  return failures;
}

beforeEach(async () => {
  acquired = fresh();
  try {
    const directory = mkdtempSync(join(tmpdir(), 'admitted-package-move-'));
    acquired.directory = directory;
    const path = join(directory, 'store.db');
    runMigrations(path, FOLDER);
    sqlite = openDatabase(path);
    acquired.closeSqlite = sqlite.close.bind(sqlite, true);
    statements = [];
    selectedOrganization = 'org';
    refuseMoveRollback = false;
    connection = openConnection(path, {
      logQuery(query) {
        statements.push(query);
        if (refuseMoveRollback && query === 'ROLLBACK')
          throw new Error('selected admitted rollback failure');
      },
    });
    acquired.closeConnection = connection.close.bind(connection);
    gate = new WriteCoordinator();
    const organizations = new SqliteOrganizationAccess(
      connection.db,
      () => Promise.resolve(selectedOrganization),
      () => 100,
    );
    administration = new SqliteProjectAdministration(
      connection.db,
      gate,
      new SqliteCommandAccess(
        connection.db,
        organizations,
        new MachineCredentialRepository(connection.db, gate),
      ),
    );
    sqlite.run(
      "INSERT INTO users(id,username,created_at) VALUES('actor','Actor',1),('creator','Creator',1)",
    );
    sqlite.run(
      "INSERT INTO organization(id,name,created_at) VALUES('org','Org',1),('foreign','Foreign',1)",
    );
    sqlite.run(
      "INSERT INTO organization_membership(organization_id,user_id,role,created_at) VALUES('org','actor','member',1),('org','creator','member',1)",
    );
    sqlite.run(
      "UPDATE organization_activation SET state='activated',activated_at=1 WHERE singleton=1",
    );
    sqlite.run(
      "INSERT INTO project(id,organization_id,name,created_at,created_by) VALUES('source','org','Source',1,'creator'),('target','org','Target',1,'creator'),('foreign-target','foreign','Foreign',1,'creator')",
    );
    const created = await new WorkPackageRepository(connection.db, gate).createInOrganization(
      workPackageRow({
        id: 'moving',
        name: 'Moving',
        projectId: 'source',
        restricted: true,
        createdAt: 1,
      }),
      [],
      { at: 1, by: 'creator' },
      'org',
      { id: 'creator-package', auditId: 'creator-granted' },
    );
    if (typeof created === 'string')
      throw new Error('admitted move fixture birth refused: ' + created);
    grant('actor-organization', 'org-super-admin', 'organization', 'org');
    grant('actor-package', 'package-manager', 'work_package', 'moving');
    statements.length = 0;
  } catch (failure) {
    acquired.uncertain ||= isSqliteCleanupUnknown(failure);
    const cleanup = cleanupFixture();
    if (cleanup.length !== 0)
      throw new AggregateError(
        [failure, ...cleanup],
        'move fixture acquisition and cleanup failed',
        { cause: failure },
      );
    throw failure;
  }
});
afterEach(() => {
  const failures = cleanupFixture();
  if (failures.length !== 0)
    throw new AggregateError(failures, 'move fixture cleanup failed', { cause: failures[0] });
});

function grant(id: string, roleId: string, kind: 'organization' | 'work_package', scopeId: string) {
  sqlite.run(
    "INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES(?,'org',?,?,'user','actor',?,'route',1)",
    [id, kind, scopeId, roleId],
  );
}
function caller(): ProjectCaller {
  return {
    kind: 'human',
    principal: {
      id: 'actor',
      username: 'Actor',
      scopes: ['read', 'write'],
      authentication: { kind: 'first_party', issuedAt: 1 },
      organizationOperation: {
        kind: 'mutation',
        expected: { kind: 'present', organizationId: 'org' },
      },
    },
    expectedAccess: {
      kind: 'scoped',
      principal: { id: 'actor' },
      scope: { organizationId: 'org', userId: 'actor', cap: null },
    },
  };
}
function move(target = 'target') {
  return administration.moveWorkPackage(caller(), 'moving', target, {
    at: 50,
    auditId: 'move-audit',
  });
}
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
async function observedFailure(operation: () => Promise<unknown>): Promise<unknown> {
  try {
    await operation();
  } catch (failure) {
    return failure;
  }
  throw new Error('expected admitted move failure was not observed');
}

it('uses one actual writer and both persisted grants for the admitted borrowed move', async () => {
  expect(await move()).toEqual({
    kind: 'moved',
    workPackageId: 'moving',
    projectId: 'target',
    revision: 1,
    sourceProject: { id: 'source', revision: 1 },
    targetProject: { id: 'target', revision: 1 },
  });
  expect(statements.filter((query) => query === 'BEGIN IMMEDIATE')).toHaveLength(1);
  expect(statements.filter((query) => query === 'COMMIT')).toHaveLength(1);
  expect(statements.filter((query) => query === 'ROLLBACK')).toHaveLength(0);
  expect(
    sqlite.query("SELECT project_id,revision,updated_at FROM work_package WHERE id='moving'").get(),
  ).toEqual({ project_id: 'target', revision: 1, updated_at: 50 });
  expect(
    sqlite
      .query(
        "SELECT actor_id,subject_kind,subject_id FROM organization_audit WHERE action='work_package_moved'",
      )
      .all(),
  ).toEqual([{ actor_id: 'actor', subject_kind: 'project', subject_id: 'target' }]);
});

it('keeps the authorized same-parent operation unchanged even at maximal revisions', async () => {
  sqlite.run("UPDATE work_package SET revision=? WHERE id='moving'", [Number.MAX_SAFE_INTEGER]);
  sqlite.run("UPDATE project SET revision=? WHERE id='source'", [Number.MAX_SAFE_INTEGER]);
  const before = snapshot();
  expect(await move('source')).toEqual({
    kind: 'unchanged',
    workPackageId: 'moving',
    projectId: 'source',
    revision: Number.MAX_SAFE_INTEGER,
    sourceProject: { id: 'source', revision: Number.MAX_SAFE_INTEGER },
    targetProject: { id: 'source', revision: Number.MAX_SAFE_INTEGER },
  });
  expect(snapshot()).toEqual(before);
});

it('does not inspect destination storage for a hidden package but reaches that query for a readable one', async () => {
  sqlite.run("DELETE FROM access_grant WHERE id IN ('actor-organization','actor-package')");
  const before = snapshot();
  statements.length = 0;
  expect(await move()).toBe('not_found');
  expect(statements.filter((query) => query.includes('from "project"'))).toHaveLength(0);
  expect(snapshot()).toEqual(before);
  grant('actor-reader', 'package-viewer', 'work_package', 'moving');
  statements.length = 0;
  expect(await move('missing')).toBe('not_found');
  expect(statements.some((query) => query.includes('from "project"'))).toBe(true);
  expect(await move('foreign-target')).toBe('not_found');
});

it('requires organization creation and restricted package write independently without account creator authority', async () => {
  sqlite.run("DELETE FROM access_grant WHERE id='actor-organization'");
  const withoutOrganization = snapshot();
  expect(await move()).toEqual({
    ok: false,
    error: 'forbidden',
    permission: 'organization.create_project',
  });
  expect(snapshot()).toEqual(withoutOrganization);
  grant('actor-organization', 'org-super-admin', 'organization', 'org');
  sqlite.run("DELETE FROM access_grant WHERE id='actor-package'");
  const withoutPackageWrite = snapshot();
  expect(await move()).toEqual({ ok: false, error: 'forbidden', permission: 'package.write' });
  expect(snapshot()).toEqual(withoutPackageWrite);
});

it('throws on the selected package missing trusted ownership before target lookup without effects', async () => {
  corruptStoredMove(
    () => sqlite.run("DELETE FROM work_package_organization WHERE resource_id='moving'"),
    ['work_package_organization_frozen_delete'],
  );
  const before = snapshot();
  statements.length = 0;
  expect(await observedFailure(() => move())).toMatchObject({
    message: 'stored move package organization is absent',
  });
  expect(statements.some((query) => query.includes('from "project"'))).toBe(false);
  expect(snapshot()).toEqual(before);
});

/** Holds the real source coordinator and observes both settlements before returning. */
async function queuedMove(evidence: ProjectCaller, mutate: () => void) {
  const entered = Promise.withResolvers<undefined>();
  const release = Promise.withResolvers<undefined>();
  const holder = gate.enter(async () => {
    entered.resolve(undefined);
    await release.promise;
  });
  await entered.promise;
  const pending = administration
    .moveWorkPackage(evidence, 'moving', 'target', {
      at: 50,
      auditId: 'move-audit',
    })
    .then(
      (outcome) => ({ kind: 'returned' as const, outcome }),
      (failure: unknown) => ({ kind: 'threw' as const, failure }),
    );
  let primary: { failure: unknown } | undefined;
  let before: ReturnType<typeof snapshot> | undefined;
  try {
    expect(statements).not.toContain('BEGIN IMMEDIATE');
    mutate();
    before = snapshot();
  } catch (failure: unknown) {
    primary = { failure };
  } finally {
    release.resolve(undefined);
  }
  const cleanupFailures: unknown[] = [];
  try {
    await holder;
  } catch (failure: unknown) {
    cleanupFailures.push(failure);
  }
  const observed = await pending;
  if (primary !== undefined) {
    if (observed.kind === 'threw') cleanupFailures.push(observed.failure);
    if (cleanupFailures.length !== 0)
      throw new AggregateError(
        [primary.failure, ...cleanupFailures],
        'queued move observation failed',
        { cause: primary.failure },
      );
    throw primary.failure;
  }
  if (cleanupFailures.length !== 0)
    throw new AggregateError(cleanupFailures, 'held move writer failed', {
      cause: cleanupFailures[0],
    });
  if (observed.kind === 'threw') throw observed.failure;
  if (before === undefined) throw new Error('queued move baseline was not captured');
  return { outcome: observed.outcome, before };
}

for (const drift of [
  'organization',
  'membership',
  'organization grant',
  'package grant',
  'restricted',
] as const)
  it('rechecks queued move ' + drift + ' against actual current state', async () => {
    if (drift === 'restricted') {
      sqlite.run("UPDATE work_package SET restricted=0 WHERE id='moving'");
      sqlite.run("DELETE FROM access_grant WHERE id='actor-package'");
    }
    statements.length = 0;
    const { outcome, before } = await queuedMove(caller(), () => {
      switch (drift) {
        case 'organization':
          sqlite.run(
            "INSERT INTO organization_membership(organization_id,user_id,role,created_at) VALUES('foreign','actor','member',1)",
          );
          selectedOrganization = 'foreign';
          break;
        case 'membership':
          sqlite.run(
            "DELETE FROM organization_membership WHERE organization_id='org' AND user_id='actor'",
          );
          break;
        case 'organization grant':
          sqlite.run("DELETE FROM access_grant WHERE id='actor-organization'");
          break;
        case 'package grant':
          sqlite.run("DELETE FROM access_grant WHERE id='actor-package'");
          break;
        case 'restricted':
          sqlite.run("UPDATE work_package SET restricted=1 WHERE id='moving'");
          break;
      }
    });
    expect(outcome).toEqual(
      drift === 'organization'
        ? { ok: false, refusal: 'organization_context_changed' }
        : drift === 'membership'
          ? { ok: false, refusal: 'not_a_member' }
          : {
              ok: false,
              error: 'forbidden',
              permission:
                drift === 'organization grant' ? 'organization.create_project' : 'package.write',
            },
    );
    expect(snapshot()).toEqual(before);
  });

it('uses the actual parent when the queued move starts instead of a retained source assumption', async () => {
  sqlite.run(
    "INSERT INTO project(id,organization_id,name,created_at,created_by) VALUES('new-source','org','New source',1,'creator')",
  );
  statements.length = 0;
  const { outcome } = await queuedMove(caller(), () => {
    sqlite.run("UPDATE work_package SET project_id='new-source' WHERE id='moving'");
  });
  expect(outcome).toEqual({
    kind: 'moved',
    workPackageId: 'moving',
    projectId: 'target',
    revision: 1,
    sourceProject: { id: 'new-source', revision: 1 },
    targetProject: { id: 'target', revision: 1 },
  });
  expect(sqlite.query("SELECT revision,updated_at FROM project WHERE id='source'").get()).toEqual({
    revision: 0,
    updated_at: null,
  });
  const audit = sqlite
    .query<{ detail: string }, []>("SELECT detail FROM organization_audit WHERE id='move-audit'")
    .get();
  if (audit === null) throw new Error('actual queued parent audit is absent');
  expect(JSON.parse(audit.detail)).toEqual({
    workPackageId: 'moving',
    fromProjectId: 'new-source',
    toProjectId: 'target',
    workPackageRevision: 1,
    sourceProjectRevision: 1,
    targetProjectRevision: 1,
  });
});

it('keeps a queued move to its newly current parent byte-identical without a second increment', async () => {
  statements.length = 0;
  const { outcome, before } = await queuedMove(caller(), () => {
    sqlite.run("UPDATE work_package SET project_id='target' WHERE id='moving'");
  });
  expect(outcome).toEqual({
    kind: 'unchanged',
    workPackageId: 'moving',
    projectId: 'target',
    revision: 0,
    sourceProject: { id: 'target', revision: 0 },
    targetProject: { id: 'target', revision: 0 },
  });
  expect(snapshot()).toEqual(before);
});

/** Persists the real credential/account binding; current resolution computes the cap. */
function credentialCaller(kind: 'machine' | 'consent') {
  const id = 'a1111111-1111-4111-8111-111111111111';
  sqlite.run(
    "INSERT INTO person(id,name,kind,account_id) VALUES('move-agent','Agent','agent','actor')",
  );
  sqlite.run(
    "INSERT INTO person_organization(resource_id,organization_id,name) VALUES('move-agent','org','Agent')",
  );
  sqlite.run(
    "INSERT INTO machine_credential(id,organization_id,person_id,issued_by,source,name,created_at,created_by,mcp_family_id) VALUES(?,'org','move-agent','creator',?,'Agent',1,'creator',?)",
    [id, kind === 'machine' ? 'api_key' : 'mcp_consent', kind === 'machine' ? null : 'family'],
  );
  sqlite.run(
    "INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES('move-credential-grant','org','organization','org','machine_credential',?,'org-super-admin','route',1)",
    [id],
  );
  const evidence = caller();
  evidence.principal.authentication =
    kind === 'machine'
      ? { kind: 'machine', credentialId: id, personId: 'move-agent' }
      : {
          kind: 'consent',
          credentialId: id,
          personId: 'move-agent',
          issuer: 'https://issuer.test',
          subject: 'actor',
        };
  evidence.principal.delegation = {
    organizationId: 'org',
    audience: 'wbs-be-01/via-mcp-01',
    client: 'client',
    grant: 'family',
  };
  return evidence;
}
for (const kind of ['machine', 'consent'] as const) {
  it(
    'keeps the actual ' + kind + ' cap despite real account and credential super-admin grants',
    async () => {
      const evidence = credentialCaller(kind);
      const before = snapshot();
      expect(
        await administration.moveWorkPackage(evidence, 'moving', 'target', {
          at: 50,
          auditId: 'move-audit',
        }),
      ).toEqual({ ok: false, error: 'forbidden', permission: 'organization.create_project' });
      expect(snapshot()).toEqual(before);
    },
  );
  for (const drift of ['revocation', 'account binding'] as const)
    it('rechecks queued ' + kind + ' move credential ' + drift + ' before effects', async () => {
      const evidence = credentialCaller(kind);
      statements.length = 0;
      const { outcome, before } = await queuedMove(evidence, () => {
        if (drift === 'revocation')
          sqlite.run(
            "UPDATE machine_credential SET revoked_at=2 WHERE id='a1111111-1111-4111-8111-111111111111'",
          );
        else sqlite.run("UPDATE person SET account_id='creator' WHERE id='move-agent'");
      });
      expect(outcome).toEqual({ ok: false, refusal: 'organization_context_changed' });
      expect(snapshot()).toEqual(before);
    });
}

/** Exact schema and enforcement restoration precede any production observation. */
function corruptStoredMove(
  mutate: () => void,
  triggerNames: readonly string[] = [],
  ignoreChecks = false,
) {
  const schema = sqlite
    .query('SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name')
    .all();
  const triggers = triggerNames.map((name) => {
    const row = sqlite
      .query<{ sql: unknown }, [string]>(
        "SELECT sql FROM sqlite_schema WHERE type='trigger' AND name=?",
      )
      .get(name);
    if (row === null || typeof row.sql !== 'string')
      throw new Error('required move fixture trigger absent: ' + name);
    return { name, sql: row.sql };
  });
  expect(sqlite.query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
  expect(sqlite.query('PRAGMA ignore_check_constraints').get()).toEqual({
    ignore_check_constraints: 0,
  });
  const failures: unknown[] = [];
  const dropped: typeof triggers = [];
  try {
    sqlite.run('PRAGMA foreign_keys=OFF');
    expect(sqlite.query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 0 });
    if (ignoreChecks) sqlite.run('PRAGMA ignore_check_constraints=ON');
    expect(sqlite.query('PRAGMA ignore_check_constraints').get()).toEqual({
      ignore_check_constraints: ignoreChecks ? 1 : 0,
    });
    for (const trigger of triggers) {
      sqlite.run('DROP TRIGGER "' + trigger.name + '"');
      dropped.push(trigger);
    }
    mutate();
  } catch (failure: unknown) {
    failures.push(failure);
  }
  for (const trigger of dropped)
    try {
      sqlite.run(trigger.sql);
    } catch (failure: unknown) {
      failures.push(failure);
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
    throw new AggregateError(failures, 'move fixture corruption/restoration failed', {
      cause: failures[0],
    });
}

for (const fault of [
  'mapping',
  'restriction',
  'source parent',
  'source organization',
  'target content',
] as const)
  it('refuses actual malformed move ' + fault + ' after fixture enforcement restores', async () => {
    switch (fault) {
      case 'mapping':
        corruptStoredMove(
          () =>
            sqlite.run(
              "UPDATE work_package_organization SET organization_id='' WHERE resource_id='moving'",
            ),
          ['work_package_organization_frozen_update'],
        );
        break;
      case 'restriction':
        corruptStoredMove(
          () => sqlite.run("UPDATE work_package SET restricted=2 WHERE id='moving'"),
          [],
          true,
        );
        break;
      case 'source parent':
        corruptStoredMove(() =>
          sqlite.run("UPDATE work_package SET project_id='absent' WHERE id='moving'"),
        );
        break;
      case 'source organization':
        corruptStoredMove(
          () => sqlite.run("UPDATE project SET organization_id='foreign' WHERE id='source'"),
          ['project_work_package_organization_update'],
        );
        break;
      case 'target content':
        corruptStoredMove(
          () => sqlite.run("UPDATE project SET name='' WHERE id='target'"),
          [],
          true,
        );
        break;
    }
    const before = snapshot();
    const failure = await observedFailure(() => move());
    expect(failure).not.toBeInstanceOf(AggregateError);
    expect(failure).toBeInstanceOf(Error);
    if (!(failure instanceof Error))
      throw new Error('expected malformed move diagnostic absent', { cause: failure });
    expect(failure.message).toBe(
      fault === 'mapping'
        ? 'stored move package organization is malformed'
        : fault === 'restriction'
          ? 'stored move package restricted flag is malformed'
          : fault === 'source parent'
            ? 'stored work package parent is absent'
            : fault === 'source organization'
              ? 'stored work package parent organization differs'
              : 'stored project name is malformed',
    );
    expect(snapshot()).toEqual(before);
  });

it('does not skip an unknown reaching permission row beside sufficient admitted move grants', async () => {
  sqlite.run(
    "INSERT INTO access_role_permission(role_id,permission) VALUES('package-manager','unknown.permission')",
  );
  const before = snapshot();
  const failure = await observedFailure(() => move());
  expect(failure).toBeInstanceOf(UnknownPermissionRow);
  expect(snapshot()).toEqual(before);
});

/** Unwraps only the actual known query wrapper; never flattens paired owner failures. */
function nativeMoveFailure(caught: unknown): SQLiteError {
  let failure = caught;
  expect(failure).not.toBeInstanceOf(AggregateError);
  while (failure instanceof DrizzleQueryError) {
    failure = failure.cause;
    expect(failure).not.toBeInstanceOf(AggregateError);
  }
  expect(failure).toBeInstanceOf(SQLiteError);
  if (!(failure instanceof SQLiteError))
    throw new Error('native move ABORT was not observed', { cause: caught });
  return failure;
}
for (const [stage, table, condition] of [
  ['package', 'work_package', "NEW.id='moving'"],
  ['source project', 'project', "NEW.id='source'"],
  ['target project', 'project', "NEW.id='target'"],
  ['audit', 'organization_audit', "NEW.id='move-audit'"],
] as const)
  it('rolls the admitted owner back after actual ' + stage + ' write refusal', async () => {
    sqlite.run(
      'CREATE TRIGGER refuse_admitted_move BEFORE ' +
        (table === 'organization_audit' ? 'INSERT' : 'UPDATE') +
        ' ON ' +
        table +
        ' WHEN ' +
        condition +
        " BEGIN SELECT RAISE(ABORT,'selected admitted move failure'); END",
    );
    const before = snapshot();
    expect(nativeMoveFailure(await observedFailure(() => move())).message).toBe(
      'selected admitted move failure',
    );
    expect(snapshot()).toEqual(before);
    expect(statements.filter((query) => query === 'ROLLBACK')).toHaveLength(1);
    expect(statements).not.toContain('COMMIT');
  });

it('preserves the actual original and rollback failures without classifying a public refusal', async () => {
  sqlite.run(
    "CREATE TRIGGER refuse_admitted_move BEFORE INSERT ON organization_audit WHEN NEW.id='move-audit' BEGIN SELECT RAISE(ABORT,'selected admitted move failure'); END",
  );
  const before = snapshot();
  refuseMoveRollback = true;
  let failure: unknown;
  try {
    failure = await observedFailure(() => move());
  } finally {
    refuseMoveRollback = false;
  }
  let cleanup: { failure: unknown } | undefined;
  try {
    drizzleOuterTransaction(connection.db).rollback();
  } catch (cleanupFailure: unknown) {
    cleanup = { failure: cleanupFailure };
  }
  if (cleanup !== undefined)
    throw new AggregateError(
      [failure, cleanup.failure],
      'paired move fixture rollback recovery failed',
      { cause: cleanup.failure },
    );
  expect(failure).toBeInstanceOf(AggregateError);
  if (!(failure instanceof AggregateError))
    throw new Error('paired move owner failure is absent', { cause: failure });
  expect(failure.message).toBe('security operation and rollback failed');
  expect(failure.errors).toHaveLength(2);
  expect(nativeMoveFailure(failure.errors[0]).message).toBe('selected admitted move failure');
  expect(failure.errors[1]).toMatchObject({ message: 'selected admitted rollback failure' });
  expect(failure.cause).toBe(failure.errors[1]);
  expect(snapshot()).toEqual(before);
});

/** Seeds only the existing synthetic storage receipt; not operational compatibility. */
async function seedMoveRelationships() {
  if (acquired.directory === undefined) throw new Error('admitted move directory is absent');
  acquired.uncertain = true;
  seedDependencyAuthority(join(acquired.directory, 'store.db'));
  acquired.uncertain = false;
  for (const [id, parent] of [
    ['source-neighbor', 'source'],
    ['target-neighbor', 'target'],
  ] as const) {
    const created = await new WorkPackageRepository(connection.db, gate).createInOrganization(
      workPackageRow({ id, name: id, projectId: parent, createdAt: 1 }),
      [],
      { at: 1, by: 'creator' },
      'org',
      { id: id + '-grant', auditId: id + '-granted' },
    );
    if (typeof created === 'string')
      throw new Error('move relationship fixture birth refused: ' + created);
  }
  for (const id of ['moving', 'source-neighbor', 'target-neighbor'])
    await new WorkItemRepository(connection.db, gate).insert(
      workItemRow({ id: id + '-leaf', workPackageId: id }),
      [],
      { at: 1, by: 'creator' },
    );
  statements.length = 0;
}
async function addMoveRelationship(id: string, predecessor: string, successor: string) {
  await new TypedDependencyRepository(connection.db, gate).add(
    {
      id,
      workPackageId: successor,
      predecessor: {
        scope: 'whole',
        workPackageId: predecessor,
        workItemId: predecessor + '-leaf',
      },
      successor: { scope: 'whole', workPackageId: successor, workItemId: successor + '-leaf' },
      type: 'FS',
    },
    { at: 1, by: 'creator' },
  );
  expect(sqlite.query('SELECT id FROM external_dependency WHERE id=?').get(id)).toEqual({ id });
}
for (const direction of ['outgoing', 'incoming'] as const)
  for (const held of [false, true])
    it(
      'keeps admitted ' +
        direction +
        (held ? ' held' : ' active') +
        ' source dependencies as blockers',
      async () => {
        await seedMoveRelationships();
        await addMoveRelationship(
          'blocker',
          direction === 'outgoing' ? 'moving' : 'source-neighbor',
          direction === 'outgoing' ? 'source-neighbor' : 'moving',
        );
        if (held) sqlite.run("UPDATE work_item SET hold='on_hold' WHERE id='moving-leaf'");
        const before = snapshot();
        expect(await move()).toEqual({
          kind: 'dependency_crosses_project',
          dependencyIds: ['blocker'],
        });
        expect(snapshot()).toEqual(before);
      },
    );
it('preserves blocker IDs when the admitted mover cannot read the actual counterpart', async () => {
  await seedMoveRelationships();
  await addMoveRelationship('hidden-counterpart', 'source-neighbor', 'moving');
  sqlite.run("DELETE FROM access_grant WHERE id='actor-organization'");
  sqlite.run(
    "INSERT INTO access_role(id,name,object_kind,organization_id,created_at) VALUES('move-create-only','Move creator only','organization','org',1)",
  );
  sqlite.run(
    "INSERT INTO access_role_permission(role_id,permission) VALUES('move-create-only','organization.create_project'),('move-create-only','organization.navigate')",
  );
  grant('actor-organization', 'move-create-only', 'organization', 'org');
  const readable = await new AccessDecisionRepository(connection.db).readablePackageIds(
    { id: 'actor' },
    'org',
  );
  expect(readable.has('moving')).toBe(true);
  expect(readable.has('source-neighbor')).toBe(false);
  const before = snapshot();
  expect(await move()).toEqual({
    kind: 'dependency_crosses_project',
    dependencyIds: ['hidden-counterpart'],
  });
  expect(snapshot()).toEqual(before);
});
it('allows real destination counterparts and local dependencies without rewriting their rows', async () => {
  await seedMoveRelationships();
  await addMoveRelationship('destination-out', 'moving', 'target-neighbor');
  await addMoveRelationship('destination-in', 'target-neighbor', 'moving');
  await new WorkItemRepository(connection.db, gate).insert(
    workItemRow({ id: 'moving-second', workPackageId: 'moving', position: 200 }),
    [],
    { at: 1, by: 'creator' },
  );
  await new TypedDependencyRepository(connection.db, gate).add(
    {
      id: 'local',
      workPackageId: 'moving',
      predecessor: { scope: 'whole', workPackageId: 'moving', workItemId: 'moving-leaf' },
      successor: { scope: 'whole', workPackageId: 'moving', workItemId: 'moving-second' },
      type: 'FS',
    },
    { at: 1, by: 'creator' },
  );
  expect(sqlite.query("SELECT id FROM typed_dependency WHERE id='local'").get()).toEqual({
    id: 'local',
  });
  const before = snapshot();
  expect(await move()).toMatchObject({ kind: 'moved', revision: 1 });
  expect(
    snapshot().filter(
      ({ name }) => !['project', 'work_package', 'organization_audit'].includes(name),
    ),
  ).toEqual(
    before.filter(({ name }) => !['project', 'work_package', 'organization_audit'].includes(name)),
  );
});
