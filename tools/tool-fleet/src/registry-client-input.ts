import { type } from 'arktype';

import { completeRegistryOperation } from './registry-operation-completion';

const Origin = type({
  mount: /^mnt:\[[1-9]\d*\]$/,
  network: /^net:\[[1-9]\d*\]$/,
  pid: /^pid:\[[1-9]\d*\]$/,
  '+': 'reject',
});

/**
 * Internal root-parent pipe preamble, never caller-selected commands or paths. Read one bounded
 * namespace-origin line, then preserve every following byte for the existing authority supervisor.
 * The returned owner must close after supervision, even if the remaining stream errors. A finite
 * first-line deadline cancels its read and closes the original reader before reporting failure.
 */
export async function readRegistryClientInput(
  input: ReadableStream<Uint8Array>,
  deadlineMs = 10000,
): Promise<{
  readonly origin: typeof Origin.infer;
  readonly input: ReadableStream<Uint8Array>;
  close(): Promise<void>;
}> {
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs <= 0 || deadlineMs > 10000)
    throw new Error('Invalid client origin deadline');
  const reader = input.getReader();
  const controller = new AbortController();
  let interrupted: Promise<{ state: 'closed' } | { state: 'failed'; cause: unknown }> | undefined;
  const timeout = setTimeout(() => {
    controller.abort(new Error('Client origin deadline exceeded'));
    interrupted = reader.cancel().then(
      () => ({ state: 'closed' as const }),
      (cause: unknown) => ({ state: 'failed' as const, cause }),
    );
  }, deadlineMs);
  const close = () =>
    completeRegistryOperation(
      () => reader.cancel(),
      async () => {
        const cancellation = await interrupted;
        reader.releaseLock();
        // Proof: deadline/cancel dual-failure test loses its second cause when this refusal is removed.
        if (cancellation?.state === 'failed') throw cancellation.cause;
      },
    );
  try {
    let buffered = Buffer.alloc(0);
    for (;;) {
      const newline = buffered.indexOf(10);
      if (newline !== -1) {
        // Proof: oversized complete origin is admitted with this line bound removed.
        if (newline > 1024) throw new Error('Oversized client origin');
        const decoded: unknown = JSON.parse(
          new TextDecoder('utf8', { fatal: true }).decode(buffered.subarray(0, newline)),
        );
        // Proof: extra selector and wrong namespace tests admit their headers without this boundary.
        const origin = Origin.assert(decoded);
        const trailing = buffered.subarray(newline + 1);
        return {
          origin,
          input: new ReadableStream<Uint8Array>({
            start(output) {
              if (trailing.byteLength > 0) output.enqueue(trailing);
            },
            async pull(output) {
              const chunk = await reader.read();
              if (chunk.done) output.close();
              else output.enqueue(chunk.value);
            },
            cancel(reason: unknown) {
              return reader.cancel(reason);
            },
          }),
          close,
        };
      }
      if (buffered.byteLength > 1024) throw new Error('Oversized client origin');
      const chunk = await reader.read();
      controller.signal.throwIfAborted();
      if (chunk.done) throw new Error('Incomplete client origin');
      // Proof: oversized chunk containing a valid origin is admitted with this bound removed.
      if (buffered.byteLength + chunk.value.byteLength > 8192)
        throw new Error('Oversized client origin chunk');
      buffered = Buffer.concat([buffered, chunk.value]);
    }
  } catch (cause) {
    return await completeRegistryOperation<never>(() => {
      throw cause;
    }, close);
  } finally {
    clearTimeout(timeout);
  }
}
