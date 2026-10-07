import type { Onboarding, OnboardingAnswer, OnboardingState, WriteStamp } from '@wbs/core';
import { isClaimableDomain } from '@wbs/domain';
import { and, eq } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { auditOnCreate } from './audit';
import type { Gate } from './gate';
import { readOrganizationActivation } from './organization-activation';
import { loadPublicEmailPolicy } from './public-email-policy';
import {
  organization,
  organizationDomainClaim,
  organizationJoinRequest,
  organizationMembership,
  users,
} from './schema';

type Transaction = Parameters<Parameters<SQLiteBunDatabase['transaction']>[0]>[0];
interface Ready {
  email: string;
  domain: string;
}

/** Onboarding decisions read current evidence from SQLite, never from the session payload. */
export class OnboardingRepository implements Onboarding {
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly gate: Gate,
  ) {}

  /** Existing memberships take precedence over verification after activation. */
  discover(userId: string): Promise<OnboardingAnswer<OnboardingState>> {
    return Promise.resolve(
      this.db.transaction((tx) => {
        // Proof: 2026-09-28, bypassing this check made `is inert before
        // activation and throws on a broken marker` answer 200 discovery.
        if (readOrganizationActivation(tx) !== 'activated')
          return { ok: false, refusal: 'onboarding_inactive' };
        // Proof: 2026-09-28, moving this behind email verification made
        // `offers an existing member selection without a verified email` fail.
        const memberships = membershipsOf(tx, userId);
        if (memberships.length > 0)
          return { ok: true, value: { state: 'selection_required', memberships } };
        const ready = readVerifiedEmail(tx, userId);
        if (!ready.ok) return ready;
        const owner = claimedOwner(tx, ready.value.domain);
        if (owner === null) return { ok: true, value: { state: 'create_organization' } };
        const pending =
          tx
            .select({ id: organizationJoinRequest.id })
            .from(organizationJoinRequest)
            .where(
              and(
                eq(organizationJoinRequest.organizationId, owner.id),
                eq(organizationJoinRequest.userId, userId),
                eq(organizationJoinRequest.status, 'pending'),
              ),
            )
            .get() !== undefined;
        return { ok: true, value: { state: 'join_organization', organization: owner, pending } };
      }),
    );
  }

  async createOrganization(
    userId: string,
    name: string,
    stamp: WriteStamp,
  ): Promise<
    OnboardingAnswer<{
      organization: { id: string; name: string };
      membership: { organizationId: string; userId: string; role: 'super_admin' };
    }>
  > {
    return this.gate.enter(async () =>
      Promise.resolve(
        this.db.transaction(
          (tx) => {
            const ready = readReady(tx, userId);
            if (!ready.ok) return ready;
            // Proof: 2026-09-28, moving this read before BEGIN IMMEDIATE made
            // both `rechecks membership after a separate process commits`
            // contention cases create another organization (201, not 409).
            if (membershipsOf(tx, userId).length > 0)
              return { ok: false, refusal: 'already_member' };
            // Proof: 2026-09-28, bypassing this recheck made the matching-domain
            // creation test write an organization after a verified claim was planted.
            if (claimedOwner(tx, ready.value.domain) !== null)
              return { ok: false, refusal: 'domain_matched' };
            const id = crypto.randomUUID();
            tx.insert(organization)
              .values({ id, name, legacy: false, ...auditOnCreate(stamp) })
              .run();
            // Proof: 2026-09-28, an abort trigger on membership insert made the
            // mounted rollback test observe zero organizations after this throws.
            tx.insert(organizationMembership)
              .values({ organizationId: id, userId, role: 'super_admin', ...auditOnCreate(stamp) })
              .run();
            return {
              ok: true,
              value: {
                organization: { id, name },
                membership: { organizationId: id, userId, role: 'super_admin' },
              },
            };
          },
          { behavior: 'immediate' },
        ),
      ),
    );
  }

  async submitJoinRequest(
    userId: string,
    organizationId: string,
    stamp: WriteStamp,
  ): Promise<
    OnboardingAnswer<{ request: { id: string; organizationId: string; status: 'pending' } }>
  > {
    return this.gate.enter(async () =>
      Promise.resolve(
        this.db.transaction(
          (tx) => {
            const ready = readReady(tx, userId);
            if (!ready.ok) return ready;
            if (membershipsOf(tx, userId).length > 0)
              return { ok: false, refusal: 'already_member' };
            const owner = claimedOwner(tx, ready.value.domain);
            // One absent answer for an unknown id, another domain, or a suspended claim.
            // Proof: 2026-09-28, bypassing this target check failed `uses one
            // not-found answer for absent, mismatched, and suspended targets`.
            if (owner?.id !== organizationId) return { ok: false, refusal: 'not_found' };
            const pending = tx
              .select({ id: organizationJoinRequest.id })
              .from(organizationJoinRequest)
              .where(
                and(
                  eq(organizationJoinRequest.organizationId, organizationId),
                  eq(organizationJoinRequest.userId, userId),
                  eq(organizationJoinRequest.status, 'pending'),
                ),
              )
              .get();
            // Proof: 2026-09-28, bypassing this check failed `submits a pending
            // request with no membership and refuses a duplicate` (500 vs 409).
            if (pending !== undefined) return { ok: false, refusal: 'join_request_pending' };
            const id = crypto.randomUUID();
            tx.insert(organizationJoinRequest)
              .values({
                id,
                organizationId,
                userId,
                email: ready.value.email,
                status: 'pending',
                ...auditOnCreate(stamp),
              })
              .run();
            return { ok: true, value: { request: { id, organizationId, status: 'pending' } } };
          },
          { behavior: 'immediate' },
        ),
      ),
    );
  }
}

/** Activation and verified address are trusted state, checked together per write. */
function readReady(tx: Transaction, userId: string): OnboardingAnswer<Ready> {
  // Proof: 2026-09-28, ignoring this read made `is inert before activation
  // and throws on a broken marker` answer `email_verification_required`
  // instead of `onboarding_inactive` for a creation before activation.
  if (readOrganizationActivation(tx) !== 'activated')
    return { ok: false, refusal: 'onboarding_inactive' };
  return readVerifiedEmail(tx, userId);
}

/** A verified address is required only when onboarding would create new state. */
function readVerifiedEmail(tx: Transaction, userId: string): OnboardingAnswer<Ready> {
  const account = tx
    .select({ email: users.email, verified: users.emailVerified })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (account === undefined) throw new Error(`signed-in user ${userId} is absent`);
  // Proof: 2026-09-28, ignoring verified=0 failed `requires durable verified
  // email for creation` and slice-29's password challenge test with a stored
  // unverified address (2026-09-28).
  if (!account.verified || account.email === null)
    return { ok: false, refusal: 'email_verification_required' };
  const parts = account.email.split('@');
  if (parts.length !== 2 || parts[0]?.length === 0 || parts[1]?.length === 0)
    throw new Error(`verified user ${userId} has malformed email`);
  return { ok: true, value: { email: account.email, domain: parts[1] } };
}

/** Current membership candidates, with the organization's display name. */
function membershipsOf(tx: Transaction, userId: string) {
  return tx
    .select({
      organizationId: organizationMembership.organizationId,
      name: organization.name,
      role: organizationMembership.role,
    })
    .from(organizationMembership)
    .innerJoin(organization, eq(organization.id, organizationMembership.organizationId))
    .where(eq(organizationMembership.userId, userId))
    .all();
}

/** Only an exact, currently verified, claimable domain routes onboarding. */
function claimedOwner(tx: Transaction, domain: string): { id: string; name: string } | null {
  // Proof: 2026-09-28, bypassing the policy failed `lets a public-email user
  // create without matching a claim` with a planted gmail.com claim.
  if (!isClaimableDomain(domain, loadPublicEmailPolicy())) return null;
  return (
    tx
      .select({ id: organization.id, name: organization.name })
      .from(organizationDomainClaim)
      .innerJoin(organization, eq(organization.id, organizationDomainClaim.organizationId))
      // Proof: 2026-09-28, querying suspended claims instead failed `routes
      // exact verified domain but not subdomain or suspended claim`.
      .where(
        and(
          eq(organizationDomainClaim.domain, domain),
          eq(organizationDomainClaim.status, 'verified'),
        ),
      )
      .get() ?? null
  );
}
