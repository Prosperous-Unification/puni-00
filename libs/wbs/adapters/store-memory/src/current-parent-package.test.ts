import { expect, it } from 'bun:test';

import { openMemorySourceFixture } from './source';
import { workPackageRow } from './work-package-fixture';

it('refuses an absent explicit parent in the real staged memory Source before package/grant/audit effects', async () => {
  const fixture = openMemorySourceFixture();
  fixture.addOrganization('org-a', { legacy: false });
  await fixture.source.stores.users.create(
    { id: 'creator', username: 'Creator', passwordHash: null, createdAt: 1 },
    { by: 'creator', at: 1 },
  );
  fixture.setPackageCreationMembers('org-a', ['creator']);
  await fixture.activateOrganizationIsolation();
  try {
    const created = await fixture.source.stores.workPackages.createInOrganization(
      { ...workPackageRow({ id: 'package', projectId: 'absent' }), projectId: 'absent' },
      [],
      { by: 'creator', at: 1 },
      'org-a',
      { id: 'grant', auditId: 'audit' },
    );
    expect(created).toBe('not_found');
    expect(await fixture.source.stores.workPackages.findById('package')).toBeNull();
    expect(fixture.packageCreationEvidence()).toEqual({ grants: [], audits: [] });
  } finally {
    await fixture.source.close();
  }
});

async function opened(legacy: boolean) {
  const fixture = openMemorySourceFixture();
  fixture.addOrganization('org-a', { legacy });
  fixture.addOrganization('org-b', { legacy: false });
  await fixture.source.stores.users.create(
    { id: 'creator', username: 'Creator', passwordHash: null, createdAt: 1 },
    { by: 'creator', at: 1 },
  );
  fixture.setPackageCreationMembers('org-a', ['creator']);
  for (const [id, organizationId] of [
    ['parent', 'org-a'],
    ['foreign', 'org-b'],
  ] as const)
    fixture.seedPackageParent({
      spaceId: null,
      spacePosition: null,
      id,
      organizationId,
      name: id,
      revision: 0,
      createdAt: 1,
      updatedAt: null,
      createdBy: 'creator',
    });
  if (!legacy) await fixture.activateOrganizationIsolation();
  return fixture;
}
const draft = () =>
  structuredClone(workPackageRow({ id: 'package', projectId: 'parent', createdAt: 1 }));
const stamp = { by: 'creator', at: 1 };
const grant = { id: 'grant', auditId: 'audit' };
it('commits ownerless scoped memory package, actual creator metadata, grant and audit together', async () => {
  const fixture = await opened(false);
  try {
    const created = await fixture.source.stores.workPackages.createInOrganization(
      draft(),
      [],
      stamp,
      'org-a',
      grant,
    );
    expect(created).toMatchObject({ projectId: 'parent' });
    expect(created).not.toHaveProperty('ownerId');
    expect(
      (await fixture.source.stores.workPackages.listFor('creator')).map((row) => row.createdByName),
    ).toEqual(['Creator']);
    expect(fixture.packageCreationEvidence()).toMatchObject({
      grants: [{ id: 'grant', createdBy: 'creator' }],
      audits: [{ id: 'audit', actorId: 'creator' }],
    });
  } finally {
    await fixture.source.close();
  }
});
it('refuses an actual foreign memory parent identically without any birth state', async () => {
  const fixture = await opened(false);
  try {
    expect(
      await fixture.source.stores.workPackages.createInOrganization(
        { ...draft(), projectId: 'foreign' },
        [],
        stamp,
        'org-a',
        grant,
      ),
    ).toBe('not_found');
    expect(await fixture.source.stores.workPackages.findById('package')).toBeNull();
    expect(fixture.packageCreationEvidence()).toEqual({ grants: [], audits: [] });
  } finally {
    await fixture.source.close();
  }
});
it('rolls package, actual creator metadata, mapping, grant and audit back with a refused borrowed owner', async () => {
  const fixture = await opened(false);
  try {
    await fixture.source.uow.run(async (scope) => {
      expect(
        await scope.stores.workPackages.createInOrganization(draft(), [], stamp, 'org-a', grant),
      ).toMatchObject({ id: 'package' });
      return { commit: false, value: undefined };
    });
    expect(
      await fixture.source.stores.workPackages.findInOrganization('package', 'org-a'),
    ).toBeNull();
    expect(await fixture.source.stores.workPackages.listFor('creator')).toEqual([]);
    expect(fixture.packageCreationEvidence()).toEqual({ grants: [], audits: [] });
  } finally {
    await fixture.source.close();
  }
});
it('rolls the package back when the actual memory audit append collides', async () => {
  const fixture = await opened(false);
  const audit = {
    id: 'audit',
    organizationId: 'org-a',
    actorId: 'creator',
    action: 'access_granted' as const,
    subjectKind: 'access_grant' as const,
    subjectId: 'earlier',
    createdAt: 1,
    detail: {
      roleId: 'package-manager',
      scopeKind: 'work_package',
      scopeId: 'earlier',
      subjectKind: 'user',
      subjectId: 'creator',
      origin: 'creation',
    },
  };
  fixture.seedPackageCreationAudit(audit);
  try {
    await expectFailure(
      fixture.source.stores.workPackages.createInOrganization(draft(), [], stamp, 'org-a', grant),
      'duplicate package creator audit identity',
    );
    expect(await fixture.source.stores.workPackages.findById('package')).toBeNull();
    expect(fixture.packageCreationEvidence()).toEqual({ grants: [], audits: [audit] });
  } finally {
    await fixture.source.close();
  }
});
it('retains the complete draft parent before the actual memory creation queue waits', async () => {
  const fixture = await opened(false);
  let release: () => void = () => {
    throw new Error('release latch not installed');
  };
  let entered: () => void = () => {
    throw new Error('entry latch not installed');
  };
  const inside = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = fixture.source.uow.run(async () => {
    entered();
    await held;
    return { commit: true, value: undefined };
  });
  await inside;
  const mutable = draft();
  const creation = fixture.source.stores.workPackages.createInOrganization(
    mutable,
    [],
    stamp,
    'org-a',
    grant,
  );
  mutable.projectId = 'foreign';
  mutable.pertWeights.optimistic = 99;
  release();
  await first;
  try {
    expect(await creation).toMatchObject({ projectId: 'parent', pertWeights: { optimistic: 1 } });
  } finally {
    await fixture.source.close();
  }
});
it('serializes activation after an earlier staged owner without letting its snapshot restore legacy authority', async () => {
  const fixture = await opened(true);
  let release: () => void = () => {
    throw new Error('release latch not installed');
  };
  let entered: () => void = () => {
    throw new Error('entry latch not installed');
  };
  const inside = new Promise<void>((resolve) => {
      entered = resolve;
    }),
    held = new Promise<void>((resolve) => {
      release = resolve;
    });
  const first = fixture.source.uow.run(async () => {
    entered();
    await held;
    return { commit: true, value: undefined };
  });
  await inside;
  let activated = false;
  const activation = fixture.activateOrganizationIsolation().then(() => {
    activated = true;
  });
  await Promise.resolve();
  expect(activated).toBe(false);
  const creation = fixture.source.stores.workPackages.create(draft(), [], stamp);
  release();
  await first;
  await activation;
  try {
    await expectFailure(creation, 'legacy package creation is inactive');
    expect(await fixture.source.stores.workPackages.findById('package')).toBeNull();
  } finally {
    await fixture.source.close();
  }
});
async function savedFixture(author: string | null = 'creator') {
  const fixture = await opened(true);
  await fixture.source.stores.workPackages.create(draft(), [], stamp);
  await fixture.source.history.savedPlans.write(
    {
      id: 'save',
      workPackageId: 'package',
      name: 'Before',
      createdBy: 'display only',
      createdById: author,
      createdAt: 1,
      input: {
        schemaVersion: 11,
        bytes: 'malformed body deliberately unread by touch',
        sha256: '1'.repeat(64),
      },
      schedule: { present: false, absentReason: 'not_asked' },
    },
    () => Promise.resolve(null),
  );
  return fixture;
}
it.each(['rename', 'delete'] as const)(
  'allows actual legacy author %s without decoding corrupt bodies',
  async (operation) => {
    const fixture = await savedFixture();
    const touch = {
      kind: 'legacy' as const,
      source: 'internal' as const,
      actorId: 'creator',
      operation,
    };
    try {
      expect(
        operation === 'rename'
          ? await fixture.source.history.savedPlans.renameTo('save', 'After', touch)
          : await fixture.source.history.savedPlans.deleteOf('save', touch),
      ).toBe('touched');
    } finally {
      await fixture.source.close();
    }
  },
);
it.each(['other', null])(
  'refuses legacy saved-plan author %s without package-creator authority',
  async (author) => {
    const fixture = await savedFixture(author);
    try {
      expect(
        await fixture.source.history.savedPlans.deleteOf('save', {
          kind: 'legacy',
          source: 'internal',
          actorId: 'creator',
          operation: 'delete',
        }),
      ).toBe('forbidden');
      expect((await fixture.source.history.savedPlans.readOf('save'))?.header.name).toBe('Before');
    } finally {
      await fixture.source.close();
    }
  },
);
it.each(['internal', 'human'] as const)(
  'rechecks actual activation for a retained %s saved-plan touch',
  async (source) => {
    const fixture = await savedFixture();
    const touch = {
      kind: 'legacy' as const,
      source,
      actorId: 'creator',
      operation: 'delete' as const,
    };
    await fixture.activateOrganizationIsolation();
    try {
      expect(await fixture.source.history.savedPlans.deleteOf('save', touch)).toBe(
        source === 'internal' ? 'no_active_organization' : 'organization_context_changed',
      );
      expect((await fixture.source.history.savedPlans.readOf('save'))?.header.name).toBe('Before');
    } finally {
      await fixture.source.close();
    }
  },
);

it('maps a legacy birth to the actual parent organization without inventing scoped creator grants', async () => {
  const fixture = await opened(true);
  try {
    expect(await fixture.source.stores.workPackages.create(draft(), [], stamp)).toMatchObject({
      id: 'package',
      projectId: 'parent',
    });
    expect(
      await fixture.source.stores.workPackages.findInOrganization('package', 'org-a'),
    ).toMatchObject({ id: 'package' });
    expect(
      await fixture.source.stores.workPackages.findInOrganization('package', 'org-b'),
    ).toBeNull();
    expect(fixture.packageCreationEvidence()).toEqual({ grants: [], audits: [] });
  } finally {
    await fixture.source.close();
  }
});

async function expectFailure(pending: unknown, diagnostic: string) {
  let failure: unknown;
  try {
    await Promise.resolve(pending);
  } catch (cause: unknown) {
    failure = cause;
  }
  const messages: string[] = [];
  while (failure instanceof Error) {
    messages.push(failure.message);
    failure = failure.cause;
  }
  expect(messages.join('\n')).toContain(diagnostic);
}

it('refuses a missing rename payload through the real memory history store', async () => {
  const fixture = await savedFixture();
  try {
    await expectFailure(
      Reflect.apply(
        fixture.source.history.savedPlans.renameTo.bind(fixture.source.history.savedPlans),
        undefined,
        [
          'save',
          undefined,
          { kind: 'legacy', source: 'internal', actorId: 'creator', operation: 'rename' },
        ],
      ),
      'saved-plan rename payload is missing',
    );
    expect((await fixture.source.history.savedPlans.readOf('save'))?.header.name).toBe('Before');
  } finally {
    await fixture.source.close();
  }
});
