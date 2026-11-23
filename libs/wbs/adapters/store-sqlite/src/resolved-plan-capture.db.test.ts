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

import { openSqliteStepCatalogueCase } from './testing/step-catalogue-fixture';

test('current SQLite plan capture keeps every own leaf order and detaches it from later edits', async () => {
  const fixture = await openSqliteStepCatalogueCase(
    'stepCatalogue.unbindStep:estimate-refusal-and-preview',
  );
  await withinClaimFixture(
    () => fixture.close(),
    async () => {
      await seedCurrentClaimObservation(fixture.source, fixture.seed);
      const captured = await fixture.source.history.savedPlanCapture.readPlanInput(
        fixture.seed.workPackageId,
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
            { typeIds: [fixture.seed.secondTypeId] },
            fixture.seed.stamp,
          )
        ).ok,
      ).toBe(true);
      const later = await fixture.source.history.savedPlanCapture.readPlanInput(
        fixture.seed.workPackageId,
      );
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

import { sql } from 'drizzle-orm';

import { openExistingConnection } from './db';

test('current SQLite plan capture retains one snapshot across an actual rival type edit', async () => {
  let isArmed = false,
    hasChanged = false;
  let change: (() => void) | undefined;
  const fixture = await openSqliteStepCatalogueCase(
    'stepCatalogue.unbindStep:estimate-refusal-and-preview',
    {
      logQuery(query) {
        if (isArmed && query.includes('from "work_item_team"')) {
          isArmed = false;
          if (change === undefined) throw new Error('rival SQLite edit is absent');
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
      const filename = fixture.source.db
        .all<{ name: string; file: string }>('PRAGMA database_list')
        .find((database) => database.name === 'main')?.file;
      if (filename === undefined || filename === '')
        throw new Error('capture fixture database path is absent');
      const writer = openExistingConnection(filename);
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
          const captured = await fixture.source.history.savedPlanCapture.readPlanInput(
            fixture.seed.workPackageId,
          );
          expect(hasChanged).toBe(true);
          expect(captured?.workItems.find((row) => row.id === 'claim-first')).toMatchObject({
            name: 'claim-first',
            typeIds: [fixture.seed.typeId],
          });
          expect(
            captured?.leafSteps.find((row) => row.workItemId === 'claim-first')?.stepIds,
          ).toEqual([CLAIM_DEV, CLAIM_QA]);
          const later = await fixture.source.history.savedPlanCapture.readPlanInput(
            fixture.seed.workPackageId,
          );
          expect(later?.workItems.find((row) => row.id === 'claim-first')).toMatchObject({
            name: 'Changed by writer',
            typeIds: [fixture.seed.secondTypeId],
          });
          expect(later?.leafSteps.find((row) => row.workItemId === 'claim-first')?.stepIds).toEqual(
            [CLAIM_QA, CLAIM_DEV],
          );
        },
      );
    },
  );
});

import { expectClaimFailure } from '@wbs/core/testing/current-claim-observation';
test('current SQLite plan capture refuses missing explicit values and retained methods after close', async () => {
  const fixture = await openSqliteStepCatalogueCase(
    'stepCatalogue.unbindStep:estimate-refusal-and-preview',
  );
  await withinClaimFixture(
    () => fixture.close(),
    async () => {
      await seedCurrentClaimObservation(fixture.source, fixture.seed);
      const read = fixture.source.history.savedPlanCapture.readPlanInput.bind(
        fixture.source.history.savedPlanCapture,
      );
      fixture.source.db.run(
        sql`DELETE FROM work_package_step WHERE work_package_id=${fixture.seed.workPackageId}`,
      );
      const before = fixture.readEvidence();
      await expectClaimFailure(() => read(fixture.seed.workPackageId), 'explicit');
      expect(fixture.readEvidence()).toEqual(before);
      await fixture.source.close();
      for (const id of [fixture.seed.workPackageId, 'capture-missing-package'])
        await expectClaimFailure(() => read(id), 'closed');
    },
  );
});

import { openSqliteSourceWithCaptureReadSeam } from './source';
import { INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY } from './testing/dependency-capability';
test('current SQLite plan capture refuses Source close during its first await without issuing later selects', async () => {
  const fixture = await openSqliteStepCatalogueCase(
    'stepCatalogue.unbindStep:estimate-refusal-and-preview',
  );
  await withinClaimFixture(
    () => fixture.close(),
    async () => {
      await seedCurrentClaimObservation(fixture.source, fixture.seed);
      const filename = fixture.source.db
        .all<{ name: string; file: string }>('PRAGMA database_list')
        .find((database) => database.name === 'main')?.file;
      if (filename === undefined || filename === '')
        throw new Error('capture fixture database path is absent');
      let hasClosed = false,
        lateSelects = 0;
      let closeOwner: (() => Promise<void>) | undefined;
      const source = openSqliteSourceWithCaptureReadSeam(
        {
          dbPath: filename,
          dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
          logger: {
            logQuery(query) {
              if (hasClosed && query.trimStart().toLowerCase().startsWith('select'))
                lateSelects += 1;
            },
          },
        },
        {
          async afterFirstRead() {
            if (closeOwner === undefined) throw new Error('closing SQLite Source is absent');
            await closeOwner();
            hasClosed = true;
          },
        },
      );
      await withinClaimFixture(
        () => source.close(),
        async () => {
          closeOwner = () => source.close();
          await expectClaimFailure(
            () => source.history.savedPlanCapture.readPlanInput(fixture.seed.workPackageId),
            'closed',
          );
          expect(hasClosed).toBe(true);
          expect(lateSelects).toBe(0);
        },
      );
    },
  );
});

test('current SQLite plan capture checks its captured parent after an actual same-owner deletion and rolls it back', async () => {
  const fixture = await openSqliteStepCatalogueCase(
    'stepCatalogue.unbindStep:estimate-refusal-and-preview',
  );
  await withinClaimFixture(
    () => fixture.close(),
    async () => {
      await seedCurrentClaimObservation(fixture.source, fixture.seed);
      const filename = fixture.source.db
        .all<{ name: string; file: string }>('PRAGMA database_list')
        .find((database) => database.name === 'main')?.file;
      if (filename === undefined || filename === '')
        throw new Error('capture fixture database path is absent');
      let opened = 0;
      let reader: ReturnType<typeof openExistingConnection> | undefined;
      let deleted = false;
      const source = openSqliteSourceWithCaptureReadSeam(
        {
          dbPath: filename,
          dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
          openConnection(path) {
            const connection = openExistingConnection(path);
            opened += 1;
            if (opened === 2) {
              connection.db.run('PRAGMA foreign_keys=OFF');
              reader = connection;
            }
            return connection;
          },
        },
        {
          afterFirstRead() {
            if (reader === undefined) throw new Error('capture reader connection is absent');
            reader.db.run(sql`DELETE FROM project WHERE id=${fixture.seed.projectId}`);
            deleted = true;
            return Promise.resolve();
          },
        },
      );
      await withinClaimFixture(
        () => source.close(),
        async () => {
          await expectClaimFailure(
            () => source.history.savedPlanCapture.readPlanInput(fixture.seed.workPackageId),
            'captured package parent is absent or inconsistent',
          );
          expect(deleted).toBe(true);
          expect(opened).toBe(2);
          expect(
            fixture.source.db.get<{ id: string }>(
              sql`SELECT id FROM project WHERE id=${fixture.seed.projectId}`,
            ),
          ).toEqual({ id: fixture.seed.projectId });
        },
      );
    },
  );
});

import { openSqliteSource } from './source';
test('current SQLite plan capture acquires no connection after Source close for known or absent packages', async () => {
  const fixture = await openSqliteStepCatalogueCase(
    'stepCatalogue.unbindStep:estimate-refusal-and-preview',
  );
  await withinClaimFixture(
    () => fixture.close(),
    async () => {
      await seedCurrentClaimObservation(fixture.source, fixture.seed);
      const filename = fixture.source.db
        .all<{ name: string; file: string }>('PRAGMA database_list')
        .find((database) => database.name === 'main')?.file;
      if (filename === undefined || filename === '')
        throw new Error('capture fixture database path is absent');
      let acquired = 0;
      const source = openSqliteSource({
        dbPath: filename,
        dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
        openConnection(path) {
          acquired += 1;
          return openExistingConnection(path);
        },
      });
      await withinClaimFixture(
        () => source.close(),
        async () => {
          const openedBefore = acquired;
          expect(openedBefore).toBeGreaterThan(0);
          await source.close();
          for (const id of [fixture.seed.workPackageId, 'capture-absent'])
            await expectClaimFailure(
              () => source.history.savedPlanCapture.readPlanInput(id),
              'closed',
            );
          expect(acquired).toBe(openedBefore);
        },
      );
    },
  );
});
test('current SQLite plan capture refuses Source close during its final directory read', async () => {
  const fixture = await openSqliteStepCatalogueCase(
    'stepCatalogue.unbindStep:estimate-refusal-and-preview',
  );
  await withinClaimFixture(
    () => fixture.close(),
    async () => {
      await seedCurrentClaimObservation(fixture.source, fixture.seed);
      const filename = fixture.source.db
        .all<{ name: string; file: string }>('PRAGMA database_list')
        .find((database) => database.name === 'main')?.file;
      if (filename === undefined || filename === '')
        throw new Error('capture fixture database path is absent');
      let isArmed = false;
      let closing: Promise<void> | undefined;
      const source = openSqliteSource({
        dbPath: filename,
        dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
        logger: {
          logQuery(query) {
            if (isArmed && query.includes('from "resource"')) {
              isArmed = false;
              closing = source.close();
            }
          },
        },
      });
      await withinClaimFixture(
        () => source.close(),
        async () => {
          isArmed = true;
          await expectClaimFailure(
            () => source.history.savedPlanCapture.readPlanInput(fixture.seed.workPackageId),
            'closed',
          );
          expect(isArmed).toBe(false);
          if (closing === undefined) throw new Error('final-read Source close did not start');
          await closing;
        },
      );
    },
  );
});
