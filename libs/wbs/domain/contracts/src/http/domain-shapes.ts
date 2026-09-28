import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { organizationRefusal } from './organization-refusal';
import { requestSchema, responseSchema } from './schema-shape';

const readPolicy = [{ kind: 'identity', require: 'signed-in' }] as const;
const writePolicy = [
  { kind: 'origin', when: 'always-unsafe-with-session-cookie' },
  { kind: 'identity', require: 'write-scope' },
] as const;
const common = [
  { status: 401, schema: responseSchema(type({ error: "'unauthenticated'" })) },
  { status: 403, schema: responseSchema(type({ error: "'insufficient_scope'" })) },
  organizationRefusal,
] as const;

/** Lists the active organization's exact domain claims without challenge secrets. */
export const listOrganizationDomains = defineEndpointShape({
  method: 'GET',
  path: '/api/organization/domains',
  operationId: 'getApiOrganizationDomains',
  policies: readPolicy,
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(
        type({
          domains: type({
            id: 'string',
            domain: 'string',
            status: "'pending' | 'verified' | 'suspended'",
            challengeExpiresAt: 'number | null',
            lastSuccessAt: 'number | null',
            lastCheckedAt: 'number | null',
            proofWarning: 'boolean',
          }).array(),
        }),
      ),
    },
  ],
  refusals: [
    ...common,
    { status: 400, schema: responseSchema(type({ error: "'invalid_query'" })) },
    { status: 403, schema: responseSchema(type({ error: "'forbidden'" })) },
  ],
  document: { summary: 'List domain claims in the active organization.' },
});

/** Issues or reissues one 24-hour TXT challenge for a current super-admin. */
export const createDomainChallenge = defineEndpointShape({
  method: 'POST',
  path: '/api/organization/domains/challenges',
  operationId: 'postApiOrganizationDomainsChallenges',
  policies: writePolicy,
  body: requestSchema(type({ domain: 'string' })),
  responses: [
    {
      kind: 'json',
      status: 201,
      schema: responseSchema(
        type({
          id: 'string',
          domain: 'string',
          dnsName: 'string',
          dnsValue: 'string',
          expiresAt: 'number',
        }),
      ),
    },
  ],
  refusals: [
    { status: 401, schema: responseSchema(type({ error: "'unauthenticated'" })) },
    organizationRefusal,
    {
      status: 400,
      schema: responseSchema(type({ error: "'invalid_json' | 'invalid_body' | 'invalid_domain'" })),
    },
    {
      status: 403,
      schema: responseSchema(type({ error: "'invalid_origin' | 'insufficient_scope'" })),
    },
    { status: 403, schema: responseSchema(type({ error: "'forbidden'" })) },
    { status: 409, schema: responseSchema(type({ error: "'unclaimable' | 'already_claimed'" })) },
  ],
  document: { summary: 'Issue an exact-domain TXT challenge.' },
});

/** Verifies one pending claim against authoritative TXT evidence. */
export const verifyDomainClaim = defineEndpointShape({
  method: 'POST',
  path: '/api/organization/domains/:id/verify',
  operationId: 'postApiOrganizationDomainsByIdVerify',
  policies: writePolicy,
  params: requestSchema(type({ id: 'string' })),
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(type({ id: 'string', status: "'verified'" })),
    },
  ],
  refusals: [
    { status: 400, schema: responseSchema(type({ error: "'invalid_params' | 'invalid_query'" })) },
    { status: 401, schema: responseSchema(type({ error: "'unauthenticated'" })) },
    organizationRefusal,
    {
      status: 403,
      schema: responseSchema(type({ error: "'invalid_origin' | 'insufficient_scope'" })),
    },
    { status: 403, schema: responseSchema(type({ error: "'forbidden'" })) },
    { status: 404, schema: responseSchema(type({ error: "'not_found'" })) },
    {
      status: 409,
      schema: responseSchema(type({ error: "'stale' | 'proof_mismatch' | 'domain_taken'" })),
    },
    { status: 503, schema: responseSchema(type({ error: "'dns_unavailable'" })) },
  ],
  document: { summary: 'Verify a pending domain claim with authoritative DNS.' },
});

/** Issues a fresh TXT proof while retaining the previous one for at most 24 hours. */
export const rotateDomainProof = defineEndpointShape({
  method: 'POST',
  path: '/api/organization/domains/:id/rotate',
  operationId: 'postApiOrganizationDomainsByIdRotate',
  policies: writePolicy,
  params: requestSchema(type({ id: 'string' })),
  responses: [
    {
      kind: 'json',
      status: 201,
      schema: responseSchema(
        type({
          id: 'string',
          domain: 'string',
          dnsName: 'string',
          dnsValue: 'string',
          expiresAt: 'number',
        }),
      ),
    },
  ],
  refusals: [
    { status: 400, schema: responseSchema(type({ error: "'invalid_params' | 'invalid_query'" })) },
    { status: 401, schema: responseSchema(type({ error: "'unauthenticated'" })) },
    organizationRefusal,
    {
      status: 403,
      schema: responseSchema(type({ error: "'invalid_origin' | 'insufficient_scope'" })),
    },
    { status: 403, schema: responseSchema(type({ error: "'forbidden'" })) },
    { status: 404, schema: responseSchema(type({ error: "'not_found'" })) },
    { status: 409, schema: responseSchema(type({ error: "'stale'" })) },
  ],
  document: { summary: 'Rotate an owned domain TXT proof.' },
});
