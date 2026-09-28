import type { WriteStamp } from './write-stamp';

/** A claim visible to a member of its organization; the secret TXT value is never stored. */
export interface DomainClaimSummary {
  readonly id: string;
  readonly domain: string;
  readonly status: 'pending' | 'verified' | 'suspended';
  readonly challengeExpiresAt: number | null;
}

/** Initial challenge persistence, with authority rechecked in the committing transaction. */
export interface DomainChallenges {
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
}
