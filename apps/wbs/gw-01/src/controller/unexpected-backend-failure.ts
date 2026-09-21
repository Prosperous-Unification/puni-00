import { createFailureRedaction, reportFailure } from '@shared/failures';
import type { Logger } from '@wbs/contracts';
import { registerReportedFailure } from '@wbs/observability';

/** The gateway backend request that rejected at the owning WebSocket boundary. */
export type GatewayBackendOperation = 'forward' | 'resume';

/** One unexpected live backend rejection and its established connection correlation. */
export interface UnexpectedBackendFailure {
  readonly caught: unknown;
  readonly operation: GatewayBackendOperation;
  readonly connectionId: string;
  readonly clientId: string;
}

/** Reports one unexpected live backend rejection to the gateway's operator sink. */
export type UnexpectedBackendFailureReporter = (failure: UnexpectedBackendFailure) => void;

/**
 * Builds one reporter and reusable redaction policy for a gateway composition.
 *
 * Each invocation reports and logs exactly once. `secrets` must contain every secret owned by
 * that composition. A sink failure still throws; writing no diagnostic record is not successful
 * failure handling.
 */
export function createUnexpectedBackendFailureReporter(
  logger: Logger,
  secrets: readonly string[],
): UnexpectedBackendFailureReporter {
  const redact = createFailureRedaction(secrets);
  return (failure) => {
    const reporting = reportFailure(failure.caught, {
      redact,
      context: { operation: failure.operation },
    });
    logger.error(
      {
        err: registerReportedFailure(reporting),
        connection_id: failure.connectionId,
        user_id: failure.clientId,
        backend_operation: failure.operation,
      },
      'gateway backend request failed',
    );
  };
}
