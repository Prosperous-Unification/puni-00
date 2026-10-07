import { contractVersionOf } from '@wbs/domain';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

/**
 * The project boundary under organization isolation (task 3.1), over real
 * SQLite and the production organization access; see {@link OrganizationHarness}.
 */
let h: OrganizationHarness;

beforeEach(async () => {
  h = OrganizationHarness.open();
  for (const username of ['ada', 'grace', 'vic', 'sam', 'nell']) await h.register(username);
  h.organization('org-a');
  h.organization('org-b');
  h.member('org-a', 'ada', 'member');
  h.member('org-a', 'vic', 'viewer');
  h.member('org-a', 'sam', 'super_admin');
  h.member('org-b', 'grace', 'member');
  for (const username of ['ada', 'vic', 'sam']) h.bind(username, 'org-a');
  h.bind('grace', 'org-b');
});

afterEach(() => {
  h.close();
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
  const answer = await call(username, 'POST', '/api/projects', { name });
  if (answer.status !== 200) throw new Error(`create refused: ${JSON.stringify(answer)}`);
  return (answer.body as { project: { id: string } }).project.id;
}

/** A failed exact-key objective that the mounted Retry route can admit. */
async function retryFixture(): Promise<{ projectId: string; inputHash: string }> {
  h.close();
  h = OrganizationHarness.openComposed(true);
  for (const username of ['ada', 'sam', 'nell', 'vic', 'grace']) await h.register(username);
  h.organization('org-a');
  h.organization('org-b');
  h.member('org-a', 'ada', 'member');
  h.member('org-a', 'sam', 'super_admin');
  h.member('org-a', 'nell', 'member');
  h.member('org-a', 'vic', 'viewer');
  h.member('org-b', 'grace', 'member');
  for (const username of ['ada', 'sam', 'nell', 'vic']) h.bind(username, 'org-a');
  h.bind('grace', 'org-b');
  h.activate();
  const projectId = await create('ada', 'Retry plan');
  const detail = await call('ada', 'GET', `/api/projects/${projectId}`);
  const stepId = (detail.body as { steps: { id: string }[] }).steps.at(0)?.id;
  if (stepId === undefined) throw new Error('retry project has no starting step');
  h.sqlite.run(
    "INSERT INTO work_item (id, project_id, parent_id, position, name) VALUES ('w-retry', ?, NULL, 0, 'Work')",
    [projectId],
  );
  h.sqlite.run(
    "INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic) VALUES ('w-retry', ?, 1, 2, 3)",
    [stepId],
  );
  const inputHash = await h.optimizationHash(projectId);
  const contractVersion = contractVersionOf('0.1.0');
  expect(
    (await call('ada', 'PATCH', `/api/projects/${projectId}`, { restricted: true })).status,
  ).toBe(200);
  h.sqlite.run('UPDATE project SET optimization_enabled = 1 WHERE id = ?', [projectId]);
  h.sqlite.run(
    'INSERT INTO optimization_generation (project_id, contract_version, generation, input_hash, updated_at) VALUES (?, ?, 1, ?, 1)',
    [projectId, contractVersion, inputHash],
  );
  h.sqlite.run(
    "INSERT INTO optimized_schedule_cache (project_id, input_hash, objective, contract_version, budget_ms, generation, status, failure_reason, created_at) VALUES (?, ?, 'pri', ?, 60000, 1, 'failed', 'timeout', 2)",
    [projectId, inputHash, contractVersion],
  );
  return { projectId, inputHash };
}

async function listedNames(username: string): Promise<string[]> {
  const answer = await call(username, 'GET', '/api/projects');
  expect(answer.status).toBe(200);
  return (answer.body as { projects: { name: string }[] }).projects.map((p) => p.name).sort();
}

/** Every project route, addressed at `id`, with a body each would accept from a writer. */
function everyAddressedRoute(id: string): [string, string, unknown?][] {
  return [
    ['GET', `/api/projects/${id}`],
    ['GET', `/api/projects/${id}/export?format=markdown`],
    ['POST', `/api/projects/${id}/opened`],
    ['PATCH', `/api/projects/${id}`, { name: 'Renamed' }],
    ['POST', `/api/projects/${id}/optimization/retry`, { objective: 'pri', inputHash: 'h' }],
  ];
}

describe('before activation', () => {
  it('keeps deployment-wide access whatever organization a session is bound to', async () => {
    const id = await create('grace', 'B plan');
    expect(await listedNames('ada')).toEqual(['B plan']);
    expect((await call('ada', 'GET', `/api/projects/${id}`)).status).toBe(200);
    expect((await call('nell', 'GET', `/api/projects/${id}`)).status).toBe(200);
    expect((await call('vic', 'PATCH', `/api/projects/${id}`, { name: 'Legacy' })).status).toBe(
      200,
    );
  });
});

describe('after activation', () => {
  it('audits a super-admin optimization retry only when it is accepted', async () => {
    const { projectId, inputHash } = await retryFixture();
    expect(
      await call('sam', 'POST', `/api/projects/${projectId}/optimization/retry`, {
        objective: 'pri',
        inputHash,
      }),
    ).toMatchObject({ status: 202 });
    expect(
      h.sqlite
        .query('SELECT organization_id, actor_id, subject_id, detail FROM organization_audit')
        .all(),
    ).toEqual([
      {
        organization_id: 'org-a',
        actor_id: h.userId('sam'),
        subject_id: projectId,
        detail: '{"optimizer":"retry"}',
      },
    ]);
    expect(
      h.sqlite
        .query<{ owner_id: string }, [string]>('SELECT owner_id FROM project WHERE id = ?')
        .get(projectId),
    ).toEqual({ owner_id: h.userId('ada') });
  });
  it('refuses other retry writers, a foreign project and a removed super-admin without audit', async () => {
    const { projectId, inputHash } = await retryFixture();
    const path = `/api/projects/${projectId}/optimization/retry`;
    for (const username of ['nell', 'vic']) {
      expect((await call(username, 'POST', path, { objective: 'pri', inputHash })).status).toBe(
        403,
      );
    }
    h.sqlite.run("UPDATE organization_membership SET role = 'admin' WHERE user_id = ?", [
      h.userId('nell'),
    ]);
    expect((await call('nell', 'POST', path, { objective: 'pri', inputHash })).status).toBe(403);
    const foreign = await create('grace', 'Foreign retry');
    expect(
      (
        await call('sam', 'POST', `/api/projects/${foreign}/optimization/retry`, {
          objective: 'pri',
          inputHash,
        })
      ).status,
    ).toBe(404);
    expect(await h.retryAtStore(projectId, 'org-b', h.userId('grace'), inputHash)).toBe(
      'not_found',
    );
    expect((await call('sam', 'POST', path, { objective: 'pri', inputHash: 'stale' })).status).toBe(
      409,
    );
    h.sqlite.run('DELETE FROM organization_membership WHERE user_id = ?', [h.userId('sam')]);
    expect((await call('sam', 'POST', path, { objective: 'pri', inputHash })).status).toBe(403);
    expect(await h.retryAtStore(projectId, 'org-a', h.userId('sam'), inputHash)).toBe('forbidden');
    h.sqlite.run("UPDATE organization_membership SET role = 'viewer' WHERE user_id = ?", [
      h.userId('ada'),
    ]);
    expect((await call('ada', 'POST', path, { objective: 'pri', inputHash })).status).toBe(403);
    expect(h.sqlite.query('SELECT id FROM organization_audit').all()).toEqual([]);
    expect(h.sqlite.query('SELECT project_id FROM solver_slot').all()).toEqual([]);
  });
  it('rolls a recovered Retry back if audit insertion fails and admits a creator without audit', async () => {
    const { projectId, inputHash } = await retryFixture();
    const path = `/api/projects/${projectId}/optimization/retry`;
    const beforeEvents = h.sqlite.query('SELECT * FROM event_log ORDER BY rowid').all();
    h.sqlite.run(
      "CREATE TRIGGER audit_refused BEFORE INSERT ON organization_audit BEGIN SELECT RAISE(ABORT, 'audit refused'); END",
    );
    expect((await call('sam', 'POST', path, { objective: 'pri', inputHash })).status).toBe(500);
    expect(h.sqlite.query('SELECT project_id FROM solver_slot').all()).toEqual([]);
    expect(h.sqlite.query('SELECT project_id FROM solver_queue').all()).toEqual([]);
    expect(h.sqlite.query('SELECT id FROM organization_audit').all()).toEqual([]);
    expect(h.sqlite.query('SELECT * FROM event_log ORDER BY rowid').all()).toEqual(beforeEvents);
    h.sqlite.run('DROP TRIGGER audit_refused');
    expect((await call('ada', 'POST', path, { objective: 'pri', inputHash })).status).toBe(202);
    expect(h.sqlite.query('SELECT id FROM organization_audit').all()).toEqual([]);
  });
  it('scopes the same running app once another connection activates isolation', async () => {
    await create('ada', 'A plan');
    await create('grace', 'B plan');
    expect(await listedNames('ada')).toEqual(['A plan', 'B plan']);
    activate();
    expect(await listedNames('ada')).toEqual([]);
  });

  it('creates a project only its own organization can see', async () => {
    activate();
    const id = await create('ada', 'A plan');
    expect((await call('ada', 'GET', `/api/projects/${id}`)).status).toBe(200);
    expect((await call('grace', 'GET', `/api/projects/${id}`)).status).toBe(404);
    expect(
      h.sqlite
        .query('SELECT organization_id FROM project_organization WHERE resource_id = ?')
        .all(id),
    ).toEqual([{ organization_id: 'org-a' }]);
  });

  it("lists only the active organization's projects", async () => {
    activate();
    await create('ada', 'A plan');
    await create('grace', 'B plan');
    expect(await listedNames('ada')).toEqual(['A plan']);
    expect(await listedNames('grace')).toEqual(['B plan']);
  });

  it('answers 404 alike for a foreign and an absent project, and changes nothing', async () => {
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
    expect(h.sqlite.query('SELECT COUNT(*) AS n FROM project_access').get()).toEqual({ n: 0 });
  });

  it('refuses a viewer every project write and lets the viewer read and open', async () => {
    activate();
    const id = await create('ada', 'A plan');
    expect(await call('vic', 'POST', '/api/projects', { name: 'Viewer plan' })).toEqual({
      status: 403,
      body: { error: 'forbidden' },
    });
    expect(await call('vic', 'PATCH', `/api/projects/${id}`, { name: 'Viewer' })).toEqual({
      status: 403,
      body: { error: 'forbidden' },
    });
    expect(
      await call('vic', 'POST', `/api/projects/${id}/optimization/retry`, {
        objective: 'pri',
        inputHash: 'h',
      }),
    ).toEqual({ status: 403, body: { error: 'forbidden' } });
    expect((await call('vic', 'GET', `/api/projects/${id}`)).status).toBe(200);
    expect((await call('vic', 'GET', `/api/projects/${id}/export?format=markdown`)).status).toBe(
      200,
    );
    expect((await call('vic', 'POST', `/api/projects/${id}/opened`)).status).toBe(204);
    expect(await listedNames('ada')).toEqual(['A plan']);
  });

  it('lets only the creator edit a restricted project, a super-admin only as recovery', async () => {
    activate();
    // vic as an admin here: only a super-admin recovers.
    h.sqlite.run("UPDATE organization_membership SET role = 'admin' WHERE user_id = ?", [
      userId('vic'),
    ]);
    const id = await create('ada', 'A plan');
    expect((await call('ada', 'PATCH', `/api/projects/${id}`, { restricted: true })).status).toBe(
      200,
    );
    expect(await call('vic', 'PATCH', `/api/projects/${id}`, { name: 'Taken' })).toEqual({
      status: 403,
      body: { error: 'forbidden' },
    });
    expect((await call('ada', 'PATCH', `/api/projects/${id}`, { name: 'Mine' })).status).toBe(200);
    expect(audits()).toEqual([]);
  });

  it('recovers a restricted project as an audited super-admin edit', async () => {
    activate();
    const id = await create('ada', 'A plan');
    await call('ada', 'PATCH', `/api/projects/${id}`, { restricted: true });
    const recovered = await call('sam', 'PATCH', `/api/projects/${id}`, {
      name: 'Recovered',
      restricted: false,
    });
    expect(recovered.status).toBe(200);
    expect((recovered.body as { project: { ownerId: string } }).project.ownerId).toBe(
      userId('ada'),
    );
    expect(audits()).toEqual([
      {
        organization_id: 'org-a',
        actor_id: userId('sam'),
        action: 'restricted_project_recovery',
        subject_kind: 'project',
        subject_id: id,
        detail: '{"fields":["name","restricted"]}',
      },
    ]);
  });

  it('records nothing for a recovery that changes nothing, or an edit refused', async () => {
    activate();
    const id = await create('ada', 'A plan');
    await call('ada', 'PATCH', `/api/projects/${id}`, { restricted: true });
    expect((await call('sam', 'PATCH', `/api/projects/${id}`, {})).status).toBe(200);
    expect((await call('vic', 'PATCH', `/api/projects/${id}`, { name: 'No' })).status).toBe(403);
    expect(audits()).toEqual([]);
  });

  it('refuses a removed member on the next request', async () => {
    activate();
    const id = await create('ada', 'A plan');
    h.sqlite.run('DELETE FROM organization_membership WHERE user_id = ?', [userId('ada')]);
    for (const [method, path, body] of [
      ['GET', '/api/projects'],
      ['POST', '/api/projects', { name: 'After removal' }],
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
      ['GET', '/api/projects'],
      ['POST', '/api/projects', { name: 'Unbound' }],
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
    h.sqlite.run("UPDATE project SET solution_slug = 'shared', solution_url = 'u' WHERE id = ?", [
      foreign,
    ]);
    const shared = { solutionRef: { slug: 'shared', url: 'https://a.example' } };
    const linked = await call('ada', 'PATCH', `/api/projects/${own}`, shared);
    expect(linked.status).toBe(200);
    expect(linked.body).toMatchObject({ project: shared });
    // Only a writer of the organization learns that the slug is in use.
    expect(await call('vic', 'PATCH', `/api/projects/${second}`, shared)).toEqual({
      status: 403,
      body: { error: 'forbidden' },
    });
    expect(await call('ada', 'PATCH', `/api/projects/${foreign}`, shared)).toEqual({
      status: 404,
      body: { error: 'not_found' },
    });
    expect(await call('ada', 'PATCH', `/api/projects/${second}`, shared)).toEqual({
      status: 409,
      body: { error: 'solution_taken' },
    });
    expect((await call('ada', 'GET', '/plans/by-solution/shared')).body).toMatchObject({
      project: { id: own },
    });
    expect((await call('grace', 'GET', '/plans/by-solution/shared')).body).toMatchObject({
      project: { id: foreign },
    });
    expect((await call('ada', 'PATCH', `/api/projects/${own}`, { solutionRef: null })).status).toBe(
      200,
    );
    expect((await call('ada', 'PATCH', `/api/projects/${second}`, shared)).status).toBe(200);
  });

  it('fails as a server error on a malformed membership role', async () => {
    activate();
    h.sqlite.run('PRAGMA ignore_check_constraints = ON');
    h.sqlite.run("UPDATE organization_membership SET role = 'owner' WHERE user_id = ?", [
      userId('vic'),
    ]);
    h.sqlite.run('PRAGMA ignore_check_constraints = OFF');
    expect((await call('vic', 'POST', '/api/projects', { name: 'Owner plan' })).status).toBe(500);
  });

  it('answers 401 for a missing credential, before organization access', async () => {
    activate();
    expect((await call('nobody', 'GET', '/api/projects')).status).toBe(401);
  });
});

describe('a broken activation marker', () => {
  it.each([
    ['absent', 'DROP TABLE organization_activation'],
    ['malformed', 'DROP TRIGGER IF EXISTS organization_activation_no_delete'],
  ])('fails the project list and read as a server error when %s', async (state, damage) => {
    h.sqlite.run(damage);
    if (state === 'malformed') h.sqlite.run('DELETE FROM organization_activation');
    expect((await call('ada', 'GET', '/api/projects')).status).toBe(500);
    expect((await call('ada', 'GET', '/api/projects/missing')).status).toBe(500);
  });
});
