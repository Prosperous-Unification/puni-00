import { openMemorySourceFixture } from '@wbs/store-memory/source';
import { describe, expect, it } from 'bun:test';

import { servicesOver } from '../../compose';
import { CREATOR_ADMISSION } from '../../ports/edit-admission';
import { LEGACY_ACCESS, type ResourceAccess } from '../../ports/organization-access';
import { recordingBroadcaster } from '../../testing/broadcast-fixture';
import { testClock } from '../../testing/clock-fixture';
import { fastScheduler } from '../../testing/scheduler-fixture';
import { workItemRow } from '../../testing/work-item-fixture';

const F = 'account-f';
const RAM = 'resource-host-ram';
const DISK = 'resource-disk';
/** An admin of the organization owning `host ram` and projects A, B and C. */
const ADMIN: ResourceAccess = {
  kind: 'scoped',
  scope: { organizationId: 'org-a', userId: F, role: 'admin' },
};
const STAMP = { at: 1, by: F };

/**
 * `DirectoryService.setDirectoryCapacityWithin` over the memory twin
 * (`wbs-shared-occupancy` tasks 1.2, 1.3), in one unit of work over the
 * batch's own stores as a command binding drives it: the memory source admits
 * no scoped runner batch (`refuseOutsideScope`); the routes are proven over
 * SQLite in directory-capacity.controller.db.test.ts.
 */
async function seeded() {
  const fixture = openMemorySourceFixture();
  const { source } = fixture;
  const broadcast = recordingBroadcaster();
  const options = {
    admission: CREATOR_ADMISSION,
    clock: testClock,
    broadcast,
    scheduler: fastScheduler,
  };
  const graph = servicesOver(source.stores, options);
  await source.stores.users.create({ id: F, username: F, passwordHash: 'x', createdAt: 1 }, STAMP);
  const projects = [
    (await graph.projects.create('A', F)).project.id,
    (await graph.projects.create('B', F)).project.id,
    (await graph.projects.create('C', F)).project.id,
  ] as const;
  await source.stores.workItems.insert(
    workItemRow({
      id: 'leaf-b',
      projectId: projects[1],
      parentId: null,
      position: 1,
      name: 'Leaf',
    }),
    [],
    STAMP,
  );
  for (const resource of [
    { id: RAM, name: 'host ram', kind: 'divisible' as const, unitLabel: 'GB' },
    { id: DISK, name: 'disk', kind: 'divisible' as const, unitLabel: 'GB' },
  ]) {
    const added = await source.stores.directory.addResource(resource, STAMP);
    if (!added.ok) throw new Error(`resource ${resource.id} was refused`);
  }
  fixture.ownResourceInOrganization(RAM, 'org-a');
  for (const projectId of projects) fixture.ownProjectInOrganization(projectId, 'org-a');
  const state = (resourceId: string, units: number | null, access: ResourceAccess = ADMIN) =>
    source.uow.run(async (scope) => {
      const services = servicesOver(scope.stores, options);
      const outcome = await services.directory.setDirectoryCapacityWithin(
        resourceId,
        F,
        units,
        false,
        access,
      );
      return { commit: outcome.ok, value: outcome };
    });
  return { source, broadcast, projects, state };
}

describe('setDirectoryCapacity on the memory twin', () => {
  it('states and clears a directory capacity with its unit of work', async () => {
    const { source, state } = await seeded();
    try {
      expect(await state(RAM, 16)).toEqual({ ok: true, value: null });
      expect(await source.stores.directory.directoryCapacitiesOf([RAM])).toEqual([
        { resourceId: RAM, units: 16 },
      ]);
      expect(await state(RAM, null)).toEqual({ ok: true, value: null });
      expect(await source.stores.directory.directoryCapacitiesOf([RAM])).toEqual([]);
    } finally {
      await source.close();
    }
  });

  it('refuses legacy access organization_required, writing nothing', async () => {
    const { source, state } = await seeded();
    try {
      expect(await state(RAM, 16, LEGACY_ACCESS)).toEqual({
        ok: false,
        reason: 'organization_required',
      });
      expect(await source.stores.directory.directoryCapacitiesOf([RAM])).toEqual([]);
    } finally {
      await source.close();
    }
  });

  it('refuses a resource the organization does not hold not_found, writing nothing', async () => {
    const { source, state } = await seeded();
    try {
      expect(await state(DISK, 4)).toEqual({ ok: false, reason: 'not_found' });
      expect(await source.stores.directory.directoryCapacitiesOf([DISK])).toEqual([]);
    } finally {
      await source.close();
    }
  });

  // Proof: with the announce skipped in `setDirectoryCapacityWithin`, this
  // case found no `directory_changed` for A or B; watched 2026-10-25.
  it('announces directory_changed to every project that states or demands the resource', async () => {
    const { source, broadcast, projects, state } = await seeded();
    try {
      const stated = await source.stores.resourceCapacity.set(projects[0], RAM, 32, STAMP);
      if (!stated.ok) throw new Error('the capacity was refused');
      expect(await source.stores.demands.set('leaf-b', RAM, 4, STAMP)).toBe('written');
      broadcast.published.length = 0;
      expect(await state(RAM, 16)).toEqual({ ok: true, value: null });
      const told = broadcast.published
        .filter(({ event }) => event.type === 'directory_changed')
        .map(({ projectId }) => projectId)
        .sort();
      expect(told).toEqual([projects[0], projects[1]].sort());
    } finally {
      await source.close();
    }
  });
});
