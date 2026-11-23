import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { expect } from 'bun:test';

import type { StepCatalogueFixture } from '../step-catalogue-fixture';

/** A42's actual moveAll keeps both allocator addresses; this is not a production first-child permission/operation owner. */
export const STEP_ISSUED_PARENT_READER_ASSERTIONS = [
  {
    caseId: 'stepCatalogue.factRead:issued-parent-allocator-retention',
    async assert(fixture: StepCatalogueFixture) {
      const { source, port, seed } = fixture;
      const stepId = 'issued-retained-step',
        parentId = 'issued-parent-owner',
        childId = 'issued-child-owner';
      expect(
        (
          await port.defineAndBindStep(
            seed.organizationId,
            {
              id: stepId,
              code: stepId,
              name: 'Retained allocator',
              position: 10,
              defaultEstimateUnit: 'workdays',
              defaultAllowancePercent: 0,
            },
            {
              bindingId: 'issued-retained-binding',
              scopeKind: 'project',
              scopeId: seed.projectId,
              workItemTypeId: null,
              position: 10,
            },
            seed.stamp,
          )
        ).ok,
      ).toBe(true);
      expect(
        (await port.readPackage(seed.organizationId, seed.workPackageId))?.steps.map(
          ({ stepId: id }) => id,
        ),
      ).toEqual([stepId]);
      await source.stores.workItems.insert(
        workItemRow({
          id: parentId,
          workPackageId: seed.workPackageId,
          name: 'Original allocator leaf',
          position: 10,
        }),
        [],
        seed.stamp,
      );
      const parent = { workItemId: parentId, stepId, issued: 11 },
        child = { workItemId: childId, stepId, issued: 11 };
      await source.stores.attempts.raiseIssued([parent]);
      expect(fixture.readEvidence().tuples.issued).toEqual([parent]);
      expect(await source.stores.attempts.listIssued(seed.workPackageId, [parentId])).toEqual([
        parent,
      ]);
      await source.uow.run(async ({ stores }) => {
        await stores.workItems.insert(
          workItemRow({
            id: childId,
            workPackageId: seed.workPackageId,
            parentId,
            name: 'Current allocator leaf',
            position: 10,
          }),
          [],
          seed.stamp,
        );
        await stores.attempts.moveAll(parentId, childId, seed.stamp);
        return { commit: true, value: undefined };
      });
      expect((await source.stores.workItems.findById(childId))?.parentId).toBe(parentId);
      const before = fixture.readEvidence();
      expect(before.tuples.issued).toEqual([child, parent]);
      expect(before.tuples.attempts).toEqual([]);
      // First post-transition oracle includes the parent explicitly. A point-leaf filter cannot pass by hiding it.
      expect(
        await source.stores.attempts.listIssued(seed.workPackageId, [parentId, childId, parentId]),
      ).toEqual([child, parent]);
      expect(fixture.readEvidence()).toEqual(before);
      const started = await source.stores.attempts.start(
        {
          workItemId: childId,
          stepId,
          startedAt: 500,
          executorPersonId: null,
          reference: null,
          note: null,
        },
        seed.stamp,
      );
      expect(started).toEqual({
        ok: true,
        attempt: {
          workItemId: childId,
          stepId,
          attemptNumber: 12,
          startedAt: 500,
          endedAt: null,
          outcome: null,
          executorPersonId: null,
          reference: null,
          note: null,
        },
      });
      expect(fixture.readEvidence().tuples.issued).toEqual([{ ...child, issued: 12 }, parent]);
      expect(
        await source.stores.attempts.listIssued(seed.workPackageId, [parentId, childId]),
      ).toEqual([{ ...child, issued: 12 }, parent]);
    },
  },
] as const;
