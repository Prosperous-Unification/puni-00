import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { observeRegistryClientMount, readRegistryClientMounts } from './registry-client-mounts';
import { requireRejection } from './registry-rejection.fixture';

// Synthetic mount records inject kernel-table faults; path lookup and descriptor mount IDs stay real.
test('client mount observation identifies the active root using its actual descriptor', async () => {
  const mounts = await readRegistryClientMounts();
  const roots = mounts.filter((mount) => mount.path === '/');
  const observed = await Promise.all(
    roots.map((mount) => observeRegistryClientMount(mount, mounts)),
  );
  expect(observed.filter((mount) => mount.state === 'visible')).toHaveLength(1);
});

test('client mount observation skips a missing path only when a different mount proves coverage', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'puni-client-mount-'));
  try {
    const mounts = await readRegistryClientMounts();
    const underlying = { id: '999999997', parentId: '999999996', path: '/', writable: true };
    const hidden = {
      id: '999999998',
      parentId: '999999997',
      path: join(directory, 'absent', 'mount'),
      writable: true,
    };
    const observed = await observeRegistryClientMount(hidden, [...mounts, underlying, hidden]);
    expect(observed.state).toBe('covered');
  } finally {
    await rm(directory, { recursive: true });
  }
});

test('client mount observation rejects an absent mountpoint within its own parent mount', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'puni-client-mount-'));
  try {
    const mounts = await readRegistryClientMounts();
    const visible = [];
    for (const mount of mounts.filter(
      (mount) =>
        directory === mount.path ||
        directory.startsWith(mount.path === '/' ? '/' : mount.path + '/'),
    )) {
      const observed = await observeRegistryClientMount(mount, mounts);
      if (observed.state === 'visible') visible.push(mount);
    }
    visible.sort((first, second) => second.path.length - first.path.length);
    const parent = visible.at(0);
    if (parent === undefined) throw new Error('Test directory has no active mount');
    const missing = {
      id: '999999998',
      parentId: parent.id,
      path: join(directory, 'absent', 'mount'),
      writable: true,
    };
    const refused = await requireRejection(
      observeRegistryClientMount(missing, [...mounts, missing]),
    );
    expect(refused.throwCause).toThrow('not covered');
  } finally {
    await rm(directory, { recursive: true });
  }
});

test('client mount observation refuses a descriptor identity absent from the supplied table', async () => {
  const mount = { id: '999999998', parentId: '999999997', path: '/', writable: true };
  const refused = await requireRejection(observeRegistryClientMount(mount, [mount]));
  expect(refused.throwCause).toThrow('descriptor identity');
});
