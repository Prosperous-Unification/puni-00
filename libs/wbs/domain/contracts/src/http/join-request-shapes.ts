import { type } from 'arktype';

import { defineEndpointShape, type EndpointShape } from './endpoint-shape';
import { organizationRefusal } from './organization-refusal';
import { requestSchema, responseSchema } from './schema-shape';

const readPolicies = [{ kind: 'identity', require: 'signed-in' }] as const;
const writePolicies = [
  { kind: 'origin', when: 'always' },
  { kind: 'identity', require: 'write-scope' },
] as const;
const refusals = [
  {
    status: 400,
    schema: responseSchema(
      type({ error: "'invalid_query' | 'invalid_body' | 'invalid_json' | 'invalid_params'" }),
    ),
  },
  { status: 401, schema: responseSchema(type({ error: "'unauthenticated'" })) },
  {
    status: 403,
    schema: responseSchema(
      type({ error: "'insufficient_scope' | 'invalid_origin' | 'onboarding_inactive'" }),
    ),
  },
  { status: 403, schema: responseSchema(type({ error: "'forbidden'" })) },
  organizationRefusal,
  { status: 404, schema: responseSchema(type({ error: "'not_found'" })) },
  { status: 409, schema: responseSchema(type({ error: "'request_resolved' | 'domain_changed'" })) },
] as const satisfies EndpointShape['refusals'];

/** Lists pending and resolved requests in the active organization. */
export const listJoinRequests = defineEndpointShape({
  method: 'GET',
  path: '/api/organization/join-requests',
  operationId: 'getApiOrganizationJoinRequests',
  policies: readPolicies,
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(
        type({
          requests: type({
            id: 'string',
            email: 'string',
            status: "'pending' | 'approved' | 'denied'",
            createdAt: 'number',
          }).array(),
        }),
      ),
    },
  ],
  refusals,
  document: { summary: 'List join requests in the active organization.' },
});

/** Resolves a pending request by issuing one viewer or member invitation. */
export const approveJoinRequest = defineEndpointShape({
  method: 'POST',
  path: '/api/organization/join-requests/:id/approve',
  operationId: 'postApiOrganizationJoinRequestsByIdApprove',
  policies: writePolicies,
  params: requestSchema(type({ id: 'string' })),
  // Proof: 2026-09-28, admitting `admin` failed `rejects an admin approval role at the HTTP boundary` (400 became success).
  body: requestSchema(type({ role: "'viewer' | 'member'" })),
  responses: [
    { kind: 'json', status: 200, schema: responseSchema(type({ invitationId: 'string' })) },
  ],
  refusals: [
    ...refusals,
    { status: 503, schema: responseSchema(type({ error: "'delivery_failed'" })) },
  ],
  document: { summary: 'Approve a join request with an addressed invitation.' },
});

/** Denies a pending request without granting membership. */
export const denyJoinRequest = defineEndpointShape({
  method: 'POST',
  path: '/api/organization/join-requests/:id/deny',
  operationId: 'postApiOrganizationJoinRequestsByIdDeny',
  policies: writePolicies,
  params: requestSchema(type({ id: 'string' })),
  responses: [{ kind: 'empty', status: 204 }],
  refusals,
  document: { summary: 'Deny a join request.' },
});
