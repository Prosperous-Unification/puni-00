import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

/**
 * The by-person read (`GET /api/projects/:id/people/:personId/work`,
 * `wbs-resources` task 4.2) under organization isolation, over real SQLite and
 * the production organization access; see {@link OrganizationHarness}. Rows,
 * assignments and claims are seeded as SQL: the command tests cover the writes.
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
  for (const [id, organizationId, name] of [
    ['pe-kat', 'org-a', 'Kat'],
    ['pe-ada', 'org-a', 'Ada'],
    ['pe-bea', 'org-b', 'Bea'],
  ] as const) {
    h.sqlite.run('INSERT INTO person (id, name) VALUES (?, ?)', [id, `root-${id}`]);
    h.sqlite.run(
      'INSERT INTO person_organization (resource_id, organization_id, name) VALUES (?, ?, ?)',
      [id, organizationId, name],
    );
  }
  for (const [id, parent, position, frozen] of [
    ['w-080', null, 0, '080'],
    ['w-080-1', 'w-080', 0, null],
    ['w-080-2', 'w-080', 1, null],
    ['w-080-3', 'w-080', 2, null],
  ] as const) {
    h.sqlite.run(
      'INSERT INTO work_item (id, project_id, parent_id, position, name, frozen_number) VALUES (?, ?, ?, ?, ?, ?)',
      [id, own, parent, position, `Item ${id}`, frozen],
    );
  }
  for (const [workItemId, stepId, personId] of [
    ['w-080-1', qa, 'pe-kat'],
    ['w-080-2', qa, 'pe-kat'],
    ['w-080-3', qa, 'pe-kat'],
    ['w-080-3', dev, 'pe-ada'],
  ] as const) {
    h.sqlite.run(
      'INSERT INTO assignment (work_item_id, step_id, person_id, created_at, updated_at, created_by) VALUES (?, ?, ?, 1, 1, ?)',
      [workItemId, stepId, personId, h.userId('ada')],
    );
  }
  for (const [id, workItemId, stepId, personId, parent, at] of [
    ['c-subtree', 'w-080', null, 'pe-ada', null, 100],
    ['c-dev', 'w-080-2', dev, 'pe-kat', 'c-subtree', 200],
  ] as const) {
    h.sqlite.run(
      'INSERT INTO claim (id, work_item_id, step_id, person_id, run_id, parent_claim_id, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, workItemId, stepId, personId, `run-${id}`, parent, at, h.userId('ada')],
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

describe('the by-person read', () => {
  it("lists kat's three assignments and one claim to a member and a viewer alike", async () => {
    const forMember = await h.call('ada', 'GET', `/api/projects/${own}/people/pe-kat/work`);
    const address = (id: string, index: number) => ({
      workItemId: id,
      number: `080.${String(index)}`,
      numberIsFrozen: false,
      name: `Item ${id}`,
    });
    expect(forMember).toEqual({
      status: 200,
      body: {
        person: { personId: 'pe-kat', name: 'Kat' },
        assignments: [
          { ...address('w-080-1', 1), stepId: qa },
          { ...address('w-080-2', 2), stepId: qa },
          { ...address('w-080-3', 3), stepId: qa },
        ],
        claims: [
          {
            ...address('w-080-2', 2),
            stepId: dev,
            claimId: 'c-dev',
            runId: 'run-c-dev',
            parentClaimId: 'c-subtree',
            claimedAt: 200,
          },
        ],
      },
    });
    expect(await h.call('vic', 'GET', `/api/projects/${own}/people/pe-kat/work`)).toEqual(
      forMember,
    );
    expect(await h.call('vic', 'GET', `/api/projects/${own}/people/pe-ada/work`)).toEqual({
      status: 200,
      body: {
        person: { personId: 'pe-ada', name: 'Ada' },
        assignments: [{ ...address('w-080-3', 3), stepId: dev }],
        claims: [
          {
            workItemId: 'w-080',
            number: '080',
            numberIsFrozen: true,
            name: 'Item w-080',
            stepId: null,
            claimId: 'c-subtree',
            runId: 'run-c-subtree',
            parentClaimId: null,
            claimedAt: 100,
          },
        ],
      },
    });
  });

  it('refuses a stranger exactly as the tree read does', async () => {
    for (const tail of ['work-items', 'people/pe-kat/work']) {
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

  it("refuses a person the caller's organization does not hold", async () => {
    for (const personId of ['pe-bea', 'pe-nobody'])
      expect(await h.call('ada', 'GET', `/api/projects/${own}/people/${personId}/work`)).toEqual({
        status: 404,
        body: { error: 'unknown_person' },
      });
  });
});
