import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';

import { type Claim, type ClaimRequest, decideClaim, decideRelease } from './claim';
import {
  freeUnitsOf,
  leafOccupancyOf,
  occupancyByResource,
  type OccupancyRow,
  refuseOccupancy,
  type ResourceUnits,
} from './occupancy';

const F = 'account-f';
const RAM = 'ram';
const WORKTREE = 'worktree';

/** A leaf with two unstated steps, no ancestors, claimed by `person` under `run`. */
function leafClaim(
  workItemId: string,
  over: Partial<ClaimRequest> & { person?: string; run?: string | null } = {},
): ClaimRequest {
  const { person = 'agent', run = null, ...rest } = over;
  return {
    admission: new Map(
      ['impl', 'review'].map((stepId) => [
        stepId,
        { started: false, canStart: true, blockers: [] },
      ]),
    ),
    target: {
      workItemId,
      isLeaf: true,
      status: 'in_progress',
      ancestorIds: [],
      descendantIds: [],
      steps: [
        { stepId: 'impl', progress: 'unknown' },
        { stepId: 'review', progress: 'unknown' },
      ],
    },
    caller: { accountId: F, isAdmin: true, pinnedPersonId: null, pinnedRunId: null },
    claimant: { personId: person, boundAccountId: F },
    stepIds: null,
    runId: run,
    parentClaimId: null,
    parentClaim: null,
    assign: false,
    claims: [],
    demand: [],
    resources: null,
    capacities: [],
    occupancy: [],
    ...rest,
  };
}

/** The claims and occupancy rows a decided claim writes, as the service mints them. */
function written(
  request: ClaimRequest,
  prefix: string,
): { claims: Claim[]; occupancy: OccupancyRow[] } {
  const decided = decideClaim(request);
  if (decided.kind !== 'claim') throw new Error(`expected a claim, got ${decided.kind}`);
  const claims = decided.drafts.map((draft, index) => ({
    ...draft,
    id: `${prefix}-${String(index)}`,
    accountId: F,
  }));
  return {
    claims,
    occupancy: claims.flatMap((each) =>
      decided.occupancy.map(({ resourceId, units }) => ({
        claimId: each.id,
        workItemId: each.workItemId,
        personId: each.personId,
        runId: each.runId,
        resourceId,
        units,
      })),
    ),
  };
}

describe('a claim occupies its leaf’s demand vector', () => {
  it('acquires the declared demand on the first claim of a leaf', () => {
    expect(
      decideClaim(
        leafClaim('leaf', {
          demand: [{ resourceId: RAM, units: 4 }],
          capacities: [{ resourceId: RAM, units: 32 }],
        }),
      ),
    ).toMatchObject({
      kind: 'claim',
      occupancy: [{ resourceId: RAM, units: 4 }],
      acquired: [{ resourceId: RAM, units: 4 }],
    });
  });

  // Scenario: Twelve agents and 32 GB.
  it('refuses the ninth of eight 4 GB claims on 32 GB, naming the eight holders', () => {
    const capacities = [{ resourceId: RAM, units: 32 }];
    const demand = [{ resourceId: RAM, units: 4 }];
    let claims: Claim[] = [];
    let occupancy: OccupancyRow[] = [];
    for (let index = 0; index < 8; index += 1) {
      const next = written(
        leafClaim(`leaf-${String(index)}`, {
          person: `agent-${String(index)}`,
          run: `run-${String(index)}`,
          demand,
          capacities,
          occupancy,
        }),
        `c${String(index)}`,
      );
      claims = [...claims, ...next.claims];
      occupancy = [...occupancy, ...next.occupancy];
    }
    expect(claims).toHaveLength(16);
    const ninth = decideClaim(
      leafClaim('leaf-8', { person: 'agent-8', demand, capacities, occupancy }),
    );
    const holders = Array.from({ length: 8 }, (_, index) => ({
      personId: `agent-${String(index)}`,
      runId: `run-${String(index)}`,
      workItemId: `leaf-${String(index)}`,
    }));
    expect(ninth).toEqual({
      kind: 'refused',
      refusal: {
        reason: 'resources_exhausted',
        resourceId: RAM,
        asked: 4,
        free: 0,
        holders,
        resources: [{ resourceId: RAM, asked: 4, free: 0, holders }],
      },
    });
  });

  it('names every resource a claim is short of, in resource-id order, the first repeated on top', () => {
    const occupancy: OccupancyRow[] = [
      { claimId: 'c0', workItemId: 'held', personId: 'a0', runId: 'r0', resourceId: RAM, units: 6 },
      {
        claimId: 'c0',
        workItemId: 'held',
        personId: 'a0',
        runId: 'r0',
        resourceId: WORKTREE,
        units: 1,
      },
    ];
    const holder = { personId: 'a0', runId: 'r0', workItemId: 'held' };
    expect(
      refuseOccupancy({
        workItemId: 'leaf',
        asked: [
          { resourceId: WORKTREE, units: 1 },
          { resourceId: RAM, units: 4 },
        ],
        capacities: [
          { resourceId: RAM, units: 8 },
          { resourceId: WORKTREE, units: 1 },
        ],
        occupancy,
      }),
    ).toEqual({
      reason: 'resources_exhausted',
      resourceId: RAM,
      asked: 4,
      free: 2,
      holders: [holder],
      resources: [
        { resourceId: RAM, asked: 4, free: 2, holders: [holder] },
        { resourceId: WORKTREE, asked: 1, free: 0, holders: [holder] },
      ],
    });
  });

  // Scenario: Two steps of one leaf share one occupancy.
  it('a second claim on another step of the leaf acquires nothing', () => {
    const demand = [{ resourceId: WORKTREE, units: 1 }];
    const capacities = [{ resourceId: WORKTREE, units: 1 }];
    const first = written(
      leafClaim('leaf', { person: 'a', stepIds: ['impl'], demand, capacities }),
      'a',
    );
    const second = leafClaim('leaf', {
      person: 'b',
      stepIds: ['review'],
      demand,
      capacities,
      claims: first.claims,
      occupancy: first.occupancy,
    });
    const decided = decideClaim(second);
    if (decided.kind !== 'claim') throw new Error('the second claim was not applied');
    expect({ occupancy: decided.occupancy, acquired: decided.acquired }).toEqual({
      occupancy: [{ resourceId: WORKTREE, units: 1 }],
      acquired: [],
    });
    const both = [...first.occupancy, ...written(second, 'b').occupancy];
    expect(occupancyByResource(both)).toEqual([
      {
        resourceId: WORKTREE,
        occupied: 1,
        holders: [
          { personId: 'a', runId: null, workItemId: 'leaf' },
          { personId: 'b', runId: null, workItemId: 'leaf' },
        ],
      },
    ]);
  });

  // R4 on a held leaf: an ask above the standing copy is acquired whole or refused, never dropped.
  describe('a later claim asking for more on a held leaf', () => {
    const demand = [{ resourceId: RAM, units: 4 }];
    const held = (capacity: number) => {
      const capacities = [{ resourceId: RAM, units: capacity }];
      const first = written(
        leafClaim('leaf', { person: 'a0', stepIds: ['impl'], demand, capacities }),
        'a0',
      );
      return (resources: ResourceUnits[]) =>
        decideClaim(
          leafClaim('leaf', {
            person: 'a1',
            stepIds: ['review'],
            demand,
            capacities,
            resources,
            claims: first.claims,
            occupancy: first.occupancy,
          }),
        );
    };

    it('acquires the difference and carries the larger copy', () => {
      const decided = held(8)([{ resourceId: RAM, units: 8 }]);
      if (decided.kind !== 'claim') throw new Error(`expected a claim, got ${decided.kind}`);
      expect({ occupancy: decided.occupancy, acquired: decided.acquired }).toEqual({
        occupancy: [{ resourceId: RAM, units: 8 }],
        acquired: [{ resourceId: RAM, units: 4 }],
      });
    });

    it('refuses resources_exhausted for the whole ask when the difference does not fit', () => {
      expect(held(6)([{ resourceId: RAM, units: 8 }])).toMatchObject({
        kind: 'refused',
        refusal: { reason: 'resources_exhausted', resourceId: RAM, asked: 8, free: 6 },
      });
    });

    it('refuses below_held_occupancy for an ask under the standing copy', () => {
      const lowered = held(8);
      // The declared demand is a floor too, so the leaf here declares none and holds 4.
      expect(
        decideClaim({
          ...leafClaim('leaf', {
            person: 'a1',
            stepIds: ['review'],
            demand: [],
            capacities: [{ resourceId: RAM, units: 8 }],
            resources: [{ resourceId: RAM, units: 2 }],
            claims: [
              {
                id: 'c0',
                workItemId: 'leaf',
                stepId: 'impl',
                personId: 'a0',
                runId: null,
                parentClaimId: null,
                accountId: F,
              },
            ],
            occupancy: [
              {
                claimId: 'c0',
                workItemId: 'leaf',
                personId: 'a0',
                runId: null,
                resourceId: RAM,
                units: 4,
              },
            ],
          }),
        }),
      ).toEqual({
        kind: 'refused',
        refusal: { reason: 'below_held_occupancy', resourceId: RAM, asked: 2, held: 4 },
      });
      expect(lowered([{ resourceId: RAM, units: 4 }])).toMatchObject({
        kind: 'claim',
        acquired: [],
      });
    });
  });

  // Scenario: Release of the last claim frees the units.
  it('frees the units only when the last claim of the leaf is released', () => {
    const demand = [{ resourceId: WORKTREE, units: 1 }];
    const capacities = [{ resourceId: WORKTREE, units: 3 }];
    const a = written(
      leafClaim('leaf', { person: 'a', stepIds: ['impl'], demand, capacities }),
      'a',
    );
    const b = written(
      leafClaim('leaf', {
        person: 'b',
        stepIds: ['review'],
        demand,
        capacities,
        claims: a.claims,
        occupancy: a.occupancy,
      }),
      'b',
    );
    const claims = [...a.claims, ...b.claims];
    const occupancy = [...a.occupancy, ...b.occupancy];
    expect(freeUnitsOf(capacities, occupancy)).toEqual([{ resourceId: WORKTREE, units: 2 }]);
    const releaseOf = (person: string, held: readonly Claim[]) => {
      const decided = decideRelease({
        target: { workItemId: 'leaf', isLeaf: true },
        caller: { accountId: F, isAdmin: true, pinnedPersonId: null, pinnedRunId: null },
        claimant: { personId: person, boundAccountId: F },
        stepIds: null,
        claims: held,
      });
      if (decided.kind !== 'release') throw new Error('expected a release');
      return new Set(decided.claims.map(({ id }) => id));
    };
    const goneA = releaseOf('a', claims);
    const afterA = occupancy.filter(({ claimId }) => !goneA.has(claimId));
    expect(freeUnitsOf(capacities, afterA)).toEqual([{ resourceId: WORKTREE, units: 2 }]);
    const goneB = releaseOf(
      'b',
      claims.filter(({ id }) => !goneA.has(id)),
    );
    const afterB = afterA.filter(({ claimId }) => !goneB.has(claimId));
    expect(freeUnitsOf(capacities, afterB)).toEqual([{ resourceId: WORKTREE, units: 3 }]);
  });

  // Scenario: Asking for more than declared.
  it('holds what resources asks above the declared demand, or refuses for that many', () => {
    const demand = [{ resourceId: RAM, units: 2 }];
    const asked = [{ resourceId: RAM, units: 6 }];
    expect(
      decideClaim(
        leafClaim('leaf', {
          demand,
          resources: asked,
          capacities: [{ resourceId: RAM, units: 8 }],
        }),
      ),
    ).toMatchObject({ kind: 'claim', acquired: asked });
    expect(
      decideClaim(
        leafClaim('leaf', {
          demand,
          resources: asked,
          capacities: [{ resourceId: RAM, units: 5 }],
        }),
      ),
    ).toMatchObject({
      kind: 'refused',
      refusal: { reason: 'resources_exhausted', resourceId: RAM, asked: 6, free: 5 },
    });
  });

  it('refuses below_declared_demand when the claim asks less than the leaf declares', () => {
    expect(
      decideClaim(
        leafClaim('leaf', {
          demand: [{ resourceId: RAM, units: 2 }],
          resources: [{ resourceId: RAM, units: 1 }],
        }),
      ),
    ).toEqual({
      kind: 'refused',
      refusal: { reason: 'below_declared_demand', resourceId: RAM, asked: 1, declared: 2 },
    });
  });

  it('adds a resource the leaf does not demand, beside the declared ones', () => {
    expect(
      decideClaim(
        leafClaim('leaf', {
          demand: [{ resourceId: RAM, units: 2 }],
          resources: [{ resourceId: WORKTREE, units: 1 }],
        }),
      ),
    ).toMatchObject({
      kind: 'claim',
      acquired: [
        { resourceId: RAM, units: 2 },
        { resourceId: WORKTREE, units: 1 },
      ],
    });
  });

  // Scenario: Unstated capacity never refuses.
  it('never refuses a resource whose capacity the project has not stated', () => {
    const occupancy: OccupancyRow[] = [
      {
        claimId: 'x',
        workItemId: 'other',
        personId: 'p',
        runId: null,
        resourceId: RAM,
        units: 1000,
      },
    ];
    expect(
      decideClaim(
        leafClaim('leaf', {
          demand: [{ resourceId: RAM, units: 4 }],
          capacities: [{ resourceId: WORKTREE, units: 0 }],
          occupancy,
        }),
      ),
    ).toMatchObject({ kind: 'claim', acquired: [{ resourceId: RAM, units: 4 }] });
  });

  it('refuses any demand on a stated capacity of 0', () => {
    expect(
      decideClaim(
        leafClaim('leaf', {
          demand: [{ resourceId: WORKTREE, units: 1 }],
          capacities: [{ resourceId: WORKTREE, units: 0 }],
        }),
      ),
    ).toMatchObject({ kind: 'refused', refusal: { reason: 'resources_exhausted', free: 0 } });
  });

  it('acquires nothing on a subtree claim and refuses resources named on one', () => {
    const subtree = leafClaim('parent', {
      target: { ...leafClaim('parent').target, isLeaf: false, steps: [], descendantIds: ['leaf'] },
      capacities: [{ resourceId: RAM, units: 0 }],
    });
    expect(decideClaim(subtree)).toMatchObject({ kind: 'claim', occupancy: [], acquired: [] });
    expect(decideClaim({ ...subtree, resources: [{ resourceId: RAM, units: 1 }] })).toEqual({
      kind: 'refused',
      refusal: { reason: 'resources_on_subtree' },
    });
  });

  it('orders already_claimed before resources and resources before inside_subtree_claim', () => {
    const exhausted = {
      demand: [{ resourceId: RAM, units: 1 }],
      capacities: [{ resourceId: RAM, units: 0 }],
    };
    const held: Claim = {
      id: 'h',
      workItemId: 'leaf',
      stepId: 'impl',
      personId: 'rival',
      runId: null,
      parentClaimId: null,
      accountId: F,
    };
    expect(decideClaim(leafClaim('leaf', { ...exhausted, claims: [held] }))).toMatchObject({
      refusal: { reason: 'already_claimed' },
    });
    const above: Claim = { ...held, id: 's', workItemId: 'parent', stepId: null };
    const inside = leafClaim('leaf', {
      ...exhausted,
      target: { ...leafClaim('leaf').target, ancestorIds: ['parent'] },
      claims: [above],
    });
    expect(decideClaim(inside)).toMatchObject({ refusal: { reason: 'resources_exhausted' } });
    expect(decideClaim({ ...inside, resources: [{ resourceId: RAM, units: 0 }] })).toMatchObject({
      refusal: { reason: 'below_declared_demand' },
    });
    expect(decideClaim({ ...inside, capacities: [] })).toMatchObject({
      refusal: { reason: 'inside_subtree_claim' },
    });
  });

  it('lets a leaf already holding units keep them while the capacity sits below them', () => {
    const occupancy: OccupancyRow[] = [
      { claimId: 'a', workItemId: 'leaf', personId: 'a', runId: null, resourceId: RAM, units: 4 },
    ];
    expect(
      refuseOccupancy({
        workItemId: 'leaf',
        asked: [{ resourceId: RAM, units: 4 }],
        capacities: [{ resourceId: RAM, units: 2 }],
        occupancy,
      }),
    ).toBeNull();
    expect(freeUnitsOf([{ resourceId: RAM, units: 2 }], occupancy)).toEqual([
      { resourceId: RAM, units: -2 },
    ]);
  });

  it('reads a leaf’s units as its largest copy, never the sum of its claims', () => {
    const rows: OccupancyRow[] = [
      { claimId: 'a', workItemId: 'leaf', personId: 'a', runId: null, resourceId: RAM, units: 4 },
      { claimId: 'b', workItemId: 'leaf', personId: 'b', runId: null, resourceId: RAM, units: 6 },
    ];
    expect(leafOccupancyOf(rows, 'leaf')).toEqual([{ resourceId: RAM, units: 6 }]);
    expect(occupancyByResource(rows)[0]?.occupied).toBe(6);
  });
});

/** One step of the model: a claim of a leaf's step or a release of a person's claims on it. */
type Act =
  | { kind: 'claim'; leaf: number; step: 'impl' | 'review'; person: number; extra: number }
  | { kind: 'release'; leaf: number; person: number };

describe('free units under any sequence of claims and releases', () => {
  const leaves = ['l0', 'l1', 'l2', 'l3', 'l4'];
  const act: fc.Arbitrary<Act> = fc.oneof(
    fc.record({
      kind: fc.constant('claim' as const),
      leaf: fc.nat({ max: leaves.length - 1 }),
      step: fc.constantFrom('impl' as const, 'review' as const),
      person: fc.nat({ max: 2 }),
      extra: fc.nat({ max: 3 }),
    }),
    fc.record({
      kind: fc.constant('release' as const),
      leaf: fc.nat({ max: leaves.length - 1 }),
      person: fc.nat({ max: 2 }),
    }),
  );
  const world = fc.record({
    demands: fc.array(fc.integer({ min: 0, max: 4 }), {
      minLength: leaves.length,
      maxLength: leaves.length,
    }),
    ram: fc.option(fc.integer({ min: 0, max: 10 }), { nil: null }),
    worktree: fc.option(fc.integer({ min: 0, max: 3 }), { nil: null }),
    acts: fc.array(act, { maxLength: 40 }),
  });

  it('never reads a stated resource’s free units below 0', () => {
    fc.assert(
      fc.property(world, (drawn) => {
        const capacities = [
          ...(drawn.ram === null ? [] : [{ resourceId: RAM, units: drawn.ram }]),
          ...(drawn.worktree === null ? [] : [{ resourceId: WORKTREE, units: drawn.worktree }]),
        ];
        let claims: Claim[] = [];
        let occupancy: OccupancyRow[] = [];
        let minted = 0;
        for (const each of drawn.acts) {
          const workItemId = leaves[each.leaf] ?? 'l0';
          const person = `p${String(each.person)}`;
          if (each.kind === 'claim') {
            const ram = drawn.demands[each.leaf] ?? 0;
            const demand: ResourceUnits[] = [
              ...(ram === 0 ? [] : [{ resourceId: RAM, units: ram }]),
              { resourceId: WORKTREE, units: 1 },
            ];
            const decided = decideClaim(
              leafClaim(workItemId, {
                person,
                stepIds: [each.step],
                demand,
                resources: each.extra === 0 ? null : [{ resourceId: RAM, units: ram + each.extra }],
                capacities,
                claims: claims.filter((claim) => claim.workItemId === workItemId),
                occupancy,
              }),
            );
            if (decided.kind !== 'claim') continue;
            for (const draft of decided.drafts) {
              minted += 1;
              const id = `c${String(minted)}`;
              claims = [...claims, { ...draft, id, accountId: F }];
              occupancy = [
                ...occupancy,
                ...decided.occupancy.map(({ resourceId, units }) => ({
                  claimId: id,
                  workItemId,
                  personId: person,
                  runId: null,
                  resourceId,
                  units,
                })),
              ];
            }
          } else {
            const decided = decideRelease({
              target: { workItemId, isLeaf: true },
              caller: { accountId: F, isAdmin: true, pinnedPersonId: null, pinnedRunId: null },
              claimant: { personId: person, boundAccountId: F },
              stepIds: null,
              claims: claims.filter((claim) => claim.workItemId === workItemId),
            });
            if (decided.kind !== 'release') continue;
            const gone = new Set(decided.claims.map(({ id }) => id));
            claims = claims.filter(({ id }) => !gone.has(id));
            occupancy = occupancy.filter(({ claimId }) => !gone.has(claimId));
          }
          for (const { units } of freeUnitsOf(capacities, occupancy)) {
            expect(units).toBeGreaterThanOrEqual(0);
          }
          // A leaf with no claim holds nothing; one with claims holds one vector.
          for (const leaf of leaves) {
            if (!claims.some(({ workItemId: held }) => held === leaf))
              expect(leafOccupancyOf(occupancy, leaf)).toEqual([]);
          }
        }
      }),
    );
  });
});
