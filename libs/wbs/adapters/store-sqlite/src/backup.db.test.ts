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

import { describe, expect, it, spyOn } from 'bun:test';
import { sql } from 'drizzle-orm';

import {
  restoreDatabase,
  snapshotDatabase,
  snapshotDatabaseBounded,
  verifySnapshot,
  verifySnapshotBounded,
} from './backup';
import * as connections from './db';
import { openConnection } from './db';
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
