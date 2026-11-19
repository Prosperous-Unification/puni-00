import type { ControlEvent, SubscribeControl } from './gate-control';

/** First cause retains provenance; TERM is only the transport for an external interruption. */
export type JobInterruption =
  | { readonly kind: 'native'; readonly signal: 'SIGINT' | 'SIGTERM' | 'SIGHUP' }
  | { readonly kind: 'external'; readonly reason: unknown };

export interface JobControl {
  readonly signal: AbortSignal;
  received(): JobInterruption | null;
  setRecipient(recipient: (signal: NodeJS.Signals) => void): void;
  /** Surface retained synchronous delivery causes even after retirement failed; call after joins. */
  throwIfFailed(): void;
  /**
   * Attempt retirement once, after required joins; subsequent calls never retry an uncertain attempt.
   * @throws The supplied retirement cause, unchanged; the caller must still collect delivery causes.
   */
  close(): void;
}

/**
 * Borrow only a cancellation registration, or own standalone INT/TERM/HUP listeners. First cause
 * and queue wake are independent from the single current transport recipient. Ordered event
 * sequence identity suppresses replay; external observations use TERM transport without changing
 * their reason. Synchronous observers never throw into their source: required native/FD/resource
 * joins finish before the caller surfaces retained delivery causes. Retirement is idempotent and
 * never disposes a borrowed executable owner. A throwing retirement remains one attempted close;
 * retained delivery causes remain readable. The operation must close only after its joins and
 * preserve retirement failure alongside operation/delivery failures.
 */
export function createJobControl(subscribe?: SubscribeControl): JobControl {
  const abort = new AbortController(),
    failures: unknown[] = [];
  let first: JobInterruption | null = null,
    sequence = 0,
    isClosed = false;
  let recipient: ((signal: NodeJS.Signals) => void) | undefined;
  function observe(event: JobInterruption & { readonly sequence: number }): void {
    if (isClosed || event.sequence <= sequence) return;
    sequence = event.sequence;
    first ??=
      event.kind === 'native'
        ? { kind: 'native', signal: event.signal }
        : { kind: 'external', reason: event.reason };
    if (recipient === undefined) abort.abort();
    else {
      try {
        recipient(event.kind === 'native' ? event.signal : 'SIGTERM');
      } catch (cause) {
        failures.push(cause);
      }
    }
  }
  let retire: () => void;
  if (subscribe === undefined) {
    const listeners = (['SIGINT', 'SIGTERM', 'SIGHUP'] as const).map((signal) => {
      const listener = () => {
        observe({ sequence: sequence + 1, kind: 'native', signal });
      };
      process.on(signal, listener);
      return { signal, listener };
    });
    retire = () => {
      for (const { signal, listener } of listeners) process.off(signal, listener);
    };
  } else
    retire = subscribe((event: ControlEvent) => {
      observe(event);
    });
  return {
    signal: abort.signal,
    received: () => first,
    setRecipient(next) {
      recipient = next;
    },
    throwIfFailed() {
      if (failures.length > 0)
        throw new AggregateError(failures, 'host job control delivery failed');
    },
    close() {
      if (isClosed) return;
      isClosed = true;
      recipient = undefined;
      retire();
    },
  };
}
