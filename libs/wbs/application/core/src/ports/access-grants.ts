import type { GrantOrigin } from '@wbs/domain';

/**
 * Where a grant applies (`wbs-permissions` P1, P8). An organization scope is
 * the grant's own organization. A `project` scope names the project entity of
 * `wbs-work-packages` slice 2, which does not exist yet: until it does the
 * store refuses every project scope as `not_found`, because today's `project`
 * row is the work package and its id is a `kind: 'work_package'` scope.
 */
export type GrantScope =
  | { readonly kind: 'organization' }
  | { readonly kind: 'project'; readonly projectId: string }
  | { readonly kind: 'work_package'; readonly workPackageId: string };

/**
 * Who a grant names (`wbs-permissions` E7, P17). The organization-members
 * subject is every current member of the grant's own organization, so it
 * carries no id: the store writes the organization's id as `subject_id`.
 */
export type GrantSubject =
  | { readonly kind: 'user'; readonly userId: string }
  | { readonly kind: 'group'; readonly groupId: string }
  | { readonly kind: 'organization_members' }
  | { readonly kind: 'machine_credential'; readonly credentialId: string };

/**
 * Who writes an access change: a member, whose id becomes the row's
 * `created_by`, or a host operator by CLI (`wbs-permissions` P21), who is no
 * WBS user, so the row's `created_by` stays empty and `login` is what the
 * audit row will name as `operator:<login>` once task 4.1 admits it.
 */
export type AccessActor =
  | { readonly kind: 'user'; readonly userId: string }
  | { readonly kind: 'operator'; readonly login: string };

/** One access change's author and instant, built by the caller, which holds the clock. */
export interface AccessAct {
  readonly actor: AccessActor;
  readonly at: number;
}

/**
 * A grant to write: its id minted by the caller, its role a built-in id or a
 * custom role of the organization. `backfill` is the migration's alone;
 * `operator` is the origin of exactly the grants an `operator` actor writes
 * (`wbs-permissions` P21, task 1.5).
 */
export interface GrantDraft {
  readonly id: string;
  readonly scope: GrantScope;
  readonly subject: GrantSubject;
  readonly roleId: string;
  readonly origin: Exclude<GrantOrigin, 'backfill'>;
}

/** One stored grant. `createdBy` is null for backfilled and operator-written rows. */
export interface AccessGrantRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly scope: GrantScope;
  readonly subject: GrantSubject;
  readonly roleId: string;
  readonly origin: GrantOrigin;
  readonly createdAt: number;
  readonly createdBy: string | null;
}

/**
 * Why a grant was not written, each decided inside the write's transaction:
 * - `unknown_role`: no built-in role and no custom role of this organization has the id.
 * - `role_scope_mismatch`: the role's kind is broader than the scope's
 *   (`roleFitsScope` in `@wbs/domain`), as `org-admin` at a work package.
 * - `not_found`: the scope is absent or another organization's (a work
 *   package through `project_organization`), or a project scope (no project
 *   entity exists yet).
 * - `not_a_member`: a `user` subject holds no membership of the organization.
 * - `unknown_group`: a `group` subject is no access group of the organization.
 * - `unknown_credential`: a `machine_credential` subject is revoked, absent or
 *   another organization's (P17).
 * - `already_granted`: the same scope, subject and role are granted already.
 */
export type GrantRefusal =
  | 'unknown_role'
  | 'role_scope_mismatch'
  | 'not_found'
  | 'not_a_member'
  | 'unknown_group'
  | 'unknown_credential'
  | 'already_granted';

/** Narrows a {@link AccessGrants.list} to one scope, one subject, or both. */
export interface GrantFilter {
  readonly scope?: GrantScope;
  readonly subject?: GrantSubject;
}

/** One access group with its members' user ids, ordered by id. */
export interface AccessGroupRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly memberIds: readonly string[];
  readonly createdAt: number;
}

/**
 * The grant store (`wbs-permissions` task 1.4, "Tables", P11, P17): grants,
 * access groups and their members of one organization. Every write is one
 * immediate transaction that reads what it checks, so two racing writes are
 * decided against the state each commits on. Who may write is the caller's:
 * P11's permission and escalation rule are the routes' (task 4.2), and the
 * operator CLI (task 1.5) calls with an `operator` actor. No audit row is
 * written yet: the audit table admits no `access_*` action before task 4.1.
 *
 * @throws when trusted state is malformed (a stored kind outside its
 * vocabulary), and on every store failure.
 */
export interface AccessGrants {
  /**
   * Writes `draft` in `organizationId`, or names the first rule it breaks.
   *
   * @throws before reading anything when `draft.origin` and `act.actor` do
   * not pair: an `operator` actor writes origin `operator`, a `user` actor
   * any other origin (a caller's mistake, never a request's).
   */
  grant(
    organizationId: string,
    draft: GrantDraft,
    act: AccessAct,
  ): Promise<{ readonly kind: 'granted'; readonly grant: AccessGrantRecord } | GrantRefusal>;
  /**
   * Deletes grant `grantId` of `organizationId`. `not_found` for an absent or
   * another organization's grant. `last_super_admin` when it is the last
   * direct `user` grant of the built-in `org-super-admin` at organization
   * scope held by a current member (CP14), and nothing is deleted.
   */
  revoke(
    organizationId: string,
    grantId: string,
  ): Promise<
    | { readonly kind: 'revoked'; readonly grant: AccessGrantRecord }
    | 'not_found'
    | 'last_super_admin'
  >;
  /** The organization's grants matching `filter`, oldest first, then by id. */
  list(organizationId: string, filter: GrantFilter): Promise<readonly AccessGrantRecord[]>;
  /** The organization's access groups, ordered by name. */
  listGroups(organizationId: string): Promise<readonly AccessGroupRecord[]>;
  /** Creates an empty group. `name_taken` when a group of the organization has the name. */
  createGroup(
    organizationId: string,
    group: { readonly id: string; readonly name: string },
    act: AccessAct,
  ): Promise<{ readonly kind: 'created'; readonly group: AccessGroupRecord } | 'name_taken'>;
  /** Renames a group; renaming to its own name is accepted and changes nothing else. */
  renameGroup(
    organizationId: string,
    groupId: string,
    name: string,
    act: AccessAct,
  ): Promise<'renamed' | 'unknown_group' | 'name_taken'>;
  /** Deletes a group with every grant naming it and every member row, in one transaction. */
  deleteGroup(
    organizationId: string,
    groupId: string,
  ): Promise<
    | { readonly kind: 'deleted'; readonly grantsDeleted: number; readonly membersRemoved: number }
    | 'unknown_group'
  >;
  /**
   * Adds a current member of the organization to a group: `not_a_member` for
   * anyone else, `already_in_group` when the row exists.
   */
  addGroupMember(
    organizationId: string,
    groupId: string,
    userId: string,
    act: AccessAct,
  ): Promise<'added' | 'unknown_group' | 'not_a_member' | 'already_in_group'>;
  /** Removes a user from a group: `not_in_group` when they were not in it. */
  removeGroupMember(
    organizationId: string,
    groupId: string,
    userId: string,
  ): Promise<'removed' | 'unknown_group' | 'not_in_group'>;
}
