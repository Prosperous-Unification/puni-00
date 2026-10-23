import { readOrganizationLimits } from '@wbs/contracts';

import type { OrganizationAccess } from '../ports/organization-access';
import type { OrganizationLimits } from '../ports/organization-limits';
import { bind, type HttpReply } from './endpoint';
import { organizationRefusal } from './organization-refusal';

/**
 * The read of the caller's active organization's limits with usage, for its
 * current admins and super-admins (`organization-limits`). The organization
 * comes only from the resolved session; a delegation may not read it.
 */
export function organizationLimitsRoutes(
  organizations: OrganizationAccess,
  limits: OrganizationLimits,
) {
  return [
    bind(
      readOrganizationLimits,
      async ({ principal }): Promise<HttpReply<typeof readOrganizationLimits>> => {
        // Proof: with this guard removed, `refuses a delegation even of a
        // super-admin` in organization-limits.controller.db.test.ts answered
        // 200 with the usage (4 pass, 1 fail); watched 2026-10-22.
        if (principal.delegation !== undefined)
          return { ok: false, status: 403, body: { error: 'insufficient_scope' } };
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        // Proof: with this refusal removed, `refuses before activation` in
        // organization-limits.controller.db.test.ts answered 500 instead of
        // 403; watched 2026-10-22.
        if (resolved.access.kind === 'legacy') return organizationRefusal('no_active_organization');
        const read = await limits.read(resolved.access.scope.organizationId, principal.id);
        if (read === 'inactive') return organizationRefusal('no_active_organization');
        if (read === 'forbidden') return { ok: false, status: 403, body: { error: 'forbidden' } };
        return {
          ok: true,
          status: 200,
          body: {
            source: read.source,
            limits: read.limits,
            usage: { ...read.usage, capacityUnits: [...read.usage.capacityUnits] },
          },
        };
      },
    ),
  ] as const;
}
