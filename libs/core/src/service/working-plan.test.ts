import { openMemorySource } from '@wbs/store-memory';
import { describe, expect, it } from 'bun:test';

import { servicesOver } from '../compose';
import type { PlanTransactionalStores } from '../ports/stores';
import { testClock } from '../testing/clock-fixture';
import { fastScheduler } from '../testing/scheduler-fixture';
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
      const workingPlan = createWorkingPlan({ stores: source.stores }, projectId);
      const renamed = await publicGraph.workItems.patch(created.value.id, OWNER, {
        name: 'Loaded name',
      });
      if (!renamed.ok) throw new Error('working-plan seed rename refused');

      const first = await workingPlan.stores.workItems.listByProject(projectId);
      expect(first).toMatchObject([{ id: created.value.id, name: 'Loaded name' }]);
      const borrowed = first[0];
      borrowed.name = 'Borrower mutation';
      await source.stores.workItems.remove([created.value.id], [], { at: 2, by: OWNER });

      expect(await workingPlan.stores.workItems.listByProject(projectId)).toMatchObject([
        { id: created.value.id, name: 'Loaded name' },
      ]);
      workingPlan.close();
    } finally {
      await source.close();
    }
  });
});
