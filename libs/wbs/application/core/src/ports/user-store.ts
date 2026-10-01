import type { OidcIdentity } from '@wbs/contracts';

import type { User } from './account-values';
import type { WriteStamp } from './write-stamp';
export type { User } from './account-values';

export interface UserStore {
  /** Returns null when the username is already taken. */
  create(user: User, stamp: WriteStamp): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
}

export interface OidcIdentityStore {
  /** Reads an already-bound exact issuer/subject pair without creating or updating an account. */
  findExistingOidcIdentity(
    identity: Pick<OidcIdentity, 'issuer' | 'subject'>,
  ): Promise<User | null>;
  /** Explicit linking is absent in older in-memory fixtures, which cannot activate. */
  isLinkActive?(): Promise<boolean>;
  linkPasswordIdentity?(
    userId: string,
    identity: Pick<OidcIdentity, 'issuer' | 'subject' | 'email' | 'emailVerified'>,
    stamp: WriteStamp,
  ): Promise<{
    kind:
      | 'linked'
      | 'inactive'
      | 'unverified'
      | 'identity_collision'
      | 'email_collision'
      | 'invalid_account';
  }>;
  /** Returns null when an existing email belongs to a different federated identity. */
  /**
   * `create` carries the id a first login would mint and **not** its instant:
   * that comes off the stamp, so one act cannot date the account one way and its
   * audit columns another. It used to be `{ id, createdAt }`, which was two
   * sources for one value.
   */
  resolveOidcIdentity(
    identity: Pick<OidcIdentity, 'issuer' | 'subject' | 'email' | 'emailVerified'>,
    create: { id: string },
    stamp: WriteStamp,
  ): Promise<User | null>;
}
