import { openMemorySource } from '@wbs/store-memory';
import { projectRow } from '@wbs/store-memory/project-fixture';
import {
  inMemoryStepParallels,
  memoryStepParallelTable,
} from '@wbs/store-memory/step-parallel-fixture';
import { describe, expect, it } from 'bun:test';

import { servicesOver } from '../../compose';
import { clockOf } from '../../ports/clock';
import { CREATOR_ADMISSION } from '../../ports/edit-admission';
import { recordingBroadcaster } from '../../testing/broadcast-fixture';
import { fastScheduler } from '../../testing/scheduler-fixture';
import { workItemRow } from '../../testing/work-item-fixture';
import { createPlanCommandRunner } from '../plan-commands/composition';
import { installWorkItem } from './check';

/** Awaits real rejected calls without relying on Bun's void-typed rejection matcher. */
async function rejectedMessage(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (cause) {
    if (cause instanceof Error) return cause.message;
    throw cause;
  }
  throw new Error('expected the production call to reject');
}

const stamp = { at: 1, by: 'owner' };

async function seeded() {
  const source = openMemorySource();
  const { stores } = source;
  await stores.projects.create(
    projectRow({ id: 'p', ownerId: 'owner', restricted: true }),
    ['dev', 'qa'].map((id, index) => ({
      id,
      projectId: 'p',
      name: id,
      position: (index + 1) * 10,
      code: id,
      allowancePercent: 0,
      estimateUnit: 'workdays' as const,
    })),
    stamp,
  );
  for (const id of ['dev', 'qa']) {
    await stores.steps.add(
      { id, projectId: 'p', name: id, allowancePercent: 0, estimateUnit: 'workdays' },
      stamp,
    );
  }
  await stores.workItems.insert(
    workItemRow({ id: 'parent', projectId: 'p', readiness: 'ready', hold: 'on_hold' }),
    [],
    stamp,
  );
  await stores.estimates.set(
    { workItemId: 'parent', stepId: 'dev', optimistic: 1, realistic: 2, pessimistic: 3 },
    stamp,
  );
  await stores.blockages.set({ workItemId: 'parent', stepId: 'dev', blockedAt: 1 }, stamp);
  await stores.workItems.insert(
    workItemRow({ id: 'moving', projectId: 'p', position: 20 }),
    [],
    stamp,
  );
  const broadcast = recordingBroadcaster();
  let stamps = 0;
  let ids = 0;
  const requirements = {
    ...stores,
    admission: CREATOR_ADMISSION,
    scheduler: fastScheduler,
    broadcast,
    clock: clockOf({
      now: () => {
        stamps++;
        return 2;
      },
      newId: () => `new-${String(++ids)}`,
    }),
  };
  const snapshot = () =>
    Promise.all([
      stores.workItems.listByProject('p'),
      stores.projects.findById('p'),
      stores.estimates.listByProject('p'),
      stores.actuals.listByProject('p'),
      stores.measures.listByProject('p'),
      stores.progress.listByProject('p'),
      stores.blockages.listByProject('p'),
      stores.attempts.listByProject('p'),
      stores.directory.assignmentsInProject('p'),
      stores.typedDependencies.listByProject('p'),
      stores.journal.entriesFor({ projectId: 'p', userId: 'owner', personId: null }),
      stores.planEvents.listFor('p', {}),
      stores.stepParallels.listByProject('p'),
    ]);
  return { source, stores, broadcast, requirements, snapshot, counts: () => ({ stamps, ids }) };
}

describe('duplicate sparse source preservation', () => {
  for (const nested of [false, true]) {
    it(`refuses ${nested ? 'nested' : 'leaf'} equal-default policy before IDs, stamps or writes`, async () => {
      const fixture = await seeded();
      const owner = nested ? 'leaf' : 'parent';
      if (nested) {
        await fixture.stores.blockages.remove('parent', 'dev', stamp);
        await fixture.stores.workItems.patch('parent', { readiness: null, hold: null }, stamp);
        await fixture.stores.estimates.remove('parent', 'dev', stamp);
        for (const [id, parentId] of [
          ['branch', 'parent'],
          ['leaf', 'branch'],
        ] as const)
          await fixture.stores.workItems.insert(
            workItemRow({ id, parentId, projectId: 'p' }),
            [],
            stamp,
          );
      }
      for (const stepId of ['qa', 'dev'])
        await fixture.stores.stepParallels.set(
          { workItemId: owner, stepId, maxParallel: 1 },
          stamp,
        );
      await fixture.stores.stepParallels.set(
        { workItemId: 'moving', stepId: 'dev', maxParallel: 2 },
        stamp,
      );
      const before = await fixture.snapshot();
      const { workItems } = installWorkItem(fixture.requirements);
      expect(await workItems.duplicate('parent', 'owner')).toEqual({
        ok: false,
        reason: 'referenced_by_step_parallel',
        nodes: [
          { workItemId: owner, stepId: 'dev' },
          { workItemId: owner, stepId: 'qa' },
        ],
      });
      expect(await fixture.snapshot()).toEqual(before);
      expect(fixture.counts()).toEqual({ stamps: 0, ids: 0 });
      expect(fixture.broadcast.published).toEqual([]);
      if (nested) {
        for (const stepId of ['dev', 'qa'])
          await fixture.stores.stepParallels.remove(owner, stepId, stamp);
        expect((await workItems.duplicate('parent', 'owner')).ok).toBe(true);
      }
      await fixture.source.close();
    });
  }

  it('keeps missing, authorization and 501-row precedence before failed evidence', async () => {
    const fixture = await seeded();
    const { workItems } = installWorkItem({
      ...fixture.requirements,
      stepParallels: {
        listByWorkItems: () => {
          throw new Error('duplicate sparse reader unavailable');
        },
      },
    });
    expect(await workItems.duplicate('missing', 'owner')).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(await workItems.duplicate('parent', 'stranger')).toEqual({
      ok: false,
      reason: 'forbidden',
    });
    expect(await rejectedMessage(workItems.duplicate('parent', 'owner'))).toContain(
      'duplicate sparse reader unavailable',
    );
    await fixture.stores.blockages.remove('parent', 'dev', stamp);
    await fixture.stores.workItems.patch('parent', { readiness: null, hold: null }, stamp);
    await fixture.stores.estimates.remove('parent', 'dev', stamp);
    for (let index = 0; index < 500; index++)
      await fixture.stores.workItems.insert(
        workItemRow({ id: `child-${String(index)}`, parentId: 'parent', projectId: 'p' }),
        [],
        stamp,
      );
    const before = await fixture.snapshot();
    expect(await workItems.duplicate('parent', 'owner')).toEqual({
      ok: false,
      reason: 'too_large',
    });
    expect(await fixture.snapshot()).toEqual(before);
    expect(fixture.counts()).toEqual({ stamps: 0, ids: 0 });
    await fixture.source.close();
  });
});

for (const fault of ['maximum', 'step', 'project', 'parent', 'duplicate'] as const) {
  it(`throws on selected trusted ${fault} corruption before duplication`, async () => {
    const fixture = await seeded();
    const { stores } = fixture;
    await stores.projects.create(projectRow({ id: 'foreign', ownerId: 'owner' }), [], stamp);
    await stores.steps.add(
      {
        id: 'foreign-step',
        projectId: 'foreign',
        name: 'Foreign',
        allowancePercent: 0,
        estimateUnit: 'workdays',
      },
      stamp,
    );
    if (fault === 'parent') {
      await stores.blockages.remove('parent', 'dev', stamp);
      await stores.workItems.patch('parent', { readiness: null, hold: null }, stamp);
      await stores.estimates.remove('parent', 'dev', stamp);
      await stores.workItems.insert(
        workItemRow({ id: 'child', parentId: 'parent', projectId: 'p' }),
        [],
        stamp,
      );
    }
    const table = memoryStepParallelTable();
    table.rows.push({
      workItemId: 'parent',
      stepId: fault === 'step' ? 'missing' : fault === 'project' ? 'foreign-step' : 'dev',
      maxParallel: fault === 'maximum' ? 1001 : 1,
    });
    if (fault === 'duplicate') table.rows.push({ ...table.rows[0] });
    const { workItems } = installWorkItem({
      ...fixture.requirements,
      stepParallels: inMemoryStepParallels(stores.workItems, stores.steps, table),
    });
    const before = await fixture.snapshot();
    const messages = {
      maximum: 'integer from 1 to 1000',
      step: 'invalid step reference',
      project: 'project mismatch',
      parent: 'owner is not a leaf',
      duplicate: 'duplicate step parallelism',
    };
    expect(await rejectedMessage(workItems.duplicate('parent', 'owner'))).toContain(
      messages[fault],
    );
    expect(await fixture.snapshot()).toEqual(before);
    expect(fixture.counts()).toEqual({ stamps: 0, ids: 0 });
    if (fault === 'parent') {
      table.rows.length = 0;
      expect((await workItems.duplicate('parent', 'owner')).ok).toBe(true);
    }
    await fixture.source.close();
  });
}

it('copies detached exact refusal nodes and allows duplication when cleared', async () => {
  const fixture = await seeded();
  const fact = { workItemId: 'parent', stepId: 'dev', maxParallel: 1 };
  const retained = [fact];
  const { workItems } = installWorkItem({
    ...fixture.requirements,
    stepParallels: { listByWorkItems: () => Promise.resolve(retained) },
  });
  const refused = await workItems.duplicate('parent', 'owner');
  const expected = {
    ok: false,
    reason: 'referenced_by_step_parallel',
    nodes: [{ workItemId: 'parent', stepId: 'dev' }],
  } as const;
  expect(refused).toEqual(expected);
  fact.workItemId = 'mutated';
  fact.stepId = 'mutated-step';
  expect(refused).toEqual(expected);
  retained.length = 0;
  expect((await workItems.duplicate('parent', 'owner')).ok).toBe(true);
  await fixture.source.close();
});

it('throws when the required duplication sparse reader is absent before writes', async () => {
  const fixture = await seeded();
  const requirements = { ...fixture.requirements };
  // Test-only broken composition boundary: production DI requires the sparse reader.
  Reflect.deleteProperty(requirements, 'stepParallels');
  const { workItems } = installWorkItem(requirements);
  const before = await fixture.snapshot();
  expect(await rejectedMessage(workItems.duplicate('parent', 'owner'))).toContain(
    'listByWorkItems',
  );
  expect(await fixture.snapshot()).toEqual(before);
  expect(fixture.counts()).toEqual({ stamps: 0, ids: 0 });
  await fixture.source.close();
});

it('reads admitted sparse duplication evidence and rolls a preceding patch and journal back', async () => {
  const fixture = await seeded();
  const graph = servicesOver(fixture.stores, fixture.requirements);
  const before = await fixture.snapshot();
  const runner = createPlanCommandRunner({
    uow: {
      run: (act) =>
        fixture.source.uow.run(async (scope) => {
          await scope.stores.stepParallels.set(
            { workItemId: 'parent', stepId: 'dev', maxParallel: 1 },
            stamp,
          );
          expect(await fixture.stores.stepParallels.listByProject('p')).toEqual([]);
          return act(scope);
        }),
    },
    announcements: fixture.broadcast,
    publicServices: graph,
    batchServices: (scope, broadcast) =>
      servicesOver(scope.stores, { ...fixture.requirements, broadcast }),
  });
  expect(
    await runner.run('p', 'owner', [
      { kind: 'patchWorkItem', workItemId: 'moving', patch: { name: 'Must roll back' } },
      { kind: 'duplicateWorkItem', workItemId: 'parent' },
    ]),
  ).toEqual({
    ok: false,
    at: 1,
    kind: 'duplicateWorkItem',
    reason: 'referenced_by_step_parallel',
    detail: { nodes: [{ workItemId: 'parent', stepId: 'dev' }] },
  });
  expect(await fixture.snapshot()).toEqual(before);
  expect(fixture.broadcast.published).toEqual([]);
  await fixture.source.close();
});

it('duplicates an empty selection while unrelated and foreign policies keep their owners', async () => {
  const fixture = await seeded();
  await fixture.stores.projects.create(projectRow({ id: 'foreign', ownerId: 'owner' }), [], stamp);
  await fixture.stores.steps.add(
    {
      id: 'foreign-step',
      projectId: 'foreign',
      name: 'Foreign',
      allowancePercent: 0,
      estimateUnit: 'workdays',
    },
    stamp,
  );
  await fixture.stores.workItems.insert(
    workItemRow({ id: 'foreign-row', projectId: 'foreign' }),
    [],
    stamp,
  );
  for (const [workItemId, stepId] of [
    ['moving', 'dev'],
    ['foreign-row', 'foreign-step'],
  ] as const)
    await fixture.stores.stepParallels.set({ workItemId, stepId, maxParallel: 1 }, stamp);
  const policy = await fixture.stores.stepParallels.listByProject('p');
  const foreign = await fixture.stores.stepParallels.listByProject('foreign');
  const { workItems } = installWorkItem(fixture.requirements);
  const copied = await workItems.duplicate('parent', 'owner');
  expect(copied.ok).toBe(true);
  if (!copied.ok) throw new Error('empty duplicate refused');
  expect(await fixture.stores.workItems.findById(copied.value.id)).not.toBeNull();
  expect(await fixture.stores.stepParallels.listByProject('p')).toEqual(policy);
  expect(await fixture.stores.stepParallels.listByProject('foreign')).toEqual(foreign);
  await fixture.source.close();
});
