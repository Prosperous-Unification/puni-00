import { ApiFailure } from './api';

export const unreachableMessage = 'We couldn’t reach PUNI. Check your connection and try again.';

/**
 * Whether the manual brief links to Build: always while the draft claim is live. There is no
 * prospect sign-in (ADR 0039), so a live claim is all Build needs.
 * @throws Error when `expiresAt` is not a date; the draft read is the API's contract.
 */
export function offersBuild(draft: { expiresAt: string }, now: number): boolean {
  const expiresAt = Date.parse(draft.expiresAt);
  if (Number.isNaN(expiresAt)) throw new Error(`Invalid claim expiry: ${draft.expiresAt}`);
  // Proof: returning false here failed app-flow.test.ts "the manual brief offers Build whenever
  // the claim is live" and the `manual` capture in browser/screens.mjs.
  return expiresAt > now;
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
