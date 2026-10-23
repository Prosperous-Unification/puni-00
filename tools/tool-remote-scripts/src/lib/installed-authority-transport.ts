import type { Subprocess } from 'bun';

/** Drains bounded pipes concurrently and reaps the exact direct child on every path.
 * Privileged descendant lifetime additionally needs the reviewed sudo execution contract;
 * this direct-child transport alone never proves a root descendant was terminated.
 */
export async function readAuthorityCollector(
  child: Pick<
    Subprocess<'ignore', 'pipe', 'pipe'>,
    'stdout' | 'stderr' | 'exited' | 'exitCode' | 'kill'
  >,
  deadline: number,
): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let count = 0;
  async function drain(stream: ReadableStream<Uint8Array>, retain: boolean): Promise<Uint8Array[]> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) return chunks;
        count += chunk.value.byteLength;
        // Proof: oversize real-child negative refuses and reaps without retaining private payloads.
        if (count > 32 * 1024 * 1024) throw new Error('authority collector output bound exceeded');
        if (retain) chunks.push(chunk.value);
        else if (chunk.value.byteLength > 0)
          throw new Error('authority collector reported failure');
      }
    } finally {
      reader.releaseLock();
    }
  }
  const remaining = deadline - performance.now();
  try {
    if (remaining <= 0) throw new Error('authority collector deadline exceeded');
    const [stdout, , code] = await Promise.race([
      Promise.all([drain(child.stdout, true), drain(child.stderr, false), child.exited]),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error('authority collector deadline exceeded'));
        }, remaining);
      }),
    ]);
    if (code !== 0) throw new Error('authority collector exited unsuccessfully');
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(stdout));
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (child.exitCode === null) child.kill('SIGKILL');
    await child.exited;
    await Promise.allSettled([child.stdout.cancel(), child.stderr.cancel()]);
  }
}
