import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { readFile } from 'node:fs/promises';

import { expect, test } from 'bun:test';

for (const fault of ['none', 'inode', 'device', 'missing-identity'] as const)
  test('epoch deletion binds actual read descriptor ' + fault, async () => {
    const epochSource = await readFile(
      new URL('./registry-pressure-epoch.fixture.ts', import.meta.url),
      'utf8',
    );
    const readerSource = await readFile(
      new URL('./registry-pressure-ack.fixture.ts', import.meta.url),
      'utf8',
    );
    const start = readerSource.indexOf('export async function readRegistryPressureRecord(');
    const end = readerSource.indexOf('/**\n * Attempt a fresh allocation', start);
    if (start < 0 || end < start) throw new Error('Missing actual fixed reader body');
    const transpile = (source: string) =>
      new Bun.Transpiler({ loader: 'ts' }).transformSync(source);
    const prefix = '/var/lib/puni-registry/registry/contents',
      instancePath = prefix + '/.authority-instance',
      ackPath = prefix + '/.authority-readonly';
    const boot = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      old = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      fresh = 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      nonce = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    let instance = old + ' ' + boot + '\n';
    const acknowledged = nonce + ' ' + old + ' ' + boot + '\n';
    const identity = (ino: number, uid: number, size: number) => ({
      dev: 7,
      ino,
      uid,
      gid: 59001,
      nlink: 1,
      mode: 0o100600,
      size,
      isFile: () => true,
    });
    const instanceMetadata = () => identity(8, 59001, 74);
    const namedAck = identity(9, fault === 'inode' ? 0 : 59001, 111);
    const openedAck = {
      ...identity(fault === 'inode' ? 10 : 9, 59001, 111),
      dev: fault === 'device' ? 8 : 7,
    };
    const unlinked: unknown[] = [];
    let ackBytesRead = 0;
    let ackClosed = 0;
    const descriptor = (ack: boolean) => ({
      stat: () => Promise.resolve(ack ? openedAck : instanceMetadata()),
      read: (buffer: Buffer) => {
        if (ack) ackBytesRead++;
        const text = ack ? acknowledged : instance;
        buffer.write(text);
        return Promise.resolve({ bytesRead: Buffer.byteLength(text) });
      },
      write: (buffer: Buffer) => {
        instance = buffer.toString();
        return Promise.resolve({ bytesWritten: buffer.length });
      },
      sync: () => Promise.resolve(),
      close: () => {
        if (ack) ackClosed++;
        return Promise.resolve();
      },
    });
    const open = (path: string) => {
      if (path !== instancePath && path !== ackPath)
        throw new Error('Unexpected fixed record path');
      return Promise.resolve(descriptor(path === ackPath));
    };
    // Boundary: both actual function bodies execute together; only filesystem/root/writer ports are modeled.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const compileReader = new Function(
      'open',
      'constants',
      transpile(readerSource.slice(start, end).replace('export ', '')) +
        ';return readRegistryPressureRecord;',
    ) as (...ports: unknown[]) => (path: string, identity?: unknown) => Promise<string>;
    const readRecord = compileReader(open, constants);
    // Boundary: actual epoch body consumes that real reader; no canned record port can hide descriptor/path mismatch.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const compileEpoch = new Function(
      'process',
      'readFile',
      'open',
      'lstat',
      'unlink',
      'constants',
      'randomUUID',
      'readRegistryPressureRecord',
      'createHash',
      transpile(
        epochSource
          .slice(epochSource.indexOf('export async function prepareRegistryPressureEpoch('))
          .replace('export async function', 'async function'),
      ) + ';return prepareRegistryPressureEpoch;',
    ) as (...ports: unknown[]) => (installed: unknown, writer: unknown) => Promise<unknown>;
    const prepare = compileEpoch(
      { pid: 1, getuid: () => 0 },
      (path: string) =>
        Promise.resolve(
          path === '/proc/1/cmdline'
            ? '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-volume-full\0'
            : boot + '\n',
        ),
      open,
      (path: string) => Promise.resolve(path === ackPath ? namedAck : instanceMetadata()),
      (path: string) => {
        unlinked.push({ path, ino: namedAck.ino, uid: namedAck.uid });
        return Promise.resolve();
      },
      constants,
      () => fresh,
      readRecord,
      createHash,
    );
    const operation =
      fault === 'missing-identity'
        ? readRecord(ackPath)
        : prepare(
            { ordinary: { path: prefix } },
            {
              pid: 42,
              startTicks: '123',
              assertLive: () => Promise.resolve({ pid: 42, startTicks: '123' }),
            },
          );
    const completed = await operation.then(
      (value) => ({ ok: true as const, value }),
      (cause: unknown) => ({ ok: false as const, cause }),
    );
    if (fault === 'none') {
      expect(completed.ok).toBe(true);
      expect(unlinked).toEqual([{ path: ackPath, ino: 9, uid: 59001 }]);
      expect(ackBytesRead).toBe(1);
    } else {
      expect(unlinked).toEqual([]);
      expect(completed.ok).toBe(false);
      expect(ackBytesRead).toBe(0);
    }
    expect(ackClosed).toBe(1);
  });
