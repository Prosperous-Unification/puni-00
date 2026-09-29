import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

/**
 * The space routes (`add-spaces` slice 2) over real SQLite and the production
 * organization access: owner resolution, roles, `all`, and foreign spaces and
 * projects answered as absent.
 */
let h: OrganizationHarness;

afterEach(() => {
  h.close();
});

async function createProject(username: string, name: string): Promise<string> {
  const answer = await h.call(username, 'POST', '/api/projects', { name });
  if (answer.status !== 200) throw new Error(`create refused: ${JSON.stringify(answer)}`);
  return (answer.body as { project: { id: string } }).project.id;
}

async function createSpace(username: string, name: string): Promise<string> {
  const answer = await h.call(username, 'POST', '/api/spaces', { name });
  if (answer.status !== 201) throw new Error(`space refused: ${JSON.stringify(answer)}`);
  return (answer.body as { space: { id: string } }).space.id;
}

describe('after activation', () => {
  let own: string;
  let foreignProject: string;
  let foreignSpace: string;

  beforeEach(async () => {
    h = OrganizationHarness.open();
    for (const username of ['ada', 'vic', 'grace']) await h.register(username);
    h.organization('org-a');
    h.organization('org-b');
    h.member('org-a', 'ada', 'member');
    h.member('org-a', 'vic', 'viewer');
    h.member('org-b', 'grace', 'member');
    h.bind('ada', 'org-a');
    h.bind('vic', 'org-a');
    h.bind('grace', 'org-b');
    h.activate();
    own = await createProject('ada', 'A plan');
    foreignProject = await createProject('grace', 'B plan');
    foreignSpace = await createSpace('grace', 'Theirs');
  });

  it('creates, lists, adds, moves, reads and removes within the organization', async () => {
    const second = await createProject('ada', 'A second');
    const space = await createSpace('ada', 'Q3');
    expect(
      (await h.call('ada', 'POST', `/api/spaces/${space}/projects`, { projectId: own })).body,
    ).toEqual({ position: 10 });
    await h.call('ada', 'POST', `/api/spaces/${space}/projects`, {
      projectId: second,
      afterProjectId: own,
    });
    expect(
      await h.call('ada', 'POST', `/api/spaces/${space}/projects/${second}/move`, {
        afterProjectId: null,
      }),
    ).toMatchObject({ status: 200, body: { position: 5 } });
    const read = await h.call('ada', 'GET', `/api/spaces/${space}`);
    expect(read).toMatchObject({
      status: 200,
      body: {
        space: { id: space, name: 'Q3', virtual: false, projectCount: 2, revision: 3 },
        rows: [
          { project: { id: second, ownerName: 'ada' }, position: 5 },
          { project: { id: own }, position: 10 },
        ],
      },
    });
    expect(await h.call('ada', 'GET', '/api/spaces')).toMatchObject({
      status: 200,
      body: { spaces: [{ id: space, projectCount: 2 }] },
    });
    expect((await h.call('ada', 'DELETE', `/api/spaces/${space}/projects/${own}`)).status).toBe(
      204,
    );
    expect((await h.call('ada', 'DELETE', `/api/spaces/${space}`)).status).toBe(204);
    expect((await h.call('ada', 'GET', `/api/projects/${own}`)).status).toBe(200);
  });

  it('refuses a viewer every space write and lets the viewer read', async () => {
    const space = await createSpace('ada', 'Q3');
    await h.call('ada', 'POST', `/api/spaces/${space}/projects`, { projectId: own });
    for (const [method, path, body] of [
      ['POST', '/api/spaces', { name: 'Mine' }],
      ['PATCH', `/api/spaces/${space}`, { name: 'Mine' }],
      ['POST', `/api/spaces/${space}/projects`, { projectId: own }],
      ['POST', `/api/spaces/${space}/projects/${own}/move`, {}],
      ['DELETE', `/api/spaces/${space}/projects/${own}`],
      ['DELETE', `/api/spaces/${space}`],
    ] as const) {
      expect({ method, path, answer: await h.call('vic', method, path, body) }).toMatchObject({
        answer: { status: 403, body: { error: 'forbidden' } },
      });
    }
    expect(await h.call('vic', 'GET', `/api/spaces/${space}`)).toMatchObject({
      status: 200,
      body: { rows: [{ project: { id: own } }] },
    });
  });

  it("answers another organization's space as absent to every route", async () => {
    for (const [method, path, body] of [
      ['GET', `/api/spaces/${foreignSpace}`],
      ['PATCH', `/api/spaces/${foreignSpace}`, { name: 'Mine' }],
      ['POST', `/api/spaces/${foreignSpace}/projects`, { projectId: own }],
      ['POST', `/api/spaces/${foreignSpace}/projects/${foreignProject}/move`, {}],
      ['DELETE', `/api/spaces/${foreignSpace}/projects/${foreignProject}`],
      ['DELETE', `/api/spaces/${foreignSpace}`],
    ] as const) {
      expect({ method, path, answer: await h.call('ada', method, path, body) }).toMatchObject({
        answer: { status: 404, body: { error: 'not_found' } },
      });
    }
    expect((await h.call('ada', 'GET', '/api/spaces')).body).toEqual({ spaces: [] });
    expect(await h.call('grace', 'GET', `/api/spaces/${foreignSpace}`)).toMatchObject({
      status: 200,
      body: { space: { name: 'Theirs', revision: 0 } },
    });
  });

  it("answers another organization's project as the project route's 404, adding nothing", async () => {
    const space = await createSpace('ada', 'Q3');
    expect(
      await h.call('ada', 'POST', `/api/spaces/${space}/projects`, { projectId: foreignProject }),
    ).toMatchObject({ status: 404, body: { error: 'not_found' } });
    expect((await h.call('ada', 'GET', `/api/spaces/${space}`)).body).toMatchObject({
      rows: [],
      space: { revision: 0 },
    });
  });

  it('answers every write to all as virtual_space and reads all as the project list', async () => {
    for (const [method, path, body] of [
      ['PATCH', '/api/spaces/all', { name: 'Mine' }],
      ['DELETE', '/api/spaces/all'],
      ['POST', '/api/spaces/all/projects', { projectId: own }],
      ['POST', `/api/spaces/all/projects/${own}/move`, {}],
      ['DELETE', `/api/spaces/all/projects/${own}`],
    ] as const) {
      expect({ method, path, answer: await h.call('ada', method, path, body) }).toMatchObject({
        answer: { status: 409, body: { error: 'virtual_space' } },
      });
    }
    expect(await h.call('ada', 'GET', '/api/spaces/all')).toMatchObject({
      status: 200,
      body: {
        space: { id: 'all', virtual: true, projectCount: 1 },
        rows: [{ project: { id: own } }],
      },
    });
  });

  it('refuses a taken name with 409 and a blank one with 422', async () => {
    await createSpace('ada', 'Q3');
    expect(await h.call('ada', 'POST', '/api/spaces', { name: 'Q3' })).toMatchObject({
      status: 409,
      body: { error: 'name_taken' },
    });
    expect(await h.call('ada', 'POST', '/api/spaces', { name: '  ' })).toMatchObject({
      status: 422,
      body: { error: 'malformed', field: 'name' },
    });
    expect(await h.call('grace', 'POST', '/api/spaces', { name: 'Q3' })).toMatchObject({
      status: 201,
    });
  });
});

describe('before activation', () => {
  beforeEach(async () => {
    h = OrganizationHarness.open();
    await h.register('ada');
  });

  it('answers organization_required without a legacy organization, and still reads all', async () => {
    await createProject('ada', 'Legacy plan');
    for (const [method, path, body] of [
      ['GET', '/api/spaces'],
      ['POST', '/api/spaces', { name: 'Q3' }],
      ['GET', '/api/spaces/some-space'],
    ] as const) {
      expect({ method, path, answer: await h.call('ada', method, path, body) }).toMatchObject({
        answer: { status: 409, body: { error: 'organization_required' } },
      });
    }
    expect(await h.call('ada', 'GET', '/api/spaces/all')).toMatchObject({
      status: 200,
      body: { rows: [{ project: { name: 'Legacy plan' } }] },
    });
  });

  it('owns a space by the legacy organization and admits its projects', async () => {
    h.organization('legacy');
    h.sqlite.run("UPDATE organization SET legacy = 1 WHERE id = 'legacy'");
    const project = await createProject('ada', 'Legacy plan');
    const space = await createSpace('ada', 'Q3');
    expect(
      await h.call('ada', 'POST', `/api/spaces/${space}/projects`, { projectId: project }),
    ).toMatchObject({ status: 201 });
    expect(await h.call('ada', 'GET', '/api/spaces')).toMatchObject({
      status: 200,
      body: { spaces: [{ id: space, projectCount: 1 }] },
    });
    expect(h.sqlite.query('SELECT organization_id FROM space WHERE id = ?').get(space)).toEqual({
      organization_id: 'legacy',
    });
  });
});
