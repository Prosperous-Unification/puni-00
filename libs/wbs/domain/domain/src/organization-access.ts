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
