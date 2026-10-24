import { link, lstat, mkdir, rename, rm, writeFile } from 'node:fs/promises';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { retainActivationDatabase } from './dependency-activation-storage';

async function database() {
  const root = scratchSync('activation-storage-');
  const host = `${root}/store.sqlite`;
  await writeFile(host, 'existing main');
  const parent = await lstat(root, { bigint: true });
  const main = await lstat(host, { bigint: true });
  return {
    path: '/data/store.sqlite',
    host,
    directoryIdentity: `${String(parent.dev)}:${String(parent.ino)}`,
    fileIdentity: `${String(main.dev)}:${String(main.ino)}`,
  };
}
test('retained database boundary refuses main replacement between census and next storage call', async () => {
  const binding = await database();
  const anchored = retainActivationDatabase(binding);
  try {
    anchored.inspect();
    await rename(binding.host, binding.host + '.original');
    await writeFile(binding.host, 'existing main');
    expect(() => {
      anchored.inspect();
    }).toThrow();
  } finally {
    anchored.close();
  }
});
test('retained database boundary refuses parent replacement despite same main inode', async () => {
  const binding = await database();
  const anchored = retainActivationDatabase(binding);
  const parent = binding.host.slice(0, binding.host.lastIndexOf('/'));
  try {
    await rename(parent, parent + '.moved');
    await mkdir(parent);
    await link(parent + '.moved/store.sqlite', binding.host);
    expect(() => {
      anchored.inspect();
    }).toThrow();
  } finally {
    anchored.close();
    await rm(parent, { recursive: true });
    await rename(parent + '.moved', parent);
  }
});
