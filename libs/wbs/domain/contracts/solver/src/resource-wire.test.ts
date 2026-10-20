import { readFileSync } from 'node:fs';

import { ScheduleInvalidOptimizedStartError, sliceKey } from '@wbs/domain';
import { describe, expect, it } from 'bun:test';

import { buildSolverRequest, type SolverRequestPlan } from './build-solver-request';
import { materialiseOptimized } from './materialise-optimized';
import { quantisedFastBaseline } from './quantised-baseline';
import { DIVISIBLE_PLAN, STAGING_PLAN } from './resource-wire-plans';
import type { SolverRequest } from './wire-types';

/**
 * Wire 4 (`wbs-resources` R5): the Bun half of resource levelling on the
 * optimized path — the request carries every slice's demand vector and the
 * capacities it names, the Fast baseline levels them, and the materialiser
 * replays a solver answer through the same resource ledger Fast uses.
 *
 * Parity with CP-SAT is the shared corpus: `valid-staging-resource.json` and
 * `valid-divisible-resource.json` are this builder's output for the two plans
 * below, pinned byte for byte here, and `tests/test_resources.py` solves those
 * very bytes and asserts the same non-overlap Fast's baseline shows.
 */

const fixture = (name: string): SolverRequest =>
  JSON.parse(
    readFileSync(new URL(`../fixtures/request/${name}.json`, import.meta.url), 'utf8'),
  ) as SolverRequest;

const baselineOf = (plan: SolverRequestPlan) =>
  quantisedFastBaseline(
    plan.rows,
    plan.edges,
    plan.slices,
    plan.notBefore,
    plan.poolSizes,
    plan.reach,
    plan.typed,
    plan.elsewhere,
    plan.resourceCapacities,
  );

const requestOf = (plan: SolverRequestPlan): SolverRequest => {
  const built = buildSolverRequest(plan, 'pri', {
    baselineOffsets: baselineOf(plan),
    solverVersion: '0.3.0',
    budgetMs: 30_000,
  });
  if (!built.ok) throw new Error(built.detail);
  return built.request;
};

const A = sliceKey('wi-a', 'dev');
const B = sliceKey('wi-b', 'dev');
const C = sliceKey('wi-c', 'dev');

describe('the wire 4 request', () => {
  it('is the golden corpus, byte for byte, for both resource plans', () => {
    expect(requestOf(STAGING_PLAN)).toEqual(fixture('valid-staging-resource'));
    expect(requestOf(DIVISIBLE_PLAN)).toEqual(fixture('valid-divisible-resource'));
  });

  it("carries each slice's demand vector and the capacities it names", () => {
    const request = requestOf({
      ...STAGING_PLAN,
      // A remembered capacity nothing demands stays off the wire, as an unnamed
      // pool does.
      resourceCapacities: new Map([
        ['staging', 1],
        ['unused', 4],
      ]),
    });
    expect(request.resources).toEqual({ staging: 1 });
    expect(request.slices.map((slice) => slice.demands)).toEqual([
      [{ resourceId: 'staging', units: 1 }],
      [{ resourceId: 'staging', units: 1 }],
    ]);
  });

  it('carries no demand and no resource for a plan that states none', () => {
    const plain = requestOf({
      ...STAGING_PLAN,
      slices: STAGING_PLAN.slices.map(({ demands: _dropped, ...slice }) => slice),
      resourceCapacities: new Map(),
    });
    expect(plain.resources).toEqual({});
    expect(plain.slices.every((slice) => slice.demands.length === 0)).toBe(true);
  });

  it('refuses a demanded resource with no stated capacity before spawn', () => {
    const plan = { ...STAGING_PLAN, resourceCapacities: new Map<string, number>() };
    expect(() =>
      buildSolverRequest(plan, 'pri', {
        baselineOffsets: { [A]: 0, [B]: 48 },
        solverVersion: '0.3.0',
        budgetMs: 30_000,
      }),
    ).toThrow('no capacity for resource staging');
  });

  it('refuses a solver that does not speak wire 4', () => {
    const built = buildSolverRequest(STAGING_PLAN, 'pri', {
      baselineOffsets: baselineOf(STAGING_PLAN),
      solverVersion: '0.2.0',
      budgetMs: 30_000,
    });
    expect(built).toMatchObject({ ok: false, failure: 'incompatible-solver' });
  });
});

describe('the Fast baseline levels resources as Fast does', () => {
  it('serialises the staging pair', () => {
    expect(baselineOf(STAGING_PLAN)).toEqual({ [A]: 0, [B]: 48 });
  });

  it('admits two 16 GB leaves into 32 GB and holds the third', () => {
    expect(baselineOf(DIVISIBLE_PLAN)).toEqual({ [A]: 0, [B]: 0, [C]: 48 });
  });
});

describe('the materialiser replays a solver answer through the resource ledger', () => {
  const materialise = (offsets: Record<string, number>) =>
    materialiseOptimized(
      STAGING_PLAN.rows,
      STAGING_PLAN.edges,
      STAGING_PLAN.slices,
      STAGING_PLAN.notBefore,
      STAGING_PLAN.poolSizes,
      STAGING_PLAN.reach,
      STAGING_PLAN.typed,
      offsets,
      new Map(),
      STAGING_PLAN.resourceCapacities,
    );

  it('names staging on the slice that waited for it', () => {
    // The solver's serial answer, b first: a waits for staging.
    const placed = materialise({ [A]: 48, [B]: 0 });
    expect(placed.slices.get(A)).toMatchObject({
      boundBy: 'capacity',
      capacityTeamId: null,
      capacityResource: { resourceId: 'staging', units: 1 },
      capacityPredecessorIds: [B],
    });
    expect(placed.slices.get(B)?.capacityResource).toBeUndefined();
  });

  it('refuses an answer that runs both at once', () => {
    expect(() => materialise({ [A]: 0, [B]: 0 })).toThrow(ScheduleInvalidOptimizedStartError);
  });
});
