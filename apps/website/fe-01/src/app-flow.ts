import { ApiFailure } from './api';

export const unreachableMessage = 'We couldn’t reach PUNI. Check your connection and try again.';

/** The sign-in status every app route reads from `GET /session`. */
export interface SessionStatus {
  mode: 'demo' | 'oidc';
  configured: boolean;
  signedIn: boolean;
}

/**
 * Validates the `GET /session` body at the API boundary.
 * @throws Error when the mode, configured flag or account shape is not the API contract.
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
    throw new Error('Invalid session status');
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

/**
 * Resolves the manual brief's optional AI card. The card is an optional shortcut, so an
 * unreadable or malformed session status hides it instead of blocking the manual brief.
 */
export async function loadAiExploration(
  readSession: () => Promise<unknown>,
): Promise<'offered' | 'hidden'> {
  try {
    return offersAiExploration(parseSessionStatus(await readSession())) ? 'offered' : 'hidden';
  } catch {
    return 'hidden';
  }
}

/** Fetch rejects with a TypeError for network failures; browsers word its message differently. */
function isNetworkFailure(error: unknown): boolean {
  return (
    error instanceof TypeError &&
    /failed to fetch|networkerror|load failed|network request failed/i.test(error.message)
  );
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
