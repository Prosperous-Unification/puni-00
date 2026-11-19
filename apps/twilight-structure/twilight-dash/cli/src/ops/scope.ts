import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

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
  /** The cgroup paths directly below `cgroup`; empty once it is gone. */
  children(cgroup: string): string[];
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
    children: (cgroup) => {
      try {
        return readdirSync(directoryOf(cgroup), { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => join(cgroup, entry.name));
      } catch (cause) {
        if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return [];
        throw new Error(`cgroups below ${cgroup} unreadable: ${causeText(cause)}`, { cause });
      }
    },
  };
}

/** The transient unit a host job runs in: one per admitted use, never reused. */
export function scopeUnitOf(jobId: string): string {
  return `dash-job-${jobId}`;
}

/** Refuse any cgroup but host job `jobId`'s own scope: a parent slice, another job's scope. */
function checkJobScope(cgroup: string, jobId: string): void {
  // Proof: without this refusal `a parent slice or another job's scope is never enumerated`
  // (scope.test.ts) listed the slice's pid 7 (2026-11-19, task 6.24).
  if (!cgroup.endsWith(`/${scopeUnitOf(jobId)}.scope`))
    throw new Error(`${cgroup} is not the scope of host job ${jobId}`);
}

/**
 * The pids directly in host job `jobId`'s own scope (task 6.24), the ones its run record
 * describes: `cgroup.procs` of that cgroup alone, which the kernel lists without the processes of
 * any cgroup nested below it; empty once the scope emptied or was collected. A `j19-holder-*`
 * scope the gate's tests start is a sibling under the slice, never below the job's scope
 * (`systemd-run --scope` puts each transient unit under a slice); a cgroup a payload creates
 * below its own scope is counted by {@link scopeSubtreeMembers} instead, never described.
 * @throws Error when `cgroup` is not `…/dash-job-<jobId>.scope`, or when its members are
 * unreadable.
 */
export function leftoverMembers(
  telemetry: ScopeTelemetry,
  cgroup: string,
  jobId: string,
): number[] {
  checkJobScope(cgroup, jobId);
  return telemetry.members(cgroup);
}

/** How many cgroups {@link scopeSubtreeMembers} reads before it refuses. */
export const SCOPE_SUBTREE_LIMIT = 64;

/**
 * Every pid in host job `jobId`'s scope and in any cgroup nested below it: what
 * `systemctl --user kill` reaches, since it signals the unit's whole subtree, so what the
 * leftover ending must see gone before it calls the scope empty (task 6.24, review of #954 S3-2).
 * @throws Error when `cgroup` is not the job's own scope, when any cgroup of the subtree is
 * unreadable, or past {@link SCOPE_SUBTREE_LIMIT} cgroups.
 */
export function scopeSubtreeMembers(
  telemetry: ScopeTelemetry,
  cgroup: string,
  jobId: string,
): number[] {
  checkJobScope(cgroup, jobId);
  const pending = [cgroup];
  const pids: number[] = [];
  for (let read = 0; pending.length > 0; read++) {
    if (read === SCOPE_SUBTREE_LIMIT)
      throw new Error(`${cgroup} has more than ${String(SCOPE_SUBTREE_LIMIT)} cgroups`);
    const next = pending.pop();
    if (next === undefined) break;
    pids.push(...telemetry.members(next));
    pending.push(...telemetry.children(next));
  }
  return pids;
}

/** How much of a leftover's command line a run record keeps. */
export const LEFTOVER_CMDLINE_LIMIT = 120;

/** One process left in a job's scope after its session ended, as the run record keeps it. */
export interface LeftoverProcess {
  pid: number;
  /** `/proc/<pid>/comm`. */
  comm: string;
  /** `/proc/<pid>/cmdline`, arguments joined by spaces, at most {@link LEFTOVER_CMDLINE_LIMIT}. */
  cmdline: string;
}

/**
 * `pid`'s comm and command line, or null once it is gone: a leftover that exits while it is
 * described has ended on its own and is only counted. A file unreadable for another reason reads
 * `?` and an empty command line: evidence text only, the pid is the record and changes no decision.
 */
export function describeLeftover(pid: number, proc = '/proc'): LeftoverProcess | null {
  const read = (name: string): string | null => {
    try {
      return readFileSync(join(proc, String(pid), name), 'utf8');
    } catch (cause) {
      if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return null;
      // Evidence text only, as the runtime's `commOf` reads it.
      return '?';
    }
  };
  const comm = read('comm');
  const cmdline = read('cmdline');
  if (comm === null || cmdline === null) return null;
  return {
    pid,
    comm: comm.trim(),
    cmdline: (cmdline === '?' ? '' : cmdline)
      .split('\0')
      .filter((word) => word !== '')
      .join(' ')
      .slice(0, LEFTOVER_CMDLINE_LIMIT),
  };
}

/**
 * `systemd-run`'s arguments for a host job's scope (J7): a user scope named after the use,
 * collected even when it fails, `MemoryHigh` at the envelope and `MemoryMax` too for `cap`;
 * a calibration run sets neither, so its peak is the job's own (J9).
 * `--expand-environment=no` keeps `$` in the payload's words literal: systemd 254 warns that it
 * will otherwise start expanding them.
 */
export function scopeArguments(
  unit: string,
  descriptor: JobTypeDescriptor,
  isCalibration: boolean,
): string[] {
  const memory = `${String(descriptor.envelope.memoryGib)}G`;
  // Proof: dropping the calibration branch failed `a calibration scope sets no memory bound …`
  // (calibrate.test.ts, `MemoryHigh=6G`, `MemoryMax=6G`) and, on a real user manager,
  // `a calibration runs with no MemoryHigh` (2026-11-02, Slice 4).
  const bounds = isCalibration
    ? []
    : [
        '-p',
        `MemoryHigh=${memory}`,
        ...(descriptor.enforcement === 'cap' ? ['-p', `MemoryMax=${memory}`] : []),
      ];
  return [
    '--user',
    '--scope',
    '--quiet',
    '--collect',
    '--expand-environment=no',
    '--unit',
    unit,
    ...bounds,
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
  isCalibration: boolean,
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
    [systemdRun, ...scopeArguments(probeUnit, descriptor, isCalibration), '--', 'true'],
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

/** The most unreadable paths one tmp sample lists; the rest are only counted. */
export const UNREADABLE_PATH_LIMIT = 32;

/** What one walk of a directory read: see {@link directoryUsage}. */
export interface DirectoryUsage {
  /** Bytes allocated under the directory that the walk could read: a lower bound when `unreadable` is not empty. */
  bytes: number;
  /** Paths relative to the directory whose entries could not be read, sorted, at most {@link UNREADABLE_PATH_LIMIT}. */
  unreadable: string[];
  /** How many more unreadable paths there were than `unreadable` lists. */
  unreadableOmitted: number;
}

function codeOf(cause: unknown): unknown {
  return cause instanceof Error && 'code' in cause ? cause.code : undefined;
}

/** EACCES or EPERM: a subtree the sampler's user may not read, not a broken reading. */
function isDenied(cause: unknown): boolean {
  const code = codeOf(cause);
  return code === 'EACCES' || code === 'EPERM';
}

/**
 * Bytes allocated under `directory` (`du`'s figure: allocated blocks, each hard-linked inode
 * once), walking without following symbolic links. Below the directory itself, an entry that
 * vanishes mid-walk counts as gone, and one the walk may not read (EACCES, EPERM: a payload's
 * mode-0 test fixture, task 6.23) is listed in `unreadable` while the walk goes on, so `bytes`
 * is then a lower bound.
 * @throws Error when `directory` itself is absent or unreadable, or an entry fails otherwise.
 */
export function directoryUsage(directory: string): DirectoryUsage {
  const seen = new Set<string>();
  const unreadable: string[] = [];
  let bytes = 0;
  const visit = (path: string): void => {
    const isRoot = path === directory;
    let identity;
    try {
      identity = lstatSync(path);
    } catch (cause) {
      // Proof: tolerating ENOENT for the directory itself made `an absent tmp directory is
      // still a failure` (scope.test.ts) return zero bytes; rethrowing it here or at the listing
      // below made `an entry that vanishes mid-walk counts as gone` throw (2026-11-19, task 6.23).
      if (!isRoot && codeOf(cause) === 'ENOENT') return;
      if (!isRoot && isDenied(cause)) {
        unreadable.push(relative(directory, path));
        return;
      }
      throw cause;
    }
    const key = `${String(identity.dev)}:${String(identity.ino)}`;
    if (seen.has(key)) return;
    seen.add(key);
    bytes += identity.blocks * 512;
    if (!identity.isDirectory()) return;
    let entries: string[];
    try {
      entries = readdirSync(path);
    } catch (cause) {
      if (!isRoot && codeOf(cause) === 'ENOENT') return;
      // Proof: rethrowing EACCES here made `a mode-0 subdirectory is listed and the rest is
      // counted` (scope.test.ts) throw `EACCES: permission denied, scandir` (2026-11-19, task 6.23);
      // tolerating it for the root made `an unreadable tmp directory is still a failure` return.
      if (!isRoot && isDenied(cause)) {
        unreadable.push(relative(directory, path));
        return;
      }
      throw cause;
    }
    for (const entry of entries) visit(join(path, entry));
  };
  visit(directory);
  unreadable.sort();
  return {
    bytes,
    // Proof: listing every path made `unreadable paths are sorted and bounded, the rest counted`
    // (scope.test.ts) find 35 paths (2026-11-19, task 6.23).
    unreadable: unreadable.slice(0, UNREADABLE_PATH_LIMIT),
    unreadableOmitted: Math.max(0, unreadable.length - UNREADABLE_PATH_LIMIT),
  };
}
