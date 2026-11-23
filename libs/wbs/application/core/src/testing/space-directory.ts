import { expect } from 'bun:test';

import type { Source } from '../ports/source';
import type { TransactionalStores } from '../ports/stores';
import type { StepCatalogueSeed } from './step-catalogue-seed';
import { workItemRow } from './work-item-fixture';

export type SpaceDirectoryKind = 'person' | 'team';

/** Creates actual directory roots and memberships; adapter-specific ownership setup supplies no removal behavior. */
export async function seedSpaceDirectory(
  source: Source<TransactionalStores>,
  seed: StepCatalogueSeed,
  own: (kind: SpaceDirectoryKind, id: string) => Promise<void>,
): Promise<void> {
  const spaces = source.stores.spaces;
  if (spaces === undefined) throw new Error('actual Source lacks spaces');
  for (const [id, name] of [
    ['space-first', 'First'],
    ['space-second', 'Second'],
    ['space-unrelated', 'Unrelated'],
  ] as const)
    expect(
      await spaces.create({ id, name, organizationId: seed.organizationId }, seed.stamp),
    ).toMatchObject({ ok: true });
  for (const id of ['directory-person', 'directory-spare']) {
    expect(await source.stores.directory.addPerson({ id, name: id }, [], seed.stamp)).toMatchObject(
      { ok: true },
    );
    await own('person', id);
  }
  await source.stores.directory.addTeam({ id: 'directory-team', name: 'Team' }, seed.stamp);
  await own('team', 'directory-team');
  for (const id of ['space-first', 'space-second']) {
    expect(await spaces.addPerson(seed.organizationId, id, 'directory-person', seed.stamp)).toBe(
      true,
    );
    expect(await spaces.addTeam(seed.organizationId, id, 'directory-team', seed.stamp)).toBe(true);
  }
  expect(
    await spaces.addPerson(seed.organizationId, 'space-unrelated', 'directory-spare', seed.stamp),
  ).toBe(true);
}

/** Calls the actual directory owner, including its modeled credential reach and cascade decision. */
export function removeSpaceDirectory(
  stores: TransactionalStores,
  seed: StepCatalogueSeed,
  kind: SpaceDirectoryKind,
  cascade: boolean,
) {
  return kind === 'person'
    ? stores.directory.removePerson('directory-person', cascade, seed.stamp, { kind: 'none' })
    : stores.directory.removeTeam('directory-team', cascade, seed.stamp);
}

/** Checks successful deletion, staged/committed ownership and rollback without substituting any Source port. */
export async function assertSpaceDirectoryRemoval(
  source: Source<TransactionalStores>,
  seed: StepCatalogueSeed,
  kind: SpaceDirectoryKind,
  cascade: boolean,
  settlement: 'public' | 'commit' | 'rollback',
): Promise<void> {
  const spaces = source.stores.spaces;
  if (spaces === undefined) throw new Error('actual Source lacks spaces');
  const read = () =>
    Promise.all(
      ['space-first', 'space-second', 'space-unrelated'].map((id) =>
        spaces.readContents(seed.organizationId, id),
      ),
    );
  const before = await read();
  const checkDeleted = async (stores: TransactionalStores) => {
    const selected = stores.spaces;
    if (selected === undefined) throw new Error('actual deletion owner lacks spaces');
    for (const id of ['space-first', 'space-second'])
      expect(await selected.readContents(seed.organizationId, id)).toMatchObject({
        space: { revision: 3 },
        personIds: kind === 'person' ? [] : ['directory-person'],
        serviceTeamIds: kind === 'team' ? [] : ['directory-team'],
      });
    expect(await selected.readContents(seed.organizationId, 'space-unrelated')).toEqual(before[2]);
  };
  if (settlement === 'public') {
    expect(await removeSpaceDirectory(source.stores, seed, kind, cascade)).toMatchObject({
      ok: true,
      removal: { workItemIds: [], workPackageIds: [] },
    });
    await checkDeleted(source.stores);
  } else {
    await source.uow.run(async ({ stores }) => {
      expect(await removeSpaceDirectory(stores, seed, kind, cascade)).toMatchObject({
        ok: true,
        removal: { workItemIds: [], workPackageIds: [] },
      });
      await checkDeleted(stores);
      expect(await read()).toEqual(before);
      return { commit: settlement === 'commit', value: undefined };
    });
    if (settlement === 'rollback') expect(await read()).toEqual(before);
    else await checkDeleted(source.stores);
  }
  const directory =
    kind === 'person'
      ? await source.stores.directory.listPeople()
      : await source.stores.directory.listTeams();
  expect(directory.some((row) => row.id === 'directory-' + kind)).toBe(settlement === 'rollback');
  if (settlement !== 'rollback') {
    const after = await read();
    expect(await removeSpaceDirectory(source.stores, seed, kind, cascade)).toMatchObject({
      ok: false,
      reason: 'not_found',
    });
    expect(await read()).toEqual(after);
  }
}

/** A team's people require cascade consent; a refusal must preserve every space membership and revision. */
export async function assertSpaceDirectoryRefusal(
  source: Source<TransactionalStores>,
  seed: StepCatalogueSeed,
): Promise<void> {
  const spaces = source.stores.spaces;
  if (spaces === undefined) throw new Error('actual Source lacks spaces');
  expect(
    await source.stores.directory.patchPerson(
      'directory-person',
      { teamIds: ['directory-team'] },
      seed.stamp,
    ),
  ).toMatchObject({ ok: true });
  const read = () =>
    Promise.all(
      ['space-first', 'space-second', 'space-unrelated'].map((id) =>
        spaces.readContents(seed.organizationId, id),
      ),
    );
  const before = await read();
  expect(await removeSpaceDirectory(source.stores, seed, 'team', false)).toMatchObject({
    ok: false,
    reason: 'in_use',
    usage: { members: [{ id: 'directory-person' }] },
  });
  expect(await read()).toEqual(before);
  expect(
    (await source.stores.directory.listTeams()).some((team) => team.id === 'directory-team'),
  ).toBe(true);
  expect(await removeSpaceDirectory(source.stores, seed, 'team', true)).toMatchObject({ ok: true });
  for (const id of ['space-first', 'space-second'])
    expect(await spaces.readContents(seed.organizationId, id)).toMatchObject({
      space: { revision: 3 },
      serviceTeamIds: [],
    });
}

/** Both primary and secondary team labels require consent and lose exactly one row revision on confirmed removal. */
export async function assertSpaceDirectoryLabels(
  source: Source<TransactionalStores>,
  seed: StepCatalogueSeed,
  own: (kind: SpaceDirectoryKind, id: string) => Promise<void>,
): Promise<void> {
  await source.stores.directory.addTeam({ id: 'directory-other', name: 'Other team' }, seed.stamp);
  await own('team', 'directory-other');
  await source.stores.directory.addService(
    { id: 'directory-service', name: 'Service' },
    seed.stamp,
  );
  expect(
    await source.stores.directory.patchTeam(
      'directory-team',
      { serviceIds: ['directory-service'] },
      seed.stamp,
    ),
  ).toMatchObject({ ok: true });
  expect(
    await source.stores.capacity.set(seed.workPackageId, 'directory-team', 2, seed.stamp),
  ).toMatchObject({ ok: true });
  expect(
    await source.stores.capacity.set(seed.workPackageId, 'directory-other', 3, seed.stamp),
  ).toMatchObject({ ok: true });
  for (const [id, serviceTeamId] of [
    ['directory-primary', 'directory-team'],
    ['directory-secondary', 'directory-other'],
  ] as const)
    await source.stores.workItems.insert(
      workItemRow({ id, workPackageId: seed.workPackageId, serviceTeamId }),
      [],
      seed.stamp,
    );
  expect(
    await source.stores.workItems.patch(
      'directory-secondary',
      { teamIds: ['directory-other', 'directory-team'] },
      seed.stamp,
    ),
  ).toMatchObject({ ok: true });
  expect(await source.stores.workItems.findById('directory-primary')).toMatchObject({
    revision: 0,
  });
  await source.stores.workItems.insert(
    workItemRow({ id: 'directory-unlabelled', workPackageId: seed.workPackageId, position: 30 }),
    [],
    seed.stamp,
  );
  const secondary = await source.stores.workItems.findById('directory-secondary');
  if (secondary === null) throw new Error('actual secondary row is absent');
  const refused = await removeSpaceDirectory(source.stores, seed, 'team', false);
  expect(refused).toMatchObject({ ok: false, reason: 'in_use' });
  if (refused.ok || refused.reason !== 'in_use')
    throw new Error('actual team usage refusal is absent');
  expect(refused.usage.workItems.map((row) => row.id).sort()).toEqual([
    'directory-primary',
    'directory-secondary',
    'directory-unlabelled',
  ]);
  expect(refused.usage.capacityOf).toEqual(new Map([[seed.workPackageId, 2]]));
  expect(await removeSpaceDirectory(source.stores, seed, 'team', true)).toMatchObject({
    ok: true,
    removal: {
      workItemIds: ['directory-primary', 'directory-secondary'],
      workPackageIds: [seed.workPackageId],
    },
  });
  const rows = await source.stores.workItems.listByWorkPackage(seed.workPackageId);
  expect(rows.find((row) => row.id === 'directory-primary')).toMatchObject({
    serviceTeamId: null,
    teamIds: [],
    revision: 1,
  });
  expect(rows.find((row) => row.id === 'directory-secondary')).toMatchObject({
    serviceTeamId: 'directory-other',
    teamIds: ['directory-other'],
    revision: secondary.revision + 1,
  });
  expect(rows.find((row) => row.id === 'directory-unlabelled')).toMatchObject({ revision: 0 });
  expect(await source.stores.capacity.slotsFor(seed.workPackageId)).toEqual(
    new Map([['directory-other', 3]]),
  );
  await source.stores.directory.addTeam({ id: 'directory-team', name: 'Replacement' }, seed.stamp);
  expect(
    (await source.stores.directory.listTeams()).find((row) => row.id === 'directory-team'),
  ).toMatchObject({ serviceIds: [] });
}
