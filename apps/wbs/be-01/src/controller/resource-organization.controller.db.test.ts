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
  // Five registrations: a sixth in one window is refused rate_limited.
  for (const username of ['ada', 'grace', 'vic', 'nell', 'sue']) await h.register(username);
  h.organization('org-a');
  h.organization('org-b');
  h.member('org-a', 'ada', 'member');
  h.member('org-a', 'vic', 'viewer');
  h.member('org-a', 'sue', 'admin');
  h.member('org-b', 'grace', 'member');
  h.bind('ada', 'org-a');
  h.bind('vic', 'org-a');
  h.bind('sue', 'org-a');
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
        resources: [
          { id: ram, name: 'h2puni ram', kind: 'divisible', unitLabel: 'GB', providerId: null },
        ],
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
        resources: [
          { id: ram, name: 'h2puni ram', kind: 'divisible', unitLabel: 'GB', providerId: null },
        ],
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
      // A member's patch, and an admin's removal (only an admin may remove), so
      // each refusal is about the id.
      for (const [username, command] of [
        ['ada', { kind: 'patchResource', resourceId, patch: { unitLabel: 'TB' } }],
        ['sue', { kind: 'deleteResource', resourceId, cascade: true }],
      ] as const)
        expect(
          await h.call(username, 'POST', '/api/directory/commands', { commands: [command] }),
        ).toEqual({ status: 404, body: { at: 0, kind: command.kind, error: 'not_found' } });
    }
    expect(h.sqlite.query('SELECT count(*) AS n FROM work_item_resource_demand').get()).toEqual({
      n: 0,
    });
    expect(h.sqlite.query('SELECT unit_label FROM resource WHERE id = ?').get(theirs)).toEqual({
      unit_label: 'GB',
    });
  });

  it('refuses a claim asking for a foreign resource exactly as an absent one', async () => {
    const theirs = await declare('grace', 'b ram');
    const person = await h.call('ada', 'POST', '/api/directory/commands', {
      commands: [{ kind: 'createPerson', name: 'claire' }],
    });
    const personId = (person.body as { results: { id?: string }[] }).results.at(0)?.id;
    if (personId === undefined)
      throw new Error(`the person was refused: ${JSON.stringify(person)}`);
    for (const resourceId of [theirs, 'no-such-resource'])
      expect(
        await h.call('ada', 'POST', `/api/projects/${own}/commands`, {
          commands: [
            {
              kind: 'claimWorkItem',
              workItemId: 'w-a',
              personId,
              resources: [{ resourceId, units: 1 }],
            },
          ],
        }),
      ).toEqual({
        status: 404,
        body: { at: 0, kind: 'claimWorkItem', error: 'unknown_resource' },
      });
    expect(h.sqlite.query('SELECT count(*) AS n FROM claim').get()).toEqual({ n: 0 });
  });

  it('refuses removing a demanded resource with the counts, and cascades on confirmation', async () => {
    const ram = await declare('ada', 'h2puni ram');
    await h.call('ada', 'POST', `/api/projects/${own}/commands`, {
      commands: [{ kind: 'setDemand', workItemId: 'w-a', resourceId: ram, units: 4 }],
    });
    const refused = await h.call('sue', 'POST', '/api/directory/commands', {
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
      await h.call('sue', 'POST', '/api/directory/commands', {
        commands: [{ kind: 'deleteResource', resourceId: ram, cascade: true }],
      }),
    ).toMatchObject({ status: 200 });
    expect(await h.call('ada', 'GET', `/api/projects/${own}/resources`)).toEqual({
      status: 200,
      body: { resources: [], capacities: [], demands: [] },
    });
  });

  it('refuses a member removing a resource on either route, an admin and a super-admin allowed', async () => {
    const ram = await declare('ada', 'h2puni ram');
    const staging = await declare('ada', 'staging');
    await h.call('ada', 'POST', `/api/projects/${own}/commands`, {
      commands: [{ kind: 'setDemand', workItemId: 'w-a', resourceId: ram, units: 4 }],
    });
    const demands = () =>
      h.sqlite.query('SELECT count(*) AS n FROM work_item_resource_demand').get();
    for (const path of ['/api/directory/commands', `/api/projects/${own}/commands`])
      for (const command of [
        { kind: 'deleteResource', resourceId: ram, cascade: true },
        { kind: 'deleteResource', resourceId: ram },
      ]) {
        expect(await h.call('ada', 'POST', path, { commands: [command] }), path).toEqual({
          status: 403,
          body: { at: 0, kind: 'deleteResource', error: 'forbidden' },
        });
        expect(await h.call('vic', 'POST', path, { commands: [command] }), path).toEqual({
          status: 403,
          body: { error: 'forbidden' },
        });
      }
    expect(demands()).toEqual({ n: 1 });
    expect(h.sqlite.query('SELECT count(*) AS n FROM resource').get()).toEqual({ n: 2 });
    // Refused before the lookup: a foreign or absent id answers the member as
    // their own does, never `not_found`.
    // Proof: with the role check moved after the lookup in
    // `removeResourceWithin`, these answered 404 not_found; watched 2026-10-25.
    const theirs = await declare('grace', 'b ram');
    for (const resourceId of [theirs, 'no-such-resource'])
      expect(
        await h.call('ada', 'POST', '/api/directory/commands', {
          commands: [{ kind: 'deleteResource', resourceId }],
        }),
      ).toEqual({ status: 403, body: { at: 0, kind: 'deleteResource', error: 'forbidden' } });
    // Creating and editing stay open to a member.
    expect(
      await h.call('ada', 'POST', '/api/directory/commands', {
        commands: [{ kind: 'patchResource', resourceId: ram, patch: { unitLabel: 'TB' } }],
      }),
    ).toMatchObject({ status: 200 });
    expect(
      await h.call('sue', 'POST', '/api/directory/commands', {
        commands: [{ kind: 'deleteResource', resourceId: ram, cascade: true }],
      }),
    ).toMatchObject({ status: 200 });
    expect(demands()).toEqual({ n: 0 });
    h.sqlite.run(
      "UPDATE organization_membership SET role = 'super_admin' WHERE organization_id = 'org-a' AND user_id = ?",
      [h.userId('sue')],
    );
    expect(
      await h.call('sue', 'POST', `/api/projects/${own}/commands`, {
        commands: [{ kind: 'deleteResource', resourceId: staging }],
      }),
    ).toMatchObject({ status: 200 });
    expect(h.sqlite.query('SELECT count(*) AS n FROM resource').get()).toEqual({ n: 1 }); // grace's, in org-b
  });

  /** Every top-level key of a version 11 document but `optimization`, the same in both modes. */
  const EXPORT_KEYS = [
    'assignedPeople',
    'budgets',
    'calendarMarkers',
    'capacity',
    'demands',
    'depReach',
    'directory',
    'document',
    'estimateMethod',
    'estimateRounding',
    'measureDefinitions',
    'measureEstimates',
    'measureFacts',
    'pertWeights',
    'priorityBands',
    'project',
    'projectRevision',
    'resourceCapacities',
    'scheduleError',
    'seq',
    'settings',
    'slices',
    'startDate',
    'stepBlockages',
    'stepNodes',
    'steps',
    'teamCapacities',
    'typedDependencies',
    'waitingForCapacity',
    'waitingForPerson',
    'workItems',
  ];

  // Both export paths: an isolated organization's direct read, and a shared one's
  // single snapshot (`chain-snapshot.ts`), which reads resources beside the tree.
  // Proof: with the snapshot's resource read answering empty lists, the shared case
  // failed; with the direct read's, the isolated case; watched 2026-10-20.
  it.each(['isolated', 'shared'])(
    'exports the organization’s resources under their local names (%s), and imports them back',
    async (mode) => {
      if (mode === 'shared')
        h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
      const ram = await declare('ada', 'h2puni ram');
      await declare('ada', 'unused');
      await h.call('ada', 'POST', `/api/projects/${own}/commands`, {
        commands: [
          { kind: 'setResourceCapacity', resourceId: ram, units: 32 },
          { kind: 'setDemand', workItemId: 'w-a', resourceId: ram, units: 4 },
        ],
      });
      const exported = await h.call('ada', 'GET', `/api/projects/${own}/export?format=json`);
      expect(exported).toMatchObject({
        status: 200,
        body: {
          document: { version: 11 },
          directory: {
            resources: [{ id: ram, name: 'h2puni ram', kind: 'divisible', unitLabel: 'GB' }],
          },
          resourceCapacities: [{ resourceId: ram, units: 32 }],
          demands: [{ workItemId: 'w-a', resourceId: ram, units: 4 }],
        },
      });
      // The tree read's `demandedResources` is not a document field: the two
      // modes write the same keys.
      // Proof: with `buildDocument` spreading the tree whole, the isolated case
      // failed on `expect(received).not.toHaveProperty(path)` for
      // `demandedResources`; watched 2026-10-25.
      expect(exported.body).not.toHaveProperty('demandedResources');
      // `optimization` rides the live read on one mode only, as before this change.
      expect(
        Object.keys(exported.body as object)
          .filter((key) => key !== 'optimization')
          .sort(),
      ).toEqual(EXPORT_KEYS);
      const imported = await h.call('ada', 'POST', '/api/projects/import', exported.body);
      expect(imported.status).toBe(201);
      const { projectId } = imported.body as { projectId: string };
      const read = await h.call('ada', 'GET', `/api/projects/${projectId}/resources`);
      expect(read).toMatchObject({
        status: 200,
        body: {
          capacities: [{ resourceId: ram, units: 32 }],
          demands: [{ resourceId: ram, units: 4 }],
        },
      });
      // Resolved by the organization-local name: no second `h2puni ram`.
      expect(
        (read.body as { resources: { name: string }[] }).resources.map(({ name }) => name),
      ).toEqual(['h2puni ram', 'unused']);
    },
  );

  it('names the organization’s resource in a refused undo’s detail', async () => {
    h.member('org-a', 'nell', 'member');
    h.bind('nell', 'org-a');
    const ram = await declare('ada', 'h2puni ram');
    h.sqlite.run(
      "INSERT INTO work_item (id, project_id, parent_id, position, name) VALUES ('w-b', ?, NULL, 1, 'Test')",
      [own],
    );
    for (const [id, username] of [
      ['agent-a', 'ada'],
      ['agent-n', 'nell'],
    ] as const) {
      h.sqlite.run('INSERT INTO person (id, name, kind, account_id) VALUES (?, ?, ?, ?)', [
        id,
        `root-${id}`,
        'agent',
        h.userId(username),
      ]);
      h.sqlite.run(
        'INSERT INTO person_organization (resource_id, organization_id, name) VALUES (?, ?, ?)',
        [id, 'org-a', id],
      );
    }
    const batch = (username: string, commands: unknown[]) =>
      h.call(username, 'POST', `/api/projects/${own}/commands`, { commands });
    expect(
      await batch('ada', [
        { kind: 'setResourceCapacity', resourceId: ram, units: 4 },
        { kind: 'setDemand', workItemId: 'w-a', resourceId: ram, units: 4 },
        { kind: 'setDemand', workItemId: 'w-b', resourceId: ram, units: 4 },
      ]),
    ).toMatchObject({ status: 200 });
    for (const command of [
      { kind: 'claimWorkItem', workItemId: 'w-a', personId: 'agent-a' },
      { kind: 'releaseWorkItem', workItemId: 'w-a', personId: 'agent-a' },
    ])
      expect(await batch('ada', [command])).toMatchObject({ status: 200 });
    expect(
      await batch('nell', [{ kind: 'claimWorkItem', workItemId: 'w-b', personId: 'agent-n' }]),
    ).toMatchObject({ status: 200 });
    const undone = await h.call('ada', 'POST', `/api/projects/${own}/undo`);
    expect(undone).toMatchObject({ status: 409, body: { error: 'stale_undo' } });
    const { detail } = undone.body as { detail: string };
    expect(detail).toBe('resources_exhausted: that needs 4 GB of “h2puni ram” and 0 are free now.');
    expect(detail).not.toContain(ram);
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
