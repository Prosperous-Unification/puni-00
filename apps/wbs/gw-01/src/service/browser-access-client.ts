import type { FetchLike } from './backend-request';
import type { CheckProjectAccess, ProjectAccessVerdict } from './project-access';

/**
 * The browser cookies that authenticated one socket, exactly as the browser
 * sent them (still percent-encoded). be-01 proves the principal from these
 * through its ordinary browser authentication; gw-01 never interprets them
 * beyond the upgrade check, and they are never logged.
 */
export interface ForwardedBrowserCredential {
  readonly accessCookie: string;
  readonly organizationCookie: string | null;
}

/** The `cookie` header carrying only the forwarded credential. */
export function forwardedCookieHeader(credential: ForwardedBrowserCredential): string {
  return [
    `__Host-wbs_access=${credential.accessCookie}`,
    ...(credential.organizationCookie === null
      ? []
      : [`__Host-wbs_organization=${credential.organizationCookie}`]),
  ].join('; ');
}

/**
 * Asks be-01's `POST /internal/gateway/projects/:id/browser-access` about one
 * socket's principal: the gateway secret plus the forwarded browser cookies.
 *
 * - 204 is `granted`.
 * - 404 (absent or foreign) and the 403 organization and scope refusals are `denied`.
 * - 401 `unauthenticated` is `unauthenticated`.
 *
 * A transport failure is retried once within the same deadline.
 *
 * @throws on anything else, including 401 `unauthorized` (a wrong gateway
 * secret is the gateway's fault, not the user's) and an unreadable reply, so
 * the caller fails closed.
 */
export function browserProjectAccess(opts: {
  beUrl: string;
  secret: string;
  fetchImpl: FetchLike;
}): (credential: ForwardedBrowserCredential) => CheckProjectAccess {
  return (credential) => async (projectId, signal) => {
    const send = () =>
      opts.fetchImpl(
        `${opts.beUrl}/internal/gateway/projects/${encodeURIComponent(projectId)}/browser-access`,
        {
          method: 'POST',
          headers: {
            'x-internal-auth': opts.secret,
            cookie: forwardedCookieHeader(credential),
          },
          signal,
        },
      );
    let response: Response;
    try {
      response = await send();
    } catch (caught) {
      // One retry for a transport failure, inside the caller's same deadline:
      // during a blue/green swap the be-01 alias re-points and one stale
      // connection or DNS answer must not close every socket 1013. A deadline
      // or a closed socket (an aborted signal) is never retried.
      // Proof: removing this retry made `retries one transport failure inside
      // the same budget` (browser-access-client.test.ts) throw; retrying an
      // aborted check made `fails closed after a second transport failure, and
      // never retries an aborted check` send twice (2026-10-11).
      if (signal.aborted) throw caught;
      response = await send();
    }
    if (response.status === 204) {
      await response.body?.cancel();
      return 'granted';
    }
    const verdict = verdictOf(response.status, await refusalCode(response));
    // Proof: answering `denied` for every other refusal turned a wrong gateway
    // secret into a quiet refusal in `throws on a refused gateway secret`
    // (browser-access-client.test.ts, 2026-10-11).
    if (verdict === null)
      throw new Error(`project browser access failed ${String(response.status)}`);
    return verdict;
  };
}

function verdictOf(status: number, code: string | null): ProjectAccessVerdict | null {
  if (status === 404 && code === 'not_found') return 'denied';
  if (
    status === 403 &&
    (code === 'no_active_organization' || code === 'not_a_member' || code === 'insufficient_scope')
  )
    return 'denied';
  if (status === 401 && code === 'unauthenticated') return 'unauthenticated';
  return null;
}

async function refusalCode(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    return typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof body.error === 'string'
      ? body.error
      : null;
  } catch (caught) {
    if (caught instanceof SyntaxError) return null;
    throw caught;
  }
}
