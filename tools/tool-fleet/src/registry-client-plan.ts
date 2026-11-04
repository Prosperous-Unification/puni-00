import { type } from 'arktype';

import { type RegistryClientSelection, RegistryImagePlatform } from './registry-client-layout';
import { collectRegistryStoredContent, type RegistryRevision } from './registry-inventory';
import type { RegistryJournal } from './registry-journal';

const Digest = type(/^sha256:[a-f0-9]{64}$/);
const Descriptor = type({
  digest: Digest,
  size: 'number.safe >= 0',
  mediaType: 'string > 0',
  'platform?': RegistryImagePlatform,
  'annotations?': 'Record<string, string>',
  '+': 'reject',
});
const Manifest = type({
  schemaVersion: '2',
  mediaType: 'string > 0',
  'config?': Descriptor,
  'layers?': Descriptor.array().atMostLength(2048),
  'manifests?': Descriptor.array().atMostLength(2048),
  'annotations?': 'Record<string, string>',
  '+': 'reject',
});
const Configuration = type({
  os: 'string',
  architecture: 'string',
  'variant?': 'string',
  'os.version?': 'string',
  'os.features?': 'string[]',
  'features?': 'string[]',
  rootfs: { type: "'layers'", diff_ids: Digest.array().atMostLength(2048), '+': 'reject' },
});
const imageTypes = [
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
];
const indexTypes = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
];
const configTypes = [
  'application/vnd.oci.image.config.v1+json',
  'application/vnd.docker.container.image.v1+json',
];
const layerTypes = [
  'application/vnd.oci.image.layer.v1.tar',
  'application/vnd.oci.image.layer.v1.tar+gzip',
  'application/vnd.oci.image.layer.v1.tar+zstd',
  'application/vnd.docker.image.rootfs.diff.tar.gzip',
];
type Platform = typeof RegistryImagePlatform.infer;
type Blob = Pick<typeof Descriptor.infer, 'digest' | 'size' | 'mediaType'>;
type Content =
  | { kind: 'image'; platform: Platform; blobs: Blob[]; mediaType: string }
  | {
      kind: 'index';
      children: (typeof Descriptor.infer & { platform: Platform })[];
      mediaType: string;
    };
export interface RegistryClientPullPlan {
  readonly binding: {
    readonly journalRevision: number;
    readonly storageId: string;
    readonly registryPath: string;
    readonly censusSha256: string;
    readonly filesystem: string;
  };
  readonly revisions: RegistryRevision[];
  readonly pulls: {
    repository: string;
    reference: string;
    selection: RegistryClientSelection;
    envelope: { bytes: number; inodes: number };
  }[];
}
function selector(platform: Platform): string {
  return (
    platform.os +
    '/' +
    platform.architecture +
    (platform.variant === undefined ? '' : '/' + platform.variant) +
    (platform['os.version'] === undefined ? '' : ':' + platform['os.version'])
  );
}
function requireCompatible(actual: Platform, declared: Platform): void {
  // Proof: config-platform removal acknowledges a declared architecture differing from the real config.
  if (actual.os !== declared.os || actual.architecture !== declared.architecture)
    throw new Error('Contradictory physical image platform');
  for (const key of ['variant', 'os.version'] as const)
    if (actual[key] !== undefined && actual[key] !== declared[key])
      throw new Error('Contradictory physical image platform');
  for (const key of ['os.features', 'features'] as const)
    if (
      actual[key] !== undefined &&
      JSON.stringify([...actual[key]].sort()) !==
        JSON.stringify(declared[key] === undefined ? undefined : [...declared[key]].sort())
    )
      throw new Error('Contradictory physical image platform');
}
function envelope(blobs: Blob[], unit: number) {
  const block = BigInt(unit);
  let bytes = 8388608n + 32n * block;
  for (const blob of blobs) bytes += 2n * ((BigInt(blob.size) + block - 1n) / block) * block;
  // Proof: envelope-overflow removal acknowledges an inexact physical byte budget for MAX_SAFE_INTEGER blocks.
  if (bytes > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Unsafe client scratch envelope');
  return { bytes: Number(bytes), inodes: 32 + 2 * blobs.length };
}

/**
 * Derive exact repository-qualified direct and index-platform pulls from a complete physical CAS,
 * without invoking consumer readers. Every descriptor resolves to the same repository revision,
 * media type, content size and linked config/layer. Index platform hints must agree with image
 * configs, remain selectable through every nested index and yield one leaf for the actual Crane
 * selector (which cannot express feature predicates). Missing/ambiguous metadata never receives
 * host defaults. The source census is rehashed before returning its revision/store binding.
 * Scratch reserves two allocated copies per unique blob, 32 metadata blocks/inodes and 8MiB
 * bounded metadata/credentials workspace; caller supplies the measured scratch allocation unit.
 * This plan alone grants neither a pull receipt nor service restoration.
 */
export async function planRegistryClientPulls(
  journal: RegistryJournal,
  allocationUnitBytes: number,
  signal: AbortSignal,
): Promise<RegistryClientPullPlan> {
  signal.throwIfAborted();
  // Proof: allocation-unit removal acknowledges a negative measured unit in the physical planner test.
  if (!Number.isSafeInteger(allocationUnitBytes) || allocationUnitBytes <= 0)
    throw new Error('Unsafe client scratch allocation unit');
  const stored = await collectRegistryStoredContent(journal, signal);
  const revisions = new Set(stored.revisions.map((r) => r.repository + '@' + r.digest));
  const parsed = new Map<string, Content>();
  const media = new Map<string, string>();
  const checkDescriptor = (descriptor: Blob) => {
    const physical = stored.blobs.get(descriptor.digest);
    // Proof: descriptor-size removal acknowledges an index descriptor differing from actual stored size.
    if (physical?.size !== descriptor.size)
      throw new Error('Missing physical dependency or descriptor size mismatch');
    const previous = media.get(descriptor.digest);
    // Proof: shared-media removal acknowledges one physical digest declared as both config and layer.
    if (previous !== undefined && previous !== descriptor.mediaType)
      throw new Error('Contradictory physical descriptor media type');
    media.set(descriptor.digest, descriptor.mediaType);
  };
  const read = async (repository: string, digest: string): Promise<Content> => {
    signal.throwIfAborted();
    const key = repository + '@' + digest;
    // Proof: repository-revision removal changes this controlled refusal to a later missing-layer-link error.
    if (!revisions.has(key)) throw new Error('Missing required repository revision');
    const previous = parsed.get(key);
    if (previous !== undefined) return previous;
    const manifest = Manifest.assert(await stored.readMetadata(digest));
    const root = stored.blobs.get(digest);
    if (root === undefined) throw new Error('Missing physical manifest');
    checkDescriptor({ digest, size: root.size, mediaType: manifest.mediaType });
    let content: Content;
    if (indexTypes.includes(manifest.mediaType)) {
      if (
        manifest.config !== undefined ||
        manifest.layers !== undefined ||
        manifest.manifests === undefined ||
        manifest.manifests.length === 0
      )
        throw new Error('Unsupported physical index shape');
      const children = manifest.manifests.map((child) => {
        checkDescriptor(child);
        if (
          child.platform === undefined ||
          ![...imageTypes, ...indexTypes].includes(child.mediaType)
        )
          throw new Error('Missing or unsupported index platform');
        return { ...child, platform: child.platform };
      });
      content = { kind: 'index', children, mediaType: manifest.mediaType };
    } else {
      if (
        !imageTypes.includes(manifest.mediaType) ||
        manifest.manifests !== undefined ||
        manifest.config === undefined ||
        manifest.layers === undefined ||
        !configTypes.includes(manifest.config.mediaType)
      )
        throw new Error('Unsupported physical image shape');
      const unique = new Map<string, Blob>();
      for (const descriptor of [
        { digest, size: root.size, mediaType: manifest.mediaType },
        manifest.config,
        ...manifest.layers,
      ]) {
        checkDescriptor(descriptor);
        if (
          descriptor.digest !== digest &&
          !stored.layers.has(repository + '@' + descriptor.digest)
        )
          throw new Error('Missing physical repository layer link');
        unique.set(descriptor.digest, descriptor);
      }
      if (manifest.layers.some((layer) => !layerTypes.includes(layer.mediaType)))
        throw new Error('Unsupported physical layer media type');
      const configuration = Configuration.assert(await stored.readMetadata(manifest.config.digest));
      // Proof: rootfs removal acknowledges a config with zero diff IDs for its single layer.
      if (configuration.rootfs.diff_ids.length !== manifest.layers.length)
        throw new Error('Physical rootfs differs from layer closure');
      const platform = RegistryImagePlatform.assert({
        os: configuration.os,
        architecture: configuration.architecture,
        ...(configuration.variant === undefined ? {} : { variant: configuration.variant }),
        ...(configuration['os.version'] === undefined
          ? {}
          : { 'os.version': configuration['os.version'] }),
        ...(configuration['os.features'] === undefined
          ? {}
          : { 'os.features': configuration['os.features'] }),
        ...(configuration.features === undefined ? {} : { features: configuration.features }),
      });
      content = {
        kind: 'image',
        platform,
        blobs: [...unique.values()],
        mediaType: manifest.mediaType,
      };
    }
    parsed.set(key, content);
    return content;
  };
  interface Route {
    children: readonly (typeof Descriptor.infer & { platform: Platform })[];
    digest: string;
  }
  interface Leaf {
    digest: string;
    platform: Platform;
    blobs: Blob[];
    route: Route[];
  }
  const expand = async (
    repository: string,
    digest: string,
    ancestors: ReadonlySet<string>,
  ): Promise<Leaf[]> => {
    signal.throwIfAborted();
    if (ancestors.has(digest) || ancestors.size >= 256)
      throw new Error('Cyclic or excessive physical index closure');
    const content = await read(repository, digest);
    if (content.kind === 'image')
      return [{ digest, platform: content.platform, blobs: content.blobs, route: [] }];
    const leaves: Leaf[] = [];
    for (const child of content.children) {
      const nested = await read(repository, child.digest);
      if (nested.mediaType !== child.mediaType)
        throw new Error('Contradictory child manifest media type');
      for (const leaf of await expand(repository, child.digest, new Set([...ancestors, digest]))) {
        requireCompatible(leaf.platform, child.platform);
        leaves.push({
          ...leaf,
          platform: child.platform,
          route: [{ children: content.children, digest: child.digest }, ...leaf.route],
        });
      }
    }
    return leaves;
  };
  const requireSelection = (leaf: Leaf) => {
    for (const edge of leaf.route) {
      const matches = edge.children.filter(
        (child) =>
          child.platform.os === leaf.platform.os &&
          child.platform.architecture === leaf.platform.architecture &&
          (leaf.platform.variant === undefined ||
            child.platform.variant === leaf.platform.variant) &&
          (leaf.platform['os.version'] === undefined ||
            child.platform['os.version'] === leaf.platform['os.version']),
      );
      // Proof: ambiguity removal acknowledges overlapping omitted/v8 variant selectors.
      if (matches.length > 1) throw new Error('Ambiguous physical index platform selection');
      if (matches.length === 0)
        throw new Error('Physical index path is not selectable by final platform');
      if (matches[0].digest !== edge.digest)
        throw new Error('Physical index path selects a different child');
    }
  };
  const pulls: RegistryClientPullPlan['pulls'] = [];
  for (const revision of stored.revisions) {
    const selected = new Map<string, string>();
    for (const leaf of await expand(revision.repository, revision.digest, new Set())) {
      // Proof: final-selector removal acknowledges outer v8 selection across an inner descriptor without v8.
      requireSelection(leaf);
      const key = selector(leaf.platform);
      const previous = selected.get(key);
      if (previous !== undefined) throw new Error('Ambiguous physical index selector');
      selected.set(key, leaf.digest);
      pulls.push({
        repository: revision.repository,
        reference: revision.digest,
        selection: { digest: leaf.digest, platform: leaf.platform },
        envelope: envelope(leaf.blobs, allocationUnitBytes),
      });
    }
  }
  // Proof: recensus removal acknowledges a real orphan blob inserted during metadata opening.
  await stored.assertUnchanged();
  signal.throwIfAborted();
  pulls.sort((a, b) =>
    (a.repository + '@' + a.reference + '/' + selector(a.selection.platform)).localeCompare(
      b.repository + '@' + b.reference + '/' + selector(b.selection.platform),
    ),
  );
  return {
    binding: {
      journalRevision: journal.revision,
      storageId: journal.enrollment.storageId,
      registryPath: journal.enrollment.registryPath,
      censusSha256: stored.fingerprint,
      filesystem: stored.filesystem,
    },
    revisions: structuredClone(stored.revisions),
    pulls,
  };
}
