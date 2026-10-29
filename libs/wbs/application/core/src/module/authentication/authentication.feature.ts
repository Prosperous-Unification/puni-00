import {
  AUTH_METHODS,
  type AuthenticatedUser,
  type AuthMethodId,
  authMethodOfSubject,
  type CredentialAuthentication,
  isUnderMcpAuthorizationServer,
  type OidcIdentity,
  type WbsScope,
} from '@wbs/contracts';
import {
  admitMachineCredential,
  type GrantableMachineSource,
  type MachineActor,
  type OrganizationRole,
} from '@wbs/domain';

import type { User } from '../../ports/account-values';
import type { MachineCredentials } from '../../ports/machine-credentials';
import type { OidcVerifier } from '../../ports/oidc-verifier';
import type { PasswordHasher, TokenCodec } from '../../ports/runtime';
import type { TrustedIssuerTokens } from '../../ports/trusted-issuers';
import { machineGrantScopesOf } from '../../service/machine-grant';
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
  /** Accept native password sessions beside OIDC; they verify on the JWT key before any OIDC read. */
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
  /**
   * How JWTs of organizations' trusted issuers are verified
   * (`wbs-machine-credentials` A13 step 3, A16): the OIDC machine source.
   * Absent, the source is off and every JWT keeps the configured-issuer path
   * (fixtures only; `boot.ts` wires it). Requires {@link machineKeys}, whose
   * credentials and clock it reads.
   */
  trustedIssuers?: TrustedIssuerVerification;
}

/** What {@link AuthServiceOptions.machineKeys} reads. */
export interface MachineKeyVerification {
  readonly credentials: MachineCredentials;
  readonly now: () => number;
}

/** What {@link AuthServiceOptions.trustedIssuers} reads. */
export interface TrustedIssuerVerification {
  readonly tokens: TrustedIssuerTokens;
  /**
   * The Issuer Identifier of the deployment's configured human sign-in
   * issuer, null when the deployment configures none. A token of it never
   * reaches a trusted issuer (A13 step 2).
   */
  readonly configuredIssuer: () => Promise<string | null>;
}

/** What a machine admission answers besides an admitted proof or principal. */
export type AuthenticationRefusal = 'unknown_identity' | 'invalid_token';

/**
 * What {@link AuthService.authenticateOrRefuse} answers besides a principal:
 * {@link AuthenticationRefusal}, or a machine bearer presented to the HTTP API
 * (`machine_bearer_not_accepted`, `wbs-mcp-agent-surface` M9), which is
 * refused before any read because machines call WBS through mcp-01.
 */
export type BearerRefusal = AuthenticationRefusal | 'machine_bearer_not_accepted';

/**
 * A machine credential's proof as mcp-01's token endpoint received it
 * (`wbs-mcp-agent-surface` M2): a whole `wbs_mk_` key, or a workload
 * assertion of a trusted issuer.
 */
export type PresentedMachineCredential =
  | { readonly kind: 'api_key'; readonly key: string }
  | { readonly kind: 'oidc'; readonly assertion: string };

/** A proof {@link AuthService.admitMachineProof} admitted, its last use recorded. */
export interface AdmittedMachineProof {
  readonly actor: MachineActor;
  readonly source: GrantableMachineSource;
  /** The verified assertion's `exp` in seconds; null for an API key. */
  readonly assertionExpiresAt: number | null;
  /** The matched API-key secret's expiry in milliseconds; null when it has none. */
  readonly secretExpiresAt: number | null;
}

/**
 * What a machine grant names, as its verifier read it (M3): the run is the
 * token's opted-in `wbs_run` (M15), null when it carried none.
 */
export interface PresentedMachineGrant {
  readonly credentialId: string;
  readonly personId: string;
  readonly organizationId: string;
  readonly runId: string | null;
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
    return typeof outcome === 'string' ? null : outcome;
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
   * **Machine bearers are refused `machine_bearer_not_accepted` before any
   * read** (`wbs-mcp-agent-surface` M9): a token with the `wbs_mk_` prefix,
   * well-formed or not; and, once {@link AuthServiceOptions.trustedIssuers} is
   * wired, any JWT whose `iss` is not the configured sign-in issuer, trusted
   * by some organization or by none. Telling those apart would take a
   * registration read and answer which issuers are trusted (an enumeration
   * oracle: EKS and GKE issuer URLs embed account and cluster ids). Neither is
   * handed to any verifier.
   * Machines present them at mcp-01's token endpoint, whose
   * {@link admitMachineProof} verifies them, and call through `/mcp`.
   * A groups-less configured-issuer token keeps the D6b path below until
   * #731 retires operator links (M9's precondition).
   *
   * **A native session never reads the OIDC verifier**: when password
   * sessions are admitted it verifies on the JWT key first, so a session
   * cookie does not wait on issuer discovery (issue #669 F5).
   */
  async authenticateOrRefuse(
    token: string | null,
  ): Promise<AuthenticatedUser | BearerRefusal | null> {
    if (this.opts.localIdentity !== undefined) return this.opts.localIdentity;
    if (token === null) return null;
    // M9's refusal comes before any read. Proof: moved after the key's
    // admission, `is refused machine_bearer_not_accepted before any credential
    // read, recording no use` (be-01 machine-credential.controller.db.test.ts)
    // failed; removed, `refuses a live, a malformed or an unwired key…`
    // (machine-key.test.ts) failed; both watched 2026-10-29.
    if (parseMachineKey(token) !== null) return 'machine_bearer_not_accepted';
    // Proof: with a registration read put back in front of this refusal (the
    // stranger/trusted split, an enumeration oracle), and separately with the
    // refusal disabled, `refuses any other issuer’s JWT
    // machine_bearer_not_accepted, reading and verifying nothing`
    // (machine-key.test.ts) failed; watched 2026-10-30. With the credential
    // admitted and verified before it, `is refused machine_bearer_not_accepted
    // before any credential read or key set fetch` (be-01
    // oidc-credential.controller.db.test.ts) failed; watched 2026-10-29.
    if (
      this.opts.trustedIssuers !== undefined &&
      (await isForeignIssuerToken(token, this.opts.trustedIssuers))
    )
      return 'machine_bearer_not_accepted';
    // A native session verifies on the JWT key alone, before any OIDC read:
    // the OIDC verifier accepts RS256 only, so it never admits a token the
    // codec does, and asking it first made every cookie session wait on, and
    // fail with, issuer discovery (issue #669 F5).
    // Proof: with the OIDC-first order restored, `verifies a native session
    // without reading the OIDC verifier` in `auth-service-null-password.test.ts`
    // failed with the verifier's `only requests to HTTPS are allowed`; with
    // this condition made always true, `falls back from invalid OIDC only when
    // password sessions are enabled` authenticated the legacy account instead
    // of null; both watched 2026-10-24.
    if (this.opts.oidc === undefined || this.opts.passwordSessions === true) {
      const native = await this.nativeSessionUser(token);
      if (native !== null) return native;
    }
    if (this.opts.oidc === undefined) return null;
    const identity = await this.opts.oidc.verify(token);
    if (identity === null) return null;
    if (!identity.groupsClaimed) {
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
    }
    const user = await this.resolveOidcIdentity(identity);
    if (user === null) return null;
    return {
      id: user.id,
      username: user.username,
      scopes: identity.scopes,
      authentication: { kind: 'upstream', issuer: identity.issuer, subject: identity.subject },
    };
  }

  /** The account a native session token proves, or null when it is not one or its account is gone. */
  private async nativeSessionUser(token: string): Promise<AuthenticatedUser | null> {
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
   * One API key's admission at the grant route: its credential read by id,
   * its secret's digest compared with that credential's secrets by
   * {@link admitMachineCredential}, the admitted actor's account read for its
   * username, a non-member account refused `unknown_identity` before the use
   * is recorded (issuance refuses it, so nothing was used), then the use
   * recorded (coarsely); `unknown_identity` when the credential was removed
   * before the record. Answers the actor, its username and the matched
   * secret's expiry.
   *
   * @throws when machine credentials are not wired, when the bound account
   * does not exist (the foreign key makes that corrupt state), and on every
   * store failure, the last-use write included.
   */
  private async admitMachineKey(key: MachineKey): Promise<
    | {
        readonly actor: MachineActor;
        readonly username: string;
        readonly secretExpiresAt: number | null;
      }
    | 'unknown_identity'
  > {
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
    // Proof: with this refusal removed, `refuses an unknown, revoked, wrong or
    // non-member key alike, recording no use` (be-01
    // machine-grant.controller.db.test.ts) saw the non-member's last use
    // recorded; watched 2026-10-26.
    if (admission.actor.accountRole === null) return 'unknown_identity';
    // Proof: with this rejection caught and dropped, `fails as a server error
    // when its last use cannot be recorded` in
    // `machine-credential.controller.db.test.ts` failed; watched 2026-10-22,
    // and at the grant route 2026-10-29.
    // A removal committed since admission: the 401 the next request gets.
    // Proof: with `'absent'` answered as a principal, `refuses
    // unknown_identity when its credential is removed before the use is
    // recorded` (machine-key.test.ts) admitted; watched 2026-10-23.
    if ((await machines.credentials.touchLastUsed(admission.actor.credentialId, now)) === 'absent')
      return 'unknown_identity';
    return {
      actor: admission.actor,
      username: account.username,
      secretExpiresAt: admission.proofExpiresAt,
    };
  }

  /**
   * The machine credential a token request presents (`wbs-mcp-agent-surface`
   * M2, M3), admitted by the {@link admitMachineCredential} decision, its
   * last use recorded. This is the only path that verifies either source:
   * `/api` refuses both before any read (M9, {@link authenticateOrRefuse}).
   *
   * - an API key must be a whole `wbs_mk_` key; anything else, malformed or
   *   not, is `unknown_identity` with no read;
   * - an assertion must be a trusted issuer's ({@link admitTrustedIssuerToken}),
   *   its stored audience under `audienceRoot`; a token of the configured
   *   sign-in issuer, or no JWT at all, is `unknown_identity` with no
   *   credential read, never the browser path.
   *
   * `audienceRoot` is be-01's `WBS_MCP_AUTHORIZATION_SERVER`.
   *
   * @throws when machine credentials or trusted issuers are not wired, when
   * the admitted credential's account does not exist, and on every store
   * failure.
   */
  async admitMachineProof(
    presented: PresentedMachineCredential,
    audienceRoot: string,
  ): Promise<AdmittedMachineProof | AuthenticationRefusal> {
    // No assertion `jti` is consumed (M3): one projected Kubernetes token
    // serves every process of its pod until it rotates.
    // Proof: with a single-use consume of the assertion's `(iss, jti)` put in
    // front of this admission, `admits one Kubernetes token, one jti, from
    // three processes` (be-01 machine-grant.controller.db.test.ts) answered
    // the second and third 401 unknown_identity; watched 2026-10-26.
    if (presented.kind === 'api_key') {
      const key = parseMachineKey(presented.key);
      if (key === null || key === 'malformed') return 'unknown_identity';
      const admitted = await this.admitMachineKey(key);
      if (admitted === 'unknown_identity') return admitted;
      return {
        actor: admitted.actor,
        source: 'api_key',
        assertionExpiresAt: null,
        secretExpiresAt: admitted.secretExpiresAt,
      };
    }
    const trusted = this.opts.trustedIssuers;
    if (trusted === undefined)
      throw new Error('a workload assertion was presented but trusted issuers are not wired');
    const admitted = await this.admitTrustedIssuerToken(presented.assertion, trusted, audienceRoot);
    if (admitted === 'configured_path') return 'unknown_identity';
    if (typeof admitted === 'string') return admitted;
    return {
      actor: admitted.actor,
      source: 'oidc',
      assertionExpiresAt: admitted.assertionExpiresAt,
      secretExpiresAt: null,
    };
  }

  /**
   * The principal a verified machine grant acts as at one use
   * (`wbs-mcp-agent-surface` M3): its credential reread by id and judged by
   * {@link admitMachineCredential}'s `grant` variant (revocation, binding,
   * membership and pool expiry), the account read for its username, the use
   * recorded coarsely. The principal is {@link machinePrincipalOf}'s, with the
   * grant's run when it has one (M6, M15), and scopes derived from the reread
   * role alone ({@link machineGrantScopesOf}). Nothing about the grant is
   * consumed: it is reusable until its `exp`.
   *
   * @throws when machine credentials are not wired, when the admitted
   * credential's account does not exist, and on every store failure.
   */
  async admitMachineGrant(
    grant: PresentedMachineGrant,
  ): Promise<AuthenticatedUser | 'unknown_identity'> {
    const machines = this.opts.machineKeys;
    if (machines === undefined)
      throw new Error('a machine grant was presented but machine credentials are not wired');
    const now = machines.now();
    // Proof: with this reread replaced by a per-credential cache filled at
    // first use, `is refused unknown_identity at the next call after its
    // credential is revoked` (be-01 machine-grant.controller.db.test.ts)
    // answered 200 after the revocation; watched 2026-10-26.
    const admission = admitMachineCredential(
      { kind: 'grant', ...grant },
      await machines.credentials.findById(grant.credentialId),
      now,
    );
    if (admission.kind === 'refused') return admission.refusal;
    const { actor } = admission;
    // A grant admission refuses a non-member account, so the role is read.
    if (actor.accountRole === null)
      throw new Error(`machine credential ${actor.credentialId} was admitted without a role`);
    const account = await this.opts.account.readAccount(actor.accountId);
    if (account === null)
      throw new Error(`machine credential ${actor.credentialId} acts as a missing account`);
    if ((await machines.credentials.touchLastUsed(actor.credentialId, now)) === 'absent')
      return 'unknown_identity';
    return {
      ...machinePrincipalOf(actor, account.username, grant.runId),
      scopes: [...machineGrantScopesOf(actor.accountRole)],
    };
  }

  /**
   * One workload assertion of a trusted issuer (`wbs-machine-credentials` A13
   * steps 2, 3 and 5, A25), in this order:
   *
   * 1. No JWT, no string `iss`, or the configured issuer's `iss`: the
   *    configured path (`configured_path`), with no trusted-issuer read.
   * 2. No organization trusts the `iss`: `invalid_token`, with no key set
   *    fetched.
   * 3. The registration is selected by `(iss, aud)`: exactly one of the URL's
   *    registrations must have its audience among the token's `aud` values;
   *    none, or more than one, is `invalid_token` with no fetch.
   * 4. The credential is read by that registration and the `sub`, within the
   *    registration's own organization. The audience it is verified with is
   *    the credential's own, or else the registration's (a credential's
   *    audience narrows: its token carries both). That audience must name
   *    `audienceRoot` ({@link isUnderMcpAuthorizationServer}, task 1.5 at
   *    use), else `invalid_token` with no fetch: a row stored before the M2
   *    rule (a `wbs:org:` audience) stops verifying here, as the audience
   *    preflight lists. Then the token is verified against the
   *    registration's key set; any failure, an unfetchable key set included,
   *    is `invalid_token`.
   * 5. Verified with no credential: `unknown_identity`; with one, the
   *    {@link admitMachineCredential} decision; a non-member account is
   *    `unknown_identity` before the use is recorded; then the use is
   *    recorded (`unknown_identity` when the credential was removed before
   *    the record). Answers the actor, its username and the token's `exp`.
   *
   * @throws when machine credentials are not wired, when the admitted
   * credential's account does not exist, and on every store failure.
   */
  private async admitTrustedIssuerToken(
    token: string,
    trusted: TrustedIssuerVerification,
    audienceRoot: string,
  ): Promise<
    | {
        readonly actor: MachineActor;
        readonly username: string;
        readonly assertionExpiresAt: number;
      }
    | AuthenticationRefusal
    | 'configured_path'
  > {
    const claims = trusted.tokens.peek(token);
    if (claims === null) return 'configured_path';
    // Proof: with this comparison removed, `never consults trusted issuers
    // for a configured-issuer token without groups` in
    // `oidc-credential.controller.db.test.ts` admitted the credential a
    // planted trusted issuer of the configured URL holds; watched 2026-10-22,
    // and again through mcp-01's jwt-bearer grant 2026-10-29.
    if (claims.issuer === (await trusted.configuredIssuer())) return 'configured_path';
    const machines = this.opts.machineKeys;
    if (machines === undefined)
      throw new Error('trusted issuers are wired but machine credentials are not');
    const registrations = await machines.credentials.trustedRegistrationsOf(claims.issuer);
    // Proof: with this refusal answering `configured_path` instead (a
    // stranger `iss` let through to the configured verifier), `refuses a
    // stranger issuer invalid_token without fetching any key set` in
    // `oidc-credential.controller.db.test.ts` answered 401 unauthenticated;
    // watched 2026-10-22. Through mcp-01's jwt-bearer grant it answered
    // unknown_identity; watched 2026-10-29.
    if (registrations.length === 0) return 'invalid_token';
    const selected = registrations.filter((each) => claims.audiences.includes(each.audience));
    const registration = selected.at(0);
    // Proof: with the `length > 1` half removed, `refuses a token naming two
    // organizations' audiences` in `oidc-credential.controller.db.test.ts`
    // admitted it as the first organization's; watched 2026-10-22, and again
    // through mcp-01's jwt-bearer grant 2026-10-29.
    if (registration === undefined || selected.length > 1) return 'invalid_token';
    const pair =
      claims.subject === null
        ? null
        : await machines.credentials.findOidcCredential(registration.id, claims.subject);
    // Proof: answering the registration's audience alone made `refuses a
    // wrong audience, the credential audience winning over the default`
    // (oidc-credential.controller.db.test.ts) admit a token without the
    // credential's own audience; watched 2026-10-22, and again through
    // mcp-01's jwt-bearer grant 2026-10-29.
    const audience = pair?.audience ?? registration.audience;
    // Task 1.5 at use. Proof: with this check disabled, `refuses a stored
    // audience outside the authorization server invalid_token, verifying
    // nothing` (machine-key.test.ts) saw the key set asked, and be-01's `is
    // refused invalid_token through the grant…` (oidc-credential.controller.db.test.ts)
    // failed; watched 2026-10-29.
    if (!isUnderMcpAuthorizationServer(audience, audienceRoot)) return 'invalid_token';
    const verdict = await trusted.tokens.verify(token, {
      issuer: claims.issuer,
      jwksUri: registration.jwksUri,
      audience,
    });
    // Proof: with only `key_set_unavailable` refused here (an `invalid`
    // verdict admitted), `refuses a token signed by another key` and `refuses
    // a wrong audience, the credential audience winning over the default` in
    // `oidc-credential.controller.db.test.ts` answered 200; watched
    // 2026-10-22, and again through mcp-01's jwt-bearer grant 2026-10-29.
    if (verdict.kind !== 'verified') return 'invalid_token';
    if (verdict.subject !== claims.subject)
      throw new Error('a verified token changed its subject between peek and verify');
    if (pair === null) return 'unknown_identity';
    const now = machines.now();
    const admission = admitMachineCredential(
      { kind: 'oidc', trustedIssuerId: registration.id },
      pair.credential,
      now,
    );
    if (admission.kind === 'refused') return admission.refusal;
    const account = await this.opts.account.readAccount(admission.actor.accountId);
    if (account === null)
      throw new Error(
        `machine credential ${admission.actor.credentialId} acts as a missing account`,
      );
    // Proof: with this refusal removed, `refuses a non-member's assertion
    // unknown_identity, recording no use` (be-01 machine-grant.controller.db.test.ts)
    // saw the last use recorded; watched 2026-10-26.
    if (admission.actor.accountRole === null) return 'unknown_identity';
    // As on the API-key path: a removal committed since admission.
    if ((await machines.credentials.touchLastUsed(admission.actor.credentialId, now)) === 'absent')
      return 'unknown_identity';
    return {
      actor: admission.actor,
      username: account.username,
      assertionExpiresAt: verdict.expiresAt,
    };
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
 * Whether `token` is a JWT naming an issuer other than the deployment's
 * configured sign-in issuer: a trusted issuer's token, or nobody's. `/api`
 * refuses both alike (M9), so it reveals nothing of which issuers some
 * organization trusts. Only the unverified claims and the configured issuer
 * are read, never a store or a key set.
 */
async function isForeignIssuerToken(
  token: string,
  trusted: TrustedIssuerVerification,
): Promise<boolean> {
  const claims = trusted.tokens.peek(token);
  return claims !== null && claims.issuer !== (await trusted.configuredIssuer());
}

/**
 * The principal an admitted machine credential acts as
 * (`wbs-machine-credentials` A12): **the account its person is bound to**,
 * with exactly the credential's capped scopes (`read`, `write`; never
 * `editor`, whatever role that account holds), bound to the credential's
 * organization as a direct context so `resolve` never answers
 * `no_active_organization` for it and every organization administration
 * route refuses it `insufficient_scope` as it refuses a delegation, and
 * pinned to the credential's person for the claim rules. In its organization
 * it holds at most `member` ({@link organizationRoleOf}, A23), so it never
 * gains the bound account's administration.
 *
 * `runId` is a machine grant's opted-in run (`wbs-mcp-agent-surface` M15),
 * null for a grant without one: that principal carries no run, so its
 * renewal and claims are the person's (M6 parity).
 *
 * The one place the acting account is decided, with
 * {@link organizationRoleOf} beside it: A12 is the assumption most likely to
 * be overruled (a machine account per credential is the recorded
 * alternative), and that change belongs here alone.
 */
export function machinePrincipalOf(
  actor: MachineActor,
  username: string,
  runId: string | null,
): AuthenticatedUser {
  return {
    id: actor.accountId,
    username,
    scopes: actor.scopes,
    // Proof: without this context, `admits a live key to its organization's
    // projects only` in `machine-credential.controller.db.test.ts` answered
    // 403 no_active_organization; watched 2026-10-22.
    // The same fault failed it, the batch write and the administration
    // refusal of `an API key on the MCP path` there; watched 2026-10-29.
    delegation: { organizationId: actor.organizationId, audience: 'wbs-be-01/direct' },
    authentication: {
      kind: 'machine',
      credentialId: actor.credentialId,
      personId: actor.personId,
      ...(runId === null ? {} : { runId }),
    },
  };
}

/**
 * The organization role a principal acts with, from its membership's stored
 * role (`wbs-machine-credentials` A23): a machine credential, and an MCP
 * consent delegation acting as an agent person (A20), is a `member` of its
 * organization whatever role the bound account holds — never `admin` or
 * `super_admin`, so no claim-admin bypass, no person binding, no member or
 * settings administration — and a `viewer` account's machine stays a viewer.
 * Every other principal keeps its stored role. `resolve` applies it to the
 * scope it answers.
 *
 * Proof: answering the stored role for a machine made `refuses patchPerson to
 * an admin-bound key`, `refuses an admin-bound key a person bound to another
 * account` and `gives a super-admin-bound key no claim-admin bypass`
 * (`machine-credential.controller.db.test.ts`) fail; watched 2026-10-22, and
 * again for `a key pinned to one person, through mcp-01` on 2026-10-29.
 * Proof: with `consent` left out, `a consent session's tool call claims as
 * its agent, never with the human's reach` (mcp-01
 * `organization-delegation.boot.test.ts`) answered the claim for the unbound
 * `loose` `credential_not_for_person` (the super-admin bypass passed it on)
 * instead of `person_not_bound`; watched 2026-10-22.
 */
export function organizationRoleOf(
  role: OrganizationRole,
  authentication: CredentialAuthentication | undefined,
): OrganizationRole {
  if (authentication?.kind !== 'machine' && authentication?.kind !== 'consent') return role;
  return role === 'viewer' ? 'viewer' : 'member';
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
