import { cp, lstat, mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { runMigrations } from '@wbs/store-sqlite/migrate';

import { AUTHORITY_FIXTURE_PROGRAM } from '../../test/installed-authority-fixture';
import type { CompleteActivationTransports } from '../lib/complete-dependency-exclusion';
import { hashActivationBytes as hash } from '../lib/dependency-activation-storage';
import type { CompleteDependencyActivationRequest } from '../lib/dependency-complete-activation';
import { createDependencyMigrationManifest } from '../lib/dependency-migration-artifact';
import { scanMigrationArtifact } from '../lib/dependency-migration-artifact-scanner';
import { AUTHORITY_COLLECTOR } from '../lib/installed-authority-collector';
import { withAuthorityFiles } from '../lib/installed-authority-files';
import { readAuthorityCollector } from '../lib/installed-authority-transport';
import { WRITER_MEMBERS } from '../lib/installed-writers';
import { readFields, readIdentity } from '../lib/managed-cohort';
import { SOLVER_EDGE_STATE } from '../lib/solver-host';
import type { SourceConfigSlot } from '../lib/source-startup-manifest';
import { createNamespaceFixture } from './namespace-audit';
import { sourceDatabaseFixture } from './source-database-binding';

const migrationsDirectory = new URL('../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
export async function completeActivationFixture(
  activate: readonly ('prod' | 'dev')[] = ['prod', 'dev'],
  preparedDirectory = migrationsDirectory,
  prepareSource?: (root: string) => Promise<void>,
  roleConfiguration?: Readonly<Record<SourceConfigSlot, string>>,
) {
  const base = await sourceDatabaseFixture(
    undefined,
    [],
    'data',
    false,
    preparedDirectory,
    prepareSource,
    roleConfiguration,
  );
  await writeFile(
    join(base.root, 'edge-policy.json'),
    JSON.stringify({
      format: 'dependency-edge-policy',
      version: 1,
      phase: 'ordinary',
      edgeState: base.root,
    }) + '\n',
    { mode: 0o600 },
  );
  await Bun.write(base.prodPath, '');
  await Bun.write(base.devPath, '');
  runMigrations(base.prodPath, preparedDirectory);
  runMigrations(base.devPath, preparedDirectory);
  base.backend.HostConfig.RestartPolicy.Name = 'always';
  Object.assign(base.backend.State, {
    Running: true,
    Pid: 101,
    Status: 'running',
    FinishedAt: '0001-01-01T00:00:00Z',
  });
  Object.assign(base.backend.NetworkSettings.Networks[base.layouts.prod.network], {
    Aliases: ['be-01-blue'],
  });
  const gateway = {
    ...structuredClone(base.backend),
    Id: 'd'.repeat(64),
    Name: '/gw-01-blue',
    Image: `sha256:${'d'.repeat(64)}`,
    Config: {
      ...base.backend.Config,
      Image: `registry/wbs-gw-01@sha256:${'d'.repeat(64)}`,
      Labels: { 'com.docker.compose.service': 'gw-01-blue', 'com.docker.compose.project': 'wbs' },
    },
    Mounts: [],
  };
  Object.assign(gateway.NetworkSettings.Networks[base.layouts.prod.network], {
    Aliases: ['gw-01-blue'],
  });
  const backendNamespace = await createNamespaceFixture(
    'managed-match',
    base.prodPath,
    join(base.root, 'backend-namespace'),
  );
  await rename(
    join(backendNamespace.root, 'namespace/data/wbs.db'),
    join(backendNamespace.root, 'namespace/data/production.sqlite'),
  );
  const namespace = await createNamespaceFixture(
    'none',
    base.prodPath,
    join(base.root, 'namespace-fixture'),
  );
  const caddyRoot = join(base.root, 'caddy');
  await mkdir(caddyRoot);
  for (const layout of Object.values(base.layouts))
    Object.assign(layout, {
      siteCaddyPath: join(caddyRoot, layout.env === 'prod' ? 'site.caddy' : 'site-dev.caddy'),
    });
  await writeFile(
    join(caddyRoot, 'Caddyfile'),
    'import log-redact.caddy\nimport site.caddy\nimport site-dev.caddy\n',
  );
  await writeFile(join(caddyRoot, 'log-redact.caddy'), '(access-log) { log }\n');
  for (const layout of Object.values(base.layouts))
    await writeFile(layout.siteCaddyPath, `${layout.siteAddress} { respond original }\n`);
  await mkdir(join(namespace.root, 'namespace/etc/caddy'), { recursive: true });
  const mountinfo = await readFile(join(namespace.root, 'mountinfo'), 'utf8');
  await writeFile(join(namespace.root, 'mountinfo'), mountinfo.replace('/config', '/etc/caddy'));
  Object.assign(namespace.container.State, {
    Paused: false,
    Restarting: false,
    StartedAt: '2026-10-24T00:00:00Z',
  });
  const caddy = {
    ...namespace.container,
    Id: 'e'.repeat(64),
    NetworkSettings: { Networks: {} },
    Name: '/wbs-caddy-1',
    Path: 'caddy',
    Args: ['run', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'],
    Image: `sha256:${'e'.repeat(64)}`,
    Config: { Env: [], Labels: {} },
    Mounts: [{ Type: 'bind', Source: caddyRoot, Destination: '/etc/caddy', RW: false }],
  };
  base.inventory.push(gateway, caddy);
  async function adapted() {
    const routes = [];
    for (const layout of Object.values(base.layouts)) {
      const maintenance = (await readFile(layout.siteCaddyPath, 'utf8')).includes(
        'WBS dependency maintenance',
      );
      const dials =
        layout.env === 'prod'
          ? ['be-01-blue:3100', 'gw-01-blue:3200', 'fe-01-blue:80']
          : ['wbs-dev-src:3100', 'wbs-dev-src:3200', 'wbs-dev-src:3300', 'wbs-dev-src:4200'];
      routes.push({
        match: [{ host: [layout.siteAddress] }],
        handle: [
          {
            handler: 'subroute',
            routes: maintenance
              ? [
                  {
                    handle: [
                      {
                        handler: 'static_response',
                        body: 'WBS dependency maintenance',
                        status_code: 503,
                      },
                    ],
                  },
                ]
              : dials.map((dial) => ({
                  handle: [{ handler: 'reverse_proxy', upstreams: [{ dial }] }],
                })),
          },
        ],
        terminal: true,
      });
    }
    return { apps: { http: { servers: { srv0: { listen: [':80'], routes } } } } };
  }
  let live = await adapted();
  const preparedMigrations = join(base.sourceRoot, 'apps/wbs/be-01/drizzle');
  const artifact = await createDependencyMigrationManifest(preparedMigrations, {
    version: 1,
    sourceSha: base.pins.sourceSha,
    candidateImage: base.backend.Config.Image,
    candidateImageId: base.backend.Image,
  });
  const artifactRoot = join(base.root, 'dependency-artifacts', artifact.sha256);
  await mkdir(artifactRoot, { recursive: true, mode: 0o755 });
  await cp(preparedMigrations, join(artifactRoot, 'drizzle'), { recursive: true });
  await writeFile(join(artifactRoot, 'manifest.json'), artifact.contents, { mode: 0o600 });
  const migrationRows = (
    await scanMigrationArtifact(preparedMigrations, performance.now() + 120000)
  ).migrations;
  const runtimeReference = `registry/toolchain@sha256:${'a'.repeat(64)}`;
  const commands: string[][] = [];
  const docker: typeof base.docker = async (args, signal) => {
    commands.push(args);
    if (args[0] === 'image' && args.at(-1) === runtimeReference)
      return args.includes('--format')
        ? base.source.Image
        : JSON.stringify([{ Id: base.source.Image, RepoDigests: [runtimeReference] }]);
    if (args[0] === 'image' && args.at(-1) === gateway.Config.Image) return gateway.Image;
    if (args[0] === 'inspect' && args.includes('--format') && args.includes(caddy.Id))
      return JSON.stringify(caddy);
    if (args[0] === 'inspect' && args.includes('wbs-caddy-1')) return JSON.stringify([caddy]);
    if (args[0] === 'exec' && args.includes('adapt')) return JSON.stringify(await adapted());
    if (args[0] === 'exec' && args.includes('wget')) return JSON.stringify(live);
    if (args[0] === 'exec' && args.includes('reload')) {
      live = await adapted();
      return '';
    }
    if (args[0] === 'update' || args[0] === 'stop') {
      const raw = base.inventory.map(readFields).find((member) => member['Id'] === args.at(-1));
      if (raw === undefined) throw new Error('unknown fixture mutation');
      if (args[0] === 'update')
        readFields(readFields(raw['HostConfig'])['RestartPolicy'])['Name'] = 'no';
      else
        Object.assign(readFields(raw['State']), {
          Running: false,
          Pid: 0,
          Status: 'exited',
          FinishedAt: '2026-10-23T01:00:00Z',
        });
      return readIdentity(raw['Id']);
    }
    if (args[0] === 'run' && args.includes('migration-artifact'))
      return JSON.stringify(migrationRows) + '\n';
    if (args[0] === 'run' && args.at(-2) !== '-c' && !args.includes('--workdir'))
      return JSON.stringify({
        protocol: 'wbs-dependency-runtime',
        version: 1,
        role: args.includes(gateway.Config.Image) ? 'gateway' : 'backend',
        semantics: ['cross-project-dependencies-v1'],
      });
    return base.docker(args, signal);
  };
  const fixed = [
    '/home/puni1/wbs/bin/swap.js',
    '/home/puni1/wbs/bin/smoke.js',
    '/home/puni1/wbs-dev/bin/swap.js',
    '/home/puni1/wbs-dev/bin/smoke.js',
    '/home/puni1/wbs-dev/bin/poll.sh',
    '/home/puni1/wbs-dev/bin/dev-poll-sync.sh',
    '/home/puni1/wbs-dev/bin/bun',
  ];
  const members = WRITER_MEMBERS.map((member, index) => ({
    member,
    origin: 'source',
    hostPath: fixed[index] ?? `/private/needle/${member}`,
    reviewed: `reviewed/${member}`,
    installed: `captured/${member}`,
    sha256: hash(`writer ${member}`),
  }));
  for (const member of members)
    await writeFile(join(base.root, member.member), `writer ${member.member}`);
  const writerManifestContents = JSON.stringify({
    version: 1,
    sourceSha: base.pins.sourceSha,
    buildSha: base.pins.sourceSha,
    buildId: 'independent-fixture-build',
    members,
  });
  function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical);
    if (value !== null && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, canonical(child)]),
      );
    return value;
  }
  const launch = hash(
    JSON.stringify(
      canonical({
        version: 1,
        cron: [
          { source: '/etc/anacrontab', state: 'absent' },
          { source: '/etc/crontab', state: 'present', sha256: hash('# unrelated\n') },
          { source: 'crontab:puni1', state: 'absent' },
          { source: 'crontab:root', state: 'absent' },
        ],
        units: ['system', 'user'].map((manager) => ({
          manager,
          name: 'fixture.service',
          canonicalId: 'fixture.service',
          names: ['fixture.service'],
          unitFileState: 'enabled',
          loadState: 'loaded',
          fragment: {
            path: '/etc/systemd/system/fixture.service',
            sha256: hash('private secret bytes'),
          },
          dropIns: [],
          transient: false,
          commands: [],
          triggers: [],
          triggeredBy: [],
        })),
      }),
    ),
  );
  const request: CompleteDependencyActivationRequest = {
    format: 'complete-dependency-activation',
    version: 1,
    owner: { sha: base.pins.sourceSha, layouts: [base.layouts.prod, base.layouts.dev] },
    activate,
    solver: base.solverPins,
    prod: {
      backend: { color: 'blue', image: base.backend.Config.Image },
      gateway: { color: 'blue', image: gateway.Config.Image },
    },
    source: { pins: base.pins, manifestContents: base.contents, runtimeReference },
    authorities: {
      pins: {
        format: 'installed-dependency-authority-pins',
        version: 1,
        sourceSha: base.pins.sourceSha,
        solver: base.solverPins,
        writerManifestSha256: hash(writerManifestContents),
        hostMachineIdSha256: hash('a'.repeat(32) + '\n'),
        launchConfigurationSha256: launch,
      },
      writerManifestContents,
    },
    migrations: {
      version: 1,
      sourceSha: base.pins.sourceSha,
      candidateImage: base.backend.Config.Image,
      candidateImageId: base.backend.Image,
      manifestSha256: artifact.sha256,
    },
  };
  let authorityFault: 'none' | 'opener' | 'prior' | 'boot-drift' = 'none';
  let collections = 0;
  const collect = async (request: unknown, deadline: number) => {
    collections++;
    const family = new Set<string>();
    for (const path of [base.prodPath, base.devPath])
      for (const suffix of ['', '-wal', '-shm', '-journal']) {
        try {
          const observed = await lstat(path + suffix, { bigint: true });
          family.add(`${String(observed.dev)}:${String(observed.ino)}`);
        } catch (cause) {
          if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT' && suffix !== '')
            continue;
          throw cause;
        }
      }
    for (const descriptor of await readdir('/proc/self/fd')) {
      try {
        const observed = await stat(`/proc/self/fd/${descriptor}`, { bigint: true });
        if (family.has(`${String(observed.dev)}:${String(observed.ino)}`))
          throw new Error('coordinator retained a database family descriptor before actual census');
      } catch (cause) {
        if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') continue;
        throw cause;
      }
    }
    const program =
      AUTHORITY_COLLECTOR +
      '\n' +
      AUTHORITY_FIXTURE_PROGRAM +
      String.raw`
REQUEST=json.loads(${JSON.stringify(JSON.stringify(request))})
FAULT=${JSON.stringify(authorityFault)}
COLLECTION=${String(collections)}
for database in REQUEST['databases']: database['host']='/home/puni1/'+('wbs' if database['environment']=='prod' else 'wbs-dev')+'/data/main'
SOLVER_EXECUTABLE_PATH=${JSON.stringify(join(base.root, 'installed-0'))}
class ActivationHost(Complete):
 def fixture_executable(self,path):
  solver=REQUEST.get('solver')
  if solver is not None and path=='/proc/'+str(solver['pid'])+'/exe':
   descriptors=self.__dict__.setdefault('fixture_executable_descriptors',{})
   if solver['pid'] not in descriptors:descriptors[solver['pid']]=os.open(SOLVER_EXECUTABLE_PATH,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
   return descriptors[solver['pid']]
  return super().fixture_executable(path)
 def read(self,path,limit):
  if FAULT=='boot-drift' and COLLECTION>1 and path=='/proc/sys/kernel/random/boot_id':return b'22222222-2222-2222-2222-222222222222\n'
  if FAULT=='prior' and path=='/proc/4242/cmdline':return b'/usr/bin/bun\x00/home/puni1/wbs/bin/swap.js\x00'
  return super().read(path,limit)
 def metadata(self,path,follow=True):
  if FAULT=='opener' and path.endswith('/fd/7'):return self.metadata(REQUEST['databases'][0]['host'],follow)
  for database in REQUEST['databases']:
   if path in [database['host'],os.path.dirname(database['host'])]:
    device,inode=map(int,database['fileIdentity' if path==database['host'] else 'directoryIdentity'].split(':'))
    return SimpleNamespace(st_mode=stat.S_IFREG if path==database['host'] else stat.S_IFDIR,st_dev=device,st_ino=inode,st_size=3,st_mtime_ns=4,st_ctime_ns=5)
  return super().metadata(path,follow)
 def listing(self,path,limit):
  if path=='/proc' and FAULT=='prior':return super().listing(path,limit)+['4242']
  if path.endswith('/fd'):return ['7'] if FAULT=='opener' else []
  return super().listing(path,limit)
print(encode(collect(REQUEST,ActivationHost())).decode())
`;
    return readAuthorityCollector(
      Bun.spawn(['/usr/bin/python3', '-I', '-'], {
        stdin: new TextEncoder().encode(program),
        stdout: 'pipe',
        stderr: 'pipe',
      }),
      deadline,
    );
  };

  const solver = {
    ...base.ports,
    runDocker: (args: string[], signal?: AbortSignal) =>
      args[0] === 'run' ? docker(args, signal) : base.ports.runDocker(args, signal),
  };
  const ports: CompleteActivationTransports = {
    // Proof: missing explicit fixture mapping failed all three closed-request composition negatives; no native Docker fallback is provided.
    spawnProductMetadata: () => {
      throw new Error('fixture product metadata mapping unavailable');
    },
    solver,
    docker,
    execDocker: (args, nonce, consume, signal) =>
      (args.includes(base.backend.Id) ? backendNamespace.exec : namespace.exec)(
        args,
        nonce,
        consume,
        signal,
      ),
    authorities: {
      solver: {
        ...solver,
        runHost: async (command) =>
          (await base.ports.runHost(command)).replace(
            `WBS_EDGE_STATE=${base.root}`,
            `WBS_EDGE_STATE=${SOLVER_EDGE_STATE}`,
          ),
      },
      collect,
      withFiles: async <T>(
        paths: readonly string[],
        action: Parameters<typeof withAuthorityFiles<T>>[1],
      ) =>
        withAuthorityFiles(
          members.map((member) => join(base.root, member.member)),
          (files, inspect) =>
            action(
              files.map((file, index) => ({ ...file, path: paths[index] })),
              inspect,
            ),
        ),
    },
  };
  return {
    ...base,
    request,
    gateway,
    caddy,
    commands,
    namespace,
    backendNamespace,
    ports,
    collections: () => collections,
    setAuthorityFault: (fault: typeof authorityFault) => {
      authorityFault = fault;
    },
  };
}
