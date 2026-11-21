import { guardTreeReads } from '@wbs/core';
import {
  CLAIM_DEV,
  CLAIM_QA,
  seedCurrentClaimObservation,
  withinClaimFixture,
} from '@wbs/core/testing/current-claim-observation';
import { expectClaimFailure } from '@wbs/core/testing/current-claim-observation';
import { assertTreeLoanExpiry } from '@wbs/core/testing/current-step-tree';
import { expect, test } from 'bun:test';

import { openMemoryStepCatalogueSourceFixture } from './step-catalogue-fixture';

// Catches union order and omission of zero-step leaves on the actual Memory Source.
test('current memory tree captures own leaf order without adding display metadata to stored reads', async () => {
  const { fixture, seed } = await openMemoryStepCatalogueSourceFixture();
  await withinClaimFixture(
    () => fixture.source.close(),
    async () => {
      await seedCurrentClaimObservation(fixture.source, seed);
      const before = fixture.stepCatalogueEvidence();
      const rows = await fixture.source.stores.workItems.listTreeByWorkPackage(seed.workPackageId);
      expect(
        rows.find((row) => row.id === 'claim-first')?.steps?.map((step) => step.stepId),
      ).toEqual([CLAIM_DEV, CLAIM_QA]);
      expect(
        rows.find((row) => row.id === 'claim-second')?.steps?.map((step) => step.stepId),
      ).toEqual([CLAIM_QA, CLAIM_DEV]);
      expect(rows.find((row) => row.id === 'claim-empty')?.steps).toEqual([]);
      expect(rows.find((row) => row.id === 'claim-parent')).not.toHaveProperty('steps');
      for (const row of await fixture.source.stores.workItems.listByWorkPackage(seed.workPackageId))
        expect(row).not.toHaveProperty('steps');
      expect(fixture.stepCatalogueEvidence()).toEqual(before);
    },
  );
});

for (const settlement of ['commit', 'rollback', 'repair'] as const)
  test('current memory tree expires its ' + settlement + ' loan', async () => {
    const { fixture, seed } = await openMemoryStepCatalogueSourceFixture();
    await withinClaimFixture(
      () => fixture.source.close(),
      async () => {
        await seedCurrentClaimObservation(fixture.source, seed);
        await assertTreeLoanExpiry(fixture.source, seed.workPackageId, settlement);
      },
    );
  });

test('current memory tree refuses a retained method after Source close', async () => {
  const { fixture, seed } = await openMemoryStepCatalogueSourceFixture();
  await withinClaimFixture(
    () => fixture.source.close(),
    async () => {
      await seedCurrentClaimObservation(fixture.source, seed);
      const read = fixture.source.stores.workItems.listTreeByWorkPackage.bind(
        fixture.source.stores.workItems,
      );
      expect((await read(seed.workPackageId)).length).toBe(4);
      await fixture.source.close();
      for (const id of [seed.workPackageId, 'missing'])
        await expectClaimFailure(() => read(id), 'closed');
    },
  );
});

test('current memory tree refuses missing explicit values even without point facts', async () => {
  const { fixture, seed } = await openMemoryStepCatalogueSourceFixture();
  await withinClaimFixture(
    () => fixture.source.close(),
    async () => {
      await seedCurrentClaimObservation(fixture.source, seed);
      expect(fixture.removePackageStepValues(seed.workPackageId)).toBe(2);
      const before = fixture.stepCatalogueEvidence();
      await expectClaimFailure(
        () => fixture.source.stores.workItems.listTreeByWorkPackage(seed.workPackageId),
        'explicit',
      );
      expect(fixture.stepCatalogueEvidence()).toEqual(before);
    },
  );
});

test('tree read guard refuses actual captured rows returned after a borrowed boundary expires', async () => {
  const { fixture, seed } = await openMemoryStepCatalogueSourceFixture();
  const entered = Promise.withResolvers<undefined>(),
    release = Promise.withResolvers<undefined>();
  let isOpen = true;
  await withinClaimFixture(
    () => fixture.source.close(),
    async () => {
      await seedCurrentClaimObservation(fixture.source, seed);
      const source = fixture.source.stores.workItems;
      const delayed = new Proxy(source, {
        get(target, key) {
          if (key === 'listTreeByWorkPackage')
            return async (id: string) => {
              const rows = await source.listTreeByWorkPackage(id);
              entered.resolve(undefined);
              await release.promise;
              return rows;
            };
          const operation: unknown = Reflect.get(target, key, target);
          return operation;
        },
      });
      const guarded = guardTreeReads(delayed, {
        kind: 'borrowed',
        assertOpen: () => {
          if (!isOpen) throw new Error('test borrowed boundary closed');
        },
      });
      const pending = guarded.listTreeByWorkPackage(seed.workPackageId).then(
        (rows) => ({ kind: 'answered', rows }) as const,
        (cause: unknown) => ({ kind: 'failed', cause }) as const,
      );
      try {
        await entered.promise;
        isOpen = false;
        release.resolve(undefined);
        const settled = await pending;
        expect(settled.kind).toBe('failed');
        if (settled.kind !== 'failed') throw new Error('borrowed rows escaped their boundary');
        expect(String(settled.cause)).toContain('test borrowed boundary closed');
      } finally {
        release.resolve(undefined);
        await pending;
      }
    },
  );
});
