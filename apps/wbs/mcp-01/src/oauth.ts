import {
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  type KeyObject,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import {
  type BrowserOidcClient,
  browserOidcClientFromEnv,
  type BrowserOidcTokenSet,
  classifyOidcFailure,
  type JwtClaims,
  type OidcIdentity,
  oidcIdentityFromClaims,
  oidcTokenVerifierFromEnv,
  type TokenVerifier,
} from '@wbs/auth';
import { canonicalMcpResourceOf, mcpAuthorizationServerOf } from '@wbs/contracts';
import { credentialRuleRefusal } from '@wbs/core';
import {
  compactVerify,
  decodeJwt,
  decodeProtectedHeader,
  type JWTPayload,
  jwtVerify,
  SignJWT,
} from 'jose';

import type { CallerAdmission } from './caller-auth';
import { type McpConfig, offersMachineGrants } from './config';
import { type DeploymentFaultReporter, McpDeploymentFault } from './deployment-fault';
import { groupPrefixOf, type McpOAuthHandler } from './http';
import {
  MachineCaller,
  type MachineIdentity,
  machineIdentityOf,
  RefusedMachineTokens,
} from './machine-admission';
import {
  type IssuedMachineGrant,
  type MachineGrantAnswer,
  type MachineGrantClient,
  machineGrantClient,
  MachineGrantDefect,
} from './machine-grant-client';
import { type IssuanceAttempt, type MachineLimits, MachineTrafficLimits } from './machine-limits';
import {
  type ConsentOrganizations,
  type OrganizationAuthority,
  organizationAuthority,
  type OrganizationChoice,
} from './organization-authority';
import { type AuthorizationContext, PendingAuthorizations } from './pending-authorizations';
import { matchesRefreshAuthority, type McpRefreshAuthorityReader } from './refresh-authority';
import {
  type ClientCensus,
  type ConsentBinding,
  type CredentialBinding,
  type FamilyRecord,
  McpConsentPendingGone,
  McpRefreshFamilyCorrupt,
  McpSessionStore,
  type RegisteredClient,
} from './session-store';
import { sourceAddressOf } from './source-address';
import { ACTIVATED_CREDENTIAL_EPOCH, SUPPORTED_CREDENTIAL_EPOCH } from './store-migrations';
import {
  CLIENT_CREDENTIALS_GRANT,
  isMachineGrantType,
  JWT_BEARER_GRANT,
  type MachineScope,
  type MachineTokenRequest,
  parseMachineTokenRequest,
  type TokenRequestRefusal,
} from './token-request';
import {
  DelegationRefused,
  EdgeGate,
  type FetchLike,
  SessionRefreshRefused,
  UpstreamRejected,
} from './wbs-client';

const SCOPES = new Set(['wbs:read', 'wbs:write', 'wbs:editor']);
const COOKIE = '__Host-wbs_mcp_oauth';
const SELECT_COOKIE = '__Host-wbs_mcp_select';
const REAUTH_COOKIE = '__Host-wbs_mcp_reauth';
const GRANT_TTL_MS = 300_000;
const DEFAULT_ACCESS_TTL_MS = 3_600_000;
const REFRESH_IDLE_MS = 14 * 86_400_000;
const REFRESH_ABSOLUTE_MS = 30 * 86_400_000;
const UPSTREAM_REFRESH_EARLY_MS = 120_000;
const UNPROVEN_CLIENT_TTL_MS = 600_000;
// Proof: 2026-10-25, 86_400_000 here failed `authorizes a client 25 h after its code exchange
// without a refresh, across a restart` (400 invalid_client), `renews the client at each refresh,
// …` and `renews a client only on a successful refresh` (expiry); 2 * REFRESH_ABSOLUTE_MS failed
// both renewal tests (expiry) and `deletes an expired proven client with no live family and
// answers invalid_client` (302) (oauth.test.ts).
/**
 * How long a proven client stays registered after its last use: a code exchange (promotion) or a
 * successful refresh, each of which moves `expires_at` to now plus this, never back. It equals
 * {@link REFRESH_ABSOLUTE_MS}, so a client outlives every refresh family issued or refreshed
 * since this lifetime shipped (idle 14 d, absolute 30 d from its exchange) and keeps 16 or more
 * days past a lapsed family's idle expiry for a fresh authorization with the same `client_id`.
 * A family from before then can outlive its client, whose row was already swept at 24 h; and a
 * client unused for 30 d is swept. Connectors such as Claude Code cache the `client_id`
 * indefinitely and do not re-register on the browser `invalid_client`, so a client that expires
 * while its connector still holds it broke every later sign-in; the former 24 h promotion
 * lifetime, which refresh never renewed, did exactly that on dev. Authorization now re-admits
 * such a swept id ({@link McpOAuthServer.readmitClient}).
 */
const PROVEN_CLIENT_TTL_MS = REFRESH_ABSOLUTE_MS;
/** Bytes of entropy in each id the default `random` issues, `client_id` included. */
const ISSUED_ID_BYTES = 32;
const MAX_AUTHORIZATION_QUERY_BYTES = 2_048;
const MAX_STATE_BYTES = 512;
const MAX_REDIRECT_URIS = 10;
const MAX_REDIRECT_URI_BYTES = 512;
const MAX_REAUTH_MARKERS = 1_000;

// Proof: on 2026-09-27, extending Error instead failed `refuses a tool-call refresh of an ended or
// unrefreshable session as a session outcome` on its first toBeInstanceOf.
/**
 * Refresh is refused. Provider refusal revokes the family; absent organization
 * authority leaves the family intact and consumes no refresh credential.
 */
class UpstreamRefreshRefused extends SessionRefreshRefused {}

/**
 * The provider refresh could not be completed now (provider unreachable, lease lost or timed
 * out, family changed while waiting); the family is kept and the caller may retry.
 */
class UpstreamRefreshUnavailable extends Error {}

type CallbackError =
  | 'access_denied'
  | 'invalid_request'
  | 'invalid_scope'
  | 'server_error'
  | 'temporarily_unavailable'
  | 'unauthorized_client'
  | 'unsupported_response_type';

export interface McpAuthorizationGrant {
  clientId: string;
  codeChallenge: string;
  expiresAt: number;
  redirectUri: string;
  scope: string;
  scopes: readonly string[];
  subject: string;
  upstreamAccessToken: string;
  upstreamRefreshToken?: string;
  upstreamExpiresAt: number;
  /** The organization, local user and upstream issuer a consent after activation selected. */
  binding?: CredentialBinding;
  /**
   * The agent person a consent chose to act as (A20), its minted be-01 credential and the
   * family id that credential names, which the exchange must create.
   */
  consent?: ConsentBinding & { readonly familyId: string };
  /** The durable epoch at issue; exchange refuses the code once the store's has moved on. */
  credentialEpoch: number;
}

/** What a completed upstream login contributes to a grant, before any organization is chosen. */
type GrantFields = Pick<
  McpAuthorizationGrant,
  | 'scope'
  | 'scopes'
  | 'subject'
  | 'upstreamAccessToken'
  | 'upstreamRefreshToken'
  | 'upstreamExpiresAt'
  | 'binding'
  | 'consent'
>;

/**
 * A consent waiting for its user to choose one of several organizations, or whether to act as
 * themself or as one of their agent persons (A20).
 */
interface PendingSelection {
  readonly authorization: AuthorizationContext;
  readonly fields: GrantFields;
  readonly userId: string;
  readonly issuer: string;
  readonly memberships: readonly OrganizationChoice[];
  /** Every offered agent, in page order; the page posts an index into this list. */
  readonly agents: readonly { readonly organizationId: string; readonly personId: string }[];
  readonly expiresAt: number;
}

/** `MCP_MACHINE_TOKEN_TTL`'s default and bounds, in seconds (`wbs-mcp-agent-surface` M4). */
const DEFAULT_MACHINE_TOKEN_TTL_SECONDS = 12 * 60 * 60;
const LEAST_MACHINE_TOKEN_TTL_SECONDS = 60;
const MOST_MACHINE_TOKEN_TTL_SECONDS = 24 * 60 * 60;
/**
 * How long before its grant a machine token expires (M3), absorbing clock skew
 * between mcp-01 and be-01. mcp-01 asks be-01 for this much more than the
 * token's own lifetime, so a 24 h token fits be-01's 24 h + 60 s grant cap.
 */
const MACHINE_TOKEN_EARLY_SECONDS = 60;
/** The largest share of the TTL the uniform jitter takes off (M4). */
const MACHINE_TOKEN_JITTER = 0.1;

/** What the token endpoint needs to answer the machine grants (`wbs-mcp-agent-surface` M2–M4). */
export interface MachineGrantSettings {
  /** be-01's grant route, the only verifier of a key or an assertion. */
  readonly client: MachineGrantClient;
  /**
   * `MCP_BE_INTERNAL_SECRET`, sent beside the grant on every be-01 call a machine token makes
   * (M14); the grant alone acts as no one.
   */
  readonly secret: string;
  /** `MCP_MACHINE_TOKEN_TTL`, in seconds, before jitter. */
  readonly tokenTtlSeconds: number;
  /** A uniform draw from [0, 1) for the jitter; `Math.random` when absent. */
  readonly jitter?: () => number;
  /**
   * M10's per-replica limits, shared by the token endpoint and every machine caller's
   * `tools/call`; production composes {@link MachineTrafficLimits}.
   */
  readonly limit: MachineLimits;
  /**
   * Reports a fault be-01's answer revealed ({@link MachineGrantDefect}),
   * redacting the deployment's secrets, as `main.ts` composes it; the client
   * is then answered `502 server_error` (M3).
   */
  readonly reportFault: DeploymentFaultReporter;
}

/**
 * be-01's activation marker is set while mcp-01's credential epoch is still 0 (M13): the
 * activation runbook moves both in one procedure, so this is a deployment fault, never a mode
 * in which an upstream token is forwarded.
 */
export class ActivationMarkersDisagree extends McpDeploymentFault {}

/** At most this many consent ends are reported to be-01 per sweep. */
const CONSENT_END_REPORT_BATCH = 100;

interface Options {
  groupsClaim?: string;
  groupPrefix?: string;
  now?: () => number;
  random?: () => string;
  signingKeys?: { privateKey: KeyObject; publicKey: KeyObject; previousPublicKey?: KeyObject };
  accessTtlMs?: number;
  store?: McpSessionStore;
  readRefreshAuthority?: McpRefreshAuthorityReader;
  /**
   * be-01's MCP delegation routes. Present, a consent after activation binds
   * one organization, a bound session's be-01 calls carry signed delegations,
   * and {@link readRefreshAuthority} defaults to its family authority read.
   */
  organizations?: OrganizationAuthority;
  verifyUpstream?: TokenVerifier['verify'];
  clientLimit?: number;
  clientSourceLimit?: number;
  provenClientSourceLimit?: number;
  clientTtlMs?: number;
  grantLimit?: number;
  provenClientTtlMs?: number;
  sessionLimit?: number;
  transactionLimit?: number;
  transactionLimitPerClient?: number;
  routeEvidence?: (evidence: OAuthRouteEvidence) => void;
  reauthKey?: Buffer;
  revocationFailure?: () => void;
  /** Present, the token endpoint answers the machine grants; absent, `unsupported_grant_type`. */
  machineGrants?: MachineGrantSettings;
  /**
   * Reports a deployment fault found while admitting a caller ({@link ActivationMarkersDisagree});
   * required with {@link organizations}, the only way mcp-01 can ask be-01 for its marker.
   */
  reportFault?: DeploymentFaultReporter;
}

type UpstreamClient = Pick<
  BrowserOidcClient,
  'authorizationUrl' | 'exchange' | 'refresh' | 'revoke'
>;

function generateSigningKeys(): NonNullable<Options['signingKeys']> {
  const generated = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { privateKey: generated.privateKey, publicKey: generated.publicKey };
}

export interface OAuthRouteEvidence {
  method: string;
  path: string;
  status: number;
  grant_type?: string;
  registration_grant_types?: readonly string[];
}

/**
 * The OAuth authorization server fronting the upstream IdP: public-client registration, the
 * browser half of consent, and code and refresh exchange. Registered clients, refresh families
 * and sessions live in the {@link McpSessionStore}, so a client keeps its `client_id` across a
 * restart; codes, pending logins, organization choices and reauthentication markers are short
 * lived and stay in this process.
 */
export class McpOAuthServer implements McpOAuthHandler {
  /**
   * Clients whose promotion to proven is reserved while their code exchange signs a token; they
   * count against the proven per-source cap. Held in memory, not stored: a reservation lives only
   * across one exchange's awaits, and a stored one would outlive a process that died
   * mid-exchange, refusing that client's every later exchange with 429 until it expired. A
   * second process sharing the store (blue and green mid-swap) does not see these reservations,
   * so the proven cap can be exceeded by the exchanges in flight in the other process.
   */
  private readonly promotionReservations = new Set<string>();
  // Proof: 2026-10-21, one module-level map shared by every instance made `forgets a code
  // issued before a store reopen at the same epoch` (credential-epoch.test.ts) exchange it (200).
  private readonly grants = new Map<string, McpAuthorizationGrant>();
  private readonly selections = new Map<string, PendingSelection>();
  private readonly organizations: OrganizationAuthority | undefined;
  private readonly store: McpSessionStore;
  private readonly reauthMarkers = new Map<string, number>();
  private readonly pendingAuthorizations: PendingAuthorizations;
  private readonly now: () => number;
  private readonly random: () => string;
  private readonly issuer: string;
  private readonly audience: string;
  private readonly callbackUrl: string;
  private readonly groupsClaim: string;
  private readonly groupPrefix: string;
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;
  private readonly previousPublicKey: KeyObject | undefined;
  private readonly keyId: string;
  private readonly previousKeyId: string | undefined;
  private readonly accessTtlMs: number;
  private readonly verifyUpstream: TokenVerifier['verify'];
  private readonly reauthKey: Buffer;
  private readonly revocationFailure: () => void;
  private readonly machineGrants: MachineGrantSettings | undefined;
  private readonly reportFault: DeploymentFaultReporter | undefined;
  /** This replica's refused machine tokens (M3); never a store (M5). */
  private readonly refusedMachineTokens: RefusedMachineTokens;
  /** Absent, as for a server built without it, machine grants are refused like gateway mode. */
  private readonly authMode: McpConfig['MCP_AUTH_MODE'] | undefined;
  /** `MCP_TRUSTED_PROXY_HOPS`: how a request's source address is read (M10). */
  private readonly trustedProxyHops: number;

  private readonly clientLimit: number;
  private readonly clientSourceLimit: number;
  private readonly provenClientSourceLimit: number;
  private readonly clientTtlMs: number;
  private readonly provenClientTtlMs: number;
  private readonly grantLimit: number;
  private readonly sessionLimit: number;
  private readonly routeEvidence: Options['routeEvidence'];
  private readonly readRefreshAuthority: McpRefreshAuthorityReader | undefined;
  constructor(
    config: Pick<McpConfig, 'MCP_PUBLIC_URL' | 'MCP_TRUSTED_PROXY_HOPS'> &
      Partial<Pick<McpConfig, 'MCP_AUTH_MODE'>>,
    private readonly upstream: UpstreamClient,
    options: Options = {},
  ) {
    this.audience = canonicalMcpResourceOf(config.MCP_PUBLIC_URL);
    this.issuer = mcpAuthorizationServerOf(config.MCP_PUBLIC_URL);
    this.callbackUrl = `${this.issuer}/callback`;
    this.groupsClaim = options.groupsClaim ?? 'wbs_groups';
    this.groupPrefix = options.groupPrefix ?? 'dev';
    this.now = options.now ?? Date.now;
    this.random = options.random ?? (() => randomBytes(ISSUED_ID_BYTES).toString('base64url'));
    const keys: NonNullable<Options['signingKeys']> = options.signingKeys ?? generateSigningKeys();
    this.privateKey = keys.privateKey;
    this.publicKey = keys.publicKey;
    this.previousPublicKey = keys.previousPublicKey;
    this.keyId = keyIdOf(this.publicKey);
    this.previousKeyId =
      this.previousPublicKey === undefined ? undefined : keyIdOf(this.previousPublicKey);
    this.accessTtlMs = Math.max(1_000, options.accessTtlMs ?? DEFAULT_ACCESS_TTL_MS);
    this.store = options.store ?? new McpSessionStore(':memory:', [randomBytes(32)]);
    this.verifyUpstream =
      options.verifyUpstream ?? (() => Promise.reject(new Error('upstream verifier is required')));
    this.reauthKey = options.reauthKey ?? randomBytes(32);
    this.revocationFailure =
      options.revocationFailure ??
      (() => {
        console.error(JSON.stringify({ event: 'mcp_oauth_refresh_revoke_failed' }));
      });
    this.clientLimit = Math.max(1, options.clientLimit ?? 1_000);
    this.clientSourceLimit = Math.max(1, options.clientSourceLimit ?? 20);
    this.provenClientSourceLimit = Math.max(1, options.provenClientSourceLimit ?? 100);
    this.clientTtlMs = Math.max(1, options.clientTtlMs ?? UNPROVEN_CLIENT_TTL_MS);
    this.provenClientTtlMs = Math.max(1, options.provenClientTtlMs ?? PROVEN_CLIENT_TTL_MS);
    this.grantLimit = Math.max(1, options.grantLimit ?? 1_000);
    this.sessionLimit = Math.max(1, options.sessionLimit ?? 1_000);
    this.routeEvidence = options.routeEvidence;
    this.organizations = options.organizations;
    this.machineGrants = options.machineGrants;
    this.reportFault = options.reportFault;
    this.refusedMachineTokens = new RefusedMachineTokens(this.now);
    this.authMode = config.MCP_AUTH_MODE;
    this.trustedProxyHops = config.MCP_TRUSTED_PROXY_HOPS;
    if (this.organizations !== undefined && this.reportFault === undefined)
      throw new Error('organization authority needs a deployment fault reporter');
    // Proof: 2026-10-21, without this refusal `refuses to start at the activated epoch without
    // organization authority` (credential-epoch.test.ts) constructed the server.
    if (
      this.organizations === undefined &&
      this.store.credentialEpoch() >= ACTIVATED_CREDENTIAL_EPOCH
    )
      throw new Error(
        'MCP credential epoch is activated; mcp-01 needs INTERNAL_AUTH_SECRET or MCP_BE_INTERNAL_SECRET to bind consents',
      );
    this.readRefreshAuthority =
      options.readRefreshAuthority ?? options.organizations?.readRefreshAuthority;
    this.pendingAuthorizations = new PendingAuthorizations({
      globalLimit: Math.max(1, options.transactionLimit ?? 1_000),
      now: this.now,
      perClientLimit: Math.max(1, options.transactionLimitPerClient ?? 5),
      ttlMs: GRANT_TTL_MS,
    });
  }

  /**
   * Answers an OAuth route, or undefined for any other path.
   *
   * @param request the HTTP request.
   * @param peer the socket's remote address, read only with `MCP_TRUSTED_PROXY_HOPS=0`; null
   *   where no socket is known, as for a test's request, which then counts as unattributed.
   */
  async response(request: Request, peer: string | null = null): Promise<Response | undefined> {
    const url = new URL(request.url);
    const source = sourceAddressOf(
      request.headers.get('x-forwarded-for'),
      peer,
      this.trustedProxyHops,
    );
    const evidenceRequest = this.routeEvidence === undefined ? undefined : request.clone();
    let response: Response | undefined;
    if (url.pathname === new URL(`${this.issuer}/register`).pathname && request.method === 'POST') {
      response = await this.register(request, source);
    } else if (
      url.pathname === new URL(`${this.issuer}/authorize`).pathname &&
      request.method === 'GET'
    ) {
      response = await this.authorize(request, url, source);
    } else if (url.pathname === new URL(this.callbackUrl).pathname && request.method === 'GET') {
      response = await this.callback(request, url);
    } else if (
      url.pathname === new URL(`${this.issuer}/organization`).pathname &&
      request.method === 'POST'
    ) {
      response = await this.selectOrganization(request);
    } else if (
      url.pathname === new URL(`${this.issuer}/token`).pathname &&
      request.method === 'POST'
    ) {
      response = await this.token(request, source);
    } else if (
      url.pathname === new URL(`${this.issuer}/revoke`).pathname &&
      request.method === 'POST'
    ) {
      response = await this.revoke(request);
    } else if (
      url.pathname === new URL(`${this.issuer}/jwks`).pathname &&
      request.method === 'GET'
    ) {
      response = Response.json({ keys: this.publicJwks() });
    }
    if (response !== undefined && evidenceRequest !== undefined) {
      this.routeEvidence?.(await routeEvidenceOf(evidenceRequest, url.pathname, response.status));
    }
    return response;
  }

  /**
   * Verifies a bearer as {@link admitCaller} does, without refreshing a consent session's
   * upstream token: a machine token's claims, a consent token's, or before activation an
   * upstream token's.
   */
  async verify(token: string): Promise<JwtClaims> {
    let payload: JWTPayload;
    try {
      payload = await this.verifySignature(token);
    } catch (cause) {
      this.refuseOwnToken(token, cause);
      return await this.admitUpstream(token);
    }
    if (payload['token_use'] === 'machine') return this.machineClaimsOf(payload).claims;
    return this.consentClaimsOf(payload);
  }

  /**
   * Rethrows `cause` for a token that names mcp-01's own issuer, so an
   * mcp-01 token that failed local verification (an expired machine token, or
   * an ended session's) is never handed to the upstream verifier.
   */
  private refuseOwnToken(token: string, cause: unknown): void {
    let issuer: unknown;
    try {
      issuer = decodeJwt(token).iss;
    } catch {
      // Not a JWT at all: the upstream verifier refuses it on its own terms.
      return;
    }
    // Proof: with this rethrow removed, `never hands a machine token to the upstream verifier`
    // (machine-token.test.ts) saw one upstream verification; watched 2026-10-27.
    if (issuer === this.issuer) throw cause;
  }

  /**
   * Admits one `/mcp` bearer (`wbs-mcp-agent-surface` M5, M13), dispatching on the verified
   * token's `token_use`:
   * - `machine`: signature, issuer, audience, `exp`, the grant, and this replica's refused set;
   *   no store is read or written, so another replica sharing only the keys and the secret
   *   admits it too;
   * - `consent`, or none for a consent token issued before slice 2 (until
   *   `MCP_ACCESS_TOKEN_TTL` after that release): the session store, and the session's
   *   upstream token refreshed when due;
   * - any other `token_use` is refused;
   * - a token of another issuer is an upstream token, admitted only before activation.
   *
   * @throws {ActivationMarkersDisagree} when be-01 is activated and mcp-01's epoch is not.
   * @throws {EdgeGate} when the identity provider is unavailable for a due refresh.
   * Any other refusal throws a plain error, which `/mcp` answers `401 invalid_token`.
   */
  async admitCaller(token: string): Promise<CallerAdmission> {
    let payload: JWTPayload;
    try {
      payload = await this.verifySignature(token);
    } catch (cause) {
      this.refuseOwnToken(token, cause);
      const claims = await this.admitUpstream(token);
      return { claims, upstreamToken: token, mcpSessionId: null, machine: null };
    }
    // Proof: with this dispatch removed, `a headless agent's key reaches /mcp as its machine
    // person` (machine-admission.boot.test.ts) answered 401: the session store knows no machine
    // token; watched 2026-10-27.
    if (payload['token_use'] === 'machine') return this.admitMachine(payload);
    const claims = this.consentClaimsOf(payload);
    const family = this.sessionOf(payload);
    const sessionId = payload.jti;
    if (typeof sessionId !== 'string') throw new Error('verified MCP token has no session id');
    try {
      const current = await this.refreshUpstreamIfNeeded(family);
      return {
        claims,
        upstreamToken: current.upstreamAccessToken,
        mcpSessionId: sessionId,
        machine: null,
      };
    } catch (cause) {
      if (cause instanceof UpstreamRefreshUnavailable)
        throw new EdgeGate('The identity provider is temporarily unavailable. Retry this request.');
      // Proof: mapping unexpected reader defects to outages failed `trusted reader defect`
      // on the automatic path, 2026-10-13; only modeled unavailability is an EdgeGate.
      throw cause;
    }
  }

  /** {@link admitCaller} for a consent or upstream bearer; a machine token has no session. */
  async callerSessionFor(
    token: string,
  ): Promise<{ readonly upstreamToken: string; readonly mcpSessionId: string | null }> {
    const admitted = await this.admitCaller(token);
    if (admitted.machine !== null) throw new Error('a machine token has no MCP session');
    return { upstreamToken: admitted.upstreamToken, mcpSessionId: admitted.mcpSessionId };
  }

  async upstreamTokenFor(token: string): Promise<string> {
    return (await this.callerSessionFor(token)).upstreamToken;
  }

  /**
   * A machine token, already verified by signature, issuer, audience and `exp` (M5). Admitted
   * only in standalone mode with the machine grant settings, which carry the secret its be-01
   * calls need, and only while this replica has not seen its credential refused. Reads no store.
   * The access token itself is never sent to be-01 (M1); the grant it carries is.
   */
  private admitMachine(payload: JWTPayload): CallerAdmission {
    const { claims, identity, settings } = this.machineClaimsOf(payload);
    return {
      claims,
      upstreamToken: identity.grant,
      mcpSessionId: null,
      machine: new MachineCaller(
        identity,
        settings.secret,
        this.refusedMachineTokens,
        settings.reportFault,
        settings.limit,
      ),
    };
  }

  /** {@link admitMachine}'s checks, without the per-request caller {@link verify} has no use for. */
  private machineClaimsOf(payload: JWTPayload): {
    readonly claims: JwtClaims;
    readonly identity: MachineIdentity;
    readonly settings: MachineGrantSettings;
  } {
    const settings = this.machineGrants;
    // Proof: with the mode test removed, `refuses a machine token where no machine admission is
    // composed` (machine-admission.test.ts) admitted one in gateway mode; watched 2026-10-27.
    if (settings === undefined || this.authMode !== 'standalone')
      throw new Error('this mcp-01 admits no machine token');
    const identity = machineIdentityOf(payload);
    // Proof: with this check skipped, `answers the call after a revocation commits
    // machine_credential_refused, then 401…` and the batch revocation test
    // (machine-admission.test.ts) answered the next request 200; watched 2026-10-27.
    if (this.refusedMachineTokens.isRefused(identity.jti))
      throw new Error('machine credential refused on this replica');
    return { claims: { ...payload, sub: identity.credentialId }, identity, settings };
  }

  /**
   * A consent token's claims after its session row is found (M5): `token_use: consent`, or none
   * for one issued before `token_use` existed.
   */
  private consentClaimsOf(payload: JWTPayload): JwtClaims {
    const use = payload['token_use'];
    // Proof: with this refusal removed, `refuses a consent session token of any use but consent`
    // (oauth.test.ts) admitted a live session's token of use `other`; watched 2026-10-27.
    if (use !== undefined && use !== 'consent') throw new Error('MCP token is of an unknown use');
    this.sessionOf(payload);
    if (typeof payload.sub !== 'string' || payload.sub === '') {
      throw new Error('verified MCP token has no subject');
    }
    return { ...payload, sub: payload.sub };
  }

  /**
   * A token of another issuer (M13). After activation none is accepted and nothing is
   * forwarded. Before it, the token is verified upstream and, when mcp-01 can ask be-01, be-01
   * must still be unactivated: a set be-01 marker beside mcp-01's epoch 0 is reported as a
   * deployment fault and refused.
   */
  private async admitUpstream(token: string): Promise<JwtClaims> {
    // Proof: with this refusal removed, `an Auth0 token on /mcp is 401 once both markers are
    // set…` (organization-delegation.boot.test.ts) answered 502 instead; with it, the markers
    // check and `bearerFor`'s throw all removed (the fallback restored), 200; watched 2026-10-27.
    if (this.store.credentialEpoch() >= ACTIVATED_CREDENTIAL_EPOCH)
      throw new Error('mcp-01 accepts no upstream token after activation');
    const claims = await this.verifyUpstream(token);
    if (this.organizations === undefined) return claims;
    let consent: ConsentOrganizations;
    try {
      consent = await this.organizations.organizationsFor(token);
    } catch (cause) {
      // be-01 unreachable, or answering what this release does not model, cannot confirm it is
      // unactivated, so nothing is forwarded; a deployment fault, never the caller's token.
      // Proof: with this catch rethrowing, `answers 502 and reports a fault when be-01 cannot
      // answer the markers check` (machine-admission.test.ts) reported no fault for be-01's
      // 503; watched 2026-10-27.
      const fault =
        cause instanceof McpDeploymentFault
          ? cause
          : new McpDeploymentFault('be-01 could not answer the activation markers check', {
              cause,
            });
      this.reportFault?.(fault);
      throw fault;
    }
    // Proof: with this check removed, `a raw upstream Bearer is a reported fault while the
    // markers disagree` (organization-delegation.boot.test.ts) forwarded the token (200);
    // watched 2026-10-27.
    if (consent.kind === 'activated') {
      const fault = new ActivationMarkersDisagree(
        "be-01 is activated but mcp-01's credential epoch is 0; run the activation runbook's epoch step",
      );
      this.reportFault?.(fault);
      throw fault;
    }
    // Proof: with this refusal removed, `refuses an upstream token be-01 refuses at the markers
    // check, forwarding nothing` (machine-admission.test.ts) forwarded it (200); watched
    // 2026-10-27.
    if (consent.kind === 'refused') throw new Error('be-01 refused the upstream token');
    return claims;
  }

  /**
   * Refreshes the provider token of a tool call's session after be-01 rejected it.
   *
   * @throws {SessionRefreshRefused} when the session is missing, expired or revoked, or the
   *   provider refuses (the family is then revoked): the caller ends the session.
   * @throws {EdgeGate} when the provider refresh is unavailable now; the session is kept.
   * Anything else, such as the session store throwing, propagates unchanged as unexpected.
   */
  async refreshSession(mcpSessionId: string): Promise<string> {
    const family = this.store.familyForSession(mcpSessionId, this.now());
    // Proof: on 2026-09-27, throwing a plain Error here failed `refuses a tool-call refresh of an
    // ended or unrefreshable session as a session outcome` on its second toBeInstanceOf.
    if (family === null)
      throw new SessionRefreshRefused('MCP OAuth session is missing, expired, or revoked');
    try {
      return (await this.refreshUpstreamIfNeeded(family, true)).upstreamAccessToken;
    } catch (cause) {
      // Proof: on 2026-09-27, mapping every non-refused failure to EdgeGate here failed `rejects a
      // tool-call refresh with a store failure during the lease, not an edge outcome`.
      if (cause instanceof UpstreamRefreshUnavailable)
        throw new EdgeGate(
          'The identity provider is temporarily unavailable. Retry this tool call.',
        );
      throw cause;
    }
  }

  /**
   * The credential one be-01 call for this MCP request carries.
   *
   * A session whose family was bound to an organization at consent gets a
   * fresh single-use delegation from be-01 for exactly this call, naming the
   * family's organization, user, client and grant and the access token's
   * `scopes`; nothing from the tool call or its headers reaches it. An
   * unbound (pre-activation) family and a direct upstream token keep
   * forwarding the upstream token, which be-01 refuses for organization
   * resources after activation (task 6.6).
   *
   * @throws {UpstreamRejected} when the session is gone or be-01 refused the
   *   upstream token: the caller refreshes and retries, which asks again.
   * @throws {DelegationRefused} when be-01 refuses the organization; a removed
   *   membership or changed identity has already revoked the family.
   */
  async bearerFor(
    mcpSessionId: string | null,
    upstreamToken: string,
    scopes: readonly string[],
  ): Promise<string> {
    if (mcpSessionId === null) {
      // After activation no standalone caller without a session is admitted (M13); one reaching
      // here is a defect, and its raw token is never forwarded. Gateway mode verifies nothing
      // here and keeps forwarding the gateway's token, as before (M11, M13).
      // Proof: with this throw removed, `never forwards a sessionless token after activation`
      // (credential-epoch.test.ts) resolved with the upstream token; with the mode condition
      // removed, `keeps forwarding in gateway mode after activation` there rejected; watched
      // 2026-10-27.
      if (
        this.authMode === 'standalone' &&
        this.store.credentialEpoch() >= ACTIVATED_CREDENTIAL_EPOCH
      )
        throw new Error('mcp-01 forwards no sessionless token after activation');
      return upstreamToken;
    }
    const family = this.store.familyForSession(mcpSessionId, this.now());
    // Proof: forwarding the upstream token for a missing session made `ends a
    // removed member's session` in `organization-delegation.test.ts` resolve
    // instead of rejecting with UpstreamRejected; watched 2026-10-21.
    if (family === null)
      throw new UpstreamRejected('MCP OAuth session is missing, expired, or revoked');
    // Proof: forwarding the upstream token for a bound family too (dropping the
    // organization delegation) made `a session bound at consent lists projects
    // and runs a command batch` in `organization-delegation.boot.test.ts` answer
    // be-01's 403 no_active_organization; watched 2026-10-21.
    if (family.binding === undefined) return upstreamToken;
    if (this.organizations === undefined)
      throw new Error('an organization-bound MCP family needs INTERNAL_AUTH_SECRET to reach be-01');
    const outcome = await this.organizations.delegationFor(upstreamToken, {
      organizationId: family.binding.organizationId,
      userId: family.binding.userId,
      client: family.clientId,
      grant: family.familyId,
      scopes: scopes.filter(
        (scope): scope is 'read' | 'write' | 'editor' =>
          scope === 'read' || scope === 'write' || scope === 'editor',
      ),
      // Proof: 2026-10-22, dropping the credential here made `a consent session's tool call
      // claims as its agent, never with the human's reach` (organization-delegation.boot.test.ts)
      // accept the claim as `codex`: the delegation was the human's own, unpinned.
      ...(family.consent === undefined ? {} : { credentialId: family.consent.credentialId }),
    });
    switch (outcome.kind) {
      case 'issued':
        return outcome.token;
      case 'upstream_rejected':
        throw new UpstreamRejected('be-01 refused the upstream credential behind this MCP session');
      case 'membership_ended':
        // Proof: keeping the family here made `ends a removed member's session`
        // in `organization-delegation.test.ts` still resolve it; watched 2026-10-21.
        this.store.revokeFamily(family.familyId, this.now());
        throw new DelegationRefused(
          'this MCP authorization is bound to an organization its account no longer belongs to, so the MCP session ended. Reauthorize and select an organization.',
          true,
        );
      case 'refused':
        throw new DelegationRefused(
          `the organization this MCP authorization is bound to refused it: HTTP ${String(outcome.status)}\n${outcome.body}`,
          false,
        );
    }
  }

  async endSession(mcpSessionId: string): Promise<void> {
    const family = this.store.familyForSessionId(mcpSessionId);
    this.store.revokeSessionFamily(mcpSessionId, this.now());
    if (family !== null) await this.revokeRefreshToken(family.upstreamRefreshToken);
  }

  private sessionOf(payload: JWTPayload): FamilyRecord {
    const jti = payload.jti;
    const family = typeof jti === 'string' ? this.store.familyForSession(jti, this.now()) : null;
    if (family === null) throw new Error('MCP OAuth session is missing, expired, or revoked');
    return family;
  }

  readGrant(code: string): McpAuthorizationGrant | null {
    const grant = this.grants.get(code);
    if (grant === undefined) return null;
    if (grant.expiresAt <= this.now()) {
      this.grants.delete(code);
      return null;
    }
    return grant;
  }

  private async register(request: Request, source: string): Promise<Response> {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return protocolError('invalid_client_metadata');
    }
    if (!isObject(body) || body['token_endpoint_auth_method'] !== 'none') {
      return protocolError('invalid_client_metadata');
    }
    // A machine grant is a credential's, never a registered client's
    // (`wbs-mcp-agent-surface` M2): registration refuses to promise one.
    const requestedGrants: unknown = body['grant_types'];
    // Proof: with this removed, `refuses a client that asks for a machine grant`
    // (machine-token.test.ts) registered it (201); watched 2026-10-27.
    if (Array.isArray(requestedGrants) && requestedGrants.some(isMachineGrantType)) {
      return protocolError('invalid_client_metadata');
    }
    const requestedRedirects: unknown = body['redirect_uris'];
    if (
      !Array.isArray(requestedRedirects) ||
      requestedRedirects.length === 0 ||
      requestedRedirects.length > MAX_REDIRECT_URIS ||
      // Proof: on 2026-09-27, dropping this check failed the 17 `refuses the whole list when one
      // callback carries …` cases then present, null to planted error_uri (`Received: 201`) (oauth.test.ts).
      requestedRedirects.some(isMalformedRedirect)
    ) {
      return protocolError('invalid_redirect_uri');
    }
    // RFC 7591 §3.2.1: a well-formed but unlisted callback is dropped, and the response names
    // only what was registered; authorization still demands one of these exact strings.
    // Proof: on 2026-09-27, registering `requestedRedirects` unfiltered failed `registers only the
    // listed callbacks of a mixed list and refuses the dropped one` (oauth.test.ts).
    const redirectUris = requestedRedirects.filter(isListedRedirect);
    // Proof: on 2026-09-27, dropping this check failed `refuses a list whose every callback is
    // unlisted` and every `refuses the near-miss callback` case (`Received: 201`) (oauth.test.ts).
    if (redirectUris.length === 0) {
      return protocolError('invalid_redirect_uri');
    }
    this.cleanup();
    const issuedAt = this.now();
    const client = this.store.admitClient(
      source,
      issuedAt,
      (census) => this.admitsUnprovenClient(census),
      () => this.unprovenClient(this.random(), source, redirectUris, issuedAt),
    );
    if (client === null) return protocolError('temporarily_unavailable', undefined, 429);
    return Response.json(
      {
        client_id: client.clientId,
        client_id_expires_at: Math.floor(client.expiresAt / 1000),
        client_id_issued_at: Math.floor(issuedAt / 1000),
        grant_types: ['authorization_code', 'refresh_token'],
        redirect_uris: redirectUris,
        token_endpoint_auth_method: 'none',
      },
      { status: 201 },
    );
  }

  /** Whether the registration caps admit one more unproven client into `census`. */
  private admitsUnprovenClient({ total, fromSource }: ClientCensus): boolean {
    const provenFromSource = fromSource.filter((candidate) => this.countsAsProven(candidate));
    return (
      total < this.clientLimit &&
      fromSource.length - provenFromSource.length < this.clientSourceLimit &&
      provenFromSource.length < this.provenClientSourceLimit
    );
  }

  private unprovenClient(
    clientId: string,
    source: string,
    redirectUris: readonly string[],
    issuedAt: number,
  ): RegisteredClient {
    return {
      clientId,
      source,
      redirectUris,
      proven: false,
      expiresAt: issuedAt + this.clientTtlMs,
      unprovenExpiresAt: issuedAt + this.clientTtlMs * 2,
    };
  }

  /**
   * Re-admits a well-formed authorization's absent `client_id` as a fresh unproven client, so a
   * connector that cached an id mcp-01 already swept signs in again instead of being stuck.
   * Claude Code caches its registered `client_id` indefinitely and does not re-register when
   * authorization answers the browser `invalid_client`; before this, only removing and re-adding
   * the connector cured a swept client.
   *
   * Only an id of the shape the default `random` issues ({@link isIssuedIdShape}) with a
   * `redirect_uri` `/register` itself would keep ({@link isMalformedRedirect},
   * {@link isListedRedirect}) qualifies, and it passes the same caps as `/register`, with the
   * request's source, `redirect_uri` as its only callback, and unproven lifetimes. This is no
   * weaker than open dynamic registration: the client is public
   * (`token_endpoint_auth_method: none`), so its id is an identifier, never a secret, and
   * anyone may already register a fresh one; PKCE still binds each code to the verifier of the
   * flow that started it; the callback is checked against today's allowlist; and the caps still
   * bound how many clients one source can hold. Choosing the id value is the only thing added.
   * So a `client_id` no longer names one registration: families of different subjects and
   * sources can share one over time. Besides the token-endpoint match, it reaches be-01 only as
   * the delegation's `client` claim, a label in the consent credential's name.
   *
   * A live client is never touched: the store returns a live row of that id unchanged instead
   * of re-admitting (also when a second process admitted it first), and the normal checks then
   * apply to it. A refresh of an older family of that id never renews or proves the re-admitted
   * client ({@link McpSessionStore.consumeRefresh}). Someone who learns another connector's
   * swept id can re-admit it first with another listed callback, and an insider holding
   * `wbs:read` can complete their own sign-in on it and keep it proven for 30 d, renewed by their
   * own refreshes and also by the victim's older family, since a proven client is renewed by any
   * family of its id; the lockout can last until that family's absolute expiry plus 30 d. That
   * connector's authorization then answers `invalid_request`, with no re-register hint, for as
   * long as the other client lives. This leaves it no worse off than the
   * permanent `invalid_client` it got before, and codes still only reach the callback and
   * verifier of the flow that asked for them.
   *
   * @returns the live client, `'refused'` when the caps refuse, or `null` when the request does
   * not qualify.
   */
  private readmitClient(
    source: string,
    clientId: string,
    redirectUri: string,
  ): RegisteredClient | 'refused' | null {
    // Proof: 2026-10-25, dropping this check failed every `keeps invalid_client for a swept
    // client whose id is …` case (302 instead of 400) and the seven tests that expect an unknown
    // or expired injected id to stay refused: `expires dynamic clients and frees their capacity`,
    // `caps repeated authorization extensions at an absolute unproven lifetime`, `answers
    // invalid_client with a re-register hint for an unknown client_id`, `answers invalid_client
    // once an unproven client expires across a restart`, `keeps the absolute unproven lifetime an
    // authorization extension stored before the restart`, `deletes an expired proven client with
    // no live family and answers invalid_client` and `does not revive an expired, unswept client
    // through a refresh` (oauth.test.ts).
    if (!isIssuedIdShape(clientId)) return null;
    // Proof: 2026-10-25, dropping this check stored a client for every `keeps invalid_client for
    // a swept client with the unlisted or malformed redirect …` case (oauth.test.ts), which then
    // answered 302 for the planted-query and oversized loopbacks and invalid_request for the rest.
    if (isMalformedRedirect(redirectUri) || !isListedRedirect(redirectUri)) return null;
    const now = this.now();
    // Proof: 2026-10-25, admitting with `() => true` made `re-admits a swept client only within
    // the per-source unproven cap` (oauth.test.ts) answer 302 instead of 429.
    const client = this.store.readmitClient(
      this.unprovenClient(clientId, source, [redirectUri], now),
      now,
      (census) => this.admitsUnprovenClient(census),
    );
    return client ?? 'refused';
  }

  private async authorize(request: Request, url: URL, source: string): Promise<Response> {
    const params = url.searchParams;
    const clientId = params.get('client_id') ?? '';
    const redirectUri = params.get('redirect_uri') ?? '';
    const challenge = params.get('code_challenge') ?? '';
    this.cleanup();
    const stored = this.store.client(clientId, this.now());
    const scope = params.get('scope') ?? 'wbs:read';
    const scopes = scope.split(' ').filter(Boolean);
    const state = params.get('state');
    if (
      bytes(url.search) > MAX_AUTHORIZATION_QUERY_BYTES ||
      params.getAll('scope').length > 1 ||
      params.getAll('state').length > 1 ||
      (state !== null && bytes(state) > MAX_STATE_BYTES) ||
      params.get('response_type') !== 'code' ||
      params.get('code_challenge_method') !== 'S256' ||
      !/^[A-Za-z0-9_-]{43,128}$/.test(challenge) ||
      scopes.length === 0 ||
      scopes.some((value) => !SCOPES.has(value))
    ) {
      return protocolError('invalid_request');
    }
    // Proof: 2026-10-21, answering `invalid_request` here made `answers invalid_client with a
    // re-register hint for an unknown client_id` and `answers invalid_client once an unproven
    // client expires across a restart` fail (oauth.test.ts); answering `invalid_client` for the
    // malformed-request branch above made `keeps the request error for a malformed
    // authorization of a registered client` fail.
    // RFC 6749 §4.1.2.1 forbids redirecting for an unknown client, so this answers the browser
    // directly. `invalid_client` is the token-endpoint code (RFC 6749 §5.2), reused here because
    // no redirect is allowed; Claude Code does not re-register on seeing it, which is why an
    // absent id that qualifies is re-admitted first.
    const client = stored ?? this.readmitClient(source, clientId, redirectUri);
    if (client === 'refused') return protocolError('temporarily_unavailable', undefined, 429);
    if (client === null) {
      return protocolError(
        'invalid_client',
        undefined,
        400,
        'client_id is not registered or has expired; register the client again and restart authorization',
      );
    }
    // Proof: 2026-10-21, answering `invalid_client` here failed `registers a public client and
    // refuses an unregistered redirect URI` and `authorizes only a URI registered to that client,
    // even when it is allowlisted` (oauth.test.ts): a known client's bad redirect stays a request error.
    // A stored client outlives restarts, so its redirect is re-checked against today's allowlist:
    // a callback removed from HOSTED_REDIRECTS stops authorizing at the next deploy.
    // Proof: 2026-10-21, dropping `isListedRedirect` here made `refuses a stored redirect that is
    // no longer on the allowlist` (oauth.test.ts) answer 302 instead of 400 invalid_request.
    // Proof: 2026-10-25, dropping `isMalformedRedirect` here made `refuses a stored redirect that
    // carries a planted response field` (oauth.test.ts) answer 302 instead of 400.
    if (
      !client.redirectUris.includes(redirectUri) ||
      isMalformedRedirect(redirectUri) ||
      !isListedRedirect(redirectUri)
    )
      return protocolError('invalid_request');

    if (!client.proven && this.now() + GRANT_TTL_MS * 2 > client.unprovenExpiresAt) {
      return protocolError('temporarily_unavailable', undefined, 429);
    }

    const browserBinding = this.random();
    const upstreamState = this.random();
    const nonce = this.random();
    const verifier = this.random();
    const saved = this.pendingAuthorizations.save(browserBinding, upstreamState, nonce, verifier, {
      clientId,
      codeChallenge: challenge,
      redirectUri,
      scope,
      state: state ?? undefined,
    });
    if (saved === 'capacity') {
      return protocolError('temporarily_unavailable', undefined, 429);
    }
    const activeFlowExpiry = Math.max(client.expiresAt, this.now() + GRANT_TTL_MS * 2);
    // Proof: 2026-10-21, skipping this write failed `keeps an unproven client alive through its
    // active authorization flow` and `keeps the absolute unproven lifetime an authorization
    // extension stored before the restart` (oauth.test.ts) with 400 instead of 200/302.
    this.store.extendClient(
      clientId,
      client.proven ? activeFlowExpiry : Math.min(activeFlowExpiry, client.unprovenExpiresAt),
      this.now(),
    );
    const reauthMarker = this.takeReauthMarker(cookieOf(request, REAUTH_COOKIE));
    let location: URL;
    try {
      location = await this.upstream.authorizationUrl({
        nonce,
        redirectUri: this.callbackUrl,
        state: upstreamState,
        verifier,
        ...(reauthMarker === undefined ? {} : { prompt: 'login' as const }),
      });
    } catch (error) {
      if (reauthMarker !== undefined && reauthMarker.expiresAt > this.now()) {
        this.storeReauthMarker(reauthMarker.markerId, reauthMarker.expiresAt);
      }
      throw error;
    }
    return redirect(
      location.href,
      reauthMarker === undefined
        ? cookie(browserBinding)
        : [cookie(browserBinding), clearReauthCookie()],
    );
  }

  private async callback(request: Request, url: URL): Promise<Response> {
    const binding = cookieOf(request, COOKIE);
    const state = url.searchParams.get('state');
    if (binding === undefined) return protocolError('invalid_request', clearCookie());
    const pending = this.pendingAuthorizations.consume(binding, state ?? '');
    if (pending.outcome === 'state_mismatch') return protocolError('invalid_request');
    if (pending.outcome === 'missing' || pending.outcome === 'expired') {
      return protocolError('invalid_request', clearCookie());
    }

    const providerError = url.searchParams.get('error');
    if (providerError !== null) {
      return this.failLogin(pending.authorization, callbackError(providerError));
    }

    const callback = new URL(this.callbackUrl);
    callback.search = url.search;
    let tokens: BrowserOidcTokenSet;
    try {
      tokens = await this.upstream.exchange(new Request(callback, { headers: request.headers }), {
        nonce: pending.nonce,
        state: state ?? '',
        verifier: pending.verifier,
      });
    } catch {
      return this.failLogin(pending.authorization, 'server_error');
    }
    let identity: OidcIdentity;
    let upstreamExpiresAt: number;
    try {
      const upstreamClaims: JwtClaims = await this.verifyUpstream(tokens.accessToken);
      upstreamExpiresAt = upstreamExpiryOf(tokens, upstreamClaims, this.now());
      identity = oidcIdentityFromClaims(upstreamClaims, {
        groupPrefix: this.groupPrefix,
        groupsClaim: this.groupsClaim,
      });
    } catch {
      return await this.failLogin(pending.authorization, 'access_denied', tokens.refreshToken);
    }
    const requested = new Set(pending.authorization.scope.split(' ').filter(Boolean));
    const scopes = [...identity.scopes]
      .map((scope) => `wbs:${scope}`)
      .filter((scope) => requested.has(scope));
    if (!scopes.includes('wbs:read')) {
      return await this.failLogin(pending.authorization, 'access_denied', tokens.refreshToken);
    }
    const fields: GrantFields = {
      scope: scopes.join(' '),
      scopes,
      subject: identity.subject,
      upstreamAccessToken: tokens.accessToken,
      upstreamRefreshToken: tokens.refreshToken,
      upstreamExpiresAt,
    };
    if (this.organizations === undefined) {
      // A process started at epoch 0 without organization authority whose store another writer
      // has since advanced: an unbound credential can no longer be stored, so refuse here
      // instead of failing the exchange on the store's CHECK.
      // Proof: 2026-10-22, without this refusal `refuses consent without organization authority
      // once another writer advanced the epoch` (credential-epoch.test.ts) redirected with a code.
      if (this.store.credentialEpoch() >= ACTIVATED_CREDENTIAL_EPOCH)
        return await this.failLogin(
          pending.authorization,
          'temporarily_unavailable',
          tokens.refreshToken,
        );
      return await this.issueCode(pending.authorization, fields);
    }
    let consent: ConsentOrganizations;
    try {
      consent = await this.organizations.organizationsFor(tokens.accessToken);
    } catch (cause) {
      // The provider grant will never be used; the failure itself stays unexpected.
      await this.revokeRefreshToken(tokens.refreshToken);
      throw cause;
    }
    // Before activation a consent binds nothing and behaves exactly as it always has. Once the
    // epoch has advanced but be-01's marker has not (the cutover window), an unbound credential
    // cannot be stored, so the consent waits for activation.
    if (consent.kind === 'pre_activation') {
      // Proof: 2026-10-21, without this refusal `refuses an unbound consent between the epoch
      // advance and activation` (credential-epoch.test.ts) redirected with a code.
      if (this.store.credentialEpoch() >= ACTIVATED_CREDENTIAL_EPOCH)
        return await this.failLogin(
          pending.authorization,
          'temporarily_unavailable',
          tokens.refreshToken,
        );
      return await this.issueCode(pending.authorization, fields);
    }
    // Proof: issuing an unbound code here made `refuses consent for a user with no
    // current membership` in `organization-delegation.test.ts` redirect with a code
    // instead of access_denied; watched 2026-10-21.
    if (consent.kind === 'refused' || consent.memberships.length === 0)
      return await this.failLogin(pending.authorization, 'access_denied', tokens.refreshToken);
    const only = consent.memberships.length === 1 ? consent.memberships[0] : undefined;
    // One organization and no agent to offer: bound without a page, as before A20.
    // Proof: 2026-10-22, binding a single membership here whatever its agents made `offers the
    // agents of a single organization` (organization-delegation.test.ts) redirect with a code
    // instead of showing the page.
    if (only?.agents.length === 0)
      return await this.issueCode(pending.authorization, {
        ...fields,
        binding: {
          organizationId: only.organizationId,
          userId: consent.userId,
          issuer: identity.issuer,
        },
      });
    this.cleanup();
    if (this.selections.size >= this.grantLimit) {
      await this.revokeRefreshToken(tokens.refreshToken);
      return protocolError('temporarily_unavailable', clearCookie(), 429);
    }
    const selectionId = this.random();
    this.selections.set(selectionId, {
      authorization: pending.authorization,
      fields,
      userId: consent.userId,
      issuer: identity.issuer,
      memberships: consent.memberships,
      agents: consent.memberships.flatMap((membership) =>
        membership.agents.map((agent) => ({
          organizationId: membership.organizationId,
          personId: agent.personId,
        })),
      ),
      expiresAt: this.now() + GRANT_TTL_MS,
    });
    return selectionPage(`${this.issuer}/organization`, selectionId, consent.memberships);
  }

  /**
   * Completes a consent paused on {@link selectionPage}: the browser that
   * received the page posts back its own selection id, carried in a SameSite
   * cookie as well as the form, and either one organization from the list be-01
   * gave (`organizationId`: authorize as yourself) or the index of one offered
   * agent person (`agent`, A20). The selection is consumed whatever the
   * outcome; a forged or stale choice fails the login rather than binding
   * anything. Choosing an agent mints its consent credential at be-01 before
   * the code is issued; a refusal fails the login `access_denied` and no family
   * can ever be created for it.
   */
  private async selectOrganization(request: Request): Promise<Response> {
    const form = await request.formData();
    const selectionId = stringField(form, 'selection');
    const organizationId = stringField(form, 'organizationId');
    const agentIndex = stringField(form, 'agent');
    const presented = cookieOf(request, SELECT_COOKIE);
    this.cleanup();
    const selection = selectionId === undefined ? undefined : this.selections.get(selectionId);
    // Proof: dropping the cookie comparison made `refuses a selection posted
    // without its browser cookie` in `organization-delegation.test.ts` redirect
    // with a code; watched 2026-10-21.
    if (
      selection === undefined ||
      selectionId === undefined ||
      presented === undefined ||
      !equalSecrets(presented, selectionId)
    )
      return protocolError('invalid_request', clearSelectCookie());
    this.selections.delete(selectionId);
    if (agentIndex !== undefined || organizationId === undefined)
      return await this.selectAgent(
        selection,
        organizationId === undefined ? agentIndex : undefined,
      );
    const chosen = selection.memberships.find(
      (membership) => membership.organizationId === organizationId,
    );
    // Proof: binding the posted organization unchecked made `refuses a forged
    // organization in the selection` in `organization-delegation.test.ts`
    // issue a code bound to org-c; watched 2026-10-21.
    if (chosen === undefined)
      return await this.failLogin(
        selection.authorization,
        'access_denied',
        selection.fields.upstreamRefreshToken,
      );
    return await this.issueCode(
      selection.authorization,
      {
        ...selection.fields,
        binding: {
          organizationId: chosen.organizationId,
          userId: selection.userId,
          issuer: selection.issuer,
        },
      },
      clearSelectCookie(),
    );
  }

  /**
   * The agent half of {@link selectOrganization}: `posted` must be the decimal index of an
   * offered agent; anything else, or an `organizationId` beside it, fails `access_denied`.
   * The consent is recorded pending before be-01 is asked, so a credential minted for a code
   * that is never exchanged is still reported ended once the code expires.
   */
  private async selectAgent(
    selection: PendingSelection,
    posted: string | undefined,
  ): Promise<Response> {
    const organizations = this.organizations;
    if (organizations === undefined)
      throw new Error('an agent was offered without organization authority');
    // `at` reads a negative index from the end, so only a plain decimal may reach it.
    // Proof: 2026-10-22, reading any posted number here made `refuses a forged agent choice`
    // (organization-delegation.test.ts) mint for a forged index (`-1`, `00`).
    const chosen =
      posted !== undefined && /^(0|[1-9][0-9]{0,3})$/.test(posted)
        ? selection.agents.at(Number(posted))
        : undefined;
    if (chosen === undefined)
      return await this.failLogin(
        selection.authorization,
        'access_denied',
        selection.fields.upstreamRefreshToken,
      );
    const familyId = this.random();
    const credentialId = crypto.randomUUID();
    const expiresAt = this.now() + GRANT_TTL_MS;
    this.store.recordPendingConsent(familyId, credentialId, expiresAt);
    let minted: Awaited<ReturnType<OrganizationAuthority['mintConsentCredential']>>;
    try {
      minted = await organizations.mintConsentCredential(selection.fields.upstreamAccessToken, {
        organizationId: chosen.organizationId,
        userId: selection.userId,
        personId: chosen.personId,
        credentialId,
        family: familyId,
        client: new URL(selection.authorization.redirectUri).host,
      });
    } catch (cause) {
      // The pending row stays: be-01 may have minted before failing, and the sweep reports it.
      await this.revokeRefreshToken(selection.fields.upstreamRefreshToken);
      throw cause;
    }
    // Proof: 2026-10-22, with this refusal skipped `refuses consent as another account's agent
    // and creates no family` (organization-delegation.test.ts) redirected without access_denied.
    if (minted.kind === 'refused') {
      this.store.forgetPendingConsent(familyId);
      return await this.failLogin(
        selection.authorization,
        'access_denied',
        selection.fields.upstreamRefreshToken,
      );
    }
    return await this.issueCode(
      selection.authorization,
      {
        ...selection.fields,
        binding: {
          organizationId: chosen.organizationId,
          userId: selection.userId,
          issuer: selection.issuer,
        },
        consent: { personId: chosen.personId, credentialId, familyId },
      },
      clearSelectCookie(),
      expiresAt,
    );
  }

  private async issueCode(
    authorization: AuthorizationContext,
    fields: GrantFields,
    clearing: string = clearCookie(),
    expiresAt: number = this.now() + GRANT_TTL_MS,
  ): Promise<Response> {
    this.cleanup();
    if (this.grants.size >= this.grantLimit) {
      await this.revokeRefreshToken(fields.upstreamRefreshToken);
      return protocolError('temporarily_unavailable', clearing, 429);
    }
    const code = this.random();
    this.grants.set(code, {
      clientId: authorization.clientId,
      codeChallenge: authorization.codeChallenge,
      expiresAt,
      redirectUri: authorization.redirectUri,
      ...fields,
      credentialEpoch: this.store.credentialEpoch(),
    });
    const target = new URL(authorization.redirectUri);
    target.searchParams.set('code', code);
    target.searchParams.set('iss', this.issuer);
    if (authorization.state !== undefined) {
      target.searchParams.set('state', authorization.state);
    }
    return redirect(target.href, clearing);
  }

  private async failLogin(
    authorization: AuthorizationContext,
    error: CallbackError,
    refreshToken?: string,
  ): Promise<Response> {
    await this.revokeRefreshToken(refreshToken);
    const target = new URL(authorization.redirectUri);
    target.searchParams.set('error', error);
    target.searchParams.set('iss', this.issuer);
    if ('state' in authorization && authorization.state !== undefined) {
      target.searchParams.set('state', authorization.state);
    }
    return redirect(target.href, [clearCookie(), this.issueReauthCookie()]);
  }

  private async revokeRefreshToken(refreshToken: string | undefined): Promise<void> {
    if (refreshToken === undefined) return;
    try {
      await this.upstream.revoke(refreshToken);
    } catch {
      this.revocationFailure();
    }
  }

  private issueReauthCookie(): string {
    this.cleanup();
    const markerId = this.random();
    this.storeReauthMarker(markerId, this.now() + GRANT_TTL_MS);
    return reauthCookie(markerId, this.reauthKey);
  }

  private storeReauthMarker(markerId: string, expiresAt: number): void {
    while (this.reauthMarkers.size >= MAX_REAUTH_MARKERS) {
      const oldest = this.reauthMarkers.keys().next().value;
      if (oldest === undefined) break;
      this.reauthMarkers.delete(oldest);
    }
    this.reauthMarkers.set(markerId, expiresAt);
  }

  private takeReauthMarker(
    marker: string | undefined,
  ): { readonly markerId: string; readonly expiresAt: number } | undefined {
    if (marker === undefined) return undefined;
    const separator = marker.lastIndexOf('.');
    if (separator <= 0) return undefined;
    const markerId = marker.slice(0, separator);
    const received = Buffer.from(marker.slice(separator + 1));
    const expected = Buffer.from(reauthMarker(markerId, this.reauthKey));
    if (received.length !== expected.length || !timingSafeEqual(received, expected))
      return undefined;
    const expiresAt = this.reauthMarkers.get(markerId);
    if (expiresAt === undefined || expiresAt <= this.now()) return undefined;
    this.reauthMarkers.delete(markerId);
    return { markerId, expiresAt };
  }

  private async token(request: Request, source: string): Promise<Response> {
    const form = await request.formData();
    if (form.get('grant_type') === 'refresh_token') return await this.refreshGrant(form);
    // Proof: without this dispatch every grant test in machine-token.boot.test.ts failed
    // (invalid_grant); watched 2026-10-27.
    if (isMachineGrantType(form.get('grant_type')))
      return await this.machineToken(request, form, source);

    const code = stringField(form, 'code');
    this.cleanup();
    const grant = code === undefined ? undefined : this.grants.get(code);
    const client = grant === undefined ? null : this.store.client(grant.clientId, this.now());
    const verifier = stringField(form, 'code_verifier');
    if (
      code === undefined ||
      grant === undefined ||
      client === null ||
      grant.expiresAt <= this.now() ||
      form.get('grant_type') !== 'authorization_code' ||
      stringField(form, 'client_id') !== grant.clientId ||
      // Proof: on 2026-09-27, removing this comparison failed `refuses a token exchange that
      // substitutes another registered redirect, and burns the code` with 200 (oauth.test.ts).
      stringField(form, 'redirect_uri') !== grant.redirectUri ||
      verifier === undefined ||
      !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) ||
      challengeOf(verifier) !== grant.codeChallenge ||
      // Proof: 2026-10-21, without this comparison `refuses a code issued before the epoch
      // advanced` (credential-epoch.test.ts) exchanged it for a token (200).
      grant.credentialEpoch !== this.store.credentialEpoch()
    ) {
      if (code !== undefined) this.grants.delete(code);
      return protocolError('invalid_grant');
    }

    const now = this.now();
    if (this.store.sessionCount(now) >= this.sessionLimit)
      return protocolError('temporarily_unavailable', undefined, 429);

    let reservedPromotion = false;
    if (!client.proven) {
      const provenFromSource = this.store
        .clientsFromSource(client.source, now)
        .filter((candidate) => this.countsAsProven(candidate));
      if (
        this.promotionReservations.has(client.clientId) ||
        provenFromSource.length >= this.provenClientSourceLimit
      )
        return protocolError('temporarily_unavailable', undefined, 429);
      // Proof: 2026-10-21, not adding the reservation failed `reserves proven-source capacity
      // across concurrent token signing` (oauth.test.ts): both exchanges promoted.
      this.promotionReservations.add(client.clientId);
      reservedPromotion = true;
    }

    const familyId = grant.consent?.familyId ?? this.random();
    const jti = this.random();
    const refreshToken = this.random();
    const absoluteExpiresAt =
      grant.upstreamRefreshToken === undefined
        ? Math.min(now + REFRESH_ABSOLUTE_MS, grant.upstreamExpiresAt)
        : now + REFRESH_ABSOLUTE_MS;
    const expiresAt = Math.min(now + this.accessTtlMs, absoluteExpiresAt);
    this.grants.delete(code);
    try {
      this.store.createFamily(
        {
          familyId,
          clientId: grant.clientId,
          subject: grant.subject,
          scope: grant.scope,
          upstreamAccessToken: grant.upstreamAccessToken,
          upstreamRefreshToken: grant.upstreamRefreshToken,
          upstreamExpiresAt: grant.upstreamExpiresAt,
          idleExpiresAt: Math.min(now + REFRESH_IDLE_MS, absoluteExpiresAt),
          absoluteExpiresAt,
          // Proof: dropping the binding here made `binds the consent's organization
          // through code, family and session` in `organization-delegation.test.ts`
          // record no delegation (the family looked pre-activation); watched 2026-10-21.
          ...(grant.binding === undefined ? {} : { binding: grant.binding }),
          ...(grant.consent === undefined
            ? {}
            : {
                consent: {
                  personId: grant.consent.personId,
                  credentialId: grant.consent.credentialId,
                },
              }),
        },
        jti,
        expiresAt,
        refreshToken,
        now,
      );
      const token = await this.issueAccessToken(
        grant.subject,
        grant.scope,
        jti,
        familyId,
        expiresAt,
      );
      // Proof: 2026-10-21, skipping this write failed `promotes a client only after a successful
      // token exchange` and `keeps a promoted client proven and counted across the restart`.
      this.store.promoteClient(client.clientId, now + this.provenClientTtlMs);
      this.promotionReservations.delete(client.clientId);
      return tokenResponse(token, refreshToken, grant.scope, expiresAt - now);
    } catch (error) {
      if (reservedPromotion) this.promotionReservations.delete(client.clientId);
      // The consent's end may already be reported to be-01: the code is dead, not retryable.
      // Proof: 2026-10-22, without this mapping `refuses a consent code whose pending consent was
      // already reported ended` (organization-delegation.test.ts) rejected with the store error.
      if (error instanceof McpConsentPendingGone) return protocolError('invalid_grant');
      this.store.revokeFamily(familyId, now);
      this.grants.set(code, grant);
      throw error;
    }
  }

  private async refreshGrant(form: FormData): Promise<Response> {
    const refreshToken = stringField(form, 'refresh_token');
    const clientId = stringField(form, 'client_id');
    if (refreshToken === undefined || clientId === undefined) return protocolError('invalid_grant');
    const requestedScope = form.get('scope');
    // Proof: on 2026-09-27, reading scope through stringField failed `refuses a refresh whose scope
    // is not text`: a multipart file scope was treated as omitted, not 400 (oauth.test.ts).
    if (requestedScope !== null && typeof requestedScope !== 'string')
      return protocolError('invalid_request');
    const now = this.now();
    const expiresAt = now + this.accessTtlMs;
    let prepared: ReturnType<McpSessionStore['prepareRefresh']>;
    try {
      prepared = this.store.prepareRefresh(refreshToken, clientId, now);
    } catch (cause) {
      // Only an undecryptable family (already revoked by the store) is the caller's dead grant;
      // any other store failure propagates rather than posing as a refused credential.
      // Proof: on 2026-09-27, a catch-all here failed `surfaces a store failure during refresh
      // instead of refusing the grant`: a closed store answered 400 invalid_grant (oauth.test.ts).
      if (cause instanceof McpRefreshFamilyCorrupt) return protocolError('invalid_grant');
      throw cause;
    }
    // The token is judged before capacity, so a replay revokes its family even when full.
    // Proof: on 2026-09-27, checking capacity first failed `ends the family on replay even when
    // sessions are at capacity` with 429 (oauth.test.ts).
    if (prepared.outcome !== 'ok') return protocolError('invalid_grant');
    const scope = narrowScope(
      prepared.family.scope,
      requestedScope === null || requestedScope === '' ? undefined : requestedScope,
    );
    // Proof: on 2026-09-27, ignoring the requested scope failed `refuses a refresh that asks for
    // more than the family holds` (200, not 400) and the subset-narrowing test (oauth.test.ts).
    if (scope === undefined) return protocolError('invalid_scope');
    if (this.store.sessionCount(now) >= this.sessionLimit)
      return protocolError('temporarily_unavailable', undefined, 429);
    const boundedExpiresAt = Math.min(expiresAt, prepared.family.absoluteExpiresAt);
    if (boundedExpiresAt <= now) return protocolError('invalid_grant');
    const successor = this.random();
    const jti = this.random();
    try {
      const family = await this.refreshUpstreamIfNeeded(prepared.family);
      const token = await this.issueAccessToken(
        family.subject,
        scope,
        jti,
        family.familyId,
        boundedExpiresAt,
      );
      const consumed = this.store.consumeRefresh(
        refreshToken,
        clientId,
        successor,
        jti,
        boundedExpiresAt,
        now + REFRESH_IDLE_MS,
        now,
        // A refresh is use: the consume transaction itself renews the client past the family's new
        // idle expiry, so a connector that only ever refreshes can still start a fresh
        // authorization with its cached client_id, and a failed renewal rolls the whole refresh
        // back instead of consuming the token the caller never received.
        // Proof: 2026-10-25, passing `now` here failed `renews the client at each refresh, so it
        // outlives a lapsed family for re-authorization` (oauth.test.ts): expiry stayed at day 30.
        now + this.provenClientTtlMs,
      );
      if (consumed.outcome !== 'ok') return protocolError('invalid_grant');
      return tokenResponse(token, successor, scope, boundedExpiresAt - now);
    } catch (cause) {
      if (cause instanceof UpstreamRefreshRefused || cause instanceof McpRefreshFamilyCorrupt)
        return protocolError('invalid_grant');
      if (cause instanceof UpstreamRefreshUnavailable)
        return protocolError('temporarily_unavailable', undefined, 503);
      // Proof: mapping unexpected reader defects to outages failed `trusted reader defect`
      // on the token-endpoint path, 2026-10-13; unexpected trusted state must propagate.
      throw cause;
    }
  }

  /**
   * Answers a machine grant (`wbs-mcp-agent-surface` M2–M4) with an
   * mcp-01-signed access token for the MCP resource and no refresh token,
   * reading and writing no mcp-01 store (M5). be-01's grant route alone
   * verifies the key or the assertion; nothing here falls through to the
   * upstream verifier, and no `client_id` is looked up among registered
   * clients.
   *
   * Every API-key failure is the one `401 invalid_client` with
   * `WWW-Authenticate: Basic`, and every assertion failure the one
   * `400 invalid_grant`, before activation too. The token's `exp` is 60 s
   * before the grant's, whose lifetime is `MCP_MACHINE_TOKEN_TTL` lowered by a
   * uniform 0–10 % jitter, then capped by be-01.
   *
   * @throws {MachineGrantDefect} when be-01 answers what this release does not
   *   model, its `internal_unauthorized` included: a server fault, not a refusal.
   */
  private async machineToken(request: Request, form: FormData, source: string): Promise<Response> {
    const settings = this.machineGrants;
    // Gateway mode admits no machine (M11), whatever was composed.
    // Proof: without the mode test, `answers unsupported_grant_type in gateway mode, even with
    // the settings` (machine-token.test.ts) reached be-01; watched 2026-10-27.
    if (settings === undefined || this.authMode !== 'standalone')
      return machineRefusal('unsupported_grant_type');
    try {
      return await this.answerMachineGrant(request, form, source, settings);
    } catch (cause) {
      if (!(cause instanceof MachineGrantDefect)) throw cause;
      // Proof: rethrowing here made `answers a be-01 fault 502 server_error and reports it`
      // (machine-token.test.ts) reject with the defect; watched 2026-10-27.
      settings.reportFault(cause);
      return machineRefusal('server_error');
    }
  }

  /**
   * {@link machineToken} past the mode check. M10's limits are asked after the request is
   * parsed, which reads nothing, so the `client_id` it names is known; be-01 is asked only
   * when they admit it. Every `invalid_client` and `invalid_grant` answered, the parser's
   * included, counts as a failed authentication; an issuance is taken once be-01 granted one.
   */
  private async answerMachineGrant(
    request: Request,
    form: FormData,
    source: string,
    settings: MachineGrantSettings,
  ): Promise<Response> {
    const parsed = parseMachineTokenRequest(
      form,
      request.headers.get('authorization'),
      this.audience,
    );
    const attempt: IssuanceAttempt = {
      source,
      clientId:
        parsed.kind === 'refused'
          ? null
          : parsed.grant === 'client_credentials'
            ? parsed.keyCredentialId
            : parsed.clientId,
    };
    const limited = settings.limit.admitIssuance(attempt);
    // RFC 6749 §5.2 has no rate-limit error, so none is invented (M10).
    // Proof: with this removed, `answers 429 invalid_request with Retry-After when the limit
    // refuses, asking nobody` (machine-token.test.ts) answered 200; watched 2026-10-27.
    if (limited !== null) return rateLimited(limited.retryAfterSeconds);
    if (parsed.kind === 'refused') {
      // Proof: with this count removed, `counts a secret the parser refuses, never asking be-01,
      // as a failure too` (machine-limits.test.ts) answered the 31st 401; watched 2026-10-27.
      if (parsed.error === 'invalid_client' || parsed.error === 'invalid_grant')
        settings.limit.recordFailedIssuance(attempt);
      return machineRefusal(parsed.error, parsed.description);
    }
    // The one answer for every refusal of this request's credential, each a failed
    // authentication (M10).
    // Proof: answering invalid_grant for a key failed `an unknown id, a revoked key and a wrong
    // secret answer one invalid_client` and the pre-activation test (machine-token.boot.test.ts);
    // watched 2026-10-27.
    // Proof: with the count removed, `counts a rotating spoofed first entry…` and three more
    // (machine-limits.test.ts) never answered 429; watched 2026-10-27.
    const refuseCredential = (): Response => {
      settings.limit.recordFailedIssuance(attempt);
      return machineRefusal(
        parsed.grant === 'client_credentials' ? 'invalid_client' : 'invalid_grant',
      );
    };
    const nowSeconds = Math.floor(this.now() / 1_000);
    const ttl = settings.tokenTtlSeconds;
    // Proof: no jitter failed `lowers the lifetime by at most 10 %, uniformly`
    // (machine-token.test.ts); asking without the 60 s failed it and `sends the key with the
    // dedicated secret…`; watched 2026-10-27.
    const lifetime =
      ttl - Math.floor(ttl * MACHINE_TOKEN_JITTER * (settings.jitter ?? Math.random)());
    const requestedExpiresAt = nowSeconds + lifetime + MACHINE_TOKEN_EARLY_SECONDS;
    const answer = await settings.client.issue({
      issuer: this.issuer,
      credential:
        parsed.grant === 'client_credentials'
          ? { kind: 'api_key', key: parsed.key }
          : { kind: 'oidc', assertion: parsed.assertion },
      expiresAt: requestedExpiresAt,
      run: parsed.run,
    });
    const issued = issuedGrantOf(answer, parsed, requestedExpiresAt);
    if (issued.kind !== 'issued')
      return issued.kind === 'refused'
        ? refuseCredential()
        : machineRefusal(issued.error, issued.description, issued.retryAfterSeconds);
    // A client_id names the credential and is never looked up (M2).
    // Proof: with this removed, `a client_id the registered-client store has never seen is carried,
    // not looked up` (machine-token.boot.test.ts) admitted another credential's id; looking the id
    // up in the registered-client store instead failed it and four more there (401); watched
    // 2026-10-27.
    if (parsed.clientId !== null && parsed.clientId !== issued.credentialId)
      return refuseCredential();
    const granted = new Set(issued.scopes.map((scope) => `wbs:${scope}`));
    // Proof: keeping the requested scopes failed `a key bound to a viewer gets wbs:read only`
    // (machine-token.boot.test.ts); watched 2026-10-27.
    const scopes = parsed.scopes.filter((scope) => granted.has(scope));
    // Proof: with this removed, `narrows to the grant’s scopes, and refuses a request beyond them
    // invalid_scope` (machine-token.test.ts) signed an empty scope; watched 2026-10-27.
    if (scopes.length === 0) return machineRefusal('invalid_scope');
    // Proof: the grant's own exp here failed the SDK, GitHub Actions and run-outlives tests
    // (machine-token.boot.test.ts); watched 2026-10-27.
    const expiresAt = issued.expiresAt - MACHINE_TOKEN_EARLY_SECONDS;
    // An assertion or a rotated secret about to expire leaves no lifetime to sign.
    // Proof: with this removed, `refuses a grant that leaves no lifetime after the 60 s margin`
    // (machine-token.test.ts) signed it; watched 2026-10-27.
    if (expiresAt <= nowSeconds) return refuseCredential();
    // Per credential and per source, in buckets apart from the failures (M10); be-01's grant is
    // then dropped unsigned.
    // Proof: with this removed, `refuses the 101st issuance of one credential at once, from any
    // address` and `one address issues 100 tokens for a pool of 100…` (machine-limits.test.ts)
    // signed the 101st; watched 2026-10-27.
    const issuance = settings.limit.takeIssuance(attempt, issued.credentialId);
    if (issuance !== null) return rateLimited(issuance.retryAfterSeconds);
    const token = await this.issueMachineToken(issued, scopes, nowSeconds, expiresAt);
    return Response.json(
      {
        access_token: token,
        token_type: 'Bearer',
        expires_in: expiresAt - nowSeconds,
        scope: scopes.join(' '),
      },
      // Proof: without these headers `expires 60 s before the grant…` (machine-token.test.ts) saw
      // no no-store; watched 2026-10-27.
      { headers: { 'cache-control': 'no-store', pragma: 'no-cache' } },
    );
  }

  /**
   * A machine access token (M3, M6): `token_use: machine`, the credential as
   * `sub`, the narrowed scopes (also as groups, which `/mcp` admission reads),
   * and be-01's grant, which every be-01 call presents beside the secret.
   */
  private async issueMachineToken(
    issued: IssuedMachineGrant,
    scopes: readonly MachineScope[],
    issuedAt: number,
    expiresAt: number,
  ): Promise<string> {
    const scope = scopes.join(' ');
    return await new SignJWT({
      token_use: 'machine',
      scope,
      [this.groupsClaim]: scopes.map((value) => `${this.groupPrefix}:${value}`),
      wbs_machine_grant: issued.grant,
      wbs_person: issued.personId,
      wbs_organization: issued.organizationId,
      ...(issued.runId === null ? {} : { wbs_run: issued.runId }),
    })
      .setProtectedHeader({ alg: 'RS256', kid: this.keyId, typ: 'JWT' })
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setSubject(issued.credentialId)
      .setJti(this.random())
      .setIssuedAt(issuedAt)
      .setExpirationTime(expiresAt)
      .sign(this.privateKey);
  }

  private async issueAccessToken(
    subject: string,
    scope: string,
    jti: string,
    familyId: string,
    expiresAt: number,
  ): Promise<string> {
    return await new SignJWT({
      // Tells a consent token from a machine one (`token_use: machine`); `/mcp` admission
      // (the change's section 3) routes on it.
      token_use: 'consent',
      mcp_family_id: familyId,
      [this.groupsClaim]: scope.split(' ').map((value) => `${this.groupPrefix}:${value}`),
      scope,
    })
      .setProtectedHeader({ alg: 'RS256', kid: this.keyId, typ: 'JWT' })
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setSubject(subject)
      .setJti(jti)
      .setIssuedAt(Math.floor(this.now() / 1000))
      .setExpirationTime(Math.floor(expiresAt / 1000))
      .sign(this.privateKey);
  }

  /** Checks current organization authority before any credential return or provider work. */
  private async checkRefreshAuthority(family: FamilyRecord, expected = family): Promise<void> {
    // Proof: 2026-10-13, bypassing this read failed 48 fresh-provider negatives
    // across automatic, forced and grant paths (membership, policy, outage and substitutions).
    const authority = readFamilyAuthority(family);
    // Proof: omitting the expected-family comparison failed all three
    // `rechecks family binding change after held provider` tests, 2026-10-13.
    if (
      expected.binding !== undefined &&
      !matchesRefreshAuthority({ ...expected, binding: expected.binding }, family)
    )
      throw new UpstreamRefreshRefused('MCP organization refresh binding changed');
    if (authority === 'legacy') return;
    // Proof: 2026-10-13, without this guard all three `without authority` tests
    // resolved successfully (grant answered 200); automatic used a still-fresh token.
    if (
      authority === 'unsupported' ||
      family.binding === undefined ||
      this.readRefreshAuthority === undefined
    )
      throw new UpstreamRefreshRefused('MCP organization refresh authority is not installed');
    const admission = await this.readRefreshAuthority({
      familyId: family.familyId,
      clientId: family.clientId,
      subject: family.subject,
      scope: family.scope,
      credentialEpoch: family.credentialEpoch,
      binding: family.binding,
      // Proof: 2026-10-22, leaving the consent out here made `matchesRefreshAuthority` refuse
      // every consent family, failing `offers dany's agents at consent, and a consent as claire
      // mints her credential` (organization-delegation.boot.test.ts) on its first tool call.
      ...(family.consent === undefined ? {} : { consent: family.consent }),
    });
    if (admission.outcome === 'unavailable')
      throw new UpstreamRefreshUnavailable('MCP organization refresh authority is unavailable');
    if (admission.outcome === 'denied') {
      // A consent family's credential is revoked, unbound or its human left: that never comes
      // back, so the family ends now and the sweep reports it, instead of lingering unrevoked.
      // A human's own family is kept, as before.
      // Proof: 2026-10-22, without this revocation `revoking the consent in WBS ends the
      // session: 401, and refresh is refused` (organization-delegation.boot.test.ts) reported 0
      // ended families instead of 2.
      if (family.consent !== undefined) this.store.revokeFamily(family.familyId, this.now());
      throw new UpstreamRefreshRefused('MCP organization refresh authority refused');
    }
    if (!matchesRefreshAuthority(admission.authority, family))
      throw new UpstreamRefreshRefused('MCP organization refresh authority changed');
    const refusal = credentialRuleRefusal(
      family.binding.organizationId,
      admission.facts,
      {
        authentication: {
          kind: 'upstream',
          issuer: family.binding.issuer,
          subject: family.subject,
        },
        delegated: true,
        delegationLifecycle: admission.facts.lifecycle,
      },
      this.now(),
    );
    if (refusal !== null)
      throw new UpstreamRefreshRefused(
        `MCP organization credential rule refused: ${refusal.refusal}`,
      );
    const current = this.store.family(family.familyId);
    // Proof: omitting this binding comparison failed all three `family change during reader`
    // negatives, 2026-10-13: the awaited read otherwise admitted a different family identity.
    if (current?.revokedAt !== null || !matchesRefreshAuthority(admission.authority, current))
      throw new UpstreamRefreshRefused(
        'MCP organization refresh family changed during authority read',
      );
  }

  private async refreshUpstreamIfNeeded(
    family: FamilyRecord,
    force = false,
  ): Promise<FamilyRecord> {
    await this.checkRefreshAuthority(family);
    const now = this.now();
    if (
      !force &&
      (family.upstreamExpiresAt > now + UPSTREAM_REFRESH_EARLY_MS ||
        (family.upstreamRefreshedAt !== null && family.upstreamRefreshedAt >= now - 5_000))
    )
      return family;
    if (family.upstreamRefreshToken === undefined) {
      if (!force && family.upstreamExpiresAt > now) return family;
      this.store.revokeFamily(family.familyId, now);
      throw new UpstreamRefreshRefused(
        'upstream access cannot be refreshed; the MCP family was revoked',
      );
    }
    const deadline = Date.now() + 10_000;
    let candidate = family;
    while (Date.now() < deadline) {
      const attemptNow = this.now();
      const owner = this.random();
      const leased = this.store.acquireRefreshLease(
        family.familyId,
        candidate.version,
        owner,
        attemptNow,
        attemptNow + 5_000,
      );
      if (leased === null) {
        await Bun.sleep(25);
        const current = this.store.family(family.familyId);
        if (current === null)
          throw new UpstreamRefreshUnavailable('MCP refresh family disappeared');
        if (current.revokedAt !== null)
          throw new UpstreamRefreshUnavailable('MCP refresh family was revoked');
        if (
          current.leaseOwner === null &&
          current.upstreamRefreshedAt !== family.upstreamRefreshedAt
        ) {
          // Proof: removing this read failed `rechecks authority after a rival lease
          // publishes its provider replacement`, 2026-10-13: the waiter returned a denied token.
          await this.checkRefreshAuthority(current, family);
          return current;
        }
        if (
          current.leaseOwner === null ||
          (current.leaseUntil !== null && current.leaseUntil < this.now())
        )
          candidate = current;
        continue;
      }
      try {
        // Proof: removing this read made `policy change at lease acquisition` contact
        // the provider before refusing; the zero-provider assertion failed, 2026-10-13.
        await this.checkRefreshAuthority(leased, family);
      } catch (cause) {
        // Proof: omitting release failed the lease assertion in `policy change at lease
        // acquisition`, 2026-10-13, leaving a refused provider operation holding its lease.
        this.store.releaseRefreshLease(family.familyId, owner);
        throw cause;
      }
      // Proof: removing this synchronous lease recheck made `lease expires during a held
      // authority read` contact the provider twice with the original secret, 2026-10-13.
      // The authority await can outlive ownership; a stale owner must converge before dispatch.
      const currentLease = this.store.family(family.familyId);
      if (currentLease === null)
        throw new UpstreamRefreshUnavailable('MCP refresh family disappeared after authority read');
      if (
        currentLease.revokedAt !== null ||
        currentLease.leaseOwner !== owner ||
        currentLease.version !== leased.version ||
        currentLease.leaseUntil === null ||
        currentLease.leaseUntil <= this.now()
      ) {
        this.store.releaseRefreshLease(family.familyId, owner);
        // Proof: adopting currentLease.version here made the `rival provider is completed`
        // variant refresh its rotated secret again, 2026-10-13. Retain the pre-acquisition
        // version so the next failed CAS observes completion before trying another lease.
        continue;
      }
      let tokens: BrowserOidcTokenSet | undefined;
      let upstreamExpiresAt: number;
      try {
        tokens = await this.upstream.refresh(
          leased.upstreamRefreshToken ?? family.upstreamRefreshToken,
        );
        const upstreamClaims = await this.verifyUpstream(tokens.accessToken);
        upstreamExpiresAt = upstreamExpiryOf(tokens, upstreamClaims, this.now());
      } catch (cause) {
        const failureKind = classifyOidcFailure(cause).kind;
        if (failureKind === 'refused') {
          this.store.revokeFamily(family.familyId, this.now());
          throw new UpstreamRefreshRefused(
            'upstream refresh was refused; the MCP family was revoked',
            { cause },
          );
        }
        this.store.releaseRefreshLease(family.familyId, owner, tokens?.refreshToken);
        // A local defect is not a provider outage: it propagates so the caller reports it.
        // Proof: on 2026-09-27, wrapping defects too failed `rejects a tool-call refresh with a
        // local refresh defect, and releases the lease` (received EdgeGate, not the defect);
        // skipping the lease release made its second refresh time out at 5000 ms.
        if (failureKind === 'defect') throw cause;
        // Proof: on 2026-09-27, throwing a plain Error here failed `keeps a transient provider
        // refresh failure an edge-gate outcome of a tool-call refresh`.
        throw new UpstreamRefreshUnavailable('upstream refresh could not be completed', { cause });
      }
      try {
        const current = this.store.family(family.familyId);
        if (current?.revokedAt !== null)
          throw new UpstreamRefreshUnavailable('MCP refresh family disappeared or was revoked');
        // Proof: removing this read failed all 15 `after held provider` negatives,
        // 2026-10-13: tightened, removed, changed or unavailable authority published access.
        await this.checkRefreshAuthority(current, family);
      } catch (cause) {
        // Proof: omitting release failed all 15 held-provider lease assertions; omitting
        // the rotated secret failed all 15 secret-preservation assertions, 2026-10-13.
        // Preserve a provider-rotated secret for a retry, without publishing the refused access token.
        this.store.releaseRefreshLease(family.familyId, owner, tokens.refreshToken);
        throw cause;
      }
      if (
        !this.store.finishRefreshLease(
          family.familyId,
          owner,
          tokens.accessToken,
          tokens.refreshToken,
          upstreamExpiresAt,
          this.now(),
        )
      )
        throw new UpstreamRefreshUnavailable('upstream refresh lease was lost');
      const current = this.store.family(family.familyId);
      if (current === null)
        throw new UpstreamRefreshUnavailable('upstream refresh family disappeared');
      return current;
    }
    throw new UpstreamRefreshUnavailable('timed out waiting for the upstream refresh lease');
  }

  private async revoke(request: Request): Promise<Response> {
    const token = stringField(await request.formData(), 'token');
    if (token !== undefined) {
      // RFC 7009 answers 200 whether or not the token was valid, so an unverifiable token falls
      // through to the refresh-token lookup. A store failure is not an unknown token: it throws.
      // Proof: on 2026-09-27, wrapping this in a catch-all failed `surfaces a store failure during
      // revocation instead of reporting success` (resolved with 200, oauth.test.ts).
      let payload: JWTPayload | null;
      try {
        payload = await this.verifyRevocationSignature(token);
      } catch {
        payload = null;
      }
      // A machine token has no family to end and cannot be revoked here (M5): its credential's
      // revocation in WBS ends it at the next call. RFC 7009 §2.2.1's error says so, rather
      // than a 200 that would claim it ended.
      // Proof: with this refusal removed, `answers unsupported_token_type for a machine token at
      // /revoke…` (machine-admission.test.ts) answered 200; watched 2026-10-27.
      if (payload?.['token_use'] === 'machine')
        return Response.json({ error: 'unsupported_token_type' }, { status: 400 });
      const family =
        payload === null
          ? this.store.familyForRefreshToken(token)
          : typeof payload['mcp_family_id'] === 'string'
            ? this.store.family(payload['mcp_family_id'])
            : typeof payload.jti === 'string'
              ? this.store.familyForSessionId(payload.jti)
              : null;
      if (family !== null) {
        // Proof: on 2026-09-27, skipping this failed `ends access and refresh when the refresh
        // token is revoked`: the later write answered 200, not 401 (oauth.test.ts).
        this.store.revokeFamily(family.familyId, this.now());
        await this.revokeRefreshToken(family.upstreamRefreshToken);
      }
    }
    return new Response(null, { status: 200 });
  }

  private async verifyRevocationSignature(token: string): Promise<JWTPayload> {
    const kid = decodeProtectedHeader(token).kid;
    const key =
      kid === this.keyId
        ? this.publicKey
        : kid !== undefined && kid === this.previousKeyId
          ? this.previousPublicKey
          : undefined;
    if (key === undefined) throw new Error('MCP token uses an unknown signing key');
    const verified = await compactVerify(token, key, { algorithms: ['RS256'] });
    const payload = JSON.parse(Buffer.from(verified.payload).toString('utf8')) as JWTPayload;
    const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (payload.iss !== this.issuer || !audience.includes(this.audience))
      throw new Error('MCP token uses the wrong issuer or audience');
    return payload;
  }

  private async verifySignature(token: string): Promise<JWTPayload> {
    const kid = decodeProtectedHeader(token).kid;
    const key =
      kid === this.keyId
        ? this.publicKey
        : kid !== undefined && kid === this.previousKeyId
          ? this.previousPublicKey
          : undefined;
    if (key === undefined) throw new Error('MCP token uses an unknown signing key');
    const verified = await jwtVerify(token, key, {
      algorithms: ['RS256'],
      audience: this.audience,
      currentDate: new Date(this.now()),
      issuer: this.issuer,
    });
    return verified.payload;
  }

  private publicJwks(): readonly (JsonWebKey & { alg: string; kid: string; use: string })[] {
    const current = {
      ...this.publicKey.export({ format: 'jwk' }),
      alg: 'RS256',
      kid: this.keyId,
      use: 'sig' as const,
    };
    if (this.previousPublicKey === undefined || this.previousKeyId === undefined) return [current];
    return [
      current,
      {
        ...this.previousPublicKey.export({ format: 'jwk' }),
        alg: 'RS256',
        kid: this.previousKeyId,
        use: 'sig' as const,
      },
    ];
  }

  /**
   * Reports to be-01 every consent credential whose family mcp-01 ended (revoked by any path,
   * idle or absolutely expired, retired by an epoch advance) or whose code expired unexchanged,
   * so be-01 revokes it (`wbs-machine-credentials` A20, _End_). This is the durable direction
   * mcp-01 → be-01 of the two-way revocation: the store keeps each end until be-01 acknowledges
   * it, so a report lost to a crash or an unreachable be-01 is sent again by the next sweep.
   * `mcp-01`'s main runs it once a minute; the end is therefore visible in WBS within about a
   * minute, not at once.
   *
   * @returns how many ends be-01 acknowledged; it stops at the first unavailable answer.
   * @throws {OrganizationAuthorityDefect} on an answer this release does not model.
   */
  async reportEndedConsents(): Promise<number> {
    const organizations = this.organizations;
    if (organizations === undefined) return 0;
    let acknowledged = 0;
    for (const ended of this.store.endedConsents(this.now(), CONSENT_END_REPORT_BATCH)) {
      // Proof: 2026-10-22, acknowledging without asking be-01 made `a family mcp-01 ends marks
      // its credential revoked in WBS` (organization-delegation.boot.test.ts) keep it live.
      if ((await organizations.reportConsentEnded(ended)) === 'unavailable') break;
      this.store.acknowledgeConsentEnd(ended, this.now());
      acknowledged += 1;
    }
    return acknowledged;
  }

  /** Proven, or reserved to become proven by an exchange in flight in this process. */
  private countsAsProven(client: RegisteredClient): boolean {
    return client.proven || this.promotionReservations.has(client.clientId);
  }

  private cleanup(): void {
    const now = this.now();
    this.pendingAuthorizations.cleanupExpired();
    // Proof: 2026-10-21, dropping this sweep failed `deletes an expired client from the store
    // when the next request sweeps` (oauth.test.ts): the expired row stayed stored.
    this.store.deleteExpiredClients(now);
    for (const [code, grant] of this.grants) {
      if (grant.expiresAt <= now) this.grants.delete(code);
    }
    for (const [selectionId, selection] of this.selections) {
      if (selection.expiresAt <= now) this.selections.delete(selectionId);
    }
    for (const [markerId, expiresAt] of this.reauthMarkers) {
      if (expiresAt <= now) this.reauthMarkers.delete(markerId);
    }
  }
}

export function mcpOAuthFromEnv(
  config: McpConfig,
  env: Readonly<Record<string, string | undefined>>,
  routeEvidence?: (evidence: OAuthRouteEvidence) => void,
  fetchImpl?: FetchLike,
  reportFault?: DeploymentFaultReporter,
): McpOAuthServer {
  // Either service secret composes organization authority during the cutover (M14), which then
  // sends the dedicated one alone whenever it is set (`mcpServiceHeaderOf`).
  const offersOrganizations =
    config.INTERNAL_AUTH_SECRET !== undefined || config.MCP_BE_INTERNAL_SECRET !== undefined;
  let client: BrowserOidcClient | undefined;
  const get = () => (client ??= browserOidcClientFromEnv(env, { allowMissingAccessExpiry: true }));
  let upstreamVerifier: TokenVerifier | undefined;
  const verifyUpstream = (token: string) =>
    (upstreamVerifier ??= oidcTokenVerifierFromEnv(env)).verify(token);
  const tokenTtlSeconds = machineTokenTtlOf(env);
  const machineSecret = config.MCP_BE_INTERNAL_SECRET;
  return new McpOAuthServer(
    config,
    {
      authorizationUrl: (input) => get().authorizationUrl(input),
      exchange: (request, checks) => get().exchange(request, checks),
      refresh: (refreshToken) => get().refresh(refreshToken),
      revoke: (refreshToken) => get().revoke(refreshToken),
    },
    {
      groupsClaim: env['AUTH_GROUPS_CLAIM'] ?? 'wbs_groups',
      groupPrefix: groupPrefixOf(env),
      routeEvidence,
      verifyUpstream,
      // Composed before organization authority, so a missing reporter names the grants first.
      // Proof: with this condition `machineSecret === undefined` alone, `composes machine
      // grants from the environment in standalone mode only` (machine-token.test.ts) composed
      // them in gateway mode, demanding a fault reporter for them there; watched 2026-10-27.
      ...(machineSecret === undefined || !offersMachineGrants(config)
        ? {}
        : {
            machineGrants: {
              client: machineGrantClient(
                { ...config, MCP_BE_INTERNAL_SECRET: machineSecret },
                fetchImpl,
              ),
              secret: machineSecret,
              tokenTtlSeconds,
              // Proof: composing NO_MACHINE_LIMITS here made `composes M10's limits from the
              // environment` (machine-limits.test.ts) answer the 31st failure 401; watched
              // 2026-10-27.
              limit: new MachineTrafficLimits(Date.now),
              reportFault: requiredFaultReporter(reportFault, 'machine grants are offered'),
            },
          }),
      // Proof: composing it for INTERNAL_AUTH_SECRET alone, as before the cutover, failed
      // `composes machine grants from the environment in standalone mode only`
      // (machine-token.test.ts): gateway mode then asked no reporter; watched 2026-10-27.
      ...(offersOrganizations
        ? {
            organizations: organizationAuthority(config, fetchImpl),
            reportFault: requiredFaultReporter(reportFault, 'organization authority is composed'),
          }
        : {}),
      ...oauthPersistenceFromEnv(env),
    },
  );
}

/**
 * The deployment fault reporter `main.ts` composes; offering machine grants or organization
 * authority without one is a defect.
 */
function requiredFaultReporter(
  report: DeploymentFaultReporter | undefined,
  composed: string,
): DeploymentFaultReporter {
  if (report === undefined) throw new Error(`${composed} but no fault reporter was composed`);
  return report;
}

/**
 * `MCP_MACHINE_TOKEN_TTL` in whole seconds, 12 h when unset (M4). Read at
 * boot whether or not machine grants are offered, so a bad value never waits
 * for the secret to surface.
 *
 * @throws when it is not a whole number of seconds from 60 s to 24 h.
 */
export function machineTokenTtlOf(env: Readonly<Record<string, string | undefined>>): number {
  const value = env['MCP_MACHINE_TOKEN_TTL'];
  // An empty variable is an unset one that went through a shell, as `loadConfig` reads every
  // mcp-01 variable (`config.ts`), so it takes the documented default.
  if (value === undefined || value === '') return DEFAULT_MACHINE_TOKEN_TTL_SECONDS;
  // Proof: without the bounds, `reads MCP_MACHINE_TOKEN_TTL as 60 s to 24 h, 12 h when unset`
  // (machine-token.test.ts) read 59; watched 2026-10-27.
  const seconds = Number(value);
  if (
    !/^[0-9]+$/.test(value) ||
    seconds < LEAST_MACHINE_TOKEN_TTL_SECONDS ||
    seconds > MOST_MACHINE_TOKEN_TTL_SECONDS
  )
    throw new Error('MCP_MACHINE_TOKEN_TTL must be a whole number of seconds from 60 to 86400');
  return seconds;
}

function oauthPersistenceFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): Pick<Options, 'accessTtlMs' | 'signingKeys' | 'store'> {
  const currentPrivate = signingKey(
    requiredEnv(env, 'MCP_SIGNING_KEY_CURRENT'),
    'MCP_SIGNING_KEY_CURRENT',
  );
  const previousValue = env['MCP_SIGNING_KEY_PREVIOUS'];
  const previousPublicKey =
    previousValue === undefined || previousValue === ''
      ? undefined
      : createPublicKey(signingKey(previousValue, 'MCP_SIGNING_KEY_PREVIOUS'));
  const currentStore = storeKey(requiredEnv(env, 'MCP_STORE_KEY_CURRENT'), 'MCP_STORE_KEY_CURRENT');
  const previousStoreValue = env['MCP_STORE_KEY_PREVIOUS'];
  const storeKeys =
    previousStoreValue === undefined || previousStoreValue === ''
      ? [currentStore]
      : [currentStore, storeKey(previousStoreValue, 'MCP_STORE_KEY_PREVIOUS')];
  const ttlValue = env['MCP_ACCESS_TOKEN_TTL'] ?? String(DEFAULT_ACCESS_TTL_MS / 1_000);
  const ttlSeconds = Number(ttlValue);
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1)
    throw new Error('MCP_ACCESS_TOKEN_TTL must be a positive integer number of seconds');
  return {
    accessTtlMs: ttlSeconds * 1_000,
    signingKeys: {
      privateKey: currentPrivate,
      publicKey: createPublicKey(currentPrivate),
      previousPublicKey,
    },
    store: new McpSessionStore(requiredEnv(env, 'MCP_STORE_PATH'), storeKeys),
  };
}

function signingKey(value: string, name: string): KeyObject {
  try {
    return value.startsWith('-----BEGIN')
      ? createPrivateKey(value.replaceAll('\\n', '\n'))
      : createPrivateKey({ key: Buffer.from(value, 'base64'), format: 'der', type: 'pkcs8' });
  } catch (cause) {
    throw new Error(`${name} must contain a readable PEM or base64 PKCS8 private signing key`, {
      cause,
    });
  }
}

function storeKey(value: string, name: string): Buffer {
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32 || key.toString('base64').replace(/=+$/, '') !== value.replace(/=+$/, ''))
    throw new Error(`${name} must be base64 for exactly 32 bytes`);
  return key;
}

function requiredEnv(env: Readonly<Record<string, string | undefined>>, name: string): string {
  const value = env[name];
  if (value === undefined || value === '') throw new Error(`${name} is required`);
  return value;
}

function keyIdOf(key: KeyObject): string {
  const jwk = key.export({ format: 'jwk' });
  if (jwk.e === undefined || jwk.n === undefined || jwk.kty === undefined)
    throw new Error('MCP signing key must be RSA');
  return createHash('sha256')
    .update(JSON.stringify({ e: jwk.e, kty: jwk.kty, n: jwk.n }))
    .digest('base64url');
}

function upstreamExpiryOf(
  tokens: BrowserOidcTokenSet,
  verifiedClaims: JwtClaims,
  now: number,
): number {
  if (Number.isFinite(tokens.expiresIn) && tokens.expiresIn > 0)
    return now + tokens.expiresIn * 1_000;
  const expiresAt = verifiedClaims['exp'];
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt) || expiresAt * 1_000 <= now)
    throw new Error('OIDC access token has neither expiresIn nor a future verified exp');
  return expiresAt * 1_000;
}

function tokenResponse(
  token: string,
  refreshToken: string,
  scope: string,
  lifetimeMs: number,
): Response {
  return Response.json({
    access_token: token,
    expires_in: Math.floor(lifetimeMs / 1_000),
    refresh_token: refreshToken,
    scope,
    token_type: 'Bearer',
  });
}

async function routeEvidenceOf(
  request: Request,
  path: string,
  status: number,
): Promise<OAuthRouteEvidence> {
  const evidence: OAuthRouteEvidence = { method: request.method, path, status };
  if (path.endsWith('/register')) {
    const body: unknown = await request.json().catch(() => undefined);
    if (isObject(body) && Array.isArray(body['grant_types'])) {
      evidence.registration_grant_types = body['grant_types'].slice(0, 10).map(evidenceGrantType);
    }
  } else if (path.endsWith('/token')) {
    const grantType = stringField(await request.formData(), 'grant_type');
    if (grantType !== undefined) evidence.grant_type = evidenceGrantType(grantType);
  }
  return evidence;
}

function evidenceGrantType(value: unknown): string {
  return value === 'authorization_code' ||
    value === 'refresh_token' ||
    // Proof: recording `other` failed `records the grant type, and nothing else of the request, as
    // route evidence` (machine-token.test.ts); watched 2026-10-27.
    value === CLIENT_CREDENTIALS_GRANT ||
    value === JWT_BEARER_GRANT
    ? value
    : 'other';
}

/**
 * be-01's answer, checked against the request: the grant, `refused`, or the
 * other refusal it maps to. A grant naming another credential than the key's
 * own id is be-01's defect, never the client's.
 */
function issuedGrantOf(
  answer: MachineGrantAnswer,
  parsed: MachineTokenRequest,
  requestedExpiresAt: number,
):
  | IssuedMachineGrant
  | { readonly kind: 'refused' }
  | {
      readonly kind: 'other';
      readonly error: MachineTokenError;
      readonly description?: string;
      readonly retryAfterSeconds?: number;
    } {
  switch (answer.kind) {
    case 'issued':
      // Proof: with this removed, `throws a defect, never a refusal…` (machine-token.test.ts)
      // signed a token for another credential; watched 2026-10-27.
      if (parsed.grant === 'client_credentials' && answer.credentialId !== parsed.keyCredentialId)
        throw new MachineGrantDefect('be-01 issued a grant for another credential than the key');
      // be-01 only ever lowers the lifetime asked for, and signs the run it was sent (M3, M15).
      // Proof: with either comparison removed, `throws a defect, never a refusal…`
      // (machine-token.test.ts) signed a token past the request or for another run; watched
      // 2026-10-27.
      if (answer.expiresAt > requestedExpiresAt)
        throw new MachineGrantDefect('be-01 issued a grant outliving the lifetime asked for');
      if (answer.runId !== parsed.run)
        throw new MachineGrantDefect('be-01 issued a grant for another run than asked');
      return answer;
    case 'refused':
      return answer;
    case 'unsupported_assertion_type':
      return {
        kind: 'other',
        error: 'invalid_grant',
        description: `assertion typ "${answer.typ}" is not supported: only a workload JWT is, not an ID-JAG or an access token`,
      };
    case 'run_refused':
      return {
        kind: 'other',
        error: 'invalid_request',
        description: 'wbs_run must not look like a secret',
      };
    case 'unavailable':
      return { kind: 'other', error: 'temporarily_unavailable', retryAfterSeconds: 5 };
  }
}

/** The token endpoint's errors for the machine grants. */
type MachineTokenError =
  | TokenRequestRefusal['error']
  | 'unsupported_grant_type'
  | 'temporarily_unavailable'
  | 'server_error';

/** M10's token-endpoint refusal: `429 invalid_request`, `rate_limited`, with `Retry-After`. */
function rateLimited(retryAfterSeconds: number): Response {
  return machineRefusal('invalid_request', 'rate_limited', retryAfterSeconds);
}

/**
 * A machine grant refusal (RFC 6749 §5.2), never cached: `invalid_client` is
 * 401 with a Basic challenge (RFC 6749 §5.2, RFC 7617), an `invalid_request`
 * with a wait is the rate limit's 429, be-01 unavailable is 503, and
 * everything else 400. A wait is sent as `Retry-After`.
 */
function machineRefusal(
  error: MachineTokenError,
  description?: string,
  retryAfterSeconds?: number,
): Response {
  const headers = new Headers({ 'cache-control': 'no-store', pragma: 'no-cache' });
  let status = 400;
  if (error === 'invalid_client') {
    status = 401;
    // Proof: without the challenge `maps unknown_identity and not_activated to invalid_client…`
    // (machine-token.test.ts) failed; watched 2026-10-27.
    headers.set('www-authenticate', 'Basic realm="wbs-mcp"');
  } else if (error === 'temporarily_unavailable') status = 503;
  else if (error === 'server_error') status = 502;
  else if (error === 'invalid_request' && retryAfterSeconds !== undefined) status = 429;
  if (retryAfterSeconds !== undefined) headers.set('retry-after', String(retryAfterSeconds));
  return Response.json(
    description === undefined ? { error } : { error, error_description: description },
    { status, headers },
  );
}

/**
 * The scope one refreshed access token carries (RFC 6749 §6): the family's own when `requested`
 * is absent, else the requested subset in the family's order. Undefined when `requested` names a
 * scope the family was not granted, or nothing. The family itself keeps its original grant.
 */
function narrowScope(granted: string, requested: string | undefined): string | undefined {
  if (requested === undefined) return granted;
  const grantedScopes = granted.split(' ').filter(Boolean);
  const requestedScopes = new Set(requested.split(' ').filter(Boolean));
  if (requestedScopes.size === 0) return undefined;
  for (const scope of requestedScopes) if (!grantedScopes.includes(scope)) return undefined;
  return grantedScopes.filter((scope) => requestedScopes.has(scope)).join(' ');
}

function stringField(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function challengeOf(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reviewed hosted callbacks, admitted only as these exact strings: a parsed comparison would let
 * `https://VSCODE.dev:443/a/../redirect` normalize into an entry. Every other hosted callback,
 * including Copilot Studio installations, needs its own reviewed entry here. Cursor's
 * `cursor://anysphere.cursor-mcp/oauth/callback` stays out: RFC 8252 §7.1 wants a reverse-domain
 * private-use scheme, any local app may claim `cursor:`, and the MCP authorization spec requires
 * HTTPS or loopback. ChatGPT is not admitted yet: authorization responses now carry the RFC 9207
 * issuer it requires, but its stable `https://chatgpt.com/connector_platform_oauth_redirect` (or a
 * `https://chatgpt.com/connector/oauth/{callback_id}`) enters only once a connection is observed
 * displaying that exact URI (design.md, "Redirect policy").
 */
const HOSTED_REDIRECTS: ReadonlySet<string> = new Set([
  'https://claude.ai/api/mcp/auth_callback',
  'https://claude.com/api/mcp/auth_callback',
  'https://vscode.dev/redirect',
  'https://insiders.vscode.dev/redirect',
  'https://www.perplexity.ai/rest/connections/oauth_callback',
  'https://enterprise.perplexity.ai/rest/connections/oauth_callback',
]);

/**
 * A native-client loopback callback (RFC 8252 §7.3) spelled literally: `127.1`, `LOCALHOST`,
 * port `0` or a zero-padded port do not match, and nothing may precede the host.
 */
const LOOPBACK_REDIRECT =
  /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::[1-9][0-9]{0,4})?(?:\/[^#]*)?$/;

/**
 * RFC 3986 URI characters, `#` aside, with percent escapes well formed. `new URL` repairs
 * spaces, control characters and `%ZZ`, so it cannot be the syntax check.
 */
const URI_CHARACTERS = /^(?:[A-Za-z0-9\-._~:/?[\]@!$&'()*+,;=]|%[0-9A-Fa-f]{2})*$/;

/** Authorization-response fields a callback's own query must not pre-set. */
const RESPONSE_FIELDS = ['code', 'state', 'iss', 'error', 'error_description', 'error_uri'];

/**
 * A requested callback that refuses the whole registration instead of being dropped: not a
 * bounded RFC 3986 absolute URI, or carrying credentials, a fragment or a pre-set response field. A
 * pre-set `state` is refused too, so Continue's `http://localhost:3000/?state=…` stays out; it
 * would not help, because Continue then authorizes with the bare `http://localhost:3000`.
 */
function isMalformedRedirect(value: unknown): boolean {
  if (typeof value !== 'string' || bytes(value) > MAX_REDIRECT_URI_BYTES) return true;
  // Proof: on 2026-09-27, dropping this fragment test failed `refuses the whole list when one
  // callback carries an empty fragment`, which `URL.hash` reports as '' (oauth.test.ts).
  if (value.includes('#')) return true;
  // Proof: on 2026-09-27, dropping this test failed `refuses the whole list when one callback
  // carries …` for `%ZZ`, a space, a loopback space, a newline, a tab and `é` (oauth.test.ts).
  if (!URI_CHARACTERS.test(value)) return true;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return true;
  }
  return (
    url.username !== '' ||
    url.password !== '' ||
    // Proof: on 2026-09-27, dropping this failed `refuses the whole list when one callback
    // carries …` for every planted and percent-encoded response field (oauth.test.ts).
    RESPONSE_FIELDS.some((field) => url.searchParams.has(field))
  );
}

/**
 * Whether `value` has the exact shape of an id the default `random` issues: the canonical
 * unpadded base64url of {@link ISSUED_ID_BYTES} bytes, so 43 characters whose last one carries
 * two zero bits. Ids an injected `random` (tests) issues do not have it.
 */
function isIssuedIdShape(value: string): boolean {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) return false;
  const decoded = Buffer.from(value, 'base64url');
  return decoded.length === ISSUED_ID_BYTES && decoded.toString('base64url') === value;
}

/**
 * A callback on the reviewed list; exact authorization matching happens later. Runs only on
 * values {@link isMalformedRedirect} passed, so a pattern-matching loopback always parses.
 */
function isListedRedirect(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  // Proof: on 2026-09-27, a parsed `hostname.endsWith` match here failed `refuses the near-miss
  // callback` for evilvscode.dev, VSCODE.dev, :443 and the dot-segment path (oauth.test.ts).
  if (HOSTED_REDIRECTS.has(value)) return true;
  // Proof: on 2026-09-27, skipping this pattern failed `refuses the near-miss callback` for
  // 127.1, LOCALHOST, ports 0 and 080, and javascript://localhost (oauth.test.ts).
  if (!LOOPBACK_REDIRECT.test(value)) return false;
  const url = new URL(value);
  return (
    (url.protocol === 'http:' || url.protocol === 'https:') &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  );
}

function bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function cookieOf(request: Request, name: string): string | undefined {
  return request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim().split('='))
    .find(([key]) => key === name)?.[1];
}

/**
 * The choice a consent after activation pauses on when its user belongs to several
 * organizations or has agent persons to offer (A20): per organization, one button to authorize
 * as yourself (`organizationId`) and one per agent person bound to the account (`agent`, an index
 * into the selection's offered agents, in page order). One form; the page may not be framed,
 * cached or load anything.
 */
function selectionPage(
  action: string,
  selectionId: string,
  memberships: readonly OrganizationChoice[],
): Response {
  let agentIndex = 0;
  const sections = memberships
    .map((membership) => {
      const role = escapeHtml(membership.role.replace('_', ' '));
      const self = `<button name="organizationId" value="${escapeHtml(membership.organizationId)}">${escapeHtml(membership.name)} <small>${membership.agents.length === 0 ? role : `as yourself, ${role}`}</small></button>`;
      const agents = membership.agents
        .map((agent) => {
          const button = `<button name="agent" value="${String(agentIndex)}">${escapeHtml(membership.name)} <small>as agent ${escapeHtml(agent.name)}</small></button>`;
          agentIndex += 1;
          return button;
        })
        .join('');
      return self + agents;
    })
    .join('');
  const offersAgents = agentIndex > 0;
  const title = offersAgents ? 'Choose who this connection acts as' : 'Choose an organization';
  const lead = offersAgents
    ? 'This connection will act in one organization, as you or as one of your agents. An agent acts with member rights only, and you can revoke it from the people page. To use another, connect again.'
    : 'This connection will act in one organization. To use another, connect again.';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>body{font:16px/1.5 system-ui,sans-serif;margin:0;padding:16px;background:#fff;color:#111}main{max-width:28rem;margin:10vh auto}button{display:block;width:100%;margin:8px 0;padding:12px;text-align:left;font:inherit;border:1px solid #888;border-radius:6px;background:#f6f6f6;cursor:pointer}small{color:#555}@media (prefers-color-scheme:dark){body{background:#111;color:#eee}button{background:#222;color:#eee;border-color:#555}small{color:#aaa}}</style></head><body><main><h1>${title}</h1><p>${lead}</p><form method="post" action="${escapeHtml(action)}"><input type="hidden" name="selection" value="${escapeHtml(selectionId)}">${sections}</form></main></body></html>`;
  const headers = new Headers({
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-security-policy':
      "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
    'referrer-policy': 'no-referrer',
    'x-frame-options': 'DENY',
  });
  headers.append('set-cookie', clearCookie());
  headers.append(
    'set-cookie',
    `${SELECT_COOKIE}=${selectionId}; Max-Age=300; Path=/; HttpOnly; Secure; SameSite=Lax`,
  );
  return new Response(html, { status: 200, headers });
}

function clearSelectCookie(): string {
  return `${SELECT_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function equalSecrets(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function cookie(value: string): string {
  return `${COOKIE}=${value}; Max-Age=300; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function clearCookie(): string {
  return `${COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function reauthMarker(markerId: string, key: Buffer): string {
  return createHmac('sha256', key).update(markerId).digest('base64url');
}

function reauthCookie(markerId: string, key: Buffer): string {
  return `${REAUTH_COOKIE}=${markerId}.${reauthMarker(markerId, key)}; Max-Age=300; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function clearReauthCookie(): string {
  return `${REAUTH_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function callbackError(value: string): CallbackError {
  switch (value) {
    case 'access_denied':
    case 'invalid_request':
    case 'invalid_scope':
    case 'server_error':
    case 'temporarily_unavailable':
    case 'unauthorized_client':
    case 'unsupported_response_type':
      return value;
    default:
      return 'server_error';
  }
}

function redirect(location: string, setCookie: string | readonly string[]): Response {
  const headers = new Headers({ location });
  for (const value of typeof setCookie === 'string' ? [setCookie] : setCookie) {
    headers.append('set-cookie', value);
  }
  return new Response(null, { headers, status: 302 });
}

function protocolError(
  error: string,
  setCookie?: string,
  status = 400,
  description?: string,
): Response {
  return Response.json(
    description === undefined ? { error } : { error, error_description: description },
    { headers: setCookie === undefined ? undefined : { 'set-cookie': setCookie }, status },
  );
}

/**
 * Distinguishes pre-cutover families from durable organization authority. Only an
 * unbound epoch-0 family belongs to the legacy path. Bound families need an
 * authoritative membership and credential-rule reader before use; production installs
 * be-01's (`organization-authority.ts`) when `INTERNAL_AUTH_SECRET` is set, and without
 * it a bound family is refused. An epoch newer than {@link SUPPORTED_CREDENTIAL_EPOCH},
 * and an unbound family above epoch 0 (which the store CHECK forbids), are refused even with
 * an injected reader. A family older than the durable epoch never gets here: the store's
 * session and refresh reads already treat it as absent.
 */
function readFamilyAuthority(family: FamilyRecord): 'legacy' | 'organization' | 'unsupported' {
  // Proof: 2026-10-21, removing this test let a bound epoch-2 read disclose a fresh
  // token with an injected admitting reader (`corrupt epoch-2 bound family`).
  if (family.credentialEpoch > SUPPORTED_CREDENTIAL_EPOCH) return 'unsupported';
  if (family.binding !== undefined) return 'organization';
  // Proof: 2026-10-21, answering 'legacy' here regardless of epoch let `corrupt epoch-1
  // unbound family` return the fresh upstream token.
  if (family.credentialEpoch === 0) return 'legacy';
  return 'unsupported';
}
