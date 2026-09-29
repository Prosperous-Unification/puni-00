import type { SpaceStore, WriteStamp } from '@wbs/core';
import { expect, it } from 'bun:test';

/**
 * What a source hands {@link spaceStoreConformance}: a store over two
 * organizations, `a` owning `a1`–`a4` and `b` owning `b1`, and an author who
 * exists in both.
 */
export interface SpaceStoreFixture {
  store: SpaceStore;
  organizations: { a: string; b: string };
  projects: { a: readonly [string, string, string, string]; b: string };
  stamp: WriteStamp;
}

/**
 * The {@link SpaceStore} contract as cases a source passes or fails, called
 * inside a `describe` the caller owns after its `beforeEach` has opened a
 * fresh fixture. Mirrors `unitOfWorkConformance`.
 */
export function spaceStoreConformance(open: () => SpaceStoreFixture): void {
  const order = async (fixture: SpaceStoreFixture, spaceId: string) =>
    (await fixture.store.membersOf(fixture.organizations.a, spaceId))?.map(
      ({ projectId }) => projectId,
    );
  const created = async (fixture: SpaceStoreFixture, id: string, name: string) => {
    const written = await fixture.store.create(
      { id, organizationId: fixture.organizations.a, name },
      fixture.stamp,
    );
    if (!written.ok) throw new Error(`could not create ${name}: ${written.reason}`);
    return written.space;
  };

  it('creates, lists by name, renames and removes a space within its organization', async () => {
    const fixture = open();
    const { a, b } = fixture.organizations;
    const q3 = await created(fixture, 's-2', 'Q3');
    expect(q3).toEqual({
      id: 's-2',
      organizationId: a,
      name: 'Q3',
      revision: 0,
      createdBy: fixture.stamp.by,
      createdAt: fixture.stamp.at,
    });
    await created(fixture, 's-1', 'Launch');
    expect((await fixture.store.listIn(a)).map(({ name }) => name)).toEqual(['Launch', 'Q3']);
    expect(await fixture.store.listIn(b)).toEqual([]);

    expect(await fixture.store.rename(a, 's-2', 'Q4', fixture.stamp)).toEqual({
      ok: true,
      space: { ...q3, name: 'Q4', revision: 1 },
    });
    expect(await fixture.store.remove(a, 's-2')).toBe(true);
    expect(await fixture.store.findIn(a, 's-2')).toBeNull();
    expect(await fixture.store.remove(a, 's-2')).toBe(false);
  });

  it('refuses a name twice in one organization and allows it in another', async () => {
    const fixture = open();
    const { a, b } = fixture.organizations;
    await created(fixture, 's-1', 'Q3');
    await created(fixture, 's-2', 'Launch');
    expect(
      await fixture.store.create({ id: 's-3', organizationId: a, name: 'Q3' }, fixture.stamp),
    ).toEqual({ ok: false, reason: 'name_taken' });
    expect(await fixture.store.rename(a, 's-2', 'Q3', fixture.stamp)).toEqual({
      ok: false,
      reason: 'name_taken',
    });
    expect((await fixture.store.findIn(a, 's-2'))?.name).toBe('Launch');
    expect(
      (await fixture.store.create({ id: 's-3', organizationId: b, name: 'Q3' }, fixture.stamp)).ok,
    ).toBe(true);
  });

  it("answers another organization's space as absent to every method", async () => {
    const fixture = open();
    const { b } = fixture.organizations;
    const [a1] = fixture.projects.a;
    await created(fixture, 's-1', 'Q3');
    expect(
      await fixture.store.addProject(fixture.organizations.a, 's-1', a1, null, fixture.stamp),
    ).toEqual({ ok: true, position: 10 });

    expect(await fixture.store.findIn(b, 's-1')).toBeNull();
    expect(await fixture.store.membersOf(b, 's-1')).toBeNull();
    expect(await fixture.store.rename(b, 's-1', 'Mine', fixture.stamp)).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(
      await fixture.store.addProject(b, 's-1', fixture.projects.b, null, fixture.stamp),
    ).toEqual({ ok: false, reason: 'not_found' });
    expect(await fixture.store.moveProject(b, 's-1', a1, null, fixture.stamp)).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(await fixture.store.removeProject(b, 's-1', a1, fixture.stamp)).toBe(false);
    expect(await fixture.store.remove(b, 's-1')).toBe(false);
    expect(await order(fixture, 's-1')).toEqual([a1]);
  });

  it('refuses a project another organization owns, storing nothing', async () => {
    const fixture = open();
    await created(fixture, 's-1', 'Q3');
    expect(
      await fixture.store.addProject(
        fixture.organizations.a,
        's-1',
        fixture.projects.b,
        null,
        fixture.stamp,
      ),
    ).toEqual({ ok: false, reason: 'not_found' });
    expect(await order(fixture, 's-1')).toEqual([]);
    expect((await fixture.store.findIn(fixture.organizations.a, 's-1'))?.revision).toBe(0);
  });

  it('places after a member, first on null, and refuses a duplicate or a stranger', async () => {
    const fixture = open();
    const { a } = fixture.organizations;
    const [a1, a2, a3, a4] = fixture.projects.a;
    await created(fixture, 's-1', 'Q3');
    await fixture.store.addProject(a, 's-1', a1, null, fixture.stamp);
    await fixture.store.addProject(a, 's-1', a2, a1, fixture.stamp);
    expect(await fixture.store.addProject(a, 's-1', a3, a1, fixture.stamp)).toEqual({
      ok: true,
      position: 15,
    });
    expect(await order(fixture, 's-1')).toEqual([a1, a3, a2]);
    expect(await fixture.store.addProject(a, 's-1', a4, null, fixture.stamp)).toEqual({
      ok: true,
      position: 5,
    });
    expect(await order(fixture, 's-1')).toEqual([a4, a1, a3, a2]);

    expect(await fixture.store.addProject(a, 's-1', a2, null, fixture.stamp)).toEqual({
      ok: false,
      reason: 'already_in_space',
    });
    await fixture.store.removeProject(a, 's-1', a4, fixture.stamp);
    expect(await fixture.store.addProject(a, 's-1', a4, 'not-a-member', fixture.stamp)).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(await order(fixture, 's-1')).toEqual([a1, a3, a2]);
    expect((await fixture.store.findIn(a, 's-1'))?.revision).toBe(5);
  });

  it('respaces the group when neighbours leave no gap', async () => {
    const fixture = open();
    const { a } = fixture.organizations;
    const [a1, a2, a3, a4] = fixture.projects.a;
    await created(fixture, 's-1', 'Q3');
    await fixture.store.addProject(a, 's-1', a1, null, fixture.stamp); // 10
    await fixture.store.addProject(a, 's-1', a2, a1, fixture.stamp); // 20
    await fixture.store.addProject(a, 's-1', a3, a1, fixture.stamp); // 15
    await fixture.store.moveProject(a, 's-1', a2, a1, fixture.stamp); // 12
    await fixture.store.moveProject(a, 's-1', a3, a1, fixture.stamp); // 11
    expect(await fixture.store.addProject(a, 's-1', a4, a1, fixture.stamp)).toEqual({
      ok: true,
      position: 20,
    });
    expect(await fixture.store.membersOf(a, 's-1')).toEqual([
      { projectId: a1, position: 10 },
      { projectId: a4, position: 20 },
      { projectId: a3, position: 30 },
      { projectId: a2, position: 40 },
    ]);
  });

  it('moves a member and refuses a move of a stranger or after a stranger', async () => {
    const fixture = open();
    const { a } = fixture.organizations;
    const [a1, a2, a3] = fixture.projects.a;
    await created(fixture, 's-1', 'Q3');
    await fixture.store.addProject(a, 's-1', a1, null, fixture.stamp);
    await fixture.store.addProject(a, 's-1', a2, a1, fixture.stamp);
    await fixture.store.addProject(a, 's-1', a3, a2, fixture.stamp);
    expect(await fixture.store.moveProject(a, 's-1', a3, null, fixture.stamp)).toEqual({
      ok: true,
      position: 5,
    });
    expect(await order(fixture, 's-1')).toEqual([a3, a1, a2]);
    expect(await fixture.store.moveProject(a, 's-1', a1, a2, fixture.stamp)).toEqual({
      ok: true,
      position: 30,
    });
    expect(await order(fixture, 's-1')).toEqual([a3, a2, a1]);
    expect(await fixture.store.moveProject(a, 's-1', a1, a1, fixture.stamp)).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(
      await fixture.store.moveProject(a, 's-1', fixture.projects.a[3], null, fixture.stamp),
    ).toEqual({ ok: false, reason: 'not_found' });
    expect(await order(fixture, 's-1')).toEqual([a3, a2, a1]);
  });

  it('keeps one project in many spaces, and removing a space changes no other', async () => {
    const fixture = open();
    const { a } = fixture.organizations;
    const [a1] = fixture.projects.a;
    await created(fixture, 's-1', 'Q3');
    await created(fixture, 's-2', 'Launch');
    await fixture.store.addProject(a, 's-1', a1, null, fixture.stamp);
    await fixture.store.addProject(a, 's-2', a1, null, fixture.stamp);
    expect(await fixture.store.remove(a, 's-1')).toBe(true);
    expect(await fixture.store.membersOf(a, 's-1')).toBeNull();
    expect(await fixture.store.membersOf(a, 's-2')).toEqual([{ projectId: a1, position: 10 }]);
  });
}
