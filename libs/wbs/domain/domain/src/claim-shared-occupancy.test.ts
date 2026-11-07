import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';

import { type ClaimRequest, decideClaim } from './claim';
import {
  occupancyByResource,
  type OccupancyRow,
  refuseOccupancy,
  type ResourceUnits,
} from './occupancy';

/**
 * `wbs-shared-occupancy` slice 2 (design S3): a claim counts against its
 * project's capacity and, when the resource states one, the directory
 * capacity across every project of the organization.
 */
const F = 'account-f';
const RAM = 'host-ram';
const STAGING = 'staging';

function row(
  workItemId: string,
  resourceId: string,
  units: number,
  personId = `holder-of-${workItemId}`,
): OccupancyRow {
  return { claimId: `c-${workItemId}`, workItemId, personId, runId: null, resourceId, units };
}

/** The units the organization's leaves hold, per resource: what `organizationUnitsOf` answers. */
function totalsOf(rows: readonly OccupancyRow[]): ResourceUnits[] {
  return occupancyByResource(rows).map(({ resourceId, occupied }) => ({
    resourceId,
    units: occupied,
  }));
}

/** A leaf with one unstated step, asking its declared `demand`. */
function leafClaim(workItemId: string, over: Partial<ClaimRequest>): ClaimRequest {
  return {
    target: {
      workItemId,
      isLeaf: true,
      status: 'in_progress',
      ancestorIds: [],
      descendantIds: [],
      steps: [{ stepId: 'impl', progress: 'unknown' }],
    },
    caller: { accountId: F, isAdmin: true, pinnedPersonId: null, pinnedRunId: null },
    claimant: { personId: 'agent', boundAccountId: F },
    stepIds: null,
    runId: null,
    parentClaimId: null,
    parentClaim: null,
    assign: false,
    claims: [],
    demand: [],
    resources: null,
    capacities: [],
    occupancy: [],
    directoryCapacities: [],
    organizationOccupied: [],
    ...over,
  };
}

describe('a directory capacity is shared across the organization', () => {
  it('refuses B’s 16 GB while A holds the directory’s 16', () => {
    // A's leaves hold 16; B states 16 of its own and holds nothing.
    const held = [row('a-1', RAM, 16)];
    const decided = decideClaim(
      leafClaim('b-1', {
        demand: [{ resourceId: RAM, units: 16 }],
        capacities: [{ resourceId: RAM, units: 16 }],
        occupancy: [],
        directoryCapacities: [{ resourceId: RAM, units: 16 }],
        organizationOccupied: totalsOf(held),
      }),
    );
    // Holders across the organization are the caller's to name, once refused.
    expect(decided).toEqual({
      kind: 'refused',
      refusal: {
        reason: 'resources_exhausted',
        resourceId: RAM,
        asked: 16,
        free: 0,
        holders: [],
        scope: 'organization',
        resources: [{ resourceId: RAM, asked: 16, free: 0, holders: [], scope: 'organization' }],
      },
    });
  });

  it('holds one staging across projects, free again once A releases it', () => {
    const ask = {
      demand: [{ resourceId: STAGING, units: 1 }],
      directoryCapacities: [{ resourceId: STAGING, units: 1 }],
    };
    expect(
      decideClaim(
        leafClaim('b-1', { ...ask, organizationOccupied: totalsOf([row('a-1', STAGING, 1)]) }),
      ),
    ).toMatchObject({ kind: 'refused', refusal: { reason: 'resources_exhausted', free: 0 } });
    expect(decideClaim(leafClaim('b-1', { ...ask, organizationOccupied: [] }))).toMatchObject({
      kind: 'claim',
      acquired: [{ resourceId: STAGING, units: 1 }],
    });
  });

  it('keeps the project ceiling binding while the organization has units free', () => {
    const own = [row('a-1', RAM, 8)];
    expect(
      refuseOccupancy({
        workItemId: 'a-2',
        asked: [{ resourceId: RAM, units: 4 }],
        capacities: [{ resourceId: RAM, units: 8 }],
        occupancy: own,
        directoryCapacities: [{ resourceId: RAM, units: 16 }],
        organizationOccupied: totalsOf(own),
      }),
    ).toMatchObject({ resourceId: RAM, free: 0, scope: 'project' });
  });

  it('names the organization on a tie', () => {
    // 16 - 8 = 8 free in the project and 16 - 8 = 8 in the organization: a tie.
    const project = [row('a-1', RAM, 8)];
    expect(
      refuseOccupancy({
        workItemId: 'a-2',
        asked: [{ resourceId: RAM, units: 10 }],
        capacities: [{ resourceId: RAM, units: 16 }],
        occupancy: project,
        directoryCapacities: [{ resourceId: RAM, units: 16 }],
        organizationOccupied: totalsOf(project),
      }),
    ).toMatchObject({ free: 8, scope: 'organization' });
  });

  it('refuses the second of two leaves one batch claims past the directory capacity', () => {
    const ask = {
      demand: [{ resourceId: RAM, units: 10 }],
      directoryCapacities: [{ resourceId: RAM, units: 16 }],
    };
    const first = decideClaim(leafClaim('a-1', { ...ask }));
    expect(first).toMatchObject({ kind: 'claim' });
    // The batch's own connection reads the first leaf's uncommitted rows.
    expect(
      decideClaim(
        leafClaim('a-2', { ...ask, organizationOccupied: totalsOf([row('a-1', RAM, 10)]) }),
      ),
    ).toMatchObject({ kind: 'refused', refusal: { asked: 10, free: 6, scope: 'organization' } });
  });

  it('lets a leaf keep units it holds while the directory capacity sits below them', () => {
    const own = [row('a-1', RAM, 16), row('b-1', RAM, 16)];
    expect(
      refuseOccupancy({
        workItemId: 'a-1',
        asked: [{ resourceId: RAM, units: 16 }],
        capacities: [],
        occupancy: [own[0] ?? row('a-1', RAM, 16)],
        directoryCapacities: [{ resourceId: RAM, units: 10 }],
        organizationOccupied: totalsOf(own),
      }),
    ).toBeNull();
  });

  it('says no scope for a resource with no directory capacity', () => {
    expect(
      refuseOccupancy({
        workItemId: 'a-2',
        asked: [{ resourceId: RAM, units: 4 }],
        capacities: [{ resourceId: RAM, units: 2 }],
        occupancy: [],
        directoryCapacities: [],
        organizationOccupied: totalsOf([row('b-1', RAM, 100)]),
      }),
    ).toEqual({
      reason: 'resources_exhausted',
      resourceId: RAM,
      asked: 4,
      free: 2,
      holders: [],
      resources: [{ resourceId: RAM, asked: 4, free: 2, holders: [] }],
    });
  });
});

/**
 * One step of the two-project model. A claim, release, undo or redo of a
 * leaf in project 0 or 1; undo and redo act on that project's journal.
 */
type Act =
  | { kind: 'claim'; project: number; leaf: number; units: number }
  | { kind: 'release'; project: number; leaf: number }
  | { kind: 'undo'; project: number }
  | { kind: 'redo'; project: number };

/** A journal entry: what was claimed or released, so its inverse can put it back. */
interface Entry {
  readonly kind: 'claim' | 'release';
  readonly rows: readonly OccupancyRow[];
}

describe('organization occupancy under any sequence of claims, releases, undos and redos', () => {
  const act: fc.Arbitrary<Act> = fc.oneof(
    fc.record({
      kind: fc.constant('claim' as const),
      project: fc.nat({ max: 1 }),
      leaf: fc.nat({ max: 3 }),
      units: fc.integer({ min: 1, max: 12 }),
    }),
    fc.record({
      kind: fc.constant('release' as const),
      project: fc.nat({ max: 1 }),
      leaf: fc.nat({ max: 3 }),
    }),
    fc.record({ kind: fc.constant('undo' as const), project: fc.nat({ max: 1 }) }),
    fc.record({ kind: fc.constant('redo' as const), project: fc.nat({ max: 1 }) }),
  );
  const world = fc.record({
    directory: fc.integer({ min: 0, max: 20 }),
    // Project ceilings, unstated or stated, and free to sum above the directory.
    ceilings: fc.array(fc.option(fc.integer({ min: 0, max: 24 }), { nil: null }), {
      minLength: 2,
      maxLength: 2,
    }),
    acts: fc.array(act, { maxLength: 40 }),
  });

  it('never holds more of a directory capacity than it states', () => {
    fc.assert(
      fc.property(world, (drawn) => {
        const rows: OccupancyRow[][] = [[], []];
        const done: Entry[][] = [[], []];
        const undone: Entry[][] = [[], []];
        let minted = 0;
        const organization = () => [...(rows[0] ?? []), ...(rows[1] ?? [])];
        /** Puts `taken` back in `project` through the one check, leaf by leaf, all or nothing. */
        const reacquire = (project: number, taken: readonly OccupancyRow[]): boolean => {
          const own = [...(rows[project] ?? [])];
          const org = organization();
          for (const each of taken) {
            const ceiling = drawn.ceilings[project] ?? null;
            const refused = refuseOccupancy({
              workItemId: each.workItemId,
              asked: [{ resourceId: RAM, units: each.units }],
              capacities: ceiling === null ? [] : [{ resourceId: RAM, units: ceiling }],
              occupancy: own,
              directoryCapacities: [{ resourceId: RAM, units: drawn.directory }],
              organizationOccupied: totalsOf(org),
            });
            if (refused !== null) return false;
            own.push(each);
            org.push(each);
          }
          rows[project] = own;
          return true;
        };
        const remove = (project: number, taken: readonly OccupancyRow[]) => {
          const gone = new Set(taken.map(({ claimId }) => claimId));
          rows[project] = (rows[project] ?? []).filter(({ claimId }) => !gone.has(claimId));
        };
        for (const each of drawn.acts) {
          const { project } = each;
          if (each.kind === 'claim') {
            const workItemId = `p${String(project)}-l${String(each.leaf)}`;
            if ((rows[project] ?? []).some((held) => held.workItemId === workItemId)) continue;
            minted += 1;
            const claimed = { ...row(workItemId, RAM, each.units), claimId: `c${String(minted)}` };
            if (!reacquire(project, [claimed])) continue;
            done[project]?.push({ kind: 'claim', rows: [claimed] });
            undone[project] = [];
          } else if (each.kind === 'release') {
            const workItemId = `p${String(project)}-l${String(each.leaf)}`;
            const taken = (rows[project] ?? []).filter((held) => held.workItemId === workItemId);
            if (taken.length === 0) continue;
            remove(project, taken);
            done[project]?.push({ kind: 'release', rows: taken });
            undone[project] = [];
          } else if (each.kind === 'undo') {
            const entry = done[project]?.at(-1);
            if (entry === undefined) continue;
            if (entry.kind === 'claim') remove(project, entry.rows);
            else if (!reacquire(project, entry.rows)) continue; // stale_undo
            done[project]?.pop();
            undone[project]?.push(entry);
          } else {
            const entry = undone[project]?.at(-1);
            if (entry === undefined) continue;
            if (entry.kind === 'release') remove(project, entry.rows);
            else if (!reacquire(project, entry.rows)) continue; // stale redo
            undone[project]?.pop();
            done[project]?.push(entry);
          }
          const held = occupancyByResource(organization()).at(0)?.occupied ?? 0;
          expect(held).toBeLessThanOrEqual(drawn.directory);
        }
      }),
    );
  });
});
