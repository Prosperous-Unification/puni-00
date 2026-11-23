import { Buffer } from 'node:buffer';

import type { SubscribeLintInterrupts } from './lint-interrupts';

export type ExecutionInput =
  | { readonly kind: 'input'; readonly bytes: Uint8Array }
  | { readonly kind: 'cancelled'; readonly status: 130 | 143 };

/**
 * Read native byte input under the caller's interruption source. Cancellation attempts native
 * reader cancellation and then awaits the input loop even if cancel rejects. Registration,
 * input and every release failure preserve their original causes; unsubscribe and reader-lock
 * release are independently attempted. A controlled cancellation never masks those failures.
 */
export async function readExecutionInput(
  subscribe: SubscribeLintInterrupts,
): Promise<ExecutionInput> {
  const reader = Bun.stdin.stream().getReader();
  const cancellation = Promise.withResolvers<ExecutionInput>();
  let unsubscribe: (() => void) | undefined;
  const acquisition = await (async (): Promise<ExecutionInput> => {
    unsubscribe = subscribe((signal) => {
      cancellation.resolve({ kind: 'cancelled', status: signal === 'SIGINT' ? 130 : 143 });
    });
    const input = (async (): Promise<ExecutionInput> => {
      const chunks: Uint8Array[] = [];
      for (;;) {
        const next = await reader.read();
        if (next.done) return { kind: 'input', bytes: Buffer.concat(chunks) };
        chunks.push(next.value);
      }
    })();
    // Proof: main-stdin-cancel; `standalone Bun lint boundary > cancels the executable boundary while stdin remains open` fails with this injected fault and passes after restoration.
    // Proof: c27-input-race; injected fault failed `standalone Bun lint boundary > cancels the executable boundary while stdin remains open`; restoration passed.
    const selected = await Promise.race([input, cancellation.promise]);
    if (selected.kind === 'cancelled') {
      const failures: unknown[] = [];
      try {
        // Proof: c27-input-cancel-awaited; injected fault failed `awaits actual input settlement after the native cancel completes but its wrapper rejects`; restoration passed.
        await reader.cancel();
      } catch (cause) {
        failures.push(cause);
      }
      try {
        // Proof: c27-input-loop-awaited; injected fault failed `awaits actual input settlement after the native cancel completes but its wrapper rejects`; restoration passed.
        await input;
      } catch (cause) {
        failures.push(cause);
      }
      // Proof: c27s-input-single-cancel-failure; injected fault failed `awaits actual input settlement after the native cancel completes but its wrapper rejects`; restoration passed.
      if (failures.length === 1) throw failures[0];
      // Proof: c27-input-cancel-aggregate; injected fault failed `preserves both settled native cancellation and input-loop failures before unlocking`; restoration passed.
      if (failures.length > 1)
        throw new AggregateError(failures, 'execution input cancellation failed');
    }
    return selected;
  })().then(
    (value) => ({ kind: 'fulfilled' as const, value }),
    (cause: unknown) => ({ kind: 'rejected' as const, cause }),
  );
  const failures: unknown[] = [];
  try {
    // Proof: c27-input-unsubscribe; injected fault failed `releases the settled input reader even when unsubscribe throws`; restoration passed.
    if (unsubscribe !== undefined) unsubscribe();
  } catch (cause) {
    failures.push(cause);
  }
  try {
    // Proof: c27-input-unlock; injected fault failed `releases the acquired input reader if interrupt registration throws`; restoration passed.
    reader.releaseLock();
  } catch (cause) {
    failures.push(cause);
  }
  // Proof: c27-input-acquisition-rejection; injected fault failed `releases the acquired input reader if interrupt registration throws`; restoration passed.
  if (acquisition.kind === 'rejected') {
    // Proof: c27-input-rejection-cleanup-aggregate; injected fault failed `preserves input read and both cleanup failures after all native releases are attempted`; restoration passed.
    if (failures.length > 0)
      throw new AggregateError(
        [acquisition.cause, ...failures],
        'execution input and release failed',
      );
    throw acquisition.cause;
  }
  // Proof: c27s-input-single-release-failure; injected fault failed `releases the settled input reader even when unsubscribe throws`; restoration passed.
  if (failures.length === 1) throw failures[0];
  // Proof: c27-input-success-cleanup-aggregate; injected fault failed `preserves both cleanup failures after otherwise successful native input acquisition`; restoration passed.
  if (failures.length > 1) throw new AggregateError(failures, 'execution input release failed');
  return acquisition.value;
}
