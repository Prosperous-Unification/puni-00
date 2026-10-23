import { buildApp, type SocketCredential } from './app';
import type { loadConfig } from './config';
import type { FetchLike } from './service/backend-request';
import { browserProjectAccess } from './service/browser-access-client';
import { type CheckProjectAccess, LOCAL_PROJECT_ACCESS } from './service/project-access';

/**
 * The production project access check for one socket: be-01 proves a cookie
 * socket's principal from its forwarded browser credential; only a local-mode
 * socket gets {@link LOCAL_PROJECT_ACCESS}.
 */
export function projectAccessFor(be: {
  beUrl: string;
  secret: string;
  fetchImpl: FetchLike;
}): (credential: SocketCredential) => CheckProjectAccess {
  const browser = browserProjectAccess(be);
  return (credential) =>
    credential.kind === 'local'
      ? LOCAL_PROJECT_ACCESS
      : browser(credential.forwarded, credential.dependencySemantics);
}

/**
 * The gateway `main.ts` serves, from its loaded configuration.
 *
 * Proof: selecting LOCAL_PROJECT_ACCESS for every socket made `the production
 * gateway composition > asks be-01 and refuses a foreign project`
 * (composition.integration.test.ts) subscribe the foreign project (2026-10-11).
 */
export function buildGateway(
  cfg: ReturnType<typeof loadConfig>,
  fetchImpl: FetchLike = globalThis.fetch,
) {
  return buildApp({
    beUrl: cfg.BE_URL,
    internalAuthSecret: cfg.INTERNAL_AUTH_SECRET,
    jwtKey: cfg.JWT_SIGNING_KEY_CURRENT,
    previousJwtKey: cfg.JWT_SIGNING_KEY_PREVIOUS,
    ...cfg.wsAuth,
    fetchImpl,
    projectAccess: projectAccessFor({
      beUrl: cfg.BE_URL,
      secret: cfg.INTERNAL_AUTH_SECRET,
      fetchImpl,
    }),
  });
}
