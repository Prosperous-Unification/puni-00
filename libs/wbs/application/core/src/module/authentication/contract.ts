import type { AuthService, AuthServiceOptions } from './authentication.feature';
import type { LoginThrottle } from './login-throttle';

/**
 * What a host must supply to install {@link authenticationModule}.
 *
 * `account` narrows {@link AuthServiceOptions} at exactly one field: `users`
 * must satisfy both `UserStore` and `OidcIdentityStore`, matching the map's
 * own Authentication row ("accountful `users: UserStore & OidcIdentityStore`")
 * and `ports/stores.ts`'s own `TransactionalStores.users`. The legacy
 * `AuthServiceOptions.identities?: OidcIdentityStore` field stays optional on
 * the constructor itself (unchanged, still directly constructible), but this
 * module's own `module.ts` never leaves it unset: its private `authOptions`
 * binding always derives `identities` from `account.users`, so a host of this
 * module cannot supply
 * an `oidc` verifier over a store that cannot resolve OIDC identities — the
 * map's own "verifier-without-identity-store is unrepresentable" requirement,
 * enforced at this module's own boundary rather than by widening
 * `AuthServiceOptions` itself, which extraction preserves unchanged.
 *
 * **Preserved K3 debt.** `AuthService` directly calls `users.create`,
 * `findByUsername`, `findById` and `identities.resolveOidcIdentity` — all
 * `ports/user-store.ts` repository ports, not a resource-service contract.
 * This extraction moves the file; it does not close that debt. Tracked under
 * task 7.4 of `openspec/changes/adopt-di-composition/tasks.md`, the same
 * disposition Plan import's own `PlanImportRequirements` records for its own
 * preserved direct-store calls.
 *
 * `now` and `maxConcurrentLogins` build {@link LoginThrottle}'s own options;
 * they stay two flat requirements, not `AuthServiceOptions`'s own `clock`
 * reused, because the throttle was already built from a bare `() => number`
 * callback before this extraction and this packet preserves that shape
 * exactly rather than widening it to depend on the whole `Clock` port.
 */
export interface AuthenticationRequirements {
  readonly account: Omit<AuthServiceOptions, 'identities'> & {
    readonly users: AuthServiceOptions['users'] & NonNullable<AuthServiceOptions['identities']>;
  };
  readonly now: () => number;
  readonly maxConcurrentLogins: number;
}

/** What installing {@link authenticationModule} adds to a host graph. */
export interface AuthenticationExports {
  readonly auth: AuthService;
  readonly loginThrottle: LoginThrottle;
}

/**
 * The DI Bag label this module's private bindings are named under.
 *
 * `application` is the ring, matching `module.application.plan-history`'s,
 * `module.application.bounded-replay-sweep`'s, `module.application.realtime`'s
 * and `module.application.plan-import`'s; the wiki module identifier is
 * `module.application.authentication` and the label drops the `module.`
 * prefix.
 */
export const AUTHENTICATION_LABEL = 'application.authentication';
