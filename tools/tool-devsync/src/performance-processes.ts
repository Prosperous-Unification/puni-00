import { closeSync, readdirSync, readFileSync } from 'node:fs';

import { dlopen, ptr, toArrayBuffer } from 'bun:ffi';

const PR_SET_CHILD_SUBREAPER = 36;
const PR_GET_CHILD_SUBREAPER = 37;
const SYS_PIDFD_OPEN = 434;
const SYS_PIDFD_SEND_SIGNAL = 424;
const SIGTERM = 15;
const SIGKILL = 9;
const WNOHANG = 1;
const GRACE_MS = 1_000;
const CLEANUP_MS = 8_000;

interface ProcessIdentity {
  pid: number;
  ppid: number;
  state: string;
  starttime: string;
}

interface OwnedProcess {
  identity: ProcessIdentity;
  pidfd: number;
  adopted: boolean;
}

export interface PerformanceProcessOwner {
  spawn(
    argv: string[],
    cwd: string,
    env: Record<string, string>,
    output?: { stdout: number; stderr: number },
  ): Bun.Subprocess;
  stop(): Promise<void>;
}

const libc =
  process.platform === 'linux'
    ? dlopen('libc.so.6', {
        prctl: { args: ['i32', 'i64', 'i64', 'i64', 'i64'], returns: 'i32' },
        syscall: { args: ['i64', 'i64', 'i64', 'i64', 'i64'], returns: 'i64' },
        waitpid: { args: ['i32', 'ptr', 'i32'], returns: 'i32' },
        __errno_location: { args: [], returns: 'ptr' },
      })
    : undefined;

function readIdentity(pid: number): ProcessIdentity | undefined {
  let source: string;
  try {
    source = readFileSync(`/proc/${String(pid)}/stat`, 'utf8');
  } catch (error) {
    if (typeof error === 'object' && error !== null && Reflect.get(error, 'code') === 'ENOENT')
      return undefined;
    throw new Error(`Performance cannot read /proc identity for ${String(pid)}`, { cause: error });
  }
  const end = source.lastIndexOf(')');
  if (end < 0) throw new Error(`Performance malformed /proc identity for ${String(pid)}`);
  const fields = source
    .slice(end + 2)
    .trim()
    .split(/\s+/);
  const ppid = Number(fields[1]);
  const state = fields.at(0);
  const starttime = fields.at(19);
  if (
    !Number.isSafeInteger(ppid) ||
    ppid < 0 ||
    state === undefined ||
    starttime === undefined ||
    !/^\d+$/.test(starttime)
  )
    throw new Error(`Performance malformed /proc identity for ${String(pid)}`);
  return { pid, ppid, state, starttime };
}

function snapshotProcesses(): Map<number, ProcessIdentity> {
  const snapshot = new Map<number, ProcessIdentity>();
  for (const entry of readdirSync('/proc')) {
    if (!/^\d+$/.test(entry)) continue;
    const identity = readIdentity(Number(entry));
    if (identity !== undefined) snapshot.set(identity.pid, identity);
  }
  return snapshot;
}

function openPidfd(identity: ProcessIdentity): number {
  if (libc === undefined) throw new Error('Performance process ownership requires Linux');
  const descriptor = libc.symbols.syscall(SYS_PIDFD_OPEN, identity.pid, 0, 0, 0);
  if (descriptor < 0) throw new Error(`Performance pidfd_open failed for ${String(identity.pid)}`);
  const observed = readIdentity(identity.pid);
  if (observed?.starttime !== identity.starttime) {
    closeSync(Number(descriptor));
    throw new Error(`Performance PID identity changed for ${String(identity.pid)}`);
  }
  return Number(descriptor);
}

function signalOwned(
  owned: OwnedProcess,
  signal: number,
  current: Map<number, ProcessIdentity>,
): void {
  if (libc === undefined) throw new Error('Performance process ownership requires Linux');
  const observed = readIdentity(owned.identity.pid);
  if (observed === undefined || observed.state === 'Z') return;
  const parentOwned = current.has(observed.ppid);
  const adopted = observed.ppid === process.pid;
  if (observed.starttime !== owned.identity.starttime || (!parentOwned && !adopted))
    throw new Error(`Performance PID ownership changed for ${String(owned.identity.pid)}`);
  const status = libc.symbols.syscall(SYS_PIDFD_SEND_SIGNAL, owned.pidfd, signal, 0, 0);
  if (status !== 0n && readIdentity(owned.identity.pid) !== undefined)
    throw new Error(`Performance pidfd_send_signal failed for ${String(owned.identity.pid)}`);
}

/** Owns service descendants through Linux subreaper and pidfd identity. */
export function createPerformanceProcessOwner(): PerformanceProcessOwner {
  if (libc === undefined) throw new Error('Performance process ownership requires Linux');
  const subreaper = new Int32Array(1);
  if (
    libc.symbols.prctl(PR_SET_CHILD_SUBREAPER, 1, 0, 0, 0) !== 0 ||
    libc.symbols.prctl(PR_GET_CHILD_SUBREAPER, ptr(subreaper), 0, 0, 0) !== 0 ||
    subreaper[0] !== 1
  ) {
    throw new Error('Performance child-subreaper setup or verification failed');
  }
  const probeIdentity = readIdentity(process.pid);
  if (probeIdentity === undefined) throw new Error('Performance cannot inspect its own PID');
  const probe = openPidfd(probeIdentity);
  try {
    if (libc.symbols.syscall(SYS_PIDFD_SEND_SIGNAL, probe, 0, 0, 0) !== 0n)
      throw new Error('Performance pidfd_send_signal capability unavailable');
  } finally {
    closeSync(probe);
  }
  const baseline = new Set(
    [...snapshotProcesses().values()]
      .filter((identity) => identity.ppid === process.pid)
      .map((identity) => identity.pid),
  );
  const owned = new Map<number, OwnedProcess>();
  const direct = new Map<number, Bun.Subprocess>();
  const reaped = new Set<number>();
  let stopping = false;

  const discover = (): Map<number, ProcessIdentity> => {
    const snapshot = snapshotProcesses();
    const selected = new Map<number, ProcessIdentity>();
    for (const identity of snapshot.values()) {
      if (
        direct.has(identity.pid) ||
        owned.has(identity.pid) ||
        (identity.ppid === process.pid && !baseline.has(identity.pid))
      )
        selected.set(identity.pid, identity);
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (const identity of snapshot.values()) {
        if (!selected.has(identity.pid) && selected.has(identity.ppid)) {
          selected.set(identity.pid, identity);
          changed = true;
        }
      }
    }
    for (const identity of selected.values()) {
      const previous = owned.get(identity.pid);
      if (previous !== undefined) {
        if (previous.identity.starttime !== identity.starttime)
          throw new Error(`Performance PID identity changed for ${String(identity.pid)}`);
        if (identity.ppid === process.pid && !direct.has(identity.pid)) previous.adopted = true;
        continue;
      }
      owned.set(identity.pid, {
        identity,
        pidfd: openPidfd(identity),
        adopted: identity.ppid === process.pid && !direct.has(identity.pid),
      });
    }
    return selected;
  };

  return {
    spawn(argv, cwd, env, output) {
      if (stopping) throw new Error('Performance cannot launch after cleanup begins');
      const child = Bun.spawn(argv, {
        cwd,
        env,
        stdout: output?.stdout ?? 'ignore',
        stderr: output?.stderr ?? 'ignore',
      });
      direct.set(child.pid, child);
      discover();
      return child;
    },
    async stop() {
      stopping = true;
      const started = Date.now();
      try {
        while (Date.now() - started < CLEANUP_MS) {
          const selected = discover();
          for (const identity of selected.values()) {
            const entry = owned.get(identity.pid);
            if (entry === undefined) throw new Error('Performance discovered process lacks pidfd');
            if (identity.state === 'Z' && entry.adopted && !reaped.has(identity.pid)) {
              const status = new Int32Array(1);
              const waited = libc.symbols.waitpid(identity.pid, ptr(status), WNOHANG);
              if (waited !== identity.pid) {
                const errnoPointer = libc.symbols.__errno_location();
                if (errnoPointer === null) throw new Error('Performance waitpid errno unavailable');
                const errno = new Int32Array(toArrayBuffer(errnoPointer, 0, 4))[0];
                const observed = readIdentity(identity.pid);
                throw new Error(
                  `Performance waitpid failed for adopted ${String(identity.pid)}: waited=${String(waited)} errno=${String(errno)} observed=${observed?.state ?? 'absent'}`,
                );
              }
              reaped.add(identity.pid);
              continue;
            }
            // Proof: replacing SIGKILL escalation with SIGTERM made the adopted
            // TERM-resistant sleeper negative fail after 8 s with nonconvergence.
            signalOwned(entry, Date.now() - started < GRACE_MS ? SIGTERM : SIGKILL, selected);
          }
          const stillOwned = [...selected.values()].filter(
            (identity) =>
              identity.state !== 'Z' ||
              (owned.get(identity.pid)?.adopted && !reaped.has(identity.pid)),
          );
          if (stillOwned.length === 0) {
            await Promise.all([...direct.values()].map((child) => child.exited));
            if (discover().size === 0) return;
          }
          await Bun.sleep(20);
        }
        throw new Error('Performance owned process cleanup did not converge');
      } finally {
        for (const entry of owned.values()) closeSync(entry.pidfd);
      }
    },
  };
}
