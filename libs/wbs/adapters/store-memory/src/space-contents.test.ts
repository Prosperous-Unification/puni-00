import { expect, test } from 'bun:test';

import { openMemorySourceFixture } from './source';

const stamp = { at: 100, by: 'space-owner' };

async function expectClosed(operation: () => Promise<unknown>): Promise<void> {
  const answer = await operation().then(
    () => ({ kind: 'answered' }) as const,
    (cause: unknown) => ({ kind: 'failed', cause }) as const,
  );
  expect(answer.kind).toBe('failed');
  if (answer.kind === 'failed') expect(String(answer.cause)).toContain('closed');
}

async function fixture() {
  const fixture = openMemorySourceFixture();
  fixture.addOrganization('space-org', { legacy: false });
  const source = fixture.source;
  await source.stores.users.create(
    { id: stamp.by, username: 'space-owner', passwordHash: 'fixture', createdAt: 1 },
    stamp,
  );
  const spaces = source.stores.spaces;
  if (spaces === undefined) throw new Error('actual Memory Source lacks spaces');
  await source.stores.directory.addTeam({ id: 'space-team', name: 'Service team' }, stamp);
  expect(
    await source.stores.directory.addPerson({ id: 'space-person', name: 'Person' }, [], stamp),
  ).toMatchObject({ ok: true });
  fixture.ownResourceInOrganization('space-person', 'space-org');
  fixture.ownResourceInOrganization('space-team', 'space-org');
  expect(
    await spaces.create({ id: 'space-a', organizationId: 'space-org', name: 'Department' }, stamp),
  ).toMatchObject({ ok: true });
  return {
    source,
    spaces,
    evidence: fixture.stepCatalogueEvidence.bind(fixture),
    own: fixture.ownResourceInOrganization.bind(fixture),
  };
}

test('actual Memory space memberships refuse a different directory identity kind', async () => {
  const { source, spaces } = await fixture();
  try {
    expect(await spaces.addPerson('space-org', 'space-a', 'space-team', stamp)).toBe(false);
    expect(await spaces.addTeam('space-org', 'space-a', 'space-person', stamp)).toBe(false);
    expect(await spaces.peopleOf('space-org', 'space-a')).toEqual([]);
    expect(await spaces.teamsOf('space-org', 'space-a')).toEqual([]);
  } finally {
    await source.close();
  }
});

test('actual Memory space contents stay committed while a loan observes its staged memberships', async () => {
  const { source, spaces } = await fixture();
  try {
    const before = await spaces.readContents('space-org', 'space-a');
    expect(before).toMatchObject({
      space: { revision: 0 },
      projects: [],
      personIds: [],
      serviceTeamIds: [],
    });
    const borrowed = await source.uow.run(async ({ stores }) => {
      if (stores.spaces === undefined) throw new Error('actual Memory loan lacks spaces');
      expect(await stores.spaces.addPerson('space-org', 'space-a', 'space-person', stamp)).toBe(
        true,
      );
      expect(await stores.spaces.readContents('space-org', 'space-a')).toMatchObject({
        space: { revision: 1 },
        personIds: ['space-person'],
        serviceTeamIds: [],
      });
      expect(await spaces.readContents('space-org', 'space-a')).toEqual(before);
      return { commit: false, value: stores.spaces };
    });
    expect(await spaces.readContents('space-org', 'space-a')).toEqual(before);
    await expectClosed(() => borrowed.readContents('space-org', 'space-a'));
  } finally {
    await source.close();
  }
});

test('actual Memory space contents are detached and retained methods reject Source closure', async () => {
  const { source, spaces } = await fixture();
  try {
    expect(await spaces.addPerson('space-org', 'space-a', 'space-person', stamp)).toBe(true);
    const captured = await spaces.readContents('space-org', 'space-a');
    expect(captured).toMatchObject({ personIds: ['space-person'] });
    expect(await spaces.removePerson('space-org', 'space-a', 'space-person', stamp)).toBe(true);
    expect(captured).toMatchObject({ space: { revision: 1 }, personIds: ['space-person'] });
    const read = spaces.readContents.bind(spaces);
    await source.close();
    await expectClosed(() => read('space-org', 'space-a'));
  } finally {
    await source.close();
  }
});

test('actual Memory space writes after Source close change no committed table', async () => {
  const { source, spaces, evidence } = await fixture();
  try {
    const before = evidence();
    await source.close();
    await expectClosed(() => spaces.addPerson('space-org', 'space-a', 'space-person', stamp));
    expect(evidence()).toEqual(before);
  } finally {
    await source.close();
  }
});

test('actual Memory space contents reject Source closure during their continuation', async () => {
  const { source, spaces } = await fixture();
  try {
    const pending = spaces.readContents('space-org', 'space-a').then(
      (contents) => ({ kind: 'answered', contents }) as const,
      (cause: unknown) => ({ kind: 'failed', cause }) as const,
    );
    await source.close();
    const answer = await pending;
    expect(answer.kind).toBe('failed');
    if (answer.kind === 'failed') expect(String(answer.cause)).toContain('closed');
  } finally {
    await source.close();
  }
});

test('actual Memory space contents list person identities in binary byte order', async () => {
  const { source, spaces, own } = await fixture();
  try {
    for (const id of ['z', '\u{10000}', '\ue000', 'aa', 'a']) {
      expect(await source.stores.directory.addPerson({ id, name: id }, [], stamp)).toMatchObject({
        ok: true,
      });
      own(id, 'space-org');
      expect(await spaces.addPerson('space-org', 'space-a', id, stamp)).toBe(true);
    }
    expect(await spaces.readContents('space-org', 'space-a')).toMatchObject({
      personIds: ['a', 'aa', 'z', '\ue000', '\u{10000}'],
      serviceTeamIds: [],
    });
  } finally {
    await source.close();
  }
});

for (const settlement of ['commit', 'rollback', 'repair'] as const) {
  test('actual Memory space contents expire the ' + settlement + ' owner', async () => {
    const { source } = await fixture();
    let retainedRepair: typeof source.stores.spaces;
    try {
      const borrowed = await source.uow.run(async ({ stores }) => {
        if (stores.spaces === undefined) throw new Error('actual Memory loan lacks spaces');
        const selected = stores.spaces;
        expect(await selected.readContents('space-org', 'space-a')).toMatchObject({
          space: { name: 'Department' },
        });
        return {
          commit: settlement === 'commit',
          value: selected,
          ...(settlement === 'repair'
            ? {
                afterRollback: async (repair: { stores: typeof stores }) => {
                  if (repair.stores.spaces === undefined)
                    throw new Error('actual Memory repair lacks spaces');
                  expect(
                    await repair.stores.spaces.readContents('space-org', 'space-a'),
                  ).toMatchObject({ space: { name: 'Department' } });
                  retainedRepair = repair.stores.spaces;
                },
              }
            : {}),
        };
      });
      await expectClosed(() => borrowed.readContents('space-org', 'space-a'));
      if (settlement === 'repair') {
        const repair = retainedRepair;
        if (repair === undefined) throw new Error('actual repair did not run');
        await expectClosed(() => repair.readContents('space-org', 'space-a'));
      }
    } finally {
      await source.close();
    }
  });
}
