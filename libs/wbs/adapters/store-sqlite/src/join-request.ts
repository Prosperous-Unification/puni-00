import type { JoinRequest, JoinRequestAnswer, JoinRequestSummary, WriteStamp } from '@wbs/core';
import { isSameMailbox, JOIN_REQUEST_STATUSES, mayInvite, ORGANIZATION_ROLES } from '@wbs/domain';
import { and, eq } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { auditOnCreate, auditOnUpdate } from './audit';
import type { Gate } from './gate';
import { readOrganizationActivation } from './organization-activation';
import {
  organizationDomainClaim,
  organizationInvitation,
  organizationJoinRequest,
  organizationMembership,
  users,
} from './schema';

type Transaction = Parameters<Parameters<SQLiteBunDatabase['transaction']>[0]>[0];

/** Rejects a persisted status outside the join-request vocabulary. */
function requireStatus(status: string): void {
  const known: readonly string[] = JOIN_REQUEST_STATUSES;
  // Proof: 2026-09-28, accepting `broken` failed `throws for a malformed trusted request status` on approval and denial.
  if (!known.includes(status)) throw new Error(`malformed join request status: ${status}`);
}

/** Reads mutable administrator authority inside the same transaction as resolution. */
function authorized(tx: Transaction, organizationId: string, actorId: string): boolean {
  const membership = tx
    .select({ role: organizationMembership.role })
    .from(organizationMembership)
    .where(
      and(
        eq(organizationMembership.organizationId, organizationId),
        eq(organizationMembership.userId, actorId),
      ),
    )
    .get();
  if (membership === undefined) return false;
  const known: readonly string[] = ORGANIZATION_ROLES;
  // Proof: 2026-09-28, bypassing this stored-role check made `throws for a malformed trusted administrator role` return 403 after the resolver had read a valid role.
  if (!known.includes(membership.role))
    throw new Error(`membership in organization ${organizationId} has malformed role`);
  return mayInvite(membership.role, 'viewer');
}

/** A join request grants nothing until its generated invitation is accepted. */
export class JoinRequestRepository implements JoinRequest {
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly gate: Gate,
  ) {}

  /** Reads requests only for the active organization and current administrator. */
  list(organizationId: string, actorId: string): Promise<JoinRequestAnswer<JoinRequestSummary[]>> {
    return Promise.resolve(
      this.db.transaction((tx) => {
        // Proof: 2026-09-28, bypassing this marker read failed `rechecks activation after active organization resolution` after the marker table was dropped.
        if (readOrganizationActivation(tx) !== 'activated')
          return { ok: false, refusal: 'onboarding_inactive' };
        // Proof: 2026-09-28, bypassing authority failed `limits listing and denial to current administrators`.
        if (!authorized(tx, organizationId, actorId)) return { ok: false, refusal: 'forbidden' };
        return {
          ok: true,
          value: tx
            .select({
              id: organizationJoinRequest.id,
              email: organizationJoinRequest.email,
              status: organizationJoinRequest.status,
              createdAt: organizationJoinRequest.createdAt,
            })
            .from(organizationJoinRequest)
            // Proof: 2026-09-28, removing this organization predicate failed `lists only requests in the active organization` by listing the foreign request.
            .where(eq(organizationJoinRequest.organizationId, organizationId))
            .all()
            .map((request) => {
              requireStatus(request.status);
              return request;
            }),
        };
      }),
    );
  }

  /** Rechecks role, current verified email and exact verified domain before one atomic invitation insert. */
  approve(
    organizationId: string,
    actorId: string,
    id: string,
    role: 'viewer' | 'member',
    digest: string,
    expiresAt: number,
    stamp: WriteStamp,
  ): Promise<JoinRequestAnswer<{ invitationId: string; email: string }>> {
    return this.gate.enter(async () =>
      Promise.resolve(
        this.db.transaction(
          (tx) => {
            // Proof: 2026-09-28, bypassing this read failed `rechecks activation during approve` after the marker table was dropped.
            if (readOrganizationActivation(tx) !== 'activated')
              return { ok: false, refusal: 'onboarding_inactive' };
            // Proof: 2026-09-28, bypassing current-role validation failed `rechecks administrator authority after active organization resolution`.
            if (!authorized(tx, organizationId, actorId))
              return { ok: false, refusal: 'forbidden' };
            const request = tx
              .select()
              .from(organizationJoinRequest)
              .where(
                and(
                  eq(organizationJoinRequest.id, id),
                  eq(organizationJoinRequest.organizationId, organizationId),
                ),
              )
              .get();
            // Proof: 2026-09-28, replacing this organization's predicate with `org` failed `hides foreign and missing requests identically`.
            if (request === undefined) return { ok: false, refusal: 'not_found' };
            requireStatus(request.status);
            // Proof: 2026-09-28, bypassing status failed `approves one pending request by issuing a viewer invitation without membership` on replay.
            if (request.status !== 'pending') return { ok: false, refusal: 'request_resolved' };
            const account = tx
              .select({ email: users.email, verified: users.emailVerified })
              .from(users)
              .where(eq(users.id, request.userId))
              .get();
            if (account === undefined)
              throw new Error(`join request user ${request.userId} is absent`);
            const email = account.email;
            // Proof: 2026-09-28, bypassing current-email/verification failed `refuses a changed or unverified applicant`.
            // Proof: 2026-09-28, lowercasing only the stored address made mounted
            // `approves a mixed-case internationalized applicant with a
            // byte-exact invitation` answer 409 rather than 200.
            if (!account.verified || email === null || !isSameMailbox(email, request.email))
              return { ok: false, refusal: 'domain_changed' };
            const parts = email.toLowerCase().split('@');
            // Proof: 2026-09-28, treating a malformed trusted address as `domain_changed` failed `throws for a malformed trusted verified address`.
            if (parts.length !== 2 || parts[0]?.length === 0 || parts[1]?.length === 0)
              throw new Error(`verified user ${request.userId} has malformed email`);
            const domain = parts[1];
            const claim = tx
              .select({ id: organizationDomainClaim.id })
              .from(organizationDomainClaim)
              .where(
                and(
                  eq(organizationDomainClaim.organizationId, organizationId),
                  eq(organizationDomainClaim.domain, domain),
                  eq(organizationDomainClaim.status, 'verified'),
                ),
              )
              .get();
            // Proof: 2026-09-28, removing the organization, domain, and verified-status predicates separately failed `requires the exact verified claim in the active organization`.
            if (claim === undefined) return { ok: false, refusal: 'domain_changed' };
            const invitationId = crypto.randomUUID();
            tx.insert(organizationInvitation)
              .values({
                id: invitationId,
                organizationId,
                recipientEmail: email,
                role,
                tokenDigest: digest,
                expiresAt,
                ...auditOnCreate(stamp),
              })
              .run();
            // Proof: 2026-09-28, aborting this later update left no invitation in `rolls the invitation back when the subsequent resolution update fails`; removing the transaction made that test retain the inserted invitation.
            tx.update(organizationJoinRequest)
              .set({
                status: 'approved',
                resolvedAt: stamp.at,
                resolvedBy: actorId,
                invitationId,
                ...auditOnUpdate(stamp),
              })
              .where(eq(organizationJoinRequest.id, id))
              .run();
            return { ok: true, value: { invitationId, email } };
          },
          // Proof: 2026-09-28, changing this transaction to deferred made `serializes overlapping approve/approve decisions across processes` fail with SQLITE_BUSY under a competing writer lock.
          { behavior: 'immediate' },
        ),
      ),
    );
  }

  /** Denial changes only the pending request in an immediate transaction. */
  deny(
    organizationId: string,
    actorId: string,
    id: string,
    stamp: WriteStamp,
  ): Promise<JoinRequestAnswer<null>> {
    return this.gate.enter(async () =>
      Promise.resolve(
        this.db.transaction(
          (tx) => {
            // Proof: 2026-09-28, bypassing this read failed `rechecks activation during deny` after the marker table was dropped.
            if (readOrganizationActivation(tx) !== 'activated')
              return { ok: false, refusal: 'onboarding_inactive' };
            // Proof: 2026-09-28, bypassing authority failed `limits listing and denial to current administrators`.
            if (!authorized(tx, organizationId, actorId))
              return { ok: false, refusal: 'forbidden' };
            const request = tx
              .select({ status: organizationJoinRequest.status })
              .from(organizationJoinRequest)
              .where(
                and(
                  eq(organizationJoinRequest.id, id),
                  eq(organizationJoinRequest.organizationId, organizationId),
                ),
              )
              .get();
            // Proof: 2026-09-28, replacing the denial query's organization predicate with `org` failed `gives identical 404 for foreign and missing denial targets`.
            if (request === undefined) return { ok: false, refusal: 'not_found' };
            requireStatus(request.status);
            // Proof: 2026-09-28, bypassing pending status failed `denies without invitation or membership and refuses replay`.
            if (request.status !== 'pending') return { ok: false, refusal: 'request_resolved' };
            tx.update(organizationJoinRequest)
              .set({
                status: 'denied',
                resolvedAt: stamp.at,
                resolvedBy: actorId,
                ...auditOnUpdate(stamp),
              })
              .where(eq(organizationJoinRequest.id, id))
              .run();
            return { ok: true, value: null };
          },
          // Proof: 2026-09-28, changing this transaction to deferred made `serializes overlapping approve/deny decisions across processes` fail with SQLITE_BUSY under a competing writer lock.
          { behavior: 'immediate' },
        ),
      ),
    );
  }

  /** Revokes a failed offer; reopens its request only while the pending slot is free. */
  failDelivery(id: string, invitationId: string, stamp: WriteStamp): Promise<void> {
    return this.gate.enter(() => {
      this.db.transaction(
        (tx) => {
          const invitation = tx
            .update(organizationInvitation)
            .set({ revokedAt: stamp.at, ...auditOnUpdate(stamp) })
            .where(eq(organizationInvitation.id, invitationId))
            .run();
          if (invitation.changes !== 1)
            throw new Error(`approval invitation ${invitationId} disappeared`);
          const original = tx
            .select({
              organizationId: organizationJoinRequest.organizationId,
              userId: organizationJoinRequest.userId,
            })
            .from(organizationJoinRequest)
            .where(
              and(
                eq(organizationJoinRequest.id, id),
                eq(organizationJoinRequest.invitationId, invitationId),
              ),
            )
            .get();
          const competing =
            original === undefined
              ? undefined
              : tx
                  .select({ id: organizationJoinRequest.id })
                  .from(organizationJoinRequest)
                  .where(
                    and(
                      eq(organizationJoinRequest.organizationId, original.organizationId),
                      eq(organizationJoinRequest.userId, original.userId),
                      eq(organizationJoinRequest.status, 'pending'),
                    ),
                  )
                  .get();
          // Proof: 2026-09-28, bypassing this competing-request check made `revokes a failed offer when a new request arrives during delayed delivery` answer 500 and roll back revocation.
          if (competing !== undefined) return;
          const request = tx
            .update(organizationJoinRequest)
            .set({
              status: 'pending',
              resolvedAt: null,
              resolvedBy: null,
              invitationId: null,
              ...auditOnUpdate(stamp),
            })
            .where(
              and(
                eq(organizationJoinRequest.id, id),
                eq(organizationJoinRequest.invitationId, invitationId),
              ),
            )
            .run();
          if (request.changes !== 1) throw new Error(`join request ${id} changed during delivery`);
        },
        { behavior: 'immediate' },
      );
      return Promise.resolve();
    });
  }
}
