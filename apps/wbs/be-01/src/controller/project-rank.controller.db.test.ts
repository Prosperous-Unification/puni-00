import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { type Answer, OrganizationHarness } from '../testing/organization-harness';

/**
 * The project rank routes (`share-people-across-projects`, slice 3) over
 * be-01's production composition and real SQLite. Organization A holds an
 * admin (`ada`), a member (`mel`) and a viewer (`vic`), and three plans;
 * organization B holds one plan of its own.
 */
let h: OrganizationHarness;
let platform: string;
let billing: string;
let search: string;
let foreign: string;

const RANK = '/api/organization/project-rank';
const move = (id: string) => `/api/organization/projects/${id}/rank`;

interface RankBody {
  projects: { projectId: string; name: string; rank: number; ranked: boolean }[];
}
const names = (answer: Answer) => (answer.body as RankBody).projects.map((each) => each.name);

async function create(username: string, name: string): Promise<string> {
  const answer = await h.call(username, 'POST', '/api/projects', { name });
  if (answer.status !== 200) throw new Error(`create refused: ${JSON.stringify(answer)}`);
  return (answer.body as { project: { id: string } }).project.id;
}

beforeEach(async () => {
  h = OrganizationHarness.openComposed();
  for (const username of ['ada', 'mel', 'vic', 'grace']) await h.register(username);
  h.organization('org-a');
  h.organization('org-b');
  h.member('org-a', 'ada', 'admin');
  h.member('org-a', 'mel', 'member');
  h.member('org-a', 'vic', 'viewer');
  h.member('org-b', 'grace', 'admin');
  h.bind('ada', 'org-a');
  h.bind('mel', 'org-a');
  h.bind('vic', 'org-a');
  h.bind('grace', 'org-b');
  h.activate();
  platform = await create('ada', 'Platform');
  billing = await create('ada', 'Billing');
  search = await create('mel', 'Search');
  foreign = await create('grace', 'Hidden');
});

afterEach(() => {
  h.close();
});

describe('the project rank', () => {
  it('reads every project of the organization, unranked in creation order, to any member', async () => {
    for (const username of ['ada', 'mel', 'vic']) {
      const answer = await h.call(username, 'GET', RANK);
      expect(answer.status).toBe(200);
      expect(answer.body).toEqual({
        projects: [
          { projectId: platform, name: 'Platform', rank: 1, ranked: false },
          { projectId: billing, name: 'Billing', rank: 2, ranked: false },
          { projectId: search, name: 'Search', rank: 3, ranked: false },
        ],
      });
    }
  });

  it('lets an admin move a project, ranking the organization in the order left', async () => {
    const moved = await h.call('ada', 'POST', move(search), { afterProjectId: null });
    expect(moved.status).toBe(200);
    expect(names(moved)).toEqual(['Search', 'Platform', 'Billing']);
    expect((moved.body as RankBody).projects.every((each) => each.ranked)).toBe(true);
    const after = await h.call('ada', 'POST', move(search), { afterProjectId: billing });
    expect(names(after)).toEqual(['Platform', 'Billing', 'Search']);
    expect(names(await h.call('vic', 'GET', RANK))).toEqual(['Platform', 'Billing', 'Search']);
  });

  it('refuses a member and a viewer the move, changing nothing', async () => {
    for (const username of ['mel', 'vic']) {
      const answer = await h.call(username, 'POST', move(search), { afterProjectId: null });
      expect({ username, status: answer.status, body: answer.body }).toEqual({
        username,
        status: 403,
        body: { error: 'forbidden' },
      });
    }
    expect(names(await h.call('ada', 'GET', RANK))).toEqual(['Platform', 'Billing', 'Search']);
  });

  it('answers a foreign project, on either side of a move, as an absent one', async () => {
    const absent = await h.call('ada', 'POST', move('nowhere'), { afterProjectId: null });
    expect(absent).toMatchObject({ status: 404, body: { error: 'not_found' } });
    expect(await h.call('ada', 'POST', move(foreign), { afterProjectId: null })).toEqual(absent);
    expect(await h.call('ada', 'POST', move(platform), { afterProjectId: foreign })).toMatchObject({
      status: 404,
      body: { error: 'not_found' },
    });
    expect(JSON.stringify((await h.call('ada', 'GET', RANK)).body)).not.toContain(foreign);
  });

  it('orders the load reads by the rank, naming each rank', async () => {
    h.sqlite.run("INSERT INTO person (id, name) VALUES ('pe-a', 'root-Ana')");
    h.sqlite.run(
      "INSERT INTO person_organization (resource_id, organization_id, name) VALUES ('pe-a', 'org-a', 'Ana')",
    );
    for (const id of [platform, billing]) {
      await h.call('ada', 'PATCH', `/api/projects/${id}`, { startDate: '2026-10-05' });
      const read = await h.call('ada', 'GET', `/api/projects/${id}`);
      const step = (read.body as { steps: { id: string }[] }).steps.at(0);
      if (step === undefined) throw new Error('the project started with no step');
      const applied = await h.call('ada', 'POST', `/api/projects/${id}/commands`, {
        commands: [
          { kind: 'createWorkItem', ref: 'w', parentId: null, afterId: null, name: 'Work' },
          {
            kind: 'setEstimate',
            workItemRef: 'w',
            stepId: step.id,
            days: { optimistic: 2, realistic: 2, pessimistic: 2 },
          },
          { kind: 'setAssignee', workItemRef: 'w', stepId: step.id, personId: 'pe-a' },
        ],
      });
      expect(applied.status).toBe(200);
    }
    await h.call('ada', 'POST', move(billing), { afterProjectId: null });
    const load = await h.call('ada', 'GET', '/api/people/pe-a/load?from=2026-10-05&to=2026-10-16');
    expect(
      (load.body as { projects: { name: string; rank: number }[] }).projects.map(
        ({ name, rank }) => [name, rank],
      ),
    ).toEqual([
      ['Billing', 1],
      ['Platform', 2],
    ]);
  });
});

describe('before activation', () => {
  it('answers organization_required, since no organization owns the order', async () => {
    h.close();
    h = OrganizationHarness.openComposed();
    await h.register('ada');
    const project = await create('ada', 'Legacy');
    expect(await h.call('ada', 'GET', RANK)).toMatchObject({
      status: 409,
      body: { error: 'organization_required' },
    });
    expect(await h.call('ada', 'POST', move(project), { afterProjectId: null })).toMatchObject({
      status: 409,
      body: { error: 'organization_required' },
    });
  });
});
