import { parseOrThrow, ValidationError } from '@wbs/validation';
import { describe, expect, it } from 'bun:test';

import {
  allowanceHundredthsOf,
  allowanceOf,
  allowancePercentOf,
  beforeRoundingDays,
  chargedDays,
  DEFAULT_ESTIMATE_RULE,
  DEFAULT_PERT_WEIGHTS,
  ESTIMATE_METHODS,
  ESTIMATE_ROUNDINGS,
  type EstimateMethod,
  type EstimateRule,
  expectedDays,
  isEstimateMethod,
  isEstimateRounding,
  MAX_ALLOWANCE_PERCENT,
  MAX_ESTIMATE_DAYS,
  NO_ALLOWANCE,
  PertWeights,
  ThreePointEstimate,
} from './estimate';

/** Base-arithmetic cases below are about method and rounding: no step allowance. */
const finalDays = (estimate: ThreePointEstimate, rule: EstimateRule): number =>
  chargedDays(estimate, rule, NO_ALLOWANCE);

describe('ThreePointEstimate', () => {
  it('accepts an ordered triple', () => {
    const v = parseOrThrow(ThreePointEstimate, { optimistic: 1, realistic: 3, pessimistic: 8 });
    expect(v.realistic).toBe(3);
  });

  it('refuses a triple that is out of order', () => {
    expect(() =>
      parseOrThrow(ThreePointEstimate, { optimistic: 5, realistic: 1, pessimistic: 8 }),
    ).toThrow(ValidationError);
  });

  it('accepts half a day, because half a day is a real estimate', () => {
    const v = parseOrThrow(ThreePointEstimate, {
      optimistic: 0.5,
      realistic: 0.5,
      pessimistic: 1.5,
    });
    expect(v.optimistic).toBe(0.5);
  });

  it('ends at the largest duration one solver slice can represent', () => {
    expect(MAX_ESTIMATE_DAYS).toBe(44_739_242);
    expect(
      parseOrThrow(ThreePointEstimate, {
        optimistic: MAX_ESTIMATE_DAYS,
        realistic: MAX_ESTIMATE_DAYS,
        pessimistic: MAX_ESTIMATE_DAYS,
      }).realistic,
    ).toBe(MAX_ESTIMATE_DAYS);
    expect(() =>
      parseOrThrow(ThreePointEstimate, {
        optimistic: MAX_ESTIMATE_DAYS + 1,
        realistic: MAX_ESTIMATE_DAYS + 1,
        pessimistic: MAX_ESTIMATE_DAYS + 1,
      }),
    ).toThrow(ValidationError);
    expect(() =>
      parseOrThrow(ThreePointEstimate, {
        optimistic: 4_000_000_000,
        realistic: 4_000_000_000,
        pessimistic: 4_000_000_000,
      }),
    ).toThrow(ValidationError);
  });
});

describe('expectedDays', () => {
  it('weights the realistic figure four times, not evenly', () => {
    // The midpoint of 2 and 10 is 6. PERT says 4, because the person who wrote
    // `3` had thought about it and the tails had not earned equal billing.
    expect(
      expectedDays({ optimistic: 2, realistic: 3, pessimistic: 10 }, DEFAULT_PERT_WEIGHTS),
    ).toBe(4);
  });

  it('collapses to the value when all three agree', () => {
    expect(
      expectedDays({ optimistic: 5, realistic: 5, pessimistic: 5 }, DEFAULT_PERT_WEIGHTS),
    ).toBe(5);
  });

  it('keeps the fraction rather than rounding it', () => {
    // Rounding here compounds across a chain of forty work items into days that
    // never existed.
    expect(
      expectedDays({ optimistic: 1, realistic: 2, pessimistic: 4 }, DEFAULT_PERT_WEIGHTS),
    ).toBeCloseTo(13 / 6, 10);
  });

  it('is zero for an estimate of nothing', () => {
    expect(
      expectedDays({ optimistic: 0, realistic: 0, pessimistic: 0 }, DEFAULT_PERT_WEIGHTS),
    ).toBe(0);
  });
});

describe('finalDays', () => {
  const estimate = { optimistic: 2, realistic: 3, pessimistic: 10 };

  const exactly = (method: EstimateMethod): EstimateRule => ({
    method,
    pertWeights: DEFAULT_PERT_WEIGHTS,
    // The rounding these four cases are not about. Every figure below is a
    // whole number already, so `floor` leaves each of them exactly as the
    // method produced it.
    rounding: 'floor',
  });

  it('is PERT under the default method', () => {
    expect(finalDays(estimate, exactly('pert'))).toBe(4);
  });

  it('is the named point under the other three', () => {
    expect(finalDays(estimate, exactly('optimistic'))).toBe(2);
    expect(finalDays(estimate, exactly('realistic'))).toBe(3);
    expect(finalDays(estimate, exactly('pessimistic'))).toBe(10);
  });

  it('agrees with expectedDays on pert, whatever the numbers', () => {
    // The two must not drift: the schedule's durations and the figure beside
    // the trio are the same number, and this is what says so.
    for (const trio of [
      { optimistic: 0, realistic: 0, pessimistic: 0 },
      { optimistic: 1, realistic: 2, pessimistic: 4 },
      { optimistic: 0.5, realistic: 0.5, pessimistic: 9 },
    ]) {
      expect(finalDays(trio, exactly('pert'))).toBe(
        Math.floor(expectedDays(trio, DEFAULT_PERT_WEIGHTS)),
      );
    }
  });
});

describe('isEstimateMethod', () => {
  it('accepts the four methods and nothing else', () => {
    for (const method of ESTIMATE_METHODS) expect(isEstimateMethod(method)).toBe(true);
    // The boundary check: a stored column or a posted body holding anything
    // else is data this code cannot plan with, and saying so is the point.
    for (const bad of ['PERT', 'median', '', null, undefined, 4, {}])
      expect(isEstimateMethod(bad)).toBe(false);
  });
});

describe('PertWeights', () => {
  it('accepts the coefficients a project may weigh its three points by', () => {
    const weights = parseOrThrow(PertWeights, { optimistic: 2, realistic: 3, pessimistic: 0 });
    expect(weights.realistic).toBe(3);
  });

  it('refuses a negative coefficient', () => {
    expect(() =>
      parseOrThrow(PertWeights, { optimistic: -1, realistic: 4, pessimistic: 1 }),
    ).toThrow(ValidationError);
  });

  it('refuses a coefficient JSON wrote as 1e999', () => {
    // The only non-finite number JSON can express, and it passes every
    // `>= 0` check ever written. `T1 column-widths-drag` learned this the
    // expensive way; here it would divide a triple by Infinity and plan
    // every step at zero days.
    expect(() =>
      parseOrThrow(PertWeights, {
        optimistic: Number.POSITIVE_INFINITY,
        realistic: 4,
        pessimistic: 1,
      }),
    ).toThrow(ValidationError);
  });

  it('refuses three zeroes, which have no divisor', () => {
    expect(() =>
      parseOrThrow(PertWeights, { optimistic: 0, realistic: 0, pessimistic: 0 }),
    ).toThrow(ValidationError);
  });
});

describe('isEstimateRounding', () => {
  it('accepts the three roundings and nothing else', () => {
    for (const rounding of ESTIMATE_ROUNDINGS) expect(isEstimateRounding(rounding)).toBe(true);
    for (const bad of ['nearest', 'CEIL', '', null, undefined, 1, {}])
      expect(isEstimateRounding(bad)).toBe(false);
  });
});

describe('expectedDays under a project’s own weights', () => {
  const estimate = { optimistic: 2, realistic: 3, pessimistic: 10 };

  it('divides by the sum of the weights rather than by six', () => {
    // 1/1/1 is the plain average of the three points: 15 / 3, not 15 / 6.
    expect(expectedDays(estimate, { optimistic: 1, realistic: 1, pessimistic: 1 })).toBe(5);
  });

  it('drops a point out of the divisor when its weight is zero', () => {
    expect(expectedDays(estimate, { optimistic: 0, realistic: 1, pessimistic: 1 })).toBe(6.5);
  });

  it('is the default arithmetic under the default weights', () => {
    expect(expectedDays(estimate, DEFAULT_PERT_WEIGHTS)).toBe(4);
  });
});

describe('finalDays rounds one step’s figure', () => {
  const half = { optimistic: 0.5, realistic: 0.5, pessimistic: 0.5 };
  const ruleWith = (over: Partial<EstimateRule> = {}): EstimateRule => ({
    ...DEFAULT_ESTIMATE_RULE,
    ...over,
  });

  it('ceils by default, which is what a project that has said nothing gets', () => {
    expect(DEFAULT_ESTIMATE_RULE.rounding).toBe('ceil');
    expect(finalDays(half, DEFAULT_ESTIMATE_RULE)).toBe(1);
  });

  it('floors and rounds when the project says so', () => {
    expect(finalDays(half, ruleWith({ rounding: 'floor' }))).toBe(0);
    expect(finalDays(half, ruleWith({ rounding: 'round' }))).toBe(1);
  });

  it('charges the figure as combined under `exact`, drift and all', () => {
    // The arithmetic every plan had until 2026-08-30, and the only one under
    // which a fraction reaches the schedule at all. Verbatim rather than
    // snapped: the wire has always carried the engine's own numbers, and the
    // snap belongs at the calendar boundary that turns them into days.
    expect(finalDays(half, ruleWith({ rounding: 'exact' }))).toBe(0.5);
    const drifted = { optimistic: 0.4, realistic: 1.1, pessimistic: 1.2 };
    expect(finalDays(drifted, ruleWith({ rounding: 'exact' }))).toBe(
      expectedDays(drifted, DEFAULT_PERT_WEIGHTS),
    );
  });

  it('rounds whatever the method picked, not only PERT', () => {
    const spread = { optimistic: 0.5, realistic: 2.5, pessimistic: 9 };
    expect(finalDays(spread, ruleWith({ method: 'realistic' }))).toBe(3);
    expect(finalDays(spread, ruleWith({ method: 'realistic', rounding: 'floor' }))).toBe(2);
    expect(finalDays(spread, ruleWith({ method: 'optimistic' }))).toBe(1);
  });

  it('rounds the figure the project’s own weights produced', () => {
    // 15 / 3 = 5 exactly under a plain average, where the default weights
    // would have combined the same triple to 4.
    expect(
      finalDays(
        { optimistic: 2, realistic: 3, pessimistic: 10 },
        ruleWith({ pertWeights: { optimistic: 1, realistic: 1, pessimistic: 1 } }),
      ),
    ).toBe(5);
  });

  /**
   * Proof: with `snapWorkdays` taken out of `roundDays` — a bare
   * `Math.ceil(days)` — this failed on `expect(received).toBe(expected) //
   * Expected: 1, Received: 2`: a day minted out of the bits `12.6 / 6` left
   * behind, on an estimate whose PERT figure is exactly 1. Watched
   * 2026-08-30.
   */
  it('does not mint a day out of a division’s leftover bits', () => {
    const drifting = { optimistic: 0.4, realistic: 1.1, pessimistic: 1.2 };
    // The premise: this really is the drifted double, not a whole 1.
    expect(expectedDays(drifting, DEFAULT_PERT_WEIGHTS)).not.toBe(1);
    expect(expectedDays(drifting, DEFAULT_PERT_WEIGHTS)).toBeCloseTo(1, 12);
    expect(finalDays(drifting, DEFAULT_ESTIMATE_RULE)).toBe(1);
  });

  it('keeps a genuine fraction as work, which is what the snap must not eat', () => {
    // 0.9 is nine tenths of a real day and 1e-9 away from nothing.
    const nearlyOne = { optimistic: 0.9, realistic: 0.9, pessimistic: 0.9 };
    expect(finalDays(nearlyOne, ruleWith({ rounding: 'floor' }))).toBe(0);
    expect(finalDays(nearlyOne, DEFAULT_ESTIMATE_RULE)).toBe(1);
  });
});

describe('allowancePercentOf', () => {
  it('accepts a percentage of at most two decimal places', () => {
    expect(allowancePercentOf(30)).toBe(30);
    expect(allowancePercentOf(12.34)).toBe(12.34);
    expect(allowanceHundredthsOf(12.34)).toBe(1234);
    expect(allowancePercentOf(0)).toBe(0);
    expect(Object.is(allowancePercentOf(-0), 0)).toBe(true);
    expect(allowancePercentOf(1000)).toBe(MAX_ALLOWANCE_PERCENT);
  });

  it('refuses more than two decimal places', () => {
    expect(allowancePercentOf(12.345)).toBeNull();
    expect(allowancePercentOf(0.001)).toBeNull();
    expect(allowancePercentOf(12.340000001)).toBeNull();
  });

  it('checks the range on the value as given, not after rounding it', () => {
    expect(allowancePercentOf(-1e-9)).toBeNull();
    expect(allowancePercentOf(1000.000000001)).toBeNull();
  });

  it('refuses negative, over-1000 and non-finite percentages', () => {
    expect(allowancePercentOf(-1)).toBeNull();
    expect(allowancePercentOf(-0.01)).toBeNull();
    expect(allowancePercentOf(1000.01)).toBeNull();
    expect(allowancePercentOf(Number.NaN)).toBeNull();
    expect(allowancePercentOf(Number.POSITIVE_INFINITY)).toBeNull();
    expect(allowancePercentOf(1e300)).toBeNull();
  });
});

describe('chargedDays', () => {
  const flat = (days: number): ThreePointEstimate => ({
    optimistic: days,
    realistic: days,
    pessimistic: days,
  });

  it('applies a 30% allowance to a 2-day base: 2.6 before rounding, 3 charged', () => {
    expect(beforeRoundingDays(flat(2), DEFAULT_ESTIMATE_RULE, 30)).toBeCloseTo(2.6, 12);
    expect(chargedDays(flat(2), DEFAULT_ESTIMATE_RULE, 30)).toBe(3);
  });

  /** Proof: see {@link chargedDays} — rounding the base first charges 3 here. */
  it('applies the allowance before rounding', () => {
    expect(beforeRoundingDays(flat(1.1), DEFAULT_ESTIMATE_RULE, 30)).toBeCloseTo(1.43, 12);
    expect(chargedDays(flat(1.1), DEFAULT_ESTIMATE_RULE, 30)).toBe(2);
  });

  it('does not mint a day out of the uplift’s bits', () => {
    expect(chargedDays(flat(10), DEFAULT_ESTIMATE_RULE, 10)).toBe(11);
    expect(chargedDays(flat(3), DEFAULT_ESTIMATE_RULE, 12.34)).toBe(4);
  });

  it('keeps an explicit zero estimate at zero under any allowance', () => {
    expect(chargedDays(flat(0), DEFAULT_ESTIMATE_RULE, MAX_ALLOWANCE_PERCENT)).toBe(0);
  });

  it('is the base figure at no allowance', () => {
    expect(chargedDays(flat(1.1), DEFAULT_ESTIMATE_RULE, NO_ALLOWANCE)).toBe(2);
  });

  it('throws for an allowance no boundary would have admitted', () => {
    expect(() => chargedDays(flat(1), DEFAULT_ESTIMATE_RULE, -5)).toThrow(
      'not a valid step allowance',
    );
  });
});

describe('allowanceOf', () => {
  it('reads the step’s allowance and throws for a step outside the read', () => {
    const allowances = new Map([['qa', 30]]);
    expect(allowanceOf(allowances, 'qa')).toBe(30);
    expect(() => allowanceOf(allowances, 'dev')).toThrow('no allowance is known for step dev');
  });
});
