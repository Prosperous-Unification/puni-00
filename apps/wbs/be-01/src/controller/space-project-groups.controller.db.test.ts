import { openReadOnlyConnection } from '@wbs/store-sqlite/db';
import { expect, test } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

test('mounted space read returns real project groups including an empty project without flat package rows', async () => {
  const harness = OrganizationHarness.openComposed();
  try {
    await harness.register('manager');
    harness.organization('space-groups-org');
    harness.member('space-groups-org', 'manager', 'member', ['org-admin']);
    harness.bind('manager', 'space-groups-org');
    harness.activate();
    const madeSpace = await harness.call('manager', 'POST', '/api/spaces', { name: 'Department' });
    expect(madeSpace.status).toBe(201);
    const spaceId = (madeSpace.body as { space: { id: string } }).space.id;
    for (const name of ['Engagement', 'Empty engagement']) {
      const made = await harness.call('manager', 'POST', '/api/projects', {
        name,
        ...(name === 'Engagement' ? { workPackage: { name: 'Delivery' } } : {}),
      });
      expect(made.status).toBe(201);
      const projectId = (made.body as { project: { id: string } }).project.id;
      expect(
        (await harness.call('manager', 'POST', `/api/spaces/${spaceId}/projects`, { projectId }))
          .status,
      ).toBe(201);
    }
    const observed = await harness.call('manager', 'GET', `/api/spaces/${spaceId}`);
    expect(observed.status).toBe(200);
    expect(observed.body).toMatchObject({
      space: { id: spaceId, projectCount: 2, workPackageCount: 1 },
      writable: true,
      personIds: [],
      serviceTeamIds: [],
      projects: [
        { project: { name: 'Empty engagement' }, workPackages: [] },
        { project: { name: 'Engagement' }, workPackages: [{ name: 'Delivery' }] },
      ],
    });
    expect(observed.body).not.toHaveProperty('rows');
  } finally {
    await harness.closeComposed();
  }
}, 60000);

test('mounted grouped reads expose exact package-only parent names and no hidden child or empty-project placeholder', async () => {
  const harness = OrganizationHarness.openComposed();
  try {
    for (const name of ['manager', 'limited']) await harness.register(name);
    harness.organization('space-groups-org');
    harness.member('space-groups-org', 'manager', 'member', ['org-admin']);
    harness.member('space-groups-org', 'limited', 'member', []);
    for (const name of ['manager', 'limited']) harness.bind(name, 'space-groups-org');
    harness.activate();
    const madeSpace = await harness.call('manager', 'POST', '/api/spaces', { name: 'Department' });
    const spaceId = (madeSpace.body as { space: { id: string } }).space.id;
    const made = await harness.call('manager', 'POST', '/api/projects', {
      name: 'Engagement',
      workPackage: { name: 'Readable delivery' },
    });
    expect(made.status).toBe(201);
    const first = made.body as { project: { id: string }; workPackage: { id: string } };
    const hidden = await harness.call('manager', 'POST', '/api/work-packages', {
      projectId: first.project.id,
      name: 'Hidden delivery',
    });
    expect(hidden.status).toBe(200);
    const empty = await harness.call('manager', 'POST', '/api/projects', {
      name: 'Empty engagement',
    });
    expect(empty.status).toBe(201);
    for (const projectId of [
      first.project.id,
      (empty.body as { project: { id: string } }).project.id,
    ])
      expect(
        (await harness.call('manager', 'POST', `/api/spaces/${spaceId}/projects`, { projectId }))
          .status,
      ).toBe(201);
    harness.grant(
      'space-groups-org',
      'limited',
      'package-viewer',
      'work_package',
      first.workPackage.id,
    );
    const observed = await harness.call('limited', 'GET', `/api/spaces/${spaceId}`);
    expect(observed.status).toBe(200);
    expect(observed.body).toMatchObject({
      writable: false,
      space: { projectCount: 1, workPackageCount: 1 },
    });
    const groups = (
      observed.body as { projects: { project: unknown; workPackages: { id: string }[] }[] }
    ).projects;
    expect(groups).toHaveLength(1);
    expect(groups[0]?.project).toEqual({ id: first.project.id, name: 'Engagement' });
    expect(groups[0]?.workPackages.map((child) => child.id)).toEqual([first.workPackage.id]);
    expect(JSON.stringify(observed.body)).not.toContain('Hidden delivery');
    expect(JSON.stringify(observed.body)).not.toContain('Empty engagement');
    expect(await harness.call('limited', 'GET', `/api/projects/${first.project.id}`)).toMatchObject(
      { status: 403, body: { error: 'forbidden', permission: 'project.read' } },
    );
    const all = await harness.call('limited', 'GET', '/api/spaces/all');
    expect(all).toMatchObject({
      status: 200,
      body: {
        writable: false,
        space: { name: 'All projects', projectCount: 1, workPackageCount: 1 },
      },
    });
  } finally {
    await harness.closeComposed();
  }
}, 60000);

test('mounted space read forwards the Source resolver refusal when membership disappears after initial resolution', async () => {
  let revoke: (() => void) | undefined;
  const harness = OrganizationHarness.openComposedWith({
    openReadOnlyConnection: (path) => {
      const connection = openReadOnlyConnection(path);
      return {
        get db() {
          if (revoke !== undefined) {
            const remove = revoke;
            revoke = undefined;
            remove();
          }
          return connection.db;
        },
        close() {
          connection.close();
        },
      };
    },
  });
  try {
    await harness.register('manager');
    harness.organization('space-groups-org');
    harness.member('space-groups-org', 'manager', 'member', ['org-admin']);
    harness.bind('manager', 'space-groups-org');
    harness.activate();
    const made = await harness.call('manager', 'POST', '/api/spaces', { name: 'Department' });
    expect(made.status).toBe(201);
    const spaceId = (made.body as { space: { id: string } }).space.id;
    revoke = () => {
      harness.sqlite.run(
        'DELETE FROM organization_membership WHERE organization_id=? AND user_id=?',
        ['space-groups-org', harness.userId('manager')],
      );
    };
    expect(await harness.call('manager', 'GET', `/api/spaces/${spaceId}`)).toMatchObject({
      status: 403,
      body: { error: 'not_a_member' },
    });
    expect(
      harness.sqlite
        .query('SELECT user_id FROM organization_membership WHERE organization_id=?')
        .all('space-groups-org'),
    ).toEqual([]);
  } finally {
    await harness.closeComposed();
  }
}, 60000);
