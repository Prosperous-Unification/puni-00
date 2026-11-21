import {
  appendResourceUseEvent,
  listResourceUses,
  readResourceUseHistory,
  registerResourceUse,
} from '@wbs/contracts';

import type { Clock } from '../ports/clock';
import type { OrganizationAccess, ResourceAccess } from '../ports/organization-access';
import type { ResourceUseActor, ResourceUseDenial, ResourceUses } from '../ports/resource-uses';
import { retainSecurityPrincipal, type SecurityPrincipal } from '../ports/security-principal';
import { bind, type HttpReply } from './endpoint';
import { organizationRefusal } from './organization-refusal';
const unavailable = {
  ok: false,
  status: 503,
  body: { error: 'resource_tracking_unavailable' },
} as const;
const badQuery = { ok: false, status: 400, body: { error: 'invalid_query' } } as const;
function refusal(denial: ResourceUseDenial) {
  const { reason } = denial;
  switch (reason) {
    case 'not_found':
      return { ok: false, status: 404, body: { error: reason } } as const;
    case 'forbidden':
      return {
        ok: false,
        status: 403,
        body: {
          error: reason,
          // Proof: manual-permission-projection.
          // The recorded fault broke `encodes package.write for a readable resource registration denial without effects`; restored GREEN.
          ...('permission' in denial && denial.permission !== undefined
            ? { permission: denial.permission }
            : {}),
        },
      } as const;
    case 'conflict':
      return { ok: false, status: 409, body: { error: reason } } as const;
    case 'invalid_body':
      return { ok: false, status: 400, body: { error: reason } } as const;
  }
}
export function resourceUseActorOf(
  principal: SecurityPrincipal,
  access: ResourceAccess,
): ResourceUseActor {
  const authentication = principal.authentication;
  const pinned = authentication?.kind === 'machine' || authentication?.kind === 'consent';
  return {
    id: principal.id,
    principal: retainSecurityPrincipal(principal),
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
        // Proof: route-register-payload.
        // The recorded fault broke `retains resource register route payload before resolver await`; restored GREEN.
        const draft = structuredClone(body);
        // Proof: route-register-authority.
        // The recorded fault broke `retains actual resource register route id before resolver await`; restored GREEN.
        const actual = retainSecurityPrincipal(principal);
        // Proof: route-register-targets.
        // The recorded fault broke `retains actual resource register route target before resolver await`; restored GREEN.
        const targets = { ...params };
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        if (uses === undefined) return unavailable;
        const registered = await uses.register(
          targets.id,
          resourceUseActorOf(actual, resolved.access),
          draft,
          clock.now(),
        );
        return registered.ok
          ? { ok: true, status: 201, body: { use: registered.value } }
          : refusal(registered);
      },
    ),
    bind(
      appendResourceUseEvent,
      async ({ principal, params, body }): Promise<HttpReply<typeof appendResourceUseEvent>> => {
        // Proof: route-append-payload.
        // The recorded fault broke `retains resource append route payload before resolver await`; restored GREEN.
        const draft = structuredClone(body);
        // Proof: route-append-authority.
        // The recorded fault broke `retains actual resource append route id before resolver await`; restored GREEN.
        const actual = retainSecurityPrincipal(principal);
        // Proof: route-append-targets.
        // The recorded fault broke `retains actual resource append route target before resolver await`; restored GREEN.
        const targets = { ...params };
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        if (uses === undefined) return unavailable;
        const appended = await uses.append(
          targets.id,
          targets.useId,
          resourceUseActorOf(actual, resolved.access),
          draft,
          clock.now(),
        );
        return appended.ok
          ? { ok: true, status: 200, body: { use: appended.value } }
          : refusal(appended);
      },
    ),
    bind(
      listResourceUses,
      async ({ principal, params, query }): Promise<HttpReply<typeof listResourceUses>> => {
        // Proof: route-list-payload.
        // The recorded fault broke `retains resource list route payload before resolver await`; restored GREEN.
        const page = structuredClone(query);
        // Proof: route-list-authority.
        // The recorded fault broke `retains actual resource list route id before resolver await`; restored GREEN.
        const actual = retainSecurityPrincipal(principal);
        // Proof: route-list-targets.
        // The recorded fault broke `retains actual resource list route target before resolver await`; restored GREEN.
        const targets = { ...params };
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        if (uses === undefined) return unavailable;
        const limit = limitOf(page);
        if (limit === null) return badQuery;
        const listed = await uses.list(targets.id, resourceUseActorOf(actual, resolved.access), {
          ...page,
          limit,
        });
        return listed.ok ? { ok: true, status: 200, body: listed.value } : refusal(listed);
      },
    ),
    bind(
      readResourceUseHistory,
      async ({ principal, params, query }): Promise<HttpReply<typeof readResourceUseHistory>> => {
        // Proof: route-history-payload.
        // The recorded fault broke `retains resource history route payload before resolver await`; restored GREEN.
        const page = structuredClone(query);
        // Proof: route-history-authority.
        // The recorded fault broke `retains actual resource history route id before resolver await`; restored GREEN.
        const actual = retainSecurityPrincipal(principal);
        // Proof: route-history-targets.
        // The recorded fault broke `retains actual resource history route target before resolver await`; restored GREEN.
        const targets = { ...params };
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        if (uses === undefined) return unavailable;
        const limit = limitOf(page);
        if (limit === null) return badQuery;
        const history = await uses.history(
          targets.id,
          targets.useId,
          resourceUseActorOf(actual, resolved.access),
          { ...page, limit },
        );
        return history.ok ? { ok: true, status: 200, body: history.value } : refusal(history);
      },
    ),
  ] as const;
}
