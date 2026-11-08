import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';

import type { InstalledAuthorityPins } from './installed-authorities';
import { AUTHORITY_COLLECTOR } from './installed-authority-collector';
import {
  AuthorityCleanupUnknown,
  joinAuthoritySupervisor,
} from './installed-authority-supervision';
import { AUTHORITY_SUPERVISOR } from './installed-authority-supervisor';
import { WRITER_MEMBERS, type WriterManifest, type WriterMemberName } from './installed-writers';
import { readClosed } from './managed-cohort';
import { observeSolverProcess, type SolverProcess } from './solver-host';

/** Owner-free runtime worker; selected profile bytes are parsed only inside the supervised invocation. */
export const SOLVER_LAUNCH_WORKER = String.raw`
def collect_runtime_launch(request,host):
    host.check()
    require(type(RUNTIME_SESSION_PROFILES_HEX)==str and re.fullmatch(r'[0-9a-f]{352}',RUNTIME_SESSION_PROFILES_HEX,re.ASCII) is not None,'runtime profiles framing malformed')
    profile_bytes=bytes.fromhex(RUNTIME_SESSION_PROFILES_HEX)
    require(len(profile_bytes)==176 and profile_bytes.isascii(),'runtime profiles bytes malformed')
    profiles=json.loads(profile_bytes.decode('ascii'),object_pairs_hook=runtime_closed_pairs)
    require(type(profiles)==list and len(profiles)==2,'runtime profiles roster malformed')
    for entry,uid in zip(profiles,[0,1000]):
        require(type(entry)==dict and set(entry)=={'sha256','uid'} and type(entry['uid'])==int and entry['uid']==uid and type(entry['sha256'])==str and re.fullmatch(r'[0-9a-f]{64}',entry['sha256'],re.ASCII) is not None,'runtime profile malformed')
    require(encode(profiles)==profile_bytes,'runtime profiles noncanonical')
    host.check()
    known_paths=validate_request(request)
    require(request['databases']==[] and request['solver'] is None,'runtime launch scope differs')
    require(os.geteuid()==0 and pwd.getpwnam('puni1').pw_uid==1000,'runtime launch requires fixed root and user identities')
    machine=host.read('/etc/machine-id',1024)
    require(re.fullmatch(b'[a-f0-9]{32}\n?',machine) is not None,'runtime launch machine malformed')
    coordinator=request['coordinator']
    require(process_start(host,coordinator['pid'])[0]==coordinator['startTime'] and parse_cgroup(host.read('/proc/'+str(coordinator['pid'])+'/cgroup',1024*1024))==coordinator['cgroup'],'runtime launch coordinator changed')
    host.check()
    launch=collect_runtime_launch_hash(host,known_paths,profiles)
    require(host.read('/etc/machine-id',1024)==machine,'runtime launch machine changed')
    require(process_start(host,coordinator['pid'])[0]==coordinator['startTime'] and parse_cgroup(host.read('/proc/'+str(coordinator['pid'])+'/cgroup',1024*1024))==coordinator['cgroup'],'runtime launch coordinator changed')
    assert_internal_processes(host)
    observed={'format':'dependency-runtime-launch-observation','version':1,'nonce':request['nonce'],'writerManifestSha256':request['writerManifestSha256'],'hostMachineIdSha256':digest(machine),'runtimeLaunchSha256':launch}
    require(len(encode(observed))<=4096,'runtime launch projection exceeds bound')
    return observed
`;

export interface RuntimeLaunchPins {
  readonly format: 'dependency-runtime-launch-pins';
  readonly version: 1;
  readonly sourceSha: string;
  readonly writerManifestSha256: string;
  readonly hostMachineIdSha256: string;
  readonly projectionSha256: string;
  readonly sessionProfiles: readonly { readonly uid: 0 | 1000; readonly sha256: string }[];
}

/** Closed initial runtime pins; old full launch hashes retain their historical meaning. */
export function decodeRuntimeLaunchPins(
  value: unknown,
  sourceSha: string,
  authorities: InstalledAuthorityPins,
): RuntimeLaunchPins {
  const fields = readClosed(value, [
    'format',
    'version',
    'sourceSha',
    'writerManifestSha256',
    'hostMachineIdSha256',
    'projectionSha256',
    'sessionProfiles',
  ]);
  const projectionSha256 = fields['projectionSha256'];
  const profiles = fields['sessionProfiles'];
  if (
    fields['format'] !== 'dependency-runtime-launch-pins' ||
    fields['version'] !== 1 ||
    fields['sourceSha'] !== sourceSha ||
    !/^[0-9a-f]{40}$/.test(sourceSha) ||
    fields['writerManifestSha256'] !== authorities.writerManifestSha256 ||
    fields['hostMachineIdSha256'] !== authorities.hostMachineIdSha256 ||
    typeof projectionSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(projectionSha256) ||
    !Array.isArray(profiles) ||
    profiles.length !== 2
  )
    throw new Error('runtime launch pins differ');
  const sessionProfiles = profiles.map(
    (value: unknown, index: number): { uid: 0 | 1000; sha256: string } => {
      const profile = readClosed(value, ['uid', 'sha256']);
      const uid = profile['uid'];
      const sha256 = profile['sha256'];
      if (
        (uid !== 0 && uid !== 1000) ||
        uid !== (index === 0 ? 0 : 1000) ||
        typeof sha256 !== 'string' ||
        !/^[0-9a-f]{64}$/.test(sha256)
      )
        throw new Error('runtime launch session profile differs');
      return { uid, sha256 };
    },
  );
  return {
    format: 'dependency-runtime-launch-pins',
    version: 1,
    sourceSha,
    writerManifestSha256: authorities.writerManifestSha256,
    hostMachineIdSha256: authorities.hostMachineIdSha256,
    projectionSha256,
    sessionProfiles,
  };
}

interface SolverLaunchRequest {
  readonly nonce: string;
  readonly writerManifestSha256: string;
  readonly coordinator: SolverProcess;
  readonly databases: readonly never[];
  readonly layouts: readonly ['prod', 'dev'];
  readonly writerPaths: readonly { readonly member: WriterMemberName; readonly path: string }[];
  readonly solver: null;
}

/** Private original transport custody retained by the active invocation's unknown HOLD; never serialized. */
class SolverLaunchCleanupUnknown extends AuthorityCleanupUnknown {
  readonly #custody: Readonly<{
    child: ChildProcessWithoutNullStreams;
    request: SolverLaunchRequest;
    operation: Promise<string>;
  }>;
  constructor(
    child: ChildProcessWithoutNullStreams,
    request: SolverLaunchRequest,
    operation: Promise<string>,
  ) {
    super();
    this.#custody = { child, request, operation };
    Object.freeze(this.#custody);
  }
}

function assertLaunchDeadline(deadline: number): void {
  const remaining = deadline - performance.now();
  if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 120000)
    throw new Error('solver launch observation deadline exceeded');
}

/**
 * Observes current fixed host launch definitions under the caller's original deadline.
 * Independent pins remain expectations; historical owner/PID evidence grants no observation authority.
 * Unknown original-child cleanup propagates for the active admission's inner-lock HOLD.
 */
export async function observeSolverLaunch(
  authorities: InstalledAuthorityPins,
  writerManifest: WriterManifest,
  runtimeLaunch: RuntimeLaunchPins,
  deadline: number,
): Promise<Readonly<{ hostMachineIdSha256: string; runtimeLaunchSha256: string }>> {
  assertLaunchDeadline(deadline);
  const selected = decodeRuntimeLaunchPins(runtimeLaunch, writerManifest.sourceSha, authorities);
  const profileBytes = Buffer.from(
    JSON.stringify(selected.sessionProfiles.map(({ uid, sha256 }) => ({ sha256, uid }))),
    'utf8',
  );
  if (profileBytes.byteLength !== 176 || !profileBytes.every((byte) => byte < 128))
    throw new Error('runtime launch profile bytes malformed');
  const profileHex = profileBytes.toString('hex');
  if (!/^[0-9a-f]{352}$/.test(profileHex))
    throw new Error('runtime launch profile framing malformed');
  const coordinator = await observeSolverProcess(process.pid);
  assertLaunchDeadline(deadline);
  const nonce = randomBytes(32).toString('hex');
  const request: SolverLaunchRequest = {
    nonce,
    writerManifestSha256: authorities.writerManifestSha256,
    coordinator,
    databases: [],
    layouts: ['prod', 'dev'],
    writerPaths: WRITER_MEMBERS.map((name) => {
      const member = writerManifest.members.find((entry) => entry.member === name);
      if (member === undefined) throw new Error('solver launch writer inventory differs');
      return { member: name, path: member.hostPath };
    }),
    solver: null,
  };
  const program =
    AUTHORITY_COLLECTOR +
    '\n' +
    "RUNTIME_SESSION_PROFILES_HEX = '" +
    profileHex +
    "'\n" +
    SOLVER_LAUNCH_WORKER +
    '\n' +
    AUTHORITY_SUPERVISOR +
    '\nsupervisor_entry(collect_runtime_launch)\n';
  if (Buffer.byteLength(program) > 96 * 1024)
    throw new Error('solver launch fixed program exceeds bound');
  if (process.geteuid === undefined) throw new Error('solver launch effective UID unavailable');
  const command =
    process.geteuid() === 0
      ? ['/usr/bin/python3', '-I', '-c', program]
      : ['/usr/bin/sudo', '-n', '/usr/bin/python3', '-I', '-c', program];
  const executable = command.shift();
  if (executable === undefined) throw new Error('solver launch fixed executable missing');
  assertLaunchDeadline(deadline);
  const child = spawn(executable, command, { stdio: ['pipe', 'pipe', 'pipe'] });
  const operation = joinAuthoritySupervisor(child, request, nonce, deadline, undefined, {
    initialEnvelope: 'bounded',
  });
  let contents: string;
  try {
    contents = await operation;
  } catch (cause) {
    if (cause instanceof AuthorityCleanupUnknown)
      throw new SolverLaunchCleanupUnknown(child, request, operation);
    throw cause;
  }
  assertLaunchDeadline(deadline);
  if (Buffer.byteLength(contents) > 4096) throw new Error('solver launch projection exceeds bound');
  const decoded: unknown = JSON.parse(contents);
  const observed = readClosed(decoded, [
    'format',
    'version',
    'nonce',
    'writerManifestSha256',
    'hostMachineIdSha256',
    'runtimeLaunchSha256',
  ]);
  const hostMachineIdSha256 = observed['hostMachineIdSha256'];
  const runtimeLaunchSha256 = observed['runtimeLaunchSha256'];
  if (
    typeof hostMachineIdSha256 !== 'string' ||
    typeof runtimeLaunchSha256 !== 'string' ||
    observed['format'] !== 'dependency-runtime-launch-observation' ||
    observed['version'] !== 1 ||
    observed['nonce'] !== nonce ||
    observed['writerManifestSha256'] !== authorities.writerManifestSha256 ||
    hostMachineIdSha256 !== authorities.hostMachineIdSha256 ||
    runtimeLaunchSha256 !== selected.projectionSha256
  )
    throw new Error('solver launch current observation differs from independent pins');
  return {
    hostMachineIdSha256,
    runtimeLaunchSha256,
  };
}
