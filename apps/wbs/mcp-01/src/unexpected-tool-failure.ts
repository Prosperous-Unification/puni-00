import { createFailureRedaction, reportFailure } from '@shared/failures';
import type { Logger } from '@wbs/contracts';
import { registerReportedFailure } from '@wbs/observability';

/** The public failure sentence and correlation handle returned to an MCP caller. */
export interface UnexpectedToolDisclosure {
  readonly sentence: string;
  readonly occurrenceId: string;
}

/** Reports one unexpected tool failure and returns only its public disclosure. */
export type UnexpectedToolFailureReporter = (caught: unknown) => UnexpectedToolDisclosure;

/**
 * Builds one MCP tool reporter and one reusable redaction policy for an application composition.
 *
 * Each invocation reports and logs exactly once. `secrets` contains only values owned by the
 * composition; caller credentials and request data never enter the reporting context.
 */
export function createUnexpectedToolFailureReporter(
  logger: Logger,
  secrets: readonly string[],
): UnexpectedToolFailureReporter {
  // Proof: on 2026-09-21, building this policy with `[]` exposed `boundary-secret` in the
  // operator line and failed the reporter's owned-secret assertion.
  const redact = createFailureRedaction(secrets);
  return (caught) => {
    const reporting = reportFailure(caught, { redact });
    // Proof: on 2026-09-21, duplicating this call produced two captured calls and failed the
    // reporter's exact-one-call assertion.
    // Proof: on 2026-09-21, logging `reporting` without registration made the serializer create a
    // second occurrence and failed the diagnostic/public occurrence assertion.
    logger.error({ err: registerReportedFailure(reporting) }, 'unexpected MCP tool failure');
    return reporting.reported
      ? {
          sentence: reporting.reports.public.message,
          occurrenceId: reporting.reports.public.occurrence_id,
        }
      : {
          sentence: 'the failure could not be described',
          occurrenceId: reporting.occurrenceId,
        };
  };
}
