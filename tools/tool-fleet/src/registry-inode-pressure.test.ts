import { constants } from 'node:fs';

import { expect, test } from 'bun:test';

import * as pressure from './registry-inode-pressure.fixture';
import { observeRegistryInodePressure } from './registry-inode-pressure-observation.fixture';

test('inode filler consumes independent inode capacity while bytes remain free', async () => {
  const observed = await observeRegistryInodePressure({ fault: 'none' });
  expect(observed.state).toBe('fulfilled');
  expect(observed.receipt).toEqual({
    device: 10,
    inode: 91,
    directorySize: 4096,
    files: 4,
    totalInodes: 8,
    availableBytes: 64 * 1024 ** 2,
    enospc: true,
    outsideContents: true,
  });
  expect(observed.opens).toBe(5);
  expect(observed.closes).toBe(4);
  expect(observed.measured).toBe(2);
  expect(observed.commands).toEqual([
    {
      action: 'mkdir',
      path: '/var/lib/puni-registry/registry/task8-full-volume.fill',
      options: { mode: 0o700 },
    },
    ...Array.from({ length: 5 }, (_, index) => ({
      action: 'open',
      path:
        '/var/lib/puni-registry/registry/task8-full-volume.fill/' + String(index).padStart(5, '0'),
      flags: constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      mode: 0o600,
    })),
  ]);
});
for (const [fault, category, opens, closes] of [
  ['uid', 'topology', 0, 0],
  ['pid', 'topology', 0, 0],
  ['selector', 'topology', 0, 0],
  ['path', 'installation', 0, 0],
  ['receipt', 'installation', 0, 0],
  ['maximum', 'installation', 0, 0],
  ['identity', 'measurement', 0, 0],
  ['measured-maximum', 'measurement', 0, 0],
  ['zero-inodes', 'measurement', 0, 0],
  ['excess-inodes', 'measurement', 0, 0],
  ['preexisting-full', 'measurement', 0, 0],
  ['parent-kind', 'separation', 0, 0],
  ['registry-kind', 'separation', 0, 0],
  ['parent-device', 'separation', 0, 0],
  ['journal-device', 'separation', 0, 0],
  ['root-device', 'separation', 0, 0],
  ['directory-kind', 'directory', 0, 0],
  ['directory-owner', 'directory', 0, 0],
  ['directory-group', 'directory', 0, 0],
  ['directory-mode', 'directory', 0, 0],
  ['directory-device', 'directory', 0, 0],
  ['directory-links', 'directory', 0, 0],
  ['file-kind', 'file', 1, 1],
  ['file-device', 'file', 1, 1],
  ['file-owner', 'file', 1, 1],
  ['file-group', 'file', 1, 1],
  ['file-links', 'file', 1, 1],
  ['file-mode', 'file', 1, 1],
  ['file-size', 'file', 1, 1],
  ['no-exhaustion', 'exhaustion', 8, 8],
  ['zero-created', 'exhaustion', 1, 0],
  ['terminal-identity', 'terminal', 5, 4],
  ['terminal-maximum', 'terminal', 5, 4],
  ['terminal-total', 'terminal', 5, 4],
  ['terminal-inodes', 'terminal', 5, 4],
  ['terminal-free-bytes', 'terminal', 5, 4],
  ['terminal-directory', 'directory-changed', 5, 4],
] as const)
  test('inode filler refuses ' + fault, async () => {
    const observed = await observeRegistryInodePressure({ fault });
    expect(observed.state).toBe('rejected');
    expect(observed.category).toBe(category);
    expect(observed.opens).toBe(opens);
    expect(observed.closes).toBe(closes);
    expect(observed.receipt).toBeNull();
  });
for (const [fault, closed] of [
  ['mkdir', 0],
  ['open-error', 4],
  ['open-opaque', 4],
  ['open-hidden-code', 4],
  ['open-existing', 0],
  ['open-access', 0],
] as const)
  test('inode filler preserves exact allocation failure ' + fault, async () => {
    const observed = await observeRegistryInodePressure({ fault });
    expect(observed.state).toBe('rejected');
    expect(observed.isPrimary).toBe(true);
    expect(observed.closes).toBe(closed);
  });
test('inode filler refuses required descriptor close failure', async () => {
  const observed = await observeRegistryInodePressure({ fault: 'close' });
  expect(observed.state).toBe('rejected');
  expect(observed.isClose).toBe(true);
  expect(observed.closes).toBe(1);
});
test('inode filler retains failed metadata and close causes', async () => {
  const observed = await observeRegistryInodePressure({ fault: 'file-close' });
  expect(observed.state).toBe('rejected');
  expect(observed.isAggregate).toBe(true);
  expect(observed.hasCloseMember).toBe(true);
  expect(observed.hasFirstCause).toBe(true);
  expect(observed.closes).toBe(1);
});

test('inode filler awaits each close before another allocation or receipt', async () => {
  const observed = await observeRegistryInodePressure({ fault: 'held-close' });
  expect(observed.state).toBe('fulfilled');
  expect(observed.settledBeforeClose).toBe(false);
  expect(observed.openedBeforeClose).toBe(1);
  expect(observed.closes).toBe(4);
});

test('inode filler verifies all retained files after later operations', async () => {
  const observed = await observeRegistryInodePressure({ fault: 'verify' });
  expect(observed.state).toBe('fulfilled');
  expect(observed.verified).toBe(true);
  expect(observed.measured).toBe(3);
  expect(observed.opens).toBe(5);
});
for (const [fault, category] of [
  ['verify-free-inode', 'terminal'],
  ['verify-bytes', 'terminal'],
  ['verify-missing', 'census'],
  ['verify-extra', 'census'],
  ['verify-name', 'census'],
  ['verify-swap', 'file-replaced'],
  ['verify-metadata', 'file'],
  ['verify-directory', 'directory-changed'],
] as const)
  test('inode filler retained proof refuses ' + fault, async () => {
    const observed = await observeRegistryInodePressure({ fault });
    expect(observed.state).toBe('rejected');
    expect(observed.verified).toBe(false);
    expect(observed.category).toBe(category);
    expect(observed.opens).toBe(5);
  });
test('inode filler retained proof preserves unreadable file failure', async () => {
  const observed = await observeRegistryInodePressure({ fault: 'verify-read' });
  expect(observed.state).toBe('rejected');
  expect(observed.isPrimary).toBe(true);
  expect(observed.verified).toBe(false);
});

for (const allocation of ['bytes', 'inodes'] as const)
  test('pressure allocation parser accepts ' + allocation, () => {
    expect(pressure.parseRegistryPressureAllocation(allocation)).toBe(allocation);
  });
for (const allocation of [undefined, null, false, '', 'unknown', 'inodes\n', {}, ['bytes']])
  test('pressure allocation parser refuses ' + JSON.stringify(allocation), () => {
    expect(() => pressure.parseRegistryPressureAllocation(allocation)).toThrow();
  });
