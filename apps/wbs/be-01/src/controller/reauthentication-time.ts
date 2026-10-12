/**
 * The `{strategy}|{connection}|` part of an upstream subject that names how it
 * authenticated: the first two segments of an enterprise subject, the first of
 * a social one (`google-oauth2|7` → `google-oauth2|`).
 */
export function pairPrefixOf(subject: string): string {
  const parts = subject.split('|');
  return parts.length >= 3 ? `${parts[0]}|${parts[1]}|` : `${parts[0]}|`;
}

/** What the callback knows about the credential its sign-in replaces. */
export type ReplacedCredential =
  | { readonly kind: 'none' }
  | { readonly kind: 'native' }
  | { readonly kind: 'oidc'; readonly subject: string | null };

/**
 * When the person last authenticated interactively, as one login callback
 * proves it (`organization-session-policy`), in epoch milliseconds, or null
 * when the callback proves nothing:
 *
 * 1. the verified ID token's `auth_time` when the transaction sent `max_age`
 *    and the claim is a whole number of seconds no later than the callback;
 * 2. otherwise the callback time, only when the transaction sent
 *    `prompt=login` and the new pair's `{strategy}|{connection}|` equals the
 *    replaced credential's, or nothing was replaced.
 *
 * `prompt=login` alone never proves it, a password predecessor shares no
 * pair, and a link callback never calls this.
 *
 * Proof, each watched 2026-10-12 in `reauthentication-time.test.ts`: setting
 * the callback time whenever `prompt=login` was sent made `does not
 * reauthenticate through a different connection` answer the callback time;
 * accepting `auth_time` without `max_age` made `reads auth_time only under
 * max_age` answer it.
 */
export function reauthenticatedAtOf(input: {
  readonly requested: { readonly prompt: 'login'; readonly maxAge: number | null } | undefined;
  readonly authTime: unknown;
  readonly replaced: ReplacedCredential;
  readonly subject: string;
  readonly callbackAt: number;
}): number | null {
  const { requested, authTime, replaced, subject, callbackAt } = input;
  if (requested === undefined) return null;
  if (
    requested.maxAge !== null &&
    typeof authTime === 'number' &&
    Number.isSafeInteger(authTime * 1000) &&
    authTime >= 0 &&
    authTime * 1000 <= callbackAt
  )
    return authTime * 1000;
  if (replaced.kind === 'none') return callbackAt;
  if (
    replaced.kind === 'oidc' &&
    replaced.subject !== null &&
    pairPrefixOf(replaced.subject) === pairPrefixOf(subject)
  )
    return callbackAt;
  return null;
}
