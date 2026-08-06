import { parseOrThrow, ValidationError } from '@wbs/validation';
import { describe, expect, it } from 'bun:test';

import { expectedDays, ThreePointEstimate } from './estimate';

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
});

describe('expectedDays', () => {
  it('weights the realistic figure four times, not evenly', () => {
    // The midpoint of 2 and 10 is 6. PERT says 4, because the person who wrote
    // `3` had thought about it and the tails had not earned equal billing.
    expect(expectedDays({ optimistic: 2, realistic: 3, pessimistic: 10 })).toBe(4);
  });

  it('collapses to the value when all three agree', () => {
    expect(expectedDays({ optimistic: 5, realistic: 5, pessimistic: 5 })).toBe(5);
  });

  it('keeps the fraction rather than rounding it', () => {
    // Rounding here compounds across a chain of forty work items into days that
    // never existed.
    expect(expectedDays({ optimistic: 1, realistic: 2, pessimistic: 4 })).toBeCloseTo(13 / 6, 10);
  });

  it('is zero for an estimate of nothing', () => {
    expect(expectedDays({ optimistic: 0, realistic: 0, pessimistic: 0 })).toBe(0);
  });
});
