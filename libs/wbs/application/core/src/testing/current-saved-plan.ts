import { SavedHistoryError } from '@wbs/domain';
import { expect } from 'bun:test';

import { servicesOver } from '../compose';
import { installSavedPlans } from '../module/saved-plans/check';
import { clockOf } from '../ports/clock';
import { LEGACY_EDIT_ADMISSION } from '../ports/edit-admission';
import type { Source } from '../ports/source';
import { createLocalDependencyContext } from '../service/dependency-context';
import { prepareCapturedScheduleParts } from '../service/schedule-parts';
import { recordingBroadcaster } from './broadcast-fixture';
import { CLAIM_DEV, CLAIM_QA, seedCurrentClaimObservation } from './current-claim-observation';
import { fastScheduler } from './scheduler-fixture';
import type { StepCatalogueSeed } from './step-catalogue-seed';

/** Authors current catalogue facts through actual Sources; no historical producer or mocked capture authority. */
export async function assertCurrentSavedPlan(
  source: Source,
  seed: StepCatalogueSeed,
  hasDistinctSets: boolean,
  purpose: 'schedule' | 'save' | 'refuse-missing' | 'refuse-parent' | 'refuse-foreign',
  writeMode: 'legacy' | 'scoped',
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
  for (const [workItemId, steps] of [
    ['claim-first', [CLAIM_DEV, CLAIM_QA]],
    ['claim-second', hasDistinctSets ? [CLAIM_DEV] : [CLAIM_QA, CLAIM_DEV]],
  ] as const)
    for (const stepId of steps)
      expect(
        await source.stores.estimates.set(
          {
            workItemId,
            stepId,
            optimistic: 1,
            realistic: 1,
            pessimistic: 1,
          },
          seed.stamp,
        ),
      ).toBe('written');
  const captured = await source.history.savedPlanCapture.readPlanInput(seed.workPackageId);
  if (captured === null) throw new Error('Actual current capture absent');
  const own = [
    { workItemId: 'claim-empty', stepIds: [] },
    { workItemId: 'claim-first', stepIds: [CLAIM_DEV, CLAIM_QA] },
    { workItemId: 'claim-second', stepIds: hasDistinctSets ? [CLAIM_DEV] : [CLAIM_QA, CLAIM_DEV] },
  ];
  if (purpose !== 'schedule' && purpose !== 'save') {
    const leafSteps =
      purpose === 'refuse-missing'
        ? captured.leafSteps.filter((leaf) => leaf.workItemId !== 'claim-empty')
        : [
            ...captured.leafSteps,
            {
              workItemId: purpose === 'refuse-parent' ? 'claim-parent' : 'foreign-leaf',
              stepIds: [],
            },
          ];
    expect(() => prepareCapturedScheduleParts({ ...captured, leafSteps })).toThrow(
      SavedHistoryError,
    );
    return;
  }
  if (purpose === 'schedule') {
    const prepared = prepareCapturedScheduleParts(captured);
    const live = await servicesOver(source.stores, {
      dependencyContext: createLocalDependencyContext(source.stores),
      admission: LEGACY_EDIT_ADMISSION,
      clock: clockOf({ now: () => seed.stamp.at, newId: () => 'unused-live-input-id' }),
      broadcast: recordingBroadcaster(),
      scheduler: fastScheduler,
    }).workItems.scheduleInput(seed.workPackageId);
    if (live === null) throw new Error('Actual live input absent');
    expect(
      live.slices
        .filter((slice) => slice.workItemId === 'claim-first')
        .map((slice) => slice.stepId),
    ).toEqual([CLAIM_DEV, CLAIM_QA]);
    expect(
      live.slices
        .filter((slice) => slice.workItemId === 'claim-second')
        .map((slice) => slice.stepId),
    ).toEqual(hasDistinctSets ? [CLAIM_DEV] : [CLAIM_QA, CLAIM_DEV]);
    expect(
      live.slices
        .filter((slice) => slice.workItemId === 'claim-empty')
        .map((slice) => slice.stepId),
    ).toEqual([null]);
    expect(
      prepared.input.slices
        .filter((slice) => slice.workItemId === 'claim-first')
        .map((slice) => slice.stepId),
    ).toEqual([CLAIM_DEV, CLAIM_QA]);
    expect(
      prepared.input.slices
        .filter((slice) => slice.workItemId === 'claim-second')
        .map((slice) => slice.stepId),
    ).toEqual(hasDistinctSets ? [CLAIM_DEV] : [CLAIM_QA, CLAIM_DEV]);
    expect(
      prepared.input.slices
        .filter((slice) => slice.workItemId === 'claim-empty')
        .map((slice) => slice.stepId),
    ).toEqual([null]);
    expect(prepared.input.slices.some((slice) => slice.workItemId === 'claim-parent')).toBe(false);
    return;
  }
  let sequence = 0;
  const { savedPlans } = installSavedPlans({
    capture: source.history.savedPlanCapture,
    plans: source.history.savedPlans,
    scheduler: fastScheduler,
    digest: {
      sha256: (bytes) =>
        Promise.resolve(new Bun.CryptoHasher('sha256').update(bytes).digest('hex')),
    },
    newId: () => 'current-leaf-save-' + String(++sequence),
    now: () => seed.stamp.at,
  });
  const access = {
    kind: 'scoped' as const,
    scope: { organizationId: seed.organizationId, userId: seed.stamp.by, cap: null },
    principal: { id: seed.stamp.by },
  };
  const saved = await savedPlans.save({
    workPackageId: seed.workPackageId,
    createdBy: 'catalogue-author',
    createdById: seed.stamp.by,
    access: writeMode === 'legacy' ? { kind: 'legacy' } : access,
    ...(writeMode === 'scoped'
      ? {
          scoped: {
            organizationId: seed.organizationId,
            actorId: seed.stamp.by,
            principal: access.principal,
            operation: 'save' as const,
          },
        }
      : {}),
  });
  expect(saved.outcome).toBe('saved');
  if (saved.outcome !== 'saved') throw new Error('Actual current save refused: ' + saved.outcome);
  expect(saved.record.input.schemaVersion).toBe(13);
  const stored = await savedPlans.read(saved.record.id);
  expect(stored.outcome).toBe('read');
  if (stored.outcome !== 'read')
    throw new Error('Actual current saved read refused: ' + stored.outcome);
  const body: unknown = JSON.parse(stored.plan.input.bytes);
  expect(body).toMatchObject({ schemaVersion: 13, leafSteps: own });
  expect(stored.plan.schedule.present).toBe(true);
  const same = await savedPlans.compare(
    seed.workPackageId,
    { kind: 'saved', savedPlanId: saved.record.id },
    { kind: 'current' },
    access,
  );
  expect(same).toMatchObject({ outcome: 'compared', diff: { input: [], schedule: [] } });
  const bytes = stored.plan.input.bytes;
  expect(
    (
      await source.stores.workItems.patch(
        'claim-first',
        hasDistinctSets
          ? { name: 'Changed after saved capture' }
          : { typeIds: [seed.secondTypeId] },
        seed.stamp,
      )
    ).ok,
  ).toBe(true);
  const changed = await savedPlans.compare(
    seed.workPackageId,
    { kind: 'saved', savedPlanId: saved.record.id },
    { kind: 'current' },
    access,
  );
  expect(changed.outcome).toBe('compared');
  if (changed.outcome !== 'compared') throw new Error('Actual current comparison refused');
  expect(
    changed.diff.input.some(
      (difference) =>
        difference.path ===
          (hasDistinctSets ? 'workItems[claim-first].name' : 'leafSteps[claim-first].stepIds') &&
        difference.category === (hasDistinctSets ? 'renamed' : 'reordered'),
    ),
  ).toBe(true);
  const retained = await savedPlans.read(saved.record.id);
  if (retained.outcome !== 'read') throw new Error('Saved capture was invalidated by a later edit');
  expect(retained.plan.input.bytes).toBe(bytes);
}
