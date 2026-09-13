import { openMemorySource } from '@wbs/store-memory';
import { describe, expect, it } from 'bun:test';

import { servicesOver } from '../compose';
import type { PlanTransactionalStores } from '../ports/stores';
import { testClock } from '../testing/clock-fixture';
import { fastScheduler } from '../testing/scheduler-fixture';
import type { Broadcaster } from './broadcast';
import { PlanCommandRunner } from './plan-commands';

const OWNER = 'plan-command-owner';

function silentBroadcaster(): Broadcaster {
  return {
    publish: () => Promise.resolve(),
    latestSeq: () => Promise.resolve(-1),
  };
}

describe('working plan command before-images', () => {
  it('two patches undo to the value before the batch', async () => {
    const source = openMemorySource();
    const direct = silentBroadcaster();
    const compose = (stores: PlanTransactionalStores, broadcast: Broadcaster) =>
      servicesOver(stores, { clock: testClock, broadcast, scheduler: fastScheduler });
    const publicGraph = compose(source.stores, direct);

    try {
      await source.stores.users.create(
        { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 },
        { at: 1, by: OWNER },
      );
      const projectId = (await publicGraph.projects.create('Detached before-images', OWNER)).project
        .id;
      const created = await publicGraph.workItems.create(projectId, OWNER, {
        parentId: null,
        afterId: null,
        name: 'Before batch',
      });
      if (!created.ok) throw new Error('before-image fixture creation refused');
      const originalTag = await publicGraph.directory.addTag(OWNER, 'Original tag');
      const firstTag = await publicGraph.directory.addTag(OWNER, 'First patch tag');
      const secondTag = await publicGraph.directory.addTag(OWNER, 'Second patch tag');
      if (originalTag === null || firstTag === null || secondTag === null) {
        throw new Error('before-image fixture tag creation refused');
      }
      const seeded = await publicGraph.workItems.patch(created.value.id, OWNER, {
        tagIds: [originalTag.id],
      });
      if (!seeded.ok) throw new Error('before-image fixture labelling refused');

      const observedTagSets: string[][] = [];
      const runner = new PlanCommandRunner({
        uow: source.uow,
        announcements: direct,
        publicServices: publicGraph,
        batchServices(scope, broadcast, workingPlan) {
          if (workingPlan === undefined) return compose(scope.stores, broadcast);
          const borrowedRows = workingPlan.stores.workItems.listByProject(projectId);
          let didMutateBorrowedBefore = false;
          const workItems = {
            ...workingPlan.stores.workItems,
            listByProject: async (requestedProjectId: string) => {
              if (!didMutateBorrowedBefore) {
                const borrowed = (await borrowedRows).find(({ id }) => id === created.value.id);
                if (borrowed === undefined) throw new Error('working plan omitted the fixture row');
                borrowed.name = 'Mutated cached name';
                // This test models a hostile caller mutating a readonly answer at runtime.
                (borrowed.tagIds as string[]).splice(0, borrowed.tagIds.length, secondTag.id);
                didMutateBorrowedBefore = true;
              }
              return workingPlan.stores.workItems.listByProject(requestedProjectId);
            },
            patch: async (
              ...parameters: Parameters<PlanTransactionalStores['workItems']['patch']>
            ) => {
              const written = await workingPlan.stores.workItems.patch(...parameters);
              if (written.ok) {
                const refreshed = await workingPlan.stores.workItems.listByIds(projectId, [
                  parameters[0],
                ]);
                const row = refreshed.at(0);
                if (row === undefined) throw new Error('targeted refresh omitted the patched row');
                observedTagSets.push([...row.tagIds]);
              }
              return written;
            },
          };
          const stores: PlanTransactionalStores = { ...workingPlan.stores, workItems };
          return compose(stores, broadcast);
        },
      });

      const patched = await runner.run(projectId, OWNER, [
        {
          kind: 'patchWorkItem',
          workItemId: created.value.id,
          patch: { name: 'First patch', tagIds: [firstTag.id] },
        },
        {
          kind: 'patchWorkItem',
          workItemId: created.value.id,
          patch: { name: 'Second patch', tagIds: [secondTag.id] },
        },
      ]);
      expect(patched.ok).toBe(true);
      // Proof: omitting the label joins from the authoritative targeted reader
      // made this production batch observe [] after each patch, before the next command.
      expect(observedTagSets).toEqual([[firstTag.id], [secondTag.id]]);
      expect(await source.stores.workItems.listByIds(projectId, [created.value.id])).toMatchObject([
        { name: 'Second patch', tagIds: [secondTag.id] },
      ]);

      expect(await runner.undo(projectId, OWNER)).toMatchObject({ ok: true });
      // Proof: returning the retained cache object directly lets the deliberate
      // mutation above alter the first patch's before-image; undo then restores
      // `Mutated cached name` and the second tag instead of these original values.
      expect(await source.stores.workItems.listByIds(projectId, [created.value.id])).toMatchObject([
        { name: 'Before batch', tagIds: [originalTag.id] },
      ]);
    } finally {
      await source.close();
    }
  });
});
