import { readFile } from 'node:fs/promises';

import { expect, test } from 'bun:test';

/** Actual filler body with a modeled residual allocator: a large write can fail while smaller writes still fit. Native HOST62 independently observed that physical distinction. */
for (const fault of [
  'residual',
  'partial',
  'tail-unknown',
  'tail-nonerror',
  'oversized-tail',
  'attempt-limit',
  'byte-limit',
] as const)
  test('volume filler consumes residual allocation ' + fault, async () => {
    const source = await readFile(
      new URL('./registry-volume-pressure.fixture.ts', import.meta.url),
      'utf8',
    );
    const body = new Bun.Transpiler({ loader: 'ts' }).transformSync(
      source
        .slice(source.indexOf('export async function fillRegistryFixtureVolume'))
        .replace('export ', '') + ';return fillRegistryFixtureVolume;',
    );
    const maximum = 128 * 1024 ** 2;
    const initial = 1024 ** 2 + 4096 + 111;
    let available = fault === 'attempt-limit' || fault === 'byte-limit' ? maximum * 2 : initial;
    let written = 0;
    let attempts = 0;
    let closed = 0;
    let synced = 0;
    const failure = new Error('private tail allocation failure');
    const nonError = { code: 'ENOSPC' };
    const exhausted = Object.assign(new Error('full'), { code: 'ENOSPC' });
    const metadata = (dev: number) => ({
      dev,
      ino: 91,
      uid: 0,
      gid: 0,
      nlink: 1,
      mode: 0o100600,
      size: written,
      isFile: () => true,
      isDirectory: () => true,
    });
    const file = {
      stat: () => Promise.resolve(metadata(10)),
      write(bytes: Buffer) {
        attempts++;
        if (attempts > 256) return Promise.reject(new Error('independent 257th write rescue'));
        if (bytes.length < 1024 ** 2 && fault === 'tail-unknown') return Promise.reject(failure);
        if (bytes.length < 1024 ** 2 && fault === 'tail-nonerror')
          // Boundary: deliberate non-Error ENOSPC shape must not become an allocation witness.
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          return Promise.reject(nonError);
        if (fault !== 'partial' && bytes.length > available) return Promise.reject(exhausted);
        if (available <= 0) return Promise.reject(exhausted);
        const consumed =
          fault === 'attempt-limit'
            ? 1
            : fault === 'partial'
              ? Math.min(bytes.length, available)
              : fault === 'oversized-tail' && bytes.length < 1024 ** 2
                ? bytes.length + 1
                : bytes.length;
        written += consumed;
        available -= consumed;
        return Promise.resolve({ bytesWritten: consumed });
      },
      sync() {
        synced++;
        return Promise.resolve();
      },
      close() {
        closed++;
        return Promise.resolve();
      },
    };
    // Boundary: extracted owned fixture body, real algorithm, modeled filesystem/admission ports.
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
      { getuid: () => 0, pid: 1 },
      () =>
        Promise.resolve(
          '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-volume-full\0',
        ),
      (path: string) =>
        Promise.resolve(metadata(path === '/' ? 30 : path.includes('/journal/') ? 20 : 10)),
      () => Promise.resolve(file),
      { O_WRONLY: 1, O_CREAT: 2, O_EXCL: 4, O_NOFOLLOW: 8 },
      () => Promise.resolve({ identity: 'owned', maximumBytes: maximum }),
    );
    let receipt: unknown;
    let refused: unknown;
    try {
      receipt = await fill({
        ordinary: {
          path: '/var/lib/puni-registry/registry/contents',
          identityReceipt: '/var/lib/puni-registry/journal/identities/registry.receipt',
          storageId: 'owned',
          maximumBytes: maximum,
        },
        journalPath: '/var/lib/puni-registry/journal/contents',
      });
    } catch (cause) {
      refused = cause;
    }
    expect(closed).toBe(1);
    if (fault === 'residual' || fault === 'partial') {
      expect(refused).toBeUndefined();
      expect(available).toBe(0);
      expect(synced).toBe(1);
      expect(receipt).toEqual({
        device: 10,
        inode: 91,
        bytes: initial,
        enospc: true,
        outsideContents: true,
      });
      expect(attempts).toBeLessThan(256);
    } else {
      expect(receipt).toBeUndefined();
      expect(synced).toBe(0);
      if (fault === 'tail-unknown') expect(refused).toBe(failure);
      else if (fault === 'tail-nonerror') expect(refused).toBe(nonError);
      else expect(refused).toBeInstanceOf(Error);
      if (fault === 'attempt-limit') {
        expect(attempts).toBe(256);
        expect(String(refused)).toContain('did not observe bounded ENOSPC');
      }
      if (fault === 'byte-limit') {
        expect(written).toBe(maximum);
        expect(attempts).toBe(128);
      }
    }
  });
