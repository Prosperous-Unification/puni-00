import type { DomainVerificationSnapshot } from '@wbs/core';
import { isClaimableDomain } from '@wbs/domain';
import { and, eq } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { readOrganizationActivation } from './organization-activation';
import { loadPublicEmailPolicy } from './public-email-policy';
import { organizationDomainClaim, organizationMembership } from './schema';

/**
 * Captures a verifiable claim in one read transaction after activation and authority checks.
 * Throws for corrupt pending or retained proof state; DNS runs after this transaction returns.
 */
export function readVerificationSnapshot(
  database: SQLiteBunDatabase,
  organizationId: string,
  actorId: string,
  claimId: string,
  policyDirectory: string | undefined,
): DomainVerificationSnapshot | 'forbidden' | 'not_found' | 'stale' | 'inactive' {
  return database.transaction((tx) => {
    // Proof: 2026-09-28, bypassing this marker read made store
    // `keeps both verification phases inert before activation` expose a pending claim.
    if (readOrganizationActivation(tx) !== 'activated') return 'inactive';
    const member = tx
      .select({ role: organizationMembership.role })
      .from(organizationMembership)
      .where(
        and(
          eq(organizationMembership.organizationId, organizationId),
          eq(organizationMembership.userId, actorId),
        ),
      )
      .get();
    if (member?.role !== 'super_admin') return 'forbidden';
    const claim = tx
      .select()
      .from(organizationDomainClaim)
      .where(
        and(
          eq(organizationDomainClaim.id, claimId),
          eq(organizationDomainClaim.organizationId, organizationId),
        ),
      )
      .get();
    if (claim === undefined) return 'not_found';
    const isRotation = claim.status === 'verified' && claim.previousProofDigest !== null;
    // Proof: 2026-09-28, excluding suspended claims made mounted
    // `restores a suspended claim through retained TXT proof without changing owner`
    // return stale 409 rather than verify the retained digest.
    const isRecovery = claim.status === 'suspended';
    if (!isRotation && !isRecovery && claim.status !== 'pending') return 'stale';
    // Proof: 2026-09-28, returning stale here made mounted `surfaces corrupt
    // pending proof fields as a server error` answer 409 for a pending row
    // with both required fields null.
    if (
      claim.status === 'pending' &&
      (claim.challengeDigest === null || claim.challengeExpiresAt === null)
    )
      throw new Error(`pending domain claim ${claim.id} lacks challenge proof`);
    if (!isClaimableDomain(claim.domain, loadPublicEmailPolicy(policyDirectory))) return 'stale';
    if (isRotation || isRecovery) {
      // Proof: 2026-09-29, removing the timestamp validation here made mounted
      // `throws when a suspended claim lacks retained timestamps at capture`
      // (NULL last_checked_at on a suspended owner) reach DNS lookup once; the
      // commit guard then threw, so the test pins capture by counting zero lookups.
      if (
        claim.proofDigest === null ||
        claim.lastSuccessAt === null ||
        claim.lastCheckedAt === null
      )
        throw new Error(`rotating domain ${claim.id} lacks retained proof`);
      const retained = {
        id: claim.id,
        domain: claim.domain,
        challengeDigest: claim.proofDigest,
        previousProofDigest: claim.previousProofDigest,
        previousProofValidUntil: claim.previousProofValidUntil,
      };
      if (isRotation) {
        if (claim.previousProofDigest === null || claim.previousProofValidUntil === null)
          throw new Error(`rotating domain ${claim.id} lacks previous proof`);
        return {
          ...retained,
          phase: 'rotation',
          previousProofDigest: claim.previousProofDigest,
          previousProofValidUntil: claim.previousProofValidUntil,
        };
      }
      return { ...retained, phase: 'recovery' };
    }
    if (claim.challengeDigest === null || claim.challengeExpiresAt === null)
      throw new Error(`pending domain ${claim.id} lacks challenge`);
    return {
      id: claim.id,
      domain: claim.domain,
      challengeDigest: claim.challengeDigest,
      challengeExpiresAt: claim.challengeExpiresAt,
      phase: 'pending',
    };
  });
}
