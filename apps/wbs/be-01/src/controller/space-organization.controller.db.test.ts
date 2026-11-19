import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

/**
 * The space routes (`add-spaces` slice 2) over real SQLite and the production
 * organization access: owner resolution, roles, `all`, and foreign spaces and
 * work packages answered as absent.
 */
let h: OrganizationHarness;

afterEach(() => {
  h.close();
});

async function createWorkPackage(username: string, name: string): Promise<string> {
  const answer = await h.call(username, 'POST', '/api/work-packages', { name });
  if (answer.status !== 200) throw new Error(`create refused: ${JSON.stringify(answer)}`);
  const workPackageId = (answer.body as { workPackage: { id: string } }).workPackage.id;
  if (
    h.sqlite.query<{ state: string }, []>('SELECT state FROM organization_activation').get()
      ?.state === 'activated'
  )
    h.grant(
      username === 'grace' ? 'org-b' : 'org-a',
      username,
      'package-manager',
      'work_package',
      workPackageId,
    );
  return workPackageId;
}

async function createSpace(username: string, name: string): Promise<string> {
  const answer = await h.call(username, 'POST', '/api/spaces', { name });
  if (answer.status !== 201) throw new Error(`space refused: ${JSON.stringify(answer)}`);
  return (answer.body as { space: { id: string } }).space.id;
}

describe('after activation', () => {
  let own: string;
  let foreignWorkPackage: string;
  let foreignSpace: string;

  beforeEach(async () => {
    h = OrganizationHarness.openComposed();
    for (const username of ['ada', 'vic', 'grace']) await h.register(username);
    h.organization('org-a');
    h.organization('org-b');
    h.member('org-a', 'ada', 'member', ['org-admin']);
    h.member('org-a', 'vic', 'viewer', ['project-viewer']);
    h.member('org-b', 'grace', 'member', ['org-admin']);
    h.bind('ada', 'org-a');
    h.bind('vic', 'org-a');
    h.bind('grace', 'org-b');
    h.activate();
    own = await createWorkPackage('ada', 'A plan');
    foreignWorkPackage = await createWorkPackage('grace', 'B plan');
    foreignSpace = await createSpace('grace', 'Theirs');
  });

  it('creates, lists, adds, moves, reads and removes within the organization', async () => {
    const second = await createWorkPackage('ada', 'A second');
    const space = await createSpace('ada', 'Q3');
    expect(
      (await h.call('ada', 'POST', `/api/spaces/${space}/work-packages`, { workPackageId: own }))
        .body,
    ).toEqual({ position: 10 });
    await h.call('ada', 'POST', `/api/spaces/${space}/work-packages`, {
      workPackageId: second,
      afterWorkPackageId: own,
    });
    expect(
      await h.call('ada', 'POST', `/api/spaces/${space}/work-packages/${second}/move`, {
        afterWorkPackageId: null,
      }),
    ).toMatchObject({ status: 200, body: { position: 5 } });
    const read = await h.call('ada', 'GET', `/api/spaces/${space}`);
    expect(read).toMatchObject({
      status: 200,
      body: {
        space: { id: space, name: 'Q3', virtual: false, workPackageCount: 2, revision: 3 },
        rows: [
          { workPackage: { id: second, ownerName: 'ada' }, position: 5 },
          { workPackage: { id: own }, position: 10 },
        ],
      },
    });
    expect(await h.call('ada', 'GET', '/api/spaces')).toMatchObject({
      status: 200,
      body: { spaces: [{ id: space, workPackageCount: 2 }] },
    });
    expect(
      (await h.call('ada', 'DELETE', `/api/spaces/${space}/work-packages/${own}`)).status,
    ).toBe(204);
    expect((await h.call('ada', 'DELETE', `/api/spaces/${space}`)).status).toBe(204);
    expect((await h.call('ada', 'GET', `/api/work-packages/${own}`)).status).toBe(200);
  });

  it('removes only space membership, preserving the composed work package graph and fan-out', async () => {
    let pushes = 0;
    await h.closeComposed();
    h = OrganizationHarness.openComposed(false, undefined, undefined, undefined, undefined, () => {
      pushes += 1;
      return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
    });
    await h.register('ada');
    h.organization('org-a');
    h.member('org-a', 'ada', 'member', ['org-admin']);
    h.bind('ada', 'org-a');
    h.activate();
    const workPackageId = await createWorkPackage('ada', 'Retained plan');
    const spaceId = await createSpace('ada', 'Q3');
    expect(
      (await h.call('ada', 'POST', `/api/spaces/${spaceId}/work-packages`, { workPackageId }))
        .status,
    ).toBe(201);
    expect(
      (
        await h.call('ada', 'POST', `/api/work-packages/${workPackageId}/commands`, {
          commands: [
            { kind: 'createWorkItem', ref: 'w', parentId: null, afterId: null, name: 'Root' },
          ],
        })
      ).status,
    ).toBe(200);
    const workItem = h.sqlite
      .query<{ id: string }, [string]>('SELECT id FROM work_item WHERE work_package_id = ?')
      .get(workPackageId);
    const step = h.sqlite
      .query<{ id: string }, [string]>('SELECT id FROM step WHERE work_package_id = ?')
      .get(workPackageId);
    if (workItem === null || step === null)
      throw new Error('populated work package fixture is missing');
    expect(
      (
        await h.call('ada', 'POST', `/api/work-packages/${workPackageId}/commands`, {
          commands: [
            {
              kind: 'setEstimate',
              workItemId: workItem.id,
              stepId: step.id,
              days: { optimistic: 1, realistic: 2, pessimistic: 3 },
            },
          ],
        })
      ).status,
    ).toBe(200);
    const owned = () => [
      h.sqlite.query('SELECT * FROM work_package WHERE id = ?').all(workPackageId),
      ...['step', 'work_item'].map((table) =>
        h.sqlite
          .query(`SELECT * FROM ${table} WHERE work_package_id = ? ORDER BY rowid`)
          .all(workPackageId),
      ),
      h.sqlite
        .query(
          'SELECT * FROM estimate WHERE work_item_id IN (SELECT id FROM work_item WHERE work_package_id = ?) ORDER BY work_item_id, step_id',
        )
        .all(workPackageId),
    ];
    const beforeOwned = owned();
    expect(beforeOwned[3]).toHaveLength(1);
    const beforeEvents = h.sqlite.query('SELECT * FROM event_log ORDER BY subscription, seq').all();
    const beforeSequences = h.sqlite
      .query('SELECT * FROM event_sequencer ORDER BY subscription')
      .all();
    const beforePushes = pushes;

    // Proof: replacing the store membership DELETE with work package DELETE made this mounted call
    // return 500 at the populated work package's FK boundary instead of the required 204.
    expect(
      (await h.call('ada', 'DELETE', `/api/spaces/${spaceId}/work-packages/${workPackageId}`))
        .status,
    ).toBe(204);
    expect(owned()).toEqual(beforeOwned);
    expect(
      h.sqlite.query('SELECT * FROM space_work_package WHERE space_id = ?').all(spaceId),
    ).toEqual([]);
    expect((await h.call('ada', 'GET', `/api/spaces/${spaceId}`)).body).toMatchObject({
      space: { revision: 2, workPackageCount: 0 },
    });
    expect(h.sqlite.query('SELECT * FROM event_log ORDER BY subscription, seq').all()).toEqual(
      beforeEvents,
    );
    expect(h.sqlite.query('SELECT * FROM event_sequencer ORDER BY subscription').all()).toEqual(
      beforeSequences,
    );
    expect(pushes).toBe(beforePushes);
  });

  it('refuses a viewer every space write and lets the viewer read', async () => {
    const space = await createSpace('ada', 'Q3');
    await h.call('ada', 'POST', `/api/spaces/${space}/work-packages`, { workPackageId: own });
    for (const [method, path, body] of [
      ['POST', '/api/spaces', { name: 'Mine' }],
      ['PATCH', `/api/spaces/${space}`, { name: 'Mine' }],
      ['POST', `/api/spaces/${space}/work-packages`, { workPackageId: own }],
      ['POST', `/api/spaces/${space}/work-packages/${own}/move`, {}],
      ['DELETE', `/api/spaces/${space}/work-packages/${own}`],
      ['DELETE', `/api/spaces/${space}`],
    ] as const) {
      expect({ method, path, answer: await h.call('vic', method, path, body) }).toMatchObject({
        answer: { status: 403, body: { error: 'forbidden' } },
      });
    }
    // Proof, observed 2026-09-29: with the read route answering `writable`
    // without `mayWrite`, the viewer's read failed here (Expected - 1,
    // Received + 31: `writable: true`).
    expect(await h.call('vic', 'GET', `/api/spaces/${space}`)).toMatchObject({
      status: 200,
      body: { rows: [{ workPackage: { id: own } }], writable: false },
    });
    expect(await h.call('vic', 'GET', '/api/spaces')).toMatchObject({
      body: { writable: false },
    });
    expect(await h.call('ada', 'GET', `/api/spaces/${space}`)).toMatchObject({
      body: { writable: true },
    });
  });

  it("answers another organization's space as absent to every route", async () => {
    for (const [method, path, body] of [
      ['GET', `/api/spaces/${foreignSpace}`],
      ['PATCH', `/api/spaces/${foreignSpace}`, { name: 'Mine' }],
      ['POST', `/api/spaces/${foreignSpace}/work-packages`, { workPackageId: own }],
      ['POST', `/api/spaces/${foreignSpace}/work-packages/${foreignWorkPackage}/move`, {}],
      ['DELETE', `/api/spaces/${foreignSpace}/work-packages/${foreignWorkPackage}`],
      ['DELETE', `/api/spaces/${foreignSpace}`],
    ] as const) {
      expect({ method, path, answer: await h.call('ada', method, path, body) }).toMatchObject({
        answer: { status: 404, body: { error: 'not_found' } },
      });
    }
    expect((await h.call('ada', 'GET', '/api/spaces')).body).toEqual({
      spaces: [],
      writable: true,
    });
    expect(await h.call('grace', 'GET', `/api/spaces/${foreignSpace}`)).toMatchObject({
      status: 200,
      body: { space: { name: 'Theirs', revision: 0 } },
    });
  });

  it("answers another organization's work package as the work package route's 404, adding nothing", async () => {
    const space = await createSpace('ada', 'Q3');
    expect(
      await h.call('ada', 'POST', `/api/spaces/${space}/work-packages`, {
        workPackageId: foreignWorkPackage,
      }),
    ).toMatchObject({ status: 404, body: { error: 'not_found' } });
    expect((await h.call('ada', 'GET', `/api/spaces/${space}`)).body).toMatchObject({
      rows: [],
      space: { revision: 0 },
    });
  });

  it('answers every write to all as virtual_space and reads all as the work package list', async () => {
    for (const [method, path, body] of [
      ['PATCH', '/api/spaces/all', { name: 'Mine' }],
      ['DELETE', '/api/spaces/all'],
      ['POST', '/api/spaces/all/work-packages', { workPackageId: own }],
      ['POST', `/api/spaces/all/work-packages/${own}/move`, {}],
      ['DELETE', `/api/spaces/all/work-packages/${own}`],
    ] as const) {
      expect({ method, path, answer: await h.call('ada', method, path, body) }).toMatchObject({
        answer: { status: 409, body: { error: 'virtual_space' } },
      });
    }
    expect(await h.call('ada', 'GET', '/api/spaces/all')).toMatchObject({
      status: 200,
      body: {
        space: { id: 'all', virtual: true, workPackageCount: 1 },
        rows: [{ workPackage: { id: own } }],
        writable: false,
      },
    });
  });

  it('rolls members up from the work package read, and a command moves the next read', async () => {
    const space = await createSpace('ada', 'Q3');
    await h.call('ada', 'POST', `/api/spaces/${space}/work-packages`, { workPackageId: own });
    const rollUp = async () =>
      (
        (await h.call('ada', 'GET', `/api/spaces/${space}/roll-ups?workPackageIds=${own}`))
          .body as {
          rollUps: Record<string, { kind: string; finalTotal: number; counts: { leaves: number } }>;
        }
      ).rollUps[own];
    expect(await rollUp()).toMatchObject({
      kind: 'rolled_up',
      finalTotal: 0,
      counts: { leaves: 0 },
    });
    const created = await h.call('ada', 'POST', `/api/work-packages/${own}/commands`, {
      commands: [{ kind: 'createWorkItem', ref: 'w', parentId: null, afterId: null, name: 'Root' }],
    });
    expect(created.status).toBe(200);
    const rows = (await h.call('ada', 'GET', `/api/work-packages/${own}/work-items`)).body as {
      workItems: { id: string }[];
    };
    const workPackage = (await h.call('ada', 'GET', `/api/work-packages/${own}`)).body as {
      steps: { id: string }[];
    };
    const row = rows.workItems.at(0);
    const step = workPackage.steps.at(0);
    if (row === undefined || step === undefined) throw new Error('no row or step');
    const workItemId = row.id;
    const stepId = step.id;
    expect(await rollUp()).toMatchObject({ finalTotal: 0, counts: { leaves: 1 } });
    await h.call('ada', 'POST', `/api/work-packages/${own}/commands`, {
      commands: [
        {
          kind: 'setEstimate',
          workItemId,
          stepId,
          days: { optimistic: 1, realistic: 2, pessimistic: 3 },
        },
      ],
    });
    expect((await rollUp()).finalTotal).toBeGreaterThan(0);
    expect(
      (await h.call('vic', 'GET', `/api/spaces/${space}/roll-ups?workPackageIds=${own}`)).status,
    ).toBe(200);
  });

  it('answers new dates after a start date change that publishes no event', async () => {
    const space = await createSpace('ada', 'Q3');
    await h.call('ada', 'POST', `/api/spaces/${space}/work-packages`, { workPackageId: own });
    await h.call('ada', 'POST', `/api/work-packages/${own}/commands`, {
      commands: [{ kind: 'createWorkItem', ref: 'w', parentId: null, afterId: null, name: 'Root' }],
    });
    const rows = (await h.call('ada', 'GET', `/api/work-packages/${own}/work-items`)).body as {
      workItems: { id: string }[];
    };
    const workPackage = (await h.call('ada', 'GET', `/api/work-packages/${own}`)).body as {
      steps: { id: string }[];
    };
    const row = rows.workItems.at(0);
    const step = workPackage.steps.at(0);
    if (row === undefined || step === undefined) throw new Error('no row or step');
    await h.call('ada', 'POST', `/api/work-packages/${own}/commands`, {
      commands: [
        {
          kind: 'setEstimate',
          workItemId: row.id,
          stepId: step.id,
          days: { optimistic: 2, realistic: 2, pessimistic: 2 },
        },
      ],
    });
    const datesOf = async () =>
      (
        (await h.call('ada', 'GET', `/api/spaces/${space}/roll-ups?workPackageIds=${own}`))
          .body as {
          rollUps: Record<string, { dates: { startsOn: string } | null }>;
        }
      ).rollUps[own].dates?.startsOn;
    expect(
      (await h.call('ada', 'PATCH', `/api/work-packages/${own}`, { startDate: '2026-10-05' }))
        .status,
    ).toBe(200);
    expect(await datesOf()).toBe('2026-10-05');
    expect(
      (await h.call('ada', 'PATCH', `/api/work-packages/${own}`, { startDate: '2026-11-02' }))
        .status,
    ).toBe(200);
    // Proof, observed 2026-09-29: with the work package revision left out of the
    // roll-up cache key, this read answered the cached `2026-10-05`: a start
    // date change advances the revision but publishes no event.
    expect(await datesOf()).toBe('2026-11-02');
  });

  it('refuses 51 work package ids with 400 and computes nothing', async () => {
    const space = await createSpace('ada', 'Q3');
    const ids = Array.from({ length: 51 }, (_, index) => `p${String(index)}`).join(',');
    expect(
      await h.call('ada', 'GET', `/api/spaces/${space}/roll-ups?workPackageIds=${ids}`),
    ).toMatchObject({ status: 400, body: { error: 'invalid_query' } });
    expect(
      await h.call(
        'ada',
        'GET',
        `/api/spaces/${space}/roll-ups?workPackageIds=${foreignWorkPackage}`,
      ),
    ).toMatchObject({ status: 404, body: { error: 'not_found' } });
  });

  it('lists work in progress across the space and refuses a limit above 1000 with 400', async () => {
    const space = await createSpace('ada', 'Q3');
    await h.call('ada', 'POST', `/api/spaces/${space}/work-packages`, { workPackageId: own });
    await h.call('ada', 'POST', `/api/work-packages/${own}/commands`, {
      commands: [{ kind: 'createWorkItem', ref: 'w', parentId: null, afterId: null, name: 'Root' }],
    });
    const rows = (await h.call('ada', 'GET', `/api/work-packages/${own}/work-items`)).body as {
      workItems: { id: string }[];
    };
    const workPackage = (await h.call('ada', 'GET', `/api/work-packages/${own}`)).body as {
      steps: { id: string; name: string }[];
    };
    const row = rows.workItems.at(0);
    const step = workPackage.steps.at(0);
    if (row === undefined || step === undefined) throw new Error('no row or step');
    expect(await h.call('ada', 'GET', `/api/spaces/${space}/in-progress`)).toMatchObject({
      status: 200,
      body: { items: [], truncated: false, unavailable: [] },
    });
    expect(
      (
        await h.call('ada', 'POST', `/api/work-packages/${own}/commands`, {
          commands: [{ kind: 'setStatus', workItemId: row.id, status: 'in_progress' }],
        })
      ).status,
    ).toBe(200);
    expect(await h.call('vic', 'GET', `/api/spaces/${space}/in-progress?limit=5`)).toMatchObject({
      status: 200,
      body: {
        items: [{ workPackageId: own, workItemId: row.id, name: 'Root', step: { id: step.id } }],
        truncated: false,
      },
    });
    for (const limit of ['1001', '0', '000', 'x', '-5', '1.5']) {
      expect({
        limit,
        answer: await h.call('ada', 'GET', `/api/spaces/${space}/in-progress?limit=${limit}`),
      }).toMatchObject({ answer: { status: 400, body: { error: 'invalid_query' } } });
    }
    expect((await h.call('ada', 'GET', `/api/spaces/${space}/in-progress?limit=1000`)).status).toBe(
      200,
    );
    expect((await h.call('ada', 'GET', `/api/spaces/${space}/in-progress?limit=010`)).status).toBe(
      200,
    );
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
    h = OrganizationHarness.openComposed();
    await h.register('ada');
  });

  it('answers organization_required without a legacy organization, and still reads all', async () => {
    await createWorkPackage('ada', 'Legacy plan');
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
      body: { rows: [{ workPackage: { name: 'Legacy plan' } }] },
    });
  });

  it('owns a space by the legacy organization and admits its work packages', async () => {
    h.organization('legacy');
    h.sqlite.run("UPDATE organization SET legacy = 1 WHERE id = 'legacy'");
    const workPackage = await createWorkPackage('ada', 'Legacy plan');
    const space = await createSpace('ada', 'Q3');
    expect(
      await h.call('ada', 'POST', `/api/spaces/${space}/work-packages`, {
        workPackageId: workPackage,
      }),
    ).toMatchObject({ status: 201 });
    expect(await h.call('ada', 'GET', '/api/spaces')).toMatchObject({
      status: 200,
      body: { spaces: [{ id: space, workPackageCount: 1 }] },
    });
    expect(h.sqlite.query('SELECT organization_id FROM space WHERE id = ?').get(space)).toEqual({
      organization_id: 'legacy',
    });
  });
});
