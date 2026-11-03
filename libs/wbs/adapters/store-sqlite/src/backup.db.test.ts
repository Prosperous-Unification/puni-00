import * as filesystem from 'node:fs';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-restricted-imports -- this fixture observes actual acquired native clients and their exact close delegation; it never constructs another client
import { Database } from 'bun:sqlite';
import { describe, expect, it, spyOn } from 'bun:test';
import { sql } from 'drizzle-orm';

import {
  isSnapshotCleanupUnknown,
  restoreDatabase,
  snapshotDatabase,
  snapshotDatabaseBounded,
  verifySnapshot,
  verifySnapshotBounded,
} from './backup';
import * as connections from './db';
import { type Connection, openConnection } from './db';
import { runMigrations } from './migrate';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const SKELETON = '20260426171432_talented_smiling_tiger';

type ReadArguments =
  | Parameters<typeof filesystem.readSync>
  | [number, NodeJS.ArrayBufferView, number, number, filesystem.ReadPosition | null];
/** Delegates either actual node:fs overload without dropping the positional read arguments. */
function readOriginal(read: typeof filesystem.readSync, args: ReadArguments): number {
  if (args.length === 5) return read(...args);
  return read(...args);
}

function scratch(): string {
  return mkdtempSync(join(tmpdir(), 'wbs-backup-'));
}

/** A database at the pre-product skeleton ledger, with one marker row outside the schema. */
function skeletonDatabase(dir: string): string {
  const folder = join(dir, 'skeleton-drizzle');
  mkdirSync(folder);
  cpSync(join(FOLDER, SKELETON), join(folder, SKELETON), { recursive: true });
  const dbPath = join(dir, 'wbs.db');
  runMigrations(dbPath, folder);
  const connection = openConnection(dbPath);
  try {
    connection.db.run(sql.raw('CREATE TABLE backup_marker (v TEXT NOT NULL)'));
    connection.db.run(sql.raw("INSERT INTO backup_marker (v) VALUES ('before')"));
  } finally {
    connection.close();
  }
  return dbPath;
}

function markers(dbPath: string): string[] {
  const connection = openConnection(dbPath);
  try {
    return connection.db
      .all<{ v: string }>(sql.raw('SELECT v FROM backup_marker ORDER BY rowid'))
      .map(({ v }) => v);
  } finally {
    connection.close();
  }
}

describe('snapshotDatabase and restoreDatabase', () => {
  it('restores the pre-deploy database after a forward deploy migrated and wrote to it', () => {
    const dir = scratch();
    const dbPath = skeletonDatabase(dir);
    const snapshotPath = join(dir, 'backups', 'wbs-pre-deploy.db');

    const snapshot = snapshotDatabase(dbPath, snapshotPath);
    expect(snapshot.migrations).toEqual([SKELETON]);
    expect(snapshot.path).toBe(snapshotPath);

    runMigrations(dbPath, FOLDER);
    const connection = openConnection(dbPath);
    try {
      connection.db.run(sql.raw("INSERT INTO backup_marker (v) VALUES ('after')"));
    } finally {
      connection.close();
    }
    expect(markers(dbPath)).toEqual(['before', 'after']);

    const restore = restoreDatabase(snapshotPath, dbPath, '20260929T000000Z');

    expect(restore.displaced).toContain(`${dbPath}.displaced-20260929T000000Z`);
    expect(verifySnapshot(dbPath).migrations).toEqual([SKELETON]);
    expect(markers(dbPath)).toEqual(['before']);
    expect(existsSync(`${dbPath}.displaced-20260929T000000Z`)).toBe(true);
  });

  // Proof: leaving `-wal` out of restoreDatabase's displaced set made this
  // case fail (6 pass, 1 fail, 2026-09-29): the stale WAL stayed beside the
  // restored database instead of being moved aside.
  it('moves a live WAL and shared-memory file aside so SQLite cannot replay them', () => {
    const dir = scratch();
    const dbPath = skeletonDatabase(dir);
    const snapshotPath = join(dir, 'snapshot.db');
    snapshotDatabase(dbPath, snapshotPath);

    // A writer that died without checkpointing: its WAL holds the 'after' row.
    const writer = openConnection(dbPath);
    writer.db.run(sql.raw("INSERT INTO backup_marker (v) VALUES ('after')"));
    const walCopy = readFileSync(`${dbPath}-wal`);
    const shmCopy = readFileSync(`${dbPath}-shm`);
    writer.close();
    writeFileSync(`${dbPath}-wal`, walCopy);
    writeFileSync(`${dbPath}-shm`, shmCopy);
    expect(walCopy.byteLength).toBeGreaterThan(0);

    const restore = restoreDatabase(snapshotPath, dbPath, 'wal');

    expect(restore.displaced).toEqual([
      `${dbPath}.displaced-wal`,
      `${dbPath}-wal.displaced-wal`,
      `${dbPath}-shm.displaced-wal`,
    ]);
    expect(markers(dbPath)).toEqual(['before']);
  });

  it('refuses to overwrite an existing snapshot', () => {
    const dir = scratch();
    const dbPath = skeletonDatabase(dir);
    const snapshotPath = join(dir, 'taken.db');
    writeFileSync(snapshotPath, 'someone else');

    expect(() => snapshotDatabase(dbPath, snapshotPath)).toThrow(/already exists/);
    expect(readFileSync(snapshotPath, 'utf8')).toBe('someone else');
  });

  it('refuses an absent source without creating it', () => {
    const dir = scratch();
    const dbPath = join(dir, 'absent.db');

    expect(() => snapshotDatabase(dbPath, join(dir, 'copy.db'))).toThrow(/does not exist/);
    expect(existsSync(dbPath)).toBe(false);
  });

  it('refuses a source removed after preflight without recreating it', () => {
    const dir = scratch();
    const dbPath = skeletonDatabase(dir);
    const snapshotPath = join(dir, 'copy.db');
    const checkExists = filesystem.existsSync;
    // Preserve the real preflight observation, then remove its source before SQLite opens it.
    const preflight = spyOn(filesystem, 'existsSync').mockImplementation((path) => {
      const isPresent = checkExists(path);
      if (path === dbPath && isPresent) unlinkSync(dbPath);
      return isPresent;
    });
    try {
      expect(() => snapshotDatabase(dbPath, snapshotPath)).toThrow();
    } finally {
      preflight.mockRestore();
    }
    expect(existsSync(dbPath)).toBe(false);
    expect(existsSync(`${dbPath}-wal`)).toBe(false);
    expect(existsSync(`${dbPath}-shm`)).toBe(false);
    expect(existsSync(snapshotPath)).toBe(false);
    expect(existsSync(join(dir, '.copy.db.partial'))).toBe(false);
  });

  it('refuses to publish a copy without a migration ledger', () => {
    const dir = scratch();
    const dbPath = join(dir, 'bare.db');
    openConnection(dbPath).close();
    const snapshotPath = join(dir, 'bare-copy.db');

    expect(() => snapshotDatabase(dbPath, snapshotPath)).toThrow(/__drizzle_migrations/);
    expect(existsSync(snapshotPath)).toBe(false);
  });

  it('refuses a corrupted snapshot and leaves the database untouched', () => {
    const dir = scratch();
    const dbPath = skeletonDatabase(dir);
    const snapshotPath = join(dir, 'snapshot.db');
    snapshotDatabase(dbPath, snapshotPath);
    const bytes = readFileSync(snapshotPath);
    bytes.fill(0x5a, 4096, 8192);
    writeFileSync(snapshotPath, bytes);
    const before = readFileSync(dbPath);

    expect(() => restoreDatabase(snapshotPath, dbPath, 'stamp')).toThrow();
    expect(readFileSync(dbPath).equals(before)).toBe(true);
    expect(existsSync(`${dbPath}.displaced-stamp`)).toBe(false);
  });

  it('refuses a stamp whose displaced name is taken, before moving anything', () => {
    const dir = scratch();
    const dbPath = skeletonDatabase(dir);
    const snapshotPath = join(dir, 'snapshot.db');
    snapshotDatabase(dbPath, snapshotPath);
    writeFileSync(`${dbPath}.displaced-stamp`, 'earlier');

    expect(() => restoreDatabase(snapshotPath, dbPath, 'stamp')).toThrow(/already exist/);
    expect(verifySnapshot(dbPath).migrations).toEqual([SKELETON]);
  });
});

it('bounded snapshot verifies actual SQLite with streaming and preserved ledger', () => {
  const dir = scratch();
  const source = skeletonDatabase(dir);
  const path = join(dir, 'bounded.db');
  const limits = { maxBytes: 1073741824, deadline: performance.now() + 10000 };
  const snapshot = snapshotDatabaseBounded(source, path, limits);
  expect(snapshot.migrations).toEqual([SKELETON]);
  expect(verifySnapshotBounded(path, limits)).toEqual(snapshot);
  expect(markers(path)).toEqual(['before']);
});

it('bounded snapshot refuses actual 1GiB plus one metadata before SQLite or reads', () => {
  const path = join(scratch(), 'oversize.db');
  const descriptor = filesystem.openSync(path, 'wx', 0o600);
  filesystem.ftruncateSync(descriptor, 1073741825);
  filesystem.closeSync(descriptor);
  const open = spyOn(connections, 'openReadOnlyConnection');
  const read = spyOn(filesystem, 'readSync');
  try {
    expect(() =>
      verifySnapshotBounded(path, { maxBytes: 1073741824, deadline: performance.now() + 10000 }),
    ).toThrow(/byte limit/);
    expect(open).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  } finally {
    open.mockRestore();
    read.mockRestore();
  }
});

it('bounded snapshot refuses a produced partial copy over its ceiling before publication', () => {
  const dir = scratch();
  const source = skeletonDatabase(dir);
  const path = join(dir, 'small.db');
  expect(() =>
    snapshotDatabaseBounded(source, path, { maxBytes: 1, deadline: performance.now() + 10000 }),
  ).toThrow(/byte limit/);
  expect(existsSync(path)).toBe(false);
  expect(existsSync(join(dir, '.small.db.partial'))).toBe(true);
});

it('bounded snapshot validates closed limits and the original deadline', () => {
  const path = skeletonDatabase(scratch());
  for (const limits of [
    { maxBytes: 0, deadline: performance.now() + 10000 },
    { maxBytes: 1.5, deadline: performance.now() + 10000 },
    { maxBytes: Number.MAX_SAFE_INTEGER + 1, deadline: performance.now() + 10000 },
    { maxBytes: 1073741824, deadline: Infinity },
    { maxBytes: 1073741824, deadline: performance.now() - 1 },
    { maxBytes: 1073741824, deadline: performance.now() + 10000, extra: true },
  ])
    expect(() => verifySnapshotBounded(path, limits)).toThrow();
});

it('bounded snapshot refuses absent unreadable nonregular and malformed SQLite', () => {
  const dir = scratch();
  const limits = { maxBytes: 1073741824, deadline: performance.now() + 10000 };
  expect(() => verifySnapshotBounded(join(dir, 'absent'), limits)).toThrow();
  expect(() => verifySnapshotBounded(dir, limits)).toThrow();
  const path = join(dir, 'unreadable');
  writeFileSync(path, 'private', { mode: 0o000 });
  expect(() => verifySnapshotBounded(path, limits)).toThrow();
  filesystem.chmodSync(path, 0o600);
  expect(() => verifySnapshotBounded(path, limits)).toThrow();
});

it('bounded snapshot refuses missing empty and null-name ledgers', () => {
  const limits = { maxBytes: 1073741824, deadline: performance.now() + 10000 };
  for (const shape of ['missing', 'empty', 'null']) {
    const path = join(scratch(), 'ledger.db');
    const connection = openConnection(path);
    try {
      if (shape !== 'missing')
        connection.db.run(
          sql.raw('CREATE TABLE __drizzle_migrations (id INTEGER, created_at INTEGER, name TEXT)'),
        );
      if (shape === 'null')
        connection.db.run(sql.raw('INSERT INTO __drizzle_migrations VALUES (1,1,NULL)'));
    } finally {
      connection.close();
    }
    expect(() => verifySnapshotBounded(path, limits)).toThrow(/migration/);
  }
});

it('bounded snapshot refuses equal-byte pathname replacement during semantic open', () => {
  const path = skeletonDatabase(scratch());
  const bytes = readFileSync(path);
  const open = connections.openReadOnlyConnection;
  const semantic = spyOn(connections, 'openReadOnlyConnection').mockImplementation(
    (selected, logger) => {
      const connection = open(selected, logger);
      if (selected === path) {
        filesystem.renameSync(path, path + '.original');
        writeFileSync(path, bytes);
      }
      return connection;
    },
  );
  try {
    expect(() =>
      verifySnapshotBounded(path, { maxBytes: 1073741824, deadline: performance.now() + 10000 }),
    ).toThrow(/changed/);
  } finally {
    semantic.mockRestore();
  }
});

it('bounded snapshot refuses read failure and growth and closes held descriptions', () => {
  const path = skeletonDatabase(scratch());
  const read = filesystem.readSync;
  const fault = spyOn(filesystem, 'readSync').mockImplementation(() => {
    throw new Error('injected bounded read failure');
  });
  try {
    expect(() =>
      verifySnapshotBounded(path, { maxBytes: 1073741824, deadline: performance.now() + 10000 }),
    ).toThrow(/injected bounded read failure/);
  } finally {
    fault.mockRestore();
  }
  const grow = spyOn(filesystem, 'readSync').mockImplementation((...args: ReadArguments) => {
    filesystem.appendFileSync(path, 'growth');
    return readOriginal(read, args);
  });
  try {
    expect(() =>
      verifySnapshotBounded(path, { maxBytes: 1073741824, deadline: performance.now() + 10000 }),
    ).toThrow(/changed/);
  } finally {
    grow.mockRestore();
  }
});

for (const fault of ['file', 'parent', 'expiry'] as const)
  it(`bounded publication refuses ${fault} drift during the actual partial sync`, () => {
    const dir = scratch();
    const source = skeletonDatabase(dir);
    const folder = join(dir, 'publication');
    const path = join(folder, 'copy.db');
    const partial = join(folder, '.copy.db.partial');
    const limits = { maxBytes: 1073741824, deadline: performance.now() + 10000 };
    const sync = filesystem.fsyncSync;
    const now = performance.now.bind(performance);
    let expired = false;
    const clock = spyOn(performance, 'now').mockImplementation(() => now() + (expired ? 10001 : 0));
    let injected = false;
    const boundary = spyOn(filesystem, 'fsyncSync').mockImplementation((descriptor) => {
      sync(descriptor);
      if (injected || filesystem.readlinkSync(`/proc/self/fd/${String(descriptor)}`) !== partial)
        return;
      injected = true;
      if (fault === 'expiry') expired = true;
      else if (fault === 'file') {
        const bytes = readFileSync(partial);
        filesystem.renameSync(partial, partial + '.original');
        bytes[bytes.length - 1] ^= 1;
        writeFileSync(partial, bytes);
      } else {
        filesystem.renameSync(folder, folder + '.original');
        mkdirSync(folder);
        filesystem.linkSync(join(folder + '.original', '.copy.db.partial'), partial);
      }
    });
    try {
      expect(() => snapshotDatabaseBounded(source, path, limits)).toThrow(
        fault === 'expiry' ? /deadline/ : /changed/,
      );
      expect(injected).toBe(true);
      expect(existsSync(path)).toBe(false);
      expect(existsSync(partial)).toBe(true);
    } finally {
      boundary.mockRestore();
      clock.mockRestore();
    }
  });

it('bounded verification retains the primary and both delegated descriptor close failures', () => {
  const path = skeletonDatabase(scratch());
  const close = filesystem.closeSync;
  const held: number[] = [];
  const open = filesystem.openSync;
  const opened = spyOn(filesystem, 'openSync').mockImplementation(
    (...args: Parameters<typeof open>) => {
      const descriptor = open(...args);
      held.push(descriptor);
      return descriptor;
    },
  );
  const read = spyOn(filesystem, 'readSync').mockImplementation(() => {
    throw new Error('injected primary read');
  });
  const closed: number[] = [];
  const cleanup = spyOn(filesystem, 'closeSync').mockImplementation((descriptor) => {
    close(descriptor);
    closed.push(descriptor);
    throw new Error('injected delegated close');
  });
  try {
    let failure: unknown;
    try {
      verifySnapshotBounded(path, { maxBytes: 1073741824, deadline: performance.now() + 10000 });
    } catch (cause) {
      failure = cause;
    }
    expect(failure).toBeInstanceOf(AggregateError);
    if (!(failure instanceof AggregateError)) throw new Error('aggregate absent');
    const failures: readonly unknown[] = failure.errors;
    const primary = failures[0];
    if (!(primary instanceof Error)) throw new Error('primary read failure absent');
    expect(primary.message).toBe('injected primary read');
    expect(
      failures.flatMap((cause) => {
        if (!(cause instanceof AggregateError)) return [cause];
        const nested: readonly unknown[] = cause.errors;
        return nested;
      }),
    ).toHaveLength(3);
    expect(closed).toEqual([...held].reverse());
    for (const descriptor of held) expect(() => filesystem.fstatSync(descriptor)).toThrow();
  } finally {
    opened.mockRestore();
    read.mockRestore();
    cleanup.mockRestore();
  }
});

it('bounded verification streams a modest multi-MiB valid backup without whole-file allocation', () => {
  const source = skeletonDatabase(scratch());
  const writer = openConnection(source);
  try {
    writer.db.run(sql.raw('CREATE TABLE backup_payload (v BLOB)'));
    writer.db.run(sql.raw('INSERT INTO backup_payload VALUES (zeroblob(2500000))'));
  } finally {
    writer.close();
  }
  const lengths: number[] = [];
  const read = filesystem.readSync;
  const chunks = spyOn(filesystem, 'readSync').mockImplementation((...args: ReadArguments) => {
    lengths.push(args[1].byteLength);
    return readOriginal(read, args);
  });
  const whole = spyOn(filesystem, 'readFileSync').mockImplementation(() => {
    throw new Error('whole-file allocation forbidden');
  });
  try {
    const snapshot = verifySnapshotBounded(source, {
      maxBytes: 1073741824,
      deadline: performance.now() + 10000,
    });
    expect(snapshot.bytes).toBeGreaterThan(2097152);
    expect(lengths.length).toBeGreaterThan(2);
    expect(lengths.every((length) => length <= 1048576)).toBe(true);
  } finally {
    chunks.mockRestore();
    whole.mockRestore();
  }
});

for (const fault of ['parent', 'same-inode-bytes', 'short-count'] as const)
  it(`bounded verification refuses ${fault} drift through the actual semantic/read boundary`, () => {
    const dir = scratch();
    const path = skeletonDatabase(dir);
    const open = connections.openReadOnlyConnection;
    const read = filesystem.readSync;
    let injected = false;
    const semantic = spyOn(connections, 'openReadOnlyConnection').mockImplementation((...args) => {
      const connection = open(...args);
      if (!injected && fault === 'parent') {
        injected = true;
        filesystem.renameSync(dir, dir + '.original');
        mkdirSync(dir);
        filesystem.linkSync(join(dir + '.original', 'wbs.db'), path);
      }
      return connection;
    });
    const chunk = spyOn(filesystem, 'readSync').mockImplementation((...args: ReadArguments) => {
      if (fault === 'short-count') {
        injected = true;
        return 0;
      }
      const count = readOriginal(read, args);
      if (!injected && fault === 'same-inode-bytes') {
        injected = true;
        const bytes = readFileSync(path);
        bytes[bytes.length - 1] ^= 1;
        writeFileSync(path, bytes);
      }
      return count;
    });
    try {
      expect(() =>
        verifySnapshotBounded(path, { maxBytes: 1073741824, deadline: performance.now() + 10000 }),
      ).toThrow(fault === 'short-count' ? /streamed size/ : /changed/);
      expect(injected).toBe(true);
    } finally {
      semantic.mockRestore();
      chunk.mockRestore();
    }
  });

it('bounded final-return expiry still closes both original pinned descriptions', () => {
  const path = skeletonDatabase(scratch());
  const now = performance.now.bind(performance);
  let expired = false;
  const clock = spyOn(performance, 'now').mockImplementation(() => now() + (expired ? 10001 : 0));
  const close = filesystem.closeSync;
  const closed: number[] = [];
  const cleanup = spyOn(filesystem, 'closeSync').mockImplementation((descriptor) => {
    close(descriptor);
    closed.push(descriptor);
    expired = true;
  });
  try {
    expect(() =>
      verifySnapshotBounded(path, { maxBytes: 1073741824, deadline: performance.now() + 10000 }),
    ).toThrow(/deadline/);
    expect(closed).toHaveLength(2);
    for (const descriptor of closed) expect(() => filesystem.fstatSync(descriptor)).toThrow();
  } finally {
    cleanup.mockRestore();
    clock.mockRestore();
  }
});

it('bounded semantic primary survives the delegated actual SQLite connection close failure', () => {
  const path = join(scratch(), 'missing-ledger.db');
  openConnection(path).close();
  const open = connections.openReadOnlyConnection;
  let closed = false;
  const semantic = spyOn(connections, 'openReadOnlyConnection').mockImplementation((...args) => {
    const connection = open(...args);
    return {
      ...connection,
      close: () => {
        connection.close();
        closed = true;
        throw new Error('injected semantic cleanup');
      },
    };
  });
  try {
    let failure: unknown;
    try {
      verifySnapshotBounded(path, { maxBytes: 1073741824, deadline: performance.now() + 10000 });
    } catch (cause) {
      failure = cause;
    }
    expect(failure).toBeInstanceOf(AggregateError);
    if (!(failure instanceof AggregateError)) throw new Error('semantic aggregate absent');
    const failures: readonly unknown[] = failure.errors;
    const primary = failures[0];
    const cleanup = failures[1];
    if (!(primary instanceof Error) || !(cleanup instanceof Error))
      throw new Error('actual semantic/cleanup errors absent');
    expect(primary.message).toContain('__drizzle_migrations');
    expect(cleanup.message).toBe('injected semantic cleanup');
    expect(closed).toBe(true);
  } finally {
    semantic.mockRestore();
  }
});

type BoundedCloseFault = 'none' | 'before' | 'after';
interface BoundedOriginal {
  readonly kind: 'parent' | 'file';
  readonly descriptor: number;
  readonly receiver: typeof filesystem;
  readonly close: typeof filesystem.closeSync;
  readonly args: [number];
  attempts: number;
  entries: number;
  returns: number;
  retirementEntries: number;
  retirementReturns: number;
}

/** Captures actual acquisitions and delegation outcomes; fixture retirement never settles UNKNOWN. */
function captureBoundedClose(
  path: string,
  parentPath: string,
  fault: BoundedCloseFault,
  target: BoundedOriginal['kind'] = 'file',
) {
  const originals: BoundedOriginal[] = [];
  const primary = new Error('SC3 actual bounded read primary');
  const cleanup =
    target === 'parent' && fault === 'before'
      ? 'SC3 original bounded parent close primitive fault'
      : new Error(`SC3 original bounded ${target} close fault`);
  const open = filesystem.openSync;
  const close = filesystem.closeSync;
  const read = filesystem.readSync;
  let reads = 0;
  const opened = spyOn(filesystem, 'openSync').mockImplementation(
    (...args: Parameters<typeof open>) => {
      const descriptor = open(...args);
      if (args[0] === parentPath || args[0] === path)
        originals.push({
          kind: args[0] === parentPath ? 'parent' : 'file',
          descriptor,
          receiver: filesystem,
          close,
          args: [descriptor],
          attempts: 0,
          entries: 0,
          returns: 0,
          retirementEntries: 0,
          retirementReturns: 0,
        });
      return descriptor;
    },
  );
  const chunk = spyOn(filesystem, 'readSync').mockImplementation((...args: ReadArguments) => {
    readOriginal(read, args);
    reads += 1;
    throw primary;
  });
  const closed: BoundedOriginal[] = [];
  const closing = spyOn(filesystem, 'closeSync').mockImplementation((descriptor) => {
    const original = originals.find((acquired) => acquired.descriptor === descriptor);
    if (original === undefined) {
      close(descriptor);
      return;
    }
    original.attempts += 1;
    closed.push(original);
    if (original.attempts !== 1)
      throw new Error('SC3 duplicate original close attempt refused', { cause: original });
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- this reviewed fixture preserves the exact Error or parent-before primitive cleanup outcome; wrapping would change its identity
    if (original.kind === target && fault === 'before') throw cleanup;
    original.entries += 1;
    original.close.call(original.receiver, ...original.args);
    original.returns += 1;
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- this reviewed fixture preserves the exact Error or parent-before primitive cleanup outcome; wrapping would change its identity
    if (original.kind === target && fault === 'after') throw cleanup;
  });
  return {
    originals,
    closed,
    primary,
    cleanup,
    close,
    get reads() {
      return reads;
    },
    /** Runs after production assertions, including assertion failure; never retries an entered close. */
    retire: () => {
      opened.mockRestore();
      chunk.mockRestore();
      closing.mockRestore();
      if (
        originals.length !== 2 ||
        originals[0]?.kind !== 'parent' ||
        originals[1]?.kind !== 'file' ||
        originals[0].descriptor === originals[1].descriptor
      )
        throw new Error('SC3 STOP: bounded original roster is not two distinct live descriptors', {
          cause: { originals, closed, primary, cleanup },
        });
      for (const original of originals) {
        if (
          original.entries !== original.returns ||
          original.retirementEntries !== original.retirementReturns
        )
          throw new Error(
            'SC3 STOP: original native close entered without return; retain evidence',
            {
              cause: { originals, closed, primary, cleanup },
            },
          );
        if (
          original.returns + original.retirementReturns !== 1 &&
          !(
            fault === 'before' &&
            original.kind === target &&
            original.attempts === 1 &&
            original.entries === 0 &&
            original.retirementEntries === 0
          )
        )
          throw new Error('SC3 STOP: original has no authorized first-delegation retirement', {
            cause: { originals, closed, primary, cleanup },
          });
      }
      for (const original of originals) {
        if (original.returns + original.retirementReturns === 1) continue;
        original.retirementEntries += 1;
        try {
          original.close.call(original.receiver, ...original.args);
        } catch (cause) {
          throw new Error('SC3 STOP: fixture first native close did not return; retain evidence', {
            // eslint-disable-next-line preserve-caught-error -- STOP retains the exact caught failure with its original native/ledger evidence in this cause object
            cause: { original, originals, closed, primary, cleanup, failure: cause },
          });
        }
        original.retirementReturns += 1;
      }
      const expectedRetirement =
        target === 'parent' && fault === 'before'
          ? [
              [1, 1],
              [0, 0],
            ]
          : fault === 'before'
            ? [
                [0, 0],
                [1, 1],
              ]
            : [
                [0, 0],
                [0, 0],
              ];
      expect(
        originals.map((original) => [original.retirementEntries, original.retirementReturns]),
      ).toEqual(expectedRetirement);
    },
  };
}

it('SC3 bounded file cleanup preserves exact read primary when both original closes return', () => {
  const dir = scratch();
  const path = skeletonDatabase(dir);
  const fixture = captureBoundedClose(path, dir, 'none');
  try {
    let observed: unknown;
    try {
      verifySnapshotBounded(path, { maxBytes: 1073741824, deadline: performance.now() + 10000 });
    } catch (cause) {
      observed = cause;
    }
    expect(observed).toBe(fixture.primary);
    expect(isSnapshotCleanupUnknown(observed)).toBe(false);
    expect(fixture.reads).toBe(1);
    expect(fixture.originals.map((original) => original.kind)).toEqual(['parent', 'file']);
    expect(fixture.closed).toEqual([...fixture.originals].reverse());
    expect(
      fixture.originals.map((original) => [original.attempts, original.entries, original.returns]),
    ).toEqual([
      [1, 1, 1],
      [1, 1, 1],
    ]);
  } finally {
    fixture.retire();
  }
});

it('SC3 bounded file cleanup classifies original file close throwing before delegation', () => {
  const dir = scratch();
  const path = skeletonDatabase(dir);
  const fixture = captureBoundedClose(path, dir, 'before');
  try {
    let observed: unknown;
    try {
      verifySnapshotBounded(path, { maxBytes: 1073741824, deadline: performance.now() + 10000 });
    } catch (cause) {
      observed = cause;
    }
    expect(observed).toBeInstanceOf(AggregateError);
    if (!(observed instanceof AggregateError)) throw new Error('SC3 original attribution absent');
    expect(observed.errors).toEqual([fixture.primary, fixture.cleanup]);
    expect(observed.errors[0]).toBe(fixture.primary);
    expect(observed.errors[1]).toBe(fixture.cleanup);
    expect(fixture.reads).toBe(1);
    expect(fixture.originals.map((original) => original.kind)).toEqual(['parent', 'file']);
    expect(fixture.closed).toEqual([...fixture.originals].reverse());
    expect(
      fixture.originals.map((original) => [original.attempts, original.entries, original.returns]),
    ).toEqual([
      [1, 1, 1],
      [1, 0, 0],
    ]);
    for (const original of fixture.originals) {
      expect(original.close).toBe(fixture.close);
      expect(original.receiver).toBe(filesystem);
      expect(original.args).toEqual([original.descriptor]);
    }
    expect(isSnapshotCleanupUnknown(observed)).toBe(true);
  } finally {
    fixture.retire();
  }
});

it('SC3 bounded file cleanup classifies spy throw after original file close returns', () => {
  const dir = scratch();
  const path = skeletonDatabase(dir);
  const fixture = captureBoundedClose(path, dir, 'after');
  try {
    let observed: unknown;
    try {
      verifySnapshotBounded(path, { maxBytes: 1073741824, deadline: performance.now() + 10000 });
    } catch (cause) {
      observed = cause;
    }
    expect(observed).toBeInstanceOf(AggregateError);
    if (!(observed instanceof AggregateError)) throw new Error('SC3 original attribution absent');
    expect(observed.errors).toEqual([fixture.primary, fixture.cleanup]);
    expect(observed.errors[0]).toBe(fixture.primary);
    expect(observed.errors[1]).toBe(fixture.cleanup);
    expect(fixture.reads).toBe(1);
    expect(fixture.originals.map((original) => original.kind)).toEqual(['parent', 'file']);
    expect(fixture.closed).toEqual([...fixture.originals].reverse());
    expect(
      fixture.originals.map((original) => [original.attempts, original.entries, original.returns]),
    ).toEqual([
      [1, 1, 1],
      [1, 1, 1],
    ]);
    for (const original of fixture.originals) {
      expect(original.close).toBe(fixture.close);
      expect(original.receiver).toBe(filesystem);
      expect(original.args).toEqual([original.descriptor]);
    }
    expect(isSnapshotCleanupUnknown(observed)).toBe(true);
  } finally {
    fixture.retire();
  }
});

interface SourceNativeCall {
  readonly original: Database['close'];
  readonly receiver: Database;
  readonly args: Parameters<Database['close']>;
  readonly phase: 'production' | 'fixture-retirement';
  entered: boolean;
  returned: boolean;
}
interface SourceOriginal {
  readonly connection: Connection;
  readonly client: Database;
  readonly opener: typeof connections.openExistingConnection;
  readonly openReceiver: unknown;
  readonly openArgs: Parameters<typeof connections.openExistingConnection>;
  readonly close: Connection['close'];
  readonly receiver: Connection;
  readonly args: [];
  readonly nativeCalls: SourceNativeCall[];
  readonly vacuum: {
    receiver: Connection['db'];
    args: Parameters<Connection['db']['run']>;
    returned: boolean;
  }[];
  readonly closeCalls: { receiver: Connection; args: [] }[];
  attempts: number;
  entries: number;
  returns: number;
  retirementEntries: number;
  retirementReturns: number;
}

/** Observes the actual source Connection and native close; no opener or SQL is manufactured. */
function captureSourceClose(fault: 'before' | 'after') {
  const originals: SourceOriginal[] = [];
  const acquiredConnections: Connection[] = [];
  const cleanup = new Error('SC3 actual source connection close refusal');
  const open = connections.openExistingConnection;
  const openSemantic = connections.openReadOnlyConnection;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- recorded native delegates always use their captured Database receiver and actual argument tuple
  const nativeClose = Database.prototype.close;
  const restorations: (() => void)[] = [];
  let semanticEntries = 0;
  let retiring = false;
  const native = spyOn(Database.prototype, 'close').mockImplementation(function (
    this: Database,
    ...args: Parameters<Database['close']>
  ) {
    const original = originals.find((acquired) => acquired.client === this);
    if (original === undefined) {
      nativeClose.apply(this, args);
      return;
    }
    const call: SourceNativeCall = {
      original: nativeClose,
      receiver: this,
      args,
      phase: retiring ? 'fixture-retirement' : 'production',
      entered: false,
      returned: false,
    };
    original.nativeCalls.push(call);
    if (original.nativeCalls.some((previous) => previous !== call && previous.entered))
      throw new Error('SC3 STOP: source native close would be delegated twice', {
        cause: { original, call, acquiredConnections, originals },
      });
    call.entered = true;
    call.original.apply(call.receiver, call.args);
    call.returned = true;
  });
  const semantic = spyOn(connections, 'openReadOnlyConnection').mockImplementation(function (
    this: unknown,
    ...args: Parameters<typeof openSemantic>
  ) {
    semanticEntries += 1;
    return openSemantic.apply(this, args);
  });
  const opened = spyOn(connections, 'openExistingConnection').mockImplementation(function (
    this: unknown,
    ...args: Parameters<typeof open>
  ) {
    const connection = open.apply(this, args);
    acquiredConnections.push(connection);
    if (!('$client' in connection.db) || !(connection.db.$client instanceof Database))
      throw new Error('SC3 STOP: actual source native client absent', {
        cause: { connection, acquiredConnections, originals },
      });
    const original: SourceOriginal = {
      connection,
      client: connection.db.$client,
      opener: open,
      openReceiver: this,
      openArgs: args,

      close: connection.close,
      receiver: connection,
      args: [],
      nativeCalls: [],
      vacuum: [],
      closeCalls: [],
      attempts: 0,
      entries: 0,
      returns: 0,
      retirementEntries: 0,
      retirementReturns: 0,
    };
    originals.push(original);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- the real Drizzle method is forwarded with its observed receiver and unchanged SQL arguments
    const run = connection.db.run;
    const statement = spyOn(connection.db, 'run').mockImplementation(function (
      this: Connection['db'],
      ...sqlArgs: Parameters<Connection['db']['run']>
    ) {
      const call = { receiver: this, args: sqlArgs, returned: false };
      original.vacuum.push(call);
      const value = run.apply(this, sqlArgs);
      call.returned = true;
      return value;
    });
    const closing = spyOn(connection, 'close').mockImplementation(function (
      this: Connection,
      ...closeArgs: []
    ) {
      original.attempts += 1;
      original.closeCalls.push({ receiver: this, args: closeArgs });
      if (original.attempts !== 1)
        throw new Error('SC3 source duplicate close intercepted before delegation', {
          cause: original,
        });
      if (fault === 'before') throw cleanup;
      original.entries += 1;
      original.close.call(this, ...closeArgs);
      original.returns += 1;
      throw cleanup;
    });
    restorations.push(
      () => {
        statement.mockRestore();
      },
      () => {
        closing.mockRestore();
      },
    );
    return connection;
  });
  return {
    originals,
    acquiredConnections,
    cleanup,
    open,
    nativeClose,
    get semanticEntries() {
      return semanticEntries;
    },
    /** First fixture delegation follows production assertions; unknown native outcomes remain STOP. */
    retire: () => {
      try {
        const original = originals.at(0);
        if (
          acquiredConnections.length !== 1 ||
          originals.length !== 1 ||
          original === undefined ||
          original.connection !== acquiredConnections.at(0) ||
          original.attempts !== 1 ||
          original.entries !== original.returns ||
          original.retirementEntries !== 0 ||
          original.nativeCalls.some((call) => call.entered && !call.returned) ||
          (fault === 'before' && (original.entries !== 0 || original.nativeCalls.length !== 0)) ||
          (fault === 'after' &&
            (original.entries !== 1 ||
              original.nativeCalls.length !== 1 ||
              !original.nativeCalls.at(0)?.returned))
        )
          throw new Error('SC3 STOP: source original has no known one-shot retirement', {
            cause: { acquiredConnections, originals, cleanup, fault },
          });
        if (fault === 'before') {
          retiring = true;
          original.retirementEntries += 1;
          try {
            original.close.call(original.receiver, ...original.args);
          } catch (cause) {
            throw new Error('SC3 STOP: first source fixture close did not return', {
              // eslint-disable-next-line preserve-caught-error -- the exact caught failure remains with its original native and Connection evidence
              cause: { failure: cause, acquiredConnections, originals, cleanup },
            });
          }
          original.retirementReturns += 1;
        }
        expect(original.retirementEntries).toBe(fault === 'before' ? 1 : 0);
        expect(original.retirementReturns).toBe(fault === 'before' ? 1 : 0);
        expect(original.nativeCalls).toHaveLength(1);
        expect(original.nativeCalls.at(0)?.original).toBe(nativeClose);
        expect(original.nativeCalls.at(0)?.receiver).toBe(original.client);
        expect(original.nativeCalls.at(0)?.args).toEqual([]);
        expect(original.nativeCalls.at(0)?.entered).toBe(true);
        expect(original.nativeCalls.at(0)?.returned).toBe(true);
        expect(original.nativeCalls.at(0)?.phase).toBe(
          fault === 'before' ? 'fixture-retirement' : 'production',
        );
      } finally {
        opened.mockRestore();
        semantic.mockRestore();
        for (const restore of restorations) restore();
        native.mockRestore();
      }
    },
  };
}

it('SC3 source connection cleanup refuses before delegation', () => {
  const dir = scratch();
  const path = skeletonDatabase(dir);
  const finalPath = join(dir, 'source-copy.db');
  const partialPath = join(dir, '.source-copy.db.partial');
  const fixture = captureSourceClose('before');
  try {
    let observed: unknown;
    try {
      snapshotDatabase(path, finalPath);
    } catch (cause) {
      observed = cause;
    }
    expect(fixture.originals).toHaveLength(1);
    const original = fixture.originals.at(0);
    if (original === undefined) throw new Error('SC3 captured source original absent');
    expect(original.opener).toBe(fixture.open);
    expect(original.openArgs).toEqual([path]);
    expect('$client' in original.connection.db && original.connection.db.$client).toBe(
      original.client,
    );
    expect(original.receiver).toBe(original.connection);
    expect(original.args).toEqual([]);
    expect(original.vacuum).toHaveLength(1);
    expect(original.vacuum.at(0)?.receiver).toBe(original.connection.db);
    expect(original.vacuum.at(0)?.returned).toBe(true);
    expect(original.closeCalls).toHaveLength(1);
    expect(original.closeCalls.at(0)?.receiver).toBe(original.connection);
    expect(original.closeCalls.at(0)?.args).toEqual([]);
    expect(original.attempts).toBe(1);
    expect(original.entries).toBe(0);
    expect(original.returns).toBe(0);
    expect(original.nativeCalls).toHaveLength(0);
    expect(original.retirementEntries).toBe(0);
    expect(original.retirementReturns).toBe(0);
    expect(fixture.semanticEntries).toBe(0);
    expect(existsSync(partialPath)).toBe(true);
    expect(existsSync(finalPath)).toBe(false);
    expect(observed).toBeInstanceOf(AggregateError);
    if (!(observed instanceof AggregateError)) throw new Error('SC3 source attribution absent');
    expect(observed.errors).toEqual([fixture.cleanup]);
    expect(observed.errors[0]).toBe(fixture.cleanup);
    expect(isSnapshotCleanupUnknown(observed)).toBe(true);
  } finally {
    fixture.retire();
  }
});

it('SC3 source connection cleanup refuses after native return', () => {
  const dir = scratch();
  const path = skeletonDatabase(dir);
  const finalPath = join(dir, 'source-copy.db');
  const partialPath = join(dir, '.source-copy.db.partial');
  const fixture = captureSourceClose('after');
  try {
    let observed: unknown;
    try {
      snapshotDatabase(path, finalPath);
    } catch (cause) {
      observed = cause;
    }
    expect(fixture.originals).toHaveLength(1);
    const original = fixture.originals.at(0);
    if (original === undefined) throw new Error('SC3 captured source original absent');
    expect(original.opener).toBe(fixture.open);
    expect(original.openArgs).toEqual([path]);
    expect('$client' in original.connection.db && original.connection.db.$client).toBe(
      original.client,
    );
    expect(original.receiver).toBe(original.connection);
    expect(original.args).toEqual([]);
    expect(original.vacuum).toHaveLength(1);
    expect(original.vacuum.at(0)?.receiver).toBe(original.connection.db);
    expect(original.vacuum.at(0)?.returned).toBe(true);
    expect(original.closeCalls).toHaveLength(1);
    expect(original.closeCalls.at(0)?.receiver).toBe(original.connection);
    expect(original.closeCalls.at(0)?.args).toEqual([]);
    expect(original.attempts).toBe(1);
    expect(original.entries).toBe(1);
    expect(original.returns).toBe(1);
    expect(original.nativeCalls).toHaveLength(1);
    expect(original.nativeCalls.at(0)?.original).toBe(fixture.nativeClose);
    expect(original.nativeCalls.at(0)?.receiver).toBe(original.client);
    expect(original.nativeCalls.at(0)?.args).toEqual([]);
    expect(original.nativeCalls.at(0)?.entered).toBe(true);
    expect(original.nativeCalls.at(0)?.returned).toBe(true);
    expect(original.nativeCalls.at(0)?.phase).toBe('production');
    expect(original.retirementEntries).toBe(0);
    expect(original.retirementReturns).toBe(0);
    expect(fixture.semanticEntries).toBe(0);
    expect(existsSync(partialPath)).toBe(true);
    expect(existsSync(finalPath)).toBe(false);
    expect(observed).toBeInstanceOf(AggregateError);
    if (!(observed instanceof AggregateError)) throw new Error('SC3 source attribution absent');
    expect(observed.errors).toEqual([fixture.cleanup]);
    expect(observed.errors[0]).toBe(fixture.cleanup);
    expect(isSnapshotCleanupUnknown(observed)).toBe(true);
  } finally {
    fixture.retire();
  }
});

it('SC3 semantic connection cleanup refuses before delegation', () => {
  const dir = scratch();
  const path = skeletonDatabase(dir);
  const bytes = readFileSync(path);
  const cleanup = new Error('SC3 original semantic close refusal');
  const open = connections.openReadOnlyConnection;
  const openDescriptor = filesystem.openSync;
  const closeDescriptor = filesystem.closeSync;
  const descriptors: BoundedOriginal[] = [];
  const descriptorOrder: BoundedOriginal[] = [];
  const events: string[] = [];
  const retainedConnections: connections.Connection[] = [];
  const acquisitions: {
    readonly returnedConnection: connections.Connection;
    readonly original: connections.Connection['close'];
    readonly receiver: connections.Connection;
    readonly args: [];
    readonly client: { close: (...args: unknown[]) => unknown };
    readonly nativeClose: (...args: unknown[]) => unknown;
    queryOutcomes: () => unknown[];
    restoreConnection: () => void;
    restoreNative: () => void;
    phase: 'production' | 'fixture';
    fixtureNativeAttempts: number;
    fixtureNativeEntries: number;
    fixtureNativeReturns: number;
    fixtureNativeReceiver: unknown;
    fixtureNativeArgs: unknown[];
    attempts: number;
    entries: number;
    returns: number;
    nativeAttempts: number;
    nativeEntries: number;
    nativeReturns: number;
    retirementEntries: number;
    retirementReturns: number;
    attemptedReceiver: unknown;
    attemptedArgs: unknown[];
    nativeReceiver: unknown;
    nativeArgs: unknown[];
  }[] = [];
  const opened = spyOn(filesystem, 'openSync').mockImplementation(
    (...args: Parameters<typeof openDescriptor>) => {
      const descriptor = openDescriptor(...args);
      if (args[0] === dir || args[0] === path)
        descriptors.push({
          kind: args[0] === dir ? 'parent' : 'file',
          descriptor,
          receiver: filesystem,
          close: closeDescriptor,
          args: [descriptor],
          attempts: 0,
          entries: 0,
          returns: 0,
          retirementEntries: 0,
          retirementReturns: 0,
        });
      return descriptor;
    },
  );
  const closed = spyOn(filesystem, 'closeSync').mockImplementation((descriptor) => {
    const acquired = descriptors.find((original) => original.descriptor === descriptor);
    if (acquired === undefined) {
      closeDescriptor(descriptor);
      return;
    }
    acquired.attempts += 1;
    descriptorOrder.push(acquired);
    events.push(acquired.kind);
    if (acquired.attempts !== 1) throw new Error('SC3 duplicate sibling close refused');
    acquired.entries += 1;
    acquired.close.call(acquired.receiver, ...acquired.args);
    acquired.returns += 1;
  });
  const semantic = spyOn(connections, 'openReadOnlyConnection').mockImplementation((...args) => {
    const returnedConnection = open(...args);
    retainedConnections.push(returnedConnection);
    // Tests inspect Drizzle's actual native boundary without replacing the returned Connection.
    const client = (
      returnedConnection.db as connections.Drizzle & {
        $client: { close: (...args: unknown[]) => unknown };
      }
    ).$client;
    const original = returnedConnection.close;
    const nativeClose = client.close;
    const acquired: (typeof acquisitions)[number] = {
      returnedConnection,
      original,
      receiver: returnedConnection,
      args: [],
      client,
      nativeClose,
      queryOutcomes: () => {
        throw new Error('SC3 query observer not installed');
      },
      restoreConnection: () => undefined,
      restoreNative: () => undefined,
      phase: 'production',
      fixtureNativeAttempts: 0,
      fixtureNativeEntries: 0,
      fixtureNativeReturns: 0,
      fixtureNativeReceiver: undefined,
      fixtureNativeArgs: [],
      attempts: 0,
      entries: 0,
      returns: 0,
      nativeAttempts: 0,
      nativeEntries: 0,
      nativeReturns: 0,
      retirementEntries: 0,
      retirementReturns: 0,
      attemptedReceiver: undefined,
      attemptedArgs: [],
      nativeReceiver: undefined,
      nativeArgs: [],
    };
    acquisitions.push(acquired);
    const queries = spyOn(returnedConnection.db, 'all');
    acquired.queryOutcomes = () => queries.mock.results.map((outcome) => outcome.value);
    acquired.restoreConnection = () => {
      queries.mockRestore();
    };
    const native = spyOn(client, 'close').mockImplementation(function (
      this: typeof client,
      ...args
    ) {
      if (acquired.phase === 'fixture') {
        acquired.fixtureNativeAttempts += 1;
        if (acquired.nativeEntries !== 0 || acquired.fixtureNativeAttempts !== 1)
          throw new Error('SC3 STOP: repeated native entry refused', {
            cause: { retainedConnections, acquisitions, descriptors, events },
          });
        acquired.fixtureNativeReceiver = this;
        acquired.fixtureNativeArgs = args;
        acquired.fixtureNativeEntries += 1;
        const returned = nativeClose.apply(this, args);
        acquired.fixtureNativeReturns += 1;
        return returned;
      }
      acquired.nativeAttempts += 1;
      if (acquired.nativeAttempts !== 1)
        throw new Error('SC3 STOP: repeated production native entry refused', {
          cause: { retainedConnections, acquisitions, descriptors, events },
        });
      acquired.nativeEntries += 1;
      acquired.nativeReceiver = this;
      acquired.nativeArgs = args;
      const returned = nativeClose.apply(this, args);
      acquired.nativeReturns += 1;
      return returned;
    });
    acquired.restoreNative = () => {
      native.mockRestore();
    };
    const closing = spyOn(returnedConnection, 'close').mockImplementation(function (
      this: connections.Connection,
      ...args: []
    ) {
      acquired.attempts += 1;
      acquired.attemptedReceiver = this;
      acquired.attemptedArgs = args;
      events.push('semantic');
      if (acquired.attempts !== 1) throw new Error('SC3 duplicate semantic close refused');
      throw cleanup;
    });
    acquired.restoreConnection = () => {
      closing.mockRestore();
      queries.mockRestore();
    };
    return returnedConnection;
  });
  try {
    let observed: unknown;
    try {
      verifySnapshotBounded(path, { maxBytes: 1073741824, deadline: performance.now() + 10000 });
    } catch (cause) {
      observed = cause;
    }
    expect(semantic).toHaveBeenCalledTimes(1);
    expect(semantic.mock.calls).toEqual([[path]]);
    expect(retainedConnections).toHaveLength(1);
    expect(acquisitions).toHaveLength(1);
    expect(retainedConnections[0]).toBe(acquisitions[0]?.returnedConnection);
    const acquired = acquisitions.at(0);
    if (acquired === undefined) throw new Error('SC3 actual semantic acquisition absent');
    expect(semantic.mock.results[0]?.value).toBe(acquired.returnedConnection);
    expect(acquired.receiver).toBe(acquired.returnedConnection);
    expect(acquired.original).not.toBe(acquired.returnedConnection.close);
    expect(acquired.nativeClose).not.toBe(acquired.client.close);
    expect(acquired.args).toEqual([]);
    expect(acquired.attemptedReceiver).toBe(acquired.receiver);
    expect(acquired.attemptedArgs).toEqual(acquired.args);
    expect(acquired.queryOutcomes()).toEqual([
      [{ integrity_check: 'ok' }],
      [{ name: '__drizzle_migrations' }],
      [{ name: SKELETON }],
    ]);
    expect([acquired.attempts, acquired.entries, acquired.returns]).toEqual([1, 0, 0]);
    expect([acquired.nativeAttempts, acquired.nativeEntries, acquired.nativeReturns]).toEqual([
      0, 0, 0,
    ]);
    expect(acquired.nativeReceiver).toBeUndefined();
    expect(acquired.nativeArgs).toEqual([]);
    expect(observed).toBeInstanceOf(AggregateError);
    if (!(observed instanceof AggregateError)) throw new Error('SC3 semantic attribution absent');
    expect(observed.errors).toEqual([cleanup]);
    expect(observed.errors[0]).toBe(cleanup);
    expect(isSnapshotCleanupUnknown(observed)).toBe(true);
    expect(descriptors.map((original) => original.kind)).toEqual(['parent', 'file']);
    expect(descriptorOrder).toEqual([...descriptors].reverse());
    expect(events).toEqual(['semantic', 'file', 'parent']);
    expect(
      descriptors.map((original) => [original.attempts, original.entries, original.returns]),
    ).toEqual([
      [1, 1, 1],
      [1, 1, 1],
    ]);
    for (const original of descriptors) {
      expect(original.close).toBe(closeDescriptor);
      expect(original.receiver).toBe(filesystem);
      expect(original.args).toEqual([original.descriptor]);
    }
    expect(readFileSync(path).equals(bytes)).toBe(true);
    expect(existsSync(join(dir, '.wbs.db.partial'))).toBe(false);
  } finally {
    semantic.mockRestore();
    opened.mockRestore();
    closed.mockRestore();
    for (const acquired of acquisitions) acquired.restoreConnection();
    // Validate every outcome before any fixture close; ambiguity preserves all evidence.
    if (retainedConnections.length !== acquisitions.length)
      // eslint-disable-next-line no-unsafe-finally -- ambiguous native outcome requires STOP with retained ledger evidence before any further fixture cleanup
      throw new Error('SC3 STOP: acquired Connection lacks a complete native ledger', {
        cause: { retainedConnections, acquisitions, descriptors, events },
      });
    for (const acquired of acquisitions) {
      if (
        acquired.entries !== acquired.returns ||
        acquired.nativeEntries !== acquired.nativeReturns
      )
        // eslint-disable-next-line no-unsafe-finally -- ambiguous native outcome requires STOP with retained ledger evidence before any further fixture cleanup
        throw new Error('SC3 STOP: semantic close entered without return; retain evidence', {
          cause: { retainedConnections, acquisitions, descriptors, events },
        });
      if (acquired.returns !== 1 && !(acquired.entries === 0 && acquired.nativeEntries === 0))
        // eslint-disable-next-line no-unsafe-finally -- ambiguous native outcome requires STOP with retained ledger evidence before any further fixture cleanup
        throw new Error('SC3 STOP: semantic close lacks first-entry authority', {
          cause: { retainedConnections, acquisitions, descriptors, events },
        });
    }
    for (const original of descriptors)
      if (original.entries !== original.returns || original.returns !== 1)
        // eslint-disable-next-line no-unsafe-finally -- ambiguous native outcome requires STOP with retained ledger evidence before any further fixture cleanup
        throw new Error('SC3 STOP: sibling outcome unsupported; retain evidence', {
          cause: { retainedConnections, acquisitions, descriptors, events },
        });
    for (const acquired of acquisitions) {
      if (acquired.returns === 1) continue;
      acquired.phase = 'fixture';
      acquired.retirementEntries += 1;
      try {
        acquired.original.call(acquired.receiver, ...acquired.args);
      } catch (cause) {
        // eslint-disable-next-line no-unsafe-finally -- ambiguous native outcome requires STOP with retained ledger evidence before any further fixture cleanup
        throw new Error('SC3 STOP: first fixture semantic close did not return; retain evidence', {
          // eslint-disable-next-line preserve-caught-error -- STOP retains the exact caught failure and acquired originals in its cause object
          cause: { retainedConnections, acquisitions, descriptors, events, failure: cause },
        });
      }
      acquired.retirementReturns += 1;
    }
    for (const acquired of acquisitions) {
      if (
        acquired.fixtureNativeEntries !== acquired.fixtureNativeReturns ||
        acquired.nativeReturns + acquired.fixtureNativeReturns !== 1
      )
        // eslint-disable-next-line no-unsafe-finally -- ambiguous native outcome requires STOP with retained ledger evidence before any further fixture cleanup
        throw new Error('SC3 STOP: native retirement lacks one known return; retain evidence', {
          cause: { retainedConnections, acquisitions, descriptors, events },
        });
      acquired.restoreNative();
    }
    expect(
      acquisitions.map((acquired) => [
        acquired.fixtureNativeAttempts,
        acquired.fixtureNativeEntries,
        acquired.fixtureNativeReturns,
      ]),
    ).toEqual([[1, 1, 1]]);
    for (const acquired of acquisitions) {
      expect(acquired.fixtureNativeReceiver).toBe(acquired.client);
      expect(acquired.fixtureNativeArgs).toEqual([]);
    }
    expect(
      acquisitions.map((acquired) => [acquired.retirementEntries, acquired.retirementReturns]),
    ).toEqual([[1, 1]]);
  }
});

it('SC3 semantic connection cleanup refuses after native return', () => {
  const dir = scratch();
  const path = skeletonDatabase(dir);
  const bytes = readFileSync(path);
  const cleanup = new Error('SC3 original semantic close refusal');
  const open = connections.openReadOnlyConnection;
  const openDescriptor = filesystem.openSync;
  const closeDescriptor = filesystem.closeSync;
  const descriptors: BoundedOriginal[] = [];
  const descriptorOrder: BoundedOriginal[] = [];
  const events: string[] = [];
  const retainedConnections: connections.Connection[] = [];
  const acquisitions: {
    readonly returnedConnection: connections.Connection;
    readonly original: connections.Connection['close'];
    readonly receiver: connections.Connection;
    readonly args: [];
    readonly client: { close: (...args: unknown[]) => unknown };
    readonly nativeClose: (...args: unknown[]) => unknown;
    queryOutcomes: () => unknown[];
    restoreConnection: () => void;
    restoreNative: () => void;
    phase: 'production' | 'fixture';
    fixtureNativeAttempts: number;
    fixtureNativeEntries: number;
    fixtureNativeReturns: number;
    fixtureNativeReceiver: unknown;
    fixtureNativeArgs: unknown[];
    attempts: number;
    entries: number;
    returns: number;
    nativeAttempts: number;
    nativeEntries: number;
    nativeReturns: number;
    retirementEntries: number;
    retirementReturns: number;
    attemptedReceiver: unknown;
    attemptedArgs: unknown[];
    nativeReceiver: unknown;
    nativeArgs: unknown[];
  }[] = [];
  const opened = spyOn(filesystem, 'openSync').mockImplementation(
    (...args: Parameters<typeof openDescriptor>) => {
      const descriptor = openDescriptor(...args);
      if (args[0] === dir || args[0] === path)
        descriptors.push({
          kind: args[0] === dir ? 'parent' : 'file',
          descriptor,
          receiver: filesystem,
          close: closeDescriptor,
          args: [descriptor],
          attempts: 0,
          entries: 0,
          returns: 0,
          retirementEntries: 0,
          retirementReturns: 0,
        });
      return descriptor;
    },
  );
  const closed = spyOn(filesystem, 'closeSync').mockImplementation((descriptor) => {
    const acquired = descriptors.find((original) => original.descriptor === descriptor);
    if (acquired === undefined) {
      closeDescriptor(descriptor);
      return;
    }
    acquired.attempts += 1;
    descriptorOrder.push(acquired);
    events.push(acquired.kind);
    if (acquired.attempts !== 1) throw new Error('SC3 duplicate sibling close refused');
    acquired.entries += 1;
    acquired.close.call(acquired.receiver, ...acquired.args);
    acquired.returns += 1;
  });
  const semantic = spyOn(connections, 'openReadOnlyConnection').mockImplementation((...args) => {
    const returnedConnection = open(...args);
    retainedConnections.push(returnedConnection);
    // Tests inspect Drizzle's actual native boundary without replacing the returned Connection.
    const client = (
      returnedConnection.db as connections.Drizzle & {
        $client: { close: (...args: unknown[]) => unknown };
      }
    ).$client;
    const original = returnedConnection.close;
    const nativeClose = client.close;
    const acquired: (typeof acquisitions)[number] = {
      returnedConnection,
      original,
      receiver: returnedConnection,
      args: [],
      client,
      nativeClose,
      queryOutcomes: () => {
        throw new Error('SC3 query observer not installed');
      },
      restoreConnection: () => undefined,
      restoreNative: () => undefined,
      phase: 'production',
      fixtureNativeAttempts: 0,
      fixtureNativeEntries: 0,
      fixtureNativeReturns: 0,
      fixtureNativeReceiver: undefined,
      fixtureNativeArgs: [],
      attempts: 0,
      entries: 0,
      returns: 0,
      nativeAttempts: 0,
      nativeEntries: 0,
      nativeReturns: 0,
      retirementEntries: 0,
      retirementReturns: 0,
      attemptedReceiver: undefined,
      attemptedArgs: [],
      nativeReceiver: undefined,
      nativeArgs: [],
    };
    acquisitions.push(acquired);
    const queries = spyOn(returnedConnection.db, 'all');
    acquired.queryOutcomes = () => queries.mock.results.map((outcome) => outcome.value);
    acquired.restoreConnection = () => {
      queries.mockRestore();
    };
    const native = spyOn(client, 'close').mockImplementation(function (
      this: typeof client,
      ...args
    ) {
      if (acquired.phase === 'fixture') {
        acquired.fixtureNativeAttempts += 1;
        if (acquired.nativeEntries !== 0 || acquired.fixtureNativeAttempts !== 1)
          throw new Error('SC3 STOP: repeated native entry refused', {
            cause: { retainedConnections, acquisitions, descriptors, events },
          });
        acquired.fixtureNativeReceiver = this;
        acquired.fixtureNativeArgs = args;
        acquired.fixtureNativeEntries += 1;
        const returned = nativeClose.apply(this, args);
        acquired.fixtureNativeReturns += 1;
        return returned;
      }
      acquired.nativeAttempts += 1;
      if (acquired.nativeAttempts !== 1)
        throw new Error('SC3 STOP: repeated production native entry refused', {
          cause: { retainedConnections, acquisitions, descriptors, events },
        });
      acquired.nativeEntries += 1;
      acquired.nativeReceiver = this;
      acquired.nativeArgs = args;
      const returned = nativeClose.apply(this, args);
      acquired.nativeReturns += 1;
      return returned;
    });
    acquired.restoreNative = () => {
      native.mockRestore();
    };
    const closing = spyOn(returnedConnection, 'close').mockImplementation(function (
      this: connections.Connection,
      ...args: []
    ) {
      acquired.attempts += 1;
      acquired.attemptedReceiver = this;
      acquired.attemptedArgs = args;
      events.push('semantic');
      if (acquired.attempts !== 1) throw new Error('SC3 duplicate semantic close refused');

      acquired.entries += 1;
      acquired.original.call(acquired.receiver, ...acquired.args);
      acquired.returns += 1;
      throw cleanup;
    });
    acquired.restoreConnection = () => {
      closing.mockRestore();
      queries.mockRestore();
    };
    return returnedConnection;
  });
  try {
    let observed: unknown;
    try {
      verifySnapshotBounded(path, { maxBytes: 1073741824, deadline: performance.now() + 10000 });
    } catch (cause) {
      observed = cause;
    }
    expect(semantic).toHaveBeenCalledTimes(1);
    expect(semantic.mock.calls).toEqual([[path]]);
    expect(retainedConnections).toHaveLength(1);
    expect(acquisitions).toHaveLength(1);
    expect(retainedConnections[0]).toBe(acquisitions[0]?.returnedConnection);
    const acquired = acquisitions.at(0);
    if (acquired === undefined) throw new Error('SC3 actual semantic acquisition absent');
    expect(semantic.mock.results[0]?.value).toBe(acquired.returnedConnection);
    expect(acquired.receiver).toBe(acquired.returnedConnection);
    expect(acquired.original).not.toBe(acquired.returnedConnection.close);
    expect(acquired.nativeClose).not.toBe(acquired.client.close);
    expect(acquired.args).toEqual([]);
    expect(acquired.attemptedReceiver).toBe(acquired.receiver);
    expect(acquired.attemptedArgs).toEqual(acquired.args);
    expect(acquired.queryOutcomes()).toEqual([
      [{ integrity_check: 'ok' }],
      [{ name: '__drizzle_migrations' }],
      [{ name: SKELETON }],
    ]);
    expect([acquired.attempts, acquired.entries, acquired.returns]).toEqual([1, 1, 1]);
    expect([acquired.nativeAttempts, acquired.nativeEntries, acquired.nativeReturns]).toEqual([
      1, 1, 1,
    ]);
    expect(acquired.nativeReceiver).toBe(acquired.client);
    expect(acquired.nativeArgs).toEqual([]);
    expect(observed).toBeInstanceOf(AggregateError);
    if (!(observed instanceof AggregateError)) throw new Error('SC3 semantic attribution absent');
    expect(observed.errors).toEqual([cleanup]);
    expect(observed.errors[0]).toBe(cleanup);
    expect(isSnapshotCleanupUnknown(observed)).toBe(true);
    expect(descriptors.map((original) => original.kind)).toEqual(['parent', 'file']);
    expect(descriptorOrder).toEqual([...descriptors].reverse());
    expect(events).toEqual(['semantic', 'file', 'parent']);
    expect(
      descriptors.map((original) => [original.attempts, original.entries, original.returns]),
    ).toEqual([
      [1, 1, 1],
      [1, 1, 1],
    ]);
    for (const original of descriptors) {
      expect(original.close).toBe(closeDescriptor);
      expect(original.receiver).toBe(filesystem);
      expect(original.args).toEqual([original.descriptor]);
    }
    expect(readFileSync(path).equals(bytes)).toBe(true);
    expect(existsSync(join(dir, '.wbs.db.partial'))).toBe(false);
  } finally {
    semantic.mockRestore();
    opened.mockRestore();
    closed.mockRestore();
    for (const acquired of acquisitions) acquired.restoreConnection();
    // Validate every outcome before any fixture close; ambiguity preserves all evidence.
    if (retainedConnections.length !== acquisitions.length)
      // eslint-disable-next-line no-unsafe-finally -- ambiguous native outcome requires STOP with retained ledger evidence before any further fixture cleanup
      throw new Error('SC3 STOP: acquired Connection lacks a complete native ledger', {
        cause: { retainedConnections, acquisitions, descriptors, events },
      });
    for (const acquired of acquisitions) {
      if (
        acquired.entries !== acquired.returns ||
        acquired.nativeEntries !== acquired.nativeReturns
      )
        // eslint-disable-next-line no-unsafe-finally -- ambiguous native outcome requires STOP with retained ledger evidence before any further fixture cleanup
        throw new Error('SC3 STOP: semantic close entered without return; retain evidence', {
          cause: { retainedConnections, acquisitions, descriptors, events },
        });
      if (acquired.returns !== 1 && !(acquired.entries === 0 && acquired.nativeEntries === 0))
        // eslint-disable-next-line no-unsafe-finally -- ambiguous native outcome requires STOP with retained ledger evidence before any further fixture cleanup
        throw new Error('SC3 STOP: semantic close lacks first-entry authority', {
          cause: { retainedConnections, acquisitions, descriptors, events },
        });
    }
    for (const original of descriptors)
      if (original.entries !== original.returns || original.returns !== 1)
        // eslint-disable-next-line no-unsafe-finally -- ambiguous native outcome requires STOP with retained ledger evidence before any further fixture cleanup
        throw new Error('SC3 STOP: sibling outcome unsupported; retain evidence', {
          cause: { retainedConnections, acquisitions, descriptors, events },
        });
    for (const acquired of acquisitions) {
      if (acquired.returns === 1) continue;
      acquired.phase = 'fixture';
      acquired.retirementEntries += 1;
      try {
        acquired.original.call(acquired.receiver, ...acquired.args);
      } catch (cause) {
        // eslint-disable-next-line no-unsafe-finally -- ambiguous native outcome requires STOP with retained ledger evidence before any further fixture cleanup
        throw new Error('SC3 STOP: first fixture semantic close did not return; retain evidence', {
          // eslint-disable-next-line preserve-caught-error -- STOP retains the exact caught failure and acquired originals in its cause object
          cause: { retainedConnections, acquisitions, descriptors, events, failure: cause },
        });
      }
      acquired.retirementReturns += 1;
    }
    for (const acquired of acquisitions) {
      if (
        acquired.fixtureNativeEntries !== acquired.fixtureNativeReturns ||
        acquired.nativeReturns + acquired.fixtureNativeReturns !== 1
      )
        // eslint-disable-next-line no-unsafe-finally -- ambiguous native outcome requires STOP with retained ledger evidence before any further fixture cleanup
        throw new Error('SC3 STOP: native retirement lacks one known return; retain evidence', {
          cause: { retainedConnections, acquisitions, descriptors, events },
        });
      acquired.restoreNative();
    }
    expect(
      acquisitions.map((acquired) => [
        acquired.fixtureNativeAttempts,
        acquired.fixtureNativeEntries,
        acquired.fixtureNativeReturns,
      ]),
    ).toEqual([[0, 0, 0]]);
    for (const acquired of acquisitions) {
      expect(acquired.fixtureNativeReceiver).toBeUndefined();
      expect(acquired.fixtureNativeArgs).toEqual([]);
    }
    expect(
      acquisitions.map((acquired) => [acquired.retirementEntries, acquired.retirementReturns]),
    ).toEqual([[0, 0]]);
  }
});

it('SC3 bounded parent cleanup refuses before delegation', () => {
  const dir = scratch();
  const path = skeletonDatabase(dir);
  const fixture = captureBoundedClose(path, dir, 'before', 'parent');
  try {
    let observed: unknown;
    try {
      verifySnapshotBounded(path, { maxBytes: 1073741824, deadline: performance.now() + 10000 });
    } catch (cause) {
      observed = cause;
    }
    expect(observed).toBeInstanceOf(AggregateError);
    if (!(observed instanceof AggregateError)) throw new Error('SC3 original attribution absent');
    expect(observed.errors).toEqual([fixture.primary, fixture.cleanup]);
    expect(observed.errors[0]).toBe(fixture.primary);
    expect(observed.errors[1]).toBe(fixture.cleanup);
    expect(fixture.cleanup).toBe('SC3 original bounded parent close primitive fault');
    expect(fixture.reads).toBe(1);
    expect(fixture.originals.map((original) => original.kind)).toEqual(['parent', 'file']);
    expect(fixture.originals[0]?.descriptor).not.toBe(fixture.originals[1]?.descriptor);
    expect(fixture.closed).toEqual([...fixture.originals].reverse());
    expect(
      fixture.originals.map((original) => [original.attempts, original.entries, original.returns]),
    ).toEqual([
      [1, 0, 0],
      [1, 1, 1],
    ]);
    for (const original of fixture.originals) {
      expect(original.close).toBe(fixture.close);
      expect(original.receiver).toBe(filesystem);
      expect(original.args).toEqual([original.descriptor]);
    }
    expect(isSnapshotCleanupUnknown(observed)).toBe(true);
  } finally {
    fixture.retire();
  }
});

it('SC3 bounded parent cleanup refuses after native return', () => {
  const dir = scratch();
  const path = skeletonDatabase(dir);
  const fixture = captureBoundedClose(path, dir, 'after', 'parent');
  try {
    let observed: unknown;
    try {
      verifySnapshotBounded(path, { maxBytes: 1073741824, deadline: performance.now() + 10000 });
    } catch (cause) {
      observed = cause;
    }
    expect(observed).toBeInstanceOf(AggregateError);
    if (!(observed instanceof AggregateError)) throw new Error('SC3 original attribution absent');
    expect(observed.errors).toEqual([fixture.primary, fixture.cleanup]);
    expect(observed.errors[0]).toBe(fixture.primary);
    expect(observed.errors[1]).toBe(fixture.cleanup);
    expect(fixture.reads).toBe(1);
    expect(fixture.originals.map((original) => original.kind)).toEqual(['parent', 'file']);
    expect(fixture.originals[0]?.descriptor).not.toBe(fixture.originals[1]?.descriptor);
    expect(fixture.closed).toEqual([...fixture.originals].reverse());
    expect(
      fixture.originals.map((original) => [original.attempts, original.entries, original.returns]),
    ).toEqual([
      [1, 1, 1],
      [1, 1, 1],
    ]);
    for (const original of fixture.originals) {
      expect(original.close).toBe(fixture.close);
      expect(original.receiver).toBe(filesystem);
      expect(original.args).toEqual([original.descriptor]);
    }
    expect(isSnapshotCleanupUnknown(observed)).toBe(true);
  } finally {
    fixture.retire();
  }
});
