import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { expect, test } from 'bun:test';

/** Fixed current-request write boundary; identities and ENOSPC are modeled until the native owned-volume run. */
for (const fault of [
  'write-enospc',
  'open-enospc',
  'success',
  'existing',
  'access',
  'unknown',
  'nonerror',
  'instance',
  'request',
  'boot',
  'uid',
  'gid',
  'topology',
  'path',
  'instance-missing',
  'request-missing',
  'instance-access',
  'request-access',
  'record-type',
  'record-uid',
  'record-gid',
  'record-links',
  'record-mode',
  'record-empty',
  'record-bound',
  'record-read',
  'record-read-close',
  'record-close',
  'read-size',
  'request-shape',
  'request-boot',
  'boot-shape',
  'write-close',
  'metadata-size-drift',
  'instance-symlink',
  'request-symlink',
  'fifo',
] as const) {
  test(`current fixture ACK allocation ${fault}`, async () => {
    const source = await readFile(
      new URL('./registry-pressure-ack.fixture.ts', import.meta.url),
      'utf8',
    );
    const start = source.indexOf('export async function readRegistryPressureRecord');
    const body = new Bun.Transpiler({ loader: 'ts' }).transformSync(
      source.slice(start).replaceAll('export async function', 'async function') +
        '\nreturn proveRegistryPressureAcknowledgement;',
    );
    const instance = '11111111-1111-4111-8111-111111111111';
    const boot = '22222222-2222-4222-8222-222222222222';
    const nonce = '33333333-3333-4333-8333-333333333333';
    const reads: string[] = [],
      writes: string[] = [];
    let fifoRescued = false;
    let closed = 0,
      descriptorReads = 0;
    const failure = Object.assign(new Error('private allocation fault'), {
      code:
        fault === 'existing'
          ? 'EEXIST'
          : fault === 'access'
            ? 'EACCES'
            : ['unknown', 'record-read', 'record-read-close', 'write-close'].includes(fault)
              ? 'EIO'
              : fault.endsWith('-missing')
                ? 'ENOENT'
                : fault.endsWith('-access')
                  ? 'EACCES'
                  : fault.endsWith('-symlink')
                    ? 'ELOOP'
                    : 'ENOSPC',
    });
    const nonError = { code: 'ENOSPC' };
    const closeFailure = new Error('private close failure');
    const hashBytes = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
    const text = (path: string) =>
      path.endsWith('.authority-instance')
        ? fault === 'instance'
          ? 'invalid\n'
          : `${instance} ${boot}\n`
        : fault === 'request-shape'
          ? 'invalid\n'
          : `${nonce} ${fault === 'request' ? nonce : instance} ${fault === 'request-boot' ? nonce : boot}\n`;
    const file = (path: string) => ({
      stat: () =>
        Promise.resolve({
          isFile: () => fault !== 'record-type' && fault !== 'fifo',
          uid: fault === 'record-uid' ? 0 : 59001,
          gid: fault === 'record-gid' ? 0 : 59001,
          mode: fault === 'record-mode' ? 0o100644 : 0o100600,
          nlink: fault === 'record-links' ? 2 : 1,
          size:
            fault === 'record-empty'
              ? 0
              : fault === 'record-bound'
                ? 257
                : Buffer.byteLength(text(path)) + (fault === 'metadata-size-drift' ? 1 : 0),
          dev: 10,
          ino: path.endsWith('request') ? 2 : 3,
        }),
      read: (buffer: Buffer) => {
        descriptorReads++;
        if (fault === 'record-read' || fault === 'record-read-close')
          return Promise.reject(failure);
        const bytes = Buffer.from(text(path));
        bytes.copy(buffer);
        return Promise.resolve({
          bytesRead: fault === 'read-size' ? bytes.length - 1 : bytes.length,
        });
      },
      writeFile: (bytes: string) => {
        writes.push(bytes);
        if (fault === 'success') return Promise.resolve();
        if (fault === 'existing')
          return Promise.reject(
            Object.assign(new Error('full after forbidden existing open'), { code: 'ENOSPC' }),
          );
        // Boundary: deliberate code-shaped non-Error input tests that it cannot be accepted as ENOSPC.
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        return Promise.reject(fault === 'nonerror' ? nonError : failure);
      },
      close: () => {
        closed++;
        return ['record-read-close', 'record-close'].includes(fault) ||
          (fault === 'write-close' && path.endsWith('.authority-readonly'))
          ? Promise.reject(closeFailure)
          : Promise.resolve();
      },
    });
    // Boundary: extracted local source with explicitly modeled ports, not externally supplied code.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const compile = new Function(
      'process',
      'readFile',
      'open',
      'constants',
      'createHash',
      body,
    ) as (...ports: unknown[]) => (installed: unknown) => Promise<unknown>;
    const prove = compile(
      { getuid: () => (fault === 'uid' ? 0 : 59001), getgid: () => (fault === 'gid' ? 0 : 59001) },
      (path: string) =>
        Promise.resolve(
          path === '/proc/1/cmdline'
            ? fault === 'topology'
              ? 'wrong'
              : '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-volume-full\0'
            : fault === 'boot'
              ? nonce + '\n'
              : fault === 'boot-shape'
                ? 'invalid\n'
                : boot + '\n',
        ),
      (path: string, flags: number, mode?: number) => {
        reads.push(path);
        if (fault === 'fifo' && (flags & 16) === 0)
          return new Promise((resolve) =>
            setTimeout(() => {
              fifoRescued = true;
              resolve(file(path));
            }, 50),
          );
        if (
          (flags & 8) !== 0 &&
          ((path.endsWith('.authority-instance') && fault === 'instance-symlink') ||
            (path.endsWith('readonly.request') && fault === 'request-symlink'))
        )
          return Promise.reject(failure);
        if (
          (path.endsWith('.authority-instance') &&
            ['instance-missing', 'instance-access'].includes(fault)) ||
          (path.endsWith('readonly.request') &&
            ['request-missing', 'request-access'].includes(fault))
        )
          return Promise.reject(failure);
        if ((flags & 1) !== 0) {
          expect(mode).toBe(0o600);
          if (
            ['open-enospc', 'access'].includes(fault) ||
            (fault === 'existing' && (flags & 4) !== 0)
          )
            return Promise.reject(failure);
        }
        return Promise.resolve(file(path));
      },
      { O_RDONLY: 0, O_WRONLY: 1, O_CREAT: 2, O_EXCL: 4, O_NOFOLLOW: 8, O_NONBLOCK: 16 },
      createHash,
    );
    const pending = prove({
      ordinary: {
        path: fault === 'path' ? '/foreign' : '/var/lib/puni-registry/registry/contents',
      },
      journalPath: '/var/lib/puni-registry/journal/contents',
    });
    if (fault === 'write-enospc' || fault === 'open-enospc') {
      expect(await pending).toEqual({
        requestSha256: hashBytes(`${nonce} ${instance} ${boot}\n`),
        instanceSha256: hashBytes(`${instance} ${boot}\n`),
        allocation: 'ENOSPC',
        stage: fault === 'write-enospc' ? 'write' : 'open',
      });
      expect(writes).toEqual(fault === 'write-enospc' ? [`${nonce} ${instance} ${boot}\n`] : []);
      expect(closed).toBe(fault === 'write-enospc' ? 3 : 2);
    } else {
      let refused: unknown;
      try {
        await pending;
      } catch (cause) {
        refused = cause;
      }
      if (
        [
          'record-type',
          'record-uid',
          'record-gid',
          'record-links',
          'record-mode',
          'record-empty',
          'record-bound',
        ].includes(fault)
      )
        expect(descriptorReads).toBe(0);
      if (fault === 'fifo') {
        expect(fifoRescued).toBe(false);
        expect(descriptorReads).toBe(0);
        expect(closed).toBe(1);
      }
      if (fault === 'nonerror') expect(refused).toBe(nonError);
      else expect(refused).toBeInstanceOf(Error);
      if (!['success', 'unknown', 'nonerror', 'write-close', 'existing'].includes(fault))
        expect(writes).toEqual([]);
      if (['uid', 'gid', 'topology', 'path'].includes(fault)) expect(reads).toEqual([]);
      if (
        [
          'existing',
          'access',
          'unknown',
          'instance-missing',
          'request-missing',
          'instance-access',
          'request-access',
          'record-read',
          'instance-symlink',
          'request-symlink',
        ].includes(fault)
      )
        expect(refused).toBe(failure);
      if (fault === 'record-close') expect(refused).toBe(closeFailure);
      if (fault === 'record-read-close' || fault === 'write-close') {
        expect(refused).toBeInstanceOf(AggregateError);
        expect((refused as AggregateError).errors).toEqual([failure, closeFailure]);
      }
    }
  });
}
