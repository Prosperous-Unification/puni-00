import { readFile } from 'node:fs/promises';

import { expect, test } from 'bun:test';

/** Extracted fixed fixture body; filesystem identity, counters and write results are modeled, not physical ENOSPC. */
for (const fault of [
  'none',
  'root',
  'pid',
  'selector',
  'path',
  'identity',
  'maximum',
  'parent-device',
  'journal-device',
  'root-device',
  'write-unknown',
  'write-nonerror',
  'zero-write',
  'overrun',
  'sync',
  'close',
  'write-close',
  'receipt',
  'installed-maximum',
  'parent-directory',
  'registry-directory',
  'file-type',
  'file-device',
  'file-uid',
  'file-gid',
  'file-links',
  'file-mode',
  'file-size',
  'fractional-write',
  'oversized-write',
  'initial-enospc',
  'terminal-inode',
  'terminal-size',
  'named-inode',
  'named-size',
  'existing',
  'open-access',
] as const) {
  test(`owned registry volume filler ${fault}`, async () => {
    const source = await readFile(
      new URL('./registry-volume-pressure.fixture.ts', import.meta.url),
      'utf8',
    );
    const start = source.indexOf('export async function fillRegistryFixtureVolume');
    const body = new Bun.Transpiler({ loader: 'ts' }).transformSync(
      source.slice(start).replace('export ', '') + '\nreturn fillRegistryFixtureVolume;',
    );
    const opened: string[] = [];
    let writes = 0,
      closed = 0,
      synced = 0,
      size = 0,
      observations = 0;
    const failure = new Error('private write fault');
    const closeFailure = new Error('private close fault');
    const nonError = { code: 'ENOSPC' };
    const existing = Object.assign(new Error('existing filler'), { code: 'EEXIST' });
    const access = Object.assign(new Error('denied filler'), { code: 'EACCES' });
    const shape = (dev: number) => ({
      dev,
      ino: 91,
      uid: 0,
      gid: 0,
      nlink: 1,
      mode: 0o100600,
      size,
      isFile: () => true,
      isDirectory: () => true,
    });
    const file = {
      stat: () => {
        observations++;
        return Promise.resolve({
          ...shape(fault === 'file-device' ? 99 : 10),
          ino: fault === 'terminal-inode' && observations > 1 ? 92 : 91,
          uid: fault === 'file-uid' ? 1 : 0,
          gid: fault === 'file-gid' ? 1 : 0,
          nlink: fault === 'file-links' ? 2 : 1,
          mode: fault === 'file-mode' ? 0o100644 : 0o100600,
          size:
            fault === 'file-size' && observations === 1
              ? 1
              : fault === 'terminal-size' && observations > 1
                ? size + 1
                : size,
          isFile: () => fault !== 'file-type',
        });
      },
      write: (bytes: Buffer) => {
        writes++;
        if (writes > 128) return Promise.reject(new Error('independent modeled allocation rescue'));
        if ((fault === 'write-unknown' || fault === 'write-close') && writes === 2)
          return Promise.reject(failure);
        if (fault === 'write-nonerror' && writes === 2)
          // Boundary: deliberate non-Error fault proves the fixture does not treat a code-shaped object as ENOSPC.
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          return Promise.reject(nonError);
        if (fault === 'fractional-write' && writes === 1)
          return Promise.resolve({ bytesWritten: 0.5 });
        if (fault === 'oversized-write' && writes === 1)
          return Promise.resolve({ bytesWritten: bytes.length + 1 });
        if (fault === 'initial-enospc')
          return Promise.reject(Object.assign(new Error('full'), { code: 'ENOSPC' }));
        if (fault === 'zero-write' && writes === 1) return Promise.resolve({ bytesWritten: 0 });
        if (fault !== 'overrun' && writes >= 3)
          return Promise.reject(Object.assign(new Error('full'), { code: 'ENOSPC' }));
        const bytesWritten = writes === 1 ? bytes.length : fault === 'overrun' ? bytes.length : 17;
        size += bytesWritten;
        return Promise.resolve({ bytesWritten });
      },
      sync: () => {
        synced++;
        return fault === 'sync' ? Promise.reject(failure) : Promise.resolve();
      },
      close: () => {
        closed++;
        return fault === 'close' || fault === 'write-close'
          ? Promise.reject(closeFailure)
          : Promise.resolve();
      },
    };
    // Boundary: extracted local fixture source with explicit modeled ports, never external code.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const compile = new Function(
      'process',
      'readFile',
      'lstat',
      'open',
      'constants',
      'measureVerifiedFilesystem',
      body,
    ) as (...ports: unknown[]) => (installed: unknown) => Promise<unknown>;
    const fill = compile(
      { getuid: () => (fault === 'root' ? 59001 : 0), pid: fault === 'pid' ? 12 : 1 },
      () =>
        Promise.resolve(
          fault === 'selector'
            ? 'unrelated'
            : '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-volume-full\0',
        ),
      (path: string) =>
        Promise.resolve({
          ...shape(
            path === '/'
              ? fault === 'root-device'
                ? 10
                : 30
              : path.includes('/journal/')
                ? fault === 'journal-device'
                  ? 10
                  : 20
                : path.endsWith('/registry') && fault === 'parent-device'
                  ? 40
                  : 10,
          ),
          ino: fault === 'named-inode' && path.endsWith('.fill') ? 92 : 91,
          size: fault === 'named-size' && path.endsWith('.fill') ? size + 1 : size,
          isDirectory: () =>
            !(fault === 'parent-directory' && path.endsWith('/registry')) &&
            !(fault === 'registry-directory' && path.endsWith('/registry/contents')),
        }),
      (path: string, flags: number, mode: number) => {
        opened.push(path);
        expect(mode).toBe(0o600);
        if (fault === 'open-access') return Promise.reject(access);
        if (fault === 'existing' && (flags & 4) !== 0) return Promise.reject(existing);
        return Promise.resolve(file);
      },
      { O_WRONLY: 1, O_CREAT: 2, O_EXCL: 4, O_NOFOLLOW: 8 },
      () =>
        Promise.resolve({
          identity: fault === 'identity' ? 'foreign' : 'owned',
          maximumBytes: fault === 'maximum' ? 129 * 1024 ** 2 : 128 * 1024 ** 2,
        }),
    );
    const pending = fill({
      ordinary: {
        path: fault === 'path' ? '/live' : '/var/lib/puni-registry/registry/contents',
        identityReceipt:
          fault === 'receipt'
            ? '/foreign'
            : '/var/lib/puni-registry/journal/identities/registry.receipt',
        storageId: 'owned',
        maximumBytes: fault === 'installed-maximum' ? 129 * 1024 ** 2 : 128 * 1024 ** 2,
      },
      journalPath: '/var/lib/puni-registry/journal/contents',
    });
    if (fault === 'none') {
      expect(await pending).toEqual({
        device: 10,
        inode: 91,
        bytes: 1024 * 1024 + 17,
        enospc: true,
        outsideContents: true,
      });
      expect(opened).toEqual(['/var/lib/puni-registry/registry/task8-full-volume.fill']);
      expect(writes).toBe(23);
      expect(synced).toBe(1);
      expect(closed).toBe(1);
    } else {
      let refused: unknown;
      try {
        await pending;
      } catch (cause) {
        refused = cause;
      }
      if (fault === 'write-nonerror') expect(refused).toBe(nonError);
      else expect(refused).toBeInstanceOf(Error);
      if (
        [
          'root',
          'pid',
          'selector',
          'path',
          'identity',
          'maximum',
          'parent-device',
          'journal-device',
          'root-device',
          'receipt',
          'installed-maximum',
          'parent-directory',
          'registry-directory',
        ].includes(fault)
      )
        expect(opened).toEqual([]);
      else if (fault === 'existing' || fault === 'open-access') {
        expect(closed).toBe(0);
        expect(writes).toBe(0);
        expect(refused).toBe(fault === 'existing' ? existing : access);
      } else expect(closed).toBe(1);
      if (
        [
          'file-type',
          'file-device',
          'file-uid',
          'file-gid',
          'file-links',
          'file-mode',
          'file-size',
        ].includes(fault)
      )
        expect(writes).toBe(0);
      if (fault === 'write-unknown' || fault === 'sync') expect(refused).toBe(failure);
      if (fault === 'close') expect(refused).toBe(closeFailure);
      if (fault === 'write-close') {
        expect(refused).toBeInstanceOf(AggregateError);
        expect((refused as AggregateError).errors).toEqual([failure, closeFailure]);
      }
      if (fault === 'overrun') expect(writes).toBe(128);
    }
  });
}
