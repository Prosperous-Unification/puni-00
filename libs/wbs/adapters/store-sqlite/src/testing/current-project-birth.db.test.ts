import { prepareWorkPackageBirth } from '@wbs/core/module/work-package/work-package-birth';
import {
  assertQueuedBirth,
  expectBirthFailure,
  withinBirthFixture,
} from '@wbs/core/testing/current-birth-response';
import { expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';

import { ProjectRepository } from '../project';
import { openSqliteStepCatalogueCase } from './step-catalogue-fixture';

type Fixture = Awaited<ReturnType<typeof openSqliteStepCatalogueCase>>;
const STEP = 'current-project-birth-step',
  PROJECT = 'current-born-project',
  PACKAGE = 'current-combined-package';

async function withinFixture(exercise: (fixture: Fixture) => Promise<void>): Promise<void> {
  const fixture = await openSqliteStepCatalogueCase(
    'stepCatalogue.unbindStep:estimate-refusal-and-preview',
  );
  await withinBirthFixture(
    () => fixture.close(),
    async () => {
      const { seed, port } = fixture;
      expect(
        (
          await port.defineAndBindStep(
            seed.organizationId,
            {
              id: STEP,
              code: STEP,
              name: 'Inherited organization review',
              position: 20,
              defaultEstimateUnit: 'minutes',
              defaultAllowancePercent: 6.25,
            },
            {
              bindingId: STEP + ':binding',
              scopeKind: 'organization',
              scopeId: seed.organizationId,
              workItemTypeId: null,
              position: 20,
            },
            seed.stamp,
          )
        ).ok,
      ).toBe(true);
      await exercise(fixture);
    },
  );
}

function createCombined({ source, seed }: Fixture) {
  const repository = new ProjectRepository(source.db, source.gate);
  return repository.create(
    { id: PROJECT, organizationId: seed.organizationId, name: 'Current project' },
    {
      actor: { kind: 'user', userId: seed.stamp.by },
      at: seed.stamp.at,
      grantId: 'current-project-grant',
      projectAuditId: 'current-project-audit',
      grantAuditId: 'current-project-grant-audit',
    },
    {
      ...prepareWorkPackageBirth('Current child', PROJECT, seed.stamp, () => PACKAGE),
      creatorGrant: { id: 'current-child-grant', auditId: 'current-child-grant-audit' },
    },
  );
}

function installMissingValues({ source }: Fixture): void {
  // Proof: newborn-values-injection omits the physical trigger; both actual
  // sqlite_master prerequisites fail before either birth is exercised.
  source.db.run(
    sql`CREATE TRIGGER erase_current_birth_values AFTER INSERT ON work_package_step BEGIN DELETE FROM work_package_step WHERE work_package_id=NEW.work_package_id AND step_id=NEW.step_id; END`,
  );
  expect(
    source.db.all(
      sql`SELECT name FROM sqlite_master WHERE type='trigger' AND name='erase_current_birth_values'`,
    ),
  ).toEqual([{ name: 'erase_current_birth_values' }]);
}

test('current combined project birth returns actual inherited organization steps and creator authority', async () => {
  await withinFixture(async (fixture) => {
    const { source, seed } = fixture;
    const born = await createCombined(fixture);
    if (typeof born === 'string' || born.kind !== 'created_with_work_package')
      throw new Error('combined birth refused: ' + JSON.stringify(born));
    expect(born.steps).toEqual([
      {
        id: STEP,
        workPackageId: PACKAGE,
        code: STEP,
        name: 'Inherited organization review',
        position: 20,
        estimateUnit: 'minutes',
        allowancePercent: 6.25,
      },
    ]);
    expect(born.workPackage).toMatchObject({ id: PACKAGE, projectId: PROJECT, revision: 0 });
    expect(await source.stores.workPackages.stepsOf(PACKAGE)).toEqual([...born.steps]);
    expect(await source.stores.workPackages.findById(PACKAGE)).toEqual(born.workPackage);
    expect(
      source.db.all(
        sql`SELECT id,role_id,scope_id,origin,created_by FROM access_grant WHERE id IN ('current-project-grant','current-child-grant') ORDER BY id`,
      ),
    ).toEqual([
      {
        id: 'current-child-grant',
        role_id: 'package-manager',
        scope_id: PACKAGE,
        origin: 'creation',
        created_by: seed.stamp.by,
      },
      {
        id: 'current-project-grant',
        role_id: 'project-manager',
        scope_id: PROJECT,
        origin: 'creation',
        created_by: seed.stamp.by,
      },
    ]);
    expect(
      source.db.all(
        sql`SELECT id FROM step_definition WHERE organization_id=${seed.organizationId}`,
      ),
    ).toEqual([{ id: STEP }]);
    expect(source.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
  });
});

test('current combined project birth rolls back its entire owner when newborn explicit values disappear', async () => {
  await withinFixture(async (fixture) => {
    installMissingValues(fixture);
    const before = fixture.readEvidence();
    await expectBirthFailure(() => createCombined(fixture), 'explicit');
    expect(fixture.readEvidence()).toEqual(before);
  });
});

test('current scoped SQLite birth returns its captured catalogue and creator grant', async () => {
  await withinFixture(async ({ source, seed }) => {
    const workPackage = prepareWorkPackageBirth(
      'Scoped current birth',
      seed.projectId,
      seed.stamp,
      () => PACKAGE,
    ).workPackage;
    const born = await source.stores.workPackages.createWithSteps(workPackage, seed.stamp, {
      kind: 'scoped',
      organizationId: seed.organizationId,
      creatorGrant: { id: 'scoped-current-grant', auditId: 'scoped-current-audit' },
    });
    if (typeof born === 'string') throw new Error('scoped birth refused: ' + born);
    expect(born.steps.map(({ id }) => id)).toEqual([STEP]);
    expect(born.steps[0]).toMatchObject({
      workPackageId: PACKAGE,
      estimateUnit: 'minutes',
      allowancePercent: 6.25,
    });
    expect(await source.stores.workPackages.findById(PACKAGE)).toEqual(born.workPackage);
    expect(
      source.db.all(
        sql`SELECT role_id,scope_id,origin,created_by FROM access_grant WHERE id='scoped-current-grant'`,
      ),
    ).toEqual([
      {
        role_id: 'package-manager',
        scope_id: PACKAGE,
        origin: 'creation',
        created_by: seed.stamp.by,
      },
    ]);
    await assertQueuedBirth(source, seed.projectId, seed.stamp.by, {
      kind: 'scoped',
      organizationId: seed.organizationId,
      creatorGrant: { id: 'queued-scoped-grant', auditId: 'queued-scoped-audit' },
    });
    expect(
      source.db.all(
        sql`SELECT role_id,scope_id,origin,created_by FROM access_grant WHERE id='queued-scoped-grant'`,
      ),
    ).toEqual([
      {
        role_id: 'package-manager',
        scope_id: 'queued-current-birth',
        origin: 'creation',
        created_by: seed.stamp.by,
      },
    ]);
  });
});

test('current scoped SQLite birth rolls back package values allocator and creator authority on capture failure', async () => {
  await withinFixture(async (fixture) => {
    const { source, seed } = fixture;
    installMissingValues(fixture);
    const before = fixture.readEvidence();
    const workPackage = prepareWorkPackageBirth(
      'Scoped current failure',
      seed.projectId,
      seed.stamp,
      () => PACKAGE,
    ).workPackage;
    await expectBirthFailure(
      () =>
        source.stores.workPackages.createWithSteps(workPackage, seed.stamp, {
          kind: 'scoped',
          organizationId: seed.organizationId,
          creatorGrant: { id: 'scoped-current-grant', auditId: 'scoped-current-audit' },
        }),
      'explicit',
    );
    expect(fixture.readEvidence()).toEqual(before);
  });
});
