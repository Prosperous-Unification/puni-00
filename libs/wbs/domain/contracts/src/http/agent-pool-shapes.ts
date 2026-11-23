import { PERMISSIONS } from '@wbs/domain/access-role';
import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { machineCredentialSummary } from './machine-credential-shapes';
import { organizationContextRefusal, organizationRefusal } from './organization-refusal';
import { requestSchema, responseSchema } from './schema-shape';

/** A pool as listed (`wbs-mcp-agent-surface` M7): its live credentials, never a secret. */
export const agentPoolSummary = type({
  id: 'string',
  name: 'string',
  size: 'number',
  expiresAt: 'number | null',
  revokedAt: 'number | null',
  createdAt: 'number',
  createdBy: 'string',
  credentials: machineCredentialSummary.array(),
});

/**
 * The keys of one pool act, answered once and stored nowhere
 * (`pool-<poolId>.keys.json`, M7): one entry per agent, in name order, each
 * with its person, its organization-local name, its credential and its key
 * `wbs_mk_<credentialId>.<secret>`. `authorizationServer` is the issuer the keys
 * are exchanged at (`WBS_MCP_AUTHORIZATION_SERVER`) and `mcpResource` the MCP
 * endpoint the agents call. `format` and `version` name this document for
 * `twilight-dash pool import`.
 */
export const agentPoolKeys = type({
  format: "'wbs-agent-pool-keys'",
  version: '1',
  organizationId: 'string',
  authorizationServer: 'string',
  mcpResource: 'string',
  poolId: 'string',
  name: 'string',
  expiresAt: 'number | null',
  issuedAt: 'number',
  agents: type({
    personId: 'string',
    personName: 'string',
    credentialId: 'string',
    key: 'string',
  }).array(),
});

const readPolicy = [{ kind: 'identity', require: 'signed-in' }] as const;
const writePolicy = [
  { kind: 'origin', when: 'always-unsafe-with-session-cookie' },
  { kind: 'identity', require: 'write-scope' },
] as const;
const common = [
  { status: 401, schema: responseSchema(type({ error: "'unauthenticated'" })) },
  organizationRefusal,
  organizationContextRefusal,
  // A delegation, a grant or a machine credential never reaches a pool.
  {
    status: 403,
    schema: responseSchema(type({ error: "'invalid_origin' | 'insufficient_scope'" })),
  },
  // Current directory permission, independent of the stored membership label.
  {
    status: 403,
    schema: responseSchema(
      type({
        error: "'forbidden'",
        // Proof: pool-schema-permission: omitting the required catalog permission schema.
        // requires the catalog permission vocabulary at getApiOrganizationAgent-pools
        // requires the catalog permission vocabulary at postApiOrganizationAgent-pools
        // requires the catalog permission vocabulary at postApiOrganizationAgent-poolsByIdRekey
        // requires the catalog permission vocabulary at deleteApiOrganizationAgent-poolsById
        // Named RED with this fault; restored GREEN (task-2.4b pool receipt).
        permission: type.enumerated(...PERMISSIONS.map(({ id }) => id)),
      }),
    ),
  },
] as const;
const malformed = {
  status: 400,
  schema: responseSchema(
    type({ error: "'invalid_json' | 'invalid_body' | 'invalid_params' | 'invalid_query'" }),
  ),
} as const;
const notFound = { status: 404, schema: responseSchema(type({ error: "'not_found'" })) } as const;
/** A pool's keys are answered once: no cache on the way may keep them. */
const noStore = [['cache-control', 'no-store']] as const;

/** Lists the active organization's agent pools, revoked ones included, for current directory-permission holders. */
export const listAgentPools = defineEndpointShape({
  method: 'GET',
  path: '/api/organization/agent-pools',
  operationId: 'getApiOrganizationAgent-pools',
  humanOnly: true,
  policies: [...readPolicy, { kind: 'organization-resource', operation: 'read' }],
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(type({ pools: agentPoolSummary.array() })),
    },
  ],
  refusals: [...common, malformed],
  document: { summary: 'List the agent pools of the active organization.' },
});

/**
 * Creates a pool in one act, for a directory-permission holder's browser session only: `size` (1
 * to 100) agent persons named `<name>-1` … `<name>-<size>`, bound to the
 * caller's account, and one API key each issued by the caller, answered once
 * as {@link agentPoolKeys}. `name` is 1 to 60 characters and never shaped like
 * a secret (`isSecretShaped`: a `wbs_mk_` or `wbs_scim_` prefix, 64 hex
 * characters, or a `|`-separated subject), else `invalid_body`. Only `api_key`
 * pools exist (`source` is optional and may say nothing else). `expiresAt`, when given, is in the future and at
 * most 90 days ahead; every key of the pool is refused from then on. The
 * agent-person cap is judged for the whole pool (`agent_person_limit`); a
 * live pool, a person or a live credential already holding a name is
 * `name_taken`. A refused creation writes nothing.
 */
export const createAgentPool = defineEndpointShape({
  method: 'POST',
  path: '/api/organization/agent-pools',
  operationId: 'postApiOrganizationAgent-pools',
  // Proof: with this tag removed, mcp-01's `tags exactly the covered set humanOnly…`,
  // `pins every generated MCP operation name…` and `keeps agent pool administration out of
  // the generated MCP tools` failed (3 fail); watched 2026-10-28.
  humanOnly: true,
  policies: [...writePolicy, { kind: 'organization-resource', operation: 'mutation' }],
  body: requestSchema(
    type({
      name: '0 < string <= 60',
      size: '1 <= number.integer <= 100',
      'source?': "'api_key'",
      'expiresAt?': 'number.integer',
    }),
  ),
  defaultResponseHeaders: noStore,
  responses: [{ kind: 'json', status: 201, schema: responseSchema(agentPoolKeys) }],
  refusals: [
    ...common,
    malformed,
    { status: 409, schema: responseSchema(type({ error: "'name_taken'" })) },
    {
      status: 409,
      schema: responseSchema(
        type({ error: "'agent_person_limit'", cap: 'number', current: 'number', added: 'number' }),
      ),
    },
  ],
  document: {
    summary: 'Create an agent pool: N agent persons with one API key each, shown once.',
  },
});

/**
 * Revokes every live key of a live pool and issues one fresh key per pool
 * person holding a live pool key in one act, creating no person, so the
 * agent-person cap is not consumed again; an agent whose key was revoked alone
 * stays keyless. The new keys are answered once as {@link agentPoolKeys}.
 * `expiresAt`, when given, replaces the pool's within the same 90-day bound as
 * a new pool's; without it, a pool past its expiry is `pool_expired`. A
 * revoked pool or another organization's is `not_found`; a pool person removed
 * while the keys were being minted is `pool_changed`. A refusal writes nothing.
 */
export const rekeyAgentPool = defineEndpointShape({
  method: 'POST',
  path: '/api/organization/agent-pools/:id/rekey',
  operationId: 'postApiOrganizationAgent-poolsByIdRekey',
  humanOnly: true,
  policies: [...writePolicy, { kind: 'organization-resource', operation: 'mutation' }],
  params: requestSchema(type({ id: 'string' })),
  body: requestSchema(type({ 'expiresAt?': 'number.integer' })),
  defaultResponseHeaders: noStore,
  responses: [{ kind: 'json', status: 201, schema: responseSchema(agentPoolKeys) }],
  refusals: [
    ...common,
    malformed,
    notFound,
    { status: 409, schema: responseSchema(type({ error: "'last_super_admin'" })) },
    { status: 409, schema: responseSchema(type({ error: "'pool_changed' | 'pool_expired'" })) },
  ],
  document: { summary: 'Re-key an agent pool for its existing persons, shown once.' },
});

/**
 * Revokes a live pool and every live key of it in one act, ending their
 * leases; the claims are released with reason `credential revoked`.
 * `removePersons=true` then removes the pool's persons through the
 * `deletePerson` cascade, which releases the agent-person cap; when that
 * removal is refused the pool stays revoked, its persons stay, and the answer
 * is `persons_not_removed` with the pool and how many keys were revoked.
 */
export const revokeAgentPool = defineEndpointShape({
  method: 'DELETE',
  path: '/api/organization/agent-pools/:id',
  operationId: 'deleteApiOrganizationAgent-poolsById',
  humanOnly: true,
  policies: [...writePolicy, { kind: 'organization-resource', operation: 'mutation' }],
  params: requestSchema(type({ id: 'string' })),
  query: requestSchema(type({ 'removePersons?': "'true' | 'false'" })),
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(
        type({ poolId: 'string', revokedCredentials: 'number', removedPersons: 'number' }),
      ),
    },
  ],
  refusals: [
    ...common,
    malformed,
    notFound,
    { status: 409, schema: responseSchema(type({ error: "'last_super_admin'" })) },
    {
      status: 409,
      schema: responseSchema(
        type({
          error: "'persons_not_removed'",
          poolId: 'string',
          revokedCredentials: 'number',
          'cause?': "'last_super_admin'",
        }).or(
          type({
            error: "'persons_not_removed'",
            poolId: 'string',
            revokedCredentials: 'number',
            cause: "'forbidden'",
            // Proof: pool-schema-partial-permission: omitting the required catalog permission schema.
            // requires a catalog permission only for a forbidden pool cleanup cause
            // Named RED with this fault; restored GREEN (task-2.4b pool receipt).
            permission: type.enumerated(...PERMISSIONS.map(({ id }) => id)),
          }),
        ),
      ),
    },
  ],
  document: { summary: 'Revoke an agent pool and, optionally, remove its persons.' },
});
