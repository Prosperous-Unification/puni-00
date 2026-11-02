import { AccountResource, NO_PROVEN_CONNECTIONS } from '../module/authentication/account.resource';
import {
  AuthService as AuthenticationFeature,
  type AuthServiceOptions as AuthenticationOptions,
} from '../module/authentication/authentication.feature';
import type { Clock } from '../ports/clock';
import type { EnterpriseConnections } from '../ports/enterprise-connections';
import type { OidcIdentityStore, UserStore } from '../ports/user-store';

export type {
  AdmittedMachineProof,
  AuthenticationRefusal,
  BearerRefusal,
  LoginOutcome,
  PresentedMachineCredential,
  PresentedMachineGrant,
  RegisterOutcome,
  SignedIn,
} from '../module/authentication/authentication.feature';
export {
  organizationRoleOf,
  TOKEN_TTL_SECONDS,
} from '../module/authentication/authentication.feature';
export type { AuthenticatedUser } from '@wbs/contracts';

/** Legacy direct-construction options retained for adapters and tests. */
export interface AuthServiceOptions extends Omit<AuthenticationOptions, 'account'> {
  users: UserStore;
  identities?: OidcIdentityStore;
  clock: Clock;
  /**
   * Which enterprise connections are proven. Absent, none is: every
   * enterprise identity's email is untrusted, which is the fail-closed answer
   * for the adapter tests this compatibility constructor serves.
   */
  enterprise?: Pick<EnterpriseConnections, 'provenFor'>;
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
      ...(options.machineKeys === undefined ? {} : { machineKeys: options.machineKeys }),
      ...(options.trustedIssuers === undefined ? {} : { trustedIssuers: options.trustedIssuers }),
      account: new AccountResource({
        users: options.users,
        ...(options.identities === undefined ? {} : { identities: options.identities }),
        clock: options.clock,
        enterprise: options.enterprise ?? NO_PROVEN_CONNECTIONS,
      }),
    });
  }
}
