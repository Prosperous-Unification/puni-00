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

/** A pending, authorized claim captured before an external DNS lookup. */
export interface PendingDomainClaim {
  readonly id: string;
  readonly domain: string;
  readonly challengeDigest: string;
  readonly challengeExpiresAt: number;
}

/** Authoritative TXT records, one DNS TXT record per string; failure throws. */
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
  finishProofCheck(
    proof: RetainedDomainProof,
    matched: 'current' | 'previous' | null,
    at: number,
  ): Promise<'checked' | 'stale'>;
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
  readPendingClaim(
    organizationId: string,
    actorId: string,
    claimId: string,
  ): Promise<PendingDomainClaim | 'forbidden' | 'not_found' | 'stale' | 'inactive'>;
  verifyClaim(
    organizationId: string,
    actorId: string,
    claim: PendingDomainClaim,
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
  /** Reads current claim status; approval must still recheck in its own write transaction. */
  isVerifiedDomain(organizationId: string, domain: string): Promise<boolean>;
}
