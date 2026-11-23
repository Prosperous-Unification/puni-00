import { randomUUID } from 'node:crypto';
import {
  type BigIntStats,
  closeSync,
  constants,
  fstatSync,
  linkSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, normalize } from 'node:path';

import type { Identity } from './process-identity';
export type { Identity } from './process-identity';
interface Token {
  readonly path: string;
  readonly device: bigint;
  readonly inode: bigint;
  readonly bytes: string;
}
export interface Hold extends Token {
  readonly identity: Identity;
}
export type DecisionKind = 'ready' | 'cancelled' | 'retired';
export interface Decision extends Hold {
  readonly kind: DecisionKind;
}
function isAbsent(cause: unknown): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === 'ENOENT';
}
function requirePath(path: string): void {
  // Proof: token-path-* published relative and nonnormalized names inside an isolated cwd without this gate.
  if (!isAbsolute(path) || normalize(path) !== path || path.includes(String.fromCharCode(0)))
    throw new Error('hold pathname must be absolute and normalized');
}
export function parseIdentity(bytes: string): Identity {
  // Proof: token-canonical-boot-grammar decoded noncanonical boot text when this grammar was weakened.
  const fields =
    /^([1-9][0-9]*) ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}) (0|[1-9][0-9]*)\n$/u.exec(
      bytes,
    );
  const pid = fields?.at(1),
    boot = fields?.at(2),
    start = fields?.at(3);
  if (pid === undefined || boot === undefined || start === undefined)
    throw new Error('hold process identity is malformed');
  const number = Number(pid);
  // Proof: token-native-pid-range decoded a syntactically complete PID2147483648 without this bound.
  if (!Number.isInteger(number) || number > 2147483647)
    throw new Error('hold process PID is outside the native range');
  return Object.freeze({ pid: number, boot, start });
}
function settleOperation<T>(work: () => T, cleanup: readonly (() => void)[]): T {
  let attempt: { kind: 'completed'; value: T } | { kind: 'failed'; cause: unknown };
  try {
    attempt = { kind: 'completed', value: work() };
  } catch (cause) {
    attempt = { kind: 'failed', cause };
  }
  const failures: unknown[] = [];
  // Proof: token-primary-cause lost the partial-write cause beside a real close failure without this record.
  if (attempt.kind === 'failed') failures.push(attempt.cause);
  // Proof: token-independent-draft-cleanup left its partial draft when a close failure stopped this loop.
  for (const release of cleanup) {
    try {
      release();
    } catch (cause) {
      failures.push(cause);
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, 'hold operation and cleanup failed');
  if (attempt.kind !== 'completed') throw new Error('hold failure was not preserved');
  return attempt.value;
}
function removeOwnedDraft(path: string): void {
  try {
    unlinkSync(path);
  } catch (cause) {
    // Proof: token-owned-unlink-cause erased modeled draft EACCES beside the real write/close failures.
    if (!isAbsent(cause)) throw cause;
  }
}

function sameFile(left: BigIntStats, right: BigIntStats): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.uid === right.uid &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs
  );
}

function sameObservation(left: BigIntStats, right: BigIntStats): boolean {
  return sameFile(left, right) && left.nlink === right.nlink && left.ctimeNs === right.ctimeNs;
}

/**
 * Observe physical owner-only token bytes through a nonblocking, no-follow FD. Absence models
 * removal. Symlinks, unreadability, invalid UTF-8 and concurrent metadata mutation throw.
 * A publication's draft link removal permits one fresh stable read of the same file and bytes.
 * Stable cooperating parent namespaces are required;
 * this descriptor observation is not an atomic hostile-namespace compare-and-unlink capability.
 */
function readToken<T>(
  path: string,
  decode: (token: Token) => T,
  expected?: { readonly stat: BigIntStats; readonly bytes: string },
): T | undefined {
  requirePath(path);
  let descriptor: number;
  try {
    // Proof: token-nofollow admitted valid full identity through a symlink without NOFOLLOW.
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW);
  } catch (cause) {
    if (isAbsent(cause)) return undefined;
    throw new Error('hold token is unreadable', { cause });
  }
  return settleOperation(() => {
    const before = fstatSync(descriptor, { bigint: true });
    // Proof: token-private-fifo read valid identity bytes from a real 0600 FIFO without this guard.
    if (!before.isFile()) throw new Error('hold token must be a regular file');
    // Proof: token-private-mode admitted a real 0644 token with otherwise valid identity bytes.
    if ((before.mode & 0o077n) !== 0n) throw new Error('hold token must be owner-only');
    const owner = process.getuid?.();
    // Proof: token-current-uid admitted stable foreign UID observations without this guard.
    if (owner === undefined || before.uid !== BigInt(owner))
      throw new Error('hold token must belong to the current user');
    // Proof: without the saved observation, a replacement inode with identical bytes was admitted on retry.
    if (expected !== undefined && !sameObservation(expected.stat, before))
      throw new Error('hold token changed during observation');
    // Proof: token-bom-exact replay returned present when BOM bytes were normalized instead of preserved.
    // Proof: fatal-utf8-stage reached downstream grammar instead of decoder TypeError without fatal decoding; neither path admits invalid bytes.
    const bytes = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      readFileSync(descriptor),
    );
    const after = fstatSync(descriptor, { bigint: true });
    // Proof: token-read-time-change admitted bytes after actual same-inode utimes between fstats.
    if (!sameObservation(before, after)) {
      if (
        expected === undefined &&
        before.nlink === 2n &&
        after.nlink === 1n &&
        sameFile(before, after)
      ) {
        const stable = readToken(path, (token) => token, { stat: after, bytes });
        if (stable !== undefined) return decode(stable);
      }
      throw new Error('hold token changed during observation');
    }
    // Proof: without this check, differing byte observations were admitted during the draft removal retry.
    if (expected !== undefined && expected.bytes !== bytes)
      throw new Error('hold token changed during observation');
    return decode(
      Object.freeze({
        path,
        device: before.dev,
        inode: before.ino,
        bytes,
      }),
    );
  }, [
    () => {
      closeSync(descriptor);
    },
  ]);
}

/** Read the unchanged historical full birth format; absence is explicit and malformed identity throws. */
export function readHold(path: string): Hold | undefined {
  // Proof: token-decode-hold-owner lost malformed identity beside actual close failure outside this owner.
  return readToken(path, (token) =>
    Object.freeze({ ...token, identity: parseIdentity(token.bytes) }),
  );
}
function parseDecision(bytes: string): {
  readonly kind: DecisionKind;
  readonly identity: Identity;
} {
  const separator = bytes.indexOf(' '),
    kind = bytes.slice(0, separator);
  // Proof: unknown-kind codec control accepted private valid-identity bytes when this discriminator was removed.
  if (kind !== 'ready' && kind !== 'cancelled' && kind !== 'retired')
    throw new Error('hold decision kind is malformed');
  return { kind, identity: parseIdentity(bytes.slice(separator + 1)) };
}
/** Read a version-one immutable decision with an explicit admission, cancellation or retirement meaning. */
export function readDecision(path: string): Decision | undefined {
  // Proof: token-decode-decision-owner lost malformed kind beside actual close failure outside this owner.
  return readToken(path, (token) => Object.freeze({ ...token, ...parseDecision(token.bytes) }));
}

/** Encode one canonical full birth identity; malformed trusted fields fail before publication. */
export function formatIdentity(identity: Identity): string {
  const bytes =
    String(identity.pid) + ' ' + identity.boot + ' ' + identity.start + String.fromCharCode(10);
  parseIdentity(bytes);
  return bytes;
}
/**
 * Publish the child's complete immutable identity by exclusive hard link from its own closed
 * same-directory draft. A preexisting token is never overwritten or removed. Failure cleanup
 * attempts the descriptor and owned draft independently; an already published token remains
 * for explicit identity-checked failed-acquisition recovery rather than being blindly deleted.
 */
function createToken(path: string, bytes: string): Token {
  requirePath(path);
  const draft = path + '.draft-' + randomUUID(),
    descriptor = openSync(draft, 'wx', 0o600);
  let wasCloseAttempted = false;
  return settleOperation(() => {
    writeFileSync(descriptor, bytes);
    // Proof: token-creator-close-once closed a recycled sibling after actual close reported failure.
    wasCloseAttempted = true;
    closeSync(descriptor);
    // Proof: token-exclusive-link granted an existing valid generation without exclusive publication.
    linkSync(draft, path);
    const published = readToken(path, (token) => token);
    // Proof: token-published-readback granted changed valid bytes with an inconsistent identity without this check.
    if (published?.bytes !== bytes) throw new Error('published hold token is absent or changed');
    return published;
  }, [
    () => {
      if (!wasCloseAttempted) {
        wasCloseAttempted = true;
        closeSync(descriptor);
      }
    },
    () => {
      removeOwnedDraft(draft);
    },
  ]);
}

/** Publish one complete historical child birth token without changing its three-field byte format. */
export function createHold(path: string, identity: Identity): Hold {
  const bytes = formatIdentity(identity),
    token = createToken(path, bytes);
  return Object.freeze({ ...token, identity: parseIdentity(bytes) });
}
/** Publish an exclusive typed decision; its full helper witness survives until qualified generation cleanup. */
export function createDecision(path: string, kind: DecisionKind, identity: Identity): Decision {
  const bytes = kind + ' ' + formatIdentity(identity),
    decoded = parseDecision(bytes),
    token = createToken(path, bytes);
  return Object.freeze({ ...token, ...decoded });
}

/** Check the original inode and raw bytes; a replacement or mutation never authorizes release. */
export function verifyHold(hold: Hold): 'present' | 'released' {
  const current = readToken(hold.path, (token) => token);
  if (current === undefined) return 'released';
  if (
    current.device !== hold.device ||
    current.inode !== hold.inode ||
    current.bytes !== hold.bytes
  )
    throw new Error('hold token no longer matches its owner');
  return 'present';
}

/** Remove only this exact observed token under the cooperating stable-namespace contract. */
export function releaseHold(hold: Hold): 'released' | 'gone' {
  // Proof: token-direct-release unlinked a replacement inode with identical bytes without this prerequisite.
  if (verifyHold(hold) === 'released') return 'gone';
  try {
    unlinkSync(hold.path);
    return 'released';
  } catch (cause) {
    if (isAbsent(cause)) return 'gone';
    throw new Error('owned hold token could not be released', { cause });
  }
}
