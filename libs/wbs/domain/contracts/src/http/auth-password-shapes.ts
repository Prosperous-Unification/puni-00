import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { organizationContextRefusal, organizationRefusal } from './organization-refusal';
import { requestSchema, responseSchema } from './schema-shape';

// Proof: admitting an extra boolean made the mounted extra-field request receive 400 instead of 422.
const credentials = requestSchema(type({ username: 'string', password: 'string' }));
const bodyMedia = [
  'application/json',
  'application/x-www-form-urlencoded',
  'multipart/form-data',
] as const;
// Proof: removing this policy made the mounted malformed foreign-origin request receive 400 instead of 403.
const originPolicy = [{ kind: 'origin', when: 'always' }] as const;
const signedIn = responseSchema(
  type({ token: 'string', user: { id: 'string', username: 'string' } }),
);
const scope = type("'read' | 'write' | 'editor'");
const methodId = type("'google' | 'github' | 'email' | 'apple'");
/**
 * Which deployment-wide features answer on this backend: `onboarding` is the
 * activation marker admitting onboarding, `organizations` additionally needs the
 * organization selection composition. A client skips a feature's reads when it
 * is false (`openspec/changes/session-features`).
 */
export const sessionFeatures = type({ onboarding: 'boolean', organizations: 'boolean' });
/** The deployment features a session read reports; see {@link sessionFeatures}. */
export type SessionFeatures = typeof sessionFeatures.infer;
/**
 * `linkedMethods`: catalogue methods of the account's mapped identities, read from the store.
 * `features`: {@link sessionFeatures}, answered signed in and signed out alike.
 * be-01 always sends both; older backends and fixtures omit them.
 */
const currentUser = responseSchema(
  type({
    user: type({
      id: 'string',
      username: 'string',
      scopes: scope.array(),
      'linkedMethods?': methodId.array(),
    }).or('null'),
    'features?': sessionFeatures,
  }),
);

/** Creates a password account and returns its local bearer or hardened browser session. */
export const registerPassword = defineEndpointShape({
  method: 'POST',
  path: '/api/auth/register',
  operationId: 'postApiAuthRegister',
  policies: [...originPolicy, { kind: 'organization-control' }],
  body: credentials,
  bodyMedia,
  responses: [{ kind: 'json', status: 200, schema: signedIn }],
  refusals: [
    {
      status: 400,
      schema: responseSchema(
        type({ error: "'invalid_json' | 'invalid_query' | 'invalid_client' | 'invalid'" }),
      ),
    },
    { status: 401, schema: responseSchema(type({ error: "'unauthenticated'" })) },
    { status: 403, schema: responseSchema(type({ error: "'invalid_origin'" })) },
    { status: 404, schema: responseSchema(type({ error: "'not_found'" })) },
    { status: 409, schema: responseSchema(type({ error: "'taken'" })) },
    { status: 422, schema: responseSchema(type({ error: "'invalid_body'" })) },
    { status: 429, schema: responseSchema(type({ error: "'rate_limited'" })) },
  ],
  document: { summary: 'Register a password account and start a session.' },
});

/** Verifies a password and returns its local bearer or hardened browser session. */
export const loginPassword = defineEndpointShape({
  method: 'POST',
  path: '/api/auth/login',
  operationId: 'postApiAuthLogin',
  policies: [...originPolicy, { kind: 'organization-control' }],
  body: credentials,
  bodyMedia,
  responses: [{ kind: 'json', status: 200, schema: signedIn }],
  refusals: [
    {
      status: 400,
      schema: responseSchema(
        type({ error: "'invalid_json' | 'invalid_query' | 'invalid_client'" }),
      ),
    },
    {
      status: 401,
      schema: responseSchema(type({ error: "'invalid_credentials' | 'unauthenticated'" })),
    },
    { status: 403, schema: responseSchema(type({ error: "'invalid_origin'" })) },
    { status: 404, schema: responseSchema(type({ error: "'not_found'" })) },
    { status: 422, schema: responseSchema(type({ error: "'invalid_body'" })) },
    // Exhausted admission deliberately shares its body with the credential refusal.
    { status: 429, schema: responseSchema(type({ error: "'invalid_credentials'" })) },
  ],
  document: { summary: 'Start a session with a password account.' },
});

/** Resolves the current password or OIDC session, including an explicit signed-out state. */
export const readPasswordSession = defineEndpointShape({
  method: 'GET',
  path: '/api/auth/me',
  operationId: 'getApiAuthMe',
  // Authentication stays inside the handler because this protocol answers invalid_token, not unauthenticated.
  policies: [{ kind: 'organization-control' }],
  responses: [{ kind: 'json', status: 200, schema: currentUser }],
  refusals: [
    {
      status: 400,
      schema: responseSchema(
        type({ error: "'invalid_body' | 'invalid_query' | 'invalid_params'" }),
      ),
    },
    { status: 401, schema: responseSchema(type({ error: "'invalid_token'" })) },
  ],
  document: { summary: 'Read the account behind the current session.' },
});

/** Exchanges one native WBS session for its own selected organization context. */
export const issueBearerContext = defineEndpointShape({
  method: 'POST',
  path: '/api/auth/context',
  operationId: 'postApiAuthContext',
  // Proof (2026-09-28): requiring origin for a bearer-only request made
  // `issues a native direct context only for its own current membership`
  // answer 403 to a direct client with no Origin header.
  policies: [
    { kind: 'organization-control' },
    { kind: 'origin', when: 'always-unsafe-with-session-cookie' },
  ],
  // Proof (2026-09-28): admitting a caller audience made `context route stays
  // inert before activation and production binding` answer 403 instead of 400.
  body: requestSchema(type({ organizationId: 'string' })),
  responses: [{ kind: 'json', status: 200, schema: responseSchema(type({ token: 'string' })) }],
  refusals: [
    {
      status: 400,
      schema: responseSchema(type({ error: "'invalid_body' | 'invalid_json' | 'invalid_query'" })),
    },
    { status: 401, schema: responseSchema(type({ error: "'invalid_binding'" })) },
    {
      status: 403,
      schema: responseSchema(type({ error: "'context_inactive' | 'invalid_origin'" })),
    },
    { status: 403, schema: responseSchema(type({ error: "'forbidden'" })) },
    // A password session in an organization enforcing SSO, or one older than
    // its session policy allows (`organization-sso`, `organization-session-policy`).
    organizationRefusal,
    organizationContextRefusal,
  ],
  document: { summary: 'Issue a direct WBS bearer for a current organization membership.' },
});
