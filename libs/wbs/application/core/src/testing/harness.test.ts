import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { describe, expect, it } from 'bun:test';

import { createTestServices } from './harness';
import { createLegacyWorkPackageFixture } from './legacy-work-package-fixture';

const PROJECT_ID = 'caller-fixture-parent';
const OWNER = 'owner-account';
const STAMP = { at: 1, by: OWNER };
const RAM = 'resource-ram';

/** A work package with one leaf and a declared resource, over the harness's own stores. */
async function seeded() {
  const plan = createTestServices(
    (await createLegacyWorkPackageFixture(OWNER, 'caller-legacy', PROJECT_ID)).source,
    {},
  );
  const workPackage = workPackageRow({ id: crypto.randomUUID(), projectId: PROJECT_ID });
  await plan.stores.workPackages.create(workPackage, [], STAMP);
  const added = await plan.stores.directory.addResource(
    { id: RAM, name: 'ram', kind: 'divisible', unitLabel: 'GB' },
    STAMP,
  );
  if (!added.ok) throw new Error('the resource was refused');
  const created = await plan.service.create(workPackage.id, OWNER, {
    parentId: null,
    afterId: null,
    name: 'Build',
  });
  if (!created.ok) throw new Error(`create failed: ${created.reason}`);
  return { plan, workPackageId: workPackage.id, leafId: created.value.id };
}

describe('the in-memory harness', () => {
  // The probe PR #585's review wrote: a harness that kept a removed row's
  // demands would hand them back to a row put back without them, so a test
  // over it could pass where production (SQLite's cascade) loses them.
  it('takes a removed row’s demands, so a row put back without them reads none', async () => {
    const { plan, workPackageId, leafId } = await seeded();
    const { workItems, demands } = plan.stores;
    expect(await demands.set(leafId, RAM, 4, STAMP)).toBe('written');
    const row = (await workItems.listByWorkPackage(workPackageId)).find(({ id }) => id === leafId);
    if (row === undefined) throw new Error('the leaf is not stored');
    await workItems.remove([leafId], [], STAMP);
    expect(await demands.listByWorkPackage(workPackageId)).toEqual([]);
    // The row alone, as an undo that carried no demands would write it.
    await workItems.insert(row, [], STAMP);
    expect(await demands.listByWorkPackage(workPackageId)).toEqual([]);
  });

  it('puts a deleted row’s demands back through the journal, and takes them on redo', async () => {
    const { plan, workPackageId, leafId } = await seeded();
    const { service, stores } = plan;
    expect(await service.setDemand(leafId, OWNER, RAM, 4)).toMatchObject({ ok: true });
    const stated = [{ workItemId: leafId, resourceId: RAM, units: 4 }];
    expect(await service.remove(leafId, OWNER, null, { kind: 'legacy' })).toMatchObject({
      ok: true,
    });
    expect(await stores.demands.listByWorkPackage(workPackageId)).toEqual([]);
    expect(await service.undo(workPackageId, OWNER)).toMatchObject({ ok: true });
    expect(await stores.demands.listByWorkPackage(workPackageId)).toEqual(stated);
    expect(await service.redo(workPackageId, OWNER)).toMatchObject({ ok: true });
    expect(await stores.demands.listByWorkPackage(workPackageId)).toEqual([]);
  });
});

it('declared actual legacy fixture refuses an unknown parent without creating a package', async () => {
  const owned = await createLegacyWorkPackageFixture(OWNER, 'caller-legacy', PROJECT_ID);
  try {
    expect(await owned.source.stores.users.findById(OWNER)).not.toBeNull();
    const before = await owned.workPackages.list();
    expect(
      await owned.workPackages.create(
        workPackageRow({ projectId: 'undeclared-parent' }),
        [],
        STAMP,
      ),
    ).toBe('not_found');
    expect(await owned.workPackages.list()).toEqual(before);
  } finally {
    await owned.source.close();
  }
});
it('legacy fixture refuses empty declared identities before creating state', async () => {
  for (const inputs of [
    ['', 'org', 'parent'],
    ['actor', '', 'parent'],
    ['actor', 'org', ''],
  ] as const) {
    const failure = await createLegacyWorkPackageFixture(inputs[0], inputs[1], inputs[2]).then(
      () => 'unexpected success',
      (cause: unknown) => cause,
    );
    expect(failure).toBeInstanceOf(Error);
    if (!(failure instanceof Error))
      throw new Error('empty fixture identity unexpectedly accepted');
    expect(failure.message).toBe(
      'legacy fixture requires explicit actor, organization and project identities',
    );
  }
});
