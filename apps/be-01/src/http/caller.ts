import { userFromHeaders } from '../middleware/authenticated';
import type { AuthenticatedUser, AuthService } from '../service/auth.service';
import { respond, type RouteHandler, type RouteRequest, type RouteResponse } from './route';

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
export type CallerRequirement = 'read-scope' | 'signed-in';

/** A handler that has already been given a non-null account. */
export type AuthenticatedHandler = (
  req: RouteRequest,
  user: AuthenticatedUser,
) => Promise<RouteResponse>;

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
 * This was an Elysia macro until the route modules stopped importing Elysia.
 * The macro existed to keep the framework's inference of `params`, `query` and
 * `body` across a wrapper, and a plain higher-order function loses nothing now
 * that those three are fields on {@link RouteRequest} rather than inferred
 * context. What it gains is the reason the split was worth making: the refusal
 * is the same object under every binder, so `binder.contract.test.ts` asserts
 * one 401 and covers both.
 *
 * The wrapped handler is handed the account **already narrowed to non-null**,
 * so it cannot forget the case: there is no `null` in the type to forget.
 */
export function callerGuard(auth: AuthService) {
  return (requires: CallerRequirement, handler: AuthenticatedHandler): RouteHandler =>
    async (req) => {
      const user = await userFromHeaders(auth, req.headers);
      if (user === null) return respond(401, { error: 'unauthenticated' });
      if (requires === 'read-scope' && !user.scopes.includes('read')) {
        return respond(403, { error: 'insufficient_scope' });
      }
      return handler(req, user);
    };
}
