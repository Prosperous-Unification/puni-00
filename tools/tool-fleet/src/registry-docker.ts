import { type } from 'arktype';

import { type RegistryArtifact, verifyContent } from './registry-artifact';

const Digest = type(/^sha256:[0-9a-f]{64}$/);
const NativeImage = type({
  Id: Digest,
  Descriptor: {
    mediaType: "'application/vnd.oci.image.manifest.v1+json'",
    digest: Digest,
    size: 'number.safe > 0',
  },
  RootFS: { Type: "'layers'", Layers: Digest.array() },
  Os: "'linux'",
  Architecture: "'amd64'",
});
const Config = type({
  architecture: "'amd64'",
  os: "'linux'",
  rootfs: { type: "'layers'", diff_ids: Digest.array() },
});

/**
 * Bind the observed Docker29.1.3 containerd single-manifest shape to exported bytes. Its Id is the
 * manifest descriptor digest, not the image config digest. Uncharacterized index/attestation or
 * alternate-store shapes refuse before publication; no build shape is inferred from a local tag.
 */
export async function verifyDockerExport(
  artifact: RegistryArtifact,
  input: unknown,
): Promise<void> {
  const image = NativeImage(input);
  const root = artifact.contents.find((content) => content.digest === artifact.digest);
  if (
    image instanceof type.errors ||
    image.Id !== image.Descriptor.digest ||
    image.Descriptor.digest !== artifact.digest ||
    root?.mediaType !== image.Descriptor.mediaType ||
    root.size !== image.Descriptor.size
  )
    throw new Error('Docker image descriptor differs from characterized immutable export');
  const configurations = artifact.contents.filter(
    (content) => content.mediaType === 'application/vnd.oci.image.config.v1+json',
  );
  if (configurations.length !== 1 || configurations[0].size > 4 * 1024 ** 2)
    throw new Error('Docker export configuration is missing, ambiguous or oversized');
  const configuration = Config(JSON.parse(await (await verifyContent(configurations[0])).text()));
  if (
    configuration instanceof type.errors ||
    JSON.stringify(configuration.rootfs.diff_ids) !== JSON.stringify(image.RootFS.Layers)
  )
    throw new Error('Docker export platform or root filesystem identity differs');
}
