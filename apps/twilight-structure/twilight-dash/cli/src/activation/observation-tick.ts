import { join } from 'node:path';

import { openActivationController } from './controller';
import { createGitHubPullRequestSource, type GitHubPullRequestReader } from './github-source';
import { type ObservationStateConfig, withRecoveryObservation } from './observation-state';

export interface ObservationTickConfig {
  readonly state: ObservationStateConfig;
  readonly reader: GitHubPullRequestReader;
  readonly signal: AbortSignal;
  readonly cleanupMs: number;
}

export type ObservationTickOutcome =
  | { readonly kind: 'busy' }
  | { readonly kind: 'deferred' }
  | { readonly kind: 'complete'; readonly requestCount: number }
  | { readonly kind: 'cancelled' };

/** Runs one owned observation, settling its controller before SQLite and lock cleanup. */
export async function runObservationTick(
  config: ObservationTickConfig,
): Promise<ObservationTickOutcome> {
  // Proof: omitting this finite cleanup bound let a zero-budget tick complete
  // instead of refusing malformed policy in the mounted budget fixture.
  if (!Number.isSafeInteger(config.cleanupMs) || config.cleanupMs < 1 || config.cleanupMs > 60_000)
    throw new Error('observation cleanup budget malformed');
  // Proof: omitting this pre-lock check changed the mounted malformed-budget
  // refusal to the later state-policy parser's diagnostic; no authority passed.
  if (
    !Number.isSafeInteger(config.state.policy.wholeTickMs) ||
    config.state.policy.wholeTickMs < 1 ||
    config.state.policy.wholeTickMs > 3_600_000
  )
    throw new Error('observation whole-tick budget malformed');
  // Proof: omitting this preflight let an already-aborted signal acquire the
  // owner and report a complete scan in the mounted zero-provider-read test.
  if (config.signal.aborted) return { kind: 'cancelled' };
  const deadline = performance.now() + config.state.policy.wholeTickMs;
  let cleanupDeadline = deadline + config.cleanupMs;
  const aborter = new AbortController();
  const isCancelled = (): boolean => aborter.signal.aborted || performance.now() >= deadline;
  let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
  let settled = false;
  const onAbort = () => {
    aborter.abort();
    cleanupDeadline = Math.min(cleanupDeadline, performance.now() + config.cleanupMs);
    // A continuation that ignores cancellation may not release SQLite or the
    // process lock. The supervised process must exit while still owning both.
    cleanupTimer ??= setTimeout(
      () => {
        // Proof: omitting fatal exit left a still-owned local continuation alive
        // past the cleanup budget in the real child/second-owner witness.
        if (!settled) process.exit(124);
      },
      Math.max(0, cleanupDeadline - performance.now()),
    );
  };
  config.signal.addEventListener('abort', onAbort, { once: true });
  const deadlineTimer = setTimeout(onAbort, config.state.policy.wholeTickMs);
  try {
    const owned = await withRecoveryObservation(
      config.state,
      async () => {
        if (aborter.signal.aborted) return { kind: 'cancelled' as const };
        const source = createGitHubPullRequestSource(config.state.binding, config.reader);
        const controller = openActivationController({
          databasePath: join(config.state.stateDirectory, 'activation.sqlite'),
          bootstrapPath: config.state.bootstrapPath,
          pin: config.state.pin,
          clock: config.state.clock,
          ...source,
          selectObligations: () => {
            throw new Error('observation tick cannot select evaluation obligations');
          },
        });
        let outcome:
          | { readonly kind: 'complete'; readonly requestCount: number }
          | { readonly kind: 'cancelled' }
          | { readonly kind: 'failure'; readonly cause: unknown };
        try {
          // Proof: omitting await closed SQLite before the abort-ignoring
          // continuation settled; the mounted witness reached closed-database access.
          // Proof: adding a claim here changed lease_owner to forbidden-probe;
          // this tick must record observation only, without downstream authority.
          // Proof: injecting a fetch dispatch here made the mounted forbidden-effect
          // spy observe one call instead of zero; the controller has no effect ports.
          const requests = await controller.reconcileReady({
            signal: aborter.signal,
            deadline,
            // Proof: omitting this protected cap made the mounted one-subject
            // tick reconcile two PRs and report complete instead of refusing.
            maxSubjects: config.state.policy.maxSubjects,
          });
          outcome = isCancelled()
            ? { kind: 'cancelled' }
            : { kind: 'complete', requestCount: requests.length };
        } catch (cause) {
          outcome = isCancelled() ? { kind: 'cancelled' } : { kind: 'failure', cause };
        }
        try {
          controller.close();
        } catch (cleanupFailure) {
          // Proof: dropping cleanupFailure from this aggregate lost the controller
          // close sentinel alongside an authentic provider failure.
          if (outcome.kind === 'failure')
            throw new AggregateError(
              [outcome.cause, cleanupFailure],
              'observation tick and controller cleanup failed',
              { cause: cleanupFailure },
            );
          throw new Error('observation controller cleanup failed', { cause: cleanupFailure });
        }
        if (outcome.kind === 'failure')
          throw new Error('observation tick failed', { cause: outcome.cause });
        // Proof: omitting this post-close cancellation changed the mounted
        // synchronous-close journal fact from cancelled to complete, although
        // the outer outcome fence still returned cancelled.
        return outcome.kind === 'complete' && isCancelled()
          ? { kind: 'cancelled' as const }
          : outcome;
      },
      () => {
        // Proof: omitting this monotonic lock-held fence returned complete after
        // synchronous close exceeded both tick and cleanup deadlines; timers
        // cannot fire while synchronous close blocks the event loop.
        if (performance.now() >= cleanupDeadline) process.exit(124);
      },
      isCancelled,
    );
    if (owned.kind === 'busy') return { kind: 'busy' };
    if (owned.kind === 'deferred') return { kind: 'deferred' };
    // Proof: relabelling after terminal COMMIT made the mounted slow terminal
    // close return cancelled despite its retained complete journal fact.
    return owned.terminalOutcome === 'cancelled' ? { kind: 'cancelled' } : owned.value;
  } finally {
    settled = true;
    clearTimeout(deadlineTimer);
    if (cleanupTimer !== undefined) clearTimeout(cleanupTimer);
    config.signal.removeEventListener('abort', onAbort);
  }
}
