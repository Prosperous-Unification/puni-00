import { constants } from 'node:fs';
import { readFile } from 'node:fs/promises';

import { expect, test } from 'bun:test';

const prefix = '/var/lib/puni-registry/registry/contents';
const boot = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const old = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const fresh = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const nonce = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
for (const fault of [
  'none',
  'absent',
  'lookup-denied',
  'root',
  'instance-missing',
  'metadata',
  'record',
  'instance-path',
  'ack-shape',
  'ack-path',
  'write',
  'readback',
  'live',
  'close',
  'pid',
  'mode',
  'path',
  'live-first',
  'boot',
  'symlink',
  'instance-unreadable',
  'type',
  'gid',
  'links',
  'permissions',
  'size',
  'read-count',
  'prior-boot',
  'lookup-nonerror',
  'ack-reader-error',
  'ack-older',
  'unlink',
  'same',
  'sync',
  'sync-close',
  'instance-after',
] as const)
  test('fixed pre-fill epoch ' + fault, async () => {
    const source = await readFile(
      new URL('./registry-pressure-epoch.fixture.ts', import.meta.url),
      'utf8',
    );
    const start = source.indexOf('export async function prepareRegistryPressureEpoch(');
    if (start < 0) throw new Error('Missing actual pre-fill epoch function');
    const body =
      new Bun.Transpiler({ loader: 'ts' }).transformSync(
        source.slice(start).replace('export async function', 'async function'),
      ) + '\nreturn prepareRegistryPressureEpoch;';
    const effects: string[] = [];
    let bytes = old + ' ' + boot + '\n';
    let live = 0;
    let ackReads = 0;
    let instanceReads = 0;
    const primary = new Error('Expected flush failure');
    const alien: unknown = { code: 'ENOENT' };
    const denied = Object.assign(new Error('Expected pre-fill denial'), { code: 'EACCES' });
    const missing = Object.assign(new Error('Expected absent prior ACK'), { code: 'ENOENT' });
    const metadata = {
      isFile: () => true,
      uid: 59001,
      gid: 59001,
      nlink: 1,
      mode: 0o100600,
      size: 74,
      dev: 7,
      ino: 8,
    };
    const writer = {
      pid: 42,
      startTicks: '123',
      assertLive: () => {
        effects.push('live');
        live++;
        return Promise.resolve({
          pid: (fault === 'live' && live === 2) || fault === 'live-first' ? 43 : 42,
          startTicks: '123',
        });
      },
    };
    const file = {
      stat: () =>
        Promise.resolve({
          ...metadata,
          uid: fault === 'metadata' ? 0 : 59001,
          gid: fault === 'gid' ? 0 : 59001,
          isFile: () => fault !== 'type',
          nlink: fault === 'links' ? 2 : 1,
          mode: fault === 'permissions' ? 0o644 : 0o600,
          size: fault === 'size' ? 75 : 74,
        }),
      read: (buffer: Buffer, offset: number, length: number, position: number) => {
        expect([offset, length, position]).toEqual([0, 75, 0]);
        const selected =
          fault === 'record'
            ? 'invalid\n'
            : fault === 'prior-boot'
              ? old + ' ' + fresh + '\n'
              : bytes;
        buffer.write(selected);
        return Promise.resolve({
          bytesRead: fault === 'read-count' ? 73 : Buffer.byteLength(selected),
        });
      },
      write: (buffer: Buffer, offset: number, length: number, position: number) => {
        effects.push('write');
        expect([offset, length, position]).toEqual([0, 74, 0]);
        bytes = buffer.toString();
        return Promise.resolve({ bytesWritten: fault === 'write' ? 0 : 74 });
      },
      sync: () => {
        effects.push('sync');
        return fault === 'sync' || fault === 'sync-close'
          ? Promise.reject(primary)
          : Promise.resolve();
      },
      close: () => {
        effects.push('close');
        return fault === 'close' || fault === 'sync-close'
          ? Promise.reject(denied)
          : Promise.resolve();
      },
    };
    // Boundary: actual fixed epoch body; root credentials, native metadata and captured writer observations are modeled.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const compile = new Function(
      'process',
      'readFile',
      'open',
      'lstat',
      'unlink',
      'constants',
      'randomUUID',
      'readRegistryPressureRecord',
      'createHash',
      body,
    ) as (...ports: unknown[]) => (installed: unknown, writer: unknown) => Promise<unknown>;
    const { createHash } = await import('node:crypto');
    const prepare = compile(
      { getuid: () => (fault === 'root' ? 1 : 0), pid: fault === 'pid' ? 2 : 1 },
      (path: string) =>
        Promise.resolve(
          path === '/proc/1/cmdline'
            ? fault === 'mode'
              ? 'foreign'
              : '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-volume-full\0'
            : fault === 'boot'
              ? 'bad\n'
              : boot + '\n',
        ),
      (path: string, flags: number) => {
        effects.push('open');
        expect(path).toBe(prefix + '/.authority-instance');
        if (fault === 'symlink' && (flags & constants.O_NOFOLLOW) !== 0)
          return Promise.reject(denied);
        if (fault === 'instance-unreadable') return Promise.reject(denied);
        return fault === 'instance-missing' ? Promise.reject(missing) : Promise.resolve(file);
      },
      (path: string) => {
        effects.push('stat:' + String(path.split('/').at(-1)));
        if (path.endsWith('.authority-readonly')) {
          ackReads++;
          if (fault === 'absent') return Promise.reject(missing);
          if (fault === 'lookup-denied') return Promise.reject(denied);
          // Boundary: intentionally non-Error errno lookalike must propagate, never become absence.
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          if (fault === 'lookup-nonerror') return Promise.reject(alien);
          return Promise.resolve({
            ...metadata,
            ino: fault === 'ack-path' && ackReads === 2 ? 12 : 9,
            size: 111,
          });
        }
        instanceReads++;
        return Promise.resolve({
          ...metadata,
          ino:
            fault === 'instance-path' || (fault === 'instance-after' && instanceReads === 2)
              ? 12
              : 8,
        });
      },
      (path: string) => {
        effects.push('unlink');
        expect(path).toBe(prefix + '/.authority-readonly');
        return fault === 'unlink' ? Promise.reject(denied) : Promise.resolve();
      },
      constants,
      () => (fault === 'same' ? old : fresh),
      (path: string) =>
        fault === 'ack-reader-error' && path.endsWith('.authority-readonly')
          ? Promise.reject(denied)
          : Promise.resolve(
              path.endsWith('.authority-readonly')
                ? fault === 'ack-shape'
                  ? 'bad\n'
                  : nonce + ' ' + (fault === 'ack-older' ? nonce : old) + ' ' + boot + '\n'
                : fault === 'readback'
                  ? old + ' ' + boot + '\n'
                  : bytes,
            ),
      createHash,
    );
    const outcome = await prepare(
      { ordinary: { path: fault === 'path' ? '/wrong' : prefix } },
      writer,
    ).then(
      (value) => ({ ok: true as const, value }),
      (cause: unknown) => ({ ok: false as const, cause }),
    );
    if (fault === 'none' || fault === 'absent' || fault === 'ack-older') {
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) throw outcome.cause;
      expect(outcome.value).toMatchObject({
        instance: fresh + ' ' + boot + '\n',
        writer: { pid: 42, startTicks: '123' },
        priorAcknowledgement:
          fault === 'absent'
            ? { state: 'absent' }
            : {
                state: 'removed',
                sha256: createHash('sha256')
                  .update(nonce + ' ' + (fault === 'ack-older' ? nonce : old) + ' ' + boot + '\n')
                  .digest('hex'),
              },
      });
      expect(effects.filter((effect) => effect === 'unlink')).toHaveLength(
        fault === 'absent' ? 0 : 1,
      );
      expect(effects.filter((effect) => effect === 'write')).toHaveLength(1);
    } else {
      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error('Invalid epoch accepted');
      if (
        [
          'lookup-denied',
          'close',
          'symlink',
          'instance-unreadable',
          'unlink',
          'ack-reader-error',
        ].includes(fault)
      )
        expect(outcome.cause).toBe(denied);
      if (fault === 'instance-missing') expect(outcome.cause).toBe(missing);
      if (fault === 'lookup-nonerror') expect(outcome.cause).toBe(alien);
      if (fault === 'sync') expect(outcome.cause).toBe(primary);
      if (fault === 'sync-close') {
        expect(outcome.cause).toBeInstanceOf(AggregateError);
        if (!(outcome.cause instanceof AggregateError)) throw outcome.cause;
        expect(outcome.cause.errors).toEqual([primary, denied]);
      }
      if (
        [
          'root',
          'instance-missing',
          'metadata',
          'record',
          'instance-path',
          'lookup-denied',
          'ack-shape',
          'ack-path',
          'pid',
          'mode',
          'path',
          'live-first',
          'boot',
          'symlink',
          'instance-unreadable',
          'type',
          'gid',
          'links',
          'permissions',
          'size',
          'read-count',
          'prior-boot',
          'lookup-nonerror',
          'ack-reader-error',
          'unlink',
          'same',
        ].includes(fault)
      )
        expect(effects).not.toContain('write');
      if (['root', 'pid', 'mode', 'path'].includes(fault)) expect(effects).toEqual([]);
    }
    expect(effects.filter((effect) => effect === 'close')).toHaveLength(
      [
        'root',
        'pid',
        'mode',
        'path',
        'live-first',
        'boot',
        'instance-missing',
        'symlink',
        'instance-unreadable',
      ].includes(fault)
        ? 0
        : 1,
    );
  });
