import { type FailureReporting, reportFailure } from '@shared/failures';
import type { DiagnosticReport, RedactionPolicy } from 'application-exception';

/**
 * What the operator sink is given when no report of a failure could be built at all.
 *
 * The loss is modelled here rather than propagated, because Pino does not catch a throwing
 * serializer: it rethrows into the `logger.error(...)` call and writes no line whatsoever.
 */
export interface SerializedFailureLoss {
  readonly occurrence_id: string;
  readonly reported: false;
  readonly reason: string;
}

/** The operator-facing record of one failure: the diagnostic report, or the modelled loss. */
export type SerializedFailure = DiagnosticReport | SerializedFailureLoss;

/**
 * Reporting outcomes this process produced itself.
 *
 * A caught value is untrusted data: anything can carry a `reported` property, a
 * `reports.diagnostic` object or a getter, so provenance cannot be read off the value's own
 * shape. Only an outcome a boundary handed to {@link registerReportedFailure} is reused;
 * everything else is reported afresh under the caller's redaction policy. Reading the map neither
 * invokes accessors nor throws on a revoked `Proxy`, which is why it is the first thing the
 * serializer does.
 */
const reportedFailures = new WeakMap<object, FailureReporting>();

/**
 * Mark a reporting outcome as this process's own, so logging it reuses its reports instead of
 * reporting the outcome object itself as a new failure under a second occurrence id.
 *
 * This is the whole interface a boundary that already called `reportFailure` — because it needed
 * the public report for its response — uses:
 * `logger.error({ err: registerReportedFailure(reporting) }, 'operation failed')`.
 *
 * @param reporting An outcome of `reportFailure` from `@shared/failures`.
 * @returns The same outcome, now trusted by {@link createFailureSerializer}.
 */
export function registerReportedFailure(reporting: FailureReporting): FailureReporting {
  reportedFailures.set(reporting, reporting);
  return reporting;
}

/**
 * Replace an explicitly present `err: undefined` with a reported outcome of that very value.
 *
 * Pino drops a property whose value is `undefined` before any serializer sees it
 * (`pino/lib/tools.js:168` tests `value !== undefined` inside the field loop), so a boundary that
 * caught `undefined` and logged `{ err }` would get a line carrying no failure record at all —
 * indistinguishable from a line that was never about a failure. The value is reported here
 * instead of dropped, and the outcome is registered so the serializer reuses it rather than
 * reporting a second occurrence. A record with no `err` property is left exactly as it is.
 *
 * `formatters.log` is where this must happen: Pino calls it on the whole field object before the
 * loop that drops undefined values.
 *
 * @param fields One log record's fields, as Pino assembled them.
 * @param redact The policy of the boundary that owns the logger.
 * @returns The same fields, or a copy whose `err` is a reported outcome.
 */
export function keepAbsentFailure(
  fields: Record<string, unknown>,
  redact: RedactionPolicy,
): Record<string, unknown> {
  // Proof: dropping `|| fields['err'] !== undefined` substituted a report of `undefined` for
  // every logged failure and failed "reports the failure it was given, never a substitute" on
  // `Expected to contain: "Error: the real failure"` (2026-09-21).
  if (!('err' in fields) || fields['err'] !== undefined) return fields;
  return { ...fields, err: registerReportedFailure(reportFailure(undefined, { redact })) };
}

/** Fixed text: a thrown message may quote the very value the policy was protecting. */
const SERIALIZER_LOST_REASON = 'the failure could not be read for logging; its reports are lost';

/** Losses inside this serializer, so two of them never share a correlation handle. */
let unserializableFailures = 0;

/** A correlation handle for a failure no report could be built from. */
function nextSerializerLoss(): SerializedFailureLoss {
  // Proof: with `@shared/failures`' wrapper broken so this fallback answers, replacing this
  // increment with `unserializableFailures = 1` failed "gives two lost reports two different
  // correlation handles" on `Expected: not "UNSERIALIZED_1"` (2026-09-21).
  unserializableFailures += 1;
  return {
    occurrence_id: `UNSERIALIZED_${String(unserializableFailures)}`,
    reported: false,
    reason: SERIALIZER_LOST_REASON,
  };
}

/**
 * Turn what a boundary logged under `err` into the operator's record of that failure.
 *
 * Only the DIAGNOSTIC report is written. The public report is what a user or an agent is told and
 * is deliberately content-free (`INTERNAL_ERROR`, a generic message); logging it instead would
 * leave the operator with nothing to debug, and the diagnostic report — messages, stacks, every
 * enumerable property — must never travel the other way, out to a user, an agent or a browser
 * console.
 *
 * Redaction and the size budget are applied once, by `@shared/failures`: a value that reaches
 * this serializer unregistered is reported here under `redact`, and a registered outcome was
 * reported under the policy its own boundary holds. Nothing is scrubbed twice and no raw caught
 * value is ever written.
 *
 * Every read of the value, the selection between the two outcomes and the construction of the
 * record sit inside one guard, because each of them can throw for a hostile value and Pino would
 * drop the whole line.
 *
 * @param redact The policy of the boundary that owns the logger, built once at startup.
 * @returns A Pino serializer that never throws, for any value whatsoever.
 */
export function createFailureSerializer(
  redact: RedactionPolicy,
): (value: unknown) => SerializedFailure {
  return (value: unknown): SerializedFailure => {
    // Proof: with `@shared/failures`' own never-throw wrapper broken, removing this guard let
    // `TypeError: Array.isArray cannot be called on a Proxy that has been revoked` escape the
    // serializer and write no record at all, failing "writes a visible loss rather than throwing
    // when no report can be built"; with the guard in place and the same dependency broken the
    // test still got a record and failed only on `Received: "UNSERIALIZED_1"` (2026-09-21).
    try {
      // Proof: replacing this lookup with a structural `value.reported !== undefined` read
      // disclosed `hunter2` from a forged outcome — `Received: "{\"occurrence_id\":\"forged\",
      // \"v\":\"corj/v0.14\",\"password\":\"hunter2\"}"` — and ran an accessor named
      // `reported` twice, failing all three provenance tests (2026-09-21).
      const own =
        typeof value === 'object' && value !== null ? reportedFailures.get(value) : undefined;
      const reporting = own ?? reportFailure(value, { redact });
      return reporting.reported
        ? // Proof: writing `reporting.reports.public` here failed "never writes the public report
          // in place of the diagnostic one" on `Expected: "corj/v0.14"` /
          // `Received: "appex/public/v4"` (2026-09-21).
          reporting.reports.diagnostic
        : {
            occurrence_id: reporting.occurrenceId,
            reported: false,
            reason: reporting.reason,
          };
    } catch {
      return nextSerializerLoss();
    }
  };
}
