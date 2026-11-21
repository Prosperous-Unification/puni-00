import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';
import { readProjectIds, readSpaceReply } from '../testing/space-rollup';

/**
 * The space routes (`add-spaces` slice 2) over real SQLite and the production
 * organization access: owner resolution, roles, `all`, and foreign spaces and
 * work packages answered as absent.
 */
let h: OrganizationHarness;

afterEach(async () => {
  await h.closeComposed();
});

async function createWorkPackage(username: string, name: string): Promise<string> {
  const activation = h.sqlite
    .query<{ state: string }, []>('SELECT state FROM organization_activation WHERE singleton=1')
    .get();
  if (activation === null) throw new Error('space fixture activation is absent');
  if (activation.state === 'activated') {
    const answer = await readSpaceReply(h, username, 'POST', '/api/projects', {
      name: name + ' engagement',
      workPackage: { name },
    });
    expect(answer.status).toBe(201);
    return (answer.body as { workPackage: { id: string } }).workPackage.id;
  }
  if (activation.state !== 'pre_activation')
    throw new Error('space fixture activation is malformed');
  const parent = h.sqlite
    .query<{ id: string }, []>(
      'SELECT project.id FROM project JOIN organization ON organization.id=project.organization_id WHERE organization.legacy=1',
    )
    .get();
  if (parent === null) throw new Error('space fixture legacy project is absent');
  const answer = await readSpaceReply(h, username, 'POST', '/api/work-packages', {
    name,
    projectId: parent.id,
  });
  expect(answer.status).toBe(200);
  return (answer.body as { workPackage: { id: string } }).workPackage.id;
}

function parentIdOf(workPackageId: string): string {
  const parent = h.sqlite
    .query<{ project_id: string }, [string]>('SELECT project_id FROM work_package WHERE id=?')
    .get(workPackageId);
  if (parent === null) throw new Error('space fixture package parent is absent');
  return parent.project_id;
}

/** A real organization binding supplies the current leaves used by aggregate checks. */
async function defineSpaceStep(organizationId: string, username: string): Promise<void> {
  await h.publicWrites().uow.run(async ({ stores }) => {
    expect(
      await stores.stepCatalogue.defineAndBindStep(
        organizationId,
        {
          id: 'space-http-' + organizationId + '-step',
          code: 'space-work',
          name: 'Space work',
          position: 10,
          defaultEstimateUnit: 'workdays',
          defaultAllowancePercent: 0,
        },
        {
          bindingId: 'space-http-' + organizationId + '-binding',
          scopeKind: 'organization',
          scopeId: organizationId,
          workItemTypeId: null,
          position: 10,
        },
        { at: 100, by: h.userId(username) },
      ),
    ).toMatchObject({ ok: true });
    return { commit: true, value: undefined };
  });
}

async function createSpace(username: string, name: string): Promise<string> {
  const answer = await readSpaceReply(h, username, 'POST', '/api/spaces', { name });
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
    await defineSpaceStep('org-a', 'ada');
    await defineSpaceStep('org-b', 'grace');
    own = await createWorkPackage('ada', 'A plan');
    foreignWorkPackage = await createWorkPackage('grace', 'B plan');
    foreignSpace = await createSpace('grace', 'Theirs');
  });

  it('creates, lists, adds, moves, reads and removes within the organization', async () => {
    const second = await createWorkPackage('ada', 'A second');
    const space = await createSpace('ada', 'Q3');
    expect(
      (
        await readSpaceReply(h, 'ada', 'POST', `/api/spaces/${space}/projects`, {
          projectId: parentIdOf(own),
        })
      ).body,
    ).toEqual({ position: 10 });
    await readSpaceReply(h, 'ada', 'POST', `/api/spaces/${space}/projects`, {
      projectId: parentIdOf(second),
      afterProjectId: parentIdOf(own),
    });
    expect(
      await readSpaceReply(
        h,
        'ada',
        'POST',
        `/api/spaces/${space}/projects/${parentIdOf(second)}/move`,
        {
          afterProjectId: null,
        },
      ),
    ).toMatchObject({ status: 200, body: { position: 5 } });
    const read = await readSpaceReply(h, 'ada', 'GET', `/api/spaces/${space}`);
    expect(read).toMatchObject({
      status: 200,
      body: {
        space: { id: space, name: 'Q3', virtual: false, workPackageCount: 2, revision: 3 },
        projects: [
          {
            project: { id: parentIdOf(second) },
            workPackages: [{ id: second, createdByName: 'ada' }],
            position: 5,
          },
          { project: { id: parentIdOf(own) }, workPackages: [{ id: own }], position: 10 },
        ],
      },
    });
    expect(await readSpaceReply(h, 'ada', 'GET', '/api/spaces')).toMatchObject({
      status: 200,
      body: { spaces: [{ id: space, workPackageCount: 2 }] },
    });
    expect(
      (await readSpaceReply(h, 'ada', 'DELETE', `/api/spaces/${space}/projects/${parentIdOf(own)}`))
        .status,
    ).toBe(204);
    expect((await readSpaceReply(h, 'ada', 'DELETE', `/api/spaces/${space}`)).status).toBe(204);
    expect((await readSpaceReply(h, 'ada', 'GET', `/api/work-packages/${own}`)).status).toBe(200);
  });

  it('removes only space membership, preserving the composed work package graph and fan-out', async () => {
    let pushes = 0;
    await h.closeComposed();
    h = OrganizationHarness.openComposedWith({
      now: () => 100,
      pushFetch: () => {
        pushes += 1;
        return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
      },
    });
    await h.register('ada');
    h.organization('org-a');
    h.member('org-a', 'ada', 'member', ['org-admin']);
    h.bind('ada', 'org-a');
    h.activate();
    await defineSpaceStep('org-a', 'ada');
    const workPackageId = await createWorkPackage('ada', 'Retained plan');
    const spaceId = await createSpace('ada', 'Q3');
    expect(
      (
        await readSpaceReply(h, 'ada', 'POST', `/api/spaces/${spaceId}/projects`, {
          projectId: parentIdOf(workPackageId),
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await readSpaceReply(h, 'ada', 'POST', `/api/work-packages/${workPackageId}/commands`, {
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
      .query<{ id: string }, [string]>(
        'SELECT step_id AS id FROM work_package_step WHERE work_package_id = ?',
      )
      .get(workPackageId);
    if (workItem === null || step === null)
      throw new Error('populated work package fixture is missing');
    expect(
      (
        await readSpaceReply(h, 'ada', 'POST', `/api/work-packages/${workPackageId}/commands`, {
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
      h.sqlite
        .query<{ revision: number; [column: string]: unknown }, [string]>(
          'SELECT * FROM work_package WHERE id = ?',
        )
        .all(workPackageId),
      ...['work_package_step', 'work_item'].map((table) =>
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
    const packageBefore = h.sqlite
      .query<{ revision: number; [column: string]: unknown }, [string]>(
        'SELECT * FROM work_package WHERE id=?',
      )
      .get(workPackageId);
    if (packageBefore === null) throw new Error('space removal package is absent');
    expect(beforeOwned[3]).toHaveLength(1);
    const beforeEvents = h.sqlite
      .query<{ message: string }, []>('SELECT * FROM event_log ORDER BY subscription, seq')
      .all();
    const beforeSequences = h.sqlite
      .query<{ subscription: string; next_seq: number }, []>(
        'SELECT * FROM event_sequencer ORDER BY subscription',
      )
      .all();
    const beforePushes = pushes;

    // Proof: replacing the actual project detach with DELETE reached its FK
    // refusal and changed this mounted204 to500 (space-membership-faults-v1).
    expect(
      (
        await readSpaceReply(
          h,
          'ada',
          'DELETE',
          `/api/spaces/${spaceId}/projects/${parentIdOf(workPackageId)}`,
        )
      ).status,
    ).toBe(204);
    const afterOwned = owned();
    expect(afterOwned.slice(1)).toEqual(beforeOwned.slice(1));
    expect(afterOwned[0]).toEqual([{ ...packageBefore, revision: packageBefore.revision + 1 }]);
    expect(h.sqlite.query('SELECT id FROM project WHERE space_id = ?').all(spaceId)).toEqual([]);
    expect((await readSpaceReply(h, 'ada', 'GET', `/api/spaces/${spaceId}`)).body).toMatchObject({
      space: { revision: 2, workPackageCount: 0 },
    });
    const afterEvents = h.sqlite
      .query<{ message: string }, []>('SELECT * FROM event_log ORDER BY subscription, seq')
      .all();
    // Proof: omitting the actual changedProject announcement preserved the
    // revision/facts above but failed this event count (space-membership-faults-v1).
    expect(afterEvents).toHaveLength(beforeEvents.length + 1);
    expect(afterEvents.slice(0, -1)).toEqual(beforeEvents);
    const changed = afterEvents.at(-1);
    if (changed === undefined) throw new Error('space membership refresh is absent');
    expect(JSON.parse(changed.message)).toEqual({
      type: 'work_package_settings_changed',
      optimizationEnabled: false,
      scheduleEngine: 'fast',
      scheduleObjective: 'pri',
    });
    expect(h.sqlite.query('SELECT * FROM event_sequencer ORDER BY subscription').all()).toEqual(
      beforeSequences.map((row) => ({ ...row, next_seq: row.next_seq + 1 })),
    );
    expect(pushes).toBe(beforePushes + 1);
  });

  it('refuses a viewer every space write and lets the viewer read', async () => {
    const space = await createSpace('ada', 'Q3');
    await readSpaceReply(h, 'ada', 'POST', `/api/spaces/${space}/projects`, {
      projectId: parentIdOf(own),
    });
    for (const [method, path, body] of [
      ['POST', '/api/spaces', { name: 'Mine' }],
      ['PATCH', `/api/spaces/${space}`, { name: 'Mine' }],
      ['POST', `/api/spaces/${space}/projects`, { projectId: parentIdOf(own) }],
      ['POST', `/api/spaces/${space}/projects/${parentIdOf(own)}/move`, {}],
      ['DELETE', `/api/spaces/${space}/projects/${parentIdOf(own)}`],
      ['DELETE', `/api/spaces/${space}`],
    ] as const) {
      expect({
        method,
        path,
        answer: await readSpaceReply(h, 'vic', method, path, body),
      }).toMatchObject({
        answer: { status: 403, body: { error: 'forbidden' } },
      });
    }
    // Proof, observed 2026-09-29: with the read route answering `writable`
    // without `mayWrite`, the viewer's read failed here (Expected - 1,
    // Received + 31: `writable: true`).
    expect(await readSpaceReply(h, 'vic', 'GET', `/api/spaces/${space}`)).toMatchObject({
      status: 200,
      body: {
        projects: [{ project: { id: parentIdOf(own) }, workPackages: [{ id: own }] }],
        writable: false,
      },
    });
    expect(await readSpaceReply(h, 'vic', 'GET', '/api/spaces')).toMatchObject({
      body: { writable: false },
    });
    expect(await readSpaceReply(h, 'ada', 'GET', `/api/spaces/${space}`)).toMatchObject({
      body: { writable: true },
    });
  });

  it("answers another organization's space as absent to every route", async () => {
    for (const [method, path, body] of [
      ['GET', `/api/spaces/${foreignSpace}`],
      ['PATCH', `/api/spaces/${foreignSpace}`, { name: 'Mine' }],
      ['POST', `/api/spaces/${foreignSpace}/projects`, { projectId: parentIdOf(own) }],
      ['POST', `/api/spaces/${foreignSpace}/projects/${parentIdOf(foreignWorkPackage)}/move`, {}],
      ['DELETE', `/api/spaces/${foreignSpace}/projects/${parentIdOf(foreignWorkPackage)}`],
      ['DELETE', `/api/spaces/${foreignSpace}`],
    ] as const) {
      expect({
        method,
        path,
        answer: await readSpaceReply(h, 'ada', method, path, body),
      }).toMatchObject({
        answer: { status: 404, body: { error: 'not_found' } },
      });
    }
    expect((await readSpaceReply(h, 'ada', 'GET', '/api/spaces')).body).toEqual({
      spaces: [],
      writable: true,
    });
    expect(await readSpaceReply(h, 'grace', 'GET', `/api/spaces/${foreignSpace}`)).toMatchObject({
      status: 200,
      body: { space: { name: 'Theirs', revision: 0 } },
    });
  });

  it("answers another organization's work package as the work package route's 404, adding nothing", async () => {
    const space = await createSpace('ada', 'Q3');
    expect(
      await readSpaceReply(h, 'ada', 'POST', `/api/spaces/${space}/projects`, {
        projectId: parentIdOf(foreignWorkPackage),
      }),
    ).toMatchObject({ status: 404, body: { error: 'not_found' } });
    expect((await readSpaceReply(h, 'ada', 'GET', `/api/spaces/${space}`)).body).toMatchObject({
      projects: [],
      space: { revision: 0 },
    });
  });

  it('answers every write to all as virtual_space and reads all as the work package list', async () => {
    for (const [method, path, body] of [
      ['PATCH', '/api/spaces/all', { name: 'Mine' }],
      ['DELETE', '/api/spaces/all'],
      ['POST', '/api/spaces/all/projects', { projectId: parentIdOf(own) }],
      ['POST', `/api/spaces/all/projects/${parentIdOf(own)}/move`, {}],
      ['DELETE', `/api/spaces/all/projects/${parentIdOf(own)}`],
    ] as const) {
      expect({
        method,
        path,
        answer: await readSpaceReply(h, 'ada', method, path, body),
      }).toMatchObject({
        answer: { status: 409, body: { error: 'virtual_space' } },
      });
    }
    expect(await readSpaceReply(h, 'ada', 'GET', '/api/spaces/all')).toMatchObject({
      status: 200,
      body: {
        space: { id: 'all', virtual: true, workPackageCount: 1 },
        projects: [{ project: { id: parentIdOf(own) }, workPackages: [{ id: own }] }],
        writable: false,
      },
    });
  });

  it('rolls members up from the work package read, and a command moves the next read', async () => {
    const space = await createSpace('ada', 'Q3');
    await readSpaceReply(h, 'ada', 'POST', `/api/spaces/${space}/projects`, {
      projectId: parentIdOf(own),
    });
    const rollUp = async () =>
      (
        (
          await readSpaceReply(
            h,
            'ada',
            'GET',
            `/api/spaces/${space}/roll-ups?projectIds=${readProjectIds(h, own)}`,
          )
        ).body as {
          rollUps: Record<string, { kind: string; finalTotal: number; counts: { leaves: number } }>;
        }
      ).rollUps[own];
    expect(await rollUp()).toMatchObject({
      kind: 'rolled_up',
      finalTotal: 0,
      counts: { leaves: 0 },
    });
    const created = await readSpaceReply(h, 'ada', 'POST', `/api/work-packages/${own}/commands`, {
      commands: [{ kind: 'createWorkItem', ref: 'w', parentId: null, afterId: null, name: 'Root' }],
    });
    expect(created.status).toBe(200);
    const rows = (await readSpaceReply(h, 'ada', 'GET', `/api/work-packages/${own}/work-items`))
      .body as {
      workItems: { id: string }[];
    };
    const workPackage = (await readSpaceReply(h, 'ada', 'GET', `/api/work-packages/${own}`))
      .body as {
      steps: { id: string }[];
    };
    const row = rows.workItems.at(0);
    const step = workPackage.steps.at(0);
    if (row === undefined || step === undefined) throw new Error('no row or step');
    const workItemId = row.id;
    const stepId = step.id;
    expect(await rollUp()).toMatchObject({ finalTotal: 0, counts: { leaves: 1 } });
    await readSpaceReply(h, 'ada', 'POST', `/api/work-packages/${own}/commands`, {
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
      (
        await readSpaceReply(
          h,
          'vic',
          'GET',
          `/api/spaces/${space}/roll-ups?projectIds=${readProjectIds(h, own)}`,
        )
      ).status,
    ).toBe(200);
  });

  it('answers new dates after a start date change that publishes no event', async () => {
    const space = await createSpace('ada', 'Q3');
    await readSpaceReply(h, 'ada', 'POST', `/api/spaces/${space}/projects`, {
      projectId: parentIdOf(own),
    });
    await readSpaceReply(h, 'ada', 'POST', `/api/work-packages/${own}/commands`, {
      commands: [{ kind: 'createWorkItem', ref: 'w', parentId: null, afterId: null, name: 'Root' }],
    });
    const rows = (await readSpaceReply(h, 'ada', 'GET', `/api/work-packages/${own}/work-items`))
      .body as {
      workItems: { id: string }[];
    };
    const workPackage = (await readSpaceReply(h, 'ada', 'GET', `/api/work-packages/${own}`))
      .body as {
      steps: { id: string }[];
    };
    const row = rows.workItems.at(0);
    const step = workPackage.steps.at(0);
    if (row === undefined || step === undefined) throw new Error('no row or step');
    await readSpaceReply(h, 'ada', 'POST', `/api/work-packages/${own}/commands`, {
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
        (
          await readSpaceReply(
            h,
            'ada',
            'GET',
            `/api/spaces/${space}/roll-ups?projectIds=${readProjectIds(h, own)}`,
          )
        ).body as {
          rollUps: Record<string, { dates: { startsOn: string } | null }>;
        }
      ).rollUps[own].dates?.startsOn;
    expect(
      (
        await readSpaceReply(h, 'ada', 'PATCH', `/api/work-packages/${own}`, {
          startDate: '2026-10-05',
        })
      ).status,
    ).toBe(200);
    expect(await datesOf()).toBe('2026-10-05');
    expect(
      (
        await readSpaceReply(h, 'ada', 'PATCH', `/api/work-packages/${own}`, {
          startDate: '2026-11-02',
        })
      ).status,
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
      await readSpaceReply(
        h,
        'ada',
        'GET',
        `/api/spaces/${space}/roll-ups?projectIds=${readProjectIds(h, ids)}`,
      ),
    ).toMatchObject({ status: 400, body: { error: 'invalid_query' } });
    expect(
      await readSpaceReply(
        h,
        'ada',
        'GET',
        `/api/spaces/${space}/roll-ups?projectIds=${readProjectIds(h, foreignWorkPackage)}`,
      ),
    ).toMatchObject({ status: 404, body: { error: 'not_found' } });
  });

  it('lists work in progress across the space and refuses a limit above 1000 with 400', async () => {
    const space = await createSpace('ada', 'Q3');
    await readSpaceReply(h, 'ada', 'POST', `/api/spaces/${space}/projects`, {
      projectId: parentIdOf(own),
    });
    await readSpaceReply(h, 'ada', 'POST', `/api/work-packages/${own}/commands`, {
      commands: [{ kind: 'createWorkItem', ref: 'w', parentId: null, afterId: null, name: 'Root' }],
    });
    const rows = (await readSpaceReply(h, 'ada', 'GET', `/api/work-packages/${own}/work-items`))
      .body as {
      workItems: { id: string }[];
    };
    const workPackage = (await readSpaceReply(h, 'ada', 'GET', `/api/work-packages/${own}`))
      .body as {
      steps: { id: string; name: string }[];
    };
    const row = rows.workItems.at(0);
    const step = workPackage.steps.at(0);
    if (row === undefined || step === undefined) throw new Error('no row or step');
    expect(await readSpaceReply(h, 'ada', 'GET', `/api/spaces/${space}/in-progress`)).toMatchObject(
      {
        status: 200,
        body: { items: [], truncated: false, unavailable: [] },
      },
    );
    expect(
      (
        await readSpaceReply(h, 'ada', 'POST', `/api/work-packages/${own}/commands`, {
          commands: [{ kind: 'setStatus', workItemId: row.id, status: 'in_progress' }],
        })
      ).status,
    ).toBe(200);
    expect(
      await readSpaceReply(h, 'vic', 'GET', `/api/spaces/${space}/in-progress?limit=5`),
    ).toMatchObject({
      status: 200,
      body: {
        items: [{ workPackageId: own, workItemId: row.id, name: 'Root', step: { id: step.id } }],
        truncated: false,
      },
    });
    for (const limit of ['1001', '0', '000', 'x', '-5', '1.5']) {
      expect({
        limit,
        answer: await readSpaceReply(
          h,
          'ada',
          'GET',
          `/api/spaces/${space}/in-progress?limit=${limit}`,
        ),
      }).toMatchObject({ answer: { status: 400, body: { error: 'invalid_query' } } });
    }
    expect(
      (await readSpaceReply(h, 'ada', 'GET', `/api/spaces/${space}/in-progress?limit=1000`)).status,
    ).toBe(200);
    expect(
      (await readSpaceReply(h, 'ada', 'GET', `/api/spaces/${space}/in-progress?limit=010`)).status,
    ).toBe(200);
  });

  it('refuses a taken name with 409 and a blank one with 422', async () => {
    await createSpace('ada', 'Q3');
    expect(await readSpaceReply(h, 'ada', 'POST', '/api/spaces', { name: 'Q3' })).toMatchObject({
      status: 409,
      body: { error: 'name_taken' },
    });
    expect(await readSpaceReply(h, 'ada', 'POST', '/api/spaces', { name: '  ' })).toMatchObject({
      status: 422,
      body: { error: 'malformed', field: 'name' },
    });
    expect(await readSpaceReply(h, 'grace', 'POST', '/api/spaces', { name: 'Q3' })).toMatchObject({
      status: 201,
    });
  });
});

describe('before activation', () => {
  beforeEach(async () => {
    h = OrganizationHarness.openComposed();
    await h.register('ada');
  });

  it('answers organization_required without a legacy organization, and still reads empty all', async () => {
    for (const [method, path, body] of [
      ['GET', '/api/spaces'],
      ['POST', '/api/spaces', { name: 'Q3' }],
      ['GET', '/api/spaces/some-space'],
    ] as const) {
      expect({
        method,
        path,
        answer: await readSpaceReply(h, 'ada', method, path, body),
      }).toMatchObject({
        answer: { status: 409, body: { error: 'organization_required' } },
      });
    }
    expect(await readSpaceReply(h, 'ada', 'GET', '/api/spaces/all')).toMatchObject({
      status: 200,
      body: { space: { workPackageCount: 0 }, projects: [] },
    });
  });

  it('owns a space by the legacy organization and admits its work packages', async () => {
    h.organization('legacy');
    h.sqlite.run("UPDATE organization SET legacy = 1 WHERE id = 'legacy'");
    h.sqlite.run(
      "INSERT INTO project(id,organization_id,name,created_at) VALUES('space-http-legacy-project','legacy','Migrated legacy engagement',1)",
    );
    const workPackage = await createWorkPackage('ada', 'Legacy plan');
    const space = await createSpace('ada', 'Q3');
    expect(
      await readSpaceReply(h, 'ada', 'POST', `/api/spaces/${space}/projects`, {
        projectId: parentIdOf(workPackage),
      }),
    ).toMatchObject({ status: 201 });
    expect(await readSpaceReply(h, 'ada', 'GET', '/api/spaces')).toMatchObject({
      status: 200,
      body: { spaces: [{ id: space, workPackageCount: 1 }] },
    });
    expect(h.sqlite.query('SELECT organization_id FROM space WHERE id = ?').get(space)).toEqual({
      organization_id: 'legacy',
    });
    expect(await readSpaceReply(h, 'ada', 'GET', '/api/spaces/all')).toMatchObject({
      status: 200,
      body: {
        space: { workPackageCount: 1 },
        projects: [{ workPackages: [{ id: workPackage, name: 'Legacy plan' }] }],
      },
    });
  });
});
