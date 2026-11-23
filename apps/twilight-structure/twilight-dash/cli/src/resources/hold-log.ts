import {
  type BigIntStats,
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  unlinkSync,
} from 'node:fs';
import { isAbsolute, normalize } from 'node:path';

import { holdLogFile } from './hold-paths';
import { formatIdentity } from './hold-token';
import { identifySelf, type Identity } from './process-identity';

const generation = Symbol('physical hold generation');
export interface Generation {
  readonly [generation]: true;
  readonly path: string;
  readonly device: bigint;
  readonly inode: bigint;
}
const reservation = Symbol('inherited hold log'),
  ownership = Symbol('owned hold log');
export interface Reservation {
  readonly [reservation]: true;
  readonly holdFile: string;
  readonly path: string;
  readonly controller: Identity;
  readonly device: bigint;
  readonly inode: bigint;
}
export interface Log {
  readonly [ownership]: { requireClosed(): void };
  readonly path: string;
  readonly controller: Identity;
  readonly device: bigint;
  readonly inode: bigint;
  readonly descriptor: number;
  closeDescriptor(): void;
}
/** Reject noncanonical hold paths before reserving or observing their log. */
// Proof: reservation-path-* admitted relative or nonnormalized generations without this gate.
function resolveLogPath(holdFile: string): string {
  if (
    !isAbsolute(holdFile) ||
    normalize(holdFile) !== holdFile ||
    holdFile.includes(String.fromCharCode(0))
  )
    throw new Error('hold log pathname must be absolute and normalized');
  return holdLogFile(holdFile);
}
function isAbsent(cause: unknown): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === 'ENOENT';
}
function requirePrivateFile(file: BigIntStats): void {
  // Proof: log-private-nonregular admitted a real 0600 directory without this guard.
  // The older 0700 control only reached the mode refusal and does not prove this boundary.
  if (!file.isFile()) throw new Error('hold log must be a regular file');
  // Proof: removing0600 validation failed nonprivate snapshot and paired validation/close tests.
  if ((file.mode & 0o777n) !== 0o600n)
    throw new Error('hold log must be owner-only readable and writable');
  const uid = process.getuid?.();
  // Proof: removing UID validation admitted injected foreign ownership at both generation boundaries.
  if (uid === undefined || file.uid !== BigInt(uid))
    throw new Error('hold log must belong to the current user');
}
function throwFailures(failures: readonly unknown[]): never {
  if (failures.length === 1) throw failures[0];
  throw new AggregateError(failures, 'hold log operation and cleanup failed');
}

/**
 * Reserve one helper generation with an exclusive physical log and a captured controller identity.
 * Keep the pathname until the child is confirmed ended. Both child outputs inherit this same FD;
 * frontend death cannot close the child's copies. Partial creation failures attempt close/unlink
 * independently under the cooperating stable-parent namespace contract, preserving all causes.
 */
export function reserveLog(holdFile: string): Log {
  const path = resolveLogPath(holdFile),
    controller = Object.freeze({ ...identifySelf() });
  formatIdentity(controller);
  const descriptor = openSync(
    path,
    constants.O_WRONLY |
      constants.O_CREAT |
      // Proof: reservation-exclusive granted a preexisting generation without exclusive creation.
      constants.O_EXCL |
      constants.O_APPEND |
      constants.O_NONBLOCK |
      constants.O_NOFOLLOW,
    0o600,
  );
  let file: BigIntStats;
  try {
    file = fstatSync(descriptor, { bigint: true });
    requirePrivateFile(file);
  } catch (cause) {
    const failures: unknown[] = [cause];
    try {
      closeSync(descriptor);
    } catch (closeFailure) {
      failures.push(closeFailure);
    }
    try {
      unlinkSync(path);
    } catch (unlinkFailure) {
      failures.push(unlinkFailure);
    }
    throwFailures(failures);
  }
  let state: { kind: 'open' } | { kind: 'closed' } | { kind: 'failed'; cause: unknown } = {
    kind: 'open',
  };
  return Object.freeze({
    [ownership]: Object.freeze({
      requireClosed() {
        // Proof: log-open-authority removed the still-open reserved pathname without this guard.
        if (state.kind === 'open') throw new Error('hold log descriptor is still open');
        // Proof: log-close-failed-authority granted verification despite the recorded actual close failure.
        if (state.kind === 'failed') throw state.cause;
      },
    }),
    path,
    controller,
    device: file.dev,
    inode: file.ino,
    get descriptor() {
      // Proof: log-closed-export returned a descriptor now naming another physical file without this guard.
      if (state.kind !== 'open') throw new Error('hold log descriptor is not open');
      return descriptor;
    },
    closeDescriptor() {
      // Proof: log-close-recycled closed the actual recycled sibling descriptor without this guard.
      if (state.kind === 'closed') return;
      if (state.kind === 'failed') throw state.cause;
      try {
        closeSync(descriptor);
        state = { kind: 'closed' };
      } catch (cause) {
        state = { kind: 'failed', cause };
        throw cause;
      }
    },
  });
}

/**
 * Bind inherited stdout/stderr to the reserved physical log and validate its supplied controller identity.
 * Diagnostic bytes are opaque. This creates the typed generation/controller prerequisite
 * before a private helper publishes a hold token or enters the canonical queue.
 */
export function readReservation(holdFile: string, controller: Identity): Reservation {
  const pinned = Object.freeze({ ...controller });
  formatIdentity(pinned);
  // Proof: log-distinct-controller granted a reservation to the helper itself without this guard.
  if (pinned.pid === process.pid)
    throw new Error('hold helper must have a distinct controller process');
  const path = resolveLogPath(holdFile),
    stdout = fstatSync(1, { bigint: true }),
    stderr = fstatSync(2, { bigint: true });
  // Proof: log-inherited-stderr granted a reservation with two different valid private output files.
  if (stdout.dev !== stderr.dev || stdout.ino !== stderr.ino)
    throw new Error('hold helper outputs must share the reserved log');
  const descriptor = openSync(
    path,
    constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW,
  );
  let observed: { kind: 'reserved'; value: Reservation } | { kind: 'failed'; cause: unknown };
  try {
    const file = fstatSync(descriptor, { bigint: true });
    requirePrivateFile(file);
    // Proof: log-named-output-binding granted outputs that matched each other but another valid log inode.
    if (file.dev !== stdout.dev || file.ino !== stdout.ino)
      throw new Error('hold helper outputs do not match the reserved log pathname');
    observed = {
      kind: 'reserved',
      value: Object.freeze({
        [reservation]: true as const,
        holdFile,
        path,
        controller: pinned,
        device: file.dev,
        inode: file.ino,
      }),
    };
  } catch (cause) {
    observed = { kind: 'failed', cause };
  }
  const failures: unknown[] = [];
  if (observed.kind === 'failed') failures.push(observed.cause);
  try {
    closeSync(descriptor);
  } catch (cause) {
    failures.push(cause);
  }
  if (failures.length !== 0) throwFailures(failures);
  if (observed.kind !== 'reserved')
    throw new Error('hold log reservation failure was not preserved');
  return observed.value;
}

/** Require the unchanged closed physical generation before deriving post-native-end token authority. */
export function verifyLog(log: Log): void {
  log[ownership].requireClosed();
  const file = lstatSync(log.path, { bigint: true });
  requirePrivateFile(file);
  // Proof: log-original-verification granted original-generation authority for a replacement inode.
  if (file.dev !== log.device || file.ino !== log.inode)
    throw new Error('hold log pathname was replaced');
}

/** Remove this log only after confirmed child termination; preserve replacement/unreadable state. */
export function removeLog(log: Log): void {
  log[ownership].requireClosed();
  let file: BigIntStats;
  try {
    file = lstatSync(log.path, { bigint: true });
  } catch (cause) {
    if (isAbsent(cause)) return;
    throw cause;
  }
  requirePrivateFile(file);
  // Proof: log-original-removal unlinked the replacement inode without this comparison.
  if (file.dev !== log.device || file.ino !== log.inode)
    throw new Error('hold log pathname was replaced');
  try {
    unlinkSync(log.path);
  } catch (cause) {
    if (!isAbsent(cause)) throw cause;
  }
}

/**
 * Snapshot the current private physical generation; no historical inode is inferred. The caller
 * separately qualifies the helper's complete birth and ledger authorization before removal.
 * Absence is explicit; validation and descriptor-close failures both survive.
 */
export function readGeneration(holdFile: string): Generation | undefined {
  const path = resolveLogPath(holdFile);
  let descriptor: number;
  // Proof: dropping NOFOLLOW made the linked-generation snapshot test accept its target.
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW);
  } catch (cause) {
    if (isAbsent(cause)) return undefined;
    throw cause;
  }
  let observed: { kind: 'read'; value: Generation } | { kind: 'failed'; cause: unknown };
  try {
    const file = fstatSync(descriptor, { bigint: true });
    requirePrivateFile(file);
    observed = {
      kind: 'read',
      value: Object.freeze({
        [generation]: true as const,
        path,
        device: file.dev,
        inode: file.ino,
      }),
    };
  } catch (cause) {
    observed = { kind: 'failed', cause };
  }
  const failures: unknown[] = [];
  // Proof: generation-paired-validation erased the validation cause beside actual close failure when omitted.
  if (observed.kind === 'failed') failures.push(observed.cause);
  try {
    closeSync(descriptor);
  } catch (cause) {
    // Proof: generation-paired-close erased this actual close cause beside validation failure when omitted.
    failures.push(cause);
  }
  if (failures.length !== 0) throwFailures(failures);
  if (observed.kind !== 'read') throw new Error('hold generation failure was not preserved');
  return observed.value;
}
/** Remove only the pinned current inode after the caller qualifies complete helper end and ledger release. */
export function removeGeneration(snapshot: Generation): void {
  let file: BigIntStats;
  try {
    file = lstatSync(snapshot.path, { bigint: true });
  } catch (cause) {
    if (isAbsent(cause)) return;
    throw cause;
  }
  requirePrivateFile(file);
  // Proof: deleting this comparison made the snapshot test remove a replacement inode.
  if (file.dev !== snapshot.device || file.ino !== snapshot.inode)
    throw new Error('hold log pathname was replaced');
  try {
    unlinkSync(snapshot.path);
  } catch (cause) {
    if (!isAbsent(cause)) throw cause;
  }
}
