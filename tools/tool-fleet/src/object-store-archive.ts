import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type } from 'arktype';

import type { ObjectStoreLock } from './object-store-image';

const LIMIT = 128 * 1024 * 1024;
const digest = /^sha256:[a-f0-9]{64}$/;
const manifestType = 'application/vnd.oci.image.manifest.v1+json';
const configType = 'application/vnd.oci.image.config.v1+json';
const layerType = 'application/vnd.oci.image.layer.v1.tar+gzip';
const Descriptor = type({
  mediaType: 'string',
  digest,
  size: 'number.integer>=0',
  'annotations?': 'Record<string,string>',
  '+': 'reject',
});
// Proof: Widening the one-manifest schema accepted duplicate selectors; index-multiple negative failed.
// Proof: Widening platform architecture accepted arm64; platform negative failed.
const Index = type({
  schemaVersion: '2',
  mediaType: 'string',
  manifests: type({
    '...': Descriptor,
    annotations: {
      'io.containerd.image.name': 'string',
      'org.opencontainers.image.ref.name': 'string',
      'org.opencontainers.image.created?': 'string',
      '+': 'reject',
    },
    platform: { architecture: "'amd64'", os: "'linux'", '+': 'reject' },
    '+': 'reject',
  })
    .array()
    .exactlyLength(1),
  '+': 'reject',
});
// Proof: Removing the layer minimum accepted a zero-layer image; corrected manifest-shape negative failed.
const Manifest = type({
  schemaVersion: '2',
  mediaType: 'string',
  config: Descriptor,
  layers: Descriptor.array().atLeastLength(1).atMostLength(16),
  '+': 'reject',
});
// Proof: Widening compatibility cardinality accepted a second image; docker-multiple negative failed.
const Compatibility = type({
  Config: 'string',
  RepoTags: type('string').array().exactlyLength(1),
  Layers: 'string[]',
  '+': 'reject',
})
  .array()
  .exactlyLength(1);
const hashBytes = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/**
 * Identity of retained public image bytes, never resource ownership or a deletion grant.
 * Byte demand covers retained archive and bounded verification/import buffers only. Unpack
 * and runtime demand remain unknown until the full cold-start admission evaluates them.
 * See docs/infra/recovery.md; source Git identity is recorded separately by the lab caller.
 */
export const ObjectStoreArchiveSchema = type({
  path: /^\//,
  image: 'string>0',
  digest,
  config: digest,
  layers: type({ digest, size: 'number.integer>=0', '+': 'reject' })
    .array()
    .atLeastLength(1)
    .atMostLength(16),
  platform: "'linux/amd64'",
  sha256: /^[a-f0-9]{64}$/,
  size: 'number.integer>=1024',
  verificationBufferBytes: 'number.integer>0',
  importBufferBytes: 'number.integer>0',
  metadataBytes: 'number.integer>=0',
  verificationMemoryBytes: "'unknown'",
  importMemoryBytes: "'unknown'",
  unpackBytes: "'unknown'",
  '+': 'reject',
});
export type ObjectStoreArchive = typeof ObjectStoreArchiveSchema.infer;

function readBoundedArchive(path: string): Buffer {
  // Proof: Dropping O_NOFOLLOW accepted a symlink source; source-symlink negative failed.
  const descriptor = openSync(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const metadata = fstatSync(descriptor);
    if (!metadata.isFile())
      // Proof: Removing regular-file refusal failed the non-regular source negative (object-store-archive.test.ts).
      throw new Error('Object store archive must be a regular file');
    if (metadata.size < 1024 || metadata.size > LIMIT)
      // Proof: Removing the size bound accepted the oversized sparse archive; size negative failed.
      throw new Error('Object store archive size is outside the bounded format');
    const bytes = Buffer.alloc(metadata.size + 1);
    let length = 0;
    while (length < bytes.length) {
      const count = readSync(descriptor, bytes, length, bytes.length - length, null);
      if (count === 0) break;
      length += count;
    }
    if (length !== metadata.size)
      // Proof: Removing length comparison accepted bytes after injected fstat size drift; changed-source-length negative failed.
      throw new Error('Object store archive changed size while reading');
    return bytes.subarray(0, length);
  } finally {
    closeSync(descriptor);
  }
}

function readMembers(bytes: Buffer): Map<string, Buffer> {
  const members = new Map<string, Buffer>();
  let offset = 0;
  let count = 0;
  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      if (
        bytes.length - offset < 1024 ||
        bytes.length % 512 !== 0 ||
        !bytes.subarray(offset).every((byte) => byte === 0)
      )
        // Proof: Removing terminator validation accepted a nonzero tail; terminator negative failed.
        throw new Error('Object store archive has an invalid terminator');
      return members;
    }
    if (++count > 32)
      // Proof: Removing the member cap lost the bounded member-count refusal; corrected many-members negative failed.
      throw new Error('Object store archive has too many members');
    const field = (start: number, end: number): string => {
      const segment = header.subarray(start, end);
      const terminator = segment.indexOf(0);
      if (terminator >= 0 && !segment.subarray(terminator).every((byte) => byte === 0))
        // Proof: Removing NUL-tail validation accepted the hidden header suffix; ambiguous-name negative failed.
        throw new Error('Object store archive has an ambiguous header');
      return segment.subarray(0, terminator < 0 ? segment.length : terminator).toString('utf8');
    };
    const octal = (start: number, end: number): number => {
      const text = header
        .subarray(start, end)
        .toString('utf8')
        .replace(/[\0 ]+$/, '');
      if (!/^[0-7]+$/.test(text))
        // Proof: Removing octal validation lost the specific invalid-header refusal; octal negative failed.
        throw new Error('Object store archive has invalid octal metadata');
      return Number.parseInt(text, 8);
    };
    const checksum = header.reduce(
      (sum, byte, position) => sum + (position >= 148 && position < 156 ? 32 : byte),
      0,
    );
    if (octal(148, 156) !== checksum)
      // Proof: Removing checksum validation accepted the altered header; checksum negative failed.
      throw new Error('Object store archive header checksum differs');
    if (
      header.subarray(257, 265).toString('binary') !== 'ustar\0' + '00' ||
      field(345, 500) !== '' ||
      field(157, 257) !== ''
    )
      // Proof: Removing simple-header validation accepted the prefix selector; header-prefix negative failed.
      throw new Error('Object store archive requires simple ustar headers');
    const name = field(0, 100);
    if (
      !/^(blobs\/|blobs\/sha256\/|blobs\/sha256\/[a-f0-9]{64}|index\.json|manifest\.json|oci-layout)$/.test(
        name,
      ) ||
      members.has(name)
    )
      // Proof: Removing path uniqueness accepted a duplicate index; duplicate negative failed.
      throw new Error('Object store archive has an unsafe, unexpected or duplicate path');
    const size = octal(124, 136);
    const directory = name === 'blobs/' || name === 'blobs/sha256/';
    if ((directory && (header[156] !== 53 || size !== 0)) || (!directory && header[156] !== 48))
      // Proof: Removing type validation accepted a symlink member; symlink negative failed.
      throw new Error('Object store archive has an unsupported member type');
    const end = offset + 512 + size;
    const next = offset + 512 + Math.ceil(size / 512) * 512;
    if (
      size > LIMIT ||
      next > bytes.length ||
      !bytes.subarray(end, next).every((byte) => byte === 0)
    )
      // Proof: Removing member validation accepted nonzero member padding; corrected padding negative failed.
      throw new Error('Object store archive member bounds or padding differ');
    members.set(name, bytes.subarray(offset + 512, end));
    offset = next;
  }
  // Proof: Removing the terminal refusal lost the explicit truncated-input error; truncated negative failed.
  throw new Error('Object store archive is truncated');
}

/**
 * Capture one locked simple ustar OCI archive without extraction, network or Docker commands.
 * Validates actual referenced bytes and both import selector formats, then writes an exclusive
 * owner-only copy. Release signatures remain the build's provenance; this verifies its locked
 * output and does not manufacture new signature or human-review evidence.
 * @throws On missing/unreadable/unsupported input, incomplete identities or existing capture.
 */
export async function captureObjectStoreArchive(
  source: string,
  state: string,
  lock: Pick<ObjectStoreLock, 'image' | 'digest'>,
): Promise<ObjectStoreArchive> {
  const bytes = readBoundedArchive(source);
  const members = readMembers(bytes);
  const required = (name: string): Buffer => {
    const member = members.get(name);
    // Proof: Removing presence refusal lost the named missing-member error; missing-index negative failed.
    if (member === undefined) throw new Error(`Object store archive is missing ${name}`);
    return member;
  };
  const parse = (name: string): unknown => {
    const member = required(name);
    if (member.length > 1024 * 1024)
      // Proof: Removing the metadata bound accepted oversized config JSON; metadata negative failed.
      throw new Error('Object store archive metadata exceeds its bound');
    // Proof: Stripping trailing junk or replacing invalid UTF-8 accepted malformed metadata; index-json/index-utf8 negatives failed.
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(member));
  };
  // Proof: Omitting layout validation accepted an absent oci-layout; missing-layout negative failed.
  type({ imageLayoutVersion: "'1.0.0'", '+': 'reject' }).assert(parse('oci-layout'));
  const index = Index.assert(parse('index.json'));
  const descriptor = index.manifests[0];
  if (
    index.mediaType !== 'application/vnd.oci.image.index.v1+json' ||
    descriptor.mediaType !== manifestType ||
    descriptor.digest !== lock.digest ||
    descriptor.annotations['io.containerd.image.name'] !== lock.image ||
    descriptor.annotations['org.opencontainers.image.ref.name'] !== lock.image.split(':').at(-1)
  )
    // Proof: Removing the locked-selector guard accepted a foreign image reference; reference negative failed.
    throw new Error('Object store archive locked identity differs');
  const referenced = new Set([
    'index.json',
    'oci-layout',
    'manifest.json',
    'blobs/',
    'blobs/sha256/',
  ]);
  const verify = (entry: typeof Descriptor.infer, mediaType: string): string => {
    const name = `blobs/sha256/${entry.digest.slice(7)}`;
    const member = required(name);
    if (
      entry.mediaType !== mediaType ||
      member.length !== entry.size ||
      `sha256:${hashBytes(member)}` !== entry.digest
    )
      // Proof: Removing blob verification accepted altered same-size layer bytes; layer negative failed.
      throw new Error('Object store archive blob identity or size differs');
    referenced.add(name);
    return name;
  };
  const manifestPath = verify(descriptor, manifestType);
  const manifest = Manifest.assert(parse(manifestPath));
  if (manifest.mediaType !== manifestType)
    // Proof: Removing manifest media validation accepted the foreign type; manifest-media negative failed.
    throw new Error('Object store archive manifest media type differs');
  const configPath = verify(manifest.config, configType);
  // Proof: Omitting config platform validation accepted an arm64 config; config-platform negative failed.
  type({ architecture: "'amd64'", os: "'linux'" }).assert(parse(configPath));
  const layerPaths = manifest.layers.map((layer) => verify(layer, layerType));
  if (members.has('manifest.json')) {
    const compatibility = Compatibility.assert(parse('manifest.json'))[0];
    if (
      compatibility.Config !== configPath ||
      compatibility.RepoTags[0] !== lock.image.replace(/^docker\.io\//, '') ||
      JSON.stringify(compatibility.Layers) !== JSON.stringify(layerPaths)
    )
      // Proof: Removing compatibility comparison accepted another layer selector; docker-layer negative failed.
      throw new Error('Object store archive compatibility identity differs');
  }
  if ([...members.keys()].some((name) => !referenced.has(name)))
    // Proof: Removing closure validation accepted an extra SHA256 blob; unreferenced negative failed.
    throw new Error('Object store archive contains an unreferenced blob');
  const directory = join(state, 'object-store');
  await mkdir(directory, { mode: 0o700 });
  const archive: ObjectStoreArchive = {
    path: join(directory, 'image.oci'),
    image: lock.image,
    digest: lock.digest,
    config: manifest.config.digest,
    layers: manifest.layers.map((layer) => ({ digest: layer.digest, size: layer.size })),
    platform: 'linux/amd64',
    sha256: hashBytes(bytes),
    size: bytes.length,
    verificationBufferBytes: bytes.length + 1,
    importBufferBytes: bytes.length + 1,
    metadataBytes: [...members]
      .filter(
        ([name]) =>
          name.endsWith('.json') ||
          name === configPath ||
          name === manifestPath ||
          name === 'oci-layout',
      )
      .reduce((sum, [, member]) => sum + member.length, 0),
    verificationMemoryBytes: 'unknown',
    importMemoryBytes: 'unknown',
    unpackBytes: 'unknown',
  };
  await writeFile(archive.path, bytes, { flag: 'wx', mode: 0o400 });
  await writeFile(join(directory, 'archive.json'), `${JSON.stringify(archive)}\n`, {
    flag: 'wx',
    mode: 0o400,
  });
  return Object.freeze(archive);
}

/** Re-read bounded retained bytes and verify the whole archive before handing the buffer to stdin. */
export function readObjectStoreArchive(archive: ObjectStoreArchive): Buffer {
  const bytes = readBoundedArchive(archive.path);
  if (bytes.length !== archive.size || hashBytes(bytes) !== archive.sha256)
    // Proof: Removing retained-byte comparison reached import after private-copy corruption; retained-identity negative failed.
    throw new Error('Object store retained archive changed');
  return bytes;
}
