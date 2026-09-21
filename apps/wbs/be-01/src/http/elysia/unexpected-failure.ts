import { createFailureRedaction, reportFailure } from '@shared/failures';
import type { Logger } from '@wbs/contracts';
import { registerReportedFailure } from '@wbs/observability';

/** Reports one unexpected backend boundary failure to its operator sink. */
export type UnexpectedFailureReporter = (caught: unknown) => void;

/** Builds one reporter and one reusable redaction policy for an application composition. */
export function createUnexpectedFailureReporter(
  logger: Logger,
  secrets: readonly string[],
): UnexpectedFailureReporter {
  // Proof: on 2026-09-21, replacing `secrets` with `[]` made “logs one registered,
  // redacted report under its original occurrence” emit a line containing `boundary-secret`.
  const redact = createFailureRedaction(secrets);
  return (caught) => {
    const reporting = reportFailure(caught, { redact });
    // Proof: on 2026-09-21, logging `reporting` directly made “logs one registered,
    // redacted report under its original occurrence” receive an as_json/as_string wrapper instead
    // of the expected top-level occurrence_id and fingerprint.
    logger.error({ err: registerReportedFailure(reporting) }, 'unexpected endpoint failure');
  };
}
