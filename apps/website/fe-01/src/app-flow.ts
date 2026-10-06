import { ApiFailure } from './api';

export const unreachableMessage = 'We couldn’t reach PUNI. Check your connection and try again.';

/** The sign-in status every app route reads from `GET /session`. */
export interface SessionStatus {
  mode: 'demo' | 'oidc';
  configured: boolean;
  signedIn: boolean;
}

/** The `GET /session` body did not match the API contract. */
export class InvalidSessionStatus extends Error {
  constructor() {
    super('Invalid session status');
  }
}

/**
 * Validates the `GET /session` body at the API boundary.
 * @throws InvalidSessionStatus when the mode, configured flag or account shape is not the API contract.
 */
export function parseSessionStatus(value: unknown): SessionStatus {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('mode' in value) ||
    (value.mode !== 'demo' && value.mode !== 'oidc') ||
    !('configured' in value) ||
    typeof value.configured !== 'boolean' ||
    !('account' in value) ||
    (value.account !== null && typeof value.account !== 'object')
  )
    throw new InvalidSessionStatus();
  return { mode: value.mode, configured: value.configured, signedIn: value.account !== null };
}

/** The sign-in Build offers a signed-out visitor; `unavailable` sends them to the manual brief. */
export function signInRoute(status: SessionStatus): 'google' | 'demo' | 'unavailable' {
  if (status.mode === 'demo') return 'demo';
  return status.configured ? 'google' : 'unavailable';
}

/**
 * Whether the manual brief may link to Build for AI exploration. It shares {@link signInRoute}
 * with Build so the two routes can never send a visitor back and forth.
 */
export function offersAiExploration(status: SessionStatus): boolean {
  // Proof: returning true here failed two app-flow.test.ts cases and the oidc-off `manual`
  // capture in browser/screens.mjs ("manual brief links back to Build").
  return status.signedIn || signInRoute(status) !== 'unavailable';
}

/** The manual brief's optional AI card; `unavailable` renders as hidden but keeps its cause. */
export type AiExploration =
  | { kind: 'offered' }
  | { kind: 'hidden' }
  | { kind: 'unavailable'; error: ApiFailure | TypeError | InvalidSessionStatus };

/**
 * Resolves the manual brief's optional AI card. The card is an optional shortcut, so a typed API
 * failure, a network failure or a malformed session status yields `unavailable` instead of
 * blocking the manual brief.
 * @throws any other error unchanged; it is a defect, not a modelled outcome.
 */
export async function loadAiExploration(
  readSession: () => Promise<unknown>,
): Promise<AiExploration> {
  try {
    return offersAiExploration(parseSessionStatus(await readSession()))
      ? { kind: 'offered' }
      : { kind: 'hidden' };
  } catch (error) {
    // Proof: catching every error (the guard removed) failed the app-flow.test.ts rethrow case;
    // dropping any one branch failed the matching unavailable case.
    if (error instanceof ApiFailure || error instanceof InvalidSessionStatus)
      return { kind: 'unavailable', error };
    if (error instanceof TypeError && isNetworkFailure(error))
      return { kind: 'unavailable', error };
    throw error;
  }
}

/** Fetch rejects with a TypeError for network failures; browsers word its message differently. */
function isNetworkFailure(error: unknown): boolean {
  return (
    error instanceof TypeError &&
    /failed to fetch|networkerror|load failed|network request failed/i.test(error.message)
  );
}

/** Turns a failed operator request into operator-facing copy. */
export function describeOperatorFailure(error: unknown): string {
  // Proof: removing this branch fell through to the visitor brief copy and failed app-flow.test.ts.
  if (error instanceof ApiFailure && error.code === 'operator_unconfigured')
    return 'Operator sign-in is not set up on this API. Set OPERATOR_PASSWORD and restart it.';
  if (error instanceof ApiFailure && error.code === 'invalid_credentials')
    return 'That password was not accepted.';
  if (error instanceof ApiFailure && error.code === 'login_locked')
    return error.retryAfterSeconds === null
      ? 'Sign-in is locked after repeated failures. Try again later.'
      : `Sign-in is locked after repeated failures. Try again in ${String(Math.ceil(error.retryAfterSeconds / 60))} min.`;
  return describeFailure(error);
}

/** Turns a failed app request into visitor-facing copy. */
export function describeFailure(error: unknown): string {
  // Proof: removing this branch failed app-flow.test.ts and the `error` capture in
  // browser/screens.mjs, which then showed the raw "Failed to fetch".
  if (isNetworkFailure(error)) return unreachableMessage;
  if (error instanceof ApiFailure) {
    if (error.status === 429) return 'Too many attempts. Please wait and try again.';
    if (error.status === 503)
      return 'This option isn’t available right now. You can still send your brief to a person.';
    return error.code.replaceAll('_', ' ');
  }
  return error instanceof Error ? error.message : 'Something went wrong. Try again.';
}
