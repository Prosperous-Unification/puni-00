import { openMemorySource } from '@wbs/store-memory';
import { describe, expect, it } from 'bun:test';

import { servicesOver } from '../compose';
import { clockOf } from '../ports/clock';
import type { PlanTransactionalStores } from '../ports/stores';
import type { Decision, Scope, UnitOfWork } from '../ports/unit-of-work';
import { testClock } from '../testing/clock-fixture';
import { fastScheduler } from '../testing/scheduler-fixture';
import { workItemRow } from '../testing/work-item-fixture';
import type { Broadcaster } from './broadcast';
import type { PlanCommand } from './plan-command';
import { PlanCommandRunner } from './plan-commands';
import type { WorkingPlan } from './working-plan';

const OWNER = 'plan-command-owner';

function silentBroadcaster(): Broadcaster {
  return {
    publish: () => Promise.resolve(),
    latestSeq: () => Promise.resolve(-1),
  };
}

const compose = (stores: PlanTransactionalStores, broadcast: Broadcaster) =>
  servicesOver(stores, { clock: testClock, broadcast, scheduler: fastScheduler });

function runnerOver(
  source: ReturnType<typeof openMemorySource>,
  publicGraph: ReturnType<typeof compose>,
  uow: UnitOfWork = source.uow,
  batchServices: (
    scope: Scope,
    broadcast: Broadcaster,
    workingPlan?: WorkingPlan,
  ) => ReturnType<typeof compose> = (scope, broadcast, workingPlan) =>
    compose(workingPlan?.stores ?? scope.stores, broadcast),
): PlanCommandRunner {
  return new PlanCommandRunner({
    uow,
    announcements: silentBroadcaster(),
    publicServices: publicGraph,
    batchServices,
  });
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
  it('keeps every memory value group in source order after sets populate an earlier group', async () => {
    const source = openMemorySource();
    const direct = silentBroadcaster();
    const publicGraph = compose(source.stores, direct);
    try {
      await source.stores.users.create(
        { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 },
        { at: 1, by: OWNER },
      );
      const createdProject = await publicGraph.projects.create('Value group ordering', OWNER);
      const projectId = createdProject.project.id;
      const stepId = createdProject.steps[0].id;
      await source.stores.steps.add({ id: stepId, projectId, name: 'Build' }, { at: 2, by: OWNER });
      for (const id of ['z-existing', 'a-earlier']) {
        await source.stores.workItems.insert(workItemRow({ id, projectId }), [], {
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
      const runner = runnerOver(
        source,
        publicGraph,
        source.uow,
        (scope, broadcast, workingPlan) => {
          if (workingPlan === undefined) return compose(scope.stores, broadcast);
          const loaded = Promise.all([
            workingPlan.stores.estimates.listByProject(projectId),
            workingPlan.stores.actuals.listByProject(projectId),
            workingPlan.stores.progress.listByProject(projectId),
            workingPlan.stores.measures.listByProject(projectId),
          ]);
          const measures = {
            ...workingPlan.stores.measures,
            set: async (...parameters: Parameters<PlanTransactionalStores['measures']['set']>) => {
              await loaded;
              const written = await workingPlan.stores.measures.set(...parameters);
              if (parameters[0].metric === 'hours_actual') {
                const retained = await Promise.all([
                  workingPlan.stores.estimates.listByProject(projectId),
                  workingPlan.stores.actuals.listByProject(projectId),
                  workingPlan.stores.progress.listByProject(projectId),
                  workingPlan.stores.measures.listByProject(projectId),
                ]);
                const authoritative = await Promise.all([
                  scope.stores.estimates.listByProject(projectId),
                  scope.stores.actuals.listByProject(projectId),
                  scope.stores.progress.listByProject(projectId),
                  scope.stores.measures.listByProject(projectId),
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
          return compose({ ...workingPlan.stores, measures }, broadcast);
        },
      );

      expect(
        (
          await runner.run(projectId, OWNER, [
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
    const source = openMemorySource();
    const direct = silentBroadcaster();
    const publicGraph = compose(source.stores, direct);

    try {
      await source.stores.users.create(
        { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 },
        { at: 1, by: OWNER },
      );
      const createdProject = await publicGraph.projects.create('Value hand-down refresh', OWNER);
      const projectId = createdProject.project.id;
      const stepId = createdProject.steps[0].id;
      await source.stores.steps.add({ id: stepId, projectId, name: 'Build' }, { at: 2, by: OWNER });
      const parent = await publicGraph.workItems.create(projectId, OWNER, {
        parentId: null,
        afterId: null,
        name: 'Parent',
      });
      if (!parent.ok) throw new Error('value hand-down parent creation refused');
      const runner = runnerOver(source, publicGraph);

      const changed = await runner.run(projectId, OWNER, [
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
      expect(await source.stores.estimates.listByProject(projectId)).toEqual([
        { workItemId: childId, stepId, optimistic: 7, realistic: 8, pessimistic: 9 },
      ]);
      expect(await source.stores.actuals.listByProject(projectId)).toMatchObject([
        { workItemId: childId, stepId, days: 7 },
      ]);
      expect(await source.stores.progress.listByProject(projectId)).toMatchObject([
        { workItemId: childId, stepId, state: 'done' },
      ]);
      expect(
        (await source.stores.measures.listByProject(projectId))
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

      expect(await runner.undo(projectId, OWNER)).toMatchObject({ ok: true });
      expect(await source.stores.estimates.listByProject(projectId)).toEqual([]);
      expect(await source.stores.actuals.listByProject(projectId)).toEqual([]);
      expect(await source.stores.progress.listByProject(projectId)).toEqual([]);
      expect(await source.stores.measures.listByProject(projectId)).toEqual([]);
    } finally {
      await source.close();
    }
  });

  it('removes every moveAll source during the same create command', async () => {
    const source = openMemorySource();
    const direct = silentBroadcaster();
    const publicGraph = compose(source.stores, direct);

    try {
      await source.stores.users.create(
        { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 },
        { at: 1, by: OWNER },
      );
      const createdProject = await publicGraph.projects.create('Value move refresh', OWNER);
      const projectId = createdProject.project.id;
      const stepId = createdProject.steps[0].id;
      await source.stores.steps.add({ id: stepId, projectId, name: 'Build' }, { at: 2, by: OWNER });
      for (const id of ['z-source', 'm-existing']) {
        await source.stores.workItems.insert(workItemRow({ id, projectId }), [], {
          at: 2,
          by: OWNER,
        });
      }
      expect(
        (
          await runnerOver(source, publicGraph).run(projectId, OWNER, [
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
        servicesOver(stores, { clock: orderedClock, broadcast, scheduler: fastScheduler });
      const runner = new PlanCommandRunner({
        uow: source.uow,
        announcements: direct,
        publicServices: publicGraph,
        batchServices(scope, broadcast, workingPlan) {
          if (workingPlan === undefined) return compose(scope.stores, broadcast);
          const watch = <Store extends 'estimates' | 'actuals' | 'progress' | 'measures'>(
            name: Store,
          ): PlanTransactionalStores[Store] => {
            const values = workingPlan.stores[name];
            return {
              ...values,
              moveAll: async (...parameters: Parameters<typeof values.moveAll>) => {
                await values.moveAll(parameters[0], parameters[1], parameters[2]);
                const remaining = await values.listByProject(projectId);
                if (remaining.some(({ workItemId }) => workItemId === parameters[0])) {
                  staleSources.push(name);
                }
                if (name === 'measures') {
                  const retained = await Promise.all([
                    workingPlan.stores.estimates.listByProject(projectId),
                    workingPlan.stores.actuals.listByProject(projectId),
                    workingPlan.stores.progress.listByProject(projectId),
                    workingPlan.stores.measures.listByProject(projectId),
                  ]);
                  const authoritative = await Promise.all([
                    scope.stores.estimates.listByProject(projectId),
                    scope.stores.actuals.listByProject(projectId),
                    scope.stores.progress.listByProject(projectId),
                    scope.stores.measures.listByProject(projectId),
                  ]);
                  expect(retained).toEqual(authoritative);
                  expect(new Set(retained.flat().map(({ workItemId }) => workItemId))).toEqual(
                    new Set(['a-child', 'm-existing']),
                  );
                }
              },
            };
          };
          return orderedCompose(
            {
              ...workingPlan.stores,
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
          await runner.run(projectId, OWNER, [
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
    const source = openMemorySource();
    const direct = silentBroadcaster();
    const publicGraph = compose(source.stores, direct);

    try {
      await source.stores.users.create(
        { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 },
        { at: 1, by: OWNER },
      );
      const createdProject = await publicGraph.projects.create('Value hand-up refresh', OWNER);
      const projectId = createdProject.project.id;
      const stepId = createdProject.steps[0].id;
      await source.stores.steps.add({ id: stepId, projectId, name: 'Build' }, { at: 2, by: OWNER });
      const parent = await publicGraph.workItems.create(projectId, OWNER, {
        parentId: null,
        afterId: null,
        name: 'Parent',
      });
      if (!parent.ok) throw new Error('value hand-up parent creation refused');
      const child = await publicGraph.workItems.create(projectId, OWNER, {
        parentId: parent.value.id,
        afterId: null,
        name: 'Only child',
      });
      if (!child.ok) throw new Error('value hand-up child creation refused');
      expect(
        (
          await runnerOver(source, publicGraph).run(
            projectId,
            OWNER,
            setAllValues(child.value.id, stepId, 1),
          )
        ).ok,
      ).toBe(true);
      const runner = runnerOver(source, publicGraph);

      const changed = await runner.run(projectId, OWNER, [
        { kind: 'deleteWorkItem', workItemId: child.value.id, strategy: 'cascade' },
        ...setAllValues(parent.value.id, stepId, 7),
      ]);

      expect(changed.ok).toBe(true);
      expect(await runner.undo(projectId, OWNER)).toMatchObject({ ok: true });
      expect(await source.stores.estimates.listByProject(projectId)).toMatchObject([
        { workItemId: child.value.id, optimistic: 1, realistic: 2, pessimistic: 3 },
      ]);
      expect(await source.stores.actuals.listByProject(projectId)).toMatchObject([
        { workItemId: child.value.id, days: 1 },
      ]);
      expect(await source.stores.progress.listByProject(projectId)).toMatchObject([
        { workItemId: child.value.id, state: 'in_progress' },
      ]);
      expect(
        (await source.stores.measures.listByProject(projectId))
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
    const source = openMemorySource();
    const direct = silentBroadcaster();
    const publicGraph = compose(source.stores, direct);

    try {
      await source.stores.users.create(
        { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 },
        { at: 1, by: OWNER },
      );
      const createdProject = await publicGraph.projects.create('Value remove refresh', OWNER);
      const projectId = createdProject.project.id;
      const stepId = createdProject.steps[0].id;
      await source.stores.steps.add({ id: stepId, projectId, name: 'Build' }, { at: 2, by: OWNER });
      const leaf = await publicGraph.workItems.create(projectId, OWNER, {
        parentId: null,
        afterId: null,
        name: 'Leaf',
      });
      if (!leaf.ok) throw new Error('value remove leaf creation refused');
      expect(
        (
          await runnerOver(source, publicGraph).run(
            projectId,
            OWNER,
            setAllValues(leaf.value.id, stepId, 1),
          )
        ).ok,
      ).toBe(true);
      const observed: string[] = [];
      const runner = runnerOver(
        source,
        publicGraph,
        source.uow,
        (scope, broadcast, workingPlan) => {
          if (workingPlan === undefined) return compose(scope.stores, broadcast);
          const watch = <Store extends 'estimates' | 'actuals' | 'progress' | 'measures'>(
            name: Store,
          ): PlanTransactionalStores[Store] => {
            const values = workingPlan.stores[name];
            return {
              ...values,
              remove: async (...parameters: Parameters<typeof values.remove>) => {
                const remove = values.remove.bind(values);
                await Reflect.apply(remove, values, parameters);
                const remaining = await values.listByProject(projectId);
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
              ...workingPlan.stores,
              estimates: watch('estimates'),
              actuals: watch('actuals'),
              progress: watch('progress'),
              measures: watch('measures'),
            },
            broadcast,
          );
        },
      );

      expect((await runner.run(projectId, OWNER, clearAllValues(leaf.value.id, stepId))).ok).toBe(
        true,
      );
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
    const source = openMemorySource();
    const direct = silentBroadcaster();
    const publicGraph = compose(source.stores, direct);

    try {
      await source.stores.users.create(
        { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 },
        { at: 1, by: OWNER },
      );
      const projectId = (await publicGraph.projects.create('Inserted row refresh', OWNER)).project
        .id;
      await source.stores.workItems.insert(
        workItemRow({ id: 'parent', projectId, position: 10, name: 'Parent' }),
        [],
        { at: 2, by: OWNER },
      );
      for (const [id, position] of [
        ['a', 1],
        ['b', 2],
      ] as const) {
        await source.stores.workItems.insert(
          workItemRow({ id, projectId, parentId: 'parent', position, name: id.toUpperCase() }),
          [],
          { at: 2, by: OWNER },
        );
      }
      const runner = runnerOver(source, publicGraph);

      const inserted = await runner.run(projectId, OWNER, [
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
      const children = (await source.stores.workItems.listByProject(projectId))
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
    const source = openMemorySource();
    const direct = silentBroadcaster();
    const publicGraph = compose(source.stores, direct);

    try {
      await source.stores.users.create(
        { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 },
        { at: 1, by: OWNER },
      );
      const projectId = (await publicGraph.projects.create('Moved row refresh', OWNER)).project.id;
      for (const row of [
        workItemRow({ id: 'old-parent', projectId, position: 10, name: 'Old parent' }),
        workItemRow({ id: 'new-parent', projectId, position: 20, name: 'New parent' }),
        workItemRow({
          id: 'moving',
          projectId,
          parentId: 'old-parent',
          position: 10,
          name: 'Moving',
        }),
        workItemRow({ id: 'a', projectId, parentId: 'new-parent', position: 1, name: 'A' }),
        workItemRow({ id: 'b', projectId, parentId: 'new-parent', position: 2, name: 'B' }),
      ]) {
        await source.stores.workItems.insert(row, [], { at: 2, by: OWNER });
      }
      const runner = runnerOver(source, publicGraph);

      const moved = await runner.run(projectId, OWNER, [
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
        (await source.stores.workItems.listByProject(projectId))
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

  it('refreshes every frozen row before an unfreeze in the same batch', async () => {
    const source = openMemorySource();
    const direct = silentBroadcaster();
    const publicGraph = compose(source.stores, direct);

    try {
      await source.stores.users.create(
        { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 },
        { at: 1, by: OWNER },
      );
      const projectId = (await publicGraph.projects.create('Frozen row refresh', OWNER)).project.id;
      for (const [id, position] of [
        ['a', 10],
        ['b', 20],
      ] as const) {
        await source.stores.workItems.insert(
          workItemRow({ id, projectId, position, name: id.toUpperCase() }),
          [],
          { at: 2, by: OWNER },
        );
      }
      const runner = runnerOver(source, publicGraph);

      const frozen = await runner.run(projectId, OWNER, [
        { kind: 'freezeProject' },
        { kind: 'unfreezeProject' },
      ]);

      expect(frozen.ok).toBe(true);
      // Proof: delegating setFrozenNumbers without refreshing every update made the
      // unfreeze command see no frozen rows; the store retained "010" and "020".
      expect(
        (await source.stores.workItems.listByProject(projectId)).map(({ id, frozenNumber }) => [
          id,
          frozenNumber,
        ]),
      ).toEqual([
        ['a', null],
        ['b', null],
      ]);
    } finally {
      await source.close();
    }
  });

  it('refreshes removed rows and promoted children before the next placement', async () => {
    const source = openMemorySource();
    const direct = silentBroadcaster();
    const publicGraph = compose(source.stores, direct);

    try {
      await source.stores.users.create(
        { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 },
        { at: 1, by: OWNER },
      );
      const projectId = (await publicGraph.projects.create('Promoted row refresh', OWNER)).project
        .id;
      for (const row of [
        workItemRow({ id: 'sibling', projectId, position: 10, name: 'Sibling' }),
        workItemRow({ id: 'removed', projectId, position: 20, name: 'Removed' }),
        workItemRow({
          id: 'promoted',
          projectId,
          parentId: 'removed',
          position: 10,
          name: 'Promoted',
        }),
      ]) {
        await source.stores.workItems.insert(row, [], { at: 2, by: OWNER });
      }
      const runner = runnerOver(source, publicGraph);

      const removed = await runner.run(projectId, OWNER, [
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
        (await source.stores.workItems.listByProject(projectId))
          .filter(({ parentId }) => parentId === null)
          .sort((left, right) => left.position - right.position)
          .map(({ name }) => name),
      ).toEqual(['Sibling', 'Promoted', 'After promoted']);
    } finally {
      await source.close();
    }
  });

  it('does not advance a retained row after a refused patch', async () => {
    const source = openMemorySource();
    const direct = silentBroadcaster();
    const publicGraph = compose(source.stores, direct);

    try {
      await source.stores.users.create(
        { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 },
        { at: 1, by: OWNER },
      );
      const projectId = (await publicGraph.projects.create('Refused patch refresh', OWNER)).project
        .id;
      const created = await publicGraph.workItems.create(projectId, OWNER, {
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
                listByIds: async (requestedProjectId, ids) =>
                  (await scope.stores.workItems.listByIds(requestedProjectId, ids)).map((row) => ({
                    ...row,
                    name: 'Invented after refusal',
                  })),
              },
            };
            return act({ stores });
          });
        },
      };
      let observedAfterRefusal: string | undefined;
      const runner = runnerOver(
        source,
        publicGraph,
        deceptiveUow,
        (scope, broadcast, workingPlan) => {
          if (workingPlan === undefined) return compose(scope.stores, broadcast);
          const workItems = {
            ...workingPlan.stores.workItems,
            patch: async (
              ...parameters: Parameters<PlanTransactionalStores['workItems']['patch']>
            ) => {
              const written = await workingPlan.stores.workItems.patch(...parameters);
              if (!written.ok) {
                observedAfterRefusal = (
                  await workingPlan.stores.workItems.listByProject(projectId)
                ).find(({ id }) => id === parameters[0])?.name;
              }
              return written;
            },
          };
          return compose({ ...workingPlan.stores, workItems }, broadcast);
        },
      );

      const refused = await runner.run(projectId, OWNER, [
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
      expect(await source.stores.workItems.listByIds(projectId, [created.value.id])).toMatchObject([
        { name: 'Authoritative before refusal' },
      ]);
    } finally {
      await source.close();
    }
  });
});

interface Placement {
  id: string;
  afterId: string | null;
}

async function expectPlacementFaultRollsBack(
  alter: (placements: Placement[]) => Placement[],
  expected: RegExp,
): Promise<void> {
  const source = openMemorySource();
  const direct = silentBroadcaster();
  const publicGraph = compose(source.stores, direct);
  try {
    await source.stores.users.create(
      { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 },
      { at: 1, by: OWNER },
    );
    const projectId = (await publicGraph.projects.create('Placement validation', OWNER)).project.id;
    await source.stores.workItems.insert(
      workItemRow({ id: 'anchor', projectId, position: 10, name: 'Anchor' }),
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
                listPlacements: async (requestedProjectId, ids) => {
                  placementCalls += 1;
                  return alter(
                    await scope.stores.workItems.listPlacements(requestedProjectId, ids),
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
      await runner.run(projectId, OWNER, [
        { kind: 'createWorkItem', parentId: null, afterId: 'anchor', name: 'Rolled back' },
      ]);
    } catch (error) {
      failure = error;
    }
    expect(placementCalls).toBe(1);
    expect((await source.stores.workItems.listByProject(projectId)).map(({ id }) => id)).toEqual([
      'anchor',
    ]);
    if (!(failure instanceof Error)) throw new Error('placement fault did not reject with Error');
    expect(() => {
      throw failure;
    }).toThrow(expected);
  } finally {
    await source.close();
  }
}

describe('working plan placement validation rolls back its production unit of work', () => {
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
    const source = openMemorySource();
    const direct = silentBroadcaster();
    const publicGraph = compose(source.stores, direct);
    try {
      await source.stores.users.create(
        { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 },
        { at: 1, by: OWNER },
      );
      const projectId = (await publicGraph.projects.create('Unauthorized refresh row', OWNER))
        .project.id;
      await source.stores.workItems.insert(
        workItemRow({ id: 'old-parent', projectId, position: 10, name: 'Hidden old parent' }),
        [],
        { at: 2, by: OWNER },
      );
      await source.stores.workItems.insert(
        workItemRow({
          id: 'moving',
          projectId,
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
                  listByProject: async (requestedProjectId) =>
                    (await scope.stores.workItems.listByProject(requestedProjectId)).filter(
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
        await runner.run(projectId, OWNER, [
          { kind: 'moveWorkItem', workItemId: 'moving', parentId: null, afterId: null },
        ]);
      } catch (error) {
        failure = error;
      }
      expect(await source.stores.workItems.listByIds(projectId, ['moving'])).toMatchObject([
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
      const source = openMemorySource();
      const direct = silentBroadcaster();
      const publicGraph = compose(source.stores, direct);
      try {
        await source.stores.users.create(
          { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 },
          { at: 1, by: OWNER },
        );
        const createdProject = await publicGraph.projects.create('Value placement fault', OWNER);
        const projectId = createdProject.project.id;
        const stepId = createdProject.steps[0].id;
        await source.stores.steps.add(
          { id: stepId, projectId, name: 'Build' },
          { at: 2, by: OWNER },
        );
        for (const id of ['z-existing', 'a-earlier']) {
          await source.stores.workItems.insert(workItemRow({ id, projectId }), [], {
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
        const runner = runnerOver(
          source,
          publicGraph,
          brokenUow,
          (scope, broadcast, workingPlan) => {
            if (workingPlan === undefined) return compose(scope.stores, broadcast);
            const loaded = workingPlan.stores[family].listByProject(projectId);
            return compose(waitForValueLoad(workingPlan.stores, family, loaded), broadcast);
          },
        );

        // Proof: omitting this adapter-owned placement used to commit the newly
        // populated group at the retained array's end instead of rejecting trusted input.
        expect(
          runner.run(projectId, OWNER, [setFamilyCommand(family, 'a-earlier', stepId)]),
        ).rejects.toThrow(/targeted placement omitted value group a-earlier/i);
        expect(placementCalls).toBe(1);
        expect(
          (await source.stores[family].listByProject(projectId)).map(
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
