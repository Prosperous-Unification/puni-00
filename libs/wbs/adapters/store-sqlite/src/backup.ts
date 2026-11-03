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

import type { Connection } from './db';
import { openExistingConnection, openReadOnlyConnection } from './db';
import type { SqliteCleanupUnknown } from './sqlite-cleanup';
import { isSqliteCleanupUnknown } from './sqlite-cleanup';

declare const snapshotCleanupIdentity: unique symbol;

/** Opaque identity view for an original snapshot cleanup whose outcome is unknown. */
export interface SnapshotCleanupUnknown extends Error {
  readonly [snapshotCleanupIdentity]: true;
}

type CleanupState = 'unattempted' | 'closing' | 'closed' | 'unknown';
interface CleanupOutcome {
  state: CleanupState;
  cause: unknown;
}
type SnapshotAcquisition = CleanupOutcome &
  (
    | {
        readonly kind:
          'bounded-file' | 'bounded-parent' | 'publication-file' | 'publication-parent';
        readonly original: number;
        readonly close: typeof closeSync;
        readonly receiver: undefined;
        readonly args: [number];
      }
    | {
        readonly kind: 'source' | 'semantic';
        readonly original: Connection;
        readonly close: Connection['close'];
        readonly receiver: Connection;
        readonly args: [];
      }
  );
interface SnapshotOperation {
  readonly acquisitions: SnapshotAcquisition[];
  readonly inherited: SqliteCleanupUnknown[];
  readonly observed: unknown[];
  readonly attribution: Map<object, readonly unknown[]>;
}

const snapshotFailures = new WeakMap<
  object,
  {
    readonly operation: SnapshotOperation;
    readonly terminal: unknown;
    readonly failures: readonly unknown[];
  }
>();

class SnapshotCleanupFailure extends AggregateError implements SnapshotCleanupUnknown {
  declare readonly [snapshotCleanupIdentity]: true;
}

/** Recognizes only terminal identities registered after an actual owned or inherited cleanup throw. */
export function isSnapshotCleanupUnknown(cause: unknown): cause is SnapshotCleanupUnknown {
  // Proof: bypassing snapshot membership wrongly accepted the genuine lower identity
  // in the cleanup identity diagnostic consumer; SAME restored consumer passed (2026-11-03).
  // Cross-registry rejection only; later negative assertions were unobserved.
  return typeof cause === 'object' && cause !== null && snapshotFailures.has(cause);
}

/** Captures authentic lower provenance before an internal aggregate can replace its top-level identity. */
function observeFailure(operation: SnapshotOperation, cause: unknown): void {
  operation.observed.push(cause);
  // Proof: omitting inherited.push made the genuine initialization cleanup failure
  // consumer receive [primary, cleanup] instead of outer [lower]; SAME restored
  // consumer passed (2026-11-03). Grouped inheritance/outer attribution only;
  // later negative assertions were unobserved.
  if (isSqliteCleanupUnknown(cause)) operation.inherited.push(cause);
}

/** Records only this operation's own aggregate attribution; arbitrary diagnostic trees are never traversed. */
function combineFailures(operation: SnapshotOperation, failures: readonly unknown[]): unknown {
  // Proof: omitting this single-primary return failed exact read-primary identity
  // in the bounded-file known-close consumer; SAME restored consumer passed (2026-11-03).
  // Aggregate construction follows the source cut; Bun printed alike inner stacks.
  if (failures.length === 1) return failures.at(0);
  const failure = new AggregateError(failures, 'snapshot operation/cleanup failed');
  // Proof: finite A omitted this attribution; bounded-file before-delegation
  // failed direct errors equality on a nested aggregate. SAME exact-restored consumer
  // passed (2026-11-03); grouped attribution/unpacking, later negative assertions unobserved.
  operation.attribution.set(failure, [...failures]);
  return failure;
}

function acquireDescriptor(
  operation: SnapshotOperation,
  original: number,
  kind: 'bounded-file' | 'bounded-parent' | 'publication-file' | 'publication-parent',
): SnapshotAcquisition {
  const acquired: SnapshotAcquisition = {
    kind,
    original,
    close: closeSync,
    receiver: undefined,
    args: [original],
    state: 'unattempted',
    cause: undefined,
  };
  operation.acquisitions.push(acquired);
  return acquired;
}

function acquireConnection(
  operation: SnapshotOperation,
  original: Connection,
  kind: 'source' | 'semantic',
): SnapshotAcquisition {
  const acquired: SnapshotAcquisition = {
    kind,
    original,
    close: original.close,
    receiver: original,
    args: [],
    state: 'unattempted',
    cause: undefined,
  };
  operation.acquisitions.push(acquired);
  return acquired;
}

/** Records one original close outcome; callers pass only unattempted acquisitions. */
function closeAcquisition(acquired: SnapshotAcquisition): void {
  acquired.state = 'closing';
  try {
    switch (acquired.kind) {
      case 'source':
      case 'semantic':
        acquired.close.call(acquired.receiver, ...acquired.args);
        break;
      case 'bounded-file':
      case 'bounded-parent':
      case 'publication-file':
      case 'publication-parent':
        acquired.close.call(acquired.receiver, ...acquired.args);
        break;
    }
    acquired.state = 'closed';
  } catch (cause) {
    // Proof: finite U marked this actual close throw closed; bounded-file before-delegation
    // failed its classifier, then SAME exact-restored consumer passed (2026-11-03).
    // Grouped throw-state/terminal-classification dependency only.
    acquired.state = 'unknown';
    acquired.cause = cause;
    throw cause;
  }
}

/**
 * Finalizes one synchronous backup call after all directly owned cleanup. The private value
 * retains exact acquisitions, originals and attribution independently of mutable diagnostics
 * while its failure is held; it supplies no keeper or strong root after that failure is discarded.
 */
function finishSnapshot<T>(run: (operation: SnapshotOperation) => T): T {
  const operation: SnapshotOperation = {
    acquisitions: [],
    inherited: [],
    observed: [],
    attribution: new Map(),
  };
  const failures: unknown[] = [];
  let value: { readonly returned: T } | undefined;
  try {
    value = { returned: run(operation) };
  } catch (cause) {
    observeFailure(operation, cause);
    failures.push(cause);
  }
  for (const acquired of [...operation.acquisitions].reverse()) {
    // Proof: removing this skip made `SC3 bounded file cleanup classifies original
    // file close throwing before delegation` fail errors equality with its nested
    // aggregate plus two duplicate proxy Errors; exact restoration passed. The
    // fixture intercepted repeated native entry: finite request-prevention credit.
    if (acquired.state !== 'unattempted') continue;
    try {
      closeAcquisition(acquired);
    } catch (cause) {
      observeFailure(operation, cause);
      failures.push(cause);
    }
  }
  // Proof: bypassing this failure branch gave the bounded-file known-close consumer
  // a TypeError instead of its actual read primary; SAME restored consumer passed
  // (2026-11-03). Recorded failure propagation only; later assertions unobserved.
  if (failures.length > 0) {
    const terminal = combineFailures(operation, failures);
    if (
      operation.inherited.length > 0 ||
      operation.acquisitions.some((acquired) => acquired.state === 'unknown')
    ) {
      const attribution =
        typeof terminal === 'object' && terminal !== null
          ? (operation.attribution.get(terminal) ?? [terminal])
          : [terminal];
      const retained = [...attribution];
      const failure = new SnapshotCleanupFailure(retained, 'snapshot operation/cleanup failed');
      // Proof: finite S omitted this registration; bounded-file before-delegation
      // failed classification, then SAME exact-restored consumer passed (2026-11-03).
      // Snapshot identity registration only.
      snapshotFailures.set(failure, { operation, terminal, failures: retained });
      throw failure;
    }
    throw terminal;
  }
  // Normal synchronous return creates this wrapper, including when T is undefined.
  // Any recorded failure exits through the terminal branch above.
  return (value as { readonly returned: T }).returned;
}

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
function settle<T>(
  context: SnapshotOperation,
  operation: () => T,
  cleanups: readonly (() => void)[],
): T {
  const failures: unknown[] = [];
  let value: { readonly returned: T } | undefined;
  try {
    value = { returned: operation() };
  } catch (cause) {
    observeFailure(context, cause);
    failures.push(cause);
  }
  for (const close of cleanups) {
    try {
      close();
    } catch (cause) {
      observeFailure(context, cause);
      failures.push(cause);
    }
  }
  if (failures.length > 0) throw combineFailures(context, failures);
  if (value === undefined) throw new Error('snapshot operation returned no outcome');
  return value.returned;
}
function pinSnapshot(context: SnapshotOperation, path: string, limits: SnapshotLimits) {
  const parentPath = dirname(path);
  const parent = openSync(parentPath, constants.O_RDONLY | constants.O_DIRECTORY);
  const parentAcquisition = acquireDescriptor(context, parent, 'bounded-parent');
  let file: number;
  let fileAcquisition: SnapshotAcquisition;
  try {
    file = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    fileAcquisition = acquireDescriptor(context, file, 'bounded-file');
  } catch (cause) {
    return settle<never>(context, () => {
      throw cause;
    }, [
      () => {
        closeAcquisition(parentAcquisition);
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
        settle(context, () => undefined, [
          () => {
            closeAcquisition(fileAcquisition);
          },
          // Proof: GROUPED omission of this parent callback and bounded-parent fallback
          // made `SC3 bounded parent cleanup refuses before delegation` expect
          // AggregateError but receive its raw read primary; exact restoration passed.
          // Neither cleanup limb is independently proven by this finite pair.
          () => {
            closeAcquisition(parentAcquisition);
          },
        ]);
      },
    };
  } catch (cause) {
    return settle<never>(context, () => {
      throw cause;
    }, [
      () => {
        closeAcquisition(fileAcquisition);
      },
      () => {
        closeAcquisition(parentAcquisition);
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
function syncPath(
  context: SnapshotOperation,
  path: string,
  kind: 'publication-file' | 'publication-parent',
): void {
  const fd = openSync(path, 'r');
  const acquired = acquireDescriptor(context, fd, kind);
  settle(context, () => {
    fsyncSync(fd);
  }, [
    () => {
      closeAcquisition(acquired);
    },
  ]);
}

/**
 * Renames `partialPath` onto `finalPath` durably: the file's bytes are synced
 * before the rename can publish them, and the directory after it, so a power
 * loss cannot leave `finalPath` naming a file whose pages never reached disk.
 */
function publishDurably(context: SnapshotOperation, partialPath: string, finalPath: string): void {
  syncPath(context, partialPath, 'publication-file');
  renameSync(partialPath, finalPath);
  syncPath(context, dirname(finalPath), 'publication-parent');
}

/**
 * Proves one SQLite file is a WBS database worth restoring: `integrity_check`
 * answers `ok` and the Drizzle ledger holds at least one migration.
 *
 * @throws When the file is absent, fails `integrity_check`, or has no ledger or
 * an empty one.
 */
function verifySnapshotCore(
  context: SnapshotOperation,
  path: string,
  limits?: SnapshotLimits,
  retained?: ReturnType<typeof pinSnapshot>,
): DatabaseSnapshot {
  checkDeadline(limits);
  const pinned =
    retained ?? (limits === undefined ? undefined : pinSnapshot(context, path, limits));
  return settle(
    context,
    () => {
      pinned?.inspect();
      if (!existsSync(path)) throw new Error(`${path} does not exist`);
      const connection = openReadOnlyConnection(path);
      const semantic = acquireConnection(context, connection, 'semantic');
      const migrations = settle(context, () => {
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
          closeAcquisition(semantic);
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
/**
 * Verifies integrity and a nonempty named ledger with the legacy unbounded API.
 * @throws An identity-classified {@link SnapshotCleanupUnknown} when an owned or inherited cleanup throws.
 */
export function verifySnapshot(path: string): DatabaseSnapshot {
  return finishSnapshot((context) => verifySnapshotCore(context, path));
}
/**
 * Verifies real SQLite semantics while streaming at most 1MiB per read. Held-file,
 * pathname and parent stability bracket pathname-based SQLite verification; this
 * detects boundary drift, not universal ABA or same-descriptor SQLite semantics.
 * @throws On invalid limits, expiry, unreadability, excess size or changed evidence.
 * Cleanup throws produce an identity-classified {@link SnapshotCleanupUnknown}.
 */
export function verifySnapshotBounded(path: string, limits: SnapshotLimits): DatabaseSnapshot {
  return finishSnapshot((context) => {
    admitLimits(limits);
    const snapshot = verifySnapshotCore(context, path, limits);
    checkDeadline(limits);
    return snapshot;
  });
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
  context: SnapshotOperation,
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
  const sourceAcquisition = acquireConnection(context, source, 'source');
  settle(context, () => {
    checkDeadline(limits);
    source.db.run(sql`VACUUM INTO ${partialPath}`);
    checkDeadline(limits);
  }, [
    () => {
      closeAcquisition(sourceAcquisition);
    },
  ]);
  // Proof: replacing this with an unverified digest made `refuses to publish
  // a copy without a migration ledger` in backup.db.test.ts publish the copy
  // (4 pass, 2 fail, 2026-09-29).
  const pinned = limits === undefined ? undefined : pinSnapshot(context, partialPath, limits);
  return settle(
    context,
    () => {
      const verified = verifySnapshotCore(context, partialPath, limits, pinned);
      checkDeadline(limits);
      if (pinned === undefined) publishDurably(context, partialPath, snapshotPath);
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
/**
 * Writes a verified application-consistent VACUUM copy using legacy defaults.
 * @throws An identity-classified {@link SnapshotCleanupUnknown} when an owned or inherited cleanup throws.
 */
export function snapshotDatabase(sourcePath: string, snapshotPath: string): DatabaseSnapshot {
  return finishSnapshot((context) => snapshotDatabaseCore(context, sourcePath, snapshotPath));
}
/**
 * Admits the actual produced partial copy before semantic open and publication.
 * Native SQLite calls are synchronous: deadline overrun refuses at the next
 * boundary and may already have created a partial file. No partial evidence is erased on refusal.
 * @throws An identity-classified {@link SnapshotCleanupUnknown} when an owned or inherited cleanup throws.
 */
export function snapshotDatabaseBounded(
  sourcePath: string,
  snapshotPath: string,
  limits: SnapshotLimits,
): DatabaseSnapshot {
  return finishSnapshot((context) => {
    admitLimits(limits);
    const snapshot = snapshotDatabaseCore(context, sourcePath, snapshotPath, limits);
    checkDeadline(limits);
    return snapshot;
  });
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
 * Cleanup throws produce an identity-classified {@link SnapshotCleanupUnknown}.
 */
export function restoreDatabase(
  snapshotPath: string,
  dbPath: string,
  stamp: string,
): DatabaseRestore {
  return finishSnapshot((context) => {
    // Proof: replacing this with an unverified digest made `refuses a corrupted
    // snapshot and leaves the database untouched` fail: the corrupted copy
    // replaced the database (5 pass, 1 fail, 2026-09-29).
    const snapshot = verifySnapshotCore(context, snapshotPath);
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
    publishDurably(context, partialPath, dbPath);
    return { snapshot, displaced };
  });
}
