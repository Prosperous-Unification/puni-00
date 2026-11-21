import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { OrganizationPrincipal } from '@wbs/core/ports/organization-access';
import type { ProjectCaller } from '@wbs/core/ports/project-administration';
import { CONTRIBUTOR_CAP } from '@wbs/domain';
import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';

import { type Connection, type Drizzle, openDatabase, openReadOnlyConnection } from './db';
import { SqliteProjectRead } from './project-read';
import { openSqliteSource, type SqliteSource } from './source';
import { migrateEmptyCatalogueFixture } from './testing/catalogue-database';
import { CAPABLE_BACKEND_DEPENDENCY_CAPABILITY } from './testing/dependency-capability';

let directory: string, path: string, sqlite: Database, source: SqliteSource;
let acquisitions: number, closes: number, live: number;
let statements: string[];
let waitSelection: () => Promise<void>;
let observedPrincipal: OrganizationPrincipal | undefined;

function openFixture(isActivated = true) {
  directory = mkdtempSync(join(tmpdir(), 'wbs-project-read-'));
  path = join(directory, 'store.db');
  migrateEmptyCatalogueFixture({ path, directory, reportedAt: 1 }, { hasUnknownOwner: false });
  sqlite = openDatabase(path);
  sqlite.run(
    "INSERT INTO users(id,username,created_at) VALUES('reader','Reader',1),('other','Other',1)",
  );
  sqlite.run("INSERT INTO organization(id,name,created_at) VALUES('org-a','A',1),('org-b','B',1)");
  if (isActivated)
    sqlite.run(
      "UPDATE organization_activation SET state='activated',activated_at=1 WHERE singleton=1",
    );
  sqlite.run(
    "INSERT INTO organization_membership(organization_id,user_id,role,created_at) VALUES('org-a','reader','member',1),('org-b','reader','member',1),('org-a','other','member',1)",
  );
  sqlite.run(
    "INSERT INTO project(id,organization_id,name,created_at,created_by) VALUES('alpha','org-a','Alpha',1,'reader'),('beta','org-a','Beta',2,'reader'),('foreign','org-b','Foreign',3,'reader')",
  );
  sqlite.run(
    'CREATE TABLE fixture_project_selection(user_id TEXT PRIMARY KEY,organization_id TEXT)',
  );
  sqlite.run("INSERT INTO fixture_project_selection VALUES('reader','org-a')");
  for (const [id, parent, restricted] of [
    ['open', 'alpha', 0],
    ['secret', 'alpha', 1],
    ['second', 'beta', 0],
    ['abroad', 'foreign', 0],
  ] as const) {
    sqlite.run(
      'INSERT INTO work_package(id,name,project_id,restricted,created_at,created_by) VALUES(?,?,?,?,1,?)',
      [id, id.toUpperCase(), parent, restricted, 'reader'],
    );
    sqlite.run('INSERT INTO work_package_organization(resource_id,organization_id) VALUES(?,?)', [
      id,
      parent === 'foreign' ? 'org-b' : 'org-a',
    ]);
  }
  acquisitions = 0;
  closes = 0;
  live = 0;
  statements = [];
  observedPrincipal = undefined;
  waitSelection = () => Promise.resolve();
  source = openSqliteSource({
    dbPath: path,
    dependencyCapability: CAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
    openReadOnlyConnection: (dbPath) => {
      const connection = openReadOnlyConnection(dbPath, {
        logQuery(statement) {
          statements.push(statement);
        },
      });
      acquisitions++;
      live++;
      return {
        db: connection.db,
        close() {
          closes++;
          connection.close();
          live--;
        },
      };
    },
  });
}
beforeEach(() => {
  openFixture();
});
afterEach(async () => {
  await source.close();
  sqlite.close(true);
  rmSync(directory, { recursive: true, force: true });
});

function caller(): ProjectCaller {
  return {
    kind: 'human',
    principal: {
      id: 'reader',
      username: 'Reader',
      scopes: ['read', 'write'],
      authentication: { kind: 'first_party', issuedAt: 1 },
      organizationOperation: {
        kind: 'read',
        expected: { kind: 'present', organizationId: 'org-a' },
      },
    },
    expectedAccess: {
      kind: 'scoped',
      principal: { id: 'reader' },
      scope: { organizationId: 'org-a', userId: 'reader', cap: null },
    },
  };
}
function activeOrganizationOf(snapshot: Drizzle) {
  return async (principal: OrganizationPrincipal): Promise<string | null> => {
    await waitSelection();
    observedPrincipal = structuredClone(principal);
    const selection = snapshot
      .all<{ organizationId: unknown }>(
        sql`SELECT organization_id AS organizationId FROM fixture_project_selection WHERE user_id=${principal.id}`,
      )
      .at(0);
    if (selection === undefined || selection.organizationId === null) return null;
    if (typeof selection.organizationId !== 'string')
      throw new Error('malformed fixture organization selection');
    return selection.organizationId;
  };
}
function reader() {
  return source.createProjectRead({ activeOrganizationOf, now: () => 100 });
}
function grant(
  role = 'org-viewer',
  subject: 'user' | 'machine_credential' = 'user',
  subjectId = 'reader',
  scope: 'organization' | 'work_package' | 'project' = 'organization',
  scopeId = 'org-a',
) {
  sqlite.run(
    "INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES(?,?,?,?,?,?,?,'route',1)",
    [crypto.randomUUID(), 'org-a', scope, scopeId, subject, subjectId, role],
  );
}
function seedCredential(kind: 'machine' | 'consent'): ProjectCaller {
  sqlite.run(
    "INSERT INTO person(id,name,kind,account_id) VALUES('agent','Agent','agent','reader')",
  );
  sqlite.run(
    "INSERT INTO person_organization(resource_id,organization_id,name) VALUES('agent','org-a','Agent')",
  );
  sqlite.run(
    "INSERT INTO machine_credential(id,organization_id,person_id,issued_by,source,name,created_at,created_by,mcp_family_id) VALUES('00000000-0000-4000-8000-000000000001','org-a','agent','reader',?,'Agent',1,'reader',?)",
    [kind === 'machine' ? 'api_key' : 'mcp_consent', kind === 'machine' ? null : 'family'],
  );
  const evidence = caller();
  evidence.principal.authentication =
    kind === 'machine'
      ? { kind: 'machine', credentialId: '00000000-0000-4000-8000-000000000001', personId: 'agent' }
      : {
          kind: 'consent',
          credentialId: '00000000-0000-4000-8000-000000000001',
          personId: 'agent',
          issuer: 'https://issuer.test',
          subject: 'reader',
        };
  evidence.principal.delegation = {
    organizationId: 'org-a',
    audience: 'wbs-be-01/via-mcp-01',
    client: 'client',
    grant: 'family',
  };
  Object.assign(evidence.expectedAccess.scope, { cap: CONTRIBUTOR_CAP, delegated: true });
  return evidence;
}
async function observedFailure(pending: Promise<unknown>): Promise<unknown> {
  try {
    await pending;
  } catch (failure) {
    return failure;
  }
  throw new Error('expected a trusted-state failure');
}
function holdSelection() {
  const entered = Promise.withResolvers<undefined>(),
    release = Promise.withResolvers<undefined>();
  waitSelection = async () => {
    entered.resolve(undefined);
    await release.promise;
  };
  return {
    entered: entered.promise,
    release() {
      waitSelection = () => Promise.resolve();
      release.resolve(undefined);
    },
  };
}

it('constructs lazily and omits projects lacking both project.read and a readable child', async () => {
  const projects = reader();
  expect({ acquisitions, live, closes }).toEqual({ acquisitions: 0, live: 0, closes: 0 });
  expect(await projects.list(caller())).toEqual({ ok: true, value: [] });
  expect(await projects.read(caller(), 'alpha')).toEqual({ ok: true, value: null });
  expect({ acquisitions, live, closes }).toEqual({ acquisitions: 1, live: 1, closes: 0 });
});
it('applies current project grants to their real children while preserving P5 on organization grants', async () => {
  grant();
  grant('project-manager', 'user', 'reader', 'project', 'alpha');
  const projects = reader();
  expect(await projects.read(caller(), 'alpha')).toMatchObject({
    ok: true,
    value: {
      workPackageCount: 2,
      workPackages: [
        { id: 'open', name: 'OPEN' },
        { id: 'secret', name: 'SECRET' },
      ],
    },
  });
  grant('package-viewer', 'user', 'reader', 'work_package', 'secret');
  expect(await projects.read(caller(), 'alpha')).toMatchObject({
    ok: true,
    value: {
      workPackageCount: 2,
      workPackages: [
        { id: 'open', name: 'OPEN' },
        { id: 'secret', name: 'SECRET' },
      ],
    },
  });
  expect(await projects.list(caller())).toMatchObject({
    ok: true,
    value: [
      { id: 'alpha', workPackageCount: 2 },
      { id: 'beta', workPackageCount: 1 },
    ],
  });
});
it('returns null alike for absent and foreign projects without decoding foreign malformed metadata', async () => {
  sqlite.run("UPDATE project SET created_at=x'0102' WHERE id='foreign'");
  expect(await reader().read(caller(), 'foreign')).toEqual({ ok: true, value: null });
  expect(await reader().read(caller(), 'absent')).toEqual({ ok: true, value: null });
  expect(await reader().list(caller())).toMatchObject({
    ok: true,
    value: [],
  });
});
it('uses one readable-ID statement and one batched child query for a list', async () => {
  grant();
  await reader().list(caller());
  console.log('project-read observed statements ' + JSON.stringify(statements));
  expect(
    statements.filter((statement) => statement.includes("SELECT 'package', wp.package_id")),
  ).toHaveLength(1);
  expect(
    statements.filter(
      (statement) => statement.includes('AS "projectId"') && statement.includes('AS "childId"'),
    ),
  ).toHaveLength(1);
});
it('returns detached explicit fields and arrays that cannot mutate a later observation', async () => {
  grant();
  const projects = reader(),
    first = await projects.read(caller(), 'alpha');
  if (!first.ok || first.value === null) throw new Error('missing own project');
  expect(Object.keys(first.value).sort()).toEqual(
    [
      'createdAt',
      'createdBy',
      'id',
      'name',
      'organizationId',
      'revision',
      'spaceId',
      'spacePosition',
      'updatedAt',
      'workPackageCount',
      'workPackages',
    ].sort(),
  );
  Object.assign(first.value, { name: 'Forged', workPackageCount: 99 });
  Object.assign(first.value.workPackages[0], { name: 'Forged child' });
  expect(await projects.read(caller(), 'alpha')).toMatchObject({
    ok: true,
    value: { name: 'Alpha', workPackageCount: 1, workPackages: [{ id: 'open', name: 'OPEN' }] },
  });
  expect(sqlite.query("SELECT name FROM project WHERE id='alpha'").get()).toEqual({
    name: 'Alpha',
  });
});
it('keeps browser authority and rows on the first-SQL snapshot across a rival membership and row commit', async () => {
  grant();
  const projects = reader(),
    hold = holdSelection(),
    pending = projects.read(caller(), 'alpha');
  await hold.entered;
  try {
    sqlite.run('BEGIN IMMEDIATE');
    sqlite.run(
      "DELETE FROM organization_membership WHERE organization_id='org-a' AND user_id='reader'",
    );
    sqlite.run("DELETE FROM access_grant WHERE subject_id='reader'");
    sqlite.run("UPDATE project SET name='Changed' WHERE id='alpha'");
    sqlite.run("UPDATE work_package SET name='Changed child',restricted=1 WHERE id='open'");
    sqlite.run('COMMIT');
  } finally {
    hold.release();
  }
  expect(await pending).toMatchObject({
    ok: true,
    value: { name: 'Alpha', workPackageCount: 1, workPackages: [{ id: 'open', name: 'OPEN' }] },
  });
  expect(await projects.read(caller(), 'alpha')).toEqual({ ok: false, refusal: 'not_a_member' });
});
it('keeps a distinguishing grant and child projection coherent and refreshes on the next read', async () => {
  grant();
  const projects = reader(),
    hold = holdSelection(),
    pending = projects.read(caller(), 'alpha');
  await hold.entered;
  try {
    sqlite.run('BEGIN IMMEDIATE');
    sqlite.run("DELETE FROM access_grant WHERE subject_id='reader'");
    sqlite.run("UPDATE project SET name='Changed' WHERE id='alpha'");
    sqlite.run("UPDATE work_package SET name='Changed child' WHERE id='open'");
    sqlite.run('COMMIT');
  } finally {
    hold.release();
  }
  expect(await pending).toMatchObject({
    ok: true,
    value: { name: 'Alpha', workPackageCount: 1, workPackages: [{ id: 'open', name: 'OPEN' }] },
  });
  expect(await projects.read(caller(), 'alpha')).toMatchObject({
    ok: true,
    value: null,
  });
});
it('reads committed state while the process writer retains an uncommitted project', async () => {
  source.db.run('BEGIN IMMEDIATE');
  try {
    source.db.run(
      "INSERT INTO project(id,organization_id,name,created_at,created_by) VALUES('staged','org-a','Staged',1,'reader')",
    );
    expect(await reader().read(caller(), 'staged')).toEqual({ ok: true, value: null });
  } finally {
    source.db.run('ROLLBACK');
  }
});
it('retains nested browser evidence before the active-organization await', async () => {
  grant();
  const evidence = caller(),
    hold = holdSelection();
  const binding = {
    credential: {
      kind: 'native' as const,
      userId: 'reader',
      digest: 'a'.repeat(64),
      expiresAt: 1000,
    },
    cookie: 'fixture-selection',
  };
  evidence.principal.organizationBinding = structuredClone(binding);
  const operation = evidence.principal.organizationOperation,
    authentication = evidence.principal.authentication;
  if (operation === undefined || authentication === undefined)
    throw new Error('browser fixture evidence is absent');
  const pending = reader().read(evidence, 'alpha');
  await hold.entered;
  Object.assign(evidence.principal.organizationBinding.credential, {
    digest: 'b'.repeat(64),
    userId: 'other',
  });
  Object.assign(evidence.principal.organizationBinding, { cookie: 'changed' });
  Object.assign(evidence.expectedAccess.scope, { organizationId: 'org-b', userId: 'other' });
  Object.assign(evidence.expectedAccess.principal, { id: 'other' });
  Object.assign(operation, {
    expected: { kind: 'present', organizationId: 'org-b' },
  });
  Object.assign(authentication, { issuedAt: -999 });
  evidence.principal.id = 'other';
  hold.release();
  expect(await pending).toMatchObject({ ok: true, value: { id: 'alpha', workPackageCount: 1 } });
  expect(observedPrincipal?.organizationBinding).toEqual(binding);
});
for (const kind of ['machine', 'consent'] as const) {
  it(
    kind + ' retains credential evidence without inheriting full parent read from its account',
    async () => {
      grant('org-super-admin');
      const evidence = seedCredential(kind);
      grant(
        'package-viewer',
        'machine_credential',
        '00000000-0000-4000-8000-000000000001',
        'work_package',
        'secret',
      );
      const authentication = evidence.principal.authentication,
        delegation = evidence.principal.delegation;
      if (authentication === undefined || delegation === undefined)
        throw new Error('credential fixture evidence is absent');
      const pending = reader().read(evidence, 'alpha');
      Object.assign(authentication, {
        credentialId: 'wrong',
        personId: 'wrong',
      });
      Object.assign(delegation, { organizationId: 'org-b', grant: 'wrong' });
      Object.assign(evidence.expectedAccess.scope, { organizationId: 'org-b', userId: 'other' });
      expect(await pending).toEqual({ ok: false, error: 'forbidden', permission: 'project.read' });
    },
  );
  for (const fault of ['revoked', 'binding', 'source', ...(kind === 'consent' ? ['family'] : [])]) {
    it(kind + ' refuses actual current credential ' + fault, async () => {
      const evidence = seedCredential(kind);
      if (fault === 'revoked')
        sqlite.run(
          "UPDATE machine_credential SET revoked_at=2 WHERE id='00000000-0000-4000-8000-000000000001'",
        );
      else if (fault === 'binding')
        sqlite.run("UPDATE person SET account_id='other' WHERE id='agent'");
      else if (fault === 'source')
        sqlite.run(
          "UPDATE machine_credential SET source=?,mcp_family_id=? WHERE id='00000000-0000-4000-8000-000000000001'",
          [kind === 'machine' ? 'mcp_consent' : 'api_key', kind === 'machine' ? 'family' : null],
        );
      else
        sqlite.run(
          "UPDATE machine_credential SET mcp_family_id='changed' WHERE id='00000000-0000-4000-8000-000000000001'",
        );
      expect(await reader().list(evidence)).toEqual({
        ok: false,
        refusal: 'organization_context_changed',
      });
    });
  }
}
for (const mismatch of ['organization', 'user', 'unselected', 'removed']) {
  it('returns the actual ' + mismatch + ' scoped refusal', async () => {
    const evidence = caller();
    if (mismatch === 'organization')
      Object.assign(evidence.expectedAccess.scope, { organizationId: 'org-b' });
    else if (mismatch === 'user') Object.assign(evidence.expectedAccess.scope, { userId: 'other' });
    else if (mismatch === 'unselected')
      sqlite.run("DELETE FROM fixture_project_selection WHERE user_id='reader'");
    else
      sqlite.run(
        "DELETE FROM organization_membership WHERE organization_id='org-a' AND user_id='reader'",
      );
    expect(await reader().list(evidence)).toEqual({
      ok: false,
      refusal:
        mismatch === 'removed'
          ? 'not_a_member'
          : mismatch === 'unselected'
            ? 'no_active_organization'
            : 'organization_context_changed',
    });
  });
}
it('preserves actual scoped caller refusal on pre-activation rather than claiming the defensive legacy arm', async () => {
  await source.close();
  sqlite.close(true);
  rmSync(directory, { recursive: true, force: true });
  openFixture(false);
  expect(await reader().list(caller())).toEqual({
    ok: false,
    refusal: 'organization_context_changed',
  });
});
for (const fault of [
  'missing-role',
  'malformed-permission',
  'project-metadata',
  'child-identity',
  'child-name',
]) {
  it('throws on selected trusted ' + fault + ' and releases its observation', async () => {
    grant();
    if (fault === 'missing-role') {
      sqlite.run('PRAGMA foreign_keys=OFF');
      sqlite.run("DELETE FROM access_role WHERE id='org-viewer'");
    } else if (fault === 'malformed-permission') {
      sqlite.run('PRAGMA ignore_check_constraints=ON');
      sqlite.run(
        "UPDATE access_role_permission SET permission='unknown.permission' WHERE role_id='org-viewer' AND permission='package.read'",
      );
    } else if (fault === 'project-metadata')
      sqlite.run("UPDATE project SET created_at=x'0102' WHERE id='alpha'");
    else if (fault === 'child-name')
      sqlite.run("UPDATE work_package SET name=x'0102' WHERE id='open'");
    else {
      sqlite.run('PRAGMA foreign_keys=OFF');
      sqlite.run("UPDATE work_package SET id=x'0102' WHERE id='open'");
    }
    const failure = await observedFailure(
      fault === 'child-name' ? reader().read(caller(), 'alpha') : reader().list(caller()),
    );
    expect(failure).toBeInstanceOf(Error);
    const diagnostic = failure instanceof Error ? failure.message : '';
    expect(diagnostic).toContain(
      fault === 'missing-role'
        ? 'references missing access role'
        : fault === 'malformed-permission'
          ? 'unknown.permission'
          : fault === 'project-metadata'
            ? 'stored project created_at is malformed'
            : fault === 'child-identity'
              ? 'package target has an absent or malformed identity'
              : 'stored project work package entry is malformed',
    );
    expect({ acquisitions, live, closes }).toEqual({ acquisitions: 1, live: 1, closes: 0 });
    await source.close();
    expect({ live, closes }).toEqual({ live: 0, closes: 1 });
  });
}
it('reuses the released loan after a selected full-project decoding throw and a modeled refusal', async () => {
  grant();
  const projects = reader();
  sqlite.run("UPDATE project SET created_at=x'0102' WHERE id='alpha'");
  expect(await observedFailure(projects.list(caller()))).toBeInstanceOf(Error);
  sqlite.run("UPDATE project SET created_at=1 WHERE id='alpha'");
  expect(await projects.list(caller())).toMatchObject({ ok: true });
  sqlite.run("DELETE FROM fixture_project_selection WHERE user_id='reader'");
  expect(await projects.list(caller())).toEqual({ ok: false, refusal: 'no_active_organization' });
  sqlite.run("INSERT INTO fixture_project_selection VALUES('reader','org-a')");
  expect(await projects.list(caller())).toMatchObject({ ok: true });
  expect({ acquisitions, live, closes }).toEqual({ acquisitions: 1, live: 1, closes: 0 });
});
it('closes idle loans and lets an active observation finish after source close', async () => {
  const projects = reader();
  const hold = holdSelection(),
    pending = projects.list(caller());
  await hold.entered;
  try {
    await source.close();
    expect({ live, closes }).toEqual({ live: 1, closes: 0 });
    expect(await observedFailure(projects.list(caller()))).toMatchObject({
      message: 'the read connection pool is closed',
    });
  } finally {
    hold.release();
  }
  expect(await pending).toMatchObject({ ok: true });
  expect({ live, closes }).toEqual({ live: 0, closes: 1 });
});
it('releases its real pinned snapshot so all rival WAL frames can checkpoint after settlement', async () => {
  sqlite.run('PRAGMA wal_autocheckpoint=0');
  const projects = reader(),
    hold = holdSelection(),
    pending = projects.list(caller());
  await hold.entered;
  let held: { busy: number; log: number; checkpointed: number } | null;
  try {
    sqlite.run("UPDATE project SET name='Rival' WHERE id='alpha'");
    held = sqlite
      .query<{ busy: number; log: number; checkpointed: number }, []>(
        'PRAGMA wal_checkpoint(PASSIVE)',
      )
      .get();
    if (held === null) throw new Error('missing actual held checkpoint observation');
    expect(held.log).toBeGreaterThan(held.checkpointed);
    expect(held.log).toBeGreaterThan(0);
  } finally {
    hold.release();
  }
  expect(await pending).toMatchObject({ ok: true });
  const settled = sqlite
    .query<{ busy: number; log: number; checkpointed: number }, []>(
      'PRAGMA wal_checkpoint(PASSIVE)',
    )
    .get();
  if (settled === null) throw new Error('missing actual settled checkpoint observation');
  expect(settled.log).toBe(settled.checkpointed);
  console.log('project-read checkpoint frames ' + JSON.stringify({ held, settled }));
});
it('propagates acquisition failure before any authority is fabricated', async () => {
  const failure = new Error('controlled read acquisition refusal');
  const projects = new SqliteProjectRead({
    openConnection() {
      throw failure;
    },
    activeOrganizationOf,
    now: () => 100,
  });
  expect(await observedFailure(projects.list(caller()))).toBe(failure);
});
it('closes a real connection when native BEGIN refuses an already active transaction', async () => {
  let attempts = 0;
  const projects = new SqliteProjectRead({
    openConnection() {
      const connection: Connection = openReadOnlyConnection(path);
      connection.db.run('BEGIN DEFERRED');
      return {
        db: connection.db,
        close() {
          attempts++;
          connection.close();
        },
      };
    },
    activeOrganizationOf,
    now: () => 100,
  });
  const failure = await observedFailure(projects.list(caller()));
  expect(failure).toBeInstanceOf(Error);
  expect(failure instanceof Error && failure.message).toContain('Failed query: BEGIN DEFERRED');
  let native = failure;
  while (native instanceof Error && native.cause !== undefined) native = native.cause;
  expect(native instanceof Error && native.message).toContain('within a transaction');
  expect(attempts).toBe(1);
});

it('lists exact package-only shells and refuses their detail without inventing full metadata', async () => {
  grant('package-viewer', 'user', 'reader', 'work_package', 'open');
  const projects = reader();
  expect(await projects.list(caller())).toEqual({
    ok: true,
    value: [{ id: 'alpha', name: 'Alpha' }],
  });
  expect(await projects.read(caller(), 'alpha')).toEqual({
    ok: false,
    error: 'forbidden',
    permission: 'project.read',
  });
  expect(await projects.read(caller(), 'beta')).toEqual({ ok: true, value: null });
  sqlite.run("DELETE FROM access_grant WHERE subject_id='reader'");
  expect(await projects.list(caller())).toEqual({ ok: true, value: [] });
  expect(await projects.read(caller(), 'alpha')).toEqual({ ok: true, value: null });
});

it('keeps custom package-read-only project roles as shells despite current child inheritance', async () => {
  sqlite.run(
    "INSERT INTO access_role(id,name,object_kind,level,reaches_restricted,organization_id,created_at) VALUES('p3-package-only','P3 package only','project',NULL,0,'org-a',1)",
  );
  sqlite.run(
    "INSERT INTO access_role_permission(role_id,permission) VALUES('p3-package-only','package.read')",
  );
  grant('p3-package-only', 'user', 'reader', 'project', 'alpha');
  expect(await reader().list(caller())).toEqual({
    ok: true,
    value: [{ id: 'alpha', name: 'Alpha' }],
  });
  expect(await reader().read(caller(), 'alpha')).toEqual({
    ok: false,
    error: 'forbidden',
    permission: 'project.read',
  });
});

for (const kind of ['machine', 'consent'] as const) {
  it(
    kind +
      ' actual credential lists its package shell and gains full parent only from its own project grant',
    async () => {
      grant('org-super-admin');
      const evidence = seedCredential(kind);
      grant(
        'package-viewer',
        'machine_credential',
        '00000000-0000-4000-8000-000000000001',
        'work_package',
        'secret',
      );
      const projects = reader();
      expect(await projects.list(evidence)).toEqual({
        ok: true,
        value: [{ id: 'alpha', name: 'Alpha' }],
      });
      expect(await projects.read(evidence, 'alpha')).toEqual({
        ok: false,
        error: 'forbidden',
        permission: 'project.read',
      });
      grant(
        'project-viewer',
        'machine_credential',
        '00000000-0000-4000-8000-000000000001',
        'project',
        'alpha',
      );
      expect(await projects.list(evidence)).toMatchObject({
        ok: true,
        value: [{ id: 'alpha', workPackageCount: 2 }],
      });
      expect(await projects.read(evidence, 'alpha')).toMatchObject({
        ok: true,
        value: {
          id: 'alpha',
          workPackageCount: 2,
          workPackages: [{ id: 'open' }, { id: 'secret' }],
        },
      });
    },
  );
}

it('keeps a pinned full result coherent while a rival revokes parent read and changes metadata', async () => {
  grant('project-viewer', 'user', 'reader', 'project', 'alpha');
  grant('package-viewer', 'user', 'reader', 'work_package', 'open');
  const projects = reader(),
    hold = holdSelection(),
    pending = projects.list(caller());
  await hold.entered;
  try {
    sqlite.run('BEGIN IMMEDIATE');
    sqlite.run("DELETE FROM access_grant WHERE scope_kind='project' AND subject_id='reader'");
    sqlite.run("UPDATE project SET name='Changed parent' WHERE id='alpha'");
    sqlite.run('COMMIT');
  } finally {
    hold.release();
  }
  expect(await pending).toMatchObject({
    ok: true,
    value: [{ id: 'alpha', name: 'Alpha', workPackageCount: 2 }],
  });
  expect(await projects.list(caller())).toEqual({
    ok: true,
    value: [{ id: 'alpha', name: 'Changed parent' }],
  });
});

it('keeps a shell parent and its name in one pinned snapshot across an actual parent change', async () => {
  grant('package-viewer', 'user', 'reader', 'work_package', 'open');
  const projects = reader(),
    hold = holdSelection(),
    pending = projects.list(caller());
  await hold.entered;
  try {
    sqlite.run('BEGIN IMMEDIATE');
    sqlite.run("UPDATE work_package SET project_id='beta' WHERE id='open'");
    sqlite.run("UPDATE project SET name='Changed beta' WHERE id='beta'");
    sqlite.run('COMMIT');
  } finally {
    hold.release();
  }
  expect(await pending).toEqual({ ok: true, value: [{ id: 'alpha', name: 'Alpha' }] });
  expect(await projects.list(caller())).toEqual({
    ok: true,
    value: [{ id: 'beta', name: 'Changed beta' }],
  });
});

it('uses a fixed project grant batch and child batch when listing many projects', async () => {
  grant();
  for (let index = 0; index < 8; index++)
    sqlite.run('INSERT INTO project(id,organization_id,name,created_at) VALUES(?,?,?,1)', [
      'p3-many-' + String(index),
      'org-a',
      'Many ' + String(index),
    ]);
  statements.length = 0;
  const listed = await reader().list(caller());
  expect(listed.ok && listed.value.length).toBe(10);
  expect(
    statements.filter((statement) =>
      statement.includes("SELECT 'grant' AS row_kind, reach.grant_id"),
    ),
  ).toHaveLength(1);
  expect(
    statements.filter((statement) => statement.includes("SELECT 'package', wp.package_id")),
  ).toHaveLength(1);
  expect(
    statements.filter(
      (statement) => statement.includes('AS "projectId"') && statement.includes('AS "childId"'),
    ),
  ).toHaveLength(1);
  expect(statements.filter((statement) => statement.includes('JOIN scope c'))).toHaveLength(0);
});

it('returns scoped missing and foreign404 before unrelated selected catalogue or foreign metadata decoding', async () => {
  grant('org-viewer');
  sqlite.run(
    "INSERT INTO access_role_permission(role_id,permission) VALUES('org-viewer','package.teleport')",
  );
  sqlite.run("UPDATE project SET created_at=x'0102' WHERE id='foreign'");
  const projects = reader();
  expect(await projects.read(caller(), 'absent')).toEqual({ ok: true, value: null });
  expect(await projects.read(caller(), 'foreign')).toEqual({ ok: true, value: null });
  expect(await observedFailure(projects.list(caller()))).toBeInstanceOf(Error);
});

it('detaches exact shell values from the next read without manufacturing full metadata', async () => {
  grant('package-viewer', 'user', 'reader', 'work_package', 'open');
  const projects = reader();
  const first = await projects.list(caller());
  if (!first.ok) throw new Error('Expected actual shell observation');
  const shell = first.value.at(0);
  if (shell === undefined) throw new Error('Expected actual shell row');
  expect(Object.keys(shell).sort()).toEqual(['id', 'name']);
  Object.assign(shell, { name: 'Mutated', workPackageCount: 999 });
  expect(await projects.list(caller())).toEqual({
    ok: true,
    value: [{ id: 'alpha', name: 'Alpha' }],
  });
});

/** Creates the inconsistent foreign child physically, then restores exact enforcement before any reader. */
function corruptForeignProjectChild(fault: 'name' | 'id'): void {
  const names =
    fault === 'id'
      ? ['work_package_project_organization_update', 'work_package_organization_frozen_update']
      : ['work_package_project_organization_update'];
  const selected = names.map((name) => {
    const row = sqlite
      .query<{ sql: unknown }, [string]>(
        "SELECT sql FROM sqlite_schema WHERE type='trigger' AND name=?",
      )
      .get(name);
    if (row === null || typeof row.sql !== 'string' || row.sql === '')
      throw new Error('Required foreign child fixture trigger is absent: ' + name);
    return { name, sql: row.sql };
  });
  expect(sqlite.query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
  expect(sqlite.query('PRAGMA ignore_check_constraints').get()).toEqual({
    ignore_check_constraints: 0,
  });
  const removed: typeof selected = [];
  let primary: { readonly failure: unknown } | undefined;
  const cleanup: unknown[] = [];
  try {
    for (const trigger of selected) {
      sqlite.run('DROP TRIGGER "' + trigger.name + '"');
      removed.push(trigger);
    }
    if (fault === 'id') {
      sqlite.run('PRAGMA foreign_keys=OFF');
      expect(sqlite.query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 0 });
      sqlite.run("UPDATE work_package SET id=x'0102',project_id='alpha' WHERE id='abroad'");
      sqlite.run(
        "UPDATE work_package_organization SET resource_id=x'0102' WHERE resource_id='abroad'",
      );
      sqlite.run(
        "UPDATE work_package_abbreviation SET work_package_id=x'0102' WHERE work_package_id='abroad'",
      );
    } else sqlite.run("UPDATE work_package SET project_id='alpha',name=x'0102' WHERE id='abroad'");
  } catch (failure: unknown) {
    primary = { failure };
  }
  for (const trigger of removed) {
    try {
      sqlite.run(trigger.sql);
      expect(
        sqlite
          .query("SELECT sql FROM sqlite_schema WHERE type='trigger' AND name=?")
          .get(trigger.name),
      ).toEqual({ sql: trigger.sql });
    } catch (failure: unknown) {
      cleanup.push(failure);
    }
  }
  try {
    sqlite.run('PRAGMA foreign_keys=ON');
    expect(sqlite.query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
    expect(sqlite.query('PRAGMA ignore_check_constraints').get()).toEqual({
      ignore_check_constraints: 0,
    });
    expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([]);
  } catch (failure: unknown) {
    cleanup.push(failure);
  }
  if (primary !== undefined) {
    if (cleanup.length !== 0)
      throw new AggregateError(
        [primary.failure, ...cleanup],
        'Foreign child fixture corruption and restoration failed',
        { cause: primary.failure },
      );
    throw primary.failure;
  }
  if (cleanup.length !== 0)
    throw new AggregateError(cleanup, 'Foreign child fixture restoration failed', {
      cause: cleanup[0],
    });
  if (fault === 'id')
    expect(
      sqlite
        .query(
          "SELECT hex(work_package_id) AS idHex,namespace FROM work_package_abbreviation WHERE work_package_id=x'0102'",
        )
        .get(),
    ).toEqual({ idHex: '0102', namespace: 'org:org-b' });
  expect(
    sqlite
      .query(
        "SELECT mapping.organization_id AS mappedOrganization,parent.organization_id AS parentOrganization,typeof(child.id) AS idType,typeof(child.name) AS nameType FROM work_package child JOIN work_package_organization mapping ON mapping.resource_id=child.id JOIN project parent ON parent.id=child.project_id WHERE mapping.organization_id='org-b'",
      )
      .all(),
  ).toEqual([
    {
      mappedOrganization: 'org-b',
      parentOrganization: 'org-a',
      idType: fault === 'id' ? 'blob' : 'text',
      nameType: fault === 'name' ? 'blob' : 'text',
    },
  ]);
}

for (const fault of ['name', 'id'] as const) {
  it(
    'keeps a valid foreign mapping opaque before corrupt child ' +
      fault +
      ' decoding in full and shell reads',
    async () => {
      grant('org-viewer');
      corruptForeignProjectChild(fault);
      const snapshot = () =>
        [
          'project',
          'work_package',
          'work_package_organization',
          'access_grant',
          'access_role',
          'access_role_permission',
        ].map((table) => sqlite.query('SELECT * FROM "' + table + '" ORDER BY rowid').all());
      const projects = reader();
      let before = snapshot();
      expect(await projects.list(caller())).toMatchObject({
        ok: true,
        value: [
          { id: 'alpha', workPackageCount: 1 },
          { id: 'beta', workPackageCount: 1 },
        ],
      });
      expect(await projects.read(caller(), 'alpha')).toMatchObject({
        ok: true,
        value: { workPackageCount: 1, workPackages: [{ id: 'open', name: 'OPEN' }] },
      });
      expect(snapshot()).toEqual(before);
      sqlite.run("DELETE FROM access_grant WHERE subject_id='reader'");
      grant('package-viewer', 'user', 'reader', 'work_package', 'open');
      before = snapshot();
      expect(await projects.list(caller())).toEqual({
        ok: true,
        value: [{ id: 'alpha', name: 'Alpha' }],
      });
      expect(await projects.read(caller(), 'alpha')).toEqual({
        ok: false,
        error: 'forbidden',
        permission: 'project.read',
      });
      expect(snapshot()).toEqual(before);
    },
  );
}

it('still refuses an owned missing mapping before public map joins can hide invisible corrupt state', async () => {
  const name = 'work_package_organization_frozen_delete';
  const selected = sqlite
    .query<{ sql: unknown }, [string]>(
      "SELECT sql FROM sqlite_schema WHERE type='trigger' AND name=?",
    )
    .get(name);
  if (selected === null || typeof selected.sql !== 'string')
    throw new Error('Owned mapping fixture trigger is absent');
  const original = selected.sql;
  expect(sqlite.query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
  let primary: { readonly failure: unknown } | undefined;
  const cleanup: unknown[] = [];
  let removed = false;
  try {
    sqlite.run('DROP TRIGGER "' + name + '"');
    removed = true;
    sqlite.run("DELETE FROM work_package_organization WHERE resource_id='open'");
  } catch (failure: unknown) {
    primary = { failure };
  }
  if (removed) {
    try {
      sqlite.run(original);
      expect(
        sqlite.query("SELECT sql FROM sqlite_schema WHERE type='trigger' AND name=?").get(name),
      ).toEqual({ sql: original });
    } catch (failure: unknown) {
      cleanup.push(failure);
    }
  }
  if (primary !== undefined) {
    if (cleanup.length !== 0)
      throw new AggregateError(
        [primary.failure, ...cleanup],
        'Owned mapping fixture corruption and restoration failed',
        { cause: primary.failure },
      );
    throw primary.failure;
  }
  if (cleanup.length !== 0)
    throw new AggregateError(cleanup, 'Owned mapping fixture restoration failed', {
      cause: cleanup[0],
    });
  expect(sqlite.query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
  expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([]);
  expect(
    sqlite
      .query("SELECT resource_id FROM work_package_organization WHERE resource_id='open'")
      .get(),
  ).toBeNull();
  expect(sqlite.query("SELECT project_id FROM work_package WHERE id='open'").get()).toEqual({
    project_id: 'alpha',
  });
  const before = sqlite.query('SELECT * FROM work_package_organization ORDER BY resource_id').all();
  for (const read of [() => reader().list(caller()), () => reader().read(caller(), 'alpha')]) {
    const failure = await observedFailure(read());
    expect(failure).toBeInstanceOf(Error);
    if (!(failure instanceof Error)) throw new Error('Expected actual missing mapping refusal');
    expect(failure.message).toBe('package open has an absent or malformed organization mapping');
  }
  expect(
    sqlite.query('SELECT * FROM work_package_organization ORDER BY resource_id').all(),
  ).toEqual(before);
});

it('rejects a malformed actual shell name before publishing package-only parent metadata', async () => {
  grant('package-viewer', 'user', 'reader', 'work_package', 'open');
  const projects = reader();
  expect(await projects.list(caller())).toEqual({
    ok: true,
    value: [{ id: 'alpha', name: 'Alpha' }],
  });
  sqlite.run("UPDATE project SET name=x'0102' WHERE id='alpha'");
  const projectBefore = sqlite.query("SELECT * FROM project WHERE id='alpha'").get();
  const grantsBefore = sqlite.query('SELECT * FROM access_grant ORDER BY id').all();
  const failure = await observedFailure(projects.list(caller()));
  expect(failure).toBeInstanceOf(Error);
  if (!(failure instanceof Error)) throw new Error('Expected actual malformed shell name refusal');
  expect(failure.message).toBe('stored project name is malformed');
  expect(sqlite.query("SELECT * FROM project WHERE id='alpha'").get()).toEqual(projectBefore);
  expect(sqlite.query('SELECT * FROM access_grant ORDER BY id').all()).toEqual(grantsBefore);
});
