import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { organizationContextRefusal, organizationRefusal } from './organization-refusal';
import { requestSchema, responseSchema } from './schema-shape';

/**
 * One API-key secret as listed: its id and expiry, never the secret or its
 * digest. `expiresAt` is set on the previous secret during a rotation window.
 */
const secretSummary = type({ id: 'string', createdAt: 'number', expiresAt: 'number | null' });

/**
 * One machine credential as listed (`wbs-machine-credentials`): never a
 * secret or a digest. `issuedBy` is the issuing account; `issuer` and
 * `subject` are set for `oidc` only; `secrets` lists an `api_key`'s live
 * secrets; `rotationEndsAt` is the end of an open rotation window, else null.
 */
export const machineCredentialSummary = type({
  id: 'string',
  source: "'api_key' | 'oidc' | 'mcp_consent'",
  name: 'string',
  personId: 'string',
  issuedBy: 'string',
  issuer: 'string | null',
  subject: 'string | null',
  createdAt: 'number',
  lastUsedAt: 'number | null',
  revokedAt: 'number | null',
  rotationEndsAt: 'number | null',
  secrets: secretSummary.array(),
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
  // A delegation or a machine credential never administers credentials.
  {
    status: 403,
    schema: responseSchema(type({ error: "'invalid_origin' | 'insufficient_scope'" })),
  },
  // A viewer, or a member naming another account's agent person.
  { status: 403, schema: responseSchema(type({ error: "'forbidden'" })) },
] as const;
const malformed = {
  status: 400,
  schema: responseSchema(
    type({ error: "'invalid_json' | 'invalid_body' | 'invalid_params' | 'invalid_query'" }),
  ),
} as const;
const notFound = { status: 404, schema: responseSchema(type({ error: "'not_found'" })) } as const;

/**
 * Lists the active organization's unrevoked machine credentials: every one
 * for an admin or super-admin, a member's only for agent persons bound to the
 * member's own account. `personId` narrows to one person; `include=revoked`
 * adds revoked credentials with their `revokedAt`. A viewer is `forbidden`.
 */
export const listMachineCredentials = defineEndpointShape({
  method: 'GET',
  path: '/api/organization/machine-credentials',
  operationId: 'getApiOrganizationMachine-credentials',
  policies: [...readPolicy, { kind: 'organization-resource', operation: 'read' }],
  query: requestSchema(type({ 'personId?': 'string > 0', 'include?': "'revoked'" })),
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(type({ credentials: machineCredentialSummary.array() })),
    },
  ],
  refusals: [...common, malformed],
  document: { summary: 'List the machine credentials of the active organization.' },
});

/**
 * Creates an API-key credential for an agent person of the active
 * organization and answers its key, `wbs_mk_<id>.<secret>`, in this response
 * only; storage keeps the secret's SHA-256 digest. A member may name only an
 * agent person bound to their own account; an admin any agent person.
 */
export const createMachineCredential = defineEndpointShape({
  method: 'POST',
  path: '/api/organization/machine-credentials',
  operationId: 'postApiOrganizationMachine-credentials',
  policies: [...writePolicy, { kind: 'organization-resource', operation: 'mutation' }],
  body: requestSchema(
    type({ source: "'api_key'", name: '0 < string <= 80', personId: 'string > 0' }),
  ),
  responses: [
    {
      kind: 'json',
      status: 201,
      schema: responseSchema(
        type({
          id: 'string',
          source: "'api_key'",
          name: 'string',
          personId: 'string',
          issuedBy: 'string',
          createdAt: 'number',
          key: 'string',
        }),
      ),
    },
  ],
  refusals: [
    ...common,
    malformed,
    { status: 404, schema: responseSchema(type({ error: "'unknown_person'" })) },
    {
      status: 409,
      schema: responseSchema(type({ error: "'person_not_bound'", personId: 'string' })),
    },
    {
      status: 409,
      schema: responseSchema(type({ error: "'account_not_member' | 'name_taken'" })),
    },
  ],
  document: { summary: 'Create an API-key machine credential, its key shown once.' },
});

/**
 * Issues a second secret under the same credential id and gives the previous
 * one 24 hours (`previousExpiresAt`); the new key is in this response only.
 * Only an `api_key` rotates in WBS (`rotation_at_issuer` otherwise), and only
 * once per window (`rotation_in_progress`).
 */
export const rotateMachineCredential = defineEndpointShape({
  method: 'POST',
  path: '/api/organization/machine-credentials/:id/rotate',
  operationId: 'postApiOrganizationMachine-credentialsByIdRotate',
  policies: [...writePolicy, { kind: 'organization-resource', operation: 'mutation' }],
  params: requestSchema(type({ id: 'string' })),
  responses: [
    {
      kind: 'json',
      status: 201,
      schema: responseSchema(
        type({ id: 'string', secretId: 'string', key: 'string', previousExpiresAt: 'number' }),
      ),
    },
  ],
  refusals: [
    ...common,
    malformed,
    notFound,
    {
      status: 409,
      schema: responseSchema(type({ error: "'rotation_in_progress' | 'rotation_at_issuer'" })),
    },
  ],
  document: { summary: 'Rotate an API-key machine credential with a 24-hour overlap.' },
});

/**
 * Revokes a credential at once: every secret and token of it is refused on
 * the next request. A revoked credential, another organization's, or for a
 * member one of another account's agent person, is `not_found`.
 */
export const revokeMachineCredential = defineEndpointShape({
  method: 'DELETE',
  path: '/api/organization/machine-credentials/:id',
  operationId: 'deleteApiOrganizationMachine-credentialsById',
  policies: [...writePolicy, { kind: 'organization-resource', operation: 'mutation' }],
  params: requestSchema(type({ id: 'string' })),
  responses: [{ kind: 'empty', status: 204 }],
  refusals: [...common, malformed, notFound],
  document: { summary: 'Revoke a machine credential immediately.' },
});
