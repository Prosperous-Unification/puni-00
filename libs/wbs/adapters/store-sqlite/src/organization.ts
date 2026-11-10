import type {
  AuditedAct,
  MembershipAdministered,
  MembershipAdministration,
  MembershipRemovalSource,
  MembersListed,
  WriteStamp,
} from '@wbs/core';
import {
  mayAdministerMembership,
  mayInvite,
  ORGANIZATION_ROLES,
  type OrganizationRole,
} from '@wbs/domain';
import { and, count, eq, ne } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { auditOnCreate, auditOnUpdate } from './audit';
import type { Drizzle } from './db';
import type { Gate } from './gate';
import { readOrganizationActivation } from './organization-activation';
import { appendOrganizationAudit } from './organization-audit-log';
import {
  accessGrant,
  accessGroupMember,
  organization,
  organizationMembership,
  users,
} from './schema';

/** One of a user's current memberships. */
export interface Membership {
  readonly organizationId: string;
  readonly role: OrganizationRole;
}

/** Why a membership change was refused, or that it happened. */
export type MembershipChange = 'changed' | 'not-member' | 'last-super-admin';
export type MembershipRemoval = 'removed' | 'not-member' | 'last-super-admin';

/** Actual authority removed by one borrowed membership mutation. */
export interface MembershipRemovalEvidence {
  readonly membershipRemoved: boolean;
  readonly removedUserGrantCount: number;
  readonly removedGroupMembershipCount: number;
}

/**
 * Removes current membership authority on the caller's already-owned connection.
 * The current final-super-admin guard precedes every delete. This body owns no
 * transaction or audit: the owner appends either its aggregate account event or
 * its existing SCIM lifecycle event with the returned actual counts. Only select/delete
 * are borrowed, so both native transactions and plain connections already owned by an
 * async admission compose without acquiring transaction/rollback capabilities.
 */
export function removeMembershipIn(
  tx: Pick<Drizzle, 'select' | 'delete'>,
  organizationId: string,
  userId: string,
):
  | { readonly kind: 'removed' | 'not-member'; readonly evidence: MembershipRemovalEvidence }
  | { readonly kind: 'last-super-admin' } {
  // Proof: borrowed-member-no-owner: injecting a native transaction wrapper failed `borrows grant and membership writes from an already-owned plain connection without audit or nested owners`;
  // observed native owner count 1 instead of 0, then restored GREEN (task-4.1 guard-faults receipt, 2026-11-10).
  const guarded = guardFinalSuperAdmin(tx, organizationId, userId, null);
  // Proof: member-last-admin: removing this boundary failed `refuses to deprovision the last super-admin with 409 mutability, changing nothing`;
  // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
  if (guarded === 'last-super-admin') return { kind: guarded };
  // Proof: member-not-member: removing this boundary failed `lets one of two super-admins step down, and adds and removes ordinary members`;
  // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
  if (guarded === 'not-member')
    return {
      kind: guarded,
      evidence: {
        membershipRemoved: false,
        removedUserGrantCount: 0,
        removedGroupMembershipCount: 0,
      },
    };
  // Proof: member-grant-cleanup: removing this boundary failed `removes user grants and group memberships with one aggregate route audit, fencing other organizations`;
  // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
  const removedUserGrantCount = tx
    .delete(accessGrant)
    .where(
      and(
        // Proof: member-grant-fence-organization: removing this boundary failed `removes user grants and group memberships with one aggregate route audit, fencing other organizations`;
        // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
        eq(accessGrant.organizationId, organizationId),
        // Proof: member-grant-fence-subject-kind: removing this boundary failed `retains other users and polymorphic group grants during account membership cleanup`;
        // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
        eq(accessGrant.subjectKind, 'user'),
        // Proof: member-grant-fence-subject-id: removing this boundary failed `retains other users and polymorphic group grants during account membership cleanup`;
        // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
        eq(accessGrant.subjectId, userId),
      ),
    )
    .returning({ id: accessGrant.id })
    .all().length;
  // Proof: member-group-cleanup: removing this boundary failed `removes user grants and group memberships with one aggregate route audit, fencing other organizations`;
  // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
  const removedGroupMembershipCount = tx
    .delete(accessGroupMember)
    .where(
      and(
        // Proof: member-group-fence-organization: removing this boundary failed `removes user grants and group memberships with one aggregate route audit, fencing other organizations`;
        // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
        eq(accessGroupMember.organizationId, organizationId),
        // Proof: member-group-fence-user: removing this boundary failed `retains other users and polymorphic group grants during account membership cleanup`;
        // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
        eq(accessGroupMember.userId, userId),
      ),
    )
    .returning({ groupId: accessGroupMember.groupId })
    .all().length;
  // Proof: member-physical-cleanup: removing this boundary failed `ends browser, gateway and MCP access to A at once, leaving B unchanged`;
  // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
  tx.delete(organizationMembership).where(membershipOf(organizationId, userId)).run();
  return {
    kind: 'removed',
    evidence: { membershipRemoved: true, removedUserGrantCount, removedGroupMembershipCount },
  };
}

/** Appends the direct owner's single aggregate; SCIM supplies its own lifecycle event. */
function appendMembershipRemoval(
  tx: Pick<Drizzle, 'insert'>,
  organizationId: string,
  userId: string,
  act: AuditedAct,
  source: MembershipRemovalSource,
  evidence: MembershipRemovalEvidence,
): void {
  appendOrganizationAudit(tx, {
    id: act.auditId,
    organizationId,
    actorId: act.actor,
    action: 'organization_member_removed',
    subjectKind: 'organization_member',
    subjectId: userId,
    detail: {
      source,
      removedUserGrantCount: evidence.removedUserGrantCount,
      removedGroupMembershipCount: evidence.removedGroupMembershipCount,
    },
    at: act.stamp.at,
  });
}

/** Retains the explicit human owner; self-leave cannot name another target. */
function retainMembershipAct(
  actorId: string,
  targetUserId: string,
  act: AuditedAct,
  source: MembershipRemovalSource,
): AuditedAct {
  // Proof: member-identity-actor: removing this boundary failed `refuses inconsistent trusted membership removal provenance before owner entry at actor`;
  // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
  // Proof: member-identity-stamp: removing this boundary failed `refuses inconsistent trusted membership removal provenance before owner entry at stamp`;
  // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
  if (act.actor !== actorId || act.stamp.by !== actorId)
    throw new Error('membership audit identity differs from its actor');
  // Proof: member-source: removing this boundary failed `refuses inconsistent trusted membership removal provenance before owner entry at source`;
  // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
  const sources: readonly string[] = ['route', 'self_leave'];
  if (!sources.includes(source)) throw new Error('membership removal source is malformed');
  // Proof: member-self-leave: removing this boundary failed `refuses inconsistent trusted membership removal provenance before owner entry at self-leave`;
  // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
  if (source === 'self_leave' && actorId !== targetUserId)
    throw new Error('self-leave actor differs from its target');
  return structuredClone(act);
}

/**
 * Organizations and their current memberships. Administration retains the legacy
 * role matrix until permission task2.5. Direct removals clean up authority and
 * append one aggregate audit in the same owner; SCIM borrows the cleanup body.
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
   * invitation acceptance (task 4.4); this exists for that transaction. The
   * legacy activation (`activateLegacyOrganization`) does not use it: it grants
   * memberships inside its own outer `BEGIN IMMEDIATE`, and this method's gate
   * and standalone write could not join that transaction.
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

  /**
   * Removes a membership unless it is the organization's final super-admin, with
   * direct grants, group memberships and one aggregate audit committed atomically.
   * This raw internal owner requires explicit human provenance and source; it is
   * not the public authorization boundary. Inputs are detached before its gate.
   */
  async removeMember(
    organizationId: string,
    userId: string,
    act: AuditedAct,
    source: MembershipRemovalSource,
  ): Promise<MembershipRemoval> {
    // Proof: member-owner-snapshot-raw: removing this boundary failed `retains the actual membership audit owner before the queue at raw`;
    // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
    act = retainMembershipAct(act.actor, userId, act, source);
    return await this.gate.enter(async () => {
      await Promise.resolve();
      return this.db.transaction(
        (tx) => {
          const removed = removeMembershipIn(tx, organizationId, userId);
          if (removed.kind !== 'removed') return removed.kind;
          // Proof: aggregate-raw-append: removing this boundary failed `retains the actual membership audit owner before the queue at raw`;
          // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
          appendMembershipRemoval(tx, organizationId, userId, act, source, removed.evidence);
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
   *
   * Proof, each watched 2026-09-27 in `organization-records.db.test.ts`:
   * - Skipping the super-admin recheck made `lets exactly one of two
   *   super-admins leave when both try across two connections` remove both.
   * - Trusting the actor as a super-admin instead of reading the role in the
   *   transaction made `refuses an actor demoted on another connection after
   *   the request's access resolved` answer ok.
   * - Scoping the UPDATE, and separately the DELETE, by user alone made
   *   `changes and removes only the membership in the given organization`
   *   change or drop the org-b membership.
   */
  async administer(
    organizationId: string,
    actorId: string,
    targetUserId: string,
    requested: OrganizationRole | null,
    act: AuditedAct,
    source: MembershipRemovalSource,
  ): Promise<MembershipAdministered> {
    // Proof: member-owner-snapshot-administer: removing this boundary failed `retains the actual membership audit owner before the queue at administer`;
    // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
    act = retainMembershipAct(actorId, targetUserId, act, source);
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
            const removed = removeMembershipIn(tx, organizationId, targetUserId);
            // Proof: member-borrowed-state-invariant: removing this boundary failed `throws and rolls back when borrowed membership state disappears after the owning admission`;
            // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
            if (removed.kind !== 'removed')
              throw new Error('guarded membership removal changed inside its owner');
            // Proof: aggregate-route-append: removing this boundary failed `removes user grants and group memberships with one aggregate route audit, fencing other organizations`;
            // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
            appendMembershipRemoval(
              tx,
              organizationId,
              targetUserId,
              act,
              source,
              removed.evidence,
            );
            return { ok: true, membership: null };
          }
          tx.update(organizationMembership)
            .set({ role: requested, ...auditOnUpdate(act.stamp) })
            .where(membershipOf(organizationId, targetUserId))
            .run();
          return { ok: true, membership: { userId: targetUserId, role: requested } };
        },
        { behavior: 'immediate' },
      );
    });
  }

  /**
   * {@link MembershipAdministration.listMembers}: activation, the actor's
   * current role and the rows are read in one transaction, ordered by join
   * time then user id.
   *
   * Proof, each watched 2026-09-29: admitting any member made
   * `refuses a member and a viewer the member list`
   * (`member-list.controller.db.test.ts`) fail; dropping the organization
   * predicate made `lists only the active organization's members` there
   * return org-a's members to org-b's super-admin; skipping the activation
   * read made `OrganizationRepository.listMembers > refuses before activation`
   * (`organization-records.db.test.ts`) list instead of refusing.
   */
  async listMembers(organizationId: string, actorId: string): Promise<MembersListed> {
    await Promise.resolve();
    return this.db.transaction((tx): MembersListed => {
      if (readOrganizationActivation(tx) !== 'activated')
        return { ok: false, refusal: 'onboarding_inactive' };
      const actor = roleIn(tx, organizationId, actorId);
      if (actor === null || !mayInvite(actor, 'viewer')) return { ok: false, refusal: 'forbidden' };
      const rows = tx
        .select({
          userId: organizationMembership.userId,
          username: users.username,
          email: users.email,
          role: organizationMembership.role,
          createdAt: organizationMembership.createdAt,
        })
        .from(organizationMembership)
        .innerJoin(users, eq(users.id, organizationMembership.userId))
        .where(eq(organizationMembership.organizationId, organizationId))
        .orderBy(organizationMembership.createdAt, organizationMembership.userId)
        .all();
      const known: readonly string[] = ORGANIZATION_ROLES;
      for (const row of rows)
        if (!known.includes(row.role))
          throw new Error(`membership in organization "${organizationId}" has a malformed role`);
      return { ok: true, members: rows };
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
export function roleIn(
  tx: Pick<Drizzle, 'select'>,
  organizationId: string,
  userId: string,
): OrganizationRole | null {
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

export function membershipOf(organizationId: string, userId: string) {
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
 * Ordinary administration, and SCIM deprovisioning, which refuses the last
 * super-admin exactly as a super-admin removal does (`organization-scim`).
 * Removing a departing owner still needs the separate audited recovery path
 * (design.md, "Ownership and roles").
 *
 * Proof: returning null instead of reading the remaining count failed
 * `refuses demoting or removing the final super-admin and keeps the role`
 * (`Received: "changed"`). Observed 2026-09-27.
 */
export function guardFinalSuperAdmin(
  tx: Pick<Drizzle, 'select'>,
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
