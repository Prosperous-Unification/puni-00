import type { LintInterrupt, LintInterrupts } from './lint-interrupts';

export const lintParentMode = '--puni-lint-parent-v1';
export const lintControl = {
  ready: 'puni-lint-ready-v1',
  start: 'puni-lint-start-v1',
  finished: 'puni-lint-finished-v1',
  SIGINT: 'puni-lint-SIGINT-v1',
  SIGTERM: 'puni-lint-SIGTERM-v1',
} as const;

export type LintParentMessage = (typeof lintControl)['start' | 'SIGINT' | 'SIGTERM'];

type Start =
  | { readonly kind: 'started' }
  | { readonly kind: 'cancelled'; readonly signal: LintInterrupt }
  | { readonly kind: 'failed'; readonly cause: Error };

export type LintParentControl =
  | { readonly kind: 'standalone' }
  | {
      readonly kind: 'connected';
      readonly start: Promise<Start>;
      readFailure(): Error | undefined;
      finishLifecycle(): void;
      releaseControl(): void;
    };

/**
 * Bind the installed parent's ordered private IPC lane to the executable's existing broker.
 * Ready follows all handler installation; start gates operation IO, while prior cancellation
 * may complete without starting. Unknown messages never appear in diagnostics. Channel loss
 * records failure and requests broker-owned stage cleanup, retaining a final exit1 outcome.
 * Only the distinct private argv mode requests this lane; older closed-mode launchers reject
 * that marker before work. Standalone/archive native-signal execution remains unchanged.
 * finishLifecycle means executable settlement, including an explicitly retained cleanup failure;
 * it does not prove detached groups absent. releaseControl quiesces callbacks before attempting
 * every handler/subscription removal; it must precede broker disposal. A failed removal remains
 * a contained failure while late callbacks stay inert. The actual executable
 * must exit immediately afterward to retire its native IPC connection, as with output refs.
 * @throws for absent required IPC or failed native channel setup/reporting.
 */
export function createLintParentControl(
  interrupts: LintInterrupts,
  requested: boolean,
): LintParentControl {
  if (!requested) return { kind: 'standalone' };
  // Proof: child-ipc-required; `actual installed launcher ordered parent control > requires real IPC when private parent control is requested` failed with the recorded source fault and passed after restoration.
  if (!process.connected) throw new Error('installed lint parent control requires an IPC channel');
  function sendNotice(message: typeof lintControl.ready | typeof lintControl.finished): void {
    // Proof: child-sender-required; `contains actual child missing-sender failures within its owned executable boundary` failed with the recorded source fault and passed after restoration.
    if (typeof process.send !== 'function')
      throw new Error('installed lint parent control requires an IPC sender');
    process.send(message);
  }
  const start = Promise.withResolvers<Start>();
  let hasStarted = false;
  let isReleased = false;
  let subscription:
    { readonly kind: 'absent' } | { readonly kind: 'registered'; readonly release: () => void } = {
    kind: 'absent',
  };
  let failure: Error | undefined;
  function failControl(cause: Error): void {
    // Proof: child-first-failure; `preserves the first control failure while another invalid control arrives during cleanup` failed with the recorded source fault and passed after restoration.
    failure ??= cause;
    // Proof: child-failure-termination; `actual installed launcher ordered parent control > cleans its actual live stage after duplicate-start` failed with the recorded source fault and passed after restoration.
    start.resolve({ kind: 'failed', cause: failure });
    interrupts.recordInterrupt('SIGTERM');
  }
  // Proof: child-late-message; `contains actual child release-finished-late failures within its owned executable boundary` failed with the recorded source fault and passed after restoration.
  function receiveControl(message: unknown): void {
    if (isReleased) return;
    switch (message) {
      case lintControl.start:
        // Proof: child-duplicate-start; `actual installed launcher ordered parent control > cleans its actual live stage after duplicate-start` failed with the recorded source fault and passed after restoration.
        if (hasStarted) {
          failControl(new Error('duplicate parent start'));
          return;
        }
        hasStarted = true;
        start.resolve({ kind: 'started' });
        return;
      case lintControl.SIGINT:
        interrupts.recordInterrupt('SIGINT');
        return;
      case lintControl.SIGTERM:
        interrupts.recordInterrupt('SIGTERM');
        return;
      default:
        // Proof: child-unknown-control; `actual installed launcher ordered parent control > rejects unknown control without echoing its payload or starting a stage` failed with the recorded source fault and passed after restoration.
        failControl(new Error('invalid parent control'));
    }
  }
  // Proof: child-late-disconnect; `contains actual child disconnect-finished-late failures within its owned executable boundary` failed with the recorded source fault and passed after restoration.
  function disconnectControl(): void {
    if (isReleased) return;
    // Proof: child-disconnect-failure; `actual installed launcher ordered parent control > refuses parent disconnect before start without running a stage` failed with the recorded source fault and passed after restoration.
    failControl(new Error('parent control channel closed before executable settlement'));
  }
  function releaseControl(): void {
    // Stop callback admission before removals; even a failed off cannot reach a disposed broker.
    // Proof: child-logical-release; `contains actual child release-finished-late failures within its owned executable boundary` failed with the recorded source fault and passed after restoration.
    isReleased = true;
    const failures: unknown[] = [];
    const removals: readonly (() => void)[] = [
      () => {
        process.off('message', receiveControl);
      },
      () => {
        process.off('disconnect', disconnectControl);
      },
      () => {
        // Proof: child-release-subscription; `contains actual child subscription-release failures within its owned executable boundary` failed with the recorded source fault and passed after restoration.
        if (subscription.kind === 'registered') subscription.release();
      },
    ];
    for (const removeListener of removals) {
      try {
        removeListener();
      } catch (cause) {
        // Proof: child-release-remaining; `contains actual child release failures within its owned executable boundary` failed with the recorded source fault and passed after restoration.
        failures.push(cause);
      }
    }
    if (failures.length > 0)
      throw new AggregateError(failures, 'cannot release installed parent control');
  }
  try {
    subscription = {
      kind: 'registered',
      release: interrupts.subscribe((signal) => {
        start.resolve({ kind: 'cancelled', signal });
      }),
    };
    process.on('message', receiveControl);
    process.on('disconnect', disconnectControl);
    // Proof: child-ready-delivery; `actual installed launcher ordered parent control > does not launch a stage before start and reports finished after lifecycle settlement` failed with the recorded source fault and passed after restoration.
    sendNotice(lintControl.ready);
  } catch (cause) {
    try {
      // Proof: child-partial-rollback; `contains actual child registration-release failures within its owned executable boundary` failed with the recorded source fault and passed after restoration.
      releaseControl();
    } catch (releaseFailure) {
      throw new AggregateError(
        [cause, releaseFailure],
        'cannot initialize installed parent control',
        { cause: releaseFailure },
      );
    }
    throw cause;
  }
  return {
    kind: 'connected',
    start: start.promise,
    readFailure: () => failure,
    finishLifecycle: () => {
      // Proof: child-finished-notice; `actual installed launcher ordered parent control > does not launch a stage before start and reports finished after lifecycle settlement` failed with the recorded source fault and passed after restoration.
      sendNotice(lintControl.finished);
    },
    releaseControl,
  };
}
