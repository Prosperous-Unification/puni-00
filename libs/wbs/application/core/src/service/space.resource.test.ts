import { projectRow } from '@wbs/store-memory/project-fixture';
import { inMemorySpaces } from '@wbs/store-memory/space-fixture';
import { describe, expect, it } from 'bun:test';

import { clockOf } from '../ports/clock';
import { LEGACY_ACCESS, type ResourceAccess } from '../ports/organization-access';
import type { ProjectWithAccess } from '../ports/project-store';
import { testClock } from '../testing/clock-fixture';
import {
  ALL_PROJECTS,
  RollUpCache,
  SpaceResource,
  type SpaceResourceOptions,
} from './space.resource';

const scoped = (role: 'member' | 'viewer', organizationId = 'org-a'): ResourceAccess => ({
  kind: 'scoped',
  scope: { organizationId, userId: 'ada', role },
});
const MEMBER = scoped('member');

/** Roll-up collaborators for tests that read no roll-up: any tree read is a fault. */
const noTrees = () => ({
  trees: {
    treeWithin: () => Promise.reject(new Error('this test reads no tree')),
    sharedTreesWithin: () => Promise.resolve({ kind: 'isolated' as const }),
  },
  sequences: { latestSeq: () => Promise.resolve(0) },
  rollUpCache: new RollUpCache(testClock),
});
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
    ['a4', 'org-a'],
    ['b1', 'org-b'],
  ]);
  const spaces = inMemorySpaces(owners, legacy);
  const service = new SpaceResource({
    spaces,
    clock: testClock,
    ...noTrees(),
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
  if ('kind' in created) throw new Error('unexpected access refusal');
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
      ...noTrees(),
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

  describe('a hidden member, over space {a1, a2 hidden, a3}', () => {
    async function hidingA2() {
      const everyone = open(['a1', 'a2', 'a3', 'a4']);
      const id = await spaceWith(everyone.service, MEMBER, ['a1', 'a2', 'a3']);
      const visible = ['a1', 'a3', 'a4'];
      const hiding = new SpaceResource({
        spaces: everyone.spaces,
        clock: testClock,
        ...noTrees(),
        projects: {
          listWithin: () => Promise.resolve(visible.map(readable)),
          readWithin: (projectId) =>
            Promise.resolve(
              visible.includes(projectId) ? { project: readable(projectId), steps: [] } : null,
            ),
        },
      });
      const unchanged = async () => {
        const members = await everyone.spaces.membersOf('org-a', id);
        const space = await everyone.spaces.findIn('org-a', id);
        return { members, revision: space?.revision };
      };
      return { hiding, id, unchanged, before: await unchanged() };
    }
    const notFound = { ok: false, refusal: 'not_found' } as const;

    it('refuses to place a project after it, as if it were not a member', async () => {
      const { hiding, id, unchanged, before } = await hidingA2();
      // Proof, observed 2026-09-29: with the anchor gate removed from
      // `addProject`, this add answered `{ ok: true, value: 25 }`.
      expect(await hiding.addProject('ada', MEMBER, id, 'a4', 'a2')).toEqual(notFound);
      expect(await unchanged()).toEqual(before);
    });

    it('refuses to move it, or to move another after it', async () => {
      const { hiding, id, unchanged, before } = await hidingA2();
      // Proof, observed 2026-09-29: with the member gate removed from
      // `moveProject`, the first move answered `{ ok: true, value: 5 }`;
      // with the anchor gate removed, the second answered `{ ok: true, value: 30 }`.
      expect(await hiding.moveProject('ada', MEMBER, id, 'a2', null)).toEqual(notFound);
      expect(await hiding.moveProject('ada', MEMBER, id, 'a3', 'a2')).toEqual(notFound);
      expect(await unchanged()).toEqual(before);
    });

    it('refuses to remove it', async () => {
      const { hiding, id, unchanged, before } = await hidingA2();
      // Proof, observed 2026-09-29: with the member gate removed from
      // `removeProject`, this remove answered `{ ok: true, value: null }`.
      expect(await hiding.removeProject('ada', MEMBER, id, 'a2')).toEqual(notFound);
      expect(await unchanged()).toEqual(before);
    });

    it('still places, moves and removes around it by visible members', async () => {
      const { hiding, id } = await hidingA2();
      expect(await hiding.addProject('ada', MEMBER, id, 'a4', 'a1')).toMatchObject({ ok: true });
      expect(await hiding.moveProject('ada', MEMBER, id, 'a3', null)).toMatchObject({ ok: true });
      expect(await hiding.removeProject('ada', MEMBER, id, 'a4')).toEqual({
        ok: true,
        value: null,
      });
    });
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

describe('SpaceResource roll-ups', () => {
  /**
   * A space {a1, a2} over controllable trees: `totals` is each project's one
   * root's final total, `seqs` its event sequence, `unavailable` the projects
   * whose engine is down, and `visible` the projects the caller can open.
   */
  async function rolling(visible: readonly string[] = ['a1', 'a2']) {
    let now = 1_000;
    const clock = clockOf({ now: () => now, newId: () => crypto.randomUUID() });
    const totals = new Map([
      ['a1', 3],
      ['a2', 4],
    ]);
    const seqs = new Map([
      ['a1', 1],
      ['a2', 1],
    ]);
    const unavailable = new Set<string>();
    /** Extra in-progress leaves per project, each `[number, endsOn]`. */
    const leaves = new Map<string, [string, string | null][]>();
    let treeReads = 0;
    const spaces = inMemorySpaces(
      new Map([
        ['a1', 'org-a'],
        ['a2', 'org-a'],
      ]),
    );
    const trees = {
      sharedTreesWithin: () => Promise.resolve({ kind: 'isolated' as const }),
      treeWithin: (projectId: string, access: ResourceAccess) => {
        treeReads += 1;
        if (unavailable.has(projectId)) {
          return Promise.resolve({
            kind: 'engine_unavailable',
            error: 'engine_unavailable',
            engine: 'optimized',
          });
        }
        return Promise.resolve({
          workItems: [
            {
              id: `${projectId}-root`,
              parentId: null,
              status: 'on_hold',
              finalTotal: totals.get(projectId) ?? 0,
              dates: { startsOn: '2026-10-01', endsOn: '2026-10-09' },
              estimates: { s1: 1 },
              number: '1',
              name: 'Root',
              assignees: {},
              progress: {},
            },
            ...(leaves.get(projectId) ?? []).map(([number, endsOn]) => ({
              id: `${projectId}-${number}`,
              parentId: null,
              status: 'in_progress',
              finalTotal: 1,
              dates: endsOn === null ? null : { startsOn: '2026-10-01', endsOn },
              estimates: { s1: 1 },
              number,
              name: `Leaf ${number}`,
              assignees: { s1: 'kat' },
              progress: { s1: 'in_progress' },
            })),
          ],
          slices: [],
          steps: [{ id: 's1', name: 'Dev' }],
          // As `treeWithin` does: legacy reads carry the root directory's
          // names, scoped reads the organization's own.
          assignedPeople: [{ id: 'kat', name: access.kind === 'legacy' ? 'Root Kat' : 'Kat' }],
          scheduleError: null,
          waitingForPerson: 0,
          waitingForCapacity: 0,
          // The revision `listWithin` answers for it, as the real tree agrees.
          projectRevision: 0,
          seq: seqs.get(projectId) ?? 0,
        });
      },
    } as unknown as SpaceResourceOptions['trees'];
    const service = new SpaceResource({
      spaces,
      clock,
      trees,
      sequences: { latestSeq: (projectId) => Promise.resolve(seqs.get(projectId) ?? 0) },
      rollUpCache: new RollUpCache(clock),
      projects: {
        listWithin: () => Promise.resolve(visible.map(readable)),
        readWithin: (id) =>
          Promise.resolve(visible.includes(id) ? { project: readable(id), steps: [] } : null),
      },
    });
    const id = await spaceWith(
      new SpaceResource({
        spaces,
        clock,
        ...noTrees(),
        projects: {
          listWithin: () => Promise.resolve(['a1', 'a2'].map(readable)),
          readWithin: (projectId) => Promise.resolve({ project: readable(projectId), steps: [] }),
        },
      }),
      MEMBER,
      ['a1', 'a2'],
    );
    return {
      service,
      id,
      totals,
      seqs,
      unavailable,
      leaves,
      reads: () => treeReads,
      advance: (ms: number) => {
        now += ms;
      },
    };
  }
  const totalOf = (answer: Awaited<ReturnType<SpaceResource['rollUps']>>, projectId: string) => {
    if ('kind' in answer) throw new Error('unexpected access refusal');
    if (!answer.ok) throw new Error(answer.refusal);
    const rolled = answer.value[projectId];
    if (rolled.kind !== 'rolled_up') throw new Error(`${projectId} did not roll up`);
    return rolled.finalTotal;
  };

  it('rolls each requested member up from its tree', async () => {
    const { service, id } = await rolling();
    const answer = await service.rollUps('ada', MEMBER, id, ['a1', 'a2']);
    expect(answer).toMatchObject({
      ok: true,
      value: {
        a1: { kind: 'rolled_up', finalTotal: 3, status: 'on_hold', counts: { estimated: 1 } },
        a2: { kind: 'rolled_up', finalTotal: 4 },
      },
    });
  });

  it("answers a command's new total on the next read, and serves an unchanged one from the cache", async () => {
    const { service, id, totals, seqs, reads } = await rolling();
    expect(totalOf(await service.rollUps('ada', MEMBER, id, ['a1']), 'a1')).toBe(3);
    expect(totalOf(await service.rollUps('ada', MEMBER, id, ['a1']), 'a1')).toBe(3);
    expect(reads()).toBe(1);
    totals.set('a1', 5);
    seqs.set('a1', 2);
    expect(totalOf(await service.rollUps('ada', MEMBER, id, ['a1']), 'a1')).toBe(5);
    expect(reads()).toBe(2);
  });

  it('expires a roll-up after the TTL even at the same sequence', async () => {
    const { service, id, totals, advance } = await rolling();
    expect(totalOf(await service.rollUps('ada', MEMBER, id, ['a1']), 'a1')).toBe(3);
    totals.set('a1', 5);
    advance(299_999);
    expect(totalOf(await service.rollUps('ada', MEMBER, id, ['a1']), 'a1')).toBe(3);
    advance(1);
    expect(totalOf(await service.rollUps('ada', MEMBER, id, ['a1']), 'a1')).toBe(5);
  });

  it('answers no roll-up for a project the caller cannot open', async () => {
    const { service, id } = await rolling(['a1']);
    expect(await service.rollUps('ada', MEMBER, id, ['a2'])).toEqual({
      ok: false,
      refusal: 'not_found',
    });
    expect(await service.rollUps('ada', MEMBER, id, ['a1'])).toMatchObject({ ok: true });
  });

  it('answers not_found for a non-member and for a foreign space', async () => {
    const { service, id } = await rolling(['a1', 'a2', 'a3']);
    expect(await service.rollUps('ada', MEMBER, id, ['a3'])).toEqual({
      ok: false,
      refusal: 'not_found',
    });
    expect(await service.rollUps('ada', scoped('member', 'org-b'), id, ['a1'])).toEqual({
      ok: false,
      refusal: 'not_found',
    });
    expect(await service.rollUps('ada', MEMBER, ALL_PROJECTS, ['a3'])).toMatchObject({
      ok: true,
    });
  });

  it('marks an unavailable engine and never caches it', async () => {
    const { service, id, unavailable, reads } = await rolling();
    unavailable.add('a2');
    expect(await service.rollUps('ada', MEMBER, id, ['a2'])).toEqual({
      ok: true,
      value: { a2: { kind: 'unavailable' } },
    });
    unavailable.delete('a2');
    expect(totalOf(await service.rollUps('ada', MEMBER, id, ['a2']), 'a2')).toBe(4);
    expect(reads()).toBe(2);
  });

  it('lists the leaves in progress across readable members, by end date then place then number', async () => {
    const { service, id, leaves } = await rolling();
    leaves.set('a1', [
      ['2', '2026-10-09'],
      ['1', null],
    ]);
    leaves.set('a2', [['1', '2026-10-05']]);
    const answer = await service.inProgress('ada', MEMBER, id, 200);
    if ('kind' in answer) throw new Error('unexpected access refusal');
    if (!answer.ok) throw new Error(answer.refusal);
    expect(answer.value.truncated).toBe(false);
    expect(answer.value.items.map(({ projectId, number }) => `${projectId}/${number}`)).toEqual([
      'a2/1',
      'a1/2',
      'a1/1',
    ]);
    expect(answer.value.items[0]).toMatchObject({
      projectName: 'a2',
      name: 'Leaf 1',
      step: { id: 's1', name: 'Dev' },
      assignees: [{ id: 'kat', name: 'Kat' }],
    });
  });

  it('cuts the list at the limit and says it was cut', async () => {
    const { service, id, leaves } = await rolling();
    leaves.set(
      'a1',
      Array.from({ length: 1_001 }, (_, at): [string, string | null] => [String(at + 1), null]),
    );
    const answer = await service.inProgress('ada', MEMBER, id, 1_000);
    if ('kind' in answer) throw new Error('unexpected access refusal');
    if (!answer.ok) throw new Error(answer.refusal);
    expect(answer.value.items).toHaveLength(1_000);
    expect(answer.value.truncated).toBe(true);
    const whole = await service.inProgress('ada', MEMBER, id, 1_001);
    expect(whole).toMatchObject({ ok: true, value: { truncated: false } });
  });

  it('takes nothing from a member the caller cannot open, and names unavailable engines', async () => {
    const { service, id, leaves } = await rolling(['a1']);
    leaves.set('a2', [['1', '2026-10-05']]);
    leaves.set('a1', [['1', '2026-10-06']]);
    expect(await service.inProgress('ada', MEMBER, id, 200)).toMatchObject({
      ok: true,
      value: { items: [{ projectId: 'a1' }], unavailable: [] },
    });
    const fresh = await rolling(['a1']);
    fresh.unavailable.add('a1');
    expect(await fresh.service.inProgress('ada', MEMBER, fresh.id, 200)).toMatchObject({
      ok: true,
      value: { items: [], unavailable: ['a1'] },
    });
  });

  it("keeps a legacy read's assignee names from a scoped reader", async () => {
    const { service, leaves } = await rolling();
    leaves.set('a1', [['1', '2026-10-05']]);
    const namesOf = async (access: ResourceAccess) => {
      const answer = await service.inProgress('ada', access, ALL_PROJECTS, 200);
      if ('kind' in answer) throw new Error('unexpected access refusal');
      if (!answer.ok) throw new Error(answer.refusal);
      return answer.value.items.flatMap(({ assignees }) => assignees.map(({ name }) => name));
    };
    expect(await namesOf(LEGACY_ACCESS)).toEqual(['Root Kat']);
    expect(await namesOf(MEMBER)).toEqual(['Kat']);
  });

  it('names no unavailable engine of a member the caller cannot open', async () => {
    const { service, id, unavailable } = await rolling(['a1']);
    unavailable.add('a2');
    expect(await service.inProgress('ada', MEMBER, id, 200)).toMatchObject({
      ok: true,
      value: { unavailable: [] },
    });
  });
});
