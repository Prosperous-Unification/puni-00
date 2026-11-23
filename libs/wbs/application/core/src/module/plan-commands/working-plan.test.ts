import { openMemorySourceFixture } from '@wbs/store-memory/source';
import { ownTestSource } from '@wbs/store-memory/testing/owned-source-fixture';
import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { describe, expect, it } from 'bun:test';

import { servicesOver } from '../../compose';
import type { AccessDecisions } from '../../ports/access-decisions';
import { LEGACY_EDIT_ADMISSION } from '../../ports/edit-admission';
import type { PlanTransactionalStores } from '../../ports/stores';
import type { Broadcaster } from '../../ports/work-package-event';
import { createLocalDependencyContext } from '../../service/dependency-context';
import { bindFixtureSteps } from '../../testing/bound-package-fixture';
import { testClock } from '../../testing/clock-fixture';
import { expectCreated } from '../../testing/expect-created';
import { seedLegacyPackageParent } from '../../testing/legacy-package-source-fixture';
import { localCommandAccess } from '../../testing/organization-access-fixture';
import { fastScheduler } from '../../testing/scheduler-fixture';
import { workItemRow } from '../../testing/work-item-fixture';
import { createPlanCommandRunner } from './composition';
import { createWorkingPlan } from './working-plan.resource';

/** Whether a call refused, synchronously or by rejecting; `.rejects` cannot be awaited under Bun's types. */
async function refusesCall(call: () => unknown): Promise<boolean> {
  try {
    await call();
    return false;
  } catch {
    return true;
  }
}

const OWNER = 'working-plan-owner';
const DAYS = { optimistic: 1, realistic: 2, pessimistic: 3 } as const;

/** Authors the declared current steps before each ordinary package birth; empty fixtures stay empty. */
async function authorWorkingSteps(
  source: ReturnType<typeof openMemorySourceFixture>['source'],
  firstName: 'Dev' | 'Build',
): Promise<void> {
  await bindFixtureSteps(
    source,
    'fixture-legacy-org',
    [
      {
        definition:
          firstName === 'Dev'
            ? {
                id: 'working-dev',
                name: 'Dev',
                code: 'dev',
                position: 10,
                defaultEstimateUnit: 'workdays',
                defaultAllowancePercent: 0,
              }
            : {
                id: 'working-build',
                name: 'Build',
                code: 'build',
                position: 10,
                defaultEstimateUnit: 'workdays',
                defaultAllowancePercent: 0,
              },
        binding: {
          bindingId: 'working-first-binding',
          scopeKind: 'project',
          scopeId: 'fixture-project',
          workItemTypeId: null,
          position: 10,
        },
      },
      {
        definition: {
          id: 'working-qa',
          name: 'QA',
          code: 'qa',
          position: 20,
          defaultEstimateUnit: 'workdays',
          defaultAllowancePercent: 0,
        },
        binding: {
          bindingId: 'working-qa-binding',
          scopeKind: 'project',
          scopeId: 'fixture-project',
          workItemTypeId: null,
          position: 20,
        },
      },
    ],
    { at: 1, by: OWNER },
  );
}

function silentBroadcaster(): Broadcaster {
  return {
    publish: () => Promise.resolve(),
    latestSeq: () => Promise.resolve(-1),
  };
}

describe('the admitted working batch baseline', () => {
  it('keeps blockage calls inside the work package and batch lifetime and refreshes successful writes', async () => {
    const parentFixture = openMemorySourceFixture();
    const source = ownTestSource(parentFixture.source);
    const stamp = { at: 1, by: OWNER };
    const owner = workItemRow({ id: 'blockage-owner', workPackageId: 'work-package-a' });
    const foreign = workItemRow({ id: 'foreign-owner', workPackageId: 'work-package-b' });
    await source.stores.workItems.insert(owner, [], stamp);
    await source.stores.workItems.insert(foreign, [], stamp);
    let revision = 0;
    let fails = false;
    const facts: { workItemId: string; stepId: string; blockedAt: number }[] = [];
    const stores = {
      ...source.stores,
      workItems: {
        ...source.stores.workItems,
        listByWorkPackage: async (workPackageId: string) =>
          (await source.stores.workItems.listByWorkPackage(workPackageId)).map((row) => ({
            ...row,
            revision: row.id === owner.id ? revision : row.revision,
          })),
        listByIds: async (workPackageId: string, ids: readonly string[]) =>
          (await source.stores.workItems.listByIds(workPackageId, ids)).map((row) => ({
            ...row,
            revision: row.id === owner.id ? revision : row.revision,
          })),
      },
      blockages: {
        listByWorkPackage: (workPackageId: string) =>
          Promise.resolve(
            facts.filter(
              ({ workItemId }) => workPackageId === 'work-package-a' && workItemId === owner.id,
            ),
          ),
        listByWorkItems: (workPackageId: string, ids: readonly string[]) =>
          Promise.resolve(
            facts.filter(
              ({ workItemId }) => workPackageId === 'work-package-a' && ids.includes(workItemId),
            ),
          ),
        set: (fact: (typeof facts)[number]) => {
          if (fails) throw new Error('injected write failure');
          facts.push(fact);
          revision += 1;
          return Promise.resolve('written' as const);
        },
        remove: (workItemId: string, stepId: string) => {
          if (fails) throw new Error('injected write failure');
          facts.splice(
            0,
            facts.length,
            ...facts.filter((fact) => fact.workItemId !== workItemId || fact.stepId !== stepId),
          );
          revision += 1;
          return Promise.resolve();
        },
        moveAll: () => {
          revision += 1;
          return Promise.resolve();
        },
      },
    };
    const plan = createWorkingPlan({ stores }, 'work-package-a');
    const borrowed = plan.stores.blockages;
    const fact = { workItemId: owner.id, stepId: 'dev', blockedAt: 123 };
    try {
      expect((await plan.stores.workItems.listByWorkPackage('work-package-a'))[0]?.revision).toBe(
        0,
      );
      expect(await borrowed.set(fact, stamp)).toBe('written');
      expect(await borrowed.listByWorkItems('work-package-a', [owner.id])).toEqual([fact]);
      // Proof: removing blockage refreshRows left the retained owner at revision 0.
      expect((await plan.stores.workItems.listByWorkPackage('work-package-a'))[0]?.revision).toBe(
        1,
      );
      fails = true;
      expect(await refusesCall(() => borrowed.remove(owner.id, fact.stepId, stamp))).toBe(true);
      expect(await borrowed.listByWorkPackage('work-package-a')).toEqual([fact]);
      expect((await plan.stores.workItems.listByWorkPackage('work-package-a'))[0]?.revision).toBe(
        1,
      );
      fails = false;
      // Proof: bypassing the scope owner guard let a foreign fact write succeed.
      expect(
        await refusesCall(() => borrowed.set({ ...fact, workItemId: foreign.id }, stamp)),
      ).toBe(true);
      expect(
        await refusesCall(() => borrowed.set({ ...fact, workItemId: 'missing-owner' }, stamp)),
      ).toBe(true);
      expect(await refusesCall(() => borrowed.remove(foreign.id, fact.stepId, stamp))).toBe(true);
      expect(await refusesCall(() => borrowed.moveAll(owner.id, foreign.id, stamp))).toBe(true);
      // Proof: replacing the work package guard with only a lifetime guard let this read succeed.
      expect(await refusesCall(() => borrowed.listByWorkPackage('work-package-b'))).toBe(true);
      expect(await refusesCall(() => borrowed.listByWorkItems('work-package-b', [owner.id]))).toBe(
        true,
      );
      await borrowed.remove(owner.id, fact.stepId, stamp);
      expect(await borrowed.listByWorkPackage('work-package-a')).toEqual([]);
      expect((await plan.stores.workItems.listByWorkPackage('work-package-a'))[0]?.revision).toBe(
        2,
      );
      plan.close();
      // Proof: returning the raw store allowed this borrowed read after close.
      expect(await refusesCall(() => borrowed.listByWorkPackage('work-package-a'))).toBe(true);
      expect(await refusesCall(() => borrowed.set(fact, stamp))).toBe(true);
    } finally {
      await source.close();
    }
  });
  it('passes typed links through the batch and refuses cross-work-package and closed access', async () => {
    const parentFixture = openMemorySourceFixture();
    const source = ownTestSource(parentFixture.source);
    const plan = createWorkingPlan({ stores: source.stores }, 'work-package-a');
    const row = {
      id: 'typed-a',
      workPackageId: 'work-package-a',
      predecessor: { workPackageId: 'work-package-a', scope: 'whole' as const, workItemId: 'a' },
      successor: { workPackageId: 'work-package-a', scope: 'whole' as const, workItemId: 'b' },
      type: 'FS' as const,
    };
    const stamp = { at: 1, by: OWNER };
    try {
      await plan.stores.typedDependencies.add(row, stamp);
      expect(await plan.stores.typedDependencies.listByWorkPackage('work-package-a')).toEqual([
        row,
      ]);
      const later = {
        ...row,
        id: 'typed-later',
        successor: { workPackageId: 'work-package-a', scope: 'whole' as const, workItemId: 'c' },
      };
      await source.stores.typedDependencies.add(later, stamp);
      expect(await plan.stores.typedDependencies.listByWorkPackage('work-package-a')).toEqual([
        row,
        later,
      ]);
      expect(() => plan.stores.typedDependencies.listByWorkPackage('work-package-b')).toThrow();
      expect(() => plan.stores.typedDependencies.listIncident(['work-package-b'])).toThrow();
      expect(await plan.stores.typedDependencies.listIncident([])).toEqual([]);
      expect(() =>
        plan.stores.typedDependencies.add(
          { ...row, id: 'other', workPackageId: 'work-package-b' },
          stamp,
        ),
      ).toThrow();
      await source.stores.typedDependencies.add(
        {
          ...row,
          id: 'foreign',
          workPackageId: 'work-package-b',
          predecessor: { workPackageId: 'work-package-b', scope: 'whole', workItemId: 'foreign' },
          successor: { ...row.successor, workPackageId: 'work-package-b' },
        },
        stamp,
      );
      expect(await refusesCall(() => plan.stores.typedDependencies.remove('foreign', stamp))).toBe(
        true,
      );
      expect(
        await refusesCall(() => plan.stores.typedDependencies.removeAllFor(['foreign'], stamp)),
      ).toBe(true);
      plan.close();
      expect(() => plan.stores.typedDependencies.listIncident([])).toThrow();
      expect(() => plan.stores.typedDependencies.listByWorkPackage('work-package-a')).toThrow();
    } finally {
      await source.close();
    }
  });

  it('reads the committed SS type and endpoints after an FF edit', async () => {
    const parentFixture = openMemorySourceFixture();
    const source = ownTestSource(parentFixture.source);
    const plan = createWorkingPlan({ stores: source.stores }, 'work-package-a');
    const stamp = { at: 1, by: OWNER };
    const before = {
      id: 'typed-edit',
      workPackageId: 'work-package-a',
      predecessor: { workPackageId: 'work-package-a', scope: 'whole' as const, workItemId: 'a' },
      successor: { workPackageId: 'work-package-a', scope: 'whole' as const, workItemId: 'b' },
      type: 'FF' as const,
    };
    const after = {
      ...before,
      successor: {
        workPackageId: 'work-package-a',
        scope: 'node' as const,
        workItemId: 'b',
        stepId: 'review',
      },
      type: 'SS' as const,
    };
    try {
      await plan.stores.typedDependencies.add(before, stamp);
      expect(await plan.stores.typedDependencies.listByWorkPackage('work-package-a')).toEqual([
        before,
      ]);
      await plan.stores.typedDependencies.update(after, stamp);
      expect(await plan.stores.typedDependencies.listByWorkPackage('work-package-a')).toEqual([
        after,
      ]);
    } finally {
      plan.close();
      await source.close();
    }
  });

  it('preserves the four mutation sequences through a working collection', async () => {
    const parentFixture = openMemorySourceFixture();
    const source = ownTestSource(parentFixture.source);
    const admitted: PlanTransactionalStores[] = [];
    const direct = silentBroadcaster();
    const compose = (stores: PlanTransactionalStores, broadcast: Broadcaster) =>
      servicesOver(stores, {
        dependencyContext: createLocalDependencyContext(stores),
        admission: LEGACY_EDIT_ADMISSION,
        clock: testClock,
        broadcast,
        scheduler: fastScheduler,
      });
    const publicGraph = compose(source.stores, direct);
    const runner = createPlanCommandRunner({
      commandAccess: localCommandAccess,
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
      seedLegacyPackageParent(parentFixture, {
        organizationId: 'fixture-legacy-org',
        projectId: 'fixture-project',
        creator: OWNER,
      });
      await authorWorkingSteps(source, 'Dev');
      const createdWorkPackage = expectCreated(
        await publicGraph.workPackages.create('Working baseline', 'fixture-project', OWNER),
      );
      const workPackageId = createdWorkPackage.workPackage.id;
      const stepId = createdWorkPackage.steps[0].id;

      const createdAndEstimated = await runner.run(workPackageId, OWNER, [
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
      expect(await source.stores.estimates.listByWorkPackage(workPackageId)).toEqual([
        { workItemId: estimatedId, stepId, ...DAYS },
      ]);

      const handedDown = await runner.run(workPackageId, OWNER, [
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
      expect(await source.stores.estimates.listByWorkPackage(workPackageId)).toContainEqual({
        workItemId: childId,
        stepId,
        ...DAYS,
      });
      expect(
        (await source.stores.estimates.listByWorkPackage(workPackageId)).some(
          ({ workItemId }) => workItemId === parentId,
        ),
      ).toBe(false);

      const dependencyDelete = await runner.run(workPackageId, OWNER, [
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
      expect(await source.stores.dependencies.listByWorkPackage(workPackageId)).toEqual([]);
      expect(await source.stores.workItems.listByIds(workPackageId, [survivorId])).toMatchObject([
        { id: survivorId, name: 'Survivor' },
      ]);

      const labelled = await runner.run(workPackageId, OWNER, [
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
      const cascadePatch = await runner.run(workPackageId, OWNER, [
        { kind: 'deleteTeam', teamId, cascade: true },
        { kind: 'patchWorkItem', workItemId: labelledId, patch: { name: 'After cascade' } },
      ]);
      expect(cascadePatch.ok).toBe(true);
      expect(await source.stores.workItems.listByIds(workPackageId, [labelledId])).toMatchObject([
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
    const parentFixture = openMemorySourceFixture();
    const source = ownTestSource(parentFixture.source);
    const direct = silentBroadcaster();
    const compose = (stores: PlanTransactionalStores, broadcast: Broadcaster) =>
      servicesOver(stores, {
        dependencyContext: createLocalDependencyContext(stores),
        admission: LEGACY_EDIT_ADMISSION,
        clock: testClock,
        broadcast,
        scheduler: fastScheduler,
      });
    const publicGraph = compose(source.stores, direct);
    try {
      await source.stores.users.create(
        { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 },
        { at: 1, by: OWNER },
      );
      seedLegacyPackageParent(parentFixture, {
        organizationId: 'fixture-legacy-org',
        projectId: 'fixture-project',
        creator: OWNER,
      });
      await authorWorkingSteps(source, 'Dev');
      const workPackageId = expectCreated(
        await publicGraph.workPackages.create('Working lifecycle', 'fixture-project', OWNER),
      ).workPackage.id;
      let retainedRead:
        (() => ReturnType<PlanTransactionalStores['workItems']['listByWorkPackage']>) | undefined;
      const runner = createPlanCommandRunner({
        commandAccess: localCommandAccess,
        uow: source.uow,
        announcements: direct,
        publicServices: publicGraph,
        batchServices(scope, broadcast) {
          retainedRead = () => scope.stores.workItems.listByWorkPackage(workPackageId);
          return compose(scope.stores, broadcast);
        },
      });

      const outcome = await runner.run(workPackageId, OWNER, [
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

  it('closes the working plan when graph composition throws', async () => {
    const parentFixture = openMemorySourceFixture();
    const source = ownTestSource(parentFixture.source);
    const direct = silentBroadcaster();
    const graph = servicesOver(source.stores, {
      dependencyContext: createLocalDependencyContext(source.stores),
      admission: LEGACY_EDIT_ADMISSION,
      clock: testClock,
      broadcast: direct,
      scheduler: fastScheduler,
    });
    const workPackageId = 'broken-graph-work-package';
    let retainedRead:
      (() => ReturnType<PlanTransactionalStores['workItems']['listByWorkPackage']>) | undefined;
    const runner = createPlanCommandRunner({
      commandAccess: localCommandAccess,
      uow: source.uow,
      announcements: direct,
      publicServices: graph,
      batchServices(scope) {
        retainedRead = () => scope.stores.workItems.listByWorkPackage(workPackageId);
        throw new Error('graph construction failed');
      },
    });
    try {
      try {
        await runner.run(workPackageId, OWNER, []);
        throw new Error('command graph unexpectedly composed');
      } catch (cause) {
        expect(cause).toEqual(new Error('graph construction failed'));
      }
      if (retainedRead === undefined) throw new Error('graph did not retain its read');
      // Proof: omitting the close on a graph factory throw let this read resolve;
      // watched with the composition catch removed in the isolated candidate.
      expect(retainedRead()).rejects.toThrow(/working plan.*closed/i);
    } finally {
      await source.close();
    }
  });

  it('loads on first demand and detaches every retained answer', async () => {
    const parentFixture = openMemorySourceFixture();
    const source = ownTestSource(parentFixture.source);
    const direct = silentBroadcaster();
    const publicGraph = servicesOver(source.stores, {
      dependencyContext: createLocalDependencyContext(source.stores),
      admission: LEGACY_EDIT_ADMISSION,
      clock: testClock,
      broadcast: direct,
      scheduler: fastScheduler,
    });

    try {
      await source.stores.users.create(
        { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 },
        { at: 1, by: OWNER },
      );
      seedLegacyPackageParent(parentFixture, {
        organizationId: 'fixture-legacy-org',
        projectId: 'fixture-project',
        creator: OWNER,
      });
      await authorWorkingSteps(source, 'Dev');
      const workPackageId = expectCreated(
        await publicGraph.workPackages.create('Lazy retained plan', 'fixture-project', OWNER),
      ).workPackage.id;
      const created = await publicGraph.workItems.create(workPackageId, OWNER, {
        parentId: null,
        afterId: null,
        name: 'Before first demand',
      });
      if (!created.ok) throw new Error('working-plan seed creation refused');
      const renamed = await publicGraph.workItems.patch(created.value.id, OWNER, {
        name: 'Loaded name',
      });
      if (!renamed.ok) throw new Error('working-plan seed rename refused');

      const stored = await source.stores.workItems.listByWorkPackage(workPackageId);
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
      const expected = structuredClone(labelled);
      const stores: PlanTransactionalStores = {
        ...source.stores,
        workItems: {
          ...source.stores.workItems,
          listByWorkPackage: () => Promise.resolve(labelled),
        },
      };
      const workingPlan = createWorkingPlan({ stores }, workPackageId);

      const first = await workingPlan.stores.workItems.listByWorkPackage(workPackageId);
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

      // Proof (2026-10-16), "loads on first demand and detaches every retained answer":
      // replacing tagIds: [...workItem.tagIds] with tagIds: workItem.tagIds kept
      // toEqual(labelled) green; this snapshot oracle failed on "tag-borrowed".
      // Individual teamIds, serviceIds, typeIds and external-ref-record copy
      // omissions also failed through createWorkingPlan; restored copies pass.
      expect(await workingPlan.stores.workItems.listByWorkPackage(workPackageId)).toEqual(expected);
      expect(labelled).toEqual(expected);
      workingPlan.close();
    } finally {
      await source.close();
    }
  });
});

describe('targeted working-plan refreshes', () => {
  it('reloads every loaded collection and keeps unloaded collections lazy after a global write', async () => {
    const parentFixture = openMemorySourceFixture();
    const source = ownTestSource(parentFixture.source);
    const publicGraph = servicesOver(source.stores, {
      dependencyContext: createLocalDependencyContext(source.stores),
      admission: LEGACY_EDIT_ADMISSION,
      clock: testClock,
      broadcast: silentBroadcaster(),
      scheduler: fastScheduler,
    });
    try {
      await source.stores.users.create(
        { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 },
        { at: 1, by: OWNER },
      );
      seedLegacyPackageParent(parentFixture, {
        organizationId: 'fixture-legacy-org',
        projectId: 'fixture-project',
        creator: OWNER,
      });
      await authorWorkingSteps(source, 'Dev');
      const workPackageId = expectCreated(
        await publicGraph.workPackages.create('Global reload barrier', 'fixture-project', OWNER),
      ).workPackage.id;
      const row = await publicGraph.workItems.create(workPackageId, OWNER, {
        parentId: null,
        afterId: null,
        name: 'Retained before directory write',
      });
      if (!row.ok) throw new Error('global reload fixture row creation refused');
      const reads = {
        workItems: 0,
        estimates: 0,
        actuals: 0,
        progress: 0,
        measures: 0,
        dependencies: 0,
      };
      const stores: PlanTransactionalStores = {
        ...source.stores,
        workItems: {
          ...source.stores.workItems,
          listByWorkPackage: (id) => {
            reads.workItems += 1;
            return source.stores.workItems.listByWorkPackage(id);
          },
        },
        estimates: {
          ...source.stores.estimates,
          listByWorkPackage: (id) => {
            reads.estimates += 1;
            return source.stores.estimates.listByWorkPackage(id);
          },
        },
        actuals: {
          ...source.stores.actuals,
          listByWorkPackage: (id) => {
            reads.actuals += 1;
            return source.stores.actuals.listByWorkPackage(id);
          },
        },
        progress: {
          ...source.stores.progress,
          listByWorkPackage: (id) => {
            reads.progress += 1;
            return source.stores.progress.listByWorkPackage(id);
          },
        },
        measures: {
          ...source.stores.measures,
          listByWorkPackage: (id) => {
            reads.measures += 1;
            return source.stores.measures.listByWorkPackage(id);
          },
        },
        dependencies: {
          ...source.stores.dependencies,
          listByWorkPackage: (id) => {
            reads.dependencies += 1;
            return source.stores.dependencies.listByWorkPackage(id);
          },
        },
      };
      const workingPlan = createWorkingPlan({ stores }, workPackageId);
      const borrowed = await workingPlan.stores.workItems.listByWorkPackage(workPackageId);
      await Promise.all([
        workingPlan.stores.estimates.listByWorkPackage(workPackageId),
        workingPlan.stores.actuals.listByWorkPackage(workPackageId),
        workingPlan.stores.progress.listByWorkPackage(workPackageId),
        workingPlan.stores.measures.listByWorkPackage(workPackageId),
      ]);

      await workingPlan.stores.directory.addTag(
        { id: 'reload-tag', name: 'Reload tag' },
        { at: 2, by: OWNER },
      );

      // Proof: omitting any loaded collection from the global barrier left its
      // count at one, while eagerly reloading dependencies changed zero to one.
      expect(reads).toEqual({
        workItems: 2,
        estimates: 2,
        actuals: 2,
        progress: 2,
        measures: 2,
        dependencies: 0,
      });
      expect(borrowed).toMatchObject([
        { id: row.value.id, name: 'Retained before directory write' },
      ]);
      workingPlan.close();
    } finally {
      await source.close();
    }
  });

  it('preserves the admitted work-item order when one row refreshes', async () => {
    const parentFixture = openMemorySourceFixture();
    const source = ownTestSource(parentFixture.source);
    const direct = silentBroadcaster();
    const publicGraph = servicesOver(source.stores, {
      dependencyContext: createLocalDependencyContext(source.stores),
      admission: LEGACY_EDIT_ADMISSION,
      clock: testClock,
      broadcast: direct,
      scheduler: fastScheduler,
    });

    try {
      await source.stores.users.create(
        { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 },
        { at: 1, by: OWNER },
      );
      seedLegacyPackageParent(parentFixture, {
        organizationId: 'fixture-legacy-org',
        projectId: 'fixture-project',
        creator: OWNER,
      });
      await authorWorkingSteps(source, 'Dev');
      const workPackageId = expectCreated(
        await publicGraph.workPackages.create('Ordered targeted rows', 'fixture-project', OWNER),
      ).workPackage.id;
      for (const [position, id] of ['z', 'a', 'b', 'c'].entries()) {
        await source.stores.workItems.insert(
          workItemRow({ id, workPackageId, position: (position + 1) * 10, name: `Row ${id}` }),
          [],
          { at: 2, by: OWNER },
        );
      }
      const workingPlan = createWorkingPlan({ stores: source.stores }, workPackageId);
      await workingPlan.stores.workItems.listByWorkPackage(workPackageId);
      expect(
        await workingPlan.stores.workItems.patch('b', { name: 'Patched B' }, { at: 3, by: OWNER }),
      ).toMatchObject({ ok: true });

      // Proof: the grouping refresh sorted the retained rows a,b,c,z instead
      // of preserving the admitted source's z,a,b,c order.
      expect(await workingPlan.stores.workItems.listByWorkPackage(workPackageId)).toEqual(
        await source.stores.workItems.listByWorkPackage(workPackageId),
      );
      workingPlan.close();
    } finally {
      await source.close();
    }
  });

  it('refreshes the retained measures when a tokens trio writes or retires the legacy token estimate', async () => {
    const parentFixture = openMemorySourceFixture();
    const source = ownTestSource(parentFixture.source);
    const publicGraph = servicesOver(source.stores, {
      dependencyContext: createLocalDependencyContext(source.stores),
      admission: LEGACY_EDIT_ADMISSION,
      clock: testClock,
      broadcast: silentBroadcaster(),
      scheduler: fastScheduler,
    });
    try {
      await source.stores.users.create(
        { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 },
        { at: 1, by: OWNER },
      );
      seedLegacyPackageParent(parentFixture, {
        organizationId: 'fixture-legacy-org',
        projectId: 'fixture-project',
        creator: OWNER,
      });
      await authorWorkingSteps(source, 'Dev');
      const created = expectCreated(
        await publicGraph.workPackages.create('Token estimates', 'fixture-project', OWNER),
      );
      const workPackageId = created.workPackage.id;
      const stepId = created.steps.at(0)?.id;
      if (stepId === undefined) throw new Error('the work package has no step');

      await source.stores.workItems.insert(workItemRow({ id: 'leaf', workPackageId }), [], {
        at: 2,
        by: OWNER,
      });
      await source.stores.measures.set(
        { workItemId: 'leaf', stepId, metric: 'token_estimate', value: 40, recordedAt: 2 },
        { at: 2, by: OWNER },
      );
      const workingPlan = createWorkingPlan({ stores: source.stores }, workPackageId);
      expect(await workingPlan.stores.measures.listByWorkPackage(workPackageId)).toHaveLength(1);
      const trio = { workItemId: 'leaf', stepId, key: 'tokens', ...DAYS, singlePoint: false };
      expect(await workingPlan.stores.measureEstimates.set(trio, { at: 3, by: OWNER })).toBe(
        'written',
      );
      // The three-point write retired the legacy row underneath the retained read.
      expect(await workingPlan.stores.measures.listByWorkPackage(workPackageId)).toEqual([]);
      await workingPlan.stores.measureEstimates.set(
        { ...trio, optimistic: 5, realistic: 5, pessimistic: 5, singlePoint: true },
        { at: 4, by: OWNER },
      );
      expect(await workingPlan.stores.measures.listByWorkPackage(workPackageId)).toEqual(
        await source.stores.measures.listByWorkPackage(workPackageId),
      );
      await workingPlan.stores.measureEstimates.remove('leaf', stepId, 'tokens', {
        at: 5,
        by: OWNER,
      });
      expect(await workingPlan.stores.measures.listByWorkPackage(workPackageId)).toEqual([]);
      workingPlan.close();
    } finally {
      await source.close();
    }
  });

  it('preserves unrelated dependency interleaving when incident edges refresh', async () => {
    const parentFixture = openMemorySourceFixture();
    const source = ownTestSource(parentFixture.source);
    const direct = silentBroadcaster();
    const publicGraph = servicesOver(source.stores, {
      dependencyContext: createLocalDependencyContext(source.stores),
      admission: LEGACY_EDIT_ADMISSION,
      clock: testClock,
      broadcast: direct,
      scheduler: fastScheduler,
    });

    try {
      await source.stores.users.create(
        { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 },
        { at: 1, by: OWNER },
      );
      seedLegacyPackageParent(parentFixture, {
        organizationId: 'fixture-legacy-org',
        projectId: 'fixture-project',
        creator: OWNER,
      });
      await authorWorkingSteps(source, 'Dev');
      const workPackageId = expectCreated(
        await publicGraph.workPackages.create('Ordered incident edges', 'fixture-project', OWNER),
      ).workPackage.id;
      for (const [position, id] of ['z', 'a', 'b', 'c'].entries()) {
        await source.stores.workItems.insert(
          workItemRow({ id, workPackageId, position: (position + 1) * 10, name: `Row ${id}` }),
          [],
          { at: 2, by: OWNER },
        );
      }
      for (const edge of [
        { id: 'e1', workPackageId, predecessorId: 'z', successorId: 'a' },
        { id: 'e2', workPackageId, predecessorId: 'b', successorId: 'c' },
        { id: 'e3', workPackageId, predecessorId: 'a', successorId: 'c' },
      ]) {
        await source.stores.dependencies.add(edge, { at: 2, by: OWNER });
      }
      const workingPlan = createWorkingPlan({ stores: source.stores }, workPackageId);
      await workingPlan.stores.workItems.listByWorkPackage(workPackageId);
      await workingPlan.stores.dependencies.listByWorkPackage(workPackageId);
      expect(
        await workingPlan.stores.workItems.patch('a', { name: 'Patched A' }, { at: 3, by: OWNER }),
      ).toMatchObject({ ok: true });

      // Proof: splicing all incident replacements at e1 produced e1,e3,e2,
      // moving the unrelated e2 out of its authoritative interleaving.
      expect(await workingPlan.stores.dependencies.listByWorkPackage(workPackageId)).toEqual(
        await source.stores.dependencies.listByWorkPackage(workPackageId),
      );
      workingPlan.close();
    } finally {
      await source.close();
    }
  });

  it('keeps a newly added edge in authoritative order and returned edges detached', async () => {
    const parentFixture = openMemorySourceFixture();
    const source = ownTestSource(parentFixture.source);
    const publicGraph = servicesOver(source.stores, {
      dependencyContext: createLocalDependencyContext(source.stores),
      admission: LEGACY_EDIT_ADMISSION,
      clock: testClock,
      broadcast: silentBroadcaster(),
      scheduler: fastScheduler,
    });

    try {
      await source.stores.users.create(
        { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 },
        { at: 1, by: OWNER },
      );
      seedLegacyPackageParent(parentFixture, {
        organizationId: 'fixture-legacy-org',
        projectId: 'fixture-project',
        creator: OWNER,
      });
      await authorWorkingSteps(source, 'Dev');
      const workPackageId = expectCreated(
        await publicGraph.workPackages.create(
          'Ordered dependency writes',
          'fixture-project',
          OWNER,
        ),
      ).workPackage.id;
      for (const id of ['a', 'b', 'c', 'd', 'e']) {
        await source.stores.workItems.insert(workItemRow({ id, workPackageId }), [], {
          at: 2,
          by: OWNER,
        });
      }
      for (const edge of [
        { id: 'edge-a-b', workPackageId, predecessorId: 'a', successorId: 'b' },
        { id: 'edge-c-d', workPackageId, predecessorId: 'c', successorId: 'd' },
      ]) {
        await source.stores.dependencies.add(edge, { at: 2, by: OWNER });
      }

      const workingPlan = createWorkingPlan({ stores: source.stores }, workPackageId);
      const borrowed = await workingPlan.stores.dependencies.listByWorkPackage(workPackageId);
      const first = borrowed.at(0);
      if (first === undefined) throw new Error('dependency fixture returned no first edge');
      first.successorId = 'e';

      await workingPlan.stores.dependencies.add(
        { id: 'edge-a-e', workPackageId, predecessorId: 'a', successorId: 'e' },
        { at: 3, by: OWNER },
      );

      // Proof: inserting a new incident replacement beside the last retained
      // incident edge moved edge-c-d behind edge-a-e instead of keeping the
      // memory adapter's authoritative append order.
      expect(await workingPlan.stores.dependencies.listByWorkPackage(workPackageId)).toEqual(
        await source.stores.dependencies.listByWorkPackage(workPackageId),
      );
      expect(
        (await workingPlan.stores.dependencies.listByWorkPackage(workPackageId)).map(
          ({ id }) => id,
        ),
      ).toEqual(['edge-a-b', 'edge-c-d', 'edge-a-e']);

      await workingPlan.stores.dependencies.remove('a', 'b', { at: 4, by: OWNER });
      // Proof: delegating remove without refreshing both endpoints left
      // edge-a-b in this retained answer after the source deleted it.
      expect(await workingPlan.stores.dependencies.listByWorkPackage(workPackageId)).toEqual(
        await source.stores.dependencies.listByWorkPackage(workPackageId),
      );

      await workingPlan.stores.dependencies.removeAllFor(['a'], { at: 5, by: OWNER });
      // Proof: delegating removeAllFor without refreshing its captured
      // surviving endpoints left edge-a-e in the retained answer.
      expect(await workingPlan.stores.dependencies.listByWorkPackage(workPackageId)).toEqual(
        await source.stores.dependencies.listByWorkPackage(workPackageId),
      );
      workingPlan.close();
    } finally {
      await source.close();
    }
  });

  it('refreshes every restore-related collection and preserves borrowed before-images', async () => {
    const parentFixture = openMemorySourceFixture();
    const source = ownTestSource(parentFixture.source);
    const publicGraph = servicesOver(source.stores, {
      dependencyContext: createLocalDependencyContext(source.stores),
      admission: LEGACY_EDIT_ADMISSION,
      clock: testClock,
      broadcast: silentBroadcaster(),
      scheduler: fastScheduler,
    });

    try {
      await source.stores.users.create(
        { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 },
        { at: 1, by: OWNER },
      );
      seedLegacyPackageParent(parentFixture, {
        organizationId: 'fixture-legacy-org',
        projectId: 'fixture-project',
        creator: OWNER,
      });
      await authorWorkingSteps(source, 'Build');
      const createdWorkPackage = expectCreated(
        await publicGraph.workPackages.create('Retained subtree restore', 'fixture-project', OWNER),
      );
      const workPackageId = createdWorkPackage.workPackage.id;
      const stepId = createdWorkPackage.steps[0].id;

      for (const row of [
        workItemRow({ id: 'prior-parent', workPackageId, position: 10, name: 'Prior parent' }),
        workItemRow({ id: 'other-values', workPackageId, position: 20, name: 'Other values' }),
        workItemRow({ id: 'respaced', workPackageId, position: 30, name: 'Respaced' }),
        workItemRow({ id: 'old-parent', workPackageId, position: 40, name: 'Old parent' }),
        workItemRow({
          id: 'reparented',
          workPackageId,
          parentId: 'old-parent',
          position: 10,
          name: 'Reparented',
        }),
      ]) {
        await source.stores.workItems.insert(row, [], { at: 2, by: OWNER });
      }
      await source.stores.estimates.set(
        { workItemId: 'prior-parent', stepId, optimistic: 1, realistic: 2, pessimistic: 3 },
        { at: 2, by: OWNER },
      );
      await source.stores.actuals.set(
        { workItemId: 'other-values', stepId, days: 2, recordedAt: 2 },
        { at: 2, by: OWNER },
      );
      await source.stores.progress.set(
        { workItemId: 'other-values', stepId, state: 'done', statedAt: 2 },
        { at: 2, by: OWNER },
      );
      await source.stores.measures.set(
        {
          workItemId: 'other-values',
          stepId,
          metric: 'token_estimate',
          value: 5,
          recordedAt: 2,
        },
        { at: 2, by: OWNER },
      );

      const workingPlan = createWorkingPlan({ stores: source.stores }, workPackageId);
      const borrowed = await Promise.all([
        workingPlan.stores.workItems.listByWorkPackage(workPackageId),
        workingPlan.stores.estimates.listByWorkPackage(workPackageId),
        workingPlan.stores.actuals.listByWorkPackage(workPackageId),
        workingPlan.stores.progress.listByWorkPackage(workPackageId),
        workingPlan.stores.measures.listByWorkPackage(workPackageId),
        workingPlan.stores.dependencies.listByWorkPackage(workPackageId),
      ]);
      const before = structuredClone(borrowed);

      await workingPlan.stores.subtrees.insertSubtree(
        {
          rows: [
            workItemRow({ id: 'new-root', workPackageId, position: 15, name: 'Restored root' }),
            workItemRow({
              id: 'new-child',
              workPackageId,
              parentId: 'new-root',
              position: 10,
              name: 'Restored child',
            }),
          ],
          respaced: [{ id: 'respaced', position: 40 }],
          reparented: [{ id: 'reparented', parentId: 'new-root', position: 20 }],
          estimates: [
            { workItemId: 'new-child', stepId, optimistic: 3, realistic: 4, pessimistic: 5 },
          ],
          actuals: [{ workItemId: 'new-child', stepId, days: 4, recordedAt: 3 }],
          progress: [{ workItemId: 'new-child', stepId, state: 'in_progress', statedAt: 3 }],
          measures: [
            {
              workItemId: 'new-child',
              stepId,
              metric: 'token_estimate',
              value: 8,
              recordedAt: 3,
            },
          ],
          demands: [],
          assignments: [],
          dependencies: [
            {
              id: 'restored-edge',
              workPackageId,
              predecessorId: 'new-child',
              successorId: 'reparented',
            },
          ],
          removedEstimates: [{ workItemId: 'prior-parent', stepId }],
          removedActuals: [{ workItemId: 'other-values', stepId }],
          removedProgress: [{ workItemId: 'other-values', stepId }],
          removedMeasures: [{ workItemId: 'other-values', stepId, metric: 'token_estimate' }],
        },
        { at: 3, by: OWNER },
      );

      const retained = await Promise.all([
        workingPlan.stores.workItems.listByWorkPackage(workPackageId),
        workingPlan.stores.estimates.listByWorkPackage(workPackageId),
        workingPlan.stores.actuals.listByWorkPackage(workPackageId),
        workingPlan.stores.progress.listByWorkPackage(workPackageId),
        workingPlan.stores.measures.listByWorkPackage(workPackageId),
        workingPlan.stores.dependencies.listByWorkPackage(workPackageId),
      ]);
      const authoritative = await Promise.all([
        source.stores.workItems.listByWorkPackage(workPackageId),
        source.stores.estimates.listByWorkPackage(workPackageId),
        source.stores.actuals.listByWorkPackage(workPackageId),
        source.stores.progress.listByWorkPackage(workPackageId),
        source.stores.measures.listByWorkPackage(workPackageId),
        source.stores.dependencies.listByWorkPackage(workPackageId),
      ]);
      // Proof: omitting removedEstimates from the subtree refresh left this
      // prior parent carrying its old estimate immediately after insertion.
      expect(retained[1].some(({ workItemId }) => workItemId === 'prior-parent')).toBe(false);
      expect(retained).toEqual(authoritative);
      // Proof: mutating retained answers during refresh changed arrays already
      // borrowed as undo before-images instead of replacing cache entries.
      expect(borrowed).toEqual(before);
      workingPlan.close();
    } finally {
      await source.close();
    }
  });

  it('refreshes a labelled row and rejects an unrequested satellite row', async () => {
    const parentFixture = openMemorySourceFixture();
    const source = ownTestSource(parentFixture.source);
    const direct = silentBroadcaster();
    const publicGraph = servicesOver(source.stores, {
      dependencyContext: createLocalDependencyContext(source.stores),
      admission: LEGACY_EDIT_ADMISSION,
      clock: testClock,
      broadcast: direct,
      scheduler: fastScheduler,
    });

    try {
      await source.stores.users.create(
        { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 },
        { at: 1, by: OWNER },
      );
      seedLegacyPackageParent(parentFixture, {
        organizationId: 'fixture-legacy-org',
        projectId: 'fixture-project',
        creator: OWNER,
      });
      await authorWorkingSteps(source, 'Dev');
      const createdWorkPackage = expectCreated(
        await publicGraph.workPackages.create('Targeted label refresh', 'fixture-project', OWNER),
      );
      const workPackageId = createdWorkPackage.workPackage.id;
      const created = await publicGraph.workItems.create(workPackageId, OWNER, {
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
      const workingPlan = createWorkingPlan({ stores: source.stores }, workPackageId);
      await workingPlan.stores.workItems.listByWorkPackage(workPackageId);

      const patched = await workingPlan.stores.workItems.patch(
        created.value.id,
        { tagIds: [secondTag.id] },
        { at: 3, by: OWNER },
      );
      expect(patched.ok).toBe(true);
      expect(
        await workingPlan.stores.workItems.listByIds(workPackageId, [created.value.id]),
      ).toMatchObject([{ id: created.value.id, tagIds: [secondTag.id] }]);
      workingPlan.close();

      const sibling = await publicGraph.workItems.create(workPackageId, OWNER, {
        parentId: null,
        afterId: null,
        name: 'Unrequested estimate owner',
      });
      if (!sibling.ok) throw new Error('targeted estimate fixture creation refused');
      await source.stores.estimates.set(
        { workItemId: sibling.value.id, stepId: createdWorkPackage.steps[0].id, ...DAYS },
        { at: 4, by: OWNER },
      );
      const estimateStores: PlanTransactionalStores = {
        ...source.stores,
        estimates: {
          ...source.stores.estimates,
          // Inject the production fault: the targeted query ignores its IDs.
          listByWorkItems: (requestedWorkPackageId) =>
            source.stores.estimates.listByWorkPackage(requestedWorkPackageId),
        },
      };
      const estimatePlan = createWorkingPlan({ stores: estimateStores }, workPackageId);
      await estimatePlan.stores.estimates.listByWorkPackage(workPackageId);
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

  it('rejects dependencies outside the requested incident work package set', async () => {
    const parentFixture = openMemorySourceFixture();
    const source = ownTestSource(parentFixture.source);
    const direct = silentBroadcaster();
    const publicGraph = servicesOver(source.stores, {
      dependencyContext: createLocalDependencyContext(source.stores),
      admission: LEGACY_EDIT_ADMISSION,
      clock: testClock,
      broadcast: direct,
      scheduler: fastScheduler,
    });

    try {
      await source.stores.users.create(
        { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 },
        { at: 1, by: OWNER },
      );
      seedLegacyPackageParent(parentFixture, {
        organizationId: 'fixture-legacy-org',
        projectId: 'fixture-project',
        creator: OWNER,
      });
      await authorWorkingSteps(source, 'Dev');
      const workPackageId = expectCreated(
        await publicGraph.workPackages.create('Targeted edge refusal', 'fixture-project', OWNER),
      ).workPackage.id;
      const target = await publicGraph.workItems.create(workPackageId, OWNER, {
        parentId: null,
        afterId: null,
        name: 'Refresh target',
      });
      const predecessor = await publicGraph.workItems.create(workPackageId, OWNER, {
        parentId: null,
        afterId: null,
        name: 'Unrelated predecessor',
      });
      const successor = await publicGraph.workItems.create(workPackageId, OWNER, {
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
          workPackageId,
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
          listByWorkItems: (requestedWorkPackageId) =>
            source.stores.dependencies.listByWorkPackage(requestedWorkPackageId),
        },
      };
      const workingPlan = createWorkingPlan({ stores }, workPackageId);
      await workingPlan.stores.dependencies.listByWorkPackage(workPackageId);

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

      const crossWorkPackageStores: PlanTransactionalStores = {
        ...source.stores,
        dependencies: {
          ...source.stores.dependencies,
          // Inject the production fault: the targeted query returns another work package.
          listByWorkItems: (_requestedWorkPackageId, ids) =>
            Promise.resolve([
              {
                id: 'cross-work-package-targeted-edge',
                workPackageId: 'another-work-package',
                predecessorId: ids[0] ?? target.value.id,
                successorId: successor.value.id,
              },
            ]),
        },
      };
      const crossWorkPackagePlan = createWorkingPlan(
        { stores: crossWorkPackageStores },
        workPackageId,
      );
      await crossWorkPackagePlan.stores.dependencies.listByWorkPackage(workPackageId);
      // Proof: without the edge work package check, this resolved and retained the
      // other work package's edge in this work package's working collection.
      expect(
        crossWorkPackagePlan.stores.workItems.patch(
          target.value.id,
          { name: 'Trigger cross-work-package edge refresh' },
          { at: 4, by: OWNER },
        ),
      ).rejects.toThrow(/targeted dependency.*outside work package/i);
      crossWorkPackagePlan.close();
    } finally {
      await source.close();
    }
  });

  it('hydrates only the affected identity after ordinary single-row patches', async () => {
    const parentFixture = openMemorySourceFixture();
    const source = ownTestSource(parentFixture.source);
    const direct = silentBroadcaster();
    const publicGraph = servicesOver(source.stores, {
      dependencyContext: createLocalDependencyContext(source.stores),
      admission: LEGACY_EDIT_ADMISSION,
      clock: testClock,
      broadcast: direct,
      scheduler: fastScheduler,
    });

    try {
      await source.stores.users.create(
        { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 },
        { at: 1, by: OWNER },
      );
      seedLegacyPackageParent(parentFixture, {
        organizationId: 'fixture-legacy-org',
        projectId: 'fixture-project',
        creator: OWNER,
      });
      await authorWorkingSteps(source, 'Dev');
      const workPackageId = expectCreated(
        await publicGraph.workPackages.create('Bounded row refresh', 'fixture-project', OWNER),
      ).workPackage.id;
      const retainedCount = 200;
      for (let index = 0; index < retainedCount; index += 1) {
        await source.stores.workItems.insert(
          workItemRow({
            id: `row-${String(index).padStart(3, '0')}`,
            workPackageId,
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
          listByIds: async (requestedWorkPackageId, ids) => {
            const rows = await source.stores.workItems.listByIds(requestedWorkPackageId, ids);
            hydrationCardinality.push({ requested: ids.length, returned: rows.length });
            return rows;
          },
          listPlacements: (requestedWorkPackageId, ids) => {
            placementCalls += 1;
            return source.stores.workItems.listPlacements(requestedWorkPackageId, ids);
          },
        },
      };
      const workingPlan = createWorkingPlan({ stores }, workPackageId);
      expect(await workingPlan.stores.workItems.listByWorkPackage(workPackageId)).toHaveLength(
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
        (await workingPlan.stores.workItems.listByWorkPackage(workPackageId)).find(
          ({ id }) => id === 'row-117',
        ),
      ).toMatchObject({ name: 'Third patch' });
      workingPlan.close();
    } finally {
      await source.close();
    }
  });

  it('rejects work items outside the requested work package and identity set', async () => {
    const parentFixture = openMemorySourceFixture();
    const source = ownTestSource(parentFixture.source);
    const direct = silentBroadcaster();
    const publicGraph = servicesOver(source.stores, {
      dependencyContext: createLocalDependencyContext(source.stores),
      admission: LEGACY_EDIT_ADMISSION,
      clock: testClock,
      broadcast: direct,
      scheduler: fastScheduler,
    });

    try {
      await source.stores.users.create(
        { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 },
        { at: 1, by: OWNER },
      );
      seedLegacyPackageParent(parentFixture, {
        organizationId: 'fixture-legacy-org',
        projectId: 'fixture-project',
        creator: OWNER,
      });
      await authorWorkingSteps(source, 'Dev');
      const workPackageA = expectCreated(
        await publicGraph.workPackages.create('Targeted work package A', 'fixture-project', OWNER),
      ).workPackage.id;
      const workPackageB = expectCreated(
        await publicGraph.workPackages.create('Targeted work package B', 'fixture-project', OWNER),
      ).workPackage.id;
      const rowA = await publicGraph.workItems.create(workPackageA, OWNER, {
        parentId: null,
        afterId: null,
        name: 'Work package A row',
      });
      const rowB = await publicGraph.workItems.create(workPackageB, OWNER, {
        parentId: null,
        afterId: null,
        name: 'Work package B row',
      });
      if (!rowA.ok || !rowB.ok) throw new Error('targeted work package fixture creation refused');
      const stores: PlanTransactionalStores = {
        ...source.stores,
        workItems: {
          ...source.stores.workItems,
          // Inject the production fault: the targeted query uses work package B's constraint.
          listByIds: (_requestedWorkPackageId, ids) =>
            source.stores.workItems.listByIds(workPackageB, ids),
        },
      };
      const workingPlan = createWorkingPlan({ stores }, workPackageA);
      await workingPlan.stores.workItems.listByWorkPackage(workPackageA);

      // Proof: without the work package check on refreshed rows, this resolved and
      // inserted work package B's row into work package A's retained collection.
      expect(
        workingPlan.stores.workItems.patch(
          rowB.value.id,
          { name: 'Cross-work-package targeted row' },
          { at: 2, by: OWNER },
        ),
      ).rejects.toThrow(/targeted work item.*outside work package/i);
      expect(await workingPlan.stores.workItems.listByWorkPackage(workPackageA)).toMatchObject([
        { id: rowA.value.id, workPackageId: workPackageA },
      ]);
      workingPlan.close();

      const unrequestedStores: PlanTransactionalStores = {
        ...source.stores,
        workItems: {
          ...source.stores.workItems,
          // Inject the production fault: the targeted query returns a different ID.
          listByIds: async () =>
            (await source.stores.workItems.listByIds(workPackageB, [rowB.value.id])).map((row) => ({
              ...row,
              workPackageId: workPackageA,
            })),
        },
      };
      const unrequestedPlan = createWorkingPlan({ stores: unrequestedStores }, workPackageA);
      await unrequestedPlan.stores.workItems.listByWorkPackage(workPackageA);
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

describe('working plan value failures', () => {
  it('does not advance a retained value after a modeled set refusal', async () => {
    const parentFixture = openMemorySourceFixture();
    const source = ownTestSource(parentFixture.source);
    const publicGraph = servicesOver(source.stores, {
      dependencyContext: createLocalDependencyContext(source.stores),
      admission: LEGACY_EDIT_ADMISSION,
      clock: testClock,
      broadcast: silentBroadcaster(),
      scheduler: fastScheduler,
    });
    try {
      await source.stores.users.create(
        { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 },
        { at: 1, by: OWNER },
      );
      seedLegacyPackageParent(parentFixture, {
        organizationId: 'fixture-legacy-org',
        projectId: 'fixture-project',
        creator: OWNER,
      });
      await authorWorkingSteps(source, 'Build');
      const createdWorkPackage = expectCreated(
        await publicGraph.workPackages.create('Refused value refresh', 'fixture-project', OWNER),
      );
      const workPackageId = createdWorkPackage.workPackage.id;
      const stepId = createdWorkPackage.steps[0].id;

      const leaf = await publicGraph.workItems.create(workPackageId, OWNER, {
        parentId: null,
        afterId: null,
        name: 'Leaf',
      });
      if (!leaf.ok) throw new Error('refused value leaf creation refused');
      await source.stores.estimates.set(
        { workItemId: leaf.value.id, stepId, ...DAYS },
        { at: 2, by: OWNER },
      );
      const stores: PlanTransactionalStores = {
        ...source.stores,
        estimates: {
          ...source.stores.estimates,
          set: () => Promise.resolve('unknown_step'),
          listByWorkItems: async (requestedWorkPackageId, ids) =>
            (await source.stores.estimates.listByWorkItems(requestedWorkPackageId, ids)).map(
              (estimate) => ({ ...estimate, optimistic: 99 }),
            ),
        },
      };
      const workingPlan = createWorkingPlan({ stores }, workPackageId);
      await workingPlan.stores.estimates.listByWorkPackage(workPackageId);

      expect(
        await workingPlan.stores.estimates.set(
          { workItemId: leaf.value.id, stepId, optimistic: 7, realistic: 8, pessimistic: 9 },
          { at: 3, by: OWNER },
        ),
      ).toBe('unknown_step');
      // Proof: refreshing after the modeled refusal replaced the retained optimistic day with
      // the targeted reader's injected 99 even though the source refused the write.
      expect(await workingPlan.stores.estimates.listByWorkPackage(workPackageId)).toEqual([
        { workItemId: leaf.value.id, stepId, ...DAYS },
      ]);
      workingPlan.close();
    } finally {
      await source.close();
    }
  });

  it('does not advance a retained value before a throwing mutation succeeds', async () => {
    const parentFixture = openMemorySourceFixture();
    const source = ownTestSource(parentFixture.source);
    const publicGraph = servicesOver(source.stores, {
      dependencyContext: createLocalDependencyContext(source.stores),
      admission: LEGACY_EDIT_ADMISSION,
      clock: testClock,
      broadcast: silentBroadcaster(),
      scheduler: fastScheduler,
    });
    try {
      await source.stores.users.create(
        { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 },
        { at: 1, by: OWNER },
      );
      seedLegacyPackageParent(parentFixture, {
        organizationId: 'fixture-legacy-org',
        projectId: 'fixture-project',
        creator: OWNER,
      });
      await authorWorkingSteps(source, 'Build');
      const createdWorkPackage = expectCreated(
        await publicGraph.workPackages.create('Throwing value refresh', 'fixture-project', OWNER),
      );
      const workPackageId = createdWorkPackage.workPackage.id;
      const stepId = createdWorkPackage.steps[0].id;

      const leaf = await publicGraph.workItems.create(workPackageId, OWNER, {
        parentId: null,
        afterId: null,
        name: 'Leaf',
      });
      if (!leaf.ok) throw new Error('throwing value leaf creation refused');
      await source.stores.actuals.set(
        { workItemId: leaf.value.id, stepId, days: 2, recordedAt: 2 },
        { at: 2, by: OWNER },
      );
      const stores: PlanTransactionalStores = {
        ...source.stores,
        actuals: {
          ...source.stores.actuals,
          remove: () => Promise.reject(new Error('injected actual removal failure')),
          listByWorkItems: async (requestedWorkPackageId, ids) =>
            (await source.stores.actuals.listByWorkItems(requestedWorkPackageId, ids)).map(
              (actual) => ({
                ...actual,
                days: 99,
              }),
            ),
        },
      };
      const workingPlan = createWorkingPlan({ stores }, workPackageId);
      await workingPlan.stores.actuals.listByWorkPackage(workPackageId);

      expect(
        workingPlan.stores.actuals.remove(leaf.value.id, stepId, { at: 3, by: OWNER }),
      ).rejects.toThrow('injected actual removal failure');
      // Proof: refreshing before the throwing source mutation changed the retained days to the
      // targeted reader's injected 99 despite the write never succeeding.
      expect(await workingPlan.stores.actuals.listByWorkPackage(workPackageId)).toEqual([
        { workItemId: leaf.value.id, stepId, days: 2, recordedAt: 2 },
      ]);
      workingPlan.close();
    } finally {
      await source.close();
    }
  });

  it('does not advance retained edges before throwing dependency mutations succeed', async () => {
    const parentFixture = openMemorySourceFixture();
    const source = ownTestSource(parentFixture.source);
    const publicGraph = servicesOver(source.stores, {
      dependencyContext: createLocalDependencyContext(source.stores),
      admission: LEGACY_EDIT_ADMISSION,
      clock: testClock,
      broadcast: silentBroadcaster(),
      scheduler: fastScheduler,
    });
    try {
      await source.stores.users.create(
        { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 },
        { at: 1, by: OWNER },
      );
      seedLegacyPackageParent(parentFixture, {
        organizationId: 'fixture-legacy-org',
        projectId: 'fixture-project',
        creator: OWNER,
      });
      await authorWorkingSteps(source, 'Dev');
      const workPackageId = expectCreated(
        await publicGraph.workPackages.create(
          'Throwing dependency refresh',
          'fixture-project',
          OWNER,
        ),
      ).workPackage.id;
      for (const id of ['a', 'b', 'c']) {
        await source.stores.workItems.insert(workItemRow({ id, workPackageId }), [], {
          at: 2,
          by: OWNER,
        });
      }
      const storedEdge = {
        id: 'stored-edge',
        workPackageId,
        predecessorId: 'a',
        successorId: 'b',
      };
      await source.stores.dependencies.add(storedEdge, { at: 2, by: OWNER });
      const dependencies: PlanTransactionalStores['dependencies'] = {
        ...source.stores.dependencies,
        listByWorkItems: async (requestedWorkPackageId, ids) =>
          (await source.stores.dependencies.listByWorkItems(requestedWorkPackageId, ids)).map(
            (edge) => ({ ...edge, id: 'invented-before-success' }),
          ),
        add: () => Promise.reject(new Error('injected dependency add failure')),
        remove: () => Promise.reject(new Error('injected dependency remove failure')),
        removeAllFor: () => Promise.reject(new Error('injected dependency removeAllFor failure')),
      };
      const workingPlan = createWorkingPlan(
        { stores: { ...source.stores, dependencies } },
        workPackageId,
      );
      await workingPlan.stores.workItems.listByWorkPackage(workPackageId);
      await workingPlan.stores.dependencies.listByWorkPackage(workPackageId);

      expect(
        workingPlan.stores.dependencies.add(
          { id: 'new-edge', workPackageId, predecessorId: 'b', successorId: 'c' },
          { at: 3, by: OWNER },
        ),
      ).rejects.toThrow('injected dependency add failure');
      expect(
        workingPlan.stores.dependencies.remove('a', 'b', { at: 3, by: OWNER }),
      ).rejects.toThrow('injected dependency remove failure');
      expect(
        workingPlan.stores.dependencies.removeAllFor(['a'], { at: 3, by: OWNER }),
      ).rejects.toThrow('injected dependency removeAllFor failure');

      // Proof: moving an edge refresh ahead of its source write replaced this
      // retained id with invented-before-success before the injected throw.
      expect(await workingPlan.stores.dependencies.listByWorkPackage(workPackageId)).toEqual([
        storedEdge,
      ]);
      workingPlan.close();
    } finally {
      await source.close();
    }
  });
});

it('refreshes only retained owner rows after external typed writes and representation changes', async () => {
  const parentFixture = openMemorySourceFixture();
  const source = ownTestSource(parentFixture.source);
  await source.stores.users.create(
    { id: OWNER, username: OWNER, passwordHash: null, createdAt: 1 },
    { at: 1, by: OWNER },
  );
  seedLegacyPackageParent(parentFixture, {
    organizationId: 'fixture-legacy-org',
    projectId: 'fixture-project',
    creator: OWNER,
  });
  await source.stores.workPackages.create(
    workPackageRow({ id: 'a', projectId: 'fixture-project' }),
    [],
    {
      at: 1,
      by: OWNER,
    },
  );
  await source.stores.workPackages.create(
    workPackageRow({ id: 'b', projectId: 'fixture-project' }),
    [],
    {
      at: 1,
      by: OWNER,
    },
  );
  for (const row of [
    workItemRow({ id: 'A', workPackageId: 'a' }),
    workItemRow({ id: 'B', workPackageId: 'b' }),
    workItemRow({ id: 'C', workPackageId: 'b', position: 20 }),
  ])
    await source.stores.workItems.insert(row, [], { at: 1, by: OWNER });
  const changed = await source.uow
    .run(async (scope) => {
      const workItems = new Proxy(scope.stores.workItems, {
        get(target, key) {
          if (key === 'listByIds')
            return async (owner: string, ids: readonly string[]) => {
              if (ids.includes('A'))
                throw new Error('retained owner refresh requested a remote identity');
              return target.listByIds(owner, ids);
            };
          const member: unknown = Reflect.get(target, key);
          if (typeof member === 'function')
            return (...args: unknown[]): unknown => Reflect.apply(member, target, args);
          return member;
        },
      });
      const plan = createWorkingPlan({ stores: { ...scope.stores, workItems } }, 'b');
      try {
        expect((await plan.stores.workItems.listByWorkPackage('b')).map((row) => row.id)).toEqual([
          'B',
          'C',
        ]);
        const relationship = {
          id: 'external',
          workPackageId: 'b',
          predecessor: { workPackageId: 'a', scope: 'whole' as const, workItemId: 'A' },
          successor: { workPackageId: 'b', scope: 'whole' as const, workItemId: 'B' },
          type: 'FS' as const,
        };
        await plan.stores.typedDependencies.add(relationship, { at: 2, by: OWNER });
        await plan.stores.typedDependencies.update(
          { ...relationship, predecessor: { workPackageId: 'b', scope: 'whole', workItemId: 'C' } },
          { at: 3, by: OWNER },
        );
        await plan.stores.typedDependencies.update(relationship, { at: 4, by: OWNER });
        await plan.stores.typedDependencies.remove(relationship.id, { at: 5, by: OWNER });
        expect(await plan.stores.workItems.listByWorkPackage('b')).toEqual(
          await scope.stores.workItems.listByWorkPackage('b'),
        );
        expect(await refusesCall(() => plan.stores.workItems.listByIds('a', ['A']))).toBe(true);
        return { commit: true, value: undefined };
      } finally {
        plan.close();
      }
    })
    .then(
      () => null,
      (cause: unknown) => cause,
    );
  expect(changed).toBeNull();
  await source.close();
});

it('borrows permanent runtime storage only during the working plan lifetime', async () => {
  const parentFixture = openMemorySourceFixture();
  const source = ownTestSource(parentFixture.source);
  try {
    await source.uow.run(async (scope) => {
      const workingPlan = createWorkingPlan(scope, 'runtime-work-package');
      expect(workingPlan.stores.runtimeCommands).toBe(scope.stores.runtimeCommands);
      expect(await workingPlan.stores.runtimeCommands.inspectLedger()).toMatchObject({
        schemaVersion: 1,
      });
      workingPlan.close();
      expect(() => workingPlan.stores.runtimeCommands).toThrow('closed');
      return { commit: true, value: undefined };
    });
  } finally {
    await source.close();
  }
});

for (const method of ['effectiveRoleAt', 'readablePackageIds'] as const) {
  it(
    'refuses a retained ' + method + ' call before touching the grant port after plan close',
    async () => {
      const parentFixture = openMemorySourceFixture();
      const source = ownTestSource(parentFixture.source);
      let reads = 0;
      const decisions: AccessDecisions = {
        packageTargetOf: () =>
          Promise.reject(new Error('lifetime fixture reads no package target')),
        effectiveRoleAt: () => {
          reads += 1;
          return Promise.resolve({ permissions: new Set(), via: [] });
        },
        readablePackageIds: () => {
          reads += 1;
          return Promise.resolve(new Set<string>());
        },
      };
      const plan = createWorkingPlan(
        { stores: { ...source.stores, accessDecisions: decisions } },
        'work-package-a',
      );
      const retained = plan.stores.accessDecisions;
      if (retained === undefined) throw new Error('fixture grant port disappeared');
      plan.close();
      const pending =
        method === 'effectiveRoleAt'
          ? retained.effectiveRoleAt(
              { id: 'actor' },
              { kind: 'organization', organizationId: 'org-a' },
            )
          : retained.readablePackageIds({ id: 'actor' }, 'org-a');
      expect(
        await pending.then(
          () => 'unexpected success',
          (failure: unknown) => (failure instanceof Error ? failure.message : failure),
        ),
      ).toContain('closed');
      expect(reads).toBe(0);
    },
  );

  it('refuses a suspended ' + method + ' answer after plan close', async () => {
    const parentFixture = openMemorySourceFixture();
    const source = ownTestSource(parentFixture.source);
    const entered = Promise.withResolvers<undefined>();
    const released = Promise.withResolvers<undefined>();
    const decisions: AccessDecisions = {
      packageTargetOf: () => Promise.reject(new Error('lifetime fixture reads no package target')),
      effectiveRoleAt: async () => {
        entered.resolve(undefined);
        await released.promise;
        return { permissions: new Set(), via: [] };
      },
      readablePackageIds: async () => {
        entered.resolve(undefined);
        await released.promise;
        return new Set<string>();
      },
    };
    const plan = createWorkingPlan(
      { stores: { ...source.stores, accessDecisions: decisions } },
      'work-package-a',
    );
    const retained = plan.stores.accessDecisions;
    if (retained === undefined) throw new Error('fixture grant port disappeared');
    const pending =
      method === 'effectiveRoleAt'
        ? retained.effectiveRoleAt(
            { id: 'actor' },
            { kind: 'organization', organizationId: 'org-a' },
          )
        : retained.readablePackageIds({ id: 'actor' }, 'org-a');
    await entered.promise;
    plan.close();
    released.resolve(undefined);
    expect(
      await pending.then(
        () => 'unexpected success',
        (failure: unknown) => (failure instanceof Error ? failure.message : failure),
      ),
    ).toContain('closed');
  });
}

it('refuses to hand out its grant capability after plan close', () => {
  const parentFixture = openMemorySourceFixture();
  const source = ownTestSource(parentFixture.source);
  const plan = createWorkingPlan({ stores: source.stores }, 'work-package-a');
  plan.close();
  expect(() => plan.stores.accessDecisions).toThrow('closed');
});
