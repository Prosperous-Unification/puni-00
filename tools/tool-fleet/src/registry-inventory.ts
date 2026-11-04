import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { type } from 'arktype';

import {
  type RegistryEndpoint,
  requestRegistry,
  requireRegistryUnknownRepository,
} from './platform-registry';
import {
  parseRegistryCommandResponse,
  reconcileRegistryConsumers,
  type RegistryJournal,
  type RegistryJournalPorts,
} from './registry-journal';
import {
  planRetirement,
  type RegistryGraphNode,
  type RetirementInput,
  type RetirementPlan,
} from './registry-policy';
import { readRegistryBytes } from './registry-stream';
import { readRegistryUpload, type RegistryUploadCensus } from './registry-upload-census';

const pinnedDistribution =
  'sha256:46faa9a1ae6813194b53921a370f2f4f8c5e1aae228a89bceafef5847a6a3278';
const Digest = type(/^sha256:[a-f0-9]{64}$/);
const Identity = type({
  registryId: 'string > 0',
  storageId: 'string > 0',
  node: 'string > 0',
  pvcUid: 'string > 0',
  mountIdentity: 'string > 0',
  distributionDigest: Digest,
  binarySha256: /^[a-f0-9]{64}$/,
  '+': 'reject',
});
const repositoryPattern =
  '[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*(?:/[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*)*';
const Repository = type(new RegExp(`^${repositoryPattern}$`));
const Tag = type(/^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}$/);
const Descriptor = type({
  digest: Digest,
  size: 'number.safe >= 0',
  mediaType: 'string > 0',
  'urls?': 'unknown',
  'artifactType?': 'unknown',
});
const Manifest = type({
  schemaVersion: '2',
  mediaType: 'string > 0',
  'config?': Descriptor,
  'layers?': Descriptor.array(),
  'manifests?': Descriptor.array(),
  'subject?': 'unknown',
  'artifactType?': 'unknown',
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
const manifestTypes = [...imageTypes, ...indexTypes];
const revisionPattern = new RegExp(
  `^repositories/(${repositoryPattern})/_manifests/revisions/sha256/([a-f0-9]{64})/link$`,
);
const layerPattern = new RegExp(
  `^repositories/(${repositoryPattern})/_layers/sha256/([a-f0-9]{64})/link$`,
);
const tagPattern = new RegExp(
  `^repositories/(${repositoryPattern})/_manifests/tags/([a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127})/(current|index/sha256/[a-f0-9]{64})/link$`,
);
const blobPattern = /^blobs\/sha256\/([a-f0-9]{2})\/([a-f0-9]{64})\/data$/;

/** Observations supplied by the verified mount/runtime adapter; a caller claim alone is not deletion authority. */
export type RegistryInventoryIdentity = typeof Identity.infer;
export interface RegistryRevision {
  readonly repository: string;
  readonly digest: string;
}
interface StoredContent {
  readonly digest: string;
  readonly size: number;
  readonly bytes: number;
  readonly path: string;
}
interface StoredCensus {
  readonly files: Map<string, string>;
  readonly blobs: Map<string, StoredContent>;
  readonly revisions: RegistryRevision[];
  readonly layers: Set<string>;
  readonly tags: Map<string, Map<string, string>>;
  readonly repositories: string[];
  readonly manifestRepositories: string[];
  readonly fingerprint: string;
  readonly filesystem: string;
  readonly uploads: RegistryUploadCensus[];
}
/** Constructed only by the complete API/physical census; serializing this object loses its verification capability. */
export interface RegistryInventory {
  readonly identity: RegistryInventoryIdentity;
  readonly journal: RegistryJournal;
  readonly graph: { complete: true; nodes: RegistryGraphNode[] };
  readonly revisions: readonly RegistryRevision[];
  readonly tags: readonly { repository: string; tag: string; digest: string }[];
  readonly uploads: readonly RegistryUploadCensus[];
  readonly orphanBlobs: readonly string[];
  readonly unreferencedContent: readonly {
    digest: string;
    bytes: number;
    inodes: number;
    operations: string[];
  }[];
  readonly partialOperations: readonly string[];
  readonly neverUploaded: readonly { operationId: string; repository: string; digest: string }[];
  readonly protections: RetirementInput['protections'];
  readonly consumerReferences: readonly RegistryRevision[];
  readonly binding: {
    readonly journalRevision: number;
    readonly obligationsSha256: string;
    readonly censusSha256: string;
    readonly filesystem: string;
    readonly identity: RegistryInventoryIdentity;
  };
}
export interface RegistryRetirementPlan {
  readonly schemaVersion: 1;
  readonly binding: RegistryInventory['binding'];
  readonly options: Pick<RetirementInput, 'now' | 'mode' | 'capacity'>;
  readonly retireRevisions: readonly RegistryRevision[];
  readonly retireUploads: readonly RegistryUploadCensus[];
  readonly retireBlobs: readonly string[];
  readonly neverUploaded: RegistryInventory['neverUploaded'];
  readonly policy: RetirementPlan;
}
const verifiedInventories = new WeakMap<RegistryInventory, string>();
const sha256 = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const referenceKey = (reference: RegistryRevision) => `${reference.repository}@${reference.digest}`;
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

/** Hash each physical file without following a leaf symlink or buffering layers. Directory traversal refuses symlinks too. */
async function readFileContent(
  path: string,
  maximum?: number,
  signal?: AbortSignal,
): Promise<{ digest: string; size: number; bytes: number; text: string; encoded: Buffer }> {
  signal?.throwIfAborted();
  const descriptor = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const before = await descriptor.stat();
    // Proof: removing this size boundary changed oversized-link refusal to the later malformed-link boundary.
    if (!before.isFile() || (maximum !== undefined && before.size > maximum))
      throw new Error(`Invalid registry file: ${path}`);
    const hash = createHash('sha256');
    const chunks: Buffer[] = [];
    const buffer = Buffer.alloc(65536);
    let size = 0;
    for (;;) {
      signal?.throwIfAborted();
      const read = await descriptor.read(buffer);
      if (read.bytesRead === 0) break;
      size += read.bytesRead;
      if (size > before.size) throw new Error('Registry file changed during census');
      const chunk = buffer.subarray(0, read.bytesRead);
      hash.update(chunk);
      if (maximum !== undefined) chunks.push(Buffer.from(chunk));
    }
    const after = await descriptor.stat();
    if (
      size !== before.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs
    )
      throw new Error('Registry file changed during census');
    signal?.throwIfAborted();
    const encoded = Buffer.concat(chunks);
    return {
      digest: `sha256:${hash.digest('hex')}`,
      size,
      bytes: before.blocks * 512,
      text: encoded.toString('utf8'),
      encoded,
    };
  } finally {
    await descriptor.close();
  }
}

async function readStorage(
  journal: RegistryJournal,
  signal?: AbortSignal,
  uploadMode: 'inspect' | 'reject' = 'inspect',
): Promise<StoredCensus> {
  signal?.throwIfAborted();
  const directory = journal.enrollment.registryPath;
  const base = join(directory, 'docker/registry/v2');
  for (const prefix of ['', 'docker', 'docker/registry', 'docker/registry/v2']) {
    // Proof: bypassing this boundary admitted the symlinked-layout-ancestor fixture.
    if (!(await lstat(join(directory, prefix))).isDirectory())
      throw new Error('Unknown registry layout directory');
  }
  const files = new Map<string, string>();
  const directories: string[] = [];
  const walk = async (relative: string): Promise<void> => {
    signal?.throwIfAborted();
    const path = join(base, relative);
    const status = await lstat(path);
    // Proof: chmod(000) on the physical revision tree refuses before API reconciliation.
    if (!status.isDirectory() || (status.mode & 0o500) !== 0o500)
      throw new Error(`Unreadable or unknown registry directory: ${relative}`);
    directories.push(relative);
    for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const child = relative === '' ? entry.name : `${relative}/${entry.name}`;
      if (entry.isDirectory()) await walk(child);
      else if (entry.isFile()) files.set(child, '');
      else throw new Error(`Unknown registry storage entry: ${child}`);
    }
  };
  await walk('');
  for (const path of ['blobs', 'blobs/sha256', 'repositories'])
    if (!directories.includes(path)) throw new Error(`Missing registry census tree: ${path}`);
  const uploads: RegistryUploadCensus[] = [];
  const staged = new Set<string>();
  for (const path of files.keys()) {
    const match = new RegExp(`^repositories/(${repositoryPattern})/_uploads/([^/]+)/`).exec(path);
    if (match === null) continue;
    // Proof: staging-prehash removal opens the real unreadable owned body instead of refusing staging first.
    if (uploadMode === 'reject')
      throw new Error('Client planning requires upload-free retained storage');
    const identity = `${match[1]}@${match[2]}`;
    if (staged.has(identity)) continue;
    const upload = await readRegistryUpload(journal, match[1], match[2]);
    uploads.push(upload);
    staged.add(identity);
    for (const file of upload.files)
      files.set(
        `repositories/${match[1]}/_uploads/${match[2]}/${file.name}`,
        `${file.sha256}:${String(file.size)}`,
      );
  }
  const blobs = new Map<string, StoredContent>();
  const revisions: RegistryRevision[] = [];
  const layers = new Set<string>();
  const tags = new Map<string, Map<string, string>>();
  const repositories = new Set<string>();
  for (const path of files.keys()) {
    if (
      uploads.some((upload) =>
        path.startsWith(`repositories/${upload.repository}/_uploads/${upload.uploadId}/`),
      )
    )
      continue;
    const blob = blobPattern.exec(path);
    if (blob !== null) {
      const digest = `sha256:${blob[2]}`;
      const content = await readFileContent(join(base, path), undefined, signal);
      // Proof: removing this comparison made "refuses same-length physical layer corruption"
      // return an inventory with altered 12-byte content.
      if (blob[1] !== blob[2].slice(0, 2) || content.digest !== digest)
        throw new Error(`Registry blob digest mismatch: ${path}`);
      blobs.set(digest, {
        digest,
        size: content.size,
        bytes: content.bytes,
        path: join(base, path),
      });
      files.set(path, content.digest);
      continue;
    }
    const revision = revisionPattern.exec(path);
    const layer = layerPattern.exec(path);
    const tag = tagPattern.exec(path);
    // Proof: ignoring unrecognized upload files admitted unresolved staging in the production census.
    if (revision === null && layer === null && tag === null)
      throw new Error(`Unknown registry storage or unresolved upload: ${path}`);
    const content = await readFileContent(join(base, path), 71, signal);
    const digest = content.text;
    if (Digest(digest) instanceof type.errors) throw new Error(`Malformed registry link: ${path}`);
    const match = revision ?? layer ?? tag;
    if (match === null) throw new Error('Missing parsed link');
    repositories.add(match[1]);
    if ((revision !== null || layer !== null) && digest !== `sha256:${match[2]}`)
      throw new Error(`Registry link digest mismatch: ${path}`);
    if (tag !== null && tag[3] !== 'current' && digest !== `sha256:${tag[3].slice(13)}`)
      throw new Error(`Registry tag history digest mismatch: ${path}`);
    files.set(path, digest);
    if (revision !== null) revisions.push({ repository: revision[1], digest });
    if (layer !== null) layers.add(`${layer[1]}@${digest}`);
    if (tag !== null && tag[3] === 'current') {
      const current = tags.get(tag[1]) ?? new Map<string, string>();
      current.set(tag[2], digest);
      tags.set(tag[1], current);
    }
  }
  const allowed = new Set(['', 'blobs', 'blobs/sha256', 'repositories']);
  for (const path of files.keys()) {
    let parent = path.slice(0, path.lastIndexOf('/'));
    while (parent !== '') {
      allowed.add(parent);
      const slash = parent.lastIndexOf('/');
      if (slash === -1) break;
      parent = parent.slice(0, slash);
    }
  }
  for (const directory of directories) {
    if (allowed.has(directory) || /^blobs\/sha256\/[a-f0-9]{2}$/.test(directory)) continue;
    if (
      new RegExp(
        `^repositories/(${repositoryPattern})/_manifests/revisions/sha256/[a-f0-9]{64}$`,
      ).test(directory)
    )
      continue;
    // Native DELETE/GC leave empty revision and shard containers; required links remain mandatory.
    if (
      new RegExp(
        `^repositories/(${repositoryPattern})/(?:_uploads|_manifests(?:/(?:revisions(?:/sha256)?|tags))?|_layers(?:/sha256)?)$`,
      ).test(directory)
    )
      continue;
    // Proof: ignoring this boundary admitted an unknown empty storage directory.
    throw new Error(`Unknown or incomplete registry storage directory: ${directory}`);
  }
  const revisionKeys = new Set(revisions.map(referenceKey));
  // Proof: removing this dangling-tag guard makes the actual partial-unlink caller contact the API eight times instead of refusing before any request.
  for (const [repository, current] of tags)
    for (const digest of current.values())
      if (!revisionKeys.has(`${repository}@${digest}`))
        throw new Error('Current tag omits required manifest revision');
  const status = await lstat(base);
  return {
    files,
    blobs,
    revisions: revisions.sort((a, b) => referenceKey(a).localeCompare(referenceKey(b))),
    layers,
    tags,
    repositories: [...repositories].sort(),
    manifestRepositories: directories.flatMap((directory) => {
      const match = new RegExp(`^repositories/(${repositoryPattern})/_manifests$`).exec(directory);
      return match === null ? [] : [match[1]];
    }),
    fingerprint: sha256(JSON.stringify([...files])),
    filesystem: `${String(status.dev)}:${String(status.ino)}`,
    uploads,
  };
}

/**
 * Read the complete physical CAS and repository revision/link census without executing consumer
 * adapters or contacting HTTP. Only the canonical root action supplies the already validated
 * journal. Metadata reads remain bounded, hash/size checked, fatal-UTF8 JSON; assertUnchanged
 * rehashes the full physical census before the plan is acknowledged. This grants no deletion,
 * client execution, journal completion or service-restoration authority.
 */
export async function collectRegistryStoredContent(journal: RegistryJournal, signal: AbortSignal) {
  const stored = await readStorage(journal, signal, 'reject');
  const blobs: ReadonlyMap<string, StoredContent> = stored.blobs;
  const layers: ReadonlySet<string> = stored.layers;
  return {
    fingerprint: stored.fingerprint,
    filesystem: stored.filesystem,
    revisions: stored.revisions,
    blobs,
    layers,
    readMetadata: async (digest: string): Promise<unknown> => {
      const content = stored.blobs.get(digest);
      if (content === undefined) throw new Error('Missing physical metadata blob');
      // Proof: metadata-cap-corrected raises this cap and acknowledges a valid config over4MiB.
      const current = await readFileContent(content.path, 4 * 1024 ** 2, signal);
      if (current.digest !== digest || current.size !== content.size)
        throw new Error('Physical metadata changed during client planning');
      // Proof: utf8 removal acknowledges an invalid byte in an opaque config comment after lossy decoding.
      const decoded: unknown = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(current.encoded),
      );
      return decoded;
    },
    assertUnchanged: async () => {
      const current = await readStorage(journal, signal, 'reject');
      if (current.fingerprint !== stored.fingerprint || current.filesystem !== stored.filesystem)
        throw new Error('Physical census changed during client planning');
    },
  };
}

/** Every pagination hop stays on the same collection/origin and advances strictly; storage equality detects a missing final Link. */
async function readPages(endpoint: RegistryEndpoint, repository?: string): Promise<string[]> {
  const path = repository === undefined ? '/v2/_catalog' : `/v2/${repository}/tags/list`;
  let next = new URL(`${endpoint.url}${path}?n=100`);
  const seen = new Set<string>();
  const entries: string[] = [];
  for (;;) {
    if (seen.has(next.href) || seen.size >= 100000)
      throw new Error('Registry pagination did not converge');
    seen.add(next.href);
    const response = await requestRegistry(endpoint, next.href);
    const parsed: unknown = JSON.parse(
      new TextDecoder().decode(
        await readRegistryBytes(response.body, 4 * 1024 ** 2, 'Registry page'),
      ),
    );
    const page =
      repository === undefined
        ? type({ repositories: Repository.array() })(parsed)
        : type({ name: Repository, tags: Tag.array().or('null') })(parsed);
    if (page instanceof type.errors || ('name' in page && page.name !== repository))
      throw new Error('Malformed registry pagination');
    const names = 'repositories' in page ? page.repositories : (page.tags ?? []);
    for (const name of names) {
      if (entries.includes(name)) throw new Error('Registry pagination repeated entry');
      entries.push(name);
    }
    const link = response.headers.get('link');
    if (link === null) break;
    const match = /^<([^>]+)>;\s*rel="next"$/.exec(link);
    if (match === null || names.length === 0) throw new Error('Unsupported registry pagination');
    const following = new URL(match[1], next);
    if (
      following.origin !== new URL(endpoint.url).origin ||
      following.pathname !== path ||
      following.username !== '' ||
      following.password !== '' ||
      following.hash !== '' ||
      following.searchParams.get('last') !== names.at(-1) ||
      [...following.searchParams.keys()].some((key) => key !== 'last' && key !== 'n')
    )
      // Proof: treating an invalid next Link as end-of-list made the pagination negative succeed.
      throw new Error('Unsafe or truncated registry pagination');
    next = following;
  }
  return entries.sort();
}

/** Complete read-only physical/API reconciliation. Run under the operation authority; this does not acquire a fence or authorize deletion. */
export async function collectRegistryInventory(input: {
  readonly journal: unknown;
  readonly identity: unknown;
  readonly endpoint: RegistryEndpoint;
  readonly consumers: Pick<RegistryJournalPorts, 'verifyConsumers' | 'collectConsumers'>;
}): Promise<RegistryInventory> {
  const journal = structuredClone(parseRegistryCommandResponse({ state: input.journal }).state);
  // Proof: individual registry/storage/runtime-pin removals admitted their foreign identities; weakening binary schema admitted malformed SHA256.
  const identity = Identity(input.identity);
  if (
    identity instanceof type.errors ||
    identity.registryId !== journal.enrollment.registryId ||
    identity.storageId !== journal.enrollment.storageId ||
    identity.distributionDigest !== pinnedDistribution
  )
    throw new Error('Registry inventory identity mismatch');
  const reports = await reconcileRegistryConsumers(journal, input.consumers);
  const stored = await readStorage(journal);
  // Proof: removing catalog equality admitted the omitted-repository API page.
  if (!same(await readPages(input.endpoint), stored.repositories))
    throw new Error('Incomplete registry catalog census');
  for (const repository of stored.repositories) {
    const tags = stored.tags.get(repository) ?? new Map<string, string>();
    // Proof: removing tag equality admitted truncated tags; native proxy truncation also refuses.
    let observedTags: string[];
    if (!stored.manifestRepositories.includes(repository)) {
      const evidence = journal.schemaVersion === 4 ? journal.publicationEvidence : [];
      const layerLinks = [...stored.layers].filter((key) => key.startsWith(`${repository}@`));
      if (
        layerLinks.length === 0 ||
        layerLinks.some(
          (key) =>
            !evidence.some((publication) =>
              publication.writes.some(
                (write) => referenceKey(write) === key && write.phase === 'stored',
              ),
            ),
        )
      )
        throw new Error('Unowned blob-only registry repository');
      await requireRegistryUnknownRepository(input.endpoint, repository);
      observedTags = [];
    } else observedTags = await readPages(input.endpoint, repository);
    if (!same(observedTags, [...tags.keys()].sort()))
      throw new Error('Incomplete registry tag census');
    for (const [tag, digest] of tags) {
      const response = await requestRegistry(input.endpoint, `/v2/${repository}/manifests/${tag}`, {
        headers: { accept: manifestTypes.join(', ') },
      });
      const bytes = await readRegistryBytes(response.body, 4 * 1024 ** 2, 'Registry tag manifest');
      if (
        `sha256:${sha256(bytes)}` !== digest ||
        response.headers.get('docker-content-digest') !== digest
      )
        // Proof: removing this refusal admitted corrupted tag bytes while digest reads stayed valid.
        throw new Error('Registry current tag differs from storage');
    }
  }
  const nodes = new Map<string, RegistryGraphNode>();
  const manifests = new Map<
    string,
    { mediaType: string; dependencies: (typeof Descriptor.infer)[] }
  >();
  const revisionKeys = new Set(stored.revisions.map(referenceKey));
  for (const revision of stored.revisions) {
    const content = stored.blobs.get(revision.digest);
    if (content === undefined) throw new Error('Missing stored manifest content');
    const physical = await readFileContent(content.path, 4 * 1024 ** 2);
    const manifest = Manifest(JSON.parse(physical.text));
    if (
      manifest instanceof type.errors ||
      manifest.subject !== undefined ||
      manifest.artifactType !== undefined ||
      !manifestTypes.includes(manifest.mediaType)
    )
      // Proof: dropping subject refusal admitted an owned OCI referrer.
      throw new Error('Unsupported registry manifest relationships');
    let dependencies: (typeof Descriptor.infer)[];
    if (indexTypes.includes(manifest.mediaType)) {
      if (
        !manifest.manifests?.length ||
        manifest.config !== undefined ||
        manifest.layers !== undefined ||
        manifest.manifests.some((child) => !manifestTypes.includes(child.mediaType))
      )
        throw new Error('Unsupported registry index descriptors');
      dependencies = manifest.manifests;
    } else {
      if (
        manifest.config === undefined ||
        manifest.layers === undefined ||
        manifest.manifests !== undefined ||
        !configTypes.includes(manifest.config.mediaType) ||
        manifest.layers.some((layer) => !layerTypes.includes(layer.mediaType))
      )
        throw new Error('Unsupported registry image descriptors');
      dependencies = [manifest.config, ...manifest.layers];
    }
    const response = await requestRegistry(
      input.endpoint,
      `/v2/${revision.repository}/manifests/${revision.digest}`,
      { headers: { accept: manifestTypes.join(', ') } },
    );
    const bytes = await readRegistryBytes(response.body, 4 * 1024 ** 2, 'Registry revision');
    if (
      `sha256:${sha256(bytes)}` !== revision.digest ||
      response.headers.get('docker-content-digest') !== revision.digest ||
      response.headers.get('content-type') !== manifest.mediaType
    )
      // Proof: removing this refusal admitted corrupt digest-addressed API bytes.
      throw new Error('Registry API revision digest/type mismatch');
    for (const dependency of dependencies) {
      const target = stored.blobs.get(dependency.digest);
      if (
        target?.size !== dependency.size ||
        dependency.urls !== undefined ||
        dependency.artifactType !== undefined
      )
        // Proof: ignoring size made "refuses descriptor size disagreement in an owned manifest"
        // return an inventory with declared 13-byte / actual 12-byte content.
        throw new Error('Missing or unsupported registry dependency');
      if (indexTypes.includes(manifest.mediaType)) {
        // Proof: removing this guard changed omitted-child refusal to Contradictory child descriptor media type; inventory still refused.
        if (!revisionKeys.has(`${revision.repository}@${dependency.digest}`))
          throw new Error('Missing child manifest revision');
      } else {
        // Proof: removing this guard admitted an extant unprotected revision with its layer link removed.
        if (!stored.layers.has(`${revision.repository}@${dependency.digest}`))
          throw new Error('Missing required repository layer link');
        nodes.set(dependency.digest, {
          digest: dependency.digest,
          bytes: target.bytes,
          inodes: 1,
          dependencies: [],
        });
      }
    }
    manifests.set(referenceKey(revision), { mediaType: manifest.mediaType, dependencies });
    nodes.set(revision.digest, {
      digest: revision.digest,
      bytes: content.bytes,
      inodes: 1,
      dependencies: dependencies.map((dependency) => dependency.digest),
    });
  }
  const mediaTypes = new Map<string, string>();
  for (const revision of stored.revisions) {
    const manifest = manifests.get(referenceKey(revision));
    if (manifest === undefined) throw new Error('Missing parsed revision');
    for (const descriptor of [
      { digest: revision.digest, mediaType: manifest.mediaType },
      ...manifest.dependencies,
    ]) {
      const previous = mediaTypes.get(descriptor.digest);
      // Proof: removing media agreement admitted the same bytes as both config and manifest.
      if (previous !== undefined && previous !== descriptor.mediaType)
        throw new Error('Contradictory registry content media type');
      mediaTypes.set(descriptor.digest, descriptor.mediaType);
    }
  }
  for (const revision of stored.revisions) {
    const manifest = manifests.get(referenceKey(revision));
    if (manifest === undefined) throw new Error('Missing parsed revision');
    if (indexTypes.includes(manifest.mediaType))
      for (const child of manifest.dependencies)
        if (manifests.get(`${revision.repository}@${child.digest}`)?.mediaType !== child.mediaType)
          throw new Error('Contradictory child descriptor media type');
  }
  const owned = new Set<string>();
  const visit = (reference: RegistryRevision, ancestors = new Set<string>()): void => {
    const key = referenceKey(reference);
    if (ancestors.has(key)) throw new Error('Cyclic registry manifest closure');
    if (owned.has(key)) return;
    const manifest = manifests.get(key);
    if (manifest === undefined) throw new Error(`Unknown required repository revision: ${key}`);
    owned.add(key);
    if (indexTypes.includes(manifest.mediaType))
      for (const child of manifest.dependencies)
        visit(
          { repository: reference.repository, digest: child.digest },
          new Set([...ancestors, key]),
        );
  };
  const retirements = journal.schemaVersion === 4 ? journal.retirements : [];
  const declarations = journal.schemaVersion === 4 ? journal.publicationEvidence : [];
  const partialOperations: string[] = [];
  const neverUploaded: { operationId: string; repository: string; digest: string }[] = [];
  for (const evidence of declarations) {
    for (const declaration of evidence.contents) {
      const physical = stored.blobs.get(declaration.digest);
      const acknowledged = evidence.writes.some(
        (write) => referenceKey(write) === referenceKey(declaration) && write.phase === 'stored',
      );
      const retired = retirements.filter((receipt) =>
        receipt.operations.includes(evidence.operationId),
      );
      if (
        acknowledged &&
        (declaration.isManifest
          ? !manifests.has(referenceKey(declaration)) &&
            !retired.some((receipt) =>
              receipt.deletions.some(
                (reference) => referenceKey(reference) === referenceKey(declaration),
              ),
            )
          : physical === undefined &&
            !retired.some((receipt) => receipt.retireBlobs.includes(declaration.digest)))
      )
        throw new Error('Missing acknowledged stored publication content');
      const manifest = manifests.get(referenceKey(declaration));
      if (
        physical !== undefined &&
        (physical.size !== declaration.size ||
          (mediaTypes.has(declaration.digest) &&
            mediaTypes.get(declaration.digest) !== declaration.mediaType) ||
          (manifest !== undefined &&
            !same(
              manifest.dependencies.map((dependency) => dependency.digest),
              declaration.dependencies,
            )))
      )
        throw new Error('Publication declaration differs from present content');
    }
  }
  // Only exact retirement evidence or declared, never-written abandoned roots excuse absence.
  // Consumer/protection roots below never use either exception.
  for (const bundle of journal.bundles) {
    const declaration = declarations.find(
      (evidence) => evidence.operationId === bundle.operationId,
    );
    const partial = bundle.receipt.state === 'abandoned' && declaration !== undefined;
    if (partial) partialOperations.push(bundle.operationId);
    const retired = retirements.filter((receipt) =>
      receipt.operations.includes(bundle.operationId),
    );
    for (const reference of bundle.references) {
      if (!manifests.has(referenceKey(reference))) {
        if (
          retired.some((receipt) =>
            receipt.deletions.some(
              (deletion) => referenceKey(deletion) === referenceKey(reference),
            ),
          )
        )
          continue;
        if (
          partial &&
          !declaration.writes.some((write) => referenceKey(write) === referenceKey(reference))
        ) {
          neverUploaded.push({ operationId: bundle.operationId, ...reference });
          continue;
        }
      }
      visit(reference);
    }
    if (partial)
      for (const content of declaration.contents)
        if (
          content.isManifest &&
          manifests.has(referenceKey(content)) &&
          declaration.writes.some((write) => referenceKey(write) === referenceKey(content))
        )
          visit(content);
  }
  for (const receipt of retirements)
    for (const reference of receipt.deletions)
      if (manifests.has(referenceKey(reference))) visit(reference);
  for (const reference of [
    ...journal.protections.flatMap((protection) => protection.references),
    ...reports.flatMap((report) => report.references),
  ])
    visit(reference);
  // Proof: removing repository ownership admitted a foreign revision sharing an already-owned digest.
  for (const revision of stored.revisions)
    if (!owned.has(referenceKey(revision)))
      throw new Error(`Unknown stored revision: ${referenceKey(revision)}`);
  const after = await readStorage(journal);
  // Proof: removing this refusal admitted a global blob added between the independent physical passes.
  if (stored.fingerprint !== after.fingerprint || stored.filesystem !== after.filesystem)
    throw new Error('Registry storage changed during census');
  const protections = [
    ...journal.protections,
    ...reports
      .filter((report) => report.references.length > 0)
      .map((report) => ({
        owner: report.id,
        reason: 'consumer',
        roots: report.references.map((reference) => reference.digest),
      })),
  ];
  const inventory: RegistryInventory = {
    identity: structuredClone(identity),
    journal: structuredClone(journal),
    graph: {
      complete: true,
      nodes: [...nodes.values()].sort((a, b) => a.digest.localeCompare(b.digest)),
    },
    revisions: stored.revisions,
    uploads: stored.uploads,
    tags: [...stored.tags].flatMap(([repository, tags]) =>
      [...tags].map(([tag, digest]) => ({ repository, tag, digest })),
    ),
    orphanBlobs: [...stored.blobs.keys()].filter((digest) => !nodes.has(digest)).sort(),
    unreferencedContent: [...stored.blobs.values()]
      .filter((content) => !nodes.has(content.digest))
      .sort((a, b) => a.digest.localeCompare(b.digest))
      .map((content) => ({
        digest: content.digest,
        bytes: content.bytes,
        inodes: 1,
        operations: [
          ...new Set([
            ...declarations
              .filter((evidence) =>
                evidence.writes.some(
                  (write) => write.digest === content.digest && write.phase === 'stored',
                ),
              )
              .map((evidence) => evidence.operationId),
            ...retirements
              .filter((receipt) => receipt.retireBlobs.includes(content.digest))
              .flatMap((receipt) => receipt.operations),
          ]),
        ],
      })),
    partialOperations,
    neverUploaded,
    protections: structuredClone(protections),
    consumerReferences: structuredClone(reports.flatMap((report) => report.references)),
    binding: {
      journalRevision: journal.revision,
      obligationsSha256: sha256(
        JSON.stringify({
          protections: journal.protections,
          bundles: journal.bundles,
          environments: journal.environments,
          consumers: journal.consumers,
          reports,
          reservations: journal.reservations,
          publication: journal.publication,
          retirements,
          declarations,
        }),
      ),
      censusSha256: stored.fingerprint,
      filesystem: stored.filesystem,
      identity: structuredClone(identity),
    },
  };
  verifiedInventories.set(inventory, sha256(JSON.stringify(inventory)));
  return inventory;
}

/** Exact repository revisions are deletion candidates; shared blobs are accounting only. Task8 owns fenced revalidation and execution. */
export function planRegistryRetirement(
  inventory: RegistryInventory,
  options: Pick<RetirementInput, 'now' | 'mode' | 'capacity'>,
): RegistryRetirementPlan {
  // Proof: removing this check allowed a caller to alter measured bytes after verification.
  if (verifiedInventories.get(inventory) !== sha256(JSON.stringify(inventory)))
    throw new Error('Unverified registry inventory');
  const active = inventory.journal.environments.filter(
    (environment) => environment.retiredAt === null,
  );
  const receipts = inventory.journal.schemaVersion === 4 ? inventory.journal.retirements : [];
  const retiredOperations = [...new Set(receipts.flatMap((receipt) => receipt.operations))];
  const current = new Set(inventory.revisions.map(referenceKey));
  const declarations =
    inventory.journal.schemaVersion === 4 ? inventory.journal.publicationEvidence : [];
  const references = (bundle: RegistryJournal['bundles'][number]): RegistryRevision[] => {
    if (
      !retiredOperations.includes(bundle.operationId) &&
      !inventory.partialOperations.includes(bundle.operationId)
    )
      return bundle.references;
    return [
      ...new Map(
        [
          ...bundle.references,
          ...receipts
            .filter((receipt) => receipt.operations.includes(bundle.operationId))
            .flatMap((receipt) => receipt.deletions),
          ...declarations
            .filter((evidence) => evidence.operationId === bundle.operationId)
            .flatMap((evidence) =>
              evidence.contents.filter(
                (content) =>
                  content.isManifest &&
                  evidence.writes.some((write) => referenceKey(write) === referenceKey(content)),
              ),
            ),
        ]
          .filter((reference) => current.has(referenceKey(reference)))
          .map((reference) => [
            referenceKey(reference),
            { repository: reference.repository, digest: reference.digest },
          ]),
      ).values(),
    ];
  };
  const bundles = inventory.journal.bundles.map((bundle) => ({
    ...bundle,
    roots: [...new Set(references(bundle).map((reference) => reference.digest))],
  }));
  if (inventory.unreferencedContent.some((content) => content.operations.length === 0))
    throw new Error('Unowned orphan content prevents offline GC');
  const policy = planRetirement({
    ...options,
    graph: inventory.graph,
    bundles,
    // Proof: restoring blanket prior-receipt exclusion strands newly unprotected revisions (task8-removal-residual-eligibility.log).
    retiredOperations: retiredOperations.filter(
      (operationId) =>
        bundles.find((bundle) => bundle.operationId === operationId)?.roots.length === 0,
    ),
    staging: inventory.uploads.map((upload) => ({
      operationId: upload.operationId,
      bytes: upload.bytes,
      inodes: upload.inodes,
    })),
    partialOperations: inventory.partialOperations,
    unreferencedContent: inventory.unreferencedContent,
    protections: inventory.protections,
    registeredEnvironments: active.map((environment) => environment.environment),
    histories: active.map((environment) => ({
      environment: environment.environment,
      ...(environment.releases.length === 0
        ? { state: 'first-install', at: environment.genesisAt }
        : { state: 'successful', complete: true, releases: environment.releases }),
    })),
  });
  if (inventory.orphanBlobs.some((digest) => !policy.retireDigests.includes(digest)))
    throw new Error('Unreleased orphan content prevents offline GC');
  if (inventory.uploads.some((upload) => !policy.retireOperations.includes(upload.operationId)))
    throw new Error('Unreleased staging prevents offline GC');
  const revisionKeys = new Set(inventory.revisions.map(referenceKey));
  const nodes = new Map(inventory.graph.nodes.map((node) => [node.digest, node]));
  const closure = (roots: readonly RegistryRevision[]) => {
    const keys = new Set<string>();
    const visit = (reference: RegistryRevision): void => {
      const key = referenceKey(reference);
      if (keys.has(key)) return;
      keys.add(key);
      const node = nodes.get(reference.digest);
      if (node === undefined) throw new Error('Missing verified manifest');
      for (const digest of node.dependencies)
        if (revisionKeys.has(`${reference.repository}@${digest}`))
          visit({ repository: reference.repository, digest });
    };
    for (const root of roots) visit(root);
    return keys;
  };
  const candidates = closure(
    inventory.journal.bundles
      .filter((bundle) => policy.retireOperations.includes(bundle.operationId))
      .flatMap(references),
  );
  const retained = closure([
    ...inventory.consumerReferences,
    ...inventory.journal.protections.flatMap((protection) => protection.references),
    ...inventory.journal.bundles
      .filter(
        (bundle) =>
          !policy.retireOperations.includes(bundle.operationId) &&
          !retiredOperations.includes(bundle.operationId),
      )
      .flatMap(references),
  ]);
  return {
    schemaVersion: 1,
    binding: structuredClone(inventory.binding),
    options: structuredClone(options),
    retireRevisions: inventory.revisions.filter(
      (revision) => candidates.has(referenceKey(revision)) && !retained.has(referenceKey(revision)),
    ),
    retireBlobs: policy.retireDigests,
    retireUploads: inventory.uploads,
    neverUploaded: inventory.neverUploaded.filter((reference) =>
      policy.retireOperations.includes(reference.operationId),
    ),
    policy,
  };
}

/** Compare persisted plan bytes with a newly verified census under Task8's exclusive fence; no destructive operation happens here. */
export function assertRegistryPlan(plan: RegistryRetirementPlan, fresh: RegistryInventory): void {
  // Proof: separate "stale plan cannot execute" tests each returned without throwing after removal:
  // unverified census, changed node identity, and changed protection roots.
  if (
    !verifiedInventories.has(fresh) ||
    !same(plan.binding, fresh.binding) ||
    !same(plan, planRegistryRetirement(fresh, plan.options))
  )
    throw new Error('Stale or altered registry retirement plan');
}
