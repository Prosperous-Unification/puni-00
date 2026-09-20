import {
  type AppexCorjOptions,
  createRedactionPolicy,
  type RedactionPolicy,
} from 'application-exception';

/**
 * The one options bag every reporting call in this repository shares. It is a module constant
 * because the library caches one report maker per options object; building it per call throws
 * that cache away.
 *
 * `maxReportSize` bounds the whole compact diagnostic report in UTF-8 bytes — `occurrence_id`,
 * `fingerprint`, `context` and `reporting_errors` included. Over budget the library drops
 * `context` whole and records `context_omitted: 'max_size'`, then drops `reporting_errors` and
 * records `reporting_errors_omitted`, and only then trims error content; `occurrence_id`,
 * `fingerprint` and `v` are never trimmed. A context that is merely large is truncated instead,
 * by the library's own 16 KiB context cap, and leaves `context_omitted` absent. `maxDepth` stops
 * the cause walk and marks the deepest child `children_omitted: 'max_depth'`; `maxChildren`
 * marks the root `children_omitted: 'max_children'`. `inspection: 'no-invoke'` is what keeps a
 * throwing getter from running while a failure is being reported: such a property is reported as
 * `'[not-inspected]'`.
 */
export const FAILURE_REPORT_LIMITS: AppexCorjOptions = {
  maxReportSize: 32_768,
  maxDepth: 4,
  maxChildren: 16,
  inspection: 'no-invoke',
};

/**
 * Property names skipped in both reports, at any depth, whatever their capitalisation.
 *
 * A skip hides the value and not its text elsewhere: a secret quoted inside a message or a stack
 * survives every key rule, which is why {@link createFailureRedaction} also compiles the caller's
 * own secrets into pattern rules. Exported as plain names so a caller can read the list; the
 * policy matches them case-insensitively, because HTTP headers arrive capitalised.
 */
export const SENSITIVE_KEYS: readonly string[] = [
  'authorization',
  'cookie',
  'set-cookie',
  'password',
  'token',
  'access_token',
  'refresh_token',
  'secret',
  'jwtKey',
  'internalAuthSecret',
];

/** The literal form of `text` inside a regular expression. */
function quoteForPattern(text: string): string {
  return text.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);
}

// Proof: replacing these patterns with the plain key strings exposed capitalised
// `Authorization` and `Bearer live-token` in the capitalisation test (2026-09-20).
const SENSITIVE_KEY_PATTERNS = SENSITIVE_KEYS.map(
  (key) => new RegExp(`^${quoteForPattern(key)}$`, 'i'),
);

/**
 * A redaction policy over the secrets the calling boundary owns, for both reports of a failure.
 *
 * Build it once at startup and share it: the library caches one report maker per policy. Pass
 * only the secrets the caller actually holds — never a whole configuration, request or
 * environment object, because a secret nobody named cannot be detected. An empty list is correct
 * where the caller owns no secret, and leaves the key rules in force. The policy applies to the
 * public report as well, and it sees only what a kind's disclosure selector returned, so a
 * mistaken selector cannot get past it.
 *
 * @param secrets Secret values to scrub from messages, stacks, `as_string`, `as_json`, `context`
 *   and `reporting_errors` wherever they appear. Empty strings are ignored.
 * @returns A reusable policy accepted as `redact` by both reports.
 */
export function createFailureRedaction(secrets: readonly string[]): RedactionPolicy {
  return createRedactionPolicy({
    // Proof: replacing the key patterns with [] exposed `Bearer live-token` in the
    // capitalisation test (2026-09-20).
    keys: SENSITIVE_KEY_PATTERNS,
    // Proof: replacing the caller-owned patterns with [] left `Error: token was hunter2`
    // unredacted in the message-and-stack test (2026-09-20).
    patterns: secrets
      .filter((secret) => secret.length > 0)
      .map((secret) => new RegExp(quoteForPattern(secret), 'g')),
  });
}
