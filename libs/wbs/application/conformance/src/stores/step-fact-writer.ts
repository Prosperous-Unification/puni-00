import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { expect } from 'bun:test';

import type { StepCatalogueFixture } from '../step-catalogue-fixture';
import type { StepCatalogueCaseId } from './step-catalogue';

async function prepareUnboundEstimate(fixture: StepCatalogueFixture) {
  const { source, port, seed } = fixture;
  expect(
    (
      await port.defineAndBindStep(
        seed.organizationId,
        {
          id: 'estimate-unbound',
          code: 'estimate-unbound',
          name: 'Previously Applicable Estimate',
          defaultEstimateUnit: 'minutes',
          defaultAllowancePercent: 12.5,
          position: 10,
        },
        {
          bindingId: 'estimate-unbound-binding',
          scopeKind: 'project',
          scopeId: seed.projectId,
          workItemTypeId: null,
          position: 10,
        },
        seed.stamp,
      )
    ).ok,
  ).toBe(true);
  await source.stores.workItems.insert(
    workItemRow({
      id: 'estimate-unbound-leaf',
      workPackageId: seed.workPackageId,
      name: 'Estimate Leaf',
      position: 10,
    }),
    [],
    seed.stamp,
  );
  expect(
    (await port.readPackage(seed.organizationId, seed.workPackageId))?.steps.map(
      ({ stepId }) => stepId,
    ),
  ).toEqual(['estimate-unbound']);
  const estimate = {
    workItemId: 'estimate-unbound-leaf',
    stepId: 'estimate-unbound',
    optimistic: 1,
    realistic: 2,
    pessimistic: 3,
  };
  expect(await source.stores.estimates.set(estimate, seed.stamp)).toBe('written');
  expect(fixture.readEvidence().estimates).toEqual([estimate]);
  await source.stores.estimates.remove(estimate.workItemId, estimate.stepId, seed.stamp);
  expect(fixture.readEvidence().estimates).toEqual([]);
  const values = fixture.readEvidence().packageValues;
  expect(values).toEqual([
    {
      workPackageId: seed.workPackageId,
      stepId: estimate.stepId,
      estimateUnit: 'minutes',
      allowanceBps: 1250,
      allowanceRevision: 0,
    },
  ]);
  expect(
    await port.unbindStep(
      seed.organizationId,
      'estimate-unbound-binding',
      { dryRun: false },
      seed.stamp,
    ),
  ).toEqual({
    kind: 'unbound',
    workPackageIds: [seed.workPackageId],
    projectIds: [seed.projectId],
  });
  expect((await port.readCatalogue(seed.organizationId))?.definitions.map(({ id }) => id)).toEqual([
    estimate.stepId,
  ]);
  expect((await port.readCatalogue(seed.organizationId))?.bindings).toEqual([]);
  expect((await port.readPackage(seed.organizationId, seed.workPackageId))?.steps).toEqual([]);
  expect(fixture.readEvidence().packageValues).toEqual(values);
  expect(fixture.readEvidence().estimates).toEqual([]);
  return estimate;
}

/** Real public and borrowed fact writes after an allowed configuration change. */
export const STEP_FACT_WRITER_ASSERTIONS: readonly {
  readonly caseId: StepCatalogueCaseId;
  assert(fixture: StepCatalogueFixture): Promise<void>;
}[] = [
  {
    caseId: 'stepCatalogue.factWrite:estimate-after-unbind',
    async assert(fixture) {
      const estimate = await prepareUnboundEstimate(fixture);
      const { source, seed } = fixture;
      const before = fixture.readEvidence();
      const beforeLeaves = await source.stores.workItems.listByWorkPackage(seed.workPackageId);
      expect(beforeLeaves.map(({ id }) => id)).toEqual([estimate.workItemId]);
      const outcome = await source.stores.estimates.set(estimate, {
        ...seed.stamp,
        at: seed.stamp.at + 1,
      });
      expect(outcome).toBe('step_not_resolved');
      expect(fixture.readEvidence()).toEqual(before);
      expect(await source.stores.workItems.listByWorkPackage(seed.workPackageId)).toEqual(
        beforeLeaves,
      );
    },
  },
  {
    caseId: 'stepCatalogue.factWrite:borrowed-estimate-refusal-keeps-commit',
    async assert(fixture) {
      const estimate = await prepareUnboundEstimate(fixture);
      const { source, port, seed } = fixture;
      const before = fixture.readEvidence();
      const foreignBefore = await port.readCatalogue(seed.foreignOrganizationId);
      const committed = await source.uow.run(async ({ stores }) => {
        expect(
          (
            await stores.stepCatalogue.defineAndBindStep(
              seed.organizationId,
              {
                id: 'z-estimate-survivor',
                code: 'z-estimate-survivor',
                name: 'Unrelated Committed Definition',
                defaultEstimateUnit: 'workdays',
                defaultAllowancePercent: 7.25,
                position: 30,
              },
              {
                bindingId: 'z-estimate-survivor-binding',
                scopeKind: 'project',
                scopeId: seed.projectId,
                workItemTypeId: null,
                position: 30,
              },
              seed.stamp,
            )
          ).ok,
        ).toBe(true);
        const beforeLeaves = await stores.workItems.listByWorkPackage(seed.workPackageId);
        expect(beforeLeaves.map(({ id }) => id)).toEqual([estimate.workItemId]);
        const beforeCatalogue = await stores.stepCatalogue.readCatalogue(seed.organizationId);
        const beforePackage = await stores.stepCatalogue.readPackage(
          seed.organizationId,
          seed.workPackageId,
        );
        expect(beforeCatalogue?.definitions.map(({ id }) => id).sort()).toEqual([
          'estimate-unbound',
          'z-estimate-survivor',
        ]);
        expect(beforePackage?.steps.map(({ stepId }) => stepId)).toEqual(['z-estimate-survivor']);
        const outcome = await stores.estimates.set(estimate, {
          ...seed.stamp,
          at: seed.stamp.at + 1,
        });
        const afterLeaves = await stores.workItems.listByWorkPackage(seed.workPackageId);
        const afterCatalogue = await stores.stepCatalogue.readCatalogue(seed.organizationId);
        const afterPackage = await stores.stepCatalogue.readPackage(
          seed.organizationId,
          seed.workPackageId,
        );
        // Commit even an unexpected written answer, so the owner observes the real caller's
        // committed state rather than accidentally relying on assertion-triggered rollback.
        return {
          commit: true,
          value: {
            outcome,
            beforeLeaves,
            afterLeaves,
            beforeCatalogue,
            afterCatalogue,
            beforePackage,
            afterPackage,
          },
        };
      });
      expect(committed.outcome).toBe('step_not_resolved');
      expect(committed.afterLeaves).toEqual(committed.beforeLeaves);
      expect(committed.afterCatalogue).toEqual(committed.beforeCatalogue);
      expect(committed.afterPackage).toEqual(committed.beforePackage);
      expect(await source.stores.workItems.listByWorkPackage(seed.workPackageId)).toEqual(
        committed.beforeLeaves,
      );
      expect(await port.readCatalogue(seed.organizationId)).toEqual(committed.beforeCatalogue);
      expect(await port.readPackage(seed.organizationId, seed.workPackageId)).toEqual(
        committed.beforePackage,
      );
      expect(await port.readCatalogue(seed.foreignOrganizationId)).toEqual(foreignBefore);
      expect(fixture.readEvidence().estimates).toEqual(before.estimates);
      expect(fixture.readEvidence().packageValues).toEqual([
        ...before.packageValues,
        {
          workPackageId: seed.workPackageId,
          stepId: 'z-estimate-survivor',
          estimateUnit: 'workdays',
          allowanceBps: 725,
          allowanceRevision: 0,
        },
      ]);
    },
  },
  ...queuedEstimateAssertions(),
];

async function captureQueuedEstimate<Value>(
  call: () => Promise<Value>,
): Promise<
  { readonly ok: true; readonly value: Value } | { readonly ok: false; readonly cause: unknown }
> {
  try {
    return { ok: true, value: await call() };
  } catch (cause: unknown) {
    return { ok: false, cause };
  }
}

function queuedEstimateAssertions(): readonly {
  readonly caseId: StepCatalogueCaseId;
  assert(fixture: StepCatalogueFixture): Promise<void>;
}[] {
  return [
    {
      caseId: 'stepCatalogue.factWrite:queued-estimate-input-retention',
      async assert(fixture) {
        const { source, port, seed } = fixture;
        for (const [position, suffix] of ['original', 'alternate'].entries()) {
          expect(
            (
              await port.defineAndBindStep(
                seed.organizationId,
                {
                  id: 'queued-estimate-' + suffix,
                  code: 'queued-estimate-' + suffix,
                  name: 'Queued Estimate ' + suffix,
                  defaultEstimateUnit: 'minutes',
                  defaultAllowancePercent: 12.5,
                  position,
                },
                {
                  bindingId: 'queued-estimate-binding-' + suffix,
                  scopeKind: 'project',
                  scopeId: seed.projectId,
                  workItemTypeId: null,
                  position,
                },
                seed.stamp,
              )
            ).ok,
          ).toBe(true);
          await source.stores.workItems.insert(
            workItemRow({
              id: 'queued-leaf-' + suffix,
              workPackageId: seed.workPackageId,
              name: 'Queued Leaf ' + suffix,
              position: (position + 1) * 10,
            }),
            [],
            seed.stamp,
          );
        }
        const original = {
          workItemId: 'queued-leaf-original',
          stepId: 'queued-estimate-original',
          optimistic: 1,
          realistic: 2,
          pessimistic: 3,
        };
        const alternate = {
          workItemId: 'queued-leaf-alternate',
          stepId: 'queued-estimate-alternate',
          optimistic: 7,
          realistic: 8,
          pessimistic: 9,
        };
        const beforeHealthy = await source.stores.workItems.listByWorkPackage(seed.workPackageId);
        expect(beforeHealthy.map(({ id }) => id).sort()).toEqual([
          alternate.workItemId,
          original.workItemId,
        ]);
        expect(await source.stores.estimates.set(original, seed.stamp)).toBe('written');
        expect(fixture.readEvidence().estimates).toEqual([original]);
        const afterHealthy = await source.stores.workItems.listByWorkPackage(seed.workPackageId);
        const healthyBefore = beforeHealthy.find(({ id }) => id === original.workItemId);
        const healthyAfter = afterHealthy.find(({ id }) => id === original.workItemId);
        if (healthyBefore === undefined || healthyAfter === undefined)
          throw new Error('healthy original estimate leaf is absent');
        const revisionDelta = healthyAfter.revision - healthyBefore.revision;
        await source.stores.estimates.remove(original.workItemId, original.stepId, seed.stamp);
        expect(await source.stores.estimates.set(alternate, seed.stamp)).toBe('written');
        expect(fixture.readEvidence().estimates).toEqual([alternate]);
        await source.stores.estimates.remove(alternate.workItemId, alternate.stepId, seed.stamp);
        expect(fixture.readEvidence().estimates).toEqual([]);
        const before = fixture.readEvidence();
        const beforeLeaves = await source.stores.workItems.listByWorkPackage(seed.workPackageId);
        const beforeCatalogue = await port.readCatalogue(seed.organizationId);
        const beforePackage = await port.readPackage(seed.organizationId, seed.workPackageId);
        const request = { ...original };
        const dispatch: {
          pending?: ReturnType<typeof captureQueuedEstimate<string>>;
          hasDispatched: boolean;
        } = { hasDispatched: false };
        const held = await captureQueuedEstimate(() =>
          source.uow.run(() => {
            // captureQueuedEstimate invokes this actual public call synchronously, before its
            // first await. The enclosing real Source UoW still owns the coordinator here.
            dispatch.pending = captureQueuedEstimate(() => {
              dispatch.hasDispatched = true;
              return source.stores.estimates.set(request, seed.stamp);
            });
            request.workItemId = alternate.workItemId;
            request.stepId = alternate.stepId;
            request.optimistic = alternate.optimistic;
            request.realistic = alternate.realistic;
            request.pessimistic = alternate.pessimistic;
            return Promise.resolve({ commit: false, value: 'queued owner released' });
          }),
        );
        const queued = dispatch.pending;
        if (queued === undefined) {
          if (!held.ok) throw held.cause;
          throw new Error('actual public estimate was not dispatched');
        }
        const settled = await queued;
        if (!held.ok) {
          if (!settled.ok)
            throw new AggregateError(
              [held.cause, settled.cause],
              'holding Source and queued estimate both failed',
              { cause: settled.cause },
            );
          throw held.cause;
        }
        if (!settled.ok) throw settled.cause;
        expect(dispatch.hasDispatched).toBe(true);
        expect(held.value).toBe('queued owner released');
        expect(request).toEqual(alternate);
        expect(settled.value).toBe('written');
        // Both destinations were independently healthy. This first feature oracle must
        // detect the later caller mutation, rather than a missing-reference refusal.
        expect(fixture.readEvidence().estimates).toEqual([original]);
        expect(await source.stores.workItems.listByWorkPackage(seed.workPackageId)).toEqual(
          beforeLeaves.map((leaf) =>
            leaf.id === original.workItemId
              ? { ...leaf, revision: leaf.revision + revisionDelta }
              : leaf,
          ),
        );
        expect(fixture.readEvidence().packageValues).toEqual(before.packageValues);
        expect(await port.readCatalogue(seed.organizationId)).toEqual(beforeCatalogue);
        expect(await port.readPackage(seed.organizationId, seed.workPackageId)).toEqual(
          beforePackage,
        );
      },
    },
  ];
}
