import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

/**
 * The headroom read (`GET /api/projects/:id/budget-headroom`,
 * `wbs-measure-budgets` task 4.1) under organization isolation, over real
 * SQLite and the production organization access ({@link OrganizationHarness}).
 * Budgets and facts are written through the project batch; the read's figures
 * are proven in core (`budget-command.test.ts`), so this file holds the route:
 * admission, the team filter, its refusals and the wire shape.
 */
let h: OrganizationHarness;
let own: string;
let foreign: string;
let dev: string;
let parent: string;
let leaf: string;

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
  const first = h.sqlite
    .query<{ id: string }, [string]>('SELECT id FROM step WHERE project_id = ? ORDER BY position')
    .get(own)?.id;
  if (first === undefined) throw new Error('the project has no step');
  dev = first;
  const built = await batch([
    { kind: 'createWorkItem', ref: 'P', name: 'P', parentId: null, afterId: null },
    { kind: 'createWorkItem', ref: 'L', name: 'L', parentRef: 'P', parentId: null, afterId: null },
  ]);
  const results = (built.body as { results: { ref?: string; id?: string }[] }).results;
  const idOf = (ref: string): string => {
    const id = results.find((each) => each.ref === ref)?.id;
    if (id === undefined) throw new Error(`no ${ref}: ${JSON.stringify(built)}`);
    return id;
  };
  [parent, leaf] = [idOf('P'), idOf('L')];
});

afterEach(() => {
  h.close();
});

async function create(username: string, name: string): Promise<string> {
  const answer = await h.call(username, 'POST', '/api/projects', { name });
  if (answer.status !== 200) throw new Error(`create refused: ${JSON.stringify(answer)}`);
  return (answer.body as { project: { id: string } }).project.id;
}

async function batch(commands: readonly unknown[]) {
  const answer = await h.call('ada', 'POST', `/api/projects/${own}/commands`, { commands });
  if (answer.status !== 200) throw new Error(`batch refused: ${JSON.stringify(answer)}`);
  return answer;
}

interface Headroom {
  steps: {
    workItemId: string;
    stepId: string;
    state: string;
    budgets: Record<string, Record<string, unknown>>;
  }[];
}

describe('the headroom read', () => {
  it('answers a member and a viewer alike, strict and advisory apart, with what is spent', async () => {
    await batch([
      { kind: 'setBudget', workItemId: parent, measure: 'tokens', cap: 1000, policy: 'strict' },
      { kind: 'setBudget', workItemId: leaf, measure: 'tokens', cap: 500, policy: 'advisory' },
      { kind: 'setMeasure', workItemId: leaf, stepId: dev, metric: 'tokens', value: 400 },
    ]);
    const forMember = await h.call('ada', 'GET', `/api/projects/${own}/budget-headroom`);
    expect(forMember.status).toBe(200);
    const onDev = (forMember.body as Headroom).steps.find(
      (step) => step.workItemId === leaf && step.stepId === dev,
    );
    expect(onDev).toEqual({
      workItemId: leaf,
      stepId: dev,
      state: 'startable',
      budgets: {
        tokens: {
          strict: {
            workItemId: parent,
            cap: 1000,
            policy: 'strict',
            source: 'stated',
            spent: 400,
            remaining: 600,
            exceeded: false,
          },
          advisory: {
            workItemId: leaf,
            cap: 500,
            policy: 'advisory',
            source: 'stated',
            spent: 400,
            remaining: 100,
            exceeded: false,
          },
        },
      },
    });
    expect(await h.call('vic', 'GET', `/api/projects/${own}/budget-headroom`)).toEqual(forMember);
  });

  it('names a blocked cost budget on its key, tokens untouched', async () => {
    const made = await batch([
      { kind: 'createWorkItem', ref: 'A', name: 'A', parentId: leaf, afterId: null },
      { kind: 'createWorkItem', ref: 'B', name: 'B', parentId: leaf, afterId: null, afterRef: 'A' },
    ]);
    const kids = (made.body as { results: { ref?: string; id?: string }[] }).results;
    const [a, b] = ['A', 'B'].map((ref) => kids.find((each) => each.ref === ref)?.id ?? '');
    const priced = (workItemId: string, rateCardDigest: string) => ({
      kind: 'setMeasure',
      workItemId,
      stepId: dev,
      metric: 'cost',
      value: 10,
      rateCardDigest,
    });
    await batch([
      priced(a, 'card-a'),
      priced(b, 'card-b'),
      { kind: 'setBudget', workItemId: parent, measure: 'cost', cap: 1000, policy: 'strict' },
      { kind: 'setBudget', workItemId: a, measure: 'tokens', cap: 50, policy: 'strict' },
    ]);
    const answer = await h.call('ada', 'GET', `/api/projects/${own}/budget-headroom`);
    expect(answer.status).toBe(200);
    const onA = (answer.body as Headroom).steps.find(
      (step) => step.workItemId === a && step.stepId === dev,
    );
    expect(onA?.budgets['cost']).toEqual({
      mixedRateCards: [
        { currency: 'USD', rateCardDigest: 'card-a' },
        { currency: 'USD', rateCardDigest: 'card-b' },
      ],
      mixedAt: parent,
    });
    expect(onA?.budgets['tokens']?.['strict']).toMatchObject({ workItemId: a, remaining: 50 });
  });

  it('refuses a stranger exactly as the startable read does', async () => {
    for (const tail of ['startable', 'budget-headroom']) {
      const toForeign = await h.call('ada', 'GET', `/api/projects/${foreign}/${tail}`);
      expect({ tail, ...toForeign }).toEqual({ tail, status: 404, body: { error: 'not_found' } });
      expect(await h.call('ada', 'GET', `/api/projects/missing/${tail}`)).toEqual(toForeign);
      const stranger = await h.call('grace', 'GET', `/api/projects/${own}/${tail}`);
      expect({ tail, ...stranger }).toEqual({ tail, status: 404, body: { error: 'not_found' } });
      expect(await h.call('nell', 'GET', `/api/projects/${own}/${tail}`)).toEqual({
        status: 403,
        body: { error: 'no_active_organization' },
      });
    }
  });

  it("narrows to a team, and refuses one the caller's organization does not hold", async () => {
    h.sqlite.run("INSERT INTO service_team (id, name) VALUES ('tm-a', 'root-tm-a')");
    h.sqlite.run(
      "INSERT INTO service_team_organization (resource_id, organization_id, name) VALUES ('tm-a', 'org-a', 'Platform')",
    );
    expect(await h.call('ada', 'GET', `/api/projects/${own}/budget-headroom?team=tm-a`)).toEqual({
      status: 200,
      body: { steps: [] },
    });
    h.sqlite.run("INSERT INTO service_team (id, name) VALUES ('tm-b', 'root-tm-b')");
    h.sqlite.run(
      "INSERT INTO service_team_organization (resource_id, organization_id, name) VALUES ('tm-b', 'org-b', 'B')",
    );
    for (const team of ['tm-b', 'tm-nobody'])
      expect(
        await h.call('ada', 'GET', `/api/projects/${own}/budget-headroom?team=${team}`),
      ).toEqual({ status: 404, body: { error: 'unknown_team' } });
  });

  it('refuses a repeated team and an undeclared key', async () => {
    for (const query of ['team=tm-a&team=tm-a', 'teams=tm-a'])
      expect(await h.call('ada', 'GET', `/api/projects/${own}/budget-headroom?${query}`)).toEqual({
        status: 400,
        body: { error: 'invalid_query' },
      });
  });
});
