import type { DelegationAudience, WbsScope } from '@wbs/contracts';

import type { Clock } from '../../ports/clock';
import type { OidcIdentityStore, UserStore } from '../../ports/user-store';
import type { AuthService, AuthServiceOptions } from './authentication.feature';
import type { LoginThrottle } from './login-throttle';

/**
 * What a host must supply to install {@link authenticationModule}.
 *
 * The host supplies a combined account store and a clock. The private
 * AccountResource owns creation, lookup, and OIDC identity resolution;
 * the feature depends on that resource rather than on either repository port.
 *
 * `now` and `maxConcurrentLogins` build {@link LoginThrottle}'s own options;
 * they stay two flat requirements, not `AuthServiceOptions`'s own `clock`
 * reused, because the throttle was already built from a bare `() => number`
 * callback before this extraction and this packet preserves that shape
 * exactly rather than widening it to depend on the whole `Clock` port.
 */
export interface AuthenticationRequirements {
  readonly account: Omit<AuthServiceOptions, 'account'> & {
    readonly users: UserStore & OidcIdentityStore;
    readonly clock: Clock;
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

/** Shared fields from a trusted credential binding, including verified expiry. */
interface CredentialSource {
  readonly delegated: boolean;
  /** Verified originating credential expiry, Unix milliseconds. */
  readonly credentialExpiresAt: number;
  readonly userId: string;
  readonly organizationId: string;
  readonly scopeCeiling: readonly WbsScope[];
}

/** Trusted upstream binding for a gateway or MCP delegation. */
export interface VerifiedUpstreamSource extends CredentialSource {
  readonly kind: 'verified-wbs-credential';
  readonly client: string;
  readonly grant: string;
  readonly upstreamIssuer: string;
  readonly upstreamSubject: string;
}

/** Native WBS session, verified without inventing an upstream identity. */
export interface VerifiedFirstPartySource extends CredentialSource {
  readonly kind: 'verified-first-party-credential';
}

/** A credential-bound source whose identity kind is explicit. */
export type VerifiedDelegationSource = VerifiedUpstreamSource | VerifiedFirstPartySource;

/** Resolves a WBS credential and its bindings at the trusted adapter boundary. */
export type DelegationSourceResolver = (
  credential: string,
  organizationId?: string,
) => Promise<VerifiedDelegationSource>;

/** Issues only after resolving a credential; callers cannot supply source claims. */
export type DelegationIssuer = (
  credential: string,
  audience: DelegationAudience,
  scopes: readonly WbsScope[],
  organizationId?: string,
) => Promise<string>;
