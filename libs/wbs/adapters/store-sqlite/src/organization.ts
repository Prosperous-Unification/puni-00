import type {
  AuditedAct,
  MembershipAdministered,
  MembershipAdministration,
  MembershipRemovalSource,
  MembersListed,
  SecurityPrincipal,
} from '@wbs/core';
import { authorize, retainSecurityPrincipal } from '@wbs/core';
import { type OrganizationRole } from '@wbs/domain';
import { and, eq } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import {
  AccessDecisionRepository,
  holdsDirectOrganizationRoleIn,
  readMemberAccessIn,
} from './access-decisions';
import type { Drizzle } from './db';
import type { Gate } from './gate';
import { readOrganizationActivation } from './organization-activation';
import { appendOrganizationAudit } from './organization-audit-log';
import { validateMembershipLabel } from './organization-selection';
import { accessGrant, accessGroupMember, organizationMembership, users } from './schema';
import { runSecurityTransaction } from './security-transaction';
import { LastSuperAdmin, requireSuperAdminIn } from './super-admin';

/** One of a user's current memberships. */
export interface Membership {
  readonly organizationId: string;
  readonly role: OrganizationRole;
}
export type MembershipRemoval = 'removed' | 'not-member' | 'last-super-admin';

/** Actual authority removed by one borrowed membership mutation. */
export interface MembershipRemovalEvidence {
  readonly membershipRemoved: boolean;
  readonly removedUserGrantCount: number;
  readonly removedGroupMembershipCount: number;
}

/**
 * Removes current membership authority on the caller's already-owned connection.
 * The current direct-grant super-admin invariant follows the deletes and throws
 * a modeled rollback refusal. This body owns no
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
  const current = tx
    .select({ userId: organizationMembership.userId })
    .from(organizationMembership)
    .where(membershipOf(organizationId, userId))
    .get();
  if (current === undefined)
    return {
      kind: 'not-member',
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
  // Proof: member-postwrite-invariant: removed/broken boundary failed `rolls back removal of the final direct built-in holder despite custom equivalent authority`; named assertion RED and restored GREEN (task-2.5 guard-faults).
  requireSuperAdminIn(tx, organizationId);
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
 * Current grant-based membership admission and explicit compatibility display.
 * Direct removals clean up authority and
 * append one aggregate audit in the same owner; SCIM borrows the cleanup body.
 *
 * Every write is an immediate transaction: SQLite's write lock is taken before
 * the reads a guard depends on, so blue and green cannot both pass the same
 * check.
 *
 * Proof: retired-helper-roleIn; reintroduced the retired callable.
 * 'does not expose the retired server role helper roleIn' (organization-authorization.db.test.ts) failed; restored GREEN, 2026-11-10.
 * Proof: retired-helper-guardFinalSuperAdmin; reintroduced the retired callable.
 * 'does not expose the retired server role helper guardFinalSuperAdmin' (organization-authorization.db.test.ts) failed; restored GREEN, 2026-11-10.
 * Proof: retired-method-createForUnaffiliatedUser; reintroduced the retired callable.
 * 'does not expose the retired organization role API createForUnaffiliatedUser' (organization-records.db.test.ts) failed; restored GREEN, 2026-11-10.
 * Proof: retired-method-addMember; reintroduced the retired callable.
 * 'does not expose the retired organization role API addMember' (organization-records.db.test.ts) failed; restored GREEN, 2026-11-10.
 * Proof: retired-method-changeRole; reintroduced the retired callable.
 * 'does not expose the retired organization role API changeRole' (organization-records.db.test.ts) failed; restored GREEN, 2026-11-10.
 */
export class OrganizationRepository implements MembershipAdministration {
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly gate: Gate,
  ) {}

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
    return await this.gate
      .enter(async () => {
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
      })
      .catch((failure: unknown) => {
        /* Proof: aggregate-classification-member-raw: broken owner dependency propagates aggregate; distinct from native paired-failure control.
         * preserves an unexpected aggregate from the actual owner dependency at member-raw
         * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
        if (failure instanceof LastSuperAdmin) return 'last-super-admin';
        throw failure;
      });
  }

  /** Current-grant removal; authorization and aggregate effects share one owner. */
  async administer(
    organizationId: string,
    principal: SecurityPrincipal,
    targetUserId: string,
    act: AuditedAct,
    source: MembershipRemovalSource,
  ): Promise<MembershipAdministered> {
    // Proof: member-remove-principal-snapshot: removed/broken boundary failed `retains queued credential authentication for membership remove`; named assertion RED and restored GREEN (task-2.5 guard-faults).
    principal = retainSecurityPrincipal(principal);
    act = retainMembershipAct(principal.id, targetUserId, act, source);
    // Proof: member-rollback-owner: removed/broken boundary failed `rolls admitted membership removal back on a late aggregate audit failure`; named assertion RED and restored GREEN (task-2.5 guard-faults).
    return runSecurityTransaction(
      this.db,
      this.gate,
      async (tx): Promise<MembershipAdministered> => {
        const currentMember = tx
          .select({ userId: organizationMembership.userId })
          .from(organizationMembership)
          .where(membershipOf(organizationId, principal.id))
          .get();
        if (currentMember === undefined) return { ok: false, refusal: 'forbidden' };
        if (principal.delegation !== undefined) return { ok: false, refusal: 'forbidden' };
        const decisions = new AccessDecisionRepository(tx);
        const target = { kind: 'organization', organizationId } as const;
        const memberDecision = await authorize(
          decisions,
          principal,
          target,
          'organization.manage_members',
        );
        // Proof: member-remove-grant: removed/broken boundary failed `names manage_members when a role-only super-admin removes a member`; named assertion RED and restored GREEN (task-2.5 guard-faults).
        if (!memberDecision.ok)
          return { ok: false, refusal: 'forbidden', permission: 'organization.manage_members' };
        const current = tx
          .select({ userId: organizationMembership.userId })
          .from(organizationMembership)
          .where(membershipOf(organizationId, targetUserId))
          .get();
        if (current === undefined) return { ok: false, refusal: 'not_found' };
        const holdsOrganizationRole = holdsDirectOrganizationRoleIn(
          tx,
          organizationId,
          targetUserId,
        );
        if (holdsOrganizationRole) {
          const roleDecision = await authorize(
            decisions,
            principal,
            target,
            'organization.manage_organization_roles',
          );
          // Proof: member-remove-org-role: removed/broken boundary failed `requires organization-role permission to remove a direct org-viewer holder`; named assertion RED and restored GREEN (task-2.5 guard-faults).
          if (!roleDecision.ok)
            return {
              ok: false,
              refusal: 'forbidden',
              permission: 'organization.manage_organization_roles',
            };
        }
        const removed = removeMembershipIn(tx, organizationId, targetUserId);
        if (removed.kind === 'last-super-admin') return { ok: false, refusal: 'last_super_admin' };
        if (removed.kind !== 'removed')
          throw new Error('guarded membership removal changed inside its owner');
        appendMembershipRemoval(tx, organizationId, targetUserId, act, source, removed.evidence);
        return { ok: true, membership: null };
      },
    ).catch((failure: unknown) => {
      /* Proof: aggregate-classification-member-remove: broken owner dependency propagates aggregate; distinct from native paired-failure control.
       * preserves an unexpected aggregate from the actual owner dependency at member-remove
       * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
      if (failure instanceof LastSuperAdmin)
        return { ok: false, refusal: 'last_super_admin' } as const;
      throw failure;
    });
  }

  /** Current organization.read admission followed by account-only grant summaries. */
  async listMembers(organizationId: string, principal: SecurityPrincipal): Promise<MembersListed> {
    // Proof: member-list-principal-snapshot: removed/broken boundary failed `retains queued credential authentication for membership list`; named assertion RED and restored GREEN (task-2.5 guard-faults).
    principal = retainSecurityPrincipal(principal);
    // Proof: member-list-gate-owner: removed/broken boundary failed `rechecks queued membership permission revocation at list`; named assertion RED and restored GREEN (task-2.5 guard-faults).
    return runSecurityTransaction(this.db, this.gate, async (tx): Promise<MembersListed> => {
      if (readOrganizationActivation(tx) !== 'activated')
        return { ok: false, refusal: 'onboarding_inactive' };
      const decision = await authorize(
        new AccessDecisionRepository(tx),
        principal,
        { kind: 'organization', organizationId },
        'organization.read',
      );
      // Proof: member-list-grant: removed/broken boundary failed `names organization.read when a role-only super-admin lists members`; named assertion RED and restored GREEN (task-2.5 guard-faults).
      if (principal.delegation !== undefined || !decision.ok)
        return { ok: false, refusal: 'forbidden', permission: 'organization.read' };
      const rows = tx
        .select({
          userId: organizationMembership.userId,
          username: users.username,
          email: users.email,
          createdAt: organizationMembership.createdAt,
        })
        .from(organizationMembership)
        .innerJoin(users, eq(users.id, organizationMembership.userId))
        .where(eq(organizationMembership.organizationId, organizationId))
        .orderBy(organizationMembership.createdAt, organizationMembership.userId)
        .all();
      return {
        ok: true,
        members: rows.map((row) => ({
          ...row,
          ...readMemberAccessIn(tx, organizationId, row.userId),
        })),
      };
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
      .all()
      .map((row) => ({ ...row, role: validateMembershipLabel(row.role, row.organizationId) }));
  }
}

export function membershipOf(organizationId: string, userId: string) {
  return and(
    eq(organizationMembership.organizationId, organizationId),
    eq(organizationMembership.userId, userId),
  );
}
