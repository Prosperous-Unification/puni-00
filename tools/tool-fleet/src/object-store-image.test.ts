import { createHash } from 'node:crypto';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { describe, expect, it } from 'bun:test';

import { type RunCommand } from './controller';
import {
  buildObjectStore,
  type ObjectStoreLock,
  readObjectStoreLock,
  verifyBinary,
} from './object-store-image';

const bytes = Buffer.from('signed upstream binary fixture');
const checksum = createHash('sha256').update(bytes).digest('hex');
const lock: ObjectStoreLock = {
  schemaVersion: 1,
  image: 'puni/object-store:lab',
  digest: `sha256:${'a'.repeat(64)}`,
  buildx: { version: 'v0.38.0', url: 'https://example.test/buildx', sha256: 'f'.repeat(64) },
  base: 'busybox:1.36.1@sha256:' + 'b'.repeat(64),
  builder: { name: 'moby/buildkit:v0.33.0', digest: `sha256:${'c'.repeat(64)}` },
  publicKey: 'upstream-public-key',
  publicKeySource: 'https://example.test/immutable-key',
  minio: {
    version: 'exact',
    url: 'https://example.test/minio',
    sha256: checksum,
    signatureUrl: 'https://example.test/minio.minisig',
  },
  mc: {
    version: 'exact',
    url: 'https://example.test/mc',
    sha256: checksum,
    signatureUrl: 'https://example.test/mc.minisig',
  },
};

function createOutput(exitCode: number, stdout = '', stderr = '') {
  return { exitCode, stdout: Buffer.from(stdout), stderr: Buffer.from(stderr) };
}

const image = { name: lock.image, digest: lock.digest };
const sources = {
  schemaVersion: lock.schemaVersion,
  base: lock.base,
  builder: lock.builder,
  buildx: lock.buildx,
  publicKey: lock.publicKey,
  publicKeySource: lock.publicKeySource,
  minio: lock.minio,
  mc: lock.mc,
};

const fetchArtifact = () => Promise.resolve(new Response(bytes));

function createRunner(
  fault?: 'client' | 'signature' | 'build' | 'manifest' | 'tar' | 'index',
): RunCommand {
  return (command) => {
    if (command[0] === 'docker' && command[2] === 'version')
      return createOutput(
        0,
        fault === 'client'
          ? 'github.com/docker/buildx v9.9.9 arbitrary'
          : 'github.com/docker/buildx v0.38.0 official',
      );
    if (command[0] === 'minisign')
      return fault === 'signature'
        ? createOutput(1, '', 'Signature verification failed')
        : createOutput(0);
    if (command[0] === 'tar' && fault === 'tar') return createOutput(2, '', 'archive absent');
    if (command[0] === 'tar' && fault === 'index') return createOutput(0, '{}');
    if (command[0] === 'tar')
      return createOutput(
        0,
        JSON.stringify({
          schemaVersion: 2,
          manifests: [{ digest: fault === 'manifest' ? `sha256:${'d'.repeat(64)}` : lock.digest }],
        }),
      );
    if (command[2] === 'inspect')
      return createOutput(0, `image="${lock.builder.name}@${lock.builder.digest}"`);
    if (command[2] === 'build')
      return fault === 'build' ? createOutput(42, '', 'build fault') : createOutput(0);
    throw new Error(`Unexpected boundary ${command.join(' ')}`);
  };
}

describe('object store production build boundary', () => {
  it('refuses altered upstream bytes before signature verification', async () => {
    const root = await scratchAsync('object-store-checksum-');
    const path = join(root, 'minio');
    await writeFile(path, bytes);
    expect(
      verifyBinary(
        path,
        { ...lock.minio, sha256: '0'.repeat(64) },
        lock.publicKey,
        'minisign',
        () => {
          throw new Error('Signature tool must not run');
        },
      ),
    ).rejects.toThrow('checksum');
  });
  it('refuses a rejected upstream signature through the builder', async () => {
    const root = await scratchAsync('object-store-signature-');
    await prepareRecipe(root);
    expect(buildObjectStore(root, lock, createRunner('signature'), fetchArtifact)).rejects.toThrow(
      'signature verification failed',
    );
  });
  it('refuses another Buildx client version', async () => {
    const root = await scratchAsync('object-store-client-');
    await prepareRecipe(root);
    expect(buildObjectStore(root, lock, createRunner('client'), fetchArtifact)).rejects.toThrow(
      'requires Buildx v0.38.0',
    );
  });
  it('refuses a failed Docker build', async () => {
    const root = await scratchAsync('object-store-build-');
    await prepareRecipe(root);
    expect(buildObjectStore(root, lock, createRunner('build'), fetchArtifact)).rejects.toThrow(
      'build fault',
    );
  });
  it('refuses a different emitted manifest', async () => {
    const root = await scratchAsync('object-store-manifest-');
    await prepareRecipe(root);
    expect(buildObjectStore(root, lock, createRunner('manifest'), fetchArtifact)).rejects.toThrow(
      'manifest',
    );
  });
});

async function prepareRecipe(root: string): Promise<void> {
  await mkdir(join(root, 'infra/local/object-store'), { recursive: true });
  await writeFile(join(root, 'infra/local/object-store/Containerfile'), 'ARG BASE\nFROM ${BASE}\n');
}

describe('object store trusted input boundaries', () => {
  it('requires a readable lock', async () => {
    const root = await scratchAsync('object-store-lock-');
    expect(readObjectStoreLock(join(root, 'absent.json'), image)).rejects.toThrow();
    expect(readObjectStoreLock(root, image)).rejects.toThrow();
    const path = join(root, 'unreadable.json');
    await writeFile(path, JSON.stringify(lock));
    await chmod(path, 0o000);
    try {
      expect(readObjectStoreLock(path, image)).rejects.toThrow('EACCES');
    } finally {
      await chmod(path, 0o644);
    }
  });
  it('rejects malformed and incomplete locks', async () => {
    const root = await scratchAsync('object-store-lock-');
    const path = join(root, 'lock.json');
    await writeFile(path, '{');
    expect(readObjectStoreLock(path, image)).rejects.toThrow();
    await writeFile(path, '{}');
    expect(readObjectStoreLock(path, image)).rejects.toThrow('lock is invalid');
  });
  it('takes image identity only from the toolchain role', async () => {
    const root = await scratchAsync('object-store-identity-');
    const path = join(root, 'sources.json');
    await writeFile(path, JSON.stringify(sources));
    expect(await readObjectStoreLock(path, image)).toEqual(lock);
    await writeFile(path, JSON.stringify({ ...sources, image: 'unapproved/image:latest' }));
    expect(readObjectStoreLock(path, image)).rejects.toThrow('lock is invalid');
    await writeFile(path, JSON.stringify({ ...sources, digest: `sha256:${'e'.repeat(64)}` }));
    expect(readObjectStoreLock(path, image)).rejects.toThrow('lock is invalid');
  });
  it('refuses an unavailable signature verifier', async () => {
    const root = await scratchAsync('object-store-missing-minisign-');
    const path = join(root, 'minio');
    await writeFile(path, bytes);
    await writeFile(`${path}.minisig`, 'detached-signature');
    expect(
      verifyBinary(path, lock.minio, lock.publicKey, join(root, 'absent-minisign')),
    ).rejects.toThrow();
  });

  it('rejects a failed upstream download', async () => {
    const root = await scratchAsync('object-store-http-');
    expect(
      buildObjectStore(root, lock, createRunner(), () =>
        Promise.resolve(new Response('', { status: 503 })),
      ),
    ).rejects.toThrow('503');
  });
  it('requires readable and structured OCI manifest state', async () => {
    for (const fault of ['tar', 'index'] as const) {
      const root = await scratchAsync('object-store-index-');
      await prepareRecipe(root);
      expect(buildObjectStore(root, lock, createRunner(fault), fetchArtifact)).rejects.toThrow(
        /index (unreadable|invalid)/,
      );
    }
  });
  it('returns the verified archive after a successful build', async () => {
    const root = await scratchAsync('object-store-success-');
    await prepareRecipe(root);
    expect(await buildObjectStore(root, lock, createRunner(), fetchArtifact)).toBe(
      join(root, 'dist/tool-fleet/object-store.oci'),
    );
  });
});
