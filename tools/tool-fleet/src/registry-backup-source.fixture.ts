import type { BigIntStats } from 'node:fs';
import { mkdir, open, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { dlopen } from 'bun:ffi';

import { modelRegistryBackupEffects } from './registry-backup-reservation.fixture';

/** Ordinary-user disposable source pair with real held authority; no root/native fixture. */
export async function openBackupSourceFixture() {
  const directory = await scratchAsync('registry-source-');
  const registryPath = join(directory, 'registry');
  const journalPath = join(directory, 'journal');
  await mkdir(registryPath);
  await mkdir(journalPath);
  await writeFile(join(journalPath, 'journal.json'), '{"revision":7}');
  const lock = await open(join(journalPath, 'authority.lock'), 'wx', 0o600);
  const native = dlopen('libc.so.6', { flock: { args: ['i32', 'i32'], returns: 'i32' } });
  if (native.symbols.flock(lock.fd, 2 | 4) !== 0) throw new Error('Fixture lock failed');
  return {
    directory,
    authority: { authorityDescriptor: lock.fd },
    source: {
      operationId: 'source-proof',
      registryId: 'proof',
      storageId: 'owned',
      registryPath,
      journalPath,
      journalRevision: 7,
      maximumBytes: 1024 ** 2,
      journalMaximumBytes: 1024 ** 2,
      censusSha256: 'a'.repeat(64),
    },
    limits: {
      registry: {
        maximumLogicalBytes: 1024 ** 2,
        maximumEntries: 100,
        maximumDepth: 10,
        maximumMetadataBytes: 65536,
        maximumFanout: 100,
      },
      journal: {
        maximumLogicalBytes: 1024 ** 2,
        maximumEntries: 100,
        maximumDepth: 10,
        maximumMetadataBytes: 65536,
        maximumFanout: 100,
      },
    },
    async close() {
      await lock.close();
      native.close();
      await rm(directory, { recursive: true });
    },
  };
}

if (import.meta.main) {
  const fault = process.argv[2];
  const fixture = await openBackupSourceFixture();
  const controller = new AbortController();
  const path = join(fixture.source.registryPath, 'blob');
  await writeFile(path, 'a');
  const ffi = await import('bun:ffi');
  const openNative = ffi.dlopen;
  const native = openNative('libc.so.6', {
    setxattr: { args: ['ptr', 'ptr', 'ptr', 'usize', 'i32'], returns: 'i32' },
  });
  const cpath = Buffer.from(path + '\0');
  const name = Buffer.from('user.a\0');
  const value = Buffer.from('attribute');
  if (native.symbols.setxattr(ffi.ptr(cpath), ffi.ptr(name), ffi.ptr(value), value.length, 0) !== 0)
    throw new Error('Fixture xattr unsupported');
  native.close();
  const binary = process.env['PUNI_TEST_RESTIC_BINARY'];
  const environment = {
    RESTIC_REPOSITORY: join(fixture.directory, 'repository'),
    RESTIC_PASSWORD: 'disposable',
  };
  if (process.env['PUNI_SOURCE_CONSUMER'] === 'store') {
    if (binary === undefined) throw new Error('Missing requested ordinary restic binary');
    const initialized = Bun.spawn([binary, 'init'], {
      env: { PATH: '/usr/bin:/bin', ...environment },
      stdout: 'ignore',
      stderr: 'pipe',
    });
    const [code, stderr] = await Promise.all([
      initialized.exited,
      new Response(initialized.stderr).text(),
    ]);
    if (code !== 0 || stderr !== '') throw new Error('Disposable repository initialization failed');
  }
  const { mock } = await import('bun:test');
  let closed = 0;
  let sourceRead = false;
  let snapshotAdmitted = false;
  let journalReads = 0;
  let journalCloses = 0;
  let snapshotId: string | undefined;
  let rootSamples = 0;
  let rootInjected = false;
  let coercedRootIdentity = false;
  const oversizedRootInode = 1n << 80n;
  if (fault === 'root-stat-width') {
    globalThis.String = new Proxy(String, {
      apply(target, receiver, arguments_: unknown[]) {
        if (arguments_[0] === oversizedRootInode) coercedRootIdentity = true;
        const converted: unknown = Reflect.apply(target, receiver, arguments_);
        if (typeof converted !== 'string') throw new Error('Unexpected controlled String response');
        return converted;
      },
    });
  }
  const primary = new Error('controlled source read fault');
  const closing = new Error('controlled source cleanup fault');
  if (fault.startsWith('xattr-')) {
    await mock.module('bun:ffi', () => ({
      ...ffi,
      // Boundary: this fixture deliberately corrupts libc outputs consumed by the real observer; it proves dependency-fault refusal only.
      dlopen: (...arguments_: Parameters<typeof openNative>) => {
        const library = openNative(...arguments_);
        const symbols = library.symbols as unknown as Record<
          string,
          ((...arguments_: unknown[]) => number) | undefined
        >;
        if (!Object.hasOwn(symbols, 'flistxattr')) return library;
        const list = symbols['flistxattr'];
        const get = symbols['fgetxattr'];
        if (list === undefined || get === undefined)
          throw new Error('Missing controlled xattr symbols');
        let listings = 0;
        return {
          ...library,
          symbols: {
            ...symbols,
            flistxattr: (...arguments_: unknown[]) => {
              const length = list(...arguments_);
              listings++;
              if (fault === 'xattr-read-cleanup') throw primary;
              if (fault === 'xattr-list-error') return -1;
              if (fault === 'xattr-list-oversize') return 65537;
              if (fault === 'xattr-list-change' && listings > 1) return length + 1;
              return length;
            },
            fgetxattr: (...arguments_: unknown[]) => {
              const length = get(...arguments_);
              if (fault === 'xattr-value-error') return -1;
              if (fault === 'xattr-value-oversize') return 65537;
              if (fault === 'xattr-value-change' && arguments_[2] !== null) return length + 1;
              return length;
            },
          },
          close: () => {
            closed++;
            library.close();
            if (fault === 'xattr-read-cleanup') throw closing;
          },
        };
      },
    }));
  } else {
    const filesystem = await import('node:fs/promises');
    const originalStat = filesystem.lstat;
    const originalOpen = filesystem.opendir;
    const originalFile = filesystem.open;
    const corruptStat = (status: BigIntStats) => {
      if (fault === 'stat-absent-time') Reflect.deleteProperty(status, 'ctimeNs');
      if (fault === 'stat-null-time') Reflect.set(status, 'ctimeNs', null);
      if (fault === 'stat-malformed-owner') Reflect.set(status, 'uid', 'malformed');
      if (fault === 'stat-excess-inode') status.ino = 1n << 80n;
      if (fault === 'stat-excess-time') status.ctimeNs = 1n << 128n;
      return status;
    };
    await mock.module('node:fs/promises', () => ({
      ...filesystem,
      lstat: async (entry: string | Buffer, options: { bigint?: boolean } | undefined) => {
        // Boundary: faults affect only controlled source blob/root bigint samples; authority and restic executable paths retain real filesystem behavior.
        const status = await originalStat(entry, options as { bigint: true });
        if (
          options?.bigint === true &&
          Buffer.from(entry).equals(Buffer.from(fixture.source.registryPath))
        ) {
          rootSamples++;
          if (!rootInjected && fault.startsWith('root-stat-')) {
            rootInjected = true;
            Reflect.set(
              status,
              'ino',
              fault === 'root-stat-width'
                ? oversizedRootInode
                : {
                    toString() {
                      coercedRootIdentity = true;
                      return 'malformed-root-inode';
                    },
                  },
            );
          }
        }
        if (options?.bigint === true && Buffer.from(entry).equals(Buffer.from(path))) {
          if (fault === 'cross-device') status.dev += 1n;
          if (fault === 'unsafe-size') status.size = 9007199254740992n;
        }
        if (options?.bigint === true && Buffer.from(entry).equals(Buffer.from(path)))
          corruptStat(status);
        return status;
      },
      open: async (...arguments_: Parameters<typeof originalFile>) => {
        const file = await originalFile(...arguments_);
        const entry = arguments_[0];
        if (
          fault.startsWith('progress-') &&
          entry === join(fixture.source.journalPath, 'journal.json')
        ) {
          let reads = 0;
          return {
            fd: file.fd,
            stat: file.stat.bind(file),
            close: async () => {
              await file.close();
              journalCloses++;
            },
            read: async (buffer: Buffer, offset: number, length: number, position: number) => {
              reads++;
              journalReads++;
              if (fault === 'progress-short')
                return file.read(buffer, offset, Math.min(3, length), position);
              if (reads > 1)
                throw new Error('Unexpected further journal read after malformed progress');
              const response = await file.read(buffer, offset, length, position);
              if (fault === 'progress-absent') Reflect.deleteProperty(response, 'bytesRead');
              else {
                const counts: Record<string, unknown> = {
                  'progress-nan': Number.NaN,
                  'progress-infinity': Number.POSITIVE_INFINITY,
                  'progress-negative': -1,
                  'progress-zero': 0,
                  'progress-fractional': 0.5,
                  'progress-string': String(response.bytesRead),
                  'progress-null': null,
                  'progress-unsafe': Number.MAX_SAFE_INTEGER + 1,
                  'progress-excess': length + 1,
                };
                if (!Object.hasOwn(counts, fault))
                  throw new Error('Unknown controlled progress fault');
                Reflect.set(response, 'bytesRead', counts[fault]);
              }
              return response;
            },
          };
        }
        if (
          (fault === 'unsafe-size' ||
            fault === 'file-stat-change' ||
            fault === 'cross-device' ||
            fault.startsWith('stat-')) &&
          (typeof entry === 'string' || Buffer.isBuffer(entry)) &&
          Buffer.from(entry).equals(Buffer.from(path))
        ) {
          return {
            fd: file.fd,
            read: file.read.bind(file),
            close: file.close.bind(file),
            stat: async () => {
              const status = await file.stat({ bigint: true });
              if (fault === 'unsafe-size') status.size = 9007199254740992n;
              if (fault === 'file-stat-change') status.size += 1n;
              if (fault === 'cross-device') status.dev += 1n;
              return corruptStat(status);
            },
          };
        }
        return file;
      },
      opendir: async (...arguments_: Parameters<typeof originalOpen>) => {
        const directory = await originalOpen(...arguments_);
        return {
          read: async () => {
            sourceRead = true;
            if (fault === 'read-cleanup' || fault === 'read-error') throw primary;
            const entry: unknown = await directory.read();
            if (fault === 'raw-name') return { name: 'lossy-or-wrong-type' };
            if (fault === 'cancel-during-read')
              controller.abort(new Error('controlled traversal cancellation'));
            return entry;
          },
          close: async () => {
            await directory.close();
            closed++;
            if (fault === 'read-cleanup') throw closing;
          },
        };
      },
    }));
  }
  if (fault === 'authority-bookend') {
    const processPorts = await import('./registry-maintenance-process');
    const assertAuthority = processPorts.assertRegistryMaintenanceLock;
    let checks = 0;
    await mock.module('./registry-maintenance-process', () => ({
      ...processPorts,
      assertRegistryMaintenanceLock: async (...arguments_: Parameters<typeof assertAuthority>) => {
        await assertAuthority(...arguments_);
        checks++;
        if (
          checks === (process.env['PUNI_SOURCE_CONSUMER'] === 'store' ? 4 : 2) &&
          !snapshotAdmitted
        )
          throw primary;
      },
    }));
  }
  const { observeRegistryBackupSource } = await import('./registry-backup-source');
  try {
    if (process.env['PUNI_SOURCE_CONSUMER'] === 'store') {
      if (binary === undefined) throw new Error('Missing requested restic');
      const { createRegistryBackupStore } = await import('./registry-backup-store');
      const receipt = await createRegistryBackupStore({
        effects: modelRegistryBackupEffects(),
        signal: controller.signal,
        binary,
        binarySha256: '20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639',
        environment,
        sourceLimits: fixture.limits,
        admit: (request) => {
          if (request.phase === 'snapshot') snapshotAdmitted = true;
          return Promise.resolve();
        },
      }).snapshot(fixture.source, fixture.authority);
      snapshotId = receipt.snapshotId;
    } else
      await observeRegistryBackupSource(
        fixture.source,
        fixture.limits,
        fixture.authority,
        controller.signal,
      );
    console.log(
      JSON.stringify({
        refused: false,
        snapshotId,
        closed,
        sourceRead,
        snapshotAdmitted,
        journalReads,
        journalCloses,
        rootSamples,
        rootInjected,
        coercedRootIdentity,
      }),
    );
  } catch (cause) {
    let snapshots: unknown = null;
    if (process.env['PUNI_SOURCE_CONSUMER'] === 'store') {
      if (binary === undefined) throw new Error('Missing requested restic', { cause });
      const listed = Bun.spawn([binary, '--no-cache', '--no-lock', 'snapshots', '--json'], {
        env: { PATH: '/usr/bin:/bin', ...environment },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const [stdout, stderr, code] = await Promise.all([
        new Response(listed.stdout).text(),
        new Response(listed.stderr).text(),
        listed.exited,
      ]);
      if (code !== 0 || stderr !== '')
        throw new Error('Disposable snapshot inspection failed', { cause });
      snapshots = JSON.parse(stdout);
    }
    console.log(
      JSON.stringify({
        refused: true,
        closed,
        sourceRead,
        snapshots,
        snapshotAdmitted,
        journalReads,
        journalCloses,
        rootSamples,
        rootInjected,
        coercedRootIdentity,
        message: cause instanceof Error ? cause.message : String(cause),
        aggregate:
          cause instanceof AggregateError &&
          cause.errors.includes(primary) &&
          cause.errors.includes(closing),
      }),
    );
  } finally {
    await fixture.close();
  }
}
