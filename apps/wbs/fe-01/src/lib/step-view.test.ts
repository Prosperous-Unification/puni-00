import { describe, expect, it } from 'vitest';

import { stepViewOf } from './wbs-api';

describe('stepViewOf', () => {
  /** Proof: see `stepViewOf`. */
  it('reads a step from an older be-01 at 0%', () => {
    expect(stepViewOf({ id: 'qa', name: 'QA' })).toEqual({
      estimateUnit: 'workdays' as const,
      id: 'qa',
      name: 'QA',
      allowancePercent: 0,
    });
  });

  it('keeps the allowance a current be-01 sends', () => {
    expect(
      stepViewOf({ estimateUnit: 'workdays' as const, id: 'qa', name: 'QA', allowancePercent: 30 })
        .allowancePercent,
    ).toBe(30);
  });
});

it('preserves a present minute unit from the backend', () => {
  expect(stepViewOf({ id: 'agent', name: 'Agent', estimateUnit: 'minutes' }).estimateUnit).toBe(
    'minutes',
  );
});
