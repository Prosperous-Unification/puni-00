import { createHash } from 'node:crypto';
import { chmod, cp, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fenceBackendsUnderOwner } from '../lib/backend-exclusion';
import { type DependencyOwner, withDependencyOwner } from '../lib/edge-ownership';
import { envLayout, sourceDevContract } from '../lib/env';
import { fenceGatewaysUnderOwner } from '../lib/gateway-exclusion';
import { readFields, readIdentity } from '../lib/managed-cohort';
import { type SolverExclusion, withSolverDrainUnderOwner } from '../lib/solver-exclusion';
import { captureSolverFile, type SolverPorts } from '../lib/solver-host';
import {
  SOLVER_SUPERVISOR_BUN,
  SOLVER_SUPERVISOR_BUNDLE,
  SOLVER_SUPERVISOR_CONFIG,
  SOLVER_SUPERVISOR_SERVICE,
  SOLVER_SUPERVISOR_UNIT,
} from '../lib/solver-supervisor-install-contract';
import { type SourceDevExclusion, withSourceDevExcluded } from '../lib/source-dev-exclusion';
import {
  createSourceStartupManifest,
  decodeSourceStartupManifest,
} from '../lib/source-startup-manifest';
import { sourceFixture } from './source-dev';
import {
  artifact,
  configuration as startupConfiguration,
  git,
  modes,
  roots,
} from './source-startup';
const controls = [
  'NODE_ENV=development',
  'NX_DAEMON=false',
  'NX_CACHE_PROJECT_GRAPH=false',
  'NX_SKIP_NX_CACHE=true',
  'NX_LOAD_DOT_ENV_FILES=false',
  'NX_ISOLATE_PLUGINS=false',
  'NX_CACHE_DIRECTORY=/src/.nx/cache',
  'NX_WORKSPACE_DATA_DIRECTORY=/src/.nx/workspace-data',
  'NX_NATIVE_FILE_CACHE_DIRECTORY=/src/.nx/native',
  'BUN_RUNTIME_TRANSPILER_CACHE_PATH=0',
  'WBS_PUBLIC_DEV=true',
  'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
];
const GROUP = `/user.slice/user-1000.slice/user@1000.service/app.slice/${SOLVER_SUPERVISOR_SERVICE}`;
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
function exec(path: string, argv: string) {
  return `{ path=${path} ; argv[]=${argv} ; ignore_errors=no ; start_time=[n/a] ; stop_time=[n/a] ; pid=0 ; code=(null) ; status=0 }`;
}
function unit(active: boolean, edgeState: string) {
  return Object.entries({
    LoadState: 'loaded',
    Id: SOLVER_SUPERVISOR_SERVICE,
    Names: SOLVER_SUPERVISOR_SERVICE,
    FragmentPath: SOLVER_SUPERVISOR_UNIT,
    DropInPaths: '',
    Transient: 'no',
    NeedDaemonReload: 'no',
    ExecStart: exec(
      SOLVER_SUPERVISOR_BUN,
      `${SOLVER_SUPERVISOR_BUN} ${SOLVER_SUPERVISOR_BUNDLE.remote} --config=${SOLVER_SUPERVISOR_CONFIG} --admission=policy`,
    ),
    ExecStartPre: '',
    ExecStartPost: '',
    ExecStop: '',
    ExecStopPost: exec('/bin/rm', '/bin/rm -f /run/user/1000/wbs-solver/supervisor.sock'),
    Restart: 'always',
    RestartPreventExitStatus: '78',
    Result: 'success',
    ExecMainStatus: '0',
    KillMode: 'control-group',
    Environment: `WBS_EDGE_STATE=${edgeState}`,
    ActiveState: active ? 'active' : 'inactive',
    SubState: active ? 'running' : 'dead',
    MainPID: active ? '123' : '0',
    ControlPID: '0',
    InvocationID: active ? 'a'.repeat(32) : '',
    ControlGroup: active ? GROUP : '',
    Job: '',
  })
    .map(([key, value]) => `${key}=${value}\n`)
    .join('');
}

export async function sourceDatabaseFixture(
  dotenv = 'DB_PATH=/data/development.sqlite\nMIGRATE_ON_STARTUP=false\n',
  inherited: string[] = [],
  prodDirectory = 'data',
  nested = false,
  migrationsDirectory?: string,
) {
  const prepared = await artifact();
  if (migrationsDirectory !== undefined) {
    await cp(migrationsDirectory, join(prepared.root, 'apps/wbs/be-01/drizzle'), {
      recursive: true,
    });
    await modes(prepared.root);
    await git(prepared.root, 'add', '.');
    await git(
      prepared.root,
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-qm',
      'pin actual migration artifact',
    );
    prepared.sourceSha = await git(prepared.root, 'rev-parse', 'HEAD');
    await modes(prepared.root);
    const generated = await createSourceStartupManifest(
      prepared.root,
      prepared.sourceSha,
      startupConfiguration,
    );
    prepared.contents = generated.contents;
    prepared.sha256 = generated.sha256;
    prepared.pins = {
      ...prepared.pins,
      sourceSha: prepared.sourceSha,
      manifestSha256: generated.sha256,
    };
  }
  const root = await mkdtemp(join(tmpdir(), 'source-database-'));
  roots.push(root);
  const layouts = {
    prod: { ...envLayout('prod'), root: join(root, 'prod'), stateDir: join(root, 'prod') },
    dev: {
      ...envLayout('dev'),
      root: join(root, nested ? 'prod/data/nested' : 'dev'),
      stateDir: join(root, nested ? 'prod/data/nested' : 'dev'),
    },
  };
  for (const layout of Object.values(layouts))
    await mkdir(join(layout.root, 'data'), { recursive: true });
  await mkdir(join(layouts.prod.root, prodDirectory), { recursive: true });
  const prodPath = join(layouts.prod.root, prodDirectory, 'production.sqlite');
  const devPath = join(layouts.dev.root, 'data/development.sqlite');
  await writeFile(prodPath, 'prod scratch');
  await writeFile(devPath, 'dev scratch');
  const sourceRoot = join(layouts.dev.root, 'src');
  await cp(prepared.root, sourceRoot, { recursive: true, verbatimSymlinks: true });
  for (const tier of ['be-01', 'gw-01', 'mcp-01', 'fe-01']) {
    const path = join(sourceRoot, 'apps/wbs', tier, '.env');
    await writeFile(path, tier === 'be-01' ? dotenv : 'MIGRATE_ON_STARTUP=false\n#\n');
    await chmod(path, 0o600);
  }
  const original = decodeSourceStartupManifest(prepared.contents, prepared.pins);
  const manifest = {
    ...original,
    configuration: original.configuration.map((pin) =>
      pin.slot === 'backend'
        ? { slot: 'backend', size: Buffer.byteLength(dotenv), sha256: hash(dotenv) }
        : pin,
    ),
  };
  const contents = JSON.stringify(manifest) + '\n';
  const base = sourceFixture();
  const source = { ...base, Config: { ...base.Config, Env: [...controls, ...inherited] } };
  source.Image = prepared.pins.runtimeImageId;
  source.Mounts = sourceDevContract(layouts.dev).mounts.map((mount) => ({
    Type: 'bind',
    Source: mount.source,
    Destination: mount.target,
    RW: mount.writable,
  }));
  const pins = {
    ...prepared.pins,
    manifestSha256: hash(contents),
    environmentSha256: hash(JSON.stringify(source.Config.Env)),
  };
  const backend = {
    Id: 'b'.repeat(64),
    Name: '/be-01-blue',
    Image: 'sha256:' + 'c'.repeat(64),
    Config: {
      Image: 'registry/wbs-be-01@sha256:' + 'c'.repeat(64),
      Env: ['DB_PATH=/data/production.sqlite'],
      Labels: { 'com.docker.compose.service': 'be-01-blue', 'com.docker.compose.project': 'wbs' },
    },
    Mounts: [
      {
        Type: 'bind',
        Source: join(layouts.prod.root, prodDirectory),
        Destination: '/data',
        RW: true,
      },
    ],
    HostConfig: {
      Init: true,
      PidMode: '',
      Privileged: false,
      CapAdd: null,
      RestartPolicy: { Name: 'no', MaximumRetryCount: 0 },
      NetworkMode: layouts.prod.network,
    },
    NetworkSettings: { Networks: { [layouts.prod.network]: { NetworkID: 'e'.repeat(64) } } },
    RestartCount: 0,
    State: {
      Running: false,
      Paused: false,
      Restarting: false,
      Dead: false,
      OOMKilled: false,
      Pid: 0,
      Status: 'exited',
      StartedAt: '2026-10-23T00:00:00Z',
      FinishedAt: '2026-10-23T01:00:00Z',
      ExitCode: 0,
      Error: '',
    },
  };
  const inventory: unknown[] = [source, backend];
  const commands: string[][] = [];
  let probes = 0;
  let intercept: (args: string[], signal?: AbortSignal) => Promise<void> = () => Promise.resolve();
  const docker = async (args: string[], signal?: AbortSignal) => {
    commands.push(args);
    await intercept(args, signal);
    if (args[0] === 'ps') return inventory.map((raw) => readFields(raw)['Id']).join('\n');
    if (args[0] === 'inspect') {
      const selected = inventory.filter((raw) =>
        args.includes(readIdentity(readFields(raw)['Id'])),
      );
      return JSON.stringify(args.includes('--format') ? selected[0] : selected);
    }
    if (args[0] === 'image')
      return args.includes('--format')
        ? args.at(-1) === source.Config.Image || args.at(-1) === source.Image
          ? source.Image
          : backend.Image
        : JSON.stringify([
            { Id: source.Image, Config: { Entrypoint: source.Config.Entrypoint, Env: [] } },
          ]);
    if (args[0] === 'update') {
      source.HostConfig.RestartPolicy.Name = 'no';
      return source.Id;
    }
    if (args[0] === 'stop') {
      Object.assign(source.State, {
        Running: false,
        Pid: 0,
        Status: 'exited',
        FinishedAt: '2026-10-23T01:00:00Z',
      });
      return source.Id;
    }
    if (args[0] === 'diff') return '';
    if (args[0] === 'run') {
      if (args.at(-2) === '-c') return 'wbs-source-image-config-absent-v1\n';
      probes++;
      const cwd = args[args.indexOf('--workdir') + 1];
      return JSON.stringify({
        protocol: 'wbs-dependency-runtime',
        version: 1,
        role: cwd.endsWith('be-01') ? 'backend' : cwd.endsWith('gw-01') ? 'gateway' : 'mcp',
        semantics: ['cross-project-dependencies-v1'],
      });
    }
    throw new Error('unexpected fixture Docker command');
  };
  const installedPaths = [
    SOLVER_SUPERVISOR_BUN,
    SOLVER_SUPERVISOR_BUNDLE.remote,
    SOLVER_SUPERVISOR_CONFIG,
    SOLVER_SUPERVISOR_UNIT,
  ];
  const configuration = JSON.stringify({
    socketPath: '/run/user/1000/wbs-solver/supervisor.sock',
    maxSearchWorkers: 2,
    maxMemoryLimitMb: 512,
    pidsLimit: 128,
    maxManagedContainers: 16,
    devSourceSha: pins.sourceSha,
    images: [
      {
        callerName: 'be-01-blue',
        callerImage: backend.Config.Image,
        solverImage:
          migrationsDirectory === undefined
            ? 'registry/solver@sha256:' + 'f'.repeat(64)
            : backend.Config.Image,
      },
    ],
  });
  const installed = ['bun', 'bundle', configuration, 'unit'];
  for (let index = 0; index < 4; index++)
    await writeFile(join(root, `installed-${String(index)}`), installed[index], {
      mode: [0o755, 0o755, 0o600, 0o644][index],
    });
  const solverPins = {
    version: 1 as const,
    sourceSha: pins.sourceSha,
    bunSha256: hash('bun'),
    bundleSha256: hash('bundle'),
    configSha256: hash(configuration),
    unitSha256: hash('unit'),
  };
  let stopped = false;
  const ports: SolverPorts = {
    edgeState: root,
    captureFile: async (path, maximum, decode) => {
      const index = installedPaths.indexOf(path);
      if (index < 0) throw new Error('unknown installed path');
      return {
        ...(await captureSolverFile(join(root, `installed-${String(index)}`), maximum, decode)),
        path,
      };
    },
    runHost: (command) => {
      if (command.kind === 'stop') {
        stopped = true;
        return Promise.resolve('');
      }
      return Promise.resolve(unit(!stopped, root));
    },
    observeProcess: () => Promise.resolve({ pid: 123, startTime: '12345', cgroup: GROUP }),
    observeCgroup: () => Promise.resolve({ device: '1', inode: '2', populated: !stopped }),
    runDocker: (args) => {
      if (args[0] === 'image')
        return Promise.resolve(
          migrationsDirectory === undefined ? 'sha256:' + 'f'.repeat(64) : backend.Image,
        );
      if (args[0] === 'ps') return Promise.resolve('');
      throw new Error('unexpected solver command');
    },
  };
  async function scoped(
    action: (
      owner: DependencyOwner,
      sourceToken: SourceDevExclusion,
      solver: SolverExclusion,
      deadline: number,
    ) => Promise<void>,
    budget = 10000,
    sourceDeadlineOffset = 0,
  ) {
    await withDependencyOwner(
      { sha: pins.sourceSha, layouts: [layouts.prod, layouts.dev] },
      async (owner) => {
        const deadline = performance.now() + budget;
        await withSolverDrainUnderOwner(owner, layouts, solverPins, ports, deadline, (solver) =>
          withSourceDevExcluded(
            owner,
            layouts,
            pins.sourceSha,
            docker,
            deadline + sourceDeadlineOffset,
            async (sourceToken) => {
              await fenceGatewaysUnderOwner(owner, layouts.prod, pins.sourceSha, docker, deadline);
              await fenceBackendsUnderOwner(
                owner,
                layouts.prod,
                pins.sourceSha,
                docker,
                deadline,
                undefined,
                undefined,
                sourceToken,
                solver,
              );
              await action(owner, sourceToken, solver, deadline);
            },
          ),
        );
      },
      root,
    );
  }
  return {
    docker,
    ports,
    solverPins,
    root,
    layouts,
    pins,
    contents,
    source,
    backend,
    inventory,
    commands,
    sourceRoot,
    prodPath,
    devPath,
    scoped,
    probes: () => probes,
    setIntercept: (hook: typeof intercept) => {
      intercept = hook;
    },
  };
}
