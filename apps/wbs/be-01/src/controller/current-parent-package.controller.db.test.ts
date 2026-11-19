import { planDocumentFixture } from '@wbs/core/testing/plan-document-fixture';
import { afterEach, beforeEach, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

let harness: OrganizationHarness;
beforeEach(async () => {
  harness = OrganizationHarness.openComposedWith({ now: () => Date.now() });
  for (const username of ['creator', 'administrator', 'foreign']) await harness.register(username);
  for (const id of ['org-a', 'org-b']) harness.organization(id);
  harness.member('org-a', 'creator', 'member', ['org-admin']);
  harness.member('org-a', 'administrator', 'member', ['org-admin']);
  harness.member('org-b', 'foreign', 'member', ['org-admin']);
  harness.bind('creator', 'org-a');
  harness.bind('administrator', 'org-a');
  harness.bind('foreign', 'org-b');
  harness.activate();
  harness.sqlite.run(
    "INSERT INTO project(id,organization_id,name,created_at,created_by) VALUES('parent','org-a','Parent',1,?),('foreign-parent','org-b','Foreign',1,?)",
    [harness.userId('creator'), harness.userId('foreign')],
  );
});
afterEach(async () => {
  await harness.closeComposed();
});
function domainState() {
  return Object.fromEntries(
    harness.sqlite
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all()
      .map(({ name }) => [
        name,
        harness.sqlite.query('SELECT * FROM "' + name + '" ORDER BY rowid').all(),
      ]),
  );
}
function createdId() {
  const row = harness.sqlite
    .query<{ id: string }, []>('SELECT id FROM work_package ORDER BY rowid DESC LIMIT 1')
    .get();
  if (row === null) throw new Error('created package absent');
  return row.id;
}
it.each(['create', 'import'] as const)(
  'requires an explicit parent for mounted %s with zero domain effects',
  async (operation) => {
    const path = operation === 'create' ? '/api/work-packages' : '/api/work-packages/import';
    const base = operation === 'create' ? { name: 'P' } : { document: planDocumentFixture() };
    for (const [parent, status, error] of [
      [undefined, 422, 'project_required'],
      [null, 422, 'project_required'],
      [42, 422, 'invalid_body'],
      ['foreign-parent', 404, 'not_found'],
      ['absent', 404, 'not_found'],
    ] as const) {
      const before = domainState();
      const response = await harness.call(
        'creator',
        'POST',
        path,
        parent === undefined ? base : { ...base, projectId: parent },
      );
      expect(response).toEqual({ status, body: { error } });
      expect(domainState()).toEqual(before);
    }
  },
);
it('creates an ownerless package on the actual parent and retains creator access after restriction', async () => {
  const response = await harness.call('creator', 'POST', '/api/work-packages', {
    name: 'Created',
    projectId: 'parent',
  });
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ workPackage: { projectId: 'parent' } });
  if (
    typeof response.body !== 'object' ||
    response.body === null ||
    !('workPackage' in response.body)
  )
    throw new Error('missing package body');
  expect(response.body.workPackage).not.toHaveProperty('ownerId');
  const id = createdId();
  expect(
    harness.sqlite.query('SELECT project_id,created_by FROM work_package WHERE id=?').get(id),
  ).toEqual({ project_id: 'parent', created_by: harness.userId('creator') });
  expect(
    (await harness.call('creator', 'PATCH', '/api/work-packages/' + id, { restricted: true }))
      .status,
  ).toBe(200);
  const command = {
    commands: [{ kind: 'createWorkItem', name: 'Creator row', parentId: null, afterId: null }],
  };
  expect(
    (await harness.call('creator', 'POST', '/api/work-packages/' + id + '/commands', command))
      .status,
  ).toBe(200);
  expect(
    (await harness.call('administrator', 'POST', '/api/work-packages/' + id + '/commands', command))
      .status,
  ).toBe(403);
  expect((await harness.call('foreign', 'GET', '/api/work-packages/' + id)).status).toBe(404);
  expect(
    harness.sqlite
      .query(
        "SELECT scope_id,subject_id,role_id,origin FROM access_grant WHERE scope_kind='work_package'",
      )
      .all(),
  ).toEqual([
    {
      scope_id: id,
      subject_id: harness.userId('creator'),
      role_id: 'package-manager',
      origin: 'creation',
    },
  ]);
});
it('imports a restricted historical document into the outer parent with actual creator grant and audit', async () => {
  const document = planDocumentFixture();
  document.settings.restricted = true;
  const response = await harness.call('creator', 'POST', '/api/work-packages/import', {
    projectId: 'parent',
    document: { ...document, project: { id: 'foreign-parent', name: 'Informational' } },
  });
  expect(response.status).toBe(201);
  const id = createdId();
  expect(
    harness.sqlite
      .query('SELECT project_id,restricted,created_by FROM work_package WHERE id=?')
      .get(id),
  ).toEqual({ project_id: 'parent', restricted: 1, created_by: harness.userId('creator') });
  expect(
    harness.sqlite
      .query(
        "SELECT scope_id,subject_id,role_id,origin FROM access_grant WHERE scope_kind='work_package'",
      )
      .all(),
  ).toEqual([
    {
      scope_id: id,
      subject_id: harness.userId('creator'),
      role_id: 'package-manager',
      origin: 'creation',
    },
  ]);
  expect(
    harness.sqlite
      .query(
        "SELECT actor_id,action,subject_kind FROM organization_audit WHERE action='access_granted' AND json_extract(detail,'$.scopeId')=?",
      )
      .all(id),
  ).toEqual([
    { actor_id: harness.userId('creator'), action: 'access_granted', subject_kind: 'access_grant' },
  ]);
  expect(
    (
      await harness.call('creator', 'POST', '/api/work-packages/' + id + '/commands', {
        commands: [{ kind: 'createWorkItem', name: 'Imported row', parentId: null, afterId: null }],
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await harness.call('administrator', 'POST', '/api/work-packages/' + id + '/commands', {
        commands: [{ kind: 'createWorkItem', name: 'Denied row', parentId: null, afterId: null }],
      })
    ).status,
  ).toBe(403);
  expect(
    harness.sqlite.query('SELECT id FROM step WHERE work_package_id=?').all(id).length,
  ).toBeGreaterThan(0);
});
it.each(['creator-audit', 'later-import-row'] as const)(
  'rolls the entire current import back on %s failure',
  async (stage) => {
    if (stage === 'creator-audit')
      harness.sqlite.run(
        "CREATE TRIGGER fail_current_import BEFORE INSERT ON organization_audit WHEN NEW.action='access_granted' BEGIN SELECT RAISE(ABORT,'controlled current creator audit failure'); END",
      );
    else
      harness.sqlite.run(
        "CREATE TRIGGER fail_current_import BEFORE INSERT ON work_item BEGIN SELECT RAISE(ABORT,'controlled current imported row failure'); END",
      );
    const before = domainState();
    expect(
      (
        await harness.call('creator', 'POST', '/api/work-packages/import', {
          projectId: 'parent',
          document: planDocumentFixture(),
        })
      ).status,
    ).toBe(500);
    expect(domainState()).toEqual(before);
  },
);
