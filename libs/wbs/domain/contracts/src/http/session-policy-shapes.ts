import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { organizationContextRefusal, organizationRefusal } from './organization-refusal';
import { requestSchema, responseSchema } from './schema-shape';

/**
 * An organization's session bounds in seconds (`organization-session-policy`);
 * null is no bound, and a policy with neither bound is no policy.
 */
const sessionPolicy = type({
  maxSessionSeconds: 'number | null',
  reauthenticateAfterSeconds: 'number | null',
});
const policyReply = responseSchema(type({ policy: sessionPolicy.or('null') }));

/** Reads the active organization's session policy, for its super-admins. */
export const readSessionPolicy = defineEndpointShape({
  method: 'GET',
  path: '/api/organization/session-policy',
  operationId: 'getApiOrganizationSession-policy',
  policies: [
    { kind: 'organization-resource', operation: 'read' },
    { kind: 'identity', require: 'signed-in' },
  ],
  responses: [{ kind: 'json', status: 200, schema: policyReply }],
  refusals: [
    { status: 400, schema: responseSchema(type({ error: "'invalid_query' | 'invalid_body'" })) },
    { status: 401, schema: responseSchema(type({ error: "'unauthenticated'" })) },
    organizationRefusal,
    organizationContextRefusal,
    { status: 403, schema: responseSchema(type({ error: "'insufficient_scope'" })) },
    { status: 403, schema: responseSchema(type({ error: "'forbidden'" })) },
  ],
  document: { summary: 'Read the active organization session policy.' },
});

/** Sets, replaces or clears (both bounds null) the active organization's session policy. */
export const setSessionPolicy = defineEndpointShape({
  method: 'PUT',
  path: '/api/organization/session-policy',
  operationId: 'putApiOrganizationSession-policy',
  policies: [
    { kind: 'organization-resource', operation: 'mutation' },
    { kind: 'origin', when: 'always-unsafe-with-session-cookie' },
    { kind: 'identity', require: 'write-scope' },
  ],
  body: requestSchema(sessionPolicy),
  responses: [{ kind: 'json', status: 200, schema: policyReply }],
  refusals: [
    {
      status: 400,
      schema: responseSchema(type({ error: "'invalid_json' | 'invalid_body' | 'invalid_query'" })),
    },
    { status: 401, schema: responseSchema(type({ error: "'unauthenticated'" })) },
    organizationRefusal,
    organizationContextRefusal,
    {
      status: 403,
      schema: responseSchema(type({ error: "'invalid_origin' | 'insufficient_scope'" })),
    },
    { status: 403, schema: responseSchema(type({ error: "'forbidden'" })) },
  ],
  document: { summary: 'Set or clear the active organization session policy.' },
});
