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
          }).array(),
        }),
      ),
    },
  ],
  refusals: [
    ...common,
    { status: 400, schema: responseSchema(type({ error: "'invalid_query' | 'invalid_body'" })) },
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
