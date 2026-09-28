import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { requestSchema, responseSchema } from './schema-shape';

const policies = [{ kind: 'identity', require: 'signed-in' }] as const;
// Proof: 2026-09-28, requiring origin only for cookies failed the mounted
// `refuses a foreign origin and malformed or authority-bearing bodies` case.
// Proof: 2026-09-28, downgrading write-scope to signed-in failed `guards every
// registered user-facing mutation with write scope` with a read-only cookie.
const writePolicies = [
  { kind: 'origin', when: 'always' },
  { kind: 'identity', require: 'write-scope' },
] as const;
const member = type({ organizationId: 'string', name: 'string', role: 'string' });
const organization = type({ id: 'string', name: 'string' });
const state = type({ state: "'verification_required'" })
  .or({ state: "'selection_required'", memberships: member.array() })
  .or({ state: "'create_organization'" })
  .or({ state: "'join_organization'", organization, pending: 'boolean' });
const common = [
  {
    status: 400,
    schema: responseSchema(type({ error: "'invalid_query' | 'invalid_body' | 'invalid_json'" })),
  },
  { status: 401, schema: responseSchema(type({ error: "'unauthenticated'" })) },
  {
    status: 403,
    // Proof: 2026-09-28, omitting insufficient_scope made `refuses delegated
    // onboarding discovery and writes` receive 500 for an undeclared refusal.
    schema: responseSchema(type({ error: "'onboarding_inactive' | 'insufficient_scope'" })),
  },
] as const;
const writeRefusals = [
  { status: 400, schema: responseSchema(type({ error: "'invalid_json' | 'invalid_body'" })) },
  {
    status: 403,
    schema: responseSchema(type({ error: "'invalid_origin' | 'email_verification_required'" })),
  },
  { status: 409, schema: responseSchema(type({ error: "'already_member'" })) },
] as const;

/** Discovers a signed-in user's next onboarding state from current durable evidence. */
export const readOnboarding = defineEndpointShape({
  method: 'GET',
  path: '/api/onboarding',
  operationId: 'getApiOnboarding',
  policies,
  responses: [{ kind: 'json', status: 200, schema: responseSchema(state) }],
  refusals: common,
  document: { summary: 'Discover onboarding state.' },
});

/** Creates an unmatched organization and the caller's first super-admin membership. */
export const createOnboardingOrganization = defineEndpointShape({
  method: 'POST',
  path: '/api/onboarding/organizations',
  operationId: 'postApiOnboardingOrganizations',
  policies: writePolicies,
  // Proof: 2026-09-28, admitting a `role` field failed the mounted
  // authority-bearing-body refusal case.
  body: requestSchema(type({ name: 'string' })),
  responses: [
    {
      kind: 'json',
      status: 201,
      schema: responseSchema(
        type({
          organization,
          membership: { organizationId: 'string', userId: 'string', role: "'super_admin'" },
        }),
      ),
    },
  ],
  refusals: [
    ...common,
    ...writeRefusals,
    { status: 409, schema: responseSchema(type({ error: "'domain_matched'" })) },
  ],
  document: { summary: 'Create an organization for an unmatched verified email.' },
});

/** Submits a request to the organization with the exact verified email domain. */
export const submitOnboardingJoinRequest = defineEndpointShape({
  method: 'POST',
  path: '/api/onboarding/join-requests',
  operationId: 'postApiOnboardingJoinRequests',
  policies: writePolicies,
  body: requestSchema(type({ organizationId: 'string' })),
  responses: [
    {
      kind: 'json',
      status: 201,
      schema: responseSchema(
        type({ request: { id: 'string', organizationId: 'string', status: "'pending'" } }),
      ),
    },
  ],
  refusals: [
    ...common,
    ...writeRefusals,
    { status: 404, schema: responseSchema(type({ error: "'not_found'" })) },
    { status: 409, schema: responseSchema(type({ error: "'join_request_pending'" })) },
  ],
  document: { summary: 'Request membership in the matching organization.' },
});
