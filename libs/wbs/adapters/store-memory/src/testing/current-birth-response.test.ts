import { prepareWorkPackageBirth } from '@wbs/core/module/work-package/work-package-birth';
import {
  assertBirthLoanExpiry,
  assertCurrentBirth,
  assertPendingBirthExpiry,
  assertQueuedBirth,
  BIRTH_ACTOR,
  BIRTH_ORGANIZATION,
  BIRTH_PROJECT,
  createBirthDraft,
  expectBirthFailure,
  seedCurrentBirth,
  withinBirthFixture,
} from '@wbs/core/testing/current-birth-response';
import { seedLegacyPackageParent } from '@wbs/core/testing/legacy-package-source-fixture';
import { test } from 'bun:test';
import { expect } from 'bun:test';

import { openMemorySourceFixture } from '../source';
import { inMemoryWorkPackages } from '../work-package-fixture';
import { openMemoryStepCatalogueSourceFixture } from './step-catalogue-fixture';

async function withinSeeded(
  exercise: (fixture: ReturnType<typeof openMemorySourceFixture>) => Promise<void>,
): Promise<void> {
  const fixture = openMemorySourceFixture();
  await withinBirthFixture(
    () => fixture.source.close(),
    async () => {
      seedLegacyPackageParent(fixture, {
        organizationId: BIRTH_ORGANIZATION,
        projectId: BIRTH_PROJECT,
        creator: BIRTH_ACTOR,
      });
      await seedCurrentBirth(fixture.source, true);
      await exercise(fixture);
    },
  );
}

test('legacy table fixture refuses current birth without an actual Source owner', async () => {
  await expectBirthFailure(
    () =>
      inMemoryWorkPackages().createWithSteps(
        createBirthDraft('unowned-birth'),
        { at: 100, by: BIRTH_ACTOR },
        { kind: 'legacy' },
      ),
    'requires an admitted Source owner',
  );
});

for (const hasBindings of [false, true])
  test(
    'current Memory service birth returns actual catalogue steps (catalogue=' +
      String(hasBindings) +
      ')',
    async () => {
      const fixture = openMemorySourceFixture();
      await withinBirthFixture(
        () => fixture.source.close(),
        async () => {
          seedLegacyPackageParent(fixture, {
            organizationId: BIRTH_ORGANIZATION,
            projectId: BIRTH_PROJECT,
            creator: BIRTH_ACTOR,
          });
          await seedCurrentBirth(fixture.source, hasBindings);
          await assertCurrentBirth(fixture.source, hasBindings);
        },
      );
    },
  );

test('current Memory service birth preserves its reply across an actual later catalogue rename', async () => {
  const fixture = openMemorySourceFixture();
  await withinBirthFixture(
    () => fixture.source.close(),
    async () => {
      seedLegacyPackageParent(fixture, {
        organizationId: BIRTH_ORGANIZATION,
        projectId: BIRTH_PROJECT,
        creator: BIRTH_ACTOR,
      });
      await seedCurrentBirth(fixture.source, true);
      await assertCurrentBirth(fixture.source, true, true);
    },
  );
});

for (const settlement of ['commit', 'rollback', 'repair'] as const)
  test('current Memory birth expires its ' + settlement + ' loan', async () => {
    await withinSeeded(async ({ source }) => assertBirthLoanExpiry(source, settlement));
  });

test('current Memory birth refuses a retained public capability after Source close', async () => {
  await withinSeeded(async ({ source }) => {
    const create = source.stores.workPackages.createWithSteps.bind(source.stores.workPackages);
    await source.close();
    await expectBirthFailure(
      () =>
        create(createBirthDraft('closed-birth'), { at: 100, by: BIRTH_ACTOR }, { kind: 'legacy' }),
      'closed',
    );
  });
});

test('current Memory birth refuses a pending reply after rollback', async () => {
  await withinSeeded(async ({ source }) => assertPendingBirthExpiry(source));
});

test('current Memory public birth retains complete queued legacy input', async () => {
  await withinSeeded(async ({ source }) =>
    assertQueuedBirth(source, BIRTH_PROJECT, BIRTH_ACTOR, { kind: 'legacy' }),
  );
});

test('current scoped Memory birth returns its captured catalogue and creator authority', async () => {
  const { fixture, seed } = await openMemoryStepCatalogueSourceFixture();
  await withinBirthFixture(
    () => fixture.source.close(),
    async () => {
      const { source } = fixture;
      expect(
        (
          await source.stores.stepCatalogue.defineAndBindStep(
            seed.organizationId,
            {
              id: 'scoped-birth-step',
              code: 'scoped-birth-step',
              name: 'Scoped research',
              position: 10,
              defaultEstimateUnit: 'minutes',
              defaultAllowancePercent: 6.25,
            },
            {
              bindingId: 'scoped-birth-binding',
              scopeKind: 'project',
              scopeId: seed.projectId,
              workItemTypeId: seed.typeId,
              position: 10,
            },
            seed.stamp,
          )
        ).ok,
      ).toBe(true);
      const workPackage = prepareWorkPackageBirth(
        'Scoped current birth',
        seed.projectId,
        seed.stamp,
        () => 'scoped-current-born',
      ).workPackage;
      const born = await source.stores.workPackages.createWithSteps(workPackage, seed.stamp, {
        kind: 'scoped',
        organizationId: seed.organizationId,
        creatorGrant: { id: 'scoped-current-grant', auditId: 'scoped-current-audit' },
      });
      if (typeof born === 'string') throw new Error('scoped birth refused: ' + born);
      expect(born.steps).toEqual([
        {
          id: 'scoped-birth-step',
          workPackageId: 'scoped-current-born',
          code: 'scoped-birth-step',
          name: 'Scoped research',
          position: 10,
          estimateUnit: 'minutes',
          allowancePercent: 6.25,
        },
      ]);
      expect(await source.stores.workPackages.findById(workPackage.id)).toEqual(born.workPackage);
      expect(
        fixture.packageCreationEvidence().grants.filter(({ id }) => id === 'scoped-current-grant'),
      ).toHaveLength(1);
      expect(
        fixture.packageCreationEvidence().audits.filter(({ id }) => id === 'scoped-current-audit'),
      ).toHaveLength(1);
      await assertQueuedBirth(source, seed.projectId, seed.stamp.by, {
        kind: 'scoped',
        organizationId: seed.organizationId,
        creatorGrant: { id: 'queued-scoped-grant', auditId: 'queued-scoped-audit' },
      });
      expect(
        fixture.packageCreationEvidence().grants.filter(({ id }) => id === 'queued-scoped-grant'),
      ).toHaveLength(1);
      expect(
        fixture.packageCreationEvidence().audits.filter(({ id }) => id === 'queued-scoped-audit'),
      ).toHaveLength(1);
    },
  );
});
