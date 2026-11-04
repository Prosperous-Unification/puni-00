import { createHash } from 'node:crypto';
import { type BigIntStats, constants } from 'node:fs';
import { type FileHandle, open, readdir, realpath } from 'node:fs/promises';

import { type } from 'arktype';

import { completeRegistryOperation } from './registry-operation-completion';

const Digest = type(/^sha256:[a-f0-9]{64}$/);
const Component = type(/^[a-z0-9][a-z0-9_.-]{0,127}$/);
const Features = Component.array().atMostLength(64);
const platformShape = {
  os: Component,
  architecture: Component,
  'variant?': Component,
  'os.version?': Component,
  'os.features?': Features,
  'features?': Features,
} as const;
/** Declared image platform; absent optional attributes remain unspecified rather than receiving host defaults. */
export const RegistryImagePlatform = type({ ...platformShape, '+': 'reject' });
/** The source plan identifies the exact leaf, even when the client was asked to select it through an index. */
export const RegistryClientSelection = type({
  digest: Digest,
  platform: RegistryImagePlatform,
  '+': 'reject',
});
export type RegistryClientSelection = typeof RegistryClientSelection.infer;
const annotations = type('Record<string, string>');
const descriptorShape = {
  digest: Digest,
  size: 'number.safe >= 0',
  'annotations?': annotations,
} as const;
const Image = type({
  ...descriptorShape,
  mediaType:
    "'application/vnd.oci.image.manifest.v1+json'|'application/vnd.docker.distribution.manifest.v2+json'",
  'platform?': RegistryImagePlatform,
  'artifactType?':
    "'application/vnd.oci.image.config.v1+json'|'application/vnd.docker.container.image.v1+json'",
  '+': 'reject',
});
const Config = type({
  ...descriptorShape,
  mediaType:
    "'application/vnd.oci.image.config.v1+json'|'application/vnd.docker.container.image.v1+json'",
  '+': 'reject',
});
const Layer = type({
  ...descriptorShape,
  mediaType:
    "'application/vnd.oci.image.layer.v1.tar'|'application/vnd.oci.image.layer.v1.tar+gzip'|'application/vnd.oci.image.layer.v1.tar+zstd'|'application/vnd.docker.image.rootfs.diff.tar.gzip'",
  '+': 'reject',
});
const Index = type({
  schemaVersion: '2',
  'mediaType?': "'application/vnd.oci.image.index.v1+json'",
  manifests: Image.array().exactlyLength(1),
  'annotations?': annotations,
  '+': 'reject',
});
const Manifest = type({
  schemaVersion: '2',
  mediaType: Image.get('mediaType'),
  config: Config,
  layers: Layer.array().atMostLength(2048),
  'annotations?': annotations,
  '+': 'reject',
});
const Configuration = type({
  ...platformShape,
  rootfs: { type: "'layers'", diff_ids: Digest.array().atMostLength(2048), '+': 'reject' },
});
type BlobDescriptor = Pick<
  typeof Image.infer | typeof Config.infer | typeof Layer.infer,
  'digest' | 'size' | 'mediaType'
>;
interface Directory {
  descriptor: FileHandle;
  metadata: BigIntStats;
}
function path(directory: Directory, name?: string): string {
  return `/proc/self/fd/${String(directory.descriptor.fd)}${name === undefined ? '' : '/' + name}`;
}
function unchanged(before: BigIntStats, after: BigIntStats): boolean {
  return (
    before.dev === after.dev &&
    before.ino === after.ino &&
    before.uid === after.uid &&
    before.gid === after.gid &&
    before.mode === after.mode &&
    before.nlink === after.nlink &&
    before.size === after.size &&
    before.mtimeNs === after.mtimeNs &&
    before.ctimeNs === after.ctimeNs
  );
}
async function withDirectory<T>(
  selectedPath: string,
  parent: Directory | undefined,
  signal: AbortSignal,
  operate: (directory: Directory) => Promise<T>,
): Promise<T> {
  signal.throwIfAborted();
  const descriptor = await open(
    selectedPath,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  return completeRegistryOperation(
    async () => {
      const metadata = await descriptor.stat({ bigint: true });
      if (
        !metadata.isDirectory() ||
        (metadata.mode & 0o500n) !== 0o500n ||
        (parent === undefined
          ? (metadata.mode & 0o777n) !== 0o700n
          : metadata.dev !== parent.metadata.dev ||
            metadata.uid !== parent.metadata.uid ||
            metadata.gid !== parent.metadata.gid ||
            (metadata.mode & 0o022n) !== 0n)
      )
        throw new Error('Untrusted client directory');
      const completed = await operate({ descriptor, metadata });
      signal.throwIfAborted();
      if (!unchanged(metadata, await descriptor.stat({ bigint: true })))
        throw new Error('Client directory changed during verification');
      return completed;
    },
    () => descriptor.close(),
  );
}
async function requireEntries(directory: Directory, expected: string[]): Promise<void> {
  if (
    JSON.stringify((await readdir(path(directory))).sort()) !== JSON.stringify([...expected].sort())
  )
    throw new Error('Unexpected client layout entries');
}
async function readContent(
  directory: Directory,
  name: string,
  maximum: number,
  signal: AbortSignal,
  consume: (bytes: Uint8Array) => void,
): Promise<{ digest: string; size: number }> {
  signal.throwIfAborted();
  const descriptor = await open(
    path(directory, name),
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  return completeRegistryOperation(
    async () => {
      const before = await descriptor.stat({ bigint: true });
      if (
        !before.isFile() ||
        before.nlink !== 1n ||
        before.uid !== directory.metadata.uid ||
        before.gid !== directory.metadata.gid ||
        before.dev !== directory.metadata.dev ||
        (before.mode & 0o400n) === 0n ||
        (before.mode & 0o022n) !== 0n
      )
        throw new Error('Untrusted client file');
      if (before.size > BigInt(maximum)) throw new Error('Client content exceeds admitted bytes');
      const hash = createHash('sha256'),
        buffer = Buffer.alloc(65536);
      let size = 0;
      for (;;) {
        signal.throwIfAborted();
        const read = await descriptor.read(buffer);
        if (read.bytesRead === 0) break;
        size += read.bytesRead;
        if (size > maximum) throw new Error('Client content exceeds admitted bytes');
        const bytes = buffer.subarray(0, read.bytesRead);
        hash.update(bytes);
        consume(bytes);
      }
      signal.throwIfAborted();
      if (
        BigInt(size) !== before.size ||
        !unchanged(before, await descriptor.stat({ bigint: true }))
      )
        throw new Error('Client file changed during verification');
      return { digest: 'sha256:' + hash.digest('hex'), size };
    },
    () => descriptor.close(),
  );
}
function decode(bytes: Uint8Array): unknown {
  try {
    const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return parsed;
  } catch (cause) {
    throw new Error('Malformed client layout JSON', { cause });
  }
}
async function readJson(
  directory: Directory,
  name: string,
  maximum: number,
  signal: AbortSignal,
): Promise<unknown> {
  const chunks: Buffer[] = [];
  await readContent(directory, name, maximum, signal, (bytes) => {
    chunks.push(Buffer.from(bytes));
  });
  return decode(Buffer.concat(chunks));
}
async function verifyBlob(
  directory: Directory,
  descriptor: BlobDescriptor,
  signal: AbortSignal,
  metadata: boolean,
): Promise<unknown> {
  const chunks: Buffer[] = [];
  const content = await readContent(
    directory,
    descriptor.digest.slice(7),
    metadata ? Math.min(descriptor.size, 4 * 1024 ** 2) : descriptor.size,
    signal,
    (bytes) => {
      if (metadata) chunks.push(Buffer.from(bytes));
    },
  );
  // Proof: isolated layer-digest and descriptor-size removals each admit their corrupted layout in registry-client-layout.test.ts.
  if (content.digest !== descriptor.digest || content.size !== descriptor.size)
    throw new Error('Client blob differs from manifest descriptor');
  return metadata ? decode(Buffer.concat(chunks)) : undefined;
}
function requirePlatform(
  actual: typeof Configuration.infer,
  expected: typeof RegistryImagePlatform.infer,
): void {
  // Proof: removing OS/architecture equality admits the wrong selected architecture in registry-client-layout.test.ts.
  if (actual.os !== expected.os || actual.architecture !== expected.architecture)
    throw new Error('Client configuration platform differs from selection');
  for (const field of ['variant', 'os.version'] as const)
    if (actual[field] !== undefined && actual[field] !== expected[field])
      throw new Error('Client configuration platform differs from selection');
  for (const field of ['os.features', 'features'] as const) {
    const declared = actual[field];
    if (
      declared !== undefined &&
      JSON.stringify([...declared].sort()) !==
        JSON.stringify(expected[field] === undefined ? undefined : [...expected[field]].sort())
    )
      throw new Error('Client configuration platform differs from selection');
  }
}

/**
 * Verify a completed OCI client layout against its exact source-selected leaf and platform.
 * Hash every expected blob with bounded streaming reads; parse bounded UTF8 metadata and reject
 * extra content, unsupported relationships, aliased/cache-linked nodes or changing filesystem state.
 * Anchored directory descriptors prevent a renamed path prefix from redirecting later reads.
 * Every opened descriptor is closed before success or rejection, preserving operation and cleanup causes.
 * A borrowed parent handle binds native output to the held job even when its pathname is replaced;
 * the caller retains and closes that handle. Crane's image descriptor may declare its config media
 * type as artifactType; a present marker must match the verified manifest's image config type.
 * The caller separately proves a fresh bounded workspace, actual client execution and terminal
 * cleanup; this function neither establishes that provenance nor unpacks/runs an image.
 */
export async function verifyRegistryClientLayout(
  directory: string | { readonly parent: FileHandle; readonly name: 'output' },
  expected: RegistryClientSelection,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  const selection = structuredClone(expected);
  const selectedPath =
    typeof directory === 'string'
      ? directory
      : `/proc/self/fd/${String(directory.parent.fd)}/${directory.name}`;
  if (typeof directory === 'string' && (await realpath(directory)) !== directory)
    throw new Error('Client directory is not canonical');
  await withDirectory(selectedPath, undefined, signal, async (root) => {
    await requireEntries(root, ['oci-layout', 'index.json', 'blobs']);
    type({ imageLayoutVersion: "'1.0.0'", '+': 'reject' }).assert(
      await readJson(root, 'oci-layout', 1024, signal),
    );
    const index = Index.assert(await readJson(root, 'index.json', 4 * 1024 ** 2, signal));
    const selected = index.manifests.at(0);
    if (selected?.digest !== selection.digest)
      throw new Error('Client selected a different manifest');
    await withDirectory(path(root, 'blobs'), root, signal, async (blobs) => {
      await requireEntries(blobs, ['sha256']);
      await withDirectory(path(blobs, 'sha256'), blobs, signal, async (hashes) => {
        const manifest = Manifest.assert(await verifyBlob(hashes, selected, signal, true));
        // Proof: artifact-marker removal admits a Docker config marker for an OCI config in registry-client-layout.test.ts.
        if (
          selected.artifactType !== undefined &&
          selected.artifactType !== manifest.config.mediaType
        )
          throw new Error('Client image descriptor artifact type differs from config');
        if (manifest.mediaType !== selected.mediaType)
          throw new Error('Client manifest media type differs from index');
        const expectedBlobs = new Map<string, BlobDescriptor>();
        for (const descriptor of [selected, manifest.config, ...manifest.layers]) {
          const previous = expectedBlobs.get(descriptor.digest);
          if (
            previous !== undefined &&
            (previous.size !== descriptor.size || previous.mediaType !== descriptor.mediaType)
          )
            throw new Error('Contradictory client blob descriptors');
          expectedBlobs.set(descriptor.digest, descriptor);
        }
        await requireEntries(
          hashes,
          [...expectedBlobs.keys()].map((digest) => digest.slice(7)),
        );
        const config = Configuration.assert(
          await verifyBlob(hashes, manifest.config, signal, true),
        );
        requirePlatform(config, selection.platform);
        if (config.rootfs.diff_ids.length !== manifest.layers.length)
          throw new Error('Client rootfs differs from layer closure');
        for (const descriptor of expectedBlobs.values())
          if (descriptor.digest !== selected.digest && descriptor.digest !== manifest.config.digest)
            await verifyBlob(hashes, descriptor, signal, false);
      });
    });
    await requireEntries(root, ['oci-layout', 'index.json', 'blobs']);
  });
}
