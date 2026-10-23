/** Exact connected dependency semantics claimed by an HTTP or WebSocket client. */
export const DEPENDENCY_SEMANTICS = 'cross-project-dependencies-v1';
export const DEPENDENCY_SEMANTICS_HEADER = 'X-WBS-Dependency-Semantics';
export const DEPENDENCY_WEBSOCKET_PROTOCOL = 'wbs.cross-project-dependencies.v1';

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
export function requiresDependencyOperation(operationId: string): boolean {
  // Proof: disabling coverage admitted ENABLED /api/projects,200 instead of409 and failed the pinned operation matrix in dependency-client.test.ts.
  return !EXEMPT_OPERATIONS.has(operationId);
}
