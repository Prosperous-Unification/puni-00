import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type {
  ProjectBirth,
  ProjectCaller,
  ProjectChange,
  ProjectRenamedView,
} from '@wbs/core/ports/project-administration';
import { CONTRIBUTOR_CAP, UnknownPermissionRow } from '@wbs/domain';
import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, expect, it } from 'bun:test';

import { AccessDecisionRepository } from './access-decisions';
import { SqliteCommandAccess } from './command-access';
import { type Connection, openConnection, openDatabase } from './db';
import { OPEN, WriteCoordinator } from './gate';
import { MachineCredentialRepository } from './machine-credential';
import { runMigrations } from './migrate';
import { readMigrationFolders } from './migrate-down';
import { SqliteOrganizationAccess } from './organization-access';
import { SqliteProjectAdministration } from './project-administration';
import { StepCatalogueRepository } from './step-catalogue';
import { migrateEmptyCatalogueFixture } from './testing/catalogue-database';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const MIGRATION_CEILING = '20261110120100_space_holds_projects_people_teams';
const CATALOGUE_CEILING = '20261118210000_add_step_retirements';
let directory: string, sqlite: Database, connection: Connection, gate: WriteCoordinator;
let administration: SqliteProjectAdministration;
let deleteProject: SqliteProjectAdministration['delete'];
let selected: string | null;
let awaitSelection: () => Promise<void>;

function openFixture(
  state: 'activated' | 'pre_activation',
  epoch: 'space' | 'catalogue' = 'space',
) {
  directory = mkdtempSync(join(tmpdir(), 'project-authority-'));
  const migrations = join(directory, 'migrations'),
    path = join(directory, 'store.db');
  const folders = readMigrationFolders(FOLDER);
  if (epoch === 'space') {
    mkdirSync(migrations);
    for (const ceiling of [
      '20261110095999',
      '20261110100000_rename_project_to_work_package',
      '20261110110100_widen_organization_audit_projects',
      MIGRATION_CEILING,
    ]) {
      for (const migration of folders.filter(({ name }) => name <= ceiling))
        cpSync(join(FOLDER, migration.name), join(migrations, migration.name), { recursive: true });
      runMigrations(path, migrations);
    }
  } else {
    migrateEmptyCatalogueFixture({ path, directory, reportedAt: 1 }, { hasUnknownOwner: false });
  }
  sqlite = openDatabase(path);
  connection = openConnection(path);
  gate = new WriteCoordinator();
  const ceiling = epoch === 'space' ? MIGRATION_CEILING : CATALOGUE_CEILING;
  const expectedMigrations = folders
    .filter(({ name }) => name <= ceiling)
    .map(({ name, hash }) => ({ name, hash }));
  expect(expectedMigrations.at(-1)?.name).toBe(ceiling);
  expect(
    sqlite
      .query<{ name: string; hash: string }, []>(
        'SELECT name,hash FROM __drizzle_migrations ORDER BY name',
      )
      .all(),
  ).toEqual(expectedMigrations);
  const projectColumns = sqlite
    .query<{ name: string }, []>('PRAGMA table_info(project)')
    .all()
    .map(({ name }) => name);
  expect(projectColumns).toContain('space_id');
  expect(projectColumns).toContain('space_position');
  selected = 'org-a';
  awaitSelection = () => Promise.resolve();
  const organizations = new SqliteOrganizationAccess(
    connection.db,
    async () => {
      await awaitSelection();
      return selected;
    },
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
  // eslint-disable-next-line drizzle/enforce-delete-with-where -- binds the domain ProjectAdministration method; project-operations owns its scoped SQL builder.
  deleteProject = administration.delete.bind(administration);
  sqlite.run(
    "INSERT INTO users(id,username,created_at) VALUES('creator','Creator',1),('other','Other',1)",
  );
  sqlite.run("INSERT INTO organization(id,name,created_at) VALUES('org-a','A',1),('org-b','B',1)");
  if (state === 'activated')
    sqlite.run(
      "UPDATE organization_activation SET state='activated',activated_at=1 WHERE singleton=1",
    );
  for (const organization of ['org-a', 'org-b']) {
    for (const user of ['creator', 'other'])
      sqlite.run(
        "INSERT INTO organization_membership(organization_id,user_id,role,created_at) VALUES(?,?,'member',1)",
        [organization, user],
      );
    sqlite.run(
      "INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES(?,?,'organization',?,'user','creator','org-super-admin','route',1)",
      [organization + '-authority', organization, organization],
    );
    const id = organization === 'org-a' ? 'existing' : 'foreign';
    sqlite.run(
      "INSERT INTO project(id,organization_id,name,created_at,created_by) VALUES(?,?,?,1,'creator')",
      [id, organization, id],
    );
    sqlite.run(
      "INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES(?,?,'project',?,'user','creator','project-manager','creation',1)",
      [id + '-grant', organization, id],
    );
  }
}

beforeEach(() => {
  openFixture('activated');
});
afterEach(closeFixture);

function closeFixture() {
  connection.close();
  sqlite.close();
  rmSync(directory, { recursive: true, force: true });
}

function createCaller(): ProjectCaller {
  return {
    kind: 'human',
    principal: {
      id: 'creator',
      username: 'Creator',
      scopes: ['read', 'write'],
      authentication: { kind: 'first_party', issuedAt: 1 },
      organizationOperation: {
        kind: 'mutation',
        expected: { kind: 'present', organizationId: 'org-a' },
      },
    },
    expectedAccess: {
      kind: 'scoped',
      principal: { id: 'creator' },
      scope: { organizationId: 'org-a', userId: 'creator', cap: null },
    },
  };
}
function createBirth(): ProjectBirth {
  return {
    at: 20,
    grantId: 'new-grant',
    projectAuditId: 'new-created',
    grantAuditId: 'new-granted',
  };
}
function createChange(): ProjectChange {
  return { at: 30, auditId: 'changed' };
}
function snapshotWrites() {
  return Object.fromEntries(
    ['project', 'access_grant', 'organization_audit'].map((table) => [
      table,
      sqlite.query('SELECT * FROM ' + table + ' ORDER BY id').all(),
    ]),
  );
}
async function expectAuditFailure(pending: Promise<unknown>) {
  let failure: unknown;
  try {
    await pending;
  } catch (cause: unknown) {
    failure = cause;
  }
  expect(failure).toBeInstanceOf(Error);
  while (failure instanceof Error && failure.cause !== undefined) {
    expect(failure).not.toBeInstanceOf(AggregateError);
    failure = failure.cause;
  }
  if (!(failure instanceof Error)) throw new Error('native audit refusal is absent');
  expect(failure.message).toContain('controlled late project audit');
}
async function holdWriter() {
  const entered = Promise.withResolvers<undefined>(),
    release = Promise.withResolvers<undefined>();
  const held = gate.enter(async () => {
    entered.resolve(undefined);
    await release.promise;
  });
  await entered.promise;
  return async () => {
    release.resolve(undefined);
    await held;
  };
}
const operations = ['create', 'rename', 'delete'] as const;
function invokeWrite(operation: (typeof operations)[number], evidence = createCaller()) {
  switch (operation) {
    case 'create':
      return administration.create(evidence, { id: 'new', name: 'New' }, createBirth());
    case 'rename':
      return administration.rename(evidence, 'existing', 'Renamed', createChange());
    case 'delete':
      return deleteProject(evidence, 'existing', createChange());
  }
}

for (const operation of operations) {
  it(
    operation + ' rechecks the real current browser organization inside the queued owner',
    async () => {
      const release = await holdWriter(),
        before = snapshotWrites();
      const pending = invokeWrite(operation);
      selected = 'org-b';
      await release();
      expect(await pending).toEqual({ ok: false, refusal: 'organization_context_changed' });
      expect(snapshotWrites()).toEqual(before);
    },
  );
  for (const authority of ['grant', 'membership'] as const)
    it(
      operation + ' refuses current ' + authority + ' removal before its queued turn',
      async () => {
        const release = await holdWriter();
        const pending = invokeWrite(operation);
        sqlite.run(
          authority === 'grant'
            ? "DELETE FROM access_grant WHERE id='org-a-authority'"
            : "DELETE FROM organization_membership WHERE organization_id='org-a' AND user_id='creator'",
        );
        const before = snapshotWrites();
        await release();
        expect(await pending).toEqual(
          authority === 'grant'
            ? { ok: false, error: 'forbidden', permission: 'organization.create_project' }
            : { ok: false, refusal: 'not_a_member' },
        );
        expect(snapshotWrites()).toEqual(before);
      },
    );
  it(operation + ' rejects read-only scope before acquiring the writer', async () => {
    const evidence = createCaller();
    evidence.principal.scopes = ['read'];
    const release = await holdWriter(),
      before = snapshotWrites();
    try {
      expect(await invokeWrite(operation, evidence)).toEqual({
        ok: false,
        error: 'insufficient_scope',
      });
      expect(snapshotWrites()).toEqual(before);
    } finally {
      await release();
    }
  });
}

it('commits the actual scoped creator grant and both creation audits', async () => {
  const outcome = await invokeWrite('create');
  expect(outcome).toEqual({
    kind: 'created',
    project: {
      spaceId: null,
      spacePosition: null,
      id: 'new',
      organizationId: 'org-a',
      name: 'New',
      revision: 0,
      createdAt: 20,
      updatedAt: 20,
      createdBy: 'creator',
      workPackageCount: 0,
    },
  });
  expect(
    sqlite
      .query(
        "SELECT id,scope_id,subject_id,role_id,origin,created_at,created_by FROM access_grant WHERE id='new-grant'",
      )
      .get(),
  ).toEqual({
    id: 'new-grant',
    scope_id: 'new',
    subject_id: 'creator',
    role_id: 'project-manager',
    origin: 'creation',
    created_at: 20,
    created_by: 'creator',
  });
  expect(
    sqlite.query('SELECT id,actor_id,action,created_at FROM organization_audit ORDER BY id').all(),
  ).toEqual([
    { id: 'new-created', actor_id: 'creator', action: 'project_created', created_at: 20 },
    { id: 'new-granted', actor_id: 'creator', action: 'access_granted', created_at: 20 },
  ]);
});

it('renames with current authority and cascades direct grants under the same CP14 owner', async () => {
  expect(await invokeWrite('rename')).toMatchObject({
    kind: 'renamed',
    project: { id: 'existing', name: 'Renamed', revision: 1, updatedAt: 30 },
  });
  expect(await deleteProject(createCaller(), 'existing', { at: 40, auditId: 'deleted' })).toEqual({
    kind: 'deleted',
  });
  expect(sqlite.query('SELECT id FROM project ORDER BY id').all()).toEqual([{ id: 'foreign' }]);
  expect(sqlite.query('SELECT id FROM access_grant ORDER BY id').all()).toEqual([
    { id: 'foreign-grant' },
    { id: 'org-a-authority' },
    { id: 'org-b-authority' },
  ]);
  expect(
    sqlite
      .query('SELECT actor_id,action,created_at FROM organization_audit ORDER BY created_at,action')
      .all(),
  ).toEqual([
    { actor_id: 'creator', action: 'project_renamed', created_at: 30 },
    { actor_id: 'creator', action: 'access_revoked', created_at: 40 },
    { actor_id: 'creator', action: 'project_deleted', created_at: 40 },
  ]);
});

for (const operation of operations)
  it(
    operation + ' rolls all writes back on a late audit failure after real async admission',
    async () => {
      const action =
        operation === 'create'
          ? 'access_granted'
          : operation === 'rename'
            ? 'project_renamed'
            : 'project_deleted';
      sqlite.run(
        `CREATE TRIGGER fail_late_project BEFORE INSERT ON organization_audit WHEN NEW.action='${action}' BEGIN SELECT RAISE(ABORT,'controlled late project audit'); END`,
      );
      const before = snapshotWrites();
      await expectAuditFailure(invokeWrite(operation));
      expect(snapshotWrites()).toEqual(before);
    },
  );

it('retains complete caller evidence and explicit birth before waiting', async () => {
  const evidence = createCaller(),
    draft = { id: 'new', name: 'Original' },
    act = createBirth();
  const release = await holdWriter();
  const pending = administration.create(evidence, draft, act);
  evidence.principal.id = 'other';
  const operation = evidence.principal.organizationOperation;
  if (operation === undefined) throw new Error('fixture organization operation is absent');
  Object.assign(operation.expected, { organizationId: 'org-b' });
  Object.assign(evidence.expectedAccess.scope, { organizationId: 'org-b', userId: 'other' });
  draft.id = 'substitute';
  draft.name = 'Changed';
  Object.assign(act, {
    at: 999,
    grantId: 'substitute-grant',
    projectAuditId: 'substitute-created',
    grantAuditId: 'substitute-granted',
  });
  await release();
  expect(await pending).toMatchObject({
    kind: 'created',
    project: {
      id: 'new',
      organizationId: 'org-a',
      name: 'Original',
      createdAt: 20,
      createdBy: 'creator',
    },
  });
  expect(
    sqlite.query("SELECT id,created_at,created_by FROM access_grant WHERE id='new-grant'").get(),
  ).toEqual({ id: 'new-grant', created_at: 20, created_by: 'creator' });
  expect(
    sqlite.query('SELECT id,actor_id,created_at FROM organization_audit ORDER BY id').all(),
  ).toEqual([
    { id: 'new-created', actor_id: 'creator', created_at: 20 },
    { id: 'new-granted', actor_id: 'creator', created_at: 20 },
  ]);
});

for (const state of ['unselected', 'wrong-user'] as const)
  it('refuses real current ' + state + ' evidence before touching a target', async () => {
    const evidence = createCaller(),
      before = snapshotWrites();
    if (state === 'unselected') selected = null;
    else Object.assign(evidence.expectedAccess.scope, { userId: 'other' });
    expect(await invokeWrite('rename', evidence)).toEqual({
      ok: false,
      refusal: state === 'wrong-user' ? 'organization_context_changed' : 'no_active_organization',
    });
    expect(snapshotWrites()).toEqual(before);
  });

it('holds the actual writer while the real browser resolver awaits', async () => {
  const entered = Promise.withResolvers<undefined>(),
    release = Promise.withResolvers<undefined>();
  awaitSelection = async () => {
    entered.resolve(undefined);
    await release.promise;
  };
  const pending = invokeWrite('create');
  await entered.promise;
  let secondEntered = false;
  const second = gate.enter(() => {
    secondEntered = true;
    return Promise.resolve();
  });
  try {
    await Promise.resolve();
    await Promise.resolve();
    expect(secondEntered).toBe(false);
  } finally {
    release.resolve(undefined);
  }
  expect(await pending).toMatchObject({ kind: 'created' });
  await second;
  expect(secondEntered).toBe(true);
});

it('rolls back a modeled creator grant refusal after insertion', async () => {
  sqlite.run("DELETE FROM access_grant WHERE role_id='project-manager'");
  sqlite.run("DELETE FROM access_role WHERE id='project-manager'");
  const before = snapshotWrites();
  expect(await invokeWrite('create')).toBe('unknown_role');
  expect(snapshotWrites()).toEqual(before);
});

it('rolls back empty-project deletion when no current direct super-admin remains', async () => {
  sqlite.run("UPDATE access_grant SET role_id='org-admin' WHERE id='org-a-authority'");
  const before = snapshotWrites();
  expect(await invokeWrite('delete')).toBe('last_super_admin');
  expect(snapshotWrites()).toEqual(before);
});

for (const operation of ['rename', 'delete'] as const) {
  it(operation + ' hides foreign and absent targets alike after current admission', async () => {
    const before = snapshotWrites();
    for (const id of ['foreign', 'absent'])
      expect(
        await (operation === 'rename'
          ? administration.rename(createCaller(), id, 'Changed', createChange())
          : deleteProject(createCaller(), id, createChange())),
      ).toBe('not_found');
    expect(snapshotWrites()).toEqual(before);
  });
  it(operation + ' retains caller-owned audit identity and instant before waiting', async () => {
    const act = createChange(),
      release = await holdWriter();
    const pending =
      operation === 'rename'
        ? administration.rename(createCaller(), 'existing', 'Original', act)
        : deleteProject(createCaller(), 'existing', act);
    Object.assign(act, { auditId: 'substitute', at: 999 });
    await release();
    expect(await pending).toMatchObject({ kind: operation === 'rename' ? 'renamed' : 'deleted' });
    expect(
      sqlite
        .query("SELECT id,actor_id,created_at FROM organization_audit WHERE id='changed'")
        .get(),
    ).toEqual({ id: 'changed', actor_id: 'creator', created_at: 30 });
    expect(
      sqlite.query("SELECT id FROM organization_audit WHERE id='substitute'").get(),
    ).toBeNull();
  });
}

function seedCredential(kind: 'machine' | 'consent') {
  const id = crypto.randomUUID();
  sqlite.run(
    "INSERT INTO person(id,name,kind,account_id) VALUES('agent','Agent','agent','creator')",
  );
  sqlite.run(
    "INSERT INTO person_organization(resource_id,organization_id,name) VALUES('agent','org-a','Agent')",
  );
  sqlite.run(
    "INSERT INTO machine_credential(id,organization_id,person_id,issued_by,source,name,created_at,created_by,mcp_family_id) VALUES(?,'org-a','agent','creator',?,'Agent',1,'creator',?)",
    [id, kind === 'machine' ? 'api_key' : 'mcp_consent', kind === 'machine' ? null : 'family'],
  );
  sqlite.run(
    "INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES('credential-grant','org-a','organization','org-a','machine_credential',?,'org-super-admin','route',1)",
    [id],
  );
  const evidence = createCaller();
  evidence.principal.authentication =
    kind === 'machine'
      ? { kind: 'machine', credentialId: id, personId: 'agent' }
      : {
          kind: 'consent',
          credentialId: id,
          personId: 'agent',
          issuer: 'https://issuer.test',
          subject: 'creator',
        };
  evidence.principal.delegation = {
    organizationId: 'org-a',
    audience: 'wbs-be-01/via-mcp-01',
    client: 'client',
    grant: 'family',
  };
  Object.assign(evidence.expectedAccess.scope, { cap: CONTRIBUTOR_CAP, delegated: true });
  return { evidence, id };
}

for (const kind of ['machine', 'consent'] as const) {
  it(kind + ' retains full authentication and applies the actual contributor cap', async () => {
    const { evidence } = seedCredential(kind),
      release = await holdWriter(),
      before = snapshotWrites();
    const pending = invokeWrite('create', evidence);
    delete evidence.principal.authentication;
    delete evidence.principal.delegation;
    await release();
    expect(await pending).toEqual({
      ok: false,
      error: 'forbidden',
      permission: 'organization.create_project',
    });
    expect(snapshotWrites()).toEqual(before);
  });
  for (const drift of ['revoked', 'binding'] as const)
    it(kind + ' rechecks actual current credential ' + drift + ' before any write', async () => {
      const { evidence, id } = seedCredential(kind),
        release = await holdWriter();
      const pending = invokeWrite('create', evidence);
      sqlite.run(
        drift === 'revoked'
          ? 'UPDATE machine_credential SET revoked_at=2 WHERE id=?'
          : "UPDATE person SET account_id='other' WHERE id='agent'",
        drift === 'revoked' ? [id] : [],
      );
      const before = snapshotWrites();
      await release();
      expect(await pending).toEqual({ ok: false, refusal: 'organization_context_changed' });
      expect(snapshotWrites()).toEqual(before);
    });
}

it('refuses a genuine pre-activation organization context without reversing activation', async () => {
  closeFixture();
  openFixture('pre_activation');
  const before = snapshotWrites();
  expect(await invokeWrite('rename')).toEqual({
    ok: false,
    refusal: 'organization_context_changed',
  });
  expect(snapshotWrites()).toEqual(before);
});

async function seedPrivateChildren() {
  expect(
    sqlite
      .query(
        "SELECT id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at FROM access_grant WHERE id='existing-grant'",
      )
      .get(),
  ).toEqual({
    id: 'existing-grant',
    organization_id: 'org-a',
    scope_kind: 'project',
    scope_id: 'existing',
    subject_kind: 'user',
    subject_id: 'creator',
    role_id: 'project-manager',
    origin: 'creation',
    created_at: 1,
  });
  sqlite.run(
    "DELETE FROM access_grant WHERE id='existing-grant' AND organization_id='org-a' AND scope_kind='project' AND scope_id='existing' AND subject_kind='user' AND subject_id='creator' AND role_id='project-manager'",
  );
  sqlite.run(
    "DELETE FROM access_grant WHERE organization_id='org-a' AND scope_kind='organization' AND subject_id='creator'",
  );
  sqlite.run(
    "INSERT INTO access_role(id,name,object_kind,organization_id,created_at) VALUES('project-creator-only','Project creator only','organization','org-a',1)",
  );
  sqlite.run(
    "INSERT INTO access_role_permission(role_id,permission) VALUES('project-creator-only','organization.create_project'),('project-creator-only','project.read')",
  );
  sqlite.run(
    "INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES('private-create','org-a','organization','org-a','user','creator','project-creator-only','route',1),('private-governance','org-a','organization','org-a','user','other','org-super-admin','route',1)",
  );
  for (const id of ['a-visible', 'b-hidden']) {
    sqlite.run(
      "INSERT INTO work_package(id,name,project_id,restricted,created_at,created_by) VALUES(?,?,'existing',1,1,'creator')",
      [id, id],
    );
    sqlite.run(
      "INSERT INTO work_package_organization(resource_id,organization_id) VALUES(?,'org-a')",
      [id],
    );
  }
  const permissions = sqlite
    .query<{ permission: string }, []>(
      "SELECT permission FROM access_role_permission WHERE role_id='project-creator-only' ORDER BY permission",
    )
    .all()
    .map(({ permission }) => permission);
  expect(permissions).toEqual(['organization.create_project', 'project.read']);
  expect(permissions).not.toContain('package.read');
  expect(
    sqlite
      .query(
        "SELECT id,scope_kind,scope_id,role_id FROM access_grant WHERE organization_id='org-a' AND subject_kind='user' AND subject_id='creator' ORDER BY id",
      )
      .all(),
  ).toEqual([
    {
      id: 'private-create',
      scope_kind: 'organization',
      scope_id: 'org-a',
      role_id: 'project-creator-only',
    },
  ]);
  expect([
    ...(await new AccessDecisionRepository(connection.db).readablePackageIds(
      createCaller().expectedAccess.principal,
      'org-a',
    )),
  ]).toEqual([]);
}
function grantVisibleChild() {
  sqlite.run(
    "INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES('private-reader','org-a','work_package','a-visible','user','creator','package-viewer','route',1)",
  );
}
function expectRenamedCount(workPackageCount: number): ProjectRenamedView {
  return {
    kind: 'renamed',
    project: {
      spaceId: null,
      spacePosition: null,
      id: 'existing',
      organizationId: 'org-a',
      name: 'Renamed',
      revision: 1,
      createdAt: 1,
      updatedAt: 30,
      createdBy: 'creator',
      workPackageCount,
    },
  };
}

it('renames with only the current readable child count for a project-only creator', async () => {
  await seedPrivateChildren();
  expect(
    await administration.rename(createCaller(), 'existing', 'Renamed', createChange()),
  ).toEqual(expectRenamedCount(0));
});
it('refuses deletion of hidden-only children without exposing their identities or total', async () => {
  await seedPrivateChildren();
  const before = snapshotWrites();
  expect(await deleteProject(createCaller(), 'existing', createChange())).toEqual({
    kind: 'not_empty',
    workPackageIds: [],
  });
  expect(snapshotWrites()).toEqual(before);
});
it('counts only actual directly readable children after a successful rename', async () => {
  await seedPrivateChildren();
  grantVisibleChild();
  expect(
    await administration.rename(createCaller(), 'existing', 'Renamed', createChange()),
  ).toEqual(expectRenamedCount(1));
});
it('returns only actual directly readable child identities in a non-empty refusal', async () => {
  await seedPrivateChildren();
  grantVisibleChild();
  const before = snapshotWrites();
  expect(await deleteProject(createCaller(), 'existing', createChange())).toEqual({
    kind: 'not_empty',
    workPackageIds: ['a-visible'],
  });
  expect(snapshotWrites()).toEqual(before);
});
for (const operation of ['rename', 'delete'] as const)
  it(operation + ' uses child grants current when its queued owner begins', async () => {
    await seedPrivateChildren();
    grantVisibleChild();
    const release = await holdWriter();
    const pending =
      operation === 'rename'
        ? administration.rename(createCaller(), 'existing', 'Renamed', createChange())
        : deleteProject(createCaller(), 'existing', createChange());
    sqlite.run("DELETE FROM access_grant WHERE id='private-reader'");
    await release();
    expect(await pending).toEqual(
      operation === 'rename' ? expectRenamedCount(0) : { kind: 'not_empty', workPackageIds: [] },
    );
  });
it('rolls rename and audit back when the same-owner child projection finds newly corrupt permission state', async () => {
  await seedPrivateChildren();
  const before = snapshotWrites(),
    permissions = sqlite
      .query('SELECT * FROM access_role_permission ORDER BY role_id,permission')
      .all(),
    roles = sqlite.query('SELECT * FROM access_role ORDER BY id').all();
  sqlite.run(
    "CREATE TRIGGER corrupt_projection AFTER UPDATE ON project WHEN NEW.id='existing' BEGIN INSERT INTO access_role_permission(role_id,permission) VALUES('project-creator-only','unknown.permission'); END",
  );
  let failure: unknown;
  try {
    await administration.rename(createCaller(), 'existing', 'Renamed', createChange());
  } catch (cause: unknown) {
    failure = cause;
  }
  expect(failure).toBeInstanceOf(UnknownPermissionRow);
  expect(snapshotWrites()).toEqual(before);
  expect(sqlite.query('SELECT * FROM access_role ORDER BY id').all()).toEqual(roles);
  expect(
    sqlite.query('SELECT * FROM access_role_permission ORDER BY role_id,permission').all(),
  ).toEqual(permissions);
});

it('reports all readable children in their actual order without extra public fields', async () => {
  await seedPrivateChildren();
  grantVisibleChild();
  sqlite.run(
    "INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES('private-second-reader','org-a','work_package','b-hidden','user','creator','package-viewer','route',1)",
  );
  expect(
    await administration.rename(createCaller(), 'existing', 'Renamed', createChange()),
  ).toEqual(expectRenamedCount(2));
  const before = snapshotWrites();
  expect(
    await deleteProject(createCaller(), 'existing', { at: 31, auditId: 'all-readable-delete' }),
  ).toEqual({ kind: 'not_empty', workPackageIds: ['a-visible', 'b-hidden'] });
  expect(snapshotWrites()).toEqual(before);
});

it('rolls back when the just-renamed project disappears before its owner projects the response', async () => {
  const before = snapshotWrites();
  sqlite.run(
    "CREATE TRIGGER remove_renamed_project AFTER UPDATE ON project WHEN NEW.id='existing' BEGIN DELETE FROM project WHERE id=NEW.id; END",
  );
  let failure: unknown;
  try {
    await administration.rename(createCaller(), 'existing', 'Renamed', createChange());
  } catch (cause: unknown) {
    failure = cause;
  }
  expect(failure).toBeInstanceOf(Error);
  if (!(failure instanceof Error)) throw new Error('missing-row refusal is absent');
  expect(failure.message).toBe('renamed project is absent inside its owner');
  expect(snapshotWrites()).toEqual(before);
});

function combinedFirst() {
  return {
    workPackage: workPackageRow({ id: 'new-w', projectId: 'new', name: 'First', createdAt: 20 }),
    steps: [
      {
        id: 'new-s',
        workPackageId: 'new-w',
        name: 'Research',
        position: 10,
        code: 'RES',
        allowancePercent: 0,
        estimateUnit: 'workdays' as const,
      },
    ],
    creatorGrant: { id: 'new-w-grant', auditId: 'new-w-granted' },
  };
}
function combinedWrites() {
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
function invokeCombined(evidence = createCaller()) {
  return administration.create(
    evidence,
    { id: 'new', name: 'New' },
    createBirth(),
    combinedFirst(),
  );
}
for (const kind of ['machine', 'consent'] as const) {
  it(
    'combined ' +
      kind +
      ' preserves actual credential evidence and contributor cap before either birth',
    async () => {
      const { evidence } = seedCredential(kind),
        release = await holdWriter(),
        before = combinedWrites();
      const pending = invokeCombined(evidence);
      delete evidence.principal.authentication;
      delete evidence.principal.delegation;
      await release();
      expect(await pending).toEqual({
        ok: false,
        error: 'forbidden',
        permission: 'organization.create_project',
      });
      expect(combinedWrites()).toEqual(before);
    },
  );
  it(
    'combined ' + kind + ' rechecks actual revocation while queued before any constituent',
    async () => {
      const { evidence, id } = seedCredential(kind),
        release = await holdWriter();
      const pending = invokeCombined(evidence);
      sqlite.run('UPDATE machine_credential SET revoked_at=2 WHERE id=?', [id]);
      const before = combinedWrites();
      await release();
      expect(await pending).toEqual({ ok: false, refusal: 'organization_context_changed' });
      expect(combinedWrites()).toEqual(before);
    },
  );
}
for (const drift of ['organization', 'membership'] as const)
  it('combined rechecks queued ' + drift + ' without child or allocator effects', async () => {
    const release = await holdWriter(),
      pending = invokeCombined();
    if (drift === 'organization') selected = 'org-b';
    else
      sqlite.run(
        "DELETE FROM organization_membership WHERE organization_id='org-a' AND user_id='creator'",
      );
    const before = combinedWrites();
    await release();
    expect(await pending).toEqual({
      ok: false,
      refusal: drift === 'organization' ? 'organization_context_changed' : 'not_a_member',
    });
    expect(combinedWrites()).toEqual(before);
  });
it('retains the complete combined birth and current caller before the admitted queue', async () => {
  closeFixture();
  openFixture('activated', 'catalogue');
  const bound = await new StepCatalogueRepository(connection.db, OPEN, 'owned').defineAndBindStep(
    'org-a',
    {
      id: 'research-definition',
      name: 'Research',
      code: 'research',
      position: 10,
      defaultEstimateUnit: 'workdays',
      defaultAllowancePercent: 0,
    },
    {
      bindingId: 'research-binding',
      scopeKind: 'organization',
      scopeId: 'org-a',
      workItemTypeId: null,
      position: 10,
    },
    { at: 1, by: 'creator' },
  );
  if (!bound.ok) throw new Error('combined birth catalogue setup refused: ' + bound.reason);
  const evidence = createCaller(),
    child = combinedFirst(),
    birth = { ...createBirth() },
    parent = { id: 'new', name: 'Original' },
    release = await holdWriter();
  const pending = administration.create(evidence, parent, birth, child);
  evidence.principal.id = 'other';
  parent.name = 'Changed';
  child.workPackage.name = 'Changed';
  child.steps[0].name = 'Changed';
  child.creatorGrant.id = 'Changed';
  birth.at = 999;
  await release();
  expect(await pending).toMatchObject({
    kind: 'created_with_work_package',
    project: { name: 'Original', createdBy: 'creator', workPackageCount: 1 },
    workPackage: { name: 'First', createdAt: 20 },
    steps: [{ id: 'research-definition', name: 'Research' }],
  });
  expect(
    sqlite.query("SELECT subject_id,created_at FROM access_grant WHERE id='new-w-grant'").get(),
  ).toEqual({ subject_id: 'creator', created_at: 20 });
});
it('combined refuses genuine preactivation without marker or other effects', async () => {
  closeFixture();
  openFixture('pre_activation');
  const before = combinedWrites();
  expect(await invokeCombined()).toEqual({ ok: false, refusal: 'organization_context_changed' });
  expect(combinedWrites()).toEqual(before);
});
