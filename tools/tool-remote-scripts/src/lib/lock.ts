import {
  closeSync,
  constants,
  fstatSync,
  ftruncateSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
  writeSync,
} from 'node:fs';
import { hostname } from 'node:os';

import { dlopen, FFIType } from 'bun:ffi';

/**
 * Exclusive deploy lock, held as a real `flock(2)` on an open descriptor.
 *
 * Two concurrent deploys interleaving colour swaps is unrecoverable, so this
 * refuses rather than waiting (design decision 10: "Refuse immediately, name
 * the holder").
 *
 * ## Why `flock(2)` and not `open(path, 'wx')`
 *
 * The previous implementation created the lock file with `O_CREAT|O_EXCL` and
 * removed it in a `finally`. That is atomic, but the release depends entirely
 * on this process reaching its own `finally` — which SIGINT (^C at the
 * terminal), SIGTERM (a timed-out SSH session, `systemctl stop`, an OOM
 * shepherd) and SIGKILL all skip. The reviewer reproduced exactly that: both
 * SIGINT and SIGTERM left the file on disk, and every subsequent deploy then
 * failed with "another deploy is running" forever, against no running deploy.
 * A wedged pipeline that needs a human to `rm` a file is a worse failure than
 * the concurrency it was guarding against.
 *
 * A `flock` is owned by the open file description, not by the process's own
 * good behaviour: the kernel drops it when the descriptor is closed, and it
 * closes every descriptor of a dying process no matter how it died. There is
 * no window in which a dead deploy still holds the lock, and therefore no
 * stale-lock cleanup path to get wrong.
 *
 * `bun:ffi` is used because neither Bun nor Node exposes `flock(2)`; the
 * symbol lives in libc on both platforms this ever runs on (Linux — the real
 * server — and macOS, where the tests run). `LOCK_EX`/`LOCK_NB` are 2/4 on
 * both.
 *
 * ## Why the file is never unlinked
 *
 * With advisory locks, unlinking is an active hazard rather than cleanup: a
 * second process can `open()` the same path, get the lock on a descriptor
 * pointing at an inode the first process is about to unlink, and then both
 * hold "the" lock on different inodes. The file is created once and stays.
 *
 * ## What the file contains
 *
 * The holder's pid, host and ISO acquisition time, so a refusal can name who
 * is holding it rather than saying only that *something* is. The record is
 * truncated away on a clean release, which gives an operator a second, free
 * signal: a lock file with contents but no live `flock` is the fingerprint of
 * a deploy that was killed, and names the process that died.
 */

const LOCK_EX = 2;
const LOCK_NB = 4;

const LIBC = process.platform === 'darwin' ? 'libSystem.B.dylib' : 'libc.so.6';

const { symbols } = dlopen(LIBC, {
  flock: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
});

export interface LockHolder {
  pid: number;
  host: string;
  acquiredAt: string;
}

function holderRecord(): LockHolder {
  return { pid: process.pid, host: hostname(), acquiredAt: new Date().toISOString() };
}

/**
 * Human-readable description of whoever wrote a lock file, for the refusal
 * message. Deliberately total: a lock held by a process that has not yet
 * written its record, or that wrote something unparseable, must still produce
 * a refusal an operator can act on rather than an exception that buries the
 * real reason for the failure.
 */
export function describeHolder(raw: string): string {
  const text = raw.trim();
  if (text === '') return 'holder unknown (lock file is empty)';
  try {
    const h = JSON.parse(text) as Partial<LockHolder>;
    if (
      typeof h.pid !== 'number' ||
      typeof h.host !== 'string' ||
      typeof h.acquiredAt !== 'string'
    ) {
      return `holder unrecognised: ${text}`;
    }
    return `held by pid ${String(h.pid)} on ${h.host} since ${h.acquiredAt}`;
  } catch {
    return `holder unrecognised: ${text}`;
  }
}

function readHolder(lockPath: string): string {
  try {
    return describeHolder(readFileSync(lockPath, 'utf8'));
  } catch {
    return 'holder unknown (lock file could not be read)';
  }
}

/**
 * Rejects aliases and compares the opened regular inode before any owner record write.
 * Proof: removing these validations admitted a replacement between real open and validation;
 * canonical-lock.test.ts observed callback success instead of refusal (exit 1).
 */
function assertCanonicalLock(lockPath: string, descriptor: number): void {
  const opened = fstatSync(descriptor);
  const named = lstatSync(lockPath);
  if (
    !opened.isFile() ||
    !named.isFile() ||
    realpathSync(lockPath) !== lockPath ||
    opened.dev !== named.dev ||
    opened.ino !== named.ino
  )
    throw new Error(`invalid canonical lock: ${lockPath}`);
}

/** Owner-only strict acquisition; legacy {@link withLock} semantics remain unchanged. */
export async function withCanonicalLock<T>(
  lockPath: string,
  fn: (descriptor: number) => Promise<T>,
): Promise<T> {
  return acquireLock(lockPath, fn, true);
}

/** Holds a durable inode lock; the callback may inherit but must not close its descriptor. */
export async function withLock<T>(
  lockPath: string,
  fn: (descriptor: number) => Promise<T>,
): Promise<T> {
  return acquireLock(lockPath, fn, false);
}

async function acquireLock<T>(
  lockPath: string,
  fn: (descriptor: number) => Promise<T>,
  requiresCanonicalLock: boolean,
): Promise<T> {
  // O_RDWR|O_CREAT rather than 'w': truncating on open would erase a live
  // holder's record before we know whether we can even take the lock.
  let fd: number;
  try {
    // Proof: omitting O_NOFOLLOW loses the real kernel ELOOP refusal; canonical-lock.test.ts exits 1.
    fd = openSync(
      lockPath,
      constants.O_RDWR | constants.O_CREAT | (requiresCanonicalLock ? constants.O_NOFOLLOW : 0),
      0o644,
    );
  } catch (cause) {
    if (requiresCanonicalLock)
      throw new Error(`cannot open canonical lock: ${lockPath}`, { cause });
    throw cause;
  }
  if (requiresCanonicalLock) {
    try {
      assertCanonicalLock(lockPath, fd);
    } catch (cause) {
      closeSync(fd);
      throw cause;
    }
  }
  if (symbols.flock(fd, LOCK_EX | LOCK_NB) !== 0) {
    const holder = readHolder(lockPath);
    closeSync(fd);
    throw new Error(`deploy lock held: ${lockPath} — another deploy is running (${holder})`);
  }
  let ownsRecord = false;
  try {
    if (requiresCanonicalLock) assertCanonicalLock(lockPath, fd);
    ownsRecord = true;
    ftruncateSync(fd, 0);
    writeSync(fd, `${JSON.stringify(holderRecord(), null, 2)}\n`, 0, 'utf8');
    return await fn(fd);
  } finally {
    // Truncate before closing, not after: closing is what releases the lock,
    // so anything done after it races the next holder. An empty file left
    // behind is the "released cleanly" signal; a populated one is a corpse.
    try {
      // Proof: unconditional final truncation erased retained opened-inode evidence after locked-boundary replacement (exit 1).
      if (ownsRecord) ftruncateSync(fd, 0);
    } catch {
      // Best effort — the close below is what actually matters.
    }
    closeSync(fd);
  }
}

/**
 * Validates an inherited open description and obtains its existing advisory lock.
 * Proof: skipping this call failed two forged-descriptor and one independent-open
 * production CLI negative; inheriting the actual locked description stayed admitted.
 */
export function assertInheritedLock(lockPath: string, descriptor: number): void {
  const inherited = fstatSync(descriptor);
  const expected = statSync(lockPath);
  if (inherited.dev !== expected.dev || inherited.ino !== expected.ino) {
    throw new Error(`inherited shared edge lock does not name ${lockPath}`);
  }
  if (symbols.flock(descriptor, LOCK_EX | LOCK_NB) !== 0) {
    throw new Error(`shared edge lock held: ${lockPath}`);
  }
}

/** Reacquires an existing canonical inode without creation or holder-record mutation. */
export async function withExistingCanonicalLock<T>(
  lockPath: string,
  action: (descriptor: number) => Promise<T>,
): Promise<T> {
  const descriptor = openSync(
    lockPath,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  const assertExistingName = () => {
    const opened = fstatSync(descriptor, { bigint: true });
    const named = lstatSync(lockPath, { bigint: true });
    if (
      !opened.isFile() ||
      !named.isFile() ||
      realpathSync(lockPath) !== lockPath ||
      opened.dev !== named.dev ||
      opened.ino !== named.ino
    )
      throw new Error(`invalid existing canonical lock: ${lockPath}`);
  };
  try {
    assertExistingName();
    if (symbols.flock(descriptor, LOCK_EX | LOCK_NB) !== 0)
      throw new Error(`existing canonical lock held: ${lockPath}`);
    assertExistingName();
    return await action(descriptor);
  } finally {
    closeSync(descriptor);
  }
}
