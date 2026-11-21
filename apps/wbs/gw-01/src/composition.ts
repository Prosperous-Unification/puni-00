import { buildApp, type SocketCredential } from './app';
import type { loadConfig } from './config';
import type { FetchLike } from './service/backend-request';
import { browserWorkPackageAccess } from './service/browser-access-client';
import {
  type CheckWorkPackageAccess,
  LOCAL_WORK_PACKAGE_ACCESS,
} from './service/work-package-access';

/**
 * The production work package access check for one socket: be-01 proves a cookie
 * socket's principal from its forwarded browser credential; only a local-mode
 * socket gets {@link LOCAL_WORK_PACKAGE_ACCESS}.
 */
export function workPackageAccessFor(be: {
  beUrl: string;
  secret: string;
  fetchImpl: FetchLike;
}): (credential: SocketCredential) => CheckWorkPackageAccess {
  const browser = browserWorkPackageAccess(be);
  return (credential) =>
    credential.kind === 'local'
      ? LOCAL_WORK_PACKAGE_ACCESS
      : browser(credential.forwarded, credential.dependencySemantics);
}

/**
 * The gateway `main.ts` serves, from its loaded configuration.
 *
 * Proof: selecting LOCAL_WORK_PACKAGE_ACCESS for every socket made `the production
 * gateway composition > asks be-01 and refuses a foreign workPackage`
 * (composition.integration.test.ts) subscribe the foreign work package (2026-10-11).
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
    workPackageAccess: workPackageAccessFor({
      beUrl: cfg.BE_URL,
      secret: cfg.INTERNAL_AUTH_SECRET,
      fetchImpl,
    }),
  });
}
