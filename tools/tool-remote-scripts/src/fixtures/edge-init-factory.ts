import * as children from 'node:child_process';
import { createHash } from 'node:crypto';
import * as filesystemModule from 'node:fs';
import * as filesModule from 'node:fs/promises';
import type { IncomingMessage, RequestOptions } from 'node:http';
import * as httpModule from 'node:http';
import * as httpsModule from 'node:https';
import { dirname, resolve } from 'node:path';
import type { Duplex } from 'node:stream';

import { dlopen, FFIType } from 'bun:ffi';
import { mock } from 'bun:test';

const files = { ...filesModule };
const filesystem = { ...filesystemModule };
const http = { ...httpModule };
const https = { ...httpsModule };

const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const suppliedRoot = process.env['INIT_FACTORY_ROOT'];
const root = suppliedRoot ?? (await files.mkdtemp('/tmp/edge-init-factory-'));
const originalSpawn = children.spawn;
const originalBunSpawn = Bun.spawn;
const paths = new Set<string>();
const map = (path: string) => {
  if (path.startsWith('/tmp/private-fixture/')) return root + path;
  if (path === '/var/run/docker.sock') return root + '/run/docker.sock';
  if (path.startsWith('/proc/self/fd/')) return path;
  if (path.startsWith('/proc/') && !path.startsWith('/proc/sys/')) return path;
  if (
    path === '/' ||
    paths.has(path) ||
    [
      '/home/puni1/',
      '/etc/machine-id',
      '/proc/sys/',
      '/run/docker.sock',
      '/var/run/docker.sock',
    ].some((prefix) => path.startsWith(prefix))
  )
    return root + path;
  return path;
};
async function write(path: string, bytes: string | Uint8Array, mode = 0o600) {
  paths.add(path);
  for (let ancestor = dirname(path); ancestor !== '/'; ancestor = dirname(ancestor))
    paths.add(ancestor);
  await files.mkdir(dirname(root + path), { recursive: true, mode: 0o700 });
  await files.writeFile(root + path, bytes, { mode });
}
async function pin(path: string) {
  const metadata = await files.lstat(root + path);
  return {
    path,
    device: String(metadata.dev),
    inode: String(metadata.ino),
    mode: metadata.mode & 0o7777,
    uid: metadata.uid,
    sha256: hash(await files.readFile(root + path)),
  };
}
const transcript: string[] = [];
const reads: string[] = [];
const action = process.argv[2] ?? 'prepare';
const injection = process.argv.at(5);
const fault = injection === undefined || injection === '' ? action : injection;
const clockFault = fault === 'clock-rollback' || fault === 'clock-forward-control';
const rawMonotonic = performance.now.bind(performance),
  rawWall = Date.now.bind(Date);
let monotonicOffset = 0,
  wallOffset = 0,
  entryActive = false,
  clockRegistryAdvanced = false,
  clockWallRolledBack = false,
  clockCaddyAdvanced = false,
  clockStopApplied = false;
const clockEffects: { route: string; monotonic: number; wall: number; applied: boolean }[] = [];
const clockShifts: {
  event: string;
  beforeMonotonic: number;
  afterMonotonic: number;
  beforeWall: number;
  afterWall: number;
}[] = [];
let firstAdmissionClock: { monotonic: number; wall: number; expires: number } | undefined;
if (clockFault) {
  Date.now = () => rawWall() + wallOffset;
  Object.defineProperty(performance, 'now', {
    configurable: true,
    value: () => rawMonotonic() + monotonicOffset,
  });
}
function shiftClock(event: string, monotonic: number, wall: number) {
  const beforeMonotonic = performance.now(),
    beforeWall = Date.now();
  monotonicOffset += monotonic;
  wallOffset += wall;
  clockShifts.push({
    event,
    beforeMonotonic,
    afterMonotonic: performance.now(),
    beforeWall,
    afterWall: Date.now(),
  });
}
const socketPath = root + '/run/docker.sock';
let pythonWrapper = '';
let unitBytes = '';
let sourceRaceInjected = false;
await mock.module('node:fs/promises', () => ({
  ...files,
  open: (
    path: string,
    ...arguments_: Parameters<typeof files.open> extends [unknown, ...infer Rest] ? Rest : never
  ) => {
    if (
      !sourceRaceInjected &&
      ['source-replaced', 'source-byte-race'].includes(fault) &&
      path.startsWith('/proc/self/fd/') &&
      path.endsWith('/compose.yml')
    ) {
      sourceRaceInjected = true;
      const named = root + '/home/puni1/wbs/compose.yml';
      if (fault === 'source-replaced') {
        const bytes = filesystem.readFileSync(named);
        filesystem.renameSync(named, named + '.previous');
        filesystem.writeFileSync(named, bytes, { mode: 0o600 });
      } else filesystem.appendFileSync(named, '\n# changed while held\n');
    }
    return files.open(map(path), ...arguments_);
  },
  lstat: (path: string, options?: Parameters<typeof files.lstat>[1]) => {
    if (
      clockFault &&
      entryActive &&
      firstAdmissionClock === undefined &&
      path === '/home/puni1/wbs/state'
    ) {
      const monotonic = performance.now(),
        wall = Date.now();
      firstAdmissionClock = {
        monotonic,
        wall,
        expires: monotonic + Date.parse(packet.quiescence.expiresAt) - wall,
      };
    }
    return files.lstat(map(path), options);
  },
  stat: (path: string, options?: Parameters<typeof files.stat>[1]) =>
    files.stat(map(path), options),
  readFile: (path: string, options?: Parameters<typeof files.readFile>[1]) =>
    options === undefined ? files.readFile(map(path)) : files.readFile(map(path), options),
  readlink: (path: string) => files.readlink(map(path)),
  readdir: (path: string) => files.readdir(map(path)),
  mkdir: (path: string, options?: Parameters<typeof files.mkdir>[1]) =>
    files.mkdir(map(path), options),
  realpath: async (path: string) => {
    const canonical = await files.realpath(map(path));
    return canonical.startsWith(root + '/') ? canonical.slice(root.length) : canonical;
  },
}));
await mock.module('node:fs', () => ({
  ...filesystem,
  statSync: (path: string) => filesystem.statSync(map(path)),
  lstatSync: (path: string) => filesystem.lstatSync(map(path)),
  realpathSync: (path: string) => {
    const canonical = filesystem.realpathSync(map(path));
    return canonical.startsWith(root + '/') ? canonical.slice(root.length) : canonical;
  },
  openSync: (path: string, flags: number, mode?: number) =>
    filesystem.openSync(map(path), flags, mode),
  readFileSync: (path: string, options?: Parameters<typeof filesystem.readFileSync>[1]) =>
    options === undefined
      ? filesystem.readFileSync(map(path))
      : filesystem.readFileSync(map(path), options),
}));
await mock.module('node:http', () => ({
  ...http,
  request: (options: RequestOptions, callback: (response: IncomingMessage) => void) =>
    http.request(
      {
        ...options,
        ...(options.socketPath === '/run/docker.sock' ||
        options.socketPath === '/var/run/docker.sock'
          ? { socketPath }
          : {}),
      },
      callback,
    ),
}));
await mock.module('node:child_process', () => ({
  ...children,
  spawn: (command: string, argv: string[], options: children.SpawnOptions) => {
    if (command === '/usr/bin/crontab' && JSON.stringify(argv) === '["-l"]')
      return originalSpawn(
        '/usr/bin/python3',
        [
          '-I',
          '-c',
          fault === 'crontab-unreadable'
            ? 'import sys;sys.stderr.write("PRIVATE_FACTORY_SECRET");sys.exit(2)'
            : 'print("# suspended fixture")',
        ],
        options,
      );
    if (
      command !== '/usr/bin/sudo' ||
      argv[0] !== '-n' ||
      argv[1] !== '/usr/bin/python3' ||
      argv[2] !== '-I' ||
      argv[3] !== '-c' ||
      argv.length !== 5
    )
      throw new Error('fixture refused unexpected spawn');
    const program = argv[4];
    const native = program.endsWith('supervisor_entry(read_init)\n');
    if (!native && !program.endsWith('supervisor_entry(collect)\n'))
      throw new Error('fixture refuses unknown supervisor entry');
    reads.push(native ? 'native' : 'collector');
    const amended = program.replace(
      /supervisor_entry\((read_init|collect)\)\n$/,
      pythonWrapper + '\nsupervisor_entry(fixture_worker)\n',
    );
    const spawned = originalSpawn('/usr/bin/python3', ['-I', '-c', amended], options);
    return spawned;
  },
}));
// This isolated worker changes only the fixed raw systemctl spawn; the host adapter remains production code.
// Bun's overloaded raw spawn boundary delegates non-systemctl internal calls unchanged.
Bun.spawn = ((argv: string[], options: Parameters<typeof Bun.spawn>[1]) => {
  if (!Array.isArray(argv) || argv[0] !== 'systemctl') return originalBunSpawn(argv, options);
  if (argv[1] !== '--user' || argv[2] !== 'show')
    throw new Error('fixture refused unexpected systemctl spawn');
  return originalBunSpawn(
    [
      '/usr/bin/python3',
      '-I',
      '-c',
      'import sys;sys.stdout.write(' + JSON.stringify(unitBytes) + ')',
    ],
    options,
  );
}) as typeof Bun.spawn;

const { packetFixture } = await import('../../test/edge-init-observer-fixture');
const { syntheticContainer } = await import('../../test/edge-init-fixture');
const { AUTHORITY_FIXTURE_PROGRAM } = await import('../../test/installed-authority-fixture');
const { fingerprint, parseNativeContainer, encodeOrderedEnv } = await import('../lib/edge-init');
const { runProductionInitAdoption, decodeInitPacket, fingerprintPacketRoster } =
  await import('../lib/edge-init-observer');
const { WRITER_MEMBERS } = await import('../lib/installed-writers');
const { SOLVER_UNIT_PROPERTIES } = await import('../lib/solver-unit-observation');
const seed = packetFixture();
const packet = seed.packet;
const websocketRoute = {
  match: [{ host: ['fixture.invalid'], path: ['/ws'] }],
  handle: [{ handler: 'reverse_proxy', upstreams: [{ dial: 'backend:3200' }] }],
};
const configuration = {
  apps: {
    http: {
      servers: {
        edge: {
          listen: [':443'],
          routes: [websocketRoute, ...seed.configuration.apps.http.servers.edge.routes],
        },
      },
    },
  },
};
packet.caddy.routeInventory[0].routePointer = '/apps/http/servers/edge/routes/1';
packet.caddy.routeInventory.unshift({
  routeId: hash('websocket route'),
  server: 'edge',
  routePointer: '/apps/http/servers/edge/routes/0',
  routeSha256: fingerprint(websocketRoute),
  hosts: ['fixture.invalid'],
  probeIds: ['wss'],
});
packet.caddy.configurationSha256 = fingerprint(configuration);
packet.public.routesSha256 = fingerprint({
  servers: configuration.apps.http.servers,
  inventory: packet.caddy.routeInventory,
});
const source = await files.readFile(resolve('deploy/compose/base.yml'), 'utf8');
const manifestBody = '{"schemaVersion":2,"fixture":true}';
const fixedPaths = [
  '/home/puni1/wbs/bin/swap.js',
  '/home/puni1/wbs/bin/smoke.js',
  '/home/puni1/wbs-dev/bin/swap.js',
  '/home/puni1/wbs-dev/bin/smoke.js',
  '/home/puni1/wbs-dev/bin/poll.sh',
  '/home/puni1/wbs-dev/bin/dev-poll-sync.sh',
  '/home/puni1/wbs-dev/bin/bun',
];
interface FixtureWriter {
  member: (typeof WRITER_MEMBERS)[number];
  origin: 'build';
  hostPath: string;
  reviewed: string;
  installed: string;
  sha256: string;
}
const manifest: {
  version: number;
  sourceSha: string;
  buildSha: string;
  buildId: string;
  members: FixtureWriter[];
} = {
  version: 1,
  sourceSha: packet.sourceSha,
  buildSha: packet.sourceSha,
  buildId: 'factory',
  members: [],
};
for (const [index, member] of WRITER_MEMBERS.entries()) {
  const path = fixedPaths[index] ?? '/home/puni1/wbs/bin/' + member;
  await write(path, '# synthetic ' + member + '\n');
  manifest.members.push({
    member,
    origin: 'build',
    hostPath: path,
    reviewed: '/reviewed/' + member,
    installed: '/installed/' + member,
    sha256: (await pin(path)).sha256,
  });
}
await write(packet.quiescence.writerManifest.path, JSON.stringify(manifest));
await write(packet.source.path, packet.sourceSha + '\n');
await write(packet.bundle.path, await files.readFile(packet.bundle.path));
await write(packet.bun.path, await files.readFile(packet.bun.path));
await write(packet.init.path, 'synthetic docker-init executable');
await write(packet.daemon.path, 'synthetic dockerd executable');
await write(
  packet.registry.credentials.path,
  JSON.stringify({ username: 'factory', password: 'PRIVATE_FACTORY_SECRET' }),
);
const sourceVariants: Record<string, string> = {
  'source-false': source.replace('init: true', 'init: false'),
  'source-false-no-projection': source.replace('init: true', 'init: false'),
  'source-absent-init': source.replace('init: true', ''),
  'source-duplicate-init': source.replace('init: true', 'init: true\n    init: true'),
  'source-false-true': source.replace('init: true', 'init: false\n    init: true'),
  'source-true-false': source.replace('init: true', 'init: true\n    init: false'),
  'source-anchor': source + '\nx-fixture: &private-fixture value\n',
  'source-alias': source.replace('init: true', 'init: *private-fixture'),
  'source-merge': source.replace('init: true', '<<: {init: true}'),
  'source-tag': source.replace('init: true', 'init: !!bool true'),
  'source-reset': source.replace('init: true', 'init: !reset true'),
  'source-override': source.replace('init: true', 'init: !override true'),
  'source-documents': source + '\n---\nservices: {}\n',
  'source-duplicate-root': source + '\nservices: {}\n',
  'source-include': source + '\ninclude: other.yml\n',
  'source-extends': source.replace('init: true', 'init: true\n    extends: other'),
  'source-profiles': source.replace('init: true', 'init: true\n    profiles: [other]'),
  'source-string': source.replace('init: true', 'init: "true"'),
  'source-uppercase': source.replace('init: true', 'init: TRUE'),
  'source-alternate': source.replace('init: true', 'init: yes'),
  'source-null': source.replace('init: true', 'init: null'),
  'source-number': source.replace('init: true', 'init: 1'),
  'source-quoted-root': source.replace('services:', '"services":'),
  'source-escaped-key': source.replace('init: true', '"i\\u006eit": true'),
  'source-interpolated-service': source.replace('  registry:', '  ${SERVICE}:'),
  'source-interpolated-key': source.replace('init: true', '${PROPERTY}: true'),
  'source-inline-services': 'services: {registry: {init: true}, caddy: {init: true}}\n',
  'source-inline-selected': 'services:\n  registry: {init: true}\n  caddy:\n    init: true\n',
  'source-array-selected': 'services:\n  registry: [private]\n  caddy:\n    init: true\n',
  'source-scalar-selected': 'services:\n  registry: private\n  caddy:\n    init: true\n',
  'source-crlf': source.replaceAll('\n', '\r\n'),
  'source-flow-multiline': source + '\nx-fixture: [private,\n  scalar]\n',
  'source-quoted-fake': 'x-fixture: "private\nservices:\n  registry:\n    init: true\n"\n' + source,

  'source-interpolated': source.replace('init: true', 'init: ${INIT}'),
  'source-quoted-key': source.replace('init: true', '"init": true'),
  'source-quoted-service': source.replace('  registry:', '  "registry":'),
  'source-block': source.replace('init: true', 'init: |\n      true'),
  'source-complex': source + '\n? private-key\n: value\n',
  'source-multiline': source + '\nx-fixture: "private\n  services: {registry: {init: true}}"\n',
  'source-secret-parser': source + '\nx-fixture: [PRIVATE_FACTORY_SECRET\n',
};
await write(
  packet.provenance[0].path,
  Object.hasOwn(sourceVariants, fault) ? sourceVariants[fault] : source,
);
const provenancePaths = [packet.provenance[0].path];
if (fault === 'source-false' || fault === 'source-absent-init') {
  const historical = '/home/puni1/wbs/resolved-history.json';
  await write(
    historical,
    JSON.stringify({ services: { registry: { init: true }, caddy: { init: true } } }),
  );
  provenancePaths.push(historical);
}
for (let index = 1; index <= 3; index++) {
  const path = '/home/puni1/wbs/tier-' + String(index) + '.yml';
  const contents =
    fault.startsWith('source-later-') && index === 3
      ? 'services:\n  caddy:\n' +
        (fault === 'source-later-absent'
          ? '    image: caddy:fixture\n'
          : '    init: ' + (fault === 'source-later-false' ? 'false' : 'true') + '\n')
      : 'services:\n  backend' +
        String(index) +
        ':\n    image: "${TAG:-fixture}" # quoted comment\n    networks: [edge]\n';
  await write(path, contents);
  provenancePaths.push(path);
  packet.targets[1].composeFiles.push(path);
}

await write(
  packet.caddy.root,
  'fixture.invalid {\n @ws path /ws\n reverse_proxy @ws backend:3200\n respond "fixed"\n}\n',
);
await write('/etc/machine-id', 'a'.repeat(32) + '\n');
await write('/proc/sys/kernel/random/boot_id', packet.bootId + '\n');
paths.add(packet.receiptDirectory);
paths.add(dirname(packet.receiptDirectory));
await files.mkdir(root + dirname(packet.receiptDirectory), { recursive: true, mode: 0o700 });
for (const key of ['source', 'bundle', 'bun', 'init', 'daemon'] as const)
  packet[key] = await pin(packet[key].path);
packet.provenance = await Promise.all(provenancePaths.map((path) => pin(path)));
packet.registry.credentials = await pin(packet.registry.credentials.path);
packet.quiescence.writerManifest = await pin(packet.quiescence.writerManifest.path);
packet.machineIdSha256 = hash('a'.repeat(32) + '\n');
packet.quiescence.hostMachineIdSha256 = packet.machineIdSha256;
packet.quiescence.authorityPins.hostMachineIdSha256 = packet.machineIdSha256;
packet.quiescence.authorityPins.writerManifestSha256 = packet.quiescence.writerManifest.sha256;
packet.quiescence.suspendedCrontabSha256 = hash('# suspended fixture\n');
const unit = Object.fromEntries(SOLVER_UNIT_PROPERTIES.map((key) => [key, '']));
Object.assign(unit, {
  LoadState: 'loaded',
  Id: 'wbs-solver-supervisor.service',
  Names: 'wbs-solver-supervisor.service',
  Transient: 'no',
  NeedDaemonReload: 'no',
  Restart: 'on-failure',
  RestartPreventExitStatus: '78',
  ActiveState: 'inactive',
  SubState: 'dead',
  MainPID: '0',
  ControlPID: '0',
  Job: '0',
});
packet.quiescence.stoppedUnitSha256 = fingerprint({
  ...unit,
  ...(fault === 'queued-job' ? { Job: '71' } : {}),
});
unitBytes = Object.entries({ ...unit, ...(fault === 'queued-job' ? { Job: '71' } : {}) })
  .map(([key, value]) => key + '=' + value + '\n')
  .join('');
const { symbols } = dlopen('libc.so.6', {
  flock: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
});
const locks: number[] = [];
for (const lock of packet.quiescence.locks) {
  await write(lock.path, '');
  const fd = filesystem.openSync(root + lock.path, filesystem.constants.O_RDWR);
  if (symbols.flock(fd, 6) !== 0) throw new Error('fixture lock acquisition failed');
  locks.push(fd);
  Object.assign(lock, {
    descriptor: fd,
    device: (await pin(lock.path)).device,
    inode: (await pin(lock.path)).inode,
  });
}
process.env['WBS_EDGE_LOCK_FD'] = String(locks[0]);
if (fault === 'forged-lock')
  process.env['WBS_EDGE_LOCK_FD'] = String(
    filesystem.openSync(root + packet.quiescence.locks[0].path, filesystem.constants.O_RDWR),
  );
if (fault === 'owner-marker')
  await write('/home/puni1/wbs/state/edge-owner.pending', 'PRIVATE_FACTORY_SECRET');
const version = { ApiVersion: '1.52', Os: 'linux', Version: '29.1.3' };
const info = {
  ID: 'factory-daemon',
  Name: 'factory',
  DockerRootDir: '/var/lib/docker',
  Driver: 'overlay2',
  OperatingSystem: 'fixture',
  OSType: 'linux',
  Architecture: 'x86_64',
  KernelVersion: 'fixture',
  InitBinary: 'docker-init',
  InitCommit: { ID: 'fixture' },
  ServerVersion: '29.1.3',
  CgroupVersion: '2',
  CgroupDriver: 'systemd',
  SecurityOptions: [],
  LiveRestoreEnabled: false,
};
packet.daemonVersionSha256 = fingerprint(version);
packet.daemonInfoSha256 = fingerprint(info);
const networkId = '1'.repeat(64);
const network = {
  Id: networkId,
  Name: 'edge',
  Driver: 'bridge',
  Scope: 'local',
  Internal: false,
  Attachable: false,
  Ingress: false,
  EnableIPv6: false,
  IPAM: {
    Driver: 'default',
    Options: null,
    Config: [{ Subnet: '172.29.0.0/24', Gateway: '172.29.0.1' }],
  },
  Options: {},
  Labels: {},
};
const auxiliaryNetwork = {
  ...structuredClone(network),
  Id: '2'.repeat(64),
  Name: 'auxiliary',
  IPAM: {
    Driver: 'default',
    Options: null,
    Config: [{ Subnet: '172.30.0.0/24', Gateway: '172.30.0.1' }],
  },
};
const networkConfigurations = [network, auxiliaryNetwork];
type Container = ReturnType<typeof syntheticContainer>;
const containers = new Map<string, Container>();
const images = new Map<string, unknown>();
const volumes = new Map<string, unknown>();
const processPaths: string[] = ['/proc/200011', '/proc/200012', '/proc/200021'];
async function processFixture(pid: number, id: string, executable: string, address: string) {
  const base = '/proc/' + String(pid),
    group = '/system.slice/docker-' + id + '.scope';
  processPaths.push(base);
  await write(
    base + '/stat',
    String(pid) + ' (fixture) S 1 ' + '0 '.repeat(17) + String(pid * 10) + ' 0',
  );
  await write(base + '/cgroup', '0::' + group + '\n');
  await write(base + '/status', 'Uid:\t1000\t1000\t1000\t1000\nNSpid:\t' + String(pid) + '\t1\n');
  await write(base + '/cmdline', '/sbin/docker-init\0--\0fixture\0');
  await write(base + '/exe', executable);
  await write(
    base + '/net/route',
    'Iface\tDestination\tGateway\tFlags\tRefCnt\tUse\tMetric\tMask\tMTU\tWindow\tIRTT\neth0 00000000 01001DAC 0003 0 0 0 00000000 0 0 0\neth0 00001DAC 00000000 0001 0 0 0 00FFFFFF 0 0 0\n',
  );
  await write(base + '/net/fib_trie', '|-- ' + address + '\n /32 host LOCAL\n');
  for (const name of ['if_inet6', 'ipv6_route']) await write(base + '/net/' + name, '');
  for (const name of ['tcp', 'tcp6'])
    await write(base + '/net/' + name, '  sl  local_address rem_address   st\n');
  await files.mkdir(root + base + '/ns', { recursive: true });
  for (const name of ['net', 'pid'])
    await files.symlink(name + ':[' + String(pid) + ']', root + base + '/ns/' + name);
  await write('/sys/fs/cgroup' + group + '/cgroup.procs', String(pid) + '\n');
  await write('/sys/fs/cgroup' + group + '/cgroup.events', 'populated 1\n');
  return group;
}
for (const [index, target] of packet.targets.entries()) {
  const native = syntheticContainer();
  native.Id = target.id;
  native.Name = '/wbs-' + target.kind + '-1';
  native.Image = 'sha256:' + hash(target.kind + ' image');
  Reflect.deleteProperty(native.Config, 'OnBuild');
  Object.assign(native.Config.Labels, {
    'com.docker.compose.service': target.kind,
    'com.docker.compose.project.config_files': target.composeFiles.join(','),
  });
  Object.assign(native.HostConfig, { OomKillDisable: null });
  native.Config.Image = target.kind + ':fixture';
  native.Config.Env = ['EMPTY=', 'FIXTURE=' + target.kind];
  native.State.Pid = 200001 + index;
  native.NetworkSettings.SandboxID = hash(target.kind + ' sandbox');
  native.NetworkSettings.SandboxKey = '/var/run/docker/netns/' + target.kind;
  const endpoint = native.NetworkSettings.Networks.edge;
  Object.assign(endpoint, {
    NetworkID: networkId,
    Aliases: [target.kind],
    EndpointID: hash(target.kind + ' endpoint'),
    Gateway: '172.29.0.1',
    IPAddress: '172.29.0.' + String(2 + index),
    IPPrefixLen: 24,
  });
  if (index === 1)
    Object.assign(native.NetworkSettings.Networks, {
      auxiliary: {
        ...structuredClone(endpoint),
        NetworkID: auxiliaryNetwork.Id,
        Gateway: '172.30.0.1',
        IPAddress: '172.30.0.3',
        EndpointID: hash('caddy auxiliary endpoint'),
      },
    });
  const resourcePath =
    target.kind === 'caddy' ? '/home/puni1/wbs/caddy' : '/var/lib/docker/volumes/registry/_data';
  if (index === 1) {
    native.Config.Cmd = [
      'caddy',
      'run',
      '--config',
      '/etc/caddy/Caddyfile',
      '--adapter',
      'caddyfile',
    ];
    native.Mounts = [
      {
        Type: 'bind',
        Name: '',
        Source: resourcePath,
        Destination: '/etc/caddy',
        Driver: '',
        Mode: 'ro',
        RW: false,
        Propagation: 'rprivate',
      },
    ];
    native.HostConfig.Binds = [resourcePath + ':/etc/caddy:ro'];
  } else {
    native.Mounts[0].Source = resourcePath;
    await write(resourcePath + '/blob', 'fixture registry bytes');
  }
  const volume = {
    Name: 'registry',
    Driver: 'local',
    Mountpoint: resourcePath,
    Labels: {},
    Scope: 'local',
    Options: null,
  };
  if (index === 0) volumes.set('registry', volume);
  const image = { Id: native.Image, Config: { Env: ['FIXTURE=' + target.kind] } };
  images.set(native.Image, image);
  const group = await processFixture(
    native.State.Pid,
    native.Id,
    target.kind + ' process executable',
    endpoint.IPAddress,
  );
  Object.assign(target, {
    image: native.Image,
    imageSha256: fingerprint(image),
    envSha256: hash(encodeOrderedEnv(native.Config.Env)),
    defaultRouteNetwork: networkId,
    networks: [network, ...(index === 1 ? [auxiliaryNetwork] : [])].map((configuration) => ({
      id: configuration.Id,
      name: configuration.Name,
      sha256: fingerprint(configuration),
    })),
  });
  Object.assign(target.process, {
    startTime: String(native.State.Pid * 10),
    cgroup: group,
    executableSha256: hash(target.kind + ' process executable'),
    netNamespace: 'net:[' + String(native.State.Pid) + ']',
    pidNamespace: 'pid:[' + String(native.State.Pid) + ']',
  });
  const metadata = await files.lstat(root + resourcePath),
    parents = [];
  let parent = dirname(resourcePath);
  for (let depth = 0; depth < 64; depth++) {
    const ancestor = await files.lstat(root + (parent === '/' ? '' : parent));
    parents.push({
      path: parent,
      device: String(ancestor.dev),
      inode: String(ancestor.ino),
      mode: ancestor.mode & 0o7777,
    });
    if (parent === '/') break;
    parent = dirname(parent);
  }
  Object.assign(target, {
    resources: [
      {
        kind: target.kind === 'caddy' ? 'bind' : 'volume',
        name: target.kind === 'caddy' ? null : 'registry',
        path: resourcePath,
        type: 'directory',
        device: String(metadata.dev),
        inode: String(metadata.ino),
        mode: metadata.mode & 0o7777,
        uid: metadata.uid,
        parentsSha256: fingerprint(parents),
        volumeSha256: target.kind === 'caddy' ? null : fingerprint(volume),
      },
    ],
  });
  containers.set(native.Id, native);
}
const backend = syntheticContainer();
backend.Id = packet.backends[0].id;
backend.Name = '/wbs-backend-1';
Reflect.deleteProperty(backend.Config, 'OnBuild');
backend.Config.Labels = { 'com.docker.compose.service': 'backend' };
backend.NetworkSettings.Networks.edge.Aliases = ['backend'];
backend.State.Pid = 200004;
backend.NetworkSettings.SandboxID = hash('backend sandbox');
backend.NetworkSettings.SandboxKey = '/var/run/docker/netns/backend';
Object.assign(backend.NetworkSettings.Networks.edge, {
  NetworkID: networkId,
  EndpointID: hash('backend endpoint'),
  Gateway: '172.29.0.1',
  IPAddress: '172.29.0.20',
  IPPrefixLen: 24,
});
containers.set(backend.Id, backend);
packet.backends[0].image = backend.Image;
const caddyDirectory = await files.lstat(root + dirname(packet.caddy.root));
packet.caddy.directoryDevice = String(caddyDirectory.dev);
packet.caddy.directoryInode = String(caddyDirectory.ino);
packet.caddy.files = [await pin(packet.caddy.root)];
packet.caddy.directoryEntriesSha256 = fingerprint([{ name: 'Caddyfile', kind: 'file' }]);
packet.caddy.importGraphSha256 = fingerprint({
  root: packet.caddy.root,
  files: packet.caddy.files.map(({ path, sha256 }) => ({ path, sha256 })),
});
packet.daemonPid = 200003;
packet.daemonStartTime = String(packet.daemonPid * 10);
await processFixture(packet.daemonPid, 'daemon', 'synthetic dockerd executable', '172.29.0.4');
await write('/run/docker.pid', String(packet.daemonPid) + '\n');
await write('/sys/fs/cgroup' + packet.quiescence.originalSolverCgroup.path + '/cgroup.procs', '');
await write(
  '/sys/fs/cgroup' + packet.quiescence.originalSolverCgroup.path + '/cgroup.events',
  fault === 'populated-cgroup' ? 'populated 1\n' : 'populated 0\n',
);
for (const [index, database] of packet.quiescence.databases.entries()) {
  database.directoryIdentity = '7:' + String(index === 0 ? 10 : 20);
  database.fileIdentity = database.directoryIdentity;
}
if (fault === 'new-launcher') {
  await processFixture(200021, 'new-launcher', 'synthetic launcher executable', '172.29.0.21');
  await write('/proc/200021/cmdline', '/usr/bin/bun\0/home/puni1/wbs/bin/swap.js\0');
  await files.mkdir(root + '/proc/200021/fd', { recursive: true });
}
const groupMetadata = await files.lstat(
  root + '/sys/fs/cgroup' + packet.quiescence.originalSolverCgroup.path,
);
Object.assign(packet.quiescence.originalSolverCgroup, {
  device: String(groupMetadata.dev),
  inode: String(groupMetadata.ino),
});
const fixturePython = AUTHORITY_FIXTURE_PROGRAM.replace('os.geteuid=lambda:0', '').replace(
  'pwd.getpwnam=lambda name:SimpleNamespace(pw_uid=1000)',
  '',
);
pythonWrapper =
  '\n' +
  fixturePython +
  '\n' +
  String.raw`
ROOT=__ROOT__
FIXTURE_FAULT=__FAULT__
SYNTHETIC=__SYNTHETIC__
RAW_HOST=Host
RAW_OPEN=os.open
class FactoryHost(Complete):
    def __init__(self,request,kernel=None):
        super().__init__();self.request=request;self.deadline=time.monotonic()+100;self.actual=RAW_HOST(self.deadline);self.fixture_reads=0
        self.internal_processes={} if kernel is None else dict(kernel.internal_processes)
    def mapped(self,path):return ROOT+path
    def virtual(self,path):return any(path==base or path.startswith(base+'/') for base in SYNTHETIC) or path.startswith('/sys/fs/cgroup') or path=='/run/docker.pid'
    def read(self,path,limit):
        if self.virtual(path):
            content=self.actual.read(self.mapped(path),limit)
            if FIXTURE_FAULT=='recycled-pid' and path=='/proc/200001/stat':
                self.fixture_reads+=1
                if self.fixture_reads>1:
                    end=content.rfind(b') ');fields=content[end+2:].split();fields[19]=str(int(fields[19])+1).encode();content=content[:end+2]+b' '.join(fields)
            return content
        if path.startswith('/proc/') and path!='/proc/sys/kernel/random/boot_id':return self.actual.read(path,limit)
        return super().read(path,limit)
    def metadata(self,path,follow=True):
        if self.virtual(path):return os.stat(self.mapped(path),follow_symlinks=False if '/ns/' in path else follow)
        if path.startswith('/proc/'):return self.actual.metadata(path,follow)
        if path.startswith('/home/puni1/wbs/') or path.startswith('/var/lib/docker/volumes/') or path=='/' or path in ['/home','/home/puni1','/home/puni1/wbs','/var','/var/lib','/var/lib/docker','/var/lib/docker/volumes']:
            if os.path.exists(self.mapped(path)):return os.stat(self.mapped(path),follow_symlinks=follow)
        return super().metadata(path,follow)
    def listing(self,path,limit):
        if self.virtual(path):return self.actual.listing(self.mapped(path),limit)
        if path=='/proc':return sorted([str(self.request['coordinator']['pid'])]+[str(pid) for pid in self.internal_processes]+(['200021'] if FIXTURE_FAULT=='new-launcher' else []))
        if path.startswith('/proc/'):return RAW_HOST.listing(self,path,limit)
        if path.startswith('/home/puni1/wbs/') or path.startswith('/var/lib/docker/volumes/'):return self.actual.listing(self.mapped(path),limit)
        return super().listing(path,limit)
    def link(self,path):
        if self.virtual(path):
            if path.endswith('/exe'):return '/home/puni1/wbs/bin/swap.js'
            if path.endswith('/cwd'):return '/home/puni1/wbs-build'
            return os.readlink(self.mapped(path))
        if path=='/proc/1/ns/net':return 'net:[1]'
        if path=='/proc/1/ns/pid':return 'pid:[1]'
        if path.startswith('/proc/'):return self.actual.link(path)
        return super().link(path)
    def regular(self,path,limit):
        if self.virtual(path):
            named=self.mapped(path);metadata=os.stat(named)
            with open(named,'rb') as stream:return stream.read(limit),metadata_key(metadata)
        return super().regular(path,limit)
    def query(self,argv):
        if '/usr/bin/crontab' in argv and argv[-2]=='puni1':return 0,b'# suspended fixture\n',b''
        return super().query(argv)
def fixture_worker(request,kernel):
    global REQUEST
    REQUEST=request
    host=FactoryHost(request,kernel)
    # Only the worker's raw privilege/user boundary belongs to the synthetic host.
    # The supervisor's native containment and transport identity remain actual kernel observations.
    os.geteuid=lambda:0
    pwd.getpwnam=lambda name:SimpleNamespace(pw_uid=1000)
    def fixture_open(path,flags,*args,**kwargs):
        if type(path)==str and any(path.startswith(base+'/') for base in SYNTHETIC):path=ROOT+path
        return RAW_OPEN(path,flags,*args,**kwargs)
    os.open=fixture_open
    try:
        observed=read_init(request,host) if 'pids' in request else collect(request,host)
        if FIXTURE_FAULT=='collector-descendant' and 'pids' not in request:subprocess.Popen(['/usr/bin/python3','-I','-c','import time;time.sleep(30)'])
        return observed
    except BaseException:
        import traceback
        with open(ROOT+'/python-error','w') as stream:traceback.print_exc(file=stream)
        raise
`
    .replace('__ROOT__', JSON.stringify(root))
    .replace('__SYNTHETIC__', JSON.stringify(processPaths))
    .replace('__FAULT__', JSON.stringify(fault));
const { AUTHORITY_COLLECTOR } = await import('../lib/installed-authority-collector');
const launchProgram =
  AUTHORITY_COLLECTOR +
  '\n' +
  pythonWrapper +
  '\nREQUEST={"coordinator":{"pid":' +
  String(process.pid) +
  '}}\nprint(collect_launch(FactoryHost(REQUEST),[]))\n';
const launchChild = originalBunSpawn(['/usr/bin/python3', '-I', '-c', launchProgram], {
  stdout: 'pipe',
  stderr: 'pipe',
});
const [launchHash, launchError, launchCode] = await Promise.all([
  new Response(launchChild.stdout).text(),
  new Response(launchChild.stderr).text(),
  launchChild.exited,
]);
if (launchCode !== 0) throw new Error('fixture launch pin failed: ' + launchError);
packet.quiescence.authorityPins.launchConfigurationSha256 = launchHash.trim();
const tlsRoot = process.env['INIT_FACTORY_TLS'];
if (tlsRoot === undefined) throw new Error('fixture TLS directory missing');
const tls = https.createServer(
  {
    key: await files.readFile(tlsRoot + '/key.pem'),
    cert: await files.readFile(tlsRoot + '/cert.pem'),
  },
  (request, response) => {
    reads.push('probe:' + (request.url ?? ''));
    if (fault === 'public-redirect' && request.url === '/') {
      response.writeHead(302, { Location: '/unexpected' });
      response.end('fixed');
      return;
    }
    if (
      request.headers.authorization !==
        'Basic ' + Buffer.from('factory:PRIVATE_FACTORY_SECRET').toString('base64') &&
      request.url?.startsWith('/v2/')
    ) {
      response.writeHead(401);
      response.end();
      return;
    }
    if (request.url === '/v2/') {
      if (fault === 'registry-challenge')
        response.setHeader('WWW-Authenticate', 'Basic realm=changed');
      response.setHeader('Docker-Distribution-Api-Version', 'registry/2.0');
      response.end('{}');
      return;
    }
    if (request.url?.startsWith('/v2/fixture/service/manifests/')) {
      response.setHeader('Content-Type', packet.registry.manifestMediaType);
      response.setHeader(
        'Docker-Content-Digest',
        fault === 'manifest-digest' ? 'sha256:' + hash('changed') : packet.registry.manifestDigest,
      );
      response.end(fault === 'manifest-body' ? 'PRIVATE_FACTORY_SECRET' : manifestBody);
      return;
    }
    response.end(fault === 'public-body' ? 'PRIVATE_FACTORY_SECRET' : 'fixed');
  },
);
const upgrades = new Set<Duplex>();
tls.on('upgrade', (request, socket) => {
  reads.push('upgrade:' + (request.url ?? ''));
  if (request.url !== '/ws' || typeof request.headers['sec-websocket-key'] !== 'string')
    throw new Error('fixture unexpected upgrade request');
  const accept = createHash('sha1')
    .update(request.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');
  upgrades.add(socket);
  socket.once('close', () => {
    upgrades.delete(socket);
  });
  socket.on('data', () => {
    socket.end(Buffer.from([0x88, 0x02, 0x03, 0xe8]));
  });
  socket.on('end', () => {
    socket.end();
  });
  if (fault === 'websocket-rejected') {
    socket.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
    return;
  }
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' +
      (fault === 'websocket-accept' ? 'malformed' : accept) +
      '\r\n\r\n',
  );
});
tls.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => tls.once('listening', resolve));
const tlsAddress = tls.address();
if (tlsAddress === null || typeof tlsAddress === 'string')
  throw new Error('fixture TLS port missing');
packet.registry.address.port = tlsAddress.port;
packet.public.probes[0].address.port = tlsAddress.port;
packet.public.probes[0].expectedBodySha256 = hash('fixed');
packet.registry.v2BodySha256 = hash('{}');
packet.registry.manifestDigest = 'sha256:' + hash(manifestBody);
Object.assign(packet.public, {
  probes: [
    ...packet.public.probes,
    {
      kind: 'websocket',
      id: 'wss',
      routeId: hash('websocket route'),
      address: { ...packet.public.probes[0].address },
      path: '/ws',
      origin: null,
      requestedProtocol: null,
      expectedProtocol: null,
    },
  ],
});
if (fault === 'wrong-tls-name') {
  packet.registry.address.host = 'wrong.invalid';
  packet.public.probes[0].address.host = 'wrong.invalid';
}
if (fault === 'wrong-connect') {
  packet.registry.address.connectAddress = '127.0.0.2';
  packet.public.probes[0].address.connectAddress = '127.0.0.2';
}
let execIndex = 0;
const execs = new Map<string, string>();
const execCommands = new Map<string, 'adapt' | 'live'>();
let networkRaceArmed = false;
let networkRaceInjected = false;
let rawInventoryChanged = false;
const originalCopies = packet.targets.map((target) => {
  const native = containers.get(target.id);
  if (native === undefined) throw new Error('missing fixture original');
  return structuredClone(native);
});
const candidates = new Map<string, Container>();
/** Models the sanitized captured created endpoint shape; the exact production profile/context must admit it.
 * Native acceptance remains a separate authorized run; this worker executes only synthetic raw IO.
 */
function candidateFixture(index: number): Container {
  const original = originalCopies.at(index);
  if (original === undefined) throw new Error('fixture target index invalid');
  const native = structuredClone(original);
  native.Id = hash('candidate ' + String(index));
  native.Name = '/wbs-init-' + packet.nonce + '-' + (index === 0 ? 'registry' : 'caddy');
  native.Config.Image = native.Image;
  native.HostConfig.Init = true;
  Object.assign(native.HostConfig, { OomKillDisable: false });
  native.State.Running = false;
  native.State.Status = 'created';
  native.State.Pid = 0;
  native.State.StartedAt = '0001-01-01T00:00:00Z';
  native.NetworkSettings.SandboxID = '';
  native.NetworkSettings.SandboxKey = '';
  native.NetworkSettings.Ports = {};
  for (const endpoint of Object.values(native.NetworkSettings.Networks))
    Object.assign(endpoint, {
      NetworkID: '',
      EndpointID: '',
      Gateway: '',
      IPv6Gateway: '',
      IPAddress: '',
      IPPrefixLen: 0,
      GlobalIPv6Address: '',
      GlobalIPv6PrefixLen: 0,
      MacAddress: '',
      DNSNames: null,
    });
  return native;
}
async function stopFixture(native: Container) {
  const pid = native.State.Pid;
  const group = '/system.slice/docker-' + native.Id + '.scope';
  native.State.Pid = 0;
  native.State.Running = false;
  native.State.Status = 'exited';
  native.State.FinishedAt = '2026-10-24T00:01:00Z';
  native.NetworkSettings.SandboxID = '';
  native.NetworkSettings.SandboxKey = '';
  native.NetworkSettings.Ports = {};
  for (const endpoint of Object.values(native.NetworkSettings.Networks))
    Object.assign(endpoint, {
      EndpointID: '',
      Gateway: '',
      IPv6Gateway: '',
      IPAddress: '',
      IPPrefixLen: 0,
      GlobalIPv6Address: '',
      GlobalIPv6PrefixLen: 0,
      MacAddress: '',
      DNSNames: null,
    });
  await files.rm(root + '/proc/' + String(pid), { recursive: true });
  await write('/sys/fs/cgroup' + group + '/cgroup.procs', '');
  await write('/sys/fs/cgroup' + group + '/cgroup.events', 'populated 0\n');
}
async function startFixture(native: Container, index: number) {
  Object.assign(native.HostConfig, { OomKillDisable: null });
  native.State.Pid = 200011 + index;
  native.State.Running = true;
  native.State.Status = 'running';
  native.State.StartedAt = '2026-10-24T00:02:00Z';
  native.State.FinishedAt = '0001-01-01T00:00:00Z';
  native.NetworkSettings.SandboxID = hash('candidate sandbox ' + String(index));
  native.NetworkSettings.SandboxKey = '/var/run/docker/netns/candidate-' + String(index);
  const target = packet.targets.at(index);
  if (target === undefined) throw new Error('fixture start target unavailable');
  for (const [name, endpoint] of Object.entries(native.NetworkSettings.Networks)) {
    const pin = target.networks.find((pin) => pin.name === name);
    if (pin === undefined) throw new Error('fixture start network not independently pinned');
    Object.assign(endpoint, {
      NetworkID: pin.id,
      EndpointID: hash('candidate endpoint ' + String(index) + ' ' + name),
      Gateway: name === 'edge' ? '172.29.0.1' : '172.30.0.1',
      IPAddress: (name === 'edge' ? '172.29.0.' : '172.30.0.') + String(12 + index),
      IPPrefixLen: 24,
    });
  }
  await processFixture(
    native.State.Pid,
    native.Id,
    'synthetic docker-init executable',
    native.NetworkSettings.Networks.edge.IPAddress,
  );
}
async function readRequest(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const bytes: unknown = chunk;
    if (!(bytes instanceof Uint8Array)) throw new Error('fixture request emitted nonbytes');
    chunks.push(Buffer.from(bytes));
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}
const server = http.createServer((request, response) => {
  void serveEngine(request, response).catch((cause: unknown) => {
    response.destroy(cause instanceof Error ? cause : new Error('fixture Engine failure'));
  });
});
async function serveEngine(request: IncomingMessage, response: httpModule.ServerResponse) {
  const path = (request.url ?? '').replace(/^\/v1\.52/, '');
  const method = request.method ?? 'GET';
  reads.push(method + ' ' + path);
  const reply = (status: number, body: unknown) => {
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(body));
  };
  if (path === '/version') {
    if (fault === 'engine-secret-error') {
      reply(500, { message: 'PRIVATE_FACTORY_SECRET' });
      return;
    }
    reply(200, version);
    return;
  }
  if (path === '/info') {
    reply(200, info);
    return;
  }
  if (path === '/containers/json?all=1') {
    reply(
      200,
      [...containers.values()].map((native) => ({ Id: native.Id, Names: [native.Name] })),
    );
    return;
  }
  const inspect = /^\/containers\/([^/]+)\/json$/.exec(path);
  if (inspect) {
    const native =
      containers.get(inspect[1]) ??
      [...containers.values()].find((native) => native.Name === '/' + inspect[1]);
    if (
      fault === 'network-stable-read' &&
      networkRaceArmed &&
      !networkRaceInjected &&
      native !== undefined &&
      candidates.has(native.Id) &&
      native.State.Status === 'created'
    ) {
      networkRaceArmed = false;
      networkRaceInjected = true;
      reply(200, { ...native, Config: { ...native.Config, Hostname: 'single-read-substitution' } });
      return;
    }
    if (
      clockFault &&
      clockRegistryAdvanced &&
      !clockWallRolledBack &&
      fault === 'clock-rollback' &&
      native?.Id === packet.targets[1].id &&
      [...candidates.values()].some(
        (candidate) =>
          candidate.Config.Labels['com.docker.compose.service'] === 'registry' &&
          candidate.State.Running,
      )
    ) {
      shiftClock('wall-rollback-before-caddy-reset', 0, -150000);
      clockWallRolledBack = true;
    }
    if (clockFault && clockStopApplied && native?.Id === packet.targets[1].id) {
      reply(503, { message: 'PRIVATE_FACTORY_SECRET bounded clock witness stop' });
      return;
    }
    if (fault.startsWith('label-') && native?.Id === packet.targets[1].id) {
      const labels = {
        ...native.Config.Labels,
        'com.docker.compose.project.config_files':
          fault === 'label-reordered'
            ? [...packet.targets[1].composeFiles].reverse().join(',')
            : fault === 'label-duplicated'
              ? [...packet.targets[1].composeFiles, packet.targets[1].composeFiles[0]].join(',')
              : fault === 'label-unpinned'
                ? packet.targets[1].composeFiles.join(',') + ',/home/puni1/wbs/unpinned.yml'
                : packet.targets[0].composeFiles.join(','),
      };
      reply(200, { ...native, Config: { ...native.Config, Labels: labels } });
      return;
    }
    if (fault === 'inventory-unknown' && native?.Id === hash('unknown-inventory')) {
      reply(404, { message: 'PRIVATE_FACTORY_SECRET' });
      return;
    }
    if (fault === 'native-malformed' && native !== undefined) {
      reply(200, { ...native, State: { ...native.State, Pid: 'PRIVATE_FACTORY_SECRET' } });
      return;
    }
    reply(native ? 200 : 404, native ?? {});
    return;
  }
  const image = /^\/images\/(.+)\/json$/.exec(path);
  if (image) {
    reply(200, images.get(image[1]));
    return;
  }
  const selectedNetwork = networkConfigurations.find(
    (configuration) =>
      path === '/networks/' + configuration.Id || path === '/networks/' + configuration.Name,
  );
  if (selectedNetwork !== undefined) {
    if (fault === 'network-missing') {
      reply(404, { message: 'PRIVATE_FACTORY_SECRET' });
      return;
    }
    const byName = path === '/networks/' + selectedNetwork.Name;
    const active = candidates.size > 0;
    const inert = [...candidates.values()].find((native) => native.State.Status === 'created');
    if (active && byName && fault === 'network-name-missing') {
      reply(404, { message: 'PRIVATE_FACTORY_SECRET' });
      return;
    }
    if (active && byName && fault === 'network-name-unreadable') {
      reply(503, { message: 'PRIVATE_FACTORY_SECRET' });
      return;
    }
    if (active && byName && fault === 'network-malformed') {
      reply(200, []);
      return;
    }
    if (active && byName && fault === 'network-stable-read' && inert !== undefined)
      networkRaceArmed = true;
    if (byName && fault === 'raw-inventory-drift' && !rawInventoryChanged) {
      const unrelated = containers.get(hash('unrelated-created'));
      if (unrelated === undefined) throw new Error('fixture unrelated inventory absent');
      unrelated.Config.Hostname = 'changed-unrelated-native';
      rawInventoryChanged = true;
    }
    const members = Object.fromEntries(
      [...containers.values()]
        .filter(
          (native) =>
            native.State.Running &&
            Object.values(native.NetworkSettings.Networks).some(
              (endpoint) => endpoint.NetworkID === selectedNetwork.Id,
            ),
        )
        .map((native) => [native.Id, {}]),
    );
    if (
      inert !== undefined &&
      ((fault === 'network-membership-name' && byName) ||
        (fault === 'network-membership-id' && !byName))
    )
      members[inert.Id] = {};
    const configuration = {
      ...selectedNetwork,
      ...(active && fault === 'network-name-substitution' && byName
        ? { Id: hash('replacement network') }
        : {}),
      ...(active && fault === 'network-id-owner' && !byName ? { Name: 'foreign-network' } : {}),
      ...(active && fault === 'network-config-drift' && byName
        ? { Options: { 'fixture.changed': 'true' } }
        : {}),
    };
    reply(200, {
      ...configuration,
      Containers: active && fault === 'network-membership-malformed' && byName ? 0 : members,
    });
    return;
  }
  const volume = /^\/volumes\/(.+)$/.exec(path);
  if (volume) {
    reply(200, volumes.get(volume[1]));
    return;
  }
  const exec = /^\/containers\/([^/]+)\/exec$/.exec(path);
  if (exec) {
    const id = exec[1];
    if (containers.get(id)?.Name !== '/wbs-caddy-1')
      throw new Error('fixture Caddy exec attribution failed');
    const chunks = [];
    for await (const chunk of request) {
      const bytes: unknown = chunk;
      if (!(bytes instanceof Uint8Array)) throw new Error('fixture request emitted nonbytes');
      chunks.push(Buffer.from(bytes));
    }
    const decoded: unknown = JSON.parse(Buffer.concat(chunks).toString());
    if (
      typeof decoded !== 'object' ||
      decoded === null ||
      !('Cmd' in decoded) ||
      !Array.isArray(decoded.Cmd) ||
      !decoded.Cmd.every((part: unknown) => typeof part === 'string')
    )
      throw new Error('fixture exec request malformed');
    const command: unknown[] = decoded.Cmd;
    const expected =
      command[0] === 'caddy'
        ? ['caddy', 'adapt', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile']
        : ['wget', '-qO-', 'http://127.0.0.1:2019/config/'];
    if (JSON.stringify(command) !== JSON.stringify(expected))
      throw new Error('fixture exec argv differs');
    const token = hash('exec' + String(++execIndex));
    execs.set(token, id);
    execCommands.set(token, command[0] === 'caddy' ? 'adapt' : 'live');
    reply(201, { Id: token });
    return;
  }
  const execStart = /^\/exec\/([^/]+)\/start$/.exec(path);
  if (execStart) {
    const liveConfiguration =
      fault === 'live-config' && execCommands.get(execStart[1]) === 'live'
        ? { ...configuration, private: 'PRIVATE_FACTORY_SECRET' }
        : configuration;
    const content = Buffer.from(JSON.stringify(liveConfiguration)),
      header = Buffer.alloc(8);
    header[0] = fault === 'exec-malformed-frame' ? 3 : 1;
    header.writeUInt32BE(content.length, 4);
    response.writeHead(200, { 'Content-Type': 'application/vnd.docker.raw-stream' });
    const diagnostic = Buffer.from('PRIVATE_FACTORY_SECRET'),
      stderrHeader = Buffer.alloc(8);
    stderrHeader[0] = 2;
    stderrHeader.writeUInt32BE(diagnostic.length, 4);
    response.end(
      Buffer.concat(
        fault === 'exec-stderr' ? [header, content, stderrHeader, diagnostic] : [header, content],
      ),
    );
    return;
  }
  const execRead = /^\/exec\/([^/]+)\/json$/.exec(path);
  if (execRead) {
    reply(200, {
      ID: execRead[1],
      ContainerID: fault === 'exec-wrong-container' ? packet.targets[0].id : execs.get(execRead[1]),
      Running: fault === 'exec-nonterminal',
      ExitCode: 0,
    });
    return;
  }
  if (method !== 'GET') {
    transcript.push(method + ' ' + path);
    if (clockFault)
      clockEffects.push({
        route: method + ' ' + path,
        monotonic: performance.now(),
        wall: Date.now(),
        applied: false,
      });
  }
  const create = /^\/containers\/create\?name=wbs-init-fixture-(registry|caddy)$/.exec(path);
  if (method === 'POST' && create) {
    const index = create[1] === 'registry' ? 0 : 1,
      native = candidateFixture(index),
      body = await readRequest(request),
      original = originalCopies.at(index);
    if (original === undefined) throw new Error('fixture original unavailable');
    const expected = {
      ...native.Config,
      HostConfig: { ...original.HostConfig, Init: true },
      NetworkingConfig: {
        EndpointsConfig: Object.fromEntries(
          Object.values(original.NetworkSettings.Networks).map((endpoint) => [
            endpoint.NetworkID,
            {
              IPAMConfig: endpoint.IPAMConfig,
              Links: endpoint.Links,
              Aliases: endpoint.Aliases,
              DriverOpts: endpoint.DriverOpts,
              GwPriority: endpoint.GwPriority,
            },
          ]),
        ),
      },
    };
    if (fingerprint(body) !== fingerprint(expected))
      throw new Error('fixture create request differs from independent model');
    if (fault === 'created-wrong-id')
      native.NetworkSettings.Networks.edge.NetworkID = hash('foreign endpoint network');
    if (fault === 'created-extra-name')
      Object.assign(native.NetworkSettings.Networks, {
        unreviewed: structuredClone(native.NetworkSettings.Networks.edge),
      });
    if (fault === 'created-alias-drift')
      native.NetworkSettings.Networks.edge.Aliases = ['substituted'];
    if (fault === 'created-gateway') native.NetworkSettings.Networks.edge.Gateway = '172.29.0.1';
    if (fault === 'created-ipv6-gateway') native.NetworkSettings.Networks.edge.IPv6Gateway = '::1';
    if (fault === 'created-mac')
      native.NetworkSettings.Networks.edge.MacAddress = '02:00:00:00:00:01';
    if (fault === 'created-prefix') native.NetworkSettings.Networks.edge.IPPrefixLen = 24;
    if (fault === 'created-ipv6-prefix')
      native.NetworkSettings.Networks.edge.GlobalIPv6PrefixLen = 64;
    if (fault === 'created-dns')
      Object.assign(native.NetworkSettings.Networks.edge, { DNSNames: ['unexpected'] });
    if (fault === 'created-sandbox') native.NetworkSettings.SandboxID = hash('unexpected sandbox');
    if (fault === 'created-process') native.State.Pid = 200099;
    if (fault === 'created-ports')
      Object.assign(native.NetworkSettings, {
        Ports: { '5000/tcp': [{ HostIp: '127.0.0.1', HostPort: '5000' }] },
      });
    containers.set(native.Id, native);
    candidates.set(native.Id, native);
    if (clockFault) {
      const effect = clockEffects.at(-1);
      if (effect === undefined) throw new Error('clock create witness missing');
      effect.applied = true;
      if (index === 0 && !clockRegistryAdvanced) {
        shiftClock('registry-create-150s', 150000, 150000);
        clockRegistryAdvanced = true;
      }
      if (index === 1 && fault === 'clock-rollback' && !clockCaddyAdvanced) {
        shiftClock('caddy-create-220s', 220000, 0);
        clockCaddyAdvanced = true;
      }
    }
    reply(201, { Id: native.Id, Warnings: [] });
    return;
  }
  const mutation = /^\/containers\/([a-f0-9]{64})(?:\/(stop|rename|start))?(?:\?(.*))?$/.exec(path);
  if (mutation && (method === 'POST' || method === 'DELETE')) {
    const native = containers.get(mutation[1]);
    if (native === undefined) throw new Error('fixture mutation unknown container');
    if (method === 'DELETE') {
      containers.delete(native.Id);
      response.writeHead(204);
      response.end();
      return;
    }
    if (mutation[2] === 'stop') await stopFixture(native);
    else if (mutation[2] === 'rename') {
      const name = new URLSearchParams(mutation[3]).get('name');
      if (name === null) throw new Error('fixture rename missing name');
      native.Name = '/' + name;
    } else if (mutation[2] === 'start')
      await startFixture(
        native,
        native.Config.Labels['com.docker.compose.service'] === 'registry' ? 0 : 1,
      );
    else throw new Error('fixture unsupported mutation');
    if (clockFault) {
      const effect = clockEffects.at(-1);
      if (effect === undefined) throw new Error('clock mutation witness missing');
      effect.applied = true;
      if (mutation[2] === 'stop' && native.Id === packet.targets[1].id) clockStopApplied = true;
    }
    response.writeHead(204);
    response.end();
    return;
  }
  reply(500, { message: 'PRIVATE_FACTORY_SECRET unexpected route' });
}
await files.mkdir(dirname(socketPath), { recursive: true });
server.listen(socketPath);
await new Promise<void>((resolve) => server.once('listening', resolve));
const stages = [
  'create-intended',
  'created',
  'candidate-verified',
  'stop-intended',
  'original-stopped',
  'rename-original-intended',
  'rename-candidate-intended',
  'start-intended',
  'healthy',
];
const classes = [
  'before-create',
  'create-unacknowledged-no-candidate-observed',
  'candidate-inert',
  'original-stopped',
  'original-renamed',
  'candidate-renamed',
  'candidate-running-original-retained',
  'candidate-stopped-after-start',
  'candidate-running-original-absent',
];
async function recoveryFixture(packetPath: string) {
  const { projectInvariant, candidateInvariant, CREATED_PROFILE } =
    await import('../lib/edge-init');
  const { observeComposeDeclarations, publishInitReceipt } =
    await import('../lib/edge-init-observer');
  const { PrivateReceipts } = await import('../lib/edge-init-operation');
  const proofs = await observeComposeDeclarations(
    packet.targets.map((target, index) => ({
      kind: target.kind,
      original: parseNativeContainer(originalCopies[index]),
      nativeSha256: target.nativeSha256,
      roster: target.composeFiles,
    })),
    packet.provenance,
  );
  const invariants = await Promise.all(
    packet.targets.map(async (target, index) => {
      const original = originalCopies[index],
        native = parseNativeContainer(original),
        metadata = await files.lstat(root + '/sys/fs/cgroup' + target.process.cgroup);
      return {
        target: target.kind,
        original: target.id,
        originalInvariantSha256: fingerprint(
          projectInvariant(native, {
            profile: CREATED_PROFILE,
            owner: { role: 'original', id: native.id, phase: 'running' },
            networks: target.networks,
          }),
        ),
        candidateInvariantSha256: fingerprint(candidateInvariant(native, CREATED_PROFILE)),
        originalProcess: {
          pid: original.State.Pid,
          startTime: target.process.startTime,
          cgroup: target.process.cgroup,
          cgroupDevice: String(metadata.dev),
          cgroupInode: String(metadata.ino),
        },
      };
    }),
  );
  const runningHashes = new Map<string, string>();
  const evidenceCandidates = new Map<string, string>();
  const receipts = await PrivateReceipts.create(packet.receiptDirectory, packet.nonce);
  const requested = process.argv[3] ?? 'candidate-inert',
    selected = process.argv[4] === 'caddy' ? 1 : 0;
  if (
    !classes.includes(requested) &&
    requested !== 'complete' &&
    requested !== 'retained' &&
    requested !== 'registry-removed'
  )
    throw new Error('fixture recovery class unsupported');
  const whole =
    requested === 'complete' ||
    requested === 'retained' ||
    requested === 'registry-removed' ||
    requested === 'candidate-running-original-absent';
  const targetIndex = whole ? 1 : selected;
  const maximum =
    requested === 'before-create'
      ? -1
      : requested === 'create-unacknowledged-no-candidate-observed'
        ? 0
        : requested === 'candidate-inert'
          ? 1
          : requested === 'original-stopped'
            ? 3
            : requested === 'original-renamed'
              ? 5
              : requested === 'candidate-renamed'
                ? 6
                : 7;
  const publish = async (index: number, stage: string) => {
    const target = packet.targets.at(index),
      proof = proofs.at(index);
    if (target === undefined || proof === undefined)
      throw new Error('fixture receipt target unavailable');
    const candidate = evidenceCandidates.get(target.kind);
    await publishInitReceipt(
      receipts,
      {
        target: target.kind,
        original: target.id,
        stage,
        remaining: 60000,
        ...(candidate === undefined ? {} : { candidate }),
      },
      proof,
      hash(await files.readFile(root + packetPath)),
      {
        invariants,
        candidateProcesses: packet.targets.map((entry) => ({
          target: entry.kind,
          candidate: evidenceCandidates.get(entry.kind) ?? null,
          processSha256: runningHashes.get(entry.kind) ?? null,
        })),
      },
    );
  };
  const witness = async (native: Container) => {
    const group = '/system.slice/docker-' + native.Id + '.scope',
      metadata = await files.lstat(root + '/sys/fs/cgroup' + group),
      namespaces: Record<string, unknown> = {};
    for (const name of ['net', 'pid']) {
      const path = root + '/proc/' + String(native.State.Pid) + '/ns/' + name,
        ns = await files.lstat(path);
      namespaces[name] = {
        link: await files.readlink(path),
        device: String(ns.dev),
        inode: String(ns.ino),
      };
    }
    return fingerprint({
      id: native.Id,
      pid: native.State.Pid,
      startTime: String(native.State.Pid * 10),
      cgroup: group,
      cgroupDevice: String(metadata.dev),
      cgroupInode: String(metadata.ino),
      namespacesSha256: fingerprint(namespaces),
      startedAt: native.State.StartedAt,
    });
  };
  if (maximum === -1 && targetIndex === 0) {
    await publish(0, 'before-create');
    return;
  }
  for (let index = 0; index <= targetIndex; index++) {
    const target = packet.targets.at(index),
      original = target === undefined ? undefined : containers.get(target.id);
    if (target === undefined || original === undefined)
      throw new Error('fixture original unavailable');
    const limit = index < targetIndex || whole ? 8 : maximum;
    if (limit < 0) break;
    let candidate: Container | undefined;
    for (let step = 0; step <= limit; step++) {
      const stage = stages.at(step);
      if (stage === undefined) throw new Error('fixture stage missing');
      if (stage === 'created') {
        candidate = candidateFixture(index);
        containers.set(candidate.Id, candidate);
        candidates.set(candidate.Id, candidate);
        evidenceCandidates.set(target.kind, candidate.Id);
      }
      if (stage === 'healthy') {
        if (candidate === undefined) throw new Error('fixture candidate missing');
        runningHashes.set(target.kind, await witness(candidate));
      }
      await publish(index, stage);
      if (stage === 'stop-intended') await stopFixture(original);
      if (stage === 'rename-original-intended')
        original.Name = '/wbs-init-' + packet.nonce + '-' + target.kind + '-original';
      if (stage === 'rename-candidate-intended') {
        if (candidate === undefined) throw new Error('fixture candidate missing');
        candidate.Name = '/wbs-' + target.kind + '-1';
      }
      if (stage === 'start-intended') {
        if (candidate === undefined) throw new Error('fixture candidate missing');
        await startFixture(candidate, index);
        if (!whole && index === targetIndex && requested === 'candidate-stopped-after-start')
          await stopFixture(candidate);
      }
    }
  }
  if (whole) {
    await publish(1, 'retention-point');
    if (requested !== 'retained') {
      await publish(0, 'remove-intended');
      containers.delete(packet.targets[0].id);
      await publish(0, 'original-absent');
      if (requested !== 'registry-removed') {
        await publish(1, 'remove-intended');
        containers.delete(packet.targets[1].id);
        if (requested === 'complete') {
          await publish(1, 'original-absent');
          await publish(1, 'complete');
        }
      }
    }
  }
  // Recovery uses a new open description carrying a newly acquired kernel lock after the historical invocation ended.
  const fresh = filesystem.openSync(
    root + packet.quiescence.locks[0].path,
    filesystem.constants.O_RDWR,
  );
  filesystem.closeSync(locks[0]);
  locks[0] = fresh;
  if (symbols.flock(fresh, 6) !== 0) throw new Error('fixture fresh recovery lock unavailable');
  process.env['WBS_EDGE_LOCK_FD'] = String(fresh);
}

async function clockSourceHashes(): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};
  for (const name of ['edge-init.ts', 'edge-init-operation.ts', 'edge-init-observer.ts'])
    hashes[name] = hash(await files.readFile(resolve(import.meta.dir, '../lib', name)));
  return hashes;
}
async function receiptStages(): Promise<string[]> {
  if (!filesystem.existsSync(root + packet.receiptDirectory)) return [];
  const stages: string[] = [];
  for (const name of (await files.readdir(root + packet.receiptDirectory)).sort()) {
    const receipt: unknown = JSON.parse(
      await files.readFile(root + packet.receiptDirectory + '/' + name, 'utf8'),
    );
    if (
      typeof receipt !== 'object' ||
      receipt === null ||
      !('stage' in receipt) ||
      typeof receipt.stage !== 'string'
    )
      throw new Error('fixture receipt unreadable');
    stages.push(receipt.stage);
  }
  return stages;
}
async function injectRecoveryFault() {
  if (fault === 'unrelated-created' || fault === 'raw-inventory-drift') {
    const unrelated = candidateFixture(0);
    unrelated.Id = hash('unrelated-created');
    unrelated.Name = '/unrelated-created-1';
    unrelated.Config.Labels = { 'com.docker.compose.service': 'unrelated' };
    unrelated.Config.Env = ['FIXTURE=unrelated'];
    unrelated.NetworkSettings.Networks.edge.Aliases = ['unrelated'];
    containers.set(unrelated.Id, unrelated);
  }
  if (fault === 'inventory-unknown')
    containers.set(hash('unknown-inventory'), {
      ...candidateFixture(0),
      Id: hash('unknown-inventory'),
      Name: '/unknown-inventory-1',
    });
  if (fault === 'stopped-original-blank') {
    const original = containers.get(packet.targets[0].id);
    if (original === undefined) throw new Error('fixture stopped original missing');
    original.NetworkSettings.Networks.edge.NetworkID = '';
  }

  const candidate = [...candidates.values()].find(
    (native) =>
      native.Config.Labels['com.docker.compose.service'] === (process.argv[4] ?? 'registry'),
  );
  if (candidate !== undefined) {
    if (fault === 'candidate-executable' && candidate.State.Pid > 0)
      await files.writeFile(
        root + '/proc/' + String(candidate.State.Pid) + '/exe',
        'changed synthetic executable',
      );
    if (fault === 'service-unknown')
      Object.assign(candidate.State, { Health: { Status: 'starting', FailingStreak: 0, Log: [] } });
    if (fault === 'service-unhealthy')
      Object.assign(candidate.State, {
        Health: { Status: 'unhealthy', FailingStreak: 1, Log: [] },
      });
    if (fault === 'running-blank') candidate.NetworkSettings.Networks.edge.NetworkID = '';
    if (fault === 'candidate-env') candidate.Config.Env = ['PRIVATE_FACTORY_SECRET=changed'];
    if (fault === 'candidate-init') candidate.HostConfig.Init = false;
    if (fault === 'candidate-image') candidate.Config.Image = 'changed:fixture';
    if (fault === 'candidate-mount') candidate.Mounts[0].RW = !candidate.Mounts[0].RW;
    if (fault === 'candidate-endpoint')
      candidate.NetworkSettings.Networks.edge.Aliases = ['changed'];
    if (fault === 'candidate-namespace' && candidate.State.Pid > 0) {
      const path = root + '/proc/' + String(candidate.State.Pid) + '/ns/pid';
      await files.unlink(path);
      await files.symlink('pid:[changed]', path);
    }
    if (fault === 'candidate-absent') containers.delete(candidate.Id);
    if (fault === 'candidate-name') candidate.Name = '/wbs-unrelated-1';
    if (fault === 'both-running') {
      const original = packet.targets.find(
        (target) => target.kind === candidate.Config.Labels['com.docker.compose.service'],
      );
      if (original === undefined) throw new Error('fixture original missing');
      const native = structuredClone(originalCopies[original.kind === 'registry' ? 0 : 1]);
      containers.set(native.Id, native);
      native.State.Running = true;
      native.State.Status = 'running';
      native.State.Pid = 200001;
    }
  }
  if (fault === 'lost-create-wrong-name') {
    const native = candidateFixture(0);
    native.Name = '/wbs-init-fixture-registry-wrong';
    containers.set(native.Id, native);
  }
  if (fault === 'old-cgroup-populated')
    await files.writeFile(
      root + '/sys/fs/cgroup' + packet.targets[0].process.cgroup + '/cgroup.events',
      'populated 1\n',
    );
  if (fault === 'original-absent-early') containers.delete(packet.targets[0].id);
  if (fault === 'forged-current-lock')
    process.env['WBS_EDGE_LOCK_FD'] = String(
      filesystem.openSync(root + packet.quiescence.locks[0].path, filesystem.constants.O_RDWR),
    );
  if (fault.startsWith('receipt-')) {
    let previous: string | null = null;
    const names = (await files.readdir(root + packet.receiptDirectory)).sort();
    for (const name of names) {
      const path = root + packet.receiptDirectory + '/' + name;
      const decoded: unknown = JSON.parse(await files.readFile(path, 'utf8'));
      if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded))
        throw new Error('fixture receipt malformed');
      const receipt: Record<string, unknown> = Object.fromEntries(Object.entries(decoded));
      receipt['previous'] = previous;
      if (fault === 'receipt-packet') receipt['packetSha256'] = hash('wrong packet');
      if (fault === 'receipt-source') receipt['sourceRosterSha256'] = hash('wrong source');
      if (fault === 'receipt-literal') receipt['literalInitSha256'] = hash('wrong literal');
      if (fault === 'receipt-profile-missing') Reflect.deleteProperty(receipt, 'invariantProfile');
      if (fault === 'receipt-profile-old')
        receipt['invariantProfile'] = 'engine-29.1.3-api-1.52-cgroup2-created-oom-v1';
      if (fault === 'receipt-profile-changed') receipt['invariantProfile'] = 'unrecognized-profile';
      if (fault === 'receipt-version') receipt['version'] = 1;
      if (fault === 'receipt-versionless') {
        Reflect.deleteProperty(receipt, 'format');
        Reflect.deleteProperty(receipt, 'version');
      }
      if (fault === 'receipt-original-process') {
        const evidence = receipt['invariants'];
        if (!Array.isArray(evidence)) throw new Error('fixture invariant malformed');
        const first: unknown = evidence[0];
        if (
          typeof first !== 'object' ||
          first === null ||
          !('originalProcess' in first) ||
          typeof first.originalProcess !== 'object' ||
          first.originalProcess === null ||
          !('cgroupDevice' in first.originalProcess)
        )
          throw new Error('fixture process witness malformed');
        first.originalProcess.cgroupDevice = '999999';
      }
      if (fault === 'receipt-process-drift') {
        const evidence = receipt['candidateProcesses'];
        if (!Array.isArray(evidence)) throw new Error('fixture candidate witness malformed');
        for (const candidate of evidence) {
          const observed: unknown = candidate;
          if (typeof observed !== 'object' || observed === null || !('processSha256' in observed))
            throw new Error('fixture process hash malformed');
          if (observed.processSha256 !== null) observed.processSha256 = hash('changed process');
        }
      }

      if (fault === 'receipt-invariants') Reflect.deleteProperty(receipt, 'invariants');
      if (fault === 'receipt-order' && name === names[0]) receipt['stage'] = 'remove-intended';
      previous = fingerprint(receipt);
      await files.writeFile(path, JSON.stringify(receipt));
    }
  }
}

try {
  // The native decoder is intentionally exercised against Docker 1.52's omitted OnBuild field.
  for (const target of packet.targets) {
    const native = containers.get(target.id);
    if (native === undefined) throw new Error('fixture original missing');
    target.nativeSha256 = fingerprint(parseNativeContainer(native));
  }
  packet.backends[0].nativeSha256 = fingerprint(parseNativeContainer(backend));
  if (clockFault) {
    packet.quiescence.issuedAt = new Date(Date.now() - 1000).toISOString();
    packet.quiescence.expiresAt = new Date(Date.now() + 360000).toISOString();
  }
  if (fault === 'expired-window' || fault === 'expired-prepare') {
    packet.quiescence.issuedAt = new Date(Date.now() - 1200000).toISOString();
    packet.quiescence.expiresAt = new Date(Date.now() - 600000).toISOString();
  }
  if (fault === 'missing-route') {
    packet.caddy.routeInventory.splice(0, 1);
    Object.assign(packet.public, {
      probes: packet.public.probes.filter((probe) => probe.id !== 'wss'),
    });
    packet.public.routesSha256 = fingerprint({
      servers: configuration.apps.http.servers,
      inventory: packet.caddy.routeInventory,
    });
  }
  if (fault === 'missing-server') {
    Object.assign(configuration.apps.http.servers, {
      uncovered: {
        listen: [':8443'],
        routes: [{ handle: [{ handler: 'static_response', body: 'uncovered' }] }],
      },
    });
    packet.caddy.configurationSha256 = fingerprint(configuration);
    packet.public.routesSha256 = fingerprint({
      servers: configuration.apps.http.servers,
      inventory: packet.caddy.routeInventory,
    });
  }
  const operation = {
    operationId: packet.quiescence.operationId,
    sourceSha: packet.sourceSha,
    buildSha: packet.sourceSha,
    packetRosterSha256: fingerprintPacketRoster(decodeInitPacket(packet)),
    issuedAt: packet.quiescence.issuedAt,
    expiresAt: packet.quiescence.expiresAt,
    scheduleSha256: hash('schedule'),
    drainSha256: hash('drain'),
    registryWriterHoldSha256: hash('registry hold'),
    filesystemTopologyHoldSha256: hash('topology hold'),
  };
  await write(packet.quiescence.operation.path, JSON.stringify(operation));
  packet.quiescence.operation = await pin(packet.quiescence.operation.path);
  const packetPath = '/home/puni1/wbs/factory-packet.json';
  await write(packetPath, JSON.stringify(packet));
  if (action === 'recovery') await recoveryFixture(packetPath);
  if (fault === 'writer-changed')
    await files.appendFile(root + manifest.members[0].hostPath, 'changed writer');
  if (fault === 'bundle-changed')
    await files.appendFile(root + packet.bundle.path, 'changed bundle');
  if (fault === 'source-missing') await files.unlink(root + packet.provenance[0].path);
  if (fault === 'source-unreadable') await files.chmod(root + packet.provenance[0].path, 0);
  if (fault === 'graph-extra')
    await write('/home/puni1/wbs/caddy/unknown-secret', 'PRIVATE_FACTORY_SECRET');
  if (fault === 'ambiguous-route')
    await files.appendFile(
      root + '/proc/200001/net/route',
      'eth0 00000000 01001DAC 0003 0 0 10 00000000 0 0 0\n',
    );
  if (fault === 'boot-drift')
    await files.writeFile(
      root + '/proc/sys/kernel/random/boot_id',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\n',
    );
  if (fault === 'daemon-drift') info.ID = 'replacement-daemon';
  if (action === 'recovery') await injectRecoveryFault();
  entryActive = true;
  const summary = await runProductionInitAdoption(
    packetPath,
    action === 'recovery' ? 'inspect-recovery' : action === 'execute' ? 'execute' : 'prepare',
  );
  console.log(
    JSON.stringify({
      summary,
      transcript,
      reads,
      receiptStages: await receiptStages(),
      ...(clockFault
        ? {
            clock: {
              firstAdmission: firstAdmissionClock,
              shifts: clockShifts,
              effects: clockEffects,
              stopApplied: clockStopApplied,
              issuedAt: Date.parse(packet.quiescence.issuedAt),
              sourceSha256: await clockSourceHashes(),
            },
          }
        : {}),
      receiptDirectoryPresent: filesystem.existsSync(root + packet.receiptDirectory),
    }),
  );
} catch (cause) {
  console.log(
    JSON.stringify({
      refusal: cause instanceof Error ? cause.message : 'unknown',
      transcript,
      reads,
      receiptStages: await receiptStages(),
      ...(clockFault
        ? {
            clock: {
              firstAdmission: firstAdmissionClock,
              shifts: clockShifts,
              effects: clockEffects,
              stopApplied: clockStopApplied,
              issuedAt: Date.parse(packet.quiescence.issuedAt),
              sourceSha256: await clockSourceHashes(),
            },
          }
        : {}),
    }),
  );
  process.exitCode = 2;
} finally {
  await Promise.all([
    new Promise<void>((resolve, reject) =>
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      }),
    ),
    new Promise<void>((resolve, reject) =>
      tls.close((error) => {
        if (error) reject(error);
        else resolve();
      }),
    ),
  ]);
  for (const fd of locks) filesystem.closeSync(fd);
  if (suppliedRoot === undefined) await files.rm(root, { recursive: true });
}
