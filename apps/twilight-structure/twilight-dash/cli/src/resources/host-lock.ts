import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { Monotonic, WallClock } from '../clock';
import { readTermination } from '../ops/native-exit';
import { removeLog, reserveLog, verifyLog } from './hold-log';
import { resolveReadyFile } from './hold-paths';
import {
  createDecision,
  type Decision,
  formatIdentity,
  type Hold,
  readDecision,
  readHold,
  releaseHold,
  verifyHold,
} from './hold-token';
import type { Identity } from './process-identity';

/** Canonical mutex and an immutable launch prefix selected by the composing installed CLI. */
export interface HostLock {
  readonly lockPath: string;
  readonly helperPrefix: readonly string[];
  readonly clock: WallClock;
  readonly monotonic: Monotonic;
}
export interface HoldRequest {
  readonly holdFile: string;
  readonly label: string;
  readonly waitSeconds: number;
  readonly pollSeconds: number;
  readonly signal: AbortSignal;
  readonly report: (line: string) => void;
  readonly claimGraceMs?: number;
}
/** Optional diagnostic bytes never establish ownership; loss remains explicit to callers. */
export type Diagnostics =
  | { readonly kind: 'readable'; readonly text: string }
  | { readonly kind: 'unavailable'; readonly cause: unknown };
export interface HostHold {
  readonly pid: number;
  readonly identity: Identity;
  diagnostics(): Diagnostics;
  /** Call only after compute-ledger authorization; removal releases this exact immutable token. */
  release(): void;
  /** Lazy projection: ignored long-lived holders do not create unhandled rejecting promises. */
  readonly exited: Promise<number>;
}
export type HoldOutcome =
  | { kind: 'held'; hold: HostHold }
  | { kind: 'refused'; exitCode: number; reason: string }
  | { kind: 'cancelled' };
type NativeExit =
  { kind: 'pending' } | { kind: 'ended'; status: number } | { kind: 'unknown'; cause: unknown };
type NumericExit =
  { kind: 'pending' } | { kind: 'observed'; status: unknown } | { kind: 'failed'; cause: unknown };
function readExit(code: unknown, signal: unknown): NativeExit {
  const termination = readTermination(code, signal);
  return termination.kind === 'confirmed'
    ? { kind: 'ended', status: termination.status }
    : { kind: 'unknown', cause: termination.cause };
}
function hasCode(cause: unknown, code: string): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === code;
}
function reason(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
function throwFailures(failures: readonly unknown[]): void {
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, 'durable holder settlement failed');
}

/** Capture the selected protected helper before asynchronously selecting the fixed platform mutex. */
export async function resolveHostLock(
  helperPrefix: readonly string[],
  clocks: Pick<HostLock, 'clock' | 'monotonic'>,
): Promise<HostLock> {
  const { clock, monotonic } = clocks;
  // Proof: resolve-capture failed both clock values when bound method capture was replaced by delayed caller-port reads.
  const capturedClock = Object.freeze({ read: clock.read.bind(clock) }),
    capturedMonotonic = Object.freeze({ now: monotonic.now.bind(monotonic) });
  // Proof: resolve-capture returned the mutated unprotected prefix when the selected prefix copy was removed.
  const captured = Object.freeze([...helperPrefix]);
  // Proof: invalid-resolve-prefix returned a malformed HostLock when this validation was removed.
  if (
    captured.length === 0 ||
    captured.some((word) => word === '' || word.includes(String.fromCharCode(0)))
  )
    throw new Error('durable holder launch prefix is invalid');
  const { selectLockPath } = await import('@shared/heavy-lock');
  return Object.freeze({
    lockPath: selectLockPath(process.platform),
    helperPrefix: captured,
    clock: capturedClock,
    monotonic: capturedMonotonic,
  });
}

/** Observe a live Linux birth tuple; disappearance alone is an expected race with native exit. */
function readBirth(pid: number): Identity | undefined {
  let source: string;
  try {
    source = readFileSync('/proc/' + String(pid) + '/stat', 'utf8');
  } catch (cause) {
    if (hasCode(cause, 'ENOENT') || hasCode(cause, 'ESRCH')) return undefined;
    throw new Error('durable holder birth identity is unreadable', { cause });
  }
  const end = source.lastIndexOf(')'),
    start = source
      .slice(end + 2)
      .split(' ')
      .at(19);
  if (end < 0 || start === undefined) throw new Error('durable holder birth identity is malformed');
  const identity = {
    pid,
    boot: readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim(),
    start,
  };
  formatIdentity(identity);
  return identity;
}

/**
 * Launch one detached native queue owner using an exclusive physical log generation. Ready,
 * cancellation and retirement compete through one exclusive decision pathname. Ready transfers
 * ownership with the helper identity; cancellation withdraws pending admission with the controller
 * identity; retirement retains the helper identity after ledger-authorized withdrawal. Frontend
 * death authorizes neither withdrawal nor cleanup. See
 * {@link ../../../../../../docs/adr/0085-durable-holds-retain-helper-identities.md Retained helper identities}.
 * Log bytes are diagnostics; the physical generation reserves this acquisition. Unknown native termination retains all metadata and never grants
 * cleanup authority. Cleanup after actual native end retains the final helper witness until every prerequisite succeeds.
 */
export async function acquireHold(
  lock: HostLock,
  request: HoldRequest,
  environment: Readonly<Record<string, string | undefined>>,
): Promise<HoldOutcome> {
  const { lockPath, clock, monotonic } = lock,
    prefix = [...lock.helperPrefix];
  // Proof: acquire-capture failed handoff when either captured clock method was changed to a delayed caller-port read.
  const readWall = clock.read.bind(clock),
    readMonotonic = monotonic.now.bind(monotonic);
  // Proof: acquire-capture refused its original protected lane when handoff correlated the later mutated request label.
  const { holdFile, label, waitSeconds, pollSeconds, signal, claimGraceMs, report } = request;
  // Proof: invalid-acquire-prefix reached the launcher capability after this input fence was removed.
  if (
    prefix.length === 0 ||
    prefix.some((word) => word === '' || word.includes(String.fromCharCode(0)))
  )
    throw new Error('durable holder launch prefix is invalid');
  // Proof: invalid-budget reached the launcher capability with waitSeconds=-1 after this validation was removed.
  if (
    !Number.isSafeInteger(waitSeconds) ||
    waitSeconds < 0 ||
    !Number.isInteger(pollSeconds) ||
    pollSeconds < 1 ||
    pollSeconds > 30
  )
    throw new Error('durable holder queue budget is invalid');
  // Proof: invalid-label reached the launcher capability with a newline label after this validation was removed.
  if (label === '' || /[\r\n\0]/u.test(label)) throw new Error('durable holder label is invalid');
  const grace = claimGraceMs ?? 15000;
  // Proof: invalid-grace reached the launcher capability with negative grace after this validation was removed.
  if (!Number.isSafeInteger(grace) || grace < 0)
    throw new Error('durable holder claim grace is invalid');
  // Proof: acquire-capture observed the mutated environment in the real native helper when this copy became an alias.
  const capturedEnvironment: Record<string, string> = {};
  for (const [key, value] of Object.entries(environment))
    if (value !== undefined) capturedEnvironment[key] = value;
  const isCancelled = (): boolean => signal.aborted;
  if (isCancelled()) return { kind: 'cancelled' };
  mkdirSync(dirname(holdFile), { recursive: true, mode: 0o700 });
  // Proof: preexisting-token observed physical generation reservation beside its unresolved token when this fence was removed.
  if (readHold(holdFile) !== undefined || readDecision(resolveReadyFile(holdFile)) !== undefined)
    throw new Error('durable holder already has an unresolved token or decision');
  const log = reserveLog(holdFile),
    controllerBytes = formatIdentity(log.controller);
  try {
    // Proof: reservation-race observed native helper launch after a separate process published a token inside physical reservation.
    if (readHold(holdFile) !== undefined || readDecision(resolveReadyFile(holdFile)) !== undefined)
      throw new Error('durable holder generation was not empty after reservation');
  } catch (cause) {
    const failures: unknown[] = [cause];
    for (const cleanup of [
      () => {
        log.closeDescriptor();
      },
      () => {
        removeLog(log);
      },
    ])
      try {
        cleanup();
      } catch (failure) {
        failures.push(failure);
      }
    throwFailures(failures);
    throw new Error('durable holder generation refusal was not preserved', { cause });
  }
  let native: NativeExit = { kind: 'pending' },
    numeric: NumericExit = { kind: 'pending' },
    numericAt: number | undefined;
  const readNative = (): NativeExit => native,
    readNumeric = (): NumericExit => numeric;
  let child: Bun.Subprocess<'ignore', number, number>;
  let spawnedBirth: Identity | undefined;
  try {
    child = Bun.spawn(
      [
        ...prefix,
        'ops',
        'lock',
        'hold-internal-v1',
        '--hold-file',
        holdFile,
        '--controller-pid',
        String(log.controller.pid),
        '--controller-boot',
        log.controller.boot,
        '--controller-start',
        log.controller.start,
        '--label',
        label,
        '--wait-seconds',
        String(waitSeconds),
        '--poll-seconds',
        String(pollSeconds),
      ],
      {
        cwd: '/',
        env: capturedEnvironment,
        stdin: 'ignore',
        stdout: log.descriptor,
        stderr: log.descriptor,
        detached: true,
        onExit(_child, code, signal, cause) {
          // Proof: ignoring callback error removed the real retained log in the native callback-error control.
          native = cause === undefined ? readExit(code, signal) : { kind: 'unknown', cause };
        },
      },
    );
  } catch (cause) {
    const failures: unknown[] = [cause];
    for (const cleanup of [
      () => {
        log.closeDescriptor();
      },
      () => {
        removeLog(log);
      },
    ])
      try {
        cleanup();
      } catch (failure) {
        failures.push(failure);
      }
    throwFailures(failures);
    throw new Error('durable holder spawn failure was not preserved', { cause });
  }
  // After spawn, observation failure cannot revoke the child's inherited generation.
  // Still attempt each parent-owned operation, especially descriptor closure, independently.
  const captureFailures: unknown[] = [];
  // Proof: post-spawn-failures lost the later unref and actual descriptor-close attempts when per-operation containment was removed.
  for (const capture of [
    () => {
      void child.exited.then(
        (status) => {
          // Proof: deriving native authority here erased retained metadata with the actual native callback suppressed.
          numeric = { kind: 'observed', status };
          numericAt = readMonotonic();
        },
        (cause: unknown) => {
          numeric = { kind: 'failed', cause };
          numericAt = readMonotonic();
        },
      );
    },
    () => {
      child.unref();
    },
    () => {
      spawnedBirth = readBirth(child.pid);
    },
    () => {
      log.closeDescriptor();
    },
  ])
    try {
      capture();
    } catch (cause) {
      captureFailures.push(cause);
    }
  // Proof: post-spawn-failures reported held instead of preserving all three actual port failures when this throw was removed.
  throwFailures(captureFailures);
  function diagnostics(): Diagnostics {
    try {
      verifyLog(log);
      return { kind: 'readable', text: readFileSync(log.path, 'utf8') };
    } catch (cause) {
      return { kind: 'unavailable', cause };
    }
  }
  let offset = 0,
    pending = '',
    hasReportedLoss = false;
  function drain(): void {
    const observation = diagnostics();
    if (observation.kind === 'unavailable') {
      if (!hasReportedLoss) {
        hasReportedLoss = true;
        report('heavy lock: diagnostics unavailable: ' + reason(observation.cause));
      }
      return;
    }
    if (observation.text.length < offset)
      throw new Error('durable holder diagnostics were truncated');
    pending += observation.text.slice(offset);
    offset = observation.text.length;
    const lines = pending.split(String.fromCharCode(10)),
      last = lines.pop();
    if (last === undefined) throw new Error('durable holder diagnostic split lost its tail');
    pending = last;
    for (const line of lines) report(line);
  }
  const { readStatus } = await import('@shared/heavy-lock');
  let owned: Hold | undefined,
    ready: Decision | undefined,
    cancel: Decision | undefined,
    retired: Decision | undefined,
    finished: Promise<number> | undefined;
  function captureOwner(): Hold | undefined {
    const token = readHold(holdFile);
    if (token === undefined) return undefined;
    if (token.identity.pid !== child.pid)
      throw new Error('durable holder token names another process');
    const birth = readBirth(child.pid);
    if (birth === undefined) return undefined;
    // Proof: removing complete live-birth correlation admitted matching forged Hold/Ready start values under the real canonical PID/label.
    if (
      formatIdentity(birth) !== token.bytes ||
      (spawnedBirth !== undefined && formatIdentity(spawnedBirth) !== token.bytes)
    )
      throw new Error('durable holder birth identity changed');
    if (
      owned !== undefined &&
      (owned.device !== token.device || owned.inode !== token.inode || owned.bytes !== token.bytes)
    )
      throw new Error('durable holder token was replaced');
    owned = token;
    return token;
  }
  function requireDecision(selected: Decision | undefined): void {
    const captured = ready ?? cancel ?? retired;
    // Proof: same-inode Ready-to-Retired mutation previously cleaned the changed decision; ready-decision-mutation failed with exit70.
    if (
      captured !== undefined &&
      (captured.device !== selected?.device ||
        captured.inode !== selected.inode ||
        captured.bytes !== selected.bytes)
    )
      throw new Error('hold token no longer matches its owner');
  }
  function decision(): 'pending' | 'cancelled' | 'ready' | 'retired' {
    const selected = readDecision(resolveReadyFile(holdFile));
    requireDecision(selected);
    if (selected === undefined) return 'pending';
    const identityBytes = formatIdentity(selected.identity);
    if (selected.kind === 'cancelled' && identityBytes === controllerBytes) {
      if (
        cancel !== undefined &&
        (cancel.device !== selected.device || cancel.inode !== selected.inode)
      )
        throw new Error('durable holder cancellation decision was replaced');
      cancel = selected;
      return 'cancelled';
    }
    if (selected.kind === 'retired') {
      const birth = spawnedBirth ?? owned?.identity ?? readBirth(child.pid);
      if (
        birth === undefined ||
        selected.identity.pid !== child.pid ||
        identityBytes !== formatIdentity(birth)
      )
        throw new Error('durable holder retirement names another owner');
      if (
        retired !== undefined &&
        (retired.device !== selected.device ||
          retired.inode !== selected.inode ||
          retired.bytes !== selected.bytes)
      )
        throw new Error('durable holder retirement was replaced');
      retired = selected;
      return 'retired';
    }
    const token = captureOwner();
    if (token === undefined) throw new Error('durable holder readiness has no verified live owner');
    if (selected.kind !== 'ready' || identityBytes !== token.bytes)
      throw new Error('durable holder readiness names another owner');
    if (ready !== undefined && (ready.device !== selected.device || ready.inode !== selected.inode))
      throw new Error('durable holder readiness was replaced');
    ready = selected;
    return 'ready';
  }
  function withdraw(): void {
    try {
      cancel = createDecision(resolveReadyFile(holdFile), 'cancelled', log.controller);
    } catch (cause) {
      if (!hasCode(cause, 'EEXIST')) throw cause;
    }
    // Proof: deleting the child Hold here made cancel-log-unlink-failure lose its helper witness.
    decision();
  }
  /**
   * Only an error-free native end permits generation-derived cleanup. When a child ended before
   * live observation, the protected producer's complete identity token belongs to this unchanged
   * exclusively reserved, initially empty generation. This is not independent observation of the
   * deceased start time and must never authorize live admission or restart adoption.
   */
  function cleanupEnded(): void {
    if (readNative().kind !== 'ended')
      throw new Error('durable holder cleanup lacks native termination');
    try {
      verifyLog(log);
    } catch (cause) {
      if (!hasCode(cause, 'ENOENT')) throw cause;
    }
    const token = readHold(holdFile),
      selected = readDecision(resolveReadyFile(holdFile));
    // Proof: all three overlap controls failed when qualified competing cleanup's absent decision was refused after native end.
    if (selected !== undefined) requireDecision(selected);
    function requireChild(identity: Identity): void {
      const bytes = formatIdentity(identity);
      // Proof: ended-fallback-foreign-birth deleted the real foreign-boot Hold after actual native refusal75 when this complete ended-child correlation family was removed.
      if (identity.pid !== child.pid || identity.boot !== log.controller.boot)
        throw new Error('ended durable holder token names another process or boot');
      if (spawnedBirth !== undefined && formatIdentity(spawnedBirth) !== bytes)
        throw new Error('ended durable holder token disagrees with captured birth');
      if (owned !== undefined && owned.bytes !== bytes)
        throw new Error('ended durable holder decision disagrees with captured owner');
    }
    if (token !== undefined) {
      requireChild(token.identity);
      if (owned !== undefined) verifyHold(owned);
      else owned = token;
    }
    let pinned: Decision | undefined;
    if (selected !== undefined) {
      if (selected.kind === 'cancelled') {
        if (formatIdentity(selected.identity) !== controllerBytes)
          throw new Error('ended durable holder cancellation names another controller');
        if (cancel !== undefined) verifyHold(cancel);
        pinned = cancel ?? selected;
      } else {
        requireChild(selected.identity);
        const captured = selected.kind === 'ready' ? ready : retired;
        if (captured !== undefined) verifyHold(captured);
        pinned = captured ?? selected;
        // Proof: removing this latch made fast-retired return refusal70 instead of controlled75 after actual native end.
        if (pinned.kind === 'retired') retired = pinned;
      }
    }
    // Proof: eager witness deletion failed both log-unlink controls and the crash-after-log control.
    // The log is removed first. A failure keeps every complete helper witness available for restart.
    removeLog(log);
    const captured = owned;
    if (pinned?.kind === 'cancelled') {
      releaseHold(pinned);
      if (token !== undefined && captured !== undefined) releaseHold(captured);
    } else {
      if (token !== undefined && captured !== undefined) releaseHold(captured);
      if (pinned !== undefined) releaseHold(pinned);
    }
  }

  async function finish(): Promise<number> {
    while (readNative().kind === 'pending') {
      const observation = readNumeric();
      if (observation.kind === 'failed')
        throw new Error('durable holder native wait failed; ownership retained', {
          cause: observation.cause,
        });
      if (numericAt !== undefined && readMonotonic() - numericAt >= 1000)
        throw new Error('durable holder native termination callback missing; ownership retained');
      await Bun.sleep(10);
    }
    const terminal = readNative();
    if (terminal.kind !== 'ended')
      throw new Error('durable holder native termination is unconfirmed; ownership retained', {
        cause: terminal.kind === 'unknown' ? terminal.cause : undefined,
      });
    const deadline = readMonotonic() + 1000;
    while (readNumeric().kind === 'pending' && readMonotonic() < deadline) await Bun.sleep(10);
    const observation = readNumeric(),
      failures: unknown[] = [];
    // Proof: false-status reported successful settlement when the numeric/native contradiction check was removed.
    if (observation.kind !== 'observed' || observation.status !== terminal.status)
      failures.push(
        new Error('durable holder exit observations disagree or failed', {
          cause: observation.kind === 'failed' ? observation.cause : undefined,
        }),
      );
    try {
      cleanupEnded();
    } catch (cause) {
      failures.push(cause);
    }
    throwFailures(failures);
    return terminal.status;
  }
  function exited(): Promise<number> {
    finished ??= finish();
    return finished;
  }
  /** Both queued and Ready diagnostic waits preserve terminal cleanup independently of reporting. */
  async function reportPending(): Promise<void> {
    try {
      drain();
    } catch (cause) {
      const failures: unknown[] = [cause];
      if (readNative().kind === 'ended')
        try {
          await exited();
        } catch (cleanupFailure) {
          failures.push(cleanupFailure);
        }
      throwFailures(failures);
      throw new Error('durable holder reporting failure was not preserved', { cause });
    }
  }
  const deadline = readMonotonic() + waitSeconds * 1000 + grace;
  let cancellationDeadline: number | undefined,
    expired = false;
  const readCancel = (): Hold | undefined => cancel;
  const readRetired = (): Decision | undefined => retired;
  for (;;) {
    await reportPending();
    const terminal = readNative();
    if (terminal.kind === 'unknown')
      return {
        kind: 'refused',
        exitCode: 70,
        reason:
          'durable holder native termination is unconfirmed; ownership retained: ' +
          reason(terminal.cause),
      };
    if (terminal.kind === 'ended') {
      const status = await exited();
      if (readCancel() !== undefined && !expired && status === 143) return { kind: 'cancelled' };
      if (status === 0 && readRetired() !== undefined)
        return { kind: 'refused', exitCode: 75, reason: 'durable holder retired before handoff' };
      return {
        kind: 'refused',
        exitCode: expired || status === 0 ? 70 : status,
        reason: expired
          ? 'durable holder exceeded its claim budget'
          : 'durable holder ended before handoff',
      };
    }
    const observation = readNumeric();
    if (observation.kind === 'failed')
      return {
        kind: 'refused',
        exitCode: 70,
        reason:
          'durable holder native wait failed; ownership retained: ' + reason(observation.cause),
      };
    if (numericAt !== undefined && readMonotonic() - numericAt >= 1000)
      return {
        kind: 'refused',
        exitCode: 70,
        reason: 'durable holder native termination callback missing; ownership retained',
      };
    captureOwner();
    const selected = decision();
    if (selected === 'ready') {
      const holder = readStatus(lockPath, BigInt(Math.floor(readWall() / 1000))).holder;
      if (
        holder.kind === 'recorded' &&
        // Proof: removing this correlation handed off Ready while the canonical record named the controller PID.
        holder.pidText === String(child.pid) &&
        holder.label.kind === 'named' &&
        // Proof: removing this correlation handed off Ready while the canonical record named a different lane.
        holder.label.text === label
      ) {
        const diagnosticDeadline = readMonotonic() + 1000;
        while (
          offset === 0 &&
          readMonotonic() < diagnosticDeadline &&
          readNative().kind === 'pending'
        ) {
          if (diagnostics().kind === 'unavailable') break;
          await Bun.sleep(10);
          await reportPending();
        }
        if (readNative().kind !== 'pending' || readNumeric().kind === 'failed') continue;
        captureOwner();
        const token = owned,
          readiness = ready;
        if (token === undefined || readiness === undefined)
          throw new Error('durable holder handoff evidence missing');
        // Proof: post-diagnostic-replacement handed off a real replaced Ready inode when this final snapshot fence was removed.
        if (verifyHold(token) !== 'present' || verifyHold(readiness) !== 'present')
          throw new Error('durable holder handoff evidence disappeared');
        return {
          kind: 'held',
          hold: Object.freeze({
            pid: child.pid,
            identity: token.identity,
            diagnostics,
            release() {
              releaseHold(token);
            },
            get exited() {
              return exited();
            },
          }),
        };
      }
      if (readMonotonic() >= deadline)
        return {
          kind: 'refused',
          exitCode: 70,
          reason: 'durable holder readiness is uncorroborated; ownership retained',
        };
    } else if (selected === 'retired') {
      cancellationDeadline ??= readMonotonic() + 5000;
    } else if (isCancelled() || readMonotonic() >= deadline) {
      if (cancellationDeadline === undefined) {
        expired = !isCancelled();
        cancellationDeadline = readMonotonic() + 5000;
      }
      withdraw();
    }
    // Proof: withdrawal-bound stayed pending at an independent5600ms observation without this5000ms bound; restoration refused while retaining the live native startup generation and Cancel.
    if (cancellationDeadline !== undefined && readMonotonic() >= cancellationDeadline)
      return {
        kind: 'refused',
        exitCode: 70,
        reason: 'durable holder withdrawal unconfirmed; ownership retained',
      };
    await Bun.sleep(10);
  }
}
