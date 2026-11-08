import { createHash } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, it } from 'bun:test';

import { verifyStoredImages } from './registry-image-availability';

it('verifies exact repository manifests and all uncached image content', async () => {
  const directory = await scratchAsync('registry-availability-');
  const base = join(directory, 'docker/registry/v2');
  const store = async (bytes: string) => {
    const hash = createHash('sha256').update(bytes).digest('hex');
    const path = join(base, 'blobs/sha256', hash.slice(0, 2), hash, 'data');
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, bytes);
    return { digest: `sha256:${hash}`, size: Buffer.byteLength(bytes), path };
  };
  const config = await store('{}');
  const layer = await store('tiny layer');
  const manifest = await store(
    JSON.stringify({
      schemaVersion: 2,
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      config: {
        mediaType: 'application/vnd.oci.image.config.v1+json',
        digest: config.digest,
        size: config.size,
      },
      layers: [
        {
          mediaType: 'application/vnd.oci.image.layer.v1.tar',
          digest: layer.digest,
          size: layer.size,
        },
      ],
    }),
  );
  const link = join(
    base,
    'repositories/wbs/backend/_manifests/revisions/sha256',
    manifest.digest.slice(7),
    'link',
  );
  await mkdir(join(link, '..'), { recursive: true });
  await writeFile(link, manifest.digest);
  const references = [{ repository: 'wbs/backend', digest: manifest.digest }];
  await verifyStoredImages(directory, references);
  await unlink(layer.path);
  await requireRefusal(verifyStoredImages(directory, references), 'ENOENT');
  await writeFile(layer.path, 'evil layer');
  await requireRefusal(verifyStoredImages(directory, references), 'digest');
  await writeFile(layer.path, 'tiny layer');
  await unlink(link);
  await requireRefusal(verifyStoredImages(directory, references), 'ENOENT');
});

async function requireRefusal(promise: Promise<unknown>, expected?: string): Promise<void> {
  const refusal = await promise.then(
    () => {
      throw new Error('Expected refusal');
    },
    (cause: unknown) => cause,
  );
  expect(refusal).toBeInstanceOf(Error);
  if (expected !== undefined) expect(String(refusal)).toContain(expected);
}
