import {
  appendResourceUseEvent,
  type AuthenticatedUser,
  listResourceUses,
  readResourceUseHistory,
  registerResourceUse,
} from '@wbs/contracts';

import type { Clock } from '../ports/clock';
import type { OrganizationAccess, ResourceAccess } from '../ports/organization-access';
import type { ResourceUseActor, ResourceUseRefusal, ResourceUses } from '../ports/resource-uses';
import { bind, type HttpReply } from './endpoint';
import { organizationRefusal } from './organization-refusal';
const unavailable = {
  ok: false,
  status: 503,
  body: { error: 'resource_tracking_unavailable' },
} as const;
const badQuery = { ok: false, status: 400, body: { error: 'invalid_query' } } as const;
function refusal(reason: ResourceUseRefusal) {
  switch (reason) {
    case 'not_found':
      return { ok: false, status: 404, body: { error: reason } } as const;
    case 'forbidden':
      return { ok: false, status: 403, body: { error: reason } } as const;
    case 'conflict':
      return { ok: false, status: 409, body: { error: reason } } as const;
    case 'invalid_body':
      return { ok: false, status: 400, body: { error: reason } } as const;
  }
}
export function resourceUseActorOf(
  principal: AuthenticatedUser,
  access: ResourceAccess,
): ResourceUseActor {
  const authentication = principal.authentication;
  const pinned = authentication?.kind === 'machine' || authentication?.kind === 'consent';
  return {
    id: principal.id,
    access,
    personId: pinned ? authentication.personId : null,
    fingerprint: JSON.stringify([
      principal.id,
      pinned ? authentication.kind : 'account',
      pinned ? authentication.credentialId : null,
    ]),
  };
}
function limitOf(query: { limit?: string; cursor?: string }): number | null {
  if (query.cursor !== undefined && (query.cursor.length === 0 || query.cursor.length > 2048))
    return null;
  if (query.limit === undefined) return 50;
  if (!/^\d+$/.test(query.limit)) return null;
  const limit = Number(query.limit);
  return Number.isSafeInteger(limit) && limit >= 1 && limit <= 100 ? limit : null;
}
/** Project-scoped reported tracking. An unwired composition refuses visibly instead of accepting reports it cannot persist. */
export function resourceUseRoutes(
  organizations: OrganizationAccess,
  uses: ResourceUses | undefined,
  clock: Pick<Clock, 'now'>,
) {
  return [
    bind(
      registerResourceUse,
      async ({ principal, params, body }): Promise<HttpReply<typeof registerResourceUse>> => {
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        if (uses === undefined) return unavailable;
        const registered = await uses.register(
          params.id,
          resourceUseActorOf(principal, resolved.access),
          body,
          clock.now(),
        );
        return registered.ok
          ? { ok: true, status: 201, body: { use: registered.value } }
          : refusal(registered.reason);
      },
    ),
    bind(
      appendResourceUseEvent,
      async ({ principal, params, body }): Promise<HttpReply<typeof appendResourceUseEvent>> => {
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        if (uses === undefined) return unavailable;
        const appended = await uses.append(
          params.id,
          params.useId,
          resourceUseActorOf(principal, resolved.access),
          body,
          clock.now(),
        );
        return appended.ok
          ? { ok: true, status: 200, body: { use: appended.value } }
          : refusal(appended.reason);
      },
    ),
    bind(
      listResourceUses,
      async ({ principal, params, query }): Promise<HttpReply<typeof listResourceUses>> => {
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        if (uses === undefined) return unavailable;
        const limit = limitOf(query);
        if (limit === null) return badQuery;
        const listed = await uses.list(params.id, resourceUseActorOf(principal, resolved.access), {
          ...query,
          limit,
        });
        return listed.ok ? { ok: true, status: 200, body: listed.value } : refusal(listed.reason);
      },
    ),
    bind(
      readResourceUseHistory,
      async ({ principal, params, query }): Promise<HttpReply<typeof readResourceUseHistory>> => {
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        if (uses === undefined) return unavailable;
        const limit = limitOf(query);
        if (limit === null) return badQuery;
        const history = await uses.history(
          params.id,
          params.useId,
          resourceUseActorOf(principal, resolved.access),
          { ...query, limit },
        );
        return history.ok
          ? { ok: true, status: 200, body: history.value }
          : refusal(history.reason);
      },
    ),
  ] as const;
}
