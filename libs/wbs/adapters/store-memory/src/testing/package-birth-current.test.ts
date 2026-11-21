import type { TransactionalStores } from '@wbs/core';
import { expect, test } from 'bun:test';

import { openMemorySourceFixture } from '../source';
import { workPackageRow } from '../work-package-fixture';

const organizationId = 'birth-legacy-org';
const projectId = 'birth-project';
const stamp = { at: 1, by: 'birth-owner' };

async function rejectionMessage(pending: Promise<unknown>): Promise<string> {
  return await pending.then(
    () => 'returned',
    (cause: unknown) => String(cause),
  );
}

async function openBirthSource() {
  const fixture = openMemorySourceFixture();
  fixture.addOrganization(organizationId, { legacy: true });
  fixture.seedPackageParent({
    id: projectId,
    organizationId,
    name: 'Birth project',
    revision: 0,
    createdAt: 1,
    createdBy: null,
    updatedAt: null,
    spaceId: null,
    spacePosition: null,
  });
  const source = fixture.source;
  await source.stores.users.create(
    {
      id: stamp.by,
      username: 'birth-owner',
      passwordHash: 'x',
      createdAt: 1,
    },
    stamp,
  );
  const bound = await source.stores.stepCatalogue.defineAndBindStep(
    organizationId,
    {
      id: 'birth-dev',
      code: 'dev',
      name: 'Development',
      position: 10,
      defaultEstimateUnit: 'minutes',
      defaultAllowancePercent: 12.5,
    },
    {
      bindingId: 'birth-dev-binding',
      scopeKind: 'project',
      scopeId: projectId,
      workItemTypeId: null,
      position: 10,
    },
    stamp,
  );
  expect(bound.ok).toBe(true);
  return { source, fixture };
}

test('birth fixture value corruption removes only the addressed set and names absence', async () => {
  const { source, fixture } = await openBirthSource();
  try {
    for (const id of ['birth-corruption', 'birth-corruption-sibling'])
      await source.stores.workPackages.create(
        workPackageRow({ id, projectId, name: id }),
        [],
        stamp,
      );
    const before = fixture.stepCatalogueEvidence().packageValues;
    expect(fixture.removePackageStepValues('birth-corruption')).toBe(1);
    expect(fixture.stepCatalogueEvidence().packageValues).toEqual(
      before.filter(({ workPackageId }) => workPackageId !== 'birth-corruption'),
    );
    expect(() => fixture.removePackageStepValues('birth-corruption')).toThrow(
      'explicit values set is absent',
    );
    expect(() => fixture.removePackageStepValues('absent-package')).toThrow(
      'explicit values set is absent',
    );
  } finally {
    await source.close();
  }
});

test('birth fixture value corruption rejects a closed Source without changing storage', async () => {
  const { source, fixture } = await openBirthSource();
  try {
    await source.stores.workPackages.create(
      workPackageRow({ id: 'birth-corruption-closed', projectId }),
      [],
      stamp,
    );
    const before = fixture.stepCatalogueEvidence();
    await source.close();
    expect(() => fixture.removePackageStepValues('birth-corruption-closed')).toThrow(
      'memory source is closed',
    );
    expect(fixture.stepCatalogueEvidence()).toEqual(before);
  } finally {
    await source.close();
  }
});

test('legacy Source package birth materializes current resolved values instead of legacy starting definitions', async () => {
  const { source, fixture } = await openBirthSource();
  try {
    const before = await source.stores.stepCatalogue.readCatalogue(organizationId);
    const authority = fixture.packageCreationEvidence();
    const created = await source.stores.workPackages.create(
      workPackageRow({ id: 'birth-package', projectId }),
      [],
      stamp,
    );
    expect(typeof created).toBe('object');
    const selected = await source.stores.stepCatalogue.readPackage(organizationId, 'birth-package');
    expect(selected?.steps).toEqual([
      {
        stepId: 'birth-dev',
        code: 'dev',
        name: 'Development',
        estimateUnit: 'minutes',
        allowancePercent: 12.5,
        allowanceRevision: 0,
        via: [
          {
            bindingId: 'birth-dev-binding',
            scopeKind: 'project',
            scopeId: projectId,
            workItemTypeId: null,
          },
        ],
      },
    ]);
    expect(await source.stores.stepCatalogue.readCatalogue(organizationId)).toEqual(before);
    expect(await source.stores.workItems.listByWorkPackage('birth-package')).toEqual([]);
    expect(fixture.packageCreationEvidence()).toEqual(authority);
  } finally {
    await source.close();
  }
});

test('legacy Source package birth rolls back package and explicit values under its real loan', async () => {
  const { source } = await openBirthSource();
  let expired: TransactionalStores['workPackages'] | undefined;
  try {
    await source.uow.run(async ({ stores }) => {
      expired = stores.workPackages;
      await stores.workPackages.create(workPackageRow({ id: 'birth-abort', projectId }), [], stamp);
      expect(
        (await stores.stepCatalogue.readPackage(organizationId, 'birth-abort'))?.steps,
      ).toHaveLength(1);
      return { commit: false, value: undefined };
    });
    expect(await source.stores.workPackages.findById('birth-abort')).toBeNull();
    expect(await source.stores.stepCatalogue.readPackage(organizationId, 'birth-abort')).toBeNull();
    if (expired === undefined) throw Error('birth loan was not captured');
    expect(
      await rejectionMessage(
        expired.create(workPackageRow({ id: 'birth-expired', projectId }), [], stamp),
      ),
    ).toContain('loan is closed');
    expect(await source.stores.workPackages.findById('birth-expired')).toBeNull();
  } finally {
    await source.close();
  }
});

test('legacy Source package birth captures bindings authored during its raw settings awaits', async () => {
  const { source } = await openBirthSource();
  try {
    await source.uow.run(async ({ stores }) => {
      const pending = stores.workPackages.create(
        workPackageRow({ id: 'birth-current', projectId }),
        [],
        stamp,
      );
      const added = await stores.stepCatalogue.defineAndBindStep(
        organizationId,
        {
          id: 'birth-late',
          code: 'late',
          name: 'Late definition',
          position: 20,
          defaultEstimateUnit: 'workdays',
          defaultAllowancePercent: 7,
        },
        {
          bindingId: 'birth-late-binding',
          scopeKind: 'organization',
          scopeId: organizationId,
          workItemTypeId: null,
          position: 20,
        },
        stamp,
      );
      expect(added.ok).toBe(true);
      const created = await pending;
      expect(typeof created).toBe('object');
      const selected = await stores.stepCatalogue.readPackage(organizationId, 'birth-current');
      expect(selected?.steps.map((step) => step.stepId)).toEqual(['birth-late', 'birth-dev']);
      return { commit: true, value: undefined };
    });
    expect(
      (await source.stores.stepCatalogue.readPackage(organizationId, 'birth-current'))?.steps,
    ).toHaveLength(2);
  } finally {
    await source.close();
  }
});

test('legacy Source rejects package birth after close', async () => {
  const { source } = await openBirthSource();
  await source.close();
  expect(
    await rejectionMessage(
      source.stores.workPackages.create(
        workPackageRow({ id: 'birth-closed', projectId }),
        [],
        stamp,
      ),
    ),
  ).toContain('memory source is closed');
});

test('legacy Source repair birth keeps explicit values and rejects the expired repair loan', async () => {
  const { source } = await openBirthSource();
  let expired: TransactionalStores['workPackages'] | undefined;
  try {
    await source.uow.run<undefined>(() =>
      Promise.resolve({
        commit: false,
        value: undefined,
        afterRollback: async ({ stores }) => {
          expired = stores.workPackages;
          await stores.workPackages.create(
            workPackageRow({ id: 'birth-repair', projectId }),
            [],
            stamp,
          );
          expect(
            (await stores.stepCatalogue.readPackage(organizationId, 'birth-repair'))?.steps,
          ).toHaveLength(1);
        },
      }),
    );
    expect(
      (await source.stores.stepCatalogue.readPackage(organizationId, 'birth-repair'))?.steps,
    ).toHaveLength(1);
    if (expired === undefined) throw Error('repair loan was not captured');
    expect(
      await rejectionMessage(
        expired.create(workPackageRow({ id: 'birth-repair-expired', projectId }), [], stamp),
      ),
    ).toContain('repair loan is closed');
    expect(await source.stores.workPackages.findById('birth-repair-expired')).toBeNull();
  } finally {
    await source.close();
  }
});

test('legacy Source birth observes close during its raw settings preparation', async () => {
  const { source } = await openBirthSource();
  const entered = Promise.withResolvers<undefined>();
  let observed: { kind: 'returned' } | { kind: 'rejected'; cause: unknown } | undefined;
  const turn = source.uow.run(async ({ stores }) => {
    const pending = stores.workPackages.create(
      workPackageRow({ id: 'birth-interrupted', projectId }),
      [],
      stamp,
    );
    entered.resolve(undefined);
    observed = await pending.then(
      () => ({ kind: 'returned' as const }),
      (cause: unknown) => ({ kind: 'rejected' as const, cause }),
    );
    return { commit: false, value: undefined };
  });
  await entered.promise;
  const closing = source.close();
  expect(await rejectionMessage(turn)).toContain('memory source is closed');
  await closing;
  expect(observed?.kind).toBe('rejected');
  if (observed?.kind !== 'rejected') throw Error('birth returned after Source close');
  expect(String(observed.cause)).toContain('memory source is closed');
});

test('legacy Source birth retains caller fields before waiting behind another write', async () => {
  const { source } = await openBirthSource();
  const entered = Promise.withResolvers<undefined>(),
    release = Promise.withResolvers<undefined>();
  const blocker = source.uow.run(async () => {
    entered.resolve(undefined);
    await release.promise;
    return { commit: false, value: undefined };
  });
  try {
    await entered.promise;
    const workPackage = workPackageRow({ id: 'birth-retained', projectId });
    const act = { ...stamp };
    const pending = source.stores.workPackages.create(workPackage, [], act);
    workPackage.name = 'caller mutation';
    workPackage.projectId = 'absent-project';
    act.by = 'absent-account';
    release.resolve(undefined);
    await blocker;
    const created = await pending;
    if (typeof created === 'string') throw Error('retained birth refused: ' + created);
    expect(created.name).toBe('Rewire the shed');
    expect(created.projectId).toBe(projectId);
    expect(
      (await source.stores.stepCatalogue.readPackage(organizationId, 'birth-retained'))?.steps,
    ).toHaveLength(1);
  } finally {
    release.resolve(undefined);
    await blocker;
    await source.close();
  }
});
