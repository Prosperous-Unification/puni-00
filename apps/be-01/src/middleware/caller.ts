import { Elysia } from 'elysia';

import type { AuthService } from '../service/auth.service';
import { userFromHeaders } from './authenticated';

/**
 * What a route requires of whoever called it.
 *
 * `signed-in` is every route that answers about this deployment's own data: any
 * authenticated account may read and write it, and the account is carried for
 * the record rather than for permission (project-level write access is the
 * project service's question, not this one's).
 *
 * `read-scope` is the two routes an **integration token** reaches —
 * `GET /api/projects/:id/export` and `GET /plans/by-solution/:slug`. Both hand a
 * whole plan to a machine caller, and a token minted for one integration must
 * not be usable to bulk-read plans unless it was granted `read`. Nothing else
 * asks, and that is deliberate rather than an oversight: the browser session
 * carries every scope, so requiring `read` elsewhere would refuse nobody while
 * suggesting the check meant something. The write scope is asked for once, in
 * `app.ts`'s `onRequest`, before a body is parsed.
 */
export type CallerRequirement = 'signed-in' | 'read-scope';

/**
 * The one place a request's identity is resolved and a caller is refused.
 *
 * Twenty-three handlers opened with the same five lines — resolve, compare
 * against `null`, set 401, return `{ error: 'unauthenticated' }` — and two of
 * them then repeated a scope check. Five lines copied twenty-three times is a
 * guard nobody can see the shape of: one handler quietly answering a 403 where
 * the others answer 401, or forgetting the block altogether, reads exactly like
 * the rest.
 *
 * A macro rather than a wrapper function, because a wrapper would have to name
 * the context type and would lose Elysia's inference of `params`, `query` and
 * `body` at every route. The macro adds `user` to the context **already
 * narrowed to non-null**, so a handler cannot forget the case: there is no
 * `null` in the type to forget.
 *
 * Registered per controller (each is its own `Elysia` instance) and
 * deliberately **unnamed**, so Elysia does not dedupe it: the test suite builds
 * many apps in one process, each with its own `AuthService`, and a named plugin
 * would be reused across them with the first app's service inside it.
 */
export function callerGuard(auth: AuthService) {
  return new Elysia().macro({
    caller: (requires: CallerRequirement) => ({
      resolve: async ({ headers, status }) => {
        const user = await userFromHeaders(auth, headers);
        if (user === null) return status(401, { error: 'unauthenticated' });
        if (requires === 'read-scope' && !user.scopes.includes('read')) {
          return status(403, { error: 'insufficient_scope' });
        }
        return { user };
      },
    }),
  });
}
