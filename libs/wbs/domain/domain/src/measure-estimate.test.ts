import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';

import { DEFAULT_PERT_WEIGHTS } from './estimate';
import { type MeasureDefinition, SEEDED_MEASURE_DEFINITIONS } from './measure-definition';
import {
  decideMeasureEstimate,
  expectedMeasure,
  measureVariance,
  type StoredMeasureEstimate,
} from './measure-estimate';
import { rollUpMeasureEstimates } from './roll-up';

const SEEDED: readonly MeasureDefinition[] = SEEDED_MEASURE_DEFINITIONS.map((fields) => ({
  id: `m-${fields.key}`,
  ...fields,
}));

const KWH: MeasureDefinition = {
  id: 'm-kwh',
  key: 'kwh',
  name: 'Energy',
  unit: 'kWh',
  kind: 'count',
  scale: 'real',
  threePoint: true,
  showByDefault: false,
  schedulesWork: false,
  derived: false,
  order: 6,
  currency: null,
};

const TRIO = { optimistic: 100, realistic: 200, pessimistic: 600 };

describe('decideMeasureEstimate', () => {
  it('accepts a trio in tokens, cost and a defined real measure', () => {
    const held = [...SEEDED, KWH];
    expect(decideMeasureEstimate(held, 'tokens', TRIO)).toMatchObject({
      ok: true,
      definition: { key: 'tokens' },
    });
    expect(decideMeasureEstimate(held, 'cost', TRIO)).toMatchObject({ ok: true });
    expect(
      decideMeasureEstimate(held, 'kwh', { optimistic: 0.5, realistic: 1.25, pessimistic: 2 }),
    ).toMatchObject({ ok: true, definition: { key: 'kwh' } });
  });

  it('refuses a key the organization does not define, legacy names included', () => {
    expect(decideMeasureEstimate(SEEDED, 'story_points', TRIO)).toEqual({
      ok: false,
      reason: 'unknown_measure',
    });
    expect(decideMeasureEstimate(SEEDED, 'token_estimate', TRIO)).toEqual({
      ok: false,
      reason: 'unknown_measure',
    });
    expect(decideMeasureEstimate(SEEDED, 'kwh', null)).toEqual({
      ok: false,
      reason: 'unknown_measure',
    });
  });

  it('refuses a trio, and a clear, in the scheduling measure', () => {
    expect(decideMeasureEstimate(SEEDED, 'time', TRIO)).toEqual({
      ok: false,
      reason: 'scheduling_measure_estimate',
    });
    expect(decideMeasureEstimate(SEEDED, 'time', null)).toEqual({
      ok: false,
      reason: 'scheduling_measure_estimate',
    });
  });

  it('refuses a trio where the definition forbids three points', () => {
    expect(decideMeasureEstimate(SEEDED, 'hours', TRIO)).toEqual({
      ok: false,
      reason: 'three_point_forbidden',
    });
    expect(decideMeasureEstimate(SEEDED, 'agent_minutes', null)).toEqual({
      ok: false,
      reason: 'three_point_forbidden',
    });
  });

  it('refuses a fractional point on an integer measure, and accepts a clear there', () => {
    expect(
      decideMeasureEstimate(SEEDED, 'tokens', { optimistic: 1, realistic: 1.5, pessimistic: 2 }),
    ).toEqual({ ok: false, reason: 'scale_mismatch' });
    expect(decideMeasureEstimate(SEEDED, 'tokens', null)).toMatchObject({ ok: true });
  });

  it('answers an unowned project against the seeded four, so tokens is known and cost is not', () => {
    expect(decideMeasureEstimate(null, 'tokens', TRIO)).toMatchObject({ ok: true });
    expect(decideMeasureEstimate(null, 'cost', TRIO)).toEqual({
      ok: false,
      reason: 'unknown_measure',
    });
    expect(decideMeasureEstimate(null, 'hours', TRIO)).toEqual({
      ok: false,
      reason: 'three_point_forbidden',
    });
  });
});

describe('expectedMeasure and measureVariance', () => {
  it('weighs the trio by the textbook weights, and the spec scenario reads 250 with variance 50', () => {
    const expected = expectedMeasure(TRIO, DEFAULT_PERT_WEIGHTS, 'integer');
    expect(expected).toBe(250);
    expect(measureVariance(300, expected)).toBe(50);
  });

  it('weighs the trio by custom weights', () => {
    expect(expectedMeasure(TRIO, { optimistic: 1, realistic: 1, pessimistic: 1 }, 'integer')).toBe(
      300,
    );
    expect(expectedMeasure(TRIO, { optimistic: 0, realistic: 0, pessimistic: 1 }, 'integer')).toBe(
      600,
    );
  });

  it('rounds an integer measure half up, once', () => {
    // (1 + 4×2 + 6) / 6 = 2.5 exactly.
    expect(
      expectedMeasure(
        { optimistic: 1, realistic: 2, pessimistic: 6 },
        DEFAULT_PERT_WEIGHTS,
        'integer',
      ),
    ).toBe(3);
    // (1 + 4×1 + 2) / 6 = 1.1666…
    expect(
      expectedMeasure(
        { optimistic: 1, realistic: 1, pessimistic: 2 },
        DEFAULT_PERT_WEIGHTS,
        'integer',
      ),
    ).toBe(1);
  });

  it('rounds a real half up at ten million tokens under fractional weights', () => {
    // Exactly 16352134.5; doubles compute 16352134.499999998.
    expect(
      expectedMeasure(
        { optimistic: 2776814, realistic: 17939787, pessimistic: 24687947 },
        { optimistic: 1, realistic: 1.2, pessimistic: 1.4 },
        'integer',
      ),
    ).toBe(16352135);
  });

  it('rounds a third down at a magnitude where any relative tolerance would call it a half', () => {
    // 1e12 / 3 = 333333333333.33…: a tolerance wide enough for the drift at
    // this size snaps it to …333.5 and rounds up.
    expect(
      expectedMeasure(
        { optimistic: 0, realistic: 0, pessimistic: 1_000_000_000_000 },
        { optimistic: 1, realistic: 1, pessimistic: 1 },
        'integer',
      ),
    ).toBe(333_333_333_333);
  });

  it('rounds half up exactly over random integer trios and decimal weights', () => {
    const point = fc.integer({ min: 0, max: 50_000_000 });
    const weight = fc.integer({ min: 0, max: 500 }).map((hundredths) => hundredths / 100);
    fc.assert(
      fc.property(fc.tuple(point, point, point), fc.tuple(weight, weight, weight), (points, w) => {
        const [optimistic, realistic, pessimistic] = points.sort((a, b) => a - b);
        const [wo, wr, wp] = w;
        fc.pre(wo + wr + wp > 0);
        const rounded = expectedMeasure(
          { optimistic, realistic, pessimistic },
          { optimistic: wo, realistic: wr, pessimistic: wp },
          'integer',
        );
        // Half up in exact terms: (2r - 1)·D <= 2N < (2r + 1)·D over hundredths.
        const hundredths = [wo, wr, wp].map((each) => BigInt(Math.round(each * 100)));
        const [ho, hr, hp] = hundredths as [bigint, bigint, bigint];
        const numerator =
          ho * BigInt(optimistic) + hr * BigInt(realistic) + hp * BigInt(pessimistic);
        const denominator = ho + hr + hp;
        const r = BigInt(rounded);
        expect((2n * r - 1n) * denominator <= 2n * numerator).toBe(true);
        expect(2n * numerator < (2n * r + 1n) * denominator).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  it('rounds a legacy fractional token estimate half up', () => {
    expect(
      expectedMeasure(
        { optimistic: 2.5, realistic: 2.5, pessimistic: 2.5 },
        DEFAULT_PERT_WEIGHTS,
        'integer',
      ),
    ).toBe(3);
  });

  it('keeps a real measure unrounded', () => {
    expect(
      expectedMeasure(
        { optimistic: 1, realistic: 1, pessimistic: 2 },
        DEFAULT_PERT_WEIGHTS,
        'real',
      ),
    ).toBeCloseTo(7 / 6, 12);
  });

  it('subtracts the expected measure from the fact', () => {
    expect(measureVariance(300, 250)).toBe(50);
    expect(measureVariance(200, 250)).toBe(-50);
    expect(measureVariance(0, 0)).toBe(0);
  });

  it('is absent when either side is absent', () => {
    expect(measureVariance(undefined, 250)).toBeUndefined();
    expect(measureVariance(300, undefined)).toBeUndefined();
  });
});

describe('rollUpMeasureEstimates', () => {
  const rows = [
    { id: 'P', parentId: null },
    { id: 'A', parentId: 'P' },
    { id: 'B', parentId: 'P' },
    { id: 'C', parentId: null },
  ];
  const trio = (
    workItemId: string,
    key: string,
    o: number,
    r: number,
    p: number,
    singlePoint = false,
  ): StoredMeasureEstimate => ({
    workItemId,
    stepId: 'dev',
    key,
    optimistic: o,
    realistic: r,
    pessimistic: p,
    singlePoint,
  });

  it('sums trios and rounded expected measures up the tree, one measure per call', () => {
    const held = [
      trio('A', 'tokens', 1, 2, 6),
      trio('B', 'tokens', 1, 2, 6),
      trio('A', 'cost', 1000, 1000, 1000),
    ];
    const tokens = rollUpMeasureEstimates(rows, held, 'tokens', DEFAULT_PERT_WEIGHTS, 'integer');
    expect(tokens.get('A')?.get('dev')).toEqual({
      optimistic: 1,
      realistic: 2,
      pessimistic: 6,
      singlePoint: false,
      expected: 3,
    });
    // Two rounded 3s, not the rounding of 2.5 + 2.5.
    expect(tokens.get('P')?.get('dev')).toEqual({
      optimistic: 2,
      realistic: 4,
      pessimistic: 12,
      singlePoint: false,
      expected: 6,
    });
    expect(tokens.get('C')?.size).toBe(0);
    expect(
      rollUpMeasureEstimates(rows, held, 'cost', DEFAULT_PERT_WEIGHTS, 'integer')
        .get('P')
        ?.get('dev')?.expected,
    ).toBe(1000);
  });

  it('reads a parent single-point only when every trio beneath it is', () => {
    const allSingle = [trio('A', 'tokens', 5, 5, 5, true), trio('B', 'tokens', 7, 7, 7, true)];
    expect(
      rollUpMeasureEstimates(rows, allSingle, 'tokens', DEFAULT_PERT_WEIGHTS, 'integer')
        .get('P')
        ?.get('dev')?.singlePoint,
    ).toBe(true);
    const mixed = [trio('A', 'tokens', 5, 5, 5, true), trio('B', 'tokens', 1, 2, 3)];
    expect(
      rollUpMeasureEstimates(rows, mixed, 'tokens', DEFAULT_PERT_WEIGHTS, 'integer')
        .get('P')
        ?.get('dev')?.singlePoint,
    ).toBe(false);
  });
});
