import { canEditProject, type ProjectOwnership } from './project-ownership';
import type { OrganizationRole } from './stored-vocabularies';

/**
 * The organization a request acts in, the acting user, and that user's current
 * role there. Only a server-side resolution of trusted session state and current
 * membership produces one; a caller-supplied organization id or role never does.
 */
export interface OrganizationScope {
  readonly organizationId: string;
  readonly userId: string;
  readonly role: OrganizationRole;
}

/**
 * Whether `role` may create and edit ordinary resources: every role but viewer,
 * per the role matrix in `organization-ownership-and-access/specs/organization-access`.
 *
 * Proof: answering `true` for every role failed `refuses a viewer every project
 * write and lets the viewer read and open` in
 * `project-organization.controller.db.test.ts`; watched 2026-09-27.
 */
export function canWriteInOrganization(role: OrganizationRole): boolean {
  return role !== 'viewer';
}

/**
 * Whether the scoped user may write to a project of that organization: a writing
 * role, and for a restricted project its creator.
 *
 * A super-admin's recovery override of a restricted project is deliberately
 * absent: it must be audited in the same transaction, and task 3.7 owns that
 * audit. Until then a non-creator super-admin is refused like any other role,
 * which fails closed.
 *
 * Proof: dropping the creator rule made `lets only the creator edit a restricted
 * project, super-admin included` in `project-organization.controller.db.test.ts`
 * answer the super-admin's PATCH with the renamed project instead of 403;
 * watched 2026-09-27.
 */
export function canEditProjectInOrganization(
  project: ProjectOwnership,
  scope: OrganizationScope,
): boolean {
  return canWriteInOrganization(scope.role) && canEditProject(project, scope.userId);
}

/** The roles an admin administers; every other role is a super-admin's alone. */
const ORDINARY_ROLES: readonly OrganizationRole[] = ['member', 'viewer'];

/**
 * Whether `actor` may change a member's role from `current` to `requested`,
 * or remove them when `requested` is null, per the role matrix in
 * `organization-ownership-and-access/specs/organization-access`: an admin
 * moves viewers and members between those two roles or removes them; only a
 * super-admin grants, revokes or removes an admin or super-admin role. Never
 * leaving the organization without a super-admin is the store's check, made
 * in the same transaction as the write.
 *
 * Proof: letting an admin change any role made `refuses an admin promoting
 * a member to admin, or changing or removing an admin` in
 * `membership-organization.controller.db.test.ts` answer 200 with the
 * promoted admin; watched 2026-09-27.
 */
export function mayAdministerMembership(
  actor: OrganizationRole,
  current: OrganizationRole,
  requested: OrganizationRole | null,
): boolean {
  if (actor === 'super_admin') return true;
  if (actor !== 'admin') return false;
  return (
    ORDINARY_ROLES.includes(current) && (requested === null || ORDINARY_ROLES.includes(requested))
  );
}

/**
 * Whether `actor` may invite someone into `role`: an admin invites viewers and
 * members, a super-admin also admins, and no invitation grants super-admin
 * (`organization-onboarding` spec, "Invitations are bound and single use";
 * `organization_invitation.role` refuses it too). Issuing, revoking and
 * accepting an invitation are onboarding's (task 4.4); this is the authority
 * they check.
 *
 * Proof: letting an admin invite any role made `lets an admin invite viewers
 * and members, a super-admin also admins, and nobody super-admins` fail, and
 * so did dropping the super-admin refusal; watched 2026-09-27.
 */
export function mayInvite(actor: OrganizationRole, role: OrganizationRole): boolean {
  if (role === 'super_admin') return false;
  if (actor === 'super_admin') return true;
  return actor === 'admin' && ORDINARY_ROLES.includes(role);
}

/**
 * How the scoped user's write to a project is authorized: `ordinary` under
 * the role and restricted-creator rules, `recovery` for a super-admin's
 * write to a restricted project someone else created, which is permitted
 * only as an audited act in the write's own transaction, and `refused`
 * otherwise. Any restricted project qualifies, whether or not its creator is
 * still a member; the creator stays recorded.
 *
 * Proof: answering `ordinary` for the super-admin case made `calls a
 * super-admin's edit of someone else's restricted project a recovery` in
 * `organization-access.test.ts` fail; watched 2026-09-27.
 */
export function classifyProjectEdit(
  project: ProjectOwnership,
  scope: OrganizationScope,
): 'ordinary' | 'recovery' | 'refused' {
  if (canEditProjectInOrganization(project, scope)) return 'ordinary';
  if (scope.role === 'super_admin' && project.restricted) return 'recovery';
  return 'refused';
}
