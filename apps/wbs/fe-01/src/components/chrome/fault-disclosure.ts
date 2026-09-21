import { createFailureRedaction, reportFailure } from '@shared/failures';

/**
 * The redaction policy both fault boundaries report through, built once.
 *
 * Empty, and that is the whole list: this app owns no secret. Its session token lives in an
 * `HttpOnly` cookie the document cannot read, so there is no value here to compile into a
 * pattern rule. The key rules of `@shared/failures` are still in force — an `authorization`
 * property on a caught fetch failure is skipped whatever this list says.
 *
 * A module constant because the library caches one report maker per policy; building one per
 * caught fault would throw that cache away on the one path that is already in trouble.
 */
const FAULT_REDACTION = createFailureRedaction([]);

/**
 * What was lost while deciding what a caught fault discloses.
 *
 * Modelled rather than silent, and written into the console line, because either loss means
 * the reader is being told less than the boundary would normally say.
 */
export type DisclosureLoss = 'nothing' | 'the report' | 'the selector';

/**
 * What a boundary may put on screen and in the console about a fault it caught.
 *
 * `sentence` is disclosed text and nothing else: either a kind's own selected words, or the
 * public report's generic message. `occurrenceId` correlates this fault with the operator's
 * record of it, and is the one handle a reader can quote.
 */
export interface DisclosedFault {
  /** The generic public message or a kind selector's validated public sentence. */
  readonly sentence: string;
  /** The public report's occurrence identifier, or a local handle when reporting was lost. */
  readonly occurrenceId: string;
  /** Whether this disclosure is the whole of what the boundary could say. */
  readonly lost: DisclosureLoss;
}

/**
 * What a reader is told when reporting itself failed and there is no public report to read.
 *
 * Fixed text rather than anything derived from the caught value: reading that value is what
 * threw.
 */
const REPORTING_LOST_SENTENCE = 'the failure could not be described';

/**
 * Decide what one caught value discloses, without ever throwing and without reading the
 * caught value directly.
 *
 * **Nothing raw crosses this function.** A thrown `Error`'s own `message` and `stack`, and
 * any value hanging off it, reach `reportFailure` and stay inside the diagnostic report,
 * which this function drops. What comes back is the public report's `code`-keyed generic
 * message — `Something went wrong` for anything untyped — under the occurrence id both
 * reports share. The browser console and the DOM are disclosure boundaries, so they get
 * exactly that.
 *
 * **Nothing here may throw, and two things very nearly do.** This runs inside
 * `componentDidCatch`, where a throw is not caught by the boundary already handling the
 * fault: it escapes upward, and with it the page. A caught value that cannot be inspected —
 * an `Error` whose `message` is a throwing own accessor, one whose cause is a revoked
 * `Proxy` — must therefore come back as an outcome and never as a second failure.
 * `reportFailure` models its own half; the selector is this function's to protect, so it is
 * called **after** the report, only when the report succeeded, and inside a guard. A value
 * that already defeated the reporter is never offered a selector, because reading it is what
 * defeated the reporter.
 *
 * A revoked `Proxy` thrown *as* the value never arrives here at all: react-dom's own
 * `handleThrow` reads it while the render is still unwinding and throws first (watched under
 * jsdom, 2026-09-20). That is React's, not this module's, and no boundary can catch it.
 *
 * **The diagnostic report is discarded, deliberately and for now.** There is no browser
 * telemetry endpoint in this repository and the adoption plan explicitly adds none, so
 * nothing in a browser can deliver an operator record. The occurrence id is therefore a
 * handle to a record that does not exist yet; it still correlates the sentence on screen
 * with the console line beside it, and it is what a reader quotes.
 *
 * @param thrown The value React caught. Any value, including primitives and hostile objects.
 * @param select A kind-specific disclosure selector, for a failure whose own words are
 *   already public by construction. It receives the caught value and returns the sentence to
 *   disclose, or `null` to fall back to the generic public message. It may throw; that is a
 *   modelled outcome and not a fault. Omitted where a boundary discloses nothing of its own.
 * @returns The sentence to render, the handle to quote, and what was lost deciding them.
 */
export function discloseFault(
  thrown: unknown,
  select?: (thrown: unknown) => string | null,
): DisclosedFault {
  const reporting = reportFailure(thrown, { redact: FAULT_REDACTION });
  // Proof: moving the selector above this guard offered an unreportable value to it;
  // 'never offers an unreportable value to a disclosure selector' observed one call (N10,
  // 2026-09-21).
  if (!reporting.reported) {
    return {
      sentence: REPORTING_LOST_SENTENCE,
      occurrenceId: reporting.occurrenceId,
      lost: 'the report',
    };
  }
  const disclosed = reporting.reports.public;
  let selected: string | null;
  // Proof: removing this guard let 'the selector could not read it' escape instead of reaching
  // the modelled selector-loss assertion (N11, 2026-09-21).
  try {
    selected = select?.(thrown) ?? null;
    // The one modelled recovery here: a selector that cannot read the value it was given
    // discloses nothing, which is the safe direction, and `lost` says so rather than the
    // page pretending the boundary had a choice.
  } catch {
    return {
      sentence: disclosed.message,
      occurrenceId: disclosed.occurrence_id,
      lost: 'the selector',
    };
  }
  return {
    // Proof: falling back to 'thrown.message' put 'alice@example.com' in the DOM and failed
    // 'puts neither the message, the cause nor a stack into the DOM' (N2, 2026-09-21).
    sentence: selected ?? disclosed.message,
    occurrenceId: disclosed.occurrence_id,
    lost: 'nothing',
  };
}
