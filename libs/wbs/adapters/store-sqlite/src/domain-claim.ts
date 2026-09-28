import type {
  DomainChallenges,
  DomainClaimSummary,
  DomainResolver,
  PendingDomainClaim,
  WriteStamp,
} from '@wbs/core';
import { isClaimableDomain } from '@wbs/domain';
import { and, eq, gt, inArray } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { auditOnCreate, auditOnUpdate } from './audit';
import { isUniqueViolation, UNIQUE_INDEXES } from './constraint';
import type { Gate } from './gate';
import { readOrganizationActivation } from './organization-activation';
import { loadPublicEmailPolicy } from './public-email-policy';
import { organizationDomainClaim, organizationMembership } from './schema';

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
 * Domain claims and their single verified owner. Initial challenge issuance
 * is mounted only after activation and checks current super-admin authority;
 * DNS verification uses the injected resolver; production currently binds a
 * refusing resolver. The remaining ownership lifecycle is still unwired.
 */
export class DomainClaimRepository implements DomainChallenges {
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly gate: Gate,
    private readonly policyDirectory?: string,
    readonly resolver: DomainResolver = {
      lookupTxt: () => Promise.reject(new Error('authoritative DNS resolver unavailable')),
    },
  ) {}

  /** Reads only a current organization's pending claim after current role and marker checks. */
  async readPendingClaim(
    organizationId: string,
    actorId: string,
    claimId: string,
  ): Promise<PendingDomainClaim | 'forbidden' | 'not_found' | 'stale' | 'inactive'> {
    await Promise.resolve();
    return this.db.transaction((tx) => {
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
      if (claim.status !== 'pending') return 'stale';
      // Proof: 2026-09-28, returning stale here made mounted `surfaces corrupt
      // pending proof fields as a server error` answer 409 for a pending row
      // with both required fields null.
      if (claim.challengeDigest === null || claim.challengeExpiresAt === null)
        throw new Error(`pending domain claim ${claim.id} lacks challenge proof`);
      if (!isClaimableDomain(claim.domain, loadPublicEmailPolicy(this.policyDirectory)))
        return 'stale';
      return {
        id: claim.id,
        domain: claim.domain,
        challengeDigest: claim.challengeDigest,
        challengeExpiresAt: claim.challengeExpiresAt,
      };
    });
  }

  /** Promotes a matching snapshot under an immediate write lock and current authority. */
  async verifyClaim(
    organizationId: string,
    actorId: string,
    claim: PendingDomainClaim,
    observedDigest: string,
    stamp: WriteStamp,
    now: () => number,
  ): Promise<'verified' | 'forbidden' | 'not_found' | 'stale' | 'taken' | 'inactive'> {
    return this.gate.enter(async () => {
      await Promise.resolve();
      try {
        return this.db.transaction(
          (tx) => {
            // Proof: 2026-09-28, bypassing the commit marker read made store
            // `keeps both verification phases inert before activation` promote a pending claim.
            if (readOrganizationActivation(tx) !== 'activated') return 'inactive' as const;
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
            // Proof: 2026-09-28, bypassing this recheck let the mounted late-demotion test promote a claim.
            if (member?.role !== 'super_admin') return 'forbidden' as const;
            const current = tx
              .select()
              .from(organizationDomainClaim)
              .where(
                and(
                  eq(organizationDomainClaim.id, claim.id),
                  eq(organizationDomainClaim.organizationId, organizationId),
                ),
              )
              .get();
            if (current === undefined) return 'not_found' as const;
            // Proof: 2026-09-28, before this comparison mounted `refuses a claim
            // whose domain changes during DNS lookup` promoted the renamed row (200 instead of 409).
            // Proof: 2026-09-28, omitting the digest snapshot comparison let the mounted reissue-during-lookup test promote the old challenge.
            if (
              current.status !== 'pending' ||
              current.domain !== claim.domain ||
              current.challengeDigest !== claim.challengeDigest ||
              current.challengeExpiresAt !== claim.challengeExpiresAt ||
              // Proof: 2026-09-28, replacing this transaction-time read with
              // stamp.at made `refuses a challenge that expires while verification
              // waits for the write gate` promote the expired claim.
              current.challengeExpiresAt <= now() ||
              observedDigest !== claim.challengeDigest
            )
              return 'stale' as const;
            // Proof: 2026-09-28, bypassing this policy recheck made mounted
            // `rechecks challenge expiry and maintained policy after DNS lookup` promote a newly denied domain (200 instead of 409).
            if (!isClaimableDomain(current.domain, loadPublicEmailPolicy(this.policyDirectory)))
              return 'stale' as const;
            // Proof: 2026-09-28, dropping organization_domain_claim_owner made
            // mounted `settles concurrent DNS lookups with one owner and an
            // untouched losing proof` verify both claims (200, 200).
            tx.update(organizationDomainClaim)
              .set({
                status: 'verified',
                proofDigest: current.challengeDigest,
                challengeDigest: null,
                challengeExpiresAt: null,
                lastSuccessAt: stamp.at,
                lastCheckedAt: stamp.at,
                ...auditOnUpdate(stamp),
              })
              .where(eq(organizationDomainClaim.id, claim.id))
              .run();
            return 'verified' as const;
          },
          { behavior: 'immediate' },
        );
      } catch (error) {
        if (isUniqueViolation(error, UNIQUE_INDEXES.verifiedDomainOwner)) return 'taken';
        throw error;
      }
    });
  }

  /** Lists exact claims for the organization established by current access. */
  async listClaims(
    organizationId: string,
    actorId: string,
  ): Promise<readonly DomainClaimSummary[] | 'forbidden'> {
    await Promise.resolve();
    return this.db.transaction((tx) => {
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
      // Proof: 2026-09-28, bypassing this role check made mounted `rechecks
      // super-admin authority after request access resolves` disclose the list
      // after demotion (200 instead of 403).
      if (member?.role !== 'super_admin') return 'forbidden';
      return (
        tx
          .select({
            id: organizationDomainClaim.id,
            domain: organizationDomainClaim.domain,
            status: organizationDomainClaim.status,
            challengeExpiresAt: organizationDomainClaim.challengeExpiresAt,
          })
          .from(organizationDomainClaim)
          // Proof: 2026-09-28, dropping this predicate made mounted `lists only
          // the active organization and never a foreign challenge` include B.
          .where(eq(organizationDomainClaim.organizationId, organizationId))
          .orderBy(organizationDomainClaim.domain)
          .all()
      );
    });
  }

  /**
   * Issues or replaces one pending challenge under the current super-admin
   * membership and activation marker. The read and write share an immediate
   * transaction, so a concurrent demotion or reissue cannot authorize an old
   * request. A verified claim is not replaced by this initial-claim route.
   *
   * Proof: 2026-09-28, keeping the old digest on reissue made `reissues a
   * pending claim in place and invalidates its old digest` promote the old
   * token; bypassing the role recheck made the mounted demoted-admin test issue.
   */
  async reissueClaim(
    organizationId: string,
    actorId: string,
    domain: string,
    challengeDigest: string,
    challengeExpiresAt: number,
    stamp: WriteStamp,
  ): Promise<
    | { kind: 'issued'; id: string }
    | { kind: 'forbidden' | 'unclaimable' | 'already_claimed' | 'inactive' }
  > {
    // Proof: 2026-09-28, bypassing gate.enter made `waits for a batch rollback
    // before issuing a durable challenge` answer issued inside the held batch;
    // after rollback the digest was still digest-c-a, not digest-after.
    return await this.gate.enter(async () => {
      await Promise.resolve();
      return this.db.transaction(
        (tx) => {
          // Proof: 2026-09-28, bypassing this marker check made `does not issue a
          // challenge before activation` insert a pending claim.
          if (readOrganizationActivation(tx) !== 'activated') return { kind: 'inactive' } as const;
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
          // Proof: 2026-09-28, bypassing this role recheck made `rechecks
          // super-admin authority after request access resolves` issue a claim.
          if (member?.role !== 'super_admin') return { kind: 'forbidden' } as const;
          const policy = loadPublicEmailPolicy(this.policyDirectory);
          if (!isClaimableDomain(domain, policy)) return { kind: 'unclaimable' } as const;
          const existing = tx
            .select({ id: organizationDomainClaim.id, status: organizationDomainClaim.status })
            .from(organizationDomainClaim)
            .where(
              and(
                // Proof: 2026-09-28, removing this organization predicate
                // made mounted `lists only the active organization and never
                // a foreign challenge` overwrite B's pending digest.
                eq(organizationDomainClaim.organizationId, organizationId),
                eq(organizationDomainClaim.domain, domain),
              ),
            )
            .get();
          if (existing !== undefined) {
            if (existing.status !== 'pending') return { kind: 'already_claimed' } as const;
            // Proof: 2026-09-28, leaving the old digest here made `reissues a
            // pending claim in place and invalidates its old digest` promote it.
            tx.update(organizationDomainClaim)
              .set({ challengeDigest, challengeExpiresAt, ...auditOnUpdate(stamp) })
              .where(eq(organizationDomainClaim.id, existing.id))
              .run();
            return { kind: 'issued', id: existing.id } as const;
          }
          const id = crypto.randomUUID();
          tx.insert(organizationDomainClaim)
            .values({
              id,
              organizationId,
              domain,
              status: 'pending',
              challengeDigest,
              challengeExpiresAt,
              ...auditOnCreate(stamp),
            })
            .run();
          return { kind: 'issued', id } as const;
        },
        { behavior: 'immediate' },
      );
    });
  }

  /**
   * Records a pending claim, or answers `unclaimable` for a public mailbox
   * provider, public suffix or top-level domain (see `isClaimableDomain`),
   * writing nothing. A pending claim reserves nothing.
   *
   * @throws when the domain is not canonical.
   */
  async openClaim(claim: OpenedDomainClaim, stamp: WriteStamp): Promise<'opened' | 'unclaimable'> {
    // Proof: skipping this made `never opens or promotes a claim on a public
    // domain` in `organization-records.db.test.ts` open the claim; watched
    // 2026-09-28.
    if (!isClaimableDomain(claim.domain, loadPublicEmailPolicy(this.policyDirectory)))
      return 'unclaimable';
    await this.gate.enter(async () => {
      await Promise.resolve();
      this.db
        .insert(organizationDomainClaim)
        .values({ ...claim, status: 'pending', ...auditOnCreate(stamp) })
        .run();
    });
    return 'opened';
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
   *
   * Answers `unclaimable`, writing nothing, when the claim's domain is one
   * {@link isClaimableDomain} refuses: a claim opened before the policy
   * listed it, or written around {@link openClaim}.
   *
   * @throws when the stored domain is not canonical.
   */
  async promoteClaim(
    claimId: string,
    observedDigest: string,
    stamp: WriteStamp,
  ): Promise<'verified' | 'taken' | 'stale' | 'unclaimable'> {
    return await this.gate.enter(async () => {
      await Promise.resolve();
      const pending = this.db
        .select({ domain: organizationDomainClaim.domain })
        .from(organizationDomainClaim)
        .where(eq(organizationDomainClaim.id, claimId))
        .get();
      // A claim opened before the policy listed its domain, or written around
      // `openClaim`, is still never promoted.
      // Proof: skipping this made `never opens or promotes a claim on a public
      // domain` promote the planted claim; watched 2026-09-28.
      if (
        pending !== undefined &&
        !isClaimableDomain(pending.domain, loadPublicEmailPolicy(this.policyDirectory))
      )
        return 'unclaimable';
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
