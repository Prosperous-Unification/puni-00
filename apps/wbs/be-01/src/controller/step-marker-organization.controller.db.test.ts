import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { type Answer, OrganizationHarness } from '../testing/organization-harness';

/**
 * Steps and calendar markers under organization isolation (task 3.3), over
 * real SQLite and the production organization access; see
 * {@link OrganizationHarness.openComposed}, whose real units of work the
 * allowance edit's command batch needs.
 */
let h: OrganizationHarness;
let own: string;
let setupAudits: unknown[];
const audits = () => h.sqlite.query('SELECT * FROM organization_audit ORDER BY rowid').all();
let foreign: string;
let foreignStep: string;
let foreignMarker: string;
let revokeAfterResolution = false;
const MARKER = '6b0d9f3e-4c1a-4c77-9a53-1b2f0e6d7c11';
const FOREIGN_MARKER = '0f3c7a2e-8d14-4b6e-a1c9-5e2d7b3f9a40';

beforeEach(async () => {
  revokeAfterResolution = false;
  h = OrganizationHarness.openComposed(false, () => {
    if (!revokeAfterResolution) return;
    revokeAfterResolution = false;
    h.sqlite.run('DELETE FROM organization_membership WHERE user_id = ?', [h.userId('nell')]);
  });
  for (const username of ['ada', 'grace', 'vic', 'nell']) await h.register(username);
  h.organization('org-a');
  h.organization('org-b');
  h.member('org-a', 'ada', 'member', ['org-admin']);
  h.member('org-a', 'vic', 'viewer', ['project-viewer']);
  h.member('org-b', 'grace', 'member', ['org-admin']);
  h.bind('ada', 'org-a');
  h.bind('vic', 'org-a');
  h.bind('grace', 'org-b');
  h.activate();
  own = await create('ada', 'A plan', 'org-a');
  foreign = await create('grace', 'B plan', 'org-b');
  foreignStep = await firstStep('grace', foreign);
  setupAudits = audits();
  foreignMarker = await marker('grace', foreign, FOREIGN_MARKER);
});

afterEach(async () => {
  await h.closeComposed();
});

async function create(username: string, name: string, organizationId: string): Promise<string> {
  const projectId = organizationId + '-project';
  if (organizationId === 'legacy-marker-org')
    h.sqlite.run('INSERT INTO organization(id,name,legacy,created_at) VALUES(?,?,1,1)', [
      organizationId,
      name,
    ]);
  h.sqlite.run(
    'INSERT INTO project(id,organization_id,name,created_at,created_by) VALUES(?,?,?,1,?)',
    [projectId, organizationId, name, h.userId(username)],
  );
  if (organizationId !== 'legacy-marker-org')
    h.grant(organizationId, username, 'project-manager', 'project', projectId);
  const stepId = organizationId + '-step';
  h.sqlite.run(
    "INSERT INTO step_definition(id,organization_id,code,name,estimate_unit,default_allowance_bps,position,defined_at_scope_kind,defined_at_scope_id,origin) VALUES(?,?,'dev','Dev','workdays',0,10,'project',?,'authored')",
    [stepId, organizationId, projectId],
  );
  h.sqlite.run(
    "INSERT INTO step_binding(id,organization_id,scope_kind,scope_id,step_id,position,origin) VALUES(?,?,'project',?,?,10,'authored')",
    [stepId + '-binding', organizationId, projectId, stepId],
  );
  const answer = await h.call(username, 'POST', '/api/work-packages', { name, projectId });
  if (answer.status !== 200) throw new Error('package birth refused: ' + JSON.stringify(answer));
  return (answer.body as { workPackage: { id: string } }).workPackage.id;
}

function allowance(workPackageId: string, stepId: string) {
  return h.sqlite
    .query('SELECT allowance_bps FROM work_package_step WHERE work_package_id=? AND step_id=?')
    .get(workPackageId, stepId);
}
function refuseAllowanceWrite() {
  h.sqlite.run(
    "CREATE TRIGGER allowance_refused BEFORE UPDATE OF allowance_bps ON work_package_step BEGIN SELECT RAISE(ABORT, 'allowance refused'); END",
  );
}

async function firstStep(username: string, workPackageId: string): Promise<string> {
  const answer = await h.call(username, 'GET', `/api/work-packages/${workPackageId}`);
  const steps = (answer.body as { steps: { id: string }[] }).steps;
  const step = steps.at(0);
  if (step === undefined) throw new Error('the work package started with no step');
  return step.id;
}

async function marker(username: string, workPackageId: string, id: string): Promise<string> {
  const answer = await h.call(
    username,
    'POST',
    `/api/work-packages/${workPackageId}/calendar-markers`,
    {
      markerId: id,
      date: '2026-10-01',
      name: 'Launch',
    },
  );
  if (answer.status !== 201) throw new Error(`marker refused: ${JSON.stringify(answer)}`);
  return id;
}

/** Every step and marker route addressed at `workPackageId`, with a writer's body. */
function routes(
  workPackageId: string,
  stepId: string,
  markerId: string,
): [string, string, unknown?][] {
  return [
    ['PATCH', `/api/work-packages/${workPackageId}/steps/${stepId}`, { allowanceBps: 1000 }],

    ['GET', `/api/work-packages/${workPackageId}/calendar-markers`],
    [
      'POST',
      `/api/work-packages/${workPackageId}/calendar-markers`,
      { markerId: MARKER, date: '2026-10-02', name: 'Beta' },
    ],
    [
      'PATCH',
      `/api/work-packages/${workPackageId}/calendar-markers/${markerId}`,
      { name: 'Moved' },
    ],
    ['DELETE', `/api/work-packages/${workPackageId}/calendar-markers/${markerId}`],
  ];
}

/** What the foreign organization holds, to show a refused call changed none of it. */
async function foreignState(): Promise<Answer[]> {
  return [
    await h.call('grace', 'GET', `/api/work-packages/${foreign}`),
    await h.call('grace', 'GET', `/api/work-packages/${foreign}/calendar-markers`),
  ];
}

describe('before activation', () => {
  it('keeps deployment-wide step and marker access across organizations', async () => {
    await h.closeComposed();
    h = OrganizationHarness.openComposed();
    for (const username of ['ada', 'grace']) await h.register(username);
    h.organization('org-b');
    h.member('org-b', 'grace', 'member', ['org-admin']);
    h.bind('grace', 'org-b');
    const theirs = await create('ada', 'Legacy plan', 'legacy-marker-org');
    const step = await firstStep('ada', theirs);
    await marker('ada', theirs, MARKER);
    expect(
      (
        await h.call('grace', 'PATCH', `/api/work-packages/${theirs}/steps/${step}`, {
          allowanceBps: 1000,
        })
      ).status,
    ).toBe(200);
    expect(
      (await h.call('grace', 'GET', `/api/work-packages/${theirs}/calendar-markers`)).status,
    ).toBe(200);
    const beforeEvents = h.sqlite.query('SELECT * FROM event_log ORDER BY rowid').all();
    refuseAllowanceWrite();
    expect(
      (
        await h.call('grace', 'PATCH', `/api/work-packages/${theirs}/steps/${step}`, {
          allowanceBps: 2000,
        })
      ).status,
    ).toBe(500);
    expect(allowance(theirs, step)).toEqual({ allowance_bps: 1000 });
    expect(audits()).toEqual([]);
    expect(h.sqlite.query('SELECT * FROM event_log ORDER BY rowid').all()).toEqual(beforeEvents);
  });
});

describe('after activation', () => {
  it('refuses super-admin step and marker recovery while keeping the creator', async () => {
    h.member('org-a', 'nell', 'super_admin', ['org-super-admin']);
    h.bind('nell', 'org-a');
    expect(
      (await h.call('ada', 'PATCH', '/api/work-packages/' + own, { restricted: true })).status,
    ).toBe(200);
    const step = await firstStep('ada', own);
    const before = await foreignState();
    for (const [method, path, body] of routes(own, step, MARKER)) {
      if (method === 'GET') continue;
      expect((await h.call('nell', method, path, body)).status).toBe(403);
    }
    expect(audits()).toEqual(setupAudits);
    expect(await foreignState()).toEqual(before);
    expect(h.sqlite.query('SELECT created_by FROM work_package WHERE id = ?').get(own)).toEqual({
      created_by: h.userId('ada'),
    });
  });

  it('refuses an allowance recovery without package.manage_settings', async () => {
    h.member('org-a', 'nell', 'super_admin', ['org-super-admin']);
    h.bind('nell', 'org-a');
    const step = await firstStep('ada', own);
    expect(
      (await h.call('ada', 'PATCH', `/api/work-packages/${own}`, { restricted: true })).status,
    ).toBe(200);
    expect(
      (
        await h.call('nell', 'PATCH', `/api/work-packages/${own}/steps/${step}`, {
          allowanceBps: 1500,
        })
      ).status,
    ).toBe(403);
    expect(audits()).toEqual(setupAudits);
  });

  it('rolls back granted step and marker writes when persistence fails', async () => {
    h.member('org-a', 'nell', 'super_admin', ['org-super-admin']);
    h.bind('nell', 'org-a');
    expect(
      (await h.call('ada', 'PATCH', `/api/work-packages/${own}`, { restricted: true })).status,
    ).toBe(200);
    h.grant('org-a', 'nell', 'package-manager', 'work_package', own);
    const step = await firstStep('ada', own);
    expect(
      (
        await h.call('nell', 'PATCH', `/api/work-packages/${own}/steps/${step}`, {
          allowanceBps: 800,
        })
      ).status,
    ).toBe(200);
    expect(audits()).toEqual(setupAudits);
    const beforeEvents = h.sqlite.query('SELECT * FROM event_log ORDER BY rowid').all();
    refuseAllowanceWrite();
    h.sqlite.run(
      "CREATE TRIGGER marker_refused BEFORE INSERT ON calendar_marker BEGIN SELECT RAISE(ABORT, 'marker refused'); END",
    );
    expect(
      (
        await h.call('nell', 'PATCH', `/api/work-packages/${own}/steps/${step}`, {
          allowanceBps: 1500,
        })
      ).status,
    ).toBe(500);
    expect(
      (
        await h.call('nell', 'POST', `/api/work-packages/${own}/calendar-markers`, {
          markerId: MARKER,
          date: '2026-10-02',
          name: 'Refused',
        })
      ).status,
    ).toBe(500);
    expect(allowance(own, step)).toEqual({ allowance_bps: 800 });
    expect((await h.call('ada', 'GET', `/api/work-packages/${own}/calendar-markers`)).body).toEqual(
      {
        markers: [],
      },
    );
    expect(audits()).toEqual(setupAudits);
    expect(h.sqlite.query('SELECT * FROM event_log ORDER BY rowid').all()).toEqual(beforeEvents);
  });

  it('refuses other writers on a restricted work package and records no ordinary creator write', async () => {
    h.member('org-a', 'nell', 'member', ['project-contributor']);
    h.bind('nell', 'org-a');
    expect(
      (await h.call('ada', 'PATCH', `/api/work-packages/${own}`, { restricted: true })).status,
    ).toBe(200);
    const step = await firstStep('ada', own);
    for (const writer of ['nell', 'vic']) {
      expect(
        (
          await h.call(writer, 'POST', `/api/work-packages/${own}/calendar-markers`, {
            markerId: MARKER,
            date: '2026-10-02',
            name: 'Refused',
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await h.call(writer, 'PATCH', `/api/work-packages/${own}/steps/${step}`, {
            allowanceBps: 1500,
          })
        ).status,
      ).toBe(404);
    }
    h.sqlite.run("UPDATE organization_membership SET role = 'admin' WHERE user_id = ?", [
      h.userId('nell'),
    ]);
    expect(
      (
        await h.call('nell', 'PATCH', `/api/work-packages/${own}/steps/${step}`, {
          allowanceBps: 1500,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await h.call('nell', 'POST', `/api/work-packages/${own}/calendar-markers`, {
          markerId: MARKER,
          date: '2026-10-02',
          name: 'Refused',
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await h.call('ada', 'PATCH', `/api/work-packages/${own}/steps/${step}`, {
          allowanceBps: 1500,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await h.call('ada', 'POST', `/api/work-packages/${own}/calendar-markers`, {
          markerId: MARKER,
          date: '2026-10-02',
          name: 'Creator',
        })
      ).status,
    ).toBe(201);
    expect(audits()).toEqual(setupAudits);
    h.sqlite.run('DELETE FROM access_grant WHERE subject_id = ?', [h.userId('ada')]);
    h.grant('org-a', 'ada', 'package-viewer', 'work_package', own);
    h.sqlite.run("UPDATE organization_membership SET role = 'viewer' WHERE user_id = ?", [
      h.userId('ada'),
    ]);

    expect(
      (
        await h.call('ada', 'PATCH', `/api/work-packages/${own}/steps/${step}`, {
          allowanceBps: 1500,
        })
      ).status,
    ).toBe(403);
  });

  it('refuses a removed super-admin and records nothing', async () => {
    h.member('org-a', 'nell', 'super_admin', ['org-super-admin']);
    h.bind('nell', 'org-a');
    expect(
      (await h.call('ada', 'PATCH', `/api/work-packages/${own}`, { restricted: true })).status,
    ).toBe(200);
    h.sqlite.run('DELETE FROM organization_membership WHERE user_id = ?', [h.userId('nell')]);
    expect(
      (
        await h.call(
          'nell',
          'PATCH',
          `/api/work-packages/${own}/steps/${await firstStep('ada', own)}`,
          { allowanceBps: 1500 },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await h.call('nell', 'POST', `/api/work-packages/${own}/calendar-markers`, {
          markerId: MARKER,
          date: '2026-10-02',
          name: 'No',
        })
      ).status,
    ).toBe(403);
    expect(audits()).toEqual(setupAudits);
  });

  it('refuses a super-admin revoked after access resolution before step admission', async () => {
    h.member('org-a', 'nell', 'super_admin', ['org-super-admin']);
    h.bind('nell', 'org-a');
    expect(
      (await h.call('ada', 'PATCH', `/api/work-packages/${own}`, { restricted: true })).status,
    ).toBe(200);
    const step = await firstStep('ada', own);
    h.grant('org-a', 'nell', 'package-manager', 'work_package', own);
    revokeAfterResolution = true;
    expect(
      (
        await h.call('nell', 'PATCH', `/api/work-packages/${own}/steps/${step}`, {
          allowanceBps: 1500,
        })
      ).status,
    ).toBe(403);
    expect(revokeAfterResolution).toBe(false);
    expect(audits()).toEqual(setupAudits);
    expect(allowance(own, step)).toEqual({ allowance_bps: 0 });
  });

  it('records no recovery for a granted duplicate marker the store refuses', async () => {
    h.member('org-a', 'nell', 'super_admin', ['org-super-admin']);
    h.bind('nell', 'org-a');

    await marker('ada', own, MARKER);
    expect(
      (await h.call('ada', 'PATCH', `/api/work-packages/${own}`, { restricted: true })).status,
    ).toBe(200);
    h.grant('org-a', 'nell', 'package-manager', 'work_package', own);

    expect(
      (
        await h.call('nell', 'POST', `/api/work-packages/${own}/calendar-markers`, {
          markerId: MARKER,
          date: '2026-10-03',
          name: 'Duplicate',
        })
      ).status,
    ).toBe(409);
    expect(audits()).toEqual(setupAudits);
  });
  it('answers 404 alike for a foreign and an absent work package on every step and marker route', async () => {
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

  it("refuses the foreign marker under the caller's own work package path", async () => {
    const before = await foreignState();

    expect(
      (
        await h.call(
          'ada',
          'PATCH',
          `/api/work-packages/${own}/calendar-markers/${foreignMarker}`,
          {
            name: 'Taken',
          },
        )
      ).status,
    ).toBe(404);
    expect(
      (await h.call('ada', 'DELETE', `/api/work-packages/${own}/calendar-markers/${foreignMarker}`))
        .status,
    ).toBe(404);
    expect(await foreignState()).toEqual(before);
  });

  it('refuses an allowance edit of a foreign step or work package, changing nothing', async () => {
    const before = await foreignState();
    for (const [path, body] of [
      [`/api/work-packages/${foreign}/steps/${foreignStep}`, { allowanceBps: 2500 }],
      [`/api/work-packages/${own}/steps/${foreignStep}`, { allowanceBps: 2500 }],
    ] as const) {
      expect(await h.call('ada', 'PATCH', path, body)).toEqual({
        status: 404,
        body: { error: 'not_found' },
      });
    }
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

  it('lets a member write steps and markers of the own work package', async () => {
    const step = await firstStep('ada', own);
    expect(
      await h.call('ada', 'PATCH', `/api/work-packages/${own}/steps/${step}`, {
        allowanceBps: 1500,
      }),
    ).toMatchObject({
      status: 200,
      body: { step: { estimateUnit: 'workdays' as const, id: step, allowancePercent: 15 } },
    });
    await marker('ada', own, MARKER);
    expect(
      (
        await h.call('ada', 'PATCH', `/api/work-packages/${own}/calendar-markers/${MARKER}`, {
          name: 'Go',
        })
      ).status,
    ).toBe(200);
  });

  it('answers a foreign marker id collision only with 409 and leaves that marker alone', async () => {
    const before = await foreignState();
    expect(
      await h.call('ada', 'POST', `/api/work-packages/${own}/calendar-markers`, {
        markerId: foreignMarker,
        date: '2026-11-01',
        name: 'Mine',
      }),
    ).toEqual({ status: 409, body: { error: 'taken', field: 'markerId' } });
    expect(await foreignState()).toEqual(before);
    expect(await h.call('ada', 'GET', `/api/work-packages/${own}/calendar-markers`)).toEqual({
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
