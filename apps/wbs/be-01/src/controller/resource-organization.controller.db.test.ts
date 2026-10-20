import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

/**
 * Resources (`wbs-resources` slice 1) under organization isolation, over real
 * SQLite units of work and the production organization access; see
 * {@link OrganizationHarness.openComposed}.
 * Directory writes go through `POST /api/directory/commands`, plan writes
 * through `POST /api/projects/:id/commands`, the read through
 * `GET /api/projects/:id/resources`.
 */
let h: OrganizationHarness;
let own: string;
let foreign: string;

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
  h.sqlite.run(
    "INSERT INTO work_item (id, project_id, parent_id, position, name) VALUES ('w-a', ?, NULL, 0, 'Build')",
    [own],
  );
});

afterEach(() => {
  h.close();
});

async function create(username: string, name: string): Promise<string> {
  const answer = await h.call(username, 'POST', '/api/projects', { name });
  if (answer.status !== 200) throw new Error(`create refused: ${JSON.stringify(answer)}`);
  return (answer.body as { project: { id: string } }).project.id;
}

/** Declares one divisible resource through the caller's directory, answering its id. */
async function declare(username: string, name: string): Promise<string> {
  const answer = await h.call(username, 'POST', '/api/directory/commands', {
    commands: [{ kind: 'createResource', name, resourceKind: 'divisible', unitLabel: 'GB' }],
  });
  if (answer.status !== 200) throw new Error(`declare refused: ${JSON.stringify(answer)}`);
  const id = (answer.body as { results: { id?: string }[] }).results.at(0)?.id;
  if (id === undefined) throw new Error('the create minted no id');
  return id;
}

describe('resources in an organization', () => {
  it('creates the same name in two organizations, each finding only its own', async () => {
    const ram = await declare('ada', 'h2puni ram');
    const theirs = await declare('grace', 'h2puni ram');
    expect(ram).not.toBe(theirs);
    // Refused by the organization-local name, not answered with the held row.
    expect(
      await h.call('ada', 'POST', '/api/directory/commands', {
        commands: [
          {
            kind: 'createResource',
            name: 'h2puni ram',
            resourceKind: 'exclusive',
            unitLabel: 'slot',
          },
        ],
      }),
    ).toEqual({
      status: 409,
      body: { at: 0, kind: 'createResource', error: 'taken', name: 'h2puni ram' },
    });
    const read = await h.call('vic', 'GET', `/api/projects/${own}/resources`);
    expect(read).toEqual({
      status: 200,
      body: {
        resources: [{ id: ram, name: 'h2puni ram', kind: 'divisible', unitLabel: 'GB' }],
        capacities: [],
        demands: [],
      },
    });
  });

  it('states a capacity and a demand, and lists only the organization’s own', async () => {
    const ram = await declare('ada', 'h2puni ram');
    await declare('grace', 'b ram');
    expect(
      await h.call('ada', 'POST', `/api/projects/${own}/commands`, {
        commands: [
          { kind: 'setResourceCapacity', resourceId: ram, units: 32 },
          { kind: 'setDemand', workItemId: 'w-a', resourceId: ram, units: 4 },
        ],
      }),
    ).toMatchObject({ status: 200 });
    expect(await h.call('ada', 'GET', `/api/projects/${own}/resources`)).toEqual({
      status: 200,
      body: {
        resources: [{ id: ram, name: 'h2puni ram', kind: 'divisible', unitLabel: 'GB' }],
        capacities: [{ resourceId: ram, units: 32 }],
        demands: [{ workItemId: 'w-a', resourceId: ram, units: 4 }],
      },
    });
  });

  it('refuses a foreign resource exactly as an absent one', async () => {
    const theirs = await declare('grace', 'b ram');
    for (const resourceId of [theirs, 'no-such-resource']) {
      // A clear leaves nothing for the closure check after the command to see,
      // so only the reference check before it tells a foreign id from an absent one.
      for (const command of [
        { kind: 'setDemand', workItemId: 'w-a', resourceId, units: 1 },
        { kind: 'setDemand', workItemId: 'w-a', resourceId, units: null },
        { kind: 'setResourceCapacity', resourceId, units: 1 },
        { kind: 'setResourceCapacity', resourceId, units: null },
      ])
        expect(
          await h.call('ada', 'POST', `/api/projects/${own}/commands`, { commands: [command] }),
        ).toEqual({
          status: 404,
          body: { at: 0, kind: command.kind, error: 'unknown_resource' },
        });
      for (const command of [
        { kind: 'patchResource', resourceId, patch: { unitLabel: 'TB' } },
        { kind: 'deleteResource', resourceId, cascade: true },
      ])
        expect(
          await h.call('ada', 'POST', '/api/directory/commands', { commands: [command] }),
        ).toEqual({ status: 404, body: { at: 0, kind: command.kind, error: 'not_found' } });
    }
    expect(h.sqlite.query('SELECT count(*) AS n FROM work_item_resource_demand').get()).toEqual({
      n: 0,
    });
    expect(h.sqlite.query('SELECT unit_label FROM resource WHERE id = ?').get(theirs)).toEqual({
      unit_label: 'GB',
    });
  });

  it('refuses removing a demanded resource with the counts, and cascades on confirmation', async () => {
    const ram = await declare('ada', 'h2puni ram');
    await h.call('ada', 'POST', `/api/projects/${own}/commands`, {
      commands: [{ kind: 'setDemand', workItemId: 'w-a', resourceId: ram, units: 4 }],
    });
    const refused = await h.call('ada', 'POST', '/api/directory/commands', {
      commands: [{ kind: 'deleteResource', resourceId: ram }],
    });
    expect(refused).toMatchObject({
      status: 409,
      body: {
        error: 'in_use',
        counts: { demands: 1, capacities: 0, occupancies: 0 },
        usage: {
          members: [],
          projects: [
            {
              id: own,
              workItems: [{ id: 'w-a', effects: [{ kind: 'demand_removed', units: 4 }] }],
            },
          ],
        },
      },
    });
    expect(
      await h.call('ada', 'POST', '/api/directory/commands', {
        commands: [{ kind: 'deleteResource', resourceId: ram, cascade: true }],
      }),
    ).toMatchObject({ status: 200 });
    expect(await h.call('ada', 'GET', `/api/projects/${own}/resources`)).toEqual({
      status: 200,
      body: { resources: [], capacities: [], demands: [] },
    });
  });

  it('refuses an unbound session and a stranger alike', async () => {
    expect(await h.call('ada', 'GET', `/api/projects/${foreign}/resources`)).toEqual({
      status: 404,
      body: { error: 'not_found' },
    });
    expect(await h.call('grace', 'GET', `/api/projects/${own}/resources`)).toEqual({
      status: 404,
      body: { error: 'not_found' },
    });
    expect(await h.call('nell', 'GET', `/api/projects/${own}/resources`)).toEqual({
      status: 403,
      body: { error: 'no_active_organization' },
    });
  });
});
