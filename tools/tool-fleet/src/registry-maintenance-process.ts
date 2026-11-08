import { fstatSync } from 'node:fs';
import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { dlopen } from 'bun:ffi';

/** Verify an already-held inherited open-file-description; never acquire a fresh lock or unlock the parent's description. */
export async function assertRegistryMaintenanceLock(
  directory: string,
  descriptor: number,
  uid: number | undefined,
): Promise<void> {
  const canonical = await lstat(join(directory, 'authority.lock'));
  const inherited = fstatSync(descriptor);
  const information = await readFile(`/proc/self/fdinfo/${String(descriptor)}`, 'utf8');
  // Proof: independently opening the exact canonical file fails; native session FD3 retains FLOCK ADVISORY WRITE.
  if (
    uid === undefined ||
    !canonical.isFile() ||
    canonical.nlink !== 1 ||
    canonical.uid !== uid ||
    (canonical.mode & 0o777) !== 0o600 ||
    inherited.dev !== canonical.dev ||
    inherited.ino !== canonical.ino ||
    !/^lock:\s+\d+:\s+FLOCK\s+ADVISORY\s+WRITE\s+\d+\s+[^\s]+\s+0\s+EOF$/m.test(information)
  )
    throw new Error('Missing inherited authority lock');
}

/** The fixed root helper becomes subreaper before creating any owned child; its signal cleanup can then reap orphaned grandchildren. */
export function installMaintenanceReaper(): void {
  if (process.platform !== 'linux') throw new Error('Maintenance helper requires Linux');
  const native = dlopen('libc.so.6', {
    prctl: { args: ['i32', 'i32', 'i32', 'i32', 'i32'], returns: 'i32' },
  });
  try {
    if (native.symbols.prctl(36, 1, 0, 0, 0) !== 0)
      throw new Error('Cannot establish maintenance child ownership');
  } finally {
    native.close();
  }
}

/**
 * Reap an existing native child created by a fixed-action implementation with detached:true.
 * This accepts an in-process subprocess capability, never argv, environment, PID JSON or a new
 * executable. Cancellation is handled by the privileged helper that owns the descendants.
 */
export function awaitMaintenanceChild(
  child: Pick<Bun.Subprocess, 'pid' | 'exitCode' | 'exited'>,
  signal: AbortSignal,
): Promise<void> {
  return awaitOwnedMaintenanceChild(child, signal, false);
}

async function awaitOwnedMaintenanceChild(
  child: Pick<Bun.Subprocess, 'pid' | 'exitCode' | 'exited'>,
  signal: AbortSignal,
  interruptBackup: boolean,
): Promise<void> {
  const native = dlopen('libc.so.6', {
    getpgid: { args: ['i32'], returns: 'i32' },
    waitpid: { args: ['i32', 'ptr', 'i32'], returns: 'i32' },
  });
  const exists = () => {
    try {
      process.kill(-child.pid, 0);
      return true;
    } catch (cause) {
      if (cause instanceof Error && 'code' in cause && cause.code === 'ESRCH') return false;
      throw cause;
    }
  };
  const send = (selected: 'SIGINT' | 'SIGKILL') => {
    try {
      process.kill(-child.pid, selected);
    } catch (cause) {
      if (!(cause instanceof Error && 'code' in cause && cause.code === 'ESRCH')) throw cause;
    }
  };
  const stop = () => {
    send('SIGKILL');
  };
  let escalation: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    if (!interruptBackup) {
      stop();
      return;
    }
    // Proof: registry-backup-process graceful test received only ready under the previous immediate SIGKILL policy.
    send('SIGINT');
    // The same open description remains inherited until terminal group reaping, including this fixed grace.
    // Proof: removing this escalation leaves the forced native test alive until its8s harness kill, exceeding the7s assertion.
    escalation = setTimeout(stop, 5000);
  };
  try {
    if (child.exitCode === null && native.symbols.getpgid(child.pid) !== child.pid)
      throw new Error('Maintenance child is not an independently owned process group');
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
    const code = await child.exited;
    // A native parent can exit before grandchildren. Kill and reap the remaining owned group before acknowledging anything.
    if (exists()) stop();
    const deadline = Date.now() + 5000;
    while (exists()) {
      while (native.symbols.waitpid(-child.pid, null, 1) > 0) {
        /* Reap only this owned process group. */
      }
      if (!exists()) break;
      if (Date.now() >= deadline) throw new Error('Maintenance descendant cleanup is unconfirmed');
      await Bun.sleep(10);
    }
    signal.throwIfAborted();
    if (code !== 0) throw new Error(`Fixed maintenance child failed (exit ${String(code)})`);
  } finally {
    signal.removeEventListener('abort', cancel);
    clearTimeout(escalation);
    native.close();
  }
}

/**
 * Restic alone receives SIGINT and five seconds to remove its backend lock, then SIGKILL if
 * still alive. Reap the owned group before returning; an interrupted exit130 remains failure.
 * A hard kill can leave a stale repository lock: no successful cleanup or automatic unlock is
 * inferred. This fixed policy receives an existing child capability, never caller argv or PID.
 */
export function awaitRegistryBackupChild(
  child: Pick<Bun.Subprocess, 'pid' | 'exitCode' | 'exited'>,
  signal: AbortSignal,
): Promise<void> {
  return awaitOwnedMaintenanceChild(child, signal, true);
}

/**
 * Await one fixed restic child inside the UTS worker's EXISTING owned process group. The root
 * guardian supervises that whole group; this member never detaches or exits its worker early.
 * SIGINT permits restic lock cleanup for five seconds; forced fallback remains a failed action.
 * Caller keeps its signal handler installed until this promise has reaped the direct child.
 */
export async function awaitRegistryBackupMember(
  child: Pick<Bun.Subprocess, 'pid' | 'exitCode' | 'exited' | 'kill'>,
  signal: AbortSignal,
): Promise<void> {
  const native = dlopen('libc.so.6', { getpgid: { args: ['i32'], returns: 'i32' } });
  let escalation: ReturnType<typeof setTimeout> | undefined;
  const interrupt = () => {
    if (child.exitCode !== null) return;
    child.kill('SIGINT');
    escalation = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
    }, 5000);
  };
  try {
    // Proof: the detached-member negative resolved before this existing-group admission.
    if (
      native.symbols.getpgid(process.pid) !== process.pid ||
      (child.exitCode === null && native.symbols.getpgid(child.pid) !== process.pid)
    ) {
      const failure = new Error('Backup member escaped the fixed worker process group');
      if (child.exitCode === null && native.symbols.getpgid(child.pid) !== child.pid) {
        child.kill('SIGKILL');
        await child.exited;
        throw new AggregateError([failure], 'Backup member group ownership is unconfirmed', {
          cause: failure,
        });
      }
      // Proof: the detached-member negative observed exitCode null before this exact child-group cleanup.
      const stopped = new AbortController();
      stopped.abort(failure);
      try {
        await awaitOwnedMaintenanceChild(child, stopped.signal, false);
      } catch (cause) {
        if (cause !== failure) throw cause;
      }
      throw failure;
    }
    signal.addEventListener('abort', interrupt, { once: true });
    if (signal.aborted) interrupt();
    // Proof: the native worker saw only member-ready (not member-cleaned) under the no-wait RED stub.
    const code = await child.exited;
    signal.throwIfAborted();
    if (code !== 0) throw new Error('Fixed backup member failed');
  } finally {
    signal.removeEventListener('abort', interrupt);
    clearTimeout(escalation);
    native.close();
  }
}
