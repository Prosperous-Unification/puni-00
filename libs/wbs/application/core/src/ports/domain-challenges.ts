import type { WriteStamp } from './write-stamp';

/** A claim visible to a member of its organization; the secret TXT value is never stored. */
export interface DomainClaimSummary {
  readonly id: string;
  readonly domain: string;
  readonly status: 'pending' | 'verified' | 'suspended';
  readonly challengeExpiresAt: number | null;
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
}
