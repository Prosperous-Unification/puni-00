import type { TransactionalStores } from '@wbs/core';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { expect, it } from 'bun:test';

import { openMemorySourceFixture } from './source';
import { workPackageRow } from './work-package-fixture';

const organizationId = 'occupancy-org';
const actorId = 'occupancy-admin';
const personId = 'occupancy-person';
const resourceId = 'occupancy-ram';
const projectId = 'occupancy-parent';
const stamp = { at: 57, by: actorId };

async function openInventory() {
  const fixture = openMemorySourceFixture();
  const { source } = fixture;
  await source.stores.users.create(
    { id: actorId, username: actorId, passwordHash: 'fixture', createdAt: stamp.at },
    stamp,
  );
  fixture.addOrganization(organizationId, { legacy: false });
  fixture.setPackageCreationMembers(organizationId, [actorId]);
  fixture.seedPackageParent({
    id: projectId,
    organizationId,
    name: 'Occupancy',
    createdBy: actorId,
    revision: 0,
    createdAt: stamp.at,
    updatedAt: null,
    spaceId: null,
    spacePosition: null,
  });
  fixture.seedPackageExportGrant({
    id: 'inventory-role',
    organizationId,
    scope: { kind: 'organization' },
    subject: { kind: 'user', userId: actorId },
    roleId: 'org-admin',
    origin: 'route',
    createdAt: stamp.at,
    createdBy: actorId,
  });
  const defined = await source.stores.stepCatalogue.defineAndBindStep(
    organizationId,
    {
      id: 'development',
      name: 'Dev',
      code: 'dev',
      defaultAllowancePercent: 0,
      defaultEstimateUnit: 'workdays',
      position: 1,
    },
    {
      bindingId: 'development-binding',
      scopeKind: 'project',
      scopeId: projectId,
      workItemTypeId: null,
      position: 1,
    },
    stamp,
  );
  if (!defined.ok) throw new Error('occupancy fixture step refused: ' + defined.reason);
  expect(
    await source.stores.directory.addResource(
      { id: resourceId, name: 'Host RAM', kind: 'divisible', unitLabel: 'GB' },
      stamp,
    ),
  ).toMatchObject({ ok: true });
  fixture.ownResourceInOrganization(resourceId, organizationId);
  expect(
    await source.stores.directory.addPerson(
      { id: personId, name: 'Human Holder', kind: 'person' },
      [],
      stamp,
    ),
  ).toMatchObject({ ok: true });
  fixture.ownPersonInOrganization(personId, organizationId, [actorId]);
  await fixture.activateOrganizationIsolation();
  const inventory = source.resourceOccupancy;
  if (inventory === undefined) throw new Error('memory source has no occupancy observation');
  return {
    source,
    read: () =>
      inventory.readResourceOccupancyWithin(resourceId, actorId, {
        kind: 'scoped',
        scope: { organizationId, userId: actorId, cap: null },
        principal: { id: actorId },
      }),
  };
}

function createScopedPackage(
  workPackages: TransactionalStores['workPackages'],
  workPackageId: string,
) {
  return workPackages.createInOrganization(
    workPackageRow({ id: workPackageId, name: workPackageId, projectId }),
    [],
    stamp,
    organizationId,
    { id: workPackageId + '-grant', auditId: workPackageId + '-audit' },
  );
}

async function readStepId(
  workPackages: TransactionalStores['workPackages'],
  workPackageId: string,
) {
  const step = (await workPackages.stepsOf(workPackageId)).at(0);
  if (step === undefined) throw new Error('occupancy fixture package has no bound step');
  return step.id;
}

async function writeHolding(stores: TransactionalStores, workPackageId: string) {
  const workItemId = `leaf-${workPackageId}`;
  const claimId = `claim-${workPackageId}`;
  const stepId = await readStepId(stores.workPackages, workPackageId);
  await stores.workItems.insert(workItemRow({ id: workItemId, workPackageId }), [], stamp);
  expect(
    await stores.claims.add(
      [
        {
          id: claimId,
          workItemId,
          stepId,
          personId,
          runId: null,
          parentClaimId: null,
          accountId: actorId,
        },
      ],
      [],
      stamp,
      [{ claimId, resourceId, units: 8 }],
    ),
  ).toBe('written');
}

async function expectOwnedHolding(stores: TransactionalStores, workPackageId: string) {
  expect(await stores.workPackages.findInOrganization(workPackageId, organizationId)).toMatchObject(
    {
      id: workPackageId,
    },
  );
  expect(await stores.claims.organizationOccupancyOf([resourceId])).toContainEqual({
    claimId: `claim-${workPackageId}`,
    workItemId: `leaf-${workPackageId}`,
    personId,
    runId: null,
    resourceId,
    units: 8,
    workPackageId,
    organizationId,
  });
}

it('inventories a directly created scoped work package without ownership backfill', async () => {
  const { source, read } = await openInventory();
  try {
    const workPackageId = 'direct-package';
    expect(await createScopedPackage(source.stores.workPackages, workPackageId)).toMatchObject({
      id: workPackageId,
    });
    await writeHolding(source.stores, workPackageId);
    await expectOwnedHolding(source.stores, workPackageId);
    expect(await read()).toMatchObject({
      ok: true,
      value: {
        occupied: 8,
        workPackages: [{ workPackageId, claims: [{ claimId: `claim-${workPackageId}` }] }],
      },
    });
  } finally {
    await source.close();
  }
});

it('publishes a staged scoped work package and its ownership together', async () => {
  const { source, read } = await openInventory();
  try {
    const workPackageId = 'committed-package';
    await source.uow.run(async ({ stores }) => {
      expect(await createScopedPackage(stores.workPackages, workPackageId)).toMatchObject({
        id: workPackageId,
      });
      await writeHolding(stores, workPackageId);
      await expectOwnedHolding(stores, workPackageId);
      return { commit: true, value: undefined };
    });
    await expectOwnedHolding(source.stores, workPackageId);
    expect(await read()).toMatchObject({
      ok: true,
      value: { occupied: 8, workPackages: [{ workPackageId }] },
    });
  } finally {
    await source.close();
  }
});

it('discards a refused scoped work package, holding and ownership together', async () => {
  const { source, read } = await openInventory();
  try {
    const workPackageId = 'refused-package';
    await source.uow.run(async ({ stores }) => {
      expect(await createScopedPackage(stores.workPackages, workPackageId)).toMatchObject({
        id: workPackageId,
      });
      await writeHolding(stores, workPackageId);
      await expectOwnedHolding(stores, workPackageId);
      return { commit: false, value: undefined };
    });
    expect(await source.stores.workPackages.findById(workPackageId)).toBeNull();
    expect(
      await source.stores.workPackages.findInOrganization(workPackageId, organizationId),
    ).toBeNull();
    expect(await source.stores.claims.organizationOccupancyOf([resourceId])).toEqual([]);
    const replacement = await createScopedPackage(source.stores.workPackages, workPackageId);
    expect(replacement).toMatchObject({ id: workPackageId });
    expect(await read()).toMatchObject({ ok: true, value: { occupied: 0, workPackages: [] } });
  } finally {
    await source.close();
  }
});

it('queues direct scoped work package creation behind a staged publication and preserves both holdings', async () => {
  const { source, read } = await openInventory();
  const stagedId = 'first-package';
  const directId = 'second-package';
  const staged = Promise.withResolvers<undefined>();
  const release = Promise.withResolvers<undefined>();
  const batch = source.uow.run(async ({ stores }) => {
    expect(await createScopedPackage(stores.workPackages, stagedId)).toMatchObject({
      id: stagedId,
    });
    await writeHolding(stores, stagedId);
    staged.resolve(undefined);
    await release.promise;
    return { commit: true, value: undefined };
  });
  try {
    await Promise.race([staged.promise, batch]);
    const direct = createScopedPackage(source.stores.workPackages, directId);
    try {
      expect(await source.stores.workPackages.findById(directId)).toBeNull();
    } finally {
      release.resolve(undefined);
      await batch;
      expect(await direct).toMatchObject({ id: directId });
    }
    await writeHolding(source.stores, directId);
    await expectOwnedHolding(source.stores, stagedId);
    await expectOwnedHolding(source.stores, directId);
    expect(await read()).toMatchObject({
      ok: true,
      value: {
        occupied: 16,
        workPackages: [{ workPackageId: stagedId }, { workPackageId: directId }],
      },
    });
  } finally {
    release.resolve(undefined);
    await source.close();
  }
});

it('orders distinct opaque work package and claim ids ordinally', async () => {
  const { source, read } = await openInventory();
  const ids = ['a', '\u00e9', 'Z', 'e\u0301'];
  const ordinal = ['Z', 'a', 'e\u0301', '\u00e9'];
  try {
    for (const id of ids) {
      const workPackageId = 'package-' + id;
      expect(await createScopedPackage(source.stores.workPackages, workPackageId)).toMatchObject({
        id: workPackageId,
      });
      if (id !== 'a') {
        await writeHolding(source.stores, workPackageId);
        continue;
      }
      const stepId = await readStepId(source.stores.workPackages, workPackageId);
      for (const [position, claimId] of ids.entries()) {
        const workItemId = 'leaf-' + claimId;
        await source.stores.workItems.insert(
          workItemRow({ id: workItemId, workPackageId, position: position + 1 }),
          [],
          stamp,
        );
        expect(
          await source.stores.claims.add(
            [
              {
                id: claimId,
                workItemId,
                stepId,
                personId,
                runId: null,
                parentClaimId: null,
                accountId: actorId,
              },
            ],
            [],
            stamp,
            [{ claimId, resourceId, units: 1 }],
          ),
        ).toBe('written');
      }
    }
    const observed = await read();
    if (!observed.ok) throw new Error('the owned fixture inventory was refused');
    expect(
      observed.value.workPackages.map(({ workPackageId, claims }) => ({
        workPackageId,
        claims: claims.map(({ claimId }) => claimId),
      })),
    ).toEqual(
      ordinal.map((id) => ({
        workPackageId: 'package-' + id,
        claims: id === 'a' ? ordinal : ['claim-package-' + id],
      })),
    );
  } finally {
    await source.close();
  }
});
