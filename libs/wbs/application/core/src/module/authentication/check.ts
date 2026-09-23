import { DiBag } from 'di-bag';

import type { AuthenticationExports, AuthenticationRequirements } from './contract';
import { authenticationModule } from './module';

/**
 * Installs {@link authenticationModule} over supplied requirements and
 * returns only what the module exports.
 *
 * The graph is built here and nowhere else, so no caller of Authentication
 * can reach a private binding or a host key through it. The type checker does
 * not enforce that on its own: an object with an extra property returned
 * through a variable still satisfies {@link AuthenticationExports}, so the
 * module's tests enumerate what this function returns.
 */
export function installAuthentication(
  requirements: AuthenticationRequirements,
): AuthenticationExports {
  const bag = DiBag.createBuilder()
    .installModule(authenticationModule)
    .register({
      account: DiBag.fromSyncFactory(() => requirements.account),
      now: DiBag.fromSyncFactory(() => requirements.now),
      maxConcurrentLogins: DiBag.fromSyncFactory(() => requirements.maxConcurrentLogins),
    })
    .build();
  // Proof (2026-09-23): returning a structurally assignable object that also held `bag` made the
  // installer-surface assertion receive the extra `bag` key; 8 tests passed and 1 failed.
  // Proof (2026-09-23): attaching `resolve` to the returned `AuthService` kept the key list correct
  // but made the resolver-leak assertion receive false instead of true; 8 passed and 1 failed.
  return { auth: bag.resolve('auth'), loginThrottle: bag.resolve('loginThrottle') };
}
