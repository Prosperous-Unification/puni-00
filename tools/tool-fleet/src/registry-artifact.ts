import { createHash } from 'node:crypto';

import { type } from 'arktype';

/** An immutable content range inside a bounded exported OCI archive. */
export interface RegistryContent {
  readonly digest: string;
  readonly size: number;
  readonly mediaType: string;
  readonly path: string;
  readonly offset: number;
  readonly dependencies: readonly string[];
  readonly isManifest: boolean;
}

/** Complete verified closure, in dependency-first transfer order. */
export interface RegistryArtifact {
  readonly repository: string;
  readonly reference: string;
  readonly digest: string;
  readonly contents: readonly RegistryContent[];
}

const Descriptor = type({
  digest: /^sha256:[0-9a-f]{64}$/,
  size: 'number.integer >= 0',
  mediaType: 'string > 0',
});
const Image = type({
  schemaVersion: '2',
  mediaType: 'string',
  'config?': Descriptor,
  'layers?': Descriptor.array(),
  'manifests?': Descriptor.array(),
  'subject?': 'unknown',
  'artifactType?': 'unknown',
});
const imageTypes = new Set([
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
]);
const indexTypes = new Set([
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
]);

/** Verify content immediately before transfer as well as during initial closure inspection. */
export async function verifyContent(content: RegistryContent): Promise<Blob> {
  const bytes = Bun.file(content.path).slice(content.offset, content.offset + content.size);
  const hash = createHash('sha256');
  let size = 0;
  for await (const chunk of bytes.stream()) {
    hash.update(chunk);
    size += chunk.length;
  }
  // Proof: removing digest refusal made the corrupt-archive production inspection succeed.
  if (size !== content.size || `sha256:${hash.digest('hex')}` !== content.digest)
    throw new Error(`Content digest mismatch: ${content.digest}`);
  return bytes;
}

/**
 * Freeze a complete OCI image closure from an uncompressed tar export, without extracting
 * paths or allocating a second archive. Each byte range is hashed, then rehashed before upload.
 * Unsupported archive entries and image relationships throw before registry admission.
 */
export async function inspectOciArchive(
  path: string,
  repository: string,
  reference: string,
): Promise<RegistryArtifact> {
  const archive = Bun.file(path);
  const ranges = new Map<string, { offset: number; size: number }>();
  let offset = 0;
  const field = (header: Uint8Array, start: number, end: number) =>
    new TextDecoder().decode(header.subarray(start, end)).replace(/\0.*$/s, '');
  while (offset + 512 <= archive.size) {
    const header = new Uint8Array(await archive.slice(offset, offset + 512).arrayBuffer());
    if (header.every((byte) => byte === 0)) break;
    const name = field(header, 0, 100);
    const prefix = field(header, 345, 500);
    const entry = prefix === '' ? name : `${prefix}/${name}`;
    const count = field(header, 124, 136).trim();
    const checksum = field(header, 148, 156).trim();
    const sum = header.reduce(
      (total, byte, index) => total + (index >= 148 && index < 156 ? 32 : byte),
      0,
    );
    const size = Number.parseInt(count, 8);
    if (
      !/^[0-7]+$/.test(count) ||
      !/^[0-7]+$/.test(checksum) ||
      Number.parseInt(checksum, 8) !== sum ||
      !Number.isSafeInteger(size) ||
      offset + 512 + size > archive.size
    )
      // Proof: removing this refusal admitted the checksum-corrupt tar fixture.
      throw new Error('Malformed or truncated OCI archive header');
    const kind = header[156];
    if (kind !== 53) {
      if (
        (kind !== 0 && kind !== 48) ||
        !/^(index\.json|manifest\.json|oci-layout|blobs\/sha256\/[0-9a-f]{64})$/.test(entry) ||
        ranges.has(entry)
      )
        // Proof: removing this refusal admitted a symlink-typed index entry.
        throw new Error(`Unsupported OCI archive entry: ${entry}`);
      ranges.set(entry, { offset: offset + 512, size });
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  const readJson = async (entry: string): Promise<unknown> => {
    const range = ranges.get(entry);
    if (range === undefined || range.size > 4 * 1024 * 1024)
      throw new Error(`Missing or oversized OCI metadata: ${entry}`);
    return JSON.parse(await archive.slice(range.offset, range.offset + range.size).text());
  };
  const Layout = type({ imageLayoutVersion: "'1.0.0'" });
  if (Layout(await readJson('oci-layout')) instanceof type.errors)
    throw new Error('Unsupported OCI layout');
  const Index = type({ schemaVersion: '2', manifests: Descriptor.array().exactlyLength(1) });
  const index = Index(await readJson('index.json'));
  if (index instanceof type.errors) throw new Error('OCI export must identify exactly one image');
  const root = index.manifests[0];
  const contents: RegistryContent[] = [];
  const visited = new Map<string, typeof Descriptor.infer>();
  const active = new Set<string>();
  const visit = async (descriptor: typeof Descriptor.infer): Promise<void> => {
    if (active.has(descriptor.digest)) throw new Error('Cyclic OCI closure');
    const prior = visited.get(descriptor.digest);
    if (prior !== undefined) {
      if (prior.size !== descriptor.size || prior.mediaType !== descriptor.mediaType)
        // Proof: removing this refusal admitted conflicting sizes for the same shared child digest.
        throw new Error('Contradictory OCI descriptor');
      return;
    }
    const range = ranges.get(`blobs/sha256/${descriptor.digest.slice(7)}`);
    if (range?.size !== descriptor.size)
      throw new Error(`Missing OCI content or size mismatch: ${descriptor.digest}`);
    const isManifest = imageTypes.has(descriptor.mediaType) || indexTypes.has(descriptor.mediaType);
    const content: RegistryContent = {
      ...descriptor,
      path,
      offset: range.offset,
      dependencies: [],
      isManifest,
    };
    await verifyContent(content);
    active.add(descriptor.digest);
    let dependencies: (typeof Descriptor.infer)[] = [];
    if (isManifest) {
      const manifest = Image(await readJson(`blobs/sha256/${descriptor.digest.slice(7)}`));
      if (
        manifest instanceof type.errors ||
        manifest.mediaType !== descriptor.mediaType ||
        manifest.subject !== undefined ||
        manifest.artifactType !== undefined
      )
        throw new Error('Unsupported OCI manifest relationships');
      if (indexTypes.has(descriptor.mediaType)) {
        if (
          manifest.manifests === undefined ||
          manifest.manifests.length === 0 ||
          manifest.config !== undefined ||
          manifest.layers !== undefined
        )
          throw new Error('Incomplete OCI index');
        if (
          manifest.manifests.some(
            (child) => !imageTypes.has(child.mediaType) && !indexTypes.has(child.mediaType),
          )
        )
          // Proof: removing this refusal admitted an unknown artifact as an index child.
          throw new Error('Unsupported OCI index child');
        dependencies = manifest.manifests;
      } else {
        if (
          manifest.config === undefined ||
          manifest.layers === undefined ||
          manifest.manifests !== undefined
        )
          throw new Error('Incomplete OCI image');
        dependencies = [manifest.config, ...manifest.layers];
      }
      for (const child of dependencies) await visit(child);
    }
    active.delete(descriptor.digest);
    visited.set(descriptor.digest, descriptor);
    contents.push({ ...content, dependencies: dependencies.map((child) => child.digest) });
  };
  if (!imageTypes.has(root.mediaType) && !indexTypes.has(root.mediaType))
    throw new Error('OCI root is not an image');
  await visit(root);
  return { repository, reference, digest: root.digest, contents };
}
