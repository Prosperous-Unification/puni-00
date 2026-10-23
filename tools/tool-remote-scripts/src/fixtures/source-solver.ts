import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { envLayout } from '../lib/env';
import { captureSolverFile, type SolverHostCommand, type SolverPorts } from '../lib/solver-host';
import {
  SOLVER_SUPERVISOR_BUN,
  SOLVER_SUPERVISOR_BUNDLE,
  SOLVER_SUPERVISOR_CONFIG,
  SOLVER_SUPERVISOR_SERVICE,
  SOLVER_SUPERVISOR_UNIT,
} from '../lib/solver-supervisor-install-contract';
const ID = '8'.repeat(64);
const TOKEN = '018f3f08-2ef7-7d1c-b645-14f877575d66';
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
export async function createSourceSolverFixture(root: string) {
  await mkdir(join(root, 'dev'));
  const layouts = {
    prod: { ...envLayout('prod'), root, stateDir: root },
    dev: { ...envLayout('dev'), root: join(root, 'dev'), stateDir: join(root, 'dev') },
  };
  const paths = [
    SOLVER_SUPERVISOR_BUN,
    SOLVER_SUPERVISOR_BUNDLE.remote,
    SOLVER_SUPERVISOR_CONFIG,
    SOLVER_SUPERVISOR_UNIT,
  ];
  const config = JSON.stringify({
    socketPath: '/run/user/1000/wbs-solver/supervisor.sock',
    maxSearchWorkers: 2,
    maxMemoryLimitMb: 512,
    pidsLimit: 128,
    maxManagedContainers: 16,
    devSourceSha: 'd'.repeat(40),
    images: [
      {
        callerName: 'be-01-blue',
        callerImage: `registry/be@sha256:${'b'.repeat(64)}`,
        solverImage: `registry/solver@sha256:${'c'.repeat(64)}`,
      },
    ],
  });
  const contents = ['bun', 'bundle', config, 'unit'];
  for (let index = 0; index < paths.length; index++)
    await writeFile(join(root, `installed-${String(index)}`), contents[index], {
      mode: [0o755, 0o755, 0o600, 0o644][index],
    });
  const pins = {
    version: 1 as const,
    sourceSha: 'd'.repeat(40),
    bunSha256: hash('bun'),
    bundleSha256: hash('bundle'),
    configSha256: hash(config),
    unitSha256: hash('unit'),
  };
  let stopped = false;
  let running = true;
  const commands: string[] = [];
  const container = () =>
    JSON.stringify({
      id: ID,
      name: `/wbs-solver-${TOKEN}`,
      labels: {
        'wbs-managed-solver': 'true',
        'wbs-attempt-token': TOKEN,
        'wbs-caller-id': 'b'.repeat(64),
        'wbs-project-id': TOKEN,
        'wbs-objective': 'pri',
      },
      image: `sha256:${'c'.repeat(64)}`,
      imageRef: `registry/solver@sha256:${'c'.repeat(64)}`,
      restart: { Name: 'no', MaximumRetryCount: 0 },
      restartCount: 0,
      state: {
        Running: running,
        Restarting: false,
        Paused: false,
        Dead: false,
        Status: running ? 'running' : 'exited',
        Pid: running ? 456 : 0,
        ExitCode: running ? 0 : 137,
        OOMKilled: false,
        Error: '',
        StartedAt: '2026-01-01T00:00:00Z',
        FinishedAt: running ? '0001-01-01T00:00:00Z' : '2026-01-01T00:01:00Z',
      },
    });
  const ports: SolverPorts = {
    edgeState: root,
    captureFile: async (path, maximum, decode) => {
      const index = paths.indexOf(path);
      if (index < 0) throw new Error('unknown installed path');
      const observed = await captureSolverFile(
        join(root, `installed-${String(index)}`),
        maximum,
        decode,
      );
      return { ...observed, path };
    },
    runHost: (command: SolverHostCommand) => {
      commands.push(command.kind);
      if (command.kind === 'stop') {
        stopped = true;
        return Promise.resolve('');
      }
      return Promise.resolve(unit(!stopped, root));
    },
    observeProcess: () => Promise.resolve({ pid: 123, startTime: '12345', cgroup: GROUP }),
    observeCgroup: () => Promise.resolve({ device: '1', inode: '2', populated: !stopped }),
    runDocker: (args) => {
      commands.push(args[0]);
      if (args[0] === 'image') return Promise.resolve(`sha256:${'c'.repeat(64)}\n`);
      if (args[0] === 'ps') return Promise.resolve(`${ID}\n`);
      if (args[0] === 'inspect') {
        if (args[1] === '--format') return Promise.resolve(container());
        const projected = JSON.parse(container()) as {
          id: string;
          name: string;
          labels: Record<string, string>;
          image: string;
          imageRef: string;
          restart: unknown;
          restartCount: number;
          state: unknown;
        };
        return Promise.resolve(
          JSON.stringify([
            {
              Id: projected.id,
              Name: projected.name,
              Image: projected.image,
              Config: {
                Image: projected.imageRef,
                Labels: projected.labels,
                Entrypoint: ['wbs-solver-launcher'],
              },
              HostConfig: {
                PidMode: '',
                Privileged: false,
                CapAdd: null,
                RestartPolicy: projected.restart,
              },
              Mounts: [{ Type: 'tmpfs', Source: '', Destination: '/tmp', RW: true }],
              Path: 'wbs-solver-launcher',
              Args: [],
              NetworkSettings: { Networks: {} },
              RestartCount: projected.restartCount,
              State: projected.state,
            },
          ]),
        );
      }
      if (args[0] === 'kill') {
        running = false;
        return Promise.resolve(`${ID}\n`);
      }
      if (args[0] === 'wait') return Promise.resolve('137\n');
      throw new Error(`unexpected Docker command ${args.join(' ')}`);
    },
  };
  return {
    root,
    layouts,
    pins,
    ports,
    commands,
    plan: { sha: 'd'.repeat(40), layouts: [layouts.prod, layouts.dev] },
  };
}
