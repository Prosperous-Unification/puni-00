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
  service: "'be-01'|'gw-01'|'fe-01'",
  'request_id?': 'string',
  'connection_id?': 'string',
  'user_id?': 'string',
  'ws_subscription?': 'string',
  'trace_id?': 'string',
  'span_id?': 'string',
  'version?': 'string',
  'err?': [
    {
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
