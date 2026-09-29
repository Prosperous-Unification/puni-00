import { readOrganizationLoad, readPersonLoad } from '@wbs/contracts';

import type { OrganizationAccess } from '../ports/organization-access';
import { loadWindowOf, type PersonLoad } from '../service/person-load.feature';
import { bind, type HttpReply } from './endpoint';
import { organizationRefusal } from './organization-refusal';

const invalidQuery = { ok: false, status: 400, body: { error: 'invalid_query' } } as const;

/**
 * The two load reads. Organization authority is resolved before the window is
 * judged or anything is read, so an unbound caller learns nothing; any current
 * member may read. A person outside the caller's directory is `404`, alike for
 * a foreign and an absent one.
 */
export function personLoadRoutes(load: PersonLoad, organizations: OrganizationAccess) {
  return [
    bind(
      readOrganizationLoad,
      async ({ query, principal }): Promise<HttpReply<typeof readOrganizationLoad>> => {
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved.refusal);
        const window = loadWindowOf(query.from, query.to);
        if (window === null) return invalidQuery;
        return {
          ok: true,
          status: 200,
          body: await load.readOrganization(window, principal.id, resolved.access),
        };
      },
    ),
    bind(
      readPersonLoad,
      async ({ params, query, principal }): Promise<HttpReply<typeof readPersonLoad>> => {
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved.refusal);
        const window = loadWindowOf(query.from, query.to);
        if (window === null) return invalidQuery;
        const read = await load.readPerson(params.personId, window, principal.id, resolved.access);
        return read === null
          ? { ok: false, status: 404, body: { error: 'not_found' } }
          : { ok: true, status: 200, body: read };
      },
    ),
  ];
}
