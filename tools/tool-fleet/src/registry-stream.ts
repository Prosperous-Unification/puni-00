/**
 * Consume at most the admitted byte allowance; the overflowing chunk never reaches the
 * consumer. Cancel the upstream reader on overflow or consumer failure and release its lock.
 */
export async function consumeRegistryStream(
  stream: ReadableStream<Uint8Array> | null,
  maximumBytes: number,
  context: string,
  consume: (chunk: Uint8Array) => void,
): Promise<number> {
  if (stream === null) return 0;
  const reader = stream.getReader();
  let received = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) return received;
      received += chunk.value.byteLength;
      // Proof: removing this bound consumes all 32 MiB without cancellation in the
      // source-metadata, HTTP-diagnostic and target-verification production negatives.
      if (received > maximumBytes)
        throw new Error(`${context} exceeds ${String(maximumBytes)} bytes`);
      consume(chunk.value);
    }
  } catch (cause) {
    try {
      // Proof: removing cancellation leaves the oversized production HTTP streams uncancelled.
      await reader.cancel(cause);
    } catch (cancellation) {
      throw new AggregateError([cause, cancellation], `${context} cancellation failed`, {
        cause: cancellation,
      });
    }
    throw cause;
  } finally {
    reader.releaseLock();
  }
}

/** Buffer only a bounded metadata/diagnostic response; counts actual stream bytes, not headers. */
export async function readRegistryBytes(
  stream: ReadableStream<Uint8Array> | null,
  maximumBytes: number,
  context: string,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const length = await consumeRegistryStream(stream, maximumBytes, context, (chunk) => {
    chunks.push(chunk);
  });
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
