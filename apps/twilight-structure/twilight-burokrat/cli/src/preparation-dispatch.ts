import { Buffer } from 'node:buffer';

import type { PreparationContext } from './policy/preparation-source';
import { prepareBunRelocation } from './policy/prepare-bun-relocation';
import { PreparationFailure, prepareBunToolkit } from './policy/prepare-bun-toolkit';
import type { PreparationExecution } from './preparation-execution';
import type { PreparationRequest } from './preparation-request';

export interface PreparationDispatch extends PreparationContext, PreparationExecution {
  readonly launch: (entrypoint: string) => readonly string[];
}

/**
 * Execute one already decoded request under the caller's signal/output authority. The current
 * preparation APIs retain digest/placement and partial-output ownership. No argv, stdin,
 * ambient environment or process status is consulted here. API failure remains throwable for
 * the caller's bounded reporter, including nested cleanup causes. Outward cancellation reports
 * retained outputs; inability to deliver that diagnostic is failure rather than a claimed
 * controlled cancellation. Native bytes written before cancellation cannot be retracted.
 */
export async function executePreparation(
  request: PreparationRequest,
  context: PreparationDispatch,
): Promise<number> {
  const stdout = context.outputs.stdout,
    reportDiagnostic = context.outputs.reportDiagnostic;
  async function reportCancellation(
    status: 130 | 143,
    directories: readonly string[],
    archive: string | undefined,
  ): Promise<number> {
    // Proof: c27-dispatch-retained-cancel; injected fault failed `reports owned materialization before returning controlled build cancellation`; restoration passed.
    if (directories.length === 0 && archive === undefined) return status;
    const reported = await reportDiagnostic(
      Buffer.from(
        'puni preparation: cancelled; retained directories: ' +
          directories.join(', ') +
          (archive === undefined ? '' : '; retained archive: ' + archive) +
          '\n',
      ),
    );
    // Proof: c27-dispatch-abandoned-diagnostic; injected fault failed `returns failure when retained-output cancellation diagnostics cannot be delivered`; restoration passed.
    return reported.kind === 'reported' ? status : 1;
  }
  const outcome =
    request.command === 'prepare-activation'
      ? await prepareBunToolkit(request, context)
      : await prepareBunRelocation(request, context);
  try {
    if (outcome.kind === 'cancelled')
      // Proof: c27-dispatch-build-report-awaited; injected fault failed `retains build outputs when cancellation diagnostics reject`; restoration passed.
      return await reportCancellation(outcome.status, outcome.ownedDirectories, outcome.archive);
    const written = await stdout(Buffer.from(outcome.lines.join('\n') + '\n'));
    if (written.kind === 'cancelled')
      // Proof: c27-dispatch-completed-report-awaited; injected fault failed `retains completed-output outputs when cancellation diagnostics reject`; restoration passed.
      return await reportCancellation(
        written.signal === 'SIGINT' ? 130 : 143,
        outcome.ownedDirectories,
        outcome.archive.path,
      );
    return 0;
  } catch (cause) {
    // Proof: c27-dispatch-retention-failure; injected fault failed `retains every completed output in the native owner diagnostic when stdout rejects`; restoration passed.
    throw new PreparationFailure(
      outcome.ownedDirectories,
      outcome.kind === 'prepared' ? outcome.archive.path : outcome.archive,
      cause,
    );
  }
}
