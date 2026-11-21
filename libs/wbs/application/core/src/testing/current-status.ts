import { expect } from 'bun:test';

import { servicesOver } from '../compose';
import { clockOf } from '../ports/clock';
import { LEGACY_EDIT_ADMISSION } from '../ports/edit-admission';
import type { ResourceAccess } from '../ports/organization-access';
import type { Source } from '../ports/source';
import { createLocalDependencyContext } from '../service/dependency-context';
import { recordingBroadcaster } from './broadcast-fixture';
import { CLAIM_DEV, CLAIM_QA, seedCurrentClaimObservation } from './current-claim-observation';
import { fastScheduler } from './scheduler-fixture';
import type { StepCatalogueSeed } from './step-catalogue-seed';

export const CURRENT_STATUS_CASES = [
  'first',
  'reopen',
  'parent-start',
  'parent-done',
  'empty',
  'empty-parent',
  'replay',
  'absence',
  'conflict',
  'parent-conflict',
] as const;

/** Actual catalogue resolution and borrowed service writes exercise current status commands. */
export async function assertCurrentStatus(
  source: Source,
  seed: StepCatalogueSeed,
  access: ResourceAccess,
  hasDistinctSets: boolean,
  purpose: (typeof CURRENT_STATUS_CASES)[number],
): Promise<void> {
  await seedCurrentClaimObservation(source, seed);
  if (hasDistinctSets)
    expect(
      (
        await source.stores.stepCatalogue.unbindStep(
          seed.organizationId,
          CLAIM_QA + ':second',
          { dryRun: false },
          seed.stamp,
        )
      ).kind,
    ).toBe('unbound');
  const own = new Map([
    ['claim-first', [CLAIM_DEV, CLAIM_QA]],
    ['claim-second', hasDistinctSets ? [CLAIM_DEV] : [CLAIM_QA, CLAIM_DEV]],
    ['claim-empty', []],
  ]);
  for (const [workItemId, stepIds] of own)
    for (const stepId of stepIds)
      expect(
        await source.stores.estimates.set(
          { workItemId, stepId, optimistic: 1, realistic: 1, pessimistic: 1 },
          seed.stamp,
        ),
      ).toBe('written');
  let sequence = 0;
  const options = {
    admission: LEGACY_EDIT_ADMISSION,
    clock: clockOf({ now: () => seed.stamp.at, newId: () => 'status-id-' + String(++sequence) }),
    broadcast: recordingBroadcaster(),
    scheduler: fastScheduler,
  };
  type Status = 'done' | 'in_progress' | 'unknown' | 'ready' | 'on_hold';
  const set = (workItemId: string, status: Status) =>
    source.uow.run(async (scope) => {
      const writer = servicesOver(scope.stores, {
        ...options,
        dependencyContext: createLocalDependencyContext(scope.stores),
      }).workItems;
      const written = await writer.collect(() =>
        writer.setStatus(workItemId, seed.stamp.by, status, '2026-11-20'),
      );
      if (written.result.ok)
        await writer.recordCollected(
          { workPackageId: seed.workPackageId, userId: seed.stamp.by, personId: null },
          written.recordings,
        );
      return { commit: written.result.ok, value: written.result };
    });
  const replay = (direction: 'undo' | 'redo') =>
    source.uow.run(async (scope) => {
      const writer = servicesOver(scope.stores, {
        ...options,
        dependencyContext: createLocalDependencyContext(scope.stores),
      }).workItems;
      const stack = { workPackageId: seed.workPackageId, userId: seed.stamp.by, personId: null };
      const written = await writer.collect(() =>
        direction === 'undo' ? writer.undoWithin(stack, access) : writer.redoWithin(stack, access),
      );
      return { commit: written.result.ok, value: written.result };
    });
  const progress = async () =>
    (await source.stores.progress.listByWorkPackage(seed.workPackageId))
      .map(({ workItemId, stepId, state }) => ({ workItemId, stepId, state }))
      .sort(
        (left, right) =>
          left.workItemId.localeCompare(right.workItemId) ||
          left.stepId.localeCompare(right.stepId),
      );
  const expected = (state: 'done' | 'in_progress') =>
    [...own]
      .flatMap(([workItemId, steps]) => steps.map((stepId) => ({ workItemId, stepId, state })))
      .sort(
        (left, right) =>
          left.workItemId.localeCompare(right.workItemId) ||
          left.stepId.localeCompare(right.stepId),
      );
  if (purpose === 'absence') {
    const before = await source.stores.workItems.listByWorkPackage(seed.workPackageId);
    const refused = await source.uow.run(async (scope) => {
      const original = scope.stores.workItems;
      // Boundary: delegate the actual borrowed Source methods without mutating its dynamic owner wrapper.
      const corrupted = new Proxy(original, {
        get(target, property) {
          if (property === 'listTreeByWorkPackage')
            return async (workPackageId: string) =>
              (await original.listTreeByWorkPackage(workPackageId)).map((row) => {
                if (row.id !== 'claim-first') return row;
                const { steps: _steps, ...without } = row;
                return without;
              });
          const method: unknown = Reflect.get(target, property);
          if (typeof method !== 'function') throw new Error('Unknown status test port member');
          return (...arguments_: unknown[]): unknown => Reflect.apply(method, target, arguments_);
        },
      });
      const writer = servicesOver(
        { ...scope.stores, workItems: corrupted },
        { ...options, dependencyContext: createLocalDependencyContext(scope.stores) },
      ).workItems;
      const observed = await writer
        .collect(() => writer.setStatus('claim-first', seed.stamp.by, 'in_progress'))
        .then(
          () => ({ kind: 'returned' as const }),
          (cause: unknown) => ({ kind: 'threw' as const, cause }),
        );
      return { commit: false, value: observed };
    });
    expect(refused.kind).toBe('threw');
    if (refused.kind !== 'threw' || !(refused.cause instanceof Error))
      throw new Error('Missing status metadata was accepted');
    expect(refused.cause.message).toBe('captured leaf step order is absent for claim-first');
    expect(await source.stores.workItems.listByWorkPackage(seed.workPackageId)).toEqual(before);
    expect(await progress()).toEqual([]);
    return;
  }
  if (purpose === 'conflict' || purpose === 'parent-conflict') {
    expect(
      (
        await source.stores.workItems.patch(
          'claim-empty',
          { typeIds: [seed.typeId, seed.secondTypeId] },
          seed.stamp,
        )
      ).ok,
    ).toBe(true);
    if (purpose === 'parent-conflict')
      await source.stores.workItems.move('claim-empty', 'claim-parent', 5, [], seed.stamp);
    const id = purpose === 'conflict' ? 'claim-empty' : 'claim-parent';
    const before = await source.stores.workItems.listByWorkPackage(seed.workPackageId);
    for (const status of ['done', 'in_progress'] as const) {
      expect(await set(id, status)).toEqual({ ok: false, reason: 'type_conflict' });
      expect(await source.stores.workItems.listByWorkPackage(seed.workPackageId)).toEqual(before);
      expect(await progress()).toEqual([]);
    }
    for (const status of ['ready', 'on_hold', 'unknown'] as const)
      expect((await set(id, status)).ok).toBe(true);
    return;
  }
  if (purpose === 'empty' || purpose === 'empty-parent') {
    if (purpose === 'empty-parent') {
      await source.stores.workItems.move('claim-empty', 'claim-parent', 5, [], seed.stamp);
      await source.stores.workItems.move('claim-first', null, 30, [], seed.stamp);
      await source.stores.workItems.move('claim-second', null, 40, [], seed.stamp);
    }
    const id = purpose === 'empty' ? 'claim-empty' : 'claim-parent';
    const before = await source.stores.workItems.listByWorkPackage(seed.workPackageId);
    for (const status of ['done', 'in_progress'] as const) {
      expect(await set(id, status)).toEqual({ ok: false, reason: 'no_steps' });
      expect(await progress()).toEqual([]);
      expect(await source.stores.workItems.listByWorkPackage(seed.workPackageId)).toEqual(before);
    }
    expect((await set(id, 'ready')).ok).toBe(true);
    expect((await set(id, 'on_hold')).ok).toBe(true);
    expect((await set(id, 'unknown')).ok).toBe(true);
    expect(await progress()).toEqual([]);
    return;
  }
  if (purpose === 'parent-start' || purpose === 'parent-done' || purpose === 'replay')
    await source.stores.workItems.move('claim-empty', 'claim-parent', 5, [], seed.stamp);
  if (purpose === 'parent-start') {
    expect(
      (await source.stores.workItems.patch('claim-first', { hold: 'on_hold' }, seed.stamp)).ok,
    ).toBe(true);
    expect((await set('claim-parent', 'in_progress')).ok).toBe(true);
    expect(await progress()).toEqual([
      {
        workItemId: 'claim-second',
        stepId: hasDistinctSets ? CLAIM_DEV : CLAIM_QA,
        state: 'in_progress',
      },
    ]);
    expect((await source.stores.workItems.findById('claim-first'))?.hold).toBe('on_hold');
    expect((await source.stores.workItems.findById('claim-empty'))?.factStart).toBe(null);
    return;
  }
  if (purpose === 'parent-done' || purpose === 'replay') {
    const before = await source.stores.workItems.listByWorkPackage(seed.workPackageId);
    expect((await set('claim-parent', 'done')).ok).toBe(true);
    expect(await progress()).toEqual(expected('done'));
    if (purpose === 'replay') {
      expect((await replay('undo')).ok).toBe(true);
      expect(await progress()).toEqual([]);
      for (const prior of before) {
        const restored = await source.stores.workItems.findById(prior.id);
        expect(restored).toMatchObject({
          factStart: prior.factStart,
          factEnd: prior.factEnd,
          readiness: prior.readiness,
          hold: prior.hold,
        });
      }
      expect((await replay('redo')).ok).toBe(true);
      expect(await progress()).toEqual(expected('done'));
    }
    return;
  }
  if (purpose === 'reopen')
    for (const [workItemId, steps] of own)
      for (const stepId of steps)
        expect(
          await source.stores.progress.set(
            { workItemId, stepId, state: 'done', statedAt: seed.stamp.at },
            seed.stamp,
          ),
        ).toBe('written');
  for (const workItemId of ['claim-first', 'claim-second'])
    expect((await set(workItemId, 'in_progress')).ok).toBe(true);
  if (purpose === 'first')
    expect(await progress()).toEqual([
      { workItemId: 'claim-first', stepId: CLAIM_DEV, state: 'in_progress' },
      {
        workItemId: 'claim-second',
        stepId: hasDistinctSets ? CLAIM_DEV : CLAIM_QA,
        state: 'in_progress',
      },
    ]);
  else
    expect(await progress()).toEqual(
      expected('done').map((fact) => ({
        ...fact,
        state: (
          fact.workItemId === 'claim-first' ? fact.stepId === CLAIM_QA : fact.stepId === CLAIM_DEV
        )
          ? 'in_progress'
          : fact.state,
      })),
    );
}
