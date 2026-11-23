import { openMemorySourceFixture } from '@wbs/store-memory/source';
import { inMemorySteps } from '@wbs/store-memory/step-fixture';
import {
  inMemoryStepParallels,
  memoryStepParallelTable,
} from '@wbs/store-memory/step-parallel-fixture';
import { ownTestSource } from '@wbs/store-memory/testing/owned-source-fixture';
import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { describe, expect, it } from 'bun:test';

import { servicesOver } from '../../compose';
import { clockOf } from '../../ports/clock';
import { LEGACY_EDIT_ADMISSION } from '../../ports/edit-admission';
import { createLocalDependencyContext } from '../../service/dependency-context';
import { createBoundFixturePackage } from '../../testing/bound-package-fixture';
import { recordingBroadcaster } from '../../testing/broadcast-fixture';
import { seedLegacyPackageParent } from '../../testing/legacy-package-source-fixture';
import { localCommandAccess } from '../../testing/organization-access-fixture';
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
  const parentFixture = openMemorySourceFixture();
  const source = ownTestSource(parentFixture.source);
  await source.stores.users.create(
    { id: 'owner', username: 'owner', passwordHash: null, createdAt: 1 },
    stamp,
  );
  seedLegacyPackageParent(parentFixture, {
    organizationId: 'fixture-legacy-org',
    projectId: 'fixture-project',
    creator: 'owner',
  });
  parentFixture.seedPackageParent({
    spaceId: null,
    spacePosition: null,
    id: 'sparse-foreign-project',
    organizationId: 'fixture-legacy-org',
    name: 'Other sparse policy project',
    createdBy: 'owner',
    revision: 0,
    createdAt: 1,
    updatedAt: null,
  });
  const { stores } = source;
  await createBoundFixturePackage(
    source,
    'fixture-legacy-org',
    workPackageRow({ id: 'p', projectId: 'fixture-project', restricted: false }),
    [
      {
        definition: {
          id: 'dev',
          name: 'dev',
          code: 'dev',
          position: 10,
          defaultEstimateUnit: 'workdays',
          defaultAllowancePercent: 0,
        },
        binding: {
          bindingId: 'sparse-dev-binding',
          scopeKind: 'project',
          scopeId: 'fixture-project',
          workItemTypeId: null,
          position: 10,
        },
      },
      {
        definition: {
          id: 'qa',
          name: 'qa',
          code: 'qa',
          position: 20,
          defaultEstimateUnit: 'workdays',
          defaultAllowancePercent: 0,
        },
        binding: {
          bindingId: 'sparse-qa-binding',
          scopeKind: 'project',
          scopeId: 'fixture-project',
          workItemTypeId: null,
          position: 20,
        },
      },
    ],
    stamp,
  );

  await stores.workItems.insert(
    workItemRow({ id: 'parent', workPackageId: 'p', readiness: 'ready', hold: 'on_hold' }),
    [],
    stamp,
  );
  expect(
    await stores.estimates.set(
      { workItemId: 'parent', stepId: 'dev', optimistic: 1, realistic: 2, pessimistic: 3 },
      stamp,
    ),
  ).toBe('written');
  expect(
    await stores.blockages.set({ workItemId: 'parent', stepId: 'dev', blockedAt: 1 }, stamp),
  ).toBe('written');
  await stores.workItems.insert(
    workItemRow({ id: 'moving', workPackageId: 'p', position: 20 }),
    [],
    stamp,
  );
  const broadcast = recordingBroadcaster();
  let stamps = 0;
  let ids = 0;
  const requirements = {
    dependencyContext: createLocalDependencyContext(stores),
    ...stores,
    admission: LEGACY_EDIT_ADMISSION,
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
      stores.workItems.listByWorkPackage('p'),
      stores.workPackages.findById('p'),
      stores.estimates.listByWorkPackage('p'),
      stores.actuals.listByWorkPackage('p'),
      stores.measures.listByWorkPackage('p'),
      stores.progress.listByWorkPackage('p'),
      stores.blockages.listByWorkPackage('p'),
      stores.attempts.listByWorkPackage('p'),
      stores.directory.assignmentsInWorkPackage('p'),
      stores.typedDependencies.listByWorkPackage('p'),
      stores.journal.entriesFor({ workPackageId: 'p', userId: 'owner', personId: null }),
      stores.planEvents.listFor('p', {}),
      stores.stepParallels.listByWorkPackage('p'),
    ]);
  return { source, stores, broadcast, requirements, snapshot, counts: () => ({ stamps, ids }) };
}

describe('delete sparse owner preservation', () => {
  for (const strategy of [null, 'cascade'] as const) {
    it(`refuses leaf ${String(strategy)} with exact equal-default pairs before stamps or writes`, async () => {
      const fixture = await seeded();
      for (const stepId of ['dev', 'qa'])
        await fixture.stores.stepParallels.set(
          { workItemId: 'parent', stepId, maxParallel: 1 },
          stamp,
        );
      await fixture.stores.stepParallels.set(
        { workItemId: 'moving', stepId: 'dev', maxParallel: 2 },
        stamp,
      );
      const before = await fixture.snapshot();
      const { workItems } = installWorkItem(fixture.requirements);
      expect(await workItems.remove('parent', 'owner', strategy, { kind: 'legacy' })).toEqual({
        ok: false,
        reason: 'referenced_by_step_parallel',
        nodes: [
          { workItemId: 'parent', stepId: 'dev' },
          { workItemId: 'parent', stepId: 'qa' },
        ],
      });
      expect(await fixture.snapshot()).toEqual(before);
      expect(fixture.counts()).toEqual({ stamps: 0, ids: 0 });
      expect(fixture.broadcast.published).toEqual([]);
      await fixture.source.close();
    });
  }

  it('refuses cascade descendant owners while promote keeps their exact sparse policy', async () => {
    const fixture = await seeded();
    await fixture.stores.blockages.remove('parent', 'dev', stamp);
    await fixture.stores.estimates.remove('parent', 'dev', stamp);
    for (const [id, parentId] of [
      ['branch', 'parent'],
      ['leaf', 'branch'],
      ['peer', 'parent'],
    ] as const)
      await fixture.stores.workItems.insert(
        workItemRow({ id, parentId, workPackageId: 'p' }),
        [],
        stamp,
      );
    for (const [workItemId, stepId] of [
      ['leaf', 'qa'],
      ['peer', 'dev'],
      ['moving', 'dev'],
    ] as const)
      await fixture.stores.stepParallels.set({ workItemId, stepId, maxParallel: 1 }, stamp);
    const before = await fixture.snapshot();
    const policy = await fixture.stores.stepParallels.listByWorkPackage('p');
    const { workItems } = installWorkItem(fixture.requirements);
    expect(await workItems.remove('parent', 'owner', 'cascade', { kind: 'legacy' })).toEqual({
      ok: false,
      reason: 'referenced_by_step_parallel',
      nodes: [
        { workItemId: 'leaf', stepId: 'qa' },
        { workItemId: 'peer', stepId: 'dev' },
      ],
    });
    expect(await fixture.snapshot()).toEqual(before);
    expect(fixture.counts()).toEqual({ stamps: 0, ids: 0 });
    expect((await workItems.remove('parent', 'owner', 'promote', { kind: 'legacy' })).ok).toBe(
      true,
    );
    expect(await fixture.stores.workItems.findById('parent')).toBeNull();
    expect((await fixture.stores.workItems.findById('branch'))?.parentId).toBeNull();
    expect(await fixture.stores.stepParallels.listByWorkPackage('p')).toEqual(policy);
    await fixture.source.close();
  });

  it('keeps missing, authorization and required strategy precedence before failed evidence', async () => {
    const fixture = await seeded();
    await fixture.stores.blockages.remove('parent', 'dev', stamp);
    await fixture.stores.estimates.remove('parent', 'dev', stamp);
    await fixture.stores.workItems.insert(
      workItemRow({ id: 'child', parentId: 'parent', workPackageId: 'p' }),
      [],
      stamp,
    );
    const { workItems } = installWorkItem({
      ...fixture.requirements,
      stepParallels: {
        listByWorkItems: () => {
          throw new Error('delete sparse reader unavailable');
        },
      },
    });
    expect(await workItems.remove('missing', 'owner', null, { kind: 'legacy' })).toEqual({
      ok: false,
      reason: 'not_found',
    });
    await fixture.stores.workPackages.update('p', { restricted: true }, stamp);
    const restrictedBefore = await fixture.snapshot();
    expect(await workItems.remove('parent', 'stranger', 'cascade', { kind: 'legacy' })).toEqual({
      ok: false,
      reason: 'forbidden',
    });
    expect(await workItems.remove('parent', 'owner', 'cascade', { kind: 'legacy' })).toEqual({
      ok: false,
      reason: 'forbidden',
    });
    expect(await fixture.snapshot()).toEqual(restrictedBefore);
    await fixture.stores.workPackages.update('p', { restricted: false }, stamp);
    const before = await fixture.snapshot();
    expect(await workItems.remove('parent', 'owner', null, { kind: 'legacy' })).toEqual({
      ok: false,
      reason: 'strategy_required',
    });
    expect(
      await rejectedMessage(workItems.remove('parent', 'owner', 'cascade', { kind: 'legacy' })),
    ).toContain('delete sparse reader unavailable');
    expect(await fixture.snapshot()).toEqual(before);
    expect(fixture.counts()).toEqual({ stamps: 0, ids: 0 });
    await fixture.source.close();
  });
});

for (const fault of ['maximum', 'step', 'workPackage', 'parent', 'duplicate'] as const) {
  it(`throws on selected trusted ${fault} corruption before deletion`, async () => {
    const fixture = await seeded();
    const { stores } = fixture;
    await createBoundFixturePackage(
      fixture.source,
      'fixture-legacy-org',
      workPackageRow({ id: 'foreign', projectId: 'sparse-foreign-project' }),
      [
        {
          definition: {
            id: 'foreign-step',
            name: 'Foreign',
            code: 'foreign',
            position: 10,
            defaultEstimateUnit: 'workdays',
            defaultAllowancePercent: 0,
          },
          binding: {
            bindingId: 'sparse-foreign-binding',
            scopeKind: 'project',
            scopeId: 'sparse-foreign-project',
            workItemTypeId: null,
            position: 10,
          },
        },
      ],
      stamp,
    );

    if (fault === 'parent') {
      await stores.blockages.remove('parent', 'dev', stamp);
      await stores.estimates.remove('parent', 'dev', stamp);
      await stores.workItems.insert(
        workItemRow({ id: 'child', parentId: 'parent', workPackageId: 'p' }),
        [],
        stamp,
      );
    }
    const table = memoryStepParallelTable();
    table.rows.push({
      workItemId: 'parent',
      stepId: fault === 'step' ? 'missing' : fault === 'workPackage' ? 'foreign-step' : 'dev',
      maxParallel: fault === 'maximum' ? 1001 : 1,
    });
    if (fault === 'duplicate') table.rows.push({ ...table.rows[0] });
    const { workItems } = installWorkItem({
      ...fixture.requirements,
      stepParallels: inMemoryStepParallels(
        stores.workItems,
        inMemorySteps([
          ...(await stores.workPackages.stepsOf('p')),
          ...(await stores.workPackages.stepsOf('foreign')),
        ]),
        table,
      ),
    });
    const before = await fixture.snapshot();
    const messages = {
      maximum: 'integer from 1 to 1000',
      step: 'invalid step reference',
      workPackage: 'work package mismatch',
      parent: 'owner is not a leaf',
      duplicate: 'duplicate step parallelism',
    };
    expect(
      await rejectedMessage(workItems.remove('parent', 'owner', 'cascade', { kind: 'legacy' })),
    ).toContain(messages[fault]);
    expect(await fixture.snapshot()).toEqual(before);
    expect(fixture.counts()).toEqual({ stamps: 0, ids: 0 });
    await fixture.source.close();
  });
}

it('copies detached exact refusal nodes and allows deletion when cleared', async () => {
  const fixture = await seeded();
  const fact = { workItemId: 'parent', stepId: 'dev', maxParallel: 1 };
  const retained = [fact];
  const { workItems } = installWorkItem({
    ...fixture.requirements,
    stepParallels: { listByWorkItems: () => Promise.resolve(retained) },
  });
  const refused = await workItems.remove('parent', 'owner', null, { kind: 'legacy' });
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
  expect((await workItems.remove('parent', 'owner', null, { kind: 'legacy' })).ok).toBe(true);
  await fixture.source.close();
});

it('throws when the required deletion sparse reader is absent before writes', async () => {
  const fixture = await seeded();
  const requirements = { ...fixture.requirements };
  // Test-only broken composition boundary: production DI requires the sparse reader.
  Reflect.deleteProperty(requirements, 'stepParallels');
  const { workItems } = installWorkItem(requirements);
  const before = await fixture.snapshot();
  expect(
    await rejectedMessage(workItems.remove('parent', 'owner', null, { kind: 'legacy' })),
  ).toContain('listByWorkItems');
  expect(await fixture.snapshot()).toEqual(before);
  expect(fixture.counts()).toEqual({ stamps: 0, ids: 0 });
  await fixture.source.close();
});

it('reads admitted sparse deletion evidence and rolls a preceding patch and journal back', async () => {
  const fixture = await seeded();
  const graph = servicesOver(fixture.stores, fixture.requirements);
  const before = await fixture.snapshot();
  const runner = createPlanCommandRunner({
    commandAccess: localCommandAccess,
    uow: {
      run: (act) =>
        fixture.source.uow.run(async (scope) => {
          await scope.stores.stepParallels.set(
            { workItemId: 'parent', stepId: 'dev', maxParallel: 1 },
            stamp,
          );
          expect(await fixture.stores.stepParallels.listByWorkPackage('p')).toEqual([]);
          return act(scope);
        }),
    },
    announcements: fixture.broadcast,
    publicServices: graph,
    batchServices: (scope, broadcast) =>
      servicesOver(scope.stores, {
        ...fixture.requirements,
        dependencyContext: createLocalDependencyContext(scope.stores),
        broadcast,
      }),
  });
  expect(
    await runner.run('p', 'owner', [
      { kind: 'patchWorkItem', workItemId: 'moving', patch: { name: 'Must roll back' } },
      { kind: 'deleteWorkItem', workItemId: 'parent', strategy: 'cascade' },
    ]),
  ).toEqual({
    ok: false,
    at: 1,
    kind: 'deleteWorkItem',
    reason: 'referenced_by_step_parallel',
    detail: { nodes: [{ workItemId: 'parent', stepId: 'dev' }] },
  });
  expect(await fixture.snapshot()).toEqual(before);
  expect(fixture.broadcast.published).toEqual([]);
  await fixture.source.close();
});
