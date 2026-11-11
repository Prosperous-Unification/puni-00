export type Interrupt = 'SIGINT' | 'SIGTERM';
export type SubscribeInterrupts = (listener: (signal: Interrupt) => void) => () => void;

export interface Interrupts {
  readonly subscribe: SubscribeInterrupts;
  /** Feed validated ordered parent controls through the same first-reason broker as native signals. */
  recordInterrupt(signal: Interrupt): void;
  /** Release native listeners and subscribers; repeated disposal is harmless. */
  dispose(): void;
}

/**
 * Bind native signals only at an executable boundary. A subscriber immediately receives prior
 * cancellation, then all later signals, so asynchronous stdin/selection cannot lose interruption.
 * The typed API receives subscribe rather than installing global listeners itself.
 * @throws when a released source is reused for another invocation.
 */
export function createInterrupts(name: string): Interrupts {
  let first: Interrupt | undefined;
  let isDisposed = false;
  const listeners = new Set<(signal: Interrupt) => void>();
  function recordInterrupt(signal: Interrupt): void {
    // Proof: broker-first-reason; `executable-owned lint interrupts > replays prior cancellation and forwards later native signals until unsubscribed` fails with this injected fault and passes after restoration.
    first ??= signal;
    for (const listener of listeners) listener(signal);
  }
  const onInterrupt = () => {
    recordInterrupt('SIGINT');
  };
  const onTermination = () => {
    recordInterrupt('SIGTERM');
  };
  process.on('SIGINT', onInterrupt);
  process.on('SIGTERM', onTermination);
  return {
    recordInterrupt(signal) {
      // Proof: broker-parent-closed; `refuses parent control after the executable releases its broker` failed with the recorded source fault and passed after restoration.
      if (isDisposed) throw new Error(name + ' interrupt source is closed');
      // Proof: broker-parent-delivery; `records ordered parent controls through the same first-reason broker` failed with the recorded source fault and passed after restoration.
      recordInterrupt(signal);
    },
    subscribe(listener) {
      // Proof: broker-close; `executable-owned lint interrupts > refuses subscription after the executable releases its signal source` fails with this injected fault and passes after restoration.
      if (isDisposed) throw new Error(name + ' interrupt source is closed');
      listeners.add(listener);
      // Proof: broker-replay; `executable-owned lint interrupts > replays prior cancellation and forwards later native signals until unsubscribed` fails with this injected fault and passes after restoration.
      if (first !== undefined) listener(first);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      isDisposed = true;
      // Proof: broker-int-dispose; `executable-owned lint interrupts > disposal restores native signal termination and removes its listeners` fails with this injected fault and passes after restoration.
      process.off('SIGINT', onInterrupt);
      // Proof: broker-term-dispose; `executable-owned lint interrupts > disposal restores native signal termination and removes its listeners` fails with this injected fault and passes after restoration.
      process.off('SIGTERM', onTermination);
      listeners.clear();
    },
  };
}
