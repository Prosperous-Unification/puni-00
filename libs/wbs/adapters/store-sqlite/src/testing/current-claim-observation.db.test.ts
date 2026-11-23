import type { ResourceAccess } from '@wbs/core';
import {
  assertClaimLoanExpiry,
  assertCurrentClaimObservation,
  CLAIM_DEV,
  CLAIM_PERSON,
  expectClaimFailure,
  seedCurrentClaimObservation,
  withinClaimFixture,
  writeCurrentClaims,
} from '@wbs/core/testing/current-claim-observation';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';

import { openSqliteStepCatalogueCase } from './step-catalogue-fixture';

type Fixture = Awaited<ReturnType<typeof openSqliteStepCatalogueCase>>;
const accessOf = ({ seed }: Fixture): ResourceAccess => ({
  kind: 'scoped',
  scope: { organizationId: seed.organizationId, userId: seed.stamp.by, cap: null },
  principal: { id: seed.stamp.by },
});
async function withinFixture(exercise: (fixture: Fixture) => Promise<void>): Promise<void> {
  const fixture = await openSqliteStepCatalogueCase(
    'stepCatalogue.unbindStep:estimate-refusal-and-preview',
  );
  await withinClaimFixture(
    () => fixture.close(),
    async () => {
      await seedCurrentClaimObservation(fixture.source, fixture.seed);
      fixture.source.db.run(
        sql`INSERT INTO person_organization(resource_id,organization_id,name) VALUES(${CLAIM_PERSON},${fixture.seed.organizationId},'Claim person')`,
      );
      await writeCurrentClaims(fixture.source, fixture.seed);
      await exercise(fixture);
    },
  );
}

test('current SQLite claim observation preserves opposing leaf orders and explicit zero-step leaves', async () => {
  await withinFixture(async (fixture) => {
    const { source, seed } = fixture;
    const before = fixture.readEvidence();
    await assertCurrentClaimObservation(source, seed, accessOf(fixture));
    expect(fixture.readEvidence()).toEqual(before);
  });
});

for (const bound of [false, true])
  for (const settlement of ['commit', 'rollback', 'repair'] as const)
    test(
      'current SQLite claim observation expires its ' +
        settlement +
        ' loan (' +
        (bound ? 'bound' : 'plain') +
        ')',
      async () => {
        await withinFixture(async (fixture) => {
          const source = bound
            ? fixture.source.bindLivePlans({ schedulerOf: () => fastScheduler })
            : fixture.source;
          await assertClaimLoanExpiry(source, fixture.seed, accessOf(fixture), settlement);
        });
      },
    );

for (const bound of [false, true])
  test(
    'current SQLite claim observation refuses known and missing packages after Source close (' +
      (bound ? 'bound' : 'plain') +
      ')',
    async () => {
      await withinFixture(async (fixture) => {
        const { seed } = fixture,
          access = accessOf(fixture);
        const source = bound
          ? fixture.source.bindLivePlans({ schedulerOf: () => fastScheduler })
          : fixture.source;
        const observe = source.stores.claims.observeWorkPackage.bind(source.stores.claims);
        expect((await observe(seed.workPackageId, access)).kind).toBe('observed');
        await source.close();
        for (const id of [seed.workPackageId, 'missing'])
          await expectClaimFailure(() => observe(id, access), 'closed');
      });
    },
  );

for (const bound of [false, true])
  test(
    'current SQLite claim observation refuses a borrowed read returning after its owner settles (' +
      (bound ? 'bound' : 'plain') +
      ')',
    async () => {
      await withinFixture(async (fixture) => {
        const source = bound
          ? fixture.source.bindLivePlans({ schedulerOf: () => fastScheduler })
          : fixture.source;
        const settled = await source.uow.run(({ stores }) =>
          Promise.resolve({
            commit: true,
            value: stores.claims
              .observeWorkPackage(fixture.seed.workPackageId, accessOf(fixture))
              .then(
                () => ({ kind: 'answered' }) as const,
                (cause: unknown) => ({ kind: 'failed', cause }) as const,
              ),
          }),
        );
        expect(settled.kind).toBe('failed');
        if (settled.kind !== 'failed') throw new Error('borrowed observation outlived its owner');
        expect(String(settled.cause)).toContain('closed');
      });
    },
  );

for (const bound of [false, true])
  test(
    'current SQLite claim observation already captured before Source close may finish (' +
      (bound ? 'bound' : 'plain') +
      ')',
    async () => {
      await withinFixture(async (fixture) => {
        const source = bound
          ? fixture.source.bindLivePlans({ schedulerOf: () => fastScheduler })
          : fixture.source;
        const pending = source.stores.claims.observeWorkPackage(
          fixture.seed.workPackageId,
          accessOf(fixture),
        );
        await source.close();
        const observed = await pending;
        expect(observed.kind).toBe('observed');
        if (observed.kind !== 'observed') throw new Error('admitted public observation refused');
        expect(observed.claims).toHaveLength(5);
      });
    },
  );

for (const [workItemId, message] of [
  ['claim-empty', 'not leaf-resolved'],
  ['claim-parent', 'parent work item'],
] as const)
  test('current SQLite claim observation refuses a point claim on ' + workItemId, async () => {
    await withinFixture(async (fixture) => {
      const { source, seed } = fixture;
      expect(
        await source.stores.claims.add(
          [
            {
              id: 'invalid-current-claim',
              workItemId,
              stepId: CLAIM_DEV,
              personId: CLAIM_PERSON,
              runId: null,
              parentClaimId: null,
              accountId: seed.stamp.by,
            },
          ],
          [],
          seed.stamp,
          [],
        ),
      ).toBe('written');
      expect(
        source.db.all(
          sql`SELECT id FROM claim WHERE id='invalid-current-claim' AND work_item_id=${workItemId} AND step_id=${CLAIM_DEV}`,
        ),
      ).toEqual([{ id: 'invalid-current-claim' }]);
      const before = fixture.readEvidence();
      await expectClaimFailure(
        () => source.stores.claims.observeWorkPackage(seed.workPackageId, accessOf(fixture)),
        message,
      );
      expect(fixture.readEvidence()).toEqual(before);
    });
  });

test('current SQLite claim observation refuses missing explicit values without point claims', async () => {
  await withinFixture(async (fixture) => {
    const { source, seed } = fixture;
    source.db.run(sql`DELETE FROM claim`);
    expect(source.db.all(sql`SELECT id FROM claim`)).toEqual([]);
    source.db.run(sql`PRAGMA foreign_keys=OFF`);
    try {
      source.db.run(sql`DELETE FROM work_package_step WHERE work_package_id=${seed.workPackageId}`);
    } finally {
      source.db.run(sql`PRAGMA foreign_keys=ON`);
    }
    expect(source.db.all(sql`PRAGMA foreign_keys`)).toEqual([{ foreign_keys: 1 }]);
    expect(
      source.db.all(
        sql`SELECT step_id FROM work_package_step WHERE work_package_id=${seed.workPackageId}`,
      ),
    ).toEqual([]);
    const before = fixture.readEvidence();
    await expectClaimFailure(
      () => source.stores.claims.observeWorkPackage(seed.workPackageId, accessOf(fixture)),
      'explicit',
    );
    expect(fixture.readEvidence()).toEqual(before);
  });
});

test('current SQLite claim observation refuses a missing actual parent', async () => {
  await withinFixture(async (fixture) => {
    const { source, seed } = fixture;
    source.db.run(sql`PRAGMA foreign_keys=OFF`);
    try {
      source.db.run(sql`DELETE FROM project WHERE id=${seed.projectId}`);
    } finally {
      source.db.run(sql`PRAGMA foreign_keys=ON`);
    }
    expect(source.db.all(sql`PRAGMA foreign_keys`)).toEqual([{ foreign_keys: 1 }]);
    expect(source.db.all(sql`SELECT id FROM project WHERE id=${seed.projectId}`)).toEqual([]);
    const before = fixture.readEvidence();
    await expectClaimFailure(
      () => source.stores.claims.observeWorkPackage(seed.workPackageId, accessOf(fixture)),
      'parent',
    );
    expect(fixture.readEvidence()).toEqual(before);
  });
});
