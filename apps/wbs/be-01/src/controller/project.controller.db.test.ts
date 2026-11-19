import { afterEach, expect, it } from 'bun:test';

import { BOOTED_ORIGIN, BootedBrowserProcess } from '../testing/booted-browser-process';
import {
  addAgentPerson,
  grantCredential,
  issueApiKey,
} from '../testing/machine-credential-fixture';
import { callForwarded, forwardingMachineGrants } from '../testing/mcp-forwarded-call';
import { OrganizationHarness } from '../testing/organization-harness';

let harness: OrganizationHarness | undefined;
let booted: BootedBrowserProcess | undefined;
afterEach(async () => {
  await harness?.closeComposed();
  harness = undefined;
  await booted?.close();
  booted = undefined;
});
async function fixture(activate = true, afterResolve?: () => void, machine = false) {
  const scope = OrganizationHarness.openComposedWith({
    now: () => 100,
    afterResolve,
    ...(machine ? { machineGrants: await forwardingMachineGrants() } : {}),
  });
  harness = scope;
  await scope.register('Creator');
  await scope.register('Reader');
  scope.organization('org');
  scope.organization('foreign');
  scope.member('org', 'Creator', 'admin', ['org-super-admin']);
  scope.member('org', 'Reader', 'viewer');
  scope.bind('Creator', 'org');
  scope.bind('Reader', 'org');
  if (activate) scope.activate();
  return scope;
}
function projectId(body: unknown): string {
  if (typeof body !== 'object' || body === null || !('project' in body))
    throw Error('missing project response');
  const project = body.project;
  if (
    typeof project !== 'object' ||
    project === null ||
    !('id' in project) ||
    typeof project.id !== 'string'
  )
    throw Error('missing project identity');
  return project.id;
}
it('mounts five actual Source-backed project endpoints with creator grant, audit, rename and empty deletion', async () => {
  const scope = await fixture();
  scope.grant('org', 'Reader', 'org-viewer');
  const created = await scope.call('Creator', 'POST', '/api/projects', { name: 'Empty' });
  expect(created.status).toBe(201);
  const id = projectId(created.body);
  expect(
    scope.sqlite.query('SELECT id,organization_id,created_by FROM project WHERE id=?').get(id),
  ).toEqual({ id, organization_id: 'org', created_by: scope.userId('Creator') });
  expect(
    scope.sqlite
      .query(
        "SELECT role_id,scope_kind,scope_id,subject_id FROM access_grant WHERE scope_id=? AND origin='creation'",
      )
      .get(id),
  ).toEqual({
    role_id: 'project-manager',
    scope_kind: 'project',
    scope_id: id,
    subject_id: scope.userId('Creator'),
  });
  expect((await scope.call('Reader', 'GET', '/api/projects')).body).toMatchObject({
    projects: [{ id, name: 'Empty', workPackageCount: 0 }],
  });
  expect((await scope.call('Reader', 'GET', '/api/projects/' + id)).body).toMatchObject({
    project: { id, workPackages: [], workPackageCount: 0 },
  });
  expect(
    await scope.call('Creator', 'PATCH', '/api/projects/' + id, { name: 'Renamed' }),
  ).toMatchObject({ status: 200, body: { project: { id, name: 'Renamed', revision: 1 } } });
  const removed = await scope.call('Creator', 'DELETE', '/api/projects/' + id);
  expect(removed).toEqual({ status: 204, body: null });
  expect(await scope.call('Reader', 'GET', '/api/projects/' + id)).toEqual({
    status: 404,
    body: { error: 'not_found' },
  });
  expect(
    scope.sqlite
      .query(
        "SELECT action,actor_id FROM organization_audit WHERE action IN ('project_created','project_renamed','project_deleted') ORDER BY rowid",
      )
      .all(),
  ).toEqual(
    ['project_created', 'project_renamed', 'project_deleted'].map((action) => ({
      action,
      actor_id: scope.userId('Creator'),
    })),
  );
});
it('requires E41 create_project permission and refuses legacy, unbound, and unauthenticated callers', async () => {
  const scope = await fixture();
  expect(await scope.call('Reader', 'POST', '/api/projects', { name: 'Denied' })).toEqual({
    status: 403,
    body: { error: 'forbidden', permission: 'organization.create_project' },
  });
  scope.unbind('Reader');
  expect(await scope.call('Reader', 'GET', '/api/projects')).toEqual({
    status: 403,
    body: { error: 'no_active_organization' },
  });
  expect((await scope.request('/api/projects')).status).toBe(401);
  expect(scope.sqlite.query('SELECT COUNT(*) AS count FROM project').get()).toEqual({ count: 0 });
});
it('makes missing and foreign identities indistinguishable and retains name conflict without caller overwrites', async () => {
  const scope = await fixture();
  const first = await scope.call('Creator', 'POST', '/api/projects', { name: 'Same' });
  expect(first.status).toBe(201);
  expect(await scope.call('Creator', 'POST', '/api/projects', { name: 'Same' })).toEqual({
    status: 409,
    body: { error: 'name_taken' },
  });
  scope.sqlite.run(
    "INSERT INTO project(id,organization_id,name,created_at) VALUES('foreign-project','foreign','Secret',1)",
  );
  for (const id of ['missing', 'foreign-project'])
    for (const method of ['GET', 'PATCH', 'DELETE'])
      expect(
        await scope.call(
          'Creator',
          method,
          '/api/projects/' + id,
          method === 'PATCH' ? { name: 'Changed' } : undefined,
        ),
      ).toEqual({ status: 404, body: { error: 'not_found' } });
  for (const key of ['organizationId', 'actor', 'id', 'projectId', 'workPackage'])
    expect(
      (await scope.call('Creator', 'POST', '/api/projects', { name: 'Injection', [key]: 'other' }))
        .status,
    ).toBe(422);
  expect(scope.sqlite.query("SELECT name FROM project WHERE id='foreign-project'").get()).toEqual({
    name: 'Secret',
  });
});

it('refuses preactivation project calls without changing the legacy marker or creating rows', async () => {
  const scope = await fixture(false);
  const before = scope.sqlite.query('SELECT * FROM organization_activation').all();
  expect(await scope.call('Creator', 'POST', '/api/projects', { name: 'Legacy' })).toEqual({
    status: 403,
    body: { error: 'no_active_organization' },
  });
  expect(await scope.call('Creator', 'GET', '/api/projects')).toEqual({
    status: 403,
    body: { error: 'no_active_organization' },
  });
  expect(scope.sqlite.query('SELECT * FROM organization_activation').all()).toEqual(before);
});
it('preserves readable writer projections while full detail refuses a package-only reader', async () => {
  const scope = await fixture();
  const created = await scope.call('Creator', 'POST', '/api/projects', { name: 'Private' });
  expect(created.status).toBe(201);
  const id = projectId(created.body);
  scope.sqlite.run("DELETE FROM access_grant WHERE subject_id=? AND organization_id='org'", [
    scope.userId('Creator'),
  ]);
  scope.grantPermissions('org', 'Creator', ['organization.create_project']);
  scope.grant('org', 'Reader', 'org-super-admin');
  for (const child of ['visible', 'hidden']) {
    scope.sqlite.run(
      'INSERT INTO work_package(id,name,project_id,restricted,created_at,created_by) VALUES(?,?,?,1,1,?)',
      [child, child, id, scope.userId('Creator')],
    );
    scope.sqlite.run(
      "INSERT INTO work_package_organization(resource_id,organization_id) VALUES(?,'org')",
      [child],
    );
  }
  scope.grant('org', 'Creator', 'package-viewer', 'work_package', 'visible');
  expect(await scope.call('Creator', 'GET', '/api/projects/' + id)).toEqual({
    status: 403,
    body: { error: 'forbidden', permission: 'project.read' },
  });
  expect(
    (await scope.call('Creator', 'PATCH', '/api/projects/' + id, { name: 'Renamed' })).body,
  ).toMatchObject({ project: { workPackageCount: 1 } });
  expect(await scope.call('Creator', 'DELETE', '/api/projects/' + id)).toEqual({
    status: 409,
    body: { error: 'not_empty', workPackageIds: ['visible'] },
  });
  scope.sqlite.run("DELETE FROM access_grant WHERE subject_id=? AND scope_kind='work_package'", [
    scope.userId('Creator'),
  ]);
  expect(await scope.call('Creator', 'DELETE', '/api/projects/' + id)).toEqual({
    status: 409,
    body: { error: 'not_empty', workPackageIds: [] },
  });
  expect(
    scope.sqlite.query('SELECT id FROM work_package WHERE project_id=? ORDER BY id').all(id),
  ).toEqual([{ id: 'hidden' }, { id: 'visible' }]);
});
it('rechecks queued organization and membership without creating project, grant or audit effects', async () => {
  const resolved = Promise.withResolvers<undefined>();
  const scope = await fixture(true, () => {
    resolved.resolve(undefined);
  });
  scope.member('foreign', 'Creator', 'admin', ['org-super-admin']);
  const entered = Promise.withResolvers<undefined>(),
    release = Promise.withResolvers<undefined>();
  const held = scope.holdWriteTurn(release.promise, () => {
    entered.resolve(undefined);
  });
  await entered.promise;
  const before = scope.sqlite.query('SELECT * FROM project ORDER BY id').all();
  const grants = scope.sqlite.query('SELECT * FROM access_grant ORDER BY id').all();
  const audits = scope.sqlite.query('SELECT * FROM organization_audit ORDER BY id').all();
  const pending = scope.call('Creator', 'POST', '/api/projects', { name: 'Queued' });
  try {
    await resolved.promise;
    scope.bind('Creator', 'foreign');
  } finally {
    release.resolve(undefined);
    await held;
  }
  expect(await pending).toEqual({ status: 409, body: { error: 'organization_context_changed' } });
  expect(scope.sqlite.query('SELECT * FROM project ORDER BY id').all()).toEqual(before);
  expect(scope.sqlite.query('SELECT * FROM access_grant ORDER BY id').all()).toEqual(grants);
  expect(scope.sqlite.query('SELECT * FROM organization_audit ORDER BY id').all()).toEqual(audits);
});
it('returns CP14 and preserves the empty project when no direct super-admin remains', async () => {
  const scope = await fixture();
  const created = await scope.call('Creator', 'POST', '/api/projects', { name: 'Protected' });
  const id = projectId(created.body);
  scope.sqlite.run("DELETE FROM access_grant WHERE role_id='org-super-admin'");
  scope.grantPermissions('org', 'Creator', ['organization.create_project']);
  expect(await scope.call('Creator', 'DELETE', '/api/projects/' + id)).toEqual({
    status: 409,
    body: { error: 'last_super_admin' },
  });
  expect(scope.sqlite.query('SELECT id FROM project WHERE id=?').get(id)).toEqual({ id });
});
it('uses the actual booted enabled browser selection for snapshot project reads and refuses its revoked binding', async () => {
  const be = await BootedBrowserProcess.open('enabled');
  booted = be;
  await be.register('BootCreator');
  be.organization('boot-org');
  be.member('boot-org', 'BootCreator', 'member');
  be.grantPermissions('boot-org', 'BootCreator', ['organization.create_project']);
  be.activate();
  const authorization = 'Bearer ' + be.token('BootCreator');
  const selected = await be.app.handle(
    new Request(BOOTED_ORIGIN + '/api/organization/active', {
      method: 'POST',
      headers: { authorization, origin: BOOTED_ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ organizationId: 'boot-org' }),
    }),
  );
  expect(selected.status).toBe(200);
  const cookie = selected.headers.get('set-cookie');
  if (cookie === null) throw Error('missing selection cookie');
  const pair = cookie.split(';').at(0);
  if (pair === undefined) throw Error('missing selection pair');
  const headers = {
    cookie: '__Host-wbs_access=' + be.token('BootCreator') + '; ' + pair,
    origin: BOOTED_ORIGIN,
    'X-WBS-Expected-Organization': 'boot-org',
    'content-type': 'application/json',
  };
  const created = await be.app.handle(
    new Request(BOOTED_ORIGIN + '/api/projects', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'Booted' }),
    }),
  );
  expect(created.status).toBe(201);
  const id = projectId(await created.json());
  const read = await be.app.handle(new Request(BOOTED_ORIGIN + '/api/projects/' + id, { headers }));
  expect(read.status).toBe(200);
  const wrongOrigin = await be.app.handle(
    new Request(BOOTED_ORIGIN + '/api/projects', {
      method: 'POST',
      headers: { ...headers, origin: 'http://foreign.invalid' },
      body: JSON.stringify({ name: 'Wrong origin' }),
    }),
  );
  expect(wrongOrigin.status).toBe(403);
  expect(await wrongOrigin.json()).toEqual({ error: 'invalid_origin' });
  expect(await read.json()).toMatchObject({ project: { id, name: 'Booted', workPackages: [] } });
  be.sqlite.run(
    "DELETE FROM organization_membership WHERE organization_id='boot-org' AND user_id=?",
    [be.userId('BootCreator')],
  );
  const denied = await be.app.handle(
    new Request(BOOTED_ORIGIN + '/api/projects/' + id, { headers }),
  );
  expect(denied.status).toBe(403);
  expect(await denied.json()).toEqual({ error: 'not_a_member' });
});

it('rechecks membership removed while queued and commits no birth effects', async () => {
  const resolved = Promise.withResolvers<undefined>(),
    scope = await fixture(true, () => {
      resolved.resolve(undefined);
    });
  const entered = Promise.withResolvers<undefined>(),
    release = Promise.withResolvers<undefined>();
  const held = scope.holdWriteTurn(release.promise, () => {
    entered.resolve(undefined);
  });
  await entered.promise;
  const pending = scope.call('Creator', 'POST', '/api/projects', { name: 'Revoked' });
  try {
    await resolved.promise;
    scope.sqlite.run(
      "DELETE FROM organization_membership WHERE organization_id='org' AND user_id=?",
      [scope.userId('Creator')],
    );
  } finally {
    release.resolve(undefined);
    await held;
  }
  expect(await pending).toEqual({ status: 403, body: { error: 'not_a_member' } });
  expect(scope.sqlite.query('SELECT COUNT(*) AS count FROM project').get()).toEqual({ count: 0 });
  expect(
    scope.sqlite
      .query("SELECT COUNT(*) AS count FROM organization_audit WHERE action='project_created'")
      .get(),
  ).toEqual({ count: 0 });
});

it('accepts form name only and classifies malformed JSON and undeclared body fields without side effects', async () => {
  const scope = await fixture();
  const login = await scope.request('/api/auth/login', {
    method: 'POST',
    headers: { origin: 'http://localhost', 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'Creator', password: 'correct-horse' }),
  });
  expect(login.status).toBe(200);
  const identity: unknown = await login.json();
  if (
    typeof identity !== 'object' ||
    identity === null ||
    !('token' in identity) ||
    typeof identity.token !== 'string'
  )
    throw Error('login did not return native token');
  const headers = {
    authorization: 'Bearer ' + identity.token,
    origin: 'http://localhost',
    'X-WBS-Expected-Organization': 'org',
  };
  const form = await scope.request('/api/projects', {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name: 'Form' }),
  });
  expect(form.status).toBe(201);
  const before = scope.sqlite.query('SELECT * FROM project ORDER BY id').all();
  for (const [body, status, error] of [
    ['{', 400, 'invalid_json'],
    ['[]', 422, 'invalid_body'],
    ['{"name":"Injected","organizationId":"foreign"}', 422, 'invalid_body'],
  ] as const) {
    const response = await scope.request('/api/projects', {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body,
    });
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error });
  }
  expect(scope.sqlite.query('SELECT * FROM project ORDER BY id').all()).toEqual(before);
});
it('retains the actual machine credential cap through project write admission', async () => {
  const scope = await fixture(true, undefined, true);
  addAgentPerson(scope.sqlite, 'agent', 'org', scope.userId('Creator'));
  const credential = await issueApiKey(scope.sqlite, {
    organizationId: 'org',
    personId: 'agent',
    issuedBy: scope.userId('Creator'),
  });
  grantCredential(scope.sqlite, 'org', credential.id, 'org-viewer', 'organization', 'org');
  const reply = await callForwarded(
    scope,
    credential.key,
    'POST',
    '/api/projects',
    { name: 'Capped' },
    { now: 100 },
  );
  expect(reply).toEqual({
    status: 403,
    body: { error: 'forbidden', permission: 'organization.create_project' },
  });
  expect(scope.sqlite.query('SELECT COUNT(*) AS count FROM project').get()).toEqual({ count: 0 });
});

it('mounts combined creation with actual child defaults address creation grants and one readable child', async () => {
  const scope = await fixture();
  const created = await scope.call('Creator', 'POST', '/api/projects', {
    name: 'Combined',
    workPackage: { name: 'First' },
  });
  expect(created.status).toBe(201);
  const id = projectId(created.body);
  expect(created.body).toMatchObject({
    project: { id, workPackageCount: 1 },
    workPackage: {
      name: 'First',
      projectId: id,
      revision: 0,
      estimateMethod: 'pert',
      restricted: false,
    },
    steps: [
      { name: 'Dev', code: 'dev', position: 10 },
      { name: 'QA', code: 'qa', position: 20 },
    ],
  });
  const child = scope.sqlite
    .query<{ id: string }, [string]>('SELECT id FROM work_package WHERE project_id=?')
    .get(id);
  if (child === null) throw Error('combined mounted child missing');
  expect(
    scope.sqlite
      .query('SELECT abbreviation FROM work_package_abbreviation WHERE work_package_id=?')
      .get(child.id),
  ).toBeTruthy();
  expect(
    scope.sqlite
      .query(
        "SELECT scope_kind,scope_id,subject_id,origin FROM access_grant WHERE origin='creation' ORDER BY scope_kind",
      )
      .all(),
  ).toEqual([
    {
      scope_kind: 'project',
      scope_id: id,
      subject_id: scope.userId('Creator'),
      origin: 'creation',
    },
    {
      scope_kind: 'work_package',
      scope_id: child.id,
      subject_id: scope.userId('Creator'),
      origin: 'creation',
    },
  ]);
  expect(scope.sqlite.query('SELECT action FROM organization_audit ORDER BY rowid').all()).toEqual([
    { action: 'project_created' },
    { action: 'access_granted' },
    { action: 'access_granted' },
  ]);
  expect((await scope.call('Creator', 'GET', '/api/projects/' + id)).body).toMatchObject({
    project: { workPackageCount: 1, workPackages: [{ id: child.id, name: 'First' }] },
  });
  expect(await scope.call('Creator', 'DELETE', '/api/projects/' + id)).toEqual({
    status: 409,
    body: { error: 'not_empty', workPackageIds: [child.id] },
  });
  expect(
    await scope.call('Creator', 'POST', '/api/projects', {
      name: 'Combined',
      workPackage: { name: 'Second' },
    }),
  ).toEqual({ status: 409, body: { error: 'name_taken' } });
  expect(scope.sqlite.query('SELECT COUNT(*) AS count FROM work_package').get()).toEqual({
    count: 1,
  });
});
it('combined mounted response preserves allocator409 and malformed nested input cannot widen rename', async () => {
  const scope = await fixture();
  for (const workPackage of [
    null,
    {},
    { name: 'First', projectId: 'injected' },
    { name: 'First', actor: 'injected' },
  ])
    expect(
      (await scope.call('Creator', 'POST', '/api/projects', { name: 'Bad', workPackage })).status,
    ).toBe(422);
  scope.sqlite.run('UPDATE work_package_abbreviation_counter SET next=11881376');
  expect(
    await scope.call('Creator', 'POST', '/api/projects', {
      name: 'Exhausted',
      workPackage: { name: 'First' },
    }),
  ).toEqual({ status: 409, body: { error: 'abbreviation_exhausted' } });
  expect(scope.sqlite.query('SELECT COUNT(*) AS count FROM project').get()).toEqual({ count: 0 });
  const empty = await scope.call('Creator', 'POST', '/api/projects', { name: 'Empty' });
  expect(empty.status).toBe(201);
  expect(
    (
      await scope.call('Creator', 'PATCH', '/api/projects/' + projectId(empty.body), {
        name: 'Renamed',
        workPackage: { name: 'Injected' },
      })
    ).status,
  ).toBe(422);
});
it('combined machine creation refuses the actual early contributor cap before either birth', async () => {
  const scope = await fixture(true, undefined, true);
  addAgentPerson(scope.sqlite, 'combined-agent', 'org', scope.userId('Creator'));
  const credential = await issueApiKey(scope.sqlite, {
    organizationId: 'org',
    personId: 'combined-agent',
    issuedBy: scope.userId('Creator'),
  });
  grantCredential(scope.sqlite, 'org', credential.id, 'org-admin', 'organization', 'org');
  scope.sqlite.run(
    "CREATE TRIGGER revoke_combined_cap AFTER INSERT ON organization_audit WHEN NEW.action='access_granted' AND EXISTS(SELECT 1 FROM access_grant WHERE id=NEW.subject_id AND scope_kind='project') BEGIN DELETE FROM access_grant WHERE subject_kind='machine_credential'; END",
  );
  const before = scope.sqlite.query('SELECT * FROM access_grant ORDER BY id').all();
  expect(
    await callForwarded(
      scope,
      credential.key,
      'POST',
      '/api/projects',
      { name: 'Capped combined', workPackage: { name: 'First' } },
      { now: 100 },
    ),
  ).toEqual({
    status: 403,
    body: { error: 'forbidden', permission: 'organization.create_project' },
  });
  expect(scope.sqlite.query('SELECT * FROM access_grant ORDER BY id').all()).toEqual(before);
  expect(scope.sqlite.query('SELECT COUNT(*) AS count FROM project').get()).toEqual({ count: 0 });
  expect(scope.sqlite.query('SELECT COUNT(*) AS count FROM work_package').get()).toEqual({
    count: 0,
  }); // The forwarded grant is independently audited before the refused Project write owner.
  expect(scope.sqlite.query('SELECT action FROM organization_audit ORDER BY rowid').all()).toEqual([
    { action: 'machine_token_issued' },
  ]);
});

it('projects a package-only parent as an exact list shell and refuses full detail without project.read', async () => {
  const scope = await fixture();
  const created = await scope.call('Creator', 'POST', '/api/projects', {
    name: 'P3 parent',
    workPackage: { name: 'Visible child' },
  });
  expect(created.status).toBe(201);
  const parentId = projectId(created.body);
  const visible = scope.sqlite
    .query<{ id: unknown; name: unknown }, [string]>(
      'SELECT id,name FROM work_package WHERE project_id=?',
    )
    .get(parentId);
  if (
    visible === null ||
    typeof visible.id !== 'string' ||
    visible.id === '' ||
    visible.name !== 'Visible child'
  )
    throw new Error('Actual first child was not created under the named project');
  expect(
    scope.sqlite
      .query(
        "SELECT role_id,scope_kind,scope_id FROM access_grant WHERE subject_kind='user' AND subject_id=? AND origin='creation' ORDER BY scope_kind",
      )
      .all(scope.userId('Creator')),
  ).toEqual([
    { role_id: 'project-manager', scope_kind: 'project', scope_id: parentId },
    { role_id: 'package-manager', scope_kind: 'work_package', scope_id: visible.id },
  ]);
  scope.sqlite.run(
    'INSERT INTO work_package(id,name,project_id,restricted,created_at,created_by) VALUES(?,?,?,1,1,?)',
    ['p3-hidden-sibling', 'Hidden sibling', parentId, scope.userId('Creator')],
  );
  scope.sqlite.run(
    "INSERT INTO work_package_organization(resource_id,organization_id) VALUES('p3-hidden-sibling','org')",
  );
  const hiddenProject = await scope.call('Creator', 'POST', '/api/projects', {
    name: 'P3 ungranted parent',
  });
  expect(hiddenProject.status).toBe(201);
  const hiddenProjectId = projectId(hiddenProject.body);
  scope.sqlite.run(
    "INSERT INTO project(id,organization_id,name,created_at) VALUES('p3-foreign','foreign','Foreign project',1)",
  );
  scope.grant('org', 'Reader', 'package-viewer', 'work_package', visible.id);
  expect(
    scope.sqlite
      .query(
        "SELECT scope_kind,scope_id,role_id FROM access_grant WHERE organization_id='org' AND subject_kind='user' AND subject_id=? ORDER BY id",
      )
      .all(scope.userId('Reader')),
  ).toEqual([{ scope_kind: 'work_package', scope_id: visible.id, role_id: 'package-viewer' }]);
  expect(
    scope.sqlite
      .query(
        "SELECT id FROM access_grant WHERE organization_id='org' AND subject_kind='organization_members'",
      )
      .all(),
  ).toEqual([]);
  const full = await scope.call('Creator', 'GET', '/api/projects/' + parentId);
  expect(full.status).toBe(200);
  expect(full.body).toMatchObject({
    project: {
      id: parentId,
      name: 'P3 parent',
      workPackageCount: 2,
      workPackages: [
        { id: visible.id, name: 'Visible child' },
        { id: 'p3-hidden-sibling', name: 'Hidden sibling' },
      ].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)),
    },
  });
  const listed = await scope.call('Reader', 'GET', '/api/projects');
  expect(listed).toEqual({
    status: 200,
    body: { projects: [{ id: parentId, name: 'P3 parent' }] },
  });
  expect(await scope.call('Reader', 'GET', '/api/projects/' + parentId)).toEqual({
    status: 403,
    body: { error: 'forbidden', permission: 'project.read' },
  });
  for (const id of [hiddenProjectId, 'p3-absent', 'p3-foreign'])
    expect(await scope.call('Reader', 'GET', '/api/projects/' + id)).toEqual({
      status: 404,
      body: { error: 'not_found' },
    });
});
