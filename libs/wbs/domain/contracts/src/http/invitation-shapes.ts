import { INITIAL_ACCESS_ROLES, PERMISSIONS } from '@wbs/domain/access-role';
import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { organizationContextRefusal, organizationRefusal } from './organization-refusal';
import { requestSchema, responseSchema } from './schema-shape';

const writePolicies = [
  { kind: 'origin', when: 'always' },
  { kind: 'identity', require: 'write-scope' },
] as const;
const readPolicies = [{ kind: 'identity', require: 'signed-in' }] as const;
const summary = type({
  id: 'string',
  email: 'string',
  initialRoleId: type.enumerated(...INITIAL_ACCESS_ROLES).or('null'),
  expiresAt: 'number',
  revokedAt: 'number | null',
  consumedAt: 'number | null',
});
const common = [
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
] as const;

/** Lists offers in the session's active organization without exposing token material. */
export const listInvitations = defineEndpointShape({
  method: 'GET',
  path: '/api/organization/invitations',
  operationId: 'getApiOrganizationInvitations',
  humanOnly: true,
  policies: [...readPolicies, { kind: 'organization-resource', operation: 'read' }],
  responses: [
    { kind: 'json', status: 200, schema: responseSchema(type({ invitations: summary.array() })) },
  ],
  refusals: [...common, organizationRefusal, organizationContextRefusal],
  document: { summary: 'List invitations in the active organization.' },
});

/** Creates an addressed offer and sends its token through the injected mail port. */
export const createInvitation = defineEndpointShape({
  method: 'POST',
  path: '/api/organization/invitations',
  operationId: 'postApiOrganizationInvitations',
  humanOnly: true,
  policies: [...writePolicies, { kind: 'organization-resource', operation: 'mutation' }],
  body: requestSchema(
    type({
      email: 'string',
      'initialRoleId?': type.enumerated(...INITIAL_ACCESS_ROLES).or('null'),
    }),
  ),
  responses: [{ kind: 'json', status: 201, schema: responseSchema(type({ invitation: summary })) }],
  refusals: [
    ...common,
    organizationRefusal,
    organizationContextRefusal,
    { status: 503, schema: responseSchema(type({ error: "'delivery_failed'" })) },
  ],
  document: { summary: 'Issue an invitation through the configured mail sink.' },
});

/** Revokes one visible offer without changing any membership. */
export const revokeInvitation = defineEndpointShape({
  method: 'DELETE',
  path: '/api/organization/invitations/:id',
  operationId: 'deleteApiOrganizationInvitationsById',
  humanOnly: true,
  policies: [...writePolicies, { kind: 'organization-resource', operation: 'mutation' }],
  params: requestSchema(type({ id: 'string' })),
  responses: [{ kind: 'empty', status: 204 }],
  refusals: [
    ...common,
    organizationRefusal,
    organizationContextRefusal,
    { status: 404, schema: responseSchema(type({ error: "'not_found'" })) },
    { status: 409, schema: responseSchema(type({ error: "'invitation_invalid'" })) },
  ],
  document: { summary: 'Revoke an invitation in the active organization.' },
});

/** Consumes a token for the signed-in user's current verified address. */
export const acceptInvitation = defineEndpointShape({
  method: 'POST',
  path: '/api/onboarding/invitations/accept',
  operationId: 'postApiOnboardingInvitationsAccept',
  humanOnly: true,
  policies: [...writePolicies, { kind: 'organization-control' }],
  body: requestSchema(type({ token: 'string' })),
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(
        type({
          membership: {
            organizationId: 'string',
          },
        }),
      ),
    },
  ],
  refusals: [
    ...common,
    {
      status: 403,
      schema: responseSchema(
        type({ error: "'recipient_mismatch' | 'email_verification_required'" }),
      ),
    },
    { status: 404, schema: responseSchema(type({ error: "'not_found'" })) },
    { status: 409, schema: responseSchema(type({ error: "'invitation_invalid'" })) },
  ],
  document: { summary: 'Accept one addressed invitation.' },
});
