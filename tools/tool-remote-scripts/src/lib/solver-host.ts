import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { posix } from 'node:path';

import { runDockerCli } from './docker-deadline';
import { readClosed, readFields, readString } from './managed-cohort';
import { decodeSolverSupervisorConfig } from './solver-supervisor-config';
import {
  SOLVER_SUPERVISOR_BUN,
  SOLVER_SUPERVISOR_BUNDLE,
  SOLVER_SUPERVISOR_CONFIG,
  SOLVER_SUPERVISOR_SERVICE,
  SOLVER_SUPERVISOR_UNIT,
} from './solver-supervisor-install-contract';

export interface SolverPins {
  readonly version: 1;
  readonly sourceSha: string;
  readonly bunSha256: string;
  readonly bundleSha256: string;
  readonly configSha256: string;
  readonly unitSha256: string;
}
export interface SolverFile {
  readonly path: string;
  readonly device: string;
  readonly inode: string;
  readonly mode: number;
  readonly sha256: string;
  readonly solverImages?: readonly string[];
}
export type SolverHostCommand = { readonly kind: 'show' } | { readonly kind: 'stop' };
export type RunSolverHost = (command: SolverHostCommand, signal?: AbortSignal) => Promise<string>;
export interface SolverProcess {
  readonly pid: number;
  readonly startTime: string;
  readonly cgroup: string;
}
export interface SolverCgroup {
  readonly device: string;
  readonly inode: string;
  readonly populated: boolean;
}
export interface SolverUnit {
  readonly pid: number;
  readonly invocation: string;
  readonly cgroup: string;
}
export const SOLVER_EDGE_STATE = '/home/puni1/wbs/state';

export interface SolverPorts {
  readonly edgeState: string;
  readonly runHost: RunSolverHost;
  readonly runDocker: (args: string[], signal?: AbortSignal) => Promise<string>;
  readonly captureFile: typeof captureSolverFile;
  readonly observeProcess: typeof observeSolverProcess;
  readonly observeCgroup: typeof observeSolverCgroup;
}
const PROPERTIES = [
  'LoadState',
  'Id',
  'Names',
  'FragmentPath',
  'DropInPaths',
  'Transient',
  'NeedDaemonReload',
  'ExecStart',
  'ExecStartPre',
  'ExecStartPost',
  'ExecStop',
  'ExecStopPost',
  'Restart',
  'KillMode',
  'Environment',
  'ActiveState',
  'SubState',
  'MainPID',
  'ControlPID',
  'InvocationID',
  'ControlGroup',
  'Job',
];

/** Requires externally supplied closed pins; observed installed hashes never become expected hashes. */
export function decodeSolverPins(value: unknown): SolverPins {
  // Proof: pins-closed fault accepted an extra authority field (solver-host.test.ts).
  const pins = readClosed(value, [
    'version',
    'sourceSha',
    'bunSha256',
    'bundleSha256',
    'configSha256',
    'unitSha256',
  ]);
  if (pins['version'] !== 1 || !/^[a-f0-9]{40}$/.test(readString(pins['sourceSha'])))
    throw new Error('solver tuple pins are malformed');
  for (const key of ['bunSha256', 'bundleSha256', 'configSha256', 'unitSha256'])
    if (!/^[a-f0-9]{64}$/.test(readString(pins[key])))
      throw new Error('solver tuple hash pin is malformed');
  return {
    version: 1,
    sourceSha: readString(pins['sourceSha']),
    bunSha256: readString(pins['bunSha256']),
    bundleSha256: readString(pins['bundleSha256']),
    configSha256: readString(pins['configSha256']),
    unitSha256: readString(pins['unitSha256']),
  };
}

/** Canonical nofollow bounded regular-file observation, retaining identities and hash only. */
export async function captureSolverFile(
  path: string,
  maximum: number,
  config = false,
): Promise<SolverFile> {
  // Proof: canonical-alias/file-bound faults admitted a symlink or oversized file (solver-host.test.ts).
  const named = await lstat(path, { bigint: true });
  if (!named.isFile() || (await realpath(path)) !== path || named.size > BigInt(maximum))
    throw new Error('solver installed file is not canonical bounded regular file');
  // Proof: nonblocking-open fault hung on the actual lstat-to-FIFO substitution (solver-host.test.ts).
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const initial = await file.stat({ bigint: true });
    if (
      !initial.isFile() ||
      initial.dev !== named.dev ||
      initial.ino !== named.ino ||
      initial.size > BigInt(maximum)
    )
      throw new Error('solver installed file changed while opening');
    const bytes = Buffer.alloc(Math.min(maximum + 1, 64 * 1024));
    const hash = createHash('sha256');
    const configChunks: Buffer[] = [];
    let length = 0;
    while (length <= maximum) {
      const read = await file.read(bytes, 0, bytes.length, null);
      if (read.bytesRead === 0) break;
      length += read.bytesRead;
      hash.update(bytes.subarray(0, read.bytesRead));
      if (config) configChunks.push(Buffer.from(bytes.subarray(0, read.bytesRead)));
    }
    if (length > maximum) throw new Error('solver installed file exceeds bounded read');
    const final = await file.stat({ bigint: true });
    const current = await lstat(path, { bigint: true });
    // Proof: final-metadata fault accepted chmod after final descriptor stat (solver-host.test.ts).
    if (
      initial.dev !== current.dev ||
      initial.ino !== current.ino ||
      initial.size !== final.size ||
      initial.mode !== final.mode ||
      initial.dev !== final.dev ||
      initial.ino !== final.ino ||
      final.size !== current.size ||
      final.mode !== current.mode ||
      final.mtimeNs !== current.mtimeNs ||
      final.ctimeNs !== current.ctimeNs ||
      initial.mtimeNs !== final.mtimeNs ||
      initial.ctimeNs !== final.ctimeNs ||
      !current.isFile() ||
      (await realpath(path)) !== path
    )
      throw new Error('solver installed file changed while reading');
    const contents = Buffer.concat(configChunks);
    let solverImages: readonly string[] | undefined;
    if (config) {
      const decoded: unknown = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(contents),
      );
      decodeSolverSupervisorConfig(decoded);
      const images = readFields(decoded)['images'];
      if (!Array.isArray(images)) throw new Error('solver config image list is malformed');
      solverImages = [
        ...new Set(images.map((image) => readString(readFields(image)['solverImage']))),
      ].sort();
    }
    return {
      path,
      device: String(initial.dev),
      inode: String(initial.ino),
      mode: Number(initial.mode & 0o777n),
      sha256: hash.digest('hex'),
      ...(solverImages === undefined ? {} : { solverImages }),
    };
  } finally {
    await file.close();
  }
}

/** The fixed installed tuple is checked in full before service observations or mutations. */
export async function captureSolverTuple(
  pins: SolverPins,
  capture: typeof captureSolverFile,
): Promise<readonly SolverFile[]> {
  const files: SolverFile[] = [];
  for (const [path, hash, maximum, config, mode] of [
    [SOLVER_SUPERVISOR_BUN, pins.bunSha256, 128 * 1024 * 1024, false, 0o755],
    [SOLVER_SUPERVISOR_BUNDLE.remote, pins.bundleSha256, 16 * 1024 * 1024, false, 0o755],
    [SOLVER_SUPERVISOR_CONFIG, pins.configSha256, 64 * 1024, true, 0o600],
    [SOLVER_SUPERVISOR_UNIT, pins.unitSha256, 64 * 1024, false, 0o644],
  ] as const) {
    const observed = await capture(path, maximum, config);
    if (observed.sha256 !== hash || observed.mode !== mode)
      throw new Error('solver installed tuple differs from independent pins');
    files.push(observed);
  }
  return files;
}

function execMatches(value: string, path: string, argv: string): boolean {
  // systemctl show's execution record has stable path/argv fields and changing bookkeeping only.
  const match =
    /^\{ path=([^;]+) ; argv\[\]=([^;]+) ; ignore_errors=no ; start_time=\[[^\]\n]*\] ; stop_time=\[[^\]\n]*\] ; pid=[0-9]+ ; code=(?:\(null\)|[a-z-]+) ; status=[0-9]+(?:\/[^ ;}]+)? \}$/.exec(
      value,
    );
  return match?.[1] === path && match[2] === argv;
}
/** Strict effective systemd authority, including the exact shared admission namespace. */
export function parseSolverUnit(
  stdout: string,
  active: boolean,
  expectedState = SOLVER_EDGE_STATE,
): SolverUnit {
  const fields: Partial<Record<string, string>> = {};
  for (const line of stdout.trimEnd().split('\n')) {
    const equals = line.indexOf('=');
    const key = line.slice(0, equals);
    if (equals < 1 || !PROPERTIES.includes(key) || Object.hasOwn(fields, key))
      throw new Error('solver service properties are unknown or duplicate');
    fields[key] = line.slice(equals + 1);
  }
  // Proof: unit-environment fault accepted a different edge admission namespace (solver-exclusion.test.ts).
  if (
    Object.keys(fields).length !== PROPERTIES.length ||
    fields['LoadState'] !== 'loaded' ||
    fields['Id'] !== SOLVER_SUPERVISOR_SERVICE ||
    fields['Names'] !== SOLVER_SUPERVISOR_SERVICE ||
    fields['FragmentPath'] !== SOLVER_SUPERVISOR_UNIT ||
    fields['DropInPaths'] !== '' ||
    fields['Transient'] !== 'no' ||
    fields['NeedDaemonReload'] !== 'no' ||
    fields['Restart'] !== 'always' ||
    fields['KillMode'] !== 'control-group' ||
    fields['Environment'] !== `WBS_EDGE_STATE=${expectedState}` ||
    fields['ExecStartPre'] !== '' ||
    fields['ExecStartPost'] !== '' ||
    fields['ExecStop'] !== '' ||
    !execMatches(
      fields['ExecStart'] ?? '',
      SOLVER_SUPERVISOR_BUN,
      `${SOLVER_SUPERVISOR_BUN} ${SOLVER_SUPERVISOR_BUNDLE.remote} --config=${SOLVER_SUPERVISOR_CONFIG}`,
    ) ||
    !execMatches(
      fields['ExecStopPost'] ?? '',
      '/bin/rm',
      '/bin/rm -f /run/user/1000/wbs-solver/supervisor.sock',
    )
  )
    throw new Error('solver effective service authority is unrecognized');
  const pid = Number(fields['MainPID']);
  const cgroup = readString(fields['ControlGroup']);
  const invocation = readString(fields['InvocationID']);
  if (fields['ControlPID'] !== '0' || !['', '0'].includes(fields['Job'] ?? 'missing'))
    throw new Error('solver service has control process or pending job');
  if (active) {
    if (
      fields['ActiveState'] !== 'active' ||
      fields['SubState'] !== 'running' ||
      !Number.isSafeInteger(pid) ||
      pid < 1 ||
      !/^[a-f0-9]{32}$/.test(invocation) ||
      !cgroup.startsWith('/user.slice/') ||
      posix.normalize(cgroup) !== cgroup ||
      !cgroup.endsWith(`/${SOLVER_SUPERVISOR_SERVICE}`)
    )
      throw new Error('solver initial service process is not recognized');
  } else if (
    fields['ActiveState'] !== 'inactive' ||
    fields['SubState'] !== 'dead' ||
    fields['MainPID'] !== '0' ||
    cgroup !== ''
  )
    throw new Error('solver service did not stop');
  return { pid, invocation, cgroup };
}

/** Executes only fixed argv. Output is bounded while reading, and abortion kills the exact child. */
export async function runSolverHost(
  command: SolverHostCommand,
  signal?: AbortSignal,
): Promise<string> {
  const argv =
    command.kind === 'stop'
      ? ['systemctl', '--user', 'stop', SOLVER_SUPERVISOR_SERVICE]
      : [
          'systemctl',
          '--user',
          'show',
          SOLVER_SUPERVISOR_SERVICE,
          ...PROPERTIES.map((property) => `--property=${property}`),
        ];
  const child = Bun.spawn(argv, {
    stdout: 'pipe',
    stderr: 'pipe',
    signal,
    killSignal: 'SIGKILL',
    env: process.env,
  });
  async function readBounded(stream: ReadableStream<Uint8Array>): Promise<string> {
    const reader = stream.getReader();
    let length = 0;
    const chunks: Uint8Array[] = [];
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        length += next.value.length;
        if (length > 64 * 1024) {
          child.kill('SIGKILL');
          throw new Error('solver host command output exceeds bound');
        }
        chunks.push(next.value);
      }
      return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
    } finally {
      reader.releaseLock();
    }
  }
  try {
    const [stdout, , code] = await Promise.all([
      readBounded(child.stdout),
      readBounded(child.stderr),
      child.exited,
    ]);
    if (code !== 0) throw new Error(`solver fixed host command ${command.kind} failed`);
    return stdout;
  } catch (cause) {
    // Proof: reader-cleanup fault left the malformed-output executable child alive (solver-host.test.ts).
    // Every reader failure must terminate and reap this exact child before rejection.
    if (child.exitCode === null) child.kill('SIGKILL');
    await child.exited;
    throw cause;
  }
}

async function readKernelFile(path: string): Promise<string> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const bytes = Buffer.alloc(16 * 1024 + 1);
    let length = 0;
    while (length < bytes.length) {
      const read = await file.read(bytes, length, bytes.length - length, null);
      if (read.bytesRead === 0) break;
      length += read.bytesRead;
    }
    if (length > 16 * 1024) throw new Error('solver kernel observation exceeds bound');
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length));
  } finally {
    await file.close();
  }
}

/** Binds PID reuse to Linux start ticks and a single unified cgroup-v2 path. */
export async function observeSolverProcess(pid: number): Promise<SolverProcess> {
  if (!Number.isSafeInteger(pid) || pid < 1) throw new Error('solver PID is malformed');
  const stat = await readKernelFile(`/proc/${String(pid)}/stat`);
  const end = stat.lastIndexOf(') ');
  const ticks = stat
    .slice(end + 2)
    .split(' ')
    .at(19);
  const cgroup = await readKernelFile(`/proc/${String(pid)}/cgroup`);
  const match = /^0::([^\n]+)\n$/.exec(cgroup);
  if (end < 1 || ticks === undefined || !/^[0-9]+$/.test(ticks) || match?.[1] === undefined)
    throw new Error('solver process requires recognized proc and cgroup-v2 layout');
  return { pid, startTime: ticks, cgroup: match[1] };
}

/** cgroup.events populated includes descendants. Only modeled post-stop removal is optional. */
export async function observeSolverCgroup(
  path: string,
  removedAllowed: boolean,
): Promise<SolverCgroup | null> {
  if (!path.startsWith('/user.slice/') || posix.normalize(path) !== path)
    throw new Error('solver cgroup layout is unsupported');
  const named = `/sys/fs/cgroup${path}`;
  let directory;
  try {
    directory = await open(
      named,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
  } catch (cause) {
    if (removedAllowed && cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')
      return null;
    throw cause;
  }
  try {
    const initial = await directory.stat({ bigint: true });
    if ((await realpath(named)) !== named) throw new Error('solver cgroup is not canonical');
    const events = await readKernelFile(`/proc/self/fd/${String(directory.fd)}/cgroup.events`);
    const populated = /^populated ([01])$/m.exec(events);
    const current = await lstat(named, { bigint: true });
    if (populated?.[1] === undefined || current.dev !== initial.dev || current.ino !== initial.ino)
      throw new Error('solver cgroup observation changed');
    return {
      device: String(initial.dev),
      inode: String(initial.ino),
      populated: populated[1] === '1',
    };
  } finally {
    await directory.close();
  }
}

/** Production adapter pins the shared state namespace and uses only fixed host operations. */
export function solverHostPorts(): SolverPorts {
  return {
    edgeState: SOLVER_EDGE_STATE,
    runHost: runSolverHost,
    runDocker: runDockerCli,
    captureFile: captureSolverFile,
    observeProcess: observeSolverProcess,
    observeCgroup: observeSolverCgroup,
  };
}
