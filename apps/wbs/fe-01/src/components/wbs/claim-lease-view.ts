import type { ClaimView } from '@/lib/wbs-api';

/**
 * A claim's lease as the screen reads it (`wbs-claim-display` C10): none for a
 * claim no agent renews, the whole minutes left while it is in force (`0` is
 * under one minute), or **releasing** once it ended, with whether it expired or
 * the holder's credential was revoked.
 */
export type LeaseView =
  | { kind: 'none' }
  | { kind: 'in_force'; minutes: number }
  | { kind: 'releasing'; cause: 'lease_expired' | 'credential_revoked' };

/**
 * The clock one claims read was taken on: be-01's `readAt` (epoch ms) and the
 * monotonic instant the read installed in, the pair `InstalledClaims` carries.
 */
export interface ClaimsClock {
  readAt: number;
  installedAt: number;
}

const MINUTE_MS = 60_000;

/**
 * What a lease reads at the monotonic instant `now` (C6): the server's instant
 * is `readAt` advanced by the time elapsed since the read installed, so the
 * browser's wall clock never enters, and a browser an hour ahead still reads
 * `14m` for a lease with fourteen and a half minutes left.
 *
 * A revoked lease reads releasing whatever its end says. A lease reads
 * releasing at exactly its end. An instant before the install counts as no time
 * elapsed: the table's ticker may last have ticked before the newest read.
 */
export function leaseViewOf(
  lease: Pick<ClaimView, 'leaseExpiresAt' | 'leaseRevokedAt'>,
  clock: ClaimsClock,
  now: number,
): LeaseView {
  if (lease.leaseExpiresAt === null) return { kind: 'none' };
  if (lease.leaseRevokedAt !== null) return { kind: 'releasing', cause: 'credential_revoked' };
  // Proof: `Date.now()` here in place of the server instant failed 7 of 9
  // cases in `claim-lease-view.test.ts`, the clock-ahead case on `expected
  // 'releasing' to be '14m'` and the wall-clock property; watched 2026-10-24.
  const serverNow = clock.readAt + Math.max(0, now - clock.installedAt);
  const left = lease.leaseExpiresAt - serverNow;
  // Proof: `<` for `<=` made `reads releasing at exactly the lease end` fail on
  // `{ kind: 'in_force', minutes: 0 }`; watched 2026-10-24.
  if (left <= 0) return { kind: 'releasing', cause: 'lease_expired' };
  return { kind: 'in_force', minutes: Math.floor(left / MINUTE_MS) };
}

/** The chip's lease text: `14m`, `<1m`, `releasing`, or null for no lease. */
export function leaseChipText(view: LeaseView): string | null {
  switch (view.kind) {
    case 'none':
      return null;
    case 'in_force':
      return view.minutes === 0 ? '<1m' : `${String(view.minutes)}m`;
    case 'releasing':
      return 'releasing';
  }
}

/**
 * The card's lease words: `lease 14 min left`, `lease under 1 min left`,
 * `lease expired, releasing`, `credential revoked, releasing`, or null for no
 * lease.
 */
export function leaseCardWords(view: LeaseView): string | null {
  switch (view.kind) {
    case 'none':
      return null;
    case 'in_force':
      return view.minutes === 0
        ? 'lease under 1 min left'
        : `lease ${String(view.minutes)} min left`;
    case 'releasing':
      return view.cause === 'credential_revoked'
        ? 'credential revoked, releasing'
        : 'lease expired, releasing';
  }
}
