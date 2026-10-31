import { rejects } from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

for (const boundary of ['open', 'locked'] as const) {
  test(`replaced inode at real ${boundary} boundary preserves both retained files before holder writes`, async () => {
    const directory = scratchSync('canonical-lock-');
    const lock = `${directory}/edge.lock`;
    const retained = `${directory}/retained.lock`;
    await writeFile(lock, 'original retained evidence');
    const program = `
    import * as filesystem from 'node:fs';
    import { mock } from 'bun:test';
    const openFile = filesystem.openSync;
    const renameFile = filesystem.renameSync;
    const writeFile = filesystem.writeFileSync;
    const inspectFile = filesystem.lstatSync;
    let inspections = 0;
    mock.module('node:fs', () => ({ ...filesystem, openSync: (path, flags, mode) => {
      const descriptor = openFile(path, flags, mode);
      if (path === ${JSON.stringify(lock)} && ${JSON.stringify(boundary)} === 'open') {
        renameFile(path, ${JSON.stringify(retained)});
        writeFile(path, 'replacement retained evidence');
      }
      return descriptor;
    }, lstatSync: (path, ...options) => {
      if (path === ${JSON.stringify(lock)} && ++inspections === 2 && ${JSON.stringify(boundary)} === 'locked') {
        renameFile(path, ${JSON.stringify(retained)});
        writeFile(path, 'replacement retained evidence');
      }
      return inspectFile(path, ...options);
    }}));
    const { withCanonicalLock } = await import(${JSON.stringify(`${import.meta.dir}/lock.ts`)});
    try {
      await withCanonicalLock(${JSON.stringify(lock)}, () => Promise.resolve());
      process.exitCode = 2;
    } catch (cause) {
      if (!(cause instanceof Error) || !cause.message.includes('canonical lock')) throw cause;
    }
  `;
    const child = Bun.spawn([process.execPath, '-e', program], { stdout: 'pipe', stderr: 'pipe' });
    const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
    expect(stderr).toBe('');
    expect(code).toBe(0);
    expect(await readFile(retained, 'utf8')).toBe('original retained evidence');
    expect(await readFile(lock, 'utf8')).toBe('replacement retained evidence');
  });
}

test('strict lock rejects symlink at kernel open before record validation', async () => {
  const { symlink } = await import('node:fs/promises');
  const { withCanonicalLock } = await import('./lock');
  const directory = scratchSync('canonical-nofollow-');
  const target = `${directory}/foreign`;
  const lock = `${directory}/edge.lock`;
  await writeFile(target, 'retained evidence');
  await symlink(target, lock);
  let refusal: unknown;
  try {
    await withCanonicalLock(lock, () => Promise.resolve());
  } catch (cause) {
    refusal = cause;
  }
  if (!(refusal instanceof Error) || !(refusal.cause instanceof Error))
    throw new Error('kernel open refusal missing');
  expect('code' in refusal.cause ? refusal.cause.code : undefined).toBe('ELOOP');
  expect(await readFile(target, 'utf8')).toBe('retained evidence');
});

test('existing-only canonical acquisition never creates an absent lock and never rewrites retained bytes', async () => {
  const directory = scratchSync('existing-canonical-lock-');
  const path = `${directory}/edge.lock`;
  const { withExistingCanonicalLock } = await import('./lock');
  await rejects(withExistingCanonicalLock(path, () => Promise.resolve(undefined)));
  expect(await Bun.file(path).exists()).toBe(false);
  await writeFile(path, 'retained original holder record');
  await withExistingCanonicalLock(path, async () => {
    expect(await readFile(path, 'utf8')).toBe('retained original holder record');
    const contender = Bun.spawn(['flock', '-n', path, 'true'], { stdout: 'pipe', stderr: 'pipe' });
    const [code] = await Promise.all([
      contender.exited,
      new Response(contender.stdout).text(),
      new Response(contender.stderr).text(),
    ]);
    expect(code).toBe(1);
  });
  expect(await readFile(path, 'utf8')).toBe('retained original holder record');
});
