import type { OidcIdentity } from '@wbs/contracts';

import type { Clock } from '../../ports/clock';
import {
  type EnterpriseConnections,
  isAttestedEmail,
  isEnterpriseSubject,
} from '../../ports/enterprise-connections';
import type { OidcIdentityStore, User, UserStore } from '../../ports/user-store';

/** Repository collaborators for one account resource instance. */
export interface AccountResourceOptions {
  readonly users: UserStore;
  readonly identities?: OidcIdentityStore;
  readonly clock: Clock;
  /** Which enterprise connections are proven, for email trust (D4). */
  readonly enterprise: Pick<EnterpriseConnections, 'provenFor'>;
}

/**
 * Answers that no enterprise connection is proven: every enterprise identity's
 * email is then untrusted, the fail-closed answer. Only for compositions that
 * hold no enterprise connection records at all.
 */
export const NO_PROVEN_CONNECTIONS: Pick<EnterpriseConnections, 'provenFor'> = {
  provenFor: () => Promise.resolve(null),
};

/** Account creation, lookup, and federated resolution over the admitted store. */
export class AccountResource {
  constructor(private readonly opts: AccountResourceOptions) {}

  /** Link flow is unavailable in fixtures without a durable activation marker. */
  async isLinkActive(): Promise<boolean> {
    if (this.opts.identities?.isLinkActive === undefined)
      throw new Error('explicit OIDC link store is not configured');
    return this.opts.identities.isLinkActive();
  }

  /** Commit a verified pair to a password user; the store rechecks activation and ownership. */
  async linkIdentity(userId: string, identity: OidcIdentity) {
    if (this.opts.identities?.linkIdentity === undefined)
      throw new Error('explicit OIDC link store is not configured');
    return this.opts.identities.linkIdentity(
      userId,
      await this.withTrustedEmail(identity),
      this.opts.clock.stampFor(userId),
    );
  }

  /**
   * `identity` as the stores may see it (`organization-sso` requirement 3,
   * D4): an enterprise identity's `emailVerified` stands only when its email
   * is attested by a proven connection on that connection's domain, so it can
   * neither hold another domain's address as verified nor reach
   * `account_exists` for it. Every other identity is unchanged.
   *
   * Proof: 2026-10-12, honouring `email_verified` for every enterprise
   * identity made `trusts no foreign-domain email from a proven connection,
   * and answers no account_exists` in
   * `enterprise-email-trust.controller.db.test.ts` answer account_exists.
   */
  private async withTrustedEmail(identity: OidcIdentity): Promise<OidcIdentity> {
    if (!identity.emailVerified || !isEnterpriseSubject(identity.subject)) return identity;
    const proven = await this.opts.enterprise.provenFor(identity.subject);
    return isAttestedEmail(identity.email, proven)
      ? identity
      : { ...identity, emailVerified: false };
  }

  /**
   * The pairs mapped to an account. A composition without an identity store
   * has no mappings at all, so its accounts hold none.
   */
  async listIdentities(userId: string): Promise<readonly { issuer: string; subject: string }[]> {
    if (this.opts.identities === undefined) return [];
    return this.opts.identities.listIdentities(userId);
  }

  /** Mint and stamp an account after the caller has hashed its password. */
  createAccount(username: string, passwordHash: string): Promise<User | null> {
    const id = this.opts.clock.newId();
    const stamp = this.opts.clock.stampFor(id);
    return this.opts.users.create({ id, username, passwordHash, createdAt: stamp.at }, stamp);
  }

  /** Find the account behind a username, including an OIDC-only account. */
  findAccount(username: string): Promise<User | null> {
    return this.opts.users.findByUsername(username);
  }

  /** Read the account behind a signed session subject. */
  readAccount(accountId: string): Promise<User | null> {
    return this.opts.users.findById(accountId);
  }

  /** Read an existing verified pair for refresh without login's account-creating resolver. */
  readExistingIdentity(identity: Pick<OidcIdentity, 'issuer' | 'subject'>): Promise<User | null> {
    if (this.opts.identities === undefined)
      throw new Error('OIDC identity store is not configured');
    return this.opts.identities.findExistingOidcIdentity(identity);
  }

  /**
   * Mint a candidate ID before resolving a verified OIDC identity, whose
   * email is first held to the enterprise trust rule ({@link withTrustedEmail}).
   * Login and every OIDC bearer authentication resolve through here.
   */
  resolveIdentity(identity: OidcIdentity): Promise<User | null> {
    const identities = this.opts.identities;
    // Proof (2026-09-27): forcing this guard false failed `direct account
    // resource reports an absent OIDC identity store` (0 pass, 1 fail).
    if (identities === undefined) {
      throw new Error('OIDC identity store is not configured');
    }
    return this.withTrustedEmail(identity).then((trusted) => {
      const id = this.opts.clock.newId();
      return identities.resolveOidcIdentity(trusted, { id }, this.opts.clock.stampFor(id));
    });
  }
}
