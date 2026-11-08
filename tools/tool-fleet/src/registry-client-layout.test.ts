import {
  chmod,
  link,
  open,
  readdir,
  readFile,
  readlink,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { verifyRegistryClientLayout } from './registry-client-layout';
import { createRegistryClientLayout, imageHash } from './registry-client-layout.fixture';
import { requireRejection } from './registry-rejection.fixture';

const signal = () => new AbortController().signal;
async function requireClosed(directory: string) {
  const own = [];
  for (const name of await readdir('/proc/self/fd')) {
    try {
      const path = await readlink('/proc/self/fd/' + name);
      if (path.startsWith(directory)) own.push(path);
    } catch (cause) {
      if (!(cause instanceof Error) || !('code' in cause) || cause.code !== 'ENOENT') throw cause;
    }
  }
  expect(own).toEqual([]);
}
for (const architecture of ['amd64', 'arm64'])
  test(
    'exact client layout verifies ' + architecture + ' without mutating or retaining descriptors',
    async () => {
      const proof = await createRegistryClientLayout({ os: 'linux', architecture });
      const before = await readFile(join(proof.directory, 'index.json'));
      await verifyRegistryClientLayout(proof.directory, proof.selection, signal());
      expect(await readFile(join(proof.directory, 'index.json'))).toEqual(before);
      await requireClosed(proof.directory);
    },
  );

test('streamed layer hash mismatch refuses client completion', async () => {
  const proof = await createRegistryClientLayout();
  const changed = Buffer.from(proof.layerBytes);
  changed[9] = 1;
  await writeFile(join(proof.hashes, proof.layer.digest.slice(7)), changed);
  const refused = await requireRejection(
    verifyRegistryClientLayout(proof.directory, proof.selection, signal()),
  );
  expect(refused.throwCause).toThrow('blob differs');
  await requireClosed(proof.directory);
});
for (const component of ['manifest', 'config'] as const)
  test('client layout rejects corrupt ' + component + ' bytes', async () => {
    const proof = await createRegistryClientLayout();
    const descriptor = component === 'manifest' ? proof.selected : proof.config;
    const path = join(proof.hashes, descriptor.digest.slice(7));
    const changed = Buffer.from(await readFile(path));
    changed[0] = 0;
    await writeFile(path, changed);
    const refused = await requireRejection(
      verifyRegistryClientLayout(proof.directory, proof.selection, signal()),
    );
    expect(refused.throwCause).toThrow('blob differs');
    await requireClosed(proof.directory);
  });
for (const entry of [
  'oci-layout',
  'index.json',
  'manifest',
  'config',
  'layer',
  'blobs',
  'sha256',
] as const)
  test('client layout refuses missing ' + entry, async () => {
    const proof = await createRegistryClientLayout();
    const path =
      entry === 'manifest'
        ? join(proof.hashes, proof.selected.digest.slice(7))
        : entry === 'config'
          ? join(proof.hashes, proof.config.digest.slice(7))
          : entry === 'layer'
            ? join(proof.hashes, proof.layer.digest.slice(7))
            : entry === 'blobs'
              ? proof.blobs
              : entry === 'sha256'
                ? proof.hashes
                : join(proof.directory, entry);
    await rm(path, { recursive: true });
    const refused = await requireRejection(
      verifyRegistryClientLayout(proof.directory, proof.selection, signal()),
    );
    expect(refused.cause).toBeInstanceOf(Error);
    await requireClosed(proof.directory);
  });
for (const entry of ['root', 'blobs', 'sha256', 'index', 'blob'] as const)
  test('client layout refuses symlinked ' + entry + ' cache', async () => {
    const proof = await createRegistryClientLayout();
    if (entry === 'root') {
      const alias = join(proof.parent, 'alias');
      await symlink(proof.directory, alias);
      await requireRejection(verifyRegistryClientLayout(alias, proof.selection, signal()));
    } else {
      const path =
        entry === 'blobs'
          ? proof.blobs
          : entry === 'sha256'
            ? proof.hashes
            : entry === 'index'
              ? join(proof.directory, 'index.json')
              : join(proof.hashes, proof.layer.digest.slice(7));
      const outside = join(proof.parent, 'external');
      if (entry === 'index' || entry === 'blob') {
        await writeFile(outside, await readFile(path), { mode: 0o600 });
        await rm(path);
      } else {
        const { rename } = await import('node:fs/promises');
        await rename(path, outside);
      }
      await symlink(outside, path);
      await requireRejection(
        verifyRegistryClientLayout(proof.directory, proof.selection, signal()),
      );
    }
    await requireClosed(proof.parent);
  });
test('client layout refuses hardlinked cached content', async () => {
  const proof = await createRegistryClientLayout();
  const path = join(proof.hashes, proof.layer.digest.slice(7));
  await link(path, join(proof.parent, 'external'));
  const refused = await requireRejection(
    verifyRegistryClientLayout(proof.directory, proof.selection, signal()),
  );
  expect(refused.throwCause).toThrow('Untrusted client file');
  await requireClosed(proof.directory);
});
for (const level of ['root', 'blobs', 'sha256'] as const)
  test('client layout refuses extra entry at ' + level, async () => {
    const proof = await createRegistryClientLayout();
    const directory =
      level === 'root' ? proof.directory : level === 'blobs' ? proof.blobs : proof.hashes;
    await writeFile(join(directory, 'unexpected'), 'foreign');
    const refused = await requireRejection(
      verifyRegistryClientLayout(proof.directory, proof.selection, signal()),
    );
    expect(refused.throwCause).toThrow('Unexpected client layout entries');
    await requireClosed(proof.directory);
  });
for (const entry of ['root', 'blobs', 'sha256', 'index', 'blob'] as const)
  test('client layout refuses unreadable ' + entry, async () => {
    const proof = await createRegistryClientLayout();
    const path =
      entry === 'root'
        ? proof.directory
        : entry === 'blobs'
          ? proof.blobs
          : entry === 'sha256'
            ? proof.hashes
            : entry === 'index'
              ? join(proof.directory, 'index.json')
              : join(proof.hashes, proof.layer.digest.slice(7));
    await chmod(path, 0);
    try {
      await requireRejection(
        verifyRegistryClientLayout(proof.directory, proof.selection, signal()),
      );
      await requireClosed(proof.directory);
    } finally {
      await chmod(path, entry === 'index' || entry === 'blob' ? 0o600 : 0o700);
    }
  });
for (const field of ['os', 'architecture', 'variant', 'os.version', 'os.features'] as const)
  test('client layout rejects a different selected platform ' + field, async () => {
    const proof = await createRegistryClientLayout({
      os: 'linux',
      architecture: 'amd64',
      variant: 'v8',
      'os.version': '1.0',
      'os.features': ['one'],
    });
    if (field === 'os') proof.selection.platform.os = 'windows';
    if (field === 'architecture') proof.selection.platform.architecture = 'arm64';
    if (field === 'variant') proof.selection.platform.variant = 'v9';
    if (field === 'os.version') proof.selection.platform['os.version'] = '2.0';
    if (field === 'os.features') proof.selection.platform['os.features'] = ['two'];
    const refused = await requireRejection(
      verifyRegistryClientLayout(proof.directory, proof.selection, signal()),
    );
    expect(refused.throwCause).toThrow('Client configuration platform differs');
    await requireClosed(proof.directory);
  });
for (const field of ['selected', 'size', 'media', 'count'] as const)
  test('client index refuses ' + field + ' disagreement', async () => {
    const proof = await createRegistryClientLayout();
    if (field === 'selected') proof.index.manifests[0].digest = 'sha256:' + 'b'.repeat(64);
    if (field === 'size') proof.index.manifests[0].size++;
    if (field === 'media')
      proof.index.manifests[0].mediaType = 'application/vnd.docker.distribution.manifest.v2+json';
    if (field === 'count') proof.index.manifests.push(proof.selected);
    await writeFile(join(proof.directory, 'index.json'), JSON.stringify(proof.index));
    await requireRejection(verifyRegistryClientLayout(proof.directory, proof.selection, signal()));
    await requireClosed(proof.directory);
  });
for (const entry of ['version', 'index', 'manifest'] as const)
  test('client layout rejects unsupported ' + entry + ' schema', async () => {
    const proof = await createRegistryClientLayout();
    if (entry === 'version')
      await writeFile(
        join(proof.directory, 'oci-layout'),
        JSON.stringify({ imageLayoutVersion: 'unknown' }),
      );
    else if (entry === 'index')
      await writeFile(
        join(proof.directory, 'index.json'),
        JSON.stringify({ ...proof.index, subject: proof.selected }),
      );
    else {
      const bytes = Buffer.from(JSON.stringify({ ...proof.manifest, subject: proof.config }));
      const selected = { ...proof.selected, digest: imageHash(bytes), size: bytes.length };
      await rm(join(proof.hashes, proof.selected.digest.slice(7)));
      await writeFile(join(proof.hashes, selected.digest.slice(7)), bytes, { mode: 0o600 });
      proof.selection.digest = selected.digest;
      proof.index.manifests = [selected];
      await writeFile(join(proof.directory, 'index.json'), JSON.stringify(proof.index));
    }
    await requireRejection(verifyRegistryClientLayout(proof.directory, proof.selection, signal()));
    await requireClosed(proof.directory);
  });
test('client metadata byte allowance refuses oversized valid JSON', async () => {
  const proof = await createRegistryClientLayout();
  await writeFile(
    join(proof.directory, 'oci-layout'),
    JSON.stringify({ imageLayoutVersion: '1.0.0' }) + ' '.repeat(2048),
  );
  await requireRejection(verifyRegistryClientLayout(proof.directory, proof.selection, signal()));
  await requireClosed(proof.directory);
});
test('client metadata requires valid UTF8 even in optional annotations', async () => {
  const proof = await createRegistryClientLayout();
  const bytes = Buffer.from(
    JSON.stringify({ ...proof.index, annotations: { note: 'placeholder' } }),
  );
  const marker = bytes.indexOf('placeholder');
  bytes[marker] = 255;
  await writeFile(join(proof.directory, 'index.json'), bytes);
  await requireRejection(verifyRegistryClientLayout(proof.directory, proof.selection, signal()));
  await requireClosed(proof.directory);
});
test('cancelled layout verification preserves the exact reason and closes its files', async () => {
  const proof = await createRegistryClientLayout();
  const controller = new AbortController();
  const cause = new Error('owned cancellation');
  controller.abort(cause);
  const refused = await requireRejection(
    verifyRegistryClientLayout(proof.directory, proof.selection, controller.signal),
  );
  expect(refused.cause).toBe(cause);
  await requireClosed(proof.directory);
});

test('Crane image descriptor permits its matching image config type marker', async () => {
  const proof = await createRegistryClientLayout();
  await writeFile(
    join(proof.directory, 'index.json'),
    JSON.stringify({
      ...proof.index,
      manifests: [{ ...proof.selected, artifactType: 'application/vnd.oci.image.config.v1+json' }],
    }),
  );
  await verifyRegistryClientLayout(proof.directory, proof.selection, signal());
  await requireClosed(proof.directory);
});
for (const artifactType of ['application/vnd.example.attestation', '', null, 0])
  test(
    'client image descriptor refuses a non-image artifact marker ' + String(artifactType),
    async () => {
      const proof = await createRegistryClientLayout();
      await writeFile(
        join(proof.directory, 'index.json'),
        JSON.stringify({ ...proof.index, manifests: [{ ...proof.selected, artifactType }] }),
      );
      await requireRejection(
        verifyRegistryClientLayout(proof.directory, proof.selection, signal()),
      );
      await requireClosed(proof.directory);
    },
  );

test('Crane image descriptor rejects an image config marker differing from its manifest', async () => {
  const proof = await createRegistryClientLayout();
  await writeFile(
    join(proof.directory, 'index.json'),
    JSON.stringify({
      ...proof.index,
      manifests: [
        { ...proof.selected, artifactType: 'application/vnd.docker.container.image.v1+json' },
      ],
    }),
  );
  const refused = await requireRejection(
    verifyRegistryClientLayout(proof.directory, proof.selection, signal()),
  );
  expect(refused.throwCause).toThrow('artifact type differs');
  await requireClosed(proof.directory);
});

test('client output verification follows the held job descriptor after its parent path is replaced', async () => {
  const proof = await createRegistryClientLayout();
  const outside = await createRegistryClientLayout();
  await writeFile(join(outside.directory, 'index.json'), 'invalid replacement');
  const parent = await open(proof.parent, 'r');
  const moved = proof.parent + '-moved';
  await rename(proof.parent, moved);
  try {
    await symlink(outside.parent, proof.parent);
    await verifyRegistryClientLayout({ parent, name: 'output' }, proof.selection, signal());
    expect(await readFile(join(outside.directory, 'index.json'), 'utf8')).toBe(
      'invalid replacement',
    );
  } finally {
    await parent.close();
    await rm(proof.parent);
    await rename(moved, proof.parent);
  }
  await requireClosed(proof.parent);
});
