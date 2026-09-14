import { openMemorySource } from '@wbs/store-memory';
import { describe, expect, it } from 'bun:test';

import { servicesOver } from '../compose';
import type { PlanTransactionalStores } from '../ports/stores';
import { testClock } from '../testing/clock-fixture';
import { fastScheduler } from '../testing/scheduler-fixture';
import { workItemRow } from '../testing/work-item-fixture';
import type { Broadcaster } from './broadcast';
import { PlanCommandRunner } from './plan-commands';
import { createWorkingPlan } from './working-plan';

const OWNER = 'working-plan-owner';
const DAYS = { optimistic: 1, realistic: 2, pessimistic: 3 } as const;

function silentBroadcaster(): Broadcaster {
  return {
    publish: () => Promise.resolve(),
    latestSeq: () => Promise.resolve(-1),
  };
}

describe('the uncached admitted batch baseline', () => {
  it('preserves the four mutation sequences before a working collection is introduced', async () => {
    const source = openMemorySource();
    const admitted: PlanTransactionalStores[] = [];
    const direct = silentBroadcaster();
    const compose = (stores: PlanTransactionalStores, broadcast: Broadcaster) =>
      servicesOver(stores, { clock: testClock, broadcast, scheduler: fastScheduler });
    const publicGraph = compose(source.stores, direct);
    const runner = new PlanCommandRunner({
      uow: source.uow,
      announcements: direct,
      publicServices: publicGraph,
      batchServices(scope, broadcast) {
        admitted.push(scope.stores);
        return compose(scope.stores, broadcast);
      },
    });

    try {
      await source.stores.users.create(
        { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 },
        { at: 1, by: OWNER },
      );
      const createdProject = await publicGraph.projects.create('Working baseline', OWNER);
      const projectId = createdProject.project.id;
      const stepId = createdProject.steps[0].id;

      const createdAndEstimated = await runner.run(projectId, OWNER, [
        {
          kind: 'createWorkItem',
          ref: 'estimated',
          parentId: null,
          afterId: null,
          name: 'Estimated',
        },
        { kind: 'setEstimate', workItemRef: 'estimated', stepId, days: DAYS },
      ]);
      expect(createdAndEstimated.ok).toBe(true);
      const estimatedId = createdAndEstimated.ok ? createdAndEstimated.results[0]?.id : undefined;
      if (estimatedId === undefined) throw new Error('create→estimate returned no work-item id');
      expect(await source.stores.estimates.listByProject(projectId)).toEqual([
        { workItemId: estimatedId, stepId, ...DAYS },
      ]);

      const handedDown = await runner.run(projectId, OWNER, [
        {
          kind: 'createWorkItem',
          ref: 'parent',
          parentId: null,
          afterId: null,
          name: 'Parent',
        },
        { kind: 'setEstimate', workItemRef: 'parent', stepId, days: DAYS },
        {
          kind: 'createWorkItem',
          ref: 'child',
          parentRef: 'parent',
          parentId: null,
          afterId: null,
          name: 'Child',
        },
      ]);
      expect(handedDown.ok).toBe(true);
      const parentId = handedDown.ok ? handedDown.results[0]?.id : undefined;
      const childId = handedDown.ok ? handedDown.results[2]?.id : undefined;
      if (parentId === undefined || childId === undefined) {
        throw new Error('estimate→child returned no parent or child id');
      }
      expect(await source.stores.estimates.listByProject(projectId)).toContainEqual({
        workItemId: childId,
        stepId,
        ...DAYS,
      });
      expect(
        (await source.stores.estimates.listByProject(projectId)).some(
          ({ workItemId }) => workItemId === parentId,
        ),
      ).toBe(false);

      const dependencyDelete = await runner.run(projectId, OWNER, [
        {
          kind: 'createWorkItem',
          ref: 'predecessor',
          parentId: null,
          afterId: null,
          name: 'Predecessor',
        },
        {
          kind: 'createWorkItem',
          ref: 'survivor',
          parentId: null,
          afterId: null,
          name: 'Survivor',
        },
        {
          kind: 'addDependency',
          workItemRef: 'survivor',
          predecessorRef: 'predecessor',
        },
        { kind: 'deleteWorkItem', workItemRef: 'predecessor', strategy: 'cascade' },
      ]);
      expect(dependencyDelete.ok).toBe(true);
      const survivorId = dependencyDelete.ok ? dependencyDelete.results[1]?.id : undefined;
      if (survivorId === undefined) throw new Error('dependency→delete returned no survivor id');
      expect(await source.stores.dependencies.listByProject(projectId)).toEqual([]);
      expect(await source.stores.workItems.listByIds(projectId, [survivorId])).toMatchObject([
        { id: survivorId, name: 'Survivor' },
      ]);

      const labelled = await runner.run(projectId, OWNER, [
        { kind: 'createTeam', ref: 'team', name: 'Cascade team' },
        {
          kind: 'createWorkItem',
          ref: 'labelled',
          parentId: null,
          afterId: null,
          name: 'Before cascade',
        },
      ]);
      if (!labelled.ok) throw new Error('directory setup batch refused');
      const teamId = labelled.results[0]?.id;
      const labelledId = labelled.results[1]?.id;
      if (teamId === undefined || labelledId === undefined) {
        throw new Error('directory setup returned no team or work-item id');
      }
      const labelledRow = await publicGraph.workItems.patch(labelledId, OWNER, {
        teamIds: [teamId],
      });
      expect(labelledRow.ok).toBe(true);
      const cascadePatch = await runner.run(projectId, OWNER, [
        { kind: 'deleteTeam', teamId, cascade: true },
        { kind: 'patchWorkItem', workItemId: labelledId, patch: { name: 'After cascade' } },
      ]);
      expect(cascadePatch.ok).toBe(true);
      expect(await source.stores.workItems.listByIds(projectId, [labelledId])).toMatchObject([
        { id: labelledId, name: 'After cascade' },
      ]);

      // Proof: composing over process stores made this identity assertion fail:
      // every batch must consume the Scope supplied by UnitOfWork.run.
      expect(admitted).toHaveLength(5);
      expect(admitted.every((stores) => stores !== source.stores)).toBe(true);
      expect(new Set(admitted).size).toBe(admitted.length);
    } finally {
      await source.close();
    }
  });

  it('throws after its batch closes', async () => {
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
      const projectId = (await publicGraph.projects.create('Working lifecycle', OWNER)).project.id;
      let retainedRead:
        (() => ReturnType<PlanTransactionalStores['workItems']['listByProject']>) | undefined;
      const runner = new PlanCommandRunner({
        uow: source.uow,
        announcements: direct,
        publicServices: publicGraph,
        batchServices(scope, broadcast, workingPlan) {
          if (workingPlan === undefined) throw new Error('plan batch has no working plan');
          retainedRead = () => workingPlan.stores.workItems.listByProject(projectId);
          return compose(scope.stores, broadcast);
        },
      });

      const outcome = await runner.run(projectId, OWNER, [
        {
          kind: 'createWorkItem',
          parentId: null,
          afterId: null,
          name: 'Closed with batch',
        },
      ]);
      expect(outcome.ok).toBe(true);
      if (retainedRead === undefined) throw new Error('batch did not expose its admitted read');

      // Proof: without the WorkingPlan close guard this resolved with the
      // committed row, permitting a stale batch-owned read after settlement.
      expect(retainedRead()).rejects.toThrow(/working plan.*closed/i);
    } finally {
      await source.close();
    }
  });

  it('loads on first demand and detaches every retained answer', async () => {
    const source = openMemorySource();
    const direct = silentBroadcaster();
    const publicGraph = servicesOver(source.stores, {
      clock: testClock,
      broadcast: direct,
      scheduler: fastScheduler,
    });

    try {
      await source.stores.users.create(
        { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 },
        { at: 1, by: OWNER },
      );
      const projectId = (await publicGraph.projects.create('Lazy retained plan', OWNER)).project.id;
      const created = await publicGraph.workItems.create(projectId, OWNER, {
        parentId: null,
        afterId: null,
        name: 'Before first demand',
      });
      if (!created.ok) throw new Error('working-plan seed creation refused');
      const renamed = await publicGraph.workItems.patch(created.value.id, OWNER, {
        name: 'Loaded name',
      });
      if (!renamed.ok) throw new Error('working-plan seed rename refused');

      const stored = await source.stores.workItems.listByProject(projectId);
      const labelled = stored.map((row) => ({
        ...row,
        teamIds: ['team-before'],
        tagIds: ['tag-before'],
        serviceIds: ['service-before'],
        typeIds: ['type-before'],
        externalRefs: [
          {
            id: 'ref-before',
            systemId: 'system-before',
            url: 'https://before.example/ref',
            name: 'Before reference',
          },
        ],
      }));
      const stores: PlanTransactionalStores = {
        ...source.stores,
        workItems: {
          ...source.stores.workItems,
          listByProject: () => Promise.resolve(labelled),
        },
      };
      const workingPlan = createWorkingPlan({ stores }, projectId);

      const first = await workingPlan.stores.workItems.listByProject(projectId);
      expect(first).toMatchObject([
        {
          id: created.value.id,
          name: 'Loaded name',
          teamIds: ['team-before'],
          tagIds: ['tag-before'],
          serviceIds: ['service-before'],
          typeIds: ['type-before'],
          externalRefs: [{ url: 'https://before.example/ref' }],
        },
      ]);
      const borrowed = first[0];
      borrowed.name = 'Borrower mutation';
      // These casts deliberately model a caller violating the readonly type at runtime.
      (borrowed.teamIds as string[]).push('team-borrowed');
      (borrowed.tagIds as string[]).push('tag-borrowed');
      (borrowed.serviceIds as string[]).push('service-borrowed');
      (borrowed.typeIds as string[]).push('type-borrowed');
      borrowed.externalRefs[0].url = 'https://borrowed.example/ref';
      await source.stores.workItems.remove([created.value.id], [], { at: 2, by: OWNER });

      expect(await workingPlan.stores.workItems.listByProject(projectId)).toEqual(labelled);
      workingPlan.close();
    } finally {
      await source.close();
    }
  });
});

describe('targeted working-plan refreshes', () => {
  it('preserves the admitted work-item order when one row refreshes', async () => {
    const source = openMemorySource();
    const direct = silentBroadcaster();
    const publicGraph = servicesOver(source.stores, {
      clock: testClock,
      broadcast: direct,
      scheduler: fastScheduler,
    });

    try {
      await source.stores.users.create(
        { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 },
        { at: 1, by: OWNER },
      );
      const projectId = (await publicGraph.projects.create('Ordered targeted rows', OWNER)).project
        .id;
      for (const [position, id] of ['z', 'a', 'b', 'c'].entries()) {
        await source.stores.workItems.insert(
          workItemRow({ id, projectId, position: (position + 1) * 10, name: `Row ${id}` }),
          [],
          { at: 2, by: OWNER },
        );
      }
      const workingPlan = createWorkingPlan({ stores: source.stores }, projectId);
      await workingPlan.stores.workItems.listByProject(projectId);
      expect(
        await workingPlan.stores.workItems.patch('b', { name: 'Patched B' }, { at: 3, by: OWNER }),
      ).toMatchObject({ ok: true });

      // Proof: the grouping refresh sorted the retained rows a,b,c,z instead
      // of preserving the admitted source's z,a,b,c order.
      expect(await workingPlan.stores.workItems.listByProject(projectId)).toEqual(
        await source.stores.workItems.listByProject(projectId),
      );
      workingPlan.close();
    } finally {
      await source.close();
    }
  });

  it('preserves unrelated dependency interleaving when incident edges refresh', async () => {
    const source = openMemorySource();
    const direct = silentBroadcaster();
    const publicGraph = servicesOver(source.stores, {
      clock: testClock,
      broadcast: direct,
      scheduler: fastScheduler,
    });

    try {
      await source.stores.users.create(
        { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 },
        { at: 1, by: OWNER },
      );
      const projectId = (await publicGraph.projects.create('Ordered incident edges', OWNER)).project
        .id;
      for (const [position, id] of ['z', 'a', 'b', 'c'].entries()) {
        await source.stores.workItems.insert(
          workItemRow({ id, projectId, position: (position + 1) * 10, name: `Row ${id}` }),
          [],
          { at: 2, by: OWNER },
        );
      }
      for (const edge of [
        { id: 'e1', projectId, predecessorId: 'z', successorId: 'a' },
        { id: 'e2', projectId, predecessorId: 'b', successorId: 'c' },
        { id: 'e3', projectId, predecessorId: 'a', successorId: 'c' },
      ]) {
        await source.stores.dependencies.add(edge, { at: 2, by: OWNER });
      }
      const workingPlan = createWorkingPlan({ stores: source.stores }, projectId);
      await workingPlan.stores.workItems.listByProject(projectId);
      await workingPlan.stores.dependencies.listByProject(projectId);
      expect(
        await workingPlan.stores.workItems.patch('a', { name: 'Patched A' }, { at: 3, by: OWNER }),
      ).toMatchObject({ ok: true });

      // Proof: splicing all incident replacements at e1 produced e1,e3,e2,
      // moving the unrelated e2 out of its authoritative interleaving.
      expect(await workingPlan.stores.dependencies.listByProject(projectId)).toEqual(
        await source.stores.dependencies.listByProject(projectId),
      );
      workingPlan.close();
    } finally {
      await source.close();
    }
  });

  it('refreshes a labelled row and rejects an unrequested satellite row', async () => {
    const source = openMemorySource();
    const direct = silentBroadcaster();
    const publicGraph = servicesOver(source.stores, {
      clock: testClock,
      broadcast: direct,
      scheduler: fastScheduler,
    });

    try {
      await source.stores.users.create(
        { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 },
        { at: 1, by: OWNER },
      );
      const createdProject = await publicGraph.projects.create('Targeted label refresh', OWNER);
      const projectId = createdProject.project.id;
      const created = await publicGraph.workItems.create(projectId, OWNER, {
        parentId: null,
        afterId: null,
        name: 'Labelled row',
      });
      if (!created.ok) throw new Error('targeted label fixture creation refused');
      const firstTag = await publicGraph.directory.addTag(OWNER, 'First targeted tag');
      const secondTag = await publicGraph.directory.addTag(OWNER, 'Second targeted tag');
      if (firstTag === null || secondTag === null) {
        throw new Error('targeted label fixture tag creation refused');
      }
      const seeded = await source.stores.workItems.patch(
        created.value.id,
        { tagIds: [firstTag.id] },
        { at: 2, by: OWNER },
      );
      if (!seeded.ok) throw new Error('targeted label fixture seeding refused');
      const workingPlan = createWorkingPlan({ stores: source.stores }, projectId);
      await workingPlan.stores.workItems.listByProject(projectId);

      const patched = await workingPlan.stores.workItems.patch(
        created.value.id,
        { tagIds: [secondTag.id] },
        { at: 3, by: OWNER },
      );
      expect(patched.ok).toBe(true);
      expect(
        await workingPlan.stores.workItems.listByIds(projectId, [created.value.id]),
      ).toMatchObject([{ id: created.value.id, tagIds: [secondTag.id] }]);
      workingPlan.close();

      const sibling = await publicGraph.workItems.create(projectId, OWNER, {
        parentId: null,
        afterId: null,
        name: 'Unrequested estimate owner',
      });
      if (!sibling.ok) throw new Error('targeted estimate fixture creation refused');
      await source.stores.estimates.set(
        { workItemId: sibling.value.id, stepId: createdProject.steps[0].id, ...DAYS },
        { at: 4, by: OWNER },
      );
      const estimateStores: PlanTransactionalStores = {
        ...source.stores,
        estimates: {
          ...source.stores.estimates,
          // Inject the production fault: the targeted query ignores its IDs.
          listByWorkItems: (requestedProjectId) =>
            source.stores.estimates.listByProject(requestedProjectId),
        },
      };
      const estimatePlan = createWorkingPlan({ stores: estimateStores }, projectId);
      await estimatePlan.stores.estimates.listByProject(projectId);
      // Proof: without the shared satellite identity check, this resolved and
      // retained the sibling's estimate under a refresh for another row.
      expect(
        estimatePlan.stores.workItems.patch(
          created.value.id,
          { name: 'Trigger estimate refresh' },
          { at: 5, by: OWNER },
        ),
      ).rejects.toThrow(/targeted estimate.*unrequested work item/i);
      estimatePlan.close();
    } finally {
      await source.close();
    }
  });

  it('rejects dependencies outside the requested incident project set', async () => {
    const source = openMemorySource();
    const direct = silentBroadcaster();
    const publicGraph = servicesOver(source.stores, {
      clock: testClock,
      broadcast: direct,
      scheduler: fastScheduler,
    });

    try {
      await source.stores.users.create(
        { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 },
        { at: 1, by: OWNER },
      );
      const projectId = (await publicGraph.projects.create('Targeted edge refusal', OWNER)).project
        .id;
      const target = await publicGraph.workItems.create(projectId, OWNER, {
        parentId: null,
        afterId: null,
        name: 'Refresh target',
      });
      const predecessor = await publicGraph.workItems.create(projectId, OWNER, {
        parentId: null,
        afterId: null,
        name: 'Unrelated predecessor',
      });
      const successor = await publicGraph.workItems.create(projectId, OWNER, {
        parentId: null,
        afterId: null,
        name: 'Unrelated successor',
      });
      if (!target.ok || !predecessor.ok || !successor.ok) {
        throw new Error('targeted edge fixture creation refused');
      }
      await source.stores.dependencies.add(
        {
          id: 'unrelated-targeted-edge',
          projectId,
          predecessorId: predecessor.value.id,
          successorId: successor.value.id,
        },
        { at: 2, by: OWNER },
      );
      const stores: PlanTransactionalStores = {
        ...source.stores,
        dependencies: {
          ...source.stores.dependencies,
          // Inject the production fault: the targeted query lost its endpoint predicate.
          listByWorkItems: (requestedProjectId) =>
            source.stores.dependencies.listByProject(requestedProjectId),
        },
      };
      const workingPlan = createWorkingPlan({ stores }, projectId);
      await workingPlan.stores.dependencies.listByProject(projectId);

      // Proof: without validating the targeted edge set, this patch resolved and
      // retained an edge that touched neither refreshed endpoint.
      expect(
        workingPlan.stores.workItems.patch(
          target.value.id,
          { name: 'Trigger edge refresh' },
          { at: 3, by: OWNER },
        ),
      ).rejects.toThrow(/targeted dependency.*refreshed work item/i);
      workingPlan.close();

      const crossProjectStores: PlanTransactionalStores = {
        ...source.stores,
        dependencies: {
          ...source.stores.dependencies,
          // Inject the production fault: the targeted query returns another project.
          listByWorkItems: (_requestedProjectId, ids) =>
            Promise.resolve([
              {
                id: 'cross-project-targeted-edge',
                projectId: 'another-project',
                predecessorId: ids[0] ?? target.value.id,
                successorId: successor.value.id,
              },
            ]),
        },
      };
      const crossProjectPlan = createWorkingPlan({ stores: crossProjectStores }, projectId);
      await crossProjectPlan.stores.dependencies.listByProject(projectId);
      // Proof: without the edge project check, this resolved and retained the
      // other project's edge in this project's working collection.
      expect(
        crossProjectPlan.stores.workItems.patch(
          target.value.id,
          { name: 'Trigger cross-project edge refresh' },
          { at: 4, by: OWNER },
        ),
      ).rejects.toThrow(/targeted dependency.*outside project/i);
      crossProjectPlan.close();
    } finally {
      await source.close();
    }
  });

  it('hydrates only the affected identity after ordinary single-row patches', async () => {
    const source = openMemorySource();
    const direct = silentBroadcaster();
    const publicGraph = servicesOver(source.stores, {
      clock: testClock,
      broadcast: direct,
      scheduler: fastScheduler,
    });

    try {
      await source.stores.users.create(
        { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 },
        { at: 1, by: OWNER },
      );
      const projectId = (await publicGraph.projects.create('Bounded row refresh', OWNER)).project
        .id;
      const retainedCount = 200;
      for (let index = 0; index < retainedCount; index += 1) {
        await source.stores.workItems.insert(
          workItemRow({
            id: `row-${String(index).padStart(3, '0')}`,
            projectId,
            position: index * 10,
          }),
          [],
          { at: 2, by: OWNER },
        );
      }
      const hydrationCardinality: { requested: number; returned: number }[] = [];
      let placementCalls = 0;
      const stores: PlanTransactionalStores = {
        ...source.stores,
        workItems: {
          ...source.stores.workItems,
          listByIds: async (requestedProjectId, ids) => {
            const rows = await source.stores.workItems.listByIds(requestedProjectId, ids);
            hydrationCardinality.push({ requested: ids.length, returned: rows.length });
            return rows;
          },
          listPlacements: (requestedProjectId, ids) => {
            placementCalls += 1;
            return source.stores.workItems.listPlacements(requestedProjectId, ids);
          },
        },
      };
      const workingPlan = createWorkingPlan({ stores }, projectId);
      expect(await workingPlan.stores.workItems.listByProject(projectId)).toHaveLength(
        retainedCount,
      );

      for (const [at, name] of ['First patch', 'Second patch', 'Third patch'].entries()) {
        expect(
          await workingPlan.stores.workItems.patch('row-117', { name }, { at: at + 3, by: OWNER }),
        ).toMatchObject({ ok: true });
      }
      // Proof: expanding this refresh to every retained identity requested and returned
      // 200 labelled rows here, masking faults in the affected-identity set.
      expect(hydrationCardinality).toEqual([
        { requested: 1, returned: 1 },
        { requested: 1, returned: 1 },
        { requested: 1, returned: 1 },
      ]);
      // Proof: calling the real placement reader for an empty new-ID set made
      // three ordinary patches cross this boundary three times.
      expect(placementCalls).toBe(0);
      expect(
        (await workingPlan.stores.workItems.listByProject(projectId)).find(
          ({ id }) => id === 'row-117',
        ),
      ).toMatchObject({ name: 'Third patch' });
      workingPlan.close();
    } finally {
      await source.close();
    }
  });

  it('rejects work items outside the requested project and identity set', async () => {
    const source = openMemorySource();
    const direct = silentBroadcaster();
    const publicGraph = servicesOver(source.stores, {
      clock: testClock,
      broadcast: direct,
      scheduler: fastScheduler,
    });

    try {
      await source.stores.users.create(
        { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 },
        { at: 1, by: OWNER },
      );
      const projectA = (await publicGraph.projects.create('Targeted project A', OWNER)).project.id;
      const projectB = (await publicGraph.projects.create('Targeted project B', OWNER)).project.id;
      const rowA = await publicGraph.workItems.create(projectA, OWNER, {
        parentId: null,
        afterId: null,
        name: 'Project A row',
      });
      const rowB = await publicGraph.workItems.create(projectB, OWNER, {
        parentId: null,
        afterId: null,
        name: 'Project B row',
      });
      if (!rowA.ok || !rowB.ok) throw new Error('targeted project fixture creation refused');
      const stores: PlanTransactionalStores = {
        ...source.stores,
        workItems: {
          ...source.stores.workItems,
          // Inject the production fault: the targeted query uses project B's constraint.
          listByIds: (_requestedProjectId, ids) => source.stores.workItems.listByIds(projectB, ids),
        },
      };
      const workingPlan = createWorkingPlan({ stores }, projectA);
      await workingPlan.stores.workItems.listByProject(projectA);

      // Proof: without the project check on refreshed rows, this resolved and
      // inserted project B's row into project A's retained collection.
      expect(
        workingPlan.stores.workItems.patch(
          rowB.value.id,
          { name: 'Cross-project targeted row' },
          { at: 2, by: OWNER },
        ),
      ).rejects.toThrow(/targeted work item.*outside project/i);
      expect(await workingPlan.stores.workItems.listByProject(projectA)).toMatchObject([
        { id: rowA.value.id, projectId: projectA },
      ]);
      workingPlan.close();

      const unrequestedStores: PlanTransactionalStores = {
        ...source.stores,
        workItems: {
          ...source.stores.workItems,
          // Inject the production fault: the targeted query returns a different ID.
          listByIds: async () =>
            (await source.stores.workItems.listByIds(projectB, [rowB.value.id])).map((row) => ({
              ...row,
              projectId: projectA,
            })),
        },
      };
      const unrequestedPlan = createWorkingPlan({ stores: unrequestedStores }, projectA);
      await unrequestedPlan.stores.workItems.listByProject(projectA);
      // Proof: without the requested-ID check, this resolved and inserted an
      // unrequested row into the retained collection.
      expect(
        unrequestedPlan.stores.workItems.patch(
          rowA.value.id,
          { name: 'Trigger unrequested targeted row' },
          { at: 3, by: OWNER },
        ),
      ).rejects.toThrow(/targeted work item.*not requested/i);
      unrequestedPlan.close();
    } finally {
      await source.close();
    }
  });
});
