import { readCapacityMode, switchCapacityMode } from '@wbs/contracts';
import type { Permission } from '@wbs/domain';

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

const refused = <R extends CapacityModeRefusal>(
  refusal: R,
  permission?: Permission,
): (typeof REFUSED)[R] => ({
  ...REFUSED[refusal],
  body: { ...REFUSED[refusal].body, ...(permission === undefined ? {} : { permission }) },
});

/**
 * The organization's capacity-mode routes. Organization access is resolved
 * before effects; caller authority and validated intent are retained before
 * its await. The resource owns current grants, identity and release rules.
 */
export function capacityModeRoutes(modes: CapacityModeResource, organizations: OrganizationAccess) {
  return [
    bind(readCapacityMode, async ({ principal }) => {
      const delegated = principal.delegation !== undefined;
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved);
      // Proof: mode-route-read-delegation: rereading a mutable delegation flag after resolution.
      // retains mode read route delegation before organization resolution
      // Named RED with this fault; restored GREEN (task-2.4b rank/mode receipt).
      const outcome = await modes.read(resolved.access, delegated);
      if ('authority' in outcome) return organizationRefusal(outcome.authority);
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
        : refused(outcome.refusal, outcome.permission);
    }),
    bind(switchCapacityMode, async ({ body, principal }) => {
      // Proof: mode-route-caller: retaining the mutable resolver caller.
      // retains mode switch route id before organization resolution
      // retains mode switch route authentication before organization resolution
      // retains mode switch route delegation before organization resolution
      // Named RED with this fault; restored GREEN (task-2.4b rank/mode receipt).
      // Proof: mode-route-auth-deep: shallow request copying retains nested verifier aliases.
      // retains mode switch route authentication before organization resolution
      // Named RED with this fault; restored GREEN (task-2.4b rank/mode receipt).
      const actor = structuredClone(principal);
      const sharedPeople = body.sharedPeople;
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved);
      const outcome = await modes.switch(
        actor,
        resolved.access,
        // Proof: mode-route-intent: rereading mutable mode intent after resolution.
        // retains rank/mode route sharedPeople before the bound resolver await
        // Named RED with this fault; restored GREEN (task-2.4b rank/mode receipt).
        sharedPeople,
        actor.delegation !== undefined,
      );
      if ('authority' in outcome) return organizationRefusal(outcome.authority);
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
        : refused(outcome.refusal, outcome.permission);
    }),
  ] as const;
}
