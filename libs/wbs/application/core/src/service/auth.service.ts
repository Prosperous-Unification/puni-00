import { AccountResource } from '../module/authentication/account.resource';
import {
  AuthService as AuthenticationFeature,
  type AuthServiceOptions as AuthenticationOptions,
} from '../module/authentication/authentication.feature';
import type { Clock } from '../ports/clock';
import type { OidcIdentityStore, UserStore } from '../ports/user-store';

export type {
  LoginOutcome,
  RegisterOutcome,
  SignedIn,
} from '../module/authentication/authentication.feature';
export { TOKEN_TTL_SECONDS } from '../module/authentication/authentication.feature';
export type { AuthenticatedUser } from '@wbs/contracts';

/** Legacy direct-construction options retained for adapters and tests. */
export interface AuthServiceOptions extends Omit<AuthenticationOptions, 'account'> {
  users: UserStore;
  identities?: OidcIdentityStore;
  clock: Clock;
}

/** Compatibility construction over repository stores; sealed graphs install the feature directly. */
export class AuthService extends AuthenticationFeature {
  constructor(options: AuthServiceOptions) {
    super({
      tokens: options.tokens,
      passwords: options.passwords,
      ...(options.oidc === undefined ? {} : { oidc: options.oidc }),
      ...(options.passwordSessions === undefined
        ? {}
        : { passwordSessions: options.passwordSessions }),
      ...(options.localIdentity === undefined ? {} : { localIdentity: options.localIdentity }),
      account: new AccountResource({
        users: options.users,
        ...(options.identities === undefined ? {} : { identities: options.identities }),
        clock: options.clock,
      }),
    });
  }
}
