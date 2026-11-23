import type { Permission } from '@wbs/domain';
import { inMemorySpaces, memorySpaceTables } from '@wbs/store-memory/space-fixture';
import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { describe, expect, it } from 'bun:test';

import type { AccessDecisions } from '../ports/access-decisions';
import { clockOf } from '../ports/clock';
import { LEGACY_ACCESS, type ResourceAccess } from '../ports/organization-access';
import type { WorkPackageWithAccess } from '../ports/work-package-store';
import { recordingBroadcaster } from '../testing/broadcast-fixture';
import { testClock } from '../testing/clock-fixture';
import {
  ALL_WORK_PACKAGES,
  RollUpCache,
  SpaceResource,
  type SpaceResourceOptions,
} from './space.resource';

const scoped = (
  userId: string,
  role: 'member' | 'viewer',
  organizationId = 'org-a',
): ResourceAccess => ({
  principal: { id: userId },
  kind: 'scoped',
  scope: { cap: null, organizationId, userId },
});
const MEMBER = scoped('ada', 'member');

/** Explicit grants of this fixture's two subjects in its two organizations; roles confer no authority. */
const spacePermissions = new Map<string, ReadonlySet<Permission>>([
  ['org-a:ada', new Set<Permission>(['organization.manage_spaces'])],
  ['org-b:ada', new Set<Permission>(['organization.manage_spaces'])],
  ['org-a:vic', new Set<Permission>()],
  ['org-b:vic', new Set<Permission>()],
]);
const spaceAccessDecisions: AccessDecisions = {
  packageTargetOf: () =>
    Promise.reject(new Error('space fixture addresses projects rather than packages')),
  effectiveRoleAt: (principal, target) => {
    if (target.kind !== 'organization')
      throw new Error('space fixture expects an organization target');
    const permissions = spacePermissions.get(target.organizationId + ':' + principal.id);
    if (permissions === undefined)
      throw new Error('space fixture has no explicit subject/scope grant set');
    return Promise.resolve({ permissions, via: [] });
  },
  readablePackageIds: () =>
    Promise.reject(new Error('space writes do not list readable package ids')),
};

const projectTablesOf = (owners: ReadonlyMap<string, string>, legacy: string | null = null) => ({
  ...memorySpaceTables(
    new Map(
      [...owners].map(([id, organizationId]) => [
        id,
        {
          organizationId,
          spaceId: null as string | null,
          spacePosition: null as number | null,
          revision: 0,
        },
      ]),
    ),
    new Map([
      ['org-a', { legacy: legacy === 'org-a' }],
      ['org-b', { legacy: legacy === 'org-b' }],
    ]),
  ),
  packages: new Map(
    [...owners.keys()].map((id) => [id, workPackageRow({ id, name: id, projectId: id })]),
  ),
});
const projectTargetsOf = (
  tables: ReturnType<typeof projectTablesOf>,
): SpaceResourceOptions['settings'] => ({
  touchPackages: (target) => {
    if (target.kind !== 'project')
      throw new Error('space fixture invalidates only its actual projects');
    const row = tables.packages.get(target.chain.projectId);
    if (row === undefined) throw new Error('space fixture project has no declared package');
    tables.packages.set(row.id, { ...row, revision: row.revision + 1 });
    return Promise.resolve([
      {
        workPackageId: row.id,
        event: {
          type: 'work_package_settings_changed',
          optimizationEnabled: row.optimizationEnabled,
          scheduleEngine: row.scheduleEngine,
          scheduleObjective: row.scheduleObjective,
        },
      },
    ]);
  },
  readTarget: (scope, organizationId) => {
    const row = tables.projects.get(scope.id);
    if (row === undefined || (organizationId !== null && row.organizationId !== organizationId))
      return Promise.resolve(null);
    return Promise.resolve({
      kind: 'project',
      chain: {
        level: 'project',
        projectId: scope.id,
        spaceId: row.spaceId,
        organizationId: row.organizationId,
      },
    });
  },
});
const spaceDecisions = (visible: readonly string[]): AccessDecisions => ({
  ...spaceAccessDecisions,
  effectiveRoleAt: (principal, target) =>
    target.kind === 'project'
      ? Promise.resolve(
          visible.includes(target.chain.projectId)
            ? { permissions: new Set<Permission>(['project.read']), via: [] }
            : null,
        )
      : spaceAccessDecisions.effectiveRoleAt(principal, target),
});

/** Roll-up collaborators for tests that read no roll-up: any tree read is a fault. */
const noTrees = () => ({
  trees: {
    treeWithin: () => Promise.reject(new Error('this test reads no tree')),
    sharedTreesWithin: () => Promise.resolve({ kind: 'isolated' as const }),
  },
  sequences: { latestSeq: () => Promise.resolve(0) },
  rollUpCache: new RollUpCache(testClock),
});
const VIEWER = scoped('vic', 'viewer');

const readable = (id: string): WorkPackageWithAccess & { timezone: string } => ({
  ...workPackageRow({ id, name: id, projectId: id }),
  createdByName: 'ada',
  lastOpenedAt: null,
  updatedAt: null,
  timezone: 'UTC',
});

/**
 * A service over the memory store, whose work package predicate answers only
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
  const tables = projectTablesOf(owners, legacy);
  const targets = projectTargetsOf(tables);
  const spaces = inMemorySpaces(tables);
  const service = new SpaceResource({
    accessDecisions: spaceDecisions(visible),
    settings: targets,
    announcements: recordingBroadcaster(),
    spaces,
    clock: testClock,
    ...noTrees(),
    workPackages: {
      listWithin: () => Promise.resolve(visible.map(readable)),
      readWithin: (id) =>
        Promise.resolve(visible.includes(id) ? { workPackage: readable(id), steps: [] } : null),
    },
  });
  return { service, spaces, targets };
}

async function spaceWith(
  service: SpaceResource,
  access: ResourceAccess,
  workPackageIds: readonly string[],
): Promise<string> {
  const created = await service.create('ada', access, 'Q3');
  if ('kind' in created) throw new Error('unexpected access refusal');
  if (!created.ok) throw new Error(`create refused: ${created.refusal}`);
  let after: string | null = null;
  for (const workPackageId of workPackageIds) {
    const added = await service.addProject('ada', access, created.value.id, workPackageId, after);
    if (!added.ok) throw new Error(`add refused: ${added.refusal}`);
    after = workPackageId;
  }
  return created.value.id;
}

describe('SpaceResource', () => {
  it('omits a work package the caller cannot open from the rows and the count', async () => {
    const everyone = open(['a1', 'a2', 'a3']);
    const id = await spaceWith(everyone.service, MEMBER, ['a1', 'a2', 'a3']);
    const hiding = new SpaceResource({
      accessDecisions: spaceAccessDecisions,
      settings: everyone.targets,
      announcements: recordingBroadcaster(),
      spaces: everyone.spaces,
      clock: testClock,
      ...noTrees(),
      workPackages: {
        listWithin: () => Promise.resolve(['a1', 'a3'].map(readable)),
        readWithin: () => Promise.resolve(null),
      },
    });
    const read = await hiding.read('ada', MEMBER, id);
    if (!read.ok) throw new Error(read.refusal);
    expect(read.value.rows.map(({ workPackage }) => workPackage.id)).toEqual(['a1', 'a3']);
    expect(read.value.space.workPackageCount).toBe(2);
    const listed = await hiding.list('ada', MEMBER);
    expect(listed).toMatchObject({ ok: true, value: [{ id, workPackageCount: 2 }] });
  });

  it('answers a work package the caller cannot open as not_found, adding nothing', async () => {
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
        accessDecisions: spaceDecisions(visible),
        settings: everyone.targets,
        announcements: recordingBroadcaster(),
        spaces: everyone.spaces,
        clock: testClock,
        ...noTrees(),
        workPackages: {
          listWithin: () => Promise.resolve(visible.map(readable)),
          readWithin: (workPackageId) =>
            Promise.resolve(
              visible.includes(workPackageId)
                ? { workPackage: readable(workPackageId), steps: [] }
                : null,
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

    it('refuses to place a work package after it, as if it were not a member', async () => {
      const { hiding, id, unchanged, before } = await hidingA2();
      // Proof, observed 2026-09-29: with the anchor gate removed from
      // `addWorkPackage`, this add answered `{ ok: true, value: 25 }`.
      expect(await hiding.addProject('ada', MEMBER, id, 'a4', 'a2')).toEqual(notFound);
      expect(await unchanged()).toEqual(before);
    });

    it('refuses to move it, or to move another after it', async () => {
      const { hiding, id, unchanged, before } = await hidingA2();
      // Proof, observed 2026-09-29: with the member gate removed from
      // `moveWorkPackage`, the first move answered `{ ok: true, value: 5 }`;
      // with the anchor gate removed, the second answered `{ ok: true, value: 30 }`.
      expect(await hiding.moveProject('ada', MEMBER, id, 'a2', null)).toEqual(notFound);
      expect(await hiding.moveProject('ada', MEMBER, id, 'a3', 'a2')).toEqual(notFound);
      expect(await unchanged()).toEqual(before);
    });

    it('refuses to remove it', async () => {
      const { hiding, id, unchanged, before } = await hidingA2();
      // Proof, observed 2026-09-29: with the member gate removed from
      // `removeWorkPackage`, this remove answered `{ ok: true, value: null }`.
      expect(await hiding.removeProject('ada', MEMBER, id, 'a2')).toEqual(notFound);
      expect(await unchanged()).toEqual(before);
    });

    it('still places, moves and removes around it by visible members', async () => {
      const { hiding, id } = await hidingA2();
      expect(await hiding.addProject('ada', MEMBER, id, 'a4', 'a1')).toMatchObject({
        ok: true,
      });
      expect(await hiding.moveProject('ada', MEMBER, id, 'a3', null)).toMatchObject({
        ok: true,
      });
      expect(await hiding.removeProject('ada', MEMBER, id, 'a4')).toEqual({
        ok: true,
        value: null,
      });
    });
  });

  it("answers another organization's space as not_found to its members", async () => {
    const { service } = open(['a1', 'b1']);
    const id = await spaceWith(service, MEMBER, ['a1']);
    const foreign = scoped('ada', 'member', 'org-b');
    expect(await service.read('ada', foreign, id)).toEqual({ ok: false, refusal: 'not_found' });
    expect(await service.rename('ada', foreign, id, 'Mine')).toEqual({
      ok: false,
      refusal: 'not_found',
    });
    expect(await service.remove('ada', foreign, id)).toEqual({ ok: false, refusal: 'not_found' });
    expect(await service.list('ada', foreign)).toEqual({ ok: true, value: [] });
  });

  it('refuses a viewer every write and lets the viewer read', async () => {
    const { service } = open(['a1', 'a2']);
    const id = await spaceWith(service, MEMBER, ['a1']);
    const forbidden = {
      ok: false,
      refusal: 'forbidden',
      permission: 'organization.manage_spaces',
    } as const;
    expect(await service.create('vic', VIEWER, 'Mine')).toEqual(forbidden);
    expect(await service.rename('vic', VIEWER, id, 'Mine')).toEqual(forbidden);
    expect(await service.addProject('vic', VIEWER, id, 'a2', null)).toEqual(forbidden);
    expect(await service.moveProject('vic', VIEWER, id, 'a1', null)).toEqual(forbidden);
    expect(await service.removeProject('vic', VIEWER, id, 'a1')).toEqual(forbidden);
    expect(await service.remove('vic', VIEWER, id)).toEqual(forbidden);
    expect(await service.read('vic', VIEWER, id)).toMatchObject({
      ok: true,
      value: { rows: [{ workPackage: { id: 'a1' } }] },
    });
  });

  it('answers every write to all as virtual_space and reads all as the work package list', async () => {
    const { service } = open(['a2', 'a1']);
    const virtual = { ok: false, refusal: 'virtual_space' } as const;
    expect(await service.rename('ada', MEMBER, ALL_WORK_PACKAGES, 'Mine')).toEqual(virtual);
    expect(await service.remove('ada', MEMBER, ALL_WORK_PACKAGES)).toEqual(virtual);
    expect(await service.addProject('ada', MEMBER, ALL_WORK_PACKAGES, 'a1', null)).toEqual(virtual);
    expect(await service.moveProject('ada', MEMBER, ALL_WORK_PACKAGES, 'a1', null)).toEqual(
      virtual,
    );
    expect(await service.removeProject('ada', MEMBER, ALL_WORK_PACKAGES, 'a1')).toEqual(virtual);
    expect(await service.read('ada', MEMBER, ALL_WORK_PACKAGES)).toMatchObject({
      ok: true,
      value: {
        space: { id: ALL_WORK_PACKAGES, virtual: true, workPackageCount: 2, createdById: null },
        rows: [
          { workPackage: { id: 'a2' }, position: 10 },
          { workPackage: { id: 'a1' }, position: 20 },
        ],
      },
    });
  });

  it('uses the legacy organization under legacy access, and answers organization_required without one', async () => {
    const withLegacy = open(['a1'], 'org-a');
    const id = await spaceWith(withLegacy.service, LEGACY_ACCESS, ['a1']);
    expect(await withLegacy.service.list('ada', LEGACY_ACCESS)).toMatchObject({
      ok: true,
      value: [{ id, workPackageCount: 1 }],
    });

    const without = open(['a1']);
    const required = { ok: false, refusal: 'organization_required' } as const;
    expect(await without.service.list('ada', LEGACY_ACCESS)).toEqual(required);
    expect(await without.service.create('ada', LEGACY_ACCESS, 'Q3')).toEqual(required);
    expect(await without.service.read('ada', LEGACY_ACCESS, 'any')).toEqual(required);
    expect(await without.service.read('ada', LEGACY_ACCESS, ALL_WORK_PACKAGES)).toMatchObject({
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
      value: { space: { name: 'Q4', revision: 4 }, rows: [{ workPackage: { id: 'a2' } }, {}] },
    });
  });
});

describe('SpaceResource roll-ups', () => {
  /**
   * A space {a1, a2} over controllable trees: `totals` is each work package's one
   * root's final total, `seqs` its event sequence, `unavailable` the work packages
   * whose engine is down, and `visible` the work packages the caller can open.
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
    /** Extra in-progress leaves per work package, each `[number, endsOn]`. */
    const leaves = new Map<string, [string, string | null][]>();
    let treeReads = 0;
    const tables = projectTablesOf(
      new Map([
        ['a1', 'org-a'],
        ['a2', 'org-a'],
      ]),
    );
    const spaces = inMemorySpaces(tables);
    const targets = projectTargetsOf(tables);
    const trees = {
      sharedTreesWithin: () => Promise.resolve({ kind: 'isolated' as const }),
      treeWithin: (workPackageId: string, access: ResourceAccess) => {
        treeReads += 1;
        if (unavailable.has(workPackageId)) {
          return Promise.resolve({
            kind: 'engine_unavailable',
            error: 'engine_unavailable',
            engine: 'optimized',
          });
        }
        return Promise.resolve({
          workItems: [
            {
              id: `${workPackageId}-root`,
              parentId: null,
              status: 'on_hold',
              finalTotal: totals.get(workPackageId) ?? 0,
              dates: { startsOn: '2026-10-01', endsOn: '2026-10-09' },
              estimates: { s1: 1 },
              number: '1',
              name: 'Root',
              assignees: {},
              progress: {},
            },
            ...(leaves.get(workPackageId) ?? []).map(([number, endsOn]) => ({
              id: `${workPackageId}-${number}`,
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
          workPackageRevision: 0,
          seq: seqs.get(workPackageId) ?? 0,
        });
      },
    } as unknown as SpaceResourceOptions['trees'];
    const service = new SpaceResource({
      accessDecisions: spaceDecisions(visible),
      settings: targets,
      announcements: recordingBroadcaster(),
      spaces,
      clock,
      trees,
      sequences: { latestSeq: (workPackageId) => Promise.resolve(seqs.get(workPackageId) ?? 0) },
      rollUpCache: new RollUpCache(clock),
      workPackages: {
        listWithin: () => Promise.resolve(visible.map(readable)),
        readWithin: (id) =>
          Promise.resolve(visible.includes(id) ? { workPackage: readable(id), steps: [] } : null),
      },
    });
    const id = await spaceWith(
      new SpaceResource({
        accessDecisions: spaceDecisions(['a1', 'a2']),
        settings: targets,
        announcements: recordingBroadcaster(),
        spaces,
        clock,
        ...noTrees(),
        workPackages: {
          listWithin: () => Promise.resolve(['a1', 'a2'].map(readable)),
          readWithin: (workPackageId) =>
            Promise.resolve({ workPackage: readable(workPackageId), steps: [] }),
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
  const totalOf = (
    answer: Awaited<ReturnType<SpaceResource['rollUps']>>,
    workPackageId: string,
  ) => {
    if ('kind' in answer) throw new Error('unexpected access refusal');
    if (!answer.ok) throw new Error(answer.refusal);
    const rolled = answer.value[workPackageId];
    if (rolled.kind !== 'rolled_up') throw new Error(`${workPackageId} did not roll up`);
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

  it('answers no roll-up for a work package the caller cannot open', async () => {
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
    expect(await service.rollUps('ada', scoped('ada', 'member', 'org-b'), id, ['a1'])).toEqual({
      ok: false,
      refusal: 'not_found',
    });
    expect(await service.rollUps('ada', MEMBER, ALL_WORK_PACKAGES, ['a3'])).toMatchObject({
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
    expect(
      answer.value.items.map(({ workPackageId, number }) => `${workPackageId}/${number}`),
    ).toEqual(['a2/1', 'a1/2', 'a1/1']);
    expect(answer.value.items[0]).toMatchObject({
      workPackageName: 'a2',
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
      value: { items: [{ workPackageId: 'a1' }], unavailable: [] },
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
      const answer = await service.inProgress('ada', access, ALL_WORK_PACKAGES, 200);
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
