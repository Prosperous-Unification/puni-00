import {
  makeRedactionPolicy,
  makeReportPair,
  type PublicReportCorjOptions,
  type RedactionPolicy,
  type ReportPair,
} from 'application-exception';

/**
 * The inspection limits every reporting call in this repository shares, for both reports.
 *
 * The type is the public bag's, the narrower of the two: application-exception refuses a public
 * `corj` bag that carries anything but `inspection`, `maxDepth`, `maxChildren`, `childrenSources`,
 * `fingerprintParts` and `onReportingError`, and every one of those is also a diagnostic option.
 * `maxDepth` stops the cause walk and marks the deepest child `children_omitted: 'max_depth'`;
 * `maxChildren` marks the root `children_omitted: 'max_children'`. `inspection: 'no-invoke'` is
 * what keeps a throwing getter from running while a failure is being reported: such a property is
 * reported as `'[not-inspected]'`. The library snapshots the bag on every call and caches nothing,
 * so a module constant is a single source of the limits, not a cache key.
 */
export const FAILURE_REPORT_LIMITS: PublicReportCorjOptions = {
  // Proof: removing the depth limit left `children_omitted` undefined instead of
  // `max_depth` on the deepest child (2026-09-20).
  maxDepth: 4,
  // Proof: removing the child limit left root `children_omitted` undefined instead
  // of `max_children` in the aggregate test (2026-09-20).
  maxChildren: 16,
  // Proof: removing `no-invoke` ran the throwing getter and reported
  // `error: "Error: ran"` in the getter test (2026-09-20).
  inspection: 'no-invoke',
};

/**
 * The whole compact diagnostic report's budget in UTF-8 bytes — `occurrence_id`, `fingerprint`,
 * `context` and `reporting_errors` included.
 *
 * Over budget the library drops `context` whole and records `context_omitted: 'max_size'`, then
 * drops `reporting_errors` and records `reporting_errors_omitted`, and only then trims error
 * content; `occurrence_id`, `fingerprint` and `v` are never trimmed. A context that is merely
 * large is truncated instead, by the library's own 16 KiB context cap, and leaves
 * `context_omitted` absent. The public report takes no byte budget: application-exception bounds
 * its message and selected details by its own fixed caps.
 */
export const FAILURE_REPORT_MAX_BYTES = 32_768;

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

/**
 * What a caller is told when reporting itself failed. Fixed text: the thrown message may quote
 * the very value the policy was protecting.
 */
const REPORTING_LOST_REASON =
  'reporting threw; the failure stands and both of its reports are lost';

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
 * Build it once at startup and share it: compiling the caller's secrets into patterns is work a
 * report should not repeat. Pass only the secrets the caller actually holds — never a whole
 * configuration, request or environment object, because a secret nobody named cannot be detected.
 * An empty list is correct where the caller owns no secret, and leaves the key rules in force. The
 * policy applies to the public report as well, and it sees only what a kind's disclosure selector
 * returned, so a mistaken selector cannot get past it.
 *
 * @param secrets Secret values to scrub from messages, stacks, `as_string`, `as_json`, `context`
 *   and `reporting_errors` wherever they appear. Empty strings are ignored.
 * @returns A reusable policy accepted as `redact` by both reports.
 */
export function createFailureRedaction(secrets: readonly string[]): RedactionPolicy {
  return makeRedactionPolicy({
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

/**
 * Both reports of one failure, or a visible refusal saying that reporting itself failed.
 *
 * Reporting loss is modelled and never silent, and it is never a successful operation: the
 * original failure is unchanged and still the caller's to handle.
 */
export type FailureReporting =
  | { readonly reported: true; readonly reports: ReportPair }
  | { readonly reported: false; readonly occurrenceId: string; readonly reason: string };

/** Losses in this process, so two of them never share a correlation handle. */
let unreportedFailures = 0;

/**
 * Report one caught value to both audiences under this repository's limits and the caller's
 * policy, without ever throwing.
 *
 * One `makeReportPair` call resolves the occurrence id once and shares it, so the operator's record
 * and the answer given to a user or an agent correlate even for a thrown primitive. The same policy
 * and the same inspection limits go to both bags, so the public report is redacted too; the byte
 * budget is the diagnostic report's alone. Reporting can still fail — a revoked `Proxy` as a cause
 * makes the library throw (caught-object-report-json issue 217, still open on 13.0.0) — and a
 * boundary that is already handling a failure must not be handed a second one, so that outcome
 * comes back as `reported: false` with a local handle and a fixed reason. The reporter is not
 * called again, and nothing is read off the caught value afterwards: reading it is what threw.
 *
 * @param caught The value that was thrown. Any value, including primitives, `null` and hostile
 *   objects.
 * @param options What the calling boundary brings to the report.
 * @param options.redact The policy both reports share, built once at startup.
 * @param options.context Caller data reported beside the caught value, dropped whole when the
 *   report is over budget.
 * @returns Both reports, or the modelled loss.
 */
export function reportFailure(
  caught: unknown,
  options: { readonly redact: RedactionPolicy; readonly context?: unknown },
): FailureReporting {
  const bag = { redact: options.redact, corj: FAILURE_REPORT_LIMITS };
  try {
    return {
      reported: true,
      // Proof: removing `redact` from the public bag disclosed `alice@example.com`
      // in the public-details test (2026-09-20).
      // Proof: splitting this shared call produced two different `AE_…` ids in the
      // primitive-correlation test (2026-09-20).
      reports: makeReportPair(caught, {
        diagnostic: {
          ...bag,
          // Proof: on 2026-09-25, removing this budget failed "bounds a very long Unicode
          // message and marks it truncated" with `Expected: true`, `Received: undefined`,
          // and the three other budget tests, while "bounds the whole report and refuses
          // to run the caught value" passed.
          maxReportBytes: FAILURE_REPORT_MAX_BYTES,
          context: options.context,
        },
        public: bag,
      }),
    };
    // Proof: replacing the wrapper with a bare block let a revoked cause throw
    // `Array.isArray cannot be called on a Proxy that has been revoked` (2026-09-20).
  } catch {
    unreportedFailures += 1;
    return {
      reported: false,
      occurrenceId: `UNREPORTED_${String(unreportedFailures)}`,
      reason: REPORTING_LOST_REASON,
    };
  }
}
