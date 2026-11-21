import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { expect } from 'bun:test';

import type { StepCatalogueFixture } from '../step-catalogue-fixture';

async function prepareTypedEstimate(fixture: StepCatalogueFixture) {
  const { source, port, seed } = fixture;
  const typeId = seed.typeId;
  expect(
    (
      await port.defineAndBindStep(
        seed.organizationId,
        {
          id: 'typed-estimate',
          code: 'typed-estimate',
          name: 'Typed Estimate',
          defaultEstimateUnit: 'minutes',
          defaultAllowancePercent: 12.5,
          position: 10,
        },
        {
          bindingId: 'typed-estimate-binding',
          scopeKind: 'project',
          scopeId: seed.projectId,
          workItemTypeId: typeId,
          position: 10,
        },
        seed.stamp,
      )
    ).ok,
  ).toBe(true);
  const estimate = {
    workItemId: 'typed-estimate-leaf',
    stepId: 'typed-estimate',
    optimistic: 1,
    realistic: 2,
    pessimistic: 3,
  };
  await source.stores.workItems.insert(
    workItemRow({ id: estimate.workItemId, workPackageId: seed.workPackageId, name: 'Typed leaf' }),
    [],
    seed.stamp,
  );
  expect(
    (await port.readPackage(seed.organizationId, seed.workPackageId))?.steps.map(
      ({ stepId }) => stepId,
    ),
  ).toEqual([estimate.stepId]);
  expect(fixture.readEvidence().estimates).toEqual([]);
  // Required new target API presence is feature scaffolding, never guard-necessity evidence.
  expect(typeof source.stores.estimates.readTarget).toBe('function');
  return estimate;
}

async function proveMatchingTarget(fixture: StepCatalogueFixture) {
  const estimate = await prepareTypedEstimate(fixture);
  const { source, seed } = fixture;
  expect(
    await source.stores.workItems.patch(
      estimate.workItemId,
      { typeIds: [seed.typeId] },
      seed.stamp,
    ),
  ).toMatchObject({ ok: true });
  const target = await source.stores.estimates.readTarget(estimate.workItemId, estimate.stepId);
  expect(target).toMatchObject({
    kind: 'resolved',
    step: { stepId: estimate.stepId },
    values: { estimateUnit: 'minutes', allowancePercent: 12.5, allowanceRevision: 0 },
  });
  expect(await source.stores.estimates.set(estimate, seed.stamp)).toBe('written');
  expect(fixture.readEvidence().estimates).toEqual([estimate]);
  await source.stores.estimates.remove(estimate.workItemId, estimate.stepId, seed.stamp);
  expect(fixture.readEvidence().estimates).toEqual([]);
  return estimate;
}

/** Actual Source adapters only; current direct type state, not package-union membership. */
export const STEP_ESTIMATE_APPLICABILITY_ASSERTIONS = [
  {
    caseId: 'stepCatalogue.factWrite:estimate-target-types',
    async assert(fixture: StepCatalogueFixture) {
      const estimate = await prepareTypedEstimate(fixture);
      const { source, seed } = fixture;
      const untyped = fixture.readEvidence();
      expect(
        await source.stores.estimates.readTarget(estimate.workItemId, estimate.stepId),
      ).toEqual({ kind: 'step_not_resolved' });
      expect(await source.stores.estimates.set(estimate, seed.stamp)).toBe('step_not_resolved');
      expect(fixture.readEvidence()).toEqual(untyped);
      expect(
        await source.stores.workItems.patch(
          estimate.workItemId,
          { typeIds: [seed.secondTypeId] },
          seed.stamp,
        ),
      ).toMatchObject({ ok: true });
      const wrongType = fixture.readEvidence();
      expect(await source.stores.estimates.set(estimate, seed.stamp)).toBe('step_not_resolved');
      expect(fixture.readEvidence()).toEqual(wrongType);
      expect(
        await source.stores.workItems.patch(
          estimate.workItemId,
          { typeIds: [seed.typeId] },
          seed.stamp,
        ),
      ).toMatchObject({ ok: true });
      expect(
        await source.stores.estimates.readTarget(estimate.workItemId, estimate.stepId),
      ).toMatchObject({
        kind: 'resolved',
        values: { estimateUnit: 'minutes', allowancePercent: 12.5, allowanceRevision: 0 },
      });
      expect(await source.stores.estimates.set(estimate, seed.stamp)).toBe('written');
      expect(fixture.readEvidence().estimates).toEqual([estimate]);
      await source.stores.estimates.remove(estimate.workItemId, estimate.stepId, seed.stamp);
      expect(
        await source.stores.workItems.patch(
          estimate.workItemId,
          { typeIds: [seed.typeId, seed.secondTypeId] },
          seed.stamp,
        ),
      ).toMatchObject({ ok: true });
      const conflict = fixture.readEvidence();
      expect(
        await source.stores.estimates.readTarget(estimate.workItemId, estimate.stepId),
      ).toEqual({ kind: 'type_conflict' });
      expect(await source.stores.estimates.set(estimate, seed.stamp)).toBe('type_conflict');
      expect(fixture.readEvidence()).toEqual(conflict);
    },
  },
  {
    caseId: 'stepCatalogue.factWrite:borrowed-target-types-keep-commit',
    async assert(fixture: StepCatalogueFixture) {
      const estimate = await proveMatchingTarget(fixture);
      const { source, port, seed } = fixture;
      const foreignBefore = await port.readCatalogue(seed.foreignOrganizationId);
      const committed = await source.uow.run(async ({ stores }) => {
        const changed = await stores.workItems.patch(
          estimate.workItemId,
          { typeIds: [seed.typeId, seed.secondTypeId] },
          seed.stamp,
        );
        expect(changed).toMatchObject({ ok: true });
        const before = await stores.workItems.listByWorkPackage(seed.workPackageId);
        const target = await stores.estimates.readTarget(estimate.workItemId, estimate.stepId);
        const outcome = await stores.estimates.set(estimate, seed.stamp);
        await stores.workItems.insert(
          workItemRow({
            id: 'committed-other-leaf',
            workPackageId: seed.workPackageId,
            name: 'Unrelated committed row',
            position: 20,
          }),
          [],
          seed.stamp,
        );
        const after = await stores.workItems.listByWorkPackage(seed.workPackageId);
        return { commit: true, value: { target, outcome, before, after } };
      });
      expect(committed.target).toEqual({ kind: 'type_conflict' });
      expect(committed.outcome).toBe('type_conflict');
      expect(committed.after.filter(({ id }) => id === estimate.workItemId)).toEqual(
        committed.before,
      );
      expect(
        (await source.stores.workItems.listByWorkPackage(seed.workPackageId))
          .map(({ id }) => id)
          .sort(),
      ).toEqual(['committed-other-leaf', estimate.workItemId]);
      expect(fixture.readEvidence().estimates).toEqual([]);
      expect(await port.readCatalogue(seed.foreignOrganizationId)).toEqual(foreignBefore);
    },
  },
] as const;
