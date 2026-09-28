import type {
  OrganizationAccess,
  OrganizationAccessResolution,
  OrganizationPrincipal,
} from '@wbs/core';
import { ORGANIZATION_ROLES, type OrganizationRole } from '@wbs/domain';
import { and, eq } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { readOrganizationActivation } from './organization-activation';
import { organizationMembership } from './schema';

/**
 * The organization a user's session is bound to, or null when it is bound to
 * none. Task 2.4 binds the browser's active organization to the WBS session and
 * supplies the real source; until then production passes
 * {@link NO_BOUND_ORGANIZATION}.
 */
export type ActiveOrganizationOf = (userId: string) => Promise<string | null>;

/**
 * No session is bound to an organization yet. After activation every protected
 * project request is therefore a typed 403, which is the fail-closed answer
 * for a release that must not be activated before task 2.4 ships.
 */
export const NO_BOUND_ORGANIZATION: ActiveOrganizationOf = () => Promise.resolve(null);

/**
 * {@link OrganizationAccess} over the shared database.
 *
 * The activation marker is re-read on every call because blue and green share
 * SQLite and either may be running when the marker is committed. Only an
 * explicit `pre_activation` answers `legacy`; a broken marker throws and the
 * request fails as a server error. After activation the bound organization
 * must still list the user as a member **now**, so a removed member's live
 * token stops working on its next request. A verified delegation's
 * organization takes the place of the session's binding; before activation
 * it is ignored like every other organization claim.
 */
export class SqliteOrganizationAccess implements OrganizationAccess {
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly activeOrganizationOf: ActiveOrganizationOf,
  ) {}

  async resolve(principal: OrganizationPrincipal): Promise<OrganizationAccessResolution> {
    const userId = principal.id;
    // Proof: answering `legacy` without reading the marker made `scopes the same
    // running app once another connection activates isolation` in
    // `project-organization.controller.db.test.ts` still list both
    // organizations' projects after activation; watched 2026-09-27.
    if (readOrganizationActivation(this.db) === 'pre_activation') {
      // A delegation names one organization, which does not exist as an
      // authority before activation; it must never widen into deployment-wide
      // legacy access.
      // Proof: answering `legacy` for a delegation made `refuses a verified
      // delegation before activation` in `delegation.controller.db.test.ts`
      // list every organization's projects; watched 2026-09-28.
      if (principal.delegation !== undefined)
        return { ok: false, refusal: 'no_active_organization' };
      return { ok: true, access: { kind: 'legacy' } };
    }
    // A verified delegation (task 2.5) carries its organization; a session
    // takes the one it is bound to. Membership is rechecked below either way.
    // Proof: taking the session's binding instead of the delegation's made
    // `lists only the delegated organization's projects` in
    // `delegation.controller.db.test.ts` answer 403; watched 2026-09-28.
    const organizationId =
      principal.delegation === undefined
        ? await this.activeOrganizationOf(userId)
        : principal.delegation.organizationId;
    // Proof: answering `legacy` here instead made `refuses a session bound to no
    // organization before any lookup` in
    // `project-organization.controller.db.test.ts` answer 200 for the list;
    // watched 2026-09-27.
    if (organizationId === null) return { ok: false, refusal: 'no_active_organization' };
    // Proof: skipping this membership lookup (scoping to the bound organization
    // as a member) made `refuses a removed member on the next request` in
    // `project-organization.controller.db.test.ts` receive 200 instead of 403;
    // watched 2026-09-27.
    const membership = this.db
      .select({ role: organizationMembership.role })
      .from(organizationMembership)
      .where(
        and(
          eq(organizationMembership.organizationId, organizationId),
          eq(organizationMembership.userId, userId),
        ),
      )
      .get();
    if (membership === undefined) return { ok: false, refusal: 'not_a_member' };
    return {
      ok: true,
      access: {
        kind: 'scoped',
        scope: {
          organizationId,
          userId,
          role: validateStoredRole(membership.role, organizationId),
        },
      },
    };
  }
}

/**
 * The stored role, checked rather than trusted: the column's type is only what
 * the schema declares, and an unknown role reaching the policy would be read as
 * a writing one.
 *
 * Proof: returning the stored value unchecked made `fails as a server error on
 * a malformed membership role` in `project-organization.controller.db.test.ts`
 * answer 200 instead of 500; watched 2026-09-27.
 *
 * @throws when the stored role is not one of {@link ORGANIZATION_ROLES}.
 */
function validateStoredRole(role: string, organizationId: string): OrganizationRole {
  const known: readonly string[] = ORGANIZATION_ROLES;
  if (!known.includes(role)) {
    throw new Error(`membership in organization "${organizationId}" has a malformed role`);
  }
  // Narrowed by the membership test above, which is the boundary this is.
  return role as OrganizationRole;
}
