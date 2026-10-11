import type { OidcIdentity } from '@wbs/contracts';

import type { Clock } from '../../ports/clock';
import type { OidcIdentityStore, User, UserStore } from '../../ports/user-store';

/** Repository collaborators for one account resource instance. */
export interface AccountResourceOptions {
  readonly users: UserStore;
  readonly identities?: OidcIdentityStore;
  readonly clock: Clock;
}

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
  async linkPasswordIdentity(userId: string, identity: OidcIdentity) {
    if (this.opts.identities?.linkPasswordIdentity === undefined)
      throw new Error('explicit OIDC link store is not configured');
    return this.opts.identities.linkPasswordIdentity(
      userId,
      identity,
      this.opts.clock.stampFor(userId),
    );
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

  /** Mint a candidate ID before resolving a verified OIDC identity. */
  resolveIdentity(identity: OidcIdentity): Promise<User | null> {
    // Proof (2026-09-27): forcing this guard false failed `direct account
    // resource reports an absent OIDC identity store` (0 pass, 1 fail).
    if (this.opts.identities === undefined) {
      throw new Error('OIDC identity store is not configured');
    }
    const id = this.opts.clock.newId();
    const stamp = this.opts.clock.stampFor(id);
    return this.opts.identities.resolveOidcIdentity(identity, { id }, stamp);
  }
}
