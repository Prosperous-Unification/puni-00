import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { leaseCardWords, leaseChipText, leaseViewOf } from './claim-lease-view';

const MINUTE = 60_000;
/** be-01's clock at the read: an arbitrary instant, far from any browser's. */
const READ_AT = Date.UTC(2026, 9, 24, 10, 0);
/** The monotonic instant the read installed in: unrelated to any epoch. */
const INSTALLED_AT = 5_000;
const CLOCK = { readAt: READ_AT, installedAt: INSTALLED_AT };

const leased = (leaseExpiresAt: number, leaseRevokedAt: number | null = null) => ({
  leaseExpiresAt,
  leaseRevokedAt,
});

afterEach(() => {
  vi.useRealTimers();
});

describe('a lease as the chip and the card read it', () => {
  it('counts whole minutes on the server clock, rounded down', () => {
    const view = leaseViewOf(leased(READ_AT + 14.5 * MINUTE), CLOCK, INSTALLED_AT);
    expect(view).toEqual({ kind: 'in_force', minutes: 14 });
    expect(leaseChipText(view)).toBe('14m');
    expect(leaseCardWords(view)).toBe('lease 14 min left');
  });

  it('moves with the time elapsed since the read installed', () => {
    const later = leaseViewOf(leased(READ_AT + 14.5 * MINUTE), CLOCK, INSTALLED_AT + 2 * MINUTE);
    expect(leaseChipText(later)).toBe('12m');
  });

  it('reads 14m whatever the browser’s wall clock says, an hour ahead included', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(READ_AT + 60 * MINUTE);
    expect(leaseChipText(leaseViewOf(leased(READ_AT + 14.5 * MINUTE), CLOCK, INSTALLED_AT))).toBe(
      '14m',
    );
  });

  it('never lets the wall clock change the answer', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    fc.assert(
      fc.property(
        fc.integer({ min: -3 * 60 * MINUTE, max: 3 * 60 * MINUTE }),
        fc.integer({ min: 0, max: 30 * MINUTE }),
        fc.integer({ min: 0, max: 40 * MINUTE }),
        fc.integer({ min: 0, max: 2_000_000_000_000 }),
        (leaseOffset, elapsed, revokedOffset, wall) => {
          const lease = leased(READ_AT + leaseOffset, revokedOffset % 2 === 0 ? null : READ_AT);
          vi.setSystemTime(0);
          const before = leaseViewOf(lease, CLOCK, INSTALLED_AT + elapsed);
          vi.setSystemTime(wall);
          expect(leaseViewOf(lease, CLOCK, INSTALLED_AT + elapsed)).toEqual(before);
        },
      ),
      { seed: 20261024, numRuns: 200 },
    );
  });

  it('reads <1m under sixty seconds, never seconds', () => {
    const view = leaseViewOf(leased(READ_AT + 59_999), CLOCK, INSTALLED_AT);
    expect(view).toEqual({ kind: 'in_force', minutes: 0 });
    expect(leaseChipText(view)).toBe('<1m');
    expect(leaseCardWords(view)).toBe('lease under 1 min left');
  });

  it('reads releasing at exactly the lease end', () => {
    const view = leaseViewOf(leased(READ_AT + MINUTE), CLOCK, INSTALLED_AT + MINUTE);
    expect(view).toEqual({ kind: 'releasing', cause: 'lease_expired' });
    expect(leaseChipText(view)).toBe('releasing');
    expect(leaseCardWords(view)).toBe('lease expired, releasing');
  });

  it('reads a revoked credential as releasing, with its cause, while time remains', () => {
    const view = leaseViewOf(leased(READ_AT + 10 * MINUTE, READ_AT), CLOCK, INSTALLED_AT);
    expect(view).toEqual({ kind: 'releasing', cause: 'credential_revoked' });
    expect(leaseChipText(view)).toBe('releasing');
    expect(leaseCardWords(view)).toBe('credential revoked, releasing');
  });

  it('reads nothing for a claim without a lease', () => {
    const view = leaseViewOf({ leaseExpiresAt: null, leaseRevokedAt: null }, CLOCK, INSTALLED_AT);
    expect(view).toEqual({ kind: 'none' });
    expect(leaseChipText(view)).toBeNull();
    expect(leaseCardWords(view)).toBeNull();
  });

  it('counts a monotonic instant before the install as no time elapsed', () => {
    // The ticker's last instant can predate a claims read that installed since.
    const view = leaseViewOf(leased(READ_AT + 14.5 * MINUTE), CLOCK, INSTALLED_AT - 3 * MINUTE);
    expect(leaseChipText(view)).toBe('14m');
  });
});
