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
/**
 * An OIDC audience, a registration's or a credential's narrowing, that is not
 * WBS's authorization server (`WBS_MCP_AUTHORIZATION_SERVER`) or under it
 * after a `/` (`wbs-mcp-agent-surface` M2, amending A25).
 */
const audienceNotWbs = {
  status: 400,
  schema: responseSchema(type({ error: "'audience_not_wbs'" })),
} as const;

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
  humanOnly: true,
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
 * Creates a credential for an agent person of the active organization. An
 * `api_key` answers its key, `wbs_mk_<id>.<secret>`, in this response only;
 * storage keeps the secret's SHA-256 digest. An `oidc` credential names a
 * trusted issuer of the organization and the exact `subject` its tokens carry
 * (`audience`, when given, is required of them over the issuer's default, and
 * must equal WBS's authorization server or sit under it after a `/`, else
 * `audience_not_wbs`);
 * it holds no secret. A member may name only an agent person bound to their
 * own account; an admin any agent person.
 */
export const createMachineCredential = defineEndpointShape({
  method: 'POST',
  path: '/api/organization/machine-credentials',
  operationId: 'postApiOrganizationMachine-credentials',
  humanOnly: true,
  policies: [...writePolicy, { kind: 'organization-resource', operation: 'mutation' }],
  body: requestSchema(
    type({ source: "'api_key'", name: '0 < string <= 80', personId: 'string > 0' }).or({
      source: "'oidc'",
      name: '0 < string <= 80',
      personId: 'string > 0',
      trustedIssuerId: 'string > 0',
      subject: '0 < string <= 512',
      'audience?': '0 < string <= 512',
    }),
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
        }).or({
          id: 'string',
          source: "'oidc'",
          name: 'string',
          personId: 'string',
          issuedBy: 'string',
          createdAt: 'number',
          trustedIssuerId: 'string',
          issuer: 'string',
          subject: 'string',
          audience: 'string | null',
        }),
      ),
    },
  ],
  refusals: [
    ...common,
    malformed,
    audienceNotWbs,
    { status: 404, schema: responseSchema(type({ error: "'unknown_person'" })) },
    { status: 404, schema: responseSchema(type({ error: "'unknown_trusted_issuer'" })) },
    {
      status: 409,
      schema: responseSchema(type({ error: "'person_not_bound'", personId: 'string' })),
    },
    {
      status: 409,
      schema: responseSchema(
        type({ error: "'account_not_member' | 'name_taken' | 'subject_taken'" }),
      ),
    },
  ],
  document: {
    summary:
      'Create a machine credential: an API key shown once, or an OIDC pair of a trusted issuer.',
  },
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
  humanOnly: true,
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
  humanOnly: true,
  policies: [...writePolicy, { kind: 'organization-resource', operation: 'mutation' }],
  params: requestSchema(type({ id: 'string' })),
  responses: [{ kind: 'empty', status: 204 }],
  refusals: [...common, malformed, notFound],
  document: { summary: 'Revoke a machine credential immediately.' },
});

/** An issuer URL as OIDC defines one: HTTPS, no query, no fragment, short enough to store. */
const issuerUrl = type(/^https:\/\/[^\s?#]+$/).and('string <= 2048');

/**
 * One trusted issuer as listed (`wbs-machine-credentials` A16, A25): the
 * `jwks_uri` discovered at registration, the `audience` its tokens carry (to
 * paste into the IdP's token request), and the count of unrevoked
 * credentials naming it, which refuses its removal.
 */
export const trustedIssuerSummary = type({
  id: 'string',
  issuer: 'string',
  jwksUri: 'string',
  audience: 'string',
  ssoConnectionId: 'string | null',
  createdAt: 'number',
  createdBy: 'string | null',
  machineCredentials: 'number',
});

const trustedIssuerCommon = [
  { status: 401, schema: responseSchema(type({ error: "'unauthenticated'" })) },
  organizationRefusal,
  organizationContextRefusal,
  // A delegation or a machine credential never administers trusted issuers.
  {
    status: 403,
    schema: responseSchema(type({ error: "'invalid_origin' | 'insufficient_scope'" })),
  },
  // A member or a viewer: only an admin trusts an issuer for every person.
  { status: 403, schema: responseSchema(type({ error: "'forbidden'" })) },
] as const;

/**
 * Lists the active organization's trusted issuers, for its admins, with
 * `audienceRoot`: WBS's authorization server, which every new registration's
 * audience must equal or sit under after a `/` (`wbs-mcp-agent-surface` M2).
 */
export const listTrustedIssuers = defineEndpointShape({
  method: 'GET',
  path: '/api/organization/trusted-issuers',
  operationId: 'getApiOrganizationTrusted-issuers',
  humanOnly: true,
  policies: [...readPolicy, { kind: 'organization-resource', operation: 'read' }],
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(
        type({ trustedIssuers: trustedIssuerSummary.array(), audienceRoot: 'string' }),
      ),
    },
  ],
  refusals: [...trustedIssuerCommon, malformed],
  document: { summary: 'List the trusted OIDC issuers of the active organization.' },
});

/**
 * Registers an OIDC issuer whose tokens the organization's `oidc` credentials
 * accept, with the `audience` every such token must carry (A25): it is what
 * tells this organization's registration of a shared public issuer from
 * another's, so `(issuer, audience)` is unique across the deployment
 * (`audience_taken`). It must equal WBS's authorization server
 * (`<MCP_PUBLIC_URL>/oauth`, the list's `audienceRoot`) or sit under it after
 * a `/`, else `audience_not_wbs` (`wbs-mcp-agent-surface` M2, amending A25);
 * `<audienceRoot>/org/<organization id>` is the recommended value. Set it in
 * the IdP's token request (GitHub Actions: `audience` on the OIDC token
 * request). The discovery document is fetched
 * once: it must answer (`issuer_unreachable`), name the same `issuer`
 * (`issuer_mismatch`) and publish a public HTTPS `jwks_uri`. The deployment's
 * own sign-in issuer is `issuer_reserved`; an issuer on a literal IP or a
 * private name is `invalid_body`; an organization holds at most eight
 * (`trusted_issuer_limit`). `ssoConnectionId`, when given, must be a proven
 * `oidc` enterprise connection of the organization; it decides who may
 * register, not what the URL is.
 */
export const registerTrustedIssuer = defineEndpointShape({
  method: 'POST',
  path: '/api/organization/trusted-issuers',
  operationId: 'postApiOrganizationTrusted-issuers',
  humanOnly: true,
  policies: [...writePolicy, { kind: 'organization-resource', operation: 'mutation' }],
  body: requestSchema(
    type({
      issuer: issuerUrl,
      audience: '0 < string <= 512',
      'ssoConnectionId?': 'string > 0',
    }),
  ),
  responses: [{ kind: 'json', status: 201, schema: responseSchema(trustedIssuerSummary) }],
  refusals: [
    ...trustedIssuerCommon,
    malformed,
    audienceNotWbs,
    { status: 404, schema: responseSchema(type({ error: "'unknown_sso_connection'" })) },
    {
      status: 409,
      schema: responseSchema(
        type({
          error:
            "'issuer_unreachable' | 'issuer_mismatch' | 'issuer_reserved' | 'issuer_not_oidc' | 'sso_connection_unproven' | 'issuer_taken' | 'audience_taken' | 'trusted_issuer_limit'",
        }),
      ),
    },
  ],
  document: { summary: 'Trust an OIDC issuer for machine credentials, discovered once.' },
});

/**
 * Removes a trusted issuer; refused `in_use` with the count while unrevoked
 * credentials name it. Revoked credentials naming it are removed with it.
 */
export const removeTrustedIssuer = defineEndpointShape({
  method: 'DELETE',
  path: '/api/organization/trusted-issuers/:id',
  operationId: 'deleteApiOrganizationTrusted-issuersById',
  humanOnly: true,
  policies: [...writePolicy, { kind: 'organization-resource', operation: 'mutation' }],
  params: requestSchema(type({ id: 'string' })),
  responses: [{ kind: 'empty', status: 204 }],
  refusals: [
    ...trustedIssuerCommon,
    malformed,
    notFound,
    {
      status: 409,
      schema: responseSchema(type({ error: "'in_use'", machineCredentials: 'number' })),
    },
  ],
  document: { summary: 'Remove a trusted issuer no live credential names.' },
});
