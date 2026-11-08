import { ok } from 'node:assert/strict';
import { chmod, lstat, mkdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import {
  captureEdgeRecord,
  captureSolverRestorationCompletion,
  type EdgeRecordSnapshot,
} from './edge-policy';

async function readFailure(operation: Promise<unknown>) {
  const failure: unknown = await operation.then(
    () => undefined,
    (cause: unknown) => cause,
  );
  ok(failure instanceof Error, 'completion reader must refuse');
  return failure;
}

async function writeCompletion(
  directory: string,
  name: string,
  contents = 'retained completion bytes\n',
) {
  const path = join(directory, name);
  await writeFile(path, contents, { mode: 0o600 });
  const named = await lstat(path, { bigint: true });
  const parent = await lstat(directory, { bigint: true });
  return {
    path,
    contents,
    device: String(named.dev),
    inode: String(named.ino),
    parentDevice: String(parent.dev),
    parentInode: String(parent.ino),
    mode: 0o600,
  } satisfies EdgeRecordSnapshot;
}

test('completion reader captures actual files at six and twelve digit boundaries', async () => {
  const directory = scratchSync('solver-completion-positive-');
  for (const name of [
    'edge-owner-000001-solver-restore-complete.json',
    'edge-owner-123456789012-solver-restore-complete.json',
  ]) {
    const expected = await writeCompletion(directory, name);
    expect(await captureSolverRestorationCompletion(directory, name)).toEqual(expected);
  }
});

test('completion reader does not broaden the legacy record family', async () => {
  const directory = scratchSync('solver-completion-legacy-');
  const name = 'edge-owner-000001-solver-restore-complete.json';
  await writeCompletion(directory, name);
  await readFailure(captureEdgeRecord(directory, name, 65536));
});

test('completion reader refuses readable wrong families and malformed names', async () => {
  const directory = scratchSync('solver-completion-closed-');
  for (const name of [
    'edge-owner-000001-solver-restore-intent.json',
    'edge-owner-000001-activation-participant-ready.json',
    'edge-owner-000001-intent.json',
    'dependency-backend-fence.json',
    'edge-owner-00001-solver-restore-complete.json',
    'edge-owner-1234567890123-solver-restore-complete.json',
    'edge-owner-000001-solver-restore-complete.json.extra',
  ]) {
    await writeCompletion(directory, name);
    await readFailure(captureSolverRestorationCompletion(directory, name));
  }
});

test('completion reader refuses an actual readable traversal sibling', async () => {
  const parent = scratchSync('solver-completion-parent-');
  const directory = join(parent, 'state');
  await mkdir(directory, { mode: 0o700 });
  const name = 'edge-owner-000001-solver-restore-complete.json';
  await writeCompletion(parent, name);
  await readFailure(captureSolverRestorationCompletion(directory, '../' + name));
});

for (const fault of [
  'absent',
  'unreadable',
  'public-mode',
  'oversized',
  'symlink',
  'empty',
  'invalid-utf8',
])
  test(`completion reader refuses ${fault} through the real bounded file path`, async () => {
    const directory = scratchSync('solver-completion-file-');
    const name = 'edge-owner-000001-solver-restore-complete.json';
    const path = join(directory, name);
    if (fault === 'symlink') {
      const target = join(directory, 'private-target');
      await writeFile(target, 'retained target\n', { mode: 0o600 });
      await symlink(target, path);
    } else if (fault !== 'absent') {
      const bytes =
        fault === 'oversized'
          ? 'x'.repeat(65537)
          : fault === 'empty'
            ? ''
            : fault === 'invalid-utf8'
              ? new Uint8Array([0xff])
              : 'retained bytes\n';
      await writeFile(path, bytes, { mode: 0o600 });
    }
    if (fault === 'unreadable') await chmod(path, 0);
    if (fault === 'public-mode') await chmod(path, 0o644);
    try {
      await readFailure(captureSolverRestorationCompletion(directory, name));
    } finally {
      if (fault === 'unreadable') await chmod(path, 0o600);
    }
  });
