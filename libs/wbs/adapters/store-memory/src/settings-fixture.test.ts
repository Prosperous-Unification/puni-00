import { prepareWorkPackageBirth } from '@wbs/core/module/work-package/work-package-birth';
import { resolveSetting } from '@wbs/domain';
import { expect, it } from 'bun:test';

import { openMemorySourceFixture } from './source';

const ACTOR = 'settings-author';
const ORGANIZATION = 'settings-organization';
const PROJECT = 'settings-project';
const SPACE = 'settings-space';
const STAMP = { by: ACTOR, at: 20 };

async function withinSettings(
  use: (fixture: ReturnType<typeof openMemorySourceFixture>, packageId: string) => Promise<void>,
) {
  const fixture = openMemorySourceFixture();
  const { source } = fixture;
  let primary: { cause: unknown } | null = null;
  try {
    fixture.addOrganization(ORGANIZATION, { legacy: true });
    await source.stores.users.create(
      { id: ACTOR, username: ACTOR, passwordHash: null, createdAt: 1 },
      STAMP,
    );
    fixture.seedPackageParent({
      id: PROJECT,
      organizationId: ORGANIZATION,
      name: 'Settings project',
      revision: 0,
      createdAt: 1,
      updatedAt: null,
      createdBy: ACTOR,
      spaceId: null,
      spacePosition: null,
    });
    const spaces = source.stores.spaces;
    if (spaces === undefined) throw new Error('memory fixture omitted its actual space store');
    expect(
      await spaces.create(
        { id: SPACE, organizationId: ORGANIZATION, name: 'Settings space' },
        STAMP,
      ),
    ).toMatchObject({ ok: true });
    expect(await spaces.addProject(ORGANIZATION, SPACE, PROJECT, null, STAMP)).toEqual({
      ok: true,
      position: 10,
    });
    const birth = prepareWorkPackageBirth('Settings package', PROJECT, STAMP, () =>
      crypto.randomUUID(),
    );
    const created = await source.stores.workPackages.create(birth.workPackage, birth.steps, STAMP);
    if (typeof created === 'string') throw new Error('settings fixture birth refused: ' + created);
    await use(fixture, created.id);
  } catch (cause) {
    primary = { cause };
  }
  let cleanup: { cause: unknown } | null = null;
  try {
    await source.close();
  } catch (cause) {
    cleanup = { cause };
  }
  if (primary !== null && cleanup !== null)
    throw new AggregateError(
      [primary.cause, cleanup.cause],
      'settings fixture failed and its source close failed',
      { cause: primary.cause },
    );
  if (primary !== null) throw primary.cause;
  if (cleanup !== null)
    throw new Error('settings fixture source close failed', { cause: cleanup.cause });
}

it('projects inherited memory settings from the actual four-level chain and refuses a package factor override', async () => {
  await withinSettings(async ({ source }, packageId) => {
    const settings = source.stores.settings;
    const organization = await settings.readTarget(
      { level: 'organization', id: ORGANIZATION },
      ORGANIZATION,
    );
    const space = await settings.readTarget({ level: 'space', id: SPACE }, ORGANIZATION);
    const project = await settings.readTarget({ level: 'project', id: PROJECT }, ORGANIZATION);
    const target = await settings.readTarget(
      { level: 'work_package', id: packageId },
      ORGANIZATION,
    );
    if (organization === null || space === null || project === null || target === null)
      throw new Error('actual settings fixture target is absent');
    expect(target.chain).toEqual({
      level: 'work_package',
      organizationId: ORGANIZATION,
      spaceId: SPACE,
      projectId: PROJECT,
      workPackageId: packageId,
    });
    expect(
      await settings.write(organization, { key: 'timezone', value: 'Europe/Kyiv' }, STAMP),
    ).toEqual({ ok: true });
    expect(await settings.write(space, { key: 'timezone', value: 'Europe/Paris' }, STAMP)).toEqual({
      ok: true,
    });
    expect(
      await settings.write(
        project,
        { key: 'pertWeights', value: { optimistic: 2, realistic: 3, pessimistic: 4 } },
        STAMP,
      ),
    ).toEqual({ ok: true });
    expect(await settings.write(project, { key: 'budgetFactor', value: 1.5 }, STAMP)).toEqual({
      ok: true,
    });
    const captured = await settings.capture(target);
    expect(resolveSetting(target.chain, 'timezone', captured)).toEqual({
      value: 'Europe/Paris',
      provenance: { level: 'space', id: SPACE },
    });
    expect((await source.stores.workPackages.findById(packageId))?.pertWeights).toEqual({
      optimistic: 2,
      realistic: 3,
      pessimistic: 4,
    });
    expect((await source.stores.workPackages.findById(packageId))?.budgetFactor).toBe(1.5);
    expect(await settings.write(target, { key: 'budgetFactor', value: 3 }, STAMP)).toEqual({
      ok: false,
      reason: 'not_overridable_here',
      key: 'budgetFactor',
      level: 'work_package',
    });
    expect((await source.stores.workPackages.findById(packageId))?.budgetFactor).toBe(1.5);
    expect(await settings.write(target, { key: 'timezone', value: 'UTC' }, STAMP)).toEqual({
      ok: true,
    });
    expect(await source.stores.workPackages.timezoneOf(packageId)).toBe('UTC');
    expect(await settings.write(target, { key: 'timezone', value: null }, STAMP)).toEqual({
      ok: true,
    });
    expect(await source.stores.workPackages.timezoneOf(packageId)).toBe('Europe/Paris');
  });
});

it('discards refused memory setting writes and detaches captured values from later writes', async () => {
  await withinSettings(async ({ source }, packageId) => {
    const target = await source.stores.settings.readTarget(
      { level: 'work_package', id: packageId },
      ORGANIZATION,
    );
    if (target === null) throw new Error('actual package settings target is absent');
    const before = await source.stores.settings.capture(target);
    await source.uow.run(async (scope) => {
      const project = await scope.stores.settings.readTarget(
        { level: 'project', id: PROJECT },
        ORGANIZATION,
      );
      if (project === null) throw new Error('borrowed project target is absent');
      expect(
        await scope.stores.settings.write(project, { key: 'budgetFactor', value: 4 }, STAMP),
      ).toEqual({ ok: true });
      expect(
        resolveSetting(project.chain, 'budgetFactor', await scope.stores.settings.capture(project))
          .value,
      ).toBe(4);
      return { commit: false, value: undefined };
    });
    expect((await source.stores.workPackages.findById(packageId))?.budgetFactor).toBe(1);
    const project = await source.stores.settings.readTarget(
      { level: 'project', id: PROJECT },
      ORGANIZATION,
    );
    if (project === null) throw new Error('actual project target is absent');
    expect(
      await source.stores.settings.write(project, { key: 'budgetFactor', value: 2 }, STAMP),
    ).toEqual({ ok: true });
    expect(resolveSetting(target.chain, 'budgetFactor', before).value).toBe(1);
    expect((await source.stores.workPackages.findById(packageId))?.budgetFactor).toBe(2);
  });
});

it('clears only the deleted space live overrides and resolves its detached project through the remaining actual ancestors', async () => {
  await withinSettings(async ({ source }, packageId) => {
    const space = await source.stores.settings.readTarget(
      { level: 'space', id: SPACE },
      ORGANIZATION,
    );
    if (space === null) throw new Error('actual settings space is absent');
    expect(
      await source.stores.settings.write(space, { key: 'timezone', value: 'Europe/Paris' }, STAMP),
    ).toEqual({ ok: true });
    expect(await source.stores.workPackages.timezoneOf(packageId)).toBe('Europe/Paris');
    const spaces = source.stores.spaces;
    if (spaces === undefined) throw new Error('memory fixture omitted its actual spaces');
    expect(await spaces.remove(ORGANIZATION, SPACE, STAMP)).toBe(true);
    expect(
      await source.stores.settings.readTarget({ level: 'space', id: SPACE }, ORGANIZATION),
    ).toBeNull();
    const target = await source.stores.settings.readTarget(
      { level: 'work_package', id: packageId },
      ORGANIZATION,
    );
    if (target === null) throw new Error('detached package target is absent');
    expect(target.chain.spaceId).toBeNull();
    expect(await source.stores.workPackages.timezoneOf(packageId)).toBe('UTC');
  });
});
