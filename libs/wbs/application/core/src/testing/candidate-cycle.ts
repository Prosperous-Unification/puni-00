import { expect } from 'bun:test';

import { servicesOver } from '../compose';
import { createPlanCommandRunner } from '../module/plan-commands/composition';
import { clockOf } from '../ports/clock';
import { LEGACY_EDIT_ADMISSION } from '../ports/edit-admission';
import type { Source } from '../ports/source';
import type { StoredTypedDependency } from '../ports/typed-dependency-store';
import type { WorkItem } from '../ports/work-item-store';
import { createLocalDependencyContext } from '../service/dependency-context';
import { recordingBroadcaster } from './broadcast-fixture';
import {
  CLAIM_DEV,
  CLAIM_QA,
  expectClaimFailure,
  seedCurrentClaimObservation,
} from './current-claim-observation';
import { localCommandAccess } from './organization-access-fixture';
import { fastScheduler } from './scheduler-fixture';
import type { StepCatalogueSeed } from './step-catalogue-seed';
import { workItemRow } from './work-item-fixture';

export const CANDIDATE_CYCLE_CASES = [
  'cycle',
  'acyclic',
  'parent',
  'fresh',
  'type-edit',
  'first-child-inspection',
  'inspection-commit',
  'inspection-rollback',
  'inspection-repair',
  'inspection-close',
] as const;

/** Actual borrowed graph inspection distinguishes own execution from uniform order, including future leaves. */
export async function assertCandidateCycle(
  source: Source,
  seed: StepCatalogueSeed,
  purpose: (typeof CANDIDATE_CYCLE_CASES)[number],
): Promise<void> {
  await seedCurrentClaimObservation(source, seed);
  if (purpose === 'first-child-inspection' || purpose.startsWith('inspection-')) {
    expect(typeof Reflect.get(source.stores.subtrees, 'inspectFirstChild')).toBe('function');
    const before = await source.stores.workItems.listByWorkPackage(seed.workPackageId);
    const parent = before.find((row) => row.id === 'claim-empty');
    if (parent === undefined) throw new Error('inspection parent is absent');
    const child = {
      ...workItemRow({ id: 'inspected-fresh-child', workPackageId: seed.workPackageId }),
      parentId: parent.id,
    };
    const write = {
      kind: 'fresh' as const,
      child,
      respaced: [],
      localDependencies: [],
      detachedIncidents: [],
    };
    const inspected = await source.stores.subtrees.inspectFirstChild(write, seed.stamp);
    expect(await source.stores.workItems.listByWorkPackage(seed.workPackageId)).toEqual(before);
    expect(await source.stores.workItems.findById(child.id)).toBeNull();
    expect(inspected.kind).toBe('ready');
    if (purpose === 'inspection-close') {
      const escaped = source.stores.subtrees.inspectFirstChild.bind(source.stores.subtrees);
      await source.close();
      await expectClaimFailure(() => escaped(write, seed.stamp), 'closed');
    } else if (purpose !== 'first-child-inspection') {
      let retained: Source['stores']['subtrees'] | undefined;
      const capture = async (subtrees: Source['stores']['subtrees']) => {
        retained = subtrees;
        expect((await subtrees.inspectFirstChild(write, seed.stamp)).kind).toBe('ready');
      };
      await source.uow.run(async ({ stores }) => {
        if (purpose !== 'inspection-repair') await capture(stores.subtrees);
        return purpose === 'inspection-commit'
          ? { commit: true, value: undefined }
          : {
              commit: false,
              value: undefined,
              ...(purpose === 'inspection-repair'
                ? { afterRollback: async ({ stores: repair }) => capture(repair.subtrees) }
                : {}),
            };
      });
      if (retained === undefined) throw new Error('first child inspection loan was not captured');
      const escaped = retained.inspectFirstChild.bind(retained);
      await expectClaimFailure(() => escaped(write, seed.stamp), 'closed');
      await source.uow.run(async ({ stores }) => {
        expect((await stores.subtrees.inspectFirstChild(write, seed.stamp)).kind).toBe('ready');
        await expectClaimFailure(() => escaped(write, seed.stamp), 'closed');
        return { commit: true, value: undefined };
      });
    }
    return;
  }
  let first = 'claim-first',
    second = 'claim-second';
  if (purpose === 'parent') {
    expect(
      (await source.stores.workItems.patch('claim-parent', { typeIds: [seed.typeId] }, seed.stamp))
        .ok,
    ).toBe(true);
    expect(
      (
        await source.stores.workItems.patch(
          'claim-empty',
          { typeIds: [seed.secondTypeId] },
          seed.stamp,
        )
      ).ok,
    ).toBe(true);
    first = 'claim-parent';
    second = 'claim-empty';
  }
  const before = await source.stores.workItems.listByWorkPackage(seed.workPackageId);
  const rows: WorkItem[] =
    purpose === 'parent'
      ? before.filter((row) => row.id !== 'claim-first' && row.id !== 'claim-second')
      : [...before];
  const directTypes: { workItemId: string; typeIds: string[] }[] = [];
  if (purpose === 'fresh') {
    first = 'candidate-fresh';
    rows.push(workItemRow({ id: first, workPackageId: seed.workPackageId, position: 50 }));
    directTypes.push({ workItemId: first, typeIds: [seed.typeId] });
  }
  const edge = (
    id: string,
    from: string,
    fromStep: string,
    to: string,
    toStep: string,
  ): StoredTypedDependency => ({
    id,
    workPackageId: seed.workPackageId,
    type: 'FS',
    predecessor: {
      workPackageId: seed.workPackageId,
      scope: 'node',
      workItemId: from,
      stepId: fromStep,
    },
    successor: { workPackageId: seed.workPackageId, scope: 'node', workItemId: to, stepId: toStep },
  });
  const typed =
    purpose === 'acyclic' || purpose === 'type-edit'
      ? [
          edge('candidate-forward', first, CLAIM_DEV, second, CLAIM_QA),
          edge('candidate-back', second, CLAIM_DEV, first, CLAIM_QA),
        ]
      : [
          edge('candidate-forward', first, CLAIM_QA, second, CLAIM_QA),
          edge('candidate-back', second, CLAIM_DEV, first, CLAIM_DEV),
        ];
  if (purpose === 'type-edit') {
    for (const relationship of typed)
      await source.stores.typedDependencies.add(relationship, seed.stamp);
    const beforeCommand = await source.stores.workItems.listByWorkPackage(seed.workPackageId);
    const beforeRelationships = await source.stores.typedDependencies.listByWorkPackage(
      seed.workPackageId,
    );
    let sequence = 0;
    const announcements = recordingBroadcaster();
    const options = {
      admission: LEGACY_EDIT_ADMISSION,
      clock: clockOf({
        now: () => seed.stamp.at,
        newId: () => 'candidate-command-' + String(++sequence),
      }),
      broadcast: announcements,
      scheduler: fastScheduler,
    };
    const runner = createPlanCommandRunner({
      commandAccess: localCommandAccess,
      uow: source.uow,
      announcements,
      publicServices: servicesOver(source.stores, {
        ...options,
        dependencyContext: createLocalDependencyContext(source.stores),
      }),
      batchServices: (scope, broadcast, admission, dependencyContext) =>
        servicesOver(scope.stores, {
          ...options,
          broadcast,
          admission,
          dependencyContext: { kind: 'bound', context: dependencyContext },
        }),
    });
    const outcome = await runner.run(seed.workPackageId, seed.stamp.by, [
      { kind: 'patchWorkItem', workItemId: first, patch: { typeIds: [seed.secondTypeId] } },
    ]);
    expect(outcome).toMatchObject({ ok: false, reason: 'cycle' });
    expect(await source.stores.workItems.listByWorkPackage(seed.workPackageId)).toEqual(
      beforeCommand,
    );
    expect(await source.stores.typedDependencies.listByWorkPackage(seed.workPackageId)).toEqual(
      beforeRelationships,
    );
    return;
  }
  const projected = await source.uow.run(async (scope) => {
    const service = servicesOver(scope.stores, {
      admission: LEGACY_EDIT_ADMISSION,
      dependencyContext: createLocalDependencyContext(scope.stores),
      broadcast: recordingBroadcaster(),
      scheduler: fastScheduler,
      clock: clockOf({ now: () => seed.stamp.at, newId: () => 'unused-candidate-id' }),
    }).workItems;
    const cycle = await service.findDependencyCycle(seed.workPackageId, seed.stamp.by, {
      rows,
      typed,
      directTypes,
    });
    return { commit: false, value: cycle };
  });
  if (purpose === 'acyclic') expect(projected).toBeNull();
  else expect(projected?.kind).toBe('cycle');
  expect(await source.stores.workItems.listByWorkPackage(seed.workPackageId)).toEqual(before);
  expect(await source.stores.typedDependencies.listByWorkPackage(seed.workPackageId)).toEqual([]);
}
