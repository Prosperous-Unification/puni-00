import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { scratchAsync } from '@tools/test-scratch';

export const imageManifestType = 'application/vnd.oci.image.manifest.v1+json';
export const imageConfigType = 'application/vnd.oci.image.config.v1+json';
export const imageLayerType = 'application/vnd.oci.image.layer.v1.tar+gzip';
export const imageIndexType = 'application/vnd.oci.image.index.v1+json';
export const imageHash = (bytes: string | Uint8Array) =>
  'sha256:' + createHash('sha256').update(bytes).digest('hex');

/** Real OCI layout with one valid gzip/tar layer; hashes and literals are derived independently of the production verifier. */
export async function createRegistryClientLayout(
  platform: {
    os: string;
    architecture: string;
    variant?: string;
    'os.version'?: string;
    'os.features'?: string[];
  } = { os: 'linux', architecture: 'amd64' },
) {
  const parent = await scratchAsync('registry-client-layout-');
  const directory = join(parent, 'output');
  await mkdir(directory, { mode: 0o700 });
  const blobs = join(directory, 'blobs'),
    hashes = join(blobs, 'sha256');
  await mkdir(hashes, { recursive: true, mode: 0o700 });
  const layerBytes = gzipSync(Buffer.alloc(1024));
  const configBytes = Buffer.from(
    JSON.stringify({
      ...platform,
      rootfs: { type: 'layers', diff_ids: [imageHash(Buffer.alloc(1024))] },
      config: {},
      history: [],
    }),
  );
  const layer = {
    mediaType: imageLayerType,
    digest: imageHash(layerBytes),
    size: layerBytes.length,
  };
  const config = {
    mediaType: imageConfigType,
    digest: imageHash(configBytes),
    size: configBytes.length,
  };
  const manifest = { schemaVersion: 2, mediaType: imageManifestType, config, layers: [layer] };
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  const selected = {
    mediaType: imageManifestType,
    digest: imageHash(manifestBytes),
    size: manifestBytes.length,
  };
  const index = { schemaVersion: 2, mediaType: imageIndexType, manifests: [selected] };
  await writeFile(join(directory, 'oci-layout'), JSON.stringify({ imageLayoutVersion: '1.0.0' }), {
    mode: 0o600,
  });
  await writeFile(join(directory, 'index.json'), JSON.stringify(index), { mode: 0o600 });
  for (const bytes of [layerBytes, configBytes, manifestBytes])
    await writeFile(join(hashes, imageHash(bytes).slice(7)), bytes, { mode: 0o600 });
  return {
    parent,
    directory,
    blobs,
    hashes,
    layer,
    config,
    manifest,
    selected,
    index,
    layerBytes,
    configBytes,
    manifestBytes,
    selection: { digest: selected.digest, platform: { ...platform } },
  };
}
