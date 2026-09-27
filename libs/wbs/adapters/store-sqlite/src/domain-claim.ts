import type { WriteStamp } from '@wbs/core';
import { and, eq, gt, inArray } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { auditOnCreate, auditOnUpdate } from './audit';
import { isUniqueViolation, UNIQUE_INDEXES } from './constraint';
import type { Gate } from './gate';
import { organizationDomainClaim } from './schema';

/** A pending claim with its current challenge; only the token's digest is stored. */
export interface OpenedDomainClaim {
  readonly id: string;
  readonly organizationId: string;
  /** Already canonical: lowercase ASCII IDNA, checked against the public-domain policy. */
  readonly domain: string;
  readonly challengeDigest: string;
  readonly challengeExpiresAt: number;
}

/**
 * Domain claims and their single verified owner. Inert until the domain slice
 * (tasks 5.1–5.5) puts DNS proof and super-admin authority in front of it.
 */
export class DomainClaimRepository {
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly gate: Gate,
  ) {}

  /** Records a pending claim. A pending claim reserves nothing. */
  async openClaim(claim: OpenedDomainClaim, stamp: WriteStamp): Promise<void> {
    await this.gate.enter(async () => {
      await Promise.resolve();
      this.db
        .insert(organizationDomainClaim)
        .values({ ...claim, status: 'pending', ...auditOnCreate(stamp) })
        .run();
    });
  }

  /**
   * Promotes a pending claim whose DNS proof matched `observedDigest` to the
   * verified owner, retaining that digest as the ownership proof.
   *
   * The update is conditioned on the digest and expiry the caller observed, so
   * an in-flight lookup cannot revive a rotated or expired challenge
   * (`stale`). The partial unique index `organization_domain_claim_owner`
   * decides a concurrent race: the loser's update violates it and answers
   * `taken`.
   *
   * Proof: dropping either the digest or the expiry predicate failed `refuses
   * promotion with a stale or expired challenge` (`Received: "verified"`).
   * Observed 2026-09-27.
   */
  async promoteClaim(
    claimId: string,
    observedDigest: string,
    stamp: WriteStamp,
  ): Promise<'verified' | 'taken' | 'stale'> {
    return await this.gate.enter(async () => {
      await Promise.resolve();
      try {
        const promoted = this.db
          .update(organizationDomainClaim)
          .set({
            status: 'verified',
            proofDigest: observedDigest,
            challengeDigest: null,
            challengeExpiresAt: null,
            lastSuccessAt: stamp.at,
            lastCheckedAt: stamp.at,
            ...auditOnUpdate(stamp),
          })
          .where(
            and(
              eq(organizationDomainClaim.id, claimId),
              eq(organizationDomainClaim.status, 'pending'),
              eq(organizationDomainClaim.challengeDigest, observedDigest),
              gt(organizationDomainClaim.challengeExpiresAt, stamp.at),
            ),
          )
          .run();
        return promoted.changes === 1 ? 'verified' : 'stale';
      } catch (err) {
        if (isUniqueViolation(err, UNIQUE_INDEXES.verifiedDomainOwner)) return 'taken';
        throw err;
      }
    });
  }

  /** The organization owning `domain` as verified or suspended, or null. */
  async findOwner(domain: string): Promise<string | null> {
    await Promise.resolve();
    const row = this.db
      .select({ organizationId: organizationDomainClaim.organizationId })
      .from(organizationDomainClaim)
      .where(
        and(
          eq(organizationDomainClaim.domain, domain),
          inArray(organizationDomainClaim.status, ['verified', 'suspended']),
        ),
      )
      .get();
    return row?.organizationId ?? null;
  }
}
