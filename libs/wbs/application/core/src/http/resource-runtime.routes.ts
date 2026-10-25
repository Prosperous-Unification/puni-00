import {
  admitResourceRuntimeUse,
  type AuthenticatedUser,
  bindResourceAuthority,
  ingestResourceRuntimeEvent,
  readResourceAuthority,
  readResourceCleanupRequests,
} from '@wbs/contracts';

import type { Clock } from '../ports/clock';
import type { OrganizationAccess, ResourceAccess } from '../ports/organization-access';
import type { ResourceRuntime, ResourceRuntimeActor } from '../ports/resource-runtime';
import type { ResourceUseRefusal } from '../ports/resource-uses';
import { bind, type HttpReply } from './endpoint';
import { organizationRefusal } from './organization-refusal';
import { resourceUseActorOf } from './resource-use.routes';
const unavailable = {
  ok: false,
  status: 503,
  body: { error: 'resource_tracking_unavailable' },
} as const;
const forbidden = { ok: false, status: 403, body: { error: 'forbidden' } } as const;
function refusal(reason: ResourceUseRefusal) {
  switch (reason) {
    case 'not_found':
      return { ok: false, status: 404, body: { error: reason } } as const;
    case 'forbidden':
      return forbidden;
    case 'conflict':
      return { ok: false, status: 409, body: { error: reason } } as const;
    case 'invalid_body':
      return { ok: false, status: 400, body: { error: reason } } as const;
  }
}
function actorOf(principal: AuthenticatedUser, access: ResourceAccess): ResourceRuntimeActor {
  return {
    ...resourceUseActorOf(principal, access),
    credentialId:
      principal.authentication?.kind === 'machine' ? principal.authentication.credentialId : null,
  };
}
/** Separate authority surface: browser administrators grant, only the exact bound machine attests. */
export function resourceRuntimeRoutes(
  organizations: OrganizationAccess,
  runtime: ResourceRuntime | undefined,
  clock: Pick<Clock, 'now'>,
) {
  return [
    bind(
      bindResourceAuthority,
      async ({ principal, params, body }): Promise<HttpReply<typeof bindResourceAuthority>> => {
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        if (runtime === undefined) return unavailable;
        const bound = await runtime.bind(
          params.authorityId,
          actorOf(principal, resolved.access),
          body,
          clock.now(),
        );
        return bound.ok ? { ok: true, status: 200, body: bound.value } : refusal(bound.reason);
      },
    ),
    bind(
      readResourceAuthority,
      async ({ principal, params }): Promise<HttpReply<typeof readResourceAuthority>> => {
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        if (runtime === undefined) return unavailable;
        const read = await runtime.read(params.authorityId, actorOf(principal, resolved.access));
        return read.ok ? { ok: true, status: 200, body: read.value } : refusal(read.reason);
      },
    ),
    bind(
      admitResourceRuntimeUse,
      async ({ principal, params, body }): Promise<HttpReply<typeof admitResourceRuntimeUse>> => {
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        if (principal.authentication?.kind !== 'machine') return forbidden;
        if (runtime === undefined) return unavailable;
        const admitted = await runtime.admit(
          params.authorityId,
          actorOf(principal, resolved.access),
          body,
          clock.now(),
        );
        return admitted.ok
          ? { ok: true, status: 200, body: admitted.value }
          : refusal(admitted.reason);
      },
    ),
    bind(
      ingestResourceRuntimeEvent,
      async ({
        principal,
        params,
        body,
      }): Promise<HttpReply<typeof ingestResourceRuntimeEvent>> => {
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        if (principal.authentication?.kind !== 'machine') return forbidden;
        if (runtime === undefined) return unavailable;
        const accepted = await runtime.ingest(
          params.authorityId,
          actorOf(principal, resolved.access),
          body,
          clock.now(),
        );
        return accepted.ok
          ? { ok: true, status: 200, body: accepted.value }
          : refusal(accepted.reason);
      },
    ),
    bind(
      readResourceCleanupRequests,
      async ({
        principal,
        params,
        query,
      }): Promise<HttpReply<typeof readResourceCleanupRequests>> => {
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        if (principal.authentication?.kind !== 'machine') return forbidden;
        if (runtime === undefined) return unavailable;
        const after = Number(query.after ?? 0),
          limit = Number(query.limit ?? 50);
        if (
          (query.after !== undefined && !/^\d+$/.test(query.after)) ||
          (query.limit !== undefined && !/^\d+$/.test(query.limit)) ||
          !Number.isSafeInteger(after) ||
          after < 0 ||
          !Number.isSafeInteger(limit) ||
          limit < 1 ||
          limit > 100
        )
          return { ok: false, status: 400, body: { error: 'invalid_query' } };
        const listed = await runtime.requests(
          params.authorityId,
          actorOf(principal, resolved.access),
          after,
          limit,
        );
        return listed.ok ? { ok: true, status: 200, body: listed.value } : refusal(listed.reason);
      },
    ),
  ] as const;
}
