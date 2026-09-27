import { describe, expect, it } from 'vitest';

import { sameSteps } from './delivered-plan-store';

describe('sameSteps', () => {
  const qa = { id: 'qa', name: 'QA', allowancePercent: 0 };

  it('treats an identical list as the same', () => {
    expect(sameSteps([qa], [{ ...qa }])).toBe(true);
  });

  /** Proof: see `sameSteps`. */
  it('a changed allowance is a different step list', () => {
    expect(sameSteps([qa], [{ ...qa, allowancePercent: 30 }])).toBe(false);
  });
});
