import { readOrganizationLimits } from '@wbs/contracts';

import type { OrganizationAccess } from '../ports/organization-access';
import type { OrganizationLimits } from '../ports/organization-limits';
import { retainSecurityPrincipal } from '../ports/security-principal';
import { bind, type HttpReply } from './endpoint';
import { organizationRefusal } from './organization-refusal';

/**
 * The read of the caller's active organization's limits with usage, for its
 * current organization.read grant holders (`organization-limits`). The organization
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
        // Proof: limits-route-principal-snapshot failed `retains the limits route principal before organization resolution: id` with the injected fault; restored GREEN.
        const actor = retainSecurityPrincipal(principal);
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        // Proof: with this refusal removed, `refuses before activation` in
        // organization-limits.controller.db.test.ts answered 500 instead of
        // 403; watched 2026-10-22.
        if (resolved.access.kind === 'legacy') return organizationRefusal('no_active_organization');
        const read = await limits.read(resolved.access.scope.organizationId, actor);
        if (read === 'inactive') return organizationRefusal('no_active_organization');
        if ('kind' in read)
          return {
            ok: false,
            status: 403,
            // Proof: limits-route-permission failed `names organization.read when a role-only super-admin requests limits` with the injected fault; restored GREEN.
            body: { error: 'forbidden', permission: read.permission },
          };
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
