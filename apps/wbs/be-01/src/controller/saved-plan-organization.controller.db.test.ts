import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { type Answer, OrganizationHarness } from '../testing/organization-harness';

/**
 * Saved plans and work package history under organization isolation (task 3.6),
 * over be-01's production composition and real SQLite; see
 * {@link OrganizationHarness.openComposed}.
 */
let h: OrganizationHarness;
let own: string;
let foreign: string;
let foreignPlan: string;
let setupAuditRows: unknown[];
let setupAuditIds: unknown[];

beforeEach(async () => {
  h = OrganizationHarness.openComposed();
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
  own = await create('ada', 'A plan');
  foreign = await create('grace', 'B plan');
  setupAuditRows = h.sqlite.query('SELECT * FROM organization_audit').all();
  setupAuditIds = h.sqlite.query('SELECT id FROM organization_audit').all();
  foreignPlan = await save('grace', foreign, 'Theirs');
});

afterEach(async () => {
  await h.closeComposed();
});

async function create(username: string, name: string): Promise<string> {
  const answer = await h.call(username, 'POST', '/api/projects', {
    name: name + ' project',
    workPackage: { name },
  });
  if (answer.status !== 201) throw new Error(`combined create refused: ${JSON.stringify(answer)}`);
  const body = answer.body;
  if (
    typeof body !== 'object' ||
    body === null ||
    !('project' in body) ||
    typeof body.project !== 'object' ||
    body.project === null ||
    !('id' in body.project) ||
    typeof body.project.id !== 'string' ||
    !('workPackage' in body) ||
    typeof body.workPackage !== 'object' ||
    body.workPackage === null ||
    !('id' in body.workPackage) ||
    typeof body.workPackage.id !== 'string' ||
    !('projectId' in body.workPackage) ||
    body.workPackage.projectId !== body.project.id
  )
    throw new Error('Combined saved-plan fixture birth lacks its correlated parent and package');
  return body.workPackage.id;
}

async function save(username: string, workPackageId: string, name: string): Promise<string> {
  const answer = await h.call(username, 'POST', `/api/work-packages/${workPackageId}/saved-plans`, {
    name,
  });
  if (answer.status !== 201) throw new Error(`save refused: ${JSON.stringify(answer)}`);
  return (answer.body as { savedPlan: { id: string } }).savedPlan.id;
}

/** Every saved-plan and history route addressed at `workPackageId`. */
function workPackageRoutes(workPackageId: string): [string, string, unknown?][] {
  return [
    ['POST', `/api/work-packages/${workPackageId}/saved-plans`, { name: 'Mine now' }],
    ['GET', `/api/work-packages/${workPackageId}/saved-plans`],
    ['GET', `/api/work-packages/${workPackageId}/saved-plans/compare?left=current&right=current`],
    ['GET', `/api/work-packages/${workPackageId}/history`],
  ];
}

/** Every route addressed at one saved plan. */
function planRoutes(savedPlanId: string): [string, string, unknown?][] {
  return [
    ['GET', `/api/saved-plans/${savedPlanId}`],
    ['PATCH', `/api/saved-plans/${savedPlanId}`, { name: 'Mine now' }],
    ['DELETE', `/api/saved-plans/${savedPlanId}`],
  ];
}

/** What B holds, to show a refused call changed none of it. */
async function foreignState(): Promise<Answer[]> {
  return [
    await h.call('grace', 'GET', `/api/work-packages/${foreign}/saved-plans`),
    await h.call('grace', 'GET', `/api/saved-plans/${foreignPlan}`),
  ];
}

describe('after activation', () => {
  it('refuses super-admin save rename and delete recovery of a restricted package', async () => {
    h.member('org-a', 'nell', 'super_admin', ['org-super-admin']);
    h.bind('nell', 'org-a');
    const original = await save('ada', own, 'Original');
    expect(
      (await h.call('ada', 'PATCH', '/api/work-packages/' + own, { restricted: true })).status,
    ).toBe(200);
    const before = h.sqlite.query('SELECT * FROM saved_plan ORDER BY id').all();
    expect(
      (await h.call('nell', 'POST', '/api/work-packages/' + own + '/saved-plans', { name: 'No' }))
        .status,
    ).toBe(403);
    expect(
      (await h.call('nell', 'PATCH', '/api/saved-plans/' + original, { name: 'No' })).status,
    ).toBe(403);
    expect((await h.call('nell', 'DELETE', '/api/saved-plans/' + original)).status).toBe(403);
    expect(h.sqlite.query('SELECT * FROM saved_plan ORDER BY id').all()).toEqual(before);
    expect(h.sqlite.query('SELECT * FROM organization_audit').all()).toEqual(setupAuditRows);
  });

  it('refuses member, admin and viewer writers and leaves creator writes unaudited', async () => {
    const planId = await save('ada', own, 'Original');
    h.member('org-a', 'nell', 'member', ['project-contributor']);
    h.bind('nell', 'org-a');
    expect(
      (await h.call('nell', 'PATCH', `/api/saved-plans/${planId}`, { name: 'No' })).status,
    ).toBe(403);
    expect((await h.call('nell', 'DELETE', `/api/saved-plans/${planId}`)).status).toBe(403);
    expect(
      (await h.call('ada', 'PATCH', `/api/work-packages/${own}`, { restricted: true })).status,
    ).toBe(200);
    h.grant('org-a', 'nell', 'package-viewer', 'work_package', own);
    for (const role of ['member', 'admin'] as const) {
      h.sqlite.run('UPDATE organization_membership SET role = ? WHERE user_id = ?', [
        role,
        h.userId('nell'),
      ]);
      expect(
        (await h.call('nell', 'POST', `/api/work-packages/${own}/saved-plans`, { name: 'No' }))
          .status,
      ).toBe(403);
      expect(
        (await h.call('nell', 'PATCH', `/api/saved-plans/${planId}`, { name: 'No' })).status,
      ).toBe(403);
      expect((await h.call('nell', 'DELETE', `/api/saved-plans/${planId}`)).status).toBe(403);
    }
    const creatorPlan = await save('ada', own, 'Creator');
    expect(
      (await h.call('ada', 'PATCH', `/api/saved-plans/${creatorPlan}`, { name: 'Kept' })).status,
    ).toBe(200);
    expect(h.sqlite.query('SELECT id FROM organization_audit').all()).toEqual(setupAuditIds);
    h.sqlite.run(
      "UPDATE access_grant SET role_id = CASE scope_kind WHEN 'work_package' THEN 'package-viewer' ELSE 'project-viewer' END WHERE subject_kind = 'user' AND subject_id = ?",
      [h.userId('ada')],
    );
    h.sqlite.run("UPDATE organization_membership SET role = 'viewer' WHERE user_id = ?", [
      h.userId('ada'),
    ]);
    expect(
      (await h.call('ada', 'POST', `/api/work-packages/${own}/saved-plans`, { name: 'No' })).status,
    ).toBe(403);
    expect((await h.call('ada', 'DELETE', `/api/saved-plans/${creatorPlan}`)).status).toBe(403);
  });

  it('rolls back granted saved-plan writes when persistence fails', async () => {
    const planId = await save('ada', own, 'Original');
    h.member('org-a', 'nell', 'super_admin', ['org-super-admin']);
    h.bind('nell', 'org-a');
    expect(
      (await h.call('ada', 'PATCH', `/api/work-packages/${own}`, { restricted: true })).status,
    ).toBe(200);
    h.grant('org-a', 'nell', 'package-manager', 'work_package', own);
    const before = h.sqlite.query('SELECT id, name FROM saved_plan ORDER BY id').all();
    const beforeEvents = h.sqlite.query('SELECT * FROM event_log ORDER BY rowid').all();
    h.sqlite.run(
      "CREATE TRIGGER save_refused BEFORE INSERT ON saved_plan BEGIN SELECT RAISE(ABORT, 'save refused'); END",
    );
    h.sqlite.run(
      "CREATE TRIGGER rename_refused BEFORE UPDATE ON saved_plan BEGIN SELECT RAISE(ABORT, 'rename refused'); END",
    );
    h.sqlite.run(
      "CREATE TRIGGER delete_refused BEFORE DELETE ON saved_plan BEGIN SELECT RAISE(ABORT, 'delete refused'); END",
    );
    expect(
      (await h.call('nell', 'POST', `/api/work-packages/${own}/saved-plans`, { name: 'No' }))
        .status,
    ).toBe(500);
    expect(
      (await h.call('nell', 'PATCH', `/api/saved-plans/${planId}`, { name: 'No' })).status,
    ).toBe(500);
    expect((await h.call('nell', 'DELETE', `/api/saved-plans/${planId}`)).status).toBe(500);
    expect(h.sqlite.query('SELECT id, name FROM saved_plan ORDER BY id').all()).toEqual(before);
    expect(h.sqlite.query('SELECT id FROM organization_audit').all()).toEqual(setupAuditIds);
    expect(h.sqlite.query('SELECT * FROM event_log ORDER BY rowid').all()).toEqual(beforeEvents);
  });

  it('refuses a removed super-admin before touching a saved plan', async () => {
    const planId = await save('ada', own, 'Original');
    h.member('org-a', 'nell', 'super_admin', ['org-super-admin']);
    h.bind('nell', 'org-a');
    expect(
      (await h.call('ada', 'PATCH', `/api/work-packages/${own}`, { restricted: true })).status,
    ).toBe(200);
    h.sqlite.run('DELETE FROM organization_membership WHERE user_id = ?', [h.userId('nell')]);
    expect(
      (await h.call('nell', 'POST', `/api/work-packages/${own}/saved-plans`, { name: 'No' }))
        .status,
    ).toBe(403);
    expect(
      (await h.call('nell', 'PATCH', `/api/saved-plans/${planId}`, { name: 'No' })).status,
    ).toBe(403);
    expect(h.sqlite.query('SELECT id FROM organization_audit').all()).toEqual(setupAuditIds);
  });
  it('answers 404 alike for a foreign and an absent work package on every saved-plan and history route', async () => {
    const before = await foreignState();
    const toAbsent = workPackageRoutes('no-such-work-package');
    for (const [index, [method, path, body]] of workPackageRoutes(foreign).entries()) {
      const answer = await h.call('ada', method, path, body);
      const absent = toAbsent.at(index);
      if (absent === undefined) throw new Error('route lists differ');
      expect({ route: `${method} ${path}`, answer }).toEqual({
        route: `${method} ${path}`,
        answer: await h.call('ada', absent[0], absent[1], absent[2]),
      });
      expect(answer.status).toBe(404);
    }
    expect(await foreignState()).toEqual(before);
  });

  it('answers a foreign saved plan exactly as an absent one', async () => {
    const before = await foreignState();
    const toAbsent = planRoutes('no-such-plan');
    for (const [index, [method, path, body]] of planRoutes(foreignPlan).entries()) {
      const answer = await h.call('ada', method, path, body);
      const absent = toAbsent.at(index);
      if (absent === undefined) throw new Error('route lists differ');
      expect({ route: `${method} ${path}`, answer }).toEqual({
        route: `${method} ${path}`,
        answer: await h.call('ada', absent[0], absent[1], absent[2]),
      });
      expect(answer.status).toBe(404);
    }
    expect(await foreignState()).toEqual(before);
  });

  it('refuses a viewer every saved-plan write and lets the viewer read', async () => {
    const mine = await save('ada', own, 'Mine');
    expect(
      (await h.call('vic', 'POST', `/api/work-packages/${own}/saved-plans`, { name: 'Viewer' }))
        .status,
    ).toBe(403);
    expect((await h.call('vic', 'GET', `/api/work-packages/${own}/saved-plans`)).status).toBe(200);
    expect((await h.call('vic', 'GET', `/api/saved-plans/${mine}`)).status).toBe(200);
    expect((await h.call('vic', 'GET', `/api/work-packages/${own}/history`)).status).toBe(200);
    // The plan's own creator, demoted to viewer: the creator rule alone would admit the write.
    h.sqlite.run(
      "UPDATE access_grant SET role_id = CASE scope_kind WHEN 'work_package' THEN 'package-viewer' ELSE 'project-viewer' END WHERE subject_kind = 'user' AND subject_id = ?",
      [h.userId('ada')],
    );
    h.sqlite.run("UPDATE organization_membership SET role = 'viewer' WHERE user_id = ?", [
      h.userId('ada'),
    ]);
    expect(
      await h.call('ada', 'PATCH', `/api/saved-plans/${mine}`, { name: 'Renamed' }),
    ).toMatchObject({
      status: 403,
      body: { error: 'forbidden' },
    });
    expect(await h.call('ada', 'DELETE', `/api/saved-plans/${mine}`)).toMatchObject({
      status: 403,
      body: { error: 'forbidden' },
    });
  });

  it('lets a member save, rename and delete a plan of the own work package', async () => {
    const mine = await save('ada', own, 'Mine');
    expect(
      (await h.call('ada', 'PATCH', `/api/saved-plans/${mine}`, { name: 'Renamed' })).status,
    ).toBe(200);
    expect((await h.call('ada', 'DELETE', `/api/saved-plans/${mine}`)).status).toBe(204);
  });

  it("maps a plan saved after activation to its work package's organization", async () => {
    const mine = await save('ada', own, 'Mine');
    expect(
      h.sqlite
        .query<{ organization_id: string }, [string]>(
          'SELECT organization_id FROM saved_plan_organization WHERE resource_id = ?',
        )
        .get(mine),
    ).toEqual({ organization_id: 'org-a' });
  });

  it('refuses an unbound session and a removed member before any lookup', async () => {
    for (const [method, path, body] of [...workPackageRoutes(own), ...planRoutes(foreignPlan)]) {
      expect({
        route: `${method} ${path}`,
        answer: await h.call('nell', method, path, body),
      }).toEqual({
        route: `${method} ${path}`,
        answer: { status: 403, body: { error: 'no_active_organization' } },
      });
    }
    h.sqlite.run('DELETE FROM organization_membership WHERE user_id = ?', [h.userId('ada')]);
    expect(await h.call('ada', 'GET', `/api/work-packages/${own}/saved-plans`)).toEqual({
      status: 403,
      body: { error: 'not_a_member' },
    });
  });
});
