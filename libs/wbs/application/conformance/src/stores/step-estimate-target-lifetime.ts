import type { EstimateStore, Scope, TransactionalStores } from '@wbs/core';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { expect } from 'bun:test';

import type { StepCatalogueFixture } from '../step-catalogue-fixture';

/** Real catalogue, explicit package values and leaf; required API absence is scaffolding only. */
async function prepareTarget(fixture: StepCatalogueFixture) {
  const { source, port, seed } = fixture;
  const workItemId = 'target-lifetime-leaf',
    stepId = 'target-lifetime-step';
  expect(
    (
      await port.defineAndBindStep(
        seed.organizationId,
        {
          id: stepId,
          code: stepId,
          name: 'Target lifetime',
          position: 10,
          defaultEstimateUnit: 'minutes',
          defaultAllowancePercent: 12.5,
        },
        {
          bindingId: 'target-lifetime-binding',
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
    workItemRow({ id: workItemId, workPackageId: seed.workPackageId, name: 'Target leaf' }),
    [],
    seed.stamp,
  );
  expect(
    (await port.readPackage(seed.organizationId, seed.workPackageId))?.steps.map(
      ({ stepId: id }) => id,
    ),
  ).toEqual([stepId]);
  expect(fixture.readEvidence().estimates).toEqual([]);
  expect(typeof source.stores.estimates.readTarget).toBe('function');
  const before = fixture.readEvidence();
  const target = await source.stores.estimates.readTarget(workItemId, stepId);
  expect(target).toMatchObject({
    kind: 'resolved',
    step: { stepId },
    values: { estimateUnit: 'minutes', allowancePercent: 12.5, allowanceRevision: 0 },
  });
  expect(fixture.readEvidence()).toEqual(before);
  return { workItemId, stepId, target, before };
}

/** A resolved call is a failure, not a substitute diagnostic; exact closed rejection and storage are separate oracles. */
async function expectTargetClosed(port: EstimateStore, workItemId: string, stepId: string) {
  // Installed Bun declares toThrow as void; keep the real matcher receiver and await its runtime settlement.
  const rejection: { toThrow(expected: RegExp): unknown } = expect(
    port.readTarget(workItemId, stepId),
  ).rejects;
  await rejection.toThrow(/closed/);
}

export const STEP_ESTIMATE_TARGET_LIFETIME_ASSERTIONS = [
  {
    caseId: 'stepCatalogue.factWrite:target-public-source-close',
    async assert(fixture: StepCatalogueFixture) {
      const { workItemId, stepId, target } = await prepareTarget(fixture);
      const retained = fixture.source.stores.estimates;
      await fixture.close();
      await expectTargetClosed(retained, workItemId, stepId);
      expect(target).toMatchObject({
        kind: 'resolved',
        step: { stepId },
        values: { estimateUnit: 'minutes', allowancePercent: 12.5, allowanceRevision: 0 },
      });
    },
  },
  {
    caseId: 'stepCatalogue.factWrite:target-borrowed-after-commit',
    async assert(fixture: StepCatalogueFixture) {
      const { source, seed } = fixture;
      const { workItemId, stepId, target } = await prepareTarget(fixture);
      const retained = await source.uow.run(async ({ stores }) => {
        expect(await stores.estimates.readTarget(workItemId, stepId)).toEqual(target);
        await stores.workItems.insert(
          workItemRow({
            id: 'target-committed-leaf',
            workPackageId: seed.workPackageId,
            name: 'Committed independently',
            position: 20,
          }),
          [],
          seed.stamp,
        );
        return { commit: true, value: stores.estimates };
      });
      expect(
        (await source.stores.workItems.listByWorkPackage(seed.workPackageId))
          .map(({ id }) => id)
          .sort(),
      ).toEqual(['target-committed-leaf', workItemId]);
      const committed = fixture.readEvidence();
      await expectTargetClosed(retained, workItemId, stepId);
      expect(fixture.readEvidence()).toEqual(committed);
      await source.uow.run(async ({ stores }) => {
        expect(await stores.estimates.readTarget(workItemId, stepId)).toEqual(target);
        await expectTargetClosed(retained, workItemId, stepId);
        return { commit: true, value: undefined };
      });
      expect(fixture.readEvidence()).toEqual(committed);
      expect(await source.stores.estimates.readTarget(workItemId, stepId)).toEqual(target);
    },
  },
  {
    caseId: 'stepCatalogue.factWrite:target-plain-repair-expiry',
    async assert(fixture: StepCatalogueFixture) {
      const { source } = fixture;
      const { workItemId, stepId, target, before } = await prepareTarget(fixture);
      const captured: { port: EstimateStore | undefined } = { port: undefined };
      const refusal = await source.uow.run(async ({ stores }) => {
        expect(await stores.estimates.readTarget(workItemId, stepId)).toEqual(target);
        return {
          commit: false,
          value: 'refused-turn',
          afterRollback: async ({ stores: repair }: Scope<TransactionalStores>) => {
            captured.port = repair.estimates;
            expect(await repair.estimates.readTarget(workItemId, stepId)).toEqual(target);
          },
        };
      });
      expect(refusal).toBe('refused-turn');
      const retained = captured.port;
      if (retained === undefined) throw new Error('actual repair target loan was not captured');
      expect(fixture.readEvidence()).toEqual(before);
      await expectTargetClosed(retained, workItemId, stepId);
      expect(fixture.readEvidence()).toEqual(before);
      await source.uow.run(
        async () =>
          await Promise.resolve({
            commit: false,
            value: undefined,
            afterRollback: async ({ stores }: Scope<TransactionalStores>) => {
              expect(await stores.estimates.readTarget(workItemId, stepId)).toEqual(target);
              await expectTargetClosed(retained, workItemId, stepId);
            },
          }),
      );
      expect(fixture.readEvidence()).toEqual(before);
      expect(await source.stores.estimates.readTarget(workItemId, stepId)).toEqual(target);
    },
  },
] as const;
