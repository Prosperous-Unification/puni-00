import { Elysia, t } from 'elysia';

import { tokenFromHeaders } from '../middleware/authenticated';
import type { AuthService } from '../service/auth.service';

/**
 * Types only. Length and character rules live in AuthService, because Elysia
 * rejects a schema violation with 422 before the handler runs — so enforcing
 * them here too would give the front end two different failures ("422" and
 * `{error:'invalid'}`) for one mistake.
 */
const credentials = t.Object({
  username: t.String(),
  password: t.String(),
});

/**
 * Registration and login both return the same token shape, so the front end
 * has one code path for "I am now signed in". The token is what gw-01 accepts
 * on the WebSocket, which is why login and the realtime connection cannot
 * drift apart: there is exactly one issuer.
 */
export function authController(auth: AuthService) {
  // `/api` is part of the mount, not stripped by the edge: Caddy passes the
  // prefix through with `handle`, matching smokeController. A bare `/auth`
  // here answers in unit tests and 404s behind the proxy.
  return new Elysia({ prefix: '/api/auth' })
    .post(
      '/register',
      async ({ body, set }) => {
        const outcome = await auth.register(body.username, body.password);
        if (!outcome.ok) {
          // 409 for a taken name, 400 for a malformed one: the front end shows
          // different messages, and a single 400 for both made "that name is
          // gone" indistinguishable from "your password is too short".
          set.status = outcome.reason === 'taken' ? 409 : 400;
          return { error: outcome.reason };
        }
        return outcome.result;
      },
      { body: credentials },
    )
    .post(
      '/login',
      async ({ body, set }) => {
        const outcome = await auth.login(body.username, body.password);
        if (!outcome.ok) {
          set.status = 401;
          return { error: 'invalid_credentials' };
        }
        return outcome.result;
      },
      { body: credentials },
    )
    .get('/me', async ({ headers, set }) => {
      const token = tokenFromHeaders(headers);
      if (token === null) {
        set.status = 401;
        return { error: 'missing_token' };
      }
      const user = await auth.authenticate(token);
      if (user === null) {
        set.status = 401;
        return { error: 'invalid_token' };
      }
      return { user };
    });
}
