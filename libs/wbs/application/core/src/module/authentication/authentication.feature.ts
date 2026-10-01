import type { AuthenticatedUser, OidcIdentity } from '@wbs/contracts';

import type { User } from '../../ports/account-values';
import type { OidcVerifier } from '../../ports/oidc-verifier';
import type { PasswordHasher, TokenCodec } from '../../ports/runtime';
import type { AccountResource } from './account.resource';

export const TOKEN_TTL_SECONDS = 12 * 60 * 60;

export interface SignedIn {
  token: string;
  user: { id: string; username: string };
}

export type RegisterOutcome =
  { ok: true; value: SignedIn } | { ok: false; reason: 'taken' | 'invalid' };

export type LoginOutcome = { ok: true; value: SignedIn } | { ok: false; reason: 'invalid' };

export interface AuthServiceOptions {
  account: AccountResource;
  oidc?: OidcVerifier;
  /** Accept locally issued password sessions after OIDC verification fails. */
  passwordSessions?: boolean;
  /** Fixed cookie-free identity used only by explicit non-production local mode. */
  localIdentity?: AuthenticatedUser;
  /**
   * How this deployment signs and reads its own session tokens.
   *
   * **Required, with no default.** The key gw-01 loads as
   * `JWT_SIGNING_KEY_CURRENT` is the same string this codec is built over, so a
   * token signed here verifies there; if the two diverge the failure is a 401
   * on the WebSocket only, which reads as a gateway bug rather than a
   * configuration mismatch. `boot.ts` builds it — see {@link joseTokenCodec}.
   */
  tokens: TokenCodec;
  /**
   * How a password becomes a stored credential, and how one is checked.
   *
   * **Required, with no default.** `Bun.password` was reached for here until
   * this port existed, which made argon2id a fact about the service rather than
   * about the process it happens to run in — and the one thing a second runtime
   * would have had to notice and could not have been told about.
   *
   * Proof the requirement is a real one: made optional (`passwords?:`),
   * `nx run wbs-be-01:typecheck` failed on `Object is possibly 'undefined'` at both
   * call sites — the hash in `register` and the verify in `login` — rather than
   * silently reaching for a global. Watched 2026-09-08.
   */
  passwords: PasswordHasher;
}

export type { AuthenticatedUser } from '@wbs/contracts';

/** Usernames are the WebSocket presence identity, so they are constrained here. */
const USERNAME = /^[a-zA-Z0-9_-]{3,32}$/;
const MIN_PASSWORD = 8;
// argon2id hashes whatever it is given; an unbounded password is a cheap way
// to make registration expensive for everyone else.
const MAX_PASSWORD = 200;

/**
 * Registration and sign-in.
 *
 * The only service whose acts create the account they are the act **of**: both
 * `register` and the first OIDC login pass the id they are about to mint as the
 * stamp's actor, so the account is its own author. Every other service is
 * handed an actor by its controller.
 */
export class AuthService {
  constructor(private readonly opts: AuthServiceOptions) {}

  /** Verify a first-party password JWT and re-read its account; Auth0 tokens cannot pass. */
  async passwordSessionUser(token: string | null): Promise<User | null> {
    // The same policy `authenticate` applies: once OIDC is configured, a
    // password session counts only when password sessions are explicitly on.
    // Proof: 2026-09-28, removing this policy check made `refuses link start
    // and callback after password sessions are disabled` receive 302 at start;
    // checking only an explicit `false` made `admits a password session as
    // link proof only when password sessions are explicitly enabled` in
    // `auth-service-null-password.test.ts` fail (4 pass, 1 fail).
    if (this.opts.oidc !== undefined && this.opts.passwordSessions !== true) return null;
    if (token === null) return null;
    const claims = await this.opts.tokens.verify(token);
    if (claims === null) return null;
    const user = await this.opts.account.readAccount(claims.subject);
    return user?.passwordHash === null || user === null ? null : user;
  }

  /** Requires a fresh password as well as the initiating signed password session. */
  async provePasswordSession(token: string | null, password: string): Promise<User | null> {
    const user = await this.passwordSessionUser(token);
    if (user === null || password.length > MAX_PASSWORD) return null;
    return (await this.opts.passwords.verify(password, user.passwordHash ?? DUMMY_HASH))
      ? user
      : null;
  }

  /** Reads the durable activation marker; missing wiring throws. */
  isLinkActive(): Promise<boolean> {
    return this.opts.account.isLinkActive();
  }

  /** Commit an explicit verified link without calling normal OIDC login resolution. */
  linkOidcIdentity(userId: string, identity: OidcIdentity) {
    return this.opts.account.linkPasswordIdentity(userId, identity);
  }

  async register(username: string, password: string): Promise<RegisterOutcome> {
    if (!USERNAME.test(username) || password.length < MIN_PASSWORD) {
      return { ok: false, reason: 'invalid' };
    }
    if (password.length > MAX_PASSWORD) return { ok: false, reason: 'invalid' };
    const passwordHash = await this.opts.passwords.hash(password);
    // The act begins here, after every refusal and after the hash: argon2id
    // takes long enough that a stamp taken before it would date the row from
    // when the request arrived rather than from when the row was made.
    const created = await this.opts.account.createAccount(username, passwordHash);
    if (created === null) return { ok: false, reason: 'taken' };
    return { ok: true, value: await this.issue(created) };
  }

  /** Invalid credentials return a refusal; unexpected store/verifier failures propagate. */
  async login(username: string, password: string): Promise<LoginOutcome> {
    const user = await this.opts.account.findAccount(username);
    const passwordHash = user?.passwordHash ?? null;
    const hasUsableCredential = passwordHash !== null && password.length <= MAX_PASSWORD;
    const hash = hasUsableCredential ? passwordHash : DUMMY_HASH;
    // Proof: restoring catch(() => false) makes "releases capacity after error" answer 401, not 500.
    const matches = await this.opts.passwords.verify(password.slice(0, MAX_PASSWORD), hash);
    if (!matches || user === null || passwordHash === null || password.length > MAX_PASSWORD) {
      return { ok: false, reason: 'invalid' };
    }
    return { ok: true, value: await this.issue(user) };
  }

  /**
   * Verifies credentials, then resolves their account outside the credential catch.
   * Unexpected verifier and account-store failures propagate to the server boundary.
   *
   * Proof: catching `resolveOidcIdentity` as invalid credentials made the mounted
   * account-store outage receive 401 instead of 500
   * (controller/oidc.integration.test.ts).
   */
  async authenticate(token: string | null): Promise<AuthenticatedUser | null> {
    if (this.opts.localIdentity !== undefined) return this.opts.localIdentity;
    if (token === null) return null;
    if (this.opts.oidc !== undefined) {
      const identity = await this.opts.oidc.verify(token);
      if (identity === null) {
        // Proof: falling through while password sessions were disabled made the
        // literal fallback test authenticate the legacy account instead of null
        // (auth-service-null-password.test.ts).
        if (this.opts.passwordSessions !== true) return null;
      } else {
        const user = await this.resolveOidcIdentity(identity);
        if (user === null) return null;
        return { id: user.id, username: user.username, scopes: identity.scopes };
      }
    }

    const claims = await this.opts.tokens.verify(token);
    if (claims === null) return null;
    const user = await this.opts.account.readAccount(claims.subject);
    // A valid signature cannot keep a deleted account authenticated.
    if (user === null) return null;
    return { id: user.id, username: user.username, scopes: ['read', 'write', 'editor'] };
  }

  /**
   * The account behind one verified OIDC token, minting it on a first login.
   *
   * The stamp is built for the id this login *would* mint, because that is the
   * only actor the act can name: on the branch that writes a new row the row is
   * its own author, and on the branch that links an existing password account
   * the store deliberately moves only `updatedAt` — see
   * {@link AccountResource.resolveIdentity}. Most calls here resolve an
   * account that already exists and write nothing at all, so the id and the
   * stamp are both spent only on the branch that does write.
   */
  async resolveOidcIdentity(identity: OidcIdentity): Promise<User | null> {
    // Proof (2026-09-27): converting a resource rejection to null made mounted
    // `keeps OIDC account resolution failures unknown` return 401 instead of
    // 500 (0 pass, 1 fail).
    return this.opts.account.resolveIdentity(identity);
  }

  /** Resolves only a pre-existing exact verified pair; refresh may not create or link users. */
  readExistingOidcIdentity(
    identity: Pick<OidcIdentity, 'issuer' | 'subject'>,
  ): Promise<User | null> {
    return this.opts.account.readExistingIdentity(identity);
  }

  private async issue(user: User): Promise<SignedIn> {
    const token = await this.opts.tokens.sign(
      { subject: user.id, username: user.username },
      TOKEN_TTL_SECONDS,
    );
    return { token, user: { id: user.id, username: user.username } };
  }
}

/**
 * A real argon2id digest of a value no one can supply. Unknown users,
 * OIDC-only users, and oversized inputs all take this bounded verifier path.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=2,p=1$YWJjZGVmZ2hpamtsbW5vcA$0RTS8ZC+9Bfl7Bx4rvGIYYqEs0mfOB5+3H4mPa0BvXk';
