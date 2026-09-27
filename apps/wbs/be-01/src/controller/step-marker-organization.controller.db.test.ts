import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { type Answer, OrganizationHarness } from '../testing/organization-harness';

/**
 * Steps and calendar markers under organization isolation (task 3.3), over
 * real SQLite and the production organization access; see
 * {@link OrganizationHarness}.
 */
let h: OrganizationHarness;
let own: string;
let foreign: string;
let foreignStep: string;
let foreignMarker: string;
const MARKER = '6b0d9f3e-4c1a-4c77-9a53-1b2f0e6d7c11';
const FOREIGN_MARKER = '0f3c7a2e-8d14-4b6e-a1c9-5e2d7b3f9a40';

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
  foreignStep = await firstStep('grace', foreign);
  foreignMarker = await marker('grace', foreign, FOREIGN_MARKER);
});

afterEach(() => {
  h.close();
});

async function create(username: string, name: string): Promise<string> {
  const answer = await h.call(username, 'POST', '/api/projects', { name });
  if (answer.status !== 200) throw new Error(`create refused: ${JSON.stringify(answer)}`);
  return (answer.body as { project: { id: string } }).project.id;
}

async function firstStep(username: string, projectId: string): Promise<string> {
  const answer = await h.call(username, 'GET', `/api/projects/${projectId}`);
  const steps = (answer.body as { steps: { id: string }[] }).steps;
  const step = steps.at(0);
  if (step === undefined) throw new Error('the project started with no step');
  return step.id;
}

async function marker(username: string, projectId: string, id: string): Promise<string> {
  const answer = await h.call(username, 'POST', `/api/projects/${projectId}/calendar-markers`, {
    markerId: id,
    date: '2026-10-01',
    name: 'Launch',
  });
  if (answer.status !== 201) throw new Error(`marker refused: ${JSON.stringify(answer)}`);
  return id;
}

/** Every step and marker route addressed at `projectId`, with a writer's body. */
function routes(projectId: string, stepId: string, markerId: string): [string, string, unknown?][] {
  return [
    ['POST', `/api/projects/${projectId}/steps`, { name: 'Review' }],
    ['PATCH', `/api/projects/${projectId}/steps/${stepId}`, { name: 'Renamed' }],
    ['DELETE', `/api/projects/${projectId}/steps/${stepId}?cascade=true`],
    ['GET', `/api/projects/${projectId}/calendar-markers`],
    [
      'POST',
      `/api/projects/${projectId}/calendar-markers`,
      { markerId: MARKER, date: '2026-10-02', name: 'Beta' },
    ],
    ['PATCH', `/api/projects/${projectId}/calendar-markers/${markerId}`, { name: 'Moved' }],
    ['DELETE', `/api/projects/${projectId}/calendar-markers/${markerId}`],
  ];
}

/** What the foreign organization holds, to show a refused call changed none of it. */
async function foreignState(): Promise<Answer[]> {
  return [
    await h.call('grace', 'GET', `/api/projects/${foreign}`),
    await h.call('grace', 'GET', `/api/projects/${foreign}/calendar-markers`),
  ];
}

describe('before activation', () => {
  it('keeps deployment-wide step and marker access across organizations', async () => {
    h.close();
    h = OrganizationHarness.open();
    for (const username of ['ada', 'grace']) await h.register(username);
    h.organization('org-b');
    h.member('org-b', 'grace', 'member');
    h.bind('grace', 'org-b');
    const theirs = await create('ada', 'Legacy plan');
    const step = await firstStep('ada', theirs);
    await marker('ada', theirs, MARKER);
    expect(
      (await h.call('grace', 'PATCH', `/api/projects/${theirs}/steps/${step}`, { name: 'Shared' }))
        .status,
    ).toBe(200);
    expect((await h.call('grace', 'GET', `/api/projects/${theirs}/calendar-markers`)).status).toBe(
      200,
    );
  });
});

describe('after activation', () => {
  it('answers 404 alike for a foreign and an absent project on every step and marker route', async () => {
    const before = await foreignState();
    const absent = routes('missing', foreignStep, foreignMarker);
    for (const [at, [method, path, body]] of routes(
      foreign,
      foreignStep,
      foreignMarker,
    ).entries()) {
      const [, absentPath] = absent[at];
      const toForeign = await h.call('ada', method, path, body);
      expect({ route: `${method} ${path}`, status: toForeign.status }).toEqual({
        route: `${method} ${path}`,
        status: 404,
      });
      expect(await h.call('ada', method, absentPath, body)).toEqual(toForeign);
    }
    expect(await foreignState()).toEqual(before);
  });

  it("refuses the foreign step and marker under the caller's own project path", async () => {
    const before = await foreignState();
    expect(
      (
        await h.call('ada', 'PATCH', `/api/projects/${own}/steps/${foreignStep}`, {
          name: 'Taken',
        })
      ).status,
    ).toBe(404);
    expect(
      (await h.call('ada', 'DELETE', `/api/projects/${own}/steps/${foreignStep}?cascade=true`))
        .status,
    ).toBe(404);
    expect(
      (
        await h.call('ada', 'PATCH', `/api/projects/${own}/calendar-markers/${foreignMarker}`, {
          name: 'Taken',
        })
      ).status,
    ).toBe(404);
    expect(
      (await h.call('ada', 'DELETE', `/api/projects/${own}/calendar-markers/${foreignMarker}`))
        .status,
    ).toBe(404);
    expect(await foreignState()).toEqual(before);
  });

  it('refuses a viewer every step and marker write and lets the viewer list markers', async () => {
    const step = await firstStep('ada', own);
    const mine = await marker('ada', own, MARKER);
    for (const [method, path, body] of routes(own, step, mine)) {
      const answer = await h.call('vic', method, path, body);
      expect({ route: `${method} ${path}`, status: answer.status }).toEqual({
        route: `${method} ${path}`,
        status: method === 'GET' ? 200 : 403,
      });
    }
  });

  it('lets a member write steps and markers of the own project', async () => {
    expect(
      (await h.call('ada', 'POST', `/api/projects/${own}/steps`, { name: 'Review' })).status,
    ).toBe(200);
    await marker('ada', own, MARKER);
    expect(
      (
        await h.call('ada', 'PATCH', `/api/projects/${own}/calendar-markers/${MARKER}`, {
          name: 'Go',
        })
      ).status,
    ).toBe(200);
  });

  it('answers a foreign marker id collision only with 409 and leaves that marker alone', async () => {
    const before = await foreignState();
    expect(
      await h.call('ada', 'POST', `/api/projects/${own}/calendar-markers`, {
        markerId: foreignMarker,
        date: '2026-11-01',
        name: 'Mine',
      }),
    ).toEqual({ status: 409, body: { error: 'taken', field: 'markerId' } });
    expect(await foreignState()).toEqual(before);
    expect(await h.call('ada', 'GET', `/api/projects/${own}/calendar-markers`)).toEqual({
      status: 200,
      body: { markers: [] },
    });
  });

  it('refuses an unbound session and a removed member before any lookup', async () => {
    h.sqlite.run('DELETE FROM organization_membership WHERE user_id = ?', [h.userId('ada')]);
    for (const [method, path, body] of [
      ...routes(own, foreignStep, foreignMarker),
      ...routes('missing', 'missing', 'missing'),
    ]) {
      expect({ route: `${method} ${path}`, ...(await h.call('ada', method, path, body)) }).toEqual({
        route: `${method} ${path}`,
        status: 403,
        body: { error: 'not_a_member' },
      });
      expect({ route: `${method} ${path}`, ...(await h.call('nell', method, path, body)) }).toEqual(
        {
          route: `${method} ${path}`,
          status: 403,
          body: { error: 'no_active_organization' },
        },
      );
    }
  });
});
