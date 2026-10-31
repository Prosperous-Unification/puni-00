import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { organizationContextRefusal, organizationRefusal } from './organization-refusal';
import { requestSchema, responseSchema } from './schema-shape';

/** The Auth0 connection name an enterprise connection records. */
const auth0Connection = type('string').matching(/^[A-Za-z0-9-]{1,128}$/);
/** The slug `GET /api/auth/login?organization=` routes by. */
export const enterpriseLoginSlug = type('string').matching(/^[a-z0-9-]{3,63}$/);
const strategy = "'samlp' | 'oidc'";

/** One enterprise connection as a super-admin sees it (`organization-sso`). */
const ssoConnection = type({
  id: 'string',
  domainClaimId: 'string',
  domain: 'string',
  auth0Connection: 'string',
  strategy,
  loginSlug: 'string',
  enforced: 'boolean',
  provenAt: 'number | null',
  provenBy: 'string | null',
  lastPrefixMismatchAt: 'number | null',
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
  {
    status: 403,
    schema: responseSchema(type({ error: "'invalid_origin' | 'insufficient_scope'" })),
  },
  // Only a current super-admin administers enterprise SSO.
  { status: 403, schema: responseSchema(type({ error: "'forbidden'" })) },
] as const;
const malformed = {
  status: 400,
  schema: responseSchema(
    type({ error: "'invalid_json' | 'invalid_body' | 'invalid_params' | 'invalid_query'" }),
  ),
} as const;
const notFound = { status: 404, schema: responseSchema(type({ error: "'not_found'" })) } as const;

/** Lists the active organization's enterprise connections for a current super-admin. */
export const listSsoConnections = defineEndpointShape({
  method: 'GET',
  path: '/api/organization/sso-connections',
  operationId: 'getApiOrganizationSso-connections',
  humanOnly: true,
  policies: [...readPolicy, { kind: 'organization-resource', operation: 'read' }],
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(type({ connections: ssoConnection.array() })),
    },
  ],
  refusals: [...common, malformed],
  document: { summary: 'List the enterprise connections of the active organization.' },
});

/**
 * Records one unproven, unenforced connection on a verified claim of the
 * active organization. A claim of another organization answers 404.
 */
export const createSsoConnection = defineEndpointShape({
  method: 'POST',
  path: '/api/organization/sso-connections',
  operationId: 'postApiOrganizationSso-connections',
  humanOnly: true,
  policies: [...writePolicy, { kind: 'organization-resource', operation: 'mutation' }],
  body: requestSchema(
    type({ domainClaimId: 'string', auth0Connection, strategy, loginSlug: enterpriseLoginSlug }),
  ),
  responses: [
    { kind: 'json', status: 201, schema: responseSchema(type({ connection: ssoConnection })) },
  ],
  refusals: [
    ...common,
    malformed,
    notFound,
    {
      status: 409,
      schema: responseSchema(
        type({ error: "'domain_not_verified' | 'sso_connection_exists' | 'login_slug_taken'" }),
      ),
    },
  ],
  document: { summary: 'Record an enterprise connection on a verified domain.' },
});

/**
 * Changes a connection's configuration, or switches its enforcement; one
 * request does one of the two, so neither half can commit without the other.
 * A new Auth0 connection name or strategy clears an earlier proof.
 */
export const updateSsoConnection = defineEndpointShape({
  method: 'PATCH',
  path: '/api/organization/sso-connections/:id',
  operationId: 'patchApiOrganizationSso-connectionsById',
  humanOnly: true,
  policies: [...writePolicy, { kind: 'organization-resource', operation: 'mutation' }],
  params: requestSchema(type({ id: 'string' })),
  body: requestSchema(
    type({
      'auth0Connection?': auth0Connection,
      'strategy?': strategy,
      'loginSlug?': enterpriseLoginSlug,
      'enforced?': 'boolean',
    }),
  ),
  responses: [
    { kind: 'json', status: 200, schema: responseSchema(type({ connection: ssoConnection })) },
  ],
  refusals: [
    ...common,
    malformed,
    notFound,
    {
      status: 409,
      schema: responseSchema(
        type({
          error:
            "'login_slug_taken' | 'sso_connection_unproven' | 'enforcement_would_lock_out_actor'",
        }),
      ),
    },
  ],
  document: { summary: 'Change or enforce an enterprise connection.' },
});

/** Deletes a connection; refused while the organization holds a live provisioning token. */
export const removeSsoConnection = defineEndpointShape({
  method: 'DELETE',
  path: '/api/organization/sso-connections/:id',
  operationId: 'deleteApiOrganizationSso-connectionsById',
  humanOnly: true,
  policies: [...writePolicy, { kind: 'organization-resource', operation: 'mutation' }],
  params: requestSchema(type({ id: 'string' })),
  responses: [{ kind: 'empty', status: 204 }],
  refusals: [
    ...common,
    malformed,
    notFound,
    { status: 409, schema: responseSchema(type({ error: "'provisioning_active'" })) },
  ],
  document: { summary: 'Delete an enterprise connection.' },
});
