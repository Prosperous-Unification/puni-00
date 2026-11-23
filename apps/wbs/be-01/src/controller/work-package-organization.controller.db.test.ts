import { contractVersionOf } from '@wbs/domain';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

/**
 * The work package boundary under organization isolation (task 3.1), over real
 * SQLite and the production organization access; see {@link OrganizationHarness}.
 */
let h: OrganizationHarness;

beforeEach(async () => {
  h = OrganizationHarness.openComposedWith({});
  for (const username of ['ada', 'grace', 'vic', 'sam', 'nell']) await h.register(username);
  h.organization('org-a');
  h.organization('org-b');
  h.member('org-a', 'ada', 'member', ['org-admin']);
  h.member('org-a', 'vic', 'viewer', ['project-viewer']);
  h.member('org-a', 'sam', 'super_admin', ['org-super-admin']);
  h.member('org-b', 'grace', 'member', ['org-admin']);
  for (const username of ['ada', 'vic', 'sam']) h.bind(username, 'org-a');
  h.bind('grace', 'org-b');
  h.sqlite.run(
    "INSERT INTO organization(id,name,legacy,created_at) VALUES('organization-http-legacy','Legacy fixture',1,1)",
  );
  h.sqlite.run(
    "INSERT INTO project(id,organization_id,name,created_at) VALUES('organization-http-legacy-project','organization-http-legacy','Migrated legacy engagement',1)",
  );
});

afterEach(async () => {
  await h.closeComposed();
});

const call = (username: string, method: string, path: string, body?: unknown) =>
  h.call(username, method, path, body);
/** Every audit record, without its generated id and time. */
function audits(): unknown[] {
  return h.sqlite
    .query(
      'SELECT organization_id, actor_id, action, subject_kind, subject_id, detail FROM organization_audit ORDER BY rowid',
    )
    .all();
}

const activate = () => {
  h.activate();
};
const userId = (username: string) => h.userId(username);

async function create(username: string, name: string): Promise<string> {
  const activation = h.sqlite
    .query<{ state: string }, []>('SELECT state FROM organization_activation WHERE singleton=1')
    .get();
  if (activation === null) throw new Error('organization fixture activation is absent');
  const projectId =
    activation.state === 'activated'
      ? await createParent(username, name + ' engagement')
      : activation.state === 'pre_activation'
        ? 'organization-http-legacy-project'
        : undefined;
  if (projectId === undefined) throw new Error('organization fixture activation is malformed');
  const answer = await call(username, 'POST', '/api/work-packages', { name, projectId });
  if (answer.status !== 200) throw new Error(`create refused: ${JSON.stringify(answer)}`);
  const workPackageId = (answer.body as { workPackage: { id: string } }).workPackage.id;
  return workPackageId;
}

/** Uses the actual project route and its creation grant before package birth. */
async function createParent(username: string, name: string): Promise<string> {
  const answer = await call(username, 'POST', '/api/projects', { name });
  expect(answer.status).toBe(201);
  return (answer.body as { project: { id: string } }).project.id;
}

function readParentId(workPackageId: string): string {
  const parent = h.sqlite
    .query<{ project_id: string }, [string]>('SELECT project_id FROM work_package WHERE id=?')
    .get(workPackageId);
  if (parent === null) throw new Error('organization fixture package parent is absent');
  return parent.project_id;
}

/** A failed exact-key objective that the mounted Retry route can admit. */
async function retryFixture(): Promise<{ workPackageId: string; inputHash: string }> {
  await h.closeComposed();
  h = OrganizationHarness.openComposed(true);
  for (const username of ['ada', 'sam', 'nell', 'vic', 'grace']) await h.register(username);
  h.organization('org-a');
  h.organization('org-b');
  h.member('org-a', 'ada', 'member', ['org-admin']);
  h.member('org-a', 'sam', 'super_admin', ['org-super-admin']);
  h.member('org-a', 'nell', 'member', ['project-contributor']);
  h.member('org-a', 'vic', 'viewer', ['project-viewer']);
  h.member('org-b', 'grace', 'member', ['org-admin']);
  for (const username of ['ada', 'sam', 'nell', 'vic']) h.bind(username, 'org-a');
  h.bind('grace', 'org-b');
  h.activate();
  await h.publicWrites().uow.run(async ({ stores }) => {
    expect(
      await stores.stepCatalogue.defineAndBindStep(
        'org-a',
        {
          id: 'organization-http-retry-step',
          code: 'retry-work',
          name: 'Retry work',
          position: 10,
          defaultEstimateUnit: 'workdays',
          defaultAllowancePercent: 0,
        },
        {
          bindingId: 'organization-http-retry-binding',
          scopeKind: 'organization',
          scopeId: 'org-a',
          workItemTypeId: null,
          position: 10,
        },
        { at: 1, by: h.userId('ada') },
      ),
    ).toMatchObject({ ok: true });
    return { commit: true, value: undefined };
  });
  const workPackageId = await create('ada', 'Retry plan');
  const detail = await call('ada', 'GET', `/api/work-packages/${workPackageId}`);
  const stepId = (detail.body as { steps: { id: string }[] }).steps.at(0)?.id;
  if (stepId === undefined) throw new Error('retry work package has no starting step');
  expect(
    await call('ada', 'POST', `/api/work-packages/${workPackageId}/commands`, {
      commands: [
        { kind: 'createWorkItem', ref: 'retry-leaf', name: 'Work', parentId: null, afterId: null },
        {
          kind: 'setEstimate',
          workItemRef: 'retry-leaf',
          stepId,
          days: { optimistic: 1, realistic: 2, pessimistic: 3 },
        },
      ],
    }),
  ).toMatchObject({ status: 200 });
  const inputHash = await h.optimizationHash(workPackageId);
  const contractVersion = contractVersionOf('0.1.0');
  expect(
    (await call('ada', 'PATCH', `/api/work-packages/${workPackageId}`, { restricted: true }))
      .status,
  ).toBe(200);
  h.sqlite.run('UPDATE work_package SET optimization_enabled = 1 WHERE id = ?', [workPackageId]);
  h.sqlite.run(
    'INSERT INTO optimization_generation (work_package_id, contract_version, generation, input_hash, updated_at) VALUES (?, ?, 1, ?, 1)',
    [workPackageId, contractVersion, inputHash],
  );
  h.sqlite.run(
    "INSERT INTO optimized_schedule_cache (work_package_id, input_hash, objective, contract_version, budget_ms, generation, status, failure_reason, created_at) VALUES (?, ?, 'pri', ?, 60000, 1, 'failed', 'timeout', 2)",
    [workPackageId, inputHash, contractVersion],
  );
  return { workPackageId, inputHash };
}

async function listedNames(username: string): Promise<string[]> {
  const answer = await call(username, 'GET', '/api/work-packages');
  expect(answer.status).toBe(200);
  return (answer.body as { workPackages: { name: string }[] }).workPackages
    .map((p) => p.name)
    .sort();
}

/** Every work package route, addressed at `id`, with a body each would accept from a writer. */
function everyAddressedRoute(id: string): [string, string, unknown?][] {
  return [
    ['GET', `/api/work-packages/${id}`],
    ['GET', `/api/work-packages/${id}/export?format=markdown`],
    ['POST', `/api/work-packages/${id}/opened`],
    ['PATCH', `/api/work-packages/${id}`, { name: 'Renamed' }],
    ['POST', `/api/work-packages/${id}/optimization/retry`, { objective: 'pri', inputHash: 'h' }],
  ];
}

describe('before activation', () => {
  it('keeps deployment-wide access whatever organization a session is bound to', async () => {
    const id = await create('grace', 'B plan');
    expect(await listedNames('ada')).toEqual(['B plan']);
    expect((await call('ada', 'GET', `/api/work-packages/${id}`)).status).toBe(200);
    expect((await call('nell', 'GET', `/api/work-packages/${id}`)).status).toBe(200);
    expect(
      (await call('vic', 'PATCH', `/api/work-packages/${id}`, { name: 'Legacy' })).status,
    ).toBe(200);
  });
});

describe('after activation', () => {
  it('refuses a super-admin optimization retry recovery without a package grant', async () => {
    const { workPackageId, inputHash } = await retryFixture();
    const auditsBefore = audits();
    expect(
      (
        await call('sam', 'POST', '/api/work-packages/' + workPackageId + '/optimization/retry', {
          objective: 'pri',
          inputHash,
        })
      ).status,
    ).toBe(403);
    expect(await h.retryAtStore(workPackageId, 'org-a', h.userId('sam'), inputHash)).toBe(
      'forbidden',
    );
    expect(audits()).toEqual(auditsBefore);
    expect(h.sqlite.query('SELECT * FROM solver_slot').all()).toEqual([]);
  });
  it('refuses other retry writers, a foreign work package and a removed super-admin without audit', async () => {
    const { workPackageId, inputHash } = await retryFixture();
    const ownAudits = audits();
    const path = `/api/work-packages/${workPackageId}/optimization/retry`;
    for (const username of ['nell', 'vic']) {
      expect((await call(username, 'POST', path, { objective: 'pri', inputHash })).status).toBe(
        404,
      );
    }
    h.sqlite.run("UPDATE organization_membership SET role = 'admin' WHERE user_id = ?", [
      h.userId('nell'),
    ]);
    expect((await call('nell', 'POST', path, { objective: 'pri', inputHash })).status).toBe(404);
    expect(audits()).toEqual(ownAudits);
    const foreign = await create('grace', 'Foreign retry');
    const auditsBefore = audits();
    expect(
      (
        await call('sam', 'POST', `/api/work-packages/${foreign}/optimization/retry`, {
          objective: 'pri',
          inputHash,
        })
      ).status,
    ).toBe(404);
    expect(await h.retryAtStore(workPackageId, 'org-b', h.userId('grace'), inputHash)).toBe(
      'not_found',
    );
    h.grant('org-a', 'sam', 'package-manager', 'work_package', workPackageId);
    expect((await call('sam', 'POST', path, { objective: 'pri', inputHash: 'stale' })).status).toBe(
      409,
    );
    h.sqlite.run('DELETE FROM organization_membership WHERE user_id = ?', [h.userId('sam')]);
    expect((await call('sam', 'POST', path, { objective: 'pri', inputHash })).status).toBe(403);
    expect(await h.retryAtStore(workPackageId, 'org-a', h.userId('sam'), inputHash)).toBe(
      'forbidden',
    );
    h.sqlite.run("UPDATE organization_membership SET role = 'viewer' WHERE user_id = ?", [
      h.userId('ada'),
    ]);
    h.sqlite.run('DELETE FROM access_grant WHERE subject_id = ?', [h.userId('ada')]);
    h.grant('org-a', 'ada', 'package-viewer', 'work_package', workPackageId);
    expect((await call('ada', 'POST', path, { objective: 'pri', inputHash })).status).toBe(403);
    expect(audits()).toEqual(auditsBefore);
    expect(h.sqlite.query('SELECT work_package_id FROM solver_slot').all()).toEqual([]);
  });
  it('rolls a granted Retry back if reservation persistence fails and admits its manager', async () => {
    const { workPackageId, inputHash } = await retryFixture();
    h.grant('org-a', 'sam', 'package-manager', 'work_package', workPackageId);
    const path = `/api/work-packages/${workPackageId}/optimization/retry`;
    const auditsBefore = audits();
    const beforeEvents = h.sqlite.query('SELECT * FROM event_log ORDER BY rowid').all();
    h.sqlite.run(
      "CREATE TRIGGER retry_refused BEFORE INSERT ON solver_slot BEGIN SELECT RAISE(ABORT, 'retry refused'); END",
    );
    expect((await call('sam', 'POST', path, { objective: 'pri', inputHash })).status).toBe(500);
    expect(h.sqlite.query('SELECT work_package_id FROM solver_slot').all()).toEqual([]);
    expect(h.sqlite.query('SELECT work_package_id FROM solver_queue').all()).toEqual([]);
    expect(audits()).toEqual(auditsBefore);
    expect(h.sqlite.query('SELECT * FROM event_log ORDER BY rowid').all()).toEqual(beforeEvents);
    h.sqlite.run('DROP TRIGGER retry_refused');
    expect((await call('ada', 'POST', path, { objective: 'pri', inputHash })).status).toBe(202);
    expect(audits()).toEqual(auditsBefore);
  });
  it('scopes the same running app once another connection activates isolation', async () => {
    await create('ada', 'A plan');
    await create('grace', 'B plan');
    expect(await listedNames('ada')).toEqual(['A plan', 'B plan']);
    activate();
    expect(await listedNames('ada')).toEqual([]);
  });

  it('creates a work package only its own organization can see', async () => {
    activate();
    const id = await create('ada', 'A plan');
    expect((await call('ada', 'GET', `/api/work-packages/${id}`)).status).toBe(200);
    expect((await call('grace', 'GET', `/api/work-packages/${id}`)).status).toBe(404);
    expect(
      h.sqlite
        .query('SELECT organization_id FROM work_package_organization WHERE resource_id = ?')
        .all(id),
    ).toEqual([{ organization_id: 'org-a' }]);
  });

  it("lists only the active organization's work packages", async () => {
    activate();
    await create('ada', 'A plan');
    await create('grace', 'B plan');
    expect(await listedNames('ada')).toEqual(['A plan']);
    expect(await listedNames('grace')).toEqual(['B plan']);
  });

  it('answers 404 alike for a foreign and an absent work package, and changes nothing', async () => {
    activate();
    const foreign = await create('grace', 'B plan');
    const missing = everyAddressedRoute('missing');
    for (const [at, [method, path, body]] of everyAddressedRoute(foreign).entries()) {
      const [, missingPath] = missing[at];
      const toForeign = await call('ada', method, path, body);
      const toMissing = await call('ada', method, missingPath, body);
      expect({ route: `${method} ${path}`, ...toForeign }).toEqual({
        route: `${method} ${path}`,
        status: 404,
        body: { error: 'not_found' },
      });
      expect(toMissing).toEqual(toForeign);
    }
    expect(await listedNames('grace')).toEqual(['B plan']);
    expect(h.sqlite.query('SELECT COUNT(*) AS n FROM work_package_access').get()).toEqual({ n: 0 });
  });

  it('refuses a viewer every work package write and lets the viewer read and open', async () => {
    activate();
    const id = await create('ada', 'A plan');
    expect(
      await call('vic', 'POST', '/api/work-packages', {
        name: 'Viewer plan',
        projectId: readParentId(id),
      }),
    ).toMatchObject({
      status: 403,
      body: { error: 'forbidden' },
    });
    expect(
      await call('vic', 'PATCH', `/api/work-packages/${id}`, { name: 'Viewer' }),
    ).toMatchObject({
      status: 403,
      body: { error: 'forbidden' },
    });
    expect(
      await call('vic', 'POST', `/api/work-packages/${id}/optimization/retry`, {
        objective: 'pri',
        inputHash: 'h',
      }),
    ).toMatchObject({ status: 403, body: { error: 'forbidden' } });
    expect((await call('vic', 'GET', `/api/work-packages/${id}`)).status).toBe(200);
    expect(
      (await call('vic', 'GET', `/api/work-packages/${id}/export?format=markdown`)).status,
    ).toBe(200);
    expect((await call('vic', 'POST', `/api/work-packages/${id}/opened`)).status).toBe(204);
    expect(await listedNames('ada')).toEqual(['A plan']);
  });

  it('admits an explicit package manager on a restricted package and refuses an organization admin', async () => {
    activate();
    // vic as an admin here: only a super-admin recovers.
    h.sqlite.run("UPDATE organization_membership SET role = 'admin' WHERE user_id = ?", [
      userId('vic'),
    ]);
    h.grant('org-a', 'vic', 'org-admin');
    const id = await create('ada', 'A plan');
    const auditsBefore = audits();
    expect(
      (await call('ada', 'PATCH', `/api/work-packages/${id}`, { restricted: true })).status,
    ).toBe(200);
    expect(await call('vic', 'PATCH', `/api/work-packages/${id}`, { name: 'Taken' })).toMatchObject(
      {
        status: 403,
        body: { error: 'forbidden', permission: 'package.manage_settings' },
      },
    );
    expect((await call('ada', 'PATCH', `/api/work-packages/${id}`, { name: 'Mine' })).status).toBe(
      200,
    );
    expect(audits()).toEqual(auditsBefore);
  });

  it('recovers a restricted package only by clearing its flag', async () => {
    activate();
    const id = await create('ada', 'A plan');
    await call('ada', 'PATCH', `/api/work-packages/${id}`, { restricted: true });
    const auditsBefore = audits();
    const grantsBefore = h.sqlite.query('SELECT * FROM access_grant ORDER BY id').all();
    const recovered = await call('sam', 'PATCH', `/api/work-packages/${id}`, {
      restricted: false,
    });
    expect(recovered.status).toBe(200);
    expect(recovered.body).toMatchObject({ workPackage: { id, restricted: false } });
    expect(h.sqlite.query('SELECT created_by FROM work_package WHERE id=?').get(id)).toEqual({
      created_by: userId('ada'),
    });
    expect(h.sqlite.query('SELECT * FROM access_grant ORDER BY id').all()).toEqual(grantsBefore);
    expect(audits()).toEqual([
      ...auditsBefore,
      {
        organization_id: 'org-a',
        actor_id: userId('sam'),
        action: 'restricted_work_package_recovery',
        subject_kind: 'work_package',
        subject_id: id,
        detail: '{"fields":["restricted"]}',
      },
    ]);
  });

  it('records nothing for a recovery that changes nothing, or an edit refused', async () => {
    activate();
    const id = await create('ada', 'A plan');
    await call('ada', 'PATCH', `/api/work-packages/${id}`, { restricted: true });
    const auditsBefore = audits();
    expect((await call('sam', 'PATCH', `/api/work-packages/${id}`, {})).status).toBe(403);
    expect((await call('vic', 'PATCH', `/api/work-packages/${id}`, { name: 'No' })).status).toBe(
      404,
    );
    expect(audits()).toEqual(auditsBefore);
  });

  it('refuses a removed member on the next request', async () => {
    activate();
    const id = await create('ada', 'A plan');
    h.sqlite.run('DELETE FROM organization_membership WHERE user_id = ?', [userId('ada')]);
    for (const [method, path, body] of [
      ['GET', '/api/work-packages'],
      ['POST', '/api/work-packages', { name: 'After removal', projectId: readParentId(id) }],
      ...everyAddressedRoute(id),
    ] as [string, string, unknown?][]) {
      expect({ route: `${method} ${path}`, ...(await call('ada', method, path, body)) }).toEqual({
        route: `${method} ${path}`,
        status: 403,
        body: { error: 'not_a_member' },
      });
    }
  });

  it('refuses a session bound to no organization before any lookup', async () => {
    activate();
    const id = await create('ada', 'A plan');
    for (const [method, path, body] of [
      ['GET', '/api/work-packages'],
      ['POST', '/api/work-packages', { name: 'Unbound', projectId: readParentId(id) }],
      ...everyAddressedRoute(id),
      ...everyAddressedRoute('missing'),
    ] as [string, string, unknown?][]) {
      expect({ route: `${method} ${path}`, ...(await call('nell', method, path, body)) }).toEqual({
        route: `${method} ${path}`,
        status: 403,
        body: { error: 'no_active_organization' },
      });
    }
  });

  it("links a solution slug within the organization, blind to another organization's", async () => {
    activate();
    const own = await create('ada', 'A plan');
    const second = await create('ada', 'A second plan');
    const foreign = await create('grace', 'B plan');
    expect(
      await call('grace', 'PATCH', `/api/work-packages/${foreign}`, {
        solutionRef: { slug: 'shared', url: 'https://b.example' },
      }),
    ).toMatchObject({ status: 200 });
    const shared = { solutionRef: { slug: 'shared', url: 'https://a.example' } };
    const linked = await call('ada', 'PATCH', `/api/work-packages/${own}`, shared);
    expect(linked.status).toBe(200);
    expect(linked.body).toMatchObject({ workPackage: shared });
    // Only a writer of the organization learns that the slug is in use.
    expect(await call('vic', 'PATCH', `/api/work-packages/${second}`, shared)).toMatchObject({
      status: 403,
      body: { error: 'forbidden' },
    });
    expect(await call('ada', 'PATCH', `/api/work-packages/${foreign}`, shared)).toEqual({
      status: 404,
      body: { error: 'not_found' },
    });
    expect(await call('ada', 'PATCH', `/api/work-packages/${second}`, shared)).toEqual({
      status: 409,
      body: { error: 'solution_taken' },
    });
    expect((await call('ada', 'GET', '/plans/by-solution/shared')).body).toMatchObject({
      workPackage: { id: own },
    });
    expect((await call('grace', 'GET', '/plans/by-solution/shared')).body).toMatchObject({
      workPackage: { id: foreign },
    });
    expect(
      (await call('ada', 'PATCH', `/api/work-packages/${own}`, { solutionRef: null })).status,
    ).toBe(200);
    expect((await call('ada', 'PATCH', `/api/work-packages/${second}`, shared)).status).toBe(200);
  });

  it('fails without effects on a malformed reaching grant beside sufficient valid authority', async () => {
    activate();
    const projectId = await createParent('ada', 'Malformed grant engagement');
    h.grant('org-a', 'vic', 'org-admin');
    h.sqlite.run('PRAGMA ignore_check_constraints = ON');
    try {
      const corrupted = h.sqlite
        .query(
          "INSERT INTO access_role_permission(role_id,permission) VALUES('project-viewer','broken.permission')",
        )
        .run();
      expect(corrupted.changes).toBe(1);
    } finally {
      h.sqlite.run('PRAGMA ignore_check_constraints = OFF');
    }
    const workPackagesBefore = h.sqlite.query('SELECT * FROM work_package ORDER BY id').all();
    const auditsBefore = audits();
    expect(
      (await call('vic', 'POST', '/api/work-packages', { name: 'Owner plan', projectId })).status,
    ).toBe(500);
    expect(h.sqlite.query('SELECT * FROM work_package ORDER BY id').all()).toEqual(
      workPackagesBefore,
    );
    expect(audits()).toEqual(auditsBefore);
  });

  it('answers 401 for a missing credential, before organization access', async () => {
    activate();
    expect((await call('nobody', 'GET', '/api/work-packages')).status).toBe(401);
  });
});

describe('a broken activation marker', () => {
  it.each([
    ['absent', 'DROP TABLE organization_activation'],
    ['malformed', 'DROP TRIGGER IF EXISTS organization_activation_no_delete'],
  ])('fails the work package list and read as a server error when %s', async (state, damage) => {
    h.sqlite.run(damage);
    if (state === 'malformed') h.sqlite.run('DELETE FROM organization_activation');
    expect((await call('ada', 'GET', '/api/work-packages')).status).toBe(500);
    expect((await call('ada', 'GET', '/api/work-packages/missing')).status).toBe(500);
  });
});
