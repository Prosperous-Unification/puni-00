import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { organizationRefusal } from './organization-refusal';
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
  policies: readPolicy,
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
  policies: writePolicy,
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
  policies: writePolicy,
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
    { status: 400, schema: responseSchema(type({ error: "'invalid_params' | 'invalid_query'" })) },
    unauthenticated,
    organizationRefusal,
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
  policies: writePolicy,
  params: requestSchema(type({ id: 'string' })),
  responses: [{ kind: 'empty', status: 204 }],
  refusals: [
    { status: 400, schema: responseSchema(type({ error: "'invalid_params' | 'invalid_query'" })) },
    unauthenticated,
    organizationRefusal,
    writeScope,
    forbidden,
    notFound,
  ],
  document: { summary: 'Revoke a SCIM provisioning token immediately.' },
});
