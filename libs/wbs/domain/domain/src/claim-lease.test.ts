import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';

import {
  CLAIM_LEASE_MS,
  isLeaseInForce,
  LEASE_RENEWAL_RESOLUTION_MS,
  leaseOf,
  renewalAt,
} from './claim-lease';

describe('leaseOf', () => {
  it('leases only a pin naming the claimant itself', () => {
    expect(leaseOf('codex', 'codex', 1_000)).toBe(1_000 + CLAIM_LEASE_MS);
    expect(leaseOf('codex', 'worker', 1_000)).toBeNull();
    expect(leaseOf(null, 'codex', 1_000)).toBeNull();
  });
});

describe('isLeaseInForce', () => {
  it('is in force one millisecond before its expiry', () => {
    expect(isLeaseInForce(5_000, 4_999)).toBe(true);
  });

  it('is expired at exactly its expiry', () => {
    expect(isLeaseInForce(5_000, 5_000)).toBe(false);
  });

  it('is in force exactly when the instant precedes the expiry', () => {
    fc.assert(
      fc.property(fc.nat(), fc.nat(), (expiresAt, at) => {
        expect(isLeaseInForce(expiresAt, at)).toBe(at < expiresAt);
      }),
    );
  });
});

describe('renewalAt', () => {
  it('renews to a full lease and leaves one renewed within the resolution', () => {
    expect(renewalAt(10_000)).toEqual({
      expiresAt: 10_000 + CLAIM_LEASE_MS,
      dueBefore: 10_000 + CLAIM_LEASE_MS - LEASE_RENEWAL_RESOLUTION_MS,
    });
  });

  it('never leaves due a lease it has just written', () => {
    fc.assert(
      fc.property(fc.nat(), (at) => {
        const { expiresAt, dueBefore } = renewalAt(at);
        expect(expiresAt < dueBefore).toBe(false);
        expect(isLeaseInForce(dueBefore, at)).toBe(true);
      }),
    );
  });
});
