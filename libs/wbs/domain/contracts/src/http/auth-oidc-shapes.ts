import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { requestSchema, responseSchema } from './schema-shape';
import { enterpriseLoginSlug } from './sso-connection-shapes';

const malformed = {
  status: 400,
  schema: responseSchema(
    type({ error: "'invalid_body' | 'invalid_query' | 'invalid_params' | 'invalid_json'" }),
  ),
} as const;
const sessionRefusal = {
  status: 401,
  schema: responseSchema(type({ error: "'invalid_oidc_session'" })),
} as const;
// Proof: removing Origin returned204 instead of403 in the mounted refresh/logout policy test.
/** Wire form of the `AuthMethodId` catalogue ids; `auth-oidc-shapes.test.ts` pins the two together. */
const methodId = "'google' | 'github' | 'email' | 'apple'";
const unsafe = [{ kind: 'origin', when: 'always-unsafe-with-session-cookie' }] as const;
const invalidOrigin = {
  status: 403,
  schema: responseSchema(type({ error: "'invalid_origin'" })),
} as const;

/**
 * Starts an OIDC transaction for one browser and redirects to its provider.
 * At most one hint chooses the connection sent to the provider: `method`, an
 * enabled `AUTH_METHODS` catalogue entry; `organization`, an enterprise
 * connection's login slug; or `email`, routed when its domain is a verified
 * claim with a connection. Without one the provider's own chooser is shown.
 */
export const startOidcLogin = defineEndpointShape({
  method: 'GET',
  path: '/api/auth/login',
  operationId: 'getApiAuthLogin',
  policies: [],
  query: requestSchema(
    type({ 'method?': methodId, 'organization?': enterpriseLoginSlug, 'email?': 'string' }),
  ),
  responses: [{ kind: 'empty', status: 302 }],
  refusals: [
    malformed,
    { status: 404, schema: responseSchema(type({ error: "'sso_connection_not_found'" })) },
  ],
  document: { summary: 'Start a browser OIDC login.' },
});
/** Provider callback parameters remain open; each raw key may occur only once. */
export const completeOidcLogin = defineEndpointShape({
  method: 'GET',
  path: '/api/auth/okta/callback',
  operationId: 'getApiAuthOktaCallback',
  policies: [],
  query: requestSchema(type({ '[string]': 'string' })),
  queryMode: 'arbitrary-singleton',
  responses: [{ kind: 'empty', status: 302 }],
  refusals: [
    malformed,
    {
      status: 400,
      schema: responseSchema(type({ error: "'duplicate_parameter'" })),
    },
    // Exchange classification deliberately carries no provider detail to the browser.
    { kind: 'empty', status: 400 },
    { kind: 'empty', status: 401 },
    { kind: 'empty', status: 500 },
    { kind: 'empty', status: 503 },
    { status: 405, schema: responseSchema(type({ error: "'method_not_allowed'" })) },
  ],
  document: { summary: 'Complete one browser OIDC login.' },
});

/**
 * Lists the sign-in methods this deployment offers as direct buttons, in
 * catalogue order. Public: it reads configuration only and sets no cookie.
 */
export const listAuthMethods = defineEndpointShape({
  method: 'GET',
  path: '/api/auth/methods',
  operationId: 'getApiAuthMethods',
  policies: [],
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(type({ methods: type({ id: methodId, label: 'string' }).array() })),
    },
  ],
  refusals: [malformed],
  document: { summary: 'List the enabled sign-in methods.' },
});

/**
 * Starts a separate Auth0 proof for the already signed-in account. A password
 * session must send its fresh `password`; an OIDC session must not. `method`
 * selects the connection of the identity being added.
 */
export const startAuth0Link = defineEndpointShape({
  method: 'POST',
  path: '/api/auth/link/auth0',
  operationId: 'postApiAuthLinkAuth0',
  policies: [{ kind: 'origin', when: 'always-unsafe-with-session-cookie' }],
  body: requestSchema(type({ 'password?': 'string', 'method?': methodId })),
  // A JSON location rather than a 302: fe-01's fetch transport cannot follow
  // or read a cross-origin redirect, so the page navigates itself.
  responses: [{ kind: 'json', status: 200, schema: responseSchema(type({ location: 'string' })) }],
  refusals: [
    malformed,
    { status: 400, schema: responseSchema(type({ error: "'invalid_client'" })) },
    invalidOrigin,
    { status: 401, schema: responseSchema(type({ error: "'invalid_credentials'" })) },
    { status: 429, schema: responseSchema(type({ error: "'invalid_credentials'" })) },
    { status: 403, schema: responseSchema(type({ error: "'onboarding_inactive'" })) },
  ],
  document: { summary: 'Prove the current session and answer the Auth0 link location.' },
});

/**
 * Consumes the bound Auth0 proof without entering normal login resolution.
 * Every outcome the handler reaches is a 302 to the fixed relative
 * `/?auth_link=<linked|refused|inactive|collision|unavailable|failed>`; only
 * a polluted query or a non-GET method is refused before it.
 */
export const completeAuth0Link = defineEndpointShape({
  method: 'GET',
  path: '/api/auth/link/auth0/callback',
  operationId: 'getApiAuthLinkAuth0Callback',
  policies: [],
  query: requestSchema(type({ '[string]': 'string' })),
  queryMode: 'arbitrary-singleton',
  responses: [{ kind: 'empty', status: 302 }],
  refusals: [
    malformed,
    { status: 400, schema: responseSchema(type({ error: "'duplicate_parameter'" })) },
    { status: 405, schema: responseSchema(type({ error: "'method_not_allowed'" })) },
  ],
  document: { summary: 'Complete an explicit Auth0 link for the originating session.' },
});
/** Refreshes from the browser session correlation, including an expired access token. */
export const refreshOidcSession = defineEndpointShape({
  method: 'POST',
  path: '/api/auth/refresh',
  operationId: 'postApiAuthRefresh',
  policies: unsafe,
  responses: [{ kind: 'empty', status: 204 }],
  refusals: [
    malformed,
    invalidOrigin,
    sessionRefusal,
    { status: 409, schema: responseSchema(type({ error: "'refresh_in_progress'" })) },
  ],
  document: { summary: 'Refresh the browser access cookie.' },
});
/** Deletes the local session before revoking the upstream refresh token. */
export const logoutOidcSession = defineEndpointShape({
  method: 'POST',
  path: '/api/auth/logout',
  operationId: 'postApiAuthLogout',
  policies: unsafe,
  responses: [{ kind: 'empty', status: 204 }],
  refusals: [
    malformed,
    invalidOrigin,
    { status: 401, schema: responseSchema(type({ error: "'unauthenticated'" })) },
  ],
  document: { summary: 'End the browser session.' },
});
