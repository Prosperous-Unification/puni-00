import { mkdtemp, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { withAuthorityFiles } from './installed-authority-files';

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true });
});
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'authority-files-'));
  directories.push(directory);
  const path = join(directory, 'writer');
  await writeFile(path, 'expected');
  return { directory, path };
}
test('retains anchored installed file identities around a fresh observation', async () => {
  const { path } = await fixture();
  let called = false;
  await withAuthorityFiles([path], async (files, recheck) => {
    called = true;
    expect(files[0]?.sha256).toBe(new Bun.CryptoHasher('sha256').update('expected').digest('hex'));
    await recheck();
  });
  expect(called).toBe(true);
});
test.each(['bytes', 'inode', 'parent', 'symlink'] as const)(
  'refuses same-file or parent %s drift',
  async (fault) => {
    const { directory, path } = await fixture();
    expect(
      withAuthorityFiles([path], async (_files, recheck) => {
        if (fault === 'bytes') await writeFile(path, 'changed');
        if (fault === 'inode') {
          await rename(path, path + '.old');
          await writeFile(path, 'expected');
        }
        if (fault === 'parent') {
          await rename(directory, directory + '.old');
          directories.push(directory + '.old');
          await import('node:fs/promises').then(({ mkdir }) => mkdir(directory));
          await writeFile(path, 'expected');
        }
        if (fault === 'symlink') {
          await rename(path, path + '.old');
          await symlink(path + '.old', path);
        }
        await recheck();
      }),
    ).rejects.toThrow();
  },
);
test('refuses absent and hardlinked installed files', async () => {
  const { path } = await fixture();
  expect(
    withAuthorityFiles([path + '.missing'], () => Promise.resolve(undefined)),
  ).rejects.toThrow();
  await import('node:fs/promises').then(({ link }) => link(path, path + '.alias'));
  expect(
    withAuthorityFiles([path, path + '.alias'], () => Promise.resolve(undefined)),
  ).rejects.toThrow('alias');
});

test('refuses unreadable installed files separately from absence', async () => {
  const { path } = await fixture();
  const { chmod } = await import('node:fs/promises');
  await chmod(path, 0);
  try {
    expect(withAuthorityFiles([path], () => Promise.resolve(undefined))).rejects.toThrow('EACCES');
  } finally {
    await chmod(path, 0o600);
  }
});

test('retained parent identity detects a same-inode leaf through a replaced parent', async () => {
  const { directory, path } = await fixture();
  const { mkdir, link } = await import('node:fs/promises');
  await mkdir(directory + '.next');
  directories.push(directory + '.next');
  await link(path, join(directory + '.next', 'writer'));
  expect(
    withAuthorityFiles([path], async (_files, recheck) => {
      await rename(directory, directory + '.old');
      directories.push(directory + '.old');
      await rename(directory + '.next', directory);
      directories.splice(directories.indexOf(directory + '.next'), 1);
      await recheck();
    }),
  ).rejects.toThrow('parent changed');
});
