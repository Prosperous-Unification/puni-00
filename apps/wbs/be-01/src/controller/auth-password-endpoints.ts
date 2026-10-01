import { loginPassword, readPasswordSession, registerPassword } from '@wbs/contracts';
import type { LoginThrottle } from '@wbs/core/module/authentication/login-throttle';
import { type AuthService, TOKEN_TTL_SECONDS } from '@wbs/core/service/auth.service';

import { bind, type RequestFailure } from '../http/endpoint';
import { credentialFromHeaders } from '../middleware/authenticated';
import {
  type BrowserSessionAuthority,
  proveBrowserPredecessor,
  retireBrowserPredecessor,
} from './browser-session';

/** Password switches from the OIDC composition; absence selects local password mode. */
export interface PasswordOidcOptions {
  passwordLoginEnabled?: boolean;
  passwordRegisterEnabled?: boolean;
}

function classifyCredentials(failure: RequestFailure) {
  switch (failure.code) {
    case 'invalid_body':
      return { ok: false, status: 422, body: { error: 'invalid_body' } } as const;
    case 'invalid_json':
      return { ok: false, status: 400, body: { error: 'invalid_json' } } as const;
    case 'invalid_query':
      return { ok: false, status: 400, body: { error: 'invalid_query' } } as const;
    case 'invalid_params':
      return { ok: false, status: 400, body: { error: 'invalid_query' } } as const;
  }
}

/** The network peer appended by the trusted edge, never an attacker-controlled left-side value. */
export function clientIpOf(headers: Headers): string | null {
  const forwarded = headers
    .get('x-forwarded-for')
    ?.split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .at(-1);
  return forwarded ?? null;
}

function accessCookie(token: string): readonly [string, string] {
  // Proof: omitting this header made the mounted OIDC cookie assertion receive null.
  return [
    'set-cookie',
    `__Host-wbs_access=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${String(TOKEN_TTL_SECONDS)}`,
  ];
}

function clearBrowserCookie(name: string): readonly [string, string] {
  return ['set-cookie', `${name}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`];
}

const clearRetiredContext = () => [
  clearBrowserCookie('__Host-wbs_session'),
  clearBrowserCookie('__Host-wbs_organization'),
];

const clearRetiredNativeCookies = () => [
  clearBrowserCookie('__Host-wbs_access'),
  ...clearRetiredContext(),
];

const sessionResponseHeaders = [
  ['cache-control', 'no-store'],
  ['vary', 'Cookie, Authorization, X-WBS-Token'],
] as const;

/**
 * Password protocol bindings. Origin admission runs in the adapter; credentials
 * are then validated before mode switches, proxy metadata and authentication.
 */
export function authPasswordEndpoints(
  auth: AuthService,
  oidc: PasswordOidcOptions | undefined,
  passwordThrottle: LoginThrottle,
  browserSession?: BrowserSessionAuthority,
  appOrigin?: string,
) {
  if (browserSession !== undefined && appOrigin === undefined)
    throw new Error('enabled browser session requires its exact app origin');
  return [
    bind(
      registerPassword,
      async ({ body, request }) => {
        const predecessor =
          browserSession === undefined
            ? { kind: 'none' as const }
            : await proveBrowserPredecessor(request, browserSession, appOrigin ?? '');
        // Proof: without predecessor admission the mounted registration made a
        // new account before discovering malformed or mixed browser identity.
        if (predecessor === null)
          return { ok: false, status: 401, body: { error: 'unauthenticated' } } as const;
        // Proof: removing the switch made the mounted disabled registration receive 200 instead of 404.
        if (oidc !== undefined && oidc.passwordRegisterEnabled !== true) {
          return { ok: false, status: 404, body: { error: 'not_found' } };
        }
        const clientIp = clientIpOf(request.headers);
        // Proof: removing this refusal made the mounted missing-proxy registration receive 200 instead of 400.
        if (oidc !== undefined && clientIp === null) {
          return { ok: false, status: 400, body: { error: 'invalid_client' } };
        }
        const throttleIp = clientIp ?? 'local-direct';
        // Proof: bypassing this check made the mounted sixth same-IP registration receive 200 instead of 429.
        if (!passwordThrottle.canAttempt(body.username, throttleIp)) {
          return { ok: false, status: 429, body: { error: 'rate_limited' } };
        }
        passwordThrottle.recordFailure(body.username, throttleIp);
        const outcome = await auth.register(body.username, body.password);
        if (!outcome.ok) {
          return outcome.reason === 'taken'
            ? ({ ok: false, status: 409, body: { error: outcome.reason } } as const)
            : ({ ok: false, status: 400, body: { error: outcome.reason } } as const);
        }
        if (browserSession !== undefined)
          await retireBrowserPredecessor(predecessor, browserSession, Date.now());
        return oidc === undefined
          ? ({
              ok: true,
              status: 200,
              body: outcome.value,
              ...(browserSession === undefined ? {} : { headers: clearRetiredNativeCookies() }),
            } as const)
          : ({
              ok: true,
              status: 200,
              body: { token: '', user: outcome.value.user },
              // Proof: omitting these clears left an OIDC predecessor's old
              // correlation in the cookie jar; the next native logout was 401.
              headers: [
                accessCookie(outcome.value.token),
                ...(browserSession === undefined ? [] : clearRetiredContext()),
              ],
            } as const);
      },
      { classifyRequestFailure: classifyCredentials },
    ),
    bind(
      loginPassword,
      async ({ body, request }) => {
        const predecessor =
          browserSession === undefined
            ? { kind: 'none' as const }
            : await proveBrowserPredecessor(request, browserSession, appOrigin ?? '');
        if (predecessor === null)
          return { ok: false, status: 401, body: { error: 'unauthenticated' } } as const;
        // Proof: removing the switch made the mounted disabled login receive 401 instead of 404.
        if (oidc?.passwordLoginEnabled === false) {
          return { ok: false, status: 404, body: { error: 'not_found' } };
        }
        const clientIp = clientIpOf(request.headers);
        // Proof: removing this refusal made the mounted missing-proxy request receive 401 instead of 400.
        if (oidc !== undefined && clientIp === null) {
          return { ok: false, status: 400, body: { error: 'invalid_client' } };
        }
        const throttleIp = clientIp ?? 'local-direct';
        // Proof: bypassing reserve made the mounted held-attempt test observe twenty, not five.
        const release = passwordThrottle.reserve(body.username, throttleIp);
        if (release === null) {
          return { ok: false, status: 429, body: { error: 'invalid_credentials' } };
        }
        try {
          const outcome = await auth.login(body.username, body.password);
          if (!outcome.ok) {
            passwordThrottle.recordFailure(body.username, throttleIp);
            return { ok: false, status: 401, body: { error: 'invalid_credentials' } };
          }
          passwordThrottle.recordSuccess(body.username);
          if (browserSession !== undefined)
            await retireBrowserPredecessor(predecessor, browserSession, Date.now());
          return oidc === undefined
            ? ({
                ok: true,
                status: 200,
                body: outcome.value,
                ...(browserSession === undefined ? {} : { headers: clearRetiredNativeCookies() }),
              } as const)
            : ({
                ok: true,
                status: 200,
                body: { token: '', user: outcome.value.user },
                // Proof: omitting retired-session/organization clears left a
                // stale OIDC correlation next to the new native access cookie.
                headers: [
                  accessCookie(outcome.value.token),
                  ...(browserSession === undefined ? [] : clearRetiredContext()),
                ],
              } as const);
        } finally {
          // Proof: removing release makes the mounted success/refusal/error matrix observe two verifiers, not three.
          release();
        }
      },
      { classifyRequestFailure: classifyCredentials },
    ),
    bind(readPasswordSession, async ({ request }) => {
      // Proof: catching authentication errors makes the mounted account-store outage receive 401 instead of 500.
      const credential = credentialFromHeaders(Object.fromEntries(request.headers.entries()));
      const user = await auth.authenticate(credential.token);
      if (user !== null)
        return {
          ok: true,
          status: 200,
          body: { user: { ...user, scopes: [...user.scopes] } },
          headers: sessionResponseHeaders,
        };
      /*
       * No browser session is an ordinary signed-out state. A credential that
       * was presented still fails closed.
       *
       * Proof: treating every null user as anonymous made the mounted invalid
       * bearer case receive 200 instead of 401; restoring the blanket refusal
       * made the production anonymous case receive 401 instead of 200.
       */
      return credential.presented
        ? {
            ok: false,
            status: 401,
            body: { error: 'invalid_token' },
            headers: sessionResponseHeaders,
          }
        : { ok: true, status: 200, body: { user: null }, headers: sessionResponseHeaders };
    }),
  ] as const;
}
