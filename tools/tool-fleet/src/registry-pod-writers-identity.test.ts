import { mkdir, mkdtemp, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { registryPodsUseStorage } from './registry-pod-writers';

function createPod(path: string) {
  return {
    metadata: { namespace: 'other' },
    spec: {
      nodeName: 'here',
      volumes: [{ name: 'host', hostPath: { path } }],
    },
  };
}

test('writer exclusion catches a host-root alias on a different device from the store', async () => {
  const storage = await realpath('/proc/self');
  const source = '/proc/self/root';
  const [stored, exposed, root] = await Promise.all([
    stat(storage, { bigint: true }),
    stat(source, { bigint: true }),
    stat('/', { bigint: true }),
  ]);
  expect(stored.dev).not.toBe(exposed.dev);
  expect([exposed.dev, exposed.ino]).toEqual([root.dev, root.ino]);
  expect(await registryPodsUseStorage([createPod(source)], [], [storage], 'here')).toBe(true);
});

test('writer exclusion catches sibling capacity consumers and descendant aliases', async () => {
  const directory = await mkdtemp('/tmp/task8-pod-identity-');
  try {
    const storage = join(directory, 'storage');
    const descendant = join(storage, 'child');
    const alias = join(directory, 'alias');
    const sibling = join(directory, 'sibling');
    await mkdir(descendant, { recursive: true });
    await mkdir(sibling);
    await symlink(descendant, alias);
    expect(await registryPodsUseStorage([createPod(sibling)], [], [storage], 'here')).toBe(true);
    expect(await registryPodsUseStorage([createPod(alias)], [], [storage], 'here')).toBe(true);
    expect(await registryPodsUseStorage([createPod('/proc/version')], [], [storage], 'here')).toBe(
      false,
    );
    expect(
      await registryPodsUseStorage(
        [createPod('/proc/version'), createPod(alias)],
        [],
        [storage],
        'here',
      ),
    ).toBe(true);
  } finally {
    await rm(directory, { recursive: true });
  }
});

test('writer exclusion refuses absent storage metadata and a file used as a store', async () => {
  const directory = await mkdtemp('/tmp/task8-pod-identity-');
  try {
    const absent = await registryPodsUseStorage(
      [createPod('/proc/version')],
      [],
      [join(directory, 'missing')],
      'here',
    ).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(absent).toMatchObject({ code: 'ENOENT' });
    const file = join(directory, 'file');
    await writeFile(file, 'not a store');
    const invalid = await registryPodsUseStorage(
      [createPod('/proc/version')],
      [],
      [file],
      'here',
    ).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(invalid).toBeInstanceOf(Error);
    expect(invalid).toMatchObject({ message: 'Registry pod writer scope is not a directory' });
  } finally {
    await rm(directory, { recursive: true });
  }
});

test('writer exclusion checks all enrolled store devices and conservatively retains registry PVCs', async () => {
  const directory = await mkdtemp('/tmp/task8-pod-identity-');
  try {
    const storage = await realpath('/proc/self');
    const second = join(directory, 'second');
    const source = join(directory, 'source');
    await mkdir(second);
    await mkdir(source);
    expect(await registryPodsUseStorage([createPod(source)], [], [storage, second], 'here')).toBe(
      true,
    );
    const claim = (namespace: string, claimName: string) => ({
      metadata: { namespace },
      spec: {
        nodeName: 'elsewhere',
        volumes: [{ name: 'store', persistentVolumeClaim: { claimName } }],
      },
    });
    expect(
      await registryPodsUseStorage(
        [claim('puni-registry', 'retained')],
        ['retained'],
        [storage],
        'here',
      ),
    ).toBe(true);
    expect(
      await registryPodsUseStorage([claim('other', 'retained')], ['retained'], [storage], 'here'),
    ).toBe(false);
    expect(
      await registryPodsUseStorage(
        [claim('puni-registry', 'other')],
        ['retained'],
        [storage],
        'here',
      ),
    ).toBe(false);
    expect(await registryPodsUseStorage([], [], [storage], 'here')).toBe(false);
    expect(
      await registryPodsUseStorage(
        [{ metadata: { namespace: 'other' }, spec: {} }],
        [],
        [storage],
        'here',
      ),
    ).toBe(false);
  } finally {
    await rm(directory, { recursive: true });
  }
});
