import {
  type Invitation,
  type InvitationAnswer,
  type InvitationSummary,
  retainSecurityPrincipal,
  type SecurityPrincipal,
  type WriteStamp,
} from '@wbs/core';
import type { InitialAccess } from '@wbs/domain';
import { and, eq, isNull } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { appendGrantAudit } from './access-audit';
import { writeGrantIn } from './access-grant';
import { auditOnCreate, auditOnUpdate } from './audit';
import type { Gate } from './gate';
import {
  decodeInitialAccess,
  encodeInitialAccess,
  projectLegacyOfferRole,
  readInitialAccessRefusalIn,
  readMembershipRefusalIn,
} from './initial-access';
import { readOrganizationActivation } from './organization-activation';
import { organizationInvitation, organizationMembership, users } from './schema';
import { runSecurityTransaction } from './security-transaction';

/**
 * Durable personal issuance is established by the original personal-only route and
 * writer boundary. Only that stored issuer may become an account subject for P11
 * revalidation; missing provenance never falls back to recipient or current actor.
 */
function readPersonalIssuer(row: typeof organizationInvitation.$inferSelect): string {
  /* Proof: accept-issuer-provenance: removed/changed production boundary.
   * rejects missing durable issuer provenance null before consuming
   * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
  if (row.createdBy === null || row.createdBy === '')
    throw new Error('invitation personal issuer is missing');
  return row.createdBy;
}

/** Public projection decodes only new trusted initial access; compatibility role and digests stay private. */
function summarizeInvitation(row: typeof organizationInvitation.$inferSelect): InvitationSummary {
  const selection = decodeInitialAccess(row.initialAccess);
  readPersonalIssuer(row);
  return {
    id: row.id,
    email: row.recipientEmail,
    initialRoleId: selection.kind === 'role' ? selection.roleId : null,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    consumedAt: row.consumedAt,
  };
}

/** Current-grant personal offers; awaited checks and all effects retain one existing writer owner. */
export class InvitationRepository implements Invitation {
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly gate: Gate,
  ) {}

  list(
    organizationId: string,
    principal: SecurityPrincipal,
  ): Promise<InvitationAnswer<InvitationSummary[]>> {
    /* Proof: invitation-list-principal: removed/changed production boundary.
     * retains queued credential authentication at invitation-list
     * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
    principal = retainSecurityPrincipal(principal);
    /* Proof: invitation-list-owner: removed/changed production boundary.
     * rechecks queued current offer authority at invitation-list
     * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
    return runSecurityTransaction(
      this.db,
      this.gate,
      async (tx): Promise<InvitationAnswer<InvitationSummary[]>> => {
        if (readOrganizationActivation(tx) !== 'activated')
          return { ok: false, refusal: 'onboarding_inactive' };
        const refusal = await readMembershipRefusalIn(
          tx,
          organizationId,
          principal,
          'organization.manage_members',
        );
        /* Proof: invitation-list-current-check: removed/changed production boundary.
         * rechecks queued current offer authority at invitation-list
         * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
        if (refusal !== null) return { ok: false, ...refusal };
        return {
          ok: true,
          value: tx
            .select()
            .from(organizationInvitation)
            .where(eq(organizationInvitation.organizationId, organizationId))
            .all()
            .map(summarizeInvitation),
        };
      },
    );
  }

  issue(
    organizationId: string,
    principal: SecurityPrincipal,
    email: string,
    initialAccess: InitialAccess,
    digest: string,
    expiresAt: number,
    stamp: WriteStamp,
  ): Promise<InvitationAnswer<InvitationSummary>> {
    /* Proof: invitation-issue-principal: removed/changed production boundary.
     * retains queued credential authentication at invitation-issue
     * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
    principal = retainSecurityPrincipal(principal, stamp.by);
    /* Proof: invitation-issue-selection: removed/changed production boundary.
     * retains the queued initial selection at invitation-issue
     * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
    initialAccess = structuredClone(initialAccess);
    /* Proof: invitation-issue-stamp: removed/changed production boundary.
     * retains the queued request stamp at invitation-issue
     * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
    stamp = structuredClone(stamp);
    /* Proof: invitation-issue-owner: removed/changed production boundary.
     * rechecks queued current offer authority at invitation-issue
     * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
    return runSecurityTransaction(
      this.db,
      this.gate,
      async (tx): Promise<InvitationAnswer<InvitationSummary>> => {
        if (readOrganizationActivation(tx) !== 'activated')
          return { ok: false, refusal: 'onboarding_inactive' };
        const refusal = await readInitialAccessRefusalIn(
          tx,
          organizationId,
          principal,
          initialAccess,
        );
        /* Proof: invitation-issue-current-check: removed/changed production boundary.
         * rechecks queued current offer authority at invitation-issue
         * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
        if (refusal !== null) return { ok: false, ...refusal };
        const row = {
          id: crypto.randomUUID(),
          organizationId,
          recipientEmail: email,
          role: projectLegacyOfferRole(initialAccess),
          initialAccess: encodeInitialAccess(initialAccess),
          tokenDigest: digest,
          expiresAt,
          ...auditOnCreate(stamp),
        };
        tx.insert(organizationInvitation).values(row).run();
        return {
          ok: true,
          value: {
            id: row.id,
            email,
            initialRoleId: initialAccess.kind === 'role' ? initialAccess.roleId : null,
            expiresAt,
            revokedAt: null,
            consumedAt: null,
          },
        };
      },
    );
  }

  revoke(
    organizationId: string,
    principal: SecurityPrincipal,
    id: string,
    stamp: WriteStamp,
  ): Promise<InvitationAnswer<null>> {
    /* Proof: invitation-revoke-principal: removed/changed production boundary.
     * retains queued credential authentication at invitation-revoke
     * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
    principal = retainSecurityPrincipal(principal, stamp.by);
    /* Proof: invitation-revoke-stamp: removed/changed production boundary.
     * retains the queued request stamp at invitation-revoke
     * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
    stamp = structuredClone(stamp);
    /* Proof: invitation-revoke-owner: removed/changed production boundary.
     * rechecks queued current offer authority at invitation-revoke
     * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
    return runSecurityTransaction(
      this.db,
      this.gate,
      async (tx): Promise<InvitationAnswer<null>> => {
        if (readOrganizationActivation(tx) !== 'activated')
          return { ok: false, refusal: 'onboarding_inactive' };
        const refusal = await readMembershipRefusalIn(
          tx,
          organizationId,
          principal,
          'organization.manage_members',
        );
        /* Proof: invitation-revoke-current-check: removed/changed production boundary.
         * rechecks queued current offer authority at invitation-revoke
         * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
        if (refusal !== null) return { ok: false, ...refusal };
        const invitation = tx
          .select()
          .from(organizationInvitation)
          .where(
            and(
              eq(organizationInvitation.id, id),
              eq(organizationInvitation.organizationId, organizationId),
            ),
          )
          .get();
        if (invitation === undefined) return { ok: false, refusal: 'not_found' };
        decodeInitialAccess(invitation.initialAccess);
        readPersonalIssuer(invitation);
        if (invitation.revokedAt !== null || invitation.consumedAt !== null)
          return { ok: false, refusal: 'invitation_invalid' };
        tx.update(organizationInvitation)
          .set({ revokedAt: stamp.at, ...auditOnUpdate(stamp) })
          .where(eq(organizationInvitation.id, id))
          .run();
        return { ok: true, value: null };
      },
    );
  }

  /** Makes a failed sink delivery unusable; disappearance is trusted-state failure. */
  failDelivery(id: string, now: number): Promise<void> {
    return this.gate.enter(() => {
      this.db.transaction(
        (tx) => {
          const changed = tx
            .update(organizationInvitation)
            // Proof: 2026-09-28, replacing the helper with a direct `updatedAt` made `stamps every update with auditOnUpdate` report this invitation update.
            .set({ revokedAt: now, ...auditOnUpdate({ at: now }) })
            .where(and(eq(organizationInvitation.id, id), isNull(organizationInvitation.revokedAt)))
            .run();
          // Proof: 2026-09-28, bypassing this changed-row check failed `throws if the invitation disappears before failed delivery is recorded`.
          if (changed.changes !== 1)
            throw new Error(`invitation ${id} disappeared during delivery`);
        },
        { behavior: 'immediate' },
      );
      return Promise.resolve();
    });
  }

  /**
   * Owns completion time: sample after BEGIN for initial expiry ordering, then after
   * current issuer awaits immediately before consumption. This changes no retained
   * caller stamp: acceptance takes a clock, not an AuditedAct. Issuance time is immutable.
   */
  accept(
    principal: SecurityPrincipal,
    digest: string,
    now: () => number,
  ): Promise<InvitationAnswer<{ organizationId: string }>> {
    /* Proof: accept-principal: removed/changed production boundary.
     * retains acceptance authority before the queued owner at id
     * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
    principal = retainSecurityPrincipal(principal);
    /* Proof: accept-personal-owner: removed/changed production boundary.
     * enforces personal acceptance before acquiring its owner for machine
     * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
    if (
      principal.delegation !== undefined ||
      principal.authentication?.kind === 'machine' ||
      principal.authentication?.kind === 'consent'
    )
      return Promise.resolve({ ok: false, refusal: 'insufficient_scope' });
    /* Proof: accept-owner: removed/changed production boundary.
     * rolls consumption membership and initial access back when its grant audit fails
     * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
    return runSecurityTransaction(
      this.db,
      this.gate,
      async (tx): Promise<InvitationAnswer<{ organizationId: string }>> => {
        const initiallyAcceptedAt = now();
        if (readOrganizationActivation(tx) !== 'activated')
          return { ok: false, refusal: 'onboarding_inactive' };
        const invitation = tx
          .select()
          .from(organizationInvitation)
          .where(eq(organizationInvitation.tokenDigest, digest))
          .get();
        if (invitation === undefined) return { ok: false, refusal: 'not_found' };
        const selection = decodeInitialAccess(invitation.initialAccess);
        const issuerId = readPersonalIssuer(invitation);
        if (
          invitation.expiresAt <= initiallyAcceptedAt ||
          invitation.revokedAt !== null ||
          invitation.consumedAt !== null
        )
          return { ok: false, refusal: 'invitation_invalid' };
        const account = tx
          .select({ email: users.email, verified: users.emailVerified })
          .from(users)
          .where(eq(users.id, principal.id))
          .get();
        if (account === undefined) throw new Error('signed-in user ' + principal.id + ' is absent');
        if (!account.verified || account.email === null)
          return { ok: false, refusal: 'email_verification_required' };
        if (account.email.toLowerCase() !== invitation.recipientEmail)
          return { ok: false, refusal: 'recipient_mismatch' };
        const existing = tx
          .select({ userId: organizationMembership.userId })
          .from(organizationMembership)
          .where(
            and(
              eq(organizationMembership.organizationId, invitation.organizationId),
              eq(organizationMembership.userId, principal.id),
            ),
          )
          .get();
        /* Proof: accept-none-issuer: removed/changed production boundary.
         * rechecks a none-offer issuer current grant before new membership
         * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
        if (existing === undefined) {
          const refusal = await readInitialAccessRefusalIn(
            tx,
            invitation.organizationId,
            { id: issuerId },
            selection,
          );
          if (refusal !== null) return { ok: false, ...refusal };
        }
        const completedAt = now();
        /* Proof: accept-completion-expiry: removed/changed production boundary.
         * owns acceptance completion clock after awaited issuer checks with expiry 200
         * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
        if (invitation.expiresAt <= completedAt)
          return { ok: false, refusal: 'invitation_invalid' };
        /* Proof: accept-membership-recipient: removed/changed production boundary.
         * grants org-admin as the durable personal issuer inside new-member acceptance
         * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
        const acceptedStamp: WriteStamp = { at: completedAt, by: principal.id };
        tx.update(organizationInvitation)
          .set({
            consumedAt: completedAt,
            consumedBy: principal.id,
            ...auditOnUpdate(acceptedStamp),
          })
          .where(eq(organizationInvitation.id, invitation.id))
          .run();
        if (existing === undefined) {
          tx.insert(organizationMembership)
            .values({
              organizationId: invitation.organizationId,
              userId: principal.id,
              role: 'viewer',
              ...auditOnCreate(acceptedStamp),
            })
            .run();
          if (selection.kind === 'role') {
            const auditId = crypto.randomUUID();
            const granted = writeGrantIn(
              tx,
              invitation.organizationId,
              {
                id: crypto.randomUUID(),
                scope: { kind: 'organization' },
                subject: { kind: 'user', userId: principal.id },
                roleId: selection.roleId,
                origin: 'invitation',
              },
              /* Proof: accept-grant-issuer: removed/changed production boundary.
               * grants org-admin as the durable personal issuer inside new-member acceptance
               * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
              { actor: { kind: 'user', userId: issuerId }, at: completedAt, auditId },
            );
            /* Proof: accept-impossible-refusal: removed/changed production boundary.
             * throws and rolls all acceptance effects back on an impossible borrowed initial grant refusal
             * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
            if (typeof granted === 'string')
              throw new Error('accepted initial grant refused: ' + granted);
            /* Proof: accept-audit: removed/changed production boundary.
             * grants org-admin as the durable personal issuer inside new-member acceptance
             * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
            appendGrantAudit(tx, {
              grant: granted.grant,
              action: 'access_granted',
              auditId,
              /* Proof: accept-audit-issuer: removed/changed production boundary.
               * grants org-admin as the durable personal issuer inside new-member acceptance
               * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
              actorId: issuerId,
              at: completedAt,
              origin: 'invitation',
            });
          }
        }
        return { ok: true, value: { organizationId: invitation.organizationId } };
      },
    );
  }
}
