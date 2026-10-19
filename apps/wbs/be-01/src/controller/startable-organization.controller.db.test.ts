import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

/**
 * The startable read (`GET /api/projects/:id/startable`, `wbs-team-claims`
 * task 3.2) under organization isolation, over real SQLite and the production
 * organization access; see {@link OrganizationHarness}. Rows, labels and
 * claims are seeded as SQL: the claim command's own tests cover the writes.
 */
let h: OrganizationHarness;
let own: string;
let foreign: string;
let dev: string;
let qa: string;

beforeEach(async () => {
  h = OrganizationHarness.open();
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
  [dev, qa] = await stepsOf('ada', own);
  for (const [root, side, id, name] of [
    ['person', 'person_organization', 'pe-claire', 'Claire'],
    ['service_team', 'service_team_organization', 'tm-platform', 'Platform'],
  ] as const) {
    h.sqlite.run(`INSERT INTO ${root} (id, name) VALUES (?, ?)`, [id, `root-${id}`]);
    h.sqlite.run(`INSERT INTO ${side} (resource_id, organization_id, name) VALUES (?, ?, ?)`, [
      id,
      'org-a',
      name,
    ]);
  }
  for (const [id, parent, position, frozen] of [
    ['w-080', null, 0, '080'],
    ['w-080-25', 'w-080', 0, '080.25'],
    ['w-090', null, 1, null],
  ] as const) {
    h.sqlite.run(
      'INSERT INTO work_item (id, project_id, parent_id, position, name, frozen_number) VALUES (?, ?, ?, ?, ?, ?)',
      [id, own, parent, position, `Item ${id}`, frozen],
    );
  }
  h.sqlite.run(
    "INSERT INTO work_item_team (work_item_id, team_id) VALUES ('w-080', 'tm-platform')",
  );
  for (const [id, workItemId, stepId, parent, at] of [
    ['c-subtree', 'w-080', null, null, 100],
    ['c-dev', 'w-080-25', dev, 'c-subtree', 200],
  ] as const) {
    h.sqlite.run(
      'INSERT INTO claim (id, work_item_id, step_id, person_id, run_id, parent_claim_id, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, workItemId, stepId, 'pe-claire', `run-${id}`, parent, at, h.userId('ada')],
    );
  }
});

afterEach(() => {
  h.close();
});

async function create(username: string, name: string): Promise<string> {
  const answer = await h.call(username, 'POST', '/api/projects', { name });
  if (answer.status !== 200) throw new Error(`create refused: ${JSON.stringify(answer)}`);
  return (answer.body as { project: { id: string } }).project.id;
}

async function stepsOf(username: string, projectId: string): Promise<[string, string]> {
  const answer = await h.call(username, 'GET', `/api/projects/${projectId}`);
  const { steps } = answer.body as { steps: { id: string }[] };
  const first = steps.at(0);
  const second = steps.at(1);
  if (first === undefined || second === undefined) throw new Error('the project has no two steps');
  return [first.id, second.id];
}

describe('the startable read', () => {
  it("answers a member and a viewer alike, with the organization's own names", async () => {
    const forMember = await h.call('ada', 'GET', `/api/projects/${own}/startable?team=tm-platform`);
    expect(forMember).toEqual({
      status: 200,
      body: {
        leaves: [
          {
            workItemId: 'w-080-25',
            number: '080.25',
            numberIsFrozen: true,
            name: 'Item w-080-25',
            stepIds: [qa],
            assignees: [],
            teams: [{ teamId: 'tm-platform', name: 'Platform', fromId: 'w-080' }],
            unfinishedPredecessorIds: [],
            subtreeClaim: {
              claimId: 'c-subtree',
              workItemId: 'w-080',
              holder: { personId: 'pe-claire', name: 'Claire' },
              runId: 'run-c-subtree',
              parentClaimId: null,
            },
          },
        ],
        claimed: [
          {
            workItemId: 'w-080-25',
            number: '080.25',
            numberIsFrozen: true,
            name: 'Item w-080-25',
            stepId: dev,
            claimId: 'c-dev',
            holder: { personId: 'pe-claire', name: 'Claire' },
            assignee: null,
            runId: 'run-c-dev',
            parentClaimId: 'c-subtree',
            claimedAt: 200,
          },
        ],
        subtreeClaims: [
          {
            workItemId: 'w-080',
            number: '080',
            numberIsFrozen: true,
            name: 'Item w-080',
            claimId: 'c-subtree',
            holder: { personId: 'pe-claire', name: 'Claire' },
            runId: 'run-c-subtree',
            parentClaimId: null,
            claimedAt: 100,
          },
        ],
      },
    });
    expect(await h.call('vic', 'GET', `/api/projects/${own}/startable?team=tm-platform`)).toEqual(
      forMember,
    );
    const every = await h.call('vic', 'GET', `/api/projects/${own}/startable`);
    expect(every.status).toBe(200);
    expect(
      (every.body as { leaves: { workItemId: string }[] }).leaves.map((leaf) => leaf.workItemId),
    ).toEqual(['w-080-25', 'w-090']);
  });

  it('refuses a stranger exactly as the tree read does', async () => {
    for (const tail of ['work-items', 'startable']) {
      const toForeign = await h.call('ada', 'GET', `/api/projects/${foreign}/${tail}`);
      expect({ tail, ...toForeign }).toEqual({ tail, status: 404, body: { error: 'not_found' } });
      const stranger = await h.call('grace', 'GET', `/api/projects/${own}/${tail}`);
      expect({ tail, ...stranger }).toEqual({ tail, status: 404, body: { error: 'not_found' } });
      expect(await h.call('nell', 'GET', `/api/projects/${own}/${tail}`)).toEqual({
        status: 403,
        body: { error: 'no_active_organization' },
      });
    }
  });

  it("refuses a team the caller's organization does not hold", async () => {
    h.sqlite.run("INSERT INTO service_team (id, name) VALUES ('tm-b', 'root-tm-b')");
    h.sqlite.run(
      "INSERT INTO service_team_organization (resource_id, organization_id, name) VALUES ('tm-b', 'org-b', 'B')",
    );
    for (const team of ['tm-b', 'tm-nobody'])
      expect(await h.call('ada', 'GET', `/api/projects/${own}/startable?team=${team}`)).toEqual({
        status: 404,
        body: { error: 'unknown_team' },
      });
  });

  it('refuses a repeated team and an undeclared key', async () => {
    for (const query of ['team=tm-platform&team=tm-platform', 'teams=tm-platform'])
      expect((await h.call('ada', 'GET', `/api/projects/${own}/startable?${query}`)).status).toBe(
        400,
      );
  });
});
