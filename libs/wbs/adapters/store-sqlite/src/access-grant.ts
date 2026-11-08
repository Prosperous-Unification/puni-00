import type {
  AccessAct,
  AccessGrantRecord,
  AccessGrants,
  AccessGroupRecord,
  GrantDraft,
  GrantFilter,
  GrantRefusal,
  GrantScope,
  GrantSubject,
} from '@wbs/core';
import { type AccessObjectKind, type GrantSubjectKind, roleFitsScope } from '@wbs/domain';
import { and, asc, count, eq, inArray, isNull, ne, or, type SQL } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { auditOnCreate, auditOnOperatorCreate, auditOnUpdate } from './audit';
import type { Gate } from './gate';
import { type ImmediateTransaction, writeImmediately } from './immediate-write';
import {
  accessGrant,
  type AccessGrantRow,
  accessGroup,
  accessGroupMember,
  accessRole,
  machineCredential,
  organization,
  organizationMembership,
  projectOrganization,
} from './schema';

type Transaction = ImmediateTransaction;
type Reader = Pick<SQLiteBunDatabase, 'select'>;

/** The built-in role whose direct holders CP14 keeps at one or more. */
const SUPER_ADMIN_ROLE = 'org-super-admin';

/**
 * The SQLite {@link AccessGrants}. Each write runs in this process's write
 * turn as one `BEGIN IMMEDIATE` transaction, so its checks read the state it
 * commits against, across connections too.
 */
export class AccessGrantRepository implements AccessGrants {
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly gate: Gate,
  ) {}

  grant(
    organizationId: string,
    draft: GrantDraft,
    act: AccessAct,
  ): Promise<{ readonly kind: 'granted'; readonly grant: AccessGrantRecord } | GrantRefusal> {
    // Proof: with this check made `if (false)`, `refuses an origin its actor
    // does not pair with, writing nothing` in `access-grant-store.db.test.ts`
    // stored a user's grant as `operator`; watched 2026-11-08.
    if ((draft.origin === 'operator') !== (act.actor.kind === 'operator'))
      return Promise.reject(
        new Error(`${act.actor.kind} actors may not write a grant of origin ${draft.origin}`),
      );
    return this.write((tx) => {
      const refusal = grantRefusal(tx, organizationId, draft);
      if (refusal !== null) return refusal;
      const { scopeKind, scopeId } = scopeColumns(organizationId, draft.scope);
      const { subjectKind, subjectId } = subjectColumns(organizationId, draft.subject);
      const by = authorOf(act);
      tx.insert(accessGrant)
        .values({
          id: draft.id,
          organizationId,
          scopeKind,
          scopeId,
          subjectKind,
          subjectId,
          roleId: draft.roleId,
          origin: draft.origin,
          // `access_grant` has no `updated_at`: `auditOnCreate`'s `updatedAt`
          // names no column and drizzle writes declared columns only. The
          // helper is what `audit.test.ts`' write-site scan requires.
          ...(by === null ? auditOnOperatorCreate(act.at) : auditOnCreate({ at: act.at, by })),
        })
        .run();
      return { kind: 'granted', grant: recordOf(grantRow(tx, organizationId, draft.id)) } as const;
    });
  }

  revoke(
    organizationId: string,
    grantId: string,
    _act: AccessAct,
  ): Promise<
    | { readonly kind: 'revoked'; readonly grant: AccessGrantRecord }
    | 'not_found'
    | 'last_super_admin'
  > {
    return this.write((tx) => {
      const row = findGrant(tx, organizationId, grantId);
      if (row === undefined) return 'not_found';
      // CP14: the count is read in this transaction, so of two super-admins
      // revoking each other's grant on two connections the second sees one
      // holder left, itself, and is refused.
      // Proof: with this check made `false &&`, `refuses revoking the last
      // direct super-admin grant, even while a group of members holds the
      // role` in `access-grant-store.db.test.ts` answered revoked and left
      // the organization with none, and `lets exactly one of two super-admins
      // revoke their own grant across two connections` revoked both (15 pass,
      // 2 fail); watched 2026-11-08.
      if (
        countsAsSuperAdmin(tx, row) &&
        directSuperAdminCount(tx, organizationId, { besides: row.id }) === 0
      )
        return 'last_super_admin';
      tx.delete(accessGrant)
        .where(and(eq(accessGrant.id, grantId), eq(accessGrant.organizationId, organizationId)))
        .run();
      return { kind: 'revoked', grant: recordOf(row) } as const;
    });
  }

  async list(organizationId: string, filter: GrantFilter): Promise<readonly AccessGrantRecord[]> {
    await Promise.resolve();
    const conditions: SQL[] = [eq(accessGrant.organizationId, organizationId)];
    if (filter.scope !== undefined) {
      const { scopeKind, scopeId } = scopeColumns(organizationId, filter.scope);
      conditions.push(eq(accessGrant.scopeKind, scopeKind), eq(accessGrant.scopeId, scopeId));
    }
    if (filter.subject !== undefined) {
      const { subjectKind, subjectId } = subjectColumns(organizationId, filter.subject);
      conditions.push(
        eq(accessGrant.subjectKind, subjectKind),
        eq(accessGrant.subjectId, subjectId),
      );
    }
    return this.db
      .select()
      .from(accessGrant)
      .where(and(...conditions))
      .orderBy(asc(accessGrant.createdAt), asc(accessGrant.id))
      .all()
      .map(recordOf);
  }

  async listGroups(organizationId: string): Promise<readonly AccessGroupRecord[]> {
    await Promise.resolve();
    return this.db.transaction((tx) =>
      tx
        .select({ id: accessGroup.id, name: accessGroup.name, createdAt: accessGroup.createdAt })
        .from(accessGroup)
        .where(eq(accessGroup.organizationId, organizationId))
        .orderBy(asc(accessGroup.name))
        .all()
        .map((group) => ({ ...group, organizationId, memberIds: memberIdsOf(tx, group.id) })),
    );
  }

  createGroup(
    organizationId: string,
    group: { readonly id: string; readonly name: string },
    act: AccessAct,
  ): Promise<{ readonly kind: 'created'; readonly group: AccessGroupRecord } | 'name_taken'> {
    return this.write((tx) => {
      // Proof: with this check removed, `creates, renames and lists groups,
      // refusing a taken name` in `access-grant-store.db.test.ts` threw the
      // UNIQUE constraint instead of the refusal; watched 2026-11-08.
      if (groupNamed(tx, organizationId, group.name) !== undefined) return 'name_taken';
      const by = authorOf(act);
      tx.insert(accessGroup)
        .values({
          id: group.id,
          organizationId,
          name: group.name,
          ...(by === null ? auditOnOperatorCreate(act.at) : auditOnCreate({ at: act.at, by })),
        })
        .run();
      return {
        kind: 'created',
        group: { id: group.id, organizationId, name: group.name, memberIds: [], createdAt: act.at },
      } as const;
    });
  }

  renameGroup(
    organizationId: string,
    groupId: string,
    name: string,
    act: AccessAct,
  ): Promise<'renamed' | 'unknown_group' | 'name_taken'> {
    return this.write((tx) => {
      if (!isGroupOf(tx, organizationId, groupId)) return 'unknown_group';
      const holder = groupNamed(tx, organizationId, name);
      if (holder !== undefined && holder !== groupId) return 'name_taken';
      tx.update(accessGroup)
        .set({ name, ...auditOnUpdate({ at: act.at }) })
        .where(and(eq(accessGroup.id, groupId), eq(accessGroup.organizationId, organizationId)))
        .run();
      return 'renamed' as const;
    });
  }

  deleteGroup(
    organizationId: string,
    groupId: string,
    _act: AccessAct,
  ): Promise<
    | { readonly kind: 'deleted'; readonly grantsDeleted: number; readonly membersRemoved: number }
    | 'unknown_group'
  > {
    return this.write((tx) => {
      if (!isGroupOf(tx, organizationId, groupId)) return 'unknown_group';
      // Proof: with this delete matching no group, `deletes a group with its
      // grants and members, and nothing of another group` in
      // `access-grant-store.db.test.ts` left the group's grant behind;
      // watched 2026-11-08.
      const grantsDeleted = tx
        .delete(accessGrant)
        .where(
          and(
            eq(accessGrant.organizationId, organizationId),
            eq(accessGrant.subjectKind, 'group'),
            eq(accessGrant.subjectId, groupId),
          ),
        )
        .run().changes;
      const membersRemoved = tx
        .delete(accessGroupMember)
        .where(
          and(
            eq(accessGroupMember.organizationId, organizationId),
            eq(accessGroupMember.groupId, groupId),
          ),
        )
        .run().changes;
      tx.delete(accessGroup)
        .where(and(eq(accessGroup.id, groupId), eq(accessGroup.organizationId, organizationId)))
        .run();
      return { kind: 'deleted', grantsDeleted, membersRemoved } as const;
    });
  }

  addGroupMember(
    organizationId: string,
    groupId: string,
    userId: string,
    act: AccessAct,
  ): Promise<'added' | 'unknown_group' | 'not_a_member' | 'already_in_group'> {
    return this.write((tx) => {
      if (!isGroupOf(tx, organizationId, groupId)) return 'unknown_group';
      // Proof: with this check removed, `adds only current members, once, and
      // removes them` in `access-grant-store.db.test.ts` threw the composite
      // membership key instead of the refusal; watched 2026-11-08.
      if (!isMemberOf(tx, organizationId, userId)) return 'not_a_member';
      // Proof: with this read removed, `adds only current members, once, and
      // removes them` threw the primary key instead of `already_in_group`;
      // watched 2026-11-08.
      if (isInGroup(tx, organizationId, groupId, userId)) return 'already_in_group';
      const by = authorOf(act);
      tx.insert(accessGroupMember)
        .values({
          organizationId,
          groupId,
          userId,
          // No `updated_at` on `access_group_member` either, as in `grant`.
          ...(by === null ? auditOnOperatorCreate(act.at) : auditOnCreate({ at: act.at, by })),
        })
        .run();
      return 'added' as const;
    });
  }

  removeGroupMember(
    organizationId: string,
    groupId: string,
    userId: string,
    _act: AccessAct,
  ): Promise<'removed' | 'unknown_group' | 'not_in_group'> {
    return this.write((tx) => {
      if (!isGroupOf(tx, organizationId, groupId)) return 'unknown_group';
      const removed = tx
        .delete(accessGroupMember)
        .where(
          and(
            eq(accessGroupMember.organizationId, organizationId),
            eq(accessGroupMember.groupId, groupId),
            eq(accessGroupMember.userId, userId),
          ),
        )
        .run().changes;
      return removed === 0 ? 'not_in_group' : 'removed';
    });
  }

  private write<T>(work: (tx: Transaction) => T): Promise<T> {
    return writeImmediately(this.db, this.gate, work);
  }
}

/**
 * Deletes every grant naming one of `credentialIds` as its subject
 * (`wbs-permissions` P17): a revoked or removed credential holds nothing, so
 * no later reuse of its row can read a grant back. Runs inside the caller's
 * revocation or removal transaction. Answers how many grants went; no
 * `access_revoked` audit row is written before task 4.1 admits the action.
 */
export function deleteGrantsOfCredentials(
  tx: Pick<SQLiteBunDatabase, 'delete'>,
  credentialIds: readonly string[],
): number {
  if (credentialIds.length === 0) return 0;
  return tx
    .delete(accessGrant)
    .where(
      and(
        eq(accessGrant.subjectKind, 'machine_credential'),
        inArray(accessGrant.subjectId, [...credentialIds]),
      ),
    )
    .run().changes;
}

/**
 * Copies every grant naming credential `fromId` to credential `toId`
 * (`wbs-permissions` P17 as amended 2026-11-08): an agent pool's re-key is a
 * rotation, so the new key holds what the old one held. Same organization,
 * scope, role and origin; the creator is carried, the instant is `at`. Runs
 * inside the re-key's transaction before the old key's grants are deleted.
 * A grant `toId` already holds is skipped, so two old keys of one person
 * holding the same grant copy it once. Answers how many rows were written.
 */
export function copyGrantsOfCredential(
  tx: Pick<SQLiteBunDatabase, 'select' | 'insert'>,
  fromId: string,
  toId: string,
  at: number,
): number {
  const held = tx
    .select()
    .from(accessGrant)
    .where(
      and(eq(accessGrant.subjectKind, 'machine_credential'), eq(accessGrant.subjectId, fromId)),
    )
    .all();
  let copied = 0;
  for (const row of held)
    copied += tx
      .insert(accessGrant)
      .values({
        id: crypto.randomUUID(),
        organizationId: row.organizationId,
        scopeKind: row.scopeKind,
        scopeId: row.scopeId,
        subjectKind: 'machine_credential',
        subjectId: toId,
        roleId: row.roleId,
        origin: row.origin,
        // The copy keeps its source's creator: a backfilled or operator row
        // has none. `auditOnCreate`'s `updatedAt` names no column of
        // `access_grant`, drizzle writes only declared columns, and the call
        // is what `audit.test.ts`' write-site scan requires.
        ...(row.createdBy === null
          ? auditOnOperatorCreate(at)
          : auditOnCreate({ at, by: row.createdBy })),
      })
      .onConflictDoNothing()
      .run().changes;
  return copied;
}

/**
 * How many current members of `organizationId` hold the built-in
 * `org-super-admin` through a direct `user` grant at organization scope
 * (`wbs-custom-permissions` CP14), not counting grant `besides`. Group-held,
 * custom-role and credential grants never count.
 */
export function directSuperAdminCount(
  reader: Reader,
  organizationId: string,
  options: { readonly besides: string | null },
): number {
  const conditions = [superAdminGrantOf(organizationId)];
  if (options.besides !== null) conditions.push(ne(accessGrant.id, options.besides));
  const counted = reader
    .select({ holders: count() })
    .from(accessGrant)
    .innerJoin(
      organizationMembership,
      and(
        eq(organizationMembership.organizationId, accessGrant.organizationId),
        eq(organizationMembership.userId, accessGrant.subjectId),
      ),
    )
    .where(and(...conditions))
    .get();
  if (counted === undefined) throw new Error('a COUNT(*) query answered no row');
  return counted.holders;
}

/**
 * Why the operator CLI (`wbs-permissions` P21, task 1.5) may not name
 * `userId` at `organizationId`, read before its write, or null:
 * `unknown_organization` when no organization has the id, `machine_credential`
 * when `userId` is a machine credential's id (any organization's). Read
 * outside the write because neither answer can change before it:
 * organizations are never deleted and a credential id never becomes a
 * `users.id`. Membership is the write's own check (`not_a_member`).
 *
 * Proof: 2026-11-08, with the `unknown_organization` return removed, `refuse
 * an unknown organization, writing nothing` in `access-grant-cli.db.test.ts`
 * failed (revoke answered `not_granted`), and with the `machine_credential`
 * return removed, `refuses a machine credential's id, writing nothing`
 * failed (`not_a_member`).
 */
export function operatorSubjectRefusal(
  reader: Reader,
  organizationId: string,
  userId: string,
): 'unknown_organization' | 'machine_credential' | null {
  const known = reader
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .get();
  if (known === undefined) return 'unknown_organization';
  const credential = reader
    .select({ id: machineCredential.id })
    .from(machineCredential)
    .where(eq(machineCredential.id, userId))
    .get();
  if (credential !== undefined) return 'machine_credential';
  return null;
}

/** The first rule `draft` breaks in `organizationId`, read in the write's transaction, or null. */
function grantRefusal(
  tx: Transaction,
  organizationId: string,
  draft: GrantDraft,
): GrantRefusal | null {
  const role = tx
    .select({ objectKind: accessRole.objectKind })
    .from(accessRole)
    .where(
      and(
        eq(accessRole.id, draft.roleId),
        or(isNull(accessRole.organizationId), eq(accessRole.organizationId, organizationId)),
      ),
    )
    .get();
  // Proof: with the organization predicate dropped from this read, `refuses
  // an unknown role and another organization’s custom role` in
  // `access-grant-store.db.test.ts` granted B's custom role in A; watched
  // 2026-11-08.
  if (role === undefined) return 'unknown_role';
  // Proof: with this check removed, `refuses org-admin at a work package and
  // project-manager there, …` in `access-grant-store.db.test.ts` granted
  // `org-admin` on the package; watched 2026-11-08.
  if (!roleFitsScope(role.objectKind, draft.scope.kind)) return 'role_scope_mismatch';
  if (!isScopeOf(tx, organizationId, draft.scope)) return 'not_found';
  const subjectRefusal = subjectRefusalOf(tx, organizationId, draft.subject);
  if (subjectRefusal !== null) return subjectRefusal;
  const { scopeKind, scopeId } = scopeColumns(organizationId, draft.scope);
  const { subjectKind, subjectId } = subjectColumns(organizationId, draft.subject);
  // Proof: with this read answering null, `refuses a duplicate as
  // already_granted and writes nothing` in `access-grant-store.db.test.ts`
  // threw the UNIQUE constraint instead of the refusal; watched 2026-11-08.
  const existing = tx
    .select({ id: accessGrant.id })
    .from(accessGrant)
    .where(
      and(
        eq(accessGrant.organizationId, organizationId),
        eq(accessGrant.scopeKind, scopeKind),
        eq(accessGrant.scopeId, scopeId),
        eq(accessGrant.subjectKind, subjectKind),
        eq(accessGrant.subjectId, subjectId),
        eq(accessGrant.roleId, draft.roleId),
      ),
    )
    .get();
  return existing === undefined ? null : 'already_granted';
}

/**
 * Whether `scope` exists and belongs to `organizationId`. A work package is
 * today's `project` row, owned through `project_organization` (design.md
 * "Tables": `work_package_organization` after `wbs-work-packages` slice 1).
 * No project entity exists yet, so a project scope never does.
 */
function isScopeOf(tx: Transaction, organizationId: string, scope: GrantScope): boolean {
  switch (scope.kind) {
    case 'organization':
      return (
        tx
          .select({ id: organization.id })
          .from(organization)
          .where(eq(organization.id, organizationId))
          .get() !== undefined
      );
    case 'project':
      return false;
    case 'work_package': {
      const packageId = scope.workPackageId;
      // Proof: with the organization predicate dropped from this read,
      // `refuses another organization’s work package, an absent one and a
      // project scope as not_found` in `access-grant-store.db.test.ts`
      // granted B's package in A; watched 2026-11-08.
      return (
        tx
          .select({ id: projectOrganization.resourceId })
          .from(projectOrganization)
          .where(
            and(
              eq(projectOrganization.resourceId, packageId),
              eq(projectOrganization.organizationId, organizationId),
            ),
          )
          .get() !== undefined
      );
    }
  }
}

/** Why `subject` may not hold a grant in `organizationId`, or null. */
function subjectRefusalOf(
  tx: Transaction,
  organizationId: string,
  subject: GrantSubject,
): 'not_a_member' | 'unknown_group' | 'unknown_credential' | null {
  switch (subject.kind) {
    case 'user':
      // Proof: with this check removed, `refuses a user who is no member, a
      // member of another organization included` in
      // `access-grant-store.db.test.ts` granted the outsider; watched
      // 2026-11-08.
      return isMemberOf(tx, organizationId, subject.userId) ? null : 'not_a_member';
    case 'group':
      // Proof: with this check removed, `refuses an absent group and another
      // organization’s group` in `access-grant-store.db.test.ts` granted the
      // absent group; watched 2026-11-08.
      return isGroupOf(tx, organizationId, subject.groupId) ? null : 'unknown_group';
    case 'organization_members':
      return null;
    case 'machine_credential': {
      const live = tx
        .select({ id: machineCredential.id })
        .from(machineCredential)
        .where(
          and(
            eq(machineCredential.id, subject.credentialId),
            eq(machineCredential.organizationId, organizationId),
            isNull(machineCredential.revokedAt),
          ),
        )
        .get();
      // Proof: with the `revoked_at IS NULL` predicate dropped, `refuses a
      // revoked, absent or foreign credential` in
      // `access-grant-store.db.test.ts` granted the revoked key; watched
      // 2026-11-08.
      return live === undefined ? 'unknown_credential' : null;
    }
  }
}

/** Whether `row` is a direct organization-scope `org-super-admin` grant of a current member. */
function countsAsSuperAdmin(tx: Transaction, row: AccessGrantRow): boolean {
  return (
    row.scopeKind === 'organization' &&
    row.subjectKind === 'user' &&
    row.roleId === SUPER_ADMIN_ROLE &&
    isMemberOf(tx, row.organizationId, row.subjectId)
  );
}

function superAdminGrantOf(organizationId: string): SQL {
  const condition = and(
    eq(accessGrant.organizationId, organizationId),
    eq(accessGrant.scopeKind, 'organization'),
    eq(accessGrant.subjectKind, 'user'),
    eq(accessGrant.roleId, SUPER_ADMIN_ROLE),
  );
  // `and` of several conditions always answers one; an absent one would
  // count every grant of every organization.
  if (condition === undefined) throw new Error('the super-admin predicate could not be built');
  return condition;
}

function isMemberOf(tx: Transaction, organizationId: string, userId: string): boolean {
  return (
    tx
      .select({ userId: organizationMembership.userId })
      .from(organizationMembership)
      .where(
        and(
          eq(organizationMembership.organizationId, organizationId),
          eq(organizationMembership.userId, userId),
        ),
      )
      .get() !== undefined
  );
}

function isInGroup(
  tx: Transaction,
  organizationId: string,
  groupId: string,
  userId: string,
): boolean {
  return (
    tx
      .select({ userId: accessGroupMember.userId })
      .from(accessGroupMember)
      .where(
        and(
          eq(accessGroupMember.organizationId, organizationId),
          eq(accessGroupMember.groupId, groupId),
          eq(accessGroupMember.userId, userId),
        ),
      )
      .get() !== undefined
  );
}

function isGroupOf(tx: Transaction, organizationId: string, groupId: string): boolean {
  return (
    tx
      .select({ id: accessGroup.id })
      .from(accessGroup)
      .where(and(eq(accessGroup.id, groupId), eq(accessGroup.organizationId, organizationId)))
      .get() !== undefined
  );
}

/** The id of the organization's group named exactly `name`, or undefined. */
function groupNamed(tx: Transaction, organizationId: string, name: string): string | undefined {
  return tx
    .select({ id: accessGroup.id })
    .from(accessGroup)
    .where(and(eq(accessGroup.organizationId, organizationId), eq(accessGroup.name, name)))
    .get()?.id;
}

function memberIdsOf(reader: Reader, groupId: string): string[] {
  return reader
    .select({ userId: accessGroupMember.userId })
    .from(accessGroupMember)
    .where(eq(accessGroupMember.groupId, groupId))
    .orderBy(asc(accessGroupMember.userId))
    .all()
    .map(({ userId }) => userId);
}

function findGrant(
  reader: Reader,
  organizationId: string,
  grantId: string,
): AccessGrantRow | undefined {
  return reader
    .select()
    .from(accessGrant)
    .where(and(eq(accessGrant.id, grantId), eq(accessGrant.organizationId, organizationId)))
    .get();
}

/** @throws when the row just written cannot be read back. */
function grantRow(reader: Reader, organizationId: string, grantId: string): AccessGrantRow {
  const row = findGrant(reader, organizationId, grantId);
  if (row === undefined) throw new Error(`access grant ${grantId} vanished inside its write`);
  return row;
}

/** The `created_by` of a row `act` writes: the member's id, or null for an operator. */
function authorOf(act: AccessAct): string | null {
  return act.actor.kind === 'user' ? act.actor.userId : null;
}

function scopeColumns(
  organizationId: string,
  scope: GrantScope,
): { scopeKind: AccessObjectKind; scopeId: string } {
  switch (scope.kind) {
    case 'organization':
      return { scopeKind: 'organization', scopeId: organizationId };
    case 'project':
      return { scopeKind: 'project', scopeId: scope.projectId };
    case 'work_package':
      return { scopeKind: 'work_package', scopeId: scope.workPackageId };
  }
}

function subjectColumns(
  organizationId: string,
  subject: GrantSubject,
): { subjectKind: GrantSubjectKind; subjectId: string } {
  switch (subject.kind) {
    case 'user':
      return { subjectKind: 'user', subjectId: subject.userId };
    case 'group':
      return { subjectKind: 'group', subjectId: subject.groupId };
    case 'organization_members':
      return { subjectKind: 'organization_members', subjectId: organizationId };
    case 'machine_credential':
      return { subjectKind: 'machine_credential', subjectId: subject.credentialId };
  }
}

/**
 * A stored grant as the port answers it.
 *
 * @throws when a kind is outside its vocabulary or an organization-members
 * row names another organization (the CHECKs and triggers forbid both, so
 * either is corrupt trusted state).
 */
function recordOf(row: AccessGrantRow): AccessGrantRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    scope: scopeOf(row),
    subject: subjectOf(row),
    roleId: row.roleId,
    origin: row.origin,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
  };
}

function scopeOf(row: AccessGrantRow): GrantScope {
  switch (row.scopeKind) {
    case 'organization':
      return { kind: 'organization' };
    case 'project':
      return { kind: 'project', projectId: row.scopeId };
    case 'work_package':
      return { kind: 'work_package', workPackageId: row.scopeId };
    default:
      throw new Error(`access grant ${row.id} has an unknown scope kind`);
  }
}

function subjectOf(row: AccessGrantRow): GrantSubject {
  switch (row.subjectKind) {
    case 'user':
      return { kind: 'user', userId: row.subjectId };
    case 'group':
      return { kind: 'group', groupId: row.subjectId };
    case 'organization_members':
      if (row.subjectId !== row.organizationId)
        throw new Error(`access grant ${row.id} names another organization's members`);
      return { kind: 'organization_members' };
    case 'machine_credential':
      return { kind: 'machine_credential', credentialId: row.subjectId };
    default:
      throw new Error(`access grant ${row.id} has an unknown subject kind`);
  }
}
