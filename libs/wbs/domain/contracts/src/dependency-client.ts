import { type } from 'arktype';

import type { EndpointShape } from './http/endpoint-shape';
import type { Refusal } from './http/refusal';
import { responseSchema } from './http/schema-shape';

/** Exact connected dependency semantics claimed by an HTTP or WebSocket client. */
export const DEPENDENCY_SEMANTICS = 'cross-project-dependencies-v1';
export const DEPENDENCY_SEMANTICS_HEADER = 'X-WBS-Dependency-Semantics';
export const DEPENDENCY_WEBSOCKET_PROTOCOL = 'wbs.cross-project-dependencies.v1';

/** Exact admission refusal, excluding the general transport's optimizer retry variants. */
export type DependencyClientRefusal = Extract<
  Refusal<'client_dependency_incompatible'>,
  { error: 'client_dependency_incompatible' }
>;

const EXEMPT_OPERATIONS = new Set([
  'getHealth',
  'getMetrics',
  'getDependencyCapability',
  'postApiAuthRegister',
  'postApiAuthLogin',
  'getApiAuthMe',
  'postApiAuthContext',
  'getApiAuthMethods',
  'getApiAuthLogin',
  'getApiAuthOktaCallback',
  'postApiAuthLinkAuth0',
  'getApiAuthLinkAuth0Callback',
  'postApiAuthRefresh',
  'postApiAuthLogout',
  'postApiSmokeEcho',
  'getApiTimezones',
  'postInternalMcpCredentials',
  'postInternalMcpCredentialsEnded',
  'postInternalMcpDelegation',
  'postInternalMcpAuthority',
]);

/**
 * Protects every operation except explicit process, authentication and immutable
 * catalogue observations. Organization control and onboarding can mutate resources
 * and therefore require admission even without organization-resource policy.
 */
export function requiresDependencyClient(shape: EndpointShape): boolean {
  // Proof: disabling coverage admitted ENABLED /api/projects,200 instead of409 and failed the pinned operation matrix in dependency-client.test.ts.
  return !EXEMPT_OPERATIONS.has(shape.operationId);
}

/** Shared transport refusal; a claim alone never grants binary support. */
export const dependencyClientRefusal = {
  status: 409,
  schema: responseSchema(
    type({
      error: "'client_dependency_incompatible'",
      required: "'cross-project-dependencies-v1'",
    }),
  ),
} as const;
