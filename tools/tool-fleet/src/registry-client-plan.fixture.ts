import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { scratchAsync } from '@tools/test-scratch';

import {
  imageConfigType,
  imageHash,
  imageIndexType,
  imageLayerType,
  imageManifestType,
} from './registry-client-layout.fixture';
import type { RegistryJournal } from './registry-managed-journal';

export async function createRegistryClientPlanFixture() {
  const directory = await scratchAsync('registry-client-plan-'),
    base = join(directory, 'docker/registry/v2');
  const put = async (path: string, bytes: string | Uint8Array) => {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(path, bytes, { mode: 0o600 });
  };
  await mkdir(join(base, 'blobs/sha256'), { recursive: true, mode: 0o700 });
  await mkdir(join(base, 'repositories'), { mode: 0o700 });
  const blobPath = (digest: string) =>
    join(base, 'blobs/sha256', digest.slice(7, 9), digest.slice(7), 'data');
  const revisionPath = (repository: string, digest: string) =>
    join(base, 'repositories', repository, '_manifests/revisions/sha256', digest.slice(7), 'link');
  const store = async (bytes: string | Uint8Array, mediaType: string) => {
    const digest = imageHash(bytes);
    await put(blobPath(digest), bytes);
    return { digest, size: Buffer.byteLength(bytes), mediaType };
  };
  const register = async (repository: string, manifest: unknown) => {
    const descriptor = await store(JSON.stringify(manifest), imageManifestType);
    await put(revisionPath(repository, descriptor.digest), descriptor.digest);
    return descriptor;
  };
  const image = async (
    repository: string,
    configuration: Record<string, unknown> = { os: 'linux', architecture: 'amd64' },
  ) => {
    const tar = Buffer.alloc(1024);
    const layer = await store(gzipSync(tar), imageLayerType);
    const config = await store(
      JSON.stringify({
        ...configuration,
        rootfs: { type: 'layers', diff_ids: [imageHash(tar)] },
        config: {},
        history: [],
      }),
      imageConfigType,
    );
    for (const descriptor of [layer, config])
      await put(
        join(
          base,
          'repositories',
          repository,
          '_layers/sha256',
          descriptor.digest.slice(7),
          'link',
        ),
        descriptor.digest,
      );
    const manifest = { schemaVersion: 2, mediaType: imageManifestType, config, layers: [layer] };
    return { descriptor: await register(repository, manifest), manifest, config, layer };
  };
  const index = async (repository: string, manifests: readonly unknown[]) => {
    const descriptor = await register(repository, {
      schemaVersion: 2,
      mediaType: imageIndexType,
      manifests,
    });
    return { ...descriptor, mediaType: imageIndexType };
  };
  const journal: RegistryJournal = {
    schemaVersion: 3,
    revision: 7,
    updatedAt: '2026-10-31T00:00:00.000Z',
    fenced: true,
    fenceReason: 'maintenance',
    maintenanceVerified: false,
    measurement: null,
    enrollment: {
      registryId: 'proof',
      storageId: 'proof',
      registryPath: directory,
      rootPath: '/',
      maximumBytes: 1024 ** 3,
      journalMaximumBytes: 1024 ** 3,
      owners: ['owner'],
    },
    protections: [],
    bundles: [],
    reservations: [],
    publication: null,
    maintenance: null,
    closedOperations: [],
    environments: [],
    deployments: [],
    consumers: [],
  };
  return { directory, base, put, store, image, index, register, blobPath, revisionPath, journal };
}
