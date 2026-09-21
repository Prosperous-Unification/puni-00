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
  const redact = createFailureRedaction(secrets);
  return (caught) => {
    const reporting = reportFailure(caught, { redact });
    logger.error({ err: registerReportedFailure(reporting) }, 'unexpected endpoint failure');
  };
}
