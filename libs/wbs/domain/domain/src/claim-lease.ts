/**
 * How long a leased claim stays in force without a renewal
 * (`openspec/changes/wbs-claim-leases/design.md` L2): one constant for the
 * deployment, not an environment variable, because it is the protocol between
 * an agent and the coordinator rather than a tenant's plan knob.
 */
export const CLAIM_LEASE_MS = 15 * 60_000;

/**
 * The resolution of a renewal (L4): a lease whose expiry is within this much of
 * a fresh one is not written again, so a heartbeat takes the write turn at most
 * once per resolution, as a credential's last use does (issue #668).
 */
export const LEASE_RENEWAL_RESOLUTION_MS = 60_000;

/**
 * Why the coordinator released a claim: its lease ran out unrenewed, or the
 * person's last live machine credential was revoked (L8).
 */
export type LeaseReleaseReason = 'lease_expired' | 'credential_revoked';

/**
 * One person's leases after a renewal: how many are in force, and the
 * earliest instant one of them must be renewed by, null when none is (L12).
 */
export interface LeaseStanding {
  readonly leases: number;
  readonly leaseExpiresAt: number | null;
}

/**
 * What the claim store's lease renewal answers: the person's standing after the
 * renewal, and the projects in which its committed write moved at least one
 * lease, in project-id order, empty when it moved none. The heartbeat route
 * announces `claims_changed` to exactly these (`wbs-claim-display` C4).
 */
export interface LeaseRenewal {
  readonly standing: LeaseStanding;
  readonly renewedProjectIds: readonly string[];
}

/**
 * The expiry a claim written at `at` carries (L1): `at + CLAIM_LEASE_MS` when
 * the caller's credential is pinned to the claimant itself (an API key, a
 * trusted-issuer token or an MCP consent of that person), else null. A
 * human's claim, an upstream pair's, and a pinned credential's delegated claim
 * for another person are never leased.
 */
export function leaseOf(
  pinnedPersonId: string | null,
  claimantId: string,
  at: number,
): number | null {
  // Proof: with the claimant comparison removed (any pin leases),
  // `leases only a pin naming the claimant itself` failed (5 pass, 1 fail);
  // watched 2026-10-23.
  return pinnedPersonId !== null && pinnedPersonId === claimantId ? at + CLAIM_LEASE_MS : null;
}

/**
 * Whether a lease expiring at `expiresAt` is in force at `at`: on
 * `[written, expiresAt)`, so at exactly `expiresAt` it has expired (L5).
 */
export function isLeaseInForce(expiresAt: number, at: number): boolean {
  // Proof: with `<=` here, `is expired at exactly its expiry` failed (5 pass,
  // 1 fail); watched 2026-10-23.
  return at < expiresAt;
}

/**
 * The renewal a write at `at` makes (L4): every lease in force that expires
 * before `dueBefore` is moved to `expiresAt`. A lease at or above `dueBefore`
 * was renewed within the resolution and is left as it is.
 */
export function renewalAt(at: number): { readonly expiresAt: number; readonly dueBefore: number } {
  const expiresAt = at + CLAIM_LEASE_MS;
  return { expiresAt, dueBefore: expiresAt - LEASE_RENEWAL_RESOLUTION_MS };
}
