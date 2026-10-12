import { describe, expect, it } from 'bun:test';

import {
  ATTEMPT_OUTCOMES,
  ESTIMATE_UNITS,
  isAttemptOutcome,
  isEstimateUnit,
} from './stored-vocabularies';

describe('ATTEMPT_OUTCOMES', () => {
  it('admits exactly the three attempt outcomes', () => {
    expect([...ATTEMPT_OUTCOMES].sort()).toEqual(['cancelled', 'failed', 'succeeded']);
    for (const outcome of ATTEMPT_OUTCOMES) expect(isAttemptOutcome(outcome)).toBe(true);
    for (const stranger of ['running', 'done', 'FAILED', '', null, undefined, 3]) {
      expect(isAttemptOutcome(stranger)).toBe(false);
    }
  });
});

it('admits exactly the two estimate units', () => {
  expect([...ESTIMATE_UNITS].sort()).toEqual(['minutes', 'workdays']);
  for (const unit of ESTIMATE_UNITS) expect(isEstimateUnit(unit)).toBe(true);
  for (const stranger of ['hours', 'days', '', null, undefined, 3])
    expect(isEstimateUnit(stranger)).toBe(false);
});
