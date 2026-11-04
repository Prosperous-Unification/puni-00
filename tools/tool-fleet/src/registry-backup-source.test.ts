import { chmod, link, mkdir, open, rename, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { dlopen, ptr } from 'bun:ffi';
import { expect, test } from 'bun:test';

import { observeRegistryBackupSource } from './registry-backup-source';
import { openBackupSourceFixture } from './registry-backup-source.fixture';
import { requireRejection } from './registry-rejection.fixture';

async function observe(fixture: Awaited<ReturnType<typeof openBackupSourceFixture>>) {
  return observeRegistryBackupSource(
    fixture.source,
    fixture.limits,
    fixture.authority,
    new AbortController().signal,
  );
}

test('observes empty roots and every hardlink path, raw filename and symlink target without following it', async () => {
  const fixture = await openBackupSourceFixture();
  try {
    const empty = await observe(fixture);
    expect(empty.registry.paths).toBe(1);
    expect(empty.registry.regularFiles).toBe(0);
    const raw = Buffer.concat([Buffer.from(fixture.source.registryPath + '/'), Buffer.from([255])]);
    await writeFile(raw, 'abc');
    await link(raw, join(fixture.source.registryPath, 'hardlink'));
    await symlink(Buffer.from([255]), join(fixture.source.registryPath, 'link'));
    const captured = await observe(fixture);
    expect(captured.xattrScope).toBe('caller-visible-only');
    expect(captured.registry).toMatchObject({
      paths: 4,
      directories: 1,
      regularFiles: 2,
      nonemptyFiles: 2,
      logicalBytes: 6,
      freshChunkReferences: 2,
      symlinks: 1,
      symlinkTargetBytes: 1,
      maximumFileLength: 3,
      maximumDepth: 1,
      maximumFanout: 3,
      maximumFilenameLength: 8,
      maximumSymlinkTargetLength: 1,
    });
    expect(captured.sha256).not.toBe(empty.sha256);
    const uid = process.getuid?.();
    const gid = process.getgid?.();
    if (uid === undefined || gid === undefined)
      throw new Error('Missing ordinary Unix owner identity');
    expect(captured.registry.uids).toEqual([uid]);
    expect(captured.registry.gids).toEqual([gid]);
    expect((await observe(fixture)).sha256).toBe(captured.sha256);
  } finally {
    await fixture.close();
  }
});
for (const fault of [
  'logical',
  'entries',
  'metadata',
  'depth',
  'fanout',
  'absent',
  'cancelled',
  'revision',
  'alias',
  'fifo',
] as const) {
  test('source refuses ' + fault + ' before issuing an observation', async () => {
    const fixture = await openBackupSourceFixture();
    const controller = new AbortController();
    try {
      if (fault === 'logical') {
        const sparse = await open(join(fixture.source.registryPath, 'sparse'), 'wx');
        try {
          await sparse.truncate(1024 ** 2 + 1);
        } finally {
          await sparse.close();
        }
      }
      if (fault === 'entries') fixture.limits.registry.maximumEntries = 1;
      if (fault === 'metadata') fixture.limits.registry.maximumMetadataBytes = 1;
      if (fault === 'depth') fixture.limits.registry.maximumDepth = 1;
      if (fault === 'fanout') fixture.limits.registry.maximumFanout = 1;
      if (['entries', 'depth', 'fanout'].includes(fault)) {
        await mkdir(join(fixture.source.registryPath, 'nested'));
        await writeFile(join(fixture.source.registryPath, 'nested/file'), '');
        await writeFile(join(fixture.source.registryPath, 'empty'), '');
      }
      if (fault === 'absent')
        await rename(fixture.source.registryPath, fixture.source.registryPath + '-moved');
      if (fault === 'cancelled') controller.abort(new Error('controlled cancellation'));
      if (fault === 'revision')
        await writeFile(join(fixture.source.journalPath, 'journal.json'), '{"revision":8}');
      if (fault === 'alias') {
        await rename(fixture.source.registryPath, fixture.source.registryPath + '-moved');
        await symlink(fixture.source.registryPath + '-moved', fixture.source.registryPath);
      }
      if (fault === 'fifo') {
        const child = Bun.spawn(['/usr/bin/mkfifo', join(fixture.source.registryPath, 'fifo')], {
          stdout: 'ignore',
          stderr: 'pipe',
        });
        expect(await child.exited).toBe(0);
        expect(await new Response(child.stderr).text()).toBe('');
      }
      await requireRejection(
        observeRegistryBackupSource(
          fixture.source,
          fixture.limits,
          fixture.authority,
          controller.signal,
        ),
      );
    } finally {
      await fixture.close();
    }
  });
}

test('observes every raw Linux xattr name/value including empty values and binds same-length value changes', async () => {
  const fixture = await openBackupSourceFixture();
  const native = dlopen('libc.so.6', {
    setxattr: { args: ['ptr', 'ptr', 'ptr', 'usize', 'i32'], returns: 'i32' },
  });
  try {
    const path = join(fixture.source.registryPath, 'blob');
    await writeFile(path, 'a');
    const cpath = Buffer.from(path + '\0');
    const first = Buffer.from('user.a\0');
    const raw = Buffer.concat([Buffer.from('user.'), Buffer.from([255, 0])]);
    const value = Buffer.from([0, 255, 1]);
    expect(native.symbols.setxattr(ptr(cpath), ptr(first), ptr(value), 3, 0)).toBe(0);
    expect(native.symbols.setxattr(ptr(cpath), ptr(raw), ptr(value), 0, 0)).toBe(0);
    const captured = await observe(fixture);
    expect(captured.registry).toMatchObject({
      xattrs: 2,
      xattrNameBytes: 12,
      xattrValueBytes: 3,
      maximumEntryXattrs: 2,
      maximumXattrNameLength: 6,
      maximumXattrValueLength: 3,
      maximumEntryXattrBytes: 15,
    });
    expect((await observe(fixture)).sha256).toBe(captured.sha256);
    value[2] = 2;
    expect(native.symbols.setxattr(ptr(cpath), ptr(first), ptr(value), 3, 0)).toBe(0);
    expect((await observe(fixture)).sha256).not.toBe(captured.sha256);
  } finally {
    native.close();
    await fixture.close();
  }
});

for (const fault of [
  'xattr-list-error',
  'xattr-read-cleanup',
  'xattr-list-oversize',
  'xattr-list-change',
  'xattr-value-error',
  'xattr-value-oversize',
  'xattr-value-change',
  'cross-device',
  'unsafe-size',
  'file-stat-change',
  'authority-bookend',
  'stat-absent-time',
  'stat-null-time',
  'stat-malformed-owner',
  'stat-excess-inode',
  'stat-excess-time',
  'raw-name',
  'read-error',
  'read-cleanup',
  'cancel-during-read',
]) {
  test(
    'production source observer refuses controlled ' +
      fault +
      ' dependency fault and awaits cleanup',
    async () => {
      const child = Bun.spawn(
        [process.execPath, import.meta.dir + '/registry-backup-source.fixture.ts', fault],
        { stdout: 'pipe', stderr: 'pipe' },
      );
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect(code).toBe(0);
      expect(stderr).toBe('');
      const observed = JSON.parse(stdout) as {
        refused: boolean;
        closed: number;
        aggregate: boolean;
      };
      expect(observed.refused).toBe(true);
      expect(observed.closed).toBeGreaterThan(0);
      if (fault === 'read-cleanup' || fault === 'xattr-read-cleanup')
        expect(observed.aggregate).toBe(true);
    },
  );
}

test('source distinguishes an unreadable canonical root from an absent root', async () => {
  const fixture = await openBackupSourceFixture();
  try {
    await chmod(fixture.source.registryPath, 0);
    const refused = await requireRejection(observe(fixture));
    expect(refused.cause).toMatchObject({ code: 'EACCES' });
  } finally {
    await chmod(fixture.source.registryPath, 0o700);
    await fixture.close();
  }
});
