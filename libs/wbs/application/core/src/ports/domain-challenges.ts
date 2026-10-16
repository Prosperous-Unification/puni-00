import type { WriteStamp } from './write-stamp';

/** A claim visible to a member of its organization; the secret TXT value is never stored. */
export interface DomainClaimSummary {
  readonly id: string;
  readonly domain: string;
  readonly status: 'pending' | 'verified' | 'suspended';
  readonly challengeExpiresAt: number | null;
  readonly lastSuccessAt: number | null;
  readonly lastCheckedAt: number | null;
  readonly proofWarning: boolean;
}

/** An authorized claim snapshot captured before an external DNS lookup. */
interface DomainVerificationBase {
  readonly id: string;
  readonly domain: string;
  readonly challengeDigest: string;
}

/** Phase determines which captured proof fields exist at commit. */
export type DomainVerificationSnapshot = DomainVerificationBase &
  (
    | { readonly phase: 'pending'; readonly challengeExpiresAt: number }
    | {
        readonly phase: 'rotation';
        readonly previousProofDigest: string;
        readonly previousProofValidUntil: number;
      }
    | {
        readonly phase: 'recovery';
        readonly previousProofDigest: string | null;
        readonly previousProofValidUntil: number | null;
      }
  );

/** Expected DNS network, protocol or deadline unavailability, never cleanup failure. */
export class DomainDnsUnavailableError extends Error {
  override name = 'DomainDnsUnavailableError';
}

/**
 * Authoritative TXT records, one DNS TXT record per string.
 * Expected unavailability throws {@link DomainDnsUnavailableError}; unexpected
 * invariant and cleanup failures propagate separately. Cancellation must join
 * owned resources before settling. The production adapter must finish work and
 * cleanup inside the proof service's five-second outer watchdog.
 */
export interface DomainResolver {
  lookupTxt(name: string, signal: AbortSignal): Promise<readonly string[]>;
}

/** A due verified claim, captured before an authoritative DNS lookup. */
export interface RetainedDomainProof {
  readonly id: string;
  readonly organizationId: string;
  readonly domain: string;
  readonly proofDigest: string;
  readonly previousProofDigest: string | null;
  readonly previousProofValidUntil: number | null;
  readonly lastCheckedAt: number;
}

/** The write side of periodic proof checks; completion rechecks this snapshot. */
export interface DomainProofChecks {
  readonly resolver: DomainResolver;
  readDueProofs(at: number): Promise<readonly RetainedDomainProof[]>;
  /**
   * Rechecks an old match against `now` inside the committing transaction.
   * Cancellation is admitted after acquiring the write turn, before mutations;
   * a synchronous transaction already admitted may commit. Cancelled work is
   * distinct from a changed snapshot and must not increment stale counts.
   */
  finishProofCheck(
    proof: RetainedDomainProof,
    matched: 'current' | 'previous' | null,
    at: number,
    now: () => number,
    cancellation?: AbortSignal,
  ): Promise<'checked' | 'stale' | 'cancelled'>;
}

/** Initial challenge persistence, with authority rechecked in the committing transaction. */
export interface DomainChallenges {
  readonly resolver: DomainResolver;
  listClaims(
    organizationId: string,
    actorId: string,
  ): Promise<readonly DomainClaimSummary[] | 'forbidden'>;
  reissueClaim(
    organizationId: string,
    actorId: string,
    domain: string,
    challengeDigest: string,
    challengeExpiresAt: number,
    stamp: WriteStamp,
  ): Promise<
    | { kind: 'issued'; id: string }
    | { kind: 'forbidden' | 'unclaimable' | 'already_claimed' | 'inactive' }
  >;
  readClaimForVerification(
    organizationId: string,
    actorId: string,
    claimId: string,
  ): Promise<DomainVerificationSnapshot | 'forbidden' | 'not_found' | 'stale' | 'inactive'>;
  verifyClaim(
    organizationId: string,
    actorId: string,
    claim: DomainVerificationSnapshot,
    observedDigest: string,
    stamp: WriteStamp,
    now: () => number,
  ): Promise<'verified' | 'forbidden' | 'not_found' | 'stale' | 'taken' | 'inactive'>;
  rotateClaim(
    organizationId: string,
    actorId: string,
    claimId: string,
    token: string,
    stamp: WriteStamp,
  ): Promise<
    | { kind: 'issued'; domain: string; dnsValue: string }
    | { kind: 'forbidden' | 'not_found' | 'stale' | 'inactive' }
  >;
  /** Refused with `sso_connection_exists` while an enterprise connection names the claim. */
  releaseClaim(
    organizationId: string,
    actorId: string,
    claimId: string,
  ): Promise<
    'released' | 'forbidden' | 'not_found' | 'stale' | 'inactive' | 'sso_connection_exists'
  >;
  /** Reads current claim status; approval must still recheck in its own write transaction. */
  isVerifiedDomain(organizationId: string, domain: string): Promise<boolean>;
}
