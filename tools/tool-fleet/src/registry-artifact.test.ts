import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, it } from 'bun:test';

import { inspectOciArchive } from './registry-artifact';

const hash = (bytes: string) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

async function archive(corrupt = false) {
  const directory = await scratchAsync('registry-artifact-');
  const config = '{"architecture":"amd64","os":"linux"}';
  const layer = 'fixture layer';
  const manifest = JSON.stringify({
    schemaVersion: 2,
    mediaType: 'application/vnd.oci.image.manifest.v1+json',
    config: {
      mediaType: 'application/vnd.oci.image.config.v1+json',
      digest: hash(config),
      size: config.length,
    },
    layers: [
      {
        mediaType: 'application/vnd.oci.image.layer.v1.tar',
        digest: hash(layer),
        size: layer.length,
      },
    ],
  });
  await mkdir(join(directory, 'blobs/sha256'), { recursive: true });
  for (const bytes of [config, layer, manifest])
    await writeFile(
      join(directory, 'blobs/sha256', hash(bytes).slice(7)),
      corrupt && bytes === layer ? 'wrong content' : bytes,
    );
  await writeFile(join(directory, 'oci-layout'), '{"imageLayoutVersion":"1.0.0"}');
  await writeFile(
    join(directory, 'index.json'),
    JSON.stringify({
      schemaVersion: 2,
      manifests: [
        {
          mediaType: 'application/vnd.oci.image.manifest.v1+json',
          digest: hash(manifest),
          size: manifest.length,
        },
      ],
    }),
  );
  const path = join(directory, 'image.tar');
  const command = Bun.spawnSync([
    'tar',
    '--format=ustar',
    '-cf',
    path,
    '-C',
    directory,
    'index.json',
    'oci-layout',
    'blobs',
  ]);
  if (command.exitCode !== 0) throw new Error(command.stderr.toString());
  return { directory, path, root: hash(manifest), layer: hash(layer) };
}

it('freezes the exact image manifest and complete verified OCI closure', async () => {
  const fixture = await archive();
  try {
    const image = await inspectOciArchive(fixture.path, 'wbs-be-01', 'release');
    expect(image.digest).toBe(fixture.root);
    expect(image.contents).toHaveLength(3);
    expect(image.contents.some((content) => content.digest === fixture.layer)).toBe(true);
  } finally {
    await rm(fixture.directory, { recursive: true });
  }
});

it('refuses corrupt archive bytes before admitting their declared closure', async () => {
  const fixture = await archive(true);
  try {
    expect(
      (await rejectionOf(inspectOciArchive(fixture.path, 'wbs-be-01', 'release'))).message,
    ).toMatch(/digest/);
  } finally {
    await rm(fixture.directory, { recursive: true });
  }
});

it('accepts the actual pinned Dagger export without using its Docker compatibility manifest', async () => {
  const image = await inspectOciArchive(
    new URL('./fixtures/dagger-0.21.9.oci.tar', import.meta.url).pathname,
    'proof',
    'v1',
  );
  expect(image.digest).toBe(
    'sha256:27ddb6fd651405cb8f8b78089a405d330cff8e3154dde0b8bd90febfcd95d7ed',
  );
  expect(image.contents.map((content) => content.size).sort((left, right) => left - right)).toEqual(
    [127, 367, 476],
  );
});

async function rejectionOf(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (cause) {
    if (cause instanceof Error) return cause;
    throw cause;
  }
  throw new Error('Expected refusal');
}

it('refuses invalid tar checksums and unsupported archive entries before closure admission', async () => {
  const fixture = await archive();
  try {
    const valid = new Uint8Array(await Bun.file(fixture.path).arrayBuffer());
    const broken = valid.slice();
    broken[108] = 55;
    await writeFile(fixture.path, broken);
    expect((await rejectionOf(inspectOciArchive(fixture.path, 'proof', 'v1'))).message).toContain(
      'header',
    );
    const unsupported = valid.slice();
    unsupported[156] = 50;
    unsupported.fill(32, 148, 156);
    const sum = unsupported.subarray(0, 512).reduce((total, byte) => total + byte, 0);
    unsupported.set(new TextEncoder().encode(sum.toString(8).padStart(6, '0') + '\0 '), 148);
    await writeFile(fixture.path, unsupported);
    expect((await rejectionOf(inspectOciArchive(fixture.path, 'proof', 'v1'))).message).toContain(
      'Unsupported OCI archive entry',
    );
  } finally {
    await rm(fixture.directory, { recursive: true });
  }
});

it('refuses contradictory shared descriptors and non-image index children before admission', async () => {
  const fixture = await archive();
  try {
    const original = JSON.parse(await Bun.file(join(fixture.directory, 'index.json')).text()) as {
      manifests: { digest: string; mediaType: string; size: number }[];
    };
    const child = original.manifests.at(0);
    if (child === undefined) throw new Error('Missing fixture child');
    for (const fault of ['size', 'kind']) {
      const root = JSON.stringify({
        schemaVersion: 2,
        mediaType: 'application/vnd.oci.image.index.v1+json',
        manifests:
          fault === 'size'
            ? [child, { ...child, size: child.size + 1 }]
            : [{ ...child, mediaType: 'application/vnd.unknown.artifact' }],
      });
      await writeFile(join(fixture.directory, 'blobs/sha256', hash(root).slice(7)), root);
      await writeFile(
        join(fixture.directory, 'index.json'),
        JSON.stringify({
          schemaVersion: 2,
          manifests: [
            {
              digest: hash(root),
              size: root.length,
              mediaType: 'application/vnd.oci.image.index.v1+json',
            },
          ],
        }),
      );
      const tar = Bun.spawnSync([
        'tar',
        '--format=ustar',
        '-cf',
        fixture.path,
        '-C',
        fixture.directory,
        'index.json',
        'oci-layout',
        'blobs',
      ]);
      if (tar.exitCode !== 0) throw new Error(tar.stderr.toString());
      expect((await rejectionOf(inspectOciArchive(fixture.path, 'proof', 'v1'))).message).toMatch(
        /descriptor|index child/,
      );
    }
  } finally {
    await rm(fixture.directory, { recursive: true });
  }
});

it('refuses absent content, malformed layout metadata and unsupported manifest relationships', async () => {
  for (const fault of [
    'layout',
    'roots',
    'root-type',
    'subject',
    'missing-config',
    'missing-layer',
  ]) {
    const fixture = await archive();
    try {
      const index = JSON.parse(await Bun.file(join(fixture.directory, 'index.json')).text()) as {
        schemaVersion: number;
        manifests: { digest: string; size: number; mediaType: string }[];
      };
      const root = index.manifests.at(0);
      if (root === undefined) throw new Error('Missing fixture root');
      if (fault === 'layout')
        await writeFile(join(fixture.directory, 'oci-layout'), '{"imageLayoutVersion":"2.0.0"}');
      else if (fault === 'roots')
        await writeFile(
          join(fixture.directory, 'index.json'),
          '{"schemaVersion":2,"manifests":[]}',
        );
      else if (fault === 'root-type')
        await writeFile(
          join(fixture.directory, 'index.json'),
          JSON.stringify({
            ...index,
            manifests: [{ ...root, mediaType: 'application/vnd.unknown.artifact' }],
          }),
        );
      else if (fault === 'missing-layer')
        await rm(join(fixture.directory, 'blobs/sha256', fixture.layer.slice(7)));
      else {
        const manifest = JSON.parse(
          await Bun.file(join(fixture.directory, 'blobs/sha256', root.digest.slice(7))).text(),
        ) as Record<string, unknown>;
        if (fault === 'subject') manifest['subject'] = { digest: fixture.layer };
        else delete manifest['config'];
        const bytes = JSON.stringify(manifest);
        await writeFile(join(fixture.directory, 'blobs/sha256', hash(bytes).slice(7)), bytes);
        await writeFile(
          join(fixture.directory, 'index.json'),
          JSON.stringify({
            ...index,
            manifests: [{ ...root, digest: hash(bytes), size: bytes.length }],
          }),
        );
      }
      const tar = Bun.spawnSync([
        'tar',
        '--format=ustar',
        '-cf',
        fixture.path,
        '-C',
        fixture.directory,
        'index.json',
        'oci-layout',
        'blobs',
      ]);
      if (tar.exitCode !== 0) throw new Error(tar.stderr.toString());
      const refusal = await rejectionOf(inspectOciArchive(fixture.path, 'proof', 'v1'));
      expect(refusal.message).toMatch(/OCI/);
    } finally {
      await rm(fixture.directory, { recursive: true });
    }
  }
});
