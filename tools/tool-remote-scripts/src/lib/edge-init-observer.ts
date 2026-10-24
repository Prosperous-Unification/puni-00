import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { lstat, readdir, readFile, readlink, realpath } from 'node:fs/promises';
import { type IncomingHttpHeaders, request as requestHttp } from 'node:http';
import { request as requestHttps } from 'node:https';
import { isIP } from 'node:net';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import { requireInheritedEdgeLock } from './edge-admission';
import { encodeOrderedEnv, fingerprint, InitRefusal, type NativeContainer } from './edge-init';
import {
  createLocalEngine,
  Deadline,
  type EngineTransport,
  type HostObserver,
  PrivateReceipts,
  readPrivateFile,
  type Receipt,
  runInitAdoption,
  type SelectedTarget,
  type TargetKind,
} from './edge-init-operation';
import {
  type AuthorityDatabase,
  decodeAuthorityCollection,
  decodeInstalledAuthorityPins,
  type HostProcessIdentity,
  type InstalledAuthorityPins,
} from './installed-authorities';
import { AUTHORITY_COLLECTOR } from './installed-authority-collector';
import { type AuthorityFile, withAuthorityFiles } from './installed-authority-files';
import { collectAuthorityHost, joinAuthoritySupervisor } from './installed-authority-supervision';
import { AUTHORITY_SUPERVISOR } from './installed-authority-supervisor';
import {
  decodeWriterManifest,
  readWriterBytes,
  WRITER_MEMBERS,
  type WriterMemberName,
} from './installed-writers';
import { assertInheritedLock } from './lock';
import { captureSolverFile, observeSolverProcess, solverHostPorts } from './solver-host';
import { isStoppedSolverUnit, readSolverUnitProjection } from './solver-unit-observation';

export type InitMode = 'prepare' | 'execute' | 'inspect-recovery';
export interface SafeInitSummary {
  attempt: string;
  stage: string;
  packetSha256: string;
  receiptDirectory: string;
  receiptSha256: string | null;
}
/** Retains only validated attempt metadata and fixed stages after a prepared operation refuses. */
export class InitObservationRefusal extends InitRefusal {
  constructor(readonly summary: SafeInitSummary) {
    super(summary.stage);
  }
}
interface Pin extends AuthorityFile {
  uid: number;
}
interface Address {
  host: string;
  connectAddress: string;
  port: number;
}
interface HttpProbe {
  kind: 'http';
  id: string;
  routeId: string;
  scheme: 'http' | 'https';
  address: Address;
  path: string;
  expectedStatus: number;
  expectedLocation: string | null;
  expectedContentType: string | null;
  expectedBodySha256: string;
}
interface WebSocketProbe {
  kind: 'websocket';
  id: string;
  routeId: string;
  address: Address;
  path: string;
  origin: string | null;
  requestedProtocol: string | null;
  expectedProtocol: string | null;
}
interface RegistryProbe {
  address: Address;
  credentials: Pin;
  repository: string;
  manifestDigest: string;
  manifestMediaType: string;
  v2BodySha256: string;
}
interface RoutePin {
  routeId: string;
  server: string;
  routePointer: string;
  routeSha256: string;
  hosts: string[];
  probeIds: string[];
}
interface CaddyGraph {
  root: string;
  directoryDevice: string;
  directoryInode: string;
  files: Pin[];
  directoryEntriesSha256: string;
  importGraphSha256: string;
  configurationSha256: string;
  routeInventory: RoutePin[];
}
interface LockPin {
  path: string;
  descriptor: number;
  device: string;
  inode: string;
}
type CgroupPin =
  | { state: 'empty'; path: string; device: string; inode: string }
  | { state: 'absent'; path: string; previousDevice: string; previousInode: string };
interface Quiescence {
  operation: Pin;
  operationId: string;
  issuedAt: string;
  expiresAt: string;
  hostMachineIdSha256: string;
  bootId: string;
  locks: LockPin[];
  writerManifest: Pin;
  authorityPins: InstalledAuthorityPins;
  databases: [AuthorityDatabase, AuthorityDatabase];
  suspendedCrontabSha256: string;
  stoppedUnitSha256: string;
  originalSolverCgroup: CgroupPin;
  drainedProcesses: HostProcessIdentity[];
}
interface ResourcePin {
  kind: 'bind' | 'volume';
  name: string | null;
  path: string;
  type: 'directory' | 'file';
  device: string;
  inode: string;
  mode: number;
  uid: number;
  parentsSha256: string;
  volumeSha256: string | null;
}
interface ProcessPin {
  startTime: string;
  cgroup: string;
  executableSha256: string;
  netNamespace: string;
  pidNamespace: string;
}
interface TargetPin {
  kind: TargetKind;
  id: string;
  image: string;
  nativeSha256: string;
  imageSha256: string;
  envSha256: string;
  composeFiles: string[];
  process: ProcessPin;
  defaultRouteNetwork: string;
  resources: ResourcePin[];
  networks: { id: string; name: string; sha256: string }[];
  listenerPorts: number[];
}
interface BackendPin {
  id: string;
  image: string;
  nativeSha256: string;
}
interface InitPacket {
  version: 1;
  nonce: string;
  receiptDirectory: string;
  sourceSha: string;
  source: Pin;
  bundle: Pin;
  bun: Pin;
  init: Pin;
  daemon: Pin;
  daemonVersionSha256: string;
  daemonInfoSha256: string;
  daemonPid: number;
  daemonStartTime: string;
  machineIdSha256: string;
  bootId: string;
  targets: [TargetPin, TargetPin];
  provenance: Pin[];
  public: { routesSha256: string; probes: (HttpProbe | WebSocketProbe)[] };
  registry: RegistryProbe;
  caddy: CaddyGraph;
  quiescence: Quiescence;
  backends: BackendPin[];
}

function refuse(reason = 'packet-invalid'): never {
  throw new InitRefusal(reason);
}
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) refuse();
  // The external JSON object boundary checks structure before field access.
  return value as Record<string, unknown>;
}
function closed(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const fields = record(value);
  if (Object.keys(fields).length !== keys.length || keys.some((key) => !Object.hasOwn(fields, key)))
    refuse();
  return fields;
}
function text(value: unknown, maximum = 4096): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    Buffer.byteLength(value) > maximum ||
    Array.from(value).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    refuse();
  return value;
}
function hash(value: unknown): string {
  const checked = text(value, 64);
  if (!/^[a-f0-9]{64}$/.test(checked)) refuse();
  return checked;
}
function identity(value: unknown): string {
  const checked = text(value, 24);
  if (!/^(?:0|[1-9][0-9]*)$/.test(checked)) refuse();
  return checked;
}
function integer(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  )
    refuse();
  return value;
}
function values<Value>(
  value: unknown,
  decode: (value: unknown) => Value,
  maximum = 256,
  minimum = 0,
): Value[] {
  if (!Array.isArray(value) || value.length > maximum || value.length < minimum) refuse();
  return value.map(decode);
}
function nullableText(value: unknown): string | null {
  return value === null ? null : text(value);
}
function path(value: unknown): string {
  const checked = text(value);
  if (!isAbsolute(checked) || resolve(checked) !== checked) refuse();
  return checked;
}
function pin(value: unknown): Pin {
  const fields = closed(value, ['path', 'sha256', 'device', 'inode', 'mode', 'uid']);
  return {
    path: path(fields['path']),
    sha256: hash(fields['sha256']),
    device: identity(fields['device']),
    inode: identity(fields['inode']),
    mode: integer(fields['mode'], 0, 0o7777),
    uid: integer(fields['uid']),
  };
}
function address(value: unknown): Address {
  const fields = closed(value, ['host', 'connectAddress', 'port']);
  const host = text(fields['host'], 253),
    connectAddress = text(fields['connectAddress'], 64);
  if (
    !/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host) ||
    host
      .split('.')
      .some((label) => label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)) ||
    isIP(connectAddress) === 0
  )
    refuse();
  return { host, connectAddress, port: integer(fields['port'], 1, 65535) };
}
function requestPath(value: unknown): string {
  const checked = text(value);
  if (
    !checked.startsWith('/') ||
    checked.startsWith('//') ||
    checked.includes('#') ||
    checked.includes('://')
  )
    refuse();
  return checked;
}
function probe(value: unknown): HttpProbe | WebSocketProbe {
  const fields = record(value);
  const base = {
    id: text(fields['id'], 128),
    routeId: hash(fields['routeId']),
    address: address(fields['address']),
    path: requestPath(fields['path']),
  };
  if (fields['kind'] === 'http') {
    closed(fields, [
      'kind',
      'id',
      'routeId',
      'scheme',
      'address',
      'path',
      'expectedStatus',
      'expectedLocation',
      'expectedContentType',
      'expectedBodySha256',
    ]);
    const scheme = fields['scheme'];
    if (scheme !== 'http' && scheme !== 'https') refuse();
    return {
      ...base,
      kind: 'http',
      scheme,
      expectedStatus: integer(fields['expectedStatus'], 200, 599),
      expectedLocation: nullableText(fields['expectedLocation']),
      expectedContentType: nullableText(fields['expectedContentType']),
      expectedBodySha256: hash(fields['expectedBodySha256']),
    };
  }
  if (fields['kind'] !== 'websocket') refuse();
  closed(fields, [
    'kind',
    'id',
    'routeId',
    'address',
    'path',
    'origin',
    'requestedProtocol',
    'expectedProtocol',
  ]);
  const requestedProtocol = nullableText(fields['requestedProtocol']),
    expectedProtocol = nullableText(fields['expectedProtocol']);
  if (
    [requestedProtocol, expectedProtocol].some(
      (protocol) => protocol !== null && !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(protocol),
    ) ||
    (expectedProtocol !== null && expectedProtocol !== requestedProtocol)
  )
    refuse();
  return {
    ...base,
    kind: 'websocket',
    origin: nullableText(fields['origin']),
    requestedProtocol,
    expectedProtocol,
  };
}
function parseJson(contents: string): unknown {
  try {
    return JSON.parse(contents);
  } catch {
    return refuse('json-invalid');
  }
}
function sha(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** @internal */
export function decodeInitPacket(value: unknown): InitPacket {
  const fields = closed(value, [
    'version',
    'nonce',
    'receiptDirectory',
    'sourceSha',
    'source',
    'bundle',
    'bun',
    'init',
    'daemon',
    'daemonVersionSha256',
    'daemonInfoSha256',
    'daemonPid',
    'daemonStartTime',
    'machineIdSha256',
    'bootId',
    'targets',
    'provenance',
    'public',
    'registry',
    'caddy',
    'quiescence',
    'backends',
  ]);
  if (fields['version'] !== 1) refuse();
  const nonce = text(fields['nonce'], 64),
    sourceSha = text(fields['sourceSha'], 40),
    bootId = text(fields['bootId'], 36);
  if (
    !/^[a-z0-9-]{1,64}$/.test(nonce) ||
    !/^[a-f0-9]{40}$/.test(sourceSha) ||
    !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(bootId)
  )
    refuse();
  const publicFields = closed(fields['public'], ['routesSha256', 'probes']);
  const probes = values(publicFields['probes'], probe, 128, 1);
  if (new Set(probes.map((entry) => entry.id)).size !== probes.length) refuse();
  const registryFields = closed(fields['registry'], [
    'address',
    'credentials',
    'repository',
    'manifestDigest',
    'manifestMediaType',
    'v2BodySha256',
  ]);
  const repository = text(registryFields['repository']),
    manifestDigest = text(registryFields['manifestDigest'], 71),
    manifestMediaType = text(registryFields['manifestMediaType'], 128);
  if (
    !/^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*$/.test(repository) ||
    !/^sha256:[a-f0-9]{64}$/.test(manifestDigest) ||
    ![
      'application/vnd.oci.image.manifest.v1+json',
      'application/vnd.oci.image.index.v1+json',
      'application/vnd.docker.distribution.manifest.v2+json',
      'application/vnd.docker.distribution.manifest.list.v2+json',
    ].includes(manifestMediaType)
  )
    refuse();
  const credentials = pin(registryFields['credentials']);
  if (credentials.mode !== 0o600 || ![0, 1000].includes(credentials.uid)) refuse();
  const graph = decodeGraph(fields['caddy']);
  const targets = values(fields['targets'], decodeTarget, 2, 2);
  const registryTarget = targets.at(0),
    caddyTarget = targets.at(1);
  if (
    registryTarget?.kind !== 'registry' ||
    caddyTarget?.kind !== 'caddy' ||
    registryTarget.id === caddyTarget.id
  )
    refuse();
  for (const target of targets) {
    if (
      new Set(target.composeFiles).size !== target.composeFiles.length ||
      new Set(target.resources.map((entry) => entry.path)).size !== target.resources.length ||
      new Set(target.networks.map((entry) => entry.id)).size !== target.networks.length ||
      new Set(target.networks.map((entry) => entry.name)).size !== target.networks.length ||
      new Set(target.listenerPorts).size !== target.listenerPorts.length
    )
      refuse();
  }
  const quiescence = decodeQuiescence(fields['quiescence']);
  // Proof: omitting mode admission accepted the public operation record in the closed packet negative.
  if (
    quiescence.operation.mode !== 0o600 ||
    quiescence.operation.uid !== 1000 ||
    quiescence.bootId !== bootId ||
    quiescence.hostMachineIdSha256 !== fields['machineIdSha256'] ||
    quiescence.authorityPins.sourceSha !== sourceSha
  )
    refuse();
  const packet: InitPacket = {
    version: 1,
    nonce,
    receiptDirectory: path(fields['receiptDirectory']),
    sourceSha,
    source: pin(fields['source']),
    bundle: pin(fields['bundle']),
    bun: pin(fields['bun']),
    init: pin(fields['init']),
    daemon: pin(fields['daemon']),
    daemonVersionSha256: hash(fields['daemonVersionSha256']),
    daemonInfoSha256: hash(fields['daemonInfoSha256']),
    daemonPid: integer(fields['daemonPid'], 1),
    daemonStartTime: identity(fields['daemonStartTime']),
    machineIdSha256: hash(fields['machineIdSha256']),
    bootId,
    targets: [registryTarget, caddyTarget],
    provenance: values(fields['provenance'], pin, 64, 1),
    public: { routesSha256: hash(publicFields['routesSha256']), probes },
    registry: {
      address: address(registryFields['address']),
      credentials,
      repository,
      manifestDigest,
      manifestMediaType,
      v2BodySha256: hash(registryFields['v2BodySha256']),
    },
    caddy: graph,
    quiescence,
    backends: values(fields['backends'], decodeBackend, 128, 1),
  };
  // Proof: omitting uniqueness admitted duplicate backend pins in the closed packet negative.
  if (
    new Set(packet.backends.map((entry) => entry.id)).size !== packet.backends.length ||
    packet.backends.some((entry) => packet.targets.some((target) => target.id === entry.id))
  )
    refuse();
  if (
    packet.bun.path !== process.execPath ||
    packet.bundle.path !== process.argv[1] ||
    packet.init.path !== '/usr/libexec/docker/docker-init' ||
    packet.daemon.path !== '/usr/bin/dockerd'
  )
    refuse();
  return packet;
}

function decodeBackend(value: unknown): BackendPin {
  const fields = closed(value, ['id', 'image', 'nativeSha256']);
  const image = text(fields['image'], 71);
  if (!/^sha256:[a-f0-9]{64}$/.test(image)) refuse();
  return { id: hash(fields['id']), image, nativeSha256: hash(fields['nativeSha256']) };
}
function decodeTarget(value: unknown): TargetPin {
  const fields = closed(value, [
    'kind',
    'id',
    'image',
    'nativeSha256',
    'imageSha256',
    'envSha256',
    'composeFiles',
    'process',
    'defaultRouteNetwork',
    'resources',
    'networks',
    'listenerPorts',
  ]);
  const kind = fields['kind'],
    image = text(fields['image'], 71);
  if ((kind !== 'registry' && kind !== 'caddy') || !/^sha256:[a-f0-9]{64}$/.test(image)) refuse();
  const processFields = closed(fields['process'], [
    'startTime',
    'cgroup',
    'executableSha256',
    'netNamespace',
    'pidNamespace',
  ]);
  return {
    kind,
    id: hash(fields['id']),
    image,
    nativeSha256: hash(fields['nativeSha256']),
    imageSha256: hash(fields['imageSha256']),
    envSha256: hash(fields['envSha256']),
    composeFiles: values(fields['composeFiles'], (value) => path(value), 16, 1),
    process: {
      startTime: identity(processFields['startTime']),
      cgroup: path(processFields['cgroup']),
      executableSha256: hash(processFields['executableSha256']),
      netNamespace: text(processFields['netNamespace'], 64),
      pidNamespace: text(processFields['pidNamespace'], 64),
    },
    defaultRouteNetwork: hash(fields['defaultRouteNetwork']),
    resources: values(
      fields['resources'],
      (value) => {
        const resource = closed(value, [
          'kind',
          'name',
          'path',
          'type',
          'device',
          'inode',
          'mode',
          'uid',
          'parentsSha256',
          'volumeSha256',
        ]);
        const kind = resource['kind'],
          type = resource['type'];
        if ((kind !== 'bind' && kind !== 'volume') || (type !== 'directory' && type !== 'file'))
          refuse();
        const name = nullableText(resource['name']);
        if (
          (kind === 'volume' &&
            (name === null || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,254}$/.test(name))) ||
          (kind === 'bind' && name !== null)
        )
          refuse();
        return {
          kind,
          name,
          path: path(resource['path']),
          type,
          device: identity(resource['device']),
          inode: identity(resource['inode']),
          mode: integer(resource['mode'], 0, 0o7777),
          uid: integer(resource['uid']),
          parentsSha256: hash(resource['parentsSha256']),
          volumeSha256: resource['volumeSha256'] === null ? null : hash(resource['volumeSha256']),
        };
      },
      32,
      1,
    ),
    networks: values(
      fields['networks'],
      (value) => {
        const network = closed(value, ['id', 'name', 'sha256']);
        return {
          id: hash(network['id']),
          name: text(network['name'], 128),
          sha256: hash(network['sha256']),
        };
      },
      16,
      1,
    ),
    listenerPorts: values(fields['listenerPorts'], (value) => integer(value, 1, 65535), 32, 1),
  };
}
function decodeGraph(value: unknown): CaddyGraph {
  const fields = closed(value, [
    'root',
    'directoryDevice',
    'directoryInode',
    'files',
    'directoryEntriesSha256',
    'importGraphSha256',
    'configurationSha256',
    'routeInventory',
  ]);
  if (fields['root'] !== '/home/puni1/wbs/caddy/Caddyfile') refuse();
  const files = values(fields['files'], pin, 256, 1);
  if (
    !files.some((entry) => entry.path === fields['root']) ||
    new Set(files.map((entry) => entry.path)).size !== files.length ||
    files.some((entry) => !entry.path.startsWith('/home/puni1/wbs/caddy/'))
  )
    refuse();
  return {
    root: fields['root'],
    directoryDevice: identity(fields['directoryDevice']),
    directoryInode: identity(fields['directoryInode']),
    files,
    directoryEntriesSha256: hash(fields['directoryEntriesSha256']),
    importGraphSha256: hash(fields['importGraphSha256']),
    configurationSha256: hash(fields['configurationSha256']),
    routeInventory: values(
      fields['routeInventory'],
      (value) => {
        const route = closed(value, [
          'routeId',
          'server',
          'routePointer',
          'routeSha256',
          'hosts',
          'probeIds',
        ]);
        return {
          routeId: hash(route['routeId']),
          server: text(route['server'], 128),
          routePointer: text(route['routePointer'], 4096),
          routeSha256: hash(route['routeSha256']),
          hosts: values(route['hosts'], (value) => text(value, 253), 128),
          probeIds: values(route['probeIds'], (value) => text(value, 128), 128, 1),
        };
      },
      128,
      1,
    ),
  };
}
const LOCK_PATHS = [
  '/home/puni1/wbs/state/edge.lock',
  '/home/puni1/wbs-dev/state/poll.lock',
  '/home/puni1/wbs-dev/state/devsync.lock',
  '/home/puni1/wbs/state/deploy.lock',
  '/home/puni1/wbs-dev/state/deploy.lock',
];
function decodeQuiescence(value: unknown): Quiescence {
  const fields = closed(value, [
    'operation',
    'operationId',
    'issuedAt',
    'expiresAt',
    'hostMachineIdSha256',
    'bootId',
    'locks',
    'writerManifest',
    'authorityPins',
    'databases',
    'suspendedCrontabSha256',
    'stoppedUnitSha256',
    'originalSolverCgroup',
    'drainedProcesses',
  ]);
  const locks = values(
    fields['locks'],
    (value) => {
      const lock = closed(value, ['path', 'descriptor', 'device', 'inode']);
      return {
        path: path(lock['path']),
        descriptor: integer(lock['descriptor'], 3),
        device: identity(lock['device']),
        inode: identity(lock['inode']),
      };
    },
    5,
    5,
  );
  if (
    locks.some((lock, index) => lock.path !== LOCK_PATHS[index]) ||
    new Set(locks.map((lock) => lock.descriptor)).size !== 5
  )
    refuse();
  const databases = values(
    fields['databases'],
    (value): AuthorityDatabase => {
      const database = closed(value, ['environment', 'host', 'directoryIdentity', 'fileIdentity']);
      const environment = database['environment'];
      if (environment !== 'prod' && environment !== 'dev') refuse();
      const host = path(database['host']),
        directoryIdentity = text(database['directoryIdentity']),
        fileIdentity = text(database['fileIdentity']);
      if (
        !host.startsWith(
          environment === 'prod' ? '/home/puni1/wbs/data/' : '/home/puni1/wbs-dev/data/',
        ) ||
        !/^\d+:\d+$/.test(directoryIdentity) ||
        !/^\d+:\d+$/.test(fileIdentity)
      )
        refuse();
      return { environment, host, directoryIdentity, fileIdentity };
    },
    2,
    2,
  );
  const prod = databases.at(0),
    dev = databases.at(1);
  if (prod?.environment !== 'prod' || dev?.environment !== 'dev') refuse();
  const group = record(fields['originalSolverCgroup']),
    groupPath = path(group['path']);
  if (!groupPath.startsWith('/user.slice/')) refuse();
  let originalSolverCgroup: CgroupPin;
  if (group['state'] === 'empty') {
    closed(group, ['state', 'path', 'device', 'inode']);
    originalSolverCgroup = {
      state: 'empty',
      path: groupPath,
      device: identity(group['device']),
      inode: identity(group['inode']),
    };
  } else {
    closed(group, ['state', 'path', 'previousDevice', 'previousInode']);
    if (group['state'] !== 'absent') refuse();
    originalSolverCgroup = {
      state: 'absent',
      path: groupPath,
      previousDevice: identity(group['previousDevice']),
      previousInode: identity(group['previousInode']),
    };
  }
  return {
    operation: pin(fields['operation']),
    operationId: text(fields['operationId'], 128),
    issuedAt: text(fields['issuedAt'], 32),
    expiresAt: text(fields['expiresAt'], 32),
    hostMachineIdSha256: hash(fields['hostMachineIdSha256']),
    bootId: text(fields['bootId'], 36),
    locks,
    writerManifest: pin(fields['writerManifest']),
    authorityPins: decodeInstalledAuthorityPins(fields['authorityPins']),
    databases: [prod, dev],
    suspendedCrontabSha256: hash(fields['suspendedCrontabSha256']),
    stoppedUnitSha256: hash(fields['stoppedUnitSha256']),
    originalSolverCgroup,
    drainedProcesses: values(fields['drainedProcesses'], decodeProcess, 65536),
  };
}
function decodeProcess(value: unknown): HostProcessIdentity {
  const fields = closed(value, [
    'pid',
    'startTime',
    'uid',
    'cgroup',
    'executable',
    'argvSha256',
    'cwd',
  ]);
  let executable: HostProcessIdentity['executable'] = null;
  if (fields['executable'] !== null) {
    const binary = closed(fields['executable'], ['device', 'inode', 'sha256']);
    executable = {
      device: identity(binary['device']),
      inode: identity(binary['inode']),
      sha256: hash(binary['sha256']),
    };
  }
  return {
    pid: integer(fields['pid'], 1),
    startTime: identity(fields['startTime']),
    uid: integer(fields['uid']),
    cgroup: path(fields['cgroup']),
    executable,
    argvSha256: hash(fields['argvSha256']),
    cwd: fields['cwd'] === null ? null : path(fields['cwd']),
  };
}

interface ResponseBytes {
  headers: IncomingHttpHeaders;
  status: number;
  body: Buffer;
}
function readResponse(
  address: Address,
  scheme: 'http' | 'https',
  path: string,
  headers: Record<string, string>,
  timeout: number,
): Promise<ResponseBytes> {
  if (!Number.isSafeInteger(timeout) || timeout < 1) refuse('probe-deadline');
  return new Promise((resolveResponse, reject) => {
    const fail = () => {
      reject(new InitRefusal('probe-refused'));
    };
    const client = (scheme === 'https' ? requestHttps : requestHttp)(
      {
        hostname: address.connectAddress,
        port: address.port,
        path,
        method: 'GET',
        servername: address.host,
        // Proof: disabling certificate validation admitted the untrusted certificate in the real TLS fixture.
        rejectUnauthorized: true,
        agent: false,
        headers: {
          Host: address.host,
          'Accept-Encoding': 'identity',
          Connection: 'close',
          ...headers,
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let length = 0;
        response.on('data', (chunk: Buffer) => {
          length += chunk.length;
          if (length > 4 * 1048576) {
            client.destroy();
            fail();
          } else chunks.push(chunk);
        });
        response.on('aborted', fail);
        response.on('error', fail);
        response.on('end', () => {
          if (
            !response.complete ||
            response.statusCode === undefined ||
            response.headers['content-encoding'] !== undefined
          ) {
            fail();
            return;
          }
          resolveResponse({
            headers: response.headers,
            status: response.statusCode,
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    const timer = setTimeout(() => {
      client.destroy();
      fail();
    }, timeout);
    client.on('close', () => {
      clearTimeout(timer);
    });
    client.on('error', fail);
    client.end();
  });
}
/** Checks exact status, redirect and raw body bytes from fixed pinned-address GET IO.
 * Proof: removing the body digest guard admitted changed bytes in the real HTTP fixture.
 * @internal
 */
export async function probeHttp(probe: HttpProbe, timeout: number): Promise<void> {
  const response = await readResponse(probe.address, probe.scheme, probe.path, {}, timeout);
  if (
    response.status !== probe.expectedStatus ||
    (response.headers.location ?? null) !== probe.expectedLocation ||
    (probe.expectedContentType !== null &&
      response.headers['content-type'] !== probe.expectedContentType) ||
    sha(response.body) !== probe.expectedBodySha256
  )
    refuse('probe-refused');
}

/** Production alone constructs the local Engine and native observers; packet input cannot provide effects. */
export async function runProductionInitAdoption(
  packetPath: string,
  mode: InitMode,
): Promise<SafeInitSummary> {
  try {
    const packetBytes = await readPrivateFile(packetPath);
    const packet = decodeInitPacket(parseJson(packetBytes));
    return await runPreparedPacket(packet, sha(packetBytes), mode, packetPath);
  } catch (cause) {
    if (cause instanceof InitObservationRefusal) throw cause;
    // Proof: rethrowing the native cause exposed the synthetic private path and failed the factory redaction negative.
    throw new InitRefusal('preparation-failed');
  }
}

async function runPreparedPacket(
  packet: InitPacket,
  packetSha256: string,
  mode: InitMode,
  packetPath: string,
): Promise<SafeInitSummary> {
  if (
    process.getuid?.() !== 1000 ||
    process.geteuid?.() !== 1000 ||
    !['prepare', 'execute', 'inspect-recovery'].includes(mode)
  )
    refuse('operator-invalid');
  const engine = await createLocalEngine(
    packet.targets.map((target) => target.id),
    packet.nonce,
  );
  if (mode === 'inspect-recovery') return inspectRecovery(packet, packetSha256, engine);
  const deadline = new Deadline(120000);
  await requireUnusedReceipts(packet.receiptDirectory);
  const pins = [
    packet.source,
    packet.bundle,
    packet.bun,
    packet.init,
    packet.daemon,
    ...packet.provenance,
    packet.quiescence.operation,
    packet.quiescence.writerManifest,
    ...packet.caddy.files,
  ];
  return withAuthorityFiles(
    pins.map((entry) => entry.path),
    async (files, recheck) => {
      await compareFiles(pins, files);
      const manifest = decodeWriterManifest(
        parseJson(await readPrivateOrPinned(packet.quiescence.writerManifest)),
      );
      if (
        manifest.sourceSha !== packet.sourceSha ||
        manifest.buildSha !== packet.sourceSha ||
        packet.quiescence.writerManifest.sha256 !==
          packet.quiescence.authorityPins.writerManifestSha256
      )
        refuse('writer-manifest-differs');
      const fixed: Partial<Record<WriterMemberName, string>> = {
        'prod-swap': '/home/puni1/wbs/bin/swap.js',
        'prod-smoke': '/home/puni1/wbs/bin/smoke.js',
        'dev-swap': '/home/puni1/wbs-dev/bin/swap.js',
        'dev-smoke': '/home/puni1/wbs-dev/bin/smoke.js',
        'dev-poller': '/home/puni1/wbs-dev/bin/poll.sh',
        'dev-loader': '/home/puni1/wbs-dev/bin/dev-poll-sync.sh',
        'dev-interpreter': '/home/puni1/wbs-dev/bin/bun',
      };
      for (const member of manifest.members) {
        if (
          (fixed[member.member] !== undefined && fixed[member.member] !== member.hostPath) ||
          resolve(member.hostPath) !== member.hostPath ||
          ['/proc', '/sys', '/dev', '/home/puni1/wbs/state', '/home/puni1/wbs-dev/state'].some(
            (root) => member.hostPath === root || member.hostPath.startsWith(root + '/'),
          )
        )
          refuse('writer-location-invalid');
      }
      return withAuthorityFiles(
        manifest.members.map((member) => member.hostPath),
        async (writerFiles, recheckWriters) => {
          writerFiles.forEach((file, index) => {
            if (file.sha256 !== manifest.members[index]?.sha256) refuse('writer-bytes-differ');
          });
          const originals = await Promise.all(
            packet.targets.map((target) => engine.inspect(target.id, deadline.allocate(10000))),
          );
          const registry = originals.at(0),
            caddy = originals.at(1);
          if (
            registry === undefined ||
            caddy === undefined ||
            registry.name !== '/wbs-registry-1' ||
            caddy.name !== '/wbs-caddy-1'
          )
            refuse('target-roster-differs');
          const selection = {
            nonce: packet.nonce,
            targets: [
              { kind: 'registry' as const, original: registry },
              { kind: 'caddy' as const, original: caddy },
            ] as const,
          };
          const observer = new ProductionObserver(
            packet,
            engine,
            async () => {
              if (sha(await readPrivateFile(packetPath)) !== packetSha256)
                refuse('packet-bytes-differ');
              await recheck();
              await recheckWriters();
            },
            selection.targets,
          );
          await observer.admit(deadline);
          for (const target of selection.targets) {
            await observer.original(target, target.original, deadline);
            await observer.health(target.kind, target.original.id, deadline);
          }
          if (mode === 'prepare')
            return {
              attempt: packet.nonce,
              stage: 'prepared',
              packetSha256,
              receiptDirectory: packet.receiptDirectory,
              receiptSha256: null,
            };
          await requireUnusedReceipts(packet.receiptDirectory);
          const receipts = await PrivateReceipts.create(packet.receiptDirectory, packet.nonce);
          let receiptSha256: string | null = null;
          try {
            await runInitAdoption(selection, engine, observer, {
              publish: async (receipt) => {
                receiptSha256 = await publishInitReceipt(
                  receipts,
                  receipt,
                  observer.sourceProof(receipt.target),
                );
                return receiptSha256;
              },
            });
          } catch {
            throw new InitObservationRefusal({
              attempt: packet.nonce,
              stage: 'operation-refused',
              packetSha256,
              receiptDirectory: packet.receiptDirectory,
              receiptSha256,
            });
          }
          return {
            attempt: packet.nonce,
            stage: 'complete',
            packetSha256,
            receiptDirectory: packet.receiptDirectory,
            receiptSha256,
          };
        },
      );
    },
  );
}

async function requireUnusedReceipts(directory: string): Promise<void> {
  if ((await realpath(dirname(directory))) !== dirname(directory)) refuse('receipt-parent-invalid');
  const parent = await lstat(dirname(directory));
  if (!parent.isDirectory() || parent.uid !== 1000 || (parent.mode & 0o077) !== 0)
    refuse('receipt-parent-invalid');
  await readdir(dirname(directory));
  try {
    await lstat(directory);
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return;
    throw cause;
  }
  refuse('receipt-collision');
}
async function compareFiles(pins: readonly Pin[], files: readonly AuthorityFile[]): Promise<void> {
  if (pins.length !== files.length) refuse('file-roster-differs');
  for (let index = 0; index < pins.length; index++) {
    const expected = pins.at(index),
      observed = files.at(index);
    if (
      expected === undefined ||
      observed === undefined ||
      fingerprint({ ...observed, uid: expected.uid }) !== fingerprint(expected) ||
      (await lstat(expected.path)).uid !== expected.uid
    )
      refuse('file-pin-differs');
  }
}
async function readPrivateOrPinned(expected: Pin): Promise<string> {
  const bytes = await readWriterBytes(expected.path);
  if (sha(bytes) !== expected.sha256) refuse('file-pin-differs');
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/** @internal */
export const INIT_NATIVE_READER = String.raw`
def validate_request(request):
    require(type(request)==dict and set(request)=={'nonce','coordinator','pids','storage','cgroups','drained','daemon'},'init observation request malformed')
    require(type(request['daemon'])==bool,'init daemon observation malformed')
    require(type(request['nonce'])==str and re.fullmatch('[a-f0-9]{64}',request['nonce']),'init nonce malformed')
    require(type(request['coordinator'])==dict and set(request['coordinator'])=={'pid','startTime','cgroup'},'init coordinator malformed')
    require(type(request['pids'])==list and len(request['pids'])<=4 and all(type(pid)==int and pid>0 for pid in request['pids']),'init PID roster malformed')
    require(type(request['drained'])==list and len(request['drained'])<=65536,'init drained roster malformed')
    require(type(request['storage'])==list and len(request['storage'])<=64,'init storage roster malformed')
    for path in request['storage']:
        require(type(path)==str and os.path.normpath(path)==path and any(path.startswith(root) for root in ['/home/puni1/wbs/','/var/lib/docker/volumes/']),'init storage path malformed')
    require(type(request['cgroups'])==list and len(request['cgroups'])<=4,'init cgroup roster malformed')
    for path in request['cgroups']:
        require(type(path)==str and path.startswith('/') and os.path.normpath(path)==path and path!='/' and '\x00' not in path,'init cgroup path malformed')

def init_proc(host,pid):
    base='/proc/'+str(pid)
    try: before=host.read(base+'/stat',65536)
    except FileNotFoundError:return None
    ticks=parse_stat(before)[0];group=parse_cgroup(host.read(base+'/cgroup',65536))
    status=host.read(base+'/status',65536).decode();cmdline=host.read(base+'/cmdline',65536).decode()
    namespaces={name:{'link':host.link(base+'/ns/'+name),'device':str(host.metadata(base+'/ns/'+name).st_dev),'inode':str(host.metadata(base+'/ns/'+name).st_ino)} for name in ['net','pid']}
    executable=host.metadata(base+'/exe');descriptor=os.open(base+'/exe',os.O_RDONLY|os.O_NONBLOCK)
    try:
        require(metadata_key(executable)==metadata_key(os.fstat(descriptor)),'init executable changed')
        digestor=hashlib.sha256();count=0
        while True:
            host.check();chunk=os.read(descriptor,65536)
            if not chunk:break
            count+=len(chunk);require(count<=128*1024*1024,'init executable oversized');digestor.update(chunk)
        require(metadata_key(executable)==metadata_key(os.fstat(descriptor))==metadata_key(host.metadata(base+'/exe')),'init executable changed')
    finally:os.close(descriptor)
    group_metadata=host.metadata('/sys/fs/cgroup'+group,False)
    observed={'pid':pid,'startTime':ticks,'cgroup':group,'cgroupDevice':str(group_metadata.st_dev),'cgroupInode':str(group_metadata.st_ino),'status':status,'cmdline':cmdline,'namespaces':namespaces,'executableSha256':digestor.hexdigest(),'route':host.read(base+'/net/route',1048576).decode(),'ipv6Route':host.read(base+'/net/ipv6_route',1048576).decode(),'tcp':host.read(base+'/net/tcp',1048576).decode(),'tcp6':host.read(base+'/net/tcp6',1048576).decode()}
    # Proof: omitting start-tick comparison admitted injected PID reuse in the actual native-reader process fixture.
    require(parse_stat(host.read(base+'/stat',65536))[0]==ticks and parse_cgroup(host.read(base+'/cgroup',65536))==group,'init process changed')
    require(all(host.link(base+'/ns/'+name)==native['link'] and str(host.metadata(base+'/ns/'+name).st_dev)==native['device'] and str(host.metadata(base+'/ns/'+name).st_ino)==native['inode'] for name,native in namespaces.items()),'init namespace changed')
    return observed

def init_storage(host,path):
    require(host.resolve(path)==path,'init storage is not canonical')
    before=host.metadata(path,False);parents=[];parent=os.path.dirname(path)
    while True:
        native=host.metadata(parent,False);require(stat.S_ISDIR(native.st_mode),'init storage parent differs')
        parents.append({'path':parent,'device':str(native.st_dev),'inode':str(native.st_ino),'mode':stat.S_IMODE(native.st_mode)})
        if parent=='/':break
        parent=os.path.dirname(parent)
    require(stat.S_ISDIR(before.st_mode) or stat.S_ISREG(before.st_mode),'init storage type differs')
    if stat.S_ISDIR(before.st_mode):require(len(host.listing(path,1000000))>0,'init storage empty')
    else:
        with open(path,'rb',buffering=0) as stream:require(len(stream.read(1))==1,'init storage empty or unreadable')
    after=host.metadata(path,False)
    require((before.st_dev,before.st_ino,before.st_mode)==(after.st_dev,after.st_ino,after.st_mode),'init storage changed')
    return {'path':path,'type':'directory' if stat.S_ISDIR(before.st_mode) else 'file','device':str(before.st_dev),'inode':str(before.st_ino),'mode':stat.S_IMODE(before.st_mode),'uid':before.st_uid,'parentsSha256':digest(encode(parents))}

def init_cgroup(host,path):
    named='/sys/fs/cgroup'+path
    try:before=host.metadata(named,False)
    except FileNotFoundError:return {'state':'absent','path':path}
    require(host.resolve(named)==named and stat.S_ISDIR(before.st_mode),'init cgroup is not canonical')
    pending=[named]
    while pending:
        directory=pending.pop();require(host.read(directory+'/cgroup.procs',1048576).strip()==b'','init cgroup process remains')
        require(re.search(rb'^populated 0$',host.read(directory+'/cgroup.events',65536),re.M),'init cgroup populated')
        for entry in host.listing(directory,4096):
            child=directory+'/'+entry
            if stat.S_ISDIR(host.metadata(child,False).st_mode):pending.append(child)
    after=host.metadata(named,False);require((before.st_dev,before.st_ino)==(after.st_dev,after.st_ino),'init cgroup changed')
    return {'state':'empty','path':path,'device':str(before.st_dev),'inode':str(before.st_ino)}

def read_init(request,host):
    require(os.geteuid()==0,'init observation requires root')
    drained=[]
    for previous in request['drained']:
        require(type(previous)==dict and set(previous)=={'pid','startTime'} and type(previous['pid'])==int and previous['pid']>0 and type(previous['startTime'])==str,'init drained identity malformed')
        try:current=parse_stat(host.read('/proc/'+str(previous['pid'])+'/stat',65536))[0]
        except FileNotFoundError:current=None
        require(current!=previous['startTime'],'init drained process remains');drained.append(previous)
    daemon=None
    if request['daemon']:
        contents,_=host.regular('/run/docker.pid',32)
        require(re.fullmatch(rb'[1-9][0-9]*\n?',contents),'init daemon PID malformed')
        daemon=init_proc(host,int(contents))
        require(daemon is not None,'init daemon process unavailable')
    return {'pids':[init_proc(host,pid) for pid in request['pids']],'storage':[init_storage(host,path) for path in request['storage']],'cgroups':[init_cgroup(host,path) for path in request['cgroups']],'drained':drained,'hostNetNamespace':host.link('/proc/1/ns/net'),'hostPidNamespace':host.link('/proc/1/ns/pid'),'daemon':daemon}
`;

interface KernelObservation {
  daemon: unknown;
  pids: unknown[];
  storage: unknown[];
  cgroups: unknown[];
  drained: unknown[];
  hostNetNamespace: string;
  hostPidNamespace: string;
}
async function readNative(
  pids: number[],
  storage: string[],
  cgroups: string[],
  drained: readonly HostProcessIdentity[],
  deadline: Deadline,
  daemon = false,
): Promise<KernelObservation> {
  const coordinator = await observeSolverProcess(process.pid);
  const nonce = randomBytes(32).toString('hex');
  const program =
    AUTHORITY_COLLECTOR +
    '\n' +
    AUTHORITY_SUPERVISOR +
    '\n' +
    INIT_NATIVE_READER +
    '\nsupervisor_entry(read_init)\n';
  if (Buffer.byteLength(program) > 96 * 1024) refuse('native-reader-oversized');
  const expiry = performance.now() + deadline.allocate(10000);
  const child = spawn('/usr/bin/sudo', ['-n', '/usr/bin/python3', '-I', '-c', program], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const contents = await joinAuthoritySupervisor(
    child,
    {
      nonce,
      coordinator,
      pids,
      daemon,
      storage,
      cgroups,
      drained: drained.map((previous) => ({ pid: previous.pid, startTime: previous.startTime })),
    },
    nonce,
    expiry,
  );
  const observed = closed(parseJson(contents), [
    'pids',
    'storage',
    'cgroups',
    'drained',
    'hostNetNamespace',
    'hostPidNamespace',
    'daemon',
  ]);
  const observedPids = values(observed['pids'], (entry) => entry, 4),
    observedStorage = values(observed['storage'], (entry) => entry, 64),
    observedGroups = values(observed['cgroups'], (entry) => entry, 4),
    observedDrained = values(observed['drained'], (entry) => entry, 65536);
  if (
    observedPids.length !== pids.length ||
    observedStorage.length !== storage.length ||
    observedGroups.length !== cgroups.length ||
    observedDrained.length !== drained.length
  )
    refuse('native-roster-differs');
  return {
    daemon: observed['daemon'],
    pids: observedPids,
    storage: observedStorage,
    cgroups: observedGroups,
    drained: observedDrained,
    hostNetNamespace: text(observed['hostNetNamespace']),
    hostPidNamespace: text(observed['hostPidNamespace']),
  };
}

class ProductionObserver implements HostObserver {
  private readonly expires: number;
  private readonly processes = new Map<
    string,
    {
      pid: number;
      startTime: string;
      cgroup: string;
      cgroupDevice: string;
      cgroupInode: string;
      namespacesSha256: string;
    }
  >();
  private readonly active = new Map<TargetKind, string>();
  private readonly allocatedAddresses = new Set<string>();
  private readonly sourceProofs = new Map<TargetKind, ComposeProof>();
  constructor(
    private readonly packet: InitPacket,
    private readonly engine: EngineTransport,
    private readonly recheck: () => Promise<void>,
    private readonly originals: readonly SelectedTarget[],
  ) {
    this.expires = operationExpiry(
      packet.quiescence.issuedAt,
      packet.quiescence.expiresAt,
      Date.now(),
      performance.now(),
    );
    for (const target of packet.targets) this.active.set(target.kind, target.id);
  }
  async admit(deadline: Deadline): Promise<void> {
    if (this.expires - performance.now() < deadline.remaining() || deadline.remaining() < 40000)
      refuse('operation-expired');
    const edge = await requireInheritedEdgeLock();
    if (
      edge.stateDirectory !== '/home/puni1/wbs/state' ||
      edge.descriptor !== this.packet.quiescence.locks[0]?.descriptor
    )
      refuse('edge-lock-differs');
    await checkInheritedInitLocks(this.packet.quiescence.locks);
    await this.recheck();
    const source = (await readPrivateOrPinned(this.packet.source)).trim();
    if (source !== this.packet.sourceSha) refuse('source-build-differs');
    const proofs = await observeComposeDeclarations(
      this.originals.map((selected) => ({
        ...selected,
        nativeSha256: this.expected(selected.kind).nativeSha256,
        roster: this.expected(selected.kind).composeFiles,
      })),
      this.packet.provenance,
    );
    for (const proof of proofs) this.sourceProofs.set(proof.target, proof);
    if (
      sha(await readFile('/etc/machine-id')) !== this.packet.machineIdSha256 ||
      (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim() !== this.packet.bootId
    )
      refuse('host-identity-differs');
    const operation = closed(
      parseJson(await readPrivateOrPinned(this.packet.quiescence.operation)),
      [
        'operationId',
        'sourceSha',
        'buildSha',
        'packetRosterSha256',
        'issuedAt',
        'expiresAt',
        'scheduleSha256',
        'drainSha256',
        'registryWriterHoldSha256',
        'filesystemTopologyHoldSha256',
      ],
    );
    if (
      operation['operationId'] !== this.packet.quiescence.operationId ||
      operation['sourceSha'] !== this.packet.sourceSha ||
      operation['buildSha'] !== this.packet.sourceSha ||
      operation['issuedAt'] !== this.packet.quiescence.issuedAt ||
      operation['expiresAt'] !== this.packet.quiescence.expiresAt ||
      operation['packetRosterSha256'] !== fingerprintPacketRoster(this.packet)
    )
      refuse('operation-binding-differs');
    for (const key of [
      'scheduleSha256',
      'drainSha256',
      'registryWriterHoldSha256',
      'filesystemTopologyHoldSha256',
    ])
      hash(operation[key]);
    checkStoppedUnit(
      await solverHostPorts().runHost(
        { kind: 'show' },
        AbortSignal.timeout(deadline.allocate(10000)),
      ),
      this.packet.quiescence.stoppedUnitSha256,
    );
    const kernel = await readNative(
      [],
      [],
      [this.packet.quiescence.originalSolverCgroup.path],
      this.packet.quiescence.drainedProcesses,
      deadline,
      true,
    );
    const daemon = record(kernel.daemon);
    if (
      daemon['pid'] !== this.packet.daemonPid ||
      daemon['startTime'] !== this.packet.daemonStartTime ||
      daemon['executableSha256'] !== this.packet.daemon.sha256
    )
      refuse('daemon-process-differs');
    const expectedGroup = this.packet.quiescence.originalSolverCgroup;
    const expected =
      expectedGroup.state === 'empty'
        ? expectedGroup
        : { state: 'absent', path: expectedGroup.path };
    if (fingerprint(kernel.cgroups[0]) !== fingerprint(expected)) refuse('solver-cgroup-differs');
    const crontab = await readCrontab(deadline.allocate(10000));
    if (sha(crontab) !== this.packet.quiescence.suspendedCrontabSha256) refuse('crontab-differs');
    const version = record(await this.engine.version(deadline.allocate(10000)));
    const info = daemonIdentity(await this.engine.info(deadline.allocate(10000)));
    if (
      version['ApiVersion'] !== '1.52' ||
      version['Os'] !== 'linux' ||
      !['docker-init', this.packet.init.path].includes(text(info['InitBinary'])) ||
      fingerprint(version) !== this.packet.daemonVersionSha256 ||
      fingerprint(info) !== this.packet.daemonInfoSha256
    )
      refuse('daemon-differs');
    const registry = this.packet.targets[0];
    if (this.active.get('registry') === registry.id && this.processes.has(registry.id)) {
      const observed = await this.engine.inspect(registry.id, deadline.allocate(10000));
      if (observed.state['Running'] === true) {
        const kernel = await readNative([integer(observed.state['Pid'], 1)], [], [], [], deadline);
        checkConnections(record(kernel.pids[0]), registry.listenerPorts);
      }
    }
    await this.recheck();
  }
  sourceProof(kind: TargetKind): ComposeProof {
    const proof = this.sourceProofs.get(kind);
    if (proof === undefined) refuse('compose-proof-unavailable');
    return proof;
  }
  private expected(kind: TargetKind): TargetPin {
    return this.packet.targets[kind === 'registry' ? 0 : 1];
  }
  private async collect(deadline: Deadline): Promise<void> {
    const manifest = decodeWriterManifest(
      parseJson(await readPrivateOrPinned(this.packet.quiescence.writerManifest)),
    );
    const coordinator = await observeSolverProcess(process.pid);
    const executable = await captureSolverFile(process.execPath, 128 * 1024 * 1024);
    const identity: HostProcessIdentity = {
      ...coordinator,
      uid: 1000,
      executable: { device: executable.device, inode: executable.inode, sha256: executable.sha256 },
      argvSha256: sha(await readFile('/proc/self/cmdline')),
      cwd: await readlink('/proc/self/cwd'),
    };
    const nonce = randomBytes(32).toString('hex');
    const budget = Math.min(120000, Math.floor(deadline.remaining() - 30000));
    if (budget < 1000) refuse('collector-budget-exhausted');
    const observed = decodeAuthorityCollection(
      await collectAuthorityHost(
        {
          nonce,
          writerManifestSha256: this.packet.quiescence.authorityPins.writerManifestSha256,
          coordinator,
          databases: this.packet.quiescence.databases,
          layouts: ['prod', 'dev'],
          writerPaths: WRITER_MEMBERS.map((name) => {
            const member = manifest.members.find((member) => member.member === name);
            if (member === undefined) return refuse('writer-member-missing');
            return { member: name, path: member.hostPath };
          }),
          solver: null,
        },
        performance.now() + budget,
      ),
      nonce,
      this.packet.quiescence.authorityPins,
    );
    if (observed.bootId !== this.packet.bootId) refuse('collector-boot-differs');
    const internal = new Map(observed.internalProcesses.map((entry) => [entry.pid, entry]));
    for (const entry of observed.relevantProcesses)
      if (
        fingerprint(entry) !== fingerprint(identity) &&
        fingerprint(entry) !== fingerprint(internal.get(entry.pid) ?? null)
      )
        refuse('unowned-launcher-present');
    await this.admit(deadline);
  }
  async original(
    target: SelectedTarget,
    observed: NativeContainer,
    deadline: Deadline,
  ): Promise<void> {
    const expected = this.expected(target.kind);
    if (
      observed.id !== expected.id ||
      observed.image !== expected.image ||
      fingerprint(observed) !== expected.nativeSha256 ||
      sha(encodeOrderedEnv(values(observed.config['Env'], (entry) => textKernel(entry), 1024))) !==
        expected.envSha256 ||
      fingerprint(await this.engine.image(expected.image, deadline.allocate(10000))) !==
        expected.imageSha256
    )
      refuse('original-pin-differs');
    for (const endpoint of Object.values(observed.networks))
      for (const field of ['IPAddress', 'GlobalIPv6Address']) {
        const allocated = record(endpoint)[field];
        if (typeof allocated === 'string' && allocated !== '')
          this.allocatedAddresses.add(allocated);
      }
    await this.admit(deadline);
    await this.resources(expected, observed, deadline);
    await this.process(expected, observed, false, deadline);
    await this.backends(deadline);
    await this.caddy(deadline);
    await this.collect(deadline);
  }
  async inert(
    target: SelectedTarget,
    observed: NativeContainer,
    deadline: Deadline,
  ): Promise<void> {
    await this.resources(this.expected(target.kind), observed, deadline);
    const inventory = await this.inventory(deadline);
    const aliases = Object.entries(target.original.networks).flatMap(([name, value]) => {
      const network = record(value);
      return values(network['Aliases'], (entry) => text(entry), 128).map((alias) => ({
        name,
        alias,
      }));
    });
    for (const entry of inventory) {
      if (
        entry.id === target.original.id ||
        entry.id === observed.id ||
        entry.state['Running'] !== true
      )
        continue;
      for (const { name, alias } of aliases) {
        const endpoint = entry.networks[name];
        if (
          Object.hasOwn(entry.networks, name) &&
          values(record(endpoint)['Aliases'], (entry) => text(entry), 128).includes(alias)
        )
          refuse('duplicate-live-alias');
      }
    }
    await this.collect(deadline);
  }
  async stopped(
    target: SelectedTarget,
    observed: NativeContainer,
    deadline: Deadline,
  ): Promise<void> {
    if (
      observed.state['Pid'] !== 0 ||
      observed.sandboxId !== '' ||
      observed.sandboxKey !== '' ||
      Object.values(record(observed.ports)).some((bindings) => bindings !== null)
    )
      refuse('stopped-resource-not-released');
    for (const endpoint of Object.values(observed.networks))
      if (
        record(endpoint)['EndpointID'] !== '' ||
        record(endpoint)['IPAddress'] !== '' ||
        record(endpoint)['GlobalIPv6Address'] !== ''
      )
        refuse('stopped-endpoint-not-released');
    const originalProcess = this.processes.get(target.original.id);
    if (originalProcess === undefined) refuse('original-process-not-bound');
    const kernel = await readNative(
      [originalProcess.pid],
      [],
      [originalProcess.cgroup],
      [],
      deadline,
    );
    const current = kernel.pids[0];
    if (current !== null && record(current)['startTime'] === originalProcess.startTime)
      refuse('original-process-still-present');
    const group = record(kernel.cgroups[0]);
    if (group['state'] !== 'absent' && group['state'] !== 'empty')
      refuse('original-cgroup-not-empty');
    if (
      group['state'] === 'empty' &&
      (group['device'] !== originalProcess.cgroupDevice ||
        group['inode'] !== originalProcess.cgroupInode)
    )
      refuse('original-cgroup-identity-differs');
    for (const network of this.expected(target.kind).networks) {
      const native = record(await this.engine.network(network.id, deadline.allocate(10000)));
      if (Object.hasOwn(record(native['Containers']), target.original.id))
        refuse('original-network-still-present');
    }
  }
  async running(
    target: SelectedTarget,
    observed: NativeContainer,
    deadline: Deadline,
  ): Promise<void> {
    await this.resources(this.expected(target.kind), observed, deadline);
    await this.process(this.expected(target.kind), observed, true, deadline);
    this.active.set(target.kind, observed.id);
    await this.backends(deadline);
  }
  async health(kind: TargetKind, id: string, deadline: Deadline): Promise<void> {
    if (kind === 'caddy') {
      await this.caddy(deadline, id);
      for (const probe of this.packet.public.probes) {
        if (probe.kind === 'http') await probeHttp(probe, deadline.allocate(10000));
        else await probeWebSocket(probe, deadline.allocate(10000));
      }
    } else await probeRegistry(this.packet.registry, deadline);
    await this.backends(deadline);
    if (kind === 'registry' && id === this.expected(kind).id) {
      const process = this.processes.get(id);
      if (process === undefined) refuse('registry-process-not-bound');
      const kernel = await readNative([process.pid], [], [], [], deadline);
      checkConnections(record(kernel.pids[0]), this.expected(kind).listenerPorts);
    }
  }
  async combined(deadline: Deadline): Promise<void> {
    await this.collect(deadline);
    for (const kind of ['registry', 'caddy'] as const) {
      const id = this.active.get(kind);
      if (id === undefined) refuse('active-target-missing');
      const observed = await this.engine.inspect(id, deadline.allocate(10000));
      await this.process(this.expected(kind), observed, true, deadline);
      await this.health(kind, id, deadline);
    }
  }
  async absent(id: string, deadline: Deadline): Promise<void> {
    if (!(await this.engine.inspectAbsent(id, deadline.allocate(10000))))
      refuse('retained-original-present');
    const expected = this.packet.targets.find((entry) => entry.id === id);
    if (expected === undefined) refuse('unselected-absence');
    const active = this.active.get(expected.kind);
    if (active === undefined) refuse('active-target-missing');
    const replacement = await this.engine.inspect(active, deadline.allocate(10000));
    for (const entry of await this.inventory(deadline))
      if (
        entry.id !== active &&
        fingerprint(entry.config['Labels']) === fingerprint(replacement.config['Labels'])
      )
        refuse('duplicate-provenance-present');
  }
  private async inventory(deadline: Deadline): Promise<NativeContainer[]> {
    const entries = values(
      await this.engine.inventory(deadline.allocate(10000)),
      (value) => record(value),
      4096,
    );
    return Promise.all(
      entries.map((entry) =>
        this.engine.inspectListed(hash(entry['Id']), deadline.allocate(10000)),
      ),
    );
  }
  private async backends(deadline: Deadline): Promise<void> {
    const inventory = await this.inventory(deadline);
    for (const expected of this.packet.backends) {
      const observed = inventory.find((entry) => entry.id === expected.id);
      if (
        observed?.image !== expected.image ||
        fingerprint(observed) !== expected.nativeSha256 ||
        observed.state['Running'] !== true
      )
        refuse('backend-identity-differs');
    }
    for (const entry of inventory) {
      if (
        this.packet.targets.some((target) => target.id === entry.id) ||
        [...this.active.values()].includes(entry.id)
      )
        continue;
      const native = JSON.stringify({ config: entry.config, host: entry.host });
      for (const allocated of this.allocatedAddresses)
        if (native.includes(allocated)) refuse('static-address-consumer');
    }
  }
  private async resources(
    expected: TargetPin,
    observed: NativeContainer,
    deadline: Deadline,
  ): Promise<void> {
    const mounts = values(observed.mounts, (entry) => record(entry), 32);
    if (mounts.length !== expected.resources.length) refuse('mount-roster-differs');
    for (const resource of expected.resources) {
      const mount = mounts.find(
        (entry) => entry['Source'] === resource.path && entry['Type'] === resource.kind,
      );
      if (mount === undefined || (resource.kind === 'volume' && mount['Name'] !== resource.name))
        refuse('mount-pin-differs');
      if (resource.kind === 'volume') {
        if (resource.name === null || resource.volumeSha256 === null) refuse('volume-pin-missing');
        const volume = await this.engine.volume(resource.name, deadline.allocate(10000));
        if (
          fingerprint(volume) !== resource.volumeSha256 ||
          record(volume)['Mountpoint'] !== resource.path
        )
          refuse('volume-pin-differs');
      }
    }
    const native = await readNative(
      [],
      expected.resources.map((entry) => entry.path),
      [],
      [],
      deadline,
    );
    for (let index = 0; index < expected.resources.length; index++) {
      const resource = expected.resources.at(index);
      if (resource === undefined) refuse('resource-pin-missing');
      const { kind: _kind, name: _name, volumeSha256: _volume, ...pin } = resource;
      if (fingerprint(native.storage[index]) !== fingerprint(pin)) refuse('storage-pin-differs');
    }
    if (Object.keys(observed.networks).length !== expected.networks.length)
      refuse('network-roster-differs');
    for (const network of expected.networks) {
      const endpoint = observed.networks[network.name];
      if (
        !Object.hasOwn(observed.networks, network.name) ||
        record(endpoint)['NetworkID'] !== network.id
      )
        refuse('network-identity-differs');
      const { Containers: _containers, ...configuration } = record(
        await this.engine.network(network.id, deadline.allocate(10000)),
      );
      if (fingerprint(configuration) !== network.sha256) refuse('network-pin-differs');
    }
    const mode = observed.host['NetworkMode'];
    if (
      typeof mode !== 'string' ||
      !expected.networks.some((network) => mode === network.name || mode === network.id)
    )
      refuse('network-mode-differs');
  }
  private async process(
    expected: TargetPin,
    observed: NativeContainer,
    initialized: boolean,
    deadline: Deadline,
  ): Promise<void> {
    const pid = integer(observed.state['Pid'], 1);
    const kernel = await readNative([pid], [], [], [], deadline);
    const native = record(kernel.pids[0]);
    const startTime = identity(native['startTime']),
      cgroup = path(native['cgroup']);
    if (native['pid'] !== pid || !cgroup.includes(observed.id)) refuse('container-process-differs');
    const namespaces = record(native['namespaces']),
      net = record(namespaces['net']),
      pidNamespace = record(namespaces['pid']);
    if (net['link'] === kernel.hostNetNamespace || pidNamespace['link'] === kernel.hostPidNamespace)
      refuse('container-namespace-not-private');
    const previous = this.processes.get(observed.id);
    if (
      previous !== undefined &&
      (previous.pid !== pid ||
        previous.startTime !== startTime ||
        previous.cgroup !== cgroup ||
        previous.namespacesSha256 !== fingerprint(namespaces))
    )
      refuse('process-identity-drift');
    if (initialized) {
      checkInitProcess(native, this.packet.init.sha256);
    } else if (
      startTime !== expected.process.startTime ||
      cgroup !== expected.process.cgroup ||
      native['executableSha256'] !== expected.process.executableSha256 ||
      net['link'] !== expected.process.netNamespace ||
      pidNamespace['link'] !== expected.process.pidNamespace
    )
      refuse('original-process-differs');
    if (resolveDefaultRoute(native, observed) !== expected.defaultRouteNetwork)
      refuse('default-route-differs');
    const after = await this.engine.inspect(observed.id, deadline.allocate(10000));
    if (
      after.state['Pid'] !== pid ||
      after.state['Running'] !== true ||
      after.state['StartedAt'] !== observed.state['StartedAt'] ||
      after.restartCount !== 0
    )
      refuse('process-engine-drift');
    this.processes.set(observed.id, {
      pid,
      startTime,
      cgroup,
      cgroupDevice: identity(native['cgroupDevice']),
      cgroupInode: identity(native['cgroupInode']),
      namespacesSha256: fingerprint(namespaces),
    });
  }
  private async caddy(deadline: Deadline, id = this.active.get('caddy')): Promise<void> {
    if (id === undefined) refuse('caddy-id-missing');
    const observed = await this.engine.inspect(id, deadline.allocate(10000));
    const command = [
      ...(observed.config['Entrypoint'] === null
        ? []
        : values(observed.config['Entrypoint'], (entry) => text(entry), 16)),
      ...(observed.config['Cmd'] === null
        ? []
        : values(observed.config['Cmd'], (entry) => text(entry), 16)),
    ];
    if (
      fingerprint(command) !==
      fingerprint(['caddy', 'run', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'])
    )
      refuse('caddy-startup-differs');
    const mounts = values(observed.mounts, (entry) => record(entry), 32);
    if (
      mounts.filter(
        (entry) =>
          entry['Destination'] === '/etc/caddy' &&
          entry['Source'] === '/home/puni1/wbs/caddy' &&
          entry['Type'] === 'bind' &&
          entry['RW'] === false,
      ).length !== 1 ||
      mounts.some(
        (entry) =>
          typeof entry['Destination'] === 'string' &&
          entry['Destination'].startsWith('/etc/caddy/'),
      )
    )
      refuse('caddy-bind-differs');
    await checkGraph(this.packet.caddy);
    for (const file of this.packet.caddy.files) {
      const bytes = await readPrivateOrPinned(file);
      for (const allocated of this.allocatedAddresses)
        if (bytes.includes(allocated)) refuse('static-address-consumer');
    }
    const adapted = record(
      parseJson(await this.engine.execCaddy(id, 'adapt', deadline.allocate(10000))),
    );
    const live = record(
      parseJson(await this.engine.execCaddy(id, 'live', deadline.allocate(10000))),
    );
    if (
      fingerprint(adapted) !== fingerprint(live) ||
      fingerprint(live) !== this.packet.caddy.configurationSha256
    )
      refuse('caddy-configuration-differs');
    checkRouteCoverage(live, this.packet.caddy.routeInventory, this.packet.public);
    await checkGraph(this.packet.caddy);
  }
}

function textKernel(value: unknown): string {
  if (typeof value !== 'string' || Buffer.byteLength(value) > 1048576)
    refuse('kernel-record-invalid');
  return value;
}

/** Freezes checked wall-clock validity into one monotonic expiry; later clock changes cannot extend it.
 * @internal
 */
export function operationExpiry(
  issuedAt: string,
  expiresAt: string,
  wallNow: number,
  monotonicNow: number,
): number {
  const issued = Date.parse(issuedAt),
    expiry = Date.parse(expiresAt);
  // Proof: omitting expiry admission accepted the expired operation in operation validity.
  if (
    !Number.isFinite(issued) ||
    !Number.isFinite(expiry) ||
    issued > wallNow ||
    expiry <= wallNow ||
    expiry - issued > 1800000
  )
    refuse('operation-expired');
  return monotonicNow + expiry - wallNow;
}

/** Requires a complete stopped native unit projection before the legacy supervisor interval is admitted.
 * @internal
 */
export function checkStoppedUnit(stdout: string, expectedSha256: string): void {
  const projection = readSolverUnitProjection(stdout);
  // Proof: omitting stopped-state admission accepted a queued job with its independently matching projection hash.
  if (
    !isStoppedSolverUnit(projection) ||
    fingerprint(Object.fromEntries(projection)) !== expectedSha256
  )
    refuse('solver-not-drained');
}

/** Binds every invocation pin while excluding the operation file's self-referential byte hash.
 * @internal
 */
export function fingerprintPacketRoster(packet: InitPacket): string {
  const { operation: _operation, ...quiescence } = packet.quiescence;
  // Proof: omitting nonce from this projection admitted another attempt in operation roster admission.
  return fingerprint({ ...packet, quiescence });
}

/** Requires each supplied descriptor to name the pinned inode and share its existing kernel lock.
 * @internal
 */
export async function checkInheritedInitLocks(locks: readonly LockPin[]): Promise<void> {
  for (const expected of locks) {
    if ((await realpath(expected.path)) !== expected.path) refuse('lock-path-differs');
    const native = await lstat(expected.path, { bigint: true });
    if (
      !native.isFile() ||
      String(native.dev) !== expected.device ||
      String(native.ino) !== expected.inode
    )
      refuse('lock-identity-differs');
    // Proof: omitting flock admission accepted the independently reopened FD in the native inherited-lock fixture.
    assertInheritedLock(expected.path, expected.descriptor);
  }
}

/** Checks the actual init executable and PID-one command shape independently of Docker's Init flag.
 * @internal
 */
export function checkInitProcess(native: Record<string, unknown>, initSha256: string): void {
  // Proof: omitting executable comparison admitted a substituted hash in native init admission.
  if (
    native['executableSha256'] !== initSha256 ||
    typeof native['cmdline'] !== 'string' ||
    !native['cmdline'].startsWith('/sbin/docker-init\u0000--\u0000') ||
    !/^NSpid:\s+\d+\s+1$/m.test(textKernel(native['status']))
  )
    refuse('native-init-differs');
}

function daemonIdentity(value: unknown): Record<string, unknown> {
  const fields = record(value),
    keys = [
      'ID',
      'Name',
      'DockerRootDir',
      'Driver',
      'OperatingSystem',
      'OSType',
      'Architecture',
      'KernelVersion',
      'InitBinary',
      'InitCommit',
      'ServerVersion',
      'SecurityOptions',
      'LiveRestoreEnabled',
    ];
  if (keys.some((key) => !Object.hasOwn(fields, key))) refuse('daemon-identity-incomplete');
  return Object.fromEntries(keys.map((key) => [key, fields[key]]));
}

async function readCrontab(timeout: number): Promise<Buffer> {
  const child = spawn('/usr/bin/crontab', ['-l'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  const stdout: Buffer[] = [],
    stderr: Buffer[] = [];
  let size = 0;
  const state = { expired: false, overflow: false };
  const timer = setTimeout(() => {
    state.expired = true;
    child.kill('SIGKILL');
  }, timeout);
  const read = async (stream: NodeJS.ReadableStream, chunks: Buffer[]) => {
    for await (const chunk of stream) {
      if (!Buffer.isBuffer(chunk)) refuse('crontab-invalid');
      size += chunk.length;
      if (size > 1048576) {
        state.overflow = true;
        child.kill('SIGKILL');
      } else chunks.push(chunk);
    }
  };
  const exited = new Promise<number | null>((resolveExit, reject) => {
    child.once('exit', resolveExit);
    child.once('error', reject);
  });
  try {
    const [, , code] = await Promise.all([
      read(child.stdout, stdout),
      read(child.stderr, stderr),
      exited,
    ]);
    if (state.expired || state.overflow) refuse('suspended-crontab-unavailable');
    return readSuspendedCrontab(code, Buffer.concat(stdout), Buffer.concat(stderr));
  } catch {
    child.kill('SIGKILL');
    await exited.catch(() => null);
    throw new InitRefusal('suspended-crontab-unavailable');
  } finally {
    clearTimeout(timer);
  }
}

/** Distinguishes a present empty suspended crontab from absence or a failed native read.
 * @internal
 */
export function readSuspendedCrontab(code: number | null, stdout: Buffer, stderr: Buffer): Buffer {
  // Proof: omitting native status/diagnostic admission accepted absent crontab as present empty bytes.
  if (code !== 0 || stderr.length !== 0) refuse('suspended-crontab-unavailable');
  return stdout;
}

/** @internal */
export function checkRouteCoverage(
  configuration: unknown,
  inventory: readonly RoutePin[],
  publicProbes: InitPacket['public'],
): void {
  const servers = record(record(record(configuration)['apps'])['http'])['servers'];
  const observed = record(servers),
    routes = new Map<string, unknown>();
  const escape = (key: string) => key.replaceAll('~', '~0').replaceAll('/', '~1');
  function visit(value: unknown, pointer: string): void {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => {
        visit(entry, pointer + '/' + String(index));
      });
      return;
    }
    if (typeof value !== 'object' || value === null) return;
    for (const [key, entry] of Object.entries(value)) {
      if (key === 'routes') {
        if (!Array.isArray(entry) || entry.length === 0) refuse('route-coverage-incomplete');
        entry.forEach((route, index) => {
          record(route);
          routes.set(pointer + '/routes/' + String(index), route);
        });
      }
      visit(entry, pointer + '/' + escape(key));
    }
  }
  if (Object.keys(observed).length === 0) refuse('route-coverage-incomplete');
  for (const [name, server] of Object.entries(observed)) {
    const fields = record(server);
    if (
      !Array.isArray(fields['listen']) ||
      fields['listen'].length === 0 ||
      !Array.isArray(fields['routes'])
    )
      refuse('route-coverage-incomplete');
    visit(server, '/apps/http/servers/' + escape(name));
  }
  // Proof: omitting route count accepted an uncovered server with an otherwise matching complete configuration hash.
  if (
    routes.size !== inventory.length ||
    new Set(inventory.map((entry) => entry.routeId)).size !== inventory.length ||
    new Set(inventory.map((entry) => entry.routePointer)).size !== inventory.length
  )
    refuse('route-coverage-incomplete');
  const probes = new Map(publicProbes.probes.map((entry) => [entry.id, entry]));
  const usedProbes = new Set<string>();
  for (const route of inventory) {
    if (
      !Object.hasOwn(observed, route.server) ||
      !route.routePointer.startsWith('/apps/http/servers/' + escape(route.server) + '/') ||
      fingerprint(routes.get(route.routePointer) ?? null) !== route.routeSha256
    )
      refuse('route-pin-differs');
    const configuredHosts = new Set<string>();
    const collectHosts = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(collectHosts);
        return;
      }
      if (typeof value !== 'object' || value === null) return;
      for (const [key, entry] of Object.entries(value)) {
        if (key === 'host')
          values(entry, (host) => text(host, 253), 128).forEach((host) =>
            configuredHosts.add(host),
          );
        else collectHosts(entry);
      }
    };
    collectHosts(routes.get(route.routePointer));
    if (fingerprint([...configuredHosts].sort()) !== fingerprint([...route.hosts].sort()))
      refuse('route-hosts-differ');
    for (const id of route.probeIds) {
      const probe = probes.get(id);
      if (probe?.routeId !== route.routeId || usedProbes.has(id)) refuse('route-probe-differs');
      usedProbes.add(id);
    }
  }
  if (
    usedProbes.size !== probes.size ||
    fingerprint({ servers: observed, inventory }) !== publicProbes.routesSha256
  )
    refuse('route-coverage-incomplete');
}

/** Checks native graph bytes and directory membership; production decoding fixes the root path.
 * @internal
 */
export async function checkGraph(graph: CaddyGraph): Promise<void> {
  const root = dirname(graph.root);
  const metadata = await lstat(root, { bigint: true });
  if (
    !metadata.isDirectory() ||
    (await realpath(root)) !== root ||
    String(metadata.dev) !== graph.directoryDevice ||
    String(metadata.ino) !== graph.directoryInode
  )
    refuse('caddy-directory-differs');
  const entries: { name: string; kind: 'directory' | 'file' }[] = [];
  let bytes = 0;
  async function walk(directory: string): Promise<void> {
    for (const name of (await readdir(directory)).sort()) {
      const absolute = join(directory, name),
        native = await lstat(absolute);
      if (native.isSymbolicLink() || (!native.isDirectory() && !native.isFile()))
        refuse('caddy-directory-member-invalid');
      entries.push({
        name: absolute.slice(root.length + 1),
        kind: native.isDirectory() ? 'directory' : 'file',
      });
      if (entries.length > 4096) refuse('caddy-directory-oversized');
      if (native.isDirectory()) await walk(absolute);
    }
  }
  await walk(root);
  // Proof: omitting membership comparison admitted the unknown directory member in real graph IO.
  if (
    fingerprint(entries) !== graph.directoryEntriesSha256 ||
    fingerprint({
      root: graph.root,
      files: graph.files.map((entry) => ({ path: entry.path, sha256: entry.sha256 })),
    }) !== graph.importGraphSha256
  )
    refuse('caddy-graph-differs');
  for (const file of graph.files) {
    const native = await lstat(file.path);
    bytes += native.size;
    if (bytes > 32 * 1048576 || sha(await readWriterBytes(file.path)) !== file.sha256)
      refuse('caddy-graph-differs');
  }
}

/** @internal */
export async function probeWebSocket(probe: WebSocketProbe, timeout: number): Promise<void> {
  return new Promise((resolveProbe, reject) => {
    const key = randomBytes(16).toString('base64');
    const expectedAccept = createHash('sha1')
      .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64');
    let complete = false,
      upgraded = false;
    const fail = () => {
      if (!complete) {
        complete = true;
        reject(new InitRefusal('websocket-refused'));
      }
    };
    const client = requestHttps({
      hostname: probe.address.connectAddress,
      port: probe.address.port,
      path: probe.path,
      method: 'GET',
      servername: probe.address.host,
      rejectUnauthorized: true,
      agent: false,
      headers: {
        Host: probe.address.host,
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Key': key,
        'Sec-WebSocket-Version': '13',
        ...(probe.origin === null ? {} : { Origin: probe.origin }),
        ...(probe.requestedProtocol === null
          ? {}
          : { 'Sec-WebSocket-Protocol': probe.requestedProtocol }),
      },
    });
    const timer = setTimeout(() => {
      client.destroy();
      fail();
    }, timeout);
    client.on('error', fail);
    client.on('response', (response) => {
      response.destroy();
      fail();
    });
    client.on('upgrade', (response, socket, head) => {
      upgraded = true;
      if (
        response.statusCode !== 101 ||
        response.headers.upgrade?.toLowerCase() !== 'websocket' ||
        !String(response.headers.connection)
          .toLowerCase()
          .split(',')
          .map((entry) => entry.trim())
          .includes('upgrade') ||
        // Proof: omitting accept validation admitted the malformed handshake in the real TLS/WSS fixture.
        response.headers['sec-websocket-accept'] !== expectedAccept ||
        (response.headers['sec-websocket-protocol'] ?? null) !== probe.expectedProtocol ||
        head.length !== 0
      ) {
        socket.destroy();
        fail();
        return;
      }
      const mask = randomBytes(4),
        code = Buffer.from([0x03, 0xe8]);
      socket.on('error', fail);
      socket.on('close', () => {
        clearTimeout(timer);
        if (!complete) {
          complete = true;
          resolveProbe();
        }
      });
      socket.end(
        Buffer.concat([
          Buffer.from([0x88, 0x82]),
          mask,
          Buffer.from(code.map((byte, index) => byte ^ (mask[index] ?? 0))),
        ]),
      );
      socket.destroySoon();
    });
    client.on('close', () => {
      if (!upgraded) clearTimeout(timer);
    });
    client.end();
  });
}

/** Sends only the two fixed authenticated registry reads and rechecks the private credential source.
 * @internal
 */
export async function probeRegistry(probe: RegistryProbe, deadline: Deadline): Promise<void> {
  return withAuthorityFiles([probe.credentials.path], async (files, recheck) => {
    await compareFiles([probe.credentials], files);
    const credentials = closed(parseJson(await readPrivateOrPinned(probe.credentials)), [
      'username',
      'password',
    ]);
    const username = text(credentials['username'], 4096),
      password = credentials['password'];
    if (
      username.includes(':') ||
      typeof password !== 'string' ||
      password.length === 0 ||
      password.length > 65536 ||
      password.includes('\0') ||
      /[\r\n]/.test(password)
    )
      refuse('credentials-invalid');
    const authorization = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
    const health = await readResponse(
      probe.address,
      'https',
      '/v2/',
      { Authorization: authorization },
      deadline.allocate(10000),
    );
    if (
      health.status !== 200 ||
      health.headers.location !== undefined ||
      health.headers['www-authenticate'] !== undefined ||
      health.headers['docker-distribution-api-version'] !== 'registry/2.0' ||
      sha(health.body) !== probe.v2BodySha256
    )
      refuse('registry-probe-refused');
    const manifest = await readResponse(
      probe.address,
      'https',
      '/v2/' + probe.repository + '/manifests/' + probe.manifestDigest,
      { Authorization: authorization, Accept: probe.manifestMediaType },
      deadline.allocate(10000),
    );
    if (
      manifest.status !== 200 ||
      manifest.headers.location !== undefined ||
      manifest.headers['www-authenticate'] !== undefined ||
      manifest.headers['content-type'] !== probe.manifestMediaType ||
      manifest.headers['docker-content-digest'] !== probe.manifestDigest ||
      // Proof: omitting body hashing admitted wrong manifest bytes behind the expected digest header in the real registry fixture.
      'sha256:' + sha(manifest.body) !== probe.manifestDigest
    )
      refuse('registry-probe-refused');
    await recheck();
  });
}

/** @internal */
export function resolveDefaultRoute(
  native: Record<string, unknown>,
  observed: NativeContainer,
): string {
  const gateways: string[] = [];
  const route = textKernel(native['route']);
  if (!route.startsWith('Iface\tDestination\tGateway')) refuse('kernel-route-invalid');
  for (const line of route.trimEnd().split('\n').slice(1)) {
    const fields = line.trim().split(/\s+/);
    if (fields.length !== 11) refuse('kernel-route-invalid');
    if (fields[1] === '00000000' && fields[7] === '00000000') {
      const hex = fields.at(2);
      if (hex === undefined || !/^[a-fA-F0-9]{8}$/.test(hex)) refuse('kernel-route-invalid');
      gateways.push(Buffer.from(hex, 'hex').reverse().join('.'));
    }
  }
  for (const line of textKernel(native['ipv6Route']).trim().split('\n')) {
    if (line === '') continue;
    const fields = line.trim().split(/\s+/);
    if (fields.length !== 10) refuse('kernel-route-invalid');
    if (fields[0] === '0'.repeat(32) && fields[1] === '00' && fields[4] !== '0'.repeat(32)) {
      const hex = fields.at(4);
      if (hex === undefined || !/^[a-fA-F0-9]{32}$/.test(hex)) refuse('kernel-route-invalid');
      gateways.push(hex.toLowerCase());
    }
  }
  const networks = new Set<string>();
  for (const endpoint of Object.values(observed.networks)) {
    const fields = record(endpoint),
      gateway = fields['Gateway'],
      ipv6 = fields['IPv6Gateway'];
    if (
      (typeof gateway === 'string' && gateways.includes(gateway)) ||
      (typeof ipv6 === 'string' && ipv6 !== '' && gateways.includes(expandIpv6(ipv6)))
    )
      networks.add(hash(fields['NetworkID']));
  }
  if (networks.size !== 1 || gateways.length === 0) refuse('default-route-ambiguous');
  const network = [...networks].at(0);
  if (network === undefined) refuse('default-route-ambiguous');
  return network;
}
function expandIpv6(address: string): string {
  if (isIP(address) !== 6 || address.includes('.')) refuse('ipv6-layout-unsupported');
  const parts = address.split('::');
  if (parts.length > 2) refuse('ipv6-layout-unsupported');
  const first = parts[0]?.split(':').filter(Boolean) ?? [],
    last = parts[1]?.split(':').filter(Boolean) ?? [];
  return [...first, ...Array.from({ length: 8 - first.length - last.length }, () => '0'), ...last]
    .map((part) => part.padStart(4, '0'))
    .join('')
    .toLowerCase();
}
function checkConnections(native: Record<string, unknown>, ports: readonly number[]): void {
  for (const key of ['tcp', 'tcp6'])
    for (const line of textKernel(native[key]).trimEnd().split('\n').slice(1)) {
      const fields = line.trim().split(/\s+/),
        local = fields.at(1),
        state = fields.at(3);
      if (
        fields.length < 10 ||
        local === undefined ||
        state === undefined ||
        !/^[a-fA-F0-9]+:[a-fA-F0-9]{4}$/.test(local)
      )
        refuse('registry-sockets-invalid');
      const port = Number.parseInt(local.slice(local.lastIndexOf(':') + 1), 16);
      if (ports.includes(port) && !['0A', '06', '07'].includes(state))
        refuse('registry-active-session');
    }
}

async function inspectRecovery(
  packet: InitPacket,
  packetSha256: string,
  engine: EngineTransport,
): Promise<SafeInitSummary> {
  await requireInheritedEdgeLock();
  const directory = await lstat(packet.receiptDirectory);
  if (
    !directory.isDirectory() ||
    directory.isSymbolicLink() ||
    directory.uid !== 1000 ||
    (directory.mode & 0o777) !== 0o700 ||
    (await realpath(packet.receiptDirectory)) !== packet.receiptDirectory
  )
    refuse('recovery-directory-invalid');
  const names = (await readdir(packet.receiptDirectory)).sort();
  if (names.length === 0 || names.length > 128) refuse('recovery-roster-invalid');
  const deadline = new Deadline(120000);
  let previous: string | null = null;
  const selected = new Set(packet.targets.map((target) => target.id));
  const candidates = new Set<string>();
  const sourceProofs = new Map<TargetKind, ComposeProof>();
  for (const target of packet.targets)
    sourceProofs.set(
      target.kind,
      await readComposeRoster(target.kind, target.composeFiles, packet.provenance),
    );
  for (let index = 0; index < names.length; index++) {
    const name = names[index];
    if (name !== String(index).padStart(4, '0') + '.json') refuse('recovery-roster-invalid');
    const receipt = record(parseJson(await readPrivateFile(join(packet.receiptDirectory, name))));
    const hasCandidate = Object.hasOwn(receipt, 'candidate');
    closed(receipt, [
      'attempt',
      'previous',
      'stage',
      'target',
      'original',
      'remaining',
      'sourceRosterSha256',
      'literalInitSha256',
      ...(hasCandidate ? ['candidate'] : []),
    ]);
    const kind = receipt['target'];
    if (kind !== 'registry' && kind !== 'caddy') refuse('recovery-target-invalid');
    const proof = sourceProofs.get(kind);
    if (proof === undefined) refuse('recovery-source-proof-missing');
    checkReceiptSources(receipt, proof);
    if (
      receipt['attempt'] !== packet.nonce ||
      receipt['previous'] !== previous ||
      receipt['original'] !== packet.targets[kind === 'registry' ? 0 : 1].id
    )
      refuse('recovery-chain-invalid');
    readRecoveryStage(receipt['stage']);
    integer(receipt['remaining'], 0, 300000);
    if (hasCandidate) {
      const id = hash(receipt['candidate']);
      if (selected.has(id)) refuse('recovery-candidate-invalid');
      candidates.add(id);
    }
    previous = fingerprint(receipt);
  }
  const listed = values(
    await engine.inventory(deadline.allocate(10000)),
    (entry) => record(entry),
    4096,
  );
  const present = new Set(listed.map((entry) => hash(entry['Id'])));
  for (const id of [...selected, ...candidates])
    if (present.has(id)) {
      const observed = await engine.inspectListed(id, deadline.allocate(10000));
      if (
        candidates.has(id) &&
        ![
          '/wbs-registry-1',
          '/wbs-caddy-1',
          `/wbs-init-${packet.nonce}-registry`,
          `/wbs-init-${packet.nonce}-caddy`,
        ].includes(observed.name)
      )
        refuse('recovery-name-differs');
    }
  return {
    attempt: packet.nonce,
    stage: 'recovery-inspected',
    packetSha256,
    receiptDirectory: packet.receiptDirectory,
    receiptSha256: previous,
  };
}

/** Rejects unknown trusted receipt stages before read-only recovery inspection.
 * @internal
 */
export function readRecoveryStage(value: unknown): string {
  const stage = text(value, 64);
  // Proof: omitting the finite roster admitted the unknown private receipt stage in recovery refusal.
  if (
    ![
      'before-create',
      'create-intended',
      'created',
      'candidate-inert',
      'candidate-verified',
      'stop-intended',
      'stop-uncertain',
      'original-stopped',
      'rename-original-intended',
      'rename-candidate-intended',
      'rename-uncertain',
      'start-intended',
      'start-uncertain',
      'candidate-running-unhealthy',
      'healthy',
      'healthy-original-retained',
      'retention-point',
      'remove-intended',
      'removal-uncertain',
      'original-absent',
      'complete',
    ].includes(stage)
  )
    refuse('recovery-stage-invalid');
  return stage;
}

interface ComposeStructure {
  roots: Set<string>;
  services: Set<string>;
  properties: Set<string>;
  defines: boolean;
}
interface ComposeProof {
  target: TargetKind;
  sourceRosterSha256: string;
  literalInitSha256: string;
}
/** Production publications carry required proofs of the freshly pinned installed declaration. */
interface ProductionInitReceipt extends Receipt {
  sourceRosterSha256: string;
  literalInitSha256: string;
}

/** Publishes actual source-proof hashes without widening the core fixture's receipt contract.
 * @internal
 */
export async function publishInitReceipt(
  writer: Pick<PrivateReceipts, 'publish'>,
  receipt: Receipt,
  proof: ComposeProof,
): Promise<string> {
  if (proof.target !== receipt.target) refuse('receipt-source-target-differs');
  // Proof: omitting literal proof publication failed exact private receipt readback.
  const publication: ProductionInitReceipt = {
    ...receipt,
    sourceRosterSha256: hash(proof.sourceRosterSha256),
    literalInitSha256: hash(proof.literalInitSha256),
  };
  return writer.publish(publication);
}

/** Requires both persisted source hashes to equal the separately recomputed ordered roster proof.
 * @internal
 */
export function checkReceiptSources(receipt: Record<string, unknown>, proof: ComposeProof): void {
  if (
    // Proof: independently omitting either comparison admitted wrong source metadata in production receipt recovery.
    hash(receipt['sourceRosterSha256']) !== proof.sourceRosterSha256 ||
    hash(receipt['literalInitSha256']) !== proof.literalInitSha256 ||
    receipt['target'] !== proof.target
  )
    refuse('recovery-source-proof-differs');
}

function maskComposeLine(line: string): string {
  let quote: "'" | '"' | null = null,
    masked = '';
  for (let index = 0; index < line.length; index++) {
    const character = line.charAt(index);
    if (quote !== null) {
      masked += ' ';
      if (quote === '"' && character === '\\') {
        index++;
        if (index >= line.length) refuse('compose-source-unsupported');
        masked += ' ';
      } else if (character === quote) {
        if (quote === "'" && line.charAt(index + 1) === "'") {
          index++;
          masked += ' ';
        } else quote = null;
      }
    } else if (character === '#' && (index === 0 || /\s/.test(line.charAt(index - 1)))) {
      return masked + ' '.repeat(line.length - index);
    } else if (character === '"' || character === "'") {
      quote = character;
      masked += ' ';
    } else masked += character;
  }
  if (quote !== null) refuse('compose-source-unsupported');
  return masked;
}

function scanComposeSource(contents: string, kind: TargetKind): ComposeStructure {
  if (
    Buffer.byteLength(contents) > 1048576 ||
    Array.from(contents).some((character) => {
      const code = character.charCodeAt(0);
      return (
        (code < 32 && code !== 10) ||
        (code >= 127 && code <= 159) ||
        [0xfeff, 0x2028, 0x2029].includes(code)
      );
    })
  )
    refuse('compose-source-unsupported');
  const structure: ComposeStructure = {
    roots: new Set(),
    services: new Set(),
    properties: new Set(),
    defines: false,
  };
  let root = '',
    service = '',
    sawInit = false;
  for (const line of contents.split('\n')) {
    const outside = maskComposeLine(line),
      code = outside.trim();
    if (code === '') continue;
    // Proof: omitting forbidden-token admission accepted an unrelated anchor/alias in the literal Compose profile.
    if (
      code.startsWith('%') ||
      code === '---' ||
      code === '...' ||
      /[&*!|>]/.test(code) ||
      code.includes('<<') ||
      code.startsWith('? ') ||
      code === '?' ||
      code.startsWith(':')
    )
      refuse('compose-source-unsupported');
    const flow: string[] = [];
    for (const token of outside) {
      if (token === '[' || token === '{') flow.push(token);
      else if (token === ']' || token === '}') {
        if (flow.pop() !== (token === ']' ? '[' : '{')) refuse('compose-source-unsupported');
      }
    }
    if (flow.length !== 0) refuse('compose-source-unsupported');
    const indentation = line.length - line.trimStart().length;
    if (line.slice(0, indentation) !== ' '.repeat(indentation))
      refuse('compose-source-unsupported');
    const key = /^([A-Za-z_][A-Za-z0-9_.-]*):(?:\s|$)/.exec(line.slice(indentation));
    const name = key?.[1];
    const value =
      name === undefined
        ? ''
        : line.slice(indentation + name.length + 1, outside.trimEnd().length).trim();
    if (indentation === 0) {
      // Proof: omitting root uniqueness admitted duplicate name keys in the literal Compose profile.
      if (
        name === undefined ||
        structure.roots.has(name) ||
        (!['name', 'version', 'services', 'networks', 'volumes', 'configs', 'secrets'].includes(
          name,
        ) &&
          !/^x-[A-Za-z0-9_-]+$/.test(name))
      )
        refuse('compose-source-unsupported');
      structure.roots.add(name);
      root = name;
      service = '';
      if (name === 'services' && value !== '') refuse('compose-source-unsupported');
    } else if (root === 'services' && indentation === 2) {
      // Proof: omitting service uniqueness admitted repeated unrelated service names in the literal Compose profile.
      if (name === undefined || value !== '' || structure.services.has(name))
        refuse('compose-source-unsupported');
      structure.services.add(name);
      service = name;
      if (name === kind) structure.defines = true;
    } else if (root === 'services' && service === kind && indentation === 4) {
      // Proof: omitting property uniqueness admitted repeated true Init properties in the literal Compose profile.
      if (
        name === undefined ||
        structure.properties.has(name) ||
        ['extends', 'profiles'].includes(name)
      )
        refuse('compose-source-unsupported');
      structure.properties.add(name);
      if (name === 'init') {
        if (value !== 'true') refuse('compose-literal-init-required');
        sawInit = true;
      }
    } else if (
      (root === 'services' && indentation < 4) ||
      (root === 'services' && service === kind && indentation < 6)
    )
      refuse('compose-source-unsupported');
    else if (!code.startsWith('-') && !/:\s|:$/.test(code)) refuse('compose-source-unsupported');
  }
  if (structure.defines && !sawInit) refuse('compose-literal-init-required');
  return structure;
}

/** Admits a narrow literal declaration profile before Bun can discard duplicate keys or resolve YAML constructs.
 * @internal
 */
export function requireLiteralComposeInit(contents: string, kind: TargetKind): boolean {
  try {
    const scanned = scanComposeSource(contents, kind),
      root = record(Bun.YAML.parse(contents));
    const equalKeys = (keys: readonly string[], expected: Set<string>) =>
      fingerprint([...keys].sort()) === fingerprint([...expected].sort());
    // Proof: omitting ancestry agreement accepted the injected parser-only root key in the real source lifetime fixture.
    if (!equalKeys(Object.keys(root), scanned.roots)) refuse('compose-ancestry-differs');
    if (!scanned.roots.has('services')) return false;
    const services = record(root['services']);
    if (!equalKeys(Object.keys(services), scanned.services)) refuse('compose-ancestry-differs');
    if (!scanned.defines) return false;
    const selected = record(services[kind]);
    if (!equalKeys(Object.keys(selected), scanned.properties) || selected['init'] !== true)
      refuse('compose-ancestry-differs');
    return true;
  } catch (cause) {
    if (cause instanceof InitRefusal) throw cause;
    // Proof: rethrowing the parser cause exposed the synthetic private marker in literal Compose parser errors.
    throw new InitRefusal('compose-source-unsupported');
  }
}

/** Reads only the ordered native-label roster after binding it to independent original fingerprints and file pins.
 * @internal
 */
export async function observeComposeDeclarations(
  targets: readonly (SelectedTarget & { nativeSha256: string; roster: readonly string[] })[],
  provenance: readonly Pin[],
): Promise<readonly ComposeProof[]> {
  try {
    const proofs: ComposeProof[] = [];
    for (const target of targets) {
      // Proof: omitting native binding accepted changed label bytes with the old independent native fingerprint.
      if (fingerprint(target.original) !== target.nativeSha256)
        refuse('compose-native-binding-differs');
      const labels = record(target.original.config['Labels']);
      const roster = text(labels['com.docker.compose.project.config_files'])
        .split(',')
        .map((entry) => path(entry));
      if (roster.length > 16 || new Set(roster).size !== roster.length)
        refuse('compose-roster-invalid');
      // Proof: omitting roster equality accepted reordered and swapped expected source recipes.
      if (fingerprint(roster) !== fingerprint(target.roster)) refuse('compose-roster-differs');
      proofs.push(await readComposeRoster(target.kind, roster, provenance));
    }
    return proofs;
  } catch (cause) {
    if (cause instanceof InitRefusal) throw cause;
    // Proof: rethrowing unreadable source errors exposed the private fixture pathname in real source lifetime.
    throw new InitRefusal('compose-source-unavailable');
  }
}

async function readComposeRoster(
  kind: TargetKind,
  roster: readonly string[],
  provenance: readonly Pin[],
): Promise<ComposeProof> {
  const pins = roster.map((path) => {
    const matches = provenance.filter((entry) => entry.path === path);
    if (matches.length !== 1) refuse('compose-source-unpinned');
    const expected = matches.at(0);
    if (expected === undefined) return refuse('compose-source-unpinned');
    return expected;
  });
  const proof = await withAuthorityFiles(roster, async (files, recheck) => {
    await compareFiles(pins, files);
    const definitions: string[] = [];
    for (const expected of pins) {
      const bytes = await readWriterBytes(expected.path);
      if (sha(bytes) !== expected.sha256) refuse('compose-source-bytes-differ');
      const contents = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
      // Proof: bypassing this gate admitted self-consistently pinned false/missing source despite good historical JSON.
      if (requireLiteralComposeInit(contents, kind)) definitions.push(expected.sha256);
    }
    // Proof: omitting cardinality accepted a later second true declaration in the installed source recipe fixture.
    if (definitions.length !== 1) refuse('compose-definition-ambiguous');
    await recheck();
    const sourceRosterSha256 = fingerprint(pins);
    return {
      target: kind,
      sourceRosterSha256,
      literalInitSha256: fingerprint({ target: kind, sourceRosterSha256, definitions }),
    };
  });
  return proof;
}
