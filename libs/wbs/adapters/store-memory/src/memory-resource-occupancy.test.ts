import type { TransactionalStores } from '@wbs/core';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { expect, it } from 'bun:test';

import { projectRow } from './project-fixture';
import { openMemorySourceFixture } from './source';

const organizationId = 'occupancy-org';
const actorId = 'occupancy-admin';
const personId = 'occupancy-person';
const resourceId = 'occupancy-ram';
const stamp = { at: 57, by: actorId };

async function openInventory() {
  const fixture = openMemorySourceFixture();
  const { source } = fixture;
  await source.stores.users.create(
    { id: actorId, username: actorId, passwordHash: 'fixture', createdAt: stamp.at },
    stamp,
  );
  fixture.addOrganization(organizationId, { legacy: false });
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
  const inventory = source.resourceOccupancy;
  if (inventory === undefined) throw new Error('memory source has no occupancy observation');
  return {
    source,
    read: () =>
      inventory.readResourceOccupancyWithin(resourceId, actorId, {
        organizationId,
        userId: actorId,
        role: 'admin',
      }),
  };
}

function createScopedProject(projects: TransactionalStores['projects'], projectId: string) {
  return projects.createInOrganization(
    projectRow({ id: projectId, name: projectId, ownerId: actorId }),
    [
      {
        id: `step-${projectId}`,
        projectId,
        name: 'Dev',
        code: 'dev',
        allowancePercent: 0,
        estimateUnit: 'workdays',
        position: 1,
      },
    ],
    stamp,
    organizationId,
  );
}

async function writeHolding(stores: TransactionalStores, projectId: string) {
  const workItemId = `leaf-${projectId}`;
  const claimId = `claim-${projectId}`;
  await stores.workItems.insert(workItemRow({ id: workItemId, projectId }), [], stamp);
  expect(
    await stores.claims.add(
      [
        {
          id: claimId,
          workItemId,
          stepId: `step-${projectId}`,
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

async function expectOwnedHolding(stores: TransactionalStores, projectId: string) {
  expect(await stores.projects.findInOrganization(projectId, organizationId)).toMatchObject({
    id: projectId,
  });
  expect(await stores.claims.organizationOccupancyOf([resourceId])).toContainEqual({
    claimId: `claim-${projectId}`,
    workItemId: `leaf-${projectId}`,
    personId,
    runId: null,
    resourceId,
    units: 8,
    projectId,
    organizationId,
  });
}

it('inventories a directly created scoped project without ownership backfill', async () => {
  const { source, read } = await openInventory();
  try {
    const projectId = 'direct-project';
    expect(await createScopedProject(source.stores.projects, projectId)).toMatchObject({
      id: projectId,
    });
    await writeHolding(source.stores, projectId);
    await expectOwnedHolding(source.stores, projectId);
    expect(await read()).toMatchObject({
      ok: true,
      value: {
        occupied: 8,
        projects: [{ projectId, claims: [{ claimId: `claim-${projectId}` }] }],
      },
    });
  } finally {
    await source.close();
  }
});

it('publishes a staged scoped project and its ownership together', async () => {
  const { source, read } = await openInventory();
  try {
    const projectId = 'committed-project';
    await source.uow.run(async ({ stores }) => {
      expect(await createScopedProject(stores.projects, projectId)).toMatchObject({
        id: projectId,
      });
      await writeHolding(stores, projectId);
      await expectOwnedHolding(stores, projectId);
      return { commit: true, value: undefined };
    });
    await expectOwnedHolding(source.stores, projectId);
    expect(await read()).toMatchObject({
      ok: true,
      value: { occupied: 8, projects: [{ projectId }] },
    });
  } finally {
    await source.close();
  }
});

it('discards a refused scoped project, holding and ownership together', async () => {
  const { source, read } = await openInventory();
  try {
    const projectId = 'refused-project';
    await source.uow.run(async ({ stores }) => {
      expect(await createScopedProject(stores.projects, projectId)).toMatchObject({
        id: projectId,
      });
      await writeHolding(stores, projectId);
      await expectOwnedHolding(stores, projectId);
      return { commit: false, value: undefined };
    });
    expect(await source.stores.projects.findById(projectId)).toBeNull();
    expect(await source.stores.projects.findInOrganization(projectId, organizationId)).toBeNull();
    expect(await source.stores.claims.organizationOccupancyOf([resourceId])).toEqual([]);
    const replacement = await createScopedProject(source.stores.projects, projectId);
    expect(replacement).toMatchObject({ id: projectId });
    expect(await read()).toMatchObject({ ok: true, value: { occupied: 0, projects: [] } });
  } finally {
    await source.close();
  }
});

it('queues direct scoped project creation behind a staged publication and preserves both holdings', async () => {
  const { source, read } = await openInventory();
  const stagedId = 'first-project';
  const directId = 'second-project';
  const staged = Promise.withResolvers<undefined>();
  const release = Promise.withResolvers<undefined>();
  const batch = source.uow.run(async ({ stores }) => {
    expect(await createScopedProject(stores.projects, stagedId)).toMatchObject({ id: stagedId });
    await writeHolding(stores, stagedId);
    staged.resolve(undefined);
    await release.promise;
    return { commit: true, value: undefined };
  });
  try {
    await Promise.race([staged.promise, batch]);
    const direct = createScopedProject(source.stores.projects, directId);
    try {
      expect(await source.stores.projects.findById(directId)).toBeNull();
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
      value: { occupied: 16, projects: [{ projectId: stagedId }, { projectId: directId }] },
    });
  } finally {
    release.resolve(undefined);
    await source.close();
  }
});

it('orders distinct opaque project and claim ids ordinally', async () => {
  const { source, read } = await openInventory();
  const ids = ['a', '\u00e9', 'Z', 'e\u0301'];
  const ordinal = ['Z', 'a', 'e\u0301', '\u00e9'];
  try {
    for (const id of ids) {
      const projectId = 'project-' + id;
      expect(await createScopedProject(source.stores.projects, projectId)).toMatchObject({
        id: projectId,
      });
      if (id !== 'a') {
        await writeHolding(source.stores, projectId);
        continue;
      }
      for (const [position, claimId] of ids.entries()) {
        const workItemId = 'leaf-' + claimId;
        await source.stores.workItems.insert(
          workItemRow({ id: workItemId, projectId, position: position + 1 }),
          [],
          stamp,
        );
        expect(
          await source.stores.claims.add(
            [
              {
                id: claimId,
                workItemId,
                stepId: 'step-' + projectId,
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
      observed.value.projects.map(({ projectId, claims }) => ({
        projectId,
        claims: claims.map(({ claimId }) => claimId),
      })),
    ).toEqual(
      ordinal.map((id) => ({
        projectId: 'project-' + id,
        claims: id === 'a' ? ordinal : ['claim-project-' + id],
      })),
    );
  } finally {
    await source.close();
  }
});
