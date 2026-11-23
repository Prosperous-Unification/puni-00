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

async function seeded(destination: 'protected' | 'empty' = 'protected') {
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
  if (destination === 'protected') {
    expect(
      await stores.estimates.set(
        { workItemId: 'parent', stepId: 'dev', optimistic: 1, realistic: 2, pessimistic: 3 },
        stamp,
      ),
    ).toBe('written');
    expect(
      await stores.blockages.set({ workItemId: 'parent', stepId: 'dev', blockedAt: 1 }, stamp),
    ).toBe('written');
  }
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
    ]);
  return { source, stores, broadcast, requirements, snapshot, counts: () => ({ stamps, ids }) };
}

const move = { parentId: 'parent', afterId: null };
const protectedMove = {
  ok: false,
  reason: 'step_nodes_in_use',
  count: 1,
  pairs: [
    {
      id: 'parent',
      name: 'Rewire the shed',
      workPackageId: 'p',
      stepId: 'dev',
      facts: ['estimate', 'blockage'],
    },
  ],
} as const;

describe('move sparse step parallel preservation', () => {
  for (const count of [1, 2]) {
    it(`refuses ${String(count)} retained pairs before stamping or clearing parent statements`, async () => {
      const fixture = await seeded();
      const { stores, requirements } = fixture;
      for (const stepId of ['dev', 'qa'].slice(0, count)) {
        await stores.stepParallels.set({ workItemId: 'parent', stepId, maxParallel: 1 }, stamp);
      }
      await stores.workItems.insert(workItemRow({ id: 'sibling', workPackageId: 'p' }), [], stamp);
      await stores.stepParallels.set(
        { workItemId: 'sibling', stepId: 'qa', maxParallel: 2 },
        stamp,
      );
      const before = await fixture.snapshot();
      const { workItems } = installWorkItem(requirements);
      expect(await workItems.move('moving', 'owner', move, { kind: 'legacy' })).toEqual({
        ok: false,
        reason: 'referenced_by_step_parallel',
        nodes: ['dev', 'qa'].slice(0, count).map((stepId) => ({ workItemId: 'parent', stepId })),
      });
      expect(await fixture.snapshot()).toEqual(before);
      expect(fixture.counts()).toEqual({ stamps: 0, ids: 0 });
      expect(fixture.broadcast.published).toEqual([]);
      await fixture.source.close();
    });
  }

  it('checks authorization and parent membership and cycles before a poisoned reader', async () => {
    const fixture = await seeded();
    const { workItems } = installWorkItem({
      ...fixture.requirements,
      stepParallels: {
        listByWorkItems: () => {
          throw new Error('poisoned sparse read');
        },
      },
    });
    expect(await workItems.move('missing', 'owner', move, { kind: 'legacy' })).toEqual({
      ok: false,
      reason: 'not_found',
    });
    await fixture.stores.workPackages.update('p', { restricted: true }, stamp);
    const restrictedBefore = await fixture.snapshot();
    expect(await workItems.move('moving', 'stranger', move, { kind: 'legacy' })).toEqual({
      ok: false,
      reason: 'forbidden',
    });
    expect(await workItems.move('moving', 'owner', move, { kind: 'legacy' })).toEqual({
      ok: false,
      reason: 'forbidden',
    });
    expect(await fixture.snapshot()).toEqual(restrictedBefore);
    await fixture.stores.workPackages.update('p', { restricted: false }, stamp);
    await fixture.stores.workPackages.create(
      workPackageRow({ id: 'foreign', projectId: 'sparse-foreign-project' }),
      [],
      stamp,
    );
    await fixture.stores.workItems.insert(
      workItemRow({ id: 'foreign-parent', workPackageId: 'foreign' }),
      [],
      stamp,
    );
    expect(
      await workItems.move(
        'moving',
        'owner',
        { ...move, parentId: 'foreign-parent' },
        { kind: 'legacy' },
      ),
    ).toEqual({ ok: false, reason: 'not_found' });
    expect(
      await workItems.move('moving', 'owner', { ...move, parentId: 'missing' }, { kind: 'legacy' }),
    ).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(
      await workItems.move(
        'moving',
        'owner',
        { parentId: 'moving', afterId: null },
        { kind: 'legacy' },
      ),
    ).toEqual({
      ok: false,
      reason: 'cycle',
    });
    expect(
      await rejectedMessage(workItems.move('moving', 'owner', move, { kind: 'legacy' })),
    ).toContain('poisoned sparse read');
    expect(fixture.counts()).toEqual({ stamps: 0, ids: 0 });
    await fixture.source.close();
  });

  for (const destination of ['protected', 'empty'] as const) {
    it(
      'move policy preserves sibling facts with ' + destination + ' destination step nodes',
      async () => {
        const fixture = await seeded(destination);
        await fixture.stores.workItems.insert(
          workItemRow({ id: 'sibling', workPackageId: 'p' }),
          [],
          stamp,
        );
        await fixture.stores.stepParallels.set(
          { workItemId: 'sibling', stepId: 'dev', maxParallel: 2 },
          stamp,
        );
        const { workItems } = installWorkItem(fixture.requirements);
        expect(
          (await workItems.move('moving', 'owner', { ...move, parentId: null }, { kind: 'legacy' }))
            .ok,
        ).toBe(true);
        const before = await fixture.snapshot(),
          published = fixture.broadcast.published.length;
        const moved = await workItems.move('moving', 'owner', move, { kind: 'legacy' });
        if (destination === 'protected') {
          expect(moved).toEqual(protectedMove);
          expect(await fixture.snapshot()).toEqual(before);
          expect(fixture.broadcast.published).toHaveLength(published);
        } else {
          expect(moved).toEqual({ ok: true, value: null });
          expect((await workItems.move('moving', 'owner', move, { kind: 'legacy' })).ok).toBe(true);
          expect(await fixture.stores.stepParallels.listByWorkPackage('p')).toEqual([
            { workItemId: 'sibling', stepId: 'dev', maxParallel: 2 },
          ]);
        }
        await fixture.source.close();
      },
    );
  }
});

it('reads the admitted sparse store and rolls a preceding patch back with its journal/events', async () => {
  const fixture = await seeded();
  const { source, requirements, broadcast } = fixture;
  const graph = servicesOver(source.stores, requirements);
  const snapshot = () =>
    Promise.all([
      source.stores.workItems.listByWorkPackage('p'),
      source.stores.journal.entriesFor({ workPackageId: 'p', userId: 'owner', personId: null }),
      source.stores.planEvents.listFor('p', {}),
      source.stores.stepParallels.listByWorkPackage('p'),
    ]);
  const before = await snapshot();
  const runner = createPlanCommandRunner({
    commandAccess: localCommandAccess,
    uow: {
      run: (act) =>
        source.uow.run(async (scope) => {
          await scope.stores.stepParallels.set(
            { workItemId: 'parent', stepId: 'dev', maxParallel: 1 },
            stamp,
          );
          expect(await source.stores.stepParallels.listByWorkPackage('p')).toEqual([]);
          return act(scope);
        }),
    },
    announcements: broadcast,
    publicServices: graph,
    batchServices: (scope, announcements) => {
      return servicesOver(scope.stores, {
        ...requirements,
        dependencyContext: createLocalDependencyContext(scope.stores),
        broadcast: announcements,
      });
    },
  });
  expect(
    await runner.run('p', 'owner', [
      { kind: 'patchWorkItem', workItemId: 'parent', patch: { name: 'Must roll back' } },
      { kind: 'moveWorkItem', workItemId: 'moving', ...move },
    ]),
  ).toEqual({
    ok: false,
    at: 1,
    kind: 'moveWorkItem',
    reason: 'referenced_by_step_parallel',
    detail: { nodes: [{ workItemId: 'parent', stepId: 'dev' }] },
  });
  expect(await snapshot()).toEqual(before);
  expect(broadcast.published).toEqual([]);
  await source.close();
});

for (const fault of ['maximum', 'step', 'workPackage', 'parent', 'duplicate'] as const) {
  it(`throws on trusted ${fault} corruption without moving or clearing statements`, async () => {
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
        workItemRow({ id: 'existing', workPackageId: 'p', parentId: 'parent' }),
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
    const sparse = inMemoryStepParallels(
      stores.workItems,
      inMemorySteps([
        ...(await stores.workPackages.stepsOf('p')),
        ...(await stores.workPackages.stepsOf('foreign')),
      ]),
      table,
    );
    const { workItems } = installWorkItem({ ...fixture.requirements, stepParallels: sparse });
    const before = await fixture.snapshot();
    const messages = {
      maximum: 'integer from 1 to 1000',
      step: 'invalid step reference',
      workPackage: 'work package mismatch',
      parent: 'owner is not a leaf',
      duplicate: 'duplicate step parallelism',
    };
    expect(
      await rejectedMessage(workItems.move('moving', 'owner', move, { kind: 'legacy' })),
    ).toContain(messages[fault]);
    expect(await fixture.snapshot()).toEqual(before);
    expect(fixture.counts()).toEqual({ stamps: 0, ids: 0 });
    await fixture.source.close();
  });
}

for (const destination of ['protected', 'empty'] as const) {
  it(
    'sparse references detach before ' + destination + ' destination usage admission',
    async () => {
      const fixture = await seeded(destination),
        fact = { workItemId: 'parent', stepId: 'dev', maxParallel: 1 },
        retained = [fact];
      const { workItems } = installWorkItem({
        ...fixture.requirements,
        stepParallels: { listByWorkItems: () => Promise.resolve(retained) },
      });
      const refused = await workItems.move('moving', 'owner', move, { kind: 'legacy' });
      expect(refused).toEqual({
        ok: false,
        reason: 'referenced_by_step_parallel',
        nodes: [{ workItemId: 'parent', stepId: 'dev' }],
      });
      fact.workItemId = 'mutated';
      expect(refused).toEqual({
        ok: false,
        reason: 'referenced_by_step_parallel',
        nodes: [{ workItemId: 'parent', stepId: 'dev' }],
      });
      retained.length = 0;
      const before = await fixture.snapshot(),
        published = fixture.broadcast.published.length;
      const moved = await workItems.move('moving', 'owner', move, { kind: 'legacy' });
      if (destination === 'protected') {
        expect(moved).toEqual(protectedMove);
        expect(await fixture.snapshot()).toEqual(before);
        expect(fixture.broadcast.published).toHaveLength(published);
      } else expect(moved).toEqual({ ok: true, value: null });
      await fixture.source.close();
    },
  );
}

it('throws when the required sparse reader is absent before any writes', async () => {
  const fixture = await seeded();
  const requirements = { ...fixture.requirements };
  // Test-only broken composition boundary: production DI requires this reader.
  Reflect.deleteProperty(requirements, 'stepParallels');
  const { workItems } = installWorkItem(requirements);
  const before = await fixture.snapshot();
  expect(
    await rejectedMessage(workItems.move('moving', 'owner', move, { kind: 'legacy' })),
  ).toContain('listByWorkItems');
  expect(await fixture.snapshot()).toEqual(before);
  expect(fixture.counts()).toEqual({ stamps: 0, ids: 0 });
  await fixture.source.close();
});

it('does not consult sparse evidence for root moves', async () => {
  const fixture = await seeded();
  const { workItems } = installWorkItem({
    ...fixture.requirements,
    stepParallels: {
      listByWorkItems: () => {
        throw new Error('root must not read sparse policy');
      },
    },
  });
  expect(
    (
      await workItems.move(
        'moving',
        'owner',
        { parentId: null, afterId: 'parent' },
        { kind: 'legacy' },
      )
    ).ok,
  ).toBe(true);
  await fixture.source.close();
});

it('validates selected facts for same-parent moves and existing parents', async () => {
  const fixture = await seeded();
  await fixture.stores.blockages.remove('parent', 'dev', stamp);
  await fixture.stores.estimates.remove('parent', 'dev', stamp);
  await fixture.stores.workItems.insert(
    workItemRow({ id: 'existing', workPackageId: 'p', parentId: 'parent' }),
    [],
    stamp,
  );
  const { workItems } = installWorkItem({
    ...fixture.requirements,
    stepParallels: {
      listByWorkItems: () => {
        throw new Error('selected parent corruption');
      },
    },
  });
  const before = await fixture.snapshot();
  for (const id of ['moving', 'existing']) {
    expect(await rejectedMessage(workItems.move(id, 'owner', move, { kind: 'legacy' }))).toContain(
      'selected parent corruption',
    );
  }
  expect(await fixture.snapshot()).toEqual(before);
  expect(fixture.counts()).toEqual({ stamps: 0, ids: 0 });
  await fixture.source.close();
});

for (const destination of ['protected', 'empty'] as const) {
  it(
    'moving subtree and sibling policy survive ' + destination + ' destination admission',
    async () => {
      const fixture = await seeded(destination);
      for (const [id, parentId] of [
        ['child', 'moving'],
        ['sibling', null],
      ] as const) {
        await fixture.stores.workItems.insert(
          workItemRow({ id, workPackageId: 'p', parentId }),
          [],
          stamp,
        );
        await fixture.stores.stepParallels.set(
          { workItemId: id, stepId: 'dev', maxParallel: 2 },
          stamp,
        );
      }
      const before = await fixture.snapshot(),
        policy = await fixture.stores.stepParallels.listByWorkPackage('p');
      const { workItems } = installWorkItem(fixture.requirements);
      const moved = await workItems.move('moving', 'owner', move, { kind: 'legacy' });
      if (destination === 'protected') {
        expect(moved).toEqual(protectedMove);
        expect(await fixture.snapshot()).toEqual(before);
        expect(fixture.broadcast.published).toEqual([]);
      } else expect(moved).toEqual({ ok: true, value: null });
      expect(await fixture.stores.stepParallels.listByWorkPackage('p')).toEqual(policy);
      await fixture.source.close();
    },
  );
}

for (const destination of ['protected', 'empty'] as const) {
  it(
    'batch moves preserve ' + destination + ' destination policy through refusal or undo redo',
    async () => {
      const fixture = await seeded(destination);
      await fixture.stores.workItems.insert(
        workItemRow({ id: 'sibling', workPackageId: 'p' }),
        [],
        stamp,
      );
      await fixture.stores.stepParallels.set(
        { workItemId: 'sibling', stepId: 'dev', maxParallel: 2 },
        stamp,
      );
      const graph = servicesOver(fixture.source.stores, fixture.requirements);
      const runner = createPlanCommandRunner({
        commandAccess: localCommandAccess,
        uow: fixture.source.uow,
        announcements: fixture.broadcast,
        publicServices: graph,
        batchServices: (scope, broadcast) =>
          servicesOver(scope.stores, {
            ...fixture.requirements,
            dependencyContext: createLocalDependencyContext(scope.stores),
            broadcast,
          }),
      });
      const before = await fixture.snapshot();
      const moved = await runner.run('p', 'owner', [
        { kind: 'moveWorkItem', workItemId: 'moving', ...move },
      ]);
      if (destination === 'protected') {
        expect(moved).toEqual({
          ok: false,
          at: 0,
          kind: 'moveWorkItem',
          reason: 'step_nodes_in_use',
          detail: { count: protectedMove.count, pairs: protectedMove.pairs },
        });
        expect(await fixture.snapshot()).toEqual(before);
        expect(fixture.broadcast.published).toEqual([]);
      } else {
        expect(moved.ok).toBe(true);
        expect((await runner.undo('p', 'owner')).ok).toBe(true);
        expect((await fixture.stores.workItems.findById('moving'))?.parentId).toBeNull();
        expect((await runner.redo('p', 'owner')).ok).toBe(true);
        expect((await fixture.stores.workItems.findById('moving'))?.parentId).toBe('parent');
      }
      expect(await fixture.stores.stepParallels.listByWorkPackage('p')).toEqual([
        { workItemId: 'sibling', stepId: 'dev', maxParallel: 2 },
      ]);
      await fixture.source.close();
    },
  );
}
