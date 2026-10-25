import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { join } from 'node:path';

import { type } from 'arktype';

const Digest = type(/^sha256:[0-9a-f]{64}$/);
const Descriptor = type({ digest: Digest, size: 'number.safe >= 0', mediaType: 'string > 0' });
const Manifest = type.or(
  {
    schemaVersion: '2',
    mediaType:
      "'application/vnd.oci.image.index.v1+json'|'application/vnd.docker.distribution.manifest.list.v2+json'",
    manifests: Descriptor.array().atLeastLength(1),
  },
  {
    schemaVersion: '2',
    mediaType:
      "'application/vnd.oci.image.manifest.v1+json'|'application/vnd.docker.distribution.manifest.v2+json'",
    config: Descriptor,
    layers: Descriptor.array(),
  },
);

/** Descriptor reads never follow symlinks and validate every blob, including uncached layers. */
async function readContent(
  path: string,
  digest: string,
  expectedSize?: number,
  manifest = false,
): Promise<Uint8Array> {
  const descriptor = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const status = await descriptor.stat();
    if (
      !status.isFile() ||
      (expectedSize !== undefined && status.size !== expectedSize) ||
      (manifest && status.size > 4 * 1024 ** 2)
    )
      throw new Error('Registry content size or file identity differs from its digest descriptor');
    const hash = createHash('sha256');
    const chunks: Buffer[] = [];
    let bytes = 0;
    const buffer = Buffer.alloc(64 * 1024);
    for (;;) {
      const read = await descriptor.read(buffer);
      if (read.bytesRead === 0) break;
      bytes += read.bytesRead;
      if (bytes > status.size) throw new Error('Registry content grew during digest verification');
      const chunk = buffer.subarray(0, read.bytesRead);
      hash.update(chunk);
      if (manifest) chunks.push(Buffer.from(chunk));
    }
    if (
      bytes !==
        status.size /* Proof: removing SHA verification accepts a same-size altered layer in registry-image-availability.test. */ ||
      `sha256:${hash.digest('hex')}` !== digest
    )
      throw new Error('Registry content digest mismatch');
    return Buffer.concat(chunks);
  } finally {
    await descriptor.close();
  }
}

/**
 * Pinned Distribution 2 storage reader. Requires a repository revision link for every
 * manifest/index and verifies the complete descriptor closure without a registry cache.
 * Called while the common journal authority excludes retirement.
 */
export async function verifyStoredImages(
  directory: string,
  references: readonly { repository: string; digest: string }[],
): Promise<void> {
  const base = join(directory, 'docker/registry/v2');
  const visited = new Set<string>();
  const blobPath = (digest: string) =>
    join(base, 'blobs/sha256', digest.slice(7, 9), digest.slice(7), 'data');
  const visit = async (repository: string, digest: string, size?: number): Promise<void> => {
    const identity = `${repository}@${digest}`;
    if (visited.has(identity)) return;
    visited.add(identity);
    const link = await open(
      join(
        base,
        'repositories',
        repository,
        '_manifests/revisions/sha256',
        digest.slice(7),
        'link',
      ),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const status = await link.stat();
      if (!status.isFile() || status.size > 72 || (await link.readFile('utf8')).trim() !== digest)
        throw new Error('Registry manifest revision link mismatch');
    } finally {
      await link.close();
    }
    const manifest = Manifest(
      JSON.parse(new TextDecoder().decode(await readContent(blobPath(digest), digest, size, true))),
    );
    if (manifest instanceof type.errors)
      throw new Error('Unknown registry manifest descriptor shape');
    if ('manifests' in manifest) {
      for (const child of manifest.manifests) await visit(repository, child.digest, child.size);
    } else {
      for (const child of [manifest.config, ...manifest.layers])
        await readContent(blobPath(child.digest), child.digest, child.size);
    }
  };
  for (const reference of references) {
    if (
      !/^[a-z0-9]+(?:[._/-][a-z0-9]+)*$/.test(reference.repository) ||
      Digest(reference.digest) instanceof type.errors
    )
      throw new Error('Invalid stored image reference');
    await visit(reference.repository, reference.digest);
  }
}
