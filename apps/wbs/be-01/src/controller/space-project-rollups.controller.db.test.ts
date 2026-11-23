import { expect, test } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

async function withinProjects(
  use: (fixture: {
    harness: OrganizationHarness;
    spaceId: string;
    projectId: string;
    emptyId: string;
    firstId: string;
    secondId: string;
  }) => Promise<void>,
) {
  const harness = OrganizationHarness.openComposed();
  try {
    for (const name of ['manager', 'limited']) await harness.register(name);
    harness.organization('project-rollup-org');
    harness.member('project-rollup-org', 'manager', 'member', ['org-admin']);
    harness.member('project-rollup-org', 'limited', 'member', []);
    for (const name of ['manager', 'limited']) harness.bind(name, 'project-rollup-org');
    harness.activate();
    const madeSpace = await harness.call('manager', 'POST', '/api/spaces', { name: 'Department' });
    expect(madeSpace.status).toBe(201);
    const spaceId = (madeSpace.body as { space: { id: string } }).space.id;
    const made = await harness.call('manager', 'POST', '/api/projects', {
      name: 'Engagement',
      workPackage: { name: 'Delivery' },
    });
    expect(made.status).toBe(201);
    const first = made.body as { project: { id: string }; workPackage: { id: string } };
    const second = await harness.call('manager', 'POST', '/api/work-packages', {
      projectId: first.project.id,
      name: 'Hidden delivery',
    });
    expect(second.status).toBe(200);
    const empty = await harness.call('manager', 'POST', '/api/projects', {
      name: 'Empty engagement',
    });
    expect(empty.status).toBe(201);
    const emptyId = (empty.body as { project: { id: string } }).project.id;
    for (const projectId of [emptyId, first.project.id])
      expect(
        (await harness.call('manager', 'POST', `/api/spaces/${spaceId}/projects`, { projectId }))
          .status,
      ).toBe(201);
    await use({
      harness,
      spaceId,
      projectId: first.project.id,
      emptyId,
      firstId: first.workPackage.id,
      secondId: (second.body as { workPackage: { id: string } }).workPackage.id,
    });
  } finally {
    await harness.closeComposed();
  }
}

test(
  'mounted project rollups include coherent child DTOs and an explicit empty project',
  () =>
    withinProjects(async ({ harness, spaceId, projectId, emptyId, firstId, secondId }) => {
      const observed = await harness.call(
        'manager',
        'GET',
        `/api/spaces/${spaceId}/roll-ups?projectIds=${projectId},${emptyId}`,
      );
      expect(observed.status).toBe(200);
      expect(observed.body).toMatchObject({
        projects: [
          {
            project: { id: projectId, name: 'Engagement' },
            rollUp: { kind: 'rolled_up', finalTotal: 0, counts: { leaves: 0 } },
            workPackages: [
              {
                workPackage: { id: firstId, name: 'Delivery', projectId },
                rollUp: { kind: 'rolled_up', finalTotal: 0 },
              },
              {
                workPackage: { id: secondId, name: 'Hidden delivery', projectId },
                rollUp: { kind: 'rolled_up', finalTotal: 0 },
              },
            ],
          },
          {
            project: { id: emptyId, name: 'Empty engagement' },
            rollUp: { kind: 'empty' },
            workPackages: [],
          },
        ],
      });
      expect(observed.body).not.toHaveProperty('rollUps');
    }),
  60000,
);

test(
  'project rollup HTTP bounds distinct project IDs and refuses the retired package query even when mixed',
  () =>
    withinProjects(async ({ harness, spaceId, projectId, firstId }) => {
      for (const query of [
        '',
        'projectIds=',
        'projectIds=,,,',
        `projectIds=${Array.from({ length: 51 }, (_, at) => 'missing-' + String(at)).join(',')}`,
        `workPackageIds=${firstId}`,
        `projectIds=${projectId}&workPackageIds=${firstId}`,
      ])
        expect(
          await harness.call('manager', 'GET', `/api/spaces/${spaceId}/roll-ups?${query}`),
        ).toMatchObject({ status: 400, body: { error: 'invalid_query' } });
      expect(
        (
          await harness.call(
            'manager',
            'GET',
            `/api/spaces/${spaceId}/roll-ups?projectIds=${Array.from({ length: 51 }, () => projectId).join(',')}`,
          )
        ).status,
      ).toBe(200);
      expect(
        await harness.call(
          'manager',
          'GET',
          `/api/spaces/${spaceId}/roll-ups?projectIds=${projectId},missing`,
        ),
      ).toMatchObject({ status: 404, body: { error: 'not_found' } });
    }),
  60000,
);

test(
  'mounted project figures expose only readable child DTOs with exact package-only parent identity',
  () =>
    withinProjects(async ({ harness, spaceId, projectId, emptyId, firstId }) => {
      harness.grant('project-rollup-org', 'limited', 'package-viewer', 'work_package', firstId);
      const observed = await harness.call(
        'limited',
        'GET',
        `/api/spaces/${spaceId}/roll-ups?projectIds=${projectId}`,
      );
      expect(observed).toMatchObject({
        status: 200,
        body: {
          projects: [
            {
              project: { id: projectId, name: 'Engagement' },
              workPackages: [{ workPackage: { id: firstId, name: 'Delivery' } }],
            },
          ],
        },
      });
      const groups = (
        observed.body as { projects: { project: unknown; workPackages: unknown[] }[] }
      ).projects;
      expect(groups[0]?.project).toEqual({ id: projectId, name: 'Engagement' });
      expect(groups[0]?.workPackages).toHaveLength(1);
      expect(JSON.stringify(observed.body)).not.toContain('Hidden delivery');
      expect(
        await harness.call(
          'limited',
          'GET',
          `/api/spaces/${spaceId}/roll-ups?projectIds=${projectId},${emptyId}`,
        ),
      ).toMatchObject({ status: 404, body: { error: 'not_found' } });
    }),
  60000,
);
