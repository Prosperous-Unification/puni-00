import {
  admitResourceRuntimeUse,
  bindResourceAuthority,
  ingestResourceRuntimeEvent,
  readResourceAuthority,
  readResourceCleanupRequests,
} from '@wbs/contracts';

import type { Clock } from '../ports/clock';
import type { OrganizationAccess, ResourceAccess } from '../ports/organization-access';
import type { ResourceRuntime, ResourceRuntimeActor } from '../ports/resource-runtime';
import type { ResourceUseDenial } from '../ports/resource-uses';
import { retainSecurityPrincipal, type SecurityPrincipal } from '../ports/security-principal';
import { bind, type HttpReply } from './endpoint';
import { organizationRefusal } from './organization-refusal';
import { resourceUseActorOf } from './resource-use.routes';
const unavailable = {
  ok: false,
  status: 503,
  body: { error: 'resource_tracking_unavailable' },
} as const;
const forbidden = { ok: false, status: 403, body: { error: 'forbidden' } } as const;
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
          error: 'forbidden',
          // Proof: runtime-permission-projection.
          // The recorded fault broke `encodes actual runtime fresh admission package.write denial over HTTP without effects`; restored GREEN.
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
function actorOf(principal: SecurityPrincipal, access: ResourceAccess): ResourceRuntimeActor {
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
        // Proof: route-bind-payload.
        // The recorded fault broke `retains resource bind route payload before resolver await`; restored GREEN.
        const draft = structuredClone(body);
        // Proof: route-bind-authority.
        // The recorded fault broke `retains actual resource bind route id before resolver await`; restored GREEN.
        const actual = retainSecurityPrincipal(principal);
        // Proof: route-bind-targets.
        // The recorded fault broke `retains actual resource bind route target before resolver await`; restored GREEN.
        const targets = { ...params };
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        if (runtime === undefined) return unavailable;
        const bound = await runtime.bind(
          targets.authorityId,
          actorOf(actual, resolved.access),
          draft,
          clock.now(),
        );
        return bound.ok ? { ok: true, status: 200, body: bound.value } : refusal(bound);
      },
    ),
    bind(
      readResourceAuthority,
      async ({ principal, params }): Promise<HttpReply<typeof readResourceAuthority>> => {
        // Proof: route-read-authority.
        // The recorded fault broke `retains actual resource read route id before resolver await`; restored GREEN.
        const actual = retainSecurityPrincipal(principal);
        // Proof: route-read-targets.
        // The recorded fault broke `retains actual resource read route target before resolver await`; restored GREEN.
        const targets = { ...params };
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        if (runtime === undefined) return unavailable;
        const read = await runtime.read(targets.authorityId, actorOf(actual, resolved.access));
        return read.ok ? { ok: true, status: 200, body: read.value } : refusal(read);
      },
    ),
    bind(
      admitResourceRuntimeUse,
      async ({ principal, params, body }): Promise<HttpReply<typeof admitResourceRuntimeUse>> => {
        // Proof: route-admit-payload.
        // The recorded fault broke `retains resource admit route payload before resolver await`; restored GREEN.
        const draft = structuredClone(body);
        // Proof: route-admit-authority.
        // The recorded fault broke `retains actual resource admit route id before resolver await`; restored GREEN.
        const actual = retainSecurityPrincipal(principal);
        // Proof: route-admit-targets.
        // The recorded fault broke `retains actual resource admit route target before resolver await`; restored GREEN.
        const targets = { ...params };
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        if (actual.authentication?.kind !== 'machine') return forbidden;
        if (runtime === undefined) return unavailable;
        const admitted = await runtime.admit(
          targets.authorityId,
          actorOf(actual, resolved.access),
          draft,
          clock.now(),
        );
        return admitted.ok ? { ok: true, status: 200, body: admitted.value } : refusal(admitted);
      },
    ),
    bind(
      ingestResourceRuntimeEvent,
      async ({
        principal,
        params,
        body,
      }): Promise<HttpReply<typeof ingestResourceRuntimeEvent>> => {
        // Proof: route-ingest-payload.
        // The recorded fault broke `retains resource ingest route payload before resolver await`; restored GREEN.
        const draft = structuredClone(body);
        // Proof: route-ingest-authority.
        // The recorded fault broke `retains actual resource ingest route id before resolver await`; restored GREEN.
        const actual = retainSecurityPrincipal(principal);
        // Proof: route-ingest-targets.
        // The recorded fault broke `retains actual resource ingest route target before resolver await`; restored GREEN.
        const targets = { ...params };
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        if (actual.authentication?.kind !== 'machine') return forbidden;
        if (runtime === undefined) return unavailable;
        const accepted = await runtime.ingest(
          targets.authorityId,
          actorOf(actual, resolved.access),
          draft,
          clock.now(),
        );
        return accepted.ok ? { ok: true, status: 200, body: accepted.value } : refusal(accepted);
      },
    ),
    bind(
      readResourceCleanupRequests,
      async ({
        principal,
        params,
        query,
      }): Promise<HttpReply<typeof readResourceCleanupRequests>> => {
        // Proof: route-requests-payload.
        // The recorded fault broke `retains resource requests route payload before resolver await`; restored GREEN.
        const page = structuredClone(query);
        // Proof: route-requests-authority.
        // The recorded fault broke `retains actual resource requests route id before resolver await`; restored GREEN.
        const actual = retainSecurityPrincipal(principal);
        // Proof: route-requests-targets.
        // The recorded fault broke `retains actual resource requests route target before resolver await`; restored GREEN.
        const targets = { ...params };
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        if (actual.authentication?.kind !== 'machine') return forbidden;
        if (runtime === undefined) return unavailable;
        const after = Number(page.after ?? 0),
          limit = Number(page.limit ?? 50);
        if (
          (page.after !== undefined && !/^\d+$/.test(page.after)) ||
          (page.limit !== undefined && !/^\d+$/.test(page.limit)) ||
          !Number.isSafeInteger(after) ||
          after < 0 ||
          !Number.isSafeInteger(limit) ||
          limit < 1 ||
          limit > 100
        )
          return { ok: false, status: 400, body: { error: 'invalid_query' } };
        const listed = await runtime.requests(
          targets.authorityId,
          actorOf(actual, resolved.access),
          after,
          limit,
        );
        return listed.ok ? { ok: true, status: 200, body: listed.value } : refusal(listed);
      },
    ),
  ] as const;
}
