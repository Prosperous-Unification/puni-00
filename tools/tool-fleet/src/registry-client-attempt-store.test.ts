import { chmod, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { openRegistryClientAttemptStore } from './registry-client-attempt-store';
import { requireRejection } from './registry-rejection.fixture';

test('client attempt store refuses invoking-user ownership before allocating a record', async () => {
  const pool = await scratchAsync('client-attempt-user-');
  await chmod(pool, 0o711);
  expect((await requireRejection(openRegistryClientAttemptStore(pool))).throwCause).toThrow(
    'root-owned client attempt',
  );
});
test('real root namespace persists one client owner and recovers only its dead scope and safe workspaces', async () => {
  const parent = await scratchAsync('client-attempt-native-');
  const child = Bun.spawn(
    [
      '/usr/bin/unshare',
      '--user',
      '--map-root-user',
      '--fork',
      process.execPath,
      join(import.meta.dir, 'registry-client-attempt-store.fixture.ts'),
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
      'changed-pool-mode-refused',
      'foreign-publication-device-refused',
      'foreign-publication-inode-refused',
      'foreign-publication-unit-refused',
      'durable-single-owner',
      'no-overwrite',
      'live-scope-preserved',
      'wrong-owner-preserved',
      'unresolved-success-refused',
      'interrupted-job-recovered',
      'unknown-entry-preserved',
      'symlink-job-preserved',
      'malformed-record-refused',
      'foreign-record-device-refused',
      'foreign-record-inode-refused',
      'foreign-record-unit-refused',
      'oversized-record-refused',
      'symlink-record-refused',
      'public-readable-record-refused',
      'unreadable-record-refused',
      'hardlinked-record-refused',
      'orphan-without-record-refused',
      'anonymous-prepublication-reclaimed',
      'publish-before-launch-and-terminal-cleanup',
      'metadata-refusal-precedes-record-and-worker',
      'failed-client-reaps-recorded-workspaces',
      'uncertain-scope-retains-owner-and-both-causes',
      'foreign-operation-cannot-adopt-pending-scope',
      'retry-reconciles-old-owner-before-fresh-nonce',
    ],
    closed: true,
  });
  expect(await readFile(join(parent, 'external', 'keep'), 'utf8')).toBe('preserved');
});
