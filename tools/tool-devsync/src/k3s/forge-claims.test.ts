import { describe, expect, it } from 'bun:test';

import { claimLease, claimLeaseNames, decodeClaimLease, requireOwnClaim } from './forge-claims';

const ALPHA = { slug: 'alpha', worktree: '/w/alpha' };

describe('forge claims', () => {
  it('names one Lease per slug and one per worktree', () => {
    const [slugLease, worktreeLease] = claimLeaseNames(ALPHA);
    expect(slugLease).toBe('dev-alpha');
    expect(worktreeLease).toMatch(/^dev-wt-[0-9a-f]{16}$/);
    expect(claimLeaseNames({ slug: 'beta', worktree: '/w/alpha' })[1]).toBe(worktreeLease);
  });

  it('reads back the pair a Lease holds', () => {
    expect(decodeClaimLease(claimLease('dev-alpha', 'puni-forge', 'f9', ALPHA))).toEqual(ALPHA);
    expect(() => decodeClaimLease({ metadata: { name: 'dev-alpha' } })).toThrow('lacks');
  });

  it('accepts its own claim', () => {
    expect(() => {
      requireOwnClaim(ALPHA, ALPHA);
    }).not.toThrow();
  });

  it('refuses a Lease another environment holds', () => {
    expect(() => {
      requireOwnClaim(ALPHA, { slug: 'alpha', worktree: '/w/beta' });
    }).toThrow('slug alpha already serves /w/alpha');
    expect(() => {
      requireOwnClaim(ALPHA, { slug: 'beta', worktree: '/w/alpha' });
    }).toThrow('already served as slug alpha');
  });
});
