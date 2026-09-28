import type { Invitation, InvitationAnswer, InvitationSummary, WriteStamp } from '@wbs/core';
import { mayInvite, ORGANIZATION_ROLES, type OrganizationRole } from '@wbs/domain';
import { and, eq, isNull } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { auditOnCreate, auditOnUpdate } from './audit';
import type { Gate } from './gate';
import { readOrganizationActivation } from './organization-activation';
import { organizationInvitation, organizationMembership, users } from './schema';

type Transaction = Parameters<Parameters<SQLiteBunDatabase['transaction']>[0]>[0];

/** The current actor role in the same transaction that changes an invitation. */
function actorRole(
  tx: Transaction,
  organizationId: string,
  actorId: string,
): OrganizationRole | null {
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
  if (membership === undefined) return null;
  const known: readonly string[] = ORGANIZATION_ROLES;
  if (!known.includes(membership.role)) throw new Error(`malformed membership role for ${actorId}`);
  // The runtime vocabulary check above is the boundary for persisted role values.
  return membership.role;
}

/** Maps only public invitation columns; token digests never leave this repository. */
function summary(row: typeof organizationInvitation.$inferSelect): InvitationSummary {
  return {
    id: row.id,
    email: row.recipientEmail,
    role: row.role,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    consumedAt: row.consumedAt,
  };
}

/** Invitation storage uses immediate transactions for issue, revoke and single-use acceptance. */
export class InvitationRepository implements Invitation {
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly gate: Gate,
  ) {}

  /** Lists only the scoped organization's offers after a fresh activation and role read. */
  list(organizationId: string, actorId: string): Promise<InvitationAnswer<InvitationSummary[]>> {
    return Promise.resolve(
      this.db.transaction((tx) => {
        if (readOrganizationActivation(tx) !== 'activated')
          return { ok: false, refusal: 'onboarding_inactive' };
        const role = actorRole(tx, organizationId, actorId);
        // Proof: 2026-09-28, bypassing this current-role check failed `limits listing and revocation to the current administrator role`.
        if (role === null || !mayInvite(role, 'viewer')) return { ok: false, refusal: 'forbidden' };
        return {
          ok: true,
          value: tx
            .select()
            .from(organizationInvitation)
            // Proof: 2026-09-28, removing this organization predicate made `lists only invitations in the active organization` return both tenants' offers.
            .where(eq(organizationInvitation.organizationId, organizationId))
            .all()
            .map(summary),
        };
      }),
    );
  }

  /** Issues a seven-day digest-bound offer under the current role matrix. */
  issue(
    organizationId: string,
    actorId: string,
    email: string,
    role: InvitationSummary['role'],
    digest: string,
    expiresAt: number,
    stamp: WriteStamp,
  ): Promise<InvitationAnswer<InvitationSummary>> {
    return this.gate.enter(async () =>
      Promise.resolve(
        this.db.transaction(
          (tx) => {
            if (readOrganizationActivation(tx) !== 'activated')
              return { ok: false, refusal: 'onboarding_inactive' };
            const actor = actorRole(tx, organizationId, actorId);
            // Proof: 2026-09-28, bypassing this current-role check failed `refuses an admin's admin invitation and a removed issuer`.
            if (actor === null || !mayInvite(actor, role))
              return { ok: false, refusal: 'forbidden' };
            const row = {
              id: crypto.randomUUID(),
              organizationId,
              recipientEmail: email,
              role,
              tokenDigest: digest,
              expiresAt,
            };
            tx.insert(organizationInvitation)
              .values({ ...row, ...auditOnCreate(stamp) })
              .run();
            return {
              ok: true,
              value: { id: row.id, email, role, expiresAt, revokedAt: null, consumedAt: null },
            };
          },
          { behavior: 'immediate' },
        ),
      ),
    );
  }

  /** Revokes a visible offer if current authority still permits its role. */
  revoke(
    organizationId: string,
    actorId: string,
    id: string,
    stamp: WriteStamp,
  ): Promise<InvitationAnswer<null>> {
    return this.gate.enter(async () =>
      Promise.resolve(
        this.db.transaction(
          (tx) => {
            if (readOrganizationActivation(tx) !== 'activated')
              return { ok: false, refusal: 'onboarding_inactive' };
            const actor = actorRole(tx, organizationId, actorId);
            // Proof: 2026-09-28, bypassing this current-role check failed `limits listing and revocation to the current administrator role` on a missing target.
            if (actor === null || !mayInvite(actor, 'viewer'))
              return { ok: false, refusal: 'forbidden' };
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
            // Proof: 2026-09-28, dropping the organization predicate failed `gives identical 404 for missing and foreign revocation`.
            if (invitation === undefined) return { ok: false, refusal: 'not_found' };
            // Proof: 2026-09-28, bypassing this offered-role check failed `limits listing and revocation to the current administrator role` on an admin offer.
            if (!mayInvite(actor, invitation.role)) return { ok: false, refusal: 'forbidden' };
            // Proof: 2026-09-28, bypassing this state check failed `refuses expired, revoked and replayed invitations` on duplicate revocation.
            if (invitation.revokedAt !== null || invitation.consumedAt !== null)
              return { ok: false, refusal: 'invitation_invalid' };
            tx.update(organizationInvitation)
              .set({ revokedAt: stamp.at, ...auditOnUpdate(stamp) })
              .where(eq(organizationInvitation.id, id))
              .run();
            return { ok: true, value: null };
          },
          { behavior: 'immediate' },
        ),
      ),
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

  /** Samples expiry after acquiring the write lock, then consumes with membership insertion in one immediate transaction. */
  accept(
    userId: string,
    digest: string,
    actorId: string,
    now: () => number,
  ): Promise<InvitationAnswer<{ organizationId: string; role: OrganizationRole }>> {
    return this.gate.enter(async () =>
      Promise.resolve(
        this.db.transaction(
          (tx) => {
            // Proof: 2026-09-28, sampling now() before gate.enter made both `refuses an invitation that expires while acceptance waits for the write gate` and `records acceptance at the time the write gate opens` fail; the latter stored consumed_at and updated_at at 100 after the gate opened at 300.
            const acceptedStamp: WriteStamp = { at: now(), by: actorId };
            // Proof: 2026-09-28, bypassing this read failed `checks activation during acceptance, even with a planted valid offer`.
            // Bypassing the read with absent, unreadable and malformed markers failed all three `throws for an activation marker during acceptance` cases.
            if (readOrganizationActivation(tx) !== 'activated')
              return { ok: false, refusal: 'onboarding_inactive' };
            const invitation = tx
              .select()
              .from(organizationInvitation)
              .where(eq(organizationInvitation.tokenDigest, digest))
              .get();
            if (invitation === undefined) return { ok: false, refusal: 'not_found' };
            // Proof: 2026-09-28, the pre-gate clock mutation above accepted an expired offer. Skipping this state check failed `refuses expired, revoked and replayed invitations`.
            if (
              invitation.expiresAt <= acceptedStamp.at ||
              invitation.revokedAt !== null ||
              invitation.consumedAt !== null
            )
              return { ok: false, refusal: 'invitation_invalid' };
            const account = tx
              .select({ email: users.email, verified: users.emailVerified })
              .from(users)
              .where(eq(users.id, userId))
              .get();
            if (account === undefined) throw new Error(`signed-in user ${userId} is absent`);
            // Proof: 2026-09-28, bypassing verified/current-email checks failed `refuses an unverified or changed recipient without consuming`.
            if (!account.verified || account.email === null)
              return { ok: false, refusal: 'email_verification_required' };
            if (account.email.toLowerCase() !== invitation.recipientEmail)
              return { ok: false, refusal: 'recipient_mismatch' };
            const existing = tx
              .select({ role: organizationMembership.role })
              .from(organizationMembership)
              .where(
                and(
                  eq(organizationMembership.organizationId, invitation.organizationId),
                  eq(organizationMembership.userId, userId),
                ),
              )
              .get();
            if (existing !== undefined && !ORGANIZATION_ROLES.includes(existing.role))
              throw new Error('malformed existing membership role');
            // Proof: 2026-09-28, removing this update made `consumes once across independent SQLite processes` return two successes; the separate processes used distinct connections to the same WAL database.
            tx.update(organizationInvitation)
              .set({
                consumedAt: acceptedStamp.at,
                consumedBy: userId,
                ...auditOnUpdate(acceptedStamp),
              })
              .where(eq(organizationInvitation.id, invitation.id))
              .run();
            if (existing === undefined) {
              // Proof: 2026-09-28, `rolls consumption back when membership insertion fails` injects a membership-insert abort and observes HTTP 500 with null consumed_at; this test checks rollback, while the independent-process test above checks replay.
              tx.insert(organizationMembership)
                .values({
                  organizationId: invitation.organizationId,
                  userId,
                  role: invitation.role,
                  ...auditOnCreate(acceptedStamp),
                })
                .run();
            }
            return {
              ok: true,
              value: {
                organizationId: invitation.organizationId,
                role: existing?.role ?? invitation.role,
              },
            };
          },
          // Proof: 2026-09-28, changing acceptance to DEFERRED made `consumes once across independent SQLite processes` fail: one worker exited 1 instead of returning a typed refusal.
          { behavior: 'immediate' },
        ),
      ),
    );
  }
}
