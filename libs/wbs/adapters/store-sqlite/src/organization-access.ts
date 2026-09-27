import type { OrganizationAccess, OrganizationAccessResolution } from '@wbs/core';
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
 * token stops working on its next request.
 */
export class SqliteOrganizationAccess implements OrganizationAccess {
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly activeOrganizationOf: ActiveOrganizationOf,
  ) {}

  async resolve(userId: string): Promise<OrganizationAccessResolution> {
    // Proof: answering `legacy` without reading the marker made `scopes the same
    // running app once another connection activates isolation` in
    // `project-organization.controller.db.test.ts` still list both
    // organizations' projects after activation; watched 2026-09-27.
    if (readOrganizationActivation(this.db) === 'pre_activation') {
      return { ok: true, access: { kind: 'legacy' } };
    }
    const organizationId = await this.activeOrganizationOf(userId);
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
      access: { kind: 'scoped', scope: { organizationId, userId, role: membership.role } },
    };
  }
}
