import {
  endMcpConsentCredential,
  issueMcpDelegation,
  listMcpOrganizations,
  mintMcpConsentCredential,
  readMcpAuthority,
  type WbsScope,
} from '@wbs/contracts';
import { organizationRefusal } from '@wbs/core/http/organization-refusal';

import { bind } from '../http/endpoint';
import { CREDENTIAL_ID, type McpDelegationAuthority } from '../runtime/mcp-delegation';

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
              memberships: outcome.memberships.map(({ organizationId, name, role, agents }) => ({
                organizationId,
                name,
                role,
                agents: agents.map((agent) => ({ personId: agent.personId, name: agent.name })),
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
    bind(mintMcpConsentCredential, async ({ request, body }) => {
      const token = upstreamBearerOf(request.headers);
      if (token === null)
        return { ok: false, status: 401, body: { error: 'unauthenticated' } } as const;
      const outcome = await authority.mintConsent(token, body);
      switch (outcome.kind) {
        case 'minted':
          return { ok: true, status: 201, body: { credentialId: outcome.credentialId } } as const;
        case 'invalid_body':
          return { ok: false, status: 400, body: { error: 'invalid_body' } } as const;
        case 'unauthenticated':
        case 'unknown_identity':
          return { ok: false, status: 401, body: { error: outcome.kind } } as const;
        case 'inactive':
          return { ok: false, status: 403, body: { error: 'delegation_inactive' } } as const;
        case 'binding_changed':
        case 'not_a_member':
          return { ok: false, status: 403, body: { error: outcome.kind } } as const;
        case 'person_not_bound':
          return {
            ok: false,
            status: 403,
            body: { error: 'person_not_bound', personId: body.personId },
          } as const;
      }
    }),
    bind(endMcpConsentCredential, async ({ body }) => {
      // The id shape is {@link CREDENTIAL_ID}'s, the one owner of it.
      if (!CREDENTIAL_ID.test(body.credentialId) || body.family === '')
        return { ok: false, status: 400, body: { error: 'invalid_body' } } as const;
      const outcome = await authority.endConsent(body.credentialId, body.family);
      // Before activation no consent credential exists to end.
      return {
        ok: true,
        status: 200,
        body: { outcome: outcome === 'inactive' ? 'absent' : outcome },
      } as const;
    }),
    bind(issueMcpDelegation, async ({ request, body }) => {
      const token = upstreamBearerOf(request.headers);
      if (token === null)
        return { ok: false, status: 401, body: { error: 'unauthenticated' } } as const;
      const named = body.scope.split(' ');
      const scopes = named.filter(isWbsScope);
      // Proof: dropping this check made `refuses a cookie beside the upstream
      // token and a malformed body` in `mcp-delegation.boot.db.test.ts` fail;
      // watched 2026-10-21.
      if (
        [body.organizationId, body.userId, body.client, body.grant].some((field) => field === '') ||
        scopes.length !== named.length ||
        body.credentialId === ''
      )
        return { ok: false, status: 400, body: { error: 'invalid_body' } } as const;
      // Proof: taking the organization from an `x-wbs-organization` header
      // before this body made `issues an MCP delegation only for the bound
      // organization` in `mcp-delegation.boot.db.test.ts` ask for org-b and
      // fail; watched 2026-10-21.
      const outcome = await authority.issue(token, {
        organizationId: body.organizationId,
        userId: body.userId,
        client: body.client,
        grant: body.grant,
        scopes,
        ...(body.credentialId === undefined ? {} : { credentialId: body.credentialId }),
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
        case 'credential_revoked':
          return { ok: false, status: 403, body: { error: outcome.kind } } as const;
        case 'refused':
          return organizationRefusal(outcome.refusal);
      }
    }),
    bind(readMcpAuthority, async ({ body }) => {
      // Proof: dropping this check made `refuses a cookie beside the upstream
      // token and a malformed body` in `mcp-delegation.boot.db.test.ts` fail;
      // watched 2026-10-21.
      // Proof: with the both-or-neither half removed, `refuses a cookie beside
      // the upstream token and a malformed body` in
      // `mcp-delegation.boot.db.test.ts` admitted an authority read naming a
      // credential without its family; watched 2026-10-22.
      if (
        Object.values(body).some((field) => field === '') ||
        (body.credentialId === undefined) !== (body.grant === undefined)
      )
        return { ok: false, status: 400, body: { error: 'invalid_body' } } as const;
      const outcome = await authority.authorityOf({
        issuer: body.issuer,
        subject: body.subject,
        userId: body.userId,
        organizationId: body.organizationId,
        ...(body.credentialId === undefined || body.grant === undefined
          ? {}
          : { consent: { credentialId: body.credentialId, grant: body.grant } }),
      });
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
  // Proof: dropping this refusal made `refuses a cookie beside the upstream
  // token and a malformed body` in `mcp-delegation.boot.db.test.ts` issue a
  // delegation; watched 2026-10-21.
  if (headers.get('cookie') !== null) return null;
  const match = /^Bearer ([^\s]+)$/.exec(headers.get('authorization') ?? '');
  return match?.[1] ?? null;
}

function isWbsScope(scope: string): scope is WbsScope {
  return scope === 'read' || scope === 'write' || scope === 'editor';
}
