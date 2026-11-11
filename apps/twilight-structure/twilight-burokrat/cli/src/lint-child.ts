import { Buffer } from 'node:buffer';

import type { LintInterrupt, SubscribeLintInterrupts } from './lint-interrupts';
import type { LintOutput } from './lint-output';

interface Context {
  readonly argv: readonly string[];
  readonly directory: string;
  readonly environment: Readonly<Record<string, string>>;
  readonly stdout: LintOutput;
  readonly stderr: LintOutput;
  readonly subscribeInterrupts: SubscribeLintInterrupts;
}

type Request = Context &
  (
    | {
        readonly stage: 'Git version' | 'candidate root' | 'snapshotter' | 'preparation archive';
        readonly stdin: undefined;
      }
    | { readonly stage: 'validator'; readonly stdin: Uint8Array }
    | { readonly stage: 'preparation Git'; readonly stdin: Uint8Array | undefined }
  );

export type LintChildOutcome =
  | { readonly kind: 'exited'; readonly status: number; readonly stdout: Uint8Array }
  | {
      readonly kind: 'cancelled';
      readonly status: 130 | 143;
      readonly signal: LintInterrupt;
      readonly stdout: Uint8Array;
    };

/** Cleanup could not prove the owned group absent; callers must retain scratch. */
export class LintCleanupFailure extends AggregateError {}

function isMissingGroup(cause: unknown): boolean {
  // Proof: child-denied-not-absent; `never treats denied process-group signaling as confirmed absence` fails with this injected fault and passes after restoration.
  return cause instanceof Error && 'code' in cause && cause.code === 'ESRCH';
}

/**
 * Own a detached lint stage, its group and both streams. First cancellation gives the whole
 * group one second; repeated cancellation escalates immediately. Leader exit starts group
 * finalization before awaiting pipe EOF, preserving any remaining cancellation grace.
 * Unexpected normal-exit descendants are failures even after successful cleanup. KILL starts
 * a separate bounded absence proof immediately, so an unsettled leader cannot hang cleanup.
 * Host timeout callbacks bound lifecycle without reading clocks or judging admission timestamps.
 * Only ESRCH retires the group; unreaped zombies conservatively fail and retain scratch.
 * @throws LintCleanupFailure when group disappearance cannot be confirmed; other failures
 * include spawn, streams, unsolicited signals and unexpected background descendants.
 * Cancellation discards remaining outward bytes while both child pipes continue to settle.
 */
export async function runLintChild(request: Request): Promise<LintChildOutcome> {
  let interruption:
    { signal: LintInterrupt; hasExpired: boolean; hasRepeatedSignal: boolean } | undefined;
  let child: Bun.Subprocess<'ignore' | Uint8Array, 'pipe', 'pipe'> | undefined;
  let isRetired = false;
  let escalation: ReturnType<typeof setTimeout> | undefined;
  let cleanup: Promise<void> | undefined;
  const failure = Promise.withResolvers<never>();
  let isFailing = false;
  // Observe signal-time rejection before the asynchronous race is attached; the same promise
  // still rejects that race and cannot turn into a normal verdict.
  void failure.promise.catch(() => undefined);
  const chunks: Uint8Array[] = [];
  function recordFailure(cause: unknown): void {
    isFailing = true;
    failure.reject(cause);
  }
  // Native callbacks may update cancellation across awaited child/stream settlement.
  function readInterruption(): typeof interruption {
    return interruption;
  }

  function retireGroup(): void {
    isRetired = true;
    if (escalation !== undefined) clearTimeout(escalation);
  }
  function signalGroup(signal: NodeJS.Signals): boolean {
    if (child === undefined || isRetired) return false;
    try {
      // Proof: child-group-signal; `owned lint process group > kills ordinary background descendants with ignore output before releasing the stage` fails with this injected fault and passes after restoration.
      process.kill(-child.pid, signal);
      return true;
    } catch (cause) {
      if (!isMissingGroup(cause)) throw cause;
      retireGroup();
      return false;
    }
  }
  function isGroupGone(): boolean {
    if (child === undefined || isRetired) return true;
    try {
      process.kill(-child.pid, 0);
      return false;
    } catch (cause) {
      if (!isMissingGroup(cause)) throw cause;
      retireGroup();
      return true;
    }
  }
  function requestKill(): Promise<void> {
    if (cleanup !== undefined) return cleanup;
    cleanup = (async () => {
      const expiry = { hasExpired: false };
      const timer = setTimeout(() => {
        expiry.hasExpired = true;
      }, 1000);
      try {
        signalGroup('SIGKILL');
        while (!isGroupGone()) {
          // Proof: child-cleanup-bound; `bounds unconfirmed cleanup even when forced termination does not settle the leader` fails with this injected fault and passes after restoration.
          if (expiry.hasExpired) throw new Error('lint process group did not disappear');
          await Bun.sleep(10);
        }
      } catch (cause) {
        throw new LintCleanupFailure([cause], 'lint process-group cleanup is unconfirmed');
      } finally {
        clearTimeout(timer);
      }
    })();
    void cleanup.catch((cause: unknown) => {
      recordFailure(cause);
    });
    return cleanup;
  }
  function recordInterruption(signal: LintInterrupt): void {
    const isRepeated = interruption !== undefined;
    if (interruption === undefined)
      interruption = { signal, hasExpired: false, hasRepeatedSignal: false };
    else interruption.hasRepeatedSignal = true;
    const cancellation = interruption;
    if (child === undefined || isRetired) return;
    try {
      // Proof: child-repeat-escalation; `lint interruption ownership > escalates repeated cancellation immediately` fails with this injected fault and passes after restoration.
      if (isRepeated) void requestKill();
      else {
        if (signalGroup(signal))
          escalation = setTimeout(() => {
            cancellation.hasExpired = true;
            void requestKill();
          }, 1000);
      }
    } catch (cause) {
      recordFailure(cause);
    }
  }
  const unsubscribe = request.subscribeInterrupts(recordInterruption);
  let settlement: Promise<void> | undefined;
  try {
    if (interruption !== undefined)
      return {
        kind: 'cancelled',
        status: interruption.signal === 'SIGINT' ? 130 : 143,
        signal: interruption.signal,
        stdout: new Uint8Array(),
      };
    try {
      child = Bun.spawn([...request.argv], {
        // Proof: child-explicit-cwd; `owned lint stage process > preserves argv, explicit environment, cwd and typed stdin in the actual child` fails with this injected fault and passes after restoration.
        cwd: request.directory,
        // Proof: child-explicit-env; `owned lint stage process > preserves argv, explicit environment, cwd and typed stdin in the actual child` fails with this injected fault and passes after restoration.
        env: request.environment,
        // Proof: child-explicit-stdin; `owned lint stage process > preserves argv, explicit environment, cwd and typed stdin in the actual child` fails with this injected fault and passes after restoration.
        stdin: request.stdin ?? 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        // Proof: child-detached-group; `owns a fresh process group through the actual protected launch` fails with this injected fault and passes after restoration.
        detached: true,
      });
    } catch (cause) {
      throw new Error('cannot start lint ' + request.stage, { cause });
    }
    async function drainOutput(
      stream: ReadableStream<Uint8Array>,
      emit: LintOutput,
      shouldCapture: boolean,
    ): Promise<void> {
      const reader = stream.getReader();
      let isDiscarding = false;
      try {
        for (;;) {
          const next = await reader.read();
          if (next.done) return;
          if (isFailing || readInterruption() !== undefined) isDiscarding = true;
          // Proof: child-output-discard-after-cancel; `drains but never forwards child bytes emitted after cancellation` fails with this injected fault and passes after restoration.
          if (isDiscarding) continue;
          if (shouldCapture) chunks.push(next.value.slice());
          try {
            // The output owner preserves the first terminal event and releases cancellation waits.
            const written = await Promise.race([
              // Proof: child-output-await-failure-precedence; `preserves an output failure recorded before a later cancellation microtask` fails with this injected fault and passes after restoration.
              Promise.resolve(emit(next.value)),
              failure.promise,
            ]);
            // Proof: child-output-cancelled-outcome; `honors cancellation returned by an output callback before native signal delivery` fails with this injected fault and passes after restoration.
            if (written.kind === 'cancelled') {
              // The output owner's replay is the same cancellation, not a second native signal.
              // Proof: child-output-replay-not-repeat; `preserves remaining cancellation grace for a cooperative grandchild after leader exit` fails with this injected fault and passes after restoration.
              if (readInterruption() === undefined) recordInterruption(written.signal);
              isDiscarding = true;
            }
          } catch (cause) {
            // Proof: child-output-failure-recorded; `lint interruption ownership > terminates the child and awaits cleanup when its output sink throws` fails with this injected fault and passes after restoration.
            isDiscarding = true;
            recordFailure(cause);
          }
        }
      } finally {
        reader.releaseLock();
      }
    }
    const ownedChild = child;
    const finalize = ownedChild.exited.then(async (status) => {
      const hasOrphans = !isGroupGone();
      if (hasOrphans) {
        const cancellation = interruption;
        if (cancellation !== undefined) {
          while (
            !isGroupGone() &&
            !cancellation.hasRepeatedSignal &&
            // Proof: child-grace-after-leader; `preserves remaining cancellation grace for a cooperative grandchild after leader exit` fails with this injected fault and passes after restoration.
            !cancellation.hasExpired
          )
            await Bun.sleep(10);
        }
        if (!isGroupGone()) await requestKill();
        // Proof: child-normal-orphan; `refuses unexpected normal-exit background descendants even after terminating them` fails with this injected fault and passes after restoration.
        if (cancellation === undefined)
          throw new Error('lint ' + request.stage + ' left background processes');
      }
      return status;
    });
    const operations = [
      finalize,
      drainOutput(ownedChild.stdout, request.stdout, true),
      drainOutput(ownedChild.stderr, request.stderr, false),
    ] as const;
    for (const operation of operations)
      void operation.catch((cause: unknown) => {
        recordFailure(cause);
      });
    settlement = Promise.allSettled(operations).then(() => undefined);
    const status = await Promise.race([
      Promise.all(operations).then(([status]) => status),
      failure.promise,
    ]);
    const stdout = Buffer.concat(chunks);
    const cancellation = readInterruption();
    if (cancellation !== undefined)
      return {
        kind: 'cancelled',
        status: cancellation.signal === 'SIGINT' ? 130 : 143,
        signal: cancellation.signal,
        stdout,
      };
    // Proof: child-unsolicited-signal; `owned lint stage process > reports unsolicited child signals after preserving partial output` fails with this injected fault and passes after restoration.
    if (ownedChild.signalCode !== null)
      throw new Error('lint ' + request.stage + ' ended by ' + ownedChild.signalCode);
    return { kind: 'exited', status, stdout };
  } catch (cause) {
    if (child !== undefined) {
      try {
        await requestKill();
        await child.exited;
        if (settlement !== undefined) await settlement;
      } catch (cleanupFailure) {
        throw new LintCleanupFailure(
          [cause, cleanupFailure],
          'lint ' +
            request.stage +
            ' failed; process group ' +
            String(child.pid) +
            ' cleanup is unconfirmed',
        );
      }
    }
    throw cause;
  } finally {
    if (escalation !== undefined) clearTimeout(escalation);
    // Proof: child-unsubscribe; `owned lint stage process > preserves argv, explicit environment, cwd and typed stdin in the actual child` fails with this injected fault and passes after restoration.
    unsubscribe();
  }
}
