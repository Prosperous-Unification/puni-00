import { type } from '@wbs/validation';

/**
 * The fields a log line may carry, so a query across tiers is written once.
 *
 * `err` is one of exactly two things and nothing else: the sanitized DIAGNOSTIC report of a
 * failure, recognised by its `corj/` version, or the modelled loss that says no report could be
 * built. The public report — `appex/public/v4`, `INTERNAL_ERROR`, a generic message — is what a
 * user or agent is told and is refused here, because an operator reading it would have nothing
 * to debug. `occurrence_id` correlates the record with what that user or agent was told;
 * `fingerprint` is equal for failures of the same kind from the same place and is a retry
 * signal, not a lookup key — the report libraries publish none for a value with no real stack
 * frames, so it is optional. Legacy `name`, `message` and `stack` fields are gone: they would
 * have to be manufactured from compact values the report is allowed to omit.
 */
export const LogRecord = type({
  level: "'trace'|'debug'|'info'|'warn'|'error'|'fatal'|10|20|30|40|50|60",
  time: 'number',
  msg: 'string',
  // Proof: on 2026-09-21, removing `mcp-01` while leaving the logger union widened made the real
  // MCP logger record fail validation because its service was outside the closed schema.
  service: "'be-01'|'gw-01'|'fe-01'|'mcp-01'",
  'request_id?': 'string',
  'connection_id?': 'string',
  'user_id?': 'string',
  'ws_subscription?': 'string',
  'trace_id?': 'string',
  'span_id?': 'string',
  'version?': 'string',
  // Proof: relaxing the diagnostic branch's `v` to `'v?': 'string'` accepted a public report and
  // failed "refuses a public report where the schema expects a failure record"; making the loss
  // branch's `reason` optional accepted a half-written loss and failed "refuses a reporting loss
  // that names no reason"; restoring the pre-change `{ name, message, stack? }` member failed
  // "logs a failure as the diagnostic report and validates against the schema" with
  // `err.message must be a string (was missing)` (2026-09-21).
  'err?': [
    {
      // Proof: on 2026-09-25, narrowing this to the current `corj/v0.15` refused a stored
      // `corj/v0.14` record and failed "accepts a failure record written before the report format
      // moved".
      v: '/^corj\\//',
      occurrence_id: 'string',
      'fingerprint?': 'string',
      '[string]': 'unknown',
    },
    '|',
    { occurrence_id: 'string', reported: 'false', reason: 'string' },
  ],
  '[string]': 'unknown',
});
export type LogRecord = typeof LogRecord.infer;
