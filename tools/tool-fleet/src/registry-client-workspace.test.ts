import { chmod, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { createRegistryClientWorkspace } from './registry-client-workspace';
import { requireRejection } from './registry-rejection.fixture';

test('client workspace refuses a client-owned pool before creating entries', async () => {
  const directory = await scratchAsync('client-pool-owner-');
  await chmod(directory, 0o711);
  const refused = await requireRejection(createRegistryClientWorkspace(directory));
  expect(refused.throwCause).toThrow('root-owned client pool');
  expect(await readdir(directory)).toEqual([]);
});

test('real root user namespace owns anchored client workspace lifecycle and refuses filesystem faults', async () => {
  const parent = await scratchAsync('client-pool-native-');
  const sentinel = join(parent, 'external');
  await mkdir(sentinel, { mode: 0o700 });
  await writeFile(join(sentinel, 'keep'), 'preserved', { mode: 0o600 });
  const child = Bun.spawn(
    [
      '/usr/bin/unshare',
      '--user',
      '--map-root-user',
      '--fork',
      process.execPath,
      join(import.meta.dir, 'registry-client-workspace.fixture.ts'),
      parent,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect({ code, stderr }).toEqual({ code: 0, stderr: '' });
  expect(JSON.parse(stdout)).toEqual({
    cases: [
      'fresh-owned-workspace',
      'wrong-pool-mode',
      'symlink-pool',
      'symlink-child-preserves-external',
      'hardlink-child-refuses',
      'special-file-refuses',
      'ordinary-nested-cleanup',
      'renamed-pool-path-preserves-setup-and-cleanup',
    ],
    closed: true,
  });
  expect(await readFile(join(sentinel, 'keep'), 'utf8')).toBe('preserved');
});
