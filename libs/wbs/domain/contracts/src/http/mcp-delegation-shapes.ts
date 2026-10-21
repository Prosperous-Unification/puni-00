import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { organizationContextRefusal, organizationRefusal } from './organization-refusal';
import { requestSchema, responseSchema } from './schema-shape';

/**
 * The three be-01 routes mcp-01 alone calls for organization delegation
 * (`organization-ownership-and-access` tasks 2.5, 6.4 and 6.6). Each needs
 * mcp-01's `x-internal-auth` secret first; the organization and delegation
 * routes then verify the user's upstream access token itself, so a leaked
 * service secret alone names no user. None is ever an MCP tool: `/internal/*`
 * is excluded from mcp-01's derived tool table.
 */
const policies = [
  { kind: 'identity', require: 'internal' },
  { kind: 'organization-control' },
] as const;

const role = "'super_admin' | 'admin' | 'member' | 'viewer'";

const malformed = {
  status: 400,
  schema: responseSchema(
    type({ error: "'invalid_body' | 'invalid_json' | 'invalid_query' | 'invalid_params'" }),
  ),
} as const;

/** The upstream token is absent, invalid, expired or linked to nobody. */
const unauthenticated = {
  status: 401,
  schema: responseSchema(
    type({ error: "'unauthorized' | 'unauthenticated' | 'unknown_identity'" }),
  ),
} as const;

/**
 * Lists the organizations the upstream token's user may bind an MCP grant to,
 * for consent. Before activation it answers `pre_activation` and lists nothing:
 * MCP keeps its legacy forwarding until the isolation marker is committed.
 */
export const listMcpOrganizations = defineEndpointShape({
  method: 'POST',
  path: '/internal/mcp/organizations',
  operationId: 'postInternalMcpOrganizations',
  policies,
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(
        type({ state: "'pre_activation'" }).or({
          state: "'activated'",
          userId: 'string',
          memberships: type({ organizationId: 'string', name: 'string', role }).array(),
        }),
      ),
    },
  ],
  refusals: [
    malformed,
    unauthenticated,
    { status: 403, schema: responseSchema(type({ error: "'delegation_inactive'" })) },
  ],
  document: { summary: 'List the organizations an MCP consent may bind, for mcp-01.' },
});

/**
 * Issues one single-use `wbs-be-01/via-mcp-01` delegation for an MCP session
 * bound to `organizationId`. The audience is fixed by the route, never the
 * body; `userId` is the session's bound account, which the upstream token
 * must still resolve to; `scope` can only narrow what the token holds.
 */
export const issueMcpDelegation = defineEndpointShape({
  method: 'POST',
  path: '/internal/mcp/delegation',
  operationId: 'postInternalMcpDelegation',
  policies,
  body: requestSchema(
    type({
      organizationId: 'string',
      userId: 'string',
      client: 'string',
      grant: 'string',
      scope: 'string',
    }),
  ),
  responses: [{ kind: 'json', status: 200, schema: responseSchema(type({ token: 'string' })) }],
  refusals: [
    malformed,
    unauthenticated,
    {
      status: 403,
      schema: responseSchema(
        type({ error: "'delegation_inactive' | 'binding_changed' | 'insufficient_scope'" }),
      ),
    },
    organizationRefusal,
    organizationContextRefusal,
  ],
  document: { summary: 'Issue a signed organization delegation for one MCP session call.' },
});

/**
 * Rereads one bound MCP family's authority for mcp-01's refresh and per-request
 * check: the upstream pair still maps to `userId`, who is still a member of
 * `organizationId`, plus that organization's credential-rule facts. It
 * carries no user credential (a refresh runs exactly when the upstream token
 * has expired), so it grants nothing; it only answers whether to keep going.
 */
export const readMcpAuthority = defineEndpointShape({
  method: 'POST',
  path: '/internal/mcp/authority',
  operationId: 'postInternalMcpAuthority',
  policies,
  body: requestSchema(
    type({
      issuer: 'string',
      subject: 'string',
      userId: 'string',
      organizationId: 'string',
    }),
  ),
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(
        type({ outcome: "'denied'" }).or({
          outcome: "'admitted'",
          issuer: 'string',
          subject: 'string',
          userId: 'string',
          organizationId: 'string',
          enforced: type({ prefix: 'string', loginSlug: 'string' }).array(),
          policy: type({
            maxSessionSeconds: 'number | null',
            reauthenticateAfterSeconds: 'number | null',
          }).or('null'),
        }),
      ),
    },
  ],
  refusals: [malformed, { status: 401, schema: responseSchema(type({ error: "'unauthorized'" })) }],
  document: { summary: "Reread a bound MCP family's membership and credential rules." },
});
