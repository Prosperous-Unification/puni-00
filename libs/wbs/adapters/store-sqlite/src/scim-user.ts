import type {
  AuditedAct,
  PendingMembershipActivation,
  ScimRefusal,
  ScimUser,
  ScimUserChange,
  ScimUserDraft,
  ScimUserFilter,
  ScimUsers,
} from '@wbs/core';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { auditOnCreate, auditOnUpdate } from './audit';
import { provenConnectionFor } from './enterprise-connection';
import type { Gate } from './gate';
import { type ImmediateTransaction, writeImmediately } from './immediate-write';
import { guardFinalSuperAdmin, membershipOf, roleIn } from './organization';
import { readOrganizationActivation } from './organization-activation';
import { appendOrganizationAudit } from './organization-audit-log';
import {
  organizationDomainClaim,
  organizationMembership,
  organizationScimUser,
  organizationSsoConnection,
} from './schema';

type Transaction = ImmediateTransaction;
type Reader = Pick<SQLiteBunDatabase, 'select'>;
type Row = typeof organizationScimUser.$inferSelect;

/** @throws on a malformed stored record. */
function checkedUser(row: Row): ScimUser {
  if (
    (row.active !== 0 && row.active !== 1) ||
    row.userName.length === 0 ||
    row.userName !== row.userName.toLowerCase() ||
    (row.userId === null) !== (row.issuer === null) ||
    (row.issuer === null) !== (row.subject === null) ||
    row.updatedAt === null
  )
    throw new Error(`SCIM user ${row.id} is malformed`);
  return {
    id: row.id,
    organizationId: row.organizationId,
    userName: row.userName,
    externalId: row.externalId,
    active: row.active === 1,
    userId: row.userId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function userIn(tx: Reader, organizationId: string, id: string): Row | undefined {
  // Proof: dropping the organization predicate made `answers another
  // organization's user as absent, changing nothing` in
  // `enterprise-sso-stores.db.test.ts` deprovision B's user; watched 2026-10-12.
  return tx
    .select()
    .from(organizationScimUser)
    .where(
      and(eq(organizationScimUser.id, id), eq(organizationScimUser.organizationId, organizationId)),
    )
    .get();
}

/** Whether `userName`'s domain carries an enterprise connection of `organizationId`. */
function hasConnectionFor(tx: Reader, organizationId: string, userName: string): boolean {
  const domain = userName.slice(userName.lastIndexOf('@') + 1);
  return (
    tx
      .select({ id: organizationSsoConnection.id })
      .from(organizationSsoConnection)
      .innerJoin(
        organizationDomainClaim,
        eq(organizationDomainClaim.id, organizationSsoConnection.domainClaimId),
      )
      .where(
        and(
          eq(organizationSsoConnection.organizationId, organizationId),
          eq(organizationDomainClaim.domain, domain),
        ),
      )
      .get() !== undefined
  );
}

function nameTaken(tx: Reader, organizationId: string, userName: string, except?: string): boolean {
  const holder = tx
    .select({ id: organizationScimUser.id })
    .from(organizationScimUser)
    .where(
      and(
        eq(organizationScimUser.organizationId, organizationId),
        eq(organizationScimUser.userName, userName),
      ),
    )
    .get();
  return holder !== undefined && holder.id !== except;
}

/** Throws unless activation is on: a SCIM act before it means a token leaked past its check. */
function requireActivated(tx: Transaction): void {
  if (readOrganizationActivation(tx) !== 'activated')
    throw new Error('SCIM provisioning ran before organization activation');
}

/**
 * Removes the bound user's membership as a super-admin removal would, or
 * refuses the last super-admin. A membership already gone is nothing to do.
 */
function endMembership(
  tx: Transaction,
  organizationId: string,
  userId: string,
): 'ended' | 'last_super_admin' {
  // Proof: skipping this guard made `refuses to deprovision the last
  // super-admin, changing nothing` in `enterprise-sso-stores.db.test.ts`
  // delete the membership; watched 2026-10-12.
  const guarded = guardFinalSuperAdmin(tx, organizationId, userId, null);
  if (guarded === 'last-super-admin') return 'last_super_admin';
  if (guarded === null)
    tx.delete(organizationMembership).where(membershipOf(organizationId, userId)).run();
  return 'ended';
}

/** {@link ScimUsers} over the shared database. */
export class ScimUserRepository implements ScimUsers {
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly gate: Gate,
  ) {}

  async list(organizationId: string, filter: ScimUserFilter | null): Promise<readonly ScimUser[]> {
    await Promise.resolve();
    const scope = eq(organizationScimUser.organizationId, organizationId);
    const where =
      filter === null
        ? scope
        : and(
            scope,
            filter.attribute === 'userName'
              ? eq(organizationScimUser.userName, filter.value)
              : eq(organizationScimUser.externalId, filter.value),
          );
    return this.db
      .select()
      .from(organizationScimUser)
      .where(where)
      .orderBy(asc(organizationScimUser.createdAt), asc(organizationScimUser.id))
      .all()
      .map(checkedUser);
  }

  async find(organizationId: string, id: string): Promise<ScimUser | null> {
    await Promise.resolve();
    const row = userIn(this.db, organizationId, id);
    return row === undefined ? null : checkedUser(row);
  }

  provision(
    organizationId: string,
    id: string,
    draft: ScimUserDraft,
    act: AuditedAct,
  ): ReturnType<ScimUsers['provision']> {
    return this.write((tx) => {
      requireActivated(tx);
      if (!hasConnectionFor(tx, organizationId, draft.userName)) return { kind: 'invalid_value' };
      if (nameTaken(tx, organizationId, draft.userName)) return { kind: 'uniqueness' };
      tx.insert(organizationScimUser)
        .values({
          id,
          organizationId,
          userName: draft.userName,
          externalId: draft.externalId,
          active: draft.active ? 1 : 0,
          ...auditOnCreate(act.stamp),
        })
        .run();
      appendOrganizationAudit(tx, {
        id: act.auditId,
        organizationId,
        actorId: act.actor,
        action: 'scim_user_provisioned',
        subjectKind: 'scim_user',
        subjectId: id,
        detail: { userName: draft.userName, active: draft.active },
        at: act.stamp.at,
      });
      const stored = userIn(tx, organizationId, id);
      if (stored === undefined) throw new Error(`provisioned SCIM user ${id} vanished`);
      return { kind: 'provisioned', user: checkedUser(stored) } as const;
    });
  }

  update(
    organizationId: string,
    id: string,
    change: ScimUserChange,
    act: AuditedAct,
  ): Promise<
    { readonly kind: 'updated'; readonly user: ScimUser } | { readonly kind: ScimRefusal }
  > {
    return this.write((tx): { kind: 'updated'; user: ScimUser } | { kind: ScimRefusal } => {
      requireActivated(tx);
      const stored = userIn(tx, organizationId, id);
      if (stored === undefined) return { kind: 'not_found' };
      const current = checkedUser(stored);
      const set: Partial<Row> = {};
      const changed: string[] = [];
      if (change.userName !== undefined && change.userName !== current.userName) {
        if (current.userId !== null) return { kind: 'mutability' };
        if (!hasConnectionFor(tx, organizationId, change.userName))
          return { kind: 'invalid_value' };
        if (nameTaken(tx, organizationId, change.userName, id)) return { kind: 'uniqueness' };
        set.userName = change.userName;
        changed.push('userName');
      }
      if (change.externalId !== undefined && change.externalId !== current.externalId) {
        set.externalId = change.externalId;
        changed.push('externalId');
      }
      let deprovisioned = false;
      if (change.active === false && current.active) {
        if (
          current.userId !== null &&
          endMembership(tx, organizationId, current.userId) === 'last_super_admin'
        )
          return { kind: 'last_super_admin' };
        set.active = 0;
        changed.push('active');
        deprovisioned = true;
      } else if (change.active === true && !current.active) {
        // Reactivation never restores a role: the record becomes a pending
        // membership again and the next SSO sign-in makes a `member`.
        set.active = 1;
        set.userId = null;
        set.issuer = null;
        set.subject = null;
        changed.push('active');
      }
      if (changed.length === 0) return { kind: 'updated', user: current };
      tx.update(organizationScimUser)
        .set({ ...set, ...auditOnUpdate(act.stamp) })
        .where(eq(organizationScimUser.id, id))
        .run();
      appendOrganizationAudit(tx, {
        id: act.auditId,
        organizationId,
        actorId: act.actor,
        action: deprovisioned ? 'scim_user_deprovisioned' : 'scim_user_updated',
        subjectKind: 'scim_user',
        subjectId: id,
        detail: { changed, ...(change.active === undefined ? {} : { active: change.active }) },
        at: act.stamp.at,
      });
      const updated = userIn(tx, organizationId, id);
      if (updated === undefined) throw new Error(`updated SCIM user ${id} vanished`);
      return { kind: 'updated', user: checkedUser(updated) };
    });
  }

  remove(
    organizationId: string,
    id: string,
    act: AuditedAct,
  ): Promise<'deleted' | 'not_found' | 'last_super_admin'> {
    return this.write((tx) => {
      requireActivated(tx);
      const stored = userIn(tx, organizationId, id);
      if (stored === undefined) return 'not_found';
      const current = checkedUser(stored);
      if (
        current.active &&
        current.userId !== null &&
        endMembership(tx, organizationId, current.userId) === 'last_super_admin'
      )
        return 'last_super_admin';
      tx.delete(organizationScimUser).where(eq(organizationScimUser.id, id)).run();
      appendOrganizationAudit(tx, {
        id: act.auditId,
        organizationId,
        actorId: act.actor,
        action: 'scim_user_deprovisioned',
        subjectKind: 'scim_user',
        subjectId: id,
        detail: { deleted: true },
        at: act.stamp.at,
      });
      return 'deleted' as const;
    });
  }

  /**
   * Proof: falling back to the connection itself when the subject carries no
   * proven prefix (matching on email alone) made `activates only through the
   * proven connection prefix and the record domain` in
   * `enterprise-sso-stores.db.test.ts` activate a `google-oauth2` sign-in;
   * watched 2026-10-12.
   */
  activate(
    userId: string,
    pair: { readonly issuer: string; readonly subject: string },
    canonicalEmail: string | null,
    act: Omit<AuditedAct, 'auditId'> & { readonly auditIds: () => string },
  ): Promise<readonly PendingMembershipActivation[]> {
    if (canonicalEmail === null) return Promise.resolve([]);
    return this.write((tx): readonly PendingMembershipActivation[] => {
      if (readOrganizationActivation(tx) !== 'activated') return [];
      const proven = provenConnectionFor(tx, pair.subject);
      if (proven === null) return [];
      if (canonicalEmail.slice(canonicalEmail.lastIndexOf('@') + 1) !== proven.domain) return [];
      const pending = tx
        .select()
        .from(organizationScimUser)
        .where(
          and(
            eq(organizationScimUser.organizationId, proven.organizationId),
            eq(organizationScimUser.userName, canonicalEmail),
            eq(organizationScimUser.active, 1),
            isNull(organizationScimUser.userId),
          ),
        )
        .get();
      if (pending === undefined) return [];
      checkedUser(pending);
      const alreadyBound = tx
        .select({ id: organizationScimUser.id })
        .from(organizationScimUser)
        .where(
          and(
            eq(organizationScimUser.organizationId, proven.organizationId),
            eq(organizationScimUser.userId, userId),
          ),
        )
        .get();
      // One SCIM record per person and organization: a second record for an
      // already-bound person stays pending for its directory to resolve.
      if (alreadyBound !== undefined) return [];
      if (roleIn(tx, proven.organizationId, userId) === null)
        tx.insert(organizationMembership)
          .values({
            organizationId: proven.organizationId,
            userId,
            role: 'member',
            ...auditOnCreate(act.stamp),
          })
          .run();
      tx.update(organizationScimUser)
        .set({
          userId,
          issuer: pair.issuer,
          subject: pair.subject,
          ...auditOnUpdate(act.stamp),
        })
        .where(eq(organizationScimUser.id, pending.id))
        .run();
      appendOrganizationAudit(tx, {
        id: act.auditIds(),
        organizationId: proven.organizationId,
        actorId: act.actor,
        action: 'pending_membership_activated',
        subjectKind: 'scim_user',
        subjectId: pending.id,
        detail: { prefix: proven.prefix },
        at: act.stamp.at,
      });
      return [{ organizationId: proven.organizationId, scimUserId: pending.id }];
    });
  }

  private write<T>(work: (tx: Transaction) => T): Promise<T> {
    return writeImmediately(this.db, this.gate, work);
  }
}
