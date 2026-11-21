import type { openMemorySource } from '@wbs/store-memory';
import { openMemorySourceFixture } from '@wbs/store-memory/source';
import { openLegacyMemoryHistory } from '@wbs/store-memory/testing/legacy-memory-history';
import { ownTestSource } from '@wbs/store-memory/testing/owned-source-fixture';
import { describe, expect, it } from 'bun:test';

import { servicesOver } from '../../compose';
import { clockOf } from '../../ports/clock';
import { LEGACY_EDIT_ADMISSION } from '../../ports/edit-admission';
import type { PlanTransactionalStores } from '../../ports/stores';
import type { Decision, Scope, UnitOfWork } from '../../ports/unit-of-work';
import type { Broadcaster } from '../../ports/work-package-event';
import { createLocalDependencyContext } from '../../service/dependency-context';
import type { PlanCommand } from '../../service/plan-command';
import { bindFixtureSteps } from '../../testing/bound-package-fixture';
import { testClock } from '../../testing/clock-fixture';
import { expectCreated } from '../../testing/expect-created';
import { seedLegacyPackageParent } from '../../testing/legacy-package-source-fixture';
import { localCommandAccess } from '../../testing/organization-access-fixture';
import { fastScheduler } from '../../testing/scheduler-fixture';
import { workItemRow } from '../../testing/work-item-fixture';
import { createPlanCommandRunner } from './composition';
import type { PlanCommandRunner } from './plan-commands.feature';
import { createWorkingPlan } from './working-plan.resource';

const OWNER = 'plan-command-owner';

/** Authors this runner fixture's explicit project catalogue before current package creation. */
async function authorRunnerSteps(
  source: ReturnType<typeof openMemorySource>,
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
                id: 'runner-dev',
                name: 'Dev',
                code: 'dev',
                position: 10,
                defaultEstimateUnit: 'workdays',
                defaultAllowancePercent: 0,
              }
            : {
                id: 'runner-build',
                name: 'Build',
                code: 'build',
                position: 10,
                defaultEstimateUnit: 'workdays',
                defaultAllowancePercent: 0,
              },
        binding: {
          bindingId: 'runner-first-binding',
          scopeKind: 'project',
          scopeId: 'fixture-project',
          workItemTypeId: null,
          position: 10,
        },
      },
      {
        definition: {
          id: 'runner-qa',
          name: 'QA',
          code: 'qa',
          position: 20,
          defaultEstimateUnit: 'workdays',
          defaultAllowancePercent: 0,
        },
        binding: {
          bindingId: 'runner-qa-binding',
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

const compose = (stores: PlanTransactionalStores, broadcast: Broadcaster) =>
  servicesOver(stores, {
    dependencyContext: createLocalDependencyContext(stores),
    admission: LEGACY_EDIT_ADMISSION,
    clock: testClock,
    broadcast,
    scheduler: fastScheduler,
  });

function runnerOver(
  source: ReturnType<typeof openMemorySource>,
  publicGraph: ReturnType<typeof compose>,
  uow: UnitOfWork = source.uow,
  batchServices: (scope: Scope, broadcast: Broadcaster) => ReturnType<typeof compose> = (
    scope,
    broadcast,
  ) => compose(scope.stores, broadcast),
): PlanCommandRunner {
  return createPlanCommandRunner({
    commandAccess: localCommandAccess,
    uow,
    announcements: silentBroadcaster(),
    publicServices: publicGraph,
    batchServices,
  });
}

function captureAdmittedStores(uow: UnitOfWork): {
  readonly uow: UnitOfWork;
  readonly current: () => PlanTransactionalStores;
} {
  let admitted: PlanTransactionalStores | undefined;
  return {
    uow: {
      run<T>(act: (scope: Scope) => Promise<Decision<T>>): Promise<T> {
        return uow.run((scope) => {
          admitted = scope.stores;
          return act(scope);
        });
      },
    },
    current: () => {
      if (admitted === undefined) throw new Error('batch graph built before admission');
      return admitted;
    },
  };
}

describe('working plan batch ownership', () => {
  async function seededEstimate() {
    const parentFixture = openMemorySourceFixture();
    const source = ownTestSource(parentFixture.source);
    const direct = silentBroadcaster();
    const publicGraph = compose(source.stores, direct);
    await source.stores.users.create(
      { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 },
      { at: 1, by: OWNER },
    );
    seedLegacyPackageParent(parentFixture, {
      organizationId: 'fixture-legacy-org',
      projectId: 'fixture-project',
      creator: OWNER,
    });
    await authorRunnerSteps(source, 'Dev');
    const createdWorkPackage = expectCreated(
      await publicGraph.workPackages.create('Working plan ownership', 'fixture-project', OWNER),
    );
    const workPackageId = createdWorkPackage.workPackage.id;
    const stepId = createdWorkPackage.steps[0].id;

    const created = await publicGraph.workItems.create(workPackageId, OWNER, {
      parentId: null,
      afterId: null,
      name: 'Owned estimate',
    });
    if (!created.ok) throw new Error('working plan ownership row creation refused');
    await publicGraph.workItems.setEstimate(created.value.id, OWNER, stepId, {
      optimistic: 1,
      realistic: 2,
      pessimistic: 3,
    });
    return { source, direct, publicGraph, workPackageId, stepId, workItemId: created.value.id };
  }

  it('refuses then runs another batch without leaked values', async () => {
    const fixture = await seededEstimate();
    const { source, publicGraph, workPackageId, stepId, workItemId } = fixture;
    const runner = runnerOver(source, publicGraph);

    try {
      expect(
        await runner.run(workPackageId, OWNER, [
          {
            kind: 'setEstimate',
            workItemId,
            stepId,
            days: { optimistic: 4, realistic: 5, pessimistic: 6 },
          },
          {
            kind: 'setEstimate',
            workItemId: 'missing-row',
            stepId,
            days: { optimistic: 7, realistic: 8, pessimistic: 9 },
          },
        ]),
      ).toMatchObject({ ok: false, at: 1, reason: 'not_found' });
      expect(
        await source.stores.estimates.listByWorkItems(workPackageId, [workItemId]),
      ).toMatchObject([{ optimistic: 1, realistic: 2, pessimistic: 3 }]);

      expect(
        await runner.run(workPackageId, OWNER, [
          {
            kind: 'setEstimate',
            workItemId,
            stepId,
            days: { optimistic: 10, realistic: 11, pessimistic: 12 },
          },
        ]),
      ).toMatchObject({ ok: true });
      expect(await runner.undo(workPackageId, OWNER)).toMatchObject({ ok: true });
      expect(
        await source.stores.estimates.listByWorkItems(workPackageId, [workItemId]),
      ).toMatchObject([{ optimistic: 1, realistic: 2, pessimistic: 3 }]);
    } finally {
      await source.close();
    }
  });

  it('ordinary write between batches is the next before-image', async () => {
    const fixture = await seededEstimate();
    const { source, publicGraph, workPackageId, stepId, workItemId } = fixture;
    const runner = runnerOver(source, publicGraph);

    try {
      expect(
        await runner.run(workPackageId, OWNER, [
          {
            kind: 'setEstimate',
            workItemId,
            stepId,
            days: { optimistic: 4, realistic: 5, pessimistic: 6 },
          },
        ]),
      ).toMatchObject({ ok: true });
      expect(
        (
          await publicGraph.workItems.setEstimate(workItemId, OWNER, stepId, {
            optimistic: 7,
            realistic: 8,
            pessimistic: 9,
          })
        ).ok,
      ).toBe(true);
      expect(
        await runner.run(workPackageId, OWNER, [
          {
            kind: 'setEstimate',
            workItemId,
            stepId,
            days: { optimistic: 10, realistic: 11, pessimistic: 12 },
          },
        ]),
      ).toMatchObject({ ok: true });

      expect(await runner.undo(workPackageId, OWNER)).toMatchObject({ ok: true });
      // Proof: reusing the previous batch's working graph restored its stale
      // 4/5/6 estimate here instead of the intervening ordinary write.
      expect(
        await source.stores.estimates.listByWorkItems(workPackageId, [workItemId]),
      ).toMatchObject([{ optimistic: 7, realistic: 8, pessimistic: 9 }]);
    } finally {
      await source.close();
    }
  });

  it('closes the admitted graph after success, refusal, and throw', async () => {
    const fixture = await seededEstimate();
    const { source, publicGraph, workPackageId, stepId, workItemId } = fixture;
    const retainedReads: (() => Promise<unknown>)[] = [];
    const capture = (scope: Scope, broadcast: Broadcaster) => {
      retainedReads.push(() => scope.stores.workItems.listByWorkPackage(workPackageId));
      return compose(scope.stores, broadcast);
    };
    const runner = runnerOver(source, publicGraph, source.uow, capture);

    try {
      expect(await runner.run(workPackageId, OWNER, [])).toMatchObject({ ok: true });
      expect(
        await runner.run(workPackageId, OWNER, [
          {
            kind: 'setEstimate',
            workItemId: 'missing-row',
            stepId,
            days: { optimistic: 1, realistic: 1, pessimistic: 1 },
          },
        ]),
      ).toMatchObject({ ok: false });

      const throwingUow: UnitOfWork = {
        run: (act) =>
          source.uow.run((scope) =>
            act({
              stores: {
                ...scope.stores,
                estimates: {
                  ...scope.stores.estimates,
                  set: () => Promise.reject(new Error('injected estimate failure')),
                },
              },
            }),
          ),
      };
      const throwingRunner = runnerOver(source, publicGraph, throwingUow, capture);
      expect(
        throwingRunner.run(workPackageId, OWNER, [
          {
            kind: 'setEstimate',
            workItemId,
            stepId,
            days: { optimistic: 4, realistic: 5, pessimistic: 6 },
          },
        ]),
      ).rejects.toThrow('injected estimate failure');

      expect(retainedReads).toHaveLength(3);
      for (const read of retainedReads) {
        // Proof: passing the original admitted scope to the service factory
        // let each callback keep reading after its terminal path settled.
        expect(read()).rejects.toThrow(/Working plan .* is closed/);
      }
      expect(await source.stores.workItems.listByWorkPackage(workPackageId)).toHaveLength(1);
    } finally {
      await source.close();
    }
  });

  it('announces after commit through the nonworking graph', async () => {
    const fixture = await seededEstimate();
    const { source, direct, publicGraph, workPackageId, stepId, workItemId } = fixture;
    let retainedRead: (() => Promise<unknown>) | undefined;
    let announcements = 0;
    const announceTreeNow = publicGraph.workItems.announceTreeNow.bind(publicGraph.workItems);
    publicGraph.workItems.announceTreeNow = async (announcedWorkPackageId: string) => {
      if (retainedRead === undefined) throw new Error('after-commit announce ran before batch');
      expect(retainedRead()).rejects.toThrow(/Working plan .* is closed/);
      expect(await source.stores.workItems.listByWorkPackage(announcedWorkPackageId)).toHaveLength(
        1,
      );
      announcements += 1;
      await announceTreeNow(announcedWorkPackageId);
    };
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

    try {
      let runFailure: unknown;
      const outcome = await runner
        .run(workPackageId, OWNER, [
          {
            kind: 'setEstimate',
            workItemId,
            stepId,
            days: { optimistic: 4, realistic: 5, pessimistic: 6 },
          },
        ])
        .catch((cause: unknown) => {
          runFailure = cause;
          return undefined;
        });
      // Proof: substituting the closed admitted graph for `publicServices` after commit
      // produced `{ announcements: 0, failure: "Working plan ... is closed" }` here.
      expect({
        announcements,
        failure: runFailure instanceof Error ? runFailure.message : runFailure,
      }).toEqual({ announcements: 1, failure: undefined });
      expect(outcome).toMatchObject({ ok: true });
    } finally {
      await source.close();
    }
  });
});

describe('working plan command before-images', () => {
  it('two patches undo to the value before the batch', async () => {
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
      await authorRunnerSteps(source, 'Dev');
      const workPackageId = expectCreated(
        await publicGraph.workPackages.create('Detached before-images', 'fixture-project', OWNER),
      ).workPackage.id;
      const created = await publicGraph.workItems.create(workPackageId, OWNER, {
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
      const runner = createPlanCommandRunner({
        commandAccess: localCommandAccess,
        uow: source.uow,
        announcements: direct,
        publicServices: publicGraph,
        batchServices(scope, broadcast) {
          const borrowedRows = scope.stores.workItems.listByWorkPackage(workPackageId);
          let didMutateBorrowedBefore = false;
          const workItems = {
            ...scope.stores.workItems,
            listByWorkPackage: async (requestedWorkPackageId: string) => {
              if (!didMutateBorrowedBefore) {
                const borrowed = (await borrowedRows).find(({ id }) => id === created.value.id);
                if (borrowed === undefined) throw new Error('working plan omitted the fixture row');
                borrowed.name = 'Mutated cached name';
                // This test models a hostile caller mutating a readonly answer at runtime.
                (borrowed.tagIds as string[]).splice(0, borrowed.tagIds.length, secondTag.id);
                didMutateBorrowedBefore = true;
              }
              return scope.stores.workItems.listByWorkPackage(requestedWorkPackageId);
            },
            patch: async (
              ...parameters: Parameters<PlanTransactionalStores['workItems']['patch']>
            ) => {
              const written = await scope.stores.workItems.patch(...parameters);
              if (written.ok) {
                const refreshed = await scope.stores.workItems.listByIds(workPackageId, [
                  parameters[0],
                ]);
                const row = refreshed.at(0);
                if (row === undefined) throw new Error('targeted refresh omitted the patched row');
                observedTagSets.push([...row.tagIds]);
              }
              return written;
            },
          };
          const stores: PlanTransactionalStores = { ...scope.stores, workItems };
          return compose(stores, broadcast);
        },
      });

      const patched = await runner.run(workPackageId, OWNER, [
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
      expect(
        await source.stores.workItems.listByIds(workPackageId, [created.value.id]),
      ).toMatchObject([{ name: 'Second patch', tagIds: [secondTag.id] }]);

      expect(await runner.undo(workPackageId, OWNER)).toMatchObject({ ok: true });
      // Proof: returning the retained cache object directly lets the deliberate
      // mutation above alter the first patch's before-image; undo then restores
      // `Mutated cached name` and the second tag instead of these original values.
      expect(
        await source.stores.workItems.listByIds(workPackageId, [created.value.id]),
      ).toMatchObject([{ name: 'Before batch', tagIds: [originalTag.id] }]);
    } finally {
      await source.close();
    }
  });
});

describe('working plan directory mutations through runner commands', () => {
  it('delegates person reads and target-refreshes an assignment before the next patch', async () => {
    const parentFixture = openMemorySourceFixture();
    const source = ownTestSource(parentFixture.source);
    const direct = silentBroadcaster();
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
      await authorRunnerSteps(source, 'Dev');
      const createdWorkPackage = expectCreated(
        await publicGraph.workPackages.create('Assignment refresh', 'fixture-project', OWNER),
      );
      const workPackageId = createdWorkPackage.workPackage.id;
      const stepId = createdWorkPackage.steps[0].id;
      const row = await publicGraph.workItems.create(workPackageId, OWNER, {
        parentId: null,
        afterId: null,
        name: 'Before assignment',
      });
      if (!row.ok) throw new Error('assignment refresh row creation refused');

      const targetedHydrations: string[][] = [];
      let placementCalls = 0;
      let fullReads = 0;
      const countedUow: UnitOfWork = {
        run<T>(act: (scope: Scope) => Promise<Decision<T>>): Promise<T> {
          return source.uow.run((scope) =>
            act({
              stores: {
                ...scope.stores,
                workItems: {
                  ...scope.stores.workItems,
                  listByWorkPackage: (requestedWorkPackageId) => {
                    fullReads += 1;
                    return scope.stores.workItems.listByWorkPackage(requestedWorkPackageId);
                  },
                  listByIds: (requestedWorkPackageId, ids) => {
                    targetedHydrations.push([...ids]);
                    return scope.stores.workItems.listByIds(requestedWorkPackageId, ids);
                  },
                  listPlacements: (requestedWorkPackageId, ids) => {
                    placementCalls += 1;
                    return scope.stores.workItems.listPlacements(requestedWorkPackageId, ids);
                  },
                },
              },
            }),
          );
        },
      };
      let readsAfterAssign: { full: number; targeted: number; placements: number } | undefined;
      const runner = runnerOver(source, publicGraph, countedUow, (scope, broadcast) => {
        const directory = {
          ...scope.stores.directory,
          assign: async (
            ...parameters: Parameters<PlanTransactionalStores['directory']['assign']>
          ) => {
            const written = await scope.stores.directory.assign(...parameters);
            if (written.ok) {
              readsAfterAssign = {
                full: fullReads,
                targeted: targetedHydrations.length,
                placements: placementCalls,
              };
            }
            return written;
          },
        };
        return compose({ ...scope.stores, directory }, broadcast);
      });

      const createdAndAssigned = await runner.run(workPackageId, OWNER, [
        { kind: 'createPerson', ref: 'created-person', name: 'Created in batch', teamIds: [] },
        {
          kind: 'setAssignee',
          workItemId: row.value.id,
          stepId,
          personId: null,
          personRef: 'created-person',
        },
      ]);
      expect(createdAndAssigned).toMatchObject({ ok: true });
      const createdPersonId = createdAndAssigned.ok ? createdAndAssigned.results[0]?.id : undefined;
      if (createdPersonId === undefined) throw new Error('createPerson returned no person id');
      expect(await source.stores.directory.assignmentsFor(row.value.id)).toEqual([
        { workItemId: row.value.id, stepId, personId: createdPersonId },
      ]);

      const replacement = await publicGraph.directory.addPerson(OWNER, 'Replacement', []);
      if (!replacement.ok) throw new Error('replacement person creation refused');
      const assignedAndPatched = await runner.run(workPackageId, OWNER, [
        {
          kind: 'setAssignee',
          workItemId: row.value.id,
          stepId,
          personId: replacement.value.id,
        },
        {
          kind: 'patchWorkItem',
          workItemId: row.value.id,
          patch: { name: 'After assignment' },
        },
      ]);

      expect(assignedAndPatched).toMatchObject({ ok: true });
      expect(readsAfterAssign).toEqual({ full: 2, targeted: 2, placements: 0 });
      expect(targetedHydrations).toEqual([[row.value.id], [row.value.id], [row.value.id]]);
      const journal = (
        await source.stores.journal.entriesFor({ workPackageId, userId: OWNER, personId: null })
      ).at(0);
      if (journal === undefined) throw new Error('assignment batch wrote no journal entry');
      expect(await runner.undo(workPackageId, OWNER)).toMatchObject({ ok: true });
      expect(await source.stores.directory.assignmentsFor(row.value.id)).toEqual([
        { workItemId: row.value.id, stepId, personId: createdPersonId },
      ]);
      expect(await source.stores.workItems.listByIds(workPackageId, [row.value.id])).toMatchObject([
        { id: row.value.id, name: 'Before assignment' },
      ]);
    } finally {
      await source.close();
    }
  });

  it('runs a team cascade before the next patch through the memory working graph', async () => {
    const parentFixture = openMemorySourceFixture();
    const source = ownTestSource(parentFixture.source);
    const direct = silentBroadcaster();
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
      await authorRunnerSteps(source, 'Dev');
      const workPackageId = expectCreated(
        await publicGraph.workPackages.create(
          'Directory cascade refresh',
          'fixture-project',
          OWNER,
        ),
      ).workPackage.id;
      const team = await publicGraph.directory.addTeam(OWNER, 'Removed team');
      if (team === null) throw new Error('cascade team creation refused');
      const row = await publicGraph.workItems.create(workPackageId, OWNER, {
        parentId: null,
        afterId: null,
        name: 'Before cascade',
      });
      if (!row.ok) throw new Error('cascade row creation refused');
      const labelled = await publicGraph.workItems.patch(row.value.id, OWNER, {
        teamIds: [team.id],
      });
      if (!labelled.ok) throw new Error('cascade row labelling refused');

      const runner = runnerOver(source, publicGraph, source.uow, (scope, broadcast) => {
        const directory = {
          ...scope.stores.directory,
          removeTeam: async (
            ...parameters: Parameters<PlanTransactionalStores['directory']['removeTeam']>
          ) => {
            return scope.stores.directory.removeTeam(...parameters);
          },
        };
        return compose({ ...scope.stores, directory }, broadcast);
      });

      expect(
        await runner.run(workPackageId, OWNER, [
          { kind: 'deleteTeam', teamId: team.id, cascade: true },
          {
            kind: 'patchWorkItem',
            workItemId: row.value.id,
            patch: { name: 'After cascade' },
          },
        ]),
      ).toMatchObject({ ok: true });

      expect(await source.stores.workItems.listByIds(workPackageId, [row.value.id])).toMatchObject([
        { id: row.value.id, name: 'After cascade' },
      ]);
    } finally {
      await source.close();
    }
  });
});

describe('working plan dependency mutations through runner commands', () => {
  it('lets a later command read the committed FF type after an edit', async () => {
    const parentFixture = openMemorySourceFixture();
    const source = ownTestSource(parentFixture.source);
    const direct = silentBroadcaster();
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
      await authorRunnerSteps(source, 'Dev');
      const createdWorkPackage = expectCreated(
        await publicGraph.workPackages.create('Typed working plan', 'fixture-project', OWNER),
      );
      const workPackageId = createdWorkPackage.workPackage.id;
      const predecessor = await publicGraph.workItems.create(workPackageId, OWNER, {
        parentId: null,
        afterId: null,
        name: 'Predecessor',
      });
      const successor = await publicGraph.workItems.create(workPackageId, OWNER, {
        parentId: null,
        afterId: null,
        name: 'Successor',
      });
      if (!predecessor.ok || !successor.ok) throw new Error('typed fixture creation refused');
      const first = { workPackageId, scope: 'whole' as const, workItemId: predecessor.value.id };
      const second = { workPackageId, scope: 'whole' as const, workItemId: successor.value.id };
      const firstNode = {
        workPackageId,
        scope: 'node' as const,
        workItemId: predecessor.value.id,
        stepId: createdWorkPackage.steps[0].id,
      };
      await source.stores.typedDependencies.add(
        { id: 'typed-working', workPackageId, predecessor: first, successor: second, type: 'FS' },
        { at: 1, by: OWNER },
      );
      let updates = 0;
      const observedAfterEdit: Awaited<
        ReturnType<PlanTransactionalStores['typedDependencies']['listByWorkPackage']>
      >[number][] = [];
      const observedLabels: string[][] = [];
      const runner = runnerOver(source, publicGraph, source.uow, (scope, broadcast) => {
        const workItems = {
          ...scope.stores.workItems,
          listByWorkPackage: async (requestedWorkPackageId: string) => {
            const rows = await scope.stores.workItems.listByWorkPackage(requestedWorkPackageId);
            if (updates === 1) observedLabels.push(rows.map((row) => row.name));
            return rows;
          },
        };
        // Retained incidents intentionally throws when read; observing two methods
        // must preserve the getter without evaluating it during fixture composition.
        const typedDependencies = new Proxy(scope.stores.typedDependencies, {
          get(dependencies, property) {
            if (property === 'listByWorkPackage')
              return async (requestedWorkPackageId: string) => {
                const rows = await dependencies.listByWorkPackage(requestedWorkPackageId);
                if (updates === 1) observedAfterEdit.push(...rows);
                return rows;
              };
            if (property === 'update')
              return async (
                ...parameters: Parameters<PlanTransactionalStores['typedDependencies']['update']>
              ) => {
                await dependencies.update(...parameters);
                updates += 1;
              };
            return Reflect.get(dependencies, property, dependencies) as unknown;
          },
        });
        return compose({ ...scope.stores, workItems, typedDependencies }, broadcast);
      });
      const committed = await runner.run(workPackageId, OWNER, [
        {
          kind: 'updateTypedDependency',
          dependencyId: 'typed-working',
          predecessor: firstNode,
          successor: second,
          type: 'FF',
        },
        {
          kind: 'updateTypedDependency',
          dependencyId: 'typed-working',
          predecessor: firstNode,
          successor: second,
          type: 'SS',
        },
      ]);
      expect(committed).toMatchObject({ ok: true });
      expect(observedAfterEdit).toContainEqual({
        id: 'typed-working',
        workPackageId,
        predecessor: firstNode,
        successor: second,
        type: 'FF',
      });
      expect(observedLabels).toContainEqual(['Predecessor', 'Successor']);
      expect(await source.stores.typedDependencies.listByWorkPackage(workPackageId)).toMatchObject([
        { id: 'typed-working', type: 'SS' },
      ]);
      const refused = await runner.run(workPackageId, OWNER, [
        {
          kind: 'addTypedDependency',
          predecessor: second,
          successor: first,
          type: 'FS',
        },
      ]);
      expect(refused).toMatchObject({ ok: false, at: 0, reason: 'cycle' });
      expect(await source.stores.typedDependencies.listByWorkPackage(workPackageId)).toMatchObject([
        { id: 'typed-working', predecessor: firstNode, successor: second, type: 'SS' },
      ]);
      await source.stores.estimates.set(
        {
          workItemId: successor.value.id,
          stepId: createdWorkPackage.steps[0].id,
          optimistic: 2,
          realistic: 2,
          pessimistic: 2,
        },
        { at: 2, by: OWNER },
      );
      await source.stores.typedDependencies.add(
        { id: 'typed-fs', workPackageId, predecessor: first, successor: second, type: 'FS' },
        { at: 2, by: OWNER },
      );
      const retained = createWorkingPlan({ stores: source.stores }, workPackageId);
      try {
        const beforeRefusal =
          await retained.stores.typedDependencies.listByWorkPackage(workPackageId);
        const graph = compose(retained.stores, direct);
        const refusedFinish = await graph.workItems.addTypedDependency(workPackageId, OWNER, {
          predecessor: second,
          successor: first,
          type: 'FF',
        });
        expect(refusedFinish).toMatchObject({ ok: false, reason: 'cycle' });
        expect(await retained.stores.typedDependencies.listByWorkPackage(workPackageId)).toEqual(
          beforeRefusal,
        );
      } finally {
        retained.close();
      }
    } finally {
      await source.close();
    }
  });

  it('refuses a reversed edge through the dependency added earlier in the batch', async () => {
    const parentFixture = openMemorySourceFixture();
    const source = ownTestSource(parentFixture.source);
    const direct = silentBroadcaster();
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
      await authorRunnerSteps(source, 'Dev');
      const workPackageId = expectCreated(
        await publicGraph.workPackages.create(
          'Retained dependency cycle',
          'fixture-project',
          OWNER,
        ),
      ).workPackage.id;

      const refused = await runnerOver(source, publicGraph).run(workPackageId, OWNER, [
        {
          kind: 'createWorkItem',
          ref: 'first',
          parentId: null,
          afterId: null,
          name: 'First',
        },
        {
          kind: 'createWorkItem',
          ref: 'second',
          parentId: null,
          afterId: null,
          name: 'Second',
        },
        { kind: 'addDependency', workItemRef: 'second', predecessorRef: 'first' },
        { kind: 'addDependency', workItemRef: 'first', predecessorRef: 'second' },
      ]);

      // Proof: omitting the newly added edge from the retained read admitted
      // this reversed edge and returned ok instead of refusing its cycle.
      expect(refused).toMatchObject({
        ok: false,
        at: 3,
        kind: 'addDependency',
        reason: 'cycle',
      });
      expect(await source.stores.dependencies.listByWorkPackage(workPackageId)).toEqual([]);
    } finally {
      await source.close();
    }
  });
});

describe('working plan subtree mutations through runner commands', () => {
  it('patches a copied descendant immediately after duplicating its subtree', async () => {
    const parentFixture = openMemorySourceFixture();
    const source = ownTestSource(parentFixture.source);
    const direct = silentBroadcaster();
    const setup = compose(source.stores, direct);

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
      await authorRunnerSteps(source, 'Dev');
      const workPackageId = expectCreated(
        await setup.workPackages.create('Retained duplicated subtree', 'fixture-project', OWNER),
      ).workPackage.id;
      for (const row of [
        workItemRow({ id: 'root', workPackageId, position: 10, name: 'Root' }),
        workItemRow({
          id: 'child',
          workPackageId,
          parentId: 'root',
          position: 10,
          name: 'Child',
        }),
      ]) {
        await source.stores.workItems.insert(row, [], { at: 2, by: OWNER });
      }
      const ids = ['copy-root', 'copy-child', 'journal', 'event'];
      const clock = clockOf({
        now: () => 3,
        newId: () => {
          const id = ids.shift();
          if (id === undefined) throw new Error('duplicate batch minted an unexpected fifth id');
          return id;
        },
      });
      const composeBatch = (stores: PlanTransactionalStores, broadcast: Broadcaster) =>
        servicesOver(stores, {
          dependencyContext: createLocalDependencyContext(stores),
          admission: LEGACY_EDIT_ADMISSION,
          clock,
          broadcast,
          scheduler: fastScheduler,
        });
      const publicGraph = composeBatch(source.stores, direct);
      const runner = createPlanCommandRunner({
        commandAccess: localCommandAccess,
        uow: source.uow,
        announcements: direct,
        publicServices: publicGraph,
        batchServices: (scope, broadcast) => composeBatch(scope.stores, broadcast),
      });

      const copied = await runner.run(workPackageId, OWNER, [
        { kind: 'duplicateWorkItem', workItemId: 'root', ref: 'copy' },
        {
          kind: 'patchWorkItem',
          workItemId: 'copy-child',
          patch: { name: 'Patched copied child' },
        },
      ]);

      // Proof: delegating insertSubtree without refreshing its new row identities
      // made the second production command refuse `not_found` at index 1.
      expect(copied).toMatchObject({ ok: true });
      expect(
        await source.stores.workItems.listByIds(workPackageId, ['copy-root', 'copy-child']),
      ).toMatchObject([
        { id: 'copy-root', parentId: null, name: 'Root (copy)' },
        { id: 'copy-child', parentId: 'copy-root', name: 'Patched copied child' },
      ]);
    } finally {
      await source.close();
    }
  });
});

const MEASURE_METRICS = ['token_estimate', 'token_actual', 'hours_actual'] as const;

function setAllValues(workItemId: string, stepId: string, scalar: number): PlanCommand[] {
  return [
    {
      kind: 'setEstimate',
      workItemId,
      stepId,
      days: { optimistic: scalar, realistic: scalar + 1, pessimistic: scalar + 2 },
    },
    { kind: 'setActual', workItemId, stepId, days: scalar },
    { kind: 'setProgress', workItemId, stepId, state: scalar === 1 ? 'in_progress' : 'done' },
    ...MEASURE_METRICS.map((metric): PlanCommand => ({
      kind: 'setMeasure',
      workItemId,
      stepId,
      metric,
      value: scalar,
    })),
  ];
}

function clearAllValues(workItemId: string, stepId: string): PlanCommand[] {
  return [
    { kind: 'clearEstimate', workItemId, stepId },
    { kind: 'clearActual', workItemId, stepId },
    { kind: 'clearProgress', workItemId, stepId },
    ...MEASURE_METRICS.map((metric): PlanCommand => ({
      kind: 'clearMeasure',
      workItemId,
      stepId,
      metric,
    })),
  ];
}

describe('working plan value mutations through runner commands', () => {
  it.each([
    { name: 'mixed-case', first: 'a', second: 'A', order: ['A', 'a'] },
    { name: 'Unicode', first: '\u{10000}', second: '\uE000', order: ['\uE000', '\u{10000}'] },
  ])(
    'keeps $name memory value groups in binary full-reader order after population',
    async ({ first, second, order }) => {
      const parentFixture = openMemorySourceFixture();
      const source = ownTestSource(parentFixture.source);
      const direct = silentBroadcaster();
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
        await authorRunnerSteps(source, 'Build');
        const createdWorkPackage = expectCreated(
          await publicGraph.workPackages.create(
            'Mixed-case value ordering',
            'fixture-project',
            OWNER,
          ),
        );
        const workPackageId = createdWorkPackage.workPackage.id;
        const stepId = createdWorkPackage.steps[0].id;

        for (const id of [first, second]) {
          await source.stores.workItems.insert(workItemRow({ id, workPackageId }), [], {
            at: 2,
            by: OWNER,
          });
        }
        expect(
          (
            await runnerOver(source, publicGraph).run(
              workPackageId,
              OWNER,
              setAllValues(first, stepId, 1),
            )
          ).ok,
        ).toBe(true);

        let observations = 0;
        const admitted = captureAdmittedStores(source.uow);
        const runner = runnerOver(source, publicGraph, admitted.uow, (scope, broadcast) => {
          const loaded = Promise.all([
            scope.stores.estimates.listByWorkPackage(workPackageId),
            scope.stores.actuals.listByWorkPackage(workPackageId),
            scope.stores.progress.listByWorkPackage(workPackageId),
            scope.stores.measures.listByWorkPackage(workPackageId),
          ]);
          const measures = {
            ...scope.stores.measures,
            set: async (...parameters: Parameters<PlanTransactionalStores['measures']['set']>) => {
              await loaded;
              const written = await scope.stores.measures.set(...parameters);
              if (parameters[0].metric === 'hours_actual') {
                const retained = await Promise.all([
                  scope.stores.estimates.listByWorkPackage(workPackageId),
                  scope.stores.actuals.listByWorkPackage(workPackageId),
                  scope.stores.progress.listByWorkPackage(workPackageId),
                  scope.stores.measures.listByWorkPackage(workPackageId),
                ]);
                const authoritativeStores = admitted.current();
                const authoritative = await Promise.all([
                  authoritativeStores.estimates.listByWorkPackage(workPackageId),
                  authoritativeStores.actuals.listByWorkPackage(workPackageId),
                  authoritativeStores.progress.listByWorkPackage(workPackageId),
                  authoritativeStores.measures.listByWorkPackage(workPackageId),
                ]);
                expect(
                  authoritative.map((rows) => rows.map(({ workItemId }) => workItemId)),
                ).toEqual([
                  [...order],
                  [...order],
                  [...order],
                  [order[0], order[0], order[0], order[1], order[1], order[1]],
                ]);
                expect(retained).toEqual(authoritative);
                observations += 1;
              }
              return written;
            },
          };
          return compose({ ...scope.stores, measures }, broadcast);
        });

        expect((await runner.run(workPackageId, OWNER, setAllValues(second, stepId, 2))).ok).toBe(
          true,
        );
        expect(observations).toBe(1);
      } finally {
        await source.close();
      }
    },
  );

  it('keeps every memory value group in source order after sets populate an earlier group', async () => {
    const parentFixture = openMemorySourceFixture();
    const source = ownTestSource(parentFixture.source);
    const direct = silentBroadcaster();
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
      await authorRunnerSteps(source, 'Build');
      const createdWorkPackage = expectCreated(
        await publicGraph.workPackages.create('Value group ordering', 'fixture-project', OWNER),
      );
      const workPackageId = createdWorkPackage.workPackage.id;
      const stepId = createdWorkPackage.steps[0].id;

      for (const id of ['z-existing', 'a-earlier']) {
        await source.stores.workItems.insert(workItemRow({ id, workPackageId }), [], {
          at: 2,
          by: OWNER,
        });
      }
      await source.stores.estimates.set(
        { workItemId: 'z-existing', stepId, optimistic: 1, realistic: 2, pessimistic: 3 },
        { at: 2, by: OWNER },
      );
      await source.stores.actuals.set(
        { workItemId: 'z-existing', stepId, days: 1, recordedAt: 1 },
        { at: 2, by: OWNER },
      );
      await source.stores.progress.set(
        { workItemId: 'z-existing', stepId, state: 'done', statedAt: 1 },
        { at: 2, by: OWNER },
      );
      for (const metric of MEASURE_METRICS) {
        await source.stores.measures.set(
          { workItemId: 'z-existing', stepId, metric, value: 1, recordedAt: 1 },
          { at: 2, by: OWNER },
        );
      }
      let observations = 0;
      const admitted = captureAdmittedStores(source.uow);
      const runner = runnerOver(source, publicGraph, admitted.uow, (scope, broadcast) => {
        const loaded = Promise.all([
          scope.stores.estimates.listByWorkPackage(workPackageId),
          scope.stores.actuals.listByWorkPackage(workPackageId),
          scope.stores.progress.listByWorkPackage(workPackageId),
          scope.stores.measures.listByWorkPackage(workPackageId),
        ]);
        const measures = {
          ...scope.stores.measures,
          set: async (...parameters: Parameters<PlanTransactionalStores['measures']['set']>) => {
            await loaded;
            const written = await scope.stores.measures.set(...parameters);
            if (parameters[0].metric === 'hours_actual') {
              const retained = await Promise.all([
                scope.stores.estimates.listByWorkPackage(workPackageId),
                scope.stores.actuals.listByWorkPackage(workPackageId),
                scope.stores.progress.listByWorkPackage(workPackageId),
                scope.stores.measures.listByWorkPackage(workPackageId),
              ]);
              const authoritativeStores = admitted.current();
              const authoritative = await Promise.all([
                authoritativeStores.estimates.listByWorkPackage(workPackageId),
                authoritativeStores.actuals.listByWorkPackage(workPackageId),
                authoritativeStores.progress.listByWorkPackage(workPackageId),
                authoritativeStores.measures.listByWorkPackage(workPackageId),
              ]);
              expect(retained).toEqual(authoritative);
              expect(retained.map((rows) => rows.map(({ workItemId }) => workItemId))).toEqual([
                ['a-earlier', 'z-existing'],
                ['a-earlier', 'z-existing'],
                ['a-earlier', 'z-existing'],
                ['a-earlier', 'a-earlier', 'a-earlier', 'z-existing', 'z-existing', 'z-existing'],
              ]);
              observations += 1;
            }
            return written;
          },
        };
        return compose({ ...scope.stores, measures }, broadcast);
      });

      expect(
        (
          await runner.run(workPackageId, OWNER, [
            ...setAllValues('a-earlier', stepId, 2),
            ...clearAllValues('a-earlier', stepId),
            ...setAllValues('a-earlier', stepId, 3),
          ])
        ).ok,
      ).toBe(true);
      expect(observations).toBe(2);
    } finally {
      await source.close();
    }
  });

  it('refreshes every set, hand-down endpoint, and measure metric before later commands', async () => {
    const parentFixture = openMemorySourceFixture();
    const source = ownTestSource(parentFixture.source);
    const direct = silentBroadcaster();
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
      await authorRunnerSteps(source, 'Build');
      const createdWorkPackage = expectCreated(
        await publicGraph.workPackages.create('Value hand-down refresh', 'fixture-project', OWNER),
      );
      const workPackageId = createdWorkPackage.workPackage.id;
      const stepId = createdWorkPackage.steps[0].id;

      const parent = await publicGraph.workItems.create(workPackageId, OWNER, {
        parentId: null,
        afterId: null,
        name: 'Parent',
      });
      if (!parent.ok) throw new Error('value hand-down parent creation refused');
      const runner = runnerOver(source, publicGraph);

      const changed = await runner.run(workPackageId, OWNER, [
        ...setAllValues(parent.value.id, stepId, 1),
        {
          kind: 'createWorkItem',
          ref: 'child',
          parentId: parent.value.id,
          afterId: null,
          name: 'Child',
        },
        ...setAllValues('parent', stepId, 7).map((command) => ({
          ...command,
          workItemId: undefined,
          workItemRef: 'child',
        })),
      ]);

      expect(changed.ok).toBe(true);
      if (!changed.ok) throw new Error('value hand-down batch refused');
      const childId = changed.results[6]?.id;
      if (childId === undefined) throw new Error('value hand-down returned no child id');
      expect(await source.stores.estimates.listByWorkPackage(workPackageId)).toEqual([
        { workItemId: childId, stepId, optimistic: 7, realistic: 8, pessimistic: 9 },
      ]);
      expect(await source.stores.actuals.listByWorkPackage(workPackageId)).toMatchObject([
        { workItemId: childId, stepId, days: 7 },
      ]);
      expect(await source.stores.progress.listByWorkPackage(workPackageId)).toMatchObject([
        { workItemId: childId, stepId, state: 'done' },
      ]);
      expect(
        (await source.stores.measures.listByWorkPackage(workPackageId))
          .map(({ workItemId, stepId: storedStepId, metric, value }) => ({
            workItemId,
            stepId: storedStepId,
            metric,
            value,
          }))
          .sort((left, right) => left.metric.localeCompare(right.metric)),
      ).toEqual(
        MEASURE_METRICS.map((metric) => ({ workItemId: childId, stepId, metric, value: 7 })).sort(
          (left, right) => left.metric.localeCompare(right.metric),
        ),
      );

      expect(await runner.undo(workPackageId, OWNER)).toMatchObject({ ok: true });
      expect(await source.stores.estimates.listByWorkPackage(workPackageId)).toEqual([]);
      expect(await source.stores.actuals.listByWorkPackage(workPackageId)).toEqual([]);
      expect(await source.stores.progress.listByWorkPackage(workPackageId)).toEqual([]);
      expect(await source.stores.measures.listByWorkPackage(workPackageId)).toEqual([]);
    } finally {
      await source.close();
    }
  });

  it('removes every moveAll source during the same create command', async () => {
    const parentFixture = openMemorySourceFixture();
    const source = ownTestSource(parentFixture.source);
    const direct = silentBroadcaster();
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
      await authorRunnerSteps(source, 'Build');
      const createdWorkPackage = expectCreated(
        await publicGraph.workPackages.create('Value move refresh', 'fixture-project', OWNER),
      );
      const workPackageId = createdWorkPackage.workPackage.id;
      const stepId = createdWorkPackage.steps[0].id;

      for (const id of ['z-source', 'm-existing']) {
        await source.stores.workItems.insert(workItemRow({ id, workPackageId }), [], {
          at: 2,
          by: OWNER,
        });
      }
      expect(
        (
          await runnerOver(source, publicGraph).run(workPackageId, OWNER, [
            ...setAllValues('z-source', stepId, 1),
            ...setAllValues('m-existing', stepId, 4),
          ])
        ).ok,
      ).toBe(true);

      const staleSources: string[] = [];
      const minted = ['a-child', 'move-journal', 'move-event'];
      const orderedClock = clockOf({
        now: () => 3,
        newId: () => {
          const id = minted.shift();
          if (id === undefined) throw new Error('value move minted an unexpected identity');
          return id;
        },
      });
      const orderedCompose = (stores: PlanTransactionalStores, broadcast: Broadcaster) =>
        servicesOver(stores, {
          dependencyContext: createLocalDependencyContext(stores),
          admission: LEGACY_EDIT_ADMISSION,
          clock: orderedClock,
          broadcast,
          scheduler: fastScheduler,
        });
      const admitted = captureAdmittedStores(source.uow);
      const runner = createPlanCommandRunner({
        commandAccess: localCommandAccess,
        uow: admitted.uow,
        announcements: direct,
        publicServices: publicGraph,
        batchServices(scope, broadcast) {
          const watch = <Store extends 'estimates' | 'actuals' | 'progress' | 'measures'>(
            name: Store,
          ): PlanTransactionalStores[Store] => {
            const values = scope.stores[name];
            return {
              ...values,
              moveAll: async (...parameters: Parameters<typeof values.moveAll>) => {
                await values.moveAll(parameters[0], parameters[1], parameters[2]);
                const remaining = await values.listByWorkPackage(workPackageId);
                if (remaining.some(({ workItemId }) => workItemId === parameters[0])) {
                  staleSources.push(name);
                }
                if (name === 'measures') {
                  const retained = await Promise.all([
                    scope.stores.estimates.listByWorkPackage(workPackageId),
                    scope.stores.actuals.listByWorkPackage(workPackageId),
                    scope.stores.progress.listByWorkPackage(workPackageId),
                    scope.stores.measures.listByWorkPackage(workPackageId),
                  ]);
                  const authoritativeStores = admitted.current();
                  const authoritative = await Promise.all([
                    authoritativeStores.estimates.listByWorkPackage(workPackageId),
                    authoritativeStores.actuals.listByWorkPackage(workPackageId),
                    authoritativeStores.progress.listByWorkPackage(workPackageId),
                    authoritativeStores.measures.listByWorkPackage(workPackageId),
                  ]);
                  expect(retained).toEqual(authoritative);
                  expect(retained.map((rows) => rows.map(({ workItemId }) => workItemId))).toEqual([
                    ['a-child', 'm-existing'],
                    ['a-child', 'm-existing'],
                    ['a-child', 'm-existing'],
                    ['a-child', 'a-child', 'a-child', 'm-existing', 'm-existing', 'm-existing'],
                  ]);
                }
              },
            };
          };
          return orderedCompose(
            {
              ...scope.stores,
              estimates: watch('estimates'),
              actuals: watch('actuals'),
              progress: watch('progress'),
              measures: watch('measures'),
            },
            broadcast,
          );
        },
      });

      expect(
        (
          await runner.run(workPackageId, OWNER, [
            {
              kind: 'createWorkItem',
              parentId: 'z-source',
              afterId: null,
              name: 'Child',
            },
          ])
        ).ok,
      ).toBe(true);
      // Proof: refreshing only moveAll's destination left all four source values visible in
      // this same create command, before its next store call or any later command barrier.
      expect(staleSources).toEqual([]);
    } finally {
      await source.close();
    }
  });

  it('refreshes every delete-last-child hand-up before editing the parent', async () => {
    const parentFixture = openMemorySourceFixture();
    const source = ownTestSource(parentFixture.source);
    const direct = silentBroadcaster();
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
      await authorRunnerSteps(source, 'Build');
      const createdWorkPackage = expectCreated(
        await publicGraph.workPackages.create('Value hand-up refresh', 'fixture-project', OWNER),
      );
      const workPackageId = createdWorkPackage.workPackage.id;
      const stepId = createdWorkPackage.steps[0].id;

      const parent = await publicGraph.workItems.create(workPackageId, OWNER, {
        parentId: null,
        afterId: null,
        name: 'Parent',
      });
      if (!parent.ok) throw new Error('value hand-up parent creation refused');
      const child = await publicGraph.workItems.create(workPackageId, OWNER, {
        parentId: parent.value.id,
        afterId: null,
        name: 'Only child',
      });
      if (!child.ok) throw new Error('value hand-up child creation refused');
      expect(
        (
          await runnerOver(source, publicGraph).run(
            workPackageId,
            OWNER,
            setAllValues(child.value.id, stepId, 1),
          )
        ).ok,
      ).toBe(true);
      const runner = runnerOver(source, publicGraph);

      const changed = await runner.run(workPackageId, OWNER, [
        { kind: 'deleteWorkItem', workItemId: child.value.id, strategy: 'cascade' },
        ...setAllValues(parent.value.id, stepId, 7),
      ]);

      expect(changed.ok).toBe(true);
      expect(await runner.undo(workPackageId, OWNER)).toMatchObject({ ok: true });
      expect(await source.stores.estimates.listByWorkPackage(workPackageId)).toMatchObject([
        { workItemId: child.value.id, optimistic: 1, realistic: 2, pessimistic: 3 },
      ]);
      expect(await source.stores.actuals.listByWorkPackage(workPackageId)).toMatchObject([
        { workItemId: child.value.id, days: 1 },
      ]);
      expect(await source.stores.progress.listByWorkPackage(workPackageId)).toMatchObject([
        { workItemId: child.value.id, state: 'in_progress' },
      ]);
      expect(
        (await source.stores.measures.listByWorkPackage(workPackageId))
          .map(({ workItemId, metric, value }) => ({ workItemId, metric, value }))
          .sort((left, right) => left.metric.localeCompare(right.metric)),
      ).toEqual(
        MEASURE_METRICS.map((metric) => ({ workItemId: child.value.id, metric, value: 1 })).sort(
          (left, right) => left.metric.localeCompare(right.metric),
        ),
      );
    } finally {
      await source.close();
    }
  });

  it('removes every value and metric from retained reads before the store method returns', async () => {
    const parentFixture = openMemorySourceFixture();
    const source = ownTestSource(parentFixture.source);
    const direct = silentBroadcaster();
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
      await authorRunnerSteps(source, 'Build');
      const createdWorkPackage = expectCreated(
        await publicGraph.workPackages.create('Value remove refresh', 'fixture-project', OWNER),
      );
      const workPackageId = createdWorkPackage.workPackage.id;
      const stepId = createdWorkPackage.steps[0].id;

      const leaf = await publicGraph.workItems.create(workPackageId, OWNER, {
        parentId: null,
        afterId: null,
        name: 'Leaf',
      });
      if (!leaf.ok) throw new Error('value remove leaf creation refused');
      expect(
        (
          await runnerOver(source, publicGraph).run(
            workPackageId,
            OWNER,
            setAllValues(leaf.value.id, stepId, 1),
          )
        ).ok,
      ).toBe(true);
      const observed: string[] = [];
      const runner = runnerOver(source, publicGraph, source.uow, (scope, broadcast) => {
        const watch = <Store extends 'estimates' | 'actuals' | 'progress' | 'measures'>(
          name: Store,
        ): PlanTransactionalStores[Store] => {
          const values = scope.stores[name];
          return {
            ...values,
            remove: async (...parameters: Parameters<typeof values.remove>) => {
              const remove = values.remove.bind(values);
              await Reflect.apply(remove, values, parameters);
              const remaining = await values.listByWorkPackage(workPackageId);
              const removedRemains = remaining.some((row) => {
                if (row.workItemId !== leaf.value.id || row.stepId !== stepId) return false;
                return (
                  name !== 'measures' ||
                  (typeof parameters[2] === 'string' &&
                    'metric' in row &&
                    row.metric === parameters[2])
                );
              });
              if (removedRemains) observed.push(name);
            },
          };
        };
        return compose(
          {
            ...scope.stores,
            estimates: watch('estimates'),
            actuals: watch('actuals'),
            progress: watch('progress'),
            measures: watch('measures'),
          },
          broadcast,
        );
      });

      expect(
        (await runner.run(workPackageId, OWNER, clearAllValues(leaf.value.id, stepId))).ok,
      ).toBe(true);
      // Proof: delegating remove left the removed identity in each retained collection during
      // the same command; every name appeared here before a later command could hide the fault.
      expect(observed).toEqual([]);
    } finally {
      await source.close();
    }
  });
});

describe('working plan row mutations through runner commands', () => {
  it('refreshes an inserted row and every densely respaced sibling before the next placement', async () => {
    const parentFixture = openMemorySourceFixture();
    const source = ownTestSource(parentFixture.source);
    const direct = silentBroadcaster();
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
      await authorRunnerSteps(source, 'Dev');
      const workPackageId = expectCreated(
        await publicGraph.workPackages.create('Inserted row refresh', 'fixture-project', OWNER),
      ).workPackage.id;
      await source.stores.workItems.insert(
        workItemRow({ id: 'parent', workPackageId, position: 10, name: 'Parent' }),
        [],
        { at: 2, by: OWNER },
      );
      for (const [id, position] of [
        ['a', 1],
        ['b', 2],
      ] as const) {
        await source.stores.workItems.insert(
          workItemRow({ id, workPackageId, parentId: 'parent', position, name: id.toUpperCase() }),
          [],
          { at: 2, by: OWNER },
        );
      }
      const runner = runnerOver(source, publicGraph);

      const inserted = await runner.run(workPackageId, OWNER, [
        {
          kind: 'createWorkItem',
          ref: 'x',
          parentId: 'parent',
          afterId: 'a',
          name: 'X',
        },
        {
          kind: 'createWorkItem',
          parentId: 'parent',
          afterId: 'a',
          name: 'Y',
        },
      ]);

      expect(inserted.ok).toBe(true);
      const children = (await source.stores.workItems.listByWorkPackage(workPackageId))
        .filter(({ parentId }) => parentId === 'parent')
        .sort((left, right) => left.position - right.position);
      // Proof: omitting the first insert's respaced sibling ids from refreshRows made the
      // second production command leave A@10,Y@20,B@30,X@40.
      expect(children.map(({ name, position }) => [name, position])).toEqual([
        ['A', 10],
        ['Y', 15],
        ['X', 20],
        ['B', 30],
      ]);
    } finally {
      await source.close();
    }
  });

  it('refreshes a moved row and dense destination siblings before the next move', async () => {
    const parentFixture = openMemorySourceFixture();
    const source = ownTestSource(parentFixture.source);
    const direct = silentBroadcaster();
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
      await authorRunnerSteps(source, 'Dev');
      const workPackageId = expectCreated(
        await publicGraph.workPackages.create('Moved row refresh', 'fixture-project', OWNER),
      ).workPackage.id;
      for (const row of [
        workItemRow({ id: 'old-parent', workPackageId, position: 10, name: 'Old parent' }),
        workItemRow({ id: 'new-parent', workPackageId, position: 20, name: 'New parent' }),
        workItemRow({
          id: 'moving',
          workPackageId,
          parentId: 'old-parent',
          position: 10,
          name: 'Moving',
        }),
        workItemRow({ id: 'a', workPackageId, parentId: 'new-parent', position: 1, name: 'A' }),
        workItemRow({ id: 'b', workPackageId, parentId: 'new-parent', position: 2, name: 'B' }),
      ]) {
        await source.stores.workItems.insert(row, [], { at: 2, by: OWNER });
      }
      const runner = runnerOver(source, publicGraph);

      const moved = await runner.run(workPackageId, OWNER, [
        {
          kind: 'moveWorkItem',
          workItemId: 'moving',
          parentId: 'new-parent',
          afterId: 'a',
        },
        {
          kind: 'moveWorkItem',
          workItemId: 'b',
          parentId: 'new-parent',
          afterId: 'moving',
        },
      ]);

      expect(moved.ok).toBe(true);
      // Proof: delegating move without refreshing its row and dense siblings made the
      // second command throw "cannot place after moving: not a sibling in this group".
      expect(
        (await source.stores.workItems.listByWorkPackage(workPackageId))
          .filter(({ parentId }) => parentId === 'new-parent')
          .sort((left, right) => left.position - right.position)
          .map(({ id, position }) => [id, position]),
      ).toEqual([
        ['a', 10],
        ['moving', 20],
        ['b', 30],
      ]);
    } finally {
      await source.close();
    }
  });

  it('freezes arranged numbers from the preceding command in the same batch', async () => {
    const parentFixture = openMemorySourceFixture();
    const source = ownTestSource(parentFixture.source);
    const direct = silentBroadcaster();
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
      await authorRunnerSteps(source, 'Build');
      const createdWorkPackage = expectCreated(
        await publicGraph.workPackages.create('Arranged row refresh', 'fixture-project', OWNER),
      );
      const workPackageId = createdWorkPackage.workPackage.id;
      const stepId = createdWorkPackage.steps[0].id;

      for (const [id, position] of [
        ['a', 10],
        ['b', 20],
      ] as const) {
        await source.stores.workItems.insert(
          workItemRow({ id, workPackageId, position, name: id.toUpperCase() }),
          [],
          { at: 2, by: OWNER },
        );
        // Estimated, because an unestimated row takes no schedule time and the
        // dependency below would then move no start to arrange by.
        await source.stores.estimates.set(
          { workItemId: id, stepId, optimistic: 1, realistic: 1, pessimistic: 1 },
          { at: 2, by: OWNER },
        );
      }
      expect((await publicGraph.workItems.addDependency('a', OWNER, 'b')).ok).toBe(true);

      const arranged = await runnerOver(source, publicGraph).run(workPackageId, OWNER, [
        { kind: 'arrangeBySchedule' },
        { kind: 'freezeWorkPackage' },
      ]);

      expect(arranged.ok).toBe(true);
      expect(
        (await source.stores.workItems.listByWorkPackage(workPackageId))
          .sort((left, right) => left.position - right.position)
          .map(({ id, position, frozenNumber }) => [id, position, frozenNumber]),
      ).toEqual([
        ['b', 10, '010'],
        ['a', 20, '020'],
      ]);
    } finally {
      await source.close();
    }
  });

  it('refreshes every frozen row before an unfreeze in the same batch', async () => {
    const parentFixture = openMemorySourceFixture();
    const source = ownTestSource(parentFixture.source);
    const direct = silentBroadcaster();
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
      await authorRunnerSteps(source, 'Dev');
      const workPackageId = expectCreated(
        await publicGraph.workPackages.create('Frozen row refresh', 'fixture-project', OWNER),
      ).workPackage.id;
      for (const [id, position] of [
        ['a', 10],
        ['b', 20],
      ] as const) {
        await source.stores.workItems.insert(
          workItemRow({ id, workPackageId, position, name: id.toUpperCase() }),
          [],
          { at: 2, by: OWNER },
        );
      }
      const runner = runnerOver(source, publicGraph);

      const frozen = await runner.run(workPackageId, OWNER, [
        { kind: 'freezeWorkPackage' },
        { kind: 'unfreezeWorkPackage' },
      ]);

      expect(frozen.ok).toBe(true);
      // Proof: delegating setFrozenNumbers without refreshing every update made the
      // unfreeze command see no frozen rows; the store retained "010" and "020".
      expect(
        (await source.stores.workItems.listByWorkPackage(workPackageId)).map(
          ({ id, frozenNumber }) => [id, frozenNumber],
        ),
      ).toEqual([
        ['a', null],
        ['b', null],
      ]);
    } finally {
      await source.close();
    }
  });

  it('refreshes removed rows and promoted children before the next placement', async () => {
    const parentFixture = openMemorySourceFixture();
    const source = ownTestSource(parentFixture.source);
    const direct = silentBroadcaster();
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
      await authorRunnerSteps(source, 'Dev');
      const workPackageId = expectCreated(
        await publicGraph.workPackages.create('Promoted row refresh', 'fixture-project', OWNER),
      ).workPackage.id;
      for (const row of [
        workItemRow({ id: 'sibling', workPackageId, position: 10, name: 'Sibling' }),
        workItemRow({ id: 'removed', workPackageId, position: 20, name: 'Removed' }),
        workItemRow({
          id: 'promoted',
          workPackageId,
          parentId: 'removed',
          position: 10,
          name: 'Promoted',
        }),
      ]) {
        await source.stores.workItems.insert(row, [], { at: 2, by: OWNER });
      }
      const runner = runnerOver(source, publicGraph);

      const removed = await runner.run(workPackageId, OWNER, [
        { kind: 'deleteWorkItem', workItemId: 'removed', strategy: 'promote' },
        {
          kind: 'createWorkItem',
          parentId: null,
          afterId: 'promoted',
          name: 'After promoted',
        },
      ]);

      expect(removed.ok).toBe(true);
      // Proof: delegating remove without refreshing its promoted row made the next command
      // throw "cannot place after promoted: not a sibling in this group".
      expect(
        (await source.stores.workItems.listByWorkPackage(workPackageId))
          .filter(({ parentId }) => parentId === null)
          .sort((left, right) => left.position - right.position)
          .map(({ name }) => name),
      ).toEqual(['Sibling', 'Promoted', 'After promoted']);
    } finally {
      await source.close();
    }
  });

  it('does not advance a retained row after a refused patch', async () => {
    const parentFixture = openMemorySourceFixture();
    const source = ownTestSource(parentFixture.source);
    const direct = silentBroadcaster();
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
      await authorRunnerSteps(source, 'Dev');
      const workPackageId = expectCreated(
        await publicGraph.workPackages.create('Refused patch refresh', 'fixture-project', OWNER),
      ).workPackage.id;
      const created = await publicGraph.workItems.create(workPackageId, OWNER, {
        parentId: null,
        afterId: null,
        name: 'Authoritative before refusal',
      });
      if (!created.ok) throw new Error('refused-patch fixture creation refused');

      const deceptiveUow: UnitOfWork = {
        run<T>(act: (scope: Scope) => Promise<Decision<T>>): Promise<T> {
          return source.uow.run((scope) => {
            const stores: PlanTransactionalStores = {
              ...scope.stores,
              workItems: {
                ...scope.stores.workItems,
                listByIds: async (requestedWorkPackageId, ids) =>
                  (await scope.stores.workItems.listByIds(requestedWorkPackageId, ids)).map(
                    (row) => ({
                      ...row,
                      name: 'Invented after refusal',
                    }),
                  ),
              },
            };
            return act({ stores });
          });
        },
      };
      let observedAfterRefusal: string | undefined;
      const runner = runnerOver(source, publicGraph, deceptiveUow, (scope, broadcast) => {
        const workItems = {
          ...scope.stores.workItems,
          patch: async (
            ...parameters: Parameters<PlanTransactionalStores['workItems']['patch']>
          ) => {
            const written = await scope.stores.workItems.patch(...parameters);
            if (!written.ok) {
              observedAfterRefusal = (
                await scope.stores.workItems.listByWorkPackage(workPackageId)
              ).find(({ id }) => id === parameters[0])?.name;
            }
            return written;
          },
        };
        return compose({ ...scope.stores, workItems }, broadcast);
      });

      const refused = await runner.run(workPackageId, OWNER, [
        {
          kind: 'patchWorkItem',
          workItemId: created.value.id,
          patch: { teamIds: ['missing-team'] },
        },
      ]);

      expect(refused).toMatchObject({ ok: false, at: 0, reason: 'unknown_team' });
      // Proof: refreshing after the store's modeled refusal made this next production-path
      // read observe "Invented after refusal" although the store kept the prior row.
      expect(observedAfterRefusal).toBe('Authoritative before refusal');
      expect(
        await source.stores.workItems.listByIds(workPackageId, [created.value.id]),
      ).toMatchObject([{ name: 'Authoritative before refusal' }]);
    } finally {
      await source.close();
    }
  });
});

interface Placement {
  id: string;
  afterId: string | null;
}

async function expectSubtreePlacementFaultRollsBack(
  alter: (placements: Placement[]) => Placement[],
  expected: RegExp,
): Promise<void> {
  const parentFixture = openMemorySourceFixture();
  const source = ownTestSource(parentFixture.source);
  const direct = silentBroadcaster();
  const setup = compose(source.stores, direct);
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
    await authorRunnerSteps(source, 'Dev');
    const workPackageId = expectCreated(
      await setup.workPackages.create('Subtree placement validation', 'fixture-project', OWNER),
    ).workPackage.id;
    for (const row of [
      workItemRow({ id: 'root', workPackageId, position: 10, name: 'Root' }),
      workItemRow({ id: 'child', workPackageId, parentId: 'root', position: 10, name: 'Child' }),
    ]) {
      await source.stores.workItems.insert(row, [], { at: 2, by: OWNER });
    }
    let placementCalls = 0;
    const brokenUow: UnitOfWork = {
      run<T>(act: (scope: Scope) => Promise<Decision<T>>): Promise<T> {
        return source.uow.run((scope) =>
          act({
            stores: {
              ...scope.stores,
              workItems: {
                ...scope.stores.workItems,
                listPlacements: async (requestedWorkPackageId, ids) => {
                  placementCalls += 1;
                  return alter(
                    await scope.stores.workItems.listPlacements(requestedWorkPackageId, ids),
                  );
                },
              },
            },
          }),
        );
      },
    };
    const ids = ['copy-root', 'copy-child'];
    const clock = clockOf({
      now: () => 3,
      newId: () => {
        const id = ids.shift();
        if (id === undefined) throw new Error('placement fault minted an unexpected third id');
        return id;
      },
    });
    const composeBatch = (stores: PlanTransactionalStores, broadcast: Broadcaster) =>
      servicesOver(stores, {
        dependencyContext: createLocalDependencyContext(stores),
        admission: LEGACY_EDIT_ADMISSION,
        clock,
        broadcast,
        scheduler: fastScheduler,
      });
    const publicGraph = composeBatch(source.stores, direct);
    const runner = runnerOver(source, publicGraph, brokenUow, (scope, broadcast) =>
      composeBatch(scope.stores, broadcast),
    );

    let failure: unknown;
    try {
      await runner.run(workPackageId, OWNER, [
        { kind: 'duplicateWorkItem', workItemId: 'root', ref: 'copy' },
      ]);
    } catch (error) {
      failure = error;
    }
    expect(placementCalls).toBe(1);
    expect(
      (await source.stores.workItems.listByWorkPackage(workPackageId)).map(({ id }) => id),
    ).toEqual(['root', 'child']);
    if (!(failure instanceof Error)) throw new Error('subtree placement fault did not reject');
    expect(() => {
      throw failure;
    }).toThrow(expected);
  } finally {
    await source.close();
  }
}

async function expectPlacementFaultRollsBack(
  alter: (placements: Placement[]) => Placement[],
  expected: RegExp,
): Promise<void> {
  const parentFixture = openMemorySourceFixture();
  const source = ownTestSource(parentFixture.source);
  const direct = silentBroadcaster();
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
    await authorRunnerSteps(source, 'Dev');
    const workPackageId = expectCreated(
      await publicGraph.workPackages.create('Placement validation', 'fixture-project', OWNER),
    ).workPackage.id;
    await source.stores.workItems.insert(
      workItemRow({ id: 'anchor', workPackageId, position: 10, name: 'Anchor' }),
      [],
      { at: 2, by: OWNER },
    );
    let placementCalls = 0;
    const brokenUow: UnitOfWork = {
      run<T>(act: (scope: Scope) => Promise<Decision<T>>): Promise<T> {
        return source.uow.run((scope) =>
          act({
            stores: {
              ...scope.stores,
              workItems: {
                ...scope.stores.workItems,
                listPlacements: async (requestedWorkPackageId, ids) => {
                  placementCalls += 1;
                  return alter(
                    await scope.stores.workItems.listPlacements(requestedWorkPackageId, ids),
                  );
                },
              },
            },
          }),
        );
      },
    };
    const runner = runnerOver(source, publicGraph, brokenUow);

    let failure: unknown;
    try {
      await runner.run(workPackageId, OWNER, [
        { kind: 'createWorkItem', parentId: null, afterId: 'anchor', name: 'Rolled back' },
      ]);
    } catch (error) {
      failure = error;
    }
    expect(placementCalls).toBe(1);
    expect(
      (await source.stores.workItems.listByWorkPackage(workPackageId)).map(({ id }) => id),
    ).toEqual(['anchor']);
    if (!(failure instanceof Error)) throw new Error('placement fault did not reject with Error');
    expect(() => {
      throw failure;
    }).toThrow(expected);
  } finally {
    await source.close();
  }
}

describe('working plan placement validation rolls back its production unit of work', () => {
  it('rejects an omitted placement from a multi-row subtree refresh', async () => {
    // The existing omitted-placement guard is exercised here through Task 2.6's
    // first production path that refreshes more than one new identity at once.
    await expectSubtreePlacementFaultRollsBack(
      (placements) => placements.filter(({ id }) => id !== 'copy-child'),
      /targeted placement omitted work item copy-child/i,
    );
  });

  it('rejects a malformed placement from a multi-row subtree refresh', async () => {
    const malformed = (placements: Placement[]): Placement[] =>
      placements.map((placement) =>
        placement.id === 'copy-child'
          ? ({ ...placement, afterId: 42 } as unknown as Placement)
          : placement,
      );
    // The existing predecessor-shape guard is exercised through that same
    // multi-new-row path, and the durable source assertion proves rollback.
    await expectSubtreePlacementFaultRollsBack(
      malformed,
      /targeted placement for copy-child has malformed predecessor/i,
    );
  });

  it('rejects an omitted placement', async () => {
    // Proof: removing the omitted-placement guard let this inserted row commit.
    await expectPlacementFaultRollsBack(() => [], /targeted placement omitted work item/i);
  });

  it('rejects an unexpected placement identity', async () => {
    // Proof: removing the expected-identity guard reached the later
    // `targeted placement omitted work item unexpected` error without committing.
    await expectPlacementFaultRollsBack(
      () => [{ id: 'unexpected', afterId: null }],
      /targeted placement returned unexpected work item unexpected/i,
    );
  });

  it('rejects a duplicate placement identity', async () => {
    // Proof: removing the duplicate-identity guard inserted the same refreshed
    // row twice in the retained plan and let its database write commit.
    await expectPlacementFaultRollsBack((placements) => {
      const placement = placements.at(0);
      return placement === undefined ? [] : [placement, placement];
    }, /targeted placement returned duplicate work item/i);
  });

  it('rejects a missing placement predecessor', async () => {
    // Proof: removing the predecessor-presence guard let this placement splice
    // at the start while its insert committed after a nonexistent predecessor.
    await expectPlacementFaultRollsBack((placements) => {
      const placement = placements.at(0);
      return placement === undefined ? [] : [{ ...placement, afterId: 'missing-predecessor' }];
    }, /targeted placement.*follows missing work item missing-predecessor/i);
  });

  it('rejects a malformed placement predecessor', async () => {
    // This deliberately violates the runtime source boundary that the typed port protects.
    const malformed = (placements: Placement[]): Placement[] =>
      placements.map(({ id }) => ({ id, afterId: 42 }) as unknown as Placement);
    // Proof: removing the predecessor-shape guard sent numeric predecessor 42
    // to the later missing-predecessor guard.
    await expectPlacementFaultRollsBack(malformed, /targeted placement.*malformed predecessor/i);
  });

  it('rejects a placement that follows itself', async () => {
    // Proof: removing the self-predecessor guard reached the later
    // missing-predecessor error with the inserted row's own identity.
    await expectPlacementFaultRollsBack((placements) => {
      const placement = placements.at(0);
      return placement === undefined ? [] : [{ ...placement, afterId: placement.id }];
    }, /targeted placement.*cannot follow itself/i);
  });

  it('rejects a newly returned identity without an authorized insertion', async () => {
    const parentFixture = openMemorySourceFixture();
    const source = ownTestSource(parentFixture.source);
    const direct = silentBroadcaster();
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
      await authorRunnerSteps(source, 'Dev');
      const workPackageId = expectCreated(
        await publicGraph.workPackages.create('Unauthorized refresh row', 'fixture-project', OWNER),
      ).workPackage.id;
      await source.stores.workItems.insert(
        workItemRow({ id: 'old-parent', workPackageId, position: 10, name: 'Hidden old parent' }),
        [],
        { at: 2, by: OWNER },
      );
      await source.stores.workItems.insert(
        workItemRow({
          id: 'moving',
          workPackageId,
          parentId: 'old-parent',
          position: 10,
          name: 'Moving',
        }),
        [],
        { at: 2, by: OWNER },
      );
      const brokenUow: UnitOfWork = {
        run<T>(act: (scope: Scope) => Promise<Decision<T>>): Promise<T> {
          return source.uow.run((scope) =>
            act({
              stores: {
                ...scope.stores,
                workItems: {
                  ...scope.stores.workItems,
                  listByWorkPackage: async (requestedWorkPackageId) =>
                    (await scope.stores.workItems.listByWorkPackage(requestedWorkPackageId)).filter(
                      ({ id }) => id !== 'old-parent',
                    ),
                },
              },
            }),
          );
        },
      };

      const runner = runnerOver(source, publicGraph, brokenUow);
      // Proof: removing the authorized-insertion guard let the source's newly
      // returned old-parent enter the retained plan after an unrelated move.
      let failure: unknown;
      try {
        await runner.run(workPackageId, OWNER, [
          { kind: 'moveWorkItem', workItemId: 'moving', parentId: null, afterId: null },
        ]);
      } catch (error) {
        failure = error;
      }
      expect(await source.stores.workItems.listByIds(workPackageId, ['moving'])).toMatchObject([
        { id: 'moving', parentId: 'old-parent' },
      ]);
      if (!(failure instanceof Error)) throw new Error('placement fault did not reject with Error');
      expect(() => {
        throw failure;
      }).toThrow(/refreshed work item old-parent has no retained position/i);
    } finally {
      await source.close();
    }
  });
});

type ValueFamily = 'estimates' | 'actuals' | 'progress' | 'measures';

describe('working plan value placement validation rolls back its production unit of work', () => {
  for (const family of ['estimates', 'actuals', 'progress', 'measures'] as const) {
    it(`rejects an omitted ${family} group placement`, async () => {
      const parentFixture = openMemorySourceFixture();
      const source = ownTestSource(parentFixture.source);
      const direct = silentBroadcaster();
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
        await authorRunnerSteps(source, 'Build');
        const createdWorkPackage = expectCreated(
          await publicGraph.workPackages.create('Value placement fault', 'fixture-project', OWNER),
        );
        const workPackageId = createdWorkPackage.workPackage.id;
        const stepId = createdWorkPackage.steps[0].id;

        for (const id of ['z-existing', 'a-earlier']) {
          await source.stores.workItems.insert(workItemRow({ id, workPackageId }), [], {
            at: 2,
            by: OWNER,
          });
        }
        await seedFamily(source.stores, family, 'z-existing', stepId);
        let placementCalls = 0;
        const brokenUow: UnitOfWork = {
          run<T>(act: (scope: Scope) => Promise<Decision<T>>): Promise<T> {
            return source.uow.run((scope) => {
              const stores = omitValuePlacements(scope.stores, family, () => {
                placementCalls += 1;
              });
              return act({ stores });
            });
          },
        };
        const runner = runnerOver(source, publicGraph, brokenUow, (scope, broadcast) => {
          const loaded = scope.stores[family].listByWorkPackage(workPackageId);
          return compose(waitForValueLoad(scope.stores, family, loaded), broadcast);
        });

        // Proof: omitting this adapter-owned placement used to commit the newly
        // populated group at the retained array's end instead of rejecting trusted input.
        expect(
          runner.run(workPackageId, OWNER, [setFamilyCommand(family, 'a-earlier', stepId)]),
        ).rejects.toThrow(/targeted placement omitted value group a-earlier/i);
        expect(placementCalls).toBe(1);
        expect(
          (await source.stores[family].listByWorkPackage(workPackageId)).map(
            ({ workItemId }) => workItemId,
          ),
        ).toEqual(['z-existing']);
      } finally {
        await source.close();
      }
    });
  }
});

function omitValuePlacements(
  stores: PlanTransactionalStores,
  family: ValueFamily,
  observe: () => void,
): PlanTransactionalStores {
  const listPlacements = () => {
    observe();
    return Promise.resolve([]);
  };
  if (family === 'estimates')
    return { ...stores, estimates: { ...stores.estimates, listPlacements } };
  if (family === 'actuals') return { ...stores, actuals: { ...stores.actuals, listPlacements } };
  if (family === 'progress') return { ...stores, progress: { ...stores.progress, listPlacements } };
  return { ...stores, measures: { ...stores.measures, listPlacements } };
}

function waitForValueLoad(
  stores: PlanTransactionalStores,
  family: ValueFamily,
  loaded: Promise<unknown>,
): PlanTransactionalStores {
  if (family === 'estimates') {
    return {
      ...stores,
      estimates: {
        ...stores.estimates,
        set: async (...parameters) => {
          await loaded;
          return stores.estimates.set(...parameters);
        },
      },
    };
  }
  if (family === 'actuals') {
    return {
      ...stores,
      actuals: {
        ...stores.actuals,
        set: async (...parameters) => {
          await loaded;
          return stores.actuals.set(...parameters);
        },
      },
    };
  }
  if (family === 'progress') {
    return {
      ...stores,
      progress: {
        ...stores.progress,
        set: async (...parameters) => {
          await loaded;
          return stores.progress.set(...parameters);
        },
      },
    };
  }
  return {
    ...stores,
    measures: {
      ...stores.measures,
      set: async (...parameters) => {
        await loaded;
        return stores.measures.set(...parameters);
      },
    },
  };
}

async function seedFamily(
  stores: PlanTransactionalStores,
  family: ValueFamily,
  workItemId: string,
  stepId: string,
): Promise<void> {
  const stamp = { at: 2, by: OWNER };
  if (family === 'estimates') {
    await stores.estimates.set(
      { workItemId, stepId, optimistic: 1, realistic: 2, pessimistic: 3 },
      stamp,
    );
  } else if (family === 'actuals') {
    await stores.actuals.set({ workItemId, stepId, days: 1, recordedAt: 1 }, stamp);
  } else if (family === 'progress') {
    await stores.progress.set({ workItemId, stepId, state: 'done', statedAt: 1 }, stamp);
  } else {
    await stores.measures.set(
      { workItemId, stepId, metric: 'token_actual', value: 1, recordedAt: 1 },
      stamp,
    );
  }
}

function setFamilyCommand(family: ValueFamily, workItemId: string, stepId: string): PlanCommand {
  if (family === 'estimates') {
    return {
      kind: 'setEstimate',
      workItemId,
      stepId,
      days: { optimistic: 2, realistic: 3, pessimistic: 4 },
    };
  }
  if (family === 'actuals') return { kind: 'setActual', workItemId, stepId, days: 2 };
  if (family === 'progress')
    return { kind: 'setProgress', workItemId, stepId, state: 'in_progress' };
  return { kind: 'setMeasure', workItemId, stepId, metric: 'token_actual', value: 2 };
}

/** Proof: committing refused staged batches failed both exact snapshots; watched 2026-10-14. */
describe('transactional memory move blockage closure', () => {
  async function seeded(destination: 'protected' | 'empty' = 'protected') {
    const parentFixture = openMemorySourceFixture();
    const source = ownTestSource(parentFixture.source);
    const graph = compose(source.stores, silentBroadcaster());
    await source.stores.users.create(
      { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 },
      { at: 1, by: OWNER },
    );
    seedLegacyPackageParent(parentFixture, {
      organizationId: 'fixture-legacy-org',
      projectId: 'fixture-project',
      creator: OWNER,
    });
    await authorRunnerSteps(source, 'Dev');
    const created = expectCreated(
      await graph.workPackages.create('Move closure', 'fixture-project', OWNER),
    );
    const workPackageId = created.workPackage.id;
    const step = created.steps[0];

    for (const id of ['parent', 'destination', 'moving']) {
      await source.stores.workItems.insert(
        workItemRow({ id, workPackageId, parentId: id === 'moving' ? 'parent' : null }),
        [],
        { at: 1, by: OWNER },
      );
    }
    await source.stores.blockages.set(
      { workItemId: 'moving', stepId: step.id, blockedAt: -10 },
      { at: 1, by: OWNER },
    );
    if (destination === 'protected') {
      await source.stores.blockages.set(
        { workItemId: 'destination', stepId: step.id, blockedAt: -20 },
        { at: 1, by: OWNER },
      );
      await source.stores.progress.set(
        { workItemId: 'destination', stepId: step.id, state: 'done', statedAt: 1 },
        { at: 1, by: OWNER },
      );
    }
    const snapshot = () =>
      Promise.all([
        source.stores.workItems.listByWorkPackage(workPackageId),
        source.stores.progress.listByWorkPackage(workPackageId),
        source.stores.blockages.listByWorkPackage(workPackageId),
      ]);
    return { source, graph, workPackageId, stepId: step.id, snapshot };
  }

  it('rolls back moved rows and hand-up facts when a later batch command refuses', async () => {
    const { source, graph, workPackageId, snapshot } = await seeded('empty');
    try {
      const before = await snapshot();
      const runner = runnerOver(source, graph);
      expect(
        await runner.run(workPackageId, OWNER, [
          { kind: 'moveWorkItem', workItemId: 'moving', parentId: 'destination', afterId: null },
          { kind: 'moveWorkItem', workItemId: 'moving', parentId: 'missing', afterId: null },
        ]),
      ).toMatchObject({ ok: false, at: 1 });
      expect(await snapshot()).toEqual(before);
    } finally {
      await source.close();
    }
  });

  it('keeps handed blockage when current move undo finds new parent progress', async () => {
    const { source, graph, workPackageId, stepId, snapshot } = await seeded('empty');
    try {
      const runner = runnerOver(source, graph);
      expect(
        await runner.run(workPackageId, OWNER, [
          { kind: 'moveWorkItem', workItemId: 'moving', parentId: 'destination', afterId: null },
        ]),
      ).toMatchObject({ ok: true });
      expect(await source.stores.blockages.listByWorkItems(workPackageId, ['parent'])).toEqual([
        { workItemId: 'parent', stepId, blockedAt: -10 },
      ]);
      await source.stores.progress.set(
        { workItemId: 'parent', stepId, state: 'done', statedAt: 456 },
        { at: 2, by: OWNER },
      );
      const before = await snapshot();
      expect(await runner.undo(workPackageId, OWNER)).toMatchObject({ ok: false });
      expect(await snapshot()).toEqual(before);
    } finally {
      await source.close();
    }
  });
  it.each(['rename', 'progress'] as const)(
    'does not launder stale destination facts through memory %s replay',
    async (kind) => {
      const fixture = await openLegacyMemoryHistory(kind, 'after-move');
      const { source, workPackageId, snapshot, author } = fixture;
      try {
        expect(author).toBe(OWNER);
        const graph = compose(source.stores, silentBroadcaster()),
          runner = runnerOver(source, graph);
        const recorded = await fixture.fixture.journalHistoryFor(workPackageId);
        expect(await runner.undo(workPackageId, OWNER)).toMatchObject({ ok: true });
        const changed = fixture.selected.metadata.steps.find(
          (step) => step.code === (kind === 'rename' ? 'dev' : 'qa'),
        );
        if (changed === undefined) throw new Error('Genuine Memory changed step is missing');
        expect(
          await source.stores.progress.set(
            { workItemId: 'destination', stepId: changed.id, state: 'in_progress', statedAt: 456 },
            { at: 2, by: OWNER },
          ),
        ).toBe('written');
        expect(await runner.undo(workPackageId, OWNER)).toMatchObject({ ok: true });
        expect(await runner.redo(workPackageId, OWNER)).toMatchObject({ ok: true });
        const before = await snapshot();
        expect(await runner.redo(workPackageId, OWNER)).toMatchObject({
          ok: false,
          reason: 'stale_undo',
          detail: 'progress on a guarded work item changed since this command.',
        });
        expect(await snapshot()).toEqual(before);
        expect(await fixture.fixture.journalHistoryFor(workPackageId)).toEqual(recorded);
      } finally {
        await fixture.close();
      }
    },
  );
  it('rolls back memory deletion facts and rows when a later batch command refuses', async () => {
    const { source, graph, workPackageId, snapshot } = await seeded();
    try {
      const before = await snapshot();
      const runner = runnerOver(source, graph);
      expect(
        await runner.run(workPackageId, OWNER, [
          { kind: 'deleteWorkItem', workItemId: 'moving' },
          { kind: 'patchWorkItem', workItemId: 'missing', patch: { name: 'Lost' } },
        ]),
      ).toMatchObject({ ok: false });
      expect(await snapshot()).toEqual(before);
    } finally {
      await source.close();
    }
  });

  it('preserves collected memory deletion facts and progress through undo redo', async () => {
    const { source, graph, workPackageId, stepId, snapshot } = await seeded();
    try {
      await source.stores.progress.set(
        { workItemId: 'moving', stepId, state: 'done', statedAt: 50 },
        { at: 1, by: OWNER },
      );
      const before = await snapshot();
      const runner = runnerOver(source, graph);
      expect(
        await runner.run(workPackageId, OWNER, [
          { kind: 'deleteWorkItem', workItemId: 'moving' },
          { kind: 'patchWorkItem', workItemId: 'destination', patch: { name: 'After deletion' } },
        ]),
      ).toMatchObject({ ok: true });
      const after = await snapshot();
      expect(await runner.undo(workPackageId, OWNER)).toMatchObject({ ok: true });
      expect(await snapshot()).toEqual(before);
      expect(await runner.redo(workPackageId, OWNER)).toMatchObject({ ok: true });
      expect(await snapshot()).toEqual(after);
    } finally {
      await source.close();
    }
  });

  it.each(['state', 'time', 'missing', 'blockage'] as const)(
    'refuses memory parent %s changes before deletion undo',
    async (fault) => {
      const { source, graph, workPackageId, stepId, snapshot } = await seeded();
      try {
        await source.stores.progress.set(
          { workItemId: 'moving', stepId, state: 'done', statedAt: 50 },
          { at: 1, by: OWNER },
        );
        const runner = runnerOver(source, graph);
        expect(
          await runner.run(workPackageId, OWNER, [
            { kind: 'deleteWorkItem', workItemId: 'moving' },
          ]),
        ).toMatchObject({ ok: true });
        if (fault === 'state' || fault === 'time')
          await source.stores.progress.set(
            {
              workItemId: 'parent',
              stepId,
              state: fault === 'state' ? 'in_progress' : 'done',
              statedAt: fault === 'time' ? 99 : 50,
            },
            { at: 2, by: OWNER },
          );
        if (fault === 'missing')
          await source.stores.progress.remove('parent', stepId, { at: 2, by: OWNER });
        if (fault === 'blockage')
          await source.stores.blockages.set(
            { workItemId: 'parent', stepId, blockedAt: 99 },
            { at: 2, by: OWNER },
          );
        const before = await snapshot();
        expect(await runner.undo(workPackageId, OWNER)).toMatchObject({ ok: false });
        expect(await snapshot()).toEqual(before);
      } finally {
        await source.close();
      }
    },
  );

  it('rolls back memory restore rows and earlier blockage writes after an injected insertion failure', async () => {
    const { source, graph, workPackageId, stepId, snapshot } = await seeded();
    try {
      const runner = runnerOver(source, graph);
      expect(
        await runner.run(workPackageId, OWNER, [{ kind: 'deleteWorkItem', workItemId: 'moving' }]),
      ).toMatchObject({ ok: true });
      const before = await snapshot();
      const failed = runnerOver(source, graph, source.uow, (scope, broadcast) =>
        compose(
          {
            ...scope.stores,
            blockages: {
              ...scope.stores.blockages,
              set: async (fact, stamp) => {
                if (fact.workItemId === 'moving' && fact.stepId === stepId)
                  throw new Error('injected memory blockage failure');
                return scope.stores.blockages.set(fact, stamp);
              },
            },
          },
          broadcast,
        ),
      );
      const rejection = await failed.undo(workPackageId, OWNER).then(
        () => 'resolved',
        (error: unknown) => String(error),
      );
      expect(rejection).toContain('injected memory blockage failure');
      expect(await snapshot()).toEqual(before);
    } finally {
      await source.close();
    }
  });
});
