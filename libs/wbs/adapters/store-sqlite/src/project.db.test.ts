import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  projectCreationAct,
  projectStoreConformance,
  type ProjectStoreFixture,
} from '@wbs/conformance';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { may } from '@wbs/domain';
import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { AccessDecisionRepository } from './access-decisions';
import { AccessGrantRepository } from './access-grant';
import { type Connection, openConnection, openDatabase } from './db';
import { WriteCoordinator } from './gate';
import { ProjectRepository } from './index';
import { readMigrationFolders } from './migrate-down';
import { SqliteOrganizationAuditLog } from './organization-audit-log';
import { createProjectIn, readProjectDetailIn, renameProjectIn } from './project-operations';
import { runSecurityTransaction } from './security-transaction';
import { readCatalogueStepsIn } from './step';
import { StepCatalogueRepository } from './step-catalogue';
import { migrateEmptyCatalogueFixture } from './testing/catalogue-database';
import { seedDependencyAuthority } from './testing/dependency-activation';
import { TypedDependencyRepository } from './typed-dependency';
import { WorkItemRepository } from './work-item';
import { WorkPackageRepository } from './work-package';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const MIGRATION_CEILING = '20261118210000_add_step_retirements';
let directory: string, sqlite: Database, connection: Connection, gate: WriteCoordinator;
let nativeOwners: number;
let statements: string[];
let custody = { hasUnknownOwner: false };
let closeConnection: (() => void) | undefined;
let closeSqlite: (() => void) | undefined;

beforeEach(() => {
  // Proof: removing this fence starts a second real migration after unknown custody; the acquisition-count oracle fails (combined-project-custody-fence-project-store-omitted-v1).
  if (custody.hasUnknownOwner)
    throw new Error('project-store fixture has unknown ownership; retained ' + directory);
  directory = mkdtempSync(join(tmpdir(), 'project-store-'));
  closeConnection = undefined;
  closeSqlite = undefined;
  custody = { hasUnknownOwner: false };
  const path = join(directory, 'store.db');
  migrateEmptyCatalogueFixture({ path, directory, reportedAt: 42 }, custody);
  const folders = readMigrationFolders(FOLDER);
  // Synthetic storage authority only; no runtime compatibility or operational activation claim.
  seedDependencyAuthority(path);
  nativeOwners = 0;
  statements = [];
  try {
    sqlite = openDatabase(path);
    closeSqlite = () => {
      sqlite.close();
    };
    connection = openConnection(
      path,
      {
        logQuery(statement) {
          statements.push(statement);
        },
      },
      () => {
        nativeOwners++;
      },
    );
    closeConnection = () => {
      connection.close();
    };
  } catch (cause: unknown) {
    // Proof: uncertain connection acquisition closes the known raw owner and retains store.db; omitting this latch erases it (combined-project-acquisition-project-store-omitted-v1).
    custody.hasUnknownOwner = true;
    throw cause;
  }
  gate = new WriteCoordinator();
  const expectedMigrations = folders
    .filter(({ name }) => name <= MIGRATION_CEILING)
    .map(({ name, hash }) => ({ name, hash }));
  expect(expectedMigrations.at(-1)?.name).toBe(MIGRATION_CEILING);
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
  sqlite.run("INSERT INTO users(id,username,created_at) VALUES('creator','Creator',1)");
  sqlite.run("INSERT INTO organization(id,name,created_at) VALUES('org-a','A',1),('org-b','B',1)");
  sqlite.run(
    "INSERT INTO organization_membership(organization_id,user_id,role,created_at) VALUES('org-a','creator','member',1),('org-b','creator','member',1)",
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
  // Proof: migration/close uncertainty controls retain store.db; removing this guard erases it (combined-project-fault-project-store-*-custody-omitted-v1).
  if (custody.hasUnknownOwner)
    throw new AggregateError(
      failures,
      'project-store fixture has unknown ownership; retained ' + directory,
    );
  rmSync(directory, { recursive: true });
});

it('grants the actual current project scope within its organization and refuses foreign or absent projects', async () => {
  sqlite.run(
    "INSERT INTO project(id,organization_id,name,created_at,created_by) VALUES('project-a','org-a','A',1,'creator')",
  );
  const grants = new AccessGrantRepository(connection.db, gate);
  const draft = {
    id: 'grant',
    scope: { kind: 'project', projectId: 'project-a' },
    subject: { kind: 'user', userId: 'creator' },
    roleId: 'project-manager',
    origin: 'creation',
  } as const;
  const act = {
    actor: { kind: 'user', userId: 'creator' },
    at: 20,
    auditId: 'grant-audit',
  } as const;
  const created = await grants.grant('org-a', draft, act);
  expect(created).toEqual({
    kind: 'granted',
    grant: {
      id: 'grant',
      organizationId: 'org-a',
      scope: draft.scope,
      subject: draft.subject,
      roleId: 'project-manager',
      origin: 'creation',
      createdAt: 20,
      createdBy: 'creator',
    },
  });
  expect(
    await grants.grant('org-b', { ...draft, id: 'foreign' }, { ...act, auditId: 'foreign-audit' }),
  ).toBe('not_found');
  expect(
    await grants.grant(
      'org-a',
      { ...draft, id: 'absent', scope: { kind: 'project', projectId: 'absent' } },
      { ...act, auditId: 'absent-audit' },
    ),
  ).toBe('not_found');
});

it('reads all four actual current project audit actions through the closed audit reader', async () => {
  const actions = [
    'project_created',
    'project_renamed',
    'project_deleted',
    'work_package_moved',
  ] as const;
  for (const action of actions)
    sqlite.run(
      "INSERT INTO organization_audit(id,organization_id,actor_id,action,subject_kind,subject_id,detail,created_at) VALUES(?,'org-a','creator',?,'project','project-a','{}',20)",
      [action, action],
    );
  expect(
    (await new SqliteOrganizationAuditLog(connection.db).list('org-a')).map(({ action }) => action),
  ).toEqual([...actions].sort());
});

function fixture(): ProjectStoreFixture {
  const store = new ProjectRepository(connection.db, gate),
    grants = new AccessGrantRepository(connection.db, gate),
    audits = new SqliteOrganizationAuditLog(connection.db);
  return {
    store,
    async seedFirstPackageCatalogue() {
      expect(
        await new StepCatalogueRepository(connection.db, gate, 'owned').defineAndBindStep(
          'org-a',
          {
            id: 'catalogue-research',
            code: 'research',
            name: 'Research',
            position: 30,
            defaultEstimateUnit: 'minutes',
            defaultAllowancePercent: 25,
          },
          {
            bindingId: 'catalogue-research:binding',
            scopeKind: 'organization',
            scopeId: 'org-a',
            workItemTypeId: null,
            position: 30,
          },
          { at: 42, by: 'creator' },
        ),
      ).toMatchObject({ ok: true });
    },
    readPackageSteps: (workPackageId) =>
      Promise.resolve(readCatalogueStepsIn(connection.db, workPackageId)),
    async snapshot() {
      return {
        projects: [...(await store.listIn('org-a')), ...(await store.listIn('org-b'))]
          .map(({ workPackageCount: _workPackageCount, ...project }) => project)
          .sort((first, second) => (first.id < second.id ? -1 : 1)),
        grants: [...(await grants.list('org-a', {})), ...(await grants.list('org-b', {}))].sort(
          (first, second) => (first.id < second.id ? -1 : 1),
        ),
        audits: [...(await audits.list('org-a')), ...(await audits.list('org-b'))].sort(
          (first, second) => (first.id < second.id ? -1 : 1),
        ),
      };
    },
    async snapshotMove() {
      const state = await this.snapshot(),
        rows = sqlite.query<{ id: string }, []>('SELECT id FROM work_package ORDER BY id').all(),
        workPackages = [];
      for (const { id } of rows) {
        const workPackage = await new WorkPackageRepository(connection.db, gate).findById(id);
        if (workPackage === null) throw Error('fixture package disappeared');
        workPackages.push(workPackage);
      }
      return {
        ...state,
        workPackages,
        dependencies: await new TypedDependencyRepository(connection.db, gate).listIncident(
          rows.map((row) => row.id),
        ),
      };
    },
    async seedDependency(row) {
      for (const endpoint of [row.predecessor, row.successor]) {
        const prior = sqlite
          .query<{ work_package_id: string }, [string]>(
            'SELECT work_package_id FROM work_item WHERE id=?',
          )
          .get(endpoint.workItemId);
        if (prior === null)
          await new WorkItemRepository(connection.db, gate).insert(
            workItemRow({ id: endpoint.workItemId, workPackageId: endpoint.workPackageId }),
            [],
            { at: 42, by: 'creator' },
          );
        else if (prior.work_package_id !== endpoint.workPackageId)
          throw Error('fixture endpoint belongs to another package');
      }
      await new TypedDependencyRepository(connection.db, gate).add(row, { at: 42, by: 'creator' });
    },
    removeCreatorMembership() {
      sqlite.run(
        "DELETE FROM organization_membership WHERE organization_id='org-a' AND user_id='creator'",
      );
    },
    changeCreatorRole(kind) {
      if (kind === null) sqlite.run("DELETE FROM access_role WHERE id='project-manager'");
      else sqlite.run("UPDATE access_role SET object_kind=? WHERE id='project-manager'", [kind]);
    },
    failAt(stage) {
      const mutation = {
        move_package: ['UPDATE', 'work_package', " WHEN NEW.id='move-w'"],
        move_source: ['UPDATE', 'project', " WHEN NEW.id='move-source'"],
        move_target: ['UPDATE', 'project', " WHEN NEW.id='move-target'"],
        move_audit: ['INSERT', 'organization_audit', " WHEN NEW.action='work_package_moved'"],
        rename: ['UPDATE', 'project', ''],
        rename_audit: ['INSERT', 'organization_audit', " WHEN NEW.action='project_renamed'"],
        delete_grants: ['DELETE', 'access_grant', ''],
        revoke_audit: ['INSERT', 'organization_audit', " WHEN NEW.action='access_revoked'"],
        delete_project: ['DELETE', 'project', ''],
        delete_audit: ['INSERT', 'organization_audit', " WHEN NEW.action='project_deleted'"],
      };
      if (stage in mutation) {
        const [operation, table, condition] = mutation[stage as keyof typeof mutation];
        sqlite.run(
          `CREATE TRIGGER fail_project_mutation BEFORE ${operation} ON ${table}${condition} BEGIN SELECT RAISE(ABORT,'controlled ${stage} write failure'); END`,
        );
        return;
      }
      const table =
        stage === 'project' ? 'project' : stage === 'grant' ? 'access_grant' : 'organization_audit';
      const condition =
        stage === 'project_audit'
          ? " WHEN NEW.action='project_created'"
          : stage === 'grant_audit'
            ? " WHEN NEW.action='access_granted'"
            : '';
      sqlite.run(
        'CREATE TRIGGER fail_project_create BEFORE INSERT ON ' +
          table +
          condition +
          " BEGIN SELECT RAISE(ABORT,'controlled " +
          stage +
          " write failure'); END",
      );
    },
    seedMigrated(project) {
      sqlite.run(
        'INSERT INTO project(id,organization_id,name,revision,created_at,updated_at,created_by) VALUES(?,?,?,?,?,?,?)',
        [
          project.id,
          project.organizationId,
          project.name,
          project.revision,
          project.createdAt,
          project.updatedAt,
          project.createdBy,
        ],
      );
    },
    seedPackage(id, projectId, name) {
      sqlite.run(
        "INSERT INTO work_package(id,project_id,name,created_at,created_by) VALUES(?,?,?,1,'creator')",
        [id, projectId, name],
      );
      sqlite.run(
        'INSERT INTO work_package_organization(resource_id,organization_id) SELECT ?,organization_id FROM project WHERE id=?',
        [id, projectId],
      );
    },
    removePackage(id) {
      sqlite.run('DELETE FROM work_package WHERE id=?', [id]);
    },
    seedGrant(grant) {
      const scopeId =
        grant.scope.kind === 'project'
          ? grant.scope.projectId
          : grant.scope.kind === 'work_package'
            ? grant.scope.workPackageId
            : grant.organizationId;
      const subjectId =
        grant.subject.kind === 'user'
          ? grant.subject.userId
          : grant.subject.kind === 'group'
            ? grant.subject.groupId
            : grant.subject.kind === 'machine_credential'
              ? grant.subject.credentialId
              : grant.organizationId;
      sqlite.run(
        'INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)',
        [
          grant.id,
          grant.organizationId,
          grant.scope.kind,
          scopeId,
          grant.subject.kind,
          subjectId,
          grant.roleId,
          grant.origin,
          grant.createdAt,
          grant.createdBy,
        ],
      );
    },
    seedSuperAdmin() {
      sqlite.run(
        "INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at,created_by) VALUES('org-a-admin','org-a','organization','org-a','user','creator','org-super-admin','creation',1,'creator')",
      );
    },
  };
}

describe('ProjectRepository administration', () => {
  projectStoreConformance(fixture);
});

it('filters foreign malformed child projections before decode and refuses malformed selected child evidence', async () => {
  const opened = fixture();
  await opened.store.create(
    { id: 'p', organizationId: 'org-a', name: 'Alpha' },
    projectCreationAct('p'),
  );
  opened.seedPackage('child', 'p', 'Child');
  sqlite.run("UPDATE work_package SET name=X'426164' WHERE id='child'");
  expect(await opened.store.findIn('org-b', 'p')).toBeNull();
  expect(await opened.store.listIn('org-b')).toEqual([]);
  let failure: unknown;
  try {
    await opened.store.findIn('org-a', 'p');
  } catch (cause: unknown) {
    failure = cause;
  }
  expect(failure).toBeInstanceOf(Error);
  expect(failure).toMatchObject({ message: 'stored project work package entry is malformed' });
  expect(await opened.store.listIn('org-a')).toMatchObject([{ workPackageCount: 1 }]);
});

it('uses one native owner and its actual creator grant reaches only that project while membership remains', async () => {
  const store = new ProjectRepository(connection.db, gate),
    created = await store.create(
      { id: 'p', organizationId: 'org-a', name: 'Alpha' },
      projectCreationAct('p'),
    );
  expect(created).toMatchObject({ kind: 'created' });
  expect(nativeOwners).toBe(1);
  const decisions = new AccessDecisionRepository(connection.db);
  const target = {
    kind: 'project',
    chain: { level: 'project', organizationId: 'org-a', spaceId: null, projectId: 'p' },
  } as const;
  expect(
    may(await decisions.effectiveRoleAt({ id: 'creator' }, target), 'project.manage_settings'),
  ).toBe(true);
  expect(
    await decisions.effectiveRoleAt(
      { id: 'creator' },
      { ...target, chain: { ...target.chain, projectId: 'other' } },
    ),
  ).toBeNull();
  sqlite.run(
    "DELETE FROM organization_membership WHERE organization_id='org-a' AND user_id='creator'",
  );
  expect(await decisions.effectiveRoleAt({ id: 'creator' }, target)).toBeNull();
  expect(sqlite.query("SELECT id FROM access_grant WHERE id='p-grant'").get()).toEqual({
    id: 'p-grant',
  });
});

it('observes the actual project insert before a typed grant refusal and rolls it back before returning', async () => {
  sqlite.run(
    "DELETE FROM organization_membership WHERE organization_id='org-a' AND user_id='creator'",
  );
  const store = new ProjectRepository(connection.db, gate);
  expect(
    await store.create(
      { id: 'p', organizationId: 'org-a', name: 'Alpha' },
      projectCreationAct('p'),
    ),
  ).toBe('not_a_member');
  const insertion = statements.findIndex((statement) =>
    statement.startsWith('insert into "project"'),
  );
  expect(insertion).toBeGreaterThanOrEqual(0);
  expect(
    statements.findIndex((statement) => statement.includes('from "organization_membership"')),
  ).toBeGreaterThan(insertion);
  expect(nativeOwners).toBe(1);
  expect(sqlite.query('SELECT id FROM project').all()).toEqual([]);
  expect(sqlite.query('SELECT id FROM access_grant').all()).toEqual([]);
  expect(sqlite.query('SELECT id FROM organization_audit').all()).toEqual([]);
});

async function expectMalformedProject(pending: Promise<unknown>, field: string): Promise<void> {
  let failure: unknown;
  try {
    await pending;
  } catch (cause: unknown) {
    failure = cause;
  }
  expect(failure).toBeInstanceOf(Error);
  if (!(failure instanceof Error)) throw new Error('selected malformed project was accepted');
  expect(failure.message).toBe('stored project ' + field + ' is malformed');
}

const numericProjectFaults = [
  { column: 'revision', value: 'not-an-integer', kind: 'text', label: 'text' },
  { column: 'revision', value: 0.5, kind: 'real', label: 'fraction' },
  { column: 'revision', value: -1, kind: 'integer', label: 'negative' },
  { column: 'revision', value: Number.MAX_SAFE_INTEGER + 1, kind: 'integer', label: 'unsafe' },
  { column: 'created_at', value: 'not-an-integer', kind: 'text', label: 'text' },
  { column: 'created_at', value: 0.5, kind: 'real', label: 'fraction' },
  { column: 'created_at', value: Number.MAX_SAFE_INTEGER + 1, kind: 'integer', label: 'unsafe' },
  { column: 'updated_at', value: 'not-an-integer', kind: 'text', label: 'text' },
  { column: 'updated_at', value: 0.5, kind: 'real', label: 'fraction' },
  { column: 'updated_at', value: Number.MAX_SAFE_INTEGER + 1, kind: 'integer', label: 'unsafe' },
] as const;

for (const { column, value, kind, label } of numericProjectFaults)
  for (const reader of ['find', 'list'] as const)
    it(
      'refuses actual selected malformed project ' + column + '/' + label + '/' + reader,
      async () => {
        const store = new ProjectRepository(connection.db, gate);
        expect(
          await store.create(
            { id: 'malformed', organizationId: 'org-a', name: 'Malformed' },
            projectCreationAct('malformed'),
          ),
        ).toMatchObject({ kind: 'created' });
        sqlite.run('UPDATE project SET ' + column + '=? WHERE id=?', [value, 'malformed']);
        expect(
          sqlite
            .query<{ value: unknown; kind: string }, [string]>(
              'SELECT ' +
                column +
                ' AS value,typeof(' +
                column +
                ') AS kind FROM project WHERE id=?',
            )
            .get('malformed'),
        ).toEqual({ value, kind });
        await expectMalformedProject(
          reader === 'find' ? store.findIn('org-a', 'malformed') : store.listIn('org-a'),
          column,
        );
      },
    );

it('filters corrupt foreign projects before decoding addressed find and list rows', async () => {
  const store = new ProjectRepository(connection.db, gate);
  await store.create(
    { id: 'good', organizationId: 'org-a', name: 'Good' },
    projectCreationAct('good'),
  );
  await store.create(
    { id: 'foreign', organizationId: 'org-b', name: 'Foreign' },
    projectCreationAct('foreign'),
  );
  sqlite.run("UPDATE project SET revision='not-an-integer' WHERE id='foreign'");
  expect(await store.findIn('org-a', 'foreign')).toBeNull();
  expect(await store.findIn('org-a', 'good')).toMatchObject({ id: 'good', revision: 0 });
  expect((await store.listIn('org-a')).map(({ id }) => id)).toEqual(['good']);
});

for (const reader of ['find', 'list'] as const)
  it('refuses a selected project name stored as a SQL blob on ' + reader, async () => {
    const store = new ProjectRepository(connection.db, gate);
    await store.create(
      { id: 'blob-name', organizationId: 'org-a', name: 'Name' },
      projectCreationAct('blob-name'),
    );
    sqlite.run("UPDATE project SET name=? WHERE id='blob-name'", [new Uint8Array([65])]);
    expect(
      sqlite.query("SELECT typeof(name) AS kind FROM project WHERE id='blob-name'").get(),
    ).toEqual({ kind: 'blob' });
    await expectMalformedProject(
      reader === 'find' ? store.findIn('org-a', 'blob-name') : store.listIn('org-a'),
      'name',
    );
  });

it('reads signed historical integer timestamps and nullable migrated metadata without imposing an epoch', async () => {
  const store = new ProjectRepository(connection.db, gate);
  await store.create(
    { id: 'historical', organizationId: 'org-a', name: 'Historical' },
    projectCreationAct('historical'),
  );
  sqlite.run(
    "UPDATE project SET created_at=-10,updated_at=NULL,created_by=NULL WHERE id='historical'",
  );
  const historical = {
    spaceId: null,
    spacePosition: null,
    id: 'historical',
    organizationId: 'org-a',
    name: 'Historical',
    revision: 0,
    createdAt: -10,
    updatedAt: null,
    createdBy: null,
  };
  expect(await store.findIn('org-a', 'historical')).toEqual({
    ...historical,
    workPackageCount: 0,
    workPackages: [],
  });
  expect(await store.listIn('org-a')).toEqual([{ ...historical, workPackageCount: 0 }]);
  sqlite.run("UPDATE project SET updated_at=-5 WHERE id='historical'");
  expect(await store.findIn('org-a', 'historical')).toEqual({
    ...historical,
    updatedAt: -5,
    workPackageCount: 0,
    workPackages: [],
  });
});

it('commits borrowed create and rename across an await in one actual outer transaction', async () => {
  const act = projectCreationAct('borrowed');
  statements.length = 0;
  nativeOwners = 0;
  const outcome = await runSecurityTransaction(connection.db, gate, async (db) => {
    const created = createProjectIn(
      db,
      { id: 'borrowed', organizationId: 'org-a', name: 'Alpha' },
      act,
    );
    await Promise.resolve();
    const renamed = renameProjectIn(db, 'org-a', 'borrowed', 'Beta', {
      actor: act.actor,
      at: 44,
      auditId: 'borrowed-renamed',
    });
    return { created, renamed };
  });
  expect(outcome.created).toMatchObject({
    kind: 'created',
    project: { id: 'borrowed', name: 'Alpha', revision: 0, workPackageCount: 0 },
  });
  expect(outcome.renamed).toMatchObject({
    kind: 'renamed',
    project: { id: 'borrowed', name: 'Beta', revision: 1, workPackageCount: 0 },
  });
  expect(sqlite.query('SELECT id,name,revision FROM project WHERE id=?').get('borrowed')).toEqual({
    id: 'borrowed',
    name: 'Beta',
    revision: 1,
  });
  const state = await fixture().snapshot();
  expect(state.grants).toMatchObject([
    {
      id: act.grantId,
      scope: { kind: 'project', projectId: 'borrowed' },
      subject: { kind: 'user', userId: 'creator' },
      roleId: 'project-manager',
      origin: 'creation',
    },
  ]);
  expect(
    state.audits.map(({ id, action, subjectKind, subjectId, detail }) => ({
      id,
      action,
      subjectKind,
      subjectId,
      detail,
    })),
  ).toEqual([
    {
      id: act.projectAuditId,
      action: 'project_created',
      subjectKind: 'project',
      subjectId: 'borrowed',
      detail: {},
    },
    {
      id: act.grantAuditId,
      action: 'access_granted',
      subjectKind: 'access_grant',
      subjectId: act.grantId,
      detail: {
        roleId: 'project-manager',
        scopeKind: 'project',
        scopeId: 'borrowed',
        subjectKind: 'user',
        subjectId: 'creator',
        origin: 'creation',
      },
    },
    {
      id: 'borrowed-renamed',
      action: 'project_renamed',
      subjectKind: 'project',
      subjectId: 'borrowed',
      detail: { revision: 1 },
    },
  ]);
  expect(
    statements.filter((statement) => ['BEGIN IMMEDIATE', 'COMMIT', 'ROLLBACK'].includes(statement)),
  ).toEqual(['BEGIN IMMEDIATE', 'COMMIT']);
  expect(nativeOwners).toBe(0);
});

it('rolls borrowed create and rename back across an await through their actual outer owner', async () => {
  const before = await fixture().snapshot();
  const act = projectCreationAct('borrowed-rollback');
  const sentinel = new Error('selected borrowed-project rollback');
  let inside: ReturnType<typeof readProjectDetailIn> | undefined;
  let caught: unknown;
  statements.length = 0;
  nativeOwners = 0;
  try {
    await runSecurityTransaction(connection.db, gate, async (db) => {
      createProjectIn(db, { id: 'borrowed-rollback', organizationId: 'org-a', name: 'Alpha' }, act);
      await Promise.resolve();
      renameProjectIn(db, 'org-a', 'borrowed-rollback', 'Beta', {
        actor: act.actor,
        at: 44,
        auditId: 'borrowed-rollback-renamed',
      });
      inside = readProjectDetailIn(db, 'org-a', 'borrowed-rollback');
      throw sentinel;
    });
  } catch (cause) {
    caught = cause;
  }
  expect(caught).toBe(sentinel);
  expect(inside).toMatchObject({ id: 'borrowed-rollback', name: 'Beta', revision: 1 });
  expect(await fixture().snapshot()).toEqual(before);
  expect(
    statements.filter((statement) => ['BEGIN IMMEDIATE', 'COMMIT', 'ROLLBACK'].includes(statement)),
  ).toEqual(['BEGIN IMMEDIATE', 'ROLLBACK']);
  expect(nativeOwners).toBe(0);
});
