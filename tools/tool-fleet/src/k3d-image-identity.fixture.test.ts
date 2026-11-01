import { join } from 'node:path';

import { readToolchain } from './contracts';
import type { CreationSource } from './creation-resources';
import { DockerImageBinding } from './docker-image-identity';
import type { ImageExpectation } from './image-identity';
import { EffectiveCreationPlan, ImageCreationPlan } from './k3d-creation';
import { selectHelperImage } from './k3d-helper-images';

/** Synthetic protocol fixture; these role labels do not claim an actual helper observation. */
export function imagePlan(input: unknown, adapterVersion: 3 | 4 = 4): ImageCreationPlan {
  const plan = EffectiveCreationPlan.assert(input);
  return ImageCreationPlan.assert({
    ...plan,
    schemaVersion: 3,
    expected: plan.expected.map(({ configId, ...expected }) => {
      const helper = expected.role === 'tools' || expected.role === 'serverlb';
      const imageIdentity: ImageExpectation = helper
        ? selectHelperImage(plan.helpers[expected.role === 'tools' ? 'tools' : 'serverlb'])
        : {
            kind: 'runtime-pin',
            pin: { role: expected.role, name: expected.image, digest: configId },
            config: { state: 'unobserved' },
          };
      const reference =
        imageIdentity.kind === 'helper'
          ? imageIdentity.selection.reference
          : `${imageIdentity.pin.name}@${imageIdentity.pin.digest}`;
      const manifest = {
        mediaType: 'application/vnd.oci.image.manifest.v1+json',
        digest: imageIdentity.kind === 'helper' ? imageIdentity.selection.manifestDigest : configId,
        size: 610,
        platform: { os: 'linux', arch: 'amd64' },
      };
      const legacyBinding = DockerImageBinding.assert({
        schemaVersion: 3,
        provider: 'docker',
        capabilities: {
          daemonId: plan.daemonId,
          engineVersion: '29.7.2',
          serverApi: '1.55',
          minimumApi: '1.40',
          requestApi: '1.55',
          os: 'linux',
          arch: 'amd64',
          driver: 'overlayfs',
          driverType: 'io.containerd.snapshotter.v1',
        },
        reference,
        platform: manifest.platform,
        rootObject: { role: 'manifest', digest: manifest.digest },
        rootDescriptor: {
          mediaType: manifest.mediaType,
          digest: manifest.digest,
          size: manifest.size,
        },
        preinspectIdentity: {
          kind: 'manifest-object',
          object: { role: 'manifest', digest: manifest.digest },
          manifest,
        },
        repoDigests: [reference],
        platformRepoDigests: [reference],
        volumes: [],
      });
      // Synthetic new raw observations are declared independently; historical3 is the unchanged producer shape above.
      const descriptor = {
        digest: manifest.digest,
        mediaType: manifest.mediaType,
        size: manifest.size,
        platform: {
          state: 'present',
          os: 'linux',
          architecture: 'amd64',
          variant: { state: 'absent' },
        },
      };
      const inspection = {
        objectId: manifest.digest,
        descriptor,
        imageOs: 'linux',
        imageArch: 'amd64',
        imageVariant: '',
      };
      const imageBinding =
        adapterVersion === 3
          ? legacyBinding
          : DockerImageBinding.assert({
              ...legacyBinding,
              schemaVersion: 4,
              platformOrigin: 'image-config-fields',
              inspection: {
                normal: structuredClone(inspection),
                selected: structuredClone(inspection),
              },
            });
      return { ...expected, image: reference, imageIdentity, imageBinding };
    }),
  });
}

/** Fixture source metadata is synthetic; the original lock decoder still supplies the exact selection. */
export async function imageSource(): Promise<CreationSource> {
  return {
    sourceRevision: 'b'.repeat(40),
    toolchainSha256: 'a'.repeat(64),
    toolchain: await readToolchain(join(import.meta.dir, '../../../infra/versions/toolchain.json')),
  };
}
