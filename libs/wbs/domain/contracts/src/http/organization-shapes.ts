import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { organizationRefusal } from './organization-refusal';
import { requestSchema, responseSchema } from './schema-shape';

/** A membership role as the wire carries it, `stored-vocabularies`' `ORGANIZATION_ROLES`. */
const role = "'super_admin' | 'admin' | 'member' | 'viewer'";
const memberParams = requestSchema(type({ userId: 'string' }));
const policies = [
  { kind: 'origin', when: 'always-unsafe-with-session-cookie' },
  { kind: 'identity', require: 'write-scope' },
] as const;
const refusals = [
  { status: 400, schema: responseSchema(type({ error: "'invalid_params' | 'invalid_query'" })) },
  { status: 401, schema: responseSchema(type({ error: "'unauthenticated'" })) },
  {
    status: 403,
    schema: responseSchema(type({ error: "'invalid_origin' | 'insufficient_scope'" })),
  },
  organizationRefusal,
  // The role matrix refuses this change to this caller.
  { status: 403, schema: responseSchema(type({ error: "'forbidden'" })) },
  // No membership of that user in the caller's active organization.
  { status: 404, schema: responseSchema(type({ error: "'not_found'" })) },
  // The change would leave the organization without a super-admin.
  { status: 409, schema: responseSchema(type({ error: "'last_super_admin'" })) },
] as const;

/**
 * Changes one member's role in the caller's active organization, which comes
 * from the server-validated session alone: no organization id is accepted from
 * the request. Answered only after organization activation.
 */
export const changeMemberRole = defineEndpointShape({
  method: 'PATCH',
  path: '/api/organization/members/:userId',
  operationId: 'patchApiOrganizationMembersByUserId',
  policies,
  params: memberParams,
  body: requestSchema(type({ role })),
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(type({ membership: { userId: 'string', role } })),
    },
  ],
  refusals: [
    ...refusals,
    { status: 400, schema: responseSchema(type({ error: "'invalid_json' | 'invalid_body'" })) },
  ],
  document: { summary: "Change a member's role in the active organization." },
});

/** Removes one member from the caller's active organization; see {@link changeMemberRole}. */
export const removeMember = defineEndpointShape({
  method: 'DELETE',
  path: '/api/organization/members/:userId',
  operationId: 'deleteApiOrganizationMembersByUserId',
  policies,
  params: memberParams,
  responses: [{ kind: 'empty', status: 204 }],
  refusals,
  document: { summary: 'Remove a member from the active organization.' },
});

/**
 * Lists the members of the caller's active organization for an administrator.
 * Only admin and super-admin may read it (the invitation gate); a member or
 * viewer is refused `forbidden`, and a delegated caller `insufficient_scope`.
 * Answered only after organization activation.
 */
export const listMembers = defineEndpointShape({
  method: 'GET',
  path: '/api/organization/members',
  operationId: 'getApiOrganizationMembers',
  policies: [{ kind: 'identity', require: 'signed-in' }],
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(
        type({
          members: type({
            userId: 'string',
            username: 'string',
            email: 'string | null',
            role,
            createdAt: 'number',
          }).array(),
        }),
      ),
    },
  ],
  refusals: [
    { status: 400, schema: responseSchema(type({ error: "'invalid_query' | 'invalid_body'" })) },
    { status: 401, schema: responseSchema(type({ error: "'unauthenticated'" })) },
    {
      status: 403,
      schema: responseSchema(type({ error: "'insufficient_scope' | 'onboarding_inactive'" })),
    },
    organizationRefusal,
    { status: 403, schema: responseSchema(type({ error: "'forbidden'" })) },
  ],
  document: { summary: 'List members of the active organization.' },
});
