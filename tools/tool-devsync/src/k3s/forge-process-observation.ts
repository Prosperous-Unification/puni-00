import { constants } from 'node:fs';
import { open, readlink, realpath, stat } from 'node:fs/promises';
import { basename, isAbsolute, join, relative, sep } from 'node:path';

interface ObservationRequest {
  readonly cgroup: string;
  readonly samples: number;
  readonly intervalMs: number;
  readonly windowMs: number;
}
interface ObservationRoots {
  readonly cgroupRoot: string;
  readonly procRoot: string;
}
interface ProcessObservation {
  readonly pid: number;
  readonly starttime: string;
  readonly ppid: number;
  readonly executable: string;
  readonly role: 'vite' | 'nx' | 'unknown';
  readonly rssKiB: number;
  readonly threads: number;
}
export interface CgroupObservation {
  readonly sampledAt: string;
  readonly elapsedMs: number;
  readonly cgroup: string;
  readonly device: string;
  readonly inode: string;
  readonly memory: {
    readonly current: string;
    readonly peak: string;
    readonly max: string;
    readonly events: Readonly<Record<string, string>>;
  };
  readonly processes: readonly ProcessObservation[];
}

function parseCounter(source: string): string {
  const counter = source.trim();
  // Proof: malformed-counter fixture injects nonnumeric memory.current and refuses.
  if (!/^\d+$/.test(counter)) throw new Error('malformed memory counter');
  return counter;
}
function parseNatural(source: string | undefined): number {
  const value = Number(source);
  // Proof: malformed-status/stat fixtures remove required numeric identity fields and refuse.
  if (source === undefined || !/^\d+$/.test(source) || !Number.isSafeInteger(value))
    throw new Error('malformed process number');
  return value;
}
function parseIdentity(source: string, pid: number): { ppid: number; starttime: string } {
  const end = source.lastIndexOf(')');
  const fields = source
    .slice(end + 2)
    .trim()
    .split(/\s+/);
  const starttime = fields.at(19);
  // Proof: wrong-PID fixture retains otherwise valid stat fields and refuses.
  if (end < 0 || !source.startsWith(`${String(pid)} (`) || starttime === undefined)
    throw new Error('malformed process identity');
  parseCounter(starttime);
  return { ppid: parseNatural(fields.at(1)), starttime };
}
function parseEvents(source: string): Readonly<Record<string, string>> {
  const events: Record<string, string> = {};
  for (const line of source.trim().split('\n')) {
    const match = /^([a-z_]+) (\d+)$/.exec(line);
    const name = match?.at(1);
    const count = match?.at(2);
    // Proof: malformed-events fixture supplies a nonnumeric oom_kill and refuses.
    if (name === undefined || count === undefined || Object.hasOwn(events, name))
      throw new Error('malformed memory events');
    events[name] = count;
  }
  // Proof: missing-events fixture retains valid low counter but omits required OOM counters.
  if (!Object.hasOwn(events, 'oom') || !Object.hasOwn(events, 'oom_kill'))
    throw new Error('required memory events absent');
  return events;
}
function identifyRole(command: string): ProcessObservation['role'] {
  // Proof: unterminated-cmdline fixture refuses; launcher-position fixture cannot impersonate Vite.
  if (!command.endsWith('\0')) throw new Error('malformed process command');
  const arguments_ = command.split('\0');
  const launcher = arguments_.at(1);
  if (launcher?.endsWith('/node_modules/vite/bin/vite.js')) return 'vite';
  if (launcher?.endsWith('/node_modules/nx/bin/nx.js')) return 'nx';
  return 'unknown';
}

/**
 * Observes exact cgroup-v2 members in the same local Linux /proc namespace. Required reads,
 * PID reuse and membership changes throw. No command arguments, environment or acceptance
 * verdict are returned. A known launcher path supplies a role hint, never an OOM conclusion.
 * Files are bounded to 64KiB and exact members to 256. The roots parameter selects a local
 * filesystem boundary for offline fixtures; the CLI always uses /sys/fs/cgroup and /proc.
 * Monotonic deadlines bound waits with scheduler tolerance; the CLI adds a local exit watchdog.
 * No remote-process deadline is implied. See docs/infra/local.md, local process observations.
 */
export async function observeProcesses(
  request: ObservationRequest,
  roots: ObservationRoots = { cgroupRoot: '/sys/fs/cgroup', procRoot: '/proc' },
  emit?: (sample: CgroupObservation) => void,
): Promise<readonly CgroupObservation[]> {
  // Proof: invalid-bounds fixtures refuse before the deliberately missing directory is opened.
  if (
    !Number.isInteger(request.samples) ||
    request.samples < 1 ||
    request.samples > 30 ||
    !Number.isInteger(request.intervalMs) ||
    request.intervalMs < 0 ||
    request.intervalMs > 1000 ||
    !Number.isFinite(request.windowMs) ||
    request.windowMs < 1 ||
    request.windowMs > 30_000
  )
    throw new Error('invalid observation bounds');
  const started = performance.now();
  const deadline = started + request.windowMs;
  const requireTime = () => {
    if (performance.now() >= deadline) throw new Error('process observation deadline');
  };
  const readText = async (path: string): Promise<string> => {
    requireTime();
    // Proof: required-state fixtures inject ENOENT/EACCES/symlink; FIFO fixture blocks if NONBLOCK is removed.
    const descriptor = await open(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      // Proof: nonregular-state fixture replaces memory.peak with a directory and refuses.
      if (!(await descriptor.stat()).isFile())
        throw new Error('required observation file is not regular');
      const bytes = Buffer.alloc(65_537);
      let length = 0;
      while (length < bytes.length) {
        requireTime();
        const read = await descriptor.read(bytes, length, bytes.length - length, null);
        if (read.bytesRead === 0) break;
        length += read.bytesRead;
      }
      // Proof: oversized-cmdline fixture reads 65537 bytes and refuses.
      if (length > 65_536) throw new Error('observation byte limit');
      requireTime();
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length));
    } finally {
      await descriptor.close();
    }
  };
  const collect = async (): Promise<readonly CgroupObservation[]> => {
    const root = await realpath(roots.cgroupRoot);
    const directory = await realpath(request.cgroup);
    const suffix = relative(root, directory);
    // Proof: foreign-directory and symlink-escape fixtures refuse at this boundary.
    if (
      !isAbsolute(request.cgroup) ||
      suffix === '..' ||
      suffix.startsWith(`..${sep}`) ||
      isAbsolute(suffix)
    )
      throw new Error('exact local cgroup directory required');
    const identity = await stat(directory, { bigint: true });
    // Proof: nondirectory-cgroup fixture selects a memory file and refuses before member reads.
    if (!identity.isDirectory()) throw new Error('exact local cgroup directory required');
    const membership = `0::/${suffix.split(sep).join('/')}`;
    const observations: CgroupObservation[] = [];
    for (let index = 0; index < request.samples; index++) {
      requireTime();
      const listed = (await readText(join(directory, 'cgroup.procs'))).trim();
      const pids = listed === '' ? [] : listed.split('\n').map(parseNatural);
      // Proof: process-limit fixture supplies 257 PIDs and refuses before opening any process.
      if (pids.length > 256 || new Set(pids).size !== pids.length || pids.some((pid) => pid === 0))
        throw new Error('observation process limit or malformed PID list');
      const current = parseCounter(await readText(join(directory, 'memory.current')));
      const peak = parseCounter(await readText(join(directory, 'memory.peak')));
      const maximum = (await readText(join(directory, 'memory.max'))).trim();
      const max = maximum === 'max' ? maximum : parseCounter(maximum);
      const events = parseEvents(await readText(join(directory, 'memory.events')));
      const processes: ProcessObservation[] = [];
      for (const pid of pids) {
        const proc = join(roots.procRoot, String(pid));
        const before = parseIdentity(await readText(join(proc, 'stat')), pid);
        const requireMembership = async () => {
          // Proof: foreign-membership fixture refuses even when cgroup.procs lists its PID.
          if ((await readText(join(proc, 'cgroup'))).trim() !== membership)
            throw new Error('process cgroup membership changed');
        };
        await requireMembership();
        const status = await readText(join(proc, 'status'));
        const statusNumber = (name: string) =>
          parseNatural(new RegExp(`^${name}:\\s+(\\d+)(?: kB)?$`, 'm').exec(status)?.at(1));
        const command = await readText(join(proc, 'cmdline'));
        const role = identifyRole(command);
        const executable = basename(await readlink(join(proc, 'exe')));
        // Proof: unsafe executable fixture refuses path text outside the safe basename alphabet.
        if (!/^[a-zA-Z0-9._+-]{1,256}$/.test(executable))
          throw new Error('unsafe executable basename');
        // Proof: exec preload changes cmdline after role inspection while retaining PID/start-time; test refuses.
        if (
          command !== (await readText(join(proc, 'cmdline'))) ||
          executable !== basename(await readlink(join(proc, 'exe')))
        )
          throw new Error('process executable changed');
        const after = parseIdentity(await readText(join(proc, 'stat')), pid);
        await requireMembership();
        // Proof: identity/status faults refuse mixed-PID observations at the production boundary.
        if (
          before.starttime !== after.starttime ||
          before.ppid !== after.ppid ||
          statusNumber('Pid') !== pid ||
          statusNumber('PPid') !== before.ppid
        )
          throw new Error('process identity changed');
        processes.push({
          pid,
          ...before,
          executable,
          role,
          rssKiB: statusNumber('VmRSS'),
          threads: statusNumber('Threads'),
        });
      }
      const observed = await stat(directory, { bigint: true });
      // Proof: directory-replacement preload moves the cgroup and creates a new inode; test refuses.
      if (observed.dev !== identity.dev || observed.ino !== identity.ino)
        throw new Error('cgroup identity changed');
      requireTime();
      const sample = {
        sampledAt: new Date().toISOString(),
        elapsedMs: performance.now() - started,
        cgroup: membership.slice(3),
        device: String(identity.dev),
        inode: String(identity.ino),
        memory: { current, peak, max, events },
        processes,
      };
      observations.push(sample);
      emit?.(sample);
      if (index + 1 < request.samples) {
        // Proof: long-interval fixture expires at its 40ms budget instead of sleeping a second.
        await Bun.sleep(Math.min(request.intervalMs, Math.max(0, deadline - performance.now())));
      }
    }
    return observations;
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Proof: stalled-read library fixture reaches its external 1500ms kill if this ceiling is removed.
  const ceiling = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('process observation deadline'));
    }, request.windowMs);
  });
  try {
    return await Promise.race([collect(), ceiling]);
  } finally {
    clearTimeout(timer);
  }
}

if (import.meta.main) {
  const cgroup = process.argv.at(2);
  // Proof: extra-lifecycle-argument CLI fixture refuses before reading any required file.
  if (cgroup === undefined || process.argv.length !== 3)
    throw new Error('Usage: forge-process-observation.ts <exact-absolute-cgroup-directory>');
  // Proof: stalled-read CLI fixture loses its local-deadline evidence when this watchdog is disabled.
  const watchdog = setTimeout(() => {
    console.error('process observation local deadline');
    process.exit(1);
  }, 30_000);
  try {
    await observeProcesses(
      { cgroup, samples: 30, intervalMs: 1000, windowMs: 30_000 },
      undefined,
      (sample) => {
        console.log(JSON.stringify(sample));
      },
    );
  } finally {
    clearTimeout(watchdog);
  }
}
