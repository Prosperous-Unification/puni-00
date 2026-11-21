import { expect, test } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

const PERSON = 'a3000000-0000-4000-8000-000000000001';
const TEAM = 'a3000000-0000-4000-8000-000000000002';
const FOREIGN_PERSON = 'a3000000-0000-4000-8000-000000000003';
const FOREIGN_TEAM = 'a3000000-0000-4000-8000-000000000004';
const FOREIGN_SPACE = 'a3000000-0000-4000-8000-000000000005';

async function withinFixture(
  use: (harness: OrganizationHarness, spaceId: string, workPackageId: string) => Promise<void>,
  onBorrowedUnitOfWork?: () => void,
) {
  const harness = OrganizationHarness.openComposedWith({
    now: () => 100,
    withOptimizer: true,
    onBorrowedUnitOfWork,
  });
  try {
    for (const username of ['admin', 'viewer', 'outsider']) await harness.register(username);
    for (const id of ['membership-org', 'membership-foreign']) harness.organization(id);
    harness.member('membership-org', 'admin', 'member', ['org-admin']);
    harness.member('membership-org', 'viewer', 'viewer', ['org-viewer']);
    for (const username of ['admin', 'viewer', 'outsider'])
      harness.bind(username, 'membership-org');
    harness.activate();
    for (const [id, organization] of [
      [PERSON, 'membership-org'],
      [FOREIGN_PERSON, 'membership-foreign'],
    ] as const) {
      harness.sqlite.run('INSERT INTO person(id,name) VALUES(?,?)', [id, id]);
      harness.sqlite.run(
        'INSERT INTO person_organization(resource_id,organization_id,name) VALUES(?,?,?)',
        [id, organization, id],
      );
    }
    for (const [id, organization] of [
      [TEAM, 'membership-org'],
      [FOREIGN_TEAM, 'membership-foreign'],
    ] as const) {
      harness.sqlite.run('INSERT INTO service_team(id,name) VALUES(?,?)', [id, id]);
      harness.sqlite.run(
        'INSERT INTO service_team_organization(resource_id,organization_id,name) VALUES(?,?,?)',
        [id, organization, id],
      );
    }
    harness.sqlite.run(
      'INSERT INTO space(id,organization_id,name,revision,created_at,created_by) VALUES(?,?,?,0,100,?)',
      [FOREIGN_SPACE, 'membership-foreign', 'Foreign', harness.userId('admin')],
    );
    const made = await harness.call('admin', 'POST', '/api/spaces', { name: 'Department' });
    expect(made.status).toBe(201);
    const spaceId = (made.body as { space: { id: string } }).space.id;
    const project = await harness.call('admin', 'POST', '/api/projects', {
      name: 'Engagement',
      workPackage: { name: 'Package' },
    });
    expect(project.status).toBe(201);
    const workPackageId = (project.body as { workPackage: { id: string } }).workPackage.id;
    await use(harness, spaceId, workPackageId);
  } finally {
    await harness.closeComposed();
  }
}

function protectedState(harness: OrganizationHarness) {
  return [
    'access_grant',
    'organization_audit',
    'work_package',
    'work_package_step',
    'setting_value',
    'command_journal',
    'plan_event',
    'event_log',
    'event_sequencer',
    'work_package_team_capacity',
    'assignment',
  ].map((table) => ({
    table,
    rows: harness.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all(),
  }));
}

async function read(harness: OrganizationHarness, spaceId: string) {
  const answer = await harness.call('viewer', 'GET', '/api/spaces/' + spaceId);
  expect(answer.status).toBe(200);
  return answer.body;
}

test('space person and service-team memberships are idempotent and change no package authority or scheduling', async () => {
  await withinFixture(async (harness, spaceId, workPackageId) => {
    const before = protectedState(harness);
    const hash = await harness.optimizationHash(workPackageId);
    expect(await read(harness, spaceId)).toMatchObject({
      space: { revision: 0 },
      personIds: [],
      serviceTeamIds: [],
    });
    for (const [kind, id, revision] of [
      ['people', PERSON, 1],
      ['teams', TEAM, 2],
    ] as const) {
      const path = `/api/spaces/${spaceId}/${kind}/${id}`;
      expect(await harness.call('admin', 'POST', path)).toEqual({ status: 204, body: null });
      expect(await read(harness, spaceId)).toMatchObject({ space: { revision } });
      expect(await harness.call('admin', 'POST', path)).toEqual({ status: 204, body: null });
      expect(await read(harness, spaceId)).toMatchObject({ space: { revision } });
      expect(protectedState(harness)).toEqual(before);
      expect(await harness.optimizationHash(workPackageId)).toBe(hash);
    }
    expect(await read(harness, spaceId)).toMatchObject({
      personIds: [PERSON],
      serviceTeamIds: [TEAM],
    });
    for (const [kind, id, revision] of [
      ['people', PERSON, 3],
      ['teams', TEAM, 4],
    ] as const) {
      const path = `/api/spaces/${spaceId}/${kind}/${id}`;
      expect(await harness.call('admin', 'DELETE', path)).toEqual({ status: 204, body: null });
      expect(await read(harness, spaceId)).toMatchObject({ space: { revision } });
      expect(await harness.call('admin', 'DELETE', path)).toEqual({
        status: 404,
        body: { error: 'not_found' },
      });
    }
    expect(await read(harness, spaceId)).toMatchObject({ personIds: [], serviceTeamIds: [] });
    expect(protectedState(harness)).toEqual(before);
    expect(await harness.optimizationHash(workPackageId)).toBe(hash);
    expect(await read(harness, 'all')).toMatchObject({ personIds: [], serviceTeamIds: [] });
  });
}, 60000);

test('space memberships conceal foreign and wrong-kind identities and require actual write permission', async () => {
  await withinFixture(async (harness, spaceId) => {
    const before = protectedState(harness);
    for (const [kind, own, foreign, wrong] of [
      ['people', PERSON, FOREIGN_PERSON, TEAM],
      ['teams', TEAM, FOREIGN_TEAM, PERSON],
    ] as const) {
      for (const id of [foreign, wrong, 'missing'])
        for (const method of ['POST', 'DELETE'])
          expect(
            await harness.call('admin', method, `/api/spaces/${spaceId}/${kind}/${id}`),
          ).toEqual({ status: 404, body: { error: 'not_found' } });
      for (const method of ['POST', 'DELETE']) {
        expect(
          await harness.call('admin', method, `/api/spaces/${FOREIGN_SPACE}/${kind}/${own}`),
        ).toEqual({ status: 404, body: { error: 'not_found' } });
        expect(
          await harness.call('viewer', method, `/api/spaces/${spaceId}/${kind}/${own}`),
        ).toEqual({
          status: 403,
          body: { error: 'forbidden', permission: 'organization.manage_spaces' },
        });
        expect(
          await harness.call('outsider', method, `/api/spaces/${spaceId}/${kind}/${own}`),
        ).toMatchObject({ status: 403, body: { error: 'not_a_member' } });
        expect(await harness.call('admin', method, `/api/spaces/all/${kind}/${own}`)).toEqual({
          status: 409,
          body: { error: 'virtual_space' },
        });
      }
    }
    expect(await read(harness, spaceId)).toMatchObject({
      space: { revision: 0 },
      personIds: [],
      serviceTeamIds: [],
    });
    expect(protectedState(harness)).toEqual(before);
  });
}, 60000);

test('space membership writes refuse bodies and query strings before changing membership', async () => {
  await withinFixture(async (harness, spaceId) => {
    for (const [kind, id] of [
      ['people', PERSON],
      ['teams', TEAM],
    ] as const)
      for (const method of ['POST', 'DELETE']) {
        const path = `/api/spaces/${spaceId}/${kind}/${id}`;
        expect(await harness.call('admin', method, path, {})).toMatchObject({
          status: 400,
          body: { error: 'invalid_body' },
        });
        expect(await harness.call('admin', method, path + '?ignored=1')).toMatchObject({
          status: 400,
          body: { error: 'invalid_query' },
        });
      }
    expect(await read(harness, spaceId)).toMatchObject({
      space: { revision: 0 },
      personIds: [],
      serviceTeamIds: [],
    });
  });
}, 60000);

test('people and service teams can belong to two spaces and survive deletion of one space', async () => {
  await withinFixture(async (harness, spaceId) => {
    const made = await harness.call('admin', 'POST', '/api/spaces', { name: 'Second department' });
    expect(made.status).toBe(201);
    const second = (made.body as { space: { id: string } }).space.id;
    for (const id of [spaceId, second])
      for (const [kind, memberId] of [
        ['people', PERSON],
        ['teams', TEAM],
      ] as const)
        expect(
          await harness.call('admin', 'POST', `/api/spaces/${id}/${kind}/${memberId}`),
        ).toEqual({ status: 204, body: null });
    expect(await harness.call('admin', 'DELETE', '/api/spaces/' + spaceId)).toEqual({
      status: 204,
      body: null,
    });
    expect(await read(harness, second)).toMatchObject({
      personIds: [PERSON],
      serviceTeamIds: [TEAM],
    });
    expect(harness.sqlite.query('SELECT id FROM person WHERE id=?').all(PERSON)).toEqual([
      { id: PERSON },
    ]);
    expect(harness.sqlite.query('SELECT id FROM service_team WHERE id=?').all(TEAM)).toEqual([
      { id: TEAM },
    ]);
  });
}, 60000);

test('native space revision failure rolls back a new membership without effects', async () => {
  await withinFixture(async (harness, spaceId) => {
    harness.sqlite.run(
      'CREATE TRIGGER refuse_membership_revision BEFORE UPDATE ON space BEGIN SELECT RAISE(IGNORE); END',
    );
    const before = protectedState(harness);
    expect(
      (await harness.call('admin', 'POST', `/api/spaces/${spaceId}/people/${PERSON}`)).status,
    ).toBe(500);
    expect(harness.sqlite.query('SELECT * FROM space_person').all()).toEqual([]);
    expect(await read(harness, spaceId)).toMatchObject({
      space: { revision: 0 },
      personIds: [],
      serviceTeamIds: [],
    });
    expect(protectedState(harness)).toEqual(before);
    harness.sqlite.run('DROP TRIGGER refuse_membership_revision');
  });
}, 60000);

test('queued space membership rechecks a revoked manage-spaces grant before writing', async () => {
  const queued = Promise.withResolvers<undefined>();
  let isArmed = false;
  await withinFixture(
    async (harness, spaceId) => {
      const entered = Promise.withResolvers<undefined>(),
        released = Promise.withResolvers<undefined>();
      const held = harness.holdWriteTurn(released.promise, () => {
        entered.resolve(undefined);
      });
      await entered.promise;
      try {
        isArmed = true;
        const pending = harness.call('admin', 'POST', `/api/spaces/${spaceId}/people/${PERSON}`);
        await queued.promise;
        isArmed = false;
        expect(
          harness.sqlite.run('DELETE FROM access_grant WHERE subject_id=?', [
            harness.userId('admin'),
          ]).changes,
        ).toBeGreaterThan(0);
        const before = protectedState(harness);
        released.resolve(undefined);
        await held;
        expect(await pending).toEqual({
          status: 403,
          body: { error: 'forbidden', permission: 'organization.manage_spaces' },
        });
        expect(await read(harness, spaceId)).toMatchObject({
          space: { revision: 0 },
          personIds: [],
        });
        expect(protectedState(harness)).toEqual(before);
      } finally {
        released.resolve(undefined);
        await held;
      }
    },
    () => {
      if (isArmed) queued.resolve(undefined);
    },
  );
}, 60000);
