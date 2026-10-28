import { isDeepStrictEqual } from 'node:util';

import { type } from 'arktype';

import {
  ImageExpectation,
  ImageIdentity,
  ImageObject,
  ImagePlatform,
  ManifestDescriptor,
  requireRuntimeImage,
  requireSelectedImage,
} from './image-identity';

type Docker = (arguments_: readonly string[]) => Promise<string>;
const digest = /^sha256:[a-f0-9]{64}$/;
/** Explicitly requested protocol, separate from the server's reported maximum API. */
export const dockerImageApi = '1.55';
/** Safe container projection addition for v3; no arbitrary configuration or labels enter evidence. */
export const dockerManifestProjection = ',"manifest":{{json .ImageManifestDescriptor}}';
/** Only this observed engine/API/store contract is supported for new forward evidence. */
// Proof: Task44 widening each engine/API/driver/store-type field failed its named capability negative.
export const DockerImageCapabilities = type({
  daemonId: 'string>0',
  engineVersion: "'29.7.2'",
  serverApi: "'1.55'",
  minimumApi: "'1.40'",
  requestApi: "'1.55'",
  os: "'linux'",
  arch: "'amd64'",
  driver: "'overlayfs'",
  driverType: "'io.containerd.snapshotter.v1'",
  '+': 'reject',
});
export type DockerImageCapabilities = typeof DockerImageCapabilities.infer;
const Descriptor = type({
  mediaType: 'string>0',
  digest,
  size: 'number.integer>0',
  'platform?': { os: 'string>0', architecture: 'string>0', 'variant?': 'string' },
});
const RootDescriptor = type({
  mediaType: 'string>0',
  digest,
  size: 'number.integer>0',
  '+': 'reject',
});
export const DockerImageBinding = type({
  schemaVersion: '3',
  provider: "'docker'",
  capabilities: DockerImageCapabilities,
  reference: 'string>0',
  platform: ImagePlatform,
  rootObject: ImageObject,
  rootDescriptor: RootDescriptor,
  preinspectIdentity: ImageIdentity,
  repoDigests: 'string[]',
  platformRepoDigests: 'string[]',
  volumes: 'string[]',
  '+': 'reject',
});
export type DockerImageBinding = typeof DockerImageBinding.infer;
export const DockerContainerImage = type({
  schemaVersion: '3',
  provider: "'docker'",
  daemonId: 'string>0',
  requestApi: "'1.55'",
  reference: 'string>0',
  identity: ImageIdentity,
  '+': 'reject',
});
export type DockerContainerImage = typeof DockerContainerImage.infer;

/** Identify one explicitly supported store contract; unknown and ambiguous capabilities refuse. */
export async function captureDockerImageCapabilities(
  daemonId: string,
  docker: Docker,
): Promise<DockerImageCapabilities> {
  const version = type({
    engineVersion: 'string',
    serverApi: 'string',
    minimumApi: 'string',
    '+': 'reject',
  }).assert(
    JSON.parse(
      await docker([
        'version',
        '--format',
        '{"engineVersion":{{json .Server.Version}},"serverApi":{{json .Server.APIVersion}},"minimumApi":{{json .Server.MinAPIVersion}}}',
      ]),
    ),
  );
  const info = type({
    daemonId: 'string>0',
    os: 'string',
    arch: 'string',
    driver: 'string',
    driverStatus: 'string[][]',
    '+': 'reject',
  }).assert(
    JSON.parse(
      await docker([
        'info',
        '--format',
        '{"daemonId":{{json .ID}},"os":{{json .OSType}},"arch":{{json .Architecture}},"driver":{{json .Driver}},"driverStatus":{{json .DriverStatus}}}',
      ]),
    ),
  );
  // Proof: Task44 replacing driverStatus with an assumed supported store failed capability-missing-store-dependency.
  const stores = info.driverStatus.filter((entry) => entry[0] === 'driver-type');
  if (info.daemonId !== daemonId || stores.length !== 1 || stores[0]?.length !== 2)
    // Proof: Task44 removing daemon comparison or duplicate-store refusal failed capability-daemon and capability-duplicate.
    throw new Error('Docker image capabilities or daemon are ambiguous');
  return DockerImageCapabilities.assert({
    ...version,
    daemonId: info.daemonId,
    os: info.os,
    arch: info.arch === 'x86_64' ? 'amd64' : info.arch,
    driver: info.driver,
    driverType: stores[0][1],
    requestApi: dockerImageApi,
  });
}

function describeManifest(input: unknown): ManifestDescriptor {
  const descriptor = Descriptor.assert(input);
  if (
    descriptor.platform === undefined ||
    (descriptor.platform.variant !== undefined && descriptor.platform.variant !== '')
  )
    // Proof: Task44 guessed platform fallback and removed variant guard failed missing-platform-default and manifest-variant.
    throw new Error('Docker manifest platform is missing or unsupported');
  return ManifestDescriptor.assert({
    digest: descriptor.digest,
    mediaType: descriptor.mediaType,
    size: descriptor.size,
    platform: { os: descriptor.platform.os, arch: descriptor.platform.architecture },
  });
}
function describeObject(descriptor: typeof RootDescriptor.infer): ImageObject {
  if (
    [
      'application/vnd.oci.image.index.v1+json',
      'application/vnd.docker.distribution.manifest.list.v2+json',
    ].includes(descriptor.mediaType)
  )
    return { role: 'index', digest: descriptor.digest };
  if (
    [
      'application/vnd.oci.image.manifest.v1+json',
      'application/vnd.docker.distribution.manifest.v2+json',
    ].includes(descriptor.mediaType)
  )
    return { role: 'manifest', digest: descriptor.digest };
  throw new Error('Unsupported Docker image descriptor role');
}
function normalizeRepository(reference: string): string {
  const name = reference.split('@')[0];
  const tag = name.lastIndexOf(':');
  const repository = tag > name.lastIndexOf('/') ? name.slice(0, tag) : name;
  if (!/^[a-z0-9][a-z0-9._/-]*$/.test(repository))
    throw new Error('Malformed Docker image repository');
  const first = repository.split('/')[0];
  if (first.includes('.') || first === 'localhost') return repository;
  return `docker.io/${repository.includes('/') ? repository : `library/${repository}`}`;
}
function requireRepository(references: readonly string[], reference: string, root: string): void {
  if (
    !references.some(
      (candidate) =>
        candidate.split('@').length === 2 &&
        candidate.endsWith(`@${root}`) &&
        normalizeRepository(candidate) === normalizeRepository(reference),
    )
  )
    // Proof: Task44 removing repository equality accepted a DockerHub lookalike for GHCR; repository-alias failed.
    throw new Error('Docker image repository evidence differs');
}

/** Revalidate retained provider evidence against independent source expectations before consumption. */
export function requireDockerImageBinding(
  expectationInput: unknown,
  bindingInput: unknown,
  daemonId: string,
): DockerImageBinding {
  const expectation = ImageExpectation.assert(expectationInput);
  const binding = DockerImageBinding.assert(bindingInput);
  const reference =
    expectation.kind === 'helper'
      ? expectation.selection.reference
      : `${expectation.pin.name}@${expectation.pin.digest}`;
  const root =
    expectation.kind === 'helper' ? expectation.selection.manifestDigest : expectation.pin.digest;
  if (
    binding.capabilities.daemonId !== daemonId ||
    binding.reference !== reference ||
    binding.rootObject.digest !== root ||
    (expectation.kind === 'helper' && binding.rootObject.role !== 'manifest') ||
    !isDeepStrictEqual(describeObject(binding.rootDescriptor), binding.rootObject)
  )
    // Proof: Task44 removing this guard accepted changed daemon/reference/root role; binding-source-role failed three negatives.
    throw new Error('Docker image source or daemon binding differs');
  if (
    binding.preinspectIdentity.kind !== 'manifest-object' ||
    binding.preinspectIdentity.object.digest !== binding.preinspectIdentity.manifest.digest ||
    binding.platform.os !== 'linux' ||
    binding.platform.arch !== 'amd64' ||
    !isDeepStrictEqual(binding.platform, binding.preinspectIdentity.manifest.platform)
  )
    // Proof: Task44 removing this guard accepted a changed retained platform; binding-platform failed.
    throw new Error('Docker selected image platform or descriptor differs');
  if (
    binding.rootObject.role === 'manifest' &&
    (binding.rootDescriptor.digest !== binding.preinspectIdentity.manifest.digest ||
      binding.rootDescriptor.mediaType !== binding.preinspectIdentity.manifest.mediaType ||
      binding.rootDescriptor.size !== binding.preinspectIdentity.manifest.size)
  )
    // Proof: Task44 removing this join accepted a changed root descriptor size; binding-descriptor-size failed.
    throw new Error('Docker manifest root contradicts selected child');
  requireRepository(binding.repoDigests, reference, root);
  requireRepository(binding.platformRepoDigests, reference, root);
  requireSelectedImage(expectation, binding.preinspectIdentity, binding.rootObject);
  return binding;
}

/** Inspect the exact pinned reference twice under one daemon and explicitly requested API; never retry a failed platform projection. */
export async function inspectDockerImage(
  expectationInput: unknown,
  reference: string,
  platform: typeof ImagePlatform.infer,
  capabilitiesInput: unknown,
  docker: Docker,
): Promise<DockerImageBinding> {
  const capabilities = DockerImageCapabilities.assert(capabilitiesInput);
  const inspect = async (selected: boolean) => {
    const projection = type({
      id: digest,
      descriptor: Descriptor,
      os: 'string>0',
      arch: 'string>0',
      repoDigests: 'string[]',
      volumes: 'Record<string,unknown>|null',
      '+': 'reject',
    }).assert(
      JSON.parse(
        await docker([
          'image',
          'inspect',
          reference,
          ...(selected ? ['--platform', `${platform.os}/${platform.arch}`] : []),
          '--format',
          '{"id":{{json .Id}},"descriptor":{{json .Descriptor}},"os":{{json .Os}},"arch":{{json .Architecture}},"repoDigests":{{json .RepoDigests}},"volumes":{{json (index .Config "Volumes")}}}',
        ]),
      ),
    );
    if (
      projection.id !== projection.descriptor.digest ||
      projection.os !== platform.os ||
      projection.arch !== platform.arch
    )
      throw new Error('Docker image object or platform differs');
    return projection;
  };
  const requireDaemon = async () => {
    if ((await docker(['info', '--format', '{{.ID}}'])).trim() !== capabilities.daemonId)
      // Proof: Task44 removing this recheck accepted foreign-daemon projections; projection-daemon failed.
      throw new Error('Docker image inspection daemon changed');
  };
  await requireDaemon();
  const root = await inspect(false);
  await requireDaemon();
  const child = await inspect(true);
  await requireDaemon();
  const manifest = describeManifest(child.descriptor);
  if (
    describeObject(root.descriptor).role === 'manifest' &&
    !isDeepStrictEqual(describeManifest(root.descriptor), manifest)
  )
    // Proof: Task44 removing this join accepted conflicting root/child platforms; root-child-platform failed.
    throw new Error('Docker root and child manifest descriptors differ');
  if (
    describeObject(root.descriptor).role === 'index' &&
    root.descriptor.digest === manifest.digest
  )
    // Proof: Task44 removing this refusal accepted one digest as index and child; index-child-ambiguity failed.
    throw new Error('Docker index and manifest roles are ambiguous');

  const binding = requireDockerImageBinding(
    expectationInput,
    {
      schemaVersion: 3,
      provider: 'docker',
      capabilities,
      reference,
      platform,
      rootObject: describeObject(root.descriptor),
      rootDescriptor: {
        mediaType: root.descriptor.mediaType,
        digest: root.descriptor.digest,
        size: root.descriptor.size,
      },
      preinspectIdentity: {
        kind: 'manifest-object',
        object: { role: 'manifest', digest: child.id },
        manifest,
      },
      repoDigests: root.repoDigests,
      platformRepoDigests: child.repoDigests,
      volumes: child.volumes === null ? [] : Object.keys(child.volumes),
    },
    capabilities.daemonId,
  );
  if (!isDeepStrictEqual(root.volumes, child.volumes))
    // Proof: Task44 removing this join accepted conflicting declared volumes; image-volume-projections failed.
    throw new Error('Docker image volume projections differ');
  return binding;
}

/** Bind container.Image and its independent manifest descriptor without equating them to preinspection.Id. */
export function observeDockerContainerImage(
  input: unknown,
  bindingInput: unknown,
  daemonId: string,
): DockerContainerImage {
  const binding = DockerImageBinding.assert(bindingInput);
  const projection = type({
    image: digest,
    configuredImage: 'string>0',
    manifest: Descriptor,
    '+': 'reject',
  }).assert(input);
  const manifest = describeManifest(projection.manifest);
  if (
    binding.capabilities.daemonId !== daemonId ||
    projection.configuredImage !== binding.reference
  )
    // Proof: Task44 removing this guard accepted changed configured reference/daemon; container-reference-daemon failed two negatives.
    throw new Error('Docker runtime image reference or daemon differs');
  const object =
    projection.image === binding.rootObject.digest
      ? binding.rootObject
      : projection.image === manifest.digest
        ? { role: 'manifest' as const, digest: manifest.digest }
        : undefined;
  if (object === undefined || object.role === 'config')
    // Proof: Task44 substituting a known-child default for an unknown ID failed unknown-container-object-default.
    throw new Error('Docker runtime object is outside the bound graph');
  const identity = ImageIdentity.assert({
    kind: object.role === 'index' ? 'index-object' : 'manifest-object',
    object,
    manifest,
  });
  requireRuntimeImage(binding.preinspectIdentity, identity);
  return DockerContainerImage.assert({
    schemaVersion: 3,
    provider: 'docker',
    daemonId,
    requestApi: dockerImageApi,
    reference: projection.configuredImage,
    identity,
  });
}

/** Recheck both source and runtime provenance when sealing or reading retained evidence. */
export function requireDockerRuntimeImage(
  expectation: unknown,
  bindingInput: unknown,
  observationInput: unknown,
  daemonId: string,
): void {
  const binding = requireDockerImageBinding(expectation, bindingInput, daemonId);
  const observation = DockerContainerImage.assert(observationInput);
  if (
    observation.daemonId !== daemonId ||
    observation.reference !== binding.reference ||
    observation.identity.kind === 'config-object' ||
    (observation.identity.object.role === 'index'
      ? observation.identity.object.digest !== binding.rootObject.digest ||
        binding.rootObject.role !== 'index'
      : observation.identity.object.digest !== observation.identity.manifest.digest)
  )
    // Proof: Task44 removing this guard accepted retained foreign daemon/reference; runtime-provenance failed two negatives.
    throw new Error('Docker runtime image provenance differs');
  requireRuntimeImage(binding.preinspectIdentity, observation.identity);
}
