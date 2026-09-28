import type { JoinRequest, JoinRequestAnswer, JoinRequestSummary, WriteStamp } from '@wbs/core';
import { JOIN_REQUEST_STATUSES, mayInvite } from '@wbs/domain';
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
  return membership !== undefined && mayInvite(membership.role, 'viewer');
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
            // Proof: 2026-09-28, bypassing current-role validation failed `refuses a removed administrator`.
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
            const email = account.email?.toLowerCase();
            // Proof: 2026-09-28, bypassing current-email/verification failed `refuses a changed or unverified applicant`.
            if (!account.verified || email === undefined || email !== request.email)
              return { ok: false, refusal: 'domain_changed' };
            const parts = email.split('@');
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
            // Proof: 2026-09-28, skipping this exact verified-domain predicate failed `refuses a suspended or changed domain at approval`.
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
            // Proof: 2026-09-28, an abort trigger on invitation insertion made `rolls resolution back when invitation insertion fails` observe HTTP 500 with a still-pending request.
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
          { behavior: 'immediate' },
        ),
      ),
    );
  }

  /** Invalidates a failed delivery and returns its request to pending. */
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
