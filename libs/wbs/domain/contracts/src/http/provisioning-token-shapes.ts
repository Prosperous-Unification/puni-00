import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { organizationContextRefusal, organizationRefusal } from './organization-refusal';
import { requestSchema, responseSchema } from './schema-shape';

const readPolicy = [{ kind: 'identity', require: 'signed-in' }] as const;
const writePolicy = [
  { kind: 'origin', when: 'always-unsafe-with-session-cookie' },
  { kind: 'identity', require: 'write-scope' },
] as const;
const unauthenticated = {
  status: 401,
  schema: responseSchema(type({ error: "'unauthenticated'" })),
} as const;
const forbidden = { status: 403, schema: responseSchema(type({ error: "'forbidden'" })) } as const;
const writeScope = {
  status: 403,
  schema: responseSchema(type({ error: "'invalid_origin' | 'insufficient_scope'" })),
} as const;
const notFound = { status: 404, schema: responseSchema(type({ error: "'not_found'" })) } as const;
const unissuable = {
  status: 409,
  schema: responseSchema(type({ error: "'sso_connection_unproven' | 'token_limit'" })),
} as const;

/** A token as listed: never its secret or digest. */
const tokenSummary = type({
  id: 'string',
  createdAt: 'number',
  expiresAt: 'number | null',
  revokedAt: 'number | null',
});

/**
 * Lists the active organization's SCIM provisioning tokens for a current
 * super-admin (`organization-scim`).
 */
export const listProvisioningTokens = defineEndpointShape({
  method: 'GET',
  path: '/api/organization/provisioning-tokens',
  operationId: 'getApiOrganizationProvisioningTokens',
  humanOnly: true,
  policies: [...readPolicy, { kind: 'organization-resource', operation: 'read' }],
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(type({ tokens: tokenSummary.array() })),
    },
  ],
  refusals: [
    unauthenticated,
    { status: 403, schema: responseSchema(type({ error: "'insufficient_scope'" })) },
    organizationRefusal,
    organizationContextRefusal,
    { status: 400, schema: responseSchema(type({ error: "'invalid_query' | 'invalid_body'" })) },
    forbidden,
  ],
  document: { summary: 'List SCIM provisioning tokens in the active organization.' },
});

/**
 * Issues a provisioning token. The secret is in this response only; storage
 * keeps its SHA-256 digest. Needs a proven enterprise connection and fewer
 * than two live tokens.
 */
export const issueProvisioningToken = defineEndpointShape({
  method: 'POST',
  path: '/api/organization/provisioning-tokens',
  operationId: 'postApiOrganizationProvisioningTokens',
  humanOnly: true,
  policies: [...writePolicy, { kind: 'organization-resource', operation: 'mutation' }],
  responses: [
    {
      kind: 'json',
      status: 201,
      schema: responseSchema(type({ id: 'string', token: 'string', createdAt: 'number' })),
    },
  ],
  refusals: [
    { status: 400, schema: responseSchema(type({ error: "'invalid_query' | 'invalid_body'" })) },
    unauthenticated,
    organizationRefusal,
    organizationContextRefusal,
    writeScope,
    forbidden,
    unissuable,
  ],
  document: { summary: 'Issue a SCIM provisioning token, shown once.' },
});

/**
 * Issues a successor and makes the rotated token expire 24 hours later; the
 * successor's secret is in this response only.
 */
export const rotateProvisioningToken = defineEndpointShape({
  method: 'POST',
  path: '/api/organization/provisioning-tokens/:id/rotate',
  operationId: 'postApiOrganizationProvisioningTokensByIdRotate',
  humanOnly: true,
  policies: [...writePolicy, { kind: 'organization-resource', operation: 'mutation' }],
  params: requestSchema(type({ id: 'string' })),
  responses: [
    {
      kind: 'json',
      status: 201,
      schema: responseSchema(
        type({ id: 'string', token: 'string', createdAt: 'number', previousExpiresAt: 'number' }),
      ),
    },
  ],
  refusals: [
    // Proof: with this file's stray-input codes undeclared, be-01's audit `answers every
    // request-boundary failure the mount can raise with a declared 4xx` listed
    // the provisioning-token rotate and revoke `invalid_body` (watched 2026-10-24); it guards each widened 400 here.
    {
      status: 400,
      schema: responseSchema(
        type({ error: "'invalid_params' | 'invalid_query' | 'invalid_body'" }),
      ),
    },
    unauthenticated,
    organizationRefusal,
    organizationContextRefusal,
    writeScope,
    forbidden,
    notFound,
    unissuable,
  ],
  document: { summary: 'Rotate a SCIM provisioning token with a 24-hour overlap.' },
});

/** Revokes a live provisioning token at once. */
export const revokeProvisioningToken = defineEndpointShape({
  method: 'DELETE',
  path: '/api/organization/provisioning-tokens/:id',
  operationId: 'deleteApiOrganizationProvisioningTokensById',
  humanOnly: true,
  policies: [...writePolicy, { kind: 'organization-resource', operation: 'mutation' }],
  params: requestSchema(type({ id: 'string' })),
  responses: [{ kind: 'empty', status: 204 }],
  refusals: [
    {
      status: 400,
      schema: responseSchema(
        type({ error: "'invalid_params' | 'invalid_query' | 'invalid_body'" }),
      ),
    },
    unauthenticated,
    organizationRefusal,
    organizationContextRefusal,
    writeScope,
    forbidden,
    notFound,
  ],
  document: { summary: 'Revoke a SCIM provisioning token immediately.' },
});
