import { expect, it } from 'bun:test';

import { openMemorySourceFixture } from './source';
import { workPackageRow } from './work-package-fixture';

async function opened() {
  const fixture = openMemorySourceFixture();
  fixture.addOrganization('org-a', { legacy: false });
  await fixture.source.stores.users.create(
    { id: 'creator', username: 'Creator', passwordHash: null, createdAt: 1 },
    { by: 'creator', at: 1 },
  );
  fixture.setPackageCreationMembers('org-a', ['creator']);
  fixture.seedPackageParent({
    spaceId: null,
    spacePosition: null,
    id: 'parent-a',
    organizationId: 'org-a',
    name: 'Parent',
    revision: 0,
    createdAt: 1,
    updatedAt: null,
    createdBy: 'creator',
  });
  return fixture;
}
function birth() {
  return {
    draft: structuredClone(workPackageRow({ id: 'p', projectId: 'parent-a' })),
    steps: [
      {
        id: 's',
        workPackageId: 'p',
        name: 'Dev',
        position: 10,
        code: 'DEV',
        allowancePercent: 0,
        estimateUnit: 'workdays' as const,
      },
    ],
    stamp: { at: 1, by: 'creator' },
    grant: { id: 'grant', auditId: 'audit' },
  };
}
async function failure(pending: Promise<unknown>, diagnostic: string) {
  let cause: unknown;
  try {
    await pending;
  } catch (error: unknown) {
    cause = error;
  }
  expect(cause).toBeInstanceOf(Error);
  expect(cause).toMatchObject({ message: diagnostic });
}

it('commits the actual scoped package mapping through its borrowed memory Source owner', async () => {
  const fixture = await opened(),
    source = fixture.source;
  await source.uow.run(async (scope) => {
    await scope.stores.workPackages.createInOrganization(
      workPackageRow({ id: 'p', projectId: 'parent-a' }),
      [],
      { at: 1, by: 'creator' },
      'org-a',
      { id: 'grant', auditId: 'audit' },
    );
    return { commit: true, value: undefined };
  });
  expect(await source.stores.workPackages.findInOrganization('p', 'org-a')).toMatchObject({
    id: 'p',
  });
  expect(fixture.packageCreationEvidence()).toMatchObject({
    grants: [
      {
        id: 'grant',
        scope: { kind: 'work_package', workPackageId: 'p' },
        subject: { kind: 'user', userId: 'creator' },
        roleId: 'package-manager',
        origin: 'creation',
        createdAt: 1,
        createdBy: 'creator',
      },
    ],
    audits: [{ id: 'audit', actorId: 'creator', action: 'access_granted', createdAt: 1 }],
  });
  await source.close();
});

it('rolls back real memory grant/audit/mapping state with a later borrowed Source refusal', async () => {
  const fixture = await opened(),
    source = fixture.source,
    { draft, steps, stamp, grant } = birth(),
    before = fixture.packageCreationEvidence();
  await source.uow.run(async (scope) => {
    await scope.stores.workPackages.createInOrganization(draft, steps, stamp, 'org-a', grant);
    return { commit: false, value: undefined };
  });
  expect(await source.stores.workPackages.findById('p')).toBeNull();
  expect(fixture.packageCreationEvidence()).toEqual(before);
  await source.close();
});

for (const state of ['membership', 'role', 'audit'] as const)
  it('discards staged package, steps, mapping and creator rows at ' + state, async () => {
    const fixture = await opened(),
      source = fixture.source,
      { draft, steps, stamp, grant } = birth();
    if (state === 'membership') fixture.setPackageCreationMembers('org-a', []);
    if (state === 'role') fixture.removePackageCreationRole();
    if (state === 'audit')
      fixture.seedPackageCreationAudit({
        id: 'audit',
        organizationId: 'org-a',
        actorId: 'creator',
        action: 'access_granted',
        subjectKind: 'access_grant',
        subjectId: 'previous',
        detail: {},
        createdAt: 0,
      });
    const before = fixture.packageCreationEvidence();
    await failure(
      source.stores.workPackages.createInOrganization(draft, steps, stamp, 'org-a', grant),
      state === 'audit'
        ? 'duplicate package creator audit identity'
        : 'package creator grant refused: ' +
            (state === 'membership' ? 'not_a_member' : 'unknown_role'),
    );
    expect(await source.stores.workPackages.findById('p')).toBeNull();
    expect(await source.stores.workPackages.stepsOf('p')).toEqual([]);
    expect(fixture.packageCreationEvidence()).toEqual(before);
    await source.close();
  });

it('retains the complete public memory creation before waiting for its Source owner', async () => {
  const fixture = await opened(),
    source = fixture.source,
    { draft, steps, stamp, grant } = birth();
  let release: () => void = () => {
      throw new Error('held owner not entered');
    },
    entered: () => void = () => {
      throw new Error('held owner observer is not bound');
    };
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const held = source.uow.run(async () => {
    await new Promise<void>((resolve) => {
      release = resolve;
      entered();
    });
    return { commit: true, value: undefined };
  });
  await ready;
  const pending = source.stores.workPackages.createInOrganization(
    draft,
    steps,
    stamp,
    'org-a',
    grant,
  );
  draft.name = 'Changed';
  Object.assign(draft.pertWeights, { optimistic: 99 });
  steps[0].name = 'Changed';
  stamp.by = 'absent';
  stamp.at = 99;
  grant.id = 'changed';
  grant.auditId = 'changed-audit';
  release();
  await held;
  await pending;
  expect(await source.stores.workPackages.findInOrganization('p', 'org-a')).toMatchObject({
    name: 'Rewire the shed',
    pertWeights: { optimistic: 1 },
  });
  expect(await source.stores.workPackages.stepsOf('p')).toMatchObject([{ id: 's', name: 'Dev' }]);
  expect(fixture.packageCreationEvidence()).toMatchObject({
    grants: [{ id: 'grant', createdAt: 1, createdBy: 'creator' }],
    audits: [{ id: 'audit', createdAt: 1, actorId: 'creator' }],
  });
  await source.close();
});
