import { createHash } from 'node:crypto';

import type {
  DomainChallenges,
  DomainClaimSummary,
  DomainProofChecks,
  DomainResolver,
  DomainVerificationSnapshot,
  RetainedDomainProof,
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
 * DNS verification and retained proof checks are available through injected
 * ports. be-01 injects its two-resolver DNS-over-HTTPS adapter only when
 * `WBS_DOMAIN_DNS=doh` and starts the periodic worker only when
 * `WBS_DOMAIN_PROOF_WORKER=on`; otherwise lookups refuse and the worker stays stopped.
 */
export class DomainClaimRepository implements DomainChallenges, DomainProofChecks {
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly gate: Gate,
    private readonly policyDirectory?: string,
    readonly resolver: DomainResolver = {
      lookupTxt: () => Promise.reject(new Error('authoritative DNS resolver unavailable')),
    },
  ) {}

  /** Selects day-seven verified claims; an inactive marker yields no work. */
  async readDueProofs(at: number): Promise<readonly RetainedDomainProof[]> {
    await Promise.resolve();
    return this.db.transaction((tx) => {
      // Proof: 2026-09-28, bypassing this marker made mounted `leaves planted
      // retained proof untouched before activation` report a stale check.
      if (readOrganizationActivation(tx) !== 'activated') return [];
      const due = tx
        .select()
        .from(organizationDomainClaim)
        .where(eq(organizationDomainClaim.status, 'verified'))
        .all();
      return due.flatMap((claim) => {
        // Proof: 2026-09-28, filtering by last_checked_at in SQL hid a NULL
        // verified timestamp; mounted `rejects a verified claim with a missing
        // retained check timestamp` resolved instead of throwing.
        if (
          claim.proofDigest === null ||
          claim.lastCheckedAt === null ||
          claim.lastSuccessAt === null
        )
          throw new Error(`verified domain ${claim.id} lacks retained proof state`);
        if (!isClaimableDomain(claim.domain, loadPublicEmailPolicy(this.policyDirectory)))
          throw new Error(`verified domain ${claim.id} is no longer claimable`);
        // Proof: 2026-09-28, filtering by challenge expiry instead made mounted
        // `shows retained proof check timestamps and a warning after a failed
        // day-seven check` skip a due verified claim. Bypassing this due filter
        // made that test check the claim on day six (checked: 1 instead of 0).
        if (claim.lastCheckedAt > at - 7 * 24 * 60 * 60 * 1000) return [];
        return [
          {
            id: claim.id,
            organizationId: claim.organizationId,
            domain: claim.domain,
            proofDigest: claim.proofDigest,
            previousProofDigest: claim.previousProofDigest,
            previousProofValidUntil: claim.previousProofValidUntil,
            lastCheckedAt: claim.lastCheckedAt,
          },
        ];
      });
    });
  }

  /** Records a check under the surviving snapshot, rechecking old-proof expiry at commit. */
  async finishProofCheck(
    proof: RetainedDomainProof,
    matched: 'current' | 'previous' | null,
    at: number,
    now: () => number,
  ): Promise<'checked' | 'stale'> {
    return this.gate.enter(async () => {
      await Promise.resolve();
      return this.db.transaction(
        (tx) => {
          // Proof: 2026-09-28, bypassing this read made mounted `leaves a
          // retained check stale when activation changes during lookup`
          // record checked after an injected marker rollback.
          if (readOrganizationActivation(tx) !== 'activated') return 'stale' as const;
          const current = tx
            .select()
            .from(organizationDomainClaim)
            .where(eq(organizationDomainClaim.id, proof.id))
            .get();
          // Proof: 2026-09-28, bypassing the release check made mounted `does
          // not record a retained check after its claim is released during DNS
          // lookup` report checked. Bypassing organization, domain, digest and
          // timestamp comparisons separately made each corresponding mounted
          // `leaves a retained check stale when its ... changes during lookup`
          // report checked instead of stale.
          if (
            current?.status !== 'verified' ||
            current.organizationId !== proof.organizationId ||
            current.domain !== proof.domain ||
            current.proofDigest !== proof.proofDigest ||
            current.previousProofDigest !== proof.previousProofDigest ||
            current.previousProofValidUntil !== proof.previousProofValidUntil ||
            current.lastCheckedAt !== proof.lastCheckedAt
          )
            return 'stale' as const;
          // Proof: 2026-09-28, bypassing this commit-time policy recheck made
          // mounted `refuses a retained check when maintained policy changes
          // during DNS lookup` resolve rather than throw.
          if (!isClaimableDomain(current.domain, loadPublicEmailPolicy(this.policyDirectory)))
            throw new Error(`verified domain ${current.id} is no longer claimable`);
          if (current.lastSuccessAt === null)
            throw new Error(`owned domain ${current.id} lacks last successful proof`);
          const overlapDeadline = current.previousProofValidUntil;
          // Proof: 2026-09-28, bypassing this commit-time deadline made mounted
          // `does not accept an old proof when its overlap expires during DNS lookup`
          // advance lastSuccessAt to the run time after the injected clock crossed expiry.
          const accepted =
            matched === 'previous' && overlapDeadline !== null && now() >= overlapDeadline
              ? null
              : matched;
          tx.update(organizationDomainClaim)
            .set({
              lastCheckedAt: at,
              ...(accepted
                ? { lastSuccessAt: at }
                : // Proof: 2026-09-28, setting pending here made mounted
                  // `retains a suspended owner until release and refuses a stale recovery after release`
                  // let the contender verify instead of returning domain_taken.
                  // Proof: 2026-09-28, leaving status verified made mounted `suspends
                  // without releasing domain ownership or memberships` fail on day 14.
                  at - current.lastSuccessAt >= 14 * 86_400_000
                  ? { status: 'suspended' as const }
                  : {}),
              // Proof: 2026-09-28, bypassing this clear made mounted `ends
              // old-proof overlap when the replacement succeeds` retain the old digest.
              ...(accepted === 'current' && current.previousProofDigest !== null
                ? { previousProofDigest: null, previousProofValidUntil: null }
                : {}),
              ...auditOnUpdate({ at }),
            })
            .where(eq(organizationDomainClaim.id, proof.id))
            .run();
          return 'checked' as const;
        },
        { behavior: 'immediate' },
      );
    });
  }

  /** Replaces an owned proof with a 24-hour overlap under current authority.
   * @throws when verified ownership lacks its retained digest.
   */
  async rotateClaim(
    organizationId: string,
    actorId: string,
    claimId: string,
    token: string,
    stamp: WriteStamp,
  ): Promise<
    | { kind: 'issued'; domain: string; dnsValue: string }
    | { kind: 'forbidden' | 'not_found' | 'stale' | 'inactive' }
  > {
    return this.gate.enter(async () => {
      await Promise.resolve();
      return this.db.transaction(
        (tx) => {
          // Proof: 2026-09-28, bypassing this marker made `refuses rotation before
          // activation and after super-admin demotion` issue a store proof before activation.
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
          // Proof: 2026-09-28, bypassing this check made mounted rotation after
          // demotion issue a new proof rather than 403.
          if (member?.role !== 'super_admin') return { kind: 'forbidden' } as const;
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
          if (claim === undefined) return { kind: 'not_found' } as const;
          if (claim.status !== 'verified' && claim.status !== 'suspended')
            return { kind: 'stale' } as const;
          // Proof: 2026-09-28, treating this trusted corruption as stale made
          // mounted `throws for a verified claim with a missing retained proof
          // digest on rotation` return 409 after the stored digest was forced NULL.
          if (claim.proofDigest === null)
            throw new Error(`verified domain ${claim.id} lacks retained proof digest`);
          if (!isClaimableDomain(claim.domain, loadPublicEmailPolicy(this.policyDirectory)))
            return { kind: 'stale' } as const;
          const dnsValue = `wbs-domain-verification=${organizationId}:${claim.domain}:${token}`;
          const challengeDigest = createHash('sha256').update(dnsValue).digest('hex');
          tx.update(organizationDomainClaim)
            .set({
              proofDigest: challengeDigest,
              previousProofDigest: claim.proofDigest,
              previousProofValidUntil: stamp.at + 86_400_000,
              challengeDigest: null,
              challengeExpiresAt: null,
              ...auditOnUpdate(stamp),
            })
            .where(eq(organizationDomainClaim.id, claimId))
            .run();
          return { kind: 'issued', domain: claim.domain, dnsValue } as const;
        },
        { behavior: 'immediate' },
      );
    });
  }

  /** Claim-side status lookup; task 4.5 must recheck in its invitation transaction. */
  async isVerifiedDomain(organizationId: string, domain: string): Promise<boolean> {
    await Promise.resolve();
    return this.db.transaction((tx) => {
      if (readOrganizationActivation(tx) !== 'activated') return false;
      return (
        tx
          .select({ id: organizationDomainClaim.id })
          .from(organizationDomainClaim)
          // Proof: 2026-09-28, admitting suspended rows made mounted
          // `suspends without releasing domain ownership or memberships` return true.
          .where(
            and(
              eq(organizationDomainClaim.organizationId, organizationId),
              eq(organizationDomainClaim.domain, domain),
              eq(organizationDomainClaim.status, 'verified'),
            ),
          )
          .get() !== undefined
      );
    });
  }

  /** Reads the current organization's verifiable claim after role and marker checks. */
  async readClaimForVerification(
    organizationId: string,
    actorId: string,
    claimId: string,
  ): Promise<DomainVerificationSnapshot | 'forbidden' | 'not_found' | 'stale' | 'inactive'> {
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
      if (!isClaimableDomain(claim.domain, loadPublicEmailPolicy(this.policyDirectory)))
        return 'stale';
      if (isRotation || isRecovery) {
        // Proof: 2026-09-28, planting NULL last_checked_at on a suspended owner
        // made mounted `throws when a suspended claim lacks retained timestamps at capture`
        // return 200 without this validation.
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

  /** Promotes a matching snapshot under an immediate write lock and current authority. */
  async verifyClaim(
    organizationId: string,
    actorId: string,
    claim: DomainVerificationSnapshot,
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
            // Proof: 2026-09-28, replacing this missing-row answer with stale made mounted
            // `retains a suspended owner until release and refuses a stale recovery after release`
            // return 409 rather than 404 after release during DNS lookup.
            if (current === undefined) return 'not_found' as const;
            // Proof: 2026-09-28, removing this check made mounted `surfaces pending
            // proof fields corrupted during DNS lookup as a server error` answer
            // 409 stale for a pending row whose digest and expiry became NULL.
            if (
              current.status === 'pending' &&
              (current.challengeDigest === null || current.challengeExpiresAt === null)
            )
              throw new Error(`pending domain claim ${current.id} lacks challenge proof`);
            if (claim.phase === 'rotation' || claim.phase === 'recovery') {
              // Proof: 2026-09-28, clearing a suspended owner's retained digest
              // during DNS lookup made mounted `throws when a suspended claim loses
              // its retained digest during DNS lookup` answer stale 409 without this guard.
              if (
                (current.status === 'verified' || current.status === 'suspended') &&
                (current.proofDigest === null ||
                  current.lastSuccessAt === null ||
                  current.lastCheckedAt === null ||
                  (claim.phase === 'rotation' &&
                    (current.previousProofDigest === null ||
                      current.previousProofValidUntil === null)))
              )
                throw new Error(`owned domain ${current.id} lacks retained proof state`);
              // Proof: 2026-09-28, omitting this branch made mounted `confirms a
              // rotated proof through verify before the overlap ends` answer stale.
              // Proof: 2026-09-28, bypassing the overlap-deadline snapshot
              // comparison made mounted `rechecks rotation snapshot after DNS
              // lookup` return 200 after the stored deadline changed during DNS.
              if (
                current.status !== (claim.phase === 'rotation' ? 'verified' : 'suspended') ||
                current.domain !== claim.domain ||
                current.proofDigest !== claim.challengeDigest ||
                current.previousProofDigest !== claim.previousProofDigest ||
                current.previousProofValidUntil !== claim.previousProofValidUntil ||
                observedDigest !== claim.challengeDigest
              )
                return 'stale' as const;
              if (!isClaimableDomain(current.domain, loadPublicEmailPolicy(this.policyDirectory)))
                return 'stale' as const;
              tx.update(organizationDomainClaim)
                .set({
                  // Proof: 2026-09-28, retaining `suspended` made mounted
                  // `restores a suspended claim through retained TXT proof without changing owner` observe false onboarding status.
                  status: 'verified',
                  previousProofDigest: null,
                  previousProofValidUntil: null,
                  lastSuccessAt: stamp.at,
                  lastCheckedAt: stamp.at,
                  ...auditOnUpdate(stamp),
                })
                .where(eq(organizationDomainClaim.id, claim.id))
                .run();
              return 'verified' as const;
            }
            // Proof: 2026-09-28, before this comparison mounted `refuses a claim
            // whose domain changes during DNS lookup` promoted the renamed row (200 instead of 409).
            // Proof: 2026-09-28, omitting the digest snapshot comparison let the mounted reissue-during-lookup test promote the old challenge.
            if (
              current.status !== 'pending' ||
              current.domain !== claim.domain ||
              current.challengeDigest !== claim.challengeDigest ||
              current.challengeExpiresAt !== claim.challengeExpiresAt ||
              // Proof: 2026-09-28, bypassing this expiry recheck made mounted
              // `rechecks challenge expiry and maintained policy after DNS lookup` promote after a 1.2-second lookup crossed expiry (200 instead of 409).
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

  /** Deletes one current organization's claim and invalidates older pending proofs for transfer. */
  async releaseClaim(
    organizationId: string,
    actorId: string,
    claimId: string,
  ): Promise<'released' | 'forbidden' | 'not_found' | 'stale' | 'inactive'> {
    return this.gate.enter(async () => {
      await Promise.resolve();
      // Proof: 2026-09-28, removing this transaction and injecting an
      // owner-delete abort made mounted `rolls back pending proof deletion
      // when owner deletion fails` lose the pending claim.
      return this.db.transaction(
        (tx) => {
          // Proof: 2026-09-28, bypassing this marker made mounted
          // `refuses release before activation, after demotion, and for a foreign claim`
          // return not_found instead of inactive through the production store.
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
          // Proof: 2026-09-28, allowing a current non-super-admin made mounted
          // `refuses release before activation, after demotion, and for a foreign claim`
          // release the owned row after demotion instead of returning 403.
          if (member?.role !== 'super_admin') return 'forbidden' as const;
          const claim = tx
            .select()
            .from(organizationDomainClaim)
            .where(
              and(
                eq(organizationDomainClaim.id, claimId),
                // Proof: 2026-09-28, omitting this organization predicate made mounted
                // `refuses release before activation, after demotion, and for a foreign claim`
                // delete the foreign claim instead of returning 404.
                eq(organizationDomainClaim.organizationId, organizationId),
              ),
            )
            .get();
          if (claim === undefined) return 'not_found' as const;
          // Proof: 2026-09-28, admitting pending claims made mounted
          // `releases ownership and requires a fresh claim before another organization can verify`
          // return 204 instead of stale 409 before initial proof.
          if (claim.status !== 'verified' && claim.status !== 'suspended') return 'stale' as const;
          // Proof: 2026-09-28, keeping pre-release pending rows made mounted
          // `releases ownership and requires a fresh claim before another organization can verify`
          // accept B's old proof instead of returning 404.
          // Proof: 2026-09-28, removing the domain predicate made mounted
          // `keeps unrelated pending claims when an owner releases its domain`
          // delete org-b's example.net claim.
          tx.delete(organizationDomainClaim)
            .where(
              and(
                eq(organizationDomainClaim.domain, claim.domain),
                eq(organizationDomainClaim.status, 'pending'),
              ),
            )
            .run();
          tx.delete(organizationDomainClaim).where(eq(organizationDomainClaim.id, claimId)).run();
          return 'released' as const;
        },
        { behavior: 'immediate' },
      );
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
            lastSuccessAt: organizationDomainClaim.lastSuccessAt,
            lastCheckedAt: organizationDomainClaim.lastCheckedAt,
          })
          .from(organizationDomainClaim)
          // Proof: 2026-09-28, dropping this predicate made mounted `lists only
          // the active organization and never a foreign challenge` include B.
          .where(eq(organizationDomainClaim.organizationId, organizationId))
          .orderBy(organizationDomainClaim.domain)
          .all()
          .map((claim) => ({
            ...claim,
            // Proof: 2026-09-28, forcing false made mounted `shows retained
            // proof check timestamps and a warning after a failed day-seven
            // check` hide the warning after DNS timeout.
            proofWarning:
              claim.lastCheckedAt !== null &&
              claim.lastSuccessAt !== null &&
              claim.lastCheckedAt > claim.lastSuccessAt,
          }))
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
