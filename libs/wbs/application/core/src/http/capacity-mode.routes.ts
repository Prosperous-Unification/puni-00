import { readCapacityMode, switchCapacityMode } from '@wbs/contracts';

import type { OrganizationAccess } from '../ports/organization-access';
import type { CapacityModeRefusal, CapacityModeResource } from '../service/capacity-mode.resource';
import { bind } from './endpoint';
import { organizationRefusal } from './organization-refusal';

const REFUSED = {
  organization_required: { ok: false, status: 409, body: { error: 'organization_required' } },
  forbidden: { ok: false, status: 403, body: { error: 'forbidden' } },
  insufficient_scope: { ok: false, status: 403, body: { error: 'insufficient_scope' } },
  capacity_mode_unsupported: {
    ok: false,
    status: 409,
    body: { error: 'capacity_mode_unsupported' },
  },
} as const;

const refused = <R extends CapacityModeRefusal>(refusal: R): (typeof REFUSED)[R] =>
  REFUSED[refusal];

/**
 * The organization's capacity-mode routes. Organization access is resolved
 * before anything else; the resource owns the legacy, role and release rules.
 */
export function capacityModeRoutes(modes: CapacityModeResource, organizations: OrganizationAccess) {
  return [
    bind(readCapacityMode, async ({ principal }) => {
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved.refusal);
      const outcome = await modes.read(resolved.access, principal.delegation !== undefined);
      return outcome.ok
        ? {
            ok: true,
            status: 200,
            body: {
              sharedPeople: outcome.sharedPeople,
              sharingAvailable: outcome.sharingAvailable,
              canSwitch: outcome.canSwitch,
            },
          }
        : refused(outcome.refusal);
    }),
    bind(switchCapacityMode, async ({ body, principal }) => {
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved.refusal);
      const outcome = await modes.switch(
        principal.id,
        resolved.access,
        body.sharedPeople,
        principal.delegation !== undefined,
      );
      return outcome.ok
        ? {
            ok: true,
            status: 200,
            body: {
              sharedPeople: outcome.sharedPeople,
              sharingAvailable: outcome.sharingAvailable,
              canSwitch: outcome.canSwitch,
            },
          }
        : refused(outcome.refusal);
    }),
  ] as const;
}
