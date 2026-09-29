import { projectRow } from '@wbs/store-memory/project-fixture';
import { inMemorySpaces } from '@wbs/store-memory/space-fixture';
import { describe, expect, it } from 'bun:test';

import { LEGACY_ACCESS, type ResourceAccess } from '../ports/organization-access';
import type { ProjectWithAccess } from '../ports/project-store';
import { testClock } from '../testing/clock-fixture';
import { ALL_PROJECTS, SpaceResource } from './space.resource';

const scoped = (role: 'member' | 'viewer', organizationId = 'org-a'): ResourceAccess => ({
  kind: 'scoped',
  scope: { organizationId, userId: 'ada', role },
});
const MEMBER = scoped('member');
const VIEWER = scoped('viewer');

const readable = (id: string): ProjectWithAccess => ({
  ...projectRow({ id, name: id, ownerId: 'ada' }),
  ownerName: 'ada',
  lastOpenedAt: null,
});

/**
 * A service over the memory store, whose project predicate answers only
 * `visible`: the stand-in for a future read restriction the space must obey.
 */
function open(visible: readonly string[], legacy: string | null = null) {
  const owners = new Map([
    ['a1', 'org-a'],
    ['a2', 'org-a'],
    ['a3', 'org-a'],
    ['b1', 'org-b'],
  ]);
  const spaces = inMemorySpaces(owners, legacy);
  const service = new SpaceResource({
    spaces,
    clock: testClock,
    projects: {
      listWithin: () => Promise.resolve(visible.map(readable)),
      readWithin: (id) =>
        Promise.resolve(visible.includes(id) ? { project: readable(id), steps: [] } : null),
    },
  });
  return { service, spaces };
}

async function spaceWith(
  service: SpaceResource,
  access: ResourceAccess,
  projectIds: readonly string[],
): Promise<string> {
  const created = await service.create('ada', access, 'Q3');
  if (!created.ok) throw new Error(`create refused: ${created.refusal}`);
  let after: string | null = null;
  for (const projectId of projectIds) {
    const added = await service.addProject('ada', access, created.value.id, projectId, after);
    if (!added.ok) throw new Error(`add refused: ${added.refusal}`);
    after = projectId;
  }
  return created.value.id;
}

describe('SpaceResource', () => {
  it('omits a project the caller cannot open from the rows and the count', async () => {
    const everyone = open(['a1', 'a2', 'a3']);
    const id = await spaceWith(everyone.service, MEMBER, ['a1', 'a2', 'a3']);
    const hiding = new SpaceResource({
      spaces: everyone.spaces,
      clock: testClock,
      projects: {
        listWithin: () => Promise.resolve(['a1', 'a3'].map(readable)),
        readWithin: () => Promise.resolve(null),
      },
    });
    const read = await hiding.read('ada', MEMBER, id);
    if (!read.ok) throw new Error(read.refusal);
    expect(read.value.rows.map(({ project }) => project.id)).toEqual(['a1', 'a3']);
    expect(read.value.space.projectCount).toBe(2);
    const listed = await hiding.list('ada', MEMBER);
    expect(listed).toMatchObject({ ok: true, value: [{ id, projectCount: 2 }] });
  });

  it('answers a project the caller cannot open as not_found, adding nothing', async () => {
    const { service } = open(['a1']);
    const id = await spaceWith(service, MEMBER, []);
    expect(await service.addProject('ada', MEMBER, id, 'a2', null)).toEqual({
      ok: false,
      refusal: 'not_found',
    });
    const read = await service.read('ada', MEMBER, id);
    expect(read).toMatchObject({ ok: true, value: { rows: [] } });
  });

  it("answers another organization's space as not_found to its members", async () => {
    const { service } = open(['a1', 'b1']);
    const id = await spaceWith(service, MEMBER, ['a1']);
    const foreign = scoped('member', 'org-b');
    expect(await service.read('ada', foreign, id)).toEqual({ ok: false, refusal: 'not_found' });
    expect(await service.rename('ada', foreign, id, 'Mine')).toEqual({
      ok: false,
      refusal: 'not_found',
    });
    expect(await service.remove(foreign, id)).toEqual({ ok: false, refusal: 'not_found' });
    expect(await service.list('ada', foreign)).toEqual({ ok: true, value: [] });
  });

  it('refuses a viewer every write and lets the viewer read', async () => {
    const { service } = open(['a1', 'a2']);
    const id = await spaceWith(service, MEMBER, ['a1']);
    const forbidden = { ok: false, refusal: 'forbidden' } as const;
    expect(await service.create('vic', VIEWER, 'Mine')).toEqual(forbidden);
    expect(await service.rename('vic', VIEWER, id, 'Mine')).toEqual(forbidden);
    expect(await service.addProject('vic', VIEWER, id, 'a2', null)).toEqual(forbidden);
    expect(await service.moveProject('vic', VIEWER, id, 'a1', null)).toEqual(forbidden);
    expect(await service.removeProject('vic', VIEWER, id, 'a1')).toEqual(forbidden);
    expect(await service.remove(VIEWER, id)).toEqual(forbidden);
    expect(await service.read('vic', VIEWER, id)).toMatchObject({
      ok: true,
      value: { rows: [{ project: { id: 'a1' } }] },
    });
  });

  it('answers every write to all as virtual_space and reads all as the project list', async () => {
    const { service } = open(['a2', 'a1']);
    const virtual = { ok: false, refusal: 'virtual_space' } as const;
    expect(await service.rename('ada', MEMBER, ALL_PROJECTS, 'Mine')).toEqual(virtual);
    expect(await service.remove(MEMBER, ALL_PROJECTS)).toEqual(virtual);
    expect(await service.addProject('ada', MEMBER, ALL_PROJECTS, 'a1', null)).toEqual(virtual);
    expect(await service.moveProject('ada', MEMBER, ALL_PROJECTS, 'a1', null)).toEqual(virtual);
    expect(await service.removeProject('ada', MEMBER, ALL_PROJECTS, 'a1')).toEqual(virtual);
    expect(await service.read('ada', MEMBER, ALL_PROJECTS)).toMatchObject({
      ok: true,
      value: {
        space: { id: ALL_PROJECTS, virtual: true, projectCount: 2, createdById: null },
        rows: [
          { project: { id: 'a2' }, position: 10 },
          { project: { id: 'a1' }, position: 20 },
        ],
      },
    });
  });

  it('uses the legacy organization under legacy access, and answers organization_required without one', async () => {
    const withLegacy = open(['a1'], 'org-a');
    const id = await spaceWith(withLegacy.service, LEGACY_ACCESS, ['a1']);
    expect(await withLegacy.service.list('ada', LEGACY_ACCESS)).toMatchObject({
      ok: true,
      value: [{ id, projectCount: 1 }],
    });

    const without = open(['a1']);
    const required = { ok: false, refusal: 'organization_required' } as const;
    expect(await without.service.list('ada', LEGACY_ACCESS)).toEqual(required);
    expect(await without.service.create('ada', LEGACY_ACCESS, 'Q3')).toEqual(required);
    expect(await without.service.read('ada', LEGACY_ACCESS, 'any')).toEqual(required);
    expect(await without.service.read('ada', LEGACY_ACCESS, ALL_PROJECTS)).toMatchObject({
      ok: true,
    });
  });

  it('trims a name and refuses a blank or over-long one', async () => {
    const { service } = open([]);
    expect(await service.create('ada', MEMBER, '  Q3 ')).toMatchObject({
      ok: true,
      value: { name: 'Q3', revision: 0, virtual: false, createdById: 'ada' },
    });
    const malformed = { ok: false, refusal: 'malformed_name' } as const;
    expect(await service.create('ada', MEMBER, '   ')).toEqual(malformed);
    expect(await service.create('ada', MEMBER, 'x'.repeat(121))).toEqual(malformed);
    expect(await service.create('ada', MEMBER, '🚀'.repeat(120))).toMatchObject({ ok: true });
    expect(await service.create('ada', MEMBER, 'Q3')).toEqual({
      ok: false,
      refusal: 'name_taken',
    });
  });

  it('counts revisions: rename, two adds and a move, not a refused add', async () => {
    const { service } = open(['a1', 'a2']);
    const created = await service.create('ada', MEMBER, 'Q3');
    if (!created.ok) throw new Error(created.refusal);
    const id = created.value.id;
    await service.rename('ada', MEMBER, id, 'Q4');
    await service.addProject('ada', MEMBER, id, 'a1', null);
    await service.addProject('ada', MEMBER, id, 'a2', 'a1');
    await service.moveProject('ada', MEMBER, id, 'a2', null);
    expect(await service.addProject('ada', MEMBER, id, 'a1', null)).toEqual({
      ok: false,
      refusal: 'already_in_space',
    });
    const read = await service.read('ada', MEMBER, id);
    expect(read).toMatchObject({
      ok: true,
      value: { space: { name: 'Q4', revision: 4 }, rows: [{ project: { id: 'a2' } }, {}] },
    });
  });
});
