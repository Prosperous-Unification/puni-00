import { guardTreeReads } from '@wbs/core';
import {
  expectClaimFailure,
  seedCurrentClaimObservation,
  withinClaimFixture,
} from '@wbs/core/testing/current-claim-observation';
import {
  assertStepOrderLoanExpiry,
  assertStepOrderProjection,
  STEP_ORDER_PROJECTION_CASES,
} from '@wbs/core/testing/step-order-projection';
import { expect, test } from 'bun:test';

import { openMemoryStepCatalogueSourceFixture } from './testing/step-catalogue-fixture';

for (const purpose of STEP_ORDER_PROJECTION_CASES)
  test('actual Memory step projection ' + purpose, async () => {
    const { fixture, seed } = await openMemoryStepCatalogueSourceFixture();
    await withinClaimFixture(
      () => fixture.source.close(),
      () => assertStepOrderProjection(fixture.source, seed, purpose),
    );
  });

for (const settlement of ['commit', 'rollback', 'repair'] as const)
  test('actual Memory step projection expires ' + settlement + ' loan', async () => {
    const { fixture, seed } = await openMemoryStepCatalogueSourceFixture();
    await withinClaimFixture(
      () => fixture.source.close(),
      () => assertStepOrderLoanExpiry(fixture.source, seed, settlement),
    );
  });

test('actual Memory step projection rejects retained public method after close', async () => {
  const { fixture, seed } = await openMemoryStepCatalogueSourceFixture();
  await withinClaimFixture(
    () => fixture.source.close(),
    async () => {
      await seedCurrentClaimObservation(fixture.source, seed);
      const store = fixture.source.stores.workItems;
      const projection = {
        rows: await store.listByWorkPackage(seed.workPackageId),
        directTypes: [],
      };
      const read = store.resolveStepOrders.bind(store);
      expect((await read(seed.workPackageId, projection)).length).toBe(3);
      await fixture.source.close();
      for (const id of [seed.workPackageId, 'missing'])
        await expectClaimFailure(() => read(id, projection), 'closed');
    },
  );
});

test('actual Memory step projection rejects absent explicit package values', async () => {
  const { fixture, seed } = await openMemoryStepCatalogueSourceFixture();
  await withinClaimFixture(
    () => fixture.source.close(),
    async () => {
      await seedCurrentClaimObservation(fixture.source, seed);
      const store = fixture.source.stores.workItems;
      const projection = {
        rows: await store.listByWorkPackage(seed.workPackageId),
        directTypes: [],
      };
      expect(fixture.removePackageStepValues(seed.workPackageId)).toBe(2);
      const before = fixture.stepCatalogueEvidence();
      await expectClaimFailure(
        () => store.resolveStepOrders(seed.workPackageId, projection),
        'explicit',
      );
      expect(fixture.stepCatalogueEvidence()).toEqual(before);
    },
  );
});

test('candidate order guard rejects actual captured orders after borrowed return expiry', async () => {
  const { fixture, seed } = await openMemoryStepCatalogueSourceFixture();
  const entered = Promise.withResolvers<undefined>(),
    release = Promise.withResolvers<undefined>();
  let isOpen = true;
  await withinClaimFixture(
    () => fixture.source.close(),
    async () => {
      await seedCurrentClaimObservation(fixture.source, seed);
      const store = fixture.source.stores.workItems;
      const projection = {
        rows: await store.listByWorkPackage(seed.workPackageId),
        directTypes: [],
      };
      const delayed = new Proxy(store, {
        get(target, key) {
          if (key === 'resolveStepOrders')
            return async (...args: Parameters<typeof store.resolveStepOrders>) => {
              const orders = await store.resolveStepOrders(...args);
              entered.resolve(undefined);
              await release.promise;
              return orders;
            };
          const operation: unknown = Reflect.get(target, key, target);
          return operation;
        },
      });
      const guarded = guardTreeReads(delayed, {
        kind: 'borrowed',
        assertOpen() {
          if (!isOpen) throw new Error('candidate borrowed boundary closed');
        },
      });
      const pending = guarded.resolveStepOrders(seed.workPackageId, projection).then(
        () => ({ kind: 'returned' as const }),
        (cause: unknown) => ({ kind: 'threw' as const, cause }),
      );
      try {
        await entered.promise;
        isOpen = false;
        release.resolve(undefined);
        const observed = await pending;
        expect(observed.kind).toBe('threw');
        if (observed.kind !== 'threw')
          throw new Error('candidate orders escaped the borrowed boundary');
        expect(String(observed.cause)).toContain('candidate borrowed boundary closed');
      } finally {
        release.resolve(undefined);
        await pending;
      }
    },
  );
});
