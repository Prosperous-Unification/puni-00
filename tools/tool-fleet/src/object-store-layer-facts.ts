import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';

import { readTarField, readTarOctal, requireTarChecksum } from './archive-tar-header';
import { type ObjectStoreArchive, readObjectStoreLayers } from './object-store-archive';
import type { ObjectStoreLock } from './object-store-image';

const ceilings = Object.freeze({
  decodedLayerBytes: 512 * 1024 * 1024,
  decodedTotalBytes: 1024 * 1024 * 1024,
  entries: 100000,
  pathBytes: 256,
});
type Limits = { -readonly [Key in keyof typeof ceilings]: number };
const chunkBytes = 64 * 1024;

function readLimits(request: Partial<Limits>): Limits {
  const limits: Limits = { ...ceilings };
  for (const [key, value] of Object.entries(request)) {
    if (!Object.hasOwn(ceilings, key) || !Number.isSafeInteger(value) || value <= 0)
      // Proof: Removing limit validation accepted unknown/invalid caps; path-bounds negative failed.
      throw new Error('Object store layer facts limit is invalid');
    // Object.entries crosses the closed numeric limit boundary; membership was checked above.
    const limit = key as keyof Limits;
    if (value > ceilings[limit])
      // Proof: Removing the ceiling allowed caller-expanded caps; path-bounds negative failed.
      throw new Error('Object store layer facts limit exceeds ceiling');
    limits[limit] = value;
  }
  return limits;
}

function readPath(raw: string, limits: Limits, root = false): string {
  const path = raw.replace(/^\.\//, '').replace(/\/$/, '');
  if (
    Buffer.byteLength(raw) > limits.pathBytes ||
    /[^\x20-\x7e]/.test(raw) ||
    raw.includes('\\') ||
    (path === ''
      ? !root || raw !== './'
      : path.split('/').some((part) => part === '' || part === '.' || part === '..'))
  )
    // Proof: Removing path validation accepted ../a; traversal negative failed.
    throw new Error('Object store layer has an unsupported or unsafe path');
  return path;
}

function requireSymlink(path: string, target: string, limits: Limits): void {
  const parts = path.split('/').slice(0, -1);
  if (
    target === '' ||
    target.startsWith('/') ||
    Buffer.byteLength(target) > limits.pathBytes ||
    /[^\x20-\x7e]/.test(target) ||
    target.includes('\\')
  )
    // Proof: Removing target text validation accepted /absolute; unsafe-symlink negative failed.
    throw new Error('Object store layer has an unsafe symlink');
  for (const part of target.split('/')) {
    if (part === '..') {
      if (parts.length === 0)
        // Proof: Removing root confinement accepted ../outside; symlink-escape negative failed.
        throw new Error('Object store layer symlink escapes root');
      parts.pop();
    } else if (part !== '.' && part !== '') parts.push(part);
  }
}

function emptyCounts() {
  return {
    compressedBytes: 0,
    decodedBytes: 0,
    logicalFileBytes: 0,
    entries: 0,
    regularFiles: 0,
    directories: 0,
    hardlinks: 0,
    symlinks: 0,
    whiteouts: 0,
  };
}
type Counts = ReturnType<typeof emptyCounts>;

function inspectHeader(
  header: Buffer,
  paths: Map<string, string>,
  limits: Limits,
  counts: Counts,
): number {
  requireTarChecksum(header);
  const magic = header.subarray(257, 265).toString('binary');
  if (magic !== 'ustar\0' + '00' && magic !== 'ustar  \0')
    // Proof: Removing dialect validation accepted a changed magic; dialect negative failed.
    throw new Error('Object store layer has an unsupported tar dialect');
  const gnu = magic === 'ustar  \0';
  if (!(gnu ? header.subarray(345) : header.subarray(500)).every((byte) => byte === 0))
    // Proof: Removing extension refusal accepted nonzero GNU extension bytes; GNU-metadata negative failed.
    throw new Error('Object store layer has unsupported extended header metadata');
  const kind = String.fromCharCode(header[156]);
  if (!['0', '\0', '1', '2', '5'].includes(kind))
    // Proof: Removing type refusal lost the explicit PAX refusal; unsupported-PAX negative failed.
    throw new Error(
      'Object store layer has an unsupported member type (including PAX or sparse metadata)',
    );
  // Proof: Ignoring POSIX prefix fields failed the distinct-prefix positive and unsafe-prefix negative.
  const prefix = gnu ? '' : readTarField(header, 345, 500);
  const name = readTarField(header, 0, 100);
  const path = readPath(prefix === '' ? name : `${prefix}/${name}`, limits, kind === '5');
  if (kind !== '5' && name.endsWith('/'))
    // Proof: Removing spelling validation accepted symlink a/; directory-spelling negative failed.
    throw new Error('Object store layer non-directory path has directory spelling');
  if (paths.has(path))
    // Proof: Removing uniqueness accepted ./a plus a; duplicate-path negative failed.
    throw new Error('Object store layer has a duplicate path');
  const ancestors = path.split('/');
  ancestors.pop();
  while (ancestors.length > 0) {
    const ancestor = paths.get(ancestors.join('/'));
    if (ancestor !== undefined && ancestor !== '5')
      // Proof: Removing ancestor validation accepted dir/a beneath a symlink; ancestor negative failed.
      throw new Error('Object store layer path has a non-directory ancestor');
    ancestors.pop();
  }
  const size = readTarOctal(header, 124, 136);
  if (size > limits.decodedLayerBytes)
    // Proof: Removing size validation lost the early oversized-header refusal; declared-size negative failed.
    throw new Error('Object store layer member size exceeds bound');
  const link = readTarField(header, 157, 257);
  if (!['1', '2'].includes(kind) && link !== '')
    // Proof: Removing link-metadata validation accepted a regular-file target; regular-link negative failed.
    throw new Error('Object store layer non-link contains link metadata');
  const basename = path.slice(path.lastIndexOf('/') + 1);
  const whiteout = basename.startsWith('.wh.');
  if (whiteout) {
    if (
      (kind !== '0' && kind !== '\0') ||
      size !== 0 ||
      (basename !== '.wh..wh..opq' && (basename === '.wh.' || basename.slice(4).startsWith('.wh.')))
    )
      // Proof: Removing whiteout validation accepted a payload-bearing deletion record; whiteout negative failed.
      throw new Error('Object store layer has an ambiguous or unsupported whiteout');
    counts.whiteouts++;
  } else if (kind === '0' || kind === '\0') {
    counts.regularFiles++;
    counts.logicalFileBytes += size;
  } else {
    if (size !== 0)
      // Proof: Removing zero-payload validation accepted a directory body; directory-payload negative failed.
      throw new Error('Object store layer non-file has a payload');
    if (kind === '5') counts.directories++;
    else if (kind === '1') {
      const target = readPath(link, limits);
      if (!['0', '\0', '1'].includes(paths.get(target) ?? 'absent'))
        // Proof: Removing target validation accepted an absent hardlink target; hardlink negative failed.
        throw new Error('Object store layer hardlink target is not a prior regular file');
      counts.hardlinks++;
    } else {
      requireSymlink(path, link, limits);
      counts.symlinks++;
    }
  }
  paths.set(path, whiteout ? 'whiteout' : kind);
  counts.entries++;
  return size;
}

async function inspectLayer(bytes: Buffer, limits: Limits, totals: Counts) {
  const counts = emptyCounts();
  counts.compressedBytes = bytes.length;
  const paths = new Map<string, string>();
  let header = Buffer.alloc(512);
  let headerBytes = 0;
  let payloadBytes = 0;
  let paddingBytes = 0;
  let endBlocks = 0;
  const compressed = Readable.from(
    (function* () {
      for (let offset = 0; offset < bytes.length; offset += chunkBytes)
        yield bytes.subarray(offset, offset + chunkBytes);
    })(),
    { objectMode: false, highWaterMark: chunkBytes },
  );
  // Proof: Weakening gzip finalization with Z_SYNC_FLUSH accepted missing trailer bytes; gzip-truncated negative failed.
  const inflater = createGunzip({ chunkSize: chunkBytes });
  const decoded = compressed.pipe(inflater);
  try {
    // The stream contract yields Buffers; no archive member is retained beyond its header.
    for await (const value of decoded) {
      if (!Buffer.isBuffer(value))
        // Proof: Removing byte validation lost the named refusal for an injected string-yielding decoder; dependency negative failed.
        throw new Error('Object store layer decoder returned non-byte output');
      counts.decodedBytes += value.length;
      if (
        counts.decodedBytes > limits.decodedLayerBytes ||
        totals.decodedBytes + counts.decodedBytes > limits.decodedTotalBytes
      )
        // Proof: Removing expansion validation accepted over-limit decoding; layer-expansion negative failed. Removing the aggregate term failed aggregate-expansion.
        throw new Error('Object store layer expansion exceeds bound');
      let offset = 0;
      while (offset < value.length) {
        if (payloadBytes > 0) {
          const count = Math.min(payloadBytes, value.length - offset);
          payloadBytes -= count;
          offset += count;
        } else if (paddingBytes > 0) {
          const count = Math.min(paddingBytes, value.length - offset);
          if (!value.subarray(offset, offset + count).every((byte) => byte === 0))
            // Proof: Removing padding validation accepted a nonzero pad byte; padding negative failed.
            throw new Error('Object store layer has nonzero member padding');
          paddingBytes -= count;
          offset += count;
        } else {
          const count = Math.min(512 - headerBytes, value.length - offset);
          value.copy(header, headerBytes, offset, offset + count);
          headerBytes += count;
          offset += count;
          if (headerBytes === 512) {
            if (header.every((byte) => byte === 0)) endBlocks++;
            else {
              if (endBlocks > 0)
                // Proof: Removing tail validation lost the named nonzero-tail refusal; terminator negative failed.
                throw new Error('Object store layer has an invalid terminator');
              if (totals.entries + counts.entries >= limits.entries)
                // Proof: Removing the aggregate header cap accepted two layers above one-entry limit; member-bound negative failed.
                throw new Error('Object store layer member count exceeds bound');
              payloadBytes = inspectHeader(header, paths, limits, counts);
              paddingBytes = (512 - (payloadBytes % 512)) % 512;
            }
            headerBytes = 0;
            header = Buffer.alloc(512);
          }
        }
      }
    }
    if (inflater.bytesWritten !== bytes.length)
      // Proof: Removing consumption comparison accepted ignored compressed zero padding; gzip-consumption negative failed.
      throw new Error('Object store layer gzip input consumption is incomplete');
    if (headerBytes !== 0 || payloadBytes !== 0 || paddingBytes !== 0 || endBlocks < 2)
      // Proof: Removing final traversal validation accepted missing end blocks; tar-truncation negative failed.
      throw new Error('Object store layer has an incomplete tar traversal');
    return counts;
  } finally {
    compressed.destroy();
    decoded.destroy();
  }
}

/**
 * Completely inspect verified gzip-compressed GNU/POSIX ustar layers without extraction.
 * Supports regular files, directories, prior-file hardlinks, lexical root-confined symlinks
 * and empty regular OCI whiteouts. PAX, longname, sparse, devices and other extensions refuse.
 * Contributions are summed across layers without overwrite/deletion credits. Decoded and
 * logical bytes do not bound filesystem allocation or total process/import memory.
 * Optional limits only tighten parser ceilings; decoder chunks and the source watermark use 64KiB.
 * The existing outer bounded archive buffer remains allocated during inspection.
 * @throws On untrusted receipt fields, archive drift, incomplete gzip/tar, unsafe shapes or limits.
 */
export async function readObjectStoreLayerFacts(
  archive: ObjectStoreArchive,
  lock: Pick<ObjectStoreLock, 'image' | 'digest'>,
  request: Partial<Limits> = {},
) {
  const limits = readLimits(request);
  const verified = readObjectStoreLayers(archive, lock);
  const totals = emptyCounts();
  const facts = [];
  for (const layer of verified.layers) {
    const counts = await inspectLayer(layer.bytes, limits, totals);
    // Both closed count records originate in emptyCounts; their keys have the same numeric type.
    for (const key of Object.keys(totals) as (keyof Counts)[]) totals[key] += counts[key];
    facts.push({ digest: layer.digest, ...counts });
  }
  return {
    adapter: { id: 'object-store-layer-facts-v1', limits, chunkBytes },
    // Proof: Reusing caller SHA after an await failed the receipt-edit-during-decoding identity control.
    archive: {
      sha256: verified.archive.sha256,
      size: verified.archive.size,
      image: verified.archive.image,
      digest: verified.archive.digest,
      config: verified.archive.config,
      platform: verified.archive.platform,
    },
    layers: facts,
    totals,
    complete: true as const,
    unknown: {
      physicalAllocationBytes: 'unknown',
      inodeMetadataBytes: 'unknown',
      heapBytes: 'unknown',
      importMemoryBytes: 'unknown',
      unpackBytes: 'unknown',
    } as const,
  };
}
