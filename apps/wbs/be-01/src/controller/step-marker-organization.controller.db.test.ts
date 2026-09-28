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
    ['PATCH', `/api/projects/${projectId}/steps/${stepId}`, { allowancePercent: 10 }],
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
  it('rolls a legacy combined step rename back when its allowance write fails', async () => {
    h.close();
    h = OrganizationHarness.openComposed();
    await h.register('ada');
    const projectId = await create('ada', 'Legacy combined');
    const stepId = await firstStep('ada', projectId);
    h.sqlite.run(
      "CREATE TRIGGER allowance_refused BEFORE UPDATE OF allowance_bps ON step BEGIN SELECT RAISE(ABORT, 'allowance refused'); END",
    );
    expect(
      (
        await h.call('ada', 'PATCH', `/api/projects/${projectId}/steps/${stepId}`, {
          name: 'Rolled back',
          allowancePercent: 10,
        })
      ).status,
    ).toBe(500);
    const found = await h.call('ada', 'GET', `/api/projects/${projectId}`);
    expect(
      (found.body as { steps: { id: string; name: string }[] }).steps.find(
        (candidate) => candidate.id === stepId,
      )?.name,
    ).not.toBe('Rolled back');
    expect(h.sqlite.query('SELECT id FROM organization_audit').all()).toEqual([]);
  });
  it('keeps deployment-wide step and marker access across organizations', async () => {
    h.close();
    h = OrganizationHarness.openComposed();
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
  it('audits each super-admin step and marker recovery while keeping the creator', async () => {
    h.member('org-a', 'nell', 'super_admin');
    h.bind('nell', 'org-a');
    expect(
      (await h.call('ada', 'PATCH', `/api/projects/${own}`, { restricted: true })).status,
    ).toBe(200);
    const step = await firstStep('ada', own);
    expect(
      (await h.call('nell', 'POST', `/api/projects/${own}/steps`, { name: 'Recovery' })).status,
    ).toBe(200);
    expect(
      (await h.call('nell', 'PATCH', `/api/projects/${own}/steps/${step}`, { name: 'Recovered' }))
        .status,
    ).toBe(200);
    expect(
      (await h.call('nell', 'DELETE', `/api/projects/${own}/steps/${step}?cascade=true`)).status,
    ).toBe(204);
    expect(
      (
        await h.call('nell', 'POST', `/api/projects/${own}/calendar-markers`, {
          markerId: MARKER,
          date: '2026-10-02',
          name: 'Start',
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await h.call('nell', 'PATCH', `/api/projects/${own}/calendar-markers/${MARKER}`, {
          name: 'Moved',
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await h.call('nell', 'PATCH', `/api/projects/${own}/calendar-markers/${MARKER}`, {
          color: '#5d6afe',
        })
      ).status,
    ).toBe(200);
    expect(
      (await h.call('nell', 'DELETE', `/api/projects/${own}/calendar-markers/${MARKER}`)).status,
    ).toBe(204);
    const audits = h.sqlite
      .query<{ organization_id: string; actor_id: string; subject_id: string; detail: string }, []>(
        'SELECT organization_id, actor_id, subject_id, detail FROM organization_audit ORDER BY rowid',
      )
      .all();
    expect(audits.map((audit) => audit.detail)).toEqual([
      '{"step":"add"}',
      '{"step":"rename"}',
      '{"step":"remove"}',
      '{"marker":"create"}',
      '{"marker":"rename"}',
      '{"marker":"recolor"}',
      '{"marker":"remove"}',
    ]);
    expect(
      audits.every(
        (audit) =>
          audit.organization_id === 'org-a' &&
          audit.actor_id === h.userId('nell') &&
          audit.subject_id === own,
      ),
    ).toBe(true);
    expect(
      h.sqlite
        .query<{ owner_id: string }, [string]>('SELECT owner_id FROM project WHERE id = ?')
        .get(own),
    ).toEqual({ owner_id: h.userId('ada') });
  });

  it('admits an allowance command through the step lookup and records its recovery once', async () => {
    h.member('org-a', 'nell', 'super_admin');
    h.bind('nell', 'org-a');
    const step = await firstStep('ada', own);
    expect(
      (await h.call('ada', 'PATCH', `/api/projects/${own}`, { restricted: true })).status,
    ).toBe(200);
    expect(
      (
        await h.call('nell', 'PATCH', `/api/projects/${own}/steps/${step}`, {
          allowancePercent: 15,
        })
      ).status,
    ).toBe(200);
    expect(
      h.sqlite.query<{ detail: string }, []>('SELECT detail FROM organization_audit').all(),
    ).toEqual([{ detail: '{"commands":["setStepAllowance"]}' }]);
  });

  it('commits a combined recovered step patch once and rolls its rename back when allowance fails', async () => {
    h.member('org-a', 'nell', 'super_admin');
    h.bind('nell', 'org-a');
    const step = await firstStep('ada', own);
    expect(
      (await h.call('ada', 'PATCH', `/api/projects/${own}`, { restricted: true })).status,
    ).toBe(200);
    const path = `/api/projects/${own}/steps/${step}`;
    expect(
      await h.call('nell', 'PATCH', path, { name: 'Recovered', allowancePercent: 15 }),
    ).toMatchObject({
      status: 200,
      body: { step: { name: 'Recovered', allowancePercent: 15 } },
    });
    expect(h.sqlite.query('SELECT detail FROM organization_audit').all()).toHaveLength(1);
    expect(
      (await h.call('ada', 'POST', `/api/projects/${own}/steps`, { name: 'Taken' })).status,
    ).toBe(200);
    expect(
      (await h.call('nell', 'PATCH', path, { name: 'Taken', allowancePercent: 20 })).status,
    ).toBe(409);
    expect(h.sqlite.query('SELECT detail FROM organization_audit').all()).toHaveLength(1);
    const beforeEvents = h.sqlite.query('SELECT * FROM event_log ORDER BY rowid').all();
    h.sqlite.run(
      "CREATE TRIGGER allowance_refused BEFORE UPDATE OF allowance_bps ON step BEGIN SELECT RAISE(ABORT, 'allowance refused'); END",
    );
    expect(
      (await h.call('nell', 'PATCH', path, { name: 'Must roll back', allowancePercent: 20 }))
        .status,
    ).toBe(500);
    const after = await h.call('ada', 'GET', `/api/projects/${own}`);
    expect(
      (
        after.body as { steps: { id: string; name: string; allowancePercent: number }[] }
      ).steps.find((candidate) => candidate.id === step),
    ).toMatchObject({ name: 'Recovered', allowancePercent: 15 });
    expect(h.sqlite.query('SELECT detail FROM organization_audit').all()).toHaveLength(1);
    expect(h.sqlite.query('SELECT * FROM event_log ORDER BY rowid').all()).toEqual(beforeEvents);
  });

  it('rolls back a recovered step and marker write when the audit insert fails', async () => {
    h.member('org-a', 'nell', 'super_admin');
    h.bind('nell', 'org-a');
    expect(
      (await h.call('ada', 'PATCH', `/api/projects/${own}`, { restricted: true })).status,
    ).toBe(200);
    const beforeEvents = h.sqlite.query('SELECT * FROM event_log ORDER BY rowid').all();
    h.sqlite.run(
      "CREATE TRIGGER audit_refused BEFORE INSERT ON organization_audit BEGIN SELECT RAISE(ABORT, 'audit refused'); END",
    );
    expect(
      (await h.call('nell', 'POST', `/api/projects/${own}/steps`, { name: 'Refused' })).status,
    ).toBe(500);
    expect(
      (
        await h.call('nell', 'POST', `/api/projects/${own}/calendar-markers`, {
          markerId: MARKER,
          date: '2026-10-02',
          name: 'Refused',
        })
      ).status,
    ).toBe(500);
    expect(
      h.sqlite
        .query<{ id: string }, [string, string]>(
          'SELECT id FROM step WHERE project_id = ? AND name = ?',
        )
        .all(own, 'Refused'),
    ).toEqual([]);
    expect((await h.call('ada', 'GET', `/api/projects/${own}/calendar-markers`)).body).toEqual({
      markers: [],
    });
    expect(h.sqlite.query('SELECT id FROM organization_audit').all()).toEqual([]);
    expect(h.sqlite.query('SELECT * FROM event_log ORDER BY rowid').all()).toEqual(beforeEvents);
  });

  it('refuses other writers on a restricted project and records no ordinary creator write', async () => {
    h.member('org-a', 'nell', 'member');
    h.bind('nell', 'org-a');
    expect(
      (await h.call('ada', 'PATCH', `/api/projects/${own}`, { restricted: true })).status,
    ).toBe(200);
    const step = await firstStep('ada', own);
    for (const writer of ['nell', 'vic']) {
      expect(
        (await h.call(writer, 'POST', `/api/projects/${own}/steps`, { name: 'Refused' })).status,
      ).toBe(403);
      expect(
        (
          await h.call(writer, 'POST', `/api/projects/${own}/calendar-markers`, {
            markerId: MARKER,
            date: '2026-10-02',
            name: 'Refused',
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await h.call(writer, 'PATCH', `/api/projects/${own}/steps/${step}`, {
            allowancePercent: 15,
          })
        ).status,
      ).toBe(403);
    }
    h.sqlite.run("UPDATE organization_membership SET role = 'admin' WHERE user_id = ?", [
      h.userId('nell'),
    ]);
    expect(
      (await h.call('nell', 'POST', `/api/projects/${own}/steps`, { name: 'Refused' })).status,
    ).toBe(403);
    expect(
      (
        await h.call('nell', 'POST', `/api/projects/${own}/calendar-markers`, {
          markerId: MARKER,
          date: '2026-10-02',
          name: 'Refused',
        })
      ).status,
    ).toBe(403);
    expect(
      (await h.call('ada', 'POST', `/api/projects/${own}/steps`, { name: 'Creator' })).status,
    ).toBe(200);
    expect(
      (
        await h.call('ada', 'POST', `/api/projects/${own}/calendar-markers`, {
          markerId: MARKER,
          date: '2026-10-02',
          name: 'Creator',
        })
      ).status,
    ).toBe(201);
    expect(h.sqlite.query('SELECT id FROM organization_audit').all()).toEqual([]);
    h.sqlite.run("UPDATE organization_membership SET role = 'viewer' WHERE user_id = ?", [
      h.userId('ada'),
    ]);
    expect((await h.call('ada', 'POST', `/api/projects/${own}/steps`, { name: 'No' })).status).toBe(
      403,
    );
    expect(
      (await h.call('ada', 'PATCH', `/api/projects/${own}/steps/${step}`, { allowancePercent: 15 }))
        .status,
    ).toBe(403);
  });

  it('refuses a removed super-admin and records nothing', async () => {
    h.member('org-a', 'nell', 'super_admin');
    h.bind('nell', 'org-a');
    expect(
      (await h.call('ada', 'PATCH', `/api/projects/${own}`, { restricted: true })).status,
    ).toBe(200);
    h.sqlite.run('DELETE FROM organization_membership WHERE user_id = ?', [h.userId('nell')]);
    expect(
      (await h.call('nell', 'POST', `/api/projects/${own}/steps`, { name: 'No' })).status,
    ).toBe(403);
    expect(
      (
        await h.call('nell', 'POST', `/api/projects/${own}/calendar-markers`, {
          markerId: MARKER,
          date: '2026-10-02',
          name: 'No',
        })
      ).status,
    ).toBe(403);
    expect(h.sqlite.query('SELECT id FROM organization_audit').all()).toEqual([]);
  });

  it('refuses a super-admin revoked after access resolution before step admission', async () => {
    h.member('org-a', 'nell', 'super_admin');
    h.bind('nell', 'org-a');
    expect(
      (await h.call('ada', 'PATCH', `/api/projects/${own}`, { restricted: true })).status,
    ).toBe(200);
    revokeAfterResolution = true;
    expect(
      (await h.call('nell', 'POST', `/api/projects/${own}/steps`, { name: 'Revoked' })).status,
    ).toBe(403);
    expect(h.sqlite.query('SELECT id FROM organization_audit').all()).toEqual([]);
    expect(h.sqlite.query("SELECT id FROM step WHERE name = 'Revoked'").all()).toEqual([]);
  });

  it('records no recovery for step and marker writes the store refuses', async () => {
    h.member('org-a', 'nell', 'super_admin');
    h.bind('nell', 'org-a');
    expect(
      (await h.call('ada', 'POST', `/api/projects/${own}/steps`, { name: 'Review' })).status,
    ).toBe(200);
    await marker('ada', own, MARKER);
    expect(
      (await h.call('ada', 'PATCH', `/api/projects/${own}`, { restricted: true })).status,
    ).toBe(200);
    expect(
      (await h.call('nell', 'POST', `/api/projects/${own}/steps`, { name: 'Review' })).status,
    ).toBe(409);
    expect(
      (
        await h.call('nell', 'POST', `/api/projects/${own}/calendar-markers`, {
          markerId: MARKER,
          date: '2026-10-03',
          name: 'Duplicate',
        })
      ).status,
    ).toBe(409);
    expect(h.sqlite.query('SELECT id FROM organization_audit').all()).toEqual([]);
  });
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

  it('refuses an allowance edit of a foreign step or project, changing nothing', async () => {
    const before = await foreignState();
    for (const [path, body] of [
      [`/api/projects/${foreign}/steps/${foreignStep}`, { allowancePercent: 25 }],
      [`/api/projects/${own}/steps/${foreignStep}`, { allowancePercent: 25 }],
      [`/api/projects/${own}/steps/${foreignStep}`, { name: 'Taken', allowancePercent: 25 }],
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

  it('lets a member write steps and markers of the own project', async () => {
    expect(
      (await h.call('ada', 'POST', `/api/projects/${own}/steps`, { name: 'Review' })).status,
    ).toBe(200);
    const step = await firstStep('ada', own);
    expect(
      await h.call('ada', 'PATCH', `/api/projects/${own}/steps/${step}`, { allowancePercent: 15 }),
    ).toMatchObject({ status: 200, body: { step: { id: step, allowancePercent: 15 } } });
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
