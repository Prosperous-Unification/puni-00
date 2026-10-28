import { rejects } from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, stat, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, it } from 'bun:test';

import { bootstrapLab, parseK3dLabRequest } from './k3d-lab';
import { dockerEnvironment } from './k3d-resource-runtime';
import { captureObjectStoreArchive, readObjectStoreArchive } from './object-store-archive';
import { archiveFixture } from './object-store-archive.fixture.test';
import { importObjectStore } from './object-store-image';

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const image = 'docker.io/puni-local/object-store:release';

async function prepare(fault = '') {
  const directory = await scratchAsync('object-store-archive-');
  const fixture = archiveFixture(fault);
  const source = join(directory, 'source.oci');
  await writeFile(source, fixture.bytes);
  return { directory, source, ...fixture };
}

it('freezes the complete locked archive and imports its bytes into the creator ID without a builder', async () => {
  const fixture = await prepare();
  const archive = await captureObjectStoreArchive(fixture.source, fixture.directory, fixture.lock);
  expect(archive).toMatchObject({
    size: fixture.bytes.length,
    sha256: sha(fixture.bytes),
    image,
    digest: fixture.lock.digest,
    platform: 'linux/amd64',
    unpackBytes: 'unknown',
  });
  expect((await stat(archive.path)).mode & 0o777).toBe(0o400);
  await writeFile(fixture.source, 'changed original');
  expect(readObjectStoreArchive(archive)).toEqual(fixture.bytes);
  const commands: string[][] = [];
  const imported: Buffer[] = [];
  const alias = `docker.io/puni-local/object-store@${fixture.lock.digest}`;
  importObjectStore(
    archive.path,
    fixture.lock,
    'owned',
    'k3d-owned-server-0',
    'k3d',
    (command, input) => {
      commands.push([...command]);
      if (input !== undefined) imported.push(Buffer.from(input));
      const reference = command.at(-1)?.replace('name==', '');
      return {
        exitCode: 0,
        stderr: Buffer.alloc(0),
        stdout: Buffer.from(
          command.includes('ls')
            ? `REF TYPE DIGEST SIZE\n${String(reference)} manifest ${fixture.lock.digest} 1MiB`
            : '',
        ),
      };
    },
    { archive, nodeId: 'b'.repeat(64) },
  );
  expect(imported).toHaveLength(1);
  expect(imported[0]?.equals(fixture.bytes)).toBe(true);
  expect(commands[0]).toEqual([
    'docker',
    'exec',
    '-i',
    'b'.repeat(64),
    'ctr',
    '-n',
    'k8s.io',
    'images',
    'import',
    '-',
  ]);
  expect(commands.slice(1).every((command) => command[2] === 'b'.repeat(64))).toBe(true);
  expect(commands.at(-1)?.at(-1)).toBe(`name==${alias}`);
  expect(commands.some((command) => command.includes('buildx') || command[0] === 'k3d')).toBe(
    false,
  );
});

for (const fault of [
  'json',
  'manifest',
  'config',
  'layer',
  'pin',
  'size',
  'platform',
  'config-platform',
  'reference',
  'docker-reference',
  'docker-layer',
  'duplicate',
  'unsafe',
  'symlink',
  'extra',
  'many',
  'checksum',
  'terminator',
  'truncated',
  'config-size',
  'layer-size',
  'config-media',
  'layer-media',
  'manifest-media',
  'index-media',
  'descriptor-media',
  'directory-type',
  'unreferenced',
  'metadata',
  'missing-index',
  'missing-config',
  'missing-layer',
  'missing-layout',
  'padding',
  'octal',
  'header-prefix',
  'header-linkname',
  'header-magic',
  'ambiguous-name',
  'ascii-path',
  'member-bounds',
  'index-multiple',
  'docker-multiple',
  'manifest-shape',
  'index-json',
  'index-utf8',
]) {
  it(`refuses ${fault} archive before distribution`, async () => {
    const fixture = await prepare(fault);
    const causes: Record<string, RegExp> = {
      manifest: /^Error: Object store archive blob identity or size differs$/,
      'missing-index': /missing index/,
      'missing-config': /missing blobs/,
      'missing-layer': /missing blobs/,
      'missing-layout': /missing oci-layout/,
      octal: /invalid octal/,
      truncated: /truncated/,
      metadata: /metadata exceeds/,
      many: /too many members/,
    };
    await rejects(
      captureObjectStoreArchive(fixture.source, fixture.directory, fixture.lock),
      causes[fault],
    );
  });
}

it('distinguishes absent and unreadable input, rejects non-regular and oversized input', async () => {
  const fixture = await prepare();
  await rejects(
    captureObjectStoreArchive(join(fixture.directory, 'absent'), fixture.directory, fixture.lock),
    new RegExp('ENOENT'),
  );
  await chmod(fixture.source, 0o000);
  await rejects(
    captureObjectStoreArchive(fixture.source, fixture.directory, fixture.lock),
    new RegExp('EACCES'),
  );
  await rejects(
    captureObjectStoreArchive(fixture.directory, fixture.directory, fixture.lock),
    new RegExp('regular'),
  );
  await chmod(fixture.source, 0o600);
  const child = Bun.spawnSync([
    process.execPath,
    '-e',
    'require("node:fs").truncateSync(process.argv[1], 134218240)',
    fixture.source,
  ]);
  expect(child.exitCode).toBe(0);
  await rejects(
    captureObjectStoreArchive(fixture.source, fixture.directory, fixture.lock),
    new RegExp('size'),
  );
});

it('refuses changed retained bytes and mismatched import identities before import commands', async () => {
  const fixture = await prepare();
  const archive = await captureObjectStoreArchive(fixture.source, fixture.directory, fixture.lock);
  let invoked = false;
  const run = () => {
    invoked = true;
    throw new Error('UNEXPECTED_DISTRIBUTION');
  };
  expect(() => {
    importObjectStore(
      archive.path,
      { ...fixture.lock, digest: `sha256:${'f'.repeat(64)}` },
      'owned',
      'node',
      'k3d',
      run,
      { archive, nodeId: 'b'.repeat(64) },
    );
  }).toThrow('identity');
  expect(() => {
    importObjectStore(archive.path, fixture.lock, 'owned', 'node', 'k3d', run, {
      archive,
      nodeId: 'owned-name',
    });
  }).toThrow('creator ID');
  await chmod(archive.path, 0o600);
  await writeFile(archive.path, Buffer.alloc(fixture.bytes.length));
  expect(() => {
    importObjectStore(archive.path, fixture.lock, 'owned', 'node', 'k3d', run, {
      archive,
      nodeId: 'b'.repeat(64),
    });
  }).toThrow('retained');
  expect(invoked).toBe(false);
});

it('requires an explicit absolute archive only for strict non-app up and preserves app/ordinary requests', () => {
  const strict = [
    'up',
    '--profile',
    'platform',
    '--worktree-root',
    '/owned',
    '--resource-evidence',
    'creation-v1',
  ];
  expect(() => parseK3dLabRequest(strict)).toThrow('--object-store-archive');
  expect(() => parseK3dLabRequest([...strict, '--object-store-archive', 'relative.oci'])).toThrow(
    'absolute',
  );
  expect(
    parseK3dLabRequest([...strict, '--object-store-archive', '/owned/image.oci'])
      .objectStoreArchive,
  ).toBe('/owned/image.oci');
  for (const request of [
    ['up', '--profile', 'app', '--worktree-root', '/owned'],
    ['down', '--profile', 'platform'],
    ['status', '--profile', 'platform'],
    ['up', '--profile', 'platform', '--worktree-root', '/owned'],
  ]) {
    expect(() =>
      parseK3dLabRequest([...request, '--object-store-archive', '/owned/image.oci']),
    ).toThrow();
    expect(() => parseK3dLabRequest(request)).not.toThrow();
  }
});

it('refuses a changed source length reported by the filesystem before retaining bytes', async () => {
  const fixture = await prepare();
  const source = `
    const fs = require('node:fs');
    const original = fs.fstatSync;
    fs.fstatSync = descriptor => {
      const status = original(descriptor);
      status.size -= 1;
      return status;
    };
    const { captureObjectStoreArchive } = await import(${JSON.stringify(join(import.meta.dir, 'object-store-archive.ts'))});
    await captureObjectStoreArchive(${JSON.stringify(fixture.source)}, ${JSON.stringify(fixture.directory)}, ${JSON.stringify(fixture.lock)});
  `;
  const execution = Bun.spawnSync([process.execPath, '-e', source]);
  expect(execution.exitCode).not.toBe(0);
  expect(new TextDecoder().decode(execution.stderr)).toContain('changed size while reading');
});

it('refuses a symlink source and never overwrites an existing retained capture', async () => {
  const fixture = await prepare();
  const link = join(fixture.directory, 'linked.oci');
  await symlink(fixture.source, link);
  await rejects(captureObjectStoreArchive(link, fixture.directory, fixture.lock), /ELOOP/);
  const archive = await captureObjectStoreArchive(fixture.source, fixture.directory, fixture.lock);
  await rejects(
    captureObjectStoreArchive(fixture.source, fixture.directory, fixture.lock),
    /EEXIST/,
  );
  expect(readObjectStoreArchive(archive).equals(fixture.bytes)).toBe(true);
});

it('Task21 direct strict bootstrap refuses a missing retained handoff before attempting a builder', async () => {
  const directory = await scratchAsync('object-store-no-fallback-');
  const docker = join(directory, 'docker');
  await writeFile(docker, `#!${process.execPath}\nprocess.exit(99);\n`, { mode: 0o700 });
  await dockerEnvironment.run(
    { ...process.env, PATH: directory, DOCKER_HOST: 'unix:///run/docker.sock' },
    async () => {
      await rejects(
        bootstrapLab(
          join(import.meta.dir, '../../..'),
          { k3d: 'k3d', kubectl: 'kubectl' },
          'owned',
          [],
          true,
        ),
        /retained archive/,
      );
    },
  );
});
