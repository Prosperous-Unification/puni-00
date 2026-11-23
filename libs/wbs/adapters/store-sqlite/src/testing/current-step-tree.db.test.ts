import {
  expectClaimFailure,
  seedCurrentClaimObservation,
  withinClaimFixture,
} from '@wbs/core/testing/current-claim-observation';
import { CLAIM_DEV, CLAIM_QA } from '@wbs/core/testing/current-claim-observation';
import { assertTreeLoanExpiry } from '@wbs/core/testing/current-step-tree';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';

import { openExistingConnection } from '../db';
import { openSqliteStepCatalogueCase } from './step-catalogue-fixture';

for (const bound of [false, true]) {
  for (const settlement of ['commit', 'rollback', 'repair'] as const)
    test('current SQLite tree expires its ' + settlement + ' loan ' + String(bound), async () => {
      const fixture = await openSqliteStepCatalogueCase(
        'stepCatalogue.unbindStep:estimate-refusal-and-preview',
      );
      await withinClaimFixture(
        () => fixture.close(),
        async () => {
          await seedCurrentClaimObservation(fixture.source, fixture.seed);
          const source = bound
            ? fixture.source.bindLivePlans({ schedulerOf: () => fastScheduler })
            : fixture.source;
          await assertTreeLoanExpiry(source, fixture.seed.workPackageId, settlement);
        },
      );
    });
  test(
    'current SQLite tree refuses a retained method after Source close ' + String(bound),
    async () => {
      const fixture = await openSqliteStepCatalogueCase(
        'stepCatalogue.unbindStep:estimate-refusal-and-preview',
      );
      await withinClaimFixture(
        () => fixture.close(),
        async () => {
          await seedCurrentClaimObservation(fixture.source, fixture.seed);
          const source = bound
            ? fixture.source.bindLivePlans({ schedulerOf: () => fastScheduler })
            : fixture.source;
          const read = source.stores.workItems.listTreeByWorkPackage.bind(source.stores.workItems);
          expect((await read(fixture.seed.workPackageId)).length).toBe(4);
          await source.close();
          for (const id of [fixture.seed.workPackageId, 'missing'])
            await expectClaimFailure(() => read(id), 'closed');
        },
      );
    },
  );
}

test('current SQLite tree refuses missing explicit values even without point facts', async () => {
  const fixture = await openSqliteStepCatalogueCase(
    'stepCatalogue.unbindStep:estimate-refusal-and-preview',
  );
  await withinClaimFixture(
    () => fixture.close(),
    async () => {
      await seedCurrentClaimObservation(fixture.source, fixture.seed);
      fixture.source.db.run(
        sql`DELETE FROM work_package_step WHERE work_package_id=${fixture.seed.workPackageId}`,
      );
      const before = fixture.readEvidence();
      await expectClaimFailure(
        () => fixture.source.stores.workItems.listTreeByWorkPackage(fixture.seed.workPackageId),
        'explicit values',
      );
      expect(fixture.readEvidence()).toEqual(before);
    },
  );
});

test('current SQLite tree retains one epoch while an actual other connection changes a leaf type', async () => {
  let isArmed = false,
    hasChanged = false;
  let change: (() => void) | undefined;
  const fixture = await openSqliteStepCatalogueCase(
    'stepCatalogue.unbindStep:estimate-refusal-and-preview',
    {
      logQuery(query) {
        if (isArmed && query.includes('from "work_item_team"')) {
          isArmed = false;
          if (change === undefined) throw new Error('concurrent tree writer is absent');
          change();
          hasChanged = true;
        }
      },
    },
  );
  await withinClaimFixture(
    () => fixture.close(),
    async () => {
      await seedCurrentClaimObservation(fixture.source, fixture.seed);
      const databases = fixture.source.db.all<{ name: string; file: string }>(
        'PRAGMA database_list',
      );
      const path = databases.find((database) => database.name === 'main')?.file;
      if (path === undefined || path === '')
        throw new Error('tree fixture database path is absent');
      const writer = openExistingConnection(path);
      await withinClaimFixture(
        () => {
          writer.close();
          return Promise.resolve();
        },
        async () => {
          change = () => {
            writer.db.transaction((tx) => {
              tx.run(sql`UPDATE work_item SET name='Changed by writer' WHERE id='claim-first'`);
              tx.run(
                sql`UPDATE work_item_work_item_type SET type_id=${fixture.seed.secondTypeId} WHERE work_item_id='claim-first'`,
              );
            });
          };
          isArmed = true;
          const rows = await fixture.source.stores.workItems.listTreeByWorkPackage(
            fixture.seed.workPackageId,
          );
          expect(hasChanged).toBe(true);
          const first = rows.find((row) => row.id === 'claim-first');
          expect(first).toMatchObject({ name: 'claim-first', typeIds: [fixture.seed.typeId] });
          expect(first?.steps?.map((step) => step.stepId)).toEqual([CLAIM_DEV, CLAIM_QA]);
          const later = await fixture.source.stores.workItems.listTreeByWorkPackage(
            fixture.seed.workPackageId,
          );
          expect(later.find((row) => row.id === 'claim-first')).toMatchObject({
            name: 'Changed by writer',
            typeIds: [fixture.seed.secondTypeId],
          });
          expect(
            later.find((row) => row.id === 'claim-first')?.steps?.map((step) => step.stepId),
          ).toEqual([CLAIM_QA, CLAIM_DEV]);
        },
      );
    },
  );
});
