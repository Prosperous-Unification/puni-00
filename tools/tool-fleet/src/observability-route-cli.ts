import {
  RouteCleanupFailure,
  routeCommandPrefix,
  runObservabilityRoute,
  UncertainRouteOperation,
} from './observability-route';

/** Fixed diagnostics keep trusted credential-bearing state and subprocess bodies out of stderr. */
export async function runObservabilityRouteCli(
  arguments_: readonly string[],
  options?: Parameters<typeof runObservabilityRoute>[1],
): Promise<void> {
  try {
    const completed = await runObservabilityRoute(arguments_, options);
    console.log(JSON.stringify({ state: 'completed', ...completed, scope: 'dev-route-operation' }));
  } catch (error) {
    if (error instanceof RouteCleanupFailure) {
      console.error(
        JSON.stringify({
          state: 'cleanup-failed',
          reason: 'ownership-release-failed',
          outcome: error.outcome,
          inspection: error.inspection,
          ownershipPath: error.ownershipPath,
          receiptInspection: ['cat', '--', ...error.outcome.receipts],
          recoveryCommands: [],
        }),
      );
      process.exitCode = 1;
      return;
    }
    if (error instanceof Error && error.message === 'route-arguments') {
      console.error(
        JSON.stringify({
          state: 'refused',
          reason: 'route-arguments',
          command: routeCommandPrefix(),
        }),
      );
      process.exitCode = 1;
      return;
    }
    if (error instanceof UncertainRouteOperation) {
      console.error(
        JSON.stringify({
          state: 'uncertain',
          operationId: error.operationId,
          directory: error.directory,
          inspection: error.inspection,
          recoveryCommands: error.recoveryCommands,
          uncertaintyRecorded: error.uncertaintyRecorded,
          persistenceFailures: error.persistenceFailures,
        }),
      );
      process.exitCode = 1;
      return;
    }
    const message = error instanceof Error ? error.message.replace(/^history-/, 'route-') : '';
    console.error(/^route-[a-z-]+$/.test(message) ? message : 'route-operation-failed');
    process.exitCode = 1;
  }
}
if (import.meta.main) await runObservabilityRouteCli(process.argv.slice(2));
