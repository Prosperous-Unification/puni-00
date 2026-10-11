import { describe, expect, it } from 'bun:test';

import { ATTEMPT_OUTCOMES, isAttemptOutcome } from './stored-vocabularies';

describe('ATTEMPT_OUTCOMES', () => {
  it('admits exactly the three attempt outcomes', () => {
    expect([...ATTEMPT_OUTCOMES].sort()).toEqual(['cancelled', 'failed', 'succeeded']);
    for (const outcome of ATTEMPT_OUTCOMES) expect(isAttemptOutcome(outcome)).toBe(true);
    for (const stranger of ['running', 'done', 'FAILED', '', null, undefined, 3]) {
      expect(isAttemptOutcome(stranger)).toBe(false);
    }
  });
});
