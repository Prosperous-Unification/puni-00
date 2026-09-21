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
import { decodeProtectedHeader, type JWTPayload, jwtVerify, SignJWT } from 'jose';

import type { McpConfig } from './config';
import type { McpOAuthHandler } from './http';
import { type AuthorizationContext, PendingAuthorizations } from './pending-authorizations';
import { type FamilyRecord, McpSessionStore } from './session-store';

const SCOPES = new Set(['wbs:read', 'wbs:write', 'wbs:editor']);
const COOKIE = '__Host-wbs_mcp_oauth';
const REAUTH_COOKIE = '__Host-wbs_mcp_reauth';
const GRANT_TTL_MS = 300_000;
const DEFAULT_ACCESS_TTL_MS = 3_600_000;
const REFRESH_IDLE_MS = 14 * 86_400_000;
const REFRESH_ABSOLUTE_MS = 30 * 86_400_000;
const UPSTREAM_REFRESH_EARLY_MS = 120_000;
const UNPROVEN_CLIENT_TTL_MS = 600_000;
const ACTIVE_CLIENT_TTL_MS = 86_400_000;
const MAX_AUTHORIZATION_QUERY_BYTES = 2_048;
const MAX_STATE_BYTES = 512;
const MAX_REDIRECT_URIS = 10;
const MAX_REDIRECT_URI_BYTES = 512;
const MAX_REAUTH_MARKERS = 1_000;

class UpstreamRefreshRefused extends Error {}

type CallbackError =
  | 'access_denied'
  | 'invalid_request'
  | 'invalid_scope'
  | 'server_error'
  | 'temporarily_unavailable'
  | 'unauthorized_client'
  | 'unsupported_response_type';

interface ClientRecord {
  proven: boolean;
  promotionReserved: boolean;
  redirectUris: readonly string[];
  source: string;
  expiresAt: number;
  unprovenExpiresAt: number;
}

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
}

interface Options {
  groupsClaim?: string;
  groupPrefix?: string;
  now?: () => number;
  random?: () => string;
  signingKeys?: { privateKey: KeyObject; publicKey: KeyObject; previousPublicKey?: KeyObject };
  accessTtlMs?: number;
  store?: McpSessionStore;
  verifyUpstream?: TokenVerifier['verify'];
  clientLimit?: number;
  clientSourceLimit?: number;
  provenClientSourceLimit?: number;
  clientTtlMs?: number;
  grantLimit?: number;
  activeClientTtlMs?: number;
  sessionLimit?: number;
  transactionLimit?: number;
  transactionLimitPerClient?: number;
  routeEvidence?: (evidence: OAuthRouteEvidence) => void;
  reauthKey?: Buffer;
  revocationFailure?: () => void;
}

type UpstreamClient = Pick<
  BrowserOidcClient,
  'authorizationUrl' | 'exchange' | 'refresh' | 'revoke'
>;

export interface OAuthRouteEvidence {
  method: string;
  path: string;
  status: number;
  grant_type?: string;
  registration_grant_types?: readonly string[];
}

/** In-memory public-client registration plus the browser half of the fronting AS. */
export class InMemoryMcpOAuth implements McpOAuthHandler {
  private readonly clients = new Map<string, ClientRecord>();
  private readonly grants = new Map<string, McpAuthorizationGrant>();
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

  private readonly clientLimit: number;
  private readonly clientSourceLimit: number;
  private readonly provenClientSourceLimit: number;
  private readonly clientTtlMs: number;
  private readonly activeClientTtlMs: number;
  private readonly grantLimit: number;
  private readonly sessionLimit: number;
  private readonly routeEvidence: Options['routeEvidence'];
  constructor(
    config: Pick<McpConfig, 'MCP_PUBLIC_URL'>,
    private readonly upstream: UpstreamClient,
    options: Options = {},
  ) {
    const resource = new URL(config.MCP_PUBLIC_URL);
    this.audience = `${resource.origin}${resource.pathname.replace(/\/$/, '')}`;
    this.issuer = `${this.audience}/oauth`;
    this.callbackUrl = `${this.issuer}/callback`;
    this.groupsClaim = options.groupsClaim ?? 'wbs_groups';
    this.groupPrefix = options.groupPrefix ?? 'dev';
    this.now = options.now ?? Date.now;
    this.random = options.random ?? (() => randomBytes(32).toString('base64url'));
    const generatedKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const keys: NonNullable<Options['signingKeys']> = options.signingKeys ?? {
      privateKey: generatedKeys.privateKey,
      publicKey: generatedKeys.publicKey,
    };
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
    this.activeClientTtlMs = Math.max(1, options.activeClientTtlMs ?? ACTIVE_CLIENT_TTL_MS);
    this.grantLimit = Math.max(1, options.grantLimit ?? 1_000);
    this.sessionLimit = Math.max(1, options.sessionLimit ?? 1_000);
    this.routeEvidence = options.routeEvidence;
    this.pendingAuthorizations = new PendingAuthorizations({
      globalLimit: Math.max(1, options.transactionLimit ?? 1_000),
      now: this.now,
      perClientLimit: Math.max(1, options.transactionLimitPerClient ?? 5),
      ttlMs: GRANT_TTL_MS,
    });
  }

  async response(request: Request): Promise<Response | undefined> {
    const url = new URL(request.url);
    const evidenceRequest = this.routeEvidence === undefined ? undefined : request.clone();
    let response: Response | undefined;
    if (url.pathname === new URL(`${this.issuer}/register`).pathname && request.method === 'POST') {
      response = await this.register(request);
    } else if (
      url.pathname === new URL(`${this.issuer}/authorize`).pathname &&
      request.method === 'GET'
    ) {
      response = await this.authorize(request, url);
    } else if (url.pathname === new URL(this.callbackUrl).pathname && request.method === 'GET') {
      response = await this.callback(request, url);
    } else if (
      url.pathname === new URL(`${this.issuer}/token`).pathname &&
      request.method === 'POST'
    ) {
      response = await this.token(request);
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

  async verify(token: string): Promise<JwtClaims> {
    try {
      return await this.verifyLocal(token);
    } catch {
      return await this.verifyUpstream(token);
    }
  }

  async callerSessionFor(
    token: string,
  ): Promise<{ readonly upstreamToken: string; readonly mcpSessionId: string | null }> {
    try {
      const payload = await this.verifyLocal(token);
      const family = this.sessionOf(payload);
      const sessionId = payload['jti'];
      if (typeof sessionId !== 'string') throw new Error('verified MCP token has no session id');
      const current = await this.refreshUpstreamIfNeeded(family);
      return { upstreamToken: current.upstreamAccessToken, mcpSessionId: sessionId };
    } catch {
      await this.verifyUpstream(token);
      return { upstreamToken: token, mcpSessionId: null };
    }
  }

  async upstreamTokenFor(token: string): Promise<string> {
    return (await this.callerSessionFor(token)).upstreamToken;
  }

  async refreshSession(mcpSessionId: string): Promise<string> {
    const family = this.store.familyForSession(mcpSessionId, this.now());
    if (family === null) throw new Error('MCP OAuth session is missing, expired, or revoked');
    return (await this.refreshUpstreamIfNeeded(family, true)).upstreamAccessToken;
  }

  endSession(mcpSessionId: string): void {
    this.store.revokeSessionFamily(mcpSessionId, this.now());
  }

  private async verifyLocal(token: string): Promise<JwtClaims> {
    const payload = await this.verifySignature(token);
    this.sessionOf(payload);
    if (typeof payload.sub !== 'string' || payload.sub === '') {
      throw new Error('verified MCP token has no subject');
    }
    return { ...payload, sub: payload.sub };
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

  private async register(request: Request): Promise<Response> {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return oauthError('invalid_client_metadata');
    }
    if (!isObject(body) || body['token_endpoint_auth_method'] !== 'none') {
      return oauthError('invalid_client_metadata');
    }
    const redirectUris = body['redirect_uris'];
    if (
      !Array.isArray(redirectUris) ||
      redirectUris.length === 0 ||
      redirectUris.length > MAX_REDIRECT_URIS ||
      redirectUris.some(
        (value) => typeof value !== 'string' || bytes(value) > MAX_REDIRECT_URI_BYTES,
      ) ||
      !redirectUris.every(isRedirect)
    ) {
      return oauthError('invalid_redirect_uri');
    }
    this.cleanup();
    const source = sourceOf(request);
    const sourceClients = [...this.clients.values()].filter(
      (client) => client.source === source && !client.proven && !client.promotionReserved,
    );
    const provenSourceClients = [...this.clients.values()].filter(
      (client) => client.source === source && (client.proven || client.promotionReserved),
    );
    if (
      this.clients.size >= this.clientLimit ||
      sourceClients.length >= this.clientSourceLimit ||
      provenSourceClients.length >= this.provenClientSourceLimit
    ) {
      return oauthError('temporarily_unavailable', undefined, 429);
    }
    const issuedAt = this.now();
    const expiresAt = issuedAt + this.clientTtlMs;
    const clientId = this.random();
    this.clients.set(clientId, {
      proven: false,
      promotionReserved: false,
      redirectUris,
      source,
      expiresAt,
      unprovenExpiresAt: issuedAt + this.clientTtlMs * 2,
    });
    return Response.json(
      {
        client_id: clientId,
        client_id_expires_at: Math.floor(expiresAt / 1000),
        client_id_issued_at: Math.floor(issuedAt / 1000),
        grant_types: ['authorization_code', 'refresh_token'],
        redirect_uris: redirectUris,
        token_endpoint_auth_method: 'none',
      },
      { status: 201 },
    );
  }

  private async authorize(request: Request, url: URL): Promise<Response> {
    const params = url.searchParams;
    const clientId = params.get('client_id') ?? '';
    const redirectUri = params.get('redirect_uri') ?? '';
    const challenge = params.get('code_challenge') ?? '';
    this.cleanup();
    const client = this.clients.get(clientId);
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
      scopes.some((value) => !SCOPES.has(value)) ||
      !client?.redirectUris.includes(redirectUri)
    ) {
      return oauthError('invalid_request');
    }

    if (!client.proven && this.now() + GRANT_TTL_MS * 2 > client.unprovenExpiresAt) {
      return oauthError('temporarily_unavailable', undefined, 429);
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
      return oauthError('temporarily_unavailable', undefined, 429);
    }
    const activeFlowExpiry = Math.max(client.expiresAt, this.now() + GRANT_TTL_MS * 2);
    client.expiresAt = client.proven
      ? activeFlowExpiry
      : Math.min(activeFlowExpiry, client.unprovenExpiresAt);
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
    if (binding === undefined) return oauthError('invalid_request', clearCookie());
    const pending = this.pendingAuthorizations.consume(binding, state ?? '');
    if (pending.outcome === 'state_mismatch') return oauthError('invalid_request');
    if (pending.outcome === 'missing' || pending.outcome === 'expired') {
      return oauthError('invalid_request', clearCookie());
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
    this.cleanup();
    if (this.grants.size >= this.grantLimit) {
      await this.revokeRefreshToken(tokens.refreshToken);
      return oauthError('temporarily_unavailable', clearCookie(), 429);
    }
    const code = this.random();
    this.grants.set(code, {
      clientId: pending.authorization.clientId,
      codeChallenge: pending.authorization.codeChallenge,
      expiresAt: this.now() + GRANT_TTL_MS,
      redirectUri: pending.authorization.redirectUri,
      scope: scopes.join(' '),
      scopes,
      subject: identity.subject,
      upstreamAccessToken: tokens.accessToken,
      upstreamRefreshToken: tokens.refreshToken,
      upstreamExpiresAt,
    });
    const target = new URL(pending.authorization.redirectUri);
    target.searchParams.set('code', code);
    if (pending.authorization.state !== undefined) {
      target.searchParams.set('state', pending.authorization.state);
    }
    return redirect(target.href, clearCookie());
  }

  private async failLogin(
    authorization: AuthorizationContext,
    error: CallbackError,
    refreshToken?: string,
  ): Promise<Response> {
    await this.revokeRefreshToken(refreshToken);
    const target = new URL(authorization.redirectUri);
    target.searchParams.set('error', error);
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

  private async token(request: Request): Promise<Response> {
    const form = await request.formData();
    if (form.get('grant_type') === 'refresh_token') return await this.refreshGrant(form);

    const code = stringField(form, 'code');
    this.cleanup();
    const grant = code === undefined ? undefined : this.grants.get(code);
    const client = grant === undefined ? undefined : this.clients.get(grant.clientId);
    const verifier = stringField(form, 'code_verifier');
    if (
      code === undefined ||
      grant === undefined ||
      client === undefined ||
      grant.expiresAt <= this.now() ||
      form.get('grant_type') !== 'authorization_code' ||
      stringField(form, 'client_id') !== grant.clientId ||
      stringField(form, 'redirect_uri') !== grant.redirectUri ||
      verifier === undefined ||
      !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) ||
      challengeOf(verifier) !== grant.codeChallenge
    ) {
      if (code !== undefined) this.grants.delete(code);
      return oauthError('invalid_grant');
    }

    const now = this.now();
    if (this.store.sessionCount(now) >= this.sessionLimit)
      return oauthError('temporarily_unavailable', undefined, 429);

    let reservedPromotion = false;
    if (!client.proven) {
      const provenSourceClients = [...this.clients.values()].filter(
        (candidate) =>
          candidate.source === client.source && (candidate.proven || candidate.promotionReserved),
      );
      if (client.promotionReserved || provenSourceClients.length >= this.provenClientSourceLimit)
        return oauthError('temporarily_unavailable', undefined, 429);
      client.promotionReserved = true;
      reservedPromotion = true;
    }

    const familyId = this.random();
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
        },
        jti,
        expiresAt,
        refreshToken,
      );
      const token = await this.issueAccessToken(grant.subject, grant.scope, jti, expiresAt);
      client.proven = true;
      client.promotionReserved = false;
      client.expiresAt = now + this.activeClientTtlMs;
      return tokenResponse(token, refreshToken, grant.scope, expiresAt - now);
    } catch (error) {
      this.store.revokeFamily(familyId, now);
      this.grants.set(code, grant);
      if (reservedPromotion) client.promotionReserved = false;
      throw error;
    }
  }

  private async refreshGrant(form: FormData): Promise<Response> {
    const refreshToken = stringField(form, 'refresh_token');
    const clientId = stringField(form, 'client_id');
    if (refreshToken === undefined || clientId === undefined) return oauthError('invalid_grant');
    const now = this.now();
    if (this.store.sessionCount(now) >= this.sessionLimit)
      return oauthError('temporarily_unavailable', undefined, 429);
    const expiresAt = now + this.accessTtlMs;
    let prepared: ReturnType<McpSessionStore['prepareRefresh']>;
    try {
      prepared = this.store.prepareRefresh(refreshToken, clientId, now);
    } catch {
      return oauthError('invalid_grant');
    }
    if (prepared.outcome !== 'ok') return oauthError('invalid_grant');
    const boundedExpiresAt = Math.min(expiresAt, prepared.family.absoluteExpiresAt);
    if (boundedExpiresAt <= now) return oauthError('invalid_grant');
    const successor = this.random();
    const jti = this.random();
    try {
      const family = await this.refreshUpstreamIfNeeded(prepared.family);
      const token = await this.issueAccessToken(family.subject, family.scope, jti, boundedExpiresAt);
      const consumed = this.store.consumeRefresh(
        refreshToken,
        clientId,
        successor,
        jti,
        boundedExpiresAt,
        now + REFRESH_IDLE_MS,
        now,
      );
      if (consumed.outcome !== 'ok') return oauthError('invalid_grant');
      return tokenResponse(token, successor, family.scope, boundedExpiresAt - now);
    } catch (cause) {
      return cause instanceof UpstreamRefreshRefused
        ? oauthError('invalid_grant')
        : oauthError('temporarily_unavailable', undefined, 503);
    }
  }

  private async issueAccessToken(
    subject: string,
    scope: string,
    jti: string,
    expiresAt: number,
  ): Promise<string> {
    return await new SignJWT({
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

  private async refreshUpstreamIfNeeded(
    family: FamilyRecord,
    force = false,
  ): Promise<FamilyRecord> {
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
      throw new Error('upstream access cannot be refreshed; the MCP family was revoked');
    }
    const owner = this.random();
    const leased = this.store.acquireRefreshLease(
      family.familyId,
      family.version,
      owner,
      now,
      now + 5_000,
    );
    if (leased !== null) {
      let tokens: BrowserOidcTokenSet;
      let upstreamExpiresAt: number;
      try {
        tokens = await this.upstream.refresh(
          leased.upstreamRefreshToken ?? family.upstreamRefreshToken,
        );
        const upstreamClaims = await this.verifyUpstream(tokens.accessToken);
        upstreamExpiresAt = upstreamExpiryOf(tokens, upstreamClaims, this.now());
      } catch (cause) {
        if (classifyOidcFailure(cause).kind === 'refused') {
          this.store.revokeFamily(family.familyId, this.now());
          throw new UpstreamRefreshRefused(
            'upstream refresh was refused; the MCP family was revoked',
            { cause },
          );
        }
        throw new Error('upstream refresh could not be completed', { cause });
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
        throw new Error('upstream refresh lease was lost');
      const current = this.store.family(family.familyId);
      if (current === null) throw new Error('upstream refresh family disappeared');
      return current;
    }
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      await Bun.sleep(25);
      const current = this.store.family(family.familyId);
      if (current === null) throw new Error('MCP refresh family disappeared');
      if (current.revokedAt !== null) throw new Error('MCP refresh family was revoked');
      if (current.version > family.version && current.leaseOwner === null) return current;
    }
    throw new Error('timed out waiting for the upstream refresh lease');
  }

  private async revoke(request: Request): Promise<Response> {
    const token = stringField(await request.formData(), 'token');
    if (token !== undefined) {
      try {
        const payload = await this.verifySignature(token);
        if (typeof payload.jti === 'string') this.store.endSession(payload.jti);
      } catch {
        // RFC 7009 does not reveal whether the presented token was valid.
      }
    }
    return new Response(null, { status: 200 });
  }

  private async verifySignature(token: string): Promise<JWTPayload> {
    const kid = decodeProtectedHeader(token).kid;
    const key =
      kid === this.keyId
        ? this.publicKey
        : kid === this.previousKeyId
          ? this.previousPublicKey
          : undefined;
    if (key === undefined) throw new Error('MCP token uses an unknown signing key');
    const result = await jwtVerify(token, key, {
      algorithms: ['RS256'],
      audience: this.audience,
      currentDate: new Date(this.now()),
      issuer: this.issuer,
    });
    return result.payload;
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

  private cleanup(): void {
    const now = this.now();
    this.pendingAuthorizations.cleanupExpired();
    for (const [clientId, client] of this.clients) {
      if (client.expiresAt <= now) this.clients.delete(clientId);
    }
    for (const [code, grant] of this.grants) {
      if (grant.expiresAt <= now) this.grants.delete(code);
    }
    for (const [markerId, expiresAt] of this.reauthMarkers) {
      if (expiresAt <= now) this.reauthMarkers.delete(markerId);
    }
  }
}

export function mcpOAuthFromEnv(
  config: Pick<McpConfig, 'MCP_PUBLIC_URL'>,
  env: Readonly<Record<string, string | undefined>>,
  routeEvidence?: (evidence: OAuthRouteEvidence) => void,
): InMemoryMcpOAuth {
  let client: BrowserOidcClient | undefined;
  const get = () => (client ??= browserOidcClientFromEnv(env, { allowMissingAccessExpiry: true }));
  let upstreamVerifier: TokenVerifier | undefined;
  const verifyUpstream = (token: string) =>
    (upstreamVerifier ??= oidcTokenVerifierFromEnv(env)).verify(token);
  return new InMemoryMcpOAuth(
    config,
    {
      authorizationUrl: (input) => get().authorizationUrl(input),
      exchange: (request, checks) => get().exchange(request, checks),
      refresh: (refreshToken) => get().refresh(refreshToken),
      revoke: (refreshToken) => get().revoke(refreshToken),
    },
    {
      groupsClaim: env['AUTH_GROUPS_CLAIM'] ?? 'wbs_groups',
      groupPrefix: env['NODE_ENV'] === 'production' ? 'prod' : 'dev',
      routeEvidence,
      verifyUpstream,
      ...oauthPersistenceFromEnv(env),
    },
  );
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
  return value === 'authorization_code' || value === 'refresh_token' ? value : 'other';
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

function isRedirect(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    if (url.username !== '' || url.password !== '' || url.hash !== '') return false;
    const isClaudeConnector =
      url.protocol === 'https:' &&
      url.port === '' &&
      (url.hostname === 'claude.ai' || url.hostname === 'claude.com') &&
      url.pathname === '/api/mcp/auth_callback' &&
      url.search === '';
    const isLoopback =
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]');
    return isClaudeConnector || isLoopback;
  } catch {
    return false;
  }
}

function bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function sourceOf(request: Request): string {
  const source = request.headers.get('x-forwarded-for')?.split(',', 1)[0]?.trim();
  return source === undefined || source === '' ? 'unknown' : source;
}

function cookieOf(request: Request, name: string): string | undefined {
  return request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim().split('='))
    .find(([key]) => key === name)?.[1];
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

function oauthError(error: string, setCookie?: string, status = 400): Response {
  return Response.json(
    { error },
    { headers: setCookie === undefined ? undefined : { 'set-cookie': setCookie }, status },
  );
}
