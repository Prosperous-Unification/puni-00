import type { LintInterrupt, SubscribeLintInterrupts } from './lint-interrupts';

export type LintWrite =
  { readonly kind: 'written' } | { readonly kind: 'cancelled'; readonly signal: LintInterrupt };

/**
 * A completed outward write or explicit cancellation; failures reject rather than succeed.
 * Asynchronous implementations own the invocation's interruption source, release in-flight
 * waits on cancellation/failure, and preserve the first terminal event. Native operations
 * abandoned by those waits remain separately observed. Synchronous memory outputs settle inline.
 */
export type LintOutput = (bytes: Uint8Array) => LintWrite | Promise<LintWrite>;

export type LintDiagnostic =
  { readonly kind: 'reported' } | { readonly kind: 'abandoned'; readonly cause: unknown };

/** The FileSink operations this executable owns; no end(error) cancellation assumption. */
export interface LintSink {
  write(bytes: Uint8Array): number | Promise<number>;
  flush(): number | Promise<number>;
  unref(): void;
}

interface Context {
  readonly stdout: () => LintSink;
  readonly stderr: () => LintSink;
  readonly subscribeInterrupts: SubscribeLintInterrupts;
}

export interface LintOutputs {
  readonly stdout: (bytes: Uint8Array) => Promise<LintWrite>;
  readonly stderr: (bytes: Uint8Array) => Promise<LintWrite>;
  /** One bounded terminal diagnostic, ordered behind the actual stderr operation tail. */
  reportDiagnostic(bytes: Uint8Array): Promise<LintDiagnostic>;
  dispose(): void;
}

interface Channel {
  readonly openSink: () => LintSink;
  sink: LintSink | undefined;
  tail: Promise<void>;
}

type Stop =
  | { readonly kind: 'cancelled'; readonly signal: LintInterrupt }
  | { readonly kind: 'failed'; readonly cause: unknown };

/**
 * Own one executable's lazy FileSinks and outward API waits. Normal writes await write+flush.
 * Cancellation/failure releases both channels' API waits and unreferences each created sink
 * once. Native operations may remain pending: they are observed and explicitly abandoned,
 * never described as flushed. The executable must finish after this owner is disposed.
 */
export function createLintOutputs(context: Context): LintOutputs {
  const createChannel = (openSink: () => LintSink): Channel => ({
    openSink,
    sink: undefined,
    tail: Promise.resolve(),
  });
  const stdout = createChannel(context.stdout);
  const stderr = createChannel(context.stderr);
  const sinks = new Set<LintSink>();
  const unreferenced = new Set<LintSink>();
  let hasStopped = false;
  let isDisposed = false;
  let hasDiagnosticAttempt = false;
  const stopped = Promise.withResolvers<LintWrite>();
  // This promise alone retains the first outcome for current and later API writers.
  void stopped.promise.catch(() => undefined);

  function unreferenceSinks(): void {
    const failures: unknown[] = [];
    for (const sink of sinks) {
      // Proof: output-unref-once; `executable-owned lint output > opens lazily and reports written only after binary write and flush complete` fails with this injected fault and passes after restoration.
      if (unreferenced.has(sink)) continue;
      // Proof: output-unref-track; `executable-owned lint output > opens lazily and reports written only after binary write and flush complete` fails with this injected fault and passes after restoration.
      unreferenced.add(sink);
      try {
        // Proof: output-unref-operation; `executable-owned lint output > opens lazily and reports written only after binary write and flush complete` fails with this injected fault and passes after restoration.
        sink.unref();
      } catch (cause) {
        // Proof: output-release-failure-recorded; `surfaces a native sink release failure during otherwise normal disposal` fails with this injected fault and passes after restoration.
        failures.push(cause);
      }
    }
    // Proof: output-release-failure-thrown; `surfaces a native sink release failure during otherwise normal disposal` fails with this injected fault and passes after restoration.
    if (failures.length > 0) throw new AggregateError(failures, 'cannot release lint output sinks');
  }

  function stopOutputs(requested: Stop): void {
    hasStopped = true;
    let chosen = requested;
    try {
      unreferenceSinks();
    } catch (cause) {
      // Proof: output-cancel-release-failure; `converts cancellation release failure to an explicit failed outcome` fails with this injected fault and passes after restoration.
      chosen = {
        kind: 'failed',
        cause: new AggregateError(
          requested.kind === 'failed' ? [requested.cause, cause] : [cause],
          'lint output failed while releasing native sinks',
        ),
      };
    }
    if (chosen.kind === 'cancelled') stopped.resolve(chosen);
    else stopped.reject(chosen.cause);
  }

  function rejectOutputs(cause: unknown): void {
    stopOutputs({ kind: 'failed', cause });
  }

  function areOutputsStopped(): boolean {
    return hasStopped;
  }

  function openChannel(channel: Channel): LintSink {
    // Proof: output-sink-reused; `executable-owned lint output > does not overtake an outstanding stderr operation when reporting a stdout failure` fails with this injected fault and passes after restoration.
    if (channel.sink === undefined) {
      channel.sink = channel.openSink();
      // Proof: output-sink-tracked; `executable-owned lint output > opens lazily and reports written only after binary write and flush complete` fails with this injected fault and passes after restoration.
      sinks.add(channel.sink);
    }
    return channel.sink;
  }

  async function writeChannel(channel: Channel, bytes: Uint8Array): Promise<LintWrite> {
    // Proof: output-native-tail-serialization; `serializes one channel through the actual write and flush tail` fails with this injected fault and passes after restoration.
    const operation = channel.tail.then(async () => {
      // Previously queued bytes must not begin a new native operation after terminal stop.
      // Proof: output-queued-write-stop; `never begins queued writes or a delayed flush after cancellation` fails with this injected fault and passes after restoration.
      if (hasStopped) return;
      try {
        const sink = openChannel(channel);
        // Proof: output-write-awaited; `executable-owned lint output > opens lazily and reports written only after binary write and flush complete` fails with this injected fault and passes after restoration.
        await sink.write(bytes);
        // Proof: output-delayed-flush-stop; `never begins queued writes or a delayed flush after cancellation` fails with this injected fault and passes after restoration.
        if (areOutputsStopped()) return;
        // Proof: output-flush-awaited; `executable-owned lint output > opens lazily and reports written only after binary write and flush complete` fails with this injected fault and passes after restoration.
        await sink.flush();
      } catch (cause) {
        // Proof: output-peer-failure-release; `preserves an output failure recorded before a later cancellation microtask` fails with this injected fault and passes after restoration.
        rejectOutputs(cause);
        throw cause;
      }
    });
    channel.tail = operation;
    // The native tail can outlive a cancelled API wait; its eventual rejection stays observed.
    void operation.catch(rejectOutputs);
    const delivery = operation.then((): LintWrite => ({ kind: 'written' }));
    return Promise.race([delivery, stopped.promise]);
  }

  const unsubscribe = context.subscribeInterrupts((signal) => {
    // Proof: output-cancellation-release; `executable-owned lint output > releases both stalled API writes on first cancellation without claiming a flush` fails with this injected fault and passes after restoration.
    stopOutputs({ kind: 'cancelled', signal });
  });

  return {
    stdout: (bytes) => writeChannel(stdout, bytes),
    stderr: (bytes) => writeChannel(stderr, bytes),
    async reportDiagnostic(bytes) {
      // Proof: output-one-diagnostic-attempt; `permits exactly one terminal diagnostic even after successful reporting` fails with this injected fault and passes after restoration.
      if (hasDiagnosticAttempt)
        return { kind: 'abandoned', cause: new Error('lint diagnostic already attempted') };
      hasDiagnosticAttempt = true;
      let isAbandoned = false;
      function assertDiagnosticOpen(): void {
        // Proof: output-diagnostic-disposal-guard; `does not start a queued diagnostic after its owner is disposed` fails with this injected fault and passes after restoration.
        // Proof: output-diagnostic-expiry-guard; `executable-owned lint output > bounds diagnostic abandonment behind a permanently stalled stderr operation` fails with this injected fault and passes after restoration.
        if (isAbandoned || isDisposed) throw new Error('lint diagnostic was abandoned');
      }
      // Proof: output-diagnostic-same-tail; `executable-owned lint output > does not overtake an outstanding stderr operation when reporting a stdout failure` fails with this injected fault and passes after restoration.
      const operation = stderr.tail.then(async () => {
        try {
          // Proof: output-diagnostic-start-guard; `does not start a queued diagnostic after its owner is disposed` fails with this injected fault and passes after restoration.
          assertDiagnosticOpen();
          const sink = openChannel(stderr);
          // Proof: output-diagnostic-write-await; `never starts diagnostic flush after expiry during a pending native write` fails with this injected fault and passes after restoration.
          await sink.write(bytes);
          // Proof: output-diagnostic-flush-guard; `never starts diagnostic flush after expiry during a pending native write` fails with this injected fault and passes after restoration.
          assertDiagnosticOpen();
          // Proof: output-diagnostic-flush-await; `reports a diagnostic only after its native flush settles` fails with this injected fault and passes after restoration.
          await sink.flush();
        } catch (cause) {
          rejectOutputs(cause);
          throw cause;
        }
      });
      stderr.tail = operation;
      const delivery = operation.then(
        (): LintDiagnostic => ({ kind: 'reported' }),
        (cause: unknown): LintDiagnostic => ({ kind: 'abandoned', cause }),
      );
      const expiry = Promise.withResolvers<LintDiagnostic>();
      const timer = setTimeout(() => {
        isAbandoned = true;
        // Proof: output-diagnostic-timeout; `executable-owned lint output > bounds diagnostic abandonment behind a permanently stalled stderr operation` fails with this injected fault and passes after restoration.
        expiry.resolve({ kind: 'abandoned', cause: new Error('lint diagnostic did not settle') });
      }, 1000);
      try {
        return await Promise.race([delivery, expiry.promise]);
      } finally {
        isAbandoned = true;
        clearTimeout(timer);
        unreferenceSinks();
      }
    },
    dispose() {
      isDisposed = true;
      // Proof: output-dispose-unsubscribe; `executable-owned lint output > opens lazily and reports written only after binary write and flush complete` fails with this injected fault and passes after restoration.
      unsubscribe();
      try {
        unreferenceSinks();
      } catch (cause) {
        stopOutputs({ kind: 'failed', cause });
        // Proof: output-dispose-release-failure; `surfaces a native sink release failure during otherwise normal disposal` fails with this injected fault and passes after restoration.
        throw cause;
      }
      stopOutputs({ kind: 'failed', cause: new Error('lint output owner is closed') });
    },
  };
}
