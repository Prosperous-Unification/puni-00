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
import { sql } from 'drizzle-orm';

import { openSqliteStepCatalogueCase } from './testing/step-catalogue-fixture';

for (const purpose of STEP_ORDER_PROJECTION_CASES)
  test('actual SQLite step projection ' + purpose, async () => {
    const fixture = await openSqliteStepCatalogueCase(
      'stepCatalogue.unbindStep:estimate-refusal-and-preview',
    );
    await withinClaimFixture(
      () => fixture.close(),
      () => assertStepOrderProjection(fixture.source, fixture.seed, purpose),
    );
  });

for (const settlement of ['commit', 'rollback', 'repair'] as const)
  test('actual SQLite step projection expires ' + settlement + ' loan', async () => {
    const fixture = await openSqliteStepCatalogueCase(
      'stepCatalogue.unbindStep:estimate-refusal-and-preview',
    );
    await withinClaimFixture(
      () => fixture.close(),
      () => assertStepOrderLoanExpiry(fixture.source, fixture.seed, settlement),
    );
  });

test('actual SQLite step projection rejects retained public method after close', async () => {
  const fixture = await openSqliteStepCatalogueCase(
    'stepCatalogue.unbindStep:estimate-refusal-and-preview',
  );
  await withinClaimFixture(
    () => fixture.close(),
    async () => {
      await seedCurrentClaimObservation(fixture.source, fixture.seed);
      const store = fixture.source.stores.workItems;
      const projection = {
        rows: await store.listByWorkPackage(fixture.seed.workPackageId),
        directTypes: [],
      };
      const read = store.resolveStepOrders.bind(store);
      expect((await read(fixture.seed.workPackageId, projection)).length).toBe(3);
      await fixture.source.close();
      for (const id of [fixture.seed.workPackageId, 'missing'])
        await expectClaimFailure(() => read(id, projection), 'closed');
    },
  );
});

test('actual SQLite step projection rejects absent explicit package values', async () => {
  const fixture = await openSqliteStepCatalogueCase(
    'stepCatalogue.unbindStep:estimate-refusal-and-preview',
  );
  await withinClaimFixture(
    () => fixture.close(),
    async () => {
      await seedCurrentClaimObservation(fixture.source, fixture.seed);
      const store = fixture.source.stores.workItems;
      const projection = {
        rows: await store.listByWorkPackage(fixture.seed.workPackageId),
        directTypes: [],
      };
      fixture.source.db.run(
        sql`DELETE FROM work_package_step WHERE work_package_id=${fixture.seed.workPackageId}`,
      );
      const before = fixture.readEvidence();
      await expectClaimFailure(
        () => store.resolveStepOrders(fixture.seed.workPackageId, projection),
        'explicit',
      );
      expect(fixture.readEvidence()).toEqual(before);
    },
  );
});

test('actual SQLite queued step projection retains its submitted direct types', async () => {
  const fixture = await openSqliteStepCatalogueCase(
    'stepCatalogue.unbindStep:estimate-refusal-and-preview',
  );
  const entered = Promise.withResolvers<undefined>(),
    release = Promise.withResolvers<undefined>();
  await withinClaimFixture(
    () => fixture.close(),
    async () => {
      await seedCurrentClaimObservation(fixture.source, fixture.seed);
      const store = fixture.source.stores.workItems;
      const projection = {
        rows: await store.listByWorkPackage(fixture.seed.workPackageId),
        directTypes: [{ workItemId: 'claim-first', typeIds: [fixture.seed.secondTypeId] }],
      };
      const owner = fixture.source.uow.run(async () => {
        entered.resolve(undefined);
        await release.promise;
        return { commit: true, value: undefined };
      });
      await entered.promise;
      const pending = store.resolveStepOrders(fixture.seed.workPackageId, projection);
      try {
        projection.directTypes[0].typeIds.length = 0;
        release.resolve(undefined);
        await owner;
        const orders = await pending;
        expect(orders.find((leaf) => leaf.workItemId === 'claim-first')?.stepIds).toEqual([
          'claim-step-a-qa',
          'claim-step-z-dev',
        ]);
      } finally {
        release.resolve(undefined);
        await owner;
        await pending;
      }
    },
  );
});
