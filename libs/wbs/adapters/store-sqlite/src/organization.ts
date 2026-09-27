import type { MembershipAdministered, MembershipAdministration, WriteStamp } from '@wbs/core';
import { mayAdministerMembership, ORGANIZATION_ROLES, type OrganizationRole } from '@wbs/domain';
import { and, count, eq, ne } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { auditOnCreate, auditOnUpdate } from './audit';
import type { Gate } from './gate';
import { organization, organizationMembership } from './schema';

/** One of a user's current memberships. */
export interface Membership {
  readonly organizationId: string;
  readonly role: OrganizationRole;
}

/** Why a membership change was refused, or that it happened. */
export type MembershipChange = 'changed' | 'not-member' | 'last-super-admin';
export type MembershipRemoval = 'removed' | 'not-member' | 'last-super-admin';

type Transaction = Parameters<Parameters<SQLiteBunDatabase['transaction']>[0]>[0];

/**
 * Organizations and their current memberships. Inert until the onboarding and
 * role slices (tasks 3.7, 4.3) put a service boundary in front of it; this
 * class decides only what the database must decide atomically, not who may ask.
 *
 * Every write is an immediate transaction: SQLite's write lock is taken before
 * the reads a guard depends on, so blue and green cannot both pass the same
 * check.
 */
export class OrganizationRepository implements MembershipAdministration {
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly gate: Gate,
  ) {}

  /**
   * Creates an organization with `userId` as its first super-admin, refusing a
   * user who already belongs to one.
   *
   * The refusal is the onboarding rule (only a user with no membership reaches
   * creation) made atomic: two concurrent submissions by one user produce one
   * organization, not two. Creation claims no domain.
   *
   * Proof, each fault alone, observed 2026-09-27 in
   * `organization-records.db.test.ts`: the recheck removed failed `refuses a
   * second creation by one user across two connections`; the transaction
   * replaced by running its body on `this.db` failed `leaves no organization
   * behind when the first membership cannot be written` (`Received: 1`).
   */
  async createForUnaffiliatedUser(
    created: { readonly id: string; readonly name: string },
    userId: string,
    stamp: WriteStamp,
  ): Promise<'created' | 'already-member'> {
    return await this.gate.enter(async () => {
      await Promise.resolve();
      return this.db.transaction(
        (tx) => {
          const held = tx
            .select({ n: count() })
            .from(organizationMembership)
            .where(eq(organizationMembership.userId, userId))
            .get();
          if (held === undefined) throw new Error('membership count returned no row');
          if (held.n > 0) return 'already-member';
          tx.insert(organization)
            .values({ ...created, legacy: false, ...auditOnCreate(stamp) })
            .run();
          tx.insert(organizationMembership)
            .values({
              organizationId: created.id,
              userId,
              role: 'super_admin',
              ...auditOnCreate(stamp),
            })
            .run();
          return 'created';
        },
        { behavior: 'immediate' },
      );
    });
  }

  /**
   * Adds a membership. The only caller-facing path to membership will be
   * invitation acceptance (task 4.4); this exists for that transaction and for
   * the legacy backfill.
   */
  async addMember(
    organizationId: string,
    userId: string,
    role: OrganizationRole,
    stamp: WriteStamp,
  ): Promise<void> {
    await this.gate.enter(async () => {
      await Promise.resolve();
      this.db
        .insert(organizationMembership)
        .values({ organizationId, userId, role, ...auditOnCreate(stamp) })
        .run();
    });
  }

  /** Changes a member's role unless that would leave the organization without a super-admin. */
  async changeRole(
    organizationId: string,
    userId: string,
    role: OrganizationRole,
    stamp: WriteStamp,
  ): Promise<MembershipChange> {
    return await this.gate.enter(async () => {
      await Promise.resolve();
      return this.db.transaction(
        (tx) => {
          const refusal = guardFinalSuperAdmin(tx, organizationId, userId, role);
          if (refusal !== null) return refusal;
          tx.update(organizationMembership)
            .set({ role, ...auditOnUpdate(stamp) })
            .where(membershipOf(organizationId, userId))
            .run();
          return 'changed';
        },
        { behavior: 'immediate' },
      );
    });
  }

  /** Removes a membership unless it is the organization's final super-admin. */
  async removeMember(organizationId: string, userId: string): Promise<MembershipRemoval> {
    return await this.gate.enter(async () => {
      await Promise.resolve();
      return this.db.transaction(
        (tx) => {
          const refusal = guardFinalSuperAdmin(tx, organizationId, userId, null);
          if (refusal !== null) return refusal;
          tx.delete(organizationMembership).where(membershipOf(organizationId, userId)).run();
          return 'removed';
        },
        { behavior: 'immediate' },
      );
    });
  }

  /**
   * {@link MembershipAdministration.administer}: the actor's role, the
   * target's role and the final super-admin guard are read in the write's own
   * immediate transaction.
   *
   * Proof, each watched 2026-09-27 in
   * `membership-organization.controller.db.test.ts`: reading the actor's role
   * outside the policy (admitting any member) made `refuses a member and a
   * viewer every membership change` answer 200; skipping the final
   * super-admin guard made `refuses demoting or removing the last
   * super-admin` answer 200 and leave no super-admin; answering an absent
   * target as removed made `answers a foreign or absent member as not found,
   * changing nothing` answer 500 instead of 404.
   */
  async administer(
    organizationId: string,
    actorId: string,
    targetUserId: string,
    requested: OrganizationRole | null,
    stamp: WriteStamp,
  ): Promise<MembershipAdministered> {
    return await this.gate.enter(async () => {
      await Promise.resolve();
      return this.db.transaction(
        (tx): MembershipAdministered => {
          const actor = roleIn(tx, organizationId, actorId);
          // Removed since the request resolved its access: nothing to authorize.
          if (actor === null) return { ok: false, refusal: 'forbidden' };
          const current = roleIn(tx, organizationId, targetUserId);
          if (current === null) return { ok: false, refusal: 'not_found' };
          if (!mayAdministerMembership(actor, current, requested)) {
            return { ok: false, refusal: 'forbidden' };
          }
          const guarded = guardFinalSuperAdmin(tx, organizationId, targetUserId, requested);
          if (guarded === 'last-super-admin') return { ok: false, refusal: 'last_super_admin' };
          if (guarded === 'not-member') return { ok: false, refusal: 'not_found' };
          if (requested === null) {
            tx.delete(organizationMembership)
              .where(membershipOf(organizationId, targetUserId))
              .run();
            return { ok: true, membership: null };
          }
          tx.update(organizationMembership)
            .set({ role: requested, ...auditOnUpdate(stamp) })
            .where(membershipOf(organizationId, targetUserId))
            .run();
          return { ok: true, membership: { userId: targetUserId, role: requested } };
        },
        { behavior: 'immediate' },
      );
    });
  }

  /** A user's current memberships, ordered by organization id. */
  async listMemberships(userId: string): Promise<Membership[]> {
    await Promise.resolve();
    return this.db
      .select({
        organizationId: organizationMembership.organizationId,
        role: organizationMembership.role,
      })
      .from(organizationMembership)
      .where(eq(organizationMembership.userId, userId))
      .orderBy(organizationMembership.organizationId)
      .all();
  }
}

/**
 * A user's current role in an organization, or null for no membership.
 *
 * @throws when the stored role is not one of {@link ORGANIZATION_ROLES}: an
 * unknown role reaching the policy must never be read as a privileged one.
 */
function roleIn(tx: Transaction, organizationId: string, userId: string): OrganizationRole | null {
  const found = tx
    .select({ role: organizationMembership.role })
    .from(organizationMembership)
    .where(membershipOf(organizationId, userId))
    .get();
  if (found === undefined) return null;
  const known: readonly string[] = ORGANIZATION_ROLES;
  if (!known.includes(found.role)) {
    throw new Error(`membership in organization "${organizationId}" has a malformed role`);
  }
  // Narrowed by the membership test above, which is the boundary this is.
  return found.role;
}

function membershipOf(organizationId: string, userId: string) {
  return and(
    eq(organizationMembership.organizationId, organizationId),
    eq(organizationMembership.userId, userId),
  );
}

/**
 * Refuses an ordinary change that would leave no super-admin: `role` is the
 * member's new role, or null for removal. Runs inside the caller's immediate
 * transaction, so the count it reads is the count the write commits against.
 *
 * Ordinary administration only. External deprovisioning of a departing owner
 * needs a separate audited recovery path (design.md, "Ownership and roles")
 * and must not go through here.
 *
 * Proof: returning null instead of reading the remaining count failed
 * `refuses demoting or removing the final super-admin and keeps the role`
 * (`Received: "changed"`). Observed 2026-09-27.
 */
function guardFinalSuperAdmin(
  tx: Transaction,
  organizationId: string,
  userId: string,
  role: OrganizationRole | null,
): 'not-member' | 'last-super-admin' | null {
  const current = tx
    .select({ role: organizationMembership.role })
    .from(organizationMembership)
    .where(membershipOf(organizationId, userId))
    .get();
  if (current === undefined) return 'not-member';
  if (current.role !== 'super_admin' || role === 'super_admin') return null;
  const others = tx
    .select({ n: count() })
    .from(organizationMembership)
    .where(
      and(
        eq(organizationMembership.organizationId, organizationId),
        eq(organizationMembership.role, 'super_admin'),
        ne(organizationMembership.userId, userId),
      ),
    )
    .get();
  if (others === undefined) throw new Error('super-admin count returned no row');
  return others.n === 0 ? 'last-super-admin' : null;
}
