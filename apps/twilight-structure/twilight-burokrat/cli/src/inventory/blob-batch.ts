import type { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

/** One verified selected blob, or Git's explicit missing-object response. */
export type BatchObject = { kind: 'read'; bytes: Uint8Array } | { kind: 'missing' };

const BatchHeader = /^([0-9a-f]{40}(?:[0-9a-f]{24})?) ([a-z]+) ([0-9]+)$/;

/** Git's own identity of `bytes` as a blob, in the hash the length of `blob` names. */
function blobIdentity(blob: string, bytes: Uint8Array): string {
  return createHash(blob.length === 40 ? 'sha1' : 'sha256')
    .update(`blob ${String(bytes.length)}\0`)
    .update(bytes)
    .digest('hex');
}

/** Parses `<sha> <type> <size>\n<bytes>\n` or `<sha> missing\n` per requested blob, in order. */
export function parseBlobBatch(
  output: Buffer,
  requested: ReadonlyMap<string, string>,
): Map<string, BatchObject> {
  const objects = new Map<string, BatchObject>();
  let offset = 0;
  for (const [blob, path] of requested) {
    const newline = output.indexOf(0x0a, offset);
    // Proof (2026-10-12): disabling this made the 60-byte cut of `refuses a batch that ends
    // inside a header or before the announced size` throw no named refusal.
    // Proof: batch-header-terminator; `refuses a batch that ends inside a header or before the announced size` failed under its recorded source fault and passed after restoration.
    if (newline < 0) throw new Error('git cat-file --batch output ended early');
    const header = output.subarray(offset, newline).toString('utf8');
    offset = newline + 1;
    // Proof: batch-missing-discriminator; `refuses a missing object for its own path and still serves the others` failed under its recorded source fault and passed after restoration.
    if (header === `${blob} missing`) {
      objects.set(blob, { kind: 'missing' });
      continue;
    }
    const match = BatchHeader.exec(header);
    // Proof (2026-10-12): disabling this made `refuses a batch answer that names another object`
    // read the other object's bytes as alpha.txt.
    // Proof: batch-object-identity; `refuses a batch answer that names another object` failed under its recorded source fault and passed after restoration.
    if (match?.[1] !== blob) {
      throw new Error(`git cat-file --batch answered ${blob} for ${path} with: ${header}`);
    }
    // Proof (2026-10-12): disabling this made `refuses a batch header that names another object
    // type` accept the tree answer as docs/beta.md.
    // Proof: batch-object-type; `refuses a batch header that names another object type` failed under its recorded source fault and passed after restoration.
    if (match[2] !== 'blob') {
      throw new Error(`selected blob ${blob} for ${path} is a ${match[2]}, not a blob`);
    }
    const end = offset + Number(match[3]);
    // Proof (2026-10-12): disabling this made the 50-byte cut of `refuses a batch that ends inside
    // a header or before the announced size` return two of alpha.txt's six bytes.
    // Proof: batch-payload-boundary; `refuses a batch that ends inside a header or before the announced size` failed under its recorded source fault and passed after restoration.
    // Proof: batch-payload-lf; `refuses batch missing payload LF rather than returning partial captured source` failed under its recorded source fault and passed after restoration.
    if (end >= output.length || output[end] !== 0x0a) {
      throw new Error('git cat-file --batch output ended early');
    }
    const bytes = output.subarray(offset, end);
    // This single read is the only read, so binding it to the identity the selected tree or
    // index named is what makes every later consumer judge the selected bytes.
    // Proof (2026-10-12): disabling this made `refuses batch bytes whose digest differs from the
    // selected object identity` return `ALPHA`, and the artifacts CLI case `refuses batch bytes
    // whose digest differs from the selected index` judge the substituted evidence instead.
    // Proof: batch-content-hash; `refuses batch substituted payload rather than returning partial captured source` failed under its recorded source fault and passed after restoration.
    if (blobIdentity(blob, bytes) !== blob) {
      throw new Error(
        `batch read digest differs from the index for selected blob ${blob} at ${path}`,
      );
    }
    objects.set(blob, { kind: 'read', bytes });
    offset = end + 1;
  }
  // Proof (2026-10-12): disabling this made `refuses output the batch did not ask for` pass the
  // extra bytes silently.
  // Proof: batch-trailing-bytes; `refuses output the batch did not ask for` failed under its recorded source fault and passed after restoration.
  if (offset !== output.length) throw new Error('git cat-file --batch output has trailing bytes');
  return objects;
}
