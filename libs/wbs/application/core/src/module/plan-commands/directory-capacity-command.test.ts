import { openMemorySourceFixture } from '@wbs/store-memory/source';
import { describe, expect, it } from 'bun:test';

import { servicesOver } from '../../compose';
import { CREATOR_ADMISSION } from '../../ports/edit-admission';
import type { Scope } from '../../ports/unit-of-work';
import { recordingBroadcaster } from '../../testing/broadcast-fixture';
import { testClock } from '../../testing/clock-fixture';
import { fastScheduler } from '../../testing/scheduler-fixture';
import { workItemRow } from '../../testing/work-item-fixture';
import { createPlanCommandRunner } from './composition';

const F = 'account-f';

/**
 * `setDirectoryCapacity` through the batch runner over the memory twin
 * (`wbs-shared-occupancy` tasks 1.2, 1.3): the write commits with its batch,
 * a resource no organization owns is refused, and every project that states
 * or demands the resource is told `directory_changed`.
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
  await source.stores.users.create(
    { id: F, username: F, passwordHash: 'x', createdAt: 1 },
    { at: 1, by: F },
  );
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
    { at: 1, by: F },
  );
  const runner = createPlanCommandRunner({
    uow: source.uow,
    announcements: broadcast,
    publicServices: graph,
    batchServices: (scope: Scope, announcements) =>
      servicesOver(scope.stores, { ...options, broadcast: announcements }),
  });
  const declared = await runner.runDirectory(F, [
    {
      kind: 'createResource',
      ref: 'ram',
      name: 'host ram',
      resourceKind: 'divisible',
      unitLabel: 'GB',
    },
    {
      kind: 'createResource',
      ref: 'disk',
      name: 'disk',
      resourceKind: 'divisible',
      unitLabel: 'GB',
    },
  ]);
  if (!declared.ok) throw new Error(`resources were refused: ${declared.reason}`);
  const [ram, disk] = declared.results.map(({ id }) => id ?? '');
  fixture.ownResourceInOrganization(ram, 'org-a');
  return { source, broadcast, runner, projects, ram, disk };
}

describe('setDirectoryCapacity on the memory twin', () => {
  it('states and clears a directory capacity with its batch', async () => {
    const { source, runner, ram } = await seeded();
    try {
      expect(
        await runner.runDirectory(F, [
          { kind: 'setDirectoryCapacity', resourceId: ram, units: 16 },
        ]),
      ).toMatchObject({ ok: true, results: [{ index: 0, kind: 'setDirectoryCapacity' }] });
      expect(await source.stores.directory.directoryCapacitiesOf([ram])).toEqual([
        { resourceId: ram, units: 16 },
      ]);
      expect(
        await runner.runDirectory(F, [
          { kind: 'setDirectoryCapacity', resourceId: ram, units: null },
        ]),
      ).toMatchObject({ ok: true });
      expect(await source.stores.directory.directoryCapacitiesOf([ram])).toEqual([]);
    } finally {
      await source.close();
    }
  });

  it('refuses a resource no organization owns organization_required, writing nothing', async () => {
    const { source, runner, disk } = await seeded();
    try {
      expect(
        await runner.runDirectory(F, [
          { kind: 'setDirectoryCapacity', resourceId: disk, units: 4 },
        ]),
      ).toMatchObject({ ok: false, at: 0, reason: 'organization_required' });
      expect(await source.stores.directory.directoryCapacitiesOf([disk])).toEqual([]);
    } finally {
      await source.close();
    }
  });

  // Proof: with the announce skipped in `setDirectoryCapacityWithin`, this
  // case found no `directory_changed` for A or B; watched 2026-10-25.
  it('announces directory_changed to every project that states or demands the resource', async () => {
    const { source, broadcast, runner, projects, ram } = await seeded();
    try {
      expect(
        await runner.run(projects[0], F, [
          { kind: 'setResourceCapacity', resourceId: ram, units: 32 },
        ]),
      ).toMatchObject({ ok: true });
      expect(
        await runner.run(projects[1], F, [
          { kind: 'setDemand', workItemId: 'leaf-b', resourceId: ram, units: 4 },
        ]),
      ).toMatchObject({ ok: true });
      broadcast.published.length = 0;
      expect(
        await runner.runDirectory(F, [
          { kind: 'setDirectoryCapacity', resourceId: ram, units: 16 },
        ]),
      ).toMatchObject({ ok: true });
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
