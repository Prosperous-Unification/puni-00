import type { Step } from '@wbs/core';
import { expect } from 'bun:test';

import type { StepCatalogueFixture } from '../step-catalogue-fixture';

/** Existing package/step ports must expose the actual current chain union even before its first leaf exists. */
export const STEP_PACKAGE_READER_ASSERTIONS = [
  {
    caseId: 'stepCatalogue.factRead:work-package-catalogue-values',
    async assert(fixture: StepCatalogueFixture) {
      const { source, port, seed } = fixture;
      const definitions = [
        {
          id: 'z-package-first',
          code: 'z-package-first',
          name: 'First package step',
          position: 10,
          defaultEstimateUnit: 'minutes' as const,
          defaultAllowancePercent: 12.5,
          workItemTypeId: seed.typeId,
        },
        {
          id: 'a-package-second',
          code: 'a-package-second',
          name: 'Second package step',
          position: 20,
          defaultEstimateUnit: 'workdays' as const,
          defaultAllowancePercent: 0,
          workItemTypeId: null,
        },
      ];
      for (const { workItemTypeId, ...definition } of definitions) {
        expect(
          (
            await port.defineAndBindStep(
              seed.organizationId,
              definition,
              {
                bindingId: definition.id + ':binding',
                scopeKind: 'project',
                scopeId: seed.projectId,
                workItemTypeId,
                position: definition.position,
              },
              seed.stamp,
            )
          ).ok,
        ).toBe(true);
      }
      expect(await source.stores.workItems.listByWorkPackage(seed.workPackageId)).toEqual([]);
      expect(
        (await port.readPackage(seed.organizationId, seed.workPackageId))?.steps.map(
          ({ stepId }) => stepId,
        ),
      ).toEqual(['z-package-first', 'a-package-second']);
      expect(fixture.readEvidence().packageValues).toHaveLength(2);
      const values: unknown = fixture.readEvidence().packageValues;
      expect(values).toEqual(
        expect.arrayContaining([
          {
            workPackageId: seed.workPackageId,
            stepId: 'a-package-second',
            estimateUnit: 'workdays',
            allowanceBps: 0,
            allowanceRevision: 0,
          },
          {
            workPackageId: seed.workPackageId,
            stepId: 'z-package-first',
            estimateUnit: 'minutes',
            allowanceBps: 1250,
            allowanceRevision: 0,
          },
        ]),
      );
      const before = fixture.readEvidence();
      const expected: Step[] = [
        {
          id: 'z-package-first',
          workPackageId: seed.workPackageId,
          code: 'z-package-first',
          name: 'First package step',
          position: 10,
          estimateUnit: 'minutes',
          allowancePercent: 12.5,
        },
        {
          id: 'a-package-second',
          workPackageId: seed.workPackageId,
          code: 'a-package-second',
          name: 'Second package step',
          position: 20,
          estimateUnit: 'workdays',
          allowancePercent: 0,
        },
      ];
      expect(await source.stores.workPackages.stepsOf(seed.workPackageId)).toEqual(expected);
      expect(await source.stores.steps.listByWorkPackage(seed.workPackageId)).toEqual(expected);
      expect(await source.stores.workPackages.stepsOf(seed.siblingWorkPackageId)).toEqual([]);
      expect(fixture.readEvidence()).toEqual(before);
    },
  },
] as const;
