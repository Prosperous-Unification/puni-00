import { randomBytes, randomUUID } from 'node:crypto';

import {
  browserBindingCookieName,
  browserBindingsIn,
  classifyOidcFailure,
  consumeBrowserBinding,
  type HeldBrowserBinding,
  InMemoryOidcLinkStore,
  isOidcCallbackRefused,
  MAX_BROWSER_BINDINGS,
  oidcCredentialEvidence,
  type OidcFailureKind,
  oidcIdentityFromClaims,
  type RefreshRecord,
  selectBrowserBindings,
} from '@wbs/auth';
import type { AuthMethodId, VerifiedOrganizationCredential } from '@wbs/contracts';
import {
  authMethod,
  completeAuth0Link,
  completeOidcLogin,
  listAuthMethods,
  logoutOidcSession,
  refreshOidcSession,
  startAuth0Link,
  startOidcLogin,
} from '@wbs/contracts';
import type {
  EnterpriseConnections,
  EnterpriseRoute,
  ReauthenticationRoute,
  ScimUsers,
} from '@wbs/core';
import type { LoginThrottle } from '@wbs/core/module/authentication/login-throttle';
import type { AuthService } from '@wbs/core/service/auth.service';
import { BrowserLifecycleRefusedError, canonicalOidcEmail } from '@wbs/store-sqlite';
import { decodeJwt, errors } from 'jose';

import {
  bind,
  EMPTY,
  type Header,
  type HttpReply,
  type RequestFailure,
  type RequestMetadata,
} from '../http/endpoint';
import { cookiesIn, cookieValue } from '../middleware/authenticated';
import { clientIpOf } from './auth-password-endpoints';
import {
  accessOf,
  type BrowserPredecessor,
  type BrowserSessionAuthority,
  correlationOf,
  credentialDigest,
  invalidBrowserCarriers,
  proveBrowserPredecessor,
  retireBrowserPredecessor,
} from './browser-session';
import type { OidcRouteOptions } from './oidc-options';
import { reauthenticatedAtOf, type ReplacedCredential } from './reauthentication-time';

const reportable = new Set([
  'access_denied',
  'account_selection_required',
  'consent_required',
  'interaction_required',
  'login_required',
  'temporarily_unavailable',
]);
/** Parameters from response modes this code-flow client never requests. */
const OTHER_RESPONSE_MODE_PARAMS = ['response', 'id_token', 'token'] as const;
/** The caller-visible status for every owned exchange-failure classification. */
const STATUS_FOR_OIDC_FAILURE: Record<OidcFailureKind, 401 | 500 | 503> = {
  defect: 500,
  indeterminate: 503,
  refused: 401,
  unavailable: 503,
};
/** Serializes one independently appended hardened browser cookie.
 * Proof: removing Secure failed the mounted recovery test’s exact three-cookie assertion. */
function cookie(name: string, value: string, maxAge: number): Header {
  return [
    'set-cookie',
    `${name}=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${String(maxAge)}`,
  ];
}
/** Five minutes, matching the transaction store configured by {@link oidcRouteOptionsFromEnv}. */
const OIDC_BINDING_TTL_SECONDS = 300;
const bindingCookie = (binding: string): Header =>
  cookie(browserBindingCookieName(binding), binding, OIDC_BINDING_TTL_SECONDS);
const clearBinding = (name: string): Header => cookie(name, '', 0);
const clearsFor = (held: readonly HeldBrowserBinding[]): Header[] =>
  held.map(({ cookieName }) => clearBinding(cookieName));
const browserBindingsOf = (request: RequestMetadata): HeldBrowserBinding[] =>
  browserBindingsIn(cookiesIn(request.headers.get('cookie') ?? undefined));
const clearSession = (): Header[] => [
  cookie('__Host-wbs_access', '', 0),
  cookie('__Host-wbs_session', '', 0),
  cookie('__Host-wbs_organization', '', 0),
];
type BoundRefreshRecord = RefreshRecord & {
  readonly userId: string;
  readonly generation: number;
  readonly credential: VerifiedOrganizationCredential;
};
function isBoundRefreshRecord(record: RefreshRecord): record is BoundRefreshRecord {
  return (
    typeof record.userId === 'string' &&
    record.userId.length > 0 &&
    Number.isSafeInteger(record.generation) &&
    (record.generation ?? 0) > 0 &&
    record.credential?.kind === 'oidc' &&
    record.credential.userId === record.userId &&
    /^[0-9a-f]{64}$/.test(record.credential.digest) &&
    Number.isSafeInteger(record.credential.expiresAt)
  );
}

/** One logout decision for native-only and OIDC browser compositions. */
async function logoutBrowser(
  request: RequestMetadata,
  appOrigin: string,
  now: () => number,
  browserSession?: BrowserSessionAuthority,
  options?: OidcRouteOptions,
): Promise<HttpReply<typeof logoutOidcSession>> {
  if (browserSession !== undefined) {
    if (request.headers.get('origin') !== appOrigin)
      return { ok: false, status: 403, body: { error: 'invalid_origin' } };
    // Proof: malformed or duplicated access/correlation carriers and a
    // delegated Authorization bearer must fail before shared mutation.
    if (invalidBrowserCarriers(request) || request.headers.has('x-wbs-token'))
      return { ok: false, status: 401, body: { error: 'unauthenticated' } };
    const correlation = correlationOf(request);
    const cookieAccess = accessOf(request);
    const authorization = request.headers.get('authorization');
    // Proof: the real native JSON-token login could not sign out through the
    // common route until its sole Bearer carrier was admitted (401 vs 204).
    // Proof: removing the cookie-carrier refusal made the mounted mixed
    // native logout return 204 instead of 401 (0/1, 2026-10-01).
    // Proof: treating every Cookie header as an access carrier made verified
    // native Bearer logout with only organization/UI cookies return 401
    // instead of 204 (0/1, 2026-10-01).
    // A simultaneous access or correlation cookie is ambiguous proof.
    if (
      authorization !== null &&
      (cookieAccess !== null ||
        correlation !== null ||
        !/^Bearer [A-Za-z0-9._~-]+$/.test(authorization))
    )
      return { ok: false, status: 401, body: { error: 'unauthenticated' } };
    const presented = authorization === null ? cookieAccess : authorization.slice(7);
    if (presented === null) return { ok: false, status: 401, body: { error: 'unauthenticated' } };
    if (correlation !== null) {
      if (
        options === undefined ||
        browserSession.lifecycle === undefined ||
        browserSession.tokens === undefined ||
        browserSession.revokeProvider === undefined
      )
        return { ok: false, status: 401, body: { error: 'unauthenticated' } };
      // A native credential paired with an OIDC correlation is not a second
      // possible proof path. It is a conflicting browser identity.
      if ((await browserSession.verifyNativeBrowserCredential(presented)) !== null)
        return { ok: false, status: 401, body: { error: 'unauthenticated' } };
      try {
        // Proof: omitting historical association closure let a predecessor
        // logout leave the refreshed successor unrevoked (0/1, 2026-10-01).
        const outcome = await browserSession.lifecycle.close(
          correlation,
          { kind: 'oidc', digest: credentialDigest(presented) },
          now(),
        );
        const record = browserSession.tokens.read(correlation);
        // Proof: upstream revoke failure after local deletion left durable
        // closure intact and a proved retry acknowledged 204.
        browserSession.tokens.delete(correlation);
        if (outcome === 'closed' && record !== null)
          await browserSession.revokeProvider(record.refreshToken);
        return { ok: true, status: 204, body: EMPTY, headers: clearSession() };
      } catch (cause) {
        if (cause instanceof BrowserLifecycleRefusedError)
          return { ok: false, status: 401, body: { error: 'unauthenticated' } };
        throw cause;
      }
    }
    const native = await browserSession.verifyNativeBrowserCredential(presented);
    if (native === null) return { ok: false, status: 401, body: { error: 'unauthenticated' } };
    // Proof: native-only mounted logout was 404 without this common route;
    // its exact B1 row is the acknowledgement point, not a user-wide flag.
    // Proof: skipping B1 revoke made mounted native logout answer 204 with
    // no revocation row, and the unreadable-table negative answer 204 instead
    // of 500 (both 0/1, 2026-10-01).
    await browserSession.revocations.revoke(native, now());
    return { ok: true, status: 204, body: EMPTY, headers: clearSession() };
  }
  if (options === undefined) throw new Error('browser logout has no configured authority');
  const correlation = correlationOf(request);
  const record = correlation === null ? null : options.tokens.read(correlation);
  // Proof: revoking before deletion left stored material in the legacy mounted failure test.
  if (correlation !== null) options.tokens.delete(correlation);
  if (record !== null) await options.client.revoke(record.refreshToken);
  return { ok: true, status: 204, body: EMPTY, headers: clearSession() };
}

/**
 * What a requested sign-in method means for the provider request: no method
 * (the provider's chooser), an enabled method's connection, or a method this
 * deployment does not enable, which callers refuse before saving any state.
 */
type MethodChoice =
  | { readonly kind: 'chooser' }
  | { readonly kind: 'connection'; readonly connection: string }
  | { readonly kind: 'disabled' };

function methodChoice(
  enabled: readonly AuthMethodId[],
  requested: AuthMethodId | undefined,
): MethodChoice {
  if (requested === undefined) return { kind: 'chooser' };
  return enabled.includes(requested)
    ? { kind: 'connection', connection: authMethod(requested).connection }
    : { kind: 'disabled' };
}

/** The `/authorize` parameters a choice adds. */
const connectionParameter = (choice: MethodChoice) =>
  choice.kind === 'connection' ? { connection: choice.connection } : {};

/** The hints a login may carry; `GET /api/auth/login` admits at most one (D3). */
interface LoginHints {
  readonly method?: AuthMethodId;
  readonly organization?: string;
  readonly email?: string;
  /** The organization whose `reauthentication_required` refusal sent the browser here. */
  readonly reauthenticate?: string;
}

/**
 * Where a login goes: the enabled method's or the routed enterprise
 * connection, the provider's chooser, or a refusal answered before any
 * transaction is saved.
 */
type LoginChoice =
  | { readonly kind: 'chooser' }
  | { readonly kind: 'method'; readonly connection: string }
  | { readonly kind: 'enterprise'; readonly route: EnterpriseRoute }
  | { readonly kind: 'reauthenticate'; readonly route: ReauthenticationRoute }
  | { readonly kind: 'invalid_query' | 'sso_connection_not_found' };

/**
 * Resolves the one login hint (`organization-sso` "Login is routed to the
 * enterprise connection"). A slug routes whatever its claim's status, so a
 * suspension never weakens enforcement; an email routes only through a
 * verified claim, and any other email is the ordinary login.
 */
async function loginChoice(
  hints: LoginHints,
  enabled: readonly AuthMethodId[],
  enterprise: Pick<
    EnterpriseConnections,
    'routeBySlug' | 'routeByDomain' | 'reauthenticationRoute'
  >,
): Promise<LoginChoice> {
  // Proof: leaving `reauthenticate` out of this count made `routes a
  // reauthentication login by organization` admit a second hint; watched 2026-10-12.
  const given = [hints.method, hints.organization, hints.email, hints.reauthenticate].filter(
    (hint) => hint !== undefined,
  );
  // Proof: 2026-10-12, admitting two hints made `refuses two hints, a
  // malformed email or slug, and saves no transaction` in
  // `enterprise-login.controller.db.test.ts` route `organization=acme&method=google`.
  if (given.length > 1) return { kind: 'invalid_query' };
  if (hints.reauthenticate !== undefined) {
    if (hints.reauthenticate.length === 0) return { kind: 'invalid_query' };
    return {
      kind: 'reauthenticate',
      route: await enterprise.reauthenticationRoute(hints.reauthenticate),
    };
  }
  if (hints.organization !== undefined) {
    const route = await enterprise.routeBySlug(hints.organization);
    return route === null ? { kind: 'sso_connection_not_found' } : { kind: 'enterprise', route };
  }
  if (hints.email !== undefined) {
    const email = canonicalOidcEmail(hints.email);
    if (email === null) return { kind: 'invalid_query' };
    const route = await enterprise.routeByDomain(email.slice(email.lastIndexOf('@') + 1));
    return route === null ? { kind: 'chooser' } : { kind: 'enterprise', route };
  }
  const method = methodChoice(enabled, hints.method);
  if (method.kind === 'disabled') return { kind: 'invalid_query' };
  return method.kind === 'connection'
    ? { kind: 'method', connection: method.connection }
    : { kind: 'chooser' };
}

/**
 * The `/authorize` parameters a login choice adds. A routed organization
 * with a session policy also asks for an interactive sign-in, bounded by
 * `max_age` when it sets a reauthentication bound.
 */
function loginParameters(choice: LoginChoice): {
  readonly connection?: string;
  readonly prompt?: 'login';
  readonly maxAge?: number;
} {
  if (choice.kind === 'method') return { connection: choice.connection };
  if (choice.kind === 'reauthenticate') {
    const { auth0Connection, policy } = choice.route;
    // A reauthentication login always prompts, whether or not the
    // organization still has a policy.
    return {
      ...(auth0Connection === null ? {} : { connection: auth0Connection }),
      prompt: 'login',
      ...(policy?.reauthenticateAfterSeconds == null
        ? {}
        : { maxAge: policy.reauthenticateAfterSeconds }),
    };
  }
  if (choice.kind !== 'enterprise') return {};
  const { auth0Connection, policy } = choice.route;
  if (policy === null) return { connection: auth0Connection };
  return {
    connection: auth0Connection,
    prompt: 'login',
    ...(policy.reauthenticateAfterSeconds === null
      ? {}
      : { maxAge: policy.reauthenticateAfterSeconds }),
  };
}

/** The enabled methods as the public list reply. */
function methodList(enabled: readonly AuthMethodId[]) {
  return enabled.map((id) => ({ id, label: authMethod(id).label }));
}

/**
 * Answers the public method list in a composition without a provider: no
 * direct buttons, so fe-01 shows the chooser link alone.
 */
export function nativeAuthMethodEndpoints() {
  return [
    bind(listAuthMethods, () =>
      Promise.resolve({ ok: true, status: 200, body: { methods: [] } } as const),
    ),
  ] as const;
}

/** Mounts the common browser logout even when no OIDC provider is configured. */
export function nativeBrowserLogoutEndpoints(
  appOrigin: string,
  browserSession: BrowserSessionAuthority,
) {
  return [
    bind(logoutOidcSession, async ({ request }) =>
      logoutBrowser(request, appOrigin, Date.now, browserSession),
    ),
  ] as const;
}
/** HEAD must not spend state or mint a session; transport retains its Allow header.
 * Proof: deleting this admission made the mounted HEAD test receive302 instead of405. */
function callbackAdmission(request: RequestMetadata) {
  return request.method === 'GET'
    ? null
    : ({
        ok: false,
        status: 405,
        body: { error: 'method_not_allowed' },
        headers: [['allow', 'GET']],
      } as const);
}
/** The protocol’s singleton query adapter refuses pollution before transaction consumption.
 * Proof: returning invalid_query failed the mounted duplicate_parameter assertion. */
function callbackFailure(
  failure: RequestFailure,
): Extract<HttpReply<typeof completeOidcLogin>, { ok: false }> {
  if (failure.part === 'query' && failure.duplicate !== undefined)
    return { ok: false, status: 400, body: { error: 'duplicate_parameter' } };
  return { ok: false, status: 400, body: { error: failure.code } };
}

/**
 * The link browser binding. It is cleared once a callback consumes it, when
 * it is absent, and on `linked`; a callback that consumed nothing leaves it,
 * so a forged cross-site callback cannot burn an in-flight link.
 */
const LINK_COOKIE = '__Host-wbs_link';
const clearLink = (): Header => cookie(LINK_COOKIE, '', 0);

/**
 * The fixed outcomes a link callback reports to fe-01 as `?auth_link=`.
 * Nothing from the request (state, error, error_description) is echoed.
 */
type LinkOutcome =
  | 'linked'
  | 'refused'
  | 'inactive'
  | 'collision'
  | 'unavailable'
  | 'failed'
  | 'sso_prefix_mismatch'
  | 'sso_connection_taken';
const LINK_OUTCOME_FOR_OIDC_FAILURE: Record<OidcFailureKind, LinkOutcome> = {
  defect: 'failed',
  indeterminate: 'unavailable',
  refused: 'refused',
  unavailable: 'unavailable',
};

/**
 * A 302 to the fixed relative app path carrying `outcome`, clearing the link
 * binding cookie: the answer for every callback from consumption onward.
 *
 * Proof: 2026-09-29, echoing the provider's `error` into the location failed
 * `redirects every failure to the fixed outcome path without echoing the
 * request`; clearing only on `linked` failed `clears the link cookie once a
 * callback consumes or lacks it` and the four consumed-refusal tests
 * (inactive and the three collisions) with no set-cookie.
 */
function linkOutcome(outcome: LinkOutcome) {
  return {
    ok: true,
    status: 302,
    body: EMPTY,
    headers: [clearLink(), ['location', `/?auth_link=${outcome}`]],
  } as const;
}

/**
 * `refused` for a callback that consumed nothing (malformed provider
 * parameters or a state that matches no binding), leaving the binding cookie
 * for the honest callback still to come.
 *
 * Proof: 2026-09-29, answering these with {@link linkOutcome} failed `keeps
 * the link cookie through a forged callback so the honest one still links`
 * (set-cookie cleared the binding).
 */
function unconsumedLinkRefusal() {
  return {
    ok: true,
    status: 302,
    body: EMPTY,
    headers: [['location', '/?auth_link=refused']],
  } as const;
}

/** A non-GET link callback is refused before anything is consumed; the binding stays. */
function linkCallbackAdmission(request: RequestMetadata) {
  return request.method === 'GET'
    ? null
    : ({
        ok: false,
        status: 405,
        body: { error: 'method_not_allowed' },
        headers: [['allow', 'GET']],
      } as const);
}

/** The link callback shares the singleton query rule without consuming proof on pollution. */
function linkCallbackFailure(
  failure: RequestFailure,
): Extract<HttpReply<typeof completeAuth0Link>, { ok: false }> {
  // Proof: 2026-09-28, omitting this classifier made `rejects duplicate callback state without spending the link proof` answer invalid_query instead of duplicate_parameter.
  if (failure.part === 'query' && failure.duplicate !== undefined)
    return { ok: false, status: 400, body: { error: 'duplicate_parameter' } };
  return { ok: false, status: 400, body: { error: failure.code } };
}
/**
 * What the callback knows of the credential its sign-in replaces. An OIDC
 * predecessor's access token was proved associated with its lifecycle by
 * {@link proveBrowserPredecessor}, so its bytes are ones this server verified
 * when it issued them, and reading their `sub` unverified is safe.
 */
function replacedCredentialOf(
  predecessor: BrowserPredecessor | { readonly kind: 'none' },
  request: RequestMetadata,
): ReplacedCredential {
  if (predecessor.kind !== 'oidc') return { kind: predecessor.kind };
  const access = accessOf(request);
  if (access === null) return { kind: 'oidc', subject: null };
  try {
    const { sub } = decodeJwt(access);
    return { kind: 'oidc', subject: typeof sub === 'string' ? sub : null };
  } catch (cause) {
    if (cause instanceof errors.JOSEError) return { kind: 'oidc', subject: null };
    throw cause;
  }
}

/**
 * Browser OIDC bindings. Composition registers these only when OIDC options exist.
 * Exchange failures carry their owned classification; account and token-store failures remain throws.
 */
export function authOidcEndpoints(
  auth: AuthService,
  options: OidcRouteOptions,
  passwordThrottle: LoginThrottle,
  enterprise: Pick<
    EnterpriseConnections,
    'routeBySlug' | 'routeByDomain' | 'reauthenticationRoute' | 'linkThroughConnection'
  >,
  pendingMemberships: Pick<ScimUsers, 'activate'>,
  browserSession?: BrowserSessionAuthority,
) {
  const now = options.now ?? Date.now;
  const random = options.random ?? (() => randomBytes(32).toString('base64url'));
  const verifyEvidence = oidcCredentialEvidence(
    options.verifier,
    { groupPrefix: options.groupPrefix, groupsClaim: options.groupsClaim },
    now,
  );
  const links = new InMemoryOidcLinkStore(now);
  /**
   * Activates the pending membership the authenticating pair completes
   * (`organization-scim` "SCIM Users subset with pending membership"): the
   * pair must carry a proven connection's prefix and its connection-attested
   * email match a pending record, whatever `email_verified` says. The store
   * decides both inside its own transaction.
   *
   * Proof: removing this call from the login callback made `activates a
   * pending membership at the first SSO sign-in, even unverified` in
   * `pending-membership.controller.db.test.ts` find no membership; watched
   * 2026-10-12.
   */
  const activatePending = (
    userId: string,
    identity: { issuer: string; subject: string; email: string | null },
  ) =>
    pendingMemberships.activate(
      userId,
      { issuer: identity.issuer, subject: identity.subject },
      canonicalOidcEmail(identity.email),
      { stamp: { at: now(), by: userId }, actor: userId, auditIds: () => randomUUID() },
    );
  const linkRedirectUri = new URL('/api/auth/link/auth0/callback', options.redirectUri).href;
  return [
    bind(listAuthMethods, () =>
      Promise.resolve({
        ok: true,
        status: 200,
        body: { methods: methodList(options.methods) },
      } as const),
    ),
    bind(startOidcLogin, async ({ query, request }) => {
      const choice = await loginChoice(query, options.methods, enterprise);
      // Proof: 2026-10-11, moving this refusal after `transactions.save` made
      // `refuses a disabled method without saving a transaction` count one save.
      if (choice.kind === 'invalid_query')
        return { ok: false, status: 400, body: { error: 'invalid_query' } };
      if (choice.kind === 'sso_connection_not_found')
        return { ok: false, status: 404, body: { error: 'sso_connection_not_found' } };
      const browserBinding = random();
      const state = random();
      const nonce = random();
      const verifier = random();
      const parameters = loginParameters(choice);
      options.transactions.save({
        browserBinding,
        state,
        nonce,
        verifier,
        ...(parameters.prompt === undefined
          ? {}
          : {
              reauthentication: { prompt: parameters.prompt, maxAge: parameters.maxAge ?? null },
            }),
      });
      const location = await options.client.authorizationUrl({
        nonce,
        state,
        verifier,
        redirectUri: options.redirectUri,
        ...parameters,
      });
      const held = selectBrowserBindings(options.transactions, browserBindingsOf(request), now());
      const evicted = [
        ...held.surplus,
        ...held.offered.slice(0, Math.max(0, held.offered.length - (MAX_BROWSER_BINDINGS - 1))),
      ];
      return {
        ok: true,
        status: 302,
        body: EMPTY,
        // Proof: using the shared old cookie name made `lets the first tab finish a login a
        // second tab started after it` fail at the late callback, Expected302 Received400.
        // Dropping the evictions made `holds three concurrent logins per browser and drops
        // the oldest` retain four bindings after the fourth login.
        headers: [
          bindingCookie(browserBinding),
          ...clearsFor(evicted),
          ['location', location.href],
        ],
      };
    }),
    bind(
      completeOidcLogin,
      async ({ request }): Promise<HttpReply<typeof completeOidcLogin>> => {
        const sent = request.url.searchParams;
        const state = sent.get('state') ?? undefined;
        const held = selectBrowserBindings(options.transactions, browserBindingsOf(request), now());
        let settled = held.surplus;
        // Proof: substituting invalid_query made the mounted absent-binding
        // assertion receive that code instead of invalid_oidc_callback.
        if (held.offered.length === 0 || !state)
          return {
            ok: false,
            status: 400,
            body: EMPTY,
            // Proof: clearing live bindings here made `refuses a stateless callback without
            // discarding the logins in flight` fail at its honest callback, Expected302 Received400.
            headers: clearsFor(settled),
          };
        const predecessor =
          browserSession === undefined
            ? { kind: 'none' as const }
            : await proveBrowserPredecessor(request, browserSession, options.appOrigin);
        if (predecessor === null)
          return { ok: false, status: 401, body: EMPTY, headers: clearsFor(settled) };
        const consumed = consumeBrowserBinding(
          options.transactions,
          held.offered.map(({ binding }) => binding),
          state,
        );
        const remaining = new Set(consumed.remaining);
        settled = [...settled, ...held.offered.filter(({ binding }) => !remaining.has(binding))];
        const transaction = consumed.transaction;
        // Proof: clearing this cookie failed the mounted empty-cookie assertion; spending
        // the retained transaction made its subsequent honest callback receive400 instead of302.
        if (transaction.outcome === 'state_mismatch')
          return {
            ok: false,
            status: 400,
            body: EMPTY,
            // Proof: clearing the mismatched binding made `refuses a forged error callback
            // without burning the login it interrupts` receive a Set-Cookie clear and made
            // its subsequent honest callback fail, Expected302 Received400.
            headers: clearsFor(settled),
          };
        // Proof: returning invalid_oidc_callback made the mounted missing-transaction
        // assertion receive its JSON envelope instead of an empty string.
        if (transaction.outcome !== 'consumed')
          return {
            ok: false,
            status: 400,
            body: EMPTY,
            headers: clearsFor(settled),
          };
        // Proof: bypassing this branch redirected access_denied to / in the mounted provider test.
        if (sent.has('error')) {
          const providerError = sent.get('error') ?? '';
          // Proof: skipping the blank-code refusal returned302 instead of400 in the mounted provider test.
          if (providerError === '') {
            options.logger?.warn({}, 'oidc callback carried an empty error code');
            return {
              ok: false,
              status: 400,
              body: EMPTY,
              headers: clearsFor(settled),
            };
          }
          // Proof: forwarding an unknown error exposed provider_secret instead of provider_error.
          const reason = reportable.has(providerError) ? providerError : 'provider_error';
          // Proof: logging description text exposed PRIVATE in the mounted provider test’s log assertion.
          const reported = {
            error: providerError,
            has_description: sent.has('error_description'),
            auth_error: reason,
          };
          if (reason === 'provider_error')
            options.logger?.warn(reported, 'oidc callback carried an error this app does not name');
          else options.logger?.info(reported, 'oidc callback was refused at the identity provider');
          // Proof: JSON null instead of EMPTY returned500 instead of302 in the mounted recovery test.
          return {
            ok: true,
            status: 302,
            body: EMPTY,
            headers: [...clearsFor(settled), ['location', `/?auth_error=${reason}`]],
          };
        }
        // A matching state is not permission to choose the defect/outage bucket
        // with a callback this code-flow client could never have initiated.
        if ((sent.get('code') ?? '') === '') {
          options.logger?.info({}, 'oidc callback carried no code');
          return {
            ok: false,
            status: 400,
            body: EMPTY,
            headers: clearsFor(settled),
          };
        }
        const impossible = OTHER_RESPONSE_MODE_PARAMS.filter((name) => sent.has(name));
        if (impossible.length > 0) {
          options.logger?.info(
            { oidc_callback_params: impossible },
            'oidc callback carried a parameter from a response mode this app does not use',
          );
          return {
            ok: false,
            status: 400,
            body: EMPTY,
            headers: clearsFor(settled),
          };
        }
        // Proof: using arrived origin forwarded internal HTTP instead of configured HTTPS in the mounted proxy test.
        const callbackUrl = new URL(options.redirectUri);
        callbackUrl.search = request.url.search;
        const providerCallback = new Request(callbackUrl, {
          headers: request.headers,
          method: request.method,
        });
        // Proof: collapsing these arms to 401 made the mounted outage test receive 401 instead of 503.
        let tokens;
        try {
          tokens = await options.client.exchange(providerCallback, {
            nonce: transaction.nonce,
            state,
            verifier: transaction.verifier,
          });
        } catch (err) {
          if (isOidcCallbackRefused(err)) {
            options.logger?.info(
              { oidc_callback_refusal: err.reason },
              'oidc callback did not come from the configured issuer',
            );
            return {
              ok: false,
              status: 400,
              body: EMPTY,
              headers: clearsFor(settled),
            };
          }
          const failure = classifyOidcFailure(err);
          const classified = {
            err,
            oidc_failure_kind: failure.kind,
            oidc_failure_reason: failure.reason,
          };
          if (failure.kind === 'refused') {
            options.logger?.info(classified, 'oidc token exchange was refused');
          } else if (failure.kind === 'indeterminate') {
            options.logger?.warn(classified, 'oidc token exchange failed inconclusively');
          } else {
            options.logger?.error(classified, 'oidc token exchange failed');
          }
          return {
            ok: false,
            status: STATUS_FOR_OIDC_FAILURE[failure.kind],
            body: EMPTY,
            headers: clearsFor(settled),
          };
        }
        if (tokens.idTokenClaims === undefined)
          return {
            ok: false,
            status: 401,
            body: EMPTY,
            headers: clearsFor(settled),
          };
        let identity;
        try {
          identity = oidcIdentityFromClaims(tokens.idTokenClaims, {
            groupPrefix: options.groupPrefix,
            groupsClaim: options.groupsClaim,
          });
        } catch {
          return {
            ok: false,
            status: 401,
            body: EMPTY,
            headers: clearsFor(settled),
          };
        }
        const accessEvidence =
          options.browserLifecycle === undefined ? null : await verifyEvidence(tokens.accessToken);
        if (
          options.browserLifecycle !== undefined &&
          (accessEvidence?.identity.issuer !== identity.issuer ||
            accessEvidence.identity.subject !== identity.subject)
        )
          return { ok: false, status: 401, body: EMPTY, headers: clearsFor(settled) };
        // Proof: catching account-store failure as null returned409 (now the account_exists 302) instead of500 in the mounted failure test.
        const account = await auth.resolveOidcIdentity(identity);
        // A verified email another account holds: a rendered refusal naming no
        // provider or method; nothing was written and no session is issued.
        if (account === null)
          return {
            ok: true,
            status: 302,
            body: EMPTY,
            headers: [...clearsFor(settled), ['location', '/?auth_error=account_exists']],
          };
        // A pending SCIM membership this sign-in completes, before the session
        // exists, so the first organization list already shows it.
        await activatePending(account.id, identity);
        // Proof: without this retirement, a mounted native predecessor still
        // had no B1 row after OIDC callback issued replacement cookies (0/1).
        if (browserSession !== undefined)
          await retireBrowserPredecessor(predecessor, browserSession, now());
        const correlation = random();
        if (options.browserLifecycle !== undefined && accessEvidence !== null) {
          const callbackAt = now();
          // Proof: opening the lifecycle with a null reauthentication time made
          // `records when a prompted sign-in reauthenticated` in
          // `oidc-identity.controller.db.test.ts` store null; watched 2026-10-12.
          await options.browserLifecycle.open(
            correlation,
            {
              kind: 'oidc',
              userId: account.id,
              digest: accessEvidence.digest,
              expiresAt: accessEvidence.expiresAt,
            },
            {
              openedAt: callbackAt,
              reauthenticatedAt: reauthenticatedAtOf({
                requested: transaction.reauthentication,
                authTime: tokens.idTokenClaims['auth_time'],
                replaced: replacedCredentialOf(predecessor, request),
                subject: identity.subject,
                callbackAt,
              }),
            },
          );
        }
        if (tokens.refreshToken !== undefined)
          options.tokens.save({
            expiresAt: now() + 30 * 86400000,
            refreshToken: tokens.refreshToken,
            sessionCorrelation: correlation,
            ...(accessEvidence === null
              ? {}
              : {
                  userId: account.id,
                  generation: 1,
                  credential: {
                    kind: 'oidc' as const,
                    userId: account.id,
                    digest: accessEvidence.digest,
                    expiresAt: accessEvidence.expiresAt,
                  },
                }),
          });
        // Proof: JSON null instead of EMPTY returned500 instead of302 in the mounted recovery test.
        return {
          ok: true,
          status: 302,
          body: EMPTY,
          headers: [
            ...clearsFor(settled),
            cookie('__Host-wbs_access', tokens.accessToken, tokens.expiresIn),
            cookie('__Host-wbs_session', correlation, 30 * 86400),
            ...(browserSession === undefined ? [] : [cookie('__Host-wbs_organization', '', 0)]),
            ['location', '/'],
          ],
        };
      },
      { prevalidate: callbackAdmission, classifyRequestFailure: callbackFailure },
    ),
    bind(refreshOidcSession, async ({ request }): Promise<HttpReply<typeof refreshOidcSession>> => {
      if (options.browserLifecycle !== undefined) {
        if (request.headers.get('origin') !== options.appOrigin)
          return { ok: false, status: 403, body: { error: 'invalid_origin' } };
        // Proof: without this admission, a mounted delegated Authorization
        // bearer plus browser correlation reached the provider and returned 204.
        if (request.headers.has('authorization'))
          return { ok: false, status: 401, body: { error: 'invalid_oidc_session' } };
        if (invalidBrowserCarriers(request))
          return {
            ok: false,
            status: 401,
            body: { error: 'invalid_oidc_session' },
            headers: clearSession(),
          };
      }
      const correlation = correlationOf(request);
      const current = correlation === null ? null : options.tokens.read(correlation);
      if (correlation === null || current === null)
        return {
          ok: false,
          status: 401,
          body: { error: 'invalid_oidc_session' },
          headers: clearSession(),
        };
      if (options.browserLifecycle !== undefined) {
        const refused = (): HttpReply<typeof refreshOidcSession> => ({
          ok: false,
          status: 401,
          body: { error: 'invalid_oidc_session' },
          headers: clearSession(),
        });
        // Proof: accepting an unbound process-local record would let a stale
        // server skip the durable generation/user/tuple join before provider IO.
        if (!isBoundRefreshRecord(current)) return refused();
        const attempt = options.tokens.claimIfCurrent(correlation, current);
        // Proof: a contender after the owner's durable CAS was previously
        // classified stale before seeing the in-flight local owner, and its
        // 401 Set-Cookie could clear the browser's pending winner.
        if (attempt === 'busy')
          return { ok: false, status: 409, body: { error: 'refresh_in_progress' } };
        if (attempt === null) return refused();
        try {
          let captured;
          try {
            captured = await options.browserLifecycle.generation(correlation);
            // Proof: bypassing the captured local/durable generation and tuple
            // join made a stale process refresh return 204 instead of 401
            // before provider IO (0/1, 2026-10-01).
            if (
              captured.generation !== current.generation ||
              captured.current.kind !== current.credential.kind ||
              captured.current.userId !== current.userId ||
              captured.current.digest !== current.credential.digest ||
              captured.current.expiresAt !== current.credential.expiresAt
            )
              return refused();
            const presented = accessOf(request);
            // Proof: re-verifying the presented access JWT for current expiry
            // made an exact previously verified but expired token refuse refresh
            // (401 instead of 204; 0/1, 2026-10-01). It is only a digest here.
            // Proof: disabling this check made a same-user token from another
            // lifecycle refresh the captured session (204 instead of 401;
            // 0/1, 2026-10-01).
            if (presented !== null)
              await options.browserLifecycle.proveAssociation(correlation, {
                kind: 'oidc',
                digest: credentialDigest(presented),
              });
          } catch (cause) {
            if (cause instanceof BrowserLifecycleRefusedError) return refused();
            throw cause;
          }
          let spent = false;
          try {
            // A provider-call failure has unknown spend status. Once it returns,
            // only an explicitly rotated secret is treated as spent on later faults.
            spent = true;
            const next = await options.client.refresh(current.refreshToken);
            const refreshToken = next.refreshToken ?? current.refreshToken;
            spent = refreshToken !== current.refreshToken;
            // Proof: falling back from missing verified exp to identity claims and
            // an invented TTL made mounted malformed-evidence refresh return 204
            // instead of 401 (0/1, 2026-10-01).
            const evidence = await verifyEvidence(next.accessToken);
            if (evidence === null) {
              if (spent) attempt.delete();
              return refused();
            }
            // Proof: replacing this with resolveOidcIdentity made the mounted
            // unknown-subject/same-email negative link the password account.
            const account = await auth.readExistingOidcIdentity(evidence.identity);
            // Proof: removing this comparison called lifecycle.replace for the
            // wrong local user before refusing.
            if (account?.id !== current.userId) {
              if (spent) attempt.delete();
              return refused();
            }
            const successor: VerifiedOrganizationCredential = {
              kind: 'oidc',
              userId: account.id,
              digest: evidence.digest,
              expiresAt: evidence.expiresAt,
            };
            let nextGeneration: number;
            try {
              nextGeneration = await options.browserLifecycle.replace(
                correlation,
                captured.generation,
                captured.current,
                successor,
                now(),
              );
            } catch (cause) {
              if (cause instanceof BrowserLifecycleRefusedError) {
                attempt.delete();
                return refused();
              }
              throw cause;
            }
            // Proof: replacing without owner identity let a delayed completion
            // recreate local material after logout or overwrite a new record.
            if (
              !attempt.replace({
                expiresAt: now() + 30 * 86400000,
                refreshToken,
                userId: account.id,
                generation: nextGeneration,
                credential: successor,
              })
            )
              return refused();
            return {
              ok: true,
              status: 204,
              body: EMPTY,
              headers: [
                cookie('__Host-wbs_access', next.accessToken, next.expiresIn),
                cookie('__Host-wbs_organization', '', 0),
              ],
            };
          } catch (cause) {
            // Proof: rotated evidence verification and read-only mapping faults
            // left a replayable old secret until the owner removed it.
            if (spent) {
              try {
                attempt.delete();
              } catch (cleanupCause) {
                // Both faults matter: the provider's original failure explains
                // why local material must be invalidated, and cleanup failed.
                throw new AggregateError(
                  [cause, cleanupCause],
                  'refresh failed and local cleanup failed',
                  { cause: cleanupCause },
                );
              }
            }
            throw cause;
          }
        } finally {
          attempt.release();
        }
      }
      const next = await options.client.refresh(current.refreshToken);
      const refreshToken = next.refreshToken ?? current.refreshToken;
      const expiresAt = now() + 30 * 86400000;
      const rotated =
        refreshToken === current.refreshToken
          ? (options.tokens.save({ expiresAt, refreshToken, sessionCorrelation: correlation }),
            'rotated')
          : options.tokens.rotate({
              expiresAt,
              previousRefreshToken: current.refreshToken,
              refreshToken,
              sessionCorrelation: correlation,
            });
      // Proof: bypassing failed rotation returned204 instead of401 in the mounted refresh test.
      if (rotated !== 'rotated')
        return {
          ok: false,
          status: 401,
          body: { error: 'invalid_oidc_session' },
          headers: clearSession(),
        };
      return {
        ok: true,
        status: 204,
        body: EMPTY,
        headers: [cookie('__Host-wbs_access', next.accessToken, next.expiresIn)],
      };
    }),
    bind(logoutOidcSession, async ({ request }) =>
      logoutBrowser(request, options.appOrigin, now, browserSession, options),
    ),
    bind(startAuth0Link, async ({ body, request }) => {
      // Proof: 2026-09-28, skipping this marker check made `refuses link start before activation` answer an Auth0 location.
      if (!(await auth.isLinkActive()))
        return { ok: false, status: 403, body: { error: 'onboarding_inactive' } };
      const session = cookieValue(request.headers.get('cookie') ?? undefined, '__Host-wbs_access');
      // A password session proves itself with its own signature; an OIDC
      // session is re-verified and resolved through existing mappings only.
      // Proof: 2026-10-11, dropping `sessionUser`'s refusal of an unverified
      // OIDC token made `refuses a link start whose OIDC token no longer
      // verifies` answer 500 instead of 401.
      const current = await auth.sessionUser(session);
      // Proof: 2026-09-28, removing this refusal made `refuses a link start without a password session before throttle admission` receive 500 instead of 401.
      if (current === null || session === null)
        return { ok: false, status: 401, body: { error: 'invalid_credentials' } };
      const choice = methodChoice(options.methods, body.method);
      // A disabled method, or a method beside a slug, is refused before any
      // binding or provider address exists.
      if (
        choice.kind === 'disabled' ||
        (body.method !== undefined && body.organization !== undefined)
      )
        return { ok: false, status: 400, body: { error: 'invalid_body' } };
      const routed =
        body.organization === undefined ? null : await enterprise.routeBySlug(body.organization);
      if (body.organization !== undefined && routed === null)
        return { ok: false, status: 404, body: { error: 'sso_connection_not_found' } };
      let user;
      if (current.kind === 'oidc') {
        // No password exists to prove; one sent anyway is a confused client.
        // Proof: 2026-10-11, accepting it made `refuses a password sent with
        // an OIDC session` start a link (200) instead of 400.
        if (body.password !== undefined)
          return { ok: false, status: 400, body: { error: 'invalid_body' } };
        user = current.user;
      } else {
        const password = body.password;
        if (password === undefined)
          return { ok: false, status: 401, body: { error: 'invalid_credentials' } };
        const account = current.user;
        const throttleIp = clientIpOf(request.headers);
        // This route exists only behind OIDC, so a missing edge IP is refused as
        // login refuses it rather than pooled into one shared throttle bucket.
        // Proof: 2026-09-28, defaulting to 'local-direct' again made `refuses a link start without an edge client address before throttle admission` start the link (then a 302, now a 200) instead of 400.
        if (throttleIp === null)
          return { ok: false, status: 400, body: { error: 'invalid_client' } };
        // Proof: 2026-09-28, bypassing reserve made `admits at most five held fresh-password verifications and releases capacity` observe six verifiers.
        const release = passwordThrottle.reserve(account.username, throttleIp);
        // Proof: 2026-09-28, removing the exhausted-capacity refusal made `admits at most five held fresh-password verifications and releases capacity` observe six verifiers.
        if (release === null)
          return { ok: false, status: 429, body: { error: 'invalid_credentials' } };
        try {
          user = await auth.provePasswordSession(session, password);
          if (user === null) passwordThrottle.recordFailure(account.username, throttleIp);
          else passwordThrottle.recordSuccess(account.username);
        } finally {
          // Proof: 2026-09-28, omitting release made `admits at most five held fresh-password verifications and releases capacity` and `releases fresh-password admission after verifier errors` receive 429 for the next start instead of 302.
          release();
        }
        // Proof: 2026-09-28, accepting an unmatched password made `refuses a wrong fresh password` redirect to Auth0.
        if (user === null)
          return { ok: false, status: 401, body: { error: 'invalid_credentials' } };
      }
      const binding = random();
      const state = random();
      const nonce = random();
      const verifier = random();
      links.save(binding, {
        userId: user.id,
        session,
        state,
        nonce,
        verifier,
        ...(routed === null ? {} : { connectionId: routed.connectionId }),
      });
      const location = await options.client.authorizationUrl({
        nonce,
        state,
        verifier,
        redirectUri: linkRedirectUri,
        prompt: 'login',
        ...(routed === null ? connectionParameter(choice) : { connection: routed.auth0Connection }),
      });
      return {
        ok: true,
        status: 200,
        body: { location: location.href },
        headers: [cookie(LINK_COOKIE, binding, OIDC_BINDING_TTL_SECONDS)],
      };
    }),
    bind(
      completeAuth0Link,
      /*
       * A throw after `links.consume` (password-session lookup, the activation
       * read, the identity write) is left to propagate as the app's 500 rather
       * than caught into `?auth_link=failed`: the failure policy reserves
       * catching for modeled recovery, and `options.logger` is optional here,
       * so a caught throw could vanish unlogged. What it leaves is bounded: the
       * binding is already spent server-side, so the stale cookie names
       * nothing, expires within OIDC_BINDING_TTL_SECONDS and is replaced by the
       * next link start.
       */
      async ({ request }) => {
        const sent = request.url.searchParams;
        const binding = cookieValue(request.headers.get('cookie') ?? undefined, LINK_COOKIE);
        const session = cookieValue(
          request.headers.get('cookie') ?? undefined,
          '__Host-wbs_access',
        );
        const state = sent.get('state');
        if (
          state === null ||
          (sent.get('code') ?? '') === '' ||
          sent.has('error') ||
          OTHER_RESPONSE_MODE_PARAMS.some((name) => sent.has(name))
        )
          return unconsumedLinkRefusal();
        // Since 2026-09-29 an absent binding and malformed provider parameters share the `refused` outcome, so the 2026-09-28 proof that told them apart no longer applies.
        if (binding === null || session === null) return linkOutcome('refused');
        const proof = links.consume(binding, state, session);
        // Proof: 2026-09-28, retaining the consumed transaction made `refuses a replayed link callback` link twice (then two 302s; now two `linked` outcomes).
        if (proof === null) return unconsumedLinkRefusal();
        const current = await auth.sessionUser(session);
        // Proof: 2026-09-28, skipping this recheck made `refuses a link whose originating account lost its password credential` answer 500 instead of the refusal (then 401; now `refused`).
        if (current?.user.id !== proof.userId) return linkOutcome('refused');
        const user = current.user;
        // Proof: 2026-09-28, bypassing this per-callback marker read made `refuses a callback after activation is lost before contacting Auth0` contact the provider once.
        if (!(await auth.isLinkActive())) return linkOutcome('inactive');
        const callbackUrl = new URL(linkRedirectUri);
        callbackUrl.search = request.url.search;
        let tokens;
        try {
          tokens = await options.client.exchange(
            new Request(callbackUrl, { headers: request.headers, method: request.method }),
            // Proof: 2026-09-28, replacing the retained PKCE verifier with `wrong` made `links a verified Auth0 identity only through the password session that began the flow` fail its exchange-check assertion.
            { nonce: proof.nonce, state, verifier: proof.verifier },
          );
        } catch (error) {
          if (isOidcCallbackRefused(error)) return linkOutcome('refused');
          const failure = classifyOidcFailure(error);
          return linkOutcome(LINK_OUTCOME_FOR_OIDC_FAILURE[failure.kind]);
        }
        if (tokens.idTokenClaims === undefined) return linkOutcome('refused');
        let identity;
        try {
          identity = oidcIdentityFromClaims(tokens.idTokenClaims, {
            groupPrefix: options.groupPrefix,
            groupsClaim: options.groupsClaim,
          });
        } catch {
          return linkOutcome('refused');
        }
        if (proof.connectionId !== undefined) {
          const at = now();
          const routed = await enterprise.linkThroughConnection(
            user.id,
            proof.connectionId,
            identity,
            { stamp: { at, by: user.id }, actor: user.id, auditId: randomUUID() },
          );
          switch (routed.kind) {
            case 'linked':
              await activatePending(user.id, identity);
              return linkOutcome('linked');
            case 'inactive':
            case 'sso_prefix_mismatch':
            case 'sso_connection_taken':
              return linkOutcome(routed.kind);
            case 'identity_collision':
            case 'email_collision':
              return linkOutcome('collision');
            case 'not_found':
            case 'invalid_account':
              return linkOutcome('refused');
          }
        }
        const linked = await auth.linkOidcIdentity(user.id, identity);
        if (linked.kind === 'inactive') return linkOutcome('inactive');
        if (linked.kind === 'identity_collision' || linked.kind === 'email_collision')
          return linkOutcome('collision');
        if (linked.kind !== 'linked') return linkOutcome('refused');
        await activatePending(user.id, identity);
        return linkOutcome('linked');
      },
      { prevalidate: linkCallbackAdmission, classifyRequestFailure: linkCallbackFailure },
    ),
  ] as const;
}
