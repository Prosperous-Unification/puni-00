import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { type Answer, OrganizationHarness } from '../testing/organization-harness';

/**
 * Saved plans and project history under organization isolation (task 3.6),
 * over be-01's production composition and real SQLite; see
 * {@link OrganizationHarness.openComposed}.
 */
let h: OrganizationHarness;
let own: string;
let foreign: string;
let foreignPlan: string;

beforeEach(async () => {
  h = OrganizationHarness.openComposed();
  for (const username of ['ada', 'grace', 'vic', 'nell']) await h.register(username);
  h.organization('org-a');
  h.organization('org-b');
  h.member('org-a', 'ada', 'member');
  h.member('org-a', 'vic', 'viewer');
  h.member('org-b', 'grace', 'member');
  h.bind('ada', 'org-a');
  h.bind('vic', 'org-a');
  h.bind('grace', 'org-b');
  h.activate();
  own = await create('ada', 'A plan');
  foreign = await create('grace', 'B plan');
  foreignPlan = await save('grace', foreign, 'Theirs');
});

afterEach(() => {
  h.close();
});

async function create(username: string, name: string): Promise<string> {
  const answer = await h.call(username, 'POST', '/api/projects', { name });
  if (answer.status !== 200) throw new Error(`create refused: ${JSON.stringify(answer)}`);
  return (answer.body as { project: { id: string } }).project.id;
}

async function save(username: string, projectId: string, name: string): Promise<string> {
  const answer = await h.call(username, 'POST', `/api/projects/${projectId}/saved-plans`, { name });
  if (answer.status !== 201) throw new Error(`save refused: ${JSON.stringify(answer)}`);
  return (answer.body as { savedPlan: { id: string } }).savedPlan.id;
}

/** Every saved-plan and history route addressed at `projectId`. */
function projectRoutes(projectId: string): [string, string, unknown?][] {
  return [
    ['POST', `/api/projects/${projectId}/saved-plans`, { name: 'Mine now' }],
    ['GET', `/api/projects/${projectId}/saved-plans`],
    ['GET', `/api/projects/${projectId}/saved-plans/compare?left=current&right=current`],
    ['GET', `/api/projects/${projectId}/history`],
  ];
}

/** Every route addressed at one saved plan. */
function planRoutes(savedPlanId: string): [string, string, unknown?][] {
  return [
    ['GET', `/api/saved-plans/${savedPlanId}`],
    ['PATCH', `/api/saved-plans/${savedPlanId}`, { name: 'Mine now' }],
    ['DELETE', `/api/saved-plans/${savedPlanId}`],
  ];
}

/** What B holds, to show a refused call changed none of it. */
async function foreignState(): Promise<Answer[]> {
  return [
    await h.call('grace', 'GET', `/api/projects/${foreign}/saved-plans`),
    await h.call('grace', 'GET', `/api/saved-plans/${foreignPlan}`),
  ];
}

describe('after activation', () => {
  it('answers 404 alike for a foreign and an absent project on every saved-plan and history route', async () => {
    const before = await foreignState();
    const toAbsent = projectRoutes('no-such-project');
    for (const [index, [method, path, body]] of projectRoutes(foreign).entries()) {
      const answer = await h.call('ada', method, path, body);
      const absent = toAbsent.at(index);
      if (absent === undefined) throw new Error('route lists differ');
      expect({ route: `${method} ${path}`, answer }).toEqual({
        route: `${method} ${path}`,
        answer: await h.call('ada', absent[0], absent[1], absent[2]),
      });
      expect(answer.status).toBe(404);
    }
    expect(await foreignState()).toEqual(before);
  });

  it('answers a foreign saved plan exactly as an absent one', async () => {
    const before = await foreignState();
    const toAbsent = planRoutes('no-such-plan');
    for (const [index, [method, path, body]] of planRoutes(foreignPlan).entries()) {
      const answer = await h.call('ada', method, path, body);
      const absent = toAbsent.at(index);
      if (absent === undefined) throw new Error('route lists differ');
      expect({ route: `${method} ${path}`, answer }).toEqual({
        route: `${method} ${path}`,
        answer: await h.call('ada', absent[0], absent[1], absent[2]),
      });
      expect(answer.status).toBe(404);
    }
    expect(await foreignState()).toEqual(before);
  });

  it('refuses a viewer every saved-plan write and lets the viewer read', async () => {
    const mine = await save('ada', own, 'Mine');
    expect(
      (await h.call('vic', 'POST', `/api/projects/${own}/saved-plans`, { name: 'Viewer' })).status,
    ).toBe(403);
    expect((await h.call('vic', 'GET', `/api/projects/${own}/saved-plans`)).status).toBe(200);
    expect((await h.call('vic', 'GET', `/api/saved-plans/${mine}`)).status).toBe(200);
    expect((await h.call('vic', 'GET', `/api/projects/${own}/history`)).status).toBe(200);
    // The plan's own creator, demoted to viewer: the creator rule alone would admit the write.
    h.sqlite.run("UPDATE organization_membership SET role = 'viewer' WHERE user_id = ?", [
      h.userId('ada'),
    ]);
    expect(await h.call('ada', 'PATCH', `/api/saved-plans/${mine}`, { name: 'Renamed' })).toEqual({
      status: 403,
      body: { error: 'forbidden' },
    });
    expect(await h.call('ada', 'DELETE', `/api/saved-plans/${mine}`)).toEqual({
      status: 403,
      body: { error: 'forbidden' },
    });
  });

  it('lets a member save, rename and delete a plan of the own project', async () => {
    const mine = await save('ada', own, 'Mine');
    expect(
      (await h.call('ada', 'PATCH', `/api/saved-plans/${mine}`, { name: 'Renamed' })).status,
    ).toBe(200);
    expect((await h.call('ada', 'DELETE', `/api/saved-plans/${mine}`)).status).toBe(204);
  });

  it("maps a plan saved after activation to its project's organization", async () => {
    const mine = await save('ada', own, 'Mine');
    expect(
      h.sqlite
        .query<{ organization_id: string }, [string]>(
          'SELECT organization_id FROM saved_plan_organization WHERE resource_id = ?',
        )
        .get(mine),
    ).toEqual({ organization_id: 'org-a' });
  });

  it('refuses an unbound session and a removed member before any lookup', async () => {
    for (const [method, path, body] of [...projectRoutes(own), ...planRoutes(foreignPlan)]) {
      expect({
        route: `${method} ${path}`,
        answer: await h.call('nell', method, path, body),
      }).toEqual({
        route: `${method} ${path}`,
        answer: { status: 403, body: { error: 'no_active_organization' } },
      });
    }
    h.sqlite.run('DELETE FROM organization_membership WHERE user_id = ?', [h.userId('ada')]);
    expect(await h.call('ada', 'GET', `/api/projects/${own}/saved-plans`)).toEqual({
      status: 403,
      body: { error: 'not_a_member' },
    });
  });
});
