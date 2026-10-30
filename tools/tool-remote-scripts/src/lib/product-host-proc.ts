import { open } from 'node:fs/promises';

/** Bounded raw host procfs read; the product observer validates the decoded fields. */
export async function readProductHostProc(
  path: string,
  maximum: number,
  deadline: number,
): Promise<string> {
  if (!Number.isFinite(deadline) || deadline <= performance.now())
    throw new Error('product process deadline exhausted');
  const descriptor = await open(path, 'r');
  try {
    const chunks: Buffer[] = [];
    const buffer = Buffer.alloc(Math.min(65536, maximum + 1));
    let length = 0;
    for (;;) {
      if (deadline <= performance.now()) throw new Error('product process deadline exhausted');
      const { bytesRead } = await descriptor.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      length += bytesRead;
      if (length > maximum) throw new Error('product procfs bound exceeded');
      chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
  } finally {
    await descriptor.close();
  }
}
