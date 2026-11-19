import type { AccessGrantRecord, ResourceAccess } from '@wbs/core';
import { LEGACY_ACCESS } from '@wbs/core/ports/organization-access';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { CONTRIBUTOR_CAP } from '@wbs/domain';
import { expect, test } from 'bun:test';

import { openMemorySourceFixture, openMemorySourceWithCaptureReadSeam } from './source';
import { workPackageRow } from './work-package-fixture';

const scoped = (id = 'creator'): ResourceAccess => ({
  kind: 'scoped',
  scope: { organizationId: 'org', userId: id, cap: null },
  principal: { id },
});
async function seed(
  fixture: ReturnType<typeof openMemorySourceFixture>,
  legacy = false,
  activate = !legacy,
) {
  fixture.addOrganization('org', { legacy });
  fixture.addOrganization('foreign', { legacy: false });
  for (const id of ['creator', 'other'])
    await fixture.source.stores.users.create(
      { id, username: id, passwordHash: null, createdAt: 1 },
      { by: id, at: 1 },
    );
  fixture.setPackageCreationMembers('org', ['creator', 'other']);
  fixture.seedPackageParent({
    spaceId: null,
    spacePosition: null,
    id: 'parent',
    organizationId: 'org',
    name: 'Parent',
    revision: 0,
    createdAt: 1,
    updatedAt: null,
    createdBy: 'creator',
  });
  await fixture.source.stores.workPackages.createInOrganization(
    workPackageRow({ id: 'package', projectId: 'parent' }),
    [
      {
        id: 'dev',
        workPackageId: 'package',
        name: 'Development',
        code: 'DEV',
        position: 10,
        allowancePercent: 0,
        estimateUnit: 'workdays',
      },
    ],
    { by: 'creator', at: 1 },
    'org',
    { id: 'grant', auditId: 'audit' },
  );
  if (activate) await fixture.activateOrganizationIsolation();
  return fixture;
}
function grant(overrides: Partial<AccessGrantRecord> = {}): AccessGrantRecord {
  return {
    id: 'extra',
    organizationId: 'org',
    scope: { kind: 'work_package', workPackageId: 'package' },
    subject: { kind: 'user', userId: 'creator' },
    roleId: 'package-viewer',
    origin: 'route',
    createdAt: 1,
    createdBy: 'creator',
    ...overrides,
  };
}

test('captures real legacy and scoped isolated parent metadata without owner fields', async () => {
  for (const legacy of [true, false]) {
    const fixture = await seed(openMemorySourceFixture(), legacy);
    const reader = fixture.source.createPlanExports(fastScheduler);
    const captured = await reader.readExport('package', legacy ? LEGACY_ACCESS : scoped());
    expect(captured.kind).toBe('local');
    if (captured.kind !== 'local') throw Error('missing local capture');
    expect(captured.document.project).toEqual({ id: 'parent', name: 'Parent' });
    expect(captured.workPackage).not.toHaveProperty('ownerId');
    Reflect.set(captured.document.project, 'name', 'Caller');
    expect(await reader.readExport('package', legacy ? LEGACY_ACCESS : scoped())).toHaveProperty(
      'document.project.name',
      'Parent',
    );
    await fixture.source.close();
  }
});
test('uses grants rather than creator/member aliases and keeps absent foreign invisible outcomes opaque', async () => {
  const fixture = await seed(openMemorySourceFixture());
  const reader = fixture.source.createPlanExports(fastScheduler);
  expect(await reader.readExport('package', scoped('other'))).toEqual({ kind: 'not_found' });
  expect(await reader.readExport('missing', scoped('other'))).toEqual({ kind: 'not_found' });
  fixture.removePackageExportGrant('grant');
  expect(await reader.readExport('package', scoped())).toEqual({ kind: 'not_found' });
  fixture.seedPackageExportGrant(grant({ scope: { kind: 'project', projectId: 'parent' } }));
  expect((await reader.readExport('package', scoped())).kind).toBe('local');
});
test('rechecks current membership activation and principal coherence', async () => {
  const fixture = await seed(openMemorySourceFixture());
  const reader = fixture.source.createPlanExports(fastScheduler);
  fixture.setPackageCreationMembers('org', ['other']);
  expect(await reader.readExport('package', scoped())).toEqual({
    kind: 'access_refused',
    refusal: 'not_a_member',
  });
  expect(await reader.readExport('package', LEGACY_ACCESS)).toEqual({
    kind: 'access_refused',
    refusal: 'no_active_organization',
  });
  expect(
    reader.readExport('package', {
      kind: 'scoped',
      scope: { organizationId: 'org', userId: 'creator', cap: null },
      principal: { id: 'other' },
    }),
  ).rejects.toThrow('principal differs');
});
test('throws on a selected missing or mismatched role even beside another valid grant', async () => {
  const missing = await seed(openMemorySourceFixture());
  missing.seedPackageExportGrant(grant());
  missing.removePackageCreationRole();
  expect(
    missing.source.createPlanExports(fastScheduler).readExport('package', scoped()),
  ).rejects.toThrow('role is absent');
  const mismatched = await seed(openMemorySourceFixture());
  mismatched.seedPackageExportGrant(grant());
  mismatched.replacePackageExportRoleKind('package-manager', 'organization');
  expect(
    mismatched.source.createPlanExports(fastScheduler).readExport('package', scoped()),
  ).rejects.toThrow('kind is inconsistent');
});
test('throws on selected unsupported custom or potentially reaching group state', async () => {
  const custom = await seed(openMemorySourceFixture());
  custom.seedPackageExportGrant(grant({ roleId: 'custom' }));
  expect(
    custom.source.createPlanExports(fastScheduler).readExport('package', scoped()),
  ).rejects.toThrow('custom role permissions');
  const group = await seed(openMemorySourceFixture());
  group.seedPackageExportGrant(grant({ subject: { kind: 'group', groupId: 'unrepresented' } }));
  expect(
    group.source.createPlanExports(fastScheduler).readExport('package', scoped()),
  ).rejects.toThrow('access-group membership');
});
test('credentials do not inherit account grants and can read through their exact persisted grant', async () => {
  const fixture = await seed(openMemorySourceFixture());
  const reader = fixture.source.createPlanExports(fastScheduler);
  const access: ResourceAccess = {
    kind: 'scoped',
    scope: { organizationId: 'org', userId: 'creator', cap: CONTRIBUTOR_CAP },
    principal: {
      id: 'creator',
      authentication: { kind: 'machine', credentialId: 'machine', personId: 'agent' },
    },
  };
  expect(await reader.readExport('package', access)).toEqual({ kind: 'not_found' });
  fixture.seedPackageExportGrant(
    grant({ subject: { kind: 'machine_credential', credentialId: 'other-machine' } }),
  );
  expect(await reader.readExport('package', access)).toEqual({ kind: 'not_found' });
  fixture.seedPackageExportGrant(
    grant({
      id: 'credential-grant',
      subject: { kind: 'machine_credential', credentialId: 'machine' },
    }),
  );
  expect((await reader.readExport('package', access)).kind).toBe('local');
});
test('retains complete access before waiting and selects a committed epoch after the source owner', async () => {
  const fixture = await seed(openMemorySourceFixture());
  let release: () => void = () => {
    throw Error('uninitialized release');
  };
  let entered: () => void = () => {
    throw Error('uninitialized entered');
  };
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const began = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const owner = fixture.source.uow.run(async () => {
    entered();
    await held;
    return { commit: false, value: undefined };
  });
  await began;
  const caller = {
    kind: 'scoped' as const,
    scope: { organizationId: 'org', userId: 'creator', cap: null },
    principal: { id: 'creator' },
  };
  const pending = fixture.source.createPlanExports(fastScheduler).readExport('package', caller);
  caller.scope.userId = 'other';
  caller.principal.id = 'other';
  fixture.renamePackageExportParent('parent', 'Queued parent');
  release();
  await owner;
  const captured = await pending;
  expect(captured).toHaveProperty('document.project.name', 'Queued parent');
  expect(captured.kind).toBe('local');
});
test('keeps parent grant and tree facts in the detached epoch across awaited reads', async () => {
  let mutate: () => void = () => {
    throw Error('uninitialized mutation');
  };
  const fixture = await seed(
    openMemorySourceWithCaptureReadSeam({
      afterFirstRead: () => {
        mutate();
        return Promise.resolve();
      },
    }),
  );
  let changed = false;
  mutate = () => {
    if (changed) return;
    changed = true;
    fixture.renamePackageExportParent('parent', 'Later');
    fixture.removePackageExportGrant('grant');
  };
  const reader = fixture.source.createPlanExports(fastScheduler);
  expect(await reader.readExport('package', scoped())).toHaveProperty(
    'document.project.name',
    'Parent',
  );
  expect(await reader.readExport('package', scoped())).toEqual({ kind: 'not_found' });
});
test('throws on malformed parent and refuses missing fixture identities without silent state changes', async () => {
  const fixture = await seed(openMemorySourceFixture());
  expect(() => {
    fixture.seedPackageExportGrant(grant({ id: 'grant' }));
  }).toThrow('duplicate');
  expect(() => {
    fixture.removePackageExportGrant('missing');
  }).toThrow('absent');
  expect(() => {
    fixture.replacePackageExportRoleKind('missing', 'project');
  }).toThrow('absent');
  expect(() => {
    fixture.renamePackageExportParent('missing', 'Name');
  }).toThrow('absent');
  fixture.renamePackageExportParent('parent', '');
  expect(
    fixture.source.createPlanExports(fastScheduler).readExport('package', scoped()),
  ).rejects.toThrow('parent is absent or malformed');
});

test('retains nested credential identity while waiting for the actual Source owner', async () => {
  const fixture = await seed(openMemorySourceFixture());
  fixture.seedPackageExportGrant(
    grant({ subject: { kind: 'machine_credential', credentialId: 'machine' } }),
  );
  let release: () => void = () => {
    throw Error('uninitialized release');
  };
  let entered: () => void = () => {
    throw Error('uninitialized entered');
  };
  const held = new Promise<void>((resolve) => {
      release = resolve;
    }),
    began = new Promise<void>((resolve) => {
      entered = resolve;
    });
  const owner = fixture.source.uow.run(async () => {
    entered();
    await held;
    return { commit: false, value: undefined };
  });
  await began;
  const caller = {
    kind: 'scoped' as const,
    scope: { organizationId: 'org', userId: 'creator', cap: CONTRIBUTOR_CAP },
    principal: {
      id: 'creator',
      authentication: { kind: 'machine' as const, credentialId: 'machine', personId: 'agent' },
    },
  };
  const pending = fixture.source.createPlanExports(fastScheduler).readExport('package', caller);
  caller.principal.authentication.credentialId = 'another';
  release();
  await owner;
  expect((await pending).kind).toBe('local');
  expect(
    await fixture.source.createPlanExports(fastScheduler).readExport('package', caller),
  ).toEqual({ kind: 'not_found' });
});
test('restricted organization-member authority does not replace a direct readable leaf grant', async () => {
  const fixture = await seed(openMemorySourceFixture());
  await fixture.source.stores.workPackages.update(
    'package',
    { restricted: true },
    { by: 'creator', at: 2 },
  );
  fixture.removePackageExportGrant('grant');
  fixture.seedPackageExportGrant(
    grant({
      scope: { kind: 'organization' },
      subject: { kind: 'organization_members' },
      roleId: 'org-admin',
    }),
  );
  expect(
    await fixture.source.createPlanExports(fastScheduler).readExport('package', scoped()),
  ).toEqual({ kind: 'not_found' });
  fixture.seedPackageExportGrant(grant({ id: 'leaf' }));
  expect(
    (await fixture.source.createPlanExports(fastScheduler).readExport('package', scoped())).kind,
  ).toBe('local');
});

test('supports legacy export of actual mapped nonlegacy preactivation packages', async () => {
  const fixture = await seed(openMemorySourceFixture(), false, false);
  expect(
    await fixture.source.createPlanExports(fastScheduler).readExport('package', LEGACY_ACCESS),
  ).toHaveProperty('document.project.name', 'Parent');
});

test('captures actual nonempty live step and labelled row metadata from the same Source epoch', async () => {
  const fixture = await seed(openMemorySourceFixture());
  await fixture.source.stores.workItems.insert(
    workItemRow({ id: 'row', workPackageId: 'package', name: 'Leaf' }),
    [],
    { by: 'creator', at: 2 },
  );
  const captured = await fixture.source
    .createPlanExports(fastScheduler)
    .readExport('package', scoped());
  expect(captured.kind).toBe('local');
  if (captured.kind !== 'local') throw Error('missing local capture');
  expect(captured.steps).toMatchObject([{ id: 'dev', workPackageId: 'package', code: 'DEV' }]);
  expect(captured.workItems).toMatchObject([{ id: 'row', workPackageId: 'package', name: 'Leaf' }]);
  expect(captured.chain.reads.workItems).toHaveLength(1);
});

test('matches actual parent grants while excluding a sibling and credential account inheritance', async () => {
  const fixture = await seed(openMemorySourceFixture());
  const reader = fixture.source.createPlanExports(fastScheduler);
  fixture.removePackageExportGrant('grant');
  fixture.seedPackageParent({
    spaceId: null,
    spacePosition: null,
    id: 'sibling',
    organizationId: 'org',
    name: 'Sibling',
    revision: 0,
    createdAt: 1,
    updatedAt: null,
    createdBy: 'creator',
  });
  fixture.seedPackageExportGrant(
    grant({
      id: 'sibling-grant',
      scope: { kind: 'project', projectId: 'sibling' },
      roleId: 'project-contributor',
    }),
  );
  expect(await reader.readExport('package', scoped())).toEqual({ kind: 'not_found' });
  fixture.seedPackageExportGrant(
    grant({ scope: { kind: 'project', projectId: 'parent' }, roleId: 'project-contributor' }),
  );
  await fixture.source.stores.workPackages.update(
    'package',
    { restricted: true },
    { by: 'creator', at: 2 },
  );
  expect((await reader.readExport('package', scoped())).kind).toBe('local');
  const credential: ResourceAccess = {
    kind: 'scoped',
    scope: { organizationId: 'org', userId: 'creator', cap: CONTRIBUTOR_CAP },
    principal: {
      id: 'creator',
      authentication: { kind: 'machine', credentialId: 'machine', personId: 'agent' },
    },
  };
  expect(await reader.readExport('package', credential)).toEqual({ kind: 'not_found' });
  fixture.seedPackageExportGrant(
    grant({
      id: 'own-credential',
      scope: { kind: 'project', projectId: 'parent' },
      subject: { kind: 'machine_credential', credentialId: 'machine' },
      roleId: 'project-contributor',
    }),
  );
  expect((await reader.readExport('package', credential)).kind).toBe('local');
});
