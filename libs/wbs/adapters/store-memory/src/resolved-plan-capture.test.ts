import {
  CLAIM_DEV,
  CLAIM_QA,
  seedCurrentClaimObservation,
  withinClaimFixture,
} from '@wbs/core/testing/current-claim-observation';
import {
  canonicalisePlanInputV13,
  planInputRowsOf,
  readCurrentSavedPlanInput13,
} from '@wbs/domain';
import { expect, test } from 'bun:test';

import { openMemoryStepCatalogueSourceFixture } from './testing/step-catalogue-fixture';

test('current Memory plan capture keeps every own leaf order and detaches it from later edits', async () => {
  const { fixture, seed } = await openMemoryStepCatalogueSourceFixture();
  await withinClaimFixture(
    () => fixture.source.close(),
    async () => {
      await seedCurrentClaimObservation(fixture.source, seed);
      const captured = await fixture.source.history.savedPlanCapture.readPlanInput(
        seed.workPackageId,
      );
      expect(captured).not.toBeNull();
      if (captured === null) throw new Error('current capture absent');
      expect(captured.leafSteps).toHaveLength(3);
      expect(
        [...captured.leafSteps].sort((left, right) =>
          left.workItemId < right.workItemId ? -1 : left.workItemId > right.workItemId ? 1 : 0,
        ),
      ).toEqual([
        { workItemId: 'claim-empty', stepIds: [] },
        { workItemId: 'claim-first', stepIds: [CLAIM_DEV, CLAIM_QA] },
        { workItemId: 'claim-second', stepIds: [CLAIM_QA, CLAIM_DEV] },
      ]);
      for (const row of captured.workItems) expect(row).not.toHaveProperty('steps');
      const encoded = canonicalisePlanInputV13(planInputRowsOf(captured), captured.leafSteps, {
        kind: 'local',
      });
      expect(encoded.schemaVersion).toBe(13);
      expect(encoded.leafSteps).toEqual(
        [...captured.leafSteps].sort((left, right) =>
          left.workItemId < right.workItemId ? -1 : left.workItemId > right.workItemId ? 1 : 0,
        ),
      );
      expect(readCurrentSavedPlanInput13(JSON.parse(JSON.stringify(encoded)))).toEqual(encoded);
      const retained = structuredClone(captured.leafSteps);
      expect(
        (
          await fixture.source.stores.workItems.patch(
            'claim-first',
            { typeIds: [seed.secondTypeId] },
            seed.stamp,
          )
        ).ok,
      ).toBe(true);
      const later = await fixture.source.history.savedPlanCapture.readPlanInput(seed.workPackageId);
      expect(later?.leafSteps.find((leaf) => leaf.workItemId === 'claim-first')?.stepIds).toEqual([
        CLAIM_QA,
        CLAIM_DEV,
      ]);
      expect(captured.leafSteps).toEqual(retained);
      expect(
        await fixture.source.history.savedPlanCapture.readPlanInput('absent-current-package'),
      ).toBeNull();
    },
  );
});

import { openMemorySourceWithCaptureReadSeam } from './source';

test('current Memory plan capture retains one epoch across an actual Source type edit', async () => {
  let isArmed = false,
    hasChanged = false;
  let change: (() => Promise<void>) | undefined;
  const { fixture, seed } = await openMemoryStepCatalogueSourceFixture(
    undefined,
    openMemorySourceWithCaptureReadSeam({
      async afterFirstRead() {
        if (!isArmed) return;
        isArmed = false;
        if (change === undefined) throw new Error('rival Source edit is absent');
        await change();
        hasChanged = true;
      },
    }),
  );
  await withinClaimFixture(
    () => fixture.source.close(),
    async () => {
      await seedCurrentClaimObservation(fixture.source, seed);
      change = async () => {
        expect(
          (
            await fixture.source.stores.workItems.patch(
              'claim-first',
              { name: 'Changed by Source', typeIds: [seed.secondTypeId] },
              seed.stamp,
            )
          ).ok,
        ).toBe(true);
      };
      isArmed = true;
      const captured = await fixture.source.history.savedPlanCapture.readPlanInput(
        seed.workPackageId,
      );
      expect(hasChanged).toBe(true);
      expect(captured?.workItems.find((row) => row.id === 'claim-first')).toMatchObject({
        name: 'claim-first',
        typeIds: [seed.typeId],
      });
      expect(captured?.leafSteps.find((row) => row.workItemId === 'claim-first')?.stepIds).toEqual([
        CLAIM_DEV,
        CLAIM_QA,
      ]);
      const later = await fixture.source.history.savedPlanCapture.readPlanInput(seed.workPackageId);
      expect(later?.workItems.find((row) => row.id === 'claim-first')).toMatchObject({
        name: 'Changed by Source',
        typeIds: [seed.secondTypeId],
      });
      expect(later?.leafSteps.find((row) => row.workItemId === 'claim-first')?.stepIds).toEqual([
        CLAIM_QA,
        CLAIM_DEV,
      ]);
    },
  );
});

import { expectClaimFailure } from '@wbs/core/testing/current-claim-observation';
test('current Memory plan capture refuses missing explicit values and retained methods after close', async () => {
  const { fixture, seed } = await openMemoryStepCatalogueSourceFixture();
  await withinClaimFixture(
    () => fixture.source.close(),
    async () => {
      await seedCurrentClaimObservation(fixture.source, seed);
      const read = fixture.source.history.savedPlanCapture.readPlanInput.bind(
        fixture.source.history.savedPlanCapture,
      );
      expect(fixture.removePackageStepValues(seed.workPackageId)).toBe(2);
      const before = fixture.stepCatalogueEvidence();
      await expectClaimFailure(() => read(seed.workPackageId), 'explicit');
      expect(fixture.stepCatalogueEvidence()).toEqual(before);
      await fixture.source.close();
      for (const id of [seed.workPackageId, 'capture-missing-package'])
        await expectClaimFailure(() => read(id), 'closed');
    },
  );
});

test('current Memory plan capture refuses Source close during its first await before returning captured values', async () => {
  let isArmed = false,
    hasClosed = false;
  let closeOwner: (() => Promise<void>) | undefined;
  const { fixture, seed } = await openMemoryStepCatalogueSourceFixture(
    undefined,
    openMemorySourceWithCaptureReadSeam({
      async afterFirstRead() {
        if (!isArmed) return;
        isArmed = false;
        if (closeOwner === undefined) throw new Error('closing Memory Source is absent');
        await closeOwner();
        hasClosed = true;
      },
    }),
  );
  await withinClaimFixture(
    () => fixture.source.close(),
    async () => {
      await seedCurrentClaimObservation(fixture.source, seed);
      closeOwner = () => fixture.source.close();
      isArmed = true;
      await expectClaimFailure(
        () => fixture.source.history.savedPlanCapture.readPlanInput(seed.workPackageId),
        'closed',
      );
      expect(hasClosed).toBe(true);
    },
  );
});
