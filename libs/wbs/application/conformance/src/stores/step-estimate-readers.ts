import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { expect } from 'bun:test';

import type { StepCatalogueFixture } from '../step-catalogue-fixture';

async function prepareOrderedEstimates(fixture: StepCatalogueFixture) {
  const { source, port, seed } = fixture;
  for (const [id, position] of [
    ['z-estimate-first', 10],
    ['a-estimate-second', 20],
  ] as const) {
    expect(
      (
        await port.defineAndBindStep(
          seed.organizationId,
          {
            id,
            code: id,
            name: id,
            position,
            defaultEstimateUnit: 'workdays',
            defaultAllowancePercent: 0,
          },
          {
            bindingId: id + ':binding',
            scopeKind: 'project',
            scopeId: seed.projectId,
            workItemTypeId: null,
            position,
          },
          seed.stamp,
        )
      ).ok,
    ).toBe(true);
  }
  expect(
    (await port.readPackage(seed.organizationId, seed.workPackageId))?.steps.map(
      ({ stepId }) => stepId,
    ),
  ).toEqual(['z-estimate-first', 'a-estimate-second']);
  for (const [id, position] of [
    ['estimate-first-leaf', 10],
    ['estimate-other-leaf', 20],
  ] as const) {
    await source.stores.workItems.insert(
      workItemRow({ id, workPackageId: seed.workPackageId, name: id, position }),
      [],
      seed.stamp,
    );
  }
  const first = {
    workItemId: 'estimate-first-leaf',
    stepId: 'z-estimate-first',
    optimistic: 1,
    realistic: 2,
    pessimistic: 3,
  };
  const second = {
    workItemId: 'estimate-first-leaf',
    stepId: 'a-estimate-second',
    optimistic: 4,
    realistic: 5,
    pessimistic: 6,
  };
  const other = {
    workItemId: 'estimate-other-leaf',
    stepId: 'z-estimate-first',
    optimistic: 7,
    realistic: 8,
    pessimistic: 9,
  };
  for (const estimate of [second, other, first])
    expect(await source.stores.estimates.set(estimate, seed.stamp)).toBe('written');
  expect(fixture.readEvidence().estimates).toEqual([second, first, other]);
  return { first, second, other };
}

/** Actual value readers on117; resolved binding order deliberately contradicts ID order. */
export const STEP_ESTIMATE_READER_ASSERTIONS = [
  {
    caseId: 'stepCatalogue.factRead:estimate-catalogue-order',
    async assert(fixture: StepCatalogueFixture) {
      const { first, second, other } = await prepareOrderedEstimates(fixture);
      const before = fixture.readEvidence();
      expect(
        await fixture.source.stores.estimates.listByWorkPackage(fixture.seed.workPackageId),
      ).toEqual([first, second, other]);
      expect(fixture.readEvidence()).toEqual(before);
    },
  },
  {
    caseId: 'stepCatalogue.factRead:targeted-estimate-catalogue-order',
    async assert(fixture: StepCatalogueFixture) {
      const { first, second } = await prepareOrderedEstimates(fixture);
      const before = fixture.readEvidence();
      expect(
        await fixture.source.stores.estimates.listByWorkItems(fixture.seed.workPackageId, [
          first.workItemId,
          'absent-leaf',
          first.workItemId,
        ]),
      ).toEqual([first, second]);
      expect(
        await fixture.source.stores.estimates.listByWorkItems(fixture.seed.siblingWorkPackageId, [
          first.workItemId,
        ]),
      ).toEqual([]);
      expect(fixture.readEvidence()).toEqual(before);
    },
  },
] as const;
