import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { RegistryArtifact, RegistryContent } from './registry-artifact';

const imageType = 'application/vnd.oci.image.manifest.v1+json';
const indexType = 'application/vnd.oci.image.index.v1+json';
const layerType = 'application/vnd.oci.image.layer.v1.tar';

/** Fixed one-file ustar layer, including two terminal zero blocks; native Docker must independently unpack these bytes. */
function writeLayer(name: 'shared.txt' | 'release.txt', text: string): Buffer {
  const body = Buffer.from(text);
  const archive = Buffer.alloc(512 + Math.ceil(body.length / 512) * 512 + 1024);
  archive.write(name, 0);
  archive.write('0000644\0', 100);
  archive.write('0000000\0', 108);
  archive.write('0000000\0', 116);
  archive.write(body.length.toString(8).padStart(11, '0') + '\0', 124);
  archive.write('00000000000\0', 136);
  archive.fill(32, 148, 156);
  archive.write('0', 156);
  archive.write('ustar\0', 257);
  archive.write('00', 263);
  const checksum = archive.subarray(0, 512).reduce((sum, byte) => sum + byte, 0);
  archive.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148);
  body.copy(archive, 512);
  return archive;
}

/**
 * Owned deterministic OCI index with untagged amd64/arm64 children and two real
 * uncompressed layers. Fourteen bounded release variants share one base layer; every other
 * digest differs. Only the caller's fixed owned scratch directory receives files.
 * This prepares byte evidence, not publication, retention, or Docker acceptance.
 */
export async function writeRegistryIndexFixture(
  directory: string,
  revision: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14,
): Promise<RegistryArtifact> {
  const contents: RegistryContent[] = [];
  const content = async (
    bytes: Buffer,
    mediaType: string,
    dependencies: readonly string[] = [],
  ) => {
    const digest = 'sha256:' + createHash('sha256').update(bytes).digest('hex');
    const path = join(directory, `release-${String(revision)}-${digest.slice(7)}`);
    await writeFile(path, bytes, { mode: 0o600, flag: 'wx' });
    contents.push({
      digest,
      size: bytes.length,
      mediaType,
      path,
      offset: 0,
      dependencies,
      isManifest: mediaType === imageType || mediaType === indexType,
    });
    return { digest, size: bytes.length, mediaType };
  };
  const shared = await content(writeLayer('shared.txt', 'retained shared layer\n'), layerType);
  const unique = await content(
    writeLayer('release.txt', `release ${String(revision)}\n`),
    layerType,
  );
  const layers = [shared, unique];
  const manifests = [];
  for (const architecture of ['amd64', 'arm64']) {
    const config = await content(
      Buffer.from(
        JSON.stringify({
          architecture,
          os: 'linux',
          config: { Labels: { 'task8.release': String(revision) } },
          rootfs: { type: 'layers', diff_ids: layers.map((layer) => layer.digest) },
          history: [{ created_by: 'owned shared layer' }, { created_by: 'owned release layer' }],
        }),
      ),
      'application/vnd.oci.image.config.v1+json',
    );
    const manifest = await content(
      Buffer.from(
        JSON.stringify({
          schemaVersion: 2,
          mediaType: imageType,
          config,
          layers,
        }),
      ),
      imageType,
      [config.digest, ...layers.map((layer) => layer.digest)],
    );
    manifests.push({ ...manifest, platform: { architecture, os: 'linux' } });
  }
  const root = await content(
    Buffer.from(
      JSON.stringify({
        schemaVersion: 2,
        mediaType: indexType,
        manifests,
      }),
    ),
    indexType,
    manifests.map((manifest) => manifest.digest),
  );
  return {
    repository: 'retained/index',
    reference: `release-${String(revision)}`,
    digest: root.digest,
    contents,
  };
}
