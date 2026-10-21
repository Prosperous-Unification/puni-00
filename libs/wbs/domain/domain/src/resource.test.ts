import { describe, expect, it } from 'bun:test';

import { isResourceKind, refuseDemand } from './resource';

describe('refuseDemand', () => {
  // Proof: with the kind test removed from refuseDemand, the exclusive case
  // below answered null for 2 units; watched 2026-10-20.
  it('refuses any units but 1 on an exclusive resource', () => {
    expect(refuseDemand('exclusive', 2)).toBe('exclusive_demand_is_one');
    expect(refuseDemand('exclusive', 1)).toBeNull();
  });

  it('takes any bounded units on a divisible resource', () => {
    expect(refuseDemand('divisible', 1)).toBeNull();
    expect(refuseDemand('divisible', 4096)).toBeNull();
  });
});

describe('isResourceKind', () => {
  it('names exactly the two kinds', () => {
    expect(isResourceKind('exclusive')).toBe(true);
    expect(isResourceKind('divisible')).toBe(true);
    expect(isResourceKind('renewable')).toBe(false);
    expect(isResourceKind(1)).toBe(false);
  });
});
