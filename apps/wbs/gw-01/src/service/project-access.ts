/**
 * be-01's answer about one project for the principal behind one socket.
 *
 * - `granted`: the principal may read the project now.
 * - `denied`: it may not, or the project is absent; the two are deliberately
 *   one answer so a foreign project is indistinguishable from a missing one.
 * - `unauthenticated`: the socket's credential no longer proves anyone, for
 *   example after expiry or logout; the socket must reconnect.
 */
export type ProjectAccessVerdict = 'granted' | 'denied' | 'unauthenticated';

/**
 * Asks be-01 whether this connection's principal may read `projectId` now.
 *
 * Bound to one connection: the adapter carries that connection's credential,
 * never a name the client chose.
 *
 * @throws when be-01 cannot answer (unreachable, deadline, malformed reply).
 * Callers fail closed: an unanswered check never grants.
 */
export type CheckProjectAccess = (
  projectId: string,
  signal: AbortSignal,
) => Promise<ProjectAccessVerdict>;

/**
 * How often a granted project subscription is rechecked, and how long one
 * recheck may take. Rounds start on a fixed cadence, so access lost at `t` is
 * observed by a check that starts before `t + LEASE_RENEW_MS` and answers
 * before `t + LEASE_RENEW_MS + ACCESS_CHECK_DEADLINE_MS`: 4.5 s, inside the
 * five-second revocation bound of `organization-realtime`.
 */
export const LEASE_RENEW_MS = 3_000;
export const ACCESS_CHECK_DEADLINE_MS = 1_500;

/**
 * Local mode only: grants every project. A local-mode socket carries no
 * credential to forward, and local be-01 authenticates every request as its
 * one fixed identity with legacy access, so there is nothing to ask. Only
 * {@link projectAccessFor} may select it, and only for a `local` credential.
 */
export const LOCAL_PROJECT_ACCESS: CheckProjectAccess = () => Promise.resolve('granted');
