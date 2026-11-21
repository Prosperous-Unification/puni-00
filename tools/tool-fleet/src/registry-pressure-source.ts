import { createHash } from 'node:crypto';
import { addAbortListener } from 'node:events';
import { constants, type Stats } from 'node:fs';
import * as fs from 'node:fs/promises';

import {
  buildRegistryStatusSshArguments,
  parseRegistryStatusEnrollment,
  type RegistryStatusReply,
  renderRegistryStatusPin,
} from './registry-pressure-source-contract';
import {
  acquisitionCutoff,
  type CleanupOutcome,
  deadlineReached,
  readRegistryStatusProcess,
  registryStatusCancelled,
  statusTimeout,
  waitUntil,
} from './registry-pressure-source-process';

export interface RegistryPressureSource {
  /** Acquires one original frame within the caller's absolute monotonic deadline. */
  read(signal: AbortSignal, deadline: number): Promise<RegistryStatusReply>;
  /** Removes the owned pin after work has settled. Repeat calls after success are safe. */
  close(): Promise<void>;
}

/** Local cleanup failed. A known modeled exchange outcome remains available to the caller. */
export class RegistrySourceCleanupError extends Error {
  constructor(
    readonly outcome: CleanupOutcome | undefined,
    message = 'registry status source cleanup is unresolved',
  ) {
    super(message);
    this.name = 'RegistrySourceCleanupError';
  }
}

type FileRole = 'pin' | 'identity';
type FileStamp = Pick<Stats, 'dev' | 'ino'>;
type CheckAcquisition = () => void;

class AcquisitionStopped extends Error {}

class DescriptorCloseError extends Error {}

function sameFile(first: FileStamp, second: FileStamp): boolean {
  // Proof: Omitting device or inode checks broke the modeled device and replacement pin tests.
  return first.dev === second.dev && first.ino === second.ino;
}

/** Rephrases filesystem diagnostics without retaining credential material or paths. */
async function requireState<Value>(
  work: Promise<Value>,
  subject: string,
  failed: string,
): Promise<Value> {
  return work.catch((cause: unknown) => {
    if (cause instanceof Error && 'code' in cause) {
      // Proof: Dropping each diagnostic broke the missing directory or symlink pin test.
      if (cause.code === 'ENOENT') throw new Error('registry status ' + subject + ' is missing');
      if (cause.code === 'ELOOP') throw new Error('registry status ' + subject + ' is a symlink');
    }
    throw new Error('registry status ' + subject + ' ' + failed);
  });
}

async function closeFile(file: fs.FileHandle, role: FileRole): Promise<void> {
  try {
    await file.close();
  } catch {
    throw new DescriptorCloseError('registry status ' + role + ' close failed');
  }
}

async function inspectDirectory(path: string, uid: number): Promise<Stats> {
  const directory = await requireState(fs.lstat(path), 'directory', 'is unreadable');
  // Proof: Following the directory symlink or dropping any admission predicate broke its directory test.
  if (!directory.isDirectory() || directory.uid !== uid || (directory.mode & 0o7777) !== 0o700) {
    throw new Error('registry status directory requires an owned mode 0700 directory');
  }
  return directory;
}

function admitFile(stat: Stats, role: FileRole, uid: number): void {
  // Proof: Removing regular-file, link, owner or mode admission broke its corresponding pin or key test.
  if (!stat.isFile()) throw new Error('registry status ' + role + ' is not a regular file');
  if (stat.nlink !== 1) throw new Error('registry status ' + role + ' has multiple links');
  if (stat.uid !== uid && !(role === 'identity' && stat.uid === 0)) {
    throw new Error('registry status ' + role + ' has an unexpected owner');
  }
  const mode = stat.mode & 0o7777;
  if (mode !== 0o400 && !(role === 'identity' && mode === 0o600)) {
    throw new Error('registry status ' + role + ' has an unexpected mode');
  }
}

/** Verifies the open inode and reads through EOF with at most one extra byte probed. */
async function readFile(
  path: string,
  role: FileRole,
  uid: number,
  maximum: number,
  checkAcquisition?: CheckAcquisition,
): Promise<{ bytes: Buffer; stamp: FileStamp }> {
  // Proof: Omitting this guard opened the pin after the terminal preflight timeout.
  checkAcquisition?.();
  // Proof: Dropping no-follow admitted the identity symlink. Dropping nonblocking broke the open-flags test.
  const file = await requireState(
    fs.open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK),
    role,
    'is unreadable',
  );
  try {
    // Proof: Omitting this guard inspected the descriptor after its delayed open crossed cutoff.
    checkAcquisition?.();
    const stamp = await requireState(file.stat(), role, 'is unreadable');
    admitFile(stamp, role, uid);
    const bytes = Buffer.alloc(maximum);
    let offset = 0;
    while (offset < maximum) {
      // Proof: Omitting this guard started reads after a delayed stat or an earlier abort.
      checkAcquisition?.();
      const { bytesRead } = await requireState(
        file.read(bytes, offset, maximum - offset, null),
        role,
        'is unreadable',
      );
      if (bytesRead === 0) return { bytes: bytes.subarray(0, offset), stamp };
      offset += bytesRead;
    }
    // Proof: Omitting this guard probed EOF after the full-limit read crossed cutoff.
    checkAcquisition?.();
    const { bytesRead } = await requireState(
      file.read(Buffer.alloc(1), 0, 1, null),
      role,
      'is unreadable',
    );
    // Proof: Skipping the extra-byte rejection or widening the pin bound broke the oversized file tests.
    if (bytesRead !== 0) throw new Error('registry status ' + role + ' is too large');
    return { bytes, stamp };
  } finally {
    // Proof: Suppressing a descriptor-close rejection broke the local cleanup error test.
    await closeFile(file, role);
  }
}

/** Creates only the exclusive pin and removes an incompletely initialized inode if still owned. */
async function createPin(path: string, bytes: Buffer, uid: number): Promise<FileStamp> {
  const file = await requireState(
    // Proof: Removing exclusivity overwrote the inserted fixture. Changing create mode broke its mode test.
    fs.open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o400),
    'pin',
    'creation failed',
  );
  let stamp: Stats | undefined;
  try {
    try {
      stamp = await requireState(file.stat(), 'pin', 'inspection failed');
      // Proof: Omitting chmod broke pin creation under the modeled restrictive create mask.
      await requireState(file.chmod(0o400), 'pin', 'mode setup failed');
      await requireState(file.writeFile(bytes), 'pin', 'write failed');
    } finally {
      await closeFile(file, 'pin');
    }
    const written = await readFile(path, 'pin', uid, 512);
    // Proof: Dropping either creation check broke its incorrect-bytes or replacement-inode test.
    if (!sameFile(written.stamp, stamp) || !written.bytes.equals(bytes)) {
      throw new Error('registry status pin differs from its expected creation');
    }
    return stamp;
  } catch (cause) {
    if (stamp !== undefined) {
      const current = await requireState(fs.lstat(path), 'pin', 'inspection failed');
      // Proof: Removing the inode condition deleted a foreign replacement. Skipping removal stranded the incomplete pin.
      if (sameFile(stamp, current)) {
        await requireState(fs.unlink(path), 'pin', 'removal failed');
      }
    }
    throw cause;
  }
}

async function checkExecutable(checkAcquisition: CheckAcquisition): Promise<void> {
  // Proof: Omitting this guard ran executable stat after an earlier identity acquisition crossed cutoff.
  checkAcquisition();
  const path = '/usr/bin/ssh';
  // Proof: Bypassing stat, regular-file admission or executable access broke the matching local SSH tests.
  const executable = await requireState(fs.stat(path), 'SSH executable', 'is unreadable');
  if (!executable.isFile()) throw new Error('registry status SSH executable is not a regular file');
  // Proof: Omitting this guard started access admission after executable stat crossed cutoff.
  checkAcquisition();
  // Proof: Removing read access reached the intercepted spawn in the execute-allowed/read-denied test.
  await requireState(
    fs.access(path, constants.R_OK | constants.X_OK),
    'SSH executable',
    'lacks read or execute access',
  );
}

function requireUid(): number {
  const uid = process.getuid?.();
  // Proof: Allowing UID zero broke the modeled root refusal test.
  if (uid === undefined || uid === 0)
    throw new Error('registry status source requires a non-root UID');
  return uid;
}

function checkCancellation(signal: AbortSignal): void {
  if (signal.aborted) throw registryStatusCancelled();
}

/** Admits an existing empty private directory and creates its one pinned SSH status actor. */
export async function openRegistryPressureSource(
  input: unknown,
  directory: string,
): Promise<RegistryPressureSource> {
  // Proof: Removing the unknown field before parsing broke the malformed enrollment test.
  const enrollment = parseRegistryStatusEnrollment(input);
  const uid = requireUid();
  const pin = directory + '/known_hosts';
  const argv = buildRegistryStatusSshArguments(enrollment, pin);
  const expectedPin = Buffer.from(renderRegistryStatusPin(enrollment));
  const directoryStamp = await inspectDirectory(directory, uid);
  // Proof: Hiding the access classification or permitting nonempty directories broke their admission tests.
  const entries = await requireState(fs.readdir(directory), 'directory', 'is unreadable');
  if (entries.length !== 0) throw new Error('registry status directory is not empty');
  const pinStamp = await createPin(pin, expectedPin, uid);

  let phase: 'open' | 'busy' | 'closing' | 'fault' | 'closed' = 'open';
  let isCleanupSettled = true;

  function latchFault(settled: Promise<boolean>): void {
    phase = 'fault';
    isCleanupSettled = false;
    void settled.then((isSettled) => {
      isCleanupSettled = isSettled;
    });
  }

  function finishRead(): void {
    if (phase === 'busy') phase = 'open';
  }

  async function checkPin(checkAcquisition?: CheckAcquisition): Promise<void> {
    // Proof: Omitting this guard started directory inspection after the subscription delay crossed cutoff.
    checkAcquisition?.();
    const current = await inspectDirectory(directory, uid);
    // Proof: Omitting this check broke the replacement directory test before read and close.
    if (!sameFile(current, directoryStamp))
      throw new Error('registry status directory was replaced');
    const local = await readFile(pin, 'pin', uid, 512, checkAcquisition);
    // Proof: Skipping the stamp or bytes comparison broke the exact owned pin tests.
    if (!sameFile(local.stamp, pinStamp) || !local.bytes.equals(expectedPin)) {
      throw new Error('registry status pin differs from its owned enrollment');
    }
  }

  async function checkIdentity(checkAcquisition: CheckAcquisition): Promise<void> {
    const { bytes } = await readFile(
      enrollment.identity.path,
      'identity',
      uid,
      4096,
      checkAcquisition,
    );
    // Proof: Skipping the digest comparison broke the changed private identity test.
    if (createHash('sha256').update(bytes).digest('hex') !== enrollment.identity.sha256) {
      throw new Error('registry status identity does not match enrollment');
    }
  }

  /** Waits for every started filesystem operation, including its descriptor cleanup. */
  async function preflight(signal: AbortSignal, deadline: number): Promise<void> {
    const cutoff = acquisitionCutoff(deadline);
    const cancellation = { beforeCutoff: false };
    const onAbort = () => {
      // Proof: Accepting late abort broke the cutoff-first test for pending local IO.
      cancellation.beforeCutoff = performance.now() < cutoff;
    };
    // Proof: A plain listener missed the shared preflight abort. Omitting disposal leaked a listener.
    using _subscription = addAbortListener(signal, onAbort);
    function checkAcquisition(): void {
      // Proof: Removing the abort or cutoff clause started new credential IO in the matching paused test.
      if (cancellation.beforeCutoff || performance.now() >= cutoff) {
        throw new AcquisitionStopped();
      }
    }
    const pending = Promise.allSettled([
      checkPin(checkAcquisition),
      checkIdentity(checkAcquisition),
      checkExecutable(checkAcquisition),
    ]);
    // Proof: Granting extra settling time broke the unsettled preflight original-deadline test.
    const checks = await waitUntil(pending, deadline);
    if (checks === deadlineReached) {
      latchFault(
        pending.then((settled) =>
          settled.every(
            (check) =>
              check.status === 'fulfilled' || !(check.reason instanceof DescriptorCloseError),
          ),
        ),
      );
      throw new RegistrySourceCleanupError(cancellation.beforeCutoff ? undefined : statusTimeout);
    }
    for (const check of checks) {
      if (check.status === 'rejected' && check.reason instanceof DescriptorCloseError) {
        latchFault(Promise.resolve(false));
        throw new RegistrySourceCleanupError(
          performance.now() >= cutoff && !cancellation.beforeCutoff ? statusTimeout : undefined,
          check.reason.message,
        );
      }
    }
    for (const check of checks) {
      // Proof: Surfacing the internal stop leaked a local error from the shared preflight abort.
      if (check.status === 'rejected' && !(check.reason instanceof AcquisitionStopped)) {
        throw check.reason;
      }
    }
    // Proof: Dropping prior cancellation broke the abort-first preflight test.
    if (cancellation.beforeCutoff) throw registryStatusCancelled();
  }

  return {
    async read(signal, deadline) {
      // Proof: Allowing any busy, closing, closed or faulted read broke its lifecycle test.
      if (phase !== 'open') throw new Error('registry status source is ' + phase);
      const now = performance.now();
      // Proof: Dropping finite or maximum admission broke the NaN or too-far deadline test.
      if (!Number.isFinite(deadline) || deadline - now > 5000) {
        throw new Error(
          'registry status deadline must be finite and at most 5000 milliseconds ahead',
        );
      }
      // Proof: Starting preflight on abort or an expired deadline touched the missing-key fixture and failed.
      checkCancellation(signal);
      if (now >= acquisitionCutoff(deadline)) return statusTimeout;

      phase = 'busy';
      try {
        let abortedAt = Infinity;
        let exchange: Awaited<ReturnType<typeof readRegistryStatusProcess>>;
        {
          // Proof: Suppressing the read-wide timestamp lost the abort during preflight disposal.
          using _readSubscription = addAbortListener(AbortSignal.any([signal]), () => {
            abortedAt = performance.now();
          });
          await preflight(signal, deadline);
          exchange = await readRegistryStatusProcess(argv, signal, deadline, () => abortedAt);
        }
        if (exchange.state === 'cleanup-failed') {
          latchFault(exchange.settled);
          throw new RegistrySourceCleanupError(exchange.outcome);
        }
        // Proof: Dropping this check broke the modeled pause between cleanup and public receipt.
        if (exchange.state === 'received' && performance.now() >= deadline) {
          // Proof: Ignoring the timestamp lost early abort. Accepting late abort or using acquisition cutoff broke the reverse order or reserve case.
          if (abortedAt < deadline) throw registryStatusCancelled();
          return statusTimeout;
        }
        // Proof: Dropping any natural case bypassed cancellation at delivery. Checking every outcome replaced primary caps and timeout with cancellation.
        if (
          exchange.state === 'received' ||
          exchange.code === 'refused' ||
          exchange.code === 'ssh-exit'
        ) {
          checkCancellation(signal);
        }
        return exchange;
      } finally {
        finishRead();
      }
    },
    async close() {
      // Proof: Dropping the repeat, busy, closing or unresolved guard broke its close test.
      if (phase === 'closed') return;
      if (phase === 'busy' || phase === 'closing')
        throw new Error('registry status source is busy');
      if (!isCleanupSettled) throw new Error('registry status source cleanup is unresolved');
      const before = phase;
      phase = 'closing';
      try {
        await checkPin();
        // Proof: Skipping unlink left the pin in the repeat-close preservation test.
        await requireState(fs.unlink(pin), 'pin', 'removal failed');
        phase = 'closed';
      } catch (cause) {
        phase = before;
        if (cause instanceof DescriptorCloseError) {
          latchFault(Promise.resolve(false));
          throw new RegistrySourceCleanupError(undefined, cause.message);
        }
        throw cause;
      }
    },
  };
}
