import { sliceKey } from '@wbs/domain';
import { expect } from 'bun:test';

import { servicesOver } from '../compose';
import { findStartableWork } from '../module/work-item/startable';
import { clockOf } from '../ports/clock';
import { LEGACY_EDIT_ADMISSION } from '../ports/edit-admission';
import type { ResourceAccess } from '../ports/organization-access';
import type { Source } from '../ports/source';
import { createLocalDependencyContext } from '../service/dependency-context';
import { recordingBroadcaster } from './broadcast-fixture';
import {
  CLAIM_DEV,
  CLAIM_PERSON,
  CLAIM_QA,
  seedCurrentClaimObservation,
} from './current-claim-observation';
import { fastScheduler } from './scheduler-fixture';
import type { StepCatalogueSeed } from './step-catalogue-seed';

/** Actual catalogue/person ownership and ports supply execution and claim evidence. */
export async function assertCurrentExecution(
  source: Source,
  seed: StepCatalogueSeed,
  access: ResourceAccess,
  hasDistinctSets: boolean,
  purpose: 'execution' | 'startable' | 'claim' | 'person' | 'claim-conflict',
  ownPerson: () => void,
): Promise<void> {
  await seedCurrentClaimObservation(source, seed);
  ownPerson();
  expect(
    (
      await source.stores.directory.patchPerson(
        CLAIM_PERSON,
        { accountId: seed.stamp.by },
        seed.stamp,
      )
    ).ok,
  ).toBe(true);
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
    clock: clockOf({ now: () => seed.stamp.at, newId: () => 'execution-id-' + String(++sequence) }),
    broadcast: recordingBroadcaster(),
    scheduler: fastScheduler,
  };
  const service = servicesOver(source.stores, {
    ...options,
    dependencyContext: createLocalDependencyContext(source.stores),
  }).workItems;
  if (purpose === 'execution') {
    const live = source.stores.livePlans;
    if (live === undefined) throw new Error('Actual execution Source capability absent');
    const captured = await live.readExecution(seed.workPackageId, access, null);
    expect(captured.kind).toBe('ready');
    if (captured.kind !== 'ready') throw new Error('Actual execution capture refused');
    expect(captured.reads).toHaveProperty('leafSteps', own);
    expect(captured.reads.eligibilityByNode.get(sliceKey('claim-first', CLAIM_DEV))?.canStart).toBe(
      true,
    );
    expect(captured.reads.eligibilityByNode.get(sliceKey('claim-first', CLAIM_QA))?.canStart).toBe(
      false,
    );
    expect(captured.reads.evidenceByNode.has(sliceKey('claim-empty', CLAIM_QA))).toBe(false);
    const absent = new Map(captured.reads.leafSteps);
    absent.delete('claim-empty');
    expect(() => findStartableWork({ ...captured.reads, leafSteps: absent })).toThrow(
      'execution leaf step order is absent for claim-empty',
    );
    const missingTarget = new Map(captured.reads.leafSteps);
    missingTarget.delete('claim-first');
    const corrupted = servicesOver(
      {
        ...source.stores,
        livePlans: {
          ...live,
          readExecution: () =>
            Promise.resolve({
              kind: 'ready',
              reads: { ...captured.reads, leafSteps: missingTarget },
            }),
        },
      },
      { ...options, dependencyContext: createLocalDependencyContext(source.stores) },
    ).workItems;
    const refused = await corrupted
      .claim(
        'claim-first',
        seed.stamp.by,
        {
          personId: CLAIM_PERSON,
          stepIds: null,
          runId: null,
          parentClaimId: null,
          assign: false,
          resources: null,
        },
        access,
        null,
      )
      .then(
        () => ({ kind: 'returned' as const }),
        (cause: unknown) => ({ kind: 'threw' as const, cause }),
      );
    expect(refused.kind).toBe('threw');
    if (refused.kind !== 'threw' || !(refused.cause instanceof Error))
      throw new Error('Missing claim metadata was not refused');
    expect(refused.cause.message).toBe('execution leaf step order is absent for claim-first');
    expect(await source.stores.claims.listByWorkPackage(seed.workPackageId)).toEqual([]);
    return;
  }
  if (purpose === 'startable') {
    const read = await service.startableWithin(seed.workPackageId, access, null);
    if (read === null || 'kind' in read) throw new Error('Actual startable read refused');
    expect(read.leaves.map((leaf) => [leaf.workItemId, leaf.stepIds])).toEqual([
      ['claim-first', [CLAIM_DEV]],
      ['claim-second', hasDistinctSets ? [CLAIM_DEV] : [CLAIM_QA]],
    ]);
    expect(read.prerequisites.map((node) => [node.workItemId, node.stepId])).toEqual([
      ['claim-first', CLAIM_DEV],
      ['claim-first', CLAIM_QA],
      ...(!hasDistinctSets ? [['claim-second', CLAIM_QA]] : []),
      ['claim-second', CLAIM_DEV],
    ]);
    return;
  }
  if (purpose === 'person') {
    for (const [workItemId, stepIds] of own)
      for (const stepId of stepIds) {
        expect(
          (await source.stores.directory.assign(workItemId, stepId, CLAIM_PERSON, seed.stamp)).ok,
        ).toBe(true);
        expect(
          await source.stores.claims.add(
            [
              {
                id: 'held:' + workItemId + ':' + stepId,
                workItemId,
                stepId,
                personId: CLAIM_PERSON,
                accountId: seed.stamp.by,
                runId: null,
                parentClaimId: null,
              },
            ],
            [],
            seed.stamp,
            [],
          ),
        ).toBe('written');
      }
    const read = await service.personWorkWithin(seed.workPackageId, access, CLAIM_PERSON);
    if (read === null || 'kind' in read) throw new Error('Actual person work read refused');
    const expected = [...own].flatMap(([id, stepIds]) => stepIds.map((stepId) => [id, stepId]));
    expect(read.assignments.map((row) => [row.workItemId, row.stepId])).toEqual(expected);
    expect(read.claims.map((row) => [row.workItemId, row.stepId])).toEqual(expected);
    return;
  }
  const claim = (workItemId: string, stepIds: readonly string[] | null) =>
    source.uow.run(async (scope) => {
      const writer = servicesOver(scope.stores, {
        ...options,
        dependencyContext: createLocalDependencyContext(scope.stores),
      }).workItems;
      const written = await writer.collect(() =>
        writer.claim(
          workItemId,
          seed.stamp.by,
          {
            personId: CLAIM_PERSON,
            stepIds,
            runId: null,
            parentClaimId: null,
            assign: false,
            resources: null,
          },
          access,
          null,
        ),
      );
      return { commit: written.result.ok, value: written.result };
    });
  if (purpose === 'claim-conflict') {
    expect(
      (
        await source.stores.workItems.patch(
          'claim-empty',
          { typeIds: [seed.typeId, seed.secondTypeId] },
          seed.stamp,
        )
      ).ok,
    ).toBe(true);
    const before = await source.stores.workItems.listByWorkPackage(seed.workPackageId);
    for (const stepIds of [null, [CLAIM_DEV]] as const)
      expect(await claim('claim-empty', stepIds)).toEqual({ ok: false, reason: 'type_conflict' });
    expect(await claim('claim-empty', ['absent-step'])).toEqual({
      ok: false,
      reason: 'unknown_step',
    });
    expect(await source.stores.claims.listByWorkPackage(seed.workPackageId)).toEqual([]);
    expect(await source.stores.progress.listByWorkPackage(seed.workPackageId)).toEqual([]);
    expect(await source.stores.workItems.listByWorkPackage(seed.workPackageId)).toEqual(before);
    return;
  }
  expect(await claim('claim-first', ['absent-step'])).toEqual({
    ok: false,
    reason: 'unknown_step',
  });
  if (hasDistinctSets) {
    const before = await source.stores.progress.listByWorkPackage(seed.workPackageId);
    expect(await claim('claim-second', [CLAIM_QA])).toEqual({
      ok: false,
      reason: 'step_not_resolved',
    });
    expect(await source.stores.claims.listByWorkPackage(seed.workPackageId)).toEqual([]);
    expect(await source.stores.progress.listByWorkPackage(seed.workPackageId)).toEqual(before);
  }
  for (const [workItemId, stepIds] of own) {
    if (stepIds.length > 1)
      expect(
        await source.stores.progress.set(
          { workItemId, stepId: stepIds[0], state: 'done', statedAt: seed.stamp.at },
          seed.stamp,
        ),
      ).toBe('written');
    const claimed = await claim(workItemId, null);
    expect(claimed.ok).toBe(stepIds.length > 0);
    if (stepIds.length === 0) expect(claimed).toEqual({ ok: false, reason: 'no_steps' });
  }
  expect(
    (await source.stores.claims.listByWorkPackage(seed.workPackageId)).map((claim) => [
      claim.workItemId,
      claim.stepId,
    ]),
  ).toEqual([
    ['claim-first', CLAIM_QA],
    ['claim-second', CLAIM_DEV],
  ]);
}
