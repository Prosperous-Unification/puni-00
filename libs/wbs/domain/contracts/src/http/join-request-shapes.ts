import { INITIAL_ACCESS_ROLES, PERMISSIONS } from '@wbs/domain/access-role';
import { type } from 'arktype';

import { defineEndpointShape, type EndpointShape } from './endpoint-shape';
import { organizationContextRefusal, organizationRefusal } from './organization-refusal';
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
  {
    status: 403,
    schema: responseSchema(
      type({
        error: "'forbidden'",
        'permission?': type.enumerated(...PERMISSIONS.map(({ id }) => id)),
      }),
    ),
  },
  organizationRefusal,
  organizationContextRefusal,
  { status: 404, schema: responseSchema(type({ error: "'not_found'" })) },
  { status: 409, schema: responseSchema(type({ error: "'request_resolved' | 'domain_changed'" })) },
] as const satisfies EndpointShape['refusals'];

/** Lists pending and resolved requests in the active organization. */
export const listJoinRequests = defineEndpointShape({
  method: 'GET',
  path: '/api/organization/join-requests',
  operationId: 'getApiOrganizationJoinRequests',
  humanOnly: true,
  policies: [...readPolicies, { kind: 'organization-resource', operation: 'read' }],
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

/** Resolves a pending request with an explicitly selected initial-access offer or none. */
export const approveJoinRequest = defineEndpointShape({
  method: 'POST',
  path: '/api/organization/join-requests/:id/approve',
  operationId: 'postApiOrganizationJoinRequestsByIdApprove',
  humanOnly: true,
  policies: [...writePolicies, { kind: 'organization-resource', operation: 'mutation' }],
  params: requestSchema(type({ id: 'string' })),
  body: requestSchema(
    type({ 'initialRoleId?': type.enumerated(...INITIAL_ACCESS_ROLES).or('null') }),
  ),
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
  humanOnly: true,
  policies: [...writePolicies, { kind: 'organization-resource', operation: 'mutation' }],
  params: requestSchema(type({ id: 'string' })),
  responses: [{ kind: 'empty', status: 204 }],
  refusals,
  document: { summary: 'Deny a join request.' },
});
