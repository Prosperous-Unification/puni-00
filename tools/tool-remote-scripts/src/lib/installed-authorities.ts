import { createHash, randomBytes } from 'node:crypto';
import { normalize } from 'node:path';

import { runDockerBefore } from './docker-deadline';
import { assertDependencyOwner, type DependencyOwner } from './edge-ownership';
import type { EnvLayout } from './env';
import { type AuthorityFile, withAuthorityFiles } from './installed-authority-files';
import { collectAuthorityHost } from './installed-authority-supervision';
import { decodeWriterManifest, WRITER_MEMBERS, type WriterMemberName } from './installed-writers';
import { readClosed, readString } from './managed-cohort';
import {
  captureSolverTuple,
  observeSolverProcess,
  parseSolverUnit,
  type SolverFile,
  solverHostPorts,
  type SolverPorts,
} from './solver-host';
import { decodeSolverPins, type SolverPins } from './solver-host';

export interface InstalledAuthorityPins {
  readonly format: 'installed-dependency-authority-pins';
  readonly version: 1;
  readonly sourceSha: string;
  readonly writerManifestSha256: string;
  readonly hostMachineIdSha256: string;
  readonly launchConfigurationSha256: string;
  readonly solver: SolverPins;
}
export interface AuthorityDatabase {
  readonly environment: 'prod' | 'dev';
  readonly host: string;
  readonly directoryIdentity: string;
  readonly fileIdentity: string;
}
export interface HostProcessIdentity {
  readonly pid: number;
  readonly startTime: string;
  readonly uid: number;
  readonly cgroup: string;
  readonly executable: {
    readonly device: string;
    readonly inode: string;
    readonly sha256: string;
  } | null;
  readonly argvSha256: string;
  readonly cwd: string | null;
}

/** Accepts separately prepared pins, never a self-approved observation. */
export function decodeInstalledAuthorityPins(value: unknown): InstalledAuthorityPins {
  // Proof: closed pins regression rejects activation, malformed SHA and cross-source solver pins.
  const pins = readClosed(value, [
    'format',
    'version',
    'sourceSha',
    'writerManifestSha256',
    'hostMachineIdSha256',
    'launchConfigurationSha256',
    'solver',
  ]);
  const sourceSha = readString(pins['sourceSha']);
  const solver = decodeSolverPins(pins['solver']);
  if (
    pins['format'] !== 'installed-dependency-authority-pins' ||
    pins['version'] !== 1 ||
    !/^[a-f0-9]{40}$/.test(sourceSha) ||
    solver.sourceSha !== sourceSha
  )
    throw new Error('installed authority pins identity differs');
  const writerManifestSha256 = readString(pins['writerManifestSha256']);
  const hostMachineIdSha256 = readString(pins['hostMachineIdSha256']);
  const launchConfigurationSha256 = readString(pins['launchConfigurationSha256']);
  if (
    ![writerManifestSha256, hostMachineIdSha256, launchConfigurationSha256].every((hash) =>
      /^[a-f0-9]{64}$/.test(hash),
    )
  )
    throw new Error('installed authority hash pin is malformed');
  return {
    format: 'installed-dependency-authority-pins',
    version: 1,
    sourceSha,
    writerManifestSha256,
    hostMachineIdSha256,
    launchConfigurationSha256,
    solver,
  };
}

interface DatabaseOpener {
  readonly environment: 'prod' | 'dev';
  readonly suffix: '' | '-wal' | '-shm' | '-journal';
  readonly pid: number;
  readonly startTime: string;
  readonly uid: number;
  readonly cgroup: string;
  readonly fd: number;
  readonly executable: HostProcessIdentity['executable'];
}
interface CollectorObservation {
  readonly hostMachineIdSha256: string;
  readonly bootId: string;
  readonly launchConfigurationSha256: string;
  readonly databaseOpeners: readonly DatabaseOpener[];
  readonly relevantProcesses: readonly HostProcessIdentity[];
}
function readInteger(value: unknown, minimum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum)
    throw new Error('authority numeric identity malformed');
  return value;
}
function readDigest(value: unknown): string {
  const hash = readString(value);
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('authority digest malformed');
  return hash;
}
function readCgroup(value: unknown): string {
  const cgroup = readString(value);
  if (!cgroup.startsWith('/') || normalize(cgroup) !== cgroup || cgroup.includes('\0'))
    throw new Error('authority cgroup malformed');
  return cgroup;
}
function readTicks(value: unknown): string {
  const ticks = readString(value);
  if (!/^[0-9]+$/.test(ticks)) throw new Error('authority start time malformed');
  return ticks;
}
function readExecutable(value: unknown): HostProcessIdentity['executable'] {
  if (value === null) return null;
  const executable = readClosed(value, ['device', 'inode', 'sha256']);
  return {
    device: readTicks(executable['device']),
    inode: readTicks(executable['inode']),
    sha256: readDigest(executable['sha256']),
  };
}
/** Closed decoder is evidence-only; completion and nonce never become a callback grant. */
export function decodeAuthorityCollection(
  contents: string,
  nonce: string,
  pins: InstalledAuthorityPins,
): CollectorObservation {
  let decoded: unknown;
  try {
    decoded = JSON.parse(contents);
  } catch {
    throw new Error('authority collector response malformed');
  }
  // Proof: response boundary negatives reject partial/replayed/extra-field completion envelopes.
  const observed = readClosed(decoded, [
    'nonce',
    'writerManifestSha256',
    'complete',
    'version',
    'euid',
    'hostMachineIdSha256',
    'bootId',
    'launchConfigurationSha256',
    'databaseOpeners',
    'relevantProcesses',
  ]);
  if (
    observed['nonce'] !== nonce ||
    observed['writerManifestSha256'] !== pins.writerManifestSha256 ||
    observed['complete'] !== true ||
    observed['version'] !== 1 ||
    observed['euid'] !== 0 ||
    // Proof: machine-pin and launch-pin omissions each admitted independently mismatching pins in observer fixtures.
    observed['hostMachineIdSha256'] !== pins.hostMachineIdSha256 ||
    observed['launchConfigurationSha256'] !== pins.launchConfigurationSha256
  )
    throw new Error('authority collector binding differs');
  const bootId = readString(observed['bootId']);
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(bootId))
    throw new Error('authority boot identity malformed');
  if (
    !Array.isArray(observed['databaseOpeners']) ||
    observed['databaseOpeners'].length > 1000000 ||
    !Array.isArray(observed['relevantProcesses']) ||
    observed['relevantProcesses'].length > 65536
  )
    throw new Error('authority process census malformed');
  const identities = new Set<string>();
  const databaseOpeners = observed['databaseOpeners'].map((value: unknown): DatabaseOpener => {
    const opener = readClosed(value, [
      'environment',
      'suffix',
      'pid',
      'startTime',
      'uid',
      'cgroup',
      'fd',
      'executable',
    ]);
    const environment = opener['environment'];
    const suffix = opener['suffix'];
    if (
      (environment !== 'prod' && environment !== 'dev') ||
      (suffix !== '' && suffix !== '-wal' && suffix !== '-shm' && suffix !== '-journal')
    )
      throw new Error('authority database opener malformed');
    const pid = readInteger(opener['pid'], 1),
      startTime = readTicks(opener['startTime']),
      fd = readInteger(opener['fd'], 0);
    const key = [environment, suffix, pid, startTime, fd].join(':');
    if (identities.has(key)) throw new Error('authority duplicate database opener');
    identities.add(key);
    return {
      environment,
      suffix,
      pid,
      startTime,
      fd,
      uid: readInteger(opener['uid'], 0),
      cgroup: readCgroup(opener['cgroup']),
      executable: readExecutable(opener['executable']),
    };
  });
  const pids = new Set<number>();
  const relevantProcesses = observed['relevantProcesses'].map(
    (value: unknown): HostProcessIdentity => {
      const process = readClosed(value, [
        'pid',
        'startTime',
        'uid',
        'cgroup',
        'executable',
        'argvSha256',
        'cwd',
      ]);
      const pid = readInteger(process['pid'], 1);
      if (pids.has(pid)) throw new Error('authority duplicate process');
      pids.add(pid);
      const cwd = process['cwd'] === null ? null : readString(process['cwd']);
      if (cwd !== null && !cwd.startsWith('/')) throw new Error('authority process cwd malformed');
      return {
        pid,
        startTime: readTicks(process['startTime']),
        uid: readInteger(process['uid'], 0),
        cgroup: readCgroup(process['cgroup']),
        executable: readExecutable(process['executable']),
        argvSha256: readDigest(process['argvSha256']),
        cwd,
      };
    },
  );
  return {
    hostMachineIdSha256: pins.hostMachineIdSha256,
    bootId,
    launchConfigurationSha256: pins.launchConfigurationSha256,
    databaseOpeners,
    relevantProcesses,
  };
}

export interface InstalledAuthorityObservation {
  readonly format: 'installed-dependency-authority-observation';
  readonly version: 1;
  readonly activation: 'blocked';
  readonly sourceSha: string;
  readonly writerManifestSha256: string;
  readonly hostMachineIdSha256: string;
  readonly bootId: string;
  readonly launchConfigurationSha256: string;
  readonly files: readonly (AuthorityFile & { readonly member: WriterMemberName })[];
  readonly solver: {
    readonly phase: 'running' | 'stopped';
    readonly pid: number;
    readonly startTime: string | null;
    readonly cgroup: string;
    readonly tuple: readonly SolverFile[];
  };
  readonly databaseOpeners: readonly DatabaseOpener[];
  readonly scope: 'fresh-read-only-host-observation';
}
const FIXED_WRITER_PATHS: Partial<Record<WriterMemberName, string>> = {
  'prod-swap': '/home/puni1/wbs/bin/swap.js',
  'prod-smoke': '/home/puni1/wbs/bin/smoke.js',
  'dev-swap': '/home/puni1/wbs-dev/bin/swap.js',
  'dev-smoke': '/home/puni1/wbs-dev/bin/smoke.js',
  'dev-poller': '/home/puni1/wbs-dev/bin/poll.sh',
  'dev-loader': '/home/puni1/wbs-dev/bin/dev-poll-sync.sh',
  'dev-interpreter': '/home/puni1/wbs-dev/bin/bun',
};
function requireDeadline(deadline: number): void {
  if (
    !Number.isFinite(deadline) ||
    deadline <= performance.now() ||
    deadline - performance.now() > 120000
  )
    throw new Error('authority observation requires a bounded deadline');
}
/** Fresh host observation under both existing owner locks; always activation:blocked.
 * Expected launch/machine/manifest hashes must be prepared independently. No capture-file,
 * fixture transport, process killer, drain token or persisted authority is accepted here.
 * Machine hash is SHA256 of exact /etc/machine-id bytes, including its optional newline.
 */
export interface InstalledAuthorityPorts {
  readonly withFiles: typeof withAuthorityFiles;
  readonly solver: SolverPorts;
  readonly collect: typeof collectAuthorityHost;
}

export async function observeInstalledDependencyAuthorities(
  owner: DependencyOwner,
  layouts: { readonly prod: EnvLayout; readonly dev: EnvLayout },
  value: InstalledAuthorityPins,
  writerManifestContents: string,
  databases: readonly AuthorityDatabase[],
  deadline: number,
): Promise<InstalledAuthorityObservation> {
  return observeInstalledAuthority(
    owner,
    layouts,
    value,
    writerManifestContents,
    databases,
    deadline,
    {
      withFiles: withAuthorityFiles,
      solver: solverHostPorts(),
      collect: collectAuthorityHost,
    },
  );
}

/** Internal observation orchestration; production always constructs its fixed ports above.
 * Fixture ports must execute the actual collector against kernel/query adapters, never a success capture.
 */
export async function observeInstalledAuthority(
  owner: DependencyOwner,
  layouts: { readonly prod: EnvLayout; readonly dev: EnvLayout },
  value: InstalledAuthorityPins,
  writerManifestContents: string,
  databases: readonly AuthorityDatabase[],
  deadline: number,
  ports: InstalledAuthorityPorts,
): Promise<InstalledAuthorityObservation> {
  requireDeadline(deadline);
  const pins = decodeInstalledAuthorityPins(value);
  await assertDependencyOwner(owner, layouts.prod, pins.sourceSha);
  await assertDependencyOwner(owner, layouts.dev, pins.sourceSha);
  if (
    Buffer.byteLength(writerManifestContents) > 256 * 1024 ||
    createHash('sha256').update(writerManifestContents).digest('hex') !== pins.writerManifestSha256
  )
    throw new Error('authority manifest differs from independent pin');
  let decoded: unknown;
  try {
    decoded = JSON.parse(writerManifestContents);
  } catch {
    throw new Error('authority writer manifest malformed');
  }
  const manifest = decodeWriterManifest(decoded);
  if (manifest.sourceSha !== pins.sourceSha || manifest.buildSha !== pins.sourceSha)
    throw new Error('authority source/build differs from live owner');
  const members = WRITER_MEMBERS.map((name) => {
    const member = manifest.members.find((candidate) => candidate.member === name);
    if (member === undefined) throw new Error('authority manifest member missing');
    const fixed = FIXED_WRITER_PATHS[name];
    if (
      (fixed !== undefined && member.hostPath !== fixed) ||
      normalize(member.hostPath) !== member.hostPath ||
      member.hostPath.length > 4096 ||
      ['/proc', '/sys', '/dev', layouts.prod.stateDir, layouts.dev.stateDir].some(
        (root) => member.hostPath === root || member.hostPath.startsWith(root + '/'),
      )
    )
      throw new Error('authority declared host location differs');
    return member;
  });
  if (
    databases.length !== 2 ||
    databases[0]?.environment !== 'prod' ||
    databases[1]?.environment !== 'dev'
  )
    throw new Error('authority database roster differs');
  for (const database of databases) {
    readClosed(database, ['environment', 'host', 'directoryIdentity', 'fileIdentity']);
    const root = layouts[database.environment].root + '/data/';
    if (
      !database.host.startsWith(root) ||
      normalize(database.host) !== database.host ||
      !/^\d+:\d+$/.test(database.directoryIdentity) ||
      !/^\d+:\d+$/.test(database.fileIdentity)
    )
      throw new Error('authority database binding malformed');
  }
  const observation = await ports.withFiles<InstalledAuthorityObservation>(
    members.map((member) => member.hostPath),
    async (files, recheck) => {
      // Proof: installed-pin omission admitted substituted actual fixture bytes in installed-hash.
      files.forEach((file, index) => {
        if (file.sha256 !== members[index]?.sha256)
          throw new Error('installed authority differs from independent writer hash');
      });
      const solverPorts = ports.solver;
      const tuple = await captureSolverTuple(pins.solver, solverPorts.captureFile);
      const stdout = await runDockerBefore(
        [],
        (_argv, signal) => solverPorts.runHost({ kind: 'show' }, signal),
        deadline,
      );
      const running = stdout.split('\n').includes('ActiveState=active');
      const unit = parseSolverUnit(stdout, running);
      const solverProcess = running ? await solverPorts.observeProcess(unit.pid) : null;
      if (solverProcess !== null && solverProcess.cgroup !== unit.cgroup)
        throw new Error('authority solver process differs');
      const coordinator = await observeSolverProcess(process.pid);
      const nonce = randomBytes(32).toString('hex');
      const request = {
        nonce,
        writerManifestSha256: pins.writerManifestSha256,
        coordinator,
        databases,
        layouts: ['prod', 'dev'],
        writerPaths: members.map((member) => ({ member: member.member, path: member.hostPath })),
      };
      const observed = decodeAuthorityCollection(
        await ports.collect(request, deadline),
        nonce,
        pins,
      );
      await recheck();
      if (
        JSON.stringify(await captureSolverTuple(pins.solver, solverPorts.captureFile)) !==
          JSON.stringify(tuple) ||
        (await runDockerBefore(
          [],
          (_argv, signal) => solverPorts.runHost({ kind: 'show' }, signal),
          deadline,
        )) !== stdout
      )
        throw new Error('authority solver changed during collection');
      if (
        solverProcess !== null &&
        JSON.stringify(await solverPorts.observeProcess(unit.pid)) !== JSON.stringify(solverProcess)
      )
        throw new Error('authority solver process changed');
      // Proof: final-owner omission admitted changed actual pending bytes after the real collector returned.
      await assertDependencyOwner(owner, layouts.prod, pins.sourceSha);
      await assertDependencyOwner(owner, layouts.dev, pins.sourceSha);
      requireDeadline(deadline);
      return {
        format: 'installed-dependency-authority-observation',
        version: 1,
        activation: 'blocked',
        sourceSha: pins.sourceSha,
        writerManifestSha256: pins.writerManifestSha256,
        hostMachineIdSha256: observed.hostMachineIdSha256,
        bootId: observed.bootId,
        launchConfigurationSha256: observed.launchConfigurationSha256,
        files: files.map((file, index) => {
          const member = members.at(index);
          if (member === undefined) throw new Error('authority member identity lost');
          return { ...file, member: member.member };
        }),
        solver: {
          phase: running ? 'running' : 'stopped',
          pid: unit.pid,
          startTime: solverProcess?.startTime ?? null,
          cgroup: unit.cgroup,
          tuple,
        },
        databaseOpeners: observed.databaseOpeners,
        scope: 'fresh-read-only-host-observation',
      };
    },
  );
  requireDeadline(deadline);
  return observation;
}
