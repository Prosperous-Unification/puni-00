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
import { expect, test } from 'bun:test';

import { openMemoryStepCatalogueSourceFixture } from './step-catalogue-fixture';

type Fixture = Awaited<ReturnType<typeof openMemoryStepCatalogueSourceFixture>>;
async function withinFixture(exercise: (opened: Fixture) => Promise<void>): Promise<void> {
  const opened = await openMemoryStepCatalogueSourceFixture();
  await withinClaimFixture(
    () => opened.fixture.source.close(),
    async () => {
      await seedCurrentClaimObservation(opened.fixture.source, opened.seed);
      await writeCurrentClaims(opened.fixture.source, opened.seed);
      await exercise(opened);
    },
  );
}

test('current memory claim observation preserves opposing leaf orders and explicit zero-step leaves', async () => {
  await withinFixture(async ({ fixture, seed }) => {
    const { source } = fixture;
    const before = fixture.stepCatalogueEvidence();
    await assertCurrentClaimObservation(source, seed, { kind: 'legacy' });
    expect(fixture.stepCatalogueEvidence()).toEqual(before);
  });
});

for (const settlement of ['commit', 'rollback', 'repair'] as const)
  test('current memory claim observation expires its ' + settlement + ' loan', async () => {
    await withinFixture(async ({ fixture: { source }, seed }) =>
      assertClaimLoanExpiry(source, seed, { kind: 'legacy' }, settlement),
    );
  });

test('current memory claim observation refuses known and missing packages after Source close', async () => {
  await withinFixture(async ({ fixture: { source }, seed }) => {
    const observe = source.stores.claims.observeWorkPackage.bind(source.stores.claims);
    expect((await observe(seed.workPackageId, { kind: 'legacy' })).kind).toBe('observed');
    await source.close();
    for (const id of [seed.workPackageId, 'missing'])
      await expectClaimFailure(() => observe(id, { kind: 'legacy' }), 'closed');
  });
});

test('current memory claim observation already captured before Source close may finish', async () => {
  await withinFixture(async ({ fixture: { source }, seed }) => {
    const pending = source.stores.claims.observeWorkPackage(seed.workPackageId, { kind: 'legacy' });
    await source.close();
    const observed = await pending;
    expect(observed.kind).toBe('observed');
    if (observed.kind !== 'observed') throw new Error('admitted public observation refused');
    expect(observed.claims).toHaveLength(5);
  });
});

for (const [workItemId, message] of [
  ['claim-empty', 'not leaf-resolved'],
  ['claim-parent', 'parent work item'],
] as const)
  test('current memory claim observation refuses a point claim on ' + workItemId, async () => {
    await withinFixture(async ({ fixture, seed }) => {
      const { source } = fixture;
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
        (await source.stores.claims.listStampedByWorkPackage(seed.workPackageId)).some(
          (claim) => claim.id === 'invalid-current-claim',
        ),
      ).toBe(true);
      const before = fixture.stepCatalogueEvidence();
      await expectClaimFailure(
        () => source.stores.claims.observeWorkPackage(seed.workPackageId, { kind: 'legacy' }),
        message,
      );
      expect(fixture.stepCatalogueEvidence()).toEqual(before);
    });
  });

test('current memory claim observation refuses missing explicit values without point claims', async () => {
  await withinFixture(async ({ fixture, seed }) => {
    const { source } = fixture;
    const claims = await source.stores.claims.listByWorkPackage(seed.workPackageId);
    expect(claims).toHaveLength(5);
    await source.stores.claims.remove(claims, [], seed.stamp);
    expect(await source.stores.claims.listStampedByWorkPackage(seed.workPackageId)).toEqual([]);
    expect(fixture.removePackageStepValues(seed.workPackageId)).toBe(2);
    expect(
      fixture
        .stepCatalogueEvidence()
        .packageValues.filter((row) => row.workPackageId === seed.workPackageId),
    ).toEqual([]);
    const before = fixture.stepCatalogueEvidence();
    await expectClaimFailure(
      () => source.stores.claims.observeWorkPackage(seed.workPackageId, { kind: 'legacy' }),
      'explicit',
    );
    expect(fixture.stepCatalogueEvidence()).toEqual(before);
  });
});

test('current memory claim observation refuses a missing actual parent', async () => {
  await withinFixture(async ({ fixture, seed }) => {
    fixture.removePackageCaptureParent(seed.projectId);
    const before = fixture.stepCatalogueEvidence();
    await expectClaimFailure(
      () => fixture.source.stores.claims.observeWorkPackage(seed.workPackageId, { kind: 'legacy' }),
      'project is absent',
    );
    expect(fixture.stepCatalogueEvidence()).toEqual(before);
  });
});
