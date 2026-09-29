import { changeSharedPeople, readSharedPeople } from '@wbs/contracts';

import type { OrganizationAccess } from '../ports/organization-access';
import type { SharedPeopleRefusal, SharedPeopleResource } from '../service/shared-people.resource';
import { bind } from './endpoint';
import { organizationRefusal } from './organization-refusal';

const REFUSED = {
  organization_required: { ok: false, status: 409, body: { error: 'organization_required' } },
  forbidden: { ok: false, status: 403, body: { error: 'forbidden' } },
} as const;

const refused = <R extends SharedPeopleRefusal>(refusal: R): (typeof REFUSED)[R] =>
  REFUSED[refusal];

/**
 * The organization's capacity mode routes. Organization access is resolved
 * before anything else; the resource owns the legacy and role rules.
 */
export function sharedPeopleRoutes(
  sharing: SharedPeopleResource,
  organizations: OrganizationAccess,
) {
  return [
    bind(readSharedPeople, async ({ principal }) => {
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved.refusal);
      const outcome = await sharing.read(resolved.access);
      return outcome.ok
        ? { ok: true, status: 200, body: { sharedPeople: outcome.sharedPeople } }
        : refused(outcome.refusal);
    }),
    bind(changeSharedPeople, async ({ body, principal }) => {
      // An organization act that moves every project's dates is a person's,
      // never a delegation's, as member administration is.
      // Proof: this guard removed made `refuses a delegated switch of the
      // capacity mode, even a super-admin’s` (`delegation.controller.db.test.ts`)
      // answer 200; watched 2026-09-29.
      if (principal.delegation !== undefined)
        return { ok: false, status: 403, body: { error: 'insufficient_scope' } };
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved.refusal);
      const outcome = await sharing.switch(principal.id, resolved.access, body.sharedPeople);
      return outcome.ok
        ? { ok: true, status: 200, body: { sharedPeople: outcome.sharedPeople } }
        : refused(outcome.refusal);
    }),
  ] as const;
}
