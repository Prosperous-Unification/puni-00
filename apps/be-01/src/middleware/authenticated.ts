import type { AuthService } from '../service/auth.service';

/**
 * The app token, from either header the front end may have used.
 *
 * `x-wbs-token` is the one it does use, and the reason is the dev edge: dev sits
 * behind basic auth on every path but `/ws`, so an `Authorization: Bearer` from
 * the app *replaces* the `Authorization: Basic` credential Caddy requires. Caddy
 * then 401s before be-01 is reached, and the failure looks like a rejected app
 * token rather than a missing proxy credential. A header the edge does not read
 * cannot collide with one it does.
 */
export function tokenFromHeaders(headers: Record<string, string | undefined>): string | null {
  const bearer = headers['authorization'];
  return (
    headers['x-wbs-token'] ?? (bearer?.startsWith('Bearer ') === true ? bearer.slice(7) : null)
  );
}

/** The authenticated account, or null when the request carries no usable token. */
export async function userFromHeaders(
  auth: AuthService,
  headers: Record<string, string | undefined>,
): Promise<{ id: string; username: string } | null> {
  const token = tokenFromHeaders(headers);
  if (token === null) return null;
  return auth.authenticate(token);
}
