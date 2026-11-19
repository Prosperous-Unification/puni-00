import { STEP_CATALOGUE_SEED, type StepCatalogueSeed } from '@wbs/core/testing/step-catalogue-seed';
import { expect } from 'bun:test';

import { type MemorySourceFixture, openMemorySourceFixture } from '../source';
import { workPackageRow } from '../work-package-fixture';

/** Source-owned setup only; it never invokes the catalogue operation being tested. */
export async function openMemoryStepCatalogueSourceFixture(emptyProjectId?:string): Promise<{
  readonly fixture: MemorySourceFixture;
  readonly seed: StepCatalogueSeed;
}> {
  const fixture = openMemorySourceFixture();
  const source = fixture.source,
    seed = STEP_CATALOGUE_SEED;
  try {
    await source.stores.users.create(
      {
        id: seed.stamp.by,
        username: 'catalogue-author',
        passwordHash: 'x',
        createdAt: seed.stamp.at,
      },
      seed.stamp,
    );
    for (const organizationId of [seed.organizationId, seed.foreignOrganizationId]) {
      fixture.addOrganization(organizationId, { legacy: false });
      fixture.setPackageCreationMembers(organizationId, [seed.stamp.by]);
    }
    for (const [id, organizationId] of [
      [seed.projectId, seed.organizationId],
      [seed.siblingProjectId, seed.organizationId],
      [seed.foreignProjectId, seed.foreignOrganizationId],
    ]) {
      fixture.seedPackageParent({
        id,
        organizationId,
        name: id,
        revision: 0,
        createdAt: seed.stamp.at,
        createdBy: seed.stamp.by,
        updatedAt: null,
        spaceId: null,
        spacePosition: null,
      });
    }
    if(emptyProjectId!==undefined)fixture.seedPackageParent({id:emptyProjectId,organizationId:seed.organizationId,name:emptyProjectId,revision:0,createdAt:seed.stamp.at,createdBy:seed.stamp.by,updatedAt:null,spaceId:null,spacePosition:null});
    const spaces = source.stores.spaces;
    if (spaces === undefined) throw new Error('Catalogue source fixture has no real space store');
    expect(
      (
        await spaces.create(
          { id: seed.spaceId, organizationId: seed.organizationId, name: 'Catalogue space' },
          seed.stamp,
        )
      ).ok,
    ).toBe(true);
    expect(
      await spaces.addProject(seed.organizationId, seed.spaceId, seed.projectId, null, seed.stamp),
    ).toEqual({ ok: true, position: 10 });
    if(emptyProjectId!==undefined)expect(await spaces.addProject(seed.organizationId,seed.spaceId,emptyProjectId,seed.projectId,seed.stamp)).toEqual({ok:true,position:20});
    for (const [id, organizationId] of [
      [seed.typeId, seed.organizationId],
      [seed.secondTypeId, seed.organizationId],
      [seed.foreignTypeId, seed.foreignOrganizationId],
    ]) {
      await source.stores.directory.addWorkItemType({ id, name: id }, seed.stamp);
      fixture.ownWorkItemTypeInOrganization(id, organizationId);
    }
    await fixture.activateOrganizationIsolation();
    for (const [id, organizationId, projectId] of [
      [seed.workPackageId, seed.organizationId, seed.projectId],
      [seed.siblingWorkPackageId, seed.organizationId, seed.siblingProjectId],
      [seed.foreignWorkPackageId, seed.foreignOrganizationId, seed.foreignProjectId],
    ]) {
      const created = await source.stores.workPackages.createInOrganization(
        workPackageRow({ id, projectId, name: id }),
        [],
        seed.stamp,
        organizationId,
        { id: id + ':creator-grant', auditId: id + ':creator-audit' },
      );
      expect(typeof created).toBe('object');
      if (typeof created === 'string')
        throw new Error('Catalogue fixture empty package refused: ' + created);
    }
    return { fixture, seed };
  } catch (primary: unknown) {
    try {
      await source.close();
    } catch (cleanup: unknown) {
      throw new AggregateError(
        [primary, cleanup],
        'memory catalogue fixture setup and close failed',
        { cause: cleanup },
      );
    }
    throw primary;
  }
}

/** Adapts the same real source setup; setup and prerequisite failures each close their actual acquired owner once. */
export async function openMemoryStepCatalogueCase<OpenedFixture>(
  caseId: string,
  adaptSource: (
    fixtureId: string,
    source: MemorySourceFixture['source'],
    seed: StepCatalogueSeed,
    close: () => Promise<void>,
    readEvidence: MemorySourceFixture['stepCatalogueEvidence'],
    corruptStepFact:MemorySourceFixture['corruptStepFact'],
  ) => Promise<OpenedFixture>,
  emptyProjectId?:string,
): Promise<OpenedFixture> {
  const { fixture, seed } = await openMemoryStepCatalogueSourceFixture(emptyProjectId);
  const source = fixture.source;
  try {
    return await adaptSource(
      'memory:' + caseId,
      source,
      seed,
      () => source.close(),
      () => fixture.stepCatalogueEvidence(),
      (corruption)=>fixture.corruptStepFact(corruption),
    );
  } catch (primary: unknown) {
    try {
      await source.close();
    } catch (cleanup: unknown) {
      throw new AggregateError(
        [primary, cleanup],
        'memory catalogue fixture setup and close failed',
        { cause: cleanup },
      );
    }
    throw primary;
  }
}
