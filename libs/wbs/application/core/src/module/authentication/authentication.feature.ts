import {
  AUTH_METHODS,
  type AuthenticatedUser,
  type AuthMethodId,
  authMethodOfSubject,
  type OidcIdentity,
  type WbsScope,
} from '@wbs/contracts';
import { admitMachineCredential, type MachineActor, type OrganizationRole } from '@wbs/domain';

import type { User } from '../../ports/account-values';
import type { MachineCredentials } from '../../ports/machine-credentials';
import type { OidcVerifier } from '../../ports/oidc-verifier';
import type { PasswordHasher, TokenCodec } from '../../ports/runtime';
import { digestMachineSecret, type MachineKey, parseMachineKey } from '../../service/machine-key';
import type { AccountResource } from './account.resource';

export const TOKEN_TTL_SECONDS = 12 * 60 * 60;

export interface SignedIn {
  token: string;
  user: { id: string; username: string };
}

export type RegisterOutcome =
  { ok: true; value: SignedIn } | { ok: false; reason: 'taken' | 'invalid' };

export type LoginOutcome = { ok: true; value: SignedIn } | { ok: false; reason: 'invalid' };

/**
 * The account behind a browser session, by how it was proved: a first-party
 * password session, or a verified OIDC access token of an existing mapping.
 */
export type SessionAccount = { kind: 'password'; user: User } | { kind: 'oidc'; user: User };

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
  /**
   * How `wbs_mk_` API keys are verified (`wbs-machine-credentials` A13, A22):
   * the credentials and the clock that judges secret expiry and last use.
   * Optional only for fixtures that never present a key: a well-formed key
   * reaching a service without it throws, never falls through to another
   * verifier.
   */
  machineKeys?: MachineKeyVerification;
}

/** What {@link AuthServiceOptions.machineKeys} reads. */
export interface MachineKeyVerification {
  readonly credentials: MachineCredentials;
  readonly now: () => number;
}

/** {@link AuthService.authenticateOrRefuse}'s answer when it admits nobody. */
export type AuthenticationRefusal = 'unknown_identity' | 'invalid_token';

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

  /**
   * The account a browser session proves. A first-party password session wins
   * (its token cannot be an OIDC one); otherwise the token is verified with the
   * configured OIDC verifier and resolved through existing mappings only, so a
   * session can never create or merge an account here. Verifier and store
   * faults propagate.
   */
  async sessionUser(token: string | null): Promise<SessionAccount | null> {
    const password = await this.passwordSessionUser(token);
    if (password !== null) return { kind: 'password', user: password };
    if (token === null || this.opts.oidc === undefined) return null;
    const identity = await this.opts.oidc.verify(token);
    if (identity === null) return null;
    const user = await this.readExistingOidcIdentity(identity);
    return user === null ? null : { kind: 'oidc', user };
  }

  /**
   * The catalogue methods an account can sign in with, from its mapped pairs
   * (never from token claims), in catalogue order.
   */
  async linkedMethods(userId: string): Promise<AuthMethodId[]> {
    const linked = new Set(
      (await this.opts.account.listIdentities(userId)).map(({ subject }) =>
        authMethodOfSubject(subject),
      ),
    );
    return AUTH_METHODS.map(({ id }) => id).filter((id) => linked.has(id));
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
    return this.opts.account.linkIdentity(userId, identity);
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
    const outcome = await this.authenticateOrRefuse(token);
    return outcome === 'unknown_identity' || outcome === 'invalid_token' ? null : outcome;
  }

  /**
   * {@link authenticate}, telling a verified token nobody is linked to
   * (`unknown_identity`) apart from an absent or invalid one (null).
   *
   * **A token without a groups claim never mints an account** (`wbs-team-claims`
   * D6b): it is a machine credential, which reaches only an account a host
   * operator linked it to with `link-credential-cli.ts`, and it is read through
   * the existing mapping alone, so it writes nothing (no email refresh either).
   * Its scopes come from the linked account's memberships
   * ({@link scopesOfRoles}); the per-organization role checks then apply as for
   * any session of that account. A token with the claim keeps the login path.
   *
   * **A token with the `wbs_mk_` prefix is an API key and nothing else**
   * (`wbs-machine-credentials` A13, A22): it is parsed once, never handed to
   * a JWT verifier, and answers `invalid_token` when it does not parse — all
   * before any read — or `unknown_identity` when no live credential admits it.
   */
  async authenticateOrRefuse(
    token: string | null,
  ): Promise<AuthenticatedUser | AuthenticationRefusal | null> {
    if (this.opts.localIdentity !== undefined) return this.opts.localIdentity;
    if (token === null) return null;
    const machineKey = parseMachineKey(token);
    if (machineKey === 'malformed') return 'invalid_token';
    // Proof: with this branch removed, the key fell through to the OIDC
    // verifier and `routes an API key to its credential and never to the JWT
    // verifier` in `machine-credential.controller.db.test.ts` failed, with 12
    // more cases of that file; watched 2026-10-22.
    if (machineKey !== null) return this.authenticateMachineKey(machineKey);
    if (this.opts.oidc !== undefined) {
      const identity = await this.opts.oidc.verify(token);
      if (identity === null) {
        // Proof: falling through while password sessions were disabled made the
        // literal fallback test authenticate the legacy account instead of null
        // (auth-service-null-password.test.ts).
        if (this.opts.passwordSessions !== true) return null;
      } else if (!identity.groupsClaimed) {
        // Proof: resolving this through `resolveOidcIdentity` made `refuses an
        // unlinked machine token as unknown_identity, minting no account` in
        // `fleet-credential.controller.db.test.ts` mint a second account and
        // answer 403 instead of 401 (watched 2026-10-20), and made `leaves the
        // owner's email alone under a groups-less token carrying an email`
        // write the token's address over Dany's (watched 2026-10-20).
        const linked = await this.readExistingOidcIdentity(identity);
        if (linked === null) return 'unknown_identity';
        return {
          id: linked.id,
          username: linked.username,
          scopes: scopesOfRoles(await this.opts.account.membershipRolesOf(linked.id)),
          authentication: { kind: 'upstream', issuer: identity.issuer, subject: identity.subject },
        };
      } else {
        const user = await this.resolveOidcIdentity(identity);
        if (user === null) return null;
        return {
          id: user.id,
          username: user.username,
          scopes: identity.scopes,
          authentication: { kind: 'upstream', issuer: identity.issuer, subject: identity.subject },
        };
      }
    }

    const claims = await this.opts.tokens.verify(token);
    if (claims === null) return null;
    const user = await this.opts.account.readAccount(claims.subject);
    // A valid signature cannot keep a deleted account authenticated.
    if (user === null) return null;
    return {
      id: user.id,
      username: user.username,
      scopes: ['read', 'write', 'editor'],
      authentication: { kind: 'first_party', issuedAt: claims.issuedAt },
    };
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

  /**
   * One API key: its credential read by id, its secret's digest compared with
   * that credential's secrets by {@link admitMachineCredential}, the admitted
   * actor's account read for its username, and the use recorded (coarsely).
   *
   * @throws when machine credentials are not wired, when the bound account
   * does not exist (the foreign key makes that corrupt state), and on every
   * store failure, the last-use write included.
   */
  private async authenticateMachineKey(
    key: MachineKey,
  ): Promise<AuthenticatedUser | 'unknown_identity'> {
    const machines = this.opts.machineKeys;
    // Proof: answering unknown_identity here made `throws on a well-formed key
    // when machine credentials are not wired` (machine-key.test.ts) resolve;
    // watched 2026-10-22.
    if (machines === undefined)
      throw new Error('an API key was presented but machine credentials are not wired');
    const digest = await digestMachineSecret(key.secret);
    const now = machines.now();
    const admission = admitMachineCredential(
      { kind: 'api_key', digest },
      await machines.credentials.findById(key.credentialId),
      now,
    );
    if (admission.kind === 'refused') return admission.refusal;
    const account = await this.opts.account.readAccount(admission.actor.accountId);
    // Proof: answering unknown_identity here made `throws when the admitted
    // credential's account does not exist` (machine-key.test.ts) resolve;
    // watched 2026-10-22.
    if (account === null)
      throw new Error(
        `machine credential ${admission.actor.credentialId} acts as a missing account`,
      );
    await machines.credentials.touchLastUsed(admission.actor.credentialId, now);
    return machinePrincipalOf(admission.actor, account.username);
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
 * The principal an admitted machine credential acts as
 * (`wbs-machine-credentials` A12): **the account its person is bound to**,
 * with exactly the credential's capped scopes (`read`, `write`; never
 * `editor`, whatever role that account holds), bound to the credential's
 * organization as a direct context so `resolve` never answers
 * `no_active_organization` for it and every organization administration
 * route refuses it `insufficient_scope` as it refuses a delegation, and
 * pinned to the credential's person for the claim rules.
 *
 * The one place the acting account is decided: A12 is the assumption most
 * likely to be overruled (a machine account per credential is the recorded
 * alternative), and that change belongs here alone.
 */
export function machinePrincipalOf(actor: MachineActor, username: string): AuthenticatedUser {
  return {
    id: actor.accountId,
    username,
    scopes: actor.scopes,
    // Proof: without this context, `admits a live key to its organization's
    // projects only` in `machine-credential.controller.db.test.ts` answered
    // 403 no_active_organization; watched 2026-10-22.
    delegation: { organizationId: actor.organizationId, audience: 'wbs-be-01/direct' },
    authentication: { kind: 'machine', credentialId: actor.credentialId, personId: actor.personId },
  };
}

/**
 * The scopes a linked machine token without a groups claim carries
 * (`wbs-team-claims` D6b): the strongest of its account's organization roles.
 * `viewer` reads, `member` reads and writes, `admin` and `super_admin` edit;
 * no membership grants nothing.
 *
 * Proof: answering [] for every role made `scopes a linked token without
 * groups from its account's membership: a member`
 * (`fleet-credential.controller.db.test.ts`) answer the member's read 403
 * insufficient_scope (watched 2026-10-20).
 */
export function scopesOfRoles(roles: readonly OrganizationRole[]): WbsScope[] {
  if (roles.some((role) => role === 'admin' || role === 'super_admin'))
    return ['read', 'write', 'editor'];
  if (roles.includes('member')) return ['read', 'write'];
  if (roles.includes('viewer')) return ['read'];
  return [];
}

/**
 * A real argon2id digest of a value no one can supply. Unknown users,
 * OIDC-only users, and oversized inputs all take this bounded verifier path.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=2,p=1$YWJjZGVmZ2hpamtsbW5vcA$0RTS8ZC+9Bfl7Bx4rvGIYYqEs0mfOB5+3H4mPa0BvXk';
