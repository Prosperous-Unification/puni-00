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
import { retainAccessAct } from '@wbs/core';
import { type AccessObjectKind, type GrantSubjectKind, roleFitsScope } from '@wbs/domain';
import { and, asc, eq, inArray, isNull, or, type SQL } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { appendGrantAudit, readAccessActorId, readAccessOperationOrigin } from './access-audit';
import { auditOnCreate, auditOnOperatorCreate, auditOnUpdate } from './audit';
import type { Gate } from './gate';
import { type ImmediateTransaction, writeImmediately } from './immediate-write';
import { appendOrganizationAudit } from './organization-audit-log';
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
import { LastSuperAdmin, requireSuperAdminIn } from './super-admin';

type Transaction = ImmediateTransaction;
type Reader = Pick<SQLiteBunDatabase, 'select'>;

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

  async grant(
    organizationId: string,
    draft: GrantDraft,
    act: AccessAct,
  ): Promise<{ readonly kind: 'granted'; readonly grant: AccessGrantRecord } | GrantRefusal> {
    // Proof: act-snapshot-grant: removing this boundary failed `retains the actual audit act before the queued access owner at grant`;
    // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
    act = retainAccessAct(act);
    // Proof: grant-draft-snapshot: removing this boundary failed `retains the detached queued access draft at grant`;
    // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
    draft = structuredClone(draft);
    assertGrantOrigin(draft, act);
    return await this.write((tx) => {
      const outcome = writeGrantIn(tx, organizationId, draft, act);
      if (typeof outcome === 'string') return outcome;
      // Proof: append-grant-access_granted: removing this boundary failed `audits an actual grant with its authenticated actor, addressed scope, subject and origin`;
      // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
      appendGrantAudit(tx, {
        grant: outcome.grant,
        action: 'access_granted',
        auditId: act.auditId,
        actorId: readAccessActorId(act.actor),
        at: act.at,
        origin: draft.origin,
      });
      return outcome;
    });
  }

  revoke(
    organizationId: string,
    grantId: string,
    act: AccessAct,
  ): Promise<
    | { readonly kind: 'revoked'; readonly grant: AccessGrantRecord }
    | 'not_found'
    | 'last_super_admin'
  > {
    // Proof: act-snapshot-revoke: removing this boundary failed `retains the actual audit act before the queued access owner at revoke`;
    // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
    act = retainAccessAct(act);
    return this.write((tx) => {
      const row = findGrant(tx, organizationId, grantId);
      if (row === undefined) return 'not_found';
      const grant = recordOf(row);
      tx.delete(accessGrant)
        .where(and(eq(accessGrant.id, grantId), eq(accessGrant.organizationId, organizationId)))
        .run();
      // Proof: cp14-access-revoke: removed/broken boundary failed `rolls back a nonlowering access removal without a direct built-in holder at revoke`; named assertion RED and restored GREEN (task-2.5 guard-faults).
      requireSuperAdminIn(tx, organizationId);
      // Proof: append-revoke-access_revoked: removing this boundary failed `audits revoke provenance from the current actor rather than the grant creator or stored origin`;
      // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
      // Proof: operator-revoke-audit: removing this boundary failed `revokes after a hand-over and prints the count left`;
      // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
      appendGrantAudit(tx, {
        grant,
        action: 'access_revoked',
        auditId: act.auditId,
        actorId: readAccessActorId(act.actor),
        at: act.at,
        origin: readAccessOperationOrigin(act.actor),
      });
      return { kind: 'revoked', grant } as const;
    }).catch((failure: unknown) => {
      /* Proof: aggregate-classification-grant-revoke: broken owner dependency propagates aggregate; distinct from native paired-failure control.
       * preserves an unexpected aggregate from the actual owner dependency at grant-revoke
       * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
      if (failure instanceof LastSuperAdmin) return 'last_super_admin' as const;
      throw failure;
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
    // Proof: act-snapshot-group-create: removing this boundary failed `retains the actual audit act before the queued access owner at group-create`;
    // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
    act = retainAccessAct(act);
    // Proof: group-draft-snapshot: removing this boundary failed `retains the detached queued access draft at group-create`;
    // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
    group = structuredClone(group);
    return this.write((tx) => {
      // Proof: dropping this check made creates/renames/taken-name return a UNIQUE failure in access-grant-store.db.test.ts (2026-11-08).
      if (groupNamed(tx, organizationId, group.name) !== undefined) return 'name_taken';
      const by = authorOf(act);
      tx.insert(accessGroup)
        .values({
          ...group,
          organizationId,
          ...(by === null ? auditOnOperatorCreate(act.at) : auditOnCreate({ at: act.at, by })),
        })
        .run();
      // Proof: append-createGroup-access_group_created: removing this boundary failed `audits group creation on its actual owning connection`;
      // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
      appendOrganizationAudit(tx, {
        id: act.auditId,
        organizationId,
        actorId: readAccessActorId(act.actor),
        action: 'access_group_created',
        subjectKind: 'access_group',
        subjectId: group.id,
        detail: { name: group.name, origin: readAccessOperationOrigin(act.actor) },
        at: act.at,
      });
      return {
        kind: 'created',
        group: { ...group, organizationId, memberIds: [], createdAt: act.at },
      } as const;
    });
  }

  renameGroup(
    organizationId: string,
    groupId: string,
    name: string,
    act: AccessAct,
  ): Promise<'renamed' | 'unknown_group' | 'name_taken'> {
    // Proof: act-snapshot-group-rename: removing this boundary failed `retains the actual audit act before the queued access owner at group-rename`;
    // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
    act = retainAccessAct(act);
    return this.write((tx) => {
      const group = readGroup(tx, organizationId, groupId);
      if (group === undefined) return 'unknown_group';
      const holder = groupNamed(tx, organizationId, name);
      if (holder !== undefined && holder !== groupId) return 'name_taken';
      tx.update(accessGroup)
        .set({ name, ...auditOnUpdate({ at: act.at }) })
        .where(and(eq(accessGroup.id, groupId), eq(accessGroup.organizationId, organizationId)))
        .run();
      // Proof: append-renameGroup-access_group_renamed: removing this boundary failed `audits a successful group rename even when the accepted name is Ops`;
      // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
      appendOrganizationAudit(tx, {
        id: act.auditId,
        organizationId,
        actorId: readAccessActorId(act.actor),
        action: 'access_group_renamed',
        subjectKind: 'access_group',
        subjectId: groupId,
        detail: {
          oldName: group.name,
          newName: name,
          origin: readAccessOperationOrigin(act.actor),
        },
        at: act.at,
      });
      return 'renamed' as const;
    });
  }

  deleteGroup(
    organizationId: string,
    groupId: string,
    act: AccessAct,
  ): Promise<
    | { readonly kind: 'deleted'; readonly grantsDeleted: number; readonly membersRemoved: number }
    | 'unknown_group'
    | 'last_super_admin'
  > {
    // Proof: act-snapshot-group-delete: removing this boundary failed `retains the actual audit act before the queued access owner at group-delete`;
    // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
    act = retainAccessAct(act);
    return this.write((tx) => {
      const removed = deleteGroupAccessIn(tx, organizationId, groupId);
      if (removed === null) return 'unknown_group';
      // Proof: cp14-group-delete: removed/broken boundary failed `rolls back a nonlowering access removal without a direct built-in holder at group-delete`; named assertion RED and restored GREEN (task-2.5 guard-faults).
      requireSuperAdminIn(tx, organizationId);
      for (const grant of removed.grants)
        // Proof: append-deleteGroup-access_revoked: removing this boundary failed `audits group deletion as exactly N grant revokes plus M member removals plus one group deletion`;
        // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
        appendGrantAudit(tx, {
          grant,
          action: 'access_revoked',
          auditId: crypto.randomUUID(),
          actorId: readAccessActorId(act.actor),
          at: act.at,
          origin: 'cascade',
        });
      for (const userId of removed.memberIds)
        // Proof: append-deleteGroup-access_group_member_removed: removing this boundary failed `audits group deletion as exactly N grant revokes plus M member removals plus one group deletion`;
        // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
        appendOrganizationAudit(tx, {
          id: crypto.randomUUID(),
          organizationId,
          actorId: readAccessActorId(act.actor),
          action: 'access_group_member_removed',
          subjectKind: 'access_group',
          subjectId: groupId,
          detail: { name: removed.name, userId, origin: 'cascade' },
          at: act.at,
        });
      // Proof: append-deleteGroup-access_group_deleted: removing this boundary failed `audits group deletion as exactly N grant revokes plus M member removals plus one group deletion`;
      // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
      appendOrganizationAudit(tx, {
        id: act.auditId,
        organizationId,
        actorId: readAccessActorId(act.actor),
        action: 'access_group_deleted',
        subjectKind: 'access_group',
        subjectId: groupId,
        detail: {
          name: removed.name,
          removedGrantCount: removed.grants.length,
          removedMemberCount: removed.memberIds.length,
          origin: readAccessOperationOrigin(act.actor),
        },
        at: act.at,
      });
      return {
        kind: 'deleted',
        grantsDeleted: removed.grants.length,
        membersRemoved: removed.memberIds.length,
      } as const;
    }).catch((failure: unknown) => {
      /* Proof: aggregate-classification-group-delete: broken owner dependency propagates aggregate; distinct from native paired-failure control.
       * preserves an unexpected aggregate from the actual owner dependency at group-delete
       * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
      if (failure instanceof LastSuperAdmin) return 'last_super_admin' as const;
      throw failure;
    });
  }

  addGroupMember(
    organizationId: string,
    groupId: string,
    userId: string,
    act: AccessAct,
  ): Promise<'added' | 'unknown_group' | 'not_a_member' | 'already_in_group'> {
    // Proof: act-snapshot-member-add: removing this boundary failed `retains the actual audit act before the queued access owner at member-add`;
    // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
    act = retainAccessAct(act);
    return this.write((tx) => {
      const group = readGroup(tx, organizationId, groupId);
      if (group === undefined) return 'unknown_group';
      // Proof: bypassing membership/group-duplicate checks made adds-only-current-members-once throw restrictive keys in access-grant-store.db.test.ts (2026-11-08).
      if (!isMemberOf(tx, organizationId, userId)) return 'not_a_member';
      if (isInGroup(tx, organizationId, groupId, userId)) return 'already_in_group';
      const by = authorOf(act);
      tx.insert(accessGroupMember)
        .values({
          organizationId,
          groupId,
          userId,
          ...(by === null ? auditOnOperatorCreate(act.at) : auditOnCreate({ at: act.at, by })),
        })
        .run();
      // Proof: append-addGroupMember-access_group_member_added: removing this boundary failed `audits actual group-member addition and removal without duplicating refused acts`;
      // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
      appendOrganizationAudit(tx, {
        id: act.auditId,
        organizationId,
        actorId: readAccessActorId(act.actor),
        action: 'access_group_member_added',
        subjectKind: 'access_group',
        subjectId: groupId,
        detail: { name: group.name, userId, origin: readAccessOperationOrigin(act.actor) },
        at: act.at,
      });
      return 'added' as const;
    });
  }

  removeGroupMember(
    organizationId: string,
    groupId: string,
    userId: string,
    act: AccessAct,
  ): Promise<'removed' | 'unknown_group' | 'not_in_group' | 'last_super_admin'> {
    // Proof: act-snapshot-member-remove: removing this boundary failed `retains the actual audit act before the queued access owner at member-remove`;
    // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
    act = retainAccessAct(act);
    return this.write((tx) => {
      const group = readGroup(tx, organizationId, groupId);
      if (group === undefined) return 'unknown_group';
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
      if (removed === 0) return 'not_in_group';
      // Proof: cp14-group-member-remove: removed/broken boundary failed `rolls back a nonlowering access removal without a direct built-in holder at group-member-remove`; named assertion RED and restored GREEN (task-2.5 guard-faults).
      requireSuperAdminIn(tx, organizationId);
      // Proof: append-removeGroupMember-access_group_member_removed: removing this boundary failed `audits actual group-member addition and removal without duplicating refused acts`;
      // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
      appendOrganizationAudit(tx, {
        id: act.auditId,
        organizationId,
        actorId: readAccessActorId(act.actor),
        action: 'access_group_member_removed',
        subjectKind: 'access_group',
        subjectId: groupId,
        detail: { name: group.name, userId, origin: readAccessOperationOrigin(act.actor) },
        at: act.at,
      });
      return 'removed' as const;
    }).catch((failure: unknown) => {
      /* Proof: aggregate-classification-group-member-remove: broken owner dependency propagates aggregate; distinct from native paired-failure control.
       * preserves an unexpected aggregate from the actual owner dependency at group-member-remove
       * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
      if (failure instanceof LastSuperAdmin) return 'last_super_admin' as const;
      throw failure;
    });
  }

  private write<T>(work: (tx: Transaction) => T): Promise<T> {
    // Proof: access-atomic-owner: removing this boundary failed `rolls every group cascade mutation and earlier audit row back when a later member audit fails`;
    // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
    return writeImmediately(this.db, this.gate, work);
  }
}

/** Checks the actual retained actor/origin pair before any domain read. */
function assertGrantOrigin(draft: GrantDraft, act: AccessAct): void {
  // Proof: bypassing this check stored a user grant as operator in the origin/actor refusal of access-grant-store.db.test.ts (2026-11-08).
  if ((draft.origin === 'operator') !== (act.actor.kind === 'operator'))
    throw new Error(act.actor.kind + ' actors may not write a grant of origin ' + draft.origin);
}

/**
 * Writes one grant in the caller's already owned transaction and returns actual-row evidence.
 * Owns no gate, transaction or audit; the owner must append its access_granted row before commit.
 * Caller retains draft/act before any queued await. Scope/subject/role guards run on this connection.
 * Only select/insert are borrowed: an async owner may supply its already-owned plain
 * connection, and this body never needs native transaction or rollback methods.
 * The actual plain-connection composition test rejects a native-only parameter at compile
 * time (TS2345) and proves rollback/no nested owner at runtime.
 */
export function writeGrantIn(
  tx: Pick<SQLiteBunDatabase, 'select' | 'insert'>,
  organizationId: string,
  draft: GrantDraft,
  act: AccessAct,
): { readonly kind: 'granted'; readonly grant: AccessGrantRecord } | GrantRefusal {
  // Proof: borrowed-grant-no-owner: injecting a native transaction wrapper failed `borrows grant and membership writes from an already-owned plain connection without audit or nested owners`;
  // observed native owner count 1 instead of 0, then restored GREEN (task-4.1 guard-faults receipt, 2026-11-10).
  assertGrantOrigin(draft, act);
  const refusal = grantRefusal(tx, organizationId, draft);
  if (refusal !== null) return refusal;
  const { scopeKind, scopeId } = scopeColumns(organizationId, draft.scope);
  const { subjectKind, subjectId } = subjectColumns(organizationId, draft.subject);
  const by = authorOf(act);
  // access_grant has no updated_at; Drizzle writes only the declared auditOnCreate columns.
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
      ...(by === null ? auditOnOperatorCreate(act.at) : auditOnCreate({ at: act.at, by })),
    })
    .run();
  return { kind: 'granted', grant: recordOf(grantRow(tx, organizationId, draft.id)) };
}

/** Deletes one addressed group's authority, returning actual removed rows; the owner audits N+M+1 events. */
function deleteGroupAccessIn(
  tx: Pick<SQLiteBunDatabase, 'select' | 'delete'>,
  organizationId: string,
  groupId: string,
): {
  readonly name: string;
  readonly grants: readonly AccessGrantRecord[];
  readonly memberIds: readonly string[];
} | null {
  const group = readGroup(tx, organizationId, groupId);
  if (group === undefined) return null;
  const grants = tx
    .delete(accessGrant)
    .where(
      and(
        eq(accessGrant.organizationId, organizationId),
        eq(accessGrant.subjectKind, 'group'),
        eq(accessGrant.subjectId, groupId),
      ),
    )
    .returning()
    .all()
    .map(recordOf);
  const memberIds = tx
    .delete(accessGroupMember)
    .where(
      and(
        eq(accessGroupMember.organizationId, organizationId),
        eq(accessGroupMember.groupId, groupId),
      ),
    )
    .returning({ userId: accessGroupMember.userId })
    .all()
    .map(({ userId }) => userId);
  tx.delete(accessGroup)
    .where(and(eq(accessGroup.id, groupId), eq(accessGroup.organizationId, organizationId)))
    .run();
  return { name: group.name, grants, memberIds };
}

/** The addressed group's local name, or undefined for absent/foreign. */
function readGroup(
  tx: Reader,
  organizationId: string,
  groupId: string,
): { readonly name: string } | undefined {
  return tx
    .select({ name: accessGroup.name })
    .from(accessGroup)
    .where(and(eq(accessGroup.id, groupId), eq(accessGroup.organizationId, organizationId)))
    .get();
}

/**
 * Deletes every grant naming one of `credentialIds` as its subject
 * (`wbs-permissions` P17): a revoked or removed credential holds nothing, so
 * no later reuse of its row can read a grant back. Runs inside the caller's
 * revocation or removal transaction. Returns actual deleted grant evidence; owns no
 * transaction/audit. The owner appends one access_revoked per row before commit.
 */
export function deleteGrantsOfCredentials(
  tx: Pick<SQLiteBunDatabase, 'delete'>,
  credentialIds: readonly string[],
): readonly AccessGrantRecord[] {
  if (credentialIds.length === 0) return [];
  return tx
    .delete(accessGrant)
    .where(
      and(
        eq(accessGrant.subjectKind, 'machine_credential'),
        inArray(accessGrant.subjectId, [...credentialIds]),
      ),
    )
    .returning()
    .all()
    .map(recordOf);
}

/**
 * Copies every grant naming credential `fromId` to credential `toId`
 * (`wbs-permissions` P17 as amended 2026-11-08): an agent pool's re-key is a
 * rotation, so the new key holds what the old one held. Same organization,
 * scope, role and origin; the creator is carried, the instant is `at`. Runs
 * inside the re-key's transaction before the old key's grants are deleted.
 * A grant `toId` already holds is skipped, so two old keys of one person
 * holding the same grant copy it once. Returns only actually inserted grant evidence;
 * skipped duplicates produce no evidence/audit. The successor credential is deliberately
 * created later in this same owner, so ordinary live-subject grant admission cannot run here.
 */
export function copyGrantsOfCredential(
  tx: Pick<SQLiteBunDatabase, 'select' | 'insert'>,
  fromId: string,
  toId: string,
  at: number,
): readonly AccessGrantRecord[] {
  const held = tx
    .select()
    .from(accessGrant)
    .where(
      and(eq(accessGrant.subjectKind, 'machine_credential'), eq(accessGrant.subjectId, fromId)),
    )
    .all();
  const copied: AccessGrantRecord[] = [];
  for (const row of held)
    copied.push(
      ...tx
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
          ...(row.createdBy === null
            ? auditOnOperatorCreate(at)
            : auditOnCreate({ at, by: row.createdBy })),
        })
        // Proof: pool-copy-dedup: removing this boundary failed `audits only actually inserted pool grant copies when old keys overlap`;
        // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
        .onConflictDoNothing()
        .returning()
        .all()
        .map(recordOf),
    );
  return copied;
}

export { directSuperAdminCount } from './super-admin';

/**
 * Why the operator CLI (`wbs-permissions` P21, task 1.5) may not name
 * `userId` at `organizationId`, read before its write, or null:
 * `unknown_organization` when no organization has the id, `machine_credential`
 * when `userId` is a machine credential's id (any organization's). Read
 * outside the write: organizations are never deleted, and a credential row
 * outlives revocation. Nothing stops a `users.id` from equalling a
 * credential id (both are free text keys); such a user is refused
 * `machine_credential`, never granted. Membership is the write's own check
 * (`not_a_member`).
 *
 * Proof: 2026-11-08, with the `unknown_organization` return removed, `refuse
 * an unknown organization, writing nothing` in `access-grant-cli.db.test.ts`
 * failed (revoke answered `not_granted`), and with the `machine_credential`
 * return removed, `refuses a machine credential's id, writing nothing`
 * failed (`not_a_member`). Each return removed also failed `tells the
 * operator CLI an unknown organization and a credential’s id apart from a
 * member` in `access-grant-store.db.test.ts` (18 pass, 1 fail).
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
function grantRefusal(tx: Reader, organizationId: string, draft: GrantDraft): GrantRefusal | null {
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
function isScopeOf(tx: Reader, organizationId: string, scope: GrantScope): boolean {
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
  tx: Reader,
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

function isMemberOf(tx: Reader, organizationId: string, userId: string): boolean {
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

function isInGroup(tx: Reader, organizationId: string, groupId: string, userId: string): boolean {
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

function isGroupOf(tx: Reader, organizationId: string, groupId: string): boolean {
  return (
    tx
      .select({ id: accessGroup.id })
      .from(accessGroup)
      .where(and(eq(accessGroup.id, groupId), eq(accessGroup.organizationId, organizationId)))
      .get() !== undefined
  );
}

/** The id of the organization's group named exactly `name`, or undefined. */
function groupNamed(tx: Reader, organizationId: string, name: string): string | undefined {
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
