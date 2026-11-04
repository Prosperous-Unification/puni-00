import { rejects } from 'node:assert/strict';
import * as files from 'node:fs';
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';
import { spyOn } from 'bun:test';

import { organizationId, runId } from '../record-codecs';
import { settleFixture } from '../testing/construct-fixture';
import { FixtureClock } from '../testing/fixtures';
import { createFormat5Fixture } from '../testing/format5-fixture';
import { inspectFormat } from './inspect-format';
import { SqliteInspectionError } from './inspect-format';
import { upgradeSqliteWrites } from './migrate-writes';
import { bootstrapSqliteStores, openSqliteStores, SqliteOpenError } from './open-stores';
import { RunStoreContentionError } from './run-store';
async function inspectionFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'inspection-contract-'));
  const options = {
    path: join(directory, 'runs.sqlite'),
    organizationId: organizationId('organization'),
    capacity: 1,
    leaseMilliseconds: 100,
    clock: new FixtureClock(),
    maxBusyAttempts: 3,
    busyDelayMilliseconds: 1,
  };
  const stores = await bootstrapSqliteStores(options);
  await stores.close();
  return { directory, options };
}

test('ordinary supported format6 preserves DELETE journal support', async () => {
  const fixture = await inspectionFixture();
  const native = new Database(fixture.options.path);
  try {
    expect(native.query('PRAGMA journal_mode=DELETE').get()).toEqual({ journal_mode: 'delete' });
  } finally {
    native.close();
  }
  try {
    const stores = await openSqliteStores(fixture.options);
    try {
      const competing = new Database(fixture.options.path);
      try {
        competing.run('BEGIN IMMEDIATE');
        competing.run('ROLLBACK');
        expect(competing.query('PRAGMA locking_mode').get()).toEqual({ locking_mode: 'normal' });
      } finally {
        competing.close();
      }
      expect(
        (
          await stores.runs.readRuntimeScope({
            organizationId: fixture.options.organizationId,
            projectId: 'project',
            personId: 'person',
          })
        ).version,
      ).toBe(3);
    } finally {
      await stores.close();
    }
  } finally {
    rmSync(fixture.directory, { recursive: true });
  }
});

for (const failure of [
  'main_absent',
  'main_unreadable',
  'wal_unreadable',
  'wal_malformed',
  'wal_header_magic',
  'wal_header_version',
  'wal_header_page_small',
  'wal_header_page_large',
  'wal_header_page_unaligned',
  'changing_pair',
  'changing_wal_presence',
  'changing_wal_bytes',
  'allocation',
  'private_exists',
  'main_copy',
  'wal_copy',
  'constructor',
  'close',
  'cleanup',
  'cleanup_unobserved',
  'cleanup_stat_unreadable',
] as const)
  test('ordinary opener preserves private inspection ' + failure, async () => {
    const fixture = await inspectionFixture();
    const before = readFileSync(fixture.options.path);
    const sentinel = Object.assign(new Error('inspection dependency ' + failure), {
      code: failure.endsWith('unreadable') ? 'EACCES' : 'ENOENT',
    });
    const restorations: (() => void)[] = [];
    let retained: string | undefined;
    let inspection: Database | undefined;
    let reads = 0;
    let closed = false;
    let published: Awaited<ReturnType<typeof openSqliteStores>> | undefined;
    let publishedClosed = false;
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Preserve the exact native close for receiver-bound restoration and a positively observed close after the injected failure.
    const nativeClose = Database.prototype.close;
    const originalRead = files.readFileSync;
    const originalWrite = files.writeFileSync;
    const originalRemove = files.rmSync;
    const originalStat = files.lstatSync;
    const originalDirectory = files.mkdtempSync;
    if (failure === 'wal_copy') writeFileSync(fixture.options.path + '-wal', new Uint8Array());
    if (failure === 'wal_malformed')
      writeFileSync(fixture.options.path + '-wal', Buffer.from('malformed WAL'));
    if (failure.startsWith('wal_header_')) {
      const bytes = Buffer.alloc(32);
      bytes.writeUInt32BE(failure === 'wal_header_magic' ? 0 : 0x377f0682, 0);
      bytes.writeUInt32BE(failure === 'wal_header_version' ? 0 : 3007000, 4);
      bytes.writeUInt32BE(
        failure === 'wal_header_page_small'
          ? 256
          : failure === 'wal_header_page_large'
            ? 131072
            : failure === 'wal_header_page_unaligned'
              ? 1000
              : 4096,
        8,
      );
      writeFileSync(fixture.options.path + '-wal', bytes);
    }
    const walBefore = existsSync(fixture.options.path + '-wal')
      ? readFileSync(fixture.options.path + '-wal')
      : undefined;
    if (
      [
        'main_absent',
        'main_unreadable',
        'wal_unreadable',
        'changing_pair',
        'changing_wal_presence',
        'changing_wal_bytes',
      ].includes(failure)
    ) {
      const reading = spyOn(files, 'readFileSync').mockImplementation(((
        path: files.PathOrFileDescriptor,
        ...options: []
      ) => {
        if (
          (path === fixture.options.path &&
            (failure === 'main_absent' || failure === 'main_unreadable')) ||
          (path === fixture.options.path + '-wal' && failure === 'wal_unreadable')
        )
          throw sentinel;
        if (
          path === fixture.options.path + '-wal' &&
          (failure === 'changing_wal_presence' || failure === 'changing_wal_bytes')
        ) {
          reads++;
          if (failure === 'changing_wal_presence') {
            if (reads % 2 !== 0)
              throw Object.assign(new Error('optional WAL absent at paired cut'), {
                code: 'ENOENT',
              });
            return Buffer.alloc(0);
          }
          const bytes = Buffer.alloc(32);
          bytes.writeUInt32BE(0x377f0682, 0);
          bytes.writeUInt32BE(3007000, 4);
          bytes.writeUInt32BE(4096, 8);
          bytes.writeUInt32BE(reads % 2, 12);
          return bytes;
        }
        const bytes = originalRead(path, ...options);
        if (path === fixture.options.path && failure === 'changing_pair') {
          reads++;
          const changed = Buffer.from(bytes);
          changed[100] = reads % 2;
          return changed;
        }
        return bytes;
      }) as typeof files.readFileSync);
      restorations.push(() => {
        reading.mockRestore();
      });
    }
    if (failure === 'allocation') {
      const allocating = spyOn(files, 'mkdtempSync').mockImplementation(() => {
        throw sentinel;
      });
      restorations.push(() => {
        allocating.mockRestore();
      });
    }
    if (failure === 'private_exists') {
      // Test boundary: the production allocator takes one string prefix; this wrapper creates only its exact owned private file before exclusive creation is attempted.
      const allocating = spyOn(files, 'mkdtempSync').mockImplementation(((prefix: string) => {
        const directory = originalDirectory(prefix);
        retained = directory;
        writeFileSync(join(directory, 'inspection.sqlite'), 'owned preexisting private file', {
          flag: 'wx',
          mode: 0o600,
        });
        return directory;
      }) as typeof files.mkdtempSync);
      restorations.push(() => {
        allocating.mockRestore();
      });
    }
    if (['main_copy', 'wal_copy', 'constructor'].includes(failure)) {
      const writing = spyOn(files, 'writeFileSync').mockImplementation((path, ...parameters) => {
        if (
          typeof path === 'string' &&
          path.endsWith('/inspection.sqlite' + (failure === 'wal_copy' ? '-wal' : ''))
        ) {
          retained = join(path, '..');
          if (failure === 'constructor') {
            files.mkdirSync(path, { mode: 0o700 });
            return;
          }
          throw sentinel;
        }
        originalWrite(path, ...parameters);
      });
      restorations.push(() => {
        writing.mockRestore();
      });
    }
    if (failure === 'close') {
      Database.prototype.close = function () {
        if (this.filename.endsWith('/inspection.sqlite')) {
          // eslint-disable-next-line @typescript-eslint/no-this-alias -- Retain this exact native receiver for an independently controlled close.
          inspection = this;
          retained = join(this.filename, '..');
          throw sentinel;
        }
        nativeClose.call(this);
      };
      restorations.push(() => {
        Database.prototype.close = nativeClose;
      });
    }
    if (
      failure === 'cleanup' ||
      failure === 'cleanup_unobserved' ||
      failure === 'cleanup_stat_unreadable'
    ) {
      Database.prototype.close = function () {
        nativeClose.call(this);
        if (this.filename.endsWith('/inspection.sqlite')) closed = true;
      };
      restorations.push(() => {
        Database.prototype.close = nativeClose;
      });
      const removing = spyOn(files, 'rmSync').mockImplementation((path, options) => {
        if (typeof path === 'string' && path.includes('/dash-format-inspection-')) {
          retained = path;
          expect(closed).toBe(true);
          if (failure === 'cleanup') throw sentinel;
          return;
        }
        originalRemove(path, options);
      });
      restorations.push(() => {
        removing.mockRestore();
      });
      if (failure === 'cleanup_stat_unreadable') {
        const stating = spyOn(files, 'lstatSync').mockImplementation(((path: files.PathLike) => {
          if (typeof path === 'string' && path.includes('/dash-format-inspection-')) throw sentinel;
          return originalStat(path);
        }) as typeof files.lstatSync);
        restorations.push(() => {
          stating.mockRestore();
        });
      }
    }
    await settleFixture(async () => {
      await rejects(
        openSqliteStores(fixture.options).then((stores) => {
          published = stores;
          return stores;
        }),
        (cause) => {
          if (failure.startsWith('changing_'))
            return (
              cause instanceof RunStoreContentionError &&
              cause.cause instanceof SqliteInspectionError &&
              cause.cause.phase === 'changing_pair'
            );
          if (
            !(cause instanceof SqliteOpenError) ||
            !(cause.cause instanceof SqliteInspectionError)
          )
            return false;
          const diagnostic = cause.cause;
          if (diagnostic.phase === 'constructor' && diagnostic.retainedPath !== undefined) {
            retained = diagnostic.retainedPath;
            console.log(
              JSON.stringify({
                event: 'public-inspection-constructor-scratch-retained',
                path: retained,
                cause: String(diagnostic.cause),
                nativeClosure: 'unavailable',
                failure,
              }),
            );
          }
          if (failure === 'constructor') {
            retained = diagnostic.retainedPath;
            console.log(
              JSON.stringify({
                event: 'public-inspection-constructor-scratch-retained',
                path: retained,
                cause: String(diagnostic.cause),
                nativeClosure: 'unavailable',
              }),
            );
            return diagnostic.phase === 'constructor' && diagnostic.cause instanceof Error;
          }
          if (failure === 'wal_malformed')
            return (
              diagnostic.phase === 'source_read' &&
              diagnostic.failure === 'corrupt' &&
              diagnostic.cause instanceof Error &&
              diagnostic.cause.message === 'incomplete SQLite WAL header'
            );
          if (failure.startsWith('wal_header_'))
            return (
              diagnostic.phase === 'source_read' &&
              diagnostic.failure === 'corrupt' &&
              diagnostic.cause instanceof Error &&
              diagnostic.cause.message === 'unsupported or malformed SQLite WAL header'
            );
          if (failure === 'private_exists')
            return (
              diagnostic.phase === 'scratch_write' &&
              diagnostic.cause instanceof Error &&
              'code' in diagnostic.cause &&
              diagnostic.cause.code === 'EEXIST'
            );
          if (failure === 'cleanup_unobserved')
            return (
              diagnostic.phase === 'scratch_cleanup' &&
              diagnostic.cause instanceof Error &&
              diagnostic.cause.message === 'private inspection directory remains after removal'
            );
          if (failure === 'cleanup_stat_unreadable')
            return (
              diagnostic.phase === 'scratch_cleanup' &&
              diagnostic.cause === sentinel &&
              cause.failure === 'corrupt'
            );
          return (
            diagnostic.cause === sentinel &&
            cause.failure ===
              (failure.endsWith('unreadable') ||
              ['allocation', 'main_copy', 'wal_copy'].includes(failure)
                ? 'unreadable'
                : 'corrupt')
          );
        },
      );
    }, [
      () => {
        for (const restore of restorations.reverse()) restore();
      },
      async () => {
        if (published !== undefined) {
          await published.close();
          publishedClosed = true;
        }
      },
      () => {
        if (inspection !== undefined) {
          nativeClose.call(inspection);
          closed = true;
        }
      },
      () => {
        expect(readFileSync(fixture.options.path)).toEqual(before);
        expect(existsSync(fixture.options.path + '-shm')).toBe(false);
        expect(existsSync(fixture.options.path + '-wal')).toBe(walBefore !== undefined);
        if (walBefore !== undefined)
          expect(readFileSync(fixture.options.path + '-wal')).toEqual(walBefore);
        if (failure.startsWith('changing_')) expect(reads).toBe(6);
        if (retained !== undefined) {
          if (
            [
              'constructor',
              'close',
              'cleanup',
              'cleanup_unobserved',
              'cleanup_stat_unreadable',
            ].includes(failure)
          )
            expect(originalStat(retained).isDirectory()).toBe(true);
          else expect(existsSync(retained)).toBe(false);
        }
      },
      () => {
        if (
          retained !== undefined &&
          ['close', 'cleanup', 'cleanup_unobserved', 'cleanup_stat_unreadable'].includes(failure)
        ) {
          if (failure === 'close') expect(closed).toBe(true);
          rmSync(retained, { recursive: true });
        }
      },
      () => {
        if (published !== undefined && !publishedClosed)
          throw Error(
            'public native closure unobserved; source fixture retained: ' + fixture.directory,
          );
        rmSync(fixture.directory, { recursive: true });
      },
    ]);
  });

test('private allocation failure retains its original cause without inspecting source', async () => {
  const fixture = await inspectionFixture();
  const sentinel = new Error('private directory allocation refused');
  const allocating = spyOn(files, 'mkdtempSync').mockImplementation(() => {
    throw sentinel;
  });
  try {
    await rejects(
      inspectFormat(fixture.options, () => {
        throw Error('allocation failure reached inspector');
      }),
      (cause) =>
        cause instanceof SqliteInspectionError &&
        cause.phase === 'scratch_write' &&
        cause.retainedPath === undefined &&
        cause.cause === sentinel,
    );
  } finally {
    allocating.mockRestore();
    rmSync(fixture.directory, { recursive: true });
  }
});

test('private optional WAL copy failure closes no native database and removes its exact scratch', async () => {
  const fixture = await inspectionFixture();
  writeFileSync(fixture.options.path + '-wal', new Uint8Array());
  const sentinel = new Error('private WAL write failed');
  const original = files.writeFileSync;
  let retained: string | undefined;
  const writing = spyOn(files, 'writeFileSync').mockImplementation((path, ...parameters) => {
    if (typeof path === 'string' && path.endsWith('/inspection.sqlite-wal')) {
      retained = join(path, '..');
      throw sentinel;
    }
    original(path, ...parameters);
  });
  try {
    await rejects(
      inspectFormat(fixture.options, () => {
        throw Error('WAL copy failure reached inspector');
      }),
      (cause) =>
        cause instanceof SqliteInspectionError &&
        cause.phase === 'scratch_write' &&
        cause.cause === sentinel,
    );
    expect(retained).toBeDefined();
    if (retained === undefined) throw Error('private WAL path absent');
    expect(existsSync(retained)).toBe(false);
    expect(readFileSync(fixture.options.path + '-wal')).toHaveLength(0);
    expect(existsSync(fixture.options.path + '-shm')).toBe(false);
  } finally {
    writing.mockRestore();
    rmSync(fixture.directory, { recursive: true });
  }
});

test('native constructor uncertainty retains exact private scratch with its original error', async () => {
  const fixture = await inspectionFixture();
  const original = files.writeFileSync;
  let retained: string | undefined;
  const writing = spyOn(files, 'writeFileSync').mockImplementation((path, ...parameters) => {
    if (typeof path === 'string' && path.endsWith('/inspection.sqlite')) {
      files.mkdirSync(path, { mode: 0o700 });
      return;
    }
    original(path, ...parameters);
  });
  try {
    await rejects(
      inspectFormat(fixture.options, () => {
        throw Error('failed constructor reached inspection');
      }),
      (cause) => {
        if (
          !(cause instanceof SqliteInspectionError) ||
          cause.phase !== 'constructor' ||
          !(cause.cause instanceof Error)
        )
          return false;
        retained = cause.retainedPath;
        console.log(
          JSON.stringify({
            event: 'inspection-constructor-scratch-retained',
            path: retained,
            cause: String(cause.cause),
            nativeClosure: 'unavailable',
          }),
        );
        return true;
      },
    );
    expect(retained).toBeDefined();
    if (retained === undefined) throw Error('constructor scratch path absent');
    expect(existsSync(retained)).toBe(true);
    expect(existsSync(fixture.options.path + '-wal')).toBe(false);
    expect(existsSync(fixture.options.path + '-shm')).toBe(false);
  } finally {
    writing.mockRestore();
    rmSync(fixture.directory, { recursive: true });
  }
});

test('native close failure without an earlier refusal keeps its original cause and owned path', async () => {
  const fixture = await inspectionFixture();
  let inspection: Database | undefined;
  let retained: string | undefined;
  const sentinel = new Error('private native close failed');
  // eslint-disable-next-line @typescript-eslint/unbound-method -- Save the exact native method for receiver-bound restoration and independent positive close.
  const original = Database.prototype.close;
  Database.prototype.close = function () {
    if (this === inspection) throw sentinel;
    original.call(this);
  };
  try {
    await rejects(
      inspectFormat(fixture.options, (database) => {
        inspection = database;
      }),
      (cause) => {
        if (
          !(cause instanceof SqliteInspectionError) ||
          cause.phase !== 'inspection_close' ||
          cause.cause !== sentinel
        )
          return false;
        retained = cause.retainedPath;
        return true;
      },
    );
    expect(retained).toBeDefined();
    if (retained === undefined) throw Error('private retained path absent');
    expect(existsSync(retained)).toBe(true);
  } finally {
    Database.prototype.close = original;
    if (inspection !== undefined) inspection.close();
    if (retained !== undefined) rmSync(retained, { recursive: true });
    rmSync(fixture.directory, { recursive: true });
  }
});

test('private cleanup failure without an earlier refusal preserves the original removal cause', async () => {
  const fixture = await inspectionFixture();
  const original = files.rmSync;
  const sentinel = new Error('private removal failed');
  let retained: string | undefined;
  const removing = spyOn(files, 'rmSync').mockImplementation((path, options) => {
    if (typeof path === 'string' && path.includes('/dash-format-inspection-')) {
      retained = path;
      throw sentinel;
    }
    original(path, options);
  });
  try {
    await rejects(
      inspectFormat(fixture.options, () => undefined),
      (cause) =>
        cause instanceof SqliteInspectionError &&
        cause.phase === 'scratch_cleanup' &&
        cause.cause === sentinel &&
        cause.retainedPath === retained,
    );
    expect(retained).toBeDefined();
    if (retained === undefined) throw Error('removal path absent');
    expect(existsSync(retained)).toBe(true);
  } finally {
    removing.mockRestore();
    if (retained !== undefined) rmSync(retained, { recursive: true });
    rmSync(fixture.directory, { recursive: true });
  }
});
test('isolated format inspection refuses without source sidecars or byte changes', async () => {
  const fixture = await inspectionFixture();
  const sentinel = new Error('incompatible inspected format');
  try {
    const before = readFileSync(fixture.options.path);
    expect(existsSync(fixture.options.path + '-wal')).toBe(false);
    expect(existsSync(fixture.options.path + '-shm')).toBe(false);
    await rejects(
      inspectFormat(fixture.options, (database) => {
        expect(database.query('SELECT schema_version FROM run_meta').get()).toEqual({
          schema_version: 6,
        });
        throw sentinel;
      }),
      (cause) => cause === sentinel,
    );
    expect(readFileSync(fixture.options.path)).toEqual(before);
    expect(existsSync(fixture.options.path + '-wal')).toBe(false);
    expect(existsSync(fixture.options.path + '-shm')).toBe(false);
  } finally {
    rmSync(fixture.directory, { recursive: true });
  }
});

for (const failure of ['ENOENT', 'EACCES'] as const)
  test('isolated inspection preserves required main ' + failure, async () => {
    const fixture = await inspectionFixture();
    const sentinel = Object.assign(new Error('required main ' + failure), { code: failure });
    const original = files.readFileSync;
    const reading = spyOn(files, 'readFileSync').mockImplementation(((
      path: files.PathOrFileDescriptor,
      ...options: []
    ) => {
      if (path === fixture.options.path) throw sentinel;
      return original(path, ...options);
    }) as typeof files.readFileSync);
    try {
      await rejects(
        inspectFormat(fixture.options, () => {
          throw new Error('source failure reached inspection');
        }),
        (cause) =>
          cause instanceof SqliteInspectionError &&
          cause.phase === 'source_read' &&
          cause.failure === (failure === 'EACCES' ? 'unreadable' : 'corrupt') &&
          cause.cause === sentinel,
      );
    } finally {
      reading.mockRestore();
      rmSync(fixture.directory, { recursive: true });
    }
  });

test('optional WAL unreadability is distinct from absence', async () => {
  const fixture = await inspectionFixture();
  const sentinel = Object.assign(new Error('WAL unreadable'), { code: 'EACCES' });
  const original = files.readFileSync;
  const reading = spyOn(files, 'readFileSync').mockImplementation(((
    path: files.PathOrFileDescriptor,
    ...options: []
  ) => {
    if (path === fixture.options.path + '-wal') throw sentinel;
    return original(path, ...options);
  }) as typeof files.readFileSync);
  try {
    await rejects(
      inspectFormat(fixture.options, () => {
        throw new Error('unreadable WAL reached inspection');
      }),
      (cause) =>
        cause instanceof SqliteInspectionError &&
        cause.failure === 'unreadable' &&
        cause.cause === sentinel,
    );
  } finally {
    reading.mockRestore();
    rmSync(fixture.directory, { recursive: true });
  }
});

test('changing main and optional WAL exhaust a finite capture budget without inspecting', async () => {
  const fixture = await inspectionFixture();
  const original = files.readFileSync;
  let reads = 0;
  const reading = spyOn(files, 'readFileSync').mockImplementation(((
    path: files.PathOrFileDescriptor,
    ...options: []
  ) => {
    const bytes = original(path, ...options);
    if (path === fixture.options.path) {
      reads++;
      const changed = Buffer.from(bytes);
      changed[100] = reads % 2;
      return changed;
    }
    return bytes;
  }) as typeof files.readFileSync);
  try {
    await rejects(
      inspectFormat(fixture.options, () => {
        throw new Error('changing pair reached inspection');
      }),
      (cause) =>
        cause instanceof SqliteInspectionError &&
        cause.failure === 'contention' &&
        cause.phase === 'changing_pair',
    );
    expect(reads).toBe(6);
    expect(existsSync(fixture.options.path + '-wal')).toBe(false);
    expect(existsSync(fixture.options.path + '-shm')).toBe(false);
  } finally {
    reading.mockRestore();
    rmSync(fixture.directory, { recursive: true });
  }
});

test('private write failure preserves its cause and observes removal', async () => {
  const fixture = await inspectionFixture();
  const original = files.writeFileSync;
  const sentinel = new Error('private write failed');
  let privatePath: string | undefined;
  const writing = spyOn(files, 'writeFileSync').mockImplementation((path, ...parameters) => {
    if (typeof path === 'string' && path.endsWith('/inspection.sqlite')) {
      privatePath = path;
      throw sentinel;
    }
    original(path, ...parameters);
  });
  try {
    await rejects(
      inspectFormat(fixture.options, () => {
        throw new Error('failed private write reached inspection');
      }),
      (cause) =>
        cause instanceof SqliteInspectionError &&
        cause.phase === 'scratch_write' &&
        cause.cause === sentinel,
    );
    expect(privatePath).toBeDefined();
    expect(existsSync(join(privatePath!, '..'))).toBe(false);
  } finally {
    writing.mockRestore();
    rmSync(fixture.directory, { recursive: true });
  }
});

test('native close failure retains exact private path and original callback cause', async () => {
  const fixture = await inspectionFixture();
  // eslint-disable-next-line @typescript-eslint/unbound-method -- Save the exact native function; the fault wrapper calls and restores it with its original receiver.
  const original = Database.prototype.close;
  const closeFailure = new Error('native close uncertain');
  const callbackFailure = new Error('incompatible private format');
  let inspection: Database | undefined;
  let retained: string | undefined;
  Database.prototype.close = function () {
    if (this === inspection) throw closeFailure;
    original.call(this);
  };
  try {
    await rejects(
      inspectFormat(fixture.options, (database) => {
        inspection = database;
        throw callbackFailure;
      }),
      (cause) => {
        if (
          !(cause instanceof SqliteInspectionError) ||
          cause.phase !== 'inspection_close' ||
          !(cause.cause instanceof AggregateError)
        )
          return false;
        retained = cause.retainedPath;
        expect(cause.cause.errors).toEqual([callbackFailure, closeFailure]);
        return true;
      },
    );
    expect(retained).toBeDefined();
    expect(existsSync(retained!)).toBe(true);
    expect(existsSync(fixture.options.path + '-wal')).toBe(false);
    expect(existsSync(fixture.options.path + '-shm')).toBe(false);
  } finally {
    Database.prototype.close = original;
    if (inspection !== undefined) inspection.close();
    if (retained !== undefined) rmSync(retained, { recursive: true });
    rmSync(fixture.directory, { recursive: true });
  }
});

for (const fault of ['throw', 'no-op'] as const)
  test('private cleanup ' + fault + ' retains owned path and callback cause', async () => {
    const fixture = await inspectionFixture();
    const original = files.rmSync;
    const sentinel = new Error('private cleanup failed');
    const callbackFailure = new Error('incompatible inspected format');
    let retained: string | undefined;
    const removing = spyOn(files, 'rmSync').mockImplementation((path, options) => {
      if (typeof path === 'string' && path.includes('/dash-format-inspection-')) {
        retained = path;
        if (fault === 'throw') throw sentinel;
        return;
      }
      original(path, options);
    });
    try {
      await rejects(
        inspectFormat(fixture.options, () => {
          throw callbackFailure;
        }),
        (cause) => {
          if (
            !(cause instanceof SqliteInspectionError) ||
            cause.phase !== 'scratch_cleanup' ||
            !(cause.cause instanceof AggregateError)
          )
            return false;
          expect(cause.retainedPath).toBe(retained);
          expect(cause.cause.errors[0]).toBe(callbackFailure);
          if (fault === 'throw') expect(cause.cause.errors[1]).toBe(sentinel);
          return true;
        },
      );
      expect(retained).toBeDefined();
      expect(existsSync(retained!)).toBe(true);
    } finally {
      removing.mockRestore();
      if (retained !== undefined) rmSync(retained, { recursive: true });
      rmSync(fixture.directory, { recursive: true });
    }
  });

for (const malformed of [Buffer.from([1]), Buffer.alloc(32)] as const)
  test('malformed optional WAL refuses without changing source bytes or presence', async () => {
    const fixture = await inspectionFixture();
    writeFileSync(fixture.options.path + '-wal', malformed);
    const before = readFileSync(fixture.options.path);
    try {
      await rejects(
        inspectFormat(fixture.options, () => {
          throw new Error('malformed WAL reached inspection');
        }),
        (cause) => cause instanceof SqliteInspectionError && cause.phase === 'source_read',
      );
      expect(readFileSync(fixture.options.path)).toEqual(before);
      expect(readFileSync(fixture.options.path + '-wal')).toEqual(malformed);
      expect(existsSync(fixture.options.path + '-shm')).toBe(false);
    } finally {
      rmSync(fixture.directory, { recursive: true });
    }
  });

test('private directory and files have explicit owner-only permissions and are removed after close', async () => {
  const fixture = await inspectionFixture();
  let inspectedPath: string | undefined;
  try {
    await inspectFormat(fixture.options, (database) => {
      inspectedPath = database.filename;
      expect(files.statSync(database.filename).mode & 0o777).toBe(0o600);
      expect(files.statSync(join(database.filename, '..')).mode & 0o777).toBe(0o700);
    });
    expect(inspectedPath).toBeDefined();
    expect(existsSync(join(inspectedPath!, '..'))).toBe(false);
  } finally {
    rmSync(fixture.directory, { recursive: true });
  }
});

test('supported format6 present only in a live WAL is inspected without reusing source SHM', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'inspection-live-wal-'));
  const path = join(directory, 'runs.sqlite');
  const old = await createFormat5Fixture(path);
  const options = {
    path,
    organizationId: organizationId('organization'),
    capacity: 1,
    leaseMilliseconds: 100,
    clock: new FixtureClock(),
    maxBusyAttempts: 3,
    busyDelayMilliseconds: 1,
  };
  let probe: Database | undefined;
  try {
    await old.populate('queued');
    probe = new Database(path);
    await upgradeSqliteWrites(options);
    const main = readFileSync(path);
    const wal = readFileSync(path + '-wal');
    const shm = readFileSync(path + '-shm');
    const mainOnly = join(directory, 'main-only.sqlite');
    writeFileSync(mainOnly, main);
    const prior = new Database(mainOnly, { readonly: true });
    try {
      expect(prior.query('SELECT schema_version FROM run_meta').get()).toEqual({
        schema_version: 5,
      });
    } finally {
      prior.close();
    }
    await inspectFormat(options, (database) => {
      expect(database.query('SELECT schema_version FROM run_meta').get()).toEqual({
        schema_version: 6,
      });
    });
    expect(readFileSync(path)).toEqual(main);
    expect(readFileSync(path + '-wal')).toEqual(wal);
    expect(readFileSync(path + '-shm')).toEqual(shm);
    const opened = await openSqliteStores(options);
    try {
      expect((await opened.runs.readRun(runId('run'))).version).toBe(4);
    } finally {
      await opened.close();
    }
  } finally {
    if (probe !== undefined) probe.close();
    await old.close();
    expect(await old.worker.exited).toEqual({ code: 0, signal: null });
    expect(old.worker.stdoutClosed).toBe(true);
    expect(old.worker.stderrClosed).toBe(true);
    rmSync(directory, { recursive: true });
  }
}, 60000);

test('crash-retained format6 WAL without SHM remains visible without changing source presence', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'inspection-crash-wal-'));
  const path = join(directory, 'runs.sqlite');
  const old = await createFormat5Fixture(path);
  await old.populate('queued');
  await old.close();
  expect(await old.worker.exited).toEqual({ code: 0, signal: null });
  expect(old.worker.stdoutClosed).toBe(true);
  expect(old.worker.stderrClosed).toBe(true);
  const ready = join(directory, 'ready');
  const module = join(import.meta.dir, 'migrate-writes.ts');
  const clockModule = join(import.meta.dir, '../testing/fixtures.ts');
  const program = `import {Database} from 'bun:sqlite';import {writeFileSync} from 'node:fs';import {upgradeSqliteWrites} from ${JSON.stringify(module)};import {FixtureClock} from ${JSON.stringify(clockModule)};const path=${JSON.stringify(path)};const probe=new Database(path);probe.query("SELECT schema_version FROM run_meta").get();await upgradeSqliteWrites({path,organizationId:'organization',capacity:1,leaseMilliseconds:100,clock:new FixtureClock(),maxBusyAttempts:3,busyDelayMilliseconds:1});writeFileSync(${JSON.stringify(ready)},'ready');await Bun.sleep(600000);probe.close();`;
  const child = Bun.spawn([process.execPath, '-e', program], { stdout: 'pipe', stderr: 'pipe' });
  const stdout = new Response(child.stdout).bytes();
  const stderr = new Response(child.stderr).bytes();
  let exited = false;
  try {
    const deadline = Date.now() + 20000;
    while (!existsSync(ready)) {
      if (Date.now() >= deadline) throw new Error('crash fixture readiness not observed');
      await Bun.sleep(2);
    }
    expect(readFileSync(ready, 'utf8')).toBe('ready');
    child.kill('SIGKILL');
    await child.exited;
    exited = true;
    expect(child.signalCode).toBe('SIGKILL');
    expect(await stdout).toHaveLength(0);
    expect(await stderr).toHaveLength(0);
    const copied = join(directory, 'crash-copy.sqlite');
    copyFileSync(path, copied);
    copyFileSync(path + '-wal', copied + '-wal');
    expect(existsSync(copied + '-shm')).toBe(false);
    const main = readFileSync(copied);
    const wal = readFileSync(copied + '-wal');
    await inspectFormat(
      { path: copied, maxBusyAttempts: 3, busyDelayMilliseconds: 1 },
      (database) => {
        expect(database.query('SELECT schema_version FROM run_meta').get()).toEqual({
          schema_version: 6,
        });
      },
    );
    expect(readFileSync(copied)).toEqual(main);
    expect(readFileSync(copied + '-wal')).toEqual(wal);
    expect(existsSync(copied + '-shm')).toBe(false);
    const opened = await openSqliteStores({
      path: copied,
      organizationId: organizationId('organization'),
      capacity: 1,
      leaseMilliseconds: 100,
      clock: new FixtureClock(),
      maxBusyAttempts: 3,
      busyDelayMilliseconds: 1,
    });
    try {
      expect((await opened.runs.readRun(runId('run'))).version).toBe(4);
    } finally {
      await opened.close();
    }
  } finally {
    if (!exited) {
      child.kill('SIGKILL');
      await child.exited;
      await Promise.all([stdout, stderr]);
    }
    rmSync(directory, { recursive: true });
  }
}, 60000);

for (const fault of ['history', 'configuration'] as const)
  test(
    'nonwal protected admission refuses ' + fault + ' before persistent conversion',
    async () => {
      const fixture = await inspectionFixture();
      const native = new Database(fixture.options.path);
      try {
        native.run('PRAGMA journal_mode=DELETE');
        if (fault === 'history') native.run('UPDATE run6_runtime_format SET scope_count=1');
      } finally {
        native.close();
      }
      let unexpected: Awaited<ReturnType<typeof openSqliteStores>> | undefined;
      await settleFixture(async () => {
        await rejects(
          openSqliteStores({
            ...fixture.options,
            capacity: fault === 'configuration' ? 2 : fixture.options.capacity,
          }).then((stores) => {
            unexpected = stores;
            return stores;
          }),
        );
        const after = new Database(fixture.options.path);
        try {
          expect(after.query('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'delete' });
        } finally {
          after.close();
        }
      }, [
        async () => {
          if (unexpected !== undefined) await unexpected.close();
        },
        () => {
          rmSync(fixture.directory, { recursive: true });
        },
      ]);
    },
  );

for (const fault of [
  'conversion',
  'configuration_close',
  'rollback',
  'conversion_and_close',
  'rollback_ignored',
  'audit_commit',
] as const)
  test(
    'nonwal configuration retains ' + fault + ' cause and exact native closure boundary',
    async () => {
      const fixture = await inspectionFixture();
      const native = new Database(fixture.options.path);
      native.run('PRAGMA journal_mode=DELETE');
      native.close();
      const sentinel = new Error('nonwal ' + fault + ' dependency');
      const rollback = new Error('nonwal rollback cleanup dependency');
      // eslint-disable-next-line @typescript-eslint/unbound-method -- Exact receiver-bound native operations are restored independently of assertions and cleanup.
      const run = Database.prototype.run;
      // eslint-disable-next-line @typescript-eslint/unbound-method -- Block exactly one actual configuration connection and close it through the saved native function before removing owned storage.
      const close = Database.prototype.close;
      let blocked: Database | undefined;
      let injected = false;
      let closed = false;
      let original: unknown;
      let unexpectedlyPublished: Awaited<ReturnType<typeof openSqliteStores>> | undefined;
      await settleFixture(async () => {
        Database.prototype.run = function (sql, ...parameters) {
          if (
            this.filename === fixture.options.path &&
            (fault === 'conversion' || fault === 'conversion_and_close') &&
            sql === 'PRAGMA journal_mode=WAL'
          ) {
            injected = true;
            throw sentinel;
          }
          if (
            this.filename === fixture.options.path &&
            ['rollback', 'rollback_ignored', 'audit_commit'].includes(fault) &&
            sql === 'COMMIT'
          ) {
            injected = true;
            throw sentinel;
          }
          if (this.filename === fixture.options.path && fault === 'rollback' && sql === 'ROLLBACK')
            throw rollback;
          if (
            this.filename === fixture.options.path &&
            fault === 'rollback_ignored' &&
            sql === 'ROLLBACK'
          )
            return { changes: 0, lastInsertRowid: 0 };
          return run.call(this, sql, ...parameters);
        };
        Database.prototype.close = function (...parameters) {
          if (
            this.filename === fixture.options.path &&
            ((fault === 'configuration_close' && !injected) || fault === 'conversion_and_close')
          ) {
            injected = true;
            // eslint-disable-next-line @typescript-eslint/no-this-alias -- Retain this exact native receiver until its controlled close is positively observed.
            blocked = this;
            throw fault === 'conversion_and_close' ? rollback : sentinel;
          }
          if (this.filename === fixture.options.path && fault === 'audit_commit')
            expect(this.inTransaction).toBe(false);
          close.apply(this, parameters);
          if (this.filename === fixture.options.path) closed = true;
        };
        try {
          unexpectedlyPublished = await openSqliteStores(fixture.options);
        } catch (cause) {
          original = cause;
        }
        expect(injected).toBe(true);
        expect(unexpectedlyPublished).toBeUndefined();
        expect(original).toBeInstanceOf(SqliteOpenError);
        const causes: unknown[] = [];
        function visit(cause: unknown) {
          causes.push(cause);
          if (cause instanceof AggregateError) for (const nested of cause.errors) visit(nested);
          if (cause instanceof Error && cause.cause !== undefined) visit(cause.cause);
        }
        visit(original);
        expect(causes.includes(sentinel)).toBe(true);
        if (fault === 'rollback' || fault === 'conversion_and_close')
          expect(causes.includes(rollback)).toBe(true);
        if (fault === 'rollback_ignored')
          expect(
            causes.some(
              (cause) =>
                cause instanceof Error &&
                cause.message === 'sqlite admission remains open after rollback',
            ),
          ).toBe(true);
        if (fault === 'configuration_close' || fault === 'conversion_and_close') {
          expect(closed).toBe(false);
          if (blocked === undefined) throw Error('blocked native connection absent');
          expect(blocked.query('SELECT schema_version FROM run_meta').get()).toEqual({
            schema_version: 6,
          });
          close.call(blocked);
          closed = true;
        }
        expect(closed).toBe(true);
        console.log(
          JSON.stringify({
            event: 'nonwal-configuration-boundary',
            fault,
            path: fixture.options.path,
            injected,
            closed,
          }),
        );
      }, [
        () => {
          Database.prototype.run = run;
          Database.prototype.close = close;
        },
        async () => {
          if (unexpectedlyPublished !== undefined) await unexpectedlyPublished.close();
          if (blocked !== undefined && !closed) {
            close.call(blocked);
            closed = true;
          }
        },
        () => {
          if (!closed)
            throw Error('native admission closure unestablished: ' + fixture.directory, {
              cause: original,
            });
          rmSync(fixture.directory, { recursive: true });
        },
      ]);
    },
  );
