import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { JobTypeDescriptor } from '../resources/host-pool';
import { causeText, OpsRefusal } from './refusal';

/** One reading of a scope's cgroup v2 counters, in the kernel's units. */
export interface ScopeCounters {
  /** `memory.peak`, bytes: the scope's high-water mark since it was created. */
  memoryPeak: number;
  memoryCurrent: number;
  /** `cpu.stat` `usage_usec`, `user_usec`, `system_usec`. */
  cpuUsageUsec: number;
  cpuUserUsec: number;
  cpuSystemUsec: number;
  pidsCurrent: number;
  /** `memory.events` `high`: how often the scope was throttled at `MemoryHigh` (J9). */
  memoryHighEvents: number;
}

/**
 * The port through which `ops job run` reads a scope (`dash-host-jobs` J7): the cgroup of a
 * process, the scope's counters and its member processes. {@link linuxScopeTelemetry} reads the
 * unified hierarchy; tests wrap it to break a real file underneath it.
 */
export interface ScopeTelemetry {
  /** The cgroup v2 path `/proc/<pid>/cgroup` names, or null once the process is gone. */
  cgroupOf(pid: number): string | null;
  /** @throws Error naming the counter file it could not read or parse. */
  read(cgroup: string): ScopeCounters;
  /** The scope's member pids; empty once the scope is gone or has emptied. */
  members(cgroup: string): number[];
}

function counterFile(directory: string, name: string): string {
  try {
    return readFileSync(join(directory, name), 'utf8');
  } catch (cause) {
    throw new Error(`scope counter ${join(directory, name)} unreadable: ${causeText(cause)}`, {
      cause,
    });
  }
}

function wholeNumber(path: string, text: string): number {
  const value = Number(text.trim());
  if (!/^\d+$/.test(text.trim()) || !Number.isSafeInteger(value))
    throw new Error(`scope counter ${path} malformed: ${text.trim().slice(0, 40)}`);
  return value;
}

function keyed(directory: string, name: string, key: string): number {
  const path = join(directory, name);
  const line = counterFile(directory, name)
    .split('\n')
    .find((candidate) => candidate.startsWith(`${key} `));
  if (line === undefined) throw new Error(`scope counter ${path} has no ${key}`);
  return wholeNumber(path, line.slice(key.length + 1));
}

/** The unified cgroup hierarchy under `root` (`/sys/fs/cgroup` in production). */
export function linuxScopeTelemetry(root = '/sys/fs/cgroup'): ScopeTelemetry {
  const directoryOf = (cgroup: string): string => join(root, cgroup);
  return {
    cgroupOf: (pid) => {
      let text: string;
      try {
        text = readFileSync(`/proc/${String(pid)}/cgroup`, 'utf8');
      } catch (cause) {
        if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return null;
        throw new Error(`cgroup of pid ${String(pid)} unreadable: ${causeText(cause)}`, { cause });
      }
      const unified = text.split('\n').find((line) => line.startsWith('0::'));
      if (unified === undefined)
        throw new Error(`pid ${String(pid)} has no cgroup v2 membership; host jobs need cgroup v2`);
      return unified.slice(3);
    },
    read: (cgroup) => {
      const directory = directoryOf(cgroup);
      return {
        memoryPeak: wholeNumber(
          join(directory, 'memory.peak'),
          counterFile(directory, 'memory.peak'),
        ),
        memoryCurrent: wholeNumber(
          join(directory, 'memory.current'),
          counterFile(directory, 'memory.current'),
        ),
        cpuUsageUsec: keyed(directory, 'cpu.stat', 'usage_usec'),
        cpuUserUsec: keyed(directory, 'cpu.stat', 'user_usec'),
        cpuSystemUsec: keyed(directory, 'cpu.stat', 'system_usec'),
        pidsCurrent: wholeNumber(
          join(directory, 'pids.current'),
          counterFile(directory, 'pids.current'),
        ),
        memoryHighEvents: keyed(directory, 'memory.events', 'high'),
      };
    },
    members: (cgroup) => {
      let text: string;
      try {
        text = readFileSync(join(directoryOf(cgroup), 'cgroup.procs'), 'utf8');
      } catch (cause) {
        if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return [];
        throw new Error(`scope ${cgroup} members unreadable: ${causeText(cause)}`, { cause });
      }
      return text
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map(Number);
    },
  };
}

/** The transient unit a host job runs in: one per admitted use, never reused. */
export function scopeUnitOf(jobId: string): string {
  return `dash-job-${jobId}`;
}

/**
 * `systemd-run`'s arguments for a host job's scope (J7): a user scope named after the use,
 * collected even when it fails, `MemoryHigh` at the envelope and `MemoryMax` too for `cap`.
 * `--expand-environment=no` keeps `$` in the payload's words literal: systemd 254 warns that it
 * will otherwise start expanding them.
 */
export function scopeArguments(unit: string, descriptor: JobTypeDescriptor): string[] {
  const memory = `${String(descriptor.envelope.memoryGib)}G`;
  return [
    '--user',
    '--scope',
    '--quiet',
    '--collect',
    '--expand-environment=no',
    '--unit',
    unit,
    '-p',
    `MemoryHigh=${memory}`,
    ...(descriptor.enforcement === 'cap' ? ['-p', `MemoryMax=${memory}`] : []),
  ];
}

/** The fix J8 names whenever the user manager cannot create a scope. */
export function lingerFix(user: string): string {
  return `enable the user manager with \`loginctl enable-linger ${user}\``;
}

/**
 * Whether this host can run a measured job, before anything is reserved (J8): `systemd-run` on
 * `PATH` and a user manager that creates a scope with the job's memory properties. The probe
 * runs `true` in its own throwaway scope.
 * @throws OpsRefusal 70 naming the missing tool, or `systemd-run`'s first diagnostic and the
 * linger fix.
 */
export function checkScopeAvailable(
  environment: Readonly<Record<string, string | undefined>>,
  descriptor: JobTypeDescriptor,
  probeUnit: string,
  user: string,
): string {
  const systemdRun = Bun.which('systemd-run', { PATH: environment['PATH'] ?? '' });
  // Proof: without it `refuses 70 before admission when systemd-run is absent`
  // (job-run.test.ts) throw `Executable not found in $PATH: "null"` (2026-11-01, Slice 3).
  if (systemdRun === null)
    throw new OpsRefusal(
      70,
      `ops job run: systemd-run is not on PATH; host jobs run measured in a user scope (dash-host-jobs J8); install systemd and ${lingerFix(user)}`,
    );
  const probe = Bun.spawnSync(
    [systemdRun, ...scopeArguments(probeUnit, descriptor), '--', 'true'],
    {
      env: { ...environment },
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 30_000,
      killSignal: 'SIGKILL',
    },
  );
  if (probe.exitCode !== 0) {
    const diagnostic =
      probe.stderr
        .toString('utf8')
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line !== '') ?? `exit ${String(probe.exitCode)}`;
    // Proof: skipping the probe made `refuses 70 when the user manager is unavailable, nothing
    // reserved` (job-run.test.ts) admit the job, then refuse "launch identity … unrecorded".
    throw new OpsRefusal(
      70,
      `ops job run: systemd-run --user cannot create a scope (${diagnostic}); ${lingerFix(user)}`,
    );
  }
  return systemdRun;
}

/**
 * Bytes allocated under `directory` (`du`'s figure: allocated blocks, each hard-linked inode
 * once), walking without following symbolic links. A file that vanishes mid-walk counts as gone.
 * @throws Error when an entry exists but cannot be read.
 */
export function directoryBytes(directory: string): number {
  const seen = new Set<string>();
  let total = 0;
  const visit = (path: string): void => {
    let identity;
    try {
      identity = lstatSync(path);
    } catch (cause) {
      if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return;
      throw cause;
    }
    const key = `${String(identity.dev)}:${String(identity.ino)}`;
    if (seen.has(key)) return;
    seen.add(key);
    total += identity.blocks * 512;
    if (!identity.isDirectory()) return;
    let entries: string[];
    try {
      entries = readdirSync(path);
    } catch (cause) {
      if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return;
      throw cause;
    }
    for (const entry of entries) visit(join(path, entry));
  };
  visit(directory);
  return total;
}
