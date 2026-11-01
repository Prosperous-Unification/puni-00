import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  copyFileSync,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { sql } from 'drizzle-orm';

import { openExistingConnection, openReadOnlyConnection } from './db';

/** A verified copy of the database and the migration ledger it carries. */
export interface DatabaseSnapshot {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
  /** Applied migration names, oldest first. Never empty. */
  readonly migrations: readonly string[];
}

/** A positive byte ceiling and the original absolute monotonic deadline. */
export interface SnapshotLimits {
  readonly maxBytes: number;
  readonly deadline: number;
}

function checkDeadline(limits: SnapshotLimits | undefined): void {
  if (limits !== undefined && performance.now() >= limits.deadline)
    throw new Error('snapshot original deadline exceeded');
}
function admitLimits(limits: unknown): asserts limits is SnapshotLimits {
  if (
    typeof limits !== 'object' ||
    limits === null ||
    Array.isArray(limits) ||
    Object.keys(limits).sort().join(',') !== 'deadline,maxBytes' ||
    !('maxBytes' in limits) ||
    typeof limits.maxBytes !== 'number' ||
    !('deadline' in limits) ||
    typeof limits.deadline !== 'number' ||
    !Number.isSafeInteger(limits.maxBytes) ||
    limits.maxBytes <= 0 ||
    !Number.isFinite(limits.deadline)
  )
    throw new Error('invalid closed snapshot limits');
  checkDeadline({ maxBytes: limits.maxBytes, deadline: limits.deadline });
}
/** Runs every owned cleanup even if the operation or an earlier close fails. */
function settle<T>(operation: () => T, cleanups: readonly (() => void)[]): T {
  const failures: unknown[] = [];
  let value: { readonly returned: T } | undefined;
  try {
    value = { returned: operation() };
  } catch (cause) {
    failures.push(cause);
  }
  for (const close of cleanups) {
    try {
      close();
    } catch (cause) {
      failures.push(cause);
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, 'snapshot operation/cleanup failed');
  if (value === undefined) throw new Error('snapshot operation returned no outcome');
  return value.returned;
}
function pinSnapshot(path: string, limits: SnapshotLimits) {
  const parentPath = dirname(path);
  const parent = openSync(parentPath, constants.O_RDONLY | constants.O_DIRECTORY);
  let file: number;
  try {
    file = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (cause) {
    return settle<never>(() => {
      throw cause;
    }, [
      () => {
        closeSync(parent);
      },
    ]);
  }
  try {
    const directory = fstatSync(parent, { bigint: true });
    const original = fstatSync(file, { bigint: true });
    if (!original.isFile() || (original.mode & 0o444n) === 0n)
      throw new Error('snapshot is not a readable regular file');
    if (original.size > BigInt(limits.maxBytes)) throw new Error('snapshot byte limit exceeded');
    const identity = (stats: typeof original, includeChange = true) =>
      [
        stats.dev,
        stats.ino,
        stats.mode,
        stats.nlink,
        stats.size,
        stats.mtimeNs,
        includeChange ? stats.ctimeNs : 0n,
      ].join(':');
    let binding = path;
    let expectedIdentity = identity(original);
    const inspect = () => {
      checkDeadline(limits);
      const namedParent = statSync(parentPath, { bigint: true });
      if (
        directory.dev !== namedParent.dev ||
        directory.ino !== namedParent.ino ||
        directory.dev !== fstatSync(parent, { bigint: true }).dev ||
        directory.ino !== fstatSync(parent, { bigint: true }).ino ||
        expectedIdentity !== identity(fstatSync(file, { bigint: true })) ||
        expectedIdentity !== identity(lstatSync(binding, { bigint: true }))
      )
        throw new Error('snapshot file or parent changed');
    };
    inspect();
    return {
      inspect,
      publish: (finalPath: string) => {
        inspect();
        fsyncSync(file);
        inspect();
        checkDeadline(limits);
        renameSync(binding, finalPath);
        const published = fstatSync(file, { bigint: true });
        // Rename may advance ctime; every other original field and the verified digest stay fixed.
        if (identity(original, false) !== identity(published, false))
          throw new Error('snapshot changed during publication');
        expectedIdentity = identity(published);
        binding = finalPath;
        inspect();
        fsyncSync(parent);
        inspect();
      },
      hash: () => {
        inspect();
        const hash = createHash('sha256');
        const buffer = Buffer.alloc(Math.min(limits.maxBytes, 1048576));
        let bytes = 0;
        for (;;) {
          inspect();
          const count = readSync(file, buffer, 0, buffer.length, bytes);
          checkDeadline(limits);
          if (count === 0) break;
          bytes += count;
          if (bytes > limits.maxBytes) throw new Error('snapshot byte limit exceeded');
          hash.update(buffer.subarray(0, count));
          inspect();
        }
        if (BigInt(bytes) !== original.size) throw new Error('snapshot streamed size changed');
        inspect();
        return { bytes, sha256: hash.digest('hex') };
      },
      close: () => {
        settle(
          () => undefined,
          [
            () => {
              closeSync(file);
            },
            () => {
              closeSync(parent);
            },
          ],
        );
      },
    };
  } catch (cause) {
    return settle<never>(() => {
      throw cause;
    }, [
      () => {
        closeSync(file);
      },
      () => {
        closeSync(parent);
      },
    ]);
  }
}

/** What {@link restoreDatabase} put in place and where the files it replaced went. */
export interface DatabaseRestore {
  readonly snapshot: DatabaseSnapshot;
  /** The database, WAL and shared-memory files moved aside, in that order when present. */
  readonly displaced: readonly string[];
}

function sha256Of(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** Forces a file's or directory's contents to stable storage; a failure throws. */
function syncPath(path: string): void {
  const fd = openSync(path, 'r');
  settle(() => {
    fsyncSync(fd);
  }, [
    () => {
      closeSync(fd);
    },
  ]);
}

/**
 * Renames `partialPath` onto `finalPath` durably: the file's bytes are synced
 * before the rename can publish them, and the directory after it, so a power
 * loss cannot leave `finalPath` naming a file whose pages never reached disk.
 */
function publishDurably(partialPath: string, finalPath: string): void {
  syncPath(partialPath);
  renameSync(partialPath, finalPath);
  syncPath(dirname(finalPath));
}

/**
 * Proves one SQLite file is a WBS database worth restoring: `integrity_check`
 * answers `ok` and the Drizzle ledger holds at least one migration.
 *
 * @throws When the file is absent, fails `integrity_check`, or has no ledger or
 * an empty one.
 */
function verifySnapshotCore(
  path: string,
  limits?: SnapshotLimits,
  retained?: ReturnType<typeof pinSnapshot>,
): DatabaseSnapshot {
  checkDeadline(limits);
  const pinned = retained ?? (limits === undefined ? undefined : pinSnapshot(path, limits));
  return settle(
    () => {
      pinned?.inspect();
      if (!existsSync(path)) throw new Error(`${path} does not exist`);
      const connection = openReadOnlyConnection(path);
      const migrations = settle(() => {
        checkDeadline(limits);
        const integrity = connection.db.all<{ integrity_check: string }>(
          sql.raw('PRAGMA integrity_check'),
        );
        if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok') {
          throw new Error(`${path} failed integrity_check`);
        }
        checkDeadline(limits);
        pinned?.inspect();
        const ledger = connection.db.all<{ name: string }>(
          sql.raw(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'",
          ),
        );
        if (ledger.length === 0) throw new Error(`${path} has no __drizzle_migrations table`);
        checkDeadline(limits);
        return connection.db
          .all<{ name: string | null }>(
            sql.raw('SELECT name FROM __drizzle_migrations ORDER BY created_at, id'),
          )
          .map(({ name }) => {
            if (name === null) throw new Error(`${path} has a migration row without a name`);
            return name;
          });
      }, [
        () => {
          connection.close();
        },
      ]);
      if (migrations.length === 0) throw new Error(`${path} has no applied migrations`);
      checkDeadline(limits);
      pinned?.inspect();
      const digest =
        pinned === undefined
          ? { bytes: readFileSync(path).byteLength, sha256: sha256Of(path) }
          : pinned.hash();
      checkDeadline(limits);
      pinned?.inspect();
      return { path, ...digest, migrations };
    },
    pinned === undefined || retained !== undefined ? [] : [pinned.close],
  );
}
/** Verifies integrity and a nonempty named ledger with the legacy unbounded API. */
export function verifySnapshot(path: string): DatabaseSnapshot {
  return verifySnapshotCore(path);
}
/**
 * Verifies real SQLite semantics while streaming at most 1MiB per read. Held-file,
 * pathname and parent stability bracket pathname-based SQLite verification; this
 * detects boundary drift, not universal ABA or same-descriptor SQLite semantics.
 * @throws On invalid limits, expiry, unreadability, excess size or changed evidence.
 */
export function verifySnapshotBounded(path: string, limits: SnapshotLimits): DatabaseSnapshot {
  admitLimits(limits);
  const snapshot = verifySnapshotCore(path, limits);
  checkDeadline(limits);
  return snapshot;
}

/**
 * Writes a verified, application-consistent copy of a live WAL database with
 * `VACUUM INTO`, which reads one transaction snapshot and takes no writer
 * lock, so the serving colour keeps writing while it runs. The copy is
 * verified before it is renamed into place, so `snapshotPath` never names an
 * unverified file.
 *
 * @throws When the source is absent, including after preflight (never recreated), when
 * `snapshotPath` already exists (a backup never overwrites another), or when
 * the copy fails {@link verifySnapshot}.
 */
function snapshotDatabaseCore(
  sourcePath: string,
  snapshotPath: string,
  limits?: SnapshotLimits,
): DatabaseSnapshot {
  checkDeadline(limits);
  if (!existsSync(sourcePath)) throw new Error(`database ${sourcePath} does not exist`);
  if (existsSync(snapshotPath)) throw new Error(`${snapshotPath} already exists`);
  mkdirSync(dirname(snapshotPath), { recursive: true });
  const partialPath = join(dirname(snapshotPath), `.${basename(snapshotPath)}.partial`);
  rmSync(partialPath, { force: true });
  // Proof: restoring creation-capable openConnection made `refuses a source removed
  // after preflight without recreating it` leave a replacement DB (2026-10-24).
  const source = openExistingConnection(sourcePath);
  settle(() => {
    checkDeadline(limits);
    source.db.run(sql`VACUUM INTO ${partialPath}`);
    checkDeadline(limits);
  }, [
    () => {
      source.close();
    },
  ]);
  // Proof: replacing this with an unverified digest made `refuses to publish
  // a copy without a migration ledger` in backup.db.test.ts publish the copy
  // (4 pass, 2 fail, 2026-09-29).
  const pinned = limits === undefined ? undefined : pinSnapshot(partialPath, limits);
  return settle(
    () => {
      const verified = verifySnapshotCore(partialPath, limits, pinned);
      checkDeadline(limits);
      if (pinned === undefined) publishDurably(partialPath, snapshotPath);
      else {
        pinned.publish(snapshotPath);
        const published = pinned.hash();
        if (published.bytes !== verified.bytes || published.sha256 !== verified.sha256)
          throw new Error('snapshot published digest changed');
      }
      checkDeadline(limits);
      return { ...verified, path: snapshotPath };
    },
    pinned === undefined ? [] : [pinned.close],
  );
}
/** Writes a verified application-consistent VACUUM copy using legacy defaults. */
export function snapshotDatabase(sourcePath: string, snapshotPath: string): DatabaseSnapshot {
  return snapshotDatabaseCore(sourcePath, snapshotPath);
}
/**
 * Admits the actual produced partial copy before semantic open and publication.
 * Native SQLite calls are synchronous: deadline overrun refuses at the next
 * boundary and may already have created a partial file. No partial evidence is erased on refusal.
 */
export function snapshotDatabaseBounded(
  sourcePath: string,
  snapshotPath: string,
  limits: SnapshotLimits,
): DatabaseSnapshot {
  admitLimits(limits);
  const snapshot = snapshotDatabaseCore(sourcePath, snapshotPath, limits);
  checkDeadline(limits);
  return snapshot;
}

/**
 * Puts a verified snapshot back at `dbPath`. Every process that opens
 * `dbPath` must be stopped first: the current database and its `-wal` and
 * `-shm` files are moved aside under `.displaced-<stamp>`, never deleted, and
 * the snapshot's copy is verified against the snapshot's own digest before it
 * is renamed into place.
 *
 * @throws When the snapshot fails {@link verifySnapshot} or its copy differs
 * from it; in both cases `dbPath` is left untouched.
 */
export function restoreDatabase(
  snapshotPath: string,
  dbPath: string,
  stamp: string,
): DatabaseRestore {
  // Proof: replacing this with an unverified digest made `refuses a corrupted
  // snapshot and leaves the database untouched` fail: the corrupted copy
  // replaced the database (5 pass, 1 fail, 2026-09-29).
  const snapshot = verifySnapshot(snapshotPath);
  const partialPath = `${dbPath}.restore.partial`;
  rmSync(partialPath, { force: true });
  copyFileSync(snapshotPath, partialPath);
  if (sha256Of(partialPath) !== snapshot.sha256) {
    rmSync(partialPath, { force: true });
    throw new Error(`copy of ${snapshotPath} does not match its digest; ${dbPath} untouched`);
  }
  const present = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`].filter((path) => existsSync(path));
  const taken = present.map((path) => `${path}.displaced-${stamp}`).filter((p) => existsSync(p));
  if (taken.length > 0) {
    rmSync(partialPath, { force: true });
    throw new Error(`${taken.join(', ')} already exist; ${dbPath} untouched`);
  }
  const displaced: string[] = [];
  for (const path of present) {
    const aside = `${path}.displaced-${stamp}`;
    renameSync(path, aside);
    displaced.push(aside);
  }
  publishDurably(partialPath, dbPath);
  return { snapshot, displaced };
}
