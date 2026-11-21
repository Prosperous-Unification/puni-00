import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { authorizePackage } from '@wbs/core';
import type { ProjectCaller } from '@wbs/core/ports/project-administration';
import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { afterEach, beforeEach, expect, it } from 'bun:test';

import { AccessDecisionRepository } from './access-decisions';
import { SqliteCommandAccess } from './command-access';
import { type Connection, drizzleOuterTransaction, openConnection, openDatabase } from './db';
import { WriteCoordinator } from './gate';
import { MachineCredentialRepository } from './machine-credential';
import { SqliteOrganizationAccess } from './organization-access';
import { ProjectRepository } from './project';
import { SqliteProjectAdministration } from './project-administration';
import { StepCatalogueRepository } from './step-catalogue';
import { migrateEmptyCatalogueFixture } from './testing/catalogue-database';

let directory: string,
  sqlite: ReturnType<typeof openDatabase>,
  connection: Connection,
  gate: WriteCoordinator;
let administration: SqliteProjectAdministration;
let selected = 'org';
const statements: string[] = [];
let refuseRollback = false;
let custody = { hasUnknownOwner: false };
let closeConnection: (() => void) | undefined;
let closeSqlite: (() => void) | undefined;
beforeEach(async () => {
  // Proof: removing this fence starts a second real migration after unknown custody; the acquisition-count oracle fails (combined-project-custody-fence-combined-create-omitted-v1).
  if (custody.hasUnknownOwner)
    throw new Error('combined-create fixture has unknown ownership; retained ' + directory);
  directory = mkdtempSync(join(tmpdir(), 'combined-create-'));
  closeConnection = undefined;
  closeSqlite = undefined;
  custody = { hasUnknownOwner: false };
  const path = join(directory, 'store.db');
  migrateEmptyCatalogueFixture({ path, directory, reportedAt: 1 }, custody);
  try {
    sqlite = openDatabase(path);
    closeSqlite = () => {
      sqlite.close(true);
    };
    connection = openConnection(path, {
      logQuery(statement) {
        statements.push(statement);
        if (refuseRollback && statement === 'ROLLBACK')
          throw new Error('selected rollback failure');
      },
    });
    closeConnection = () => {
      connection.close();
    };
  } catch (cause: unknown) {
    // Proof: uncertain connection acquisition closes the known raw owner and retains store.db; omitting this latch erases it (combined-project-acquisition-combined-create-omitted-v1).
    custody.hasUnknownOwner = true;
    throw cause;
  }
  gate = new WriteCoordinator();
  selected = 'org';
  statements.length = 0;
  refuseRollback = false;
  sqlite.run(
    "INSERT INTO users(id,username,created_at) VALUES('creator','Creator',1),('other','Other',1)",
  );
  sqlite.run(
    "INSERT INTO organization(id,name,created_at) VALUES('org','Org',1),('foreign','Foreign',1)",
  );
  sqlite.run(
    "UPDATE organization_activation SET state='activated',activated_at=1 WHERE singleton=1",
  );
  for (const user of ['creator', 'other'])
    sqlite.run(
      "INSERT INTO organization_membership(organization_id,user_id,role,created_at) VALUES('org',?,'member',1)",
      [user],
    );
  for (const user of ['creator', 'other'])
    sqlite.run(
      "INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES(?,'org','organization','org','user',?,'org-admin','route',1)",
      [user + '-authority', user],
    );
  const catalogue = new StepCatalogueRepository(connection.db, gate, 'owned');
  for (const [id, code, name, position] of [
    ['s-0', 'dev', 'Dev', 10],
    ['s-1', 'qa', 'QA', 20],
  ] as const) {
    expect(
      await catalogue.defineAndBindStep(
        'org',
        { id, code, name, position, defaultEstimateUnit: 'workdays', defaultAllowancePercent: 0 },
        {
          bindingId: id + ':binding',
          scopeKind: 'organization',
          scopeId: 'org',
          workItemTypeId: null,
          position,
        },
        { at: 1, by: 'creator' },
      ),
    ).toMatchObject({ ok: true });
  }
  const organizations = new SqliteOrganizationAccess(
    connection.db,
    () => Promise.resolve(selected),
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
});
afterEach(() => {
  const failures: unknown[] = [];
  for (const close of [closeConnection, closeSqlite]) {
    try {
      close?.();
    } catch (cause: unknown) {
      custody.hasUnknownOwner = true;
      failures.push(cause);
    }
  }
  closeConnection = undefined;
  closeSqlite = undefined;
  // Proof: migration/close uncertainty controls retain store.db; removing this guard erases it (combined-project-fault-combined-create-*-custody-omitted-v1).
  if (custody.hasUnknownOwner)
    throw new AggregateError(
      failures,
      'combined-create fixture has unknown ownership; retained ' + directory,
    );
  rmSync(directory, { recursive: true });
});
function caller(): ProjectCaller {
  return {
    kind: 'human',
    principal: {
      id: 'creator',
      username: 'Creator',
      scopes: ['read', 'write'],
      authentication: { kind: 'first_party', issuedAt: 1 },
      organizationOperation: {
        kind: 'mutation',
        expected: { kind: 'present', organizationId: 'org' },
      },
    },
    expectedAccess: {
      kind: 'scoped',
      principal: { id: 'creator' },
      scope: { organizationId: 'org', userId: 'creator', cap: null },
    },
  };
}
function act() {
  return {
    actor: { kind: 'user' as const, userId: 'creator' },
    at: 17,
    grantId: 'p-grant',
    projectAuditId: 'p-created',
    grantAuditId: 'p-granted',
  };
}
function first(projectId = 'p', id = 'w') {
  return {
    workPackage: workPackageRow({ id, projectId, name: 'First', createdAt: 17 }),
    steps: ['Dev', 'QA'].map((name, index) => ({
      id: (id === 'w' ? 's-' : id + '-s-') + String(index),
      workPackageId: id,
      name,
      position: (index + 1) * 10,
      code: name.toUpperCase(),
      allowancePercent: 0,
      estimateUnit: 'workdays' as const,
    })),
    creatorGrant: { id: id + '-grant', auditId: id + '-granted' },
  };
}
const draft = () => ({ id: 'p', organizationId: 'org', name: 'Plan' });
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
async function expectFailure(operation: Promise<unknown>, diagnostic: string) {
  let rejected = false;
  try {
    await operation;
  } catch (failure: unknown) {
    rejected = true;
    const messages: string[] = [];
    let current = failure;
    while (current instanceof Error) {
      messages.push(current.message);
      current = current.cause;
    }
    expect(messages.join('\n')).toContain(diagnostic);
  }
  expect(rejected).toBe(true);
}
function create() {
  const { actor, ...birth } = act();
  return administration.create(caller(), { id: 'p', name: 'Plan' }, birth, first());
}

it('creates actual parent child steps both creation grants and three audits in one offline owner', async () => {
  const created = await new ProjectRepository(connection.db, gate).create(draft(), act(), first());
  expect(created).toMatchObject({
    kind: 'created_with_work_package',
    project: { id: 'p', workPackageCount: 1 },
    workPackage: { id: 'w', projectId: 'p' },
    steps: [{ id: 's-0' }, { id: 's-1' }],
  });
  expect(
    sqlite
      .query(
        "SELECT role_id,scope_kind,scope_id,subject_id,origin,created_at,created_by FROM access_grant WHERE origin='creation' ORDER BY scope_kind",
      )
      .all(),
  ).toEqual([
    {
      role_id: 'project-manager',
      scope_kind: 'project',
      scope_id: 'p',
      subject_id: 'creator',
      origin: 'creation',
      created_at: 17,
      created_by: 'creator',
    },
    {
      role_id: 'package-manager',
      scope_kind: 'work_package',
      scope_id: 'w',
      subject_id: 'creator',
      origin: 'creation',
      created_at: 17,
      created_by: 'creator',
    },
  ]);
  expect(
    sqlite
      .query('SELECT id,action,subject_id,actor_id,created_at FROM organization_audit ORDER BY id')
      .all(),
  ).toEqual([
    {
      id: 'p-created',
      action: 'project_created',
      subject_id: 'p',
      actor_id: 'creator',
      created_at: 17,
    },
    {
      id: 'p-granted',
      action: 'access_granted',
      subject_id: 'p-grant',
      actor_id: 'creator',
      created_at: 17,
    },
    {
      id: 'w-granted',
      action: 'access_granted',
      subject_id: 'w-grant',
      actor_id: 'creator',
      created_at: 17,
    },
  ]);
  const before = snapshot();
  expect(
    await new ProjectRepository(connection.db, gate).create(
      { ...draft(), id: 'duplicate' },
      {
        ...act(),
        grantId: 'dup-grant',
        projectAuditId: 'dup-created',
        grantAuditId: 'dup-granted',
      },
      first('duplicate', 'dup-w'),
    ),
  ).toBe('name_taken');
  expect(snapshot()).toEqual(before);
});
for (const [stage, table, id] of [
  ['project', 'project', 'p'],
  ['package', 'work_package', 'w'],
  ['project grant', 'access_grant', 'p-grant'],
  ['package grant', 'access_grant', 'w-grant'],
  ['project audit', 'organization_audit', 'p-created'],
  ['project grant audit', 'organization_audit', 'p-granted'],
  ['package grant audit', 'organization_audit', 'w-granted'],
] as const)
  it('rolls every constituent back after actual ' + stage + ' insertion failure', async () => {
    sqlite.run(
      `CREATE TRIGGER refuse_selected BEFORE INSERT ON ${table} WHEN NEW.id='${id}' BEGIN SELECT RAISE(ABORT,'selected ${stage} failure'); END`,
    );
    const before = snapshot();
    await expectFailure(create(), 'selected ' + stage + ' failure');
    expect(snapshot()).toEqual(before);
  });
it('rereads current readable child count after combined birth and uses only one explicit security owner', async () => {
  statements.length = 0;
  expect(await create()).toMatchObject({
    kind: 'created_with_work_package',
    project: { workPackageCount: 1 },
    workPackage: { projectId: 'p' },
  });
  expect(statements.filter((s) => s === 'BEGIN IMMEDIATE')).toHaveLength(1);
  expect(statements.filter((s) => s === 'COMMIT')).toHaveLength(1);
  expect(statements.filter((s) => /savepoint/i.test(s))).toEqual([]);
});
it('rechecks actual child permission after the project grant and rolls the removed authority back', async () => {
  sqlite.run(
    "CREATE TRIGGER revoke_create AFTER INSERT ON organization_audit WHEN NEW.id='p-granted' BEGIN DELETE FROM access_grant WHERE id='creator-authority'; END",
  );
  const before = snapshot();
  expect(await create()).toEqual({
    ok: false,
    error: 'forbidden',
    permission: 'organization.create_project',
  });
  expect(snapshot()).toEqual(before);
});
it('rolls every constituent and corrupted permission row back when postbirth readable projection fails', async () => {
  sqlite.run(
    "CREATE TRIGGER corrupt_projection AFTER INSERT ON organization_audit WHEN NEW.id='w-granted' BEGIN INSERT INTO access_role_permission(role_id,permission) VALUES('package-manager','unknown.permission'); END",
  );
  const before = snapshot();
  await expectFailure(create(), 'unknown.permission');
  expect(snapshot()).toEqual(before);
});
it('rolls both rows and grants back on a later explicit step value or native address failure', async () => {
  for (const stage of ['step', 'address']) {
    const table = stage === 'step' ? 'work_package_step' : 'work_package_abbreviation';
    const condition = stage === 'step' ? "NEW.step_id='s-1'" : "NEW.work_package_id='w'";
    sqlite.run(
      `CREATE TRIGGER refuse_late BEFORE INSERT ON ${table} WHEN ${condition} BEGIN SELECT RAISE(ABORT,'late ${stage} failure'); END`,
    );
    const before = snapshot();
    await expectFailure(create(), 'late ' + stage + ' failure');
    expect(snapshot()).toEqual(before);
    sqlite.run('DROP TRIGGER refuse_late');
  }
});
it('the real user creation grant keeps restricted writes while another organization admin cannot', async () => {
  await create();
  sqlite.run("UPDATE work_package SET restricted=1 WHERE id='w'");
  const created = connection.db
    .select()
    .from((await import('./schema')).workPackage)
    .where((await import('drizzle-orm')).eq((await import('./schema')).workPackage.id, 'w'))
    .get();
  if (!created) throw Error('child missing');
  const decisions = new AccessDecisionRepository(connection.db);
  for (const user of ['creator', 'other']) {
    const access = {
      kind: 'scoped' as const,
      principal: { id: user },
      scope: { organizationId: 'org', userId: user, cap: null },
    };
    expect(
      (await authorizePackage(decisions, access, { id: created.id }, user, 'package.write')).ok,
    ).toBe(user === 'creator');
  }
});
it('retains both births and all identities before the offline owner waits', async () => {
  let release: () => void = () => {
    throw Error('not held');
  };
  const entered = Promise.withResolvers<undefined>();
  const held = gate.enter(async () => {
    entered.resolve(undefined);
    await new Promise<void>((resolve) => {
      release = resolve;
    });
  });
  await entered.promise;
  const child = first(),
    birth = act(),
    parent = draft();
  const pending = new ProjectRepository(connection.db, gate).create(parent, birth, child);
  parent.name = 'Changed';
  child.workPackage.name = 'Changed';
  child.steps[0].name = 'Changed';
  child.creatorGrant.id = 'changed';
  birth.at = 999;
  release();
  await held;
  expect(await pending).toMatchObject({
    project: { name: 'Plan', createdAt: 17 },
    workPackage: { name: 'First' },
    steps: [{ name: 'Dev' }, { name: 'QA' }],
  });
});

it('returns only a modeled allocation refusal after the entire combined owner rolls back', async () => {
  sqlite.run('UPDATE work_package_abbreviation_counter SET next=11881376');
  const before = snapshot();
  expect(await create()).toEqual({
    kind: 'work_package_refused',
    reason: 'abbreviation_exhausted',
  });
  expect(snapshot()).toEqual(before);
});
it('does not classify a paired rollback failure as an allocation refusal', async () => {
  sqlite.run('UPDATE work_package_abbreviation_counter SET next=11881376');
  refuseRollback = true;
  let failure: unknown;
  try {
    await create();
  } catch (caught) {
    failure = caught;
  } finally {
    refuseRollback = false;
  }
  try {
    drizzleOuterTransaction(connection.db).rollback();
  } catch (cleanupFailure) {
    throw new AggregateError(
      [failure, cleanupFailure],
      'selected rollback failure fixture cleanup failed',
      { cause: cleanupFailure },
    );
  }
  expect(failure).toBeInstanceOf(AggregateError);
});
it('rolls the whole birth back when actual parent organization changes during child insertion', async () => {
  sqlite.run(
    "CREATE TRIGGER move_parent AFTER INSERT ON work_package WHEN NEW.id='w' BEGIN UPDATE project SET organization_id='foreign' WHERE id='p'; END",
  );
  const before = snapshot();
  await expectFailure(create(), 'work package project organization mismatch');
  expect(snapshot()).toEqual(before);
});
it('refuses an incoherent declared parent before any combined write', async () => {
  const child = first();
  child.workPackage.projectId = 'foreign-parent';
  const before = snapshot();
  const { actor, ...birth } = act();
  await expectFailure(
    administration.create(caller(), { id: 'p', name: 'Plan' }, birth, child),
    'combined birth parent',
  );
  expect(snapshot()).toEqual(before);
});

it('does not translate an unknown actual child creator role into a normal allocation or name refusal', async () => {
  sqlite.run("DELETE FROM access_role_permission WHERE role_id='package-manager'");
  sqlite.run("DELETE FROM access_role WHERE id='package-manager'");
  const before = snapshot();
  await expectFailure(create(), 'package creator grant refused: unknown_role');
  expect(snapshot()).toEqual(before);
});

for (const malformed of ['cross-component identity', 'step ownership', 'creation instant'] as const)
  it(
    'refuses malformed combined ' +
      malformed +
      ' before requesting or entering the actual write owner',
    async () => {
      const child = first(),
        birth = act();
      if (malformed === 'cross-component identity') child.creatorGrant.id = birth.grantId;
      else if (malformed === 'step ownership') child.steps[0].workPackageId = 'foreign-child';
      else child.workPackage.createdAt = birth.at + 1;
      let requested = 0,
        entered = 0;
      const observingGate = {
        enter<T>(work: () => Promise<T>): Promise<T> {
          requested++;
          return gate.enter(() => {
            entered++;
            return work();
          });
        },
      };
      const store = new ProjectRepository(connection.db, observingGate),
        before = snapshot();
      let failure: unknown,
        rejected = false;
      try {
        await store.create(draft(), birth, child);
      } catch (caught) {
        failure = caught;
        rejected = true;
      }
      expect(rejected).toBe(true);
      expect(failure).toBeInstanceOf(Error);
      if (!(failure instanceof Error)) throw Error('owning malformed birth diagnostic absent');
      expect(failure.message).toBe(
        malformed === 'cross-component identity'
          ? 'combined project, package, step, grant and audit identities must be distinct'
          : 'combined birth parent, step ownership or instant differs',
      );
      expect(snapshot()).toEqual(before);
      expect({ requested, entered }).toEqual({ requested: 0, entered: 0 });
      expect(await store.create(draft(), act(), first())).toMatchObject({
        kind: 'created_with_work_package',
        project: { workPackageCount: 1 },
        workPackage: { id: 'w', projectId: 'p' },
      });
      expect({ requested, entered }).toEqual({ requested: 1, entered: 1 });
    },
  );
