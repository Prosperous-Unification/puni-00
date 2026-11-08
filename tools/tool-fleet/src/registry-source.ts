import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

/** Read one configured regular source without following aliases or trusting its advertised size alone. */
export async function readRegistrySource(path: string, maximumBytes = 4 * 1024 ** 2) {
  if (!isAbsolute(path) || (await realpath(path)) !== path)
    throw new Error('Registry source path is not canonical');
  const descriptor = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const status = await descriptor.stat();
    if (!status.isFile() || status.size > maximumBytes)
      throw new Error('Registry source file or size is invalid');
    const chunks: Buffer[] = [];
    const buffer = Buffer.alloc(65536);
    let length = 0;
    for (;;) {
      const received = await descriptor.read(buffer);
      if (received.bytesRead === 0) break;
      length += received.bytesRead;
      if (length > maximumBytes || length > status.size)
        throw new Error('Registry source grew while reading');
      chunks.push(Buffer.from(buffer.subarray(0, received.bytesRead)));
    }
    if (length !== status.size) throw new Error('Registry source shrank while reading');
    const bytes = Buffer.concat(chunks);
    return {
      bytes,
      text: bytes.toString('utf8'),
      sourceRevision: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    };
  } finally {
    await descriptor.close();
  }
}

/** Read an owning journal synchronously with the same capacity enforced before writes; absence remains the caller's modeled outcome. */
export function readRegistryOwnerFile(path: string, maximumBytes = 4 * 1024 ** 2): string {
  const descriptor = openSync(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const status = fstatSync(descriptor);
    // Proof: oversized owner journal tests accepted >4MiB release and first-start files before bounded reads.
    if (!status.isFile() || status.size > maximumBytes)
      throw new Error('Registry owner journal capacity or file type is invalid');
    const chunks: Buffer[] = [];
    const buffer = Buffer.alloc(65536);
    let length = 0;
    for (;;) {
      const received = readSync(descriptor, buffer);
      if (received === 0) break;
      length += received;
      if (length > maximumBytes || length > status.size)
        throw new Error('Registry owner journal grew while reading');
      chunks.push(Buffer.from(buffer.subarray(0, received)));
    }
    if (length !== status.size) throw new Error('Registry owner journal shrank while reading');
    return Buffer.concat(chunks).toString('utf8');
  } finally {
    closeSync(descriptor);
  }
}
