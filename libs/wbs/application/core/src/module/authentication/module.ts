import { DiBag } from 'di-bag';

import { AuthService, type AuthServiceOptions } from './authentication.feature';
import { AUTHENTICATION_LABEL, type AuthenticationRequirements } from './contract';
import { LoginThrottle, type LoginThrottleOptions } from './login-throttle';

/**
 * Authentication as a sealed DI Bag module.
 *
 * `auth` and `loginThrottle` are exported as two current compatibility
 * values, the same shape Realtime's own `announcements`/`gatewayBroadcaster`/
 * `replayBuffer` keep: the map's own row names a single future `Authentication`
 * feature contract as the eventual surface, with `auth` retained only as a
 * migration alias, but no accepted change supplies that redesign yet, so this
 * module seals the two existing collaborators rather than inventing one.
 *
 * `throttleOptions` stays private to each installation, so a host cannot name
 * it — resolving it answers `DI_BAG_UNKNOWN_SERVICE_KEY`, and a requirement
 * the host forgot is reported against `application.authentication/throttleOptions`
 * rather than against an anonymous binding. `authOptions` is also private:
 * it is the one place `account.users` is spread into both `users` and
 * `identities` for the legacy `AuthServiceOptions` shape, so no host of this
 * module can construct `AuthService` with a store that answers only
 * `UserStore`.
 *
 * The module registers no disposer: `AuthService` holds only borrowed ports
 * and `LoginThrottle` holds an in-process bounded map with no timer, socket or
 * handle of its own. Both lifetimes stay the composition root's, exactly as
 * `bootBe01` owns the source it borrows.
 */
export const authenticationModule = DiBag.createBuilder()
  .withServices({
    authOptions: DiBag.createProvider(
      ({ account }: { account: AuthenticationRequirements['account'] }): AuthServiceOptions => ({
        ...account,
        identities: account.users,
      }),
      { factoryReturnKind: 'sync-value' },
    ),
    throttleOptions: DiBag.createProvider(
      ({
        now,
        maxConcurrentLogins,
      }: {
        now: () => number;
        maxConcurrentLogins: number;
      }): LoginThrottleOptions => ({ now, maxConcurrent: maxConcurrentLogins }),
      { factoryReturnKind: 'sync-value' },
    ),
  })
  .withServices({
    auth: DiBag.createProvider(
      ({ authOptions }: { authOptions: AuthServiceOptions }): AuthService =>
        new AuthService(authOptions),
      { factoryReturnKind: 'sync-value' },
    ),
    loginThrottle: DiBag.createProvider(
      ({ throttleOptions }: { throttleOptions: LoginThrottleOptions }): LoginThrottle =>
        new LoginThrottle(throttleOptions),
      { factoryReturnKind: 'sync-value' },
    ),
  })
  // Proof (2026-09-23): exporting `authOptions` alone made its host resolution return the raw
  // options and made graph inspection report bare `authOptions`; 7 tests passed and 2 failed,
  // while the independent `throttleOptions` privacy and missing-requirement tests stayed green.
  // Proof (2026-09-23): independently exporting `throttleOptions` made its host resolution return
  // the raw options, graph inspection report bare `throttleOptions`, and the missing-requirement
  // message lose its label; 6 tests passed and 3 failed while `authOptions` privacy stayed green.
  // Proof (2026-09-23): dropping the label made graph inspection report both private bindings
  // unlabelled and the missing-requirement message name bare `throttleOptions`; 7 passed, 2 failed.
  .buildModule({
    exportedServiceKeys: ['auth', 'loginThrottle'],
    moduleLabel: AUTHENTICATION_LABEL,
  });
