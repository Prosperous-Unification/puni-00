import type { SettingStore, TransactionalStores, UnitOfWork } from '@wbs/core';
import { resolveSetting } from '@wbs/domain';
import { expect } from 'bun:test';

import type { CaseRegistration } from '../case-manifest';
import type { CaseFixture, SeededPlan } from '../source-declaration';
import { type OpenCase, storeCase } from './store-case';

const ORGANIZATION = 'fixture-legacy-org';
const PROJECT = 'fixture-project';
const SPACE = 'settings-conformance-space';

/** Uses the existing seeded source's real space and marker writers; creates no authority. */
export async function seedSettingCase(
  stores: TransactionalStores,
  seed: SeededPlan,
): Promise<void> {
  const spaces = stores.spaces;
  if (spaces === undefined)
    throw new Error('settings conformance requires the fixture space store');
  expect(
    await spaces.create(
      { id: SPACE, organizationId: ORGANIZATION, name: 'Settings conformance' },
      seed.stamps[0],
    ),
  ).toMatchObject({ ok: true });
  expect(await spaces.addProject(ORGANIZATION, SPACE, PROJECT, null, seed.stamps[0])).toEqual({
    ok: true,
    position: 10,
  });
  for (const [index, workPackageId] of seed.workPackageIds.entries()) {
    expect(
      await stores.calendarMarkers.create({
        id: 'settings-marker-' + String(index),
        workPackageId,
        date: '2026-11-15',
        name: 'Settings marker',
        color: null,
        createdAt: 100,
      }),
    ).toMatchObject({ ok: true });
  }
}

async function readSettingTargets(port: SettingStore, seed: SeededPlan) {
  const organization = await port.readTarget(
    { level: 'organization', id: ORGANIZATION },
    ORGANIZATION,
  );
  const space = await port.readTarget({ level: 'space', id: SPACE }, ORGANIZATION);
  const project = await port.readTarget({ level: 'project', id: PROJECT }, ORGANIZATION);
  const workPackage = await port.readTarget(
    { level: 'work_package', id: seed.workPackageIds[0] },
    ORGANIZATION,
  );
  if (organization === null || space === null || project === null || workPackage === null)
    throw new Error('seeded settings target is absent');
  return { organization, space, project, workPackage };
}

type SettingAssertion = (fixture: CaseFixture<SettingStore>) => Promise<void>;

/** Shared actual settings assertions, run independently on each source-owned fixture. */
export const SETTINGS_ASSERTIONS = [
  {
    caseId: 'settings.readTarget:actual-chain-and-scope',
    assert: async ({ port, seed }: CaseFixture<SettingStore>) => {
      const targets = await readSettingTargets(port, seed);
      expect(targets).toEqual({
        organization: {
          kind: 'organization',
          chain: { level: 'organization', organizationId: ORGANIZATION },
        },
        space: {
          kind: 'space',
          chain: { level: 'space', organizationId: ORGANIZATION, spaceId: SPACE },
        },
        project: {
          kind: 'project',
          chain: {
            level: 'project',
            organizationId: ORGANIZATION,
            spaceId: SPACE,
            projectId: PROJECT,
          },
        },
        workPackage: {
          kind: 'work_package',
          chain: {
            level: 'work_package',
            organizationId: ORGANIZATION,
            spaceId: SPACE,
            projectId: PROJECT,
            workPackageId: seed.workPackageIds[0],
          },
          restricted: false,
        },
      });
      for (const scope of [
        { level: 'organization', id: ORGANIZATION },
        { level: 'space', id: SPACE },
        { level: 'project', id: PROJECT },
        { level: 'work_package', id: seed.workPackageIds[0] },
      ] as const) {
        expect(await port.readTarget(scope, 'another-organization')).toBeNull();
        expect(
          await port.readTarget({ ...scope, id: 'missing-settings-target' }, ORGANIZATION),
        ).toBeNull();
      }
      const scope = { level: 'work_package' as const, id: seed.workPackageIds[0] };
      const retained = port.readTarget(scope, ORGANIZATION);
      scope.id = seed.workPackageIds[1];
      expect(await retained).toEqual(targets.workPackage);
      expect(
        await port.readTarget({ level: 'work_package', id: seed.workPackageIds[1] }, null),
      ).toMatchObject({ chain: { workPackageId: seed.workPackageIds[1] } });
    },
  },
  {
    caseId: 'settings.capture:inherited-and-detached',
    assert: async ({ port, seed }: CaseFixture<SettingStore>) => {
      const { organization, space, project, workPackage } = await readSettingTargets(port, seed);
      expect(
        await port.write(workPackage, { key: 'pertWeights', value: null }, seed.stamps[0]),
      ).toEqual({ ok: true });
      expect(
        await port.write(organization, { key: 'timezone', value: 'Europe/Kyiv' }, seed.stamps[0]),
      ).toEqual({ ok: true });
      expect(
        await port.write(space, { key: 'timezone', value: 'Europe/Paris' }, seed.stamps[0]),
      ).toEqual({ ok: true });
      expect(
        await port.write(
          project,
          { key: 'pertWeights', value: { optimistic: 2, realistic: 3, pessimistic: 4 } },
          seed.stamps[0],
        ),
      ).toEqual({ ok: true });
      expect(
        await port.write(project, { key: 'budgetFactor', value: 1.5 }, seed.stamps[0]),
      ).toEqual({ ok: true });
      const captured = await port.capture(workPackage);
      const retained = structuredClone(captured);
      expect(resolveSetting(workPackage.chain, 'timezone', captured)).toEqual({
        value: 'Europe/Paris',
        provenance: { level: 'space', id: SPACE },
      });
      expect(resolveSetting(workPackage.chain, 'pertWeights', captured)).toEqual({
        value: { optimistic: 2, realistic: 3, pessimistic: 4 },
        provenance: { level: 'project', id: PROJECT },
      });
      expect(resolveSetting(workPackage.chain, 'budgetFactor', captured)).toEqual({
        value: 1.5,
        provenance: { level: 'project', id: PROJECT },
      });
      expect(captured.markers).toEqual([
        {
          scope: { level: 'work_package', id: seed.workPackageIds[0] },
          marker: {
            id: 'settings-marker-0',
            date: '2026-11-15',
            name: 'Settings marker',
            color: null,
            createdAt: 100,
          },
        },
      ]);
      expect(
        await port.write(space, { key: 'timezone', value: 'Europe/London' }, seed.stamps[1]),
      ).toEqual({ ok: true });
      expect(
        await port.write(
          project,
          { key: 'pertWeights', value: { optimistic: 5, realistic: 6, pessimistic: 7 } },
          seed.stamps[1],
        ),
      ).toEqual({ ok: true });
      expect(captured).toEqual(retained);
      const fresh = await port.capture(workPackage);
      expect(resolveSetting(workPackage.chain, 'timezone', fresh).value).toBe('Europe/London');
      expect(resolveSetting(workPackage.chain, 'pertWeights', fresh).value).toEqual({
        optimistic: 5,
        realistic: 6,
        pessimistic: 7,
      });
    },
  },
  {
    caseId: 'settings.write:refusal-and-clear',
    assert: async ({ port, seed }: CaseFixture<SettingStore>) => {
      const { project, workPackage } = await readSettingTargets(port, seed);
      const before = structuredClone(await port.capture(workPackage));
      expect(
        await port.write(workPackage, { key: 'budgetFactor', value: 2 }, seed.stamps[0]),
      ).toEqual({
        ok: false,
        reason: 'not_overridable_here',
        key: 'budgetFactor',
        level: 'work_package',
      });
      expect(await port.write(project, { key: 'budgetFactor', value: 0 }, seed.stamps[0])).toEqual({
        ok: false,
        reason: 'invalid_value',
        key: 'budgetFactor',
      });
      expect(
        await port.write(workPackage, { key: 'timezone', value: 'not/a-timezone' }, seed.stamps[0]),
      ).toEqual({ ok: false, reason: 'invalid_value', key: 'timezone' });
      expect(await port.capture(workPackage)).toEqual(before);
      expect(
        await port.write(project, { key: 'timezone', value: 'Europe/Paris' }, seed.stamps[0]),
      ).toEqual({ ok: true });
      const ancestor = structuredClone(await port.capture(project));
      expect(
        await port.write(workPackage, { key: 'timezone', value: 'Europe/Oslo' }, seed.stamps[1]),
      ).toEqual({ ok: true });
      expect(
        resolveSetting(workPackage.chain, 'timezone', await port.capture(workPackage)),
      ).toEqual({
        value: 'Europe/Oslo',
        provenance: { level: 'work_package', id: seed.workPackageIds[0] },
      });
      expect(await port.capture(project)).toEqual(ancestor);
      const other = await port.readTarget(
        { level: 'work_package', id: seed.workPackageIds[1] },
        ORGANIZATION,
      );
      if (other === null) throw new Error('second settings package is absent');
      expect(resolveSetting(other.chain, 'timezone', await port.capture(other))).toEqual({
        value: 'Europe/Paris',
        provenance: { level: 'project', id: PROJECT },
      });
      expect(
        await port.write(workPackage, { key: 'timezone', value: null }, seed.stamps[1]),
      ).toEqual({ ok: true });
      expect(
        resolveSetting(workPackage.chain, 'timezone', await port.capture(workPackage)),
      ).toEqual({ value: 'Europe/Paris', provenance: { level: 'project', id: PROJECT } });
      expect(await port.capture(project)).toEqual(ancestor);
    },
  },
  {
    caseId: 'settings.packageIds:descendants-and-touch',
    assert: async ({ port, readers, seed }: CaseFixture<SettingStore>) => {
      const { organization, space, project, workPackage } = await readSettingTargets(port, seed);
      expect(await port.packageIds(organization)).toEqual([...seed.workPackageIds]);
      expect(await port.packageIds(space)).toEqual([...seed.workPackageIds]);
      expect(await port.packageIds(project)).toEqual([...seed.workPackageIds]);
      expect(await port.packageIds(workPackage)).toEqual([seed.workPackageIds[0]]);
      const first = await readers.workPackages.findById(seed.workPackageIds[0]);
      const second = await readers.workPackages.findById(seed.workPackageIds[1]);
      if (first === null || second === null) throw new Error('settings descendant row is absent');
      const captured = structuredClone(await port.capture(workPackage));
      const event = {
        type: 'work_package_settings_changed',
        optimizationEnabled: false,
        scheduleEngine: 'fast',
        scheduleObjective: 'pri',
      } as const;
      expect(await port.touchPackages(workPackage, seed.stamps[1])).toEqual([
        { workPackageId: first.id, event },
      ]);
      expect(await readers.workPackages.findById(first.id)).toEqual({
        ...first,
        revision: first.revision + 1,
      });
      expect(await readers.workPackages.findById(second.id)).toEqual(second);
      expect(await port.touchPackages(project, seed.stamps[1])).toEqual([
        { workPackageId: first.id, event },
        { workPackageId: second.id, event },
      ]);
      expect(await readers.workPackages.findById(first.id)).toEqual({
        ...first,
        revision: first.revision + 2,
      });
      expect(await readers.workPackages.findById(second.id)).toEqual({
        ...second,
        revision: second.revision + 1,
      });
      expect(await port.capture(workPackage)).toEqual(captured);
    },
  },
] as const satisfies readonly { readonly caseId: string; readonly assert: SettingAssertion }[];

/** Reads through the public catalog only after the real borrowed writer has settled. */
export async function assertSettingSettlement(
  uow: UnitOfWork,
  { port, readers, seed }: CaseFixture<SettingStore>,
): Promise<void> {
  const { project, workPackage } = await readSettingTargets(port, seed);
  const before = structuredClone(await port.capture(workPackage));
  const rowsBefore = structuredClone(
    await Promise.all(seed.workPackageIds.map((id) => readers.workPackages.findById(id))),
  );
  const refused = await uow.run(async ({ stores }) => {
    const borrowed = await stores.settings.readTarget(
      { level: 'project', id: PROJECT },
      ORGANIZATION,
    );
    if (borrowed === null) throw new Error('borrowed settings project is absent');
    expect(
      await stores.settings.write(borrowed, { key: 'budgetFactor', value: 3 }, seed.stamps[1]),
    ).toEqual({ ok: true });
    expect(await stores.settings.touchPackages(borrowed, seed.stamps[1])).toHaveLength(2);
    expect(
      resolveSetting(borrowed.chain, 'budgetFactor', await stores.settings.capture(borrowed)).value,
    ).toBe(3);
    return { commit: false, value: 'refused' as const };
  });
  expect(refused).toBe('refused');
  expect(await port.capture(workPackage)).toEqual(before);
  expect(
    await Promise.all(seed.workPackageIds.map((id) => readers.workPackages.findById(id))),
  ).toEqual(rowsBefore);
  const committed = await uow.run(async ({ stores }) => {
    const borrowed = await stores.settings.readTarget(
      { level: 'project', id: PROJECT },
      ORGANIZATION,
    );
    if (borrowed === null) throw new Error('borrowed settings project is absent');
    expect(
      await stores.settings.write(borrowed, { key: 'budgetFactor', value: 2 }, seed.stamps[1]),
    ).toEqual({ ok: true });
    return { commit: true, value: 'committed' as const };
  });
  expect(committed).toBe('committed');
  expect(resolveSetting(project.chain, 'budgetFactor', await port.capture(project))).toEqual({
    value: 2,
    provenance: { level: 'project', id: PROJECT },
  });
  expect(
    await Promise.all(seed.workPackageIds.map((id) => readers.workPackages.findById(id))),
  ).toEqual(
    rowsBefore.map((row) => {
      if (row === null) throw new Error('seeded settings package is absent');
      return { ...row, budgetFactor: 2 };
    }),
  );
}

export const SETTINGS_CASE_IDS = SETTINGS_ASSERTIONS.map(({ caseId }) => caseId);

/** Registers real target, captured evidence, write refusal and descendant mutation owners. */
export function settingsRegistrations(open: OpenCase<'settings'>): readonly CaseRegistration[] {
  return SETTINGS_ASSERTIONS.map(({ caseId, assert }) =>
    storeCase('settings', caseId, open, assert),
  );
}
