import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { organizationContextRefusal, organizationRefusal } from './organization-refusal';
import { requestSchema, responseSchema } from './schema-shape';

/**
 * The be-01 routes mcp-01 alone calls for organization delegation
 * (`organization-ownership-and-access` tasks 2.5, 6.4 and 6.6) and for a
 * consent that acts as an agent person (`wbs-machine-credentials` A20). Each
 * needs mcp-01's `x-internal-auth` secret first; the organization, consent
 * credential and delegation routes then verify the user's upstream access
 * token itself, so a leaked service secret alone names no user. None is ever
 * an MCP tool: `/internal/*` is excluded from mcp-01's derived tool table.
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
 * for consent, each with the agent persons of that organization bound to the
 * user's account (`wbs-machine-credentials` A20), which the consent page
 * offers beside "authorize as yourself". Before activation it answers
 * `pre_activation` and lists nothing: MCP keeps its legacy forwarding until
 * the isolation marker is committed.
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
          memberships: type({
            organizationId: 'string',
            name: 'string',
            role,
            agents: type({ personId: 'string', name: 'string' }).array(),
          }).array(),
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
 * Mints the `mcp_consent` machine credential of a consent that acts as an
 * agent person (`wbs-machine-credentials` A8, A20), before mcp-01 issues the
 * code: issued by the upstream token's account (`userId`, which it must still
 * resolve to), for agent `personId` of `organizationId`, naming the refresh
 * family `family` mcp-01 is about to create. `credentialId` (a lowercase
 * UUID) and `family` are mcp-01's, recorded durably before this call so an
 * unexchanged code is reported ended later; `client` labels the credential.
 * `person_not_bound`: the person is not an agent of that organization bound
 * to the account; `not_a_member`: the account is no current member.
 */
export const mintMcpConsentCredential = defineEndpointShape({
  method: 'POST',
  path: '/internal/mcp/credentials',
  operationId: 'postInternalMcpCredentials',
  policies,
  body: requestSchema(
    type({
      organizationId: 'string',
      userId: 'string',
      personId: 'string',
      credentialId: 'string',
      family: 'string',
      client: 'string',
    }),
  ),
  responses: [
    { kind: 'json', status: 201, schema: responseSchema(type({ credentialId: 'string' })) },
  ],
  refusals: [
    malformed,
    unauthenticated,
    {
      status: 403,
      schema: responseSchema(
        type({ error: "'delegation_inactive' | 'binding_changed' | 'not_a_member'" }),
      ),
    },
    {
      status: 403,
      schema: responseSchema(type({ error: "'person_not_bound'", personId: 'string' })),
    },
  ],
  document: { summary: 'Mint the consent credential of an MCP consent that acts as an agent.' },
});

/**
 * Reports that mcp-01 ended the family of a consent credential (revoked,
 * expired, retired by the credential epoch, or a code never exchanged), so
 * be-01 revokes the credential (`wbs-machine-credentials` A20, _End_). It
 * carries no user credential: a family ends exactly when no user is there.
 * Only a credential naming that exact family is touched; `absent` covers
 * one never minted or removed with its person.
 */
export const endMcpConsentCredential = defineEndpointShape({
  method: 'POST',
  path: '/internal/mcp/credentials/ended',
  operationId: 'postInternalMcpCredentialsEnded',
  policies,
  body: requestSchema(type({ credentialId: 'string', family: 'string' })),
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(type({ outcome: "'revoked' | 'already_revoked' | 'absent'" })),
    },
  ],
  refusals: [malformed, { status: 401, schema: responseSchema(type({ error: "'unauthorized'" })) }],
  document: { summary: 'Revoke a consent credential whose MCP family mcp-01 ended.' },
});

/**
 * Issues one single-use `wbs-be-01/via-mcp-01` delegation for an MCP session
 * bound to `organizationId`. The audience is fixed by the route, never the
 * body; `userId` is the session's bound account, which the upstream token
 * must still resolve to; `scope` can only narrow what the token holds. With
 * `credentialId` (a consent that acts as an agent person, A20) the credential
 * must be live, name family `grant`, and its person must still be bound to
 * `userId`: the delegation is then pinned to that person with scopes at most
 * `read` and `write`; otherwise `credential_revoked`.
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
      'credentialId?': 'string',
    }),
  ),
  responses: [{ kind: 'json', status: 200, schema: responseSchema(type({ token: 'string' })) }],
  refusals: [
    malformed,
    unauthenticated,
    {
      status: 403,
      schema: responseSchema(
        type({
          error:
            "'delegation_inactive' | 'binding_changed' | 'insufficient_scope' | 'credential_revoked'",
        }),
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
 * A consent family acting as an agent person names its `credentialId` and
 * `grant` (both or neither), and is `denied` once that credential is revoked,
 * names another family, or its person is no longer bound to `userId` (A20).
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
      'credentialId?': 'string',
      'grant?': 'string',
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
