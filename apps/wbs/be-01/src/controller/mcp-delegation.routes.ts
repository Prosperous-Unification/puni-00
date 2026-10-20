import {
  issueMcpDelegation,
  listMcpOrganizations,
  readMcpAuthority,
  type WbsScope,
} from '@wbs/contracts';
import { organizationRefusal } from '@wbs/core/http/organization-refusal';

import { bind } from '../http/endpoint';
import type { McpDelegationAuthority } from '../runtime/mcp-delegation';

/**
 * The mcp-01 delegation routes. The internal identity policy has already
 * checked mcp-01's service secret; these handlers take the user's upstream
 * token from the Authorization header alone, never from a cookie or another
 * header, and the organization only from the body mcp-01 built from its own
 * bound family.
 */
export function mcpDelegationRoutes(authority: McpDelegationAuthority) {
  return [
    bind(listMcpOrganizations, async ({ request }) => {
      const token = upstreamBearerOf(request.headers);
      if (token === null)
        return { ok: false, status: 401, body: { error: 'unauthenticated' } } as const;
      const outcome = await authority.organizationsOf(token);
      switch (outcome.kind) {
        case 'pre_activation':
          return { ok: true, status: 200, body: { state: 'pre_activation' } } as const;
        case 'listed':
          return {
            ok: true,
            status: 200,
            body: {
              state: 'activated',
              userId: outcome.userId,
              memberships: outcome.memberships.map(({ organizationId, name, role }) => ({
                organizationId,
                name,
                role,
              })),
            },
          } as const;
        case 'inactive':
          return { ok: false, status: 403, body: { error: 'delegation_inactive' } } as const;
        case 'unauthenticated':
        case 'unknown_identity':
          return { ok: false, status: 401, body: { error: outcome.kind } } as const;
      }
    }),
    bind(issueMcpDelegation, async ({ request, body }) => {
      const token = upstreamBearerOf(request.headers);
      if (token === null)
        return { ok: false, status: 401, body: { error: 'unauthenticated' } } as const;
      const named = body.scope.split(' ');
      const scopes = named.filter(isWbsScope);
      if (
        [body.organizationId, body.userId, body.client, body.grant].some((field) => field === '') ||
        scopes.length !== named.length
      )
        return { ok: false, status: 400, body: { error: 'invalid_body' } } as const;
      // Proof: taking the organization from an `x-wbs-organization` header
      // instead of this body made `issues an MCP delegation only for the
      // bound organization` in `mcp-delegation.boot.db.test.ts` issue
      // for org-b; watched 2026-10-21.
      const outcome = await authority.issue(token, {
        organizationId: body.organizationId,
        userId: body.userId,
        client: body.client,
        grant: body.grant,
        scopes,
      });
      switch (outcome.kind) {
        case 'issued':
          return { ok: true, status: 200, body: { token: outcome.token } } as const;
        case 'unauthenticated':
        case 'unknown_identity':
          return { ok: false, status: 401, body: { error: outcome.kind } } as const;
        case 'inactive':
          return { ok: false, status: 403, body: { error: 'delegation_inactive' } } as const;
        case 'binding_changed':
        case 'insufficient_scope':
          return { ok: false, status: 403, body: { error: outcome.kind } } as const;
        case 'refused':
          return organizationRefusal(outcome.refusal);
      }
    }),
    bind(readMcpAuthority, async ({ body }) => {
      if (Object.values(body).some((field) => field === ''))
        return { ok: false, status: 400, body: { error: 'invalid_body' } } as const;
      const outcome = await authority.authorityOf(body);
      if (outcome.kind === 'denied')
        return { ok: true, status: 200, body: { outcome: 'denied' } } as const;
      return {
        ok: true,
        status: 200,
        body: {
          outcome: 'admitted',
          issuer: outcome.issuer,
          subject: outcome.subject,
          userId: outcome.userId,
          organizationId: outcome.organizationId,
          enforced: outcome.enforced.map(({ prefix, loginSlug }) => ({ prefix, loginSlug })),
          policy:
            outcome.policy === null
              ? null
              : {
                  maxSessionSeconds: outcome.policy.maxSessionSeconds,
                  reauthenticateAfterSeconds: outcome.policy.reauthenticateAfterSeconds,
                },
        },
      } as const;
    }),
  ] as const;
}

/**
 * The one upstream token mcp-01 presents. A cookie beside it makes the
 * request ambiguous, exactly as on the delegation path of be-01's identity
 * resolver, so it is refused rather than ignored.
 */
function upstreamBearerOf(headers: Headers): string | null {
  if (headers.get('cookie') !== null) return null;
  const match = /^Bearer ([^\s]+)$/.exec(headers.get('authorization') ?? '');
  return match?.[1] ?? null;
}

function isWbsScope(scope: string): scope is WbsScope {
  return scope === 'read' || scope === 'write' || scope === 'editor';
}
