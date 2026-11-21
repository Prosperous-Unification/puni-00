import { WorkPackageStepMissing } from '@wbs/core';
import { withinBirthFixture } from '@wbs/core/testing/current-birth-response';
import { expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';

import { openSqliteStepCatalogueCase } from './step-catalogue-fixture';

for (const field of ['unit', 'allowance'] as const)
  test('current package ' + field + ' update requires its actual RETURNING row', async () => {
    const fixture = await openSqliteStepCatalogueCase(
      'stepCatalogue.unbindStep:estimate-refusal-and-preview',
    );
    await withinBirthFixture(
      () => fixture.close(),
      async () => {
        const { source, seed, port } = fixture,
          stepId = 'returning-current-step';
        expect(
          (
            await port.defineAndBindStep(
              seed.organizationId,
              {
                id: stepId,
                code: stepId,
                name: 'Returning row',
                position: 10,
                defaultEstimateUnit: 'workdays',
                defaultAllowancePercent: 0,
              },
              {
                bindingId: 'returning-current-binding',
                scopeKind: 'project',
                scopeId: seed.projectId,
                workItemTypeId: null,
                position: 10,
              },
              seed.stamp,
            )
          ).ok,
        ).toBe(true);
        const write = () =>
          field === 'unit'
            ? source.stores.workPackages.setStepUnit(
                seed.workPackageId,
                stepId,
                'minutes',
                seed.stamp,
              )
            : source.stores.workPackages.setStepAllowance(
                seed.workPackageId,
                stepId,
                5.25,
                seed.stamp,
              );
        source.db.run(
          sql`CREATE TRIGGER skip_current_package_update BEFORE UPDATE ON work_package_step BEGIN SELECT RAISE(IGNORE); END`,
        );
        expect(
          source.db.all(
            sql`SELECT name FROM sqlite_master WHERE type='trigger' AND name='skip_current_package_update'`,
          ),
        ).toEqual([{ name: 'skip_current_package_update' }]);
        const before = fixture.readEvidence();
        const settled = await write().then(
          () => ({ kind: 'answered' }) as const,
          (cause: unknown) => ({ kind: 'failed', cause }) as const,
        );
        expect(settled.kind).toBe('failed');
        if (settled.kind !== 'failed') throw new Error('zero-row update unexpectedly answered');
        expect(settled.cause).toBeInstanceOf(WorkPackageStepMissing);
        expect(fixture.readEvidence()).toEqual(before);
        source.db.run(sql`DROP TRIGGER skip_current_package_update`);
        expect(await write()).toMatchObject({ ok: true });
        expect(
          (await source.stores.workPackages.stepsOf(seed.workPackageId)).find(
            ({ id }) => id === stepId,
          ),
        ).toMatchObject(
          field === 'unit' ? { estimateUnit: 'minutes' } : { allowancePercent: 5.25 },
        );
      },
    );
  });
