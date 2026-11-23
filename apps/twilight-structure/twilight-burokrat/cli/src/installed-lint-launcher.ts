import { Buffer } from 'node:buffer';

import type { LintInterrupt, SubscribeLintInterrupts } from './lint-interrupts';
import type { LintDiagnostic, LintOutput } from './lint-output';
import { lintControl, type LintParentMessage } from './lint-parent-control';

type ExitObservation =
  { readonly kind: 'exited'; readonly status: number } | { readonly kind: 'failed' };

/** Recognize native integer observations without coercing other JavaScript values. */
function isInteger(value: unknown): value is number {
  return Number.isInteger(value);
}

interface Context {
  readonly argv: readonly string[];
  readonly directory: string;
  readonly environment: Readonly<Record<string, string>>;
  readonly stdin: Uint8Array;
  readonly stdout: LintOutput;
  readonly stderr: LintOutput;
  readonly reportDiagnostic: (bytes: Uint8Array) => Promise<LintDiagnostic>;
  readonly subscribeInterrupts: SubscribeLintInterrupts;
}

/** Original failures and stderr remain available even when the outward diagnostic sink failed. */
export class InstalledLintFailure extends AggregateError {
  readonly launcherPid: number;
  readonly stderr: Uint8Array;
  constructor(
    causes: readonly unknown[],
    launcherPid: number,
    stderr: Uint8Array,
    hasUnconfirmedStages: boolean,
  ) {
    super(
      causes,
      'installed lint launcher failed; launcher PID ' +
        String(launcherPid) +
        (hasUnconfirmedStages ? '; detached-stage cleanup is unconfirmed' : '') +
        (stderr.length === 0 ? '' : '\nlauncher stderr:\n' + Buffer.from(stderr).toString()),
    );
    this.launcherPid = launcherPid;
    this.stderr = stderr;
  }
}

/**
 * Own the installed launcher and both byte streams. Queued and later interrupts use the ordered
 * ready/start IPC lane; only the launcher escalates its independently detached stage groups.
 * A finished notice marks lifecycle settlement, including retained cleanup failures. Preserve
 * every normal status, including1 after cancellation. Outward failure requests child termination,
 * drains/discards remaining bytes and retains stderr. Exit1 after cancellation reports only
 * discarded stderr through the caller owner's one bounded terminal attempt; failed/abandoned
 * reporting throws with retained original bytes. Abandoned successful output returns cancellation. Unsolicited launcher death or lost control
 * never proves inner group absence. No parent escalation timer competes after start.
 * @throws InstalledLintFailure for stream/control/native death failures with retained identities.
 */
export async function runInstalledLintLauncher(context: Context): Promise<number> {
  let child: Bun.Subprocess<Uint8Array, 'pipe', 'pipe'> | undefined;
  let isReady = false;
  let hasStarted = false;
  let hasFinished = false;
  let hasDisconnected = false;
  let hasRequestedDisconnect = false;
  let hasRequestedTermination = false;
  let first: LintInterrupt | undefined;
  const queued: LintInterrupt[] = [];
  const failures: unknown[] = [];
  const stderr: Uint8Array[] = [];
  const discardedStderr: Uint8Array[] = [];
  function readInterruption(): LintInterrupt | undefined {
    return first;
  }
  function readCompletion(): { readonly hasStarted: boolean; readonly hasFinished: boolean } {
    return { hasStarted, hasFinished };
  }
  const failed = Promise.withResolvers<never>();
  void failed.promise.catch(() => undefined);
  const disconnected = Promise.withResolvers<undefined>();
  function recordFailure(cause: unknown): void {
    failures.push(cause);
    failed.reject(cause);
  }
  function disconnectLauncher(): void {
    if (child === undefined || hasDisconnected || hasRequestedDisconnect) return;
    hasRequestedDisconnect = true;
    try {
      // Proof: parent-disconnect-cause; `owns disconnect failure through remaining launcher operations before refusing` failed with the recorded source fault and passed after restoration.
      child.disconnect();
    } catch (cause) {
      recordFailure(cause);
    }
  }
  function sendControl(message: LintParentMessage): boolean {
    if (child === undefined) throw new Error('installed launcher control has no owned process');
    try {
      child.send(message);
      return true;
    } catch (cause) {
      // Proof: parent-send-cause; `owns send failure through remaining launcher operations before refusing` failed with the recorded source fault and passed after restoration.
      recordFailure(cause);
      disconnectLauncher();
      return false;
    }
  }
  function relayInterrupt(signal: LintInterrupt): void {
    if (hasFinished) return;
    if (!isReady) {
      // Proof: parent-queue-controls; `actual installed parent nested ownership > queues startup SIGINT/SIGTERM without native coalescing or reason reversal` failed with the recorded source fault and passed after restoration.
      queued.push(signal);
      return;
    }
    // Proof: parent-later-controls; `actual installed parent nested ownership > preserves grandchild grace and bounded first-signal cleanup through the actual parent` failed with the recorded source fault and passed after restoration.
    sendControl(lintControl[signal]);
  }
  function terminateLauncher(): void {
    if (hasRequestedTermination) return;
    hasRequestedTermination = true;
    relayInterrupt('SIGTERM');
  }
  function recordInterrupt(signal: LintInterrupt): void {
    // Proof: parent-first-reason; `preserves terminal 0 semantics when cancellation abandons outward bytes after launcher exit` failed with the recorded source fault and passed after restoration.
    first ??= signal;
    relayInterrupt(signal);
  }
  function receiveNotice(
    message: unknown,
    owned: Bun.Subprocess<Uint8Array, 'pipe', 'pipe'>,
  ): void {
    child ??= owned;
    // Proof: parent-duplicate-ready; `refuses actual launcher duplicate-ready notices despite a normal native exit0` failed with the recorded source fault and passed after restoration.
    if (message === lintControl.ready && !isReady && !hasFinished) {
      isReady = true;
      // Proof: parent-queued-before-start; `actual installed parent nested ownership > queues startup SIGINT/SIGTERM without native coalescing or reason reversal` failed with the recorded source fault and passed after restoration.
      for (const signal of queued.splice(0)) if (!sendControl(lintControl[signal])) return;
      // A thrown send may have delivered start; from this point stages can exist.
      hasStarted = true;
      sendControl(lintControl.start);
      return;
    }
    // Proof: parent-duplicate-finished; `refuses actual launcher duplicate-finished notices despite a normal native exit0` failed with the recorded source fault and passed after restoration.
    if (message === lintControl.finished && isReady && hasStarted && !hasFinished) {
      hasFinished = true;
      return;
    }
    // Proof: parent-unknown-notice; `refuses actual launcher duplicate-finished notices despite a normal native exit0` failed with the recorded source fault and passed after restoration.
    recordFailure(new Error('invalid installed lint launcher notice'));
    disconnectLauncher();
  }
  const unsubscribe = context.subscribeInterrupts(recordInterrupt);
  try {
    if (first !== undefined) return first === 'SIGINT' ? 130 : 143;
    try {
      child = Bun.spawn([...context.argv], {
        cwd: context.directory,
        env: context.environment,
        stdin: context.stdin,
        stdout: 'pipe',
        stderr: 'pipe',
        detached: true,
        ipc: receiveNotice,
        onDisconnect() {
          hasDisconnected = true;
          if (!hasFinished)
            recordFailure(
              new Error(
                'installed lint launcher control channel closed before lifecycle completion',
              ),
            );
          disconnected.resolve(undefined);
        },
      });
    } catch (cause) {
      throw new Error('cannot start verified installed lint launcher', { cause });
    }
    const owned = child;
    async function drainOutput(
      stream: ReadableStream<Uint8Array>,
      emit: LintOutput,
      capture: boolean,
    ): Promise<void> {
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      let isDiscarding = false;
      try {
        reader = stream.getReader();
        for (;;) {
          const next = await reader.read();
          if (next.done) return;
          if (capture) stderr.push(next.value.slice());
          if (first !== undefined || failures.length > 0) isDiscarding = true;
          if (isDiscarding) {
            if (capture) discardedStderr.push(next.value.slice());
            continue;
          }
          try {
            // Proof: parent-peer-release; `actual installed parent nested ownership > preserves the first output failure and releases a simultaneously stalled peer before cleanup` failed with the recorded source fault and passed after restoration.
            const written = await Promise.race([Promise.resolve(emit(next.value)), failed.promise]);
            if (written.kind === 'cancelled') {
              if (first === undefined) recordInterrupt(written.signal);
              if (capture) discardedStderr.push(next.value.slice());
              isDiscarding = true;
            }
          } catch (cause) {
            isDiscarding = true;
            if (capture) discardedStderr.push(next.value.slice());
            recordFailure(cause);
            // Proof: parent-output-terminate; `actual installed parent nested ownership > preserves the first output failure and releases a simultaneously stalled peer before cleanup` failed with the recorded source fault and passed after restoration.
            terminateLauncher();
          }
        }
        // Proof: parent-reader-catch; `owns reader failure through remaining launcher operations before refusing` failed with the recorded source fault and passed after restoration.
        // Proof: parent-reader-read-catch; `owns reader-read failure through remaining launcher operations before refusing` failed with the recorded source fault and passed after restoration.
      } catch (cause) {
        recordFailure(cause);
        terminateLauncher();
      } finally {
        try {
          // Proof: parent-reader-unacquired-cancel; `owns reader-cancel failure through remaining launcher operations before refusing` failed with the recorded source fault and passed after restoration.
          if (reader === undefined) await stream.cancel();
          // Proof: parent-reader-release; `owns reader-release failure through remaining launcher operations before refusing` failed with the recorded source fault and passed after restoration.
          else reader.releaseLock();
        } catch (cause) {
          // Proof: parent-reader-release-failure; `owns reader-release failure through remaining launcher operations before refusing` failed with the recorded source fault and passed after restoration.
          recordFailure(cause);
          terminateLauncher();
        }
      }
    }
    async function readExit(): Promise<ExitObservation> {
      try {
        const status: unknown = await owned.exited;
        // Proof: parent-exit-integer-null; `owns exit-null failure through remaining launcher operations before refusing` failed with the recorded source fault and passed after restoration.
        // Proof: parent-exit-integer-fraction; `owns exit-fraction failure through remaining launcher operations before refusing` failed with the recorded source fault and passed after restoration.
        // Proof: parent-exit-integer-string; `owns exit-string failure through remaining launcher operations before refusing` failed with the recorded source fault and passed after restoration.
        // Proof: parent-exit-integer-nan; `owns exit-nan failure through remaining launcher operations before refusing` failed with the recorded source fault and passed after restoration.
        if (!isInteger(status))
          throw new Error('installed lint launcher exit observation is not an integer');
        // Proof: parent-exit-negative; `owns exit-negative failure through remaining launcher operations before refusing` failed with the recorded source fault and passed after restoration.
        // Proof: parent-exit-range; `owns exit-range failure through remaining launcher operations before refusing` failed with the recorded source fault and passed after restoration.
        if (status < 0 || status > 255)
          throw new Error('installed lint launcher exit observation is outside0..255');
        return { kind: 'exited', status };
        // Proof: parent-exit-getter-catch; `owns exit-getter failure through remaining launcher operations before refusing` failed with the recorded source fault and passed after restoration.
      } catch (cause) {
        recordFailure(cause);
        terminateLauncher();
        return { kind: 'failed' };
      }
    }
    const operations = [
      readExit(),
      // Proof: parent-stdout-delivery; `preserves full large binary stdout/stderr and status37 through the actual installed chain` failed with the recorded source fault and passed after restoration.
      // Proof: parent-await-active-stdout; `awaits gated stdout after actual native exit and channel settlement before returning` failed when the running drain was not awaited and passed after restoration.
      drainOutput(owned.stdout, context.stdout, false),
      // Proof: parent-await-active-stderr; `awaits gated stderr after actual native exit and channel settlement before returning` failed when the running drain was not awaited and passed after restoration.
      drainOutput(owned.stderr, context.stderr, true),
      disconnected.promise,
    ] as const;
    const [exit] = await Promise.all(operations);
    // Proof: parent-native-signal; `owns signal-zero failure through remaining launcher operations before refusing` failed with the recorded source fault and passed after restoration.
    if (owned.signalCode !== null)
      recordFailure(new Error('installed lint launcher ended by ' + owned.signalCode));
    const completion = readCompletion();
    if (!completion.hasStarted || !completion.hasFinished)
      recordFailure(new Error('installed lint launcher did not complete its control lifecycle'));
    if (exit.kind === 'failed' || failures.length > 0)
      throw new InstalledLintFailure(
        failures,
        owned.pid,
        Buffer.concat(stderr),
        completion.hasStarted &&
          (exit.kind === 'failed' || !completion.hasFinished || owned.signalCode !== null),
      );
    const status = exit.status;
    const interruption = readInterruption();
    // Proof: parent-cancel-exit1; `actual installed parent nested ownership > retains normal exit1 and visible PID/scratch diagnostics after cancellation` failed with the recorded source fault and passed after restoration.
    if (status === 1 && interruption !== undefined && discardedStderr.length > 0) {
      try {
        // Proof: parent-diagnostic-only-discarded; `actual installed parent nested ownership > retains normal exit1 and visible PID/scratch diagnostics after cancellation` failed with the recorded source fault and passed after restoration.
        const diagnostic = await context.reportDiagnostic(Buffer.concat(discardedStderr));
        // Proof: parent-diagnostic-abandoned; `actual installed parent nested ownership > retains normal exit1 and abandoned diagnostic bytes after cancellation` failed with the recorded source fault and passed after restoration.
        if (diagnostic.kind === 'abandoned')
          throw new Error('installed lint terminal diagnostic was abandoned', {
            cause: diagnostic.cause,
          });
      } catch (cause) {
        throw new InstalledLintFailure([cause], owned.pid, Buffer.concat(stderr), false);
      }
    }
    // Proof: parent-cancel-zero; `preserves terminal 0 semantics when cancellation abandons outward bytes after launcher exit` failed with the recorded source fault and passed after restoration.
    // Proof: parent-preserve-exit1; `preserves terminal 1 semantics when cancellation abandons outward bytes after launcher exit` failed with the recorded source fault and passed after restoration.
    if (status === 0 && interruption !== undefined) return interruption === 'SIGINT' ? 130 : 143;
    return status;
  } finally {
    unsubscribe();
  }
}
