import { type } from 'arktype';

import { ManifestDescriptor } from './image-identity';

const digest = /^sha256:[a-f0-9]{64}$/;
// Proof: Task49 widening variant presence to unknown made the retained-variant refusal fail (variant-state).
const Variant = type({ state: "'absent'", '+': 'reject' }).or(
  type({ state: "'present'", value: 'string', '+': 'reject' }),
);
// Proof: Task49 widening platform presence to unknown made the retained binding refusal fail (platform-state).
const Platform = type({ state: "'absent'", '+': 'reject' }).or(
  type({
    state: "'present'",
    os: 'string>0',
    architecture: 'string>0',
    variant: Variant,
    '+': 'reject',
  }),
);
/** Safe descriptor fields preserve omission separately from a populated platform or variant. */
export const DockerDescriptor = type({
  digest,
  mediaType: 'string>0',
  size: 'number.integer>0',
  platform: Platform,
  '+': 'reject',
});
export type DockerDescriptor = typeof DockerDescriptor.infer;
export const DockerImageInspection = type({
  objectId: digest,
  descriptor: DockerDescriptor,
  imageOs: 'string>0',
  imageArch: 'string>0',
  imageVariant: 'string',
  '+': 'reject',
});
export type DockerImageInspection = typeof DockerImageInspection.infer;
const RawDescriptor = type({
  digest,
  mediaType: 'string>0',
  size: 'number.integer>0',
  'platform?': { os: 'string>0', architecture: 'string>0', 'variant?': 'string' },
});

/** Retain only observed fields; own undefined/null platform or variant is malformed, never omitted. */
export function retainDockerDescriptor(input: unknown): DockerDescriptor {
  const descriptor = RawDescriptor.assert(input);
  const platform = descriptor.platform;

  return DockerDescriptor.assert({
    digest: descriptor.digest,
    mediaType: descriptor.mediaType,
    size: descriptor.size,
    platform:
      platform === undefined
        ? { state: 'absent' }
        : {
            state: 'present',
            os: platform.os,
            architecture: platform.architecture,
            variant: Object.hasOwn(platform, 'variant')
              ? { state: 'present', value: platform.variant }
              : { state: 'absent' },
          },
  });
}

/** Image config fields are observed independently of the request and optional target-descriptor platform. */
export function retainDockerImageInspection(input: unknown): DockerImageInspection {
  const projection = type({
    id: digest,
    descriptor: 'unknown',
    os: 'string>0',
    arch: 'string>0',
    variant: 'string',
    '+': 'reject',
  }).assert(input);
  return DockerImageInspection.assert({
    objectId: projection.id,
    descriptor: retainDockerDescriptor(projection.descriptor),
    imageOs: projection.os,
    imageArch: projection.arch,
    imageVariant: projection.variant,
  });
}

/** Revalidate retained image platform facts before deriving content identity; no request/source defaults exist. */
export function requireDockerImagePlatform(input: unknown): DockerImageInspection {
  const inspection = DockerImageInspection.assert(input);
  if (
    inspection.objectId !== inspection.descriptor.digest ||
    inspection.imageOs !== 'linux' ||
    inspection.imageArch !== 'amd64' ||
    inspection.imageVariant !== ''
  )
    // Proof: Task49 removing imageVariant or object-ID equality accepted variant/normal-ID faults; image-variant and normal-object-id failed.
    throw new Error('Observed Docker image platform or object differs');
  const platform = inspection.descriptor.platform;
  if (
    platform.state === 'present' &&
    (platform.os !== inspection.imageOs ||
      platform.architecture !== inspection.imageArch ||
      (platform.variant.state === 'present' && platform.variant.value !== ''))
  )
    // Proof: Task49 removing this agreement accepted descriptor architecture/variant contradictions; descriptor-agreement failed two negatives.
    throw new Error('Docker descriptor and observed image platform differ');
  return inspection;
}

/** An image manifest's content platform comes from observed config fields, even when its descriptor omits platform. */
export function describeDockerImageManifest(input: unknown): ManifestDescriptor {
  const inspection = requireDockerImagePlatform(input);
  return ManifestDescriptor.assert({
    digest: inspection.descriptor.digest,
    mediaType: inspection.descriptor.mediaType,
    size: inspection.descriptor.size,
    platform: { os: inspection.imageOs, arch: inspection.imageArch },
  });
}

/** This supported container inspector fills descriptor platform; its absence still refuses. */
export function describeDockerContainerManifest(input: unknown): ManifestDescriptor {
  const descriptor = DockerDescriptor.assert(input);
  const platform = descriptor.platform;
  if (
    platform.state !== 'present' ||
    (platform.variant.state === 'present' && platform.variant.value !== '')
  )
    // Proof: Task49 substituting a known platform for absent container evidence failed container-platform-default; this is a synthetic missing-field negative.
    throw new Error('Docker container manifest platform is missing or unsupported');
  return ManifestDescriptor.assert({
    digest: descriptor.digest,
    mediaType: descriptor.mediaType,
    size: descriptor.size,
    platform: { os: platform.os, arch: platform.architecture },
  });
}
