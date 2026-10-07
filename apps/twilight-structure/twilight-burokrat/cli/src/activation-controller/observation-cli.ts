import type { GitHubPullRequestReader } from './github-source';
import type { ObservationStateConfig } from './observation-state';
import { type ObservationTickOutcome, runObservationTick } from './observation-tick';

export interface ObservationCliConfig {
  readonly state: ObservationStateConfig;
  readonly reader: GitHubPullRequestReader;
  readonly cleanupMs: number;
}

/** Maps one finite tick to process status without treating incomplete work as success. */
export function observationExitCode(
  outcome: ObservationTickOutcome,
  signal?: 'SIGINT' | 'SIGTERM',
): number {
  if (outcome.kind === 'complete') return 0;
  // Proof: mapping busy to zero failed the mounted CLI status assertion 75.
  if (outcome.kind === 'busy') return 75;
  if (signal === 'SIGINT') return 130;
  if (signal === 'SIGTERM') return 143;
  return 124;
}

/** Installs signal cancellation only for one invocation; service provisioning is separate. */
export async function runObservationCli(config: ObservationCliConfig): Promise<number> {
  const aborter = new AbortController();
  let signal: 'SIGINT' | 'SIGTERM' | undefined;
  const onInterrupt = () => {
    signal = 'SIGINT';
    aborter.abort();
  };
  const onTerminate = () => {
    signal = 'SIGTERM';
    aborter.abort();
  };
  process.on('SIGINT', onInterrupt);
  process.on('SIGTERM', onTerminate);
  try {
    const outcome = await runObservationTick({ ...config, signal: aborter.signal });
    return observationExitCode(outcome, signal);
  } catch {
    // The runner reports only a bounded status here; trusted supervisory logs
    // must own detailed diagnostics so provider errors cannot print credentials.
    return signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1;
  } finally {
    process.off('SIGINT', onInterrupt);
    process.off('SIGTERM', onTerminate);
  }
}
