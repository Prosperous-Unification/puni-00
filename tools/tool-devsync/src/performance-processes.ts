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
    output?: { stdout: number | 'pipe'; stderr: number | 'pipe' },
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

function snapshotProcesses(onFault?: (cause: unknown) => void): Map<number, ProcessIdentity> {
  const snapshot = new Map<number, ProcessIdentity>();
  for (const entry of readdirSync('/proc')) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      const identity = readIdentity(Number(entry));
      if (identity !== undefined) snapshot.set(identity.pid, identity);
    } catch (cause) {
      if (onFault === undefined) throw cause;
      onFault(cause);
    }
  }
  return snapshot;
}

function openPidfd(identity: ProcessIdentity): number | undefined {
  if (libc === undefined) throw new Error('Performance process ownership requires Linux');
  const descriptor = libc.symbols.syscall(SYS_PIDFD_OPEN, identity.pid, 0, 0, 0);
  // Proof: disabling this failed-open branch made the injected pidfd_open
  // refusal reach closeSync(-1), so the named prerequisite test failed.
  if (descriptor < 0) {
    // Proof: the pidfd-vanish preload injects a failed open and an ENOENT
    // identity recheck; the production owner formerly threw before rescan.
    const observed = readIdentity(identity.pid);
    if (observed === undefined) return undefined;
    if (observed.starttime !== identity.starttime)
      throw new Error(`Performance PID identity changed for ${String(identity.pid)}`);
    throw new Error(`Performance pidfd_open failed for ${String(identity.pid)}`);
  }
  let retained = false;
  try {
    const observed = readIdentity(identity.pid);
    if (observed === undefined) return undefined;
    if (observed.starttime !== identity.starttime)
      throw new Error(`Performance PID identity changed for ${String(identity.pid)}`);
    retained = true;
    return Number(descriptor);
  } finally {
    // Proof: injecting EACCES at the post-open /proc recheck left one pidfd
    // open after owner.stop; the focused test now observes the baseline count.
    if (!retained) closeSync(Number(descriptor));
  }
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
  // Proof: a one-read start-time mutation at the signal boundary was accepted
  // when this identity term was disabled; its named owner test then succeeded unexpectedly.
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
  // Proof: when this prerequisite guard was disabled, injected PR_SET_CHILD_SUBREAPER
  // refusal let the isolated owner test construct an owner unexpectedly.
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
  if (probe === undefined) throw new Error('Performance cannot open its own pidfd');
  try {
    // Proof: disabling this signal-zero probe let the injected missing
    // pidfd_send_signal capability construct an owner unexpectedly.
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
  const directStarttimes = new Map<number, string | undefined>();
  const settledDirect = new Set<number>();
  const directExitFailures = new Map<number, unknown>();
  const reaped = new Set<number>();
  const tainted = new Map<number, string>();
  let stopping = false;
  let inventoryComplete = true;

  const discover = (onFault?: (cause: unknown) => void): Map<number, ProcessIdentity> => {
    inventoryComplete = true;
    const recordFault = (cause: unknown): void => {
      inventoryComplete = false;
      onFault?.(cause);
    };
    let snapshot: Map<number, ProcessIdentity>;
    try {
      snapshot = snapshotProcesses(onFault === undefined ? undefined : recordFault);
    } catch (cause) {
      if (onFault === undefined) throw cause;
      recordFault(cause);
      // Proof: an injected fourth /proc enumeration failed on stop and left
      // two registered children alive. Preserve established identities for
      // TERM/KILL while a later complete inventory resolves unknown adoptees.
      snapshot = new Map<number, ProcessIdentity>();
      for (const pid of new Set([...owned.keys(), ...direct.keys()])) {
        try {
          const identity = readIdentity(pid);
          if (identity !== undefined) snapshot.set(pid, identity);
        } catch (identityFault) {
          recordFault(identityFault);
        }
      }
    }
    const rejected = new Set<number>();
    for (const identity of snapshot.values()) {
      const prior = owned.get(identity.pid);
      if (
        (direct.has(identity.pid) && directStarttimes.get(identity.pid) !== identity.starttime) ||
        (prior !== undefined && prior.identity.starttime !== identity.starttime)
      ) {
        // Proof: direct-reuse refused a vanished launch reused at the same PID;
        // owned-root-reuse originally signaled a foreign grandchild below a
        // changed owned PID. Reject roots before expanding their descendants.
        const fault = new Error(`Performance PID identity changed for ${String(identity.pid)}`);
        if (onFault === undefined) throw fault;
        onFault(fault);
        rejected.add(identity.pid);
        tainted.set(identity.pid, identity.starttime);
      }
    }
    const hasRejectedAncestor = (identity: ProcessIdentity): boolean => {
      const seen = new Set<number>();
      let ancestor: ProcessIdentity | undefined = identity;
      while (ancestor !== undefined) {
        // Proof: the owned-root-reuse negative first killed C when expansion
        // re-added rejected A; a later scan adopted C after its wrapper exited.
        // Exact-identity taint keeps A/B/C out while a valid sibling drains.
        if (rejected.has(ancestor.pid) || tainted.get(ancestor.pid) === ancestor.starttime) {
          tainted.set(identity.pid, identity.starttime);
          return true;
        }
        // Proof: the ancestry-cycle preload rewrote an adopted child's /proc
        // parent to itself. Without this refusal, its isolated supervisor
        // timed out after eight seconds; the restored test refuses promptly.
        if (seen.has(ancestor.pid)) {
          const fault = new Error(`Performance PID ancestry cycle for ${String(identity.pid)}`);
          if (onFault === undefined) throw fault;
          onFault(fault);
          return true;
        }
        seen.add(ancestor.pid);
        ancestor = snapshot.get(ancestor.ppid);
      }
      return false;
    };
    const selected = new Map<number, ProcessIdentity>();
    for (const identity of snapshot.values()) {
      if (hasRejectedAncestor(identity)) continue;
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
        if (
          !selected.has(identity.pid) &&
          selected.has(identity.ppid) &&
          !hasRejectedAncestor(identity)
        ) {
          selected.set(identity.pid, identity);
          changed = true;
        }
      }
    }
    for (const identity of selected.values()) {
      const previous = owned.get(identity.pid);
      if (previous !== undefined) {
        if (identity.ppid === process.pid && !direct.has(identity.pid)) previous.adopted = true;
        continue;
      }
      try {
        const pidfd = openPidfd(identity);
        if (pidfd === undefined) {
          selected.delete(identity.pid);
          continue;
        }
        owned.set(identity.pid, {
          identity,
          pidfd,
          adopted: identity.ppid === process.pid && !direct.has(identity.pid),
        });
      } catch (cause) {
        if (onFault === undefined) throw cause;
        onFault(cause);
        selected.delete(identity.pid);
      }
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
      directStarttimes.set(child.pid, readIdentity(child.pid)?.starttime);
      // Bun owns the direct-child wait; cleanup polls this settlement inside
      // its deadline while continuing TERM/KILL escalation for descendants.
      void child.exited.then(
        () => settledDirect.add(child.pid),
        (cause: unknown) => directExitFailures.set(child.pid, cause),
      );
      discover();
      return child;
    },
    async stop() {
      stopping = true;
      const started = Date.now();
      const failures = new Map<string, unknown>();
      const remember = (cause: unknown): void => {
        failures.set(String(cause), cause);
      };
      try {
        while (Date.now() - started < CLEANUP_MS) {
          const selected = discover(remember);
          for (const identity of selected.values()) {
            try {
              const entry = owned.get(identity.pid);
              if (entry === undefined)
                throw new Error('Performance discovered process lacks pidfd');
              if (identity.state === 'Z' && entry.adopted && !reaped.has(identity.pid)) {
                const status = new Int32Array(1);
                const waited = libc.symbols.waitpid(identity.pid, ptr(status), WNOHANG);
                // Proof: the injected WNOHANG zero fault made cleanup reject a
                // zombie with waited=0/observed=Z; the same transient appeared
                // during the combined 120-second execution timeout. Rescan
                // inside the existing eight-second bound until waitpid can reap.
                if (waited === 0) continue;
                if (waited !== identity.pid) {
                  const errnoPointer = libc.symbols.__errno_location();
                  if (errnoPointer === null)
                    throw new Error('Performance waitpid errno unavailable');
                  const errno = new Int32Array(toArrayBuffer(errnoPointer, 0, 4))[0];
                  const observed = readIdentity(identity.pid);
                  throw new Error(
                    `Performance waitpid failed for adopted ${String(identity.pid)}: waited=${String(waited)} errno=${String(errno)} observed=${observed?.state ?? 'absent'}`,
                  );
                }
                reaped.add(identity.pid);
                continue;
              }
              // Proof: the first-signal preload made the first owned PID's
              // pidfd_send_signal fail; cleanup now still terminates its sibling.
              signalOwned(entry, Date.now() - started < GRACE_MS ? SIGTERM : SIGKILL, selected);
            } catch (cause) {
              remember(cause);
            }
          }
          const stillOwned = [...selected.values()].filter(
            (identity) =>
              identity.state !== 'Z' ||
              (owned.get(identity.pid)?.adopted && !reaped.has(identity.pid)),
          );
          if (stillOwned.length === 0) {
            // Proof: overriding a Bun child's exited promise with an unresolved
            // promise made cleanup hang past its deadline before this bounded poll.
            for (const cause of directExitFailures.values()) remember(cause);
            if (
              [...direct.keys()].every((pid) => settledDirect.has(pid)) &&
              discover(remember).size === 0 &&
              inventoryComplete
            ) {
              if (failures.size > 0)
                throw new AggregateError(
                  [...failures.values()],
                  `Performance process cleanup failed: ${[...failures.keys()].join('; ')}`,
                );
              return;
            }
          }
          await Bun.sleep(20);
        }
        throw new AggregateError(
          [...failures.values(), new Error('Performance owned process cleanup did not converge')],
          `Performance owned process cleanup did not converge${failures.size > 0 ? `: ${[...failures.keys()].join('; ')}` : ''}`,
        );
      } finally {
        for (const entry of owned.values()) closeSync(entry.pidfd);
      }
    },
  };
}
