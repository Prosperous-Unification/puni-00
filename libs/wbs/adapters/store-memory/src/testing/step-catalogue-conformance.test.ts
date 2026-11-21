import {
  runCases,
  type StepCatalogueCaseId,
  stepCatalogueFixtureFromSource,
  stepCatalogueRegistrations,
} from '@wbs/conformance';
import type { AccessGrantRecord, OrganizationAuditRecord, PackageStep } from '@wbs/core';
import { expect, test } from 'bun:test';

import { workPackageRow } from '../work-package-fixture';
import { openMemoryStepCatalogueCase as openMemoryStepCatalogueCaseIn } from './step-catalogue-fixture';
import { openMemoryStepCatalogueSourceFixture } from './step-catalogue-fixture';

const openMemoryStepCatalogueCase = (caseId: StepCatalogueCaseId) =>
  openMemoryStepCatalogueCaseIn(caseId, stepCatalogueFixtureFromSource);

for (const registration of stepCatalogueRegistrations(openMemoryStepCatalogueCase)) {
  test('memory ' + registration.caseId, async () => {
    const report = await runCases([registration]);
    const failure = report.cases.find(({ status }) => status === 'failed');
    if (failure?.status === 'failed') throw new Error(failure.failure);
    expect(report.cases.map(({ caseId, status }) => ({ caseId, status }))).toEqual([
      { caseId: registration.caseId, status: 'passed' },
    ]);
  });
}

test('memory catalogue package birth materializes the current organization and typed project union for an empty package', async () => {
  const { fixture, seed } = await openMemoryStepCatalogueSourceFixture();
  const source = fixture.source,
    port = source.stores.stepCatalogue;
  let outcome: { readonly ok: true } | { readonly ok: false; readonly cause: unknown };
  try {
    expect((await port.readPackage(seed.organizationId, seed.workPackageId))?.steps).toEqual([]);
    expect(
      (
        await port.defineAndBindStep(
          seed.organizationId,
          {
            id: 'memory-org-dev',
            code: 'memory-org-dev',
            name: 'Memory Organization Development',
            defaultEstimateUnit: 'minutes',
            defaultAllowancePercent: 12.5,
            position: 50,
          },
          {
            bindingId: 'memory-org-dev:binding',
            scopeKind: 'organization',
            scopeId: seed.organizationId,
            workItemTypeId: null,
            position: 20,
          },
          seed.stamp,
        )
      ).ok,
    ).toBe(true);
    expect(
      (
        await port.defineAndBindStep(
          seed.organizationId,
          {
            id: 'memory-project-qa',
            code: 'memory-project-qa',
            name: 'Memory Project QA',
            defaultEstimateUnit: 'workdays',
            defaultAllowancePercent: 7.25,
            position: 80,
          },
          {
            bindingId: 'memory-project-qa:binding',
            scopeKind: 'project',
            scopeId: seed.projectId,
            workItemTypeId: seed.typeId,
            position: 5,
          },
          seed.stamp,
        )
      ).ok,
    ).toBe(true);
    const expectedSteps: readonly PackageStep[] = [
      {
        stepId: 'memory-org-dev',
        code: 'memory-org-dev',
        name: 'Memory Organization Development',
        estimateUnit: 'minutes',
        allowancePercent: 12.5,
        allowanceRevision: 0,
        via: [
          {
            bindingId: 'memory-org-dev:binding',
            scopeKind: 'organization',
            scopeId: seed.organizationId,
            workItemTypeId: null,
          },
        ],
      },
      {
        stepId: 'memory-project-qa',
        code: 'memory-project-qa',
        name: 'Memory Project QA',
        estimateUnit: 'workdays',
        allowancePercent: 7.25,
        allowanceRevision: 0,
        via: [
          {
            bindingId: 'memory-project-qa:binding',
            scopeKind: 'project',
            scopeId: seed.projectId,
            workItemTypeId: seed.typeId,
          },
        ],
      },
    ];
    expect((await port.readPackage(seed.organizationId, seed.workPackageId))?.steps).toEqual(
      expectedSteps,
    );
    const catalogueBefore = await port.readCatalogue(seed.organizationId),
      foreignCatalogueBefore = await port.readCatalogue(seed.foreignOrganizationId);
    const existingBefore = await port.readPackage(seed.organizationId, seed.workPackageId),
      siblingBefore = await port.readPackage(seed.organizationId, seed.siblingWorkPackageId),
      foreignBefore = await port.readPackage(seed.foreignOrganizationId, seed.foreignWorkPackageId);
    const creationBefore = fixture.packageCreationEvidence();
    const newbornId = 'catalogue-born-after-bindings';
    expect(await source.stores.workPackages.findById(newbornId)).toBeNull();
    const created = await source.stores.workPackages.createInOrganization(
      workPackageRow({
        id: newbornId,
        projectId: seed.projectId,
        name: 'Catalogue Born After Bindings',
      }),
      [],
      seed.stamp,
      seed.organizationId,
      { id: newbornId + ':creator-grant', auditId: newbornId + ':creator-audit' },
    );
    expect(typeof created).toBe('object');
    if (typeof created === 'string') throw new Error('catalogue newborn refused: ' + created);
    expect(created.id).toBe(newbornId);
    expect(
      (
        await source.stores.settings.readTarget(
          { level: 'work_package', id: newbornId },
          seed.organizationId,
        )
      )?.chain,
    ).toEqual({
      level: 'work_package',
      organizationId: seed.organizationId,
      spaceId: seed.spaceId,
      projectId: seed.projectId,
      workPackageId: newbornId,
    });
    expect(await source.stores.workItems.listByWorkPackage(newbornId)).toEqual([]);
    const creationAfter = fixture.packageCreationEvidence();
    expect(
      creationAfter.grants.filter(({ id }) => id === newbornId + ':creator-grant'),
    ).toHaveLength(1);
    expect(
      creationAfter.audits.filter(({ id }) => id === newbornId + ':creator-audit'),
    ).toHaveLength(1);
    expect<readonly AccessGrantRecord[]>(
      creationAfter.grants.filter(({ id }) => id !== newbornId + ':creator-grant'),
    ).toEqual(creationBefore.grants);
    expect<readonly OrganizationAuditRecord[]>(
      creationAfter.audits.filter(({ id }) => id !== newbornId + ':creator-audit'),
    ).toEqual(creationBefore.audits);
    // The first intended missing materialization failure is the real package-qualified reader's WorkPackageStepMissing, after successful birth/authority rows.
    expect(await port.readPackage(seed.organizationId, newbornId)).toEqual({
      chain: {
        level: 'work_package',
        organizationId: seed.organizationId,
        spaceId: seed.spaceId,
        projectId: seed.projectId,
        workPackageId: newbornId,
      },
      steps: expectedSteps,
    });
    expect(await port.readCatalogue(seed.organizationId)).toEqual(catalogueBefore);
    expect(await port.readCatalogue(seed.foreignOrganizationId)).toEqual(foreignCatalogueBefore);
    expect(await port.readPackage(seed.organizationId, seed.workPackageId)).toEqual(existingBefore);
    expect(await port.readPackage(seed.organizationId, seed.siblingWorkPackageId)).toEqual(
      siblingBefore,
    );
    expect(await port.readPackage(seed.foreignOrganizationId, seed.foreignWorkPackageId)).toEqual(
      foreignBefore,
    );
    outcome = { ok: true };
  } catch (cause: unknown) {
    outcome = { ok: false, cause };
  }
  try {
    await source.close();
  } catch (cleanup: unknown) {
    if (!outcome.ok)
      throw new AggregateError(
        [outcome.cause, cleanup],
        'memory catalogue birth assertion and source close failed',
        { cause: cleanup },
      );
    throw cleanup;
  }
  if (!outcome.ok) throw outcome.cause;
});
