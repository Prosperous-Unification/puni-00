import type { AuthenticatedUser } from '@wbs/contracts';
import {
  canEditProject,
  canEditProjectInOrganization,
  type OrganizationScope,
  type ProjectOwnership,
} from '@wbs/domain';

import type { Project, ProjectStore } from './project-store';

/**
 * How a protected request may reach organization-owned resources.
 *
 * `legacy` exists only while the durable activation marker says
 * `pre_activation`: every authenticated account keeps the deployment-wide
 * access it had before organizations. `scoped` is the only answer after
 * activation. There is deliberately no optional scope whose absence means
 * legacy: a caller that forgot to resolve access cannot compile.
 */
export type ResourceAccess =
  { readonly kind: 'legacy' } | { readonly kind: 'scoped'; readonly scope: OrganizationScope };

/**
 * Why an authenticated request may not act in any organization. Both answer a
 * typed 403: the credential is valid, the organization authority is not.
 *
 * - `no_active_organization`: the session carries no bound organization.
 * - `not_a_member`: the bound organization no longer lists the user, for
 *   example after removal while a token was still live.
 */
export type OrganizationAccessRefusal = 'no_active_organization' | 'not_a_member';

export type OrganizationAccessResolution =
  | { readonly ok: true; readonly access: ResourceAccess }
  | { readonly ok: false; readonly refusal: OrganizationAccessRefusal };

/**
 * Resolves one authenticated user's access for one request.
 *
 * Implementations re-read the activation marker on every call: blue and green
 * share SQLite, so another process can activate isolation while this one runs.
 *
 * @throws when trusted state (the marker, membership) is absent, unreadable or
 * malformed. That is a server fault and never a reason to answer `legacy`.
 */
export interface OrganizationAccess {
  /**
   * The access `principal` has for this request. After activation a verified
   * delegation's organization is the one checked; otherwise the
   * session's bound organization. Current membership is rechecked either way.
   */
  resolve(principal: OrganizationPrincipal): Promise<OrganizationAccessResolution>;
}

/** What {@link OrganizationAccess.resolve} reads of a principal. */
export type OrganizationPrincipal = Pick<
  AuthenticatedUser,
  'id' | 'delegation' | 'organizationBinding'
>;

/** The access every unscoped method uses: deployment-wide, as before organizations. */
export const LEGACY_ACCESS: ResourceAccess = { kind: 'legacy' };

/**
 * Finds a project through the caller's access: under scoped access a foreign
 * project is null exactly like an absent one, so every caller answers one 404.
 */
export function findProjectWithin(
  projects: Pick<ProjectStore, 'findById' | 'findInOrganization'>,
  id: string,
  access: ResourceAccess,
): Promise<Project | null> {
  return access.kind === 'scoped'
    ? projects.findInOrganization(id, access.scope.organizationId)
    : projects.findById(id);
}

/**
 * Whether the caller may write `project`: the organization role and the
 * restricted-creator rule under scoped access, the creator rule alone under
 * legacy access.
 *
 * Proof: answering the legacy rule under scoped access failed `refuses a
 * viewer every step and marker write and lets the viewer list markers` in
 * `step-marker-organization.controller.db.test.ts`; watched 2026-09-27.
 */
export function mayEditProjectWithin(
  project: ProjectOwnership,
  actorId: string,
  access: ResourceAccess,
): boolean {
  return access.kind === 'scoped'
    ? canEditProjectInOrganization(project, access.scope)
    : canEditProject(project, actorId);
}
