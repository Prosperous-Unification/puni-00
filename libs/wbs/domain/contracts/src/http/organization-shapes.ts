import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { organizationContextRefusal, organizationRefusal } from './organization-refusal';
import { requestSchema, responseSchema } from './schema-shape';

/** A membership role as the wire carries it, `stored-vocabularies`' `ORGANIZATION_ROLES`. */
const role = "'super_admin' | 'admin' | 'member' | 'viewer'";
/**
 * One current membership the signed-in credential may choose. `ssoRequired`
 * marks an organization whose enforced SSO this credential cannot enter, so a
 * switcher shows it locked instead of failing on click (`organization-sso`).
 */
const selectableMembership = type({
  organizationId: 'string',
  name: 'string',
  role,
  ssoRequired: 'boolean',
});
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
  organizationContextRefusal,
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
  humanOnly: true,
  policies: [...policies, { kind: 'organization-resource', operation: 'mutation' }],
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
  humanOnly: true,
  policies: [...policies, { kind: 'organization-resource', operation: 'mutation' }],
  params: memberParams,
  responses: [{ kind: 'empty', status: 204 }],
  refusals: [
    ...refusals,
    // Proof: with this file's stray-input codes undeclared, be-01's audit `answers every
    // request-boundary failure the mount can raise with a declared 4xx` listed
    // `deleteApiOrganizationMembersByUserId invalid_body` (watched 2026-10-24); it guards each widened 400 here.
    { status: 400, schema: responseSchema(type({ error: "'invalid_body'" })) },
  ],
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
  humanOnly: true,
  policies: [
    { kind: 'organization-resource', operation: 'read' },
    { kind: 'identity', require: 'signed-in' },
  ],
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
    organizationContextRefusal,
    { status: 403, schema: responseSchema(type({ error: "'forbidden'" })) },
  ],
  document: { summary: 'List members of the active organization.' },
});

/** Lists current choices without silently selecting even a sole membership. */
export const listOrganizationMemberships = defineEndpointShape({
  method: 'GET',
  path: '/api/organization/memberships',
  operationId: 'getApiOrganizationMemberships',
  humanOnly: true,
  policies: [{ kind: 'organization-control' }, { kind: 'identity', require: 'signed-in' }],
  defaultResponseHeaders: [
    ['cache-control', 'no-store'],
    ['vary', 'Cookie, Authorization'],
  ],
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(
        type({
          state: "'onboarding_required' | 'selection_required'",
          memberships: selectableMembership.array(),
        }),
      ),
    },
  ],
  refusals: [
    // Proof: omitting this adapter refusal made the full GET-shape contract
    // audit fail for getApiOrganizationMemberships (431/432 on h2puni).
    { status: 400, schema: responseSchema(type({ error: "'invalid_body' | 'invalid_query'" })) },
    { status: 401, schema: responseSchema(type({ error: "'unauthenticated'" })) },
    {
      status: 403,
      schema: responseSchema(type({ error: "'onboarding_inactive' | 'insufficient_scope'" })),
    },
  ],
  document: { summary: 'List the signed-in account’s current organization choices.' },
});

/** Explicitly selects a current membership for this exact access credential. */
export const selectActiveOrganization = defineEndpointShape({
  method: 'POST',
  path: '/api/organization/active',
  operationId: 'postApiOrganizationActive',
  policies: [
    { kind: 'organization-control' },
    // Proof: the cookie-conditional policy let a bearer-only POST with no
    // Origin issue a selection cookie (mounted selection negative, 0/1).
    { kind: 'origin', when: 'always' },
    { kind: 'identity', require: 'signed-in' },
  ],
  defaultResponseHeaders: [
    ['cache-control', 'no-store'],
    ['vary', 'Cookie, Authorization'],
  ],
  body: requestSchema(type({ organizationId: 'string' })),
  responses: [
    { kind: 'json', status: 200, schema: responseSchema(type({ organizationId: 'string' })) },
  ],
  refusals: [
    {
      status: 400,
      schema: responseSchema(type({ error: "'invalid_body' | 'invalid_json' | 'invalid_query'" })),
    },
    { status: 401, schema: responseSchema(type({ error: "'unauthenticated'" })) },
    {
      status: 403,
      schema: responseSchema(
        type({
          error: "'onboarding_inactive' | 'not_a_member' | 'insufficient_scope' | 'invalid_origin'",
        }),
      ),
    },
    // Enforced SSO or a session policy refusing this credential in the
    // selected organization only (`organization-sso`, `organization-session-policy`).
    organizationRefusal,
    organizationContextRefusal,
  ],
  document: { summary: 'Bind a current organization to this browser access credential.' },
});

/** Reads the current browser binding without choosing a membership or changing cookies. */
export const readActiveOrganization = defineEndpointShape({
  method: 'GET',
  path: '/api/organization/active',
  operationId: 'getApiOrganizationActive',
  // Proof: removing no-store failed current-context discovery's mounted
  // cache-header assertion; watched 2026-10-13.
  policies: [{ kind: 'identity', require: 'signed-in' }, { kind: 'organization-control' }],
  defaultResponseHeaders: [
    ['cache-control', 'no-store'],
    ['vary', 'Cookie, Authorization'],
  ],
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(type({ organizationId: 'string', name: 'string', role })),
    },
  ],
  refusals: [
    { status: 400, schema: responseSchema(type({ error: "'invalid_query' | 'invalid_body'" })) },
    { status: 401, schema: responseSchema(type({ error: "'unauthenticated'" })) },
    {
      status: 403,
      schema: responseSchema(type({ error: "'onboarding_inactive' | 'insufficient_scope'" })),
    },
    organizationRefusal,
    organizationContextRefusal,
  ],
  document: { summary: 'Read the currently bound organization for this browser credential.' },
});
