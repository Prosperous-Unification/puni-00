import { randomBytes } from 'node:crypto';

import {
  browserBindingCookieName,
  browserBindingsIn,
  classifyOidcFailure,
  consumeBrowserBinding,
  type HeldBrowserBinding,
  InMemoryOidcLinkStore,
  isOidcCallbackRefused,
  MAX_BROWSER_BINDINGS,
  type OidcFailureKind,
  oidcIdentityFromClaims,
  selectBrowserBindings,
} from '@wbs/auth';
import {
  completeAuth0Link,
  completeOidcLogin,
  logoutOidcSession,
  refreshOidcSession,
  startAuth0Link,
  startOidcLogin,
} from '@wbs/contracts';
import type { LoginThrottle } from '@wbs/core/module/authentication/login-throttle';
import type { AuthService } from '@wbs/core/service/auth.service';

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
import type { OidcRouteOptions } from './oidc-options';

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
];
const correlationOf = (request: RequestMetadata) =>
  cookieValue(request.headers.get('cookie') ?? undefined, '__Host-wbs_session');
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
type LinkOutcome = 'linked' | 'refused' | 'inactive' | 'collision' | 'unavailable' | 'failed';
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
 * Browser OIDC bindings. Composition registers these only when OIDC options exist.
 * Exchange failures carry their owned classification; account and token-store failures remain throws.
 */
export function authOidcEndpoints(
  auth: AuthService,
  options: OidcRouteOptions,
  passwordThrottle: LoginThrottle,
) {
  const now = options.now ?? Date.now;
  const random = options.random ?? (() => randomBytes(32).toString('base64url'));
  const links = new InMemoryOidcLinkStore(now);
  const linkRedirectUri = new URL('/api/auth/link/auth0/callback', options.redirectUri).href;
  return [
    bind(startOidcLogin, async ({ request }) => {
      const browserBinding = random();
      const state = random();
      const nonce = random();
      const verifier = random();
      options.transactions.save({ browserBinding, state, nonce, verifier });
      const location = await options.client.authorizationUrl({
        nonce,
        state,
        verifier,
        redirectUri: options.redirectUri,
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
        // Proof: catching account-store failure as null returned409 instead of500 in the mounted failure test.
        const account = await auth.resolveOidcIdentity(identity);
        if (account === null)
          return {
            ok: false,
            status: 409,
            body: EMPTY,
            headers: clearsFor(settled),
          };
        const correlation = random();
        if (tokens.refreshToken !== undefined)
          options.tokens.save({
            expiresAt: now() + 30 * 86400000,
            refreshToken: tokens.refreshToken,
            sessionCorrelation: correlation,
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
            ['location', '/'],
          ],
        };
      },
      { prevalidate: callbackAdmission, classifyRequestFailure: callbackFailure },
    ),
    bind(refreshOidcSession, async ({ request }): Promise<HttpReply<typeof refreshOidcSession>> => {
      const correlation = correlationOf(request);
      const current = correlation === null ? null : options.tokens.read(correlation);
      if (correlation === null || current === null)
        return {
          ok: false,
          status: 401,
          body: { error: 'invalid_oidc_session' },
          headers: clearSession(),
        };
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
    bind(logoutOidcSession, async ({ request }) => {
      const correlation = correlationOf(request);
      const record = correlation === null ? null : options.tokens.read(correlation);
      // Proof: revoking before deletion left the stored token present in the mounted logout failure test.
      if (correlation !== null) options.tokens.delete(correlation);
      if (record !== null) await options.client.revoke(record.refreshToken);
      return { ok: true, status: 204, body: EMPTY, headers: clearSession() };
    }),
    bind(startAuth0Link, async ({ body, request }) => {
      // Proof: 2026-09-28, skipping this marker check made `refuses link start before activation` answer an Auth0 location.
      if (!(await auth.isLinkActive()))
        return { ok: false, status: 403, body: { error: 'onboarding_inactive' } };
      const session = cookieValue(request.headers.get('cookie') ?? undefined, '__Host-wbs_access');
      const account = await auth.passwordSessionUser(session);
      // Proof: 2026-09-28, removing this refusal made `refuses a link start without a password session before throttle admission` receive 500 instead of 401.
      if (account === null)
        return { ok: false, status: 401, body: { error: 'invalid_credentials' } };
      const throttleIp = clientIpOf(request.headers);
      // This route exists only behind OIDC, so a missing edge IP is refused as
      // login refuses it rather than pooled into one shared throttle bucket.
      // Proof: 2026-09-28, defaulting to 'local-direct' again made `refuses a link start without an edge client address before throttle admission` start the link (then a 302, now a 200) instead of 400.
      if (throttleIp === null) return { ok: false, status: 400, body: { error: 'invalid_client' } };
      // Proof: 2026-09-28, bypassing reserve made `admits at most five held fresh-password verifications and releases capacity` observe six verifiers.
      const release = passwordThrottle.reserve(account.username, throttleIp);
      // Proof: 2026-09-28, removing the exhausted-capacity refusal made `admits at most five held fresh-password verifications and releases capacity` observe six verifiers.
      if (release === null)
        return { ok: false, status: 429, body: { error: 'invalid_credentials' } };
      let user;
      try {
        user = await auth.provePasswordSession(session, body.password);
        if (user === null) passwordThrottle.recordFailure(account.username, throttleIp);
        else passwordThrottle.recordSuccess(account.username);
      } finally {
        // Proof: 2026-09-28, omitting release made `admits at most five held fresh-password verifications and releases capacity` and `releases fresh-password admission after verifier errors` receive 429 for the next start instead of 302.
        release();
      }
      // Proof: 2026-09-28, accepting an unmatched password made `refuses a wrong fresh password` redirect to Auth0.
      if (user === null || session === null)
        return { ok: false, status: 401, body: { error: 'invalid_credentials' } };
      const binding = random();
      const state = random();
      const nonce = random();
      const verifier = random();
      links.save(binding, { userId: user.id, session, state, nonce, verifier });
      const location = await options.client.authorizationUrl({
        nonce,
        state,
        verifier,
        redirectUri: linkRedirectUri,
        prompt: 'login',
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
        const user = await auth.passwordSessionUser(session);
        // Proof: 2026-09-28, skipping this recheck made `refuses a link whose originating account lost its password credential` answer 500 instead of the refusal (then 401; now `refused`).
        if (user?.id !== proof.userId) return linkOutcome('refused');
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
        const linked = await auth.linkOidcIdentity(user.id, identity);
        if (linked.kind === 'inactive') return linkOutcome('inactive');
        if (linked.kind === 'identity_collision' || linked.kind === 'email_collision')
          return linkOutcome('collision');
        if (linked.kind !== 'linked') return linkOutcome('refused');
        return linkOutcome('linked');
      },
      { prevalidate: linkCallbackAdmission, classifyRequestFailure: linkCallbackFailure },
    ),
  ] as const;
}
