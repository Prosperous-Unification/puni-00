import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { withDependencyOwner } from './edge-ownership';
import { envLayout } from './env';
import { withLock } from './lock';
import { readFields } from './managed-cohort';
import { withSolverDrainUnderOwner } from './solver-exclusion';
import { captureSolverFile, type SolverHostCommand, type SolverPorts } from './solver-host';
import {
  SOLVER_SUPERVISOR_BUN,
  SOLVER_SUPERVISOR_BUNDLE,
  SOLVER_SUPERVISOR_CONFIG,
  SOLVER_SUPERVISOR_SERVICE,
  SOLVER_SUPERVISOR_UNIT,
} from './solver-supervisor-install-contract';

const ID = 'a'.repeat(64);
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
      `${SOLVER_SUPERVISOR_BUN} ${SOLVER_SUPERVISOR_BUNDLE.remote} --config=${SOLVER_SUPERVISOR_CONFIG}`,
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
async function fixture() {
  const root = scratchSync('solver-drain-');
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
      if (args[0] === 'inspect') return Promise.resolve(container());
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
test('stops creator, drains child and holds actual runtime lock through callback and final readback', async () => {
  const f = await fixture();
  await withDependencyOwner(
    f.plan,
    async (owner) => {
      const value = await withSolverDrainUnderOwner(
        owner,
        f.layouts,
        f.pins,
        f.ports,
        performance.now() + 5000,
        async () => {
          expect(f.commands).toContain('kill');
          expect(f.commands.indexOf('stop')).toBeLessThan(f.commands.indexOf('ps'));
          await refuses(
            withLock(join(f.root, 'solver-runtime.lock'), () => Promise.resolve(undefined)),
            'lock held',
          );
          return 'protected';
        },
      );
      expect(value).toBe('protected');
    },
    f.root,
  );
  expect(await readFile(join(f.root, 'edge-owner.pending'), 'utf8')).toContain(
    'dependency-edge-owner',
  );
});
test('refuses missing dev ownership and changed installed tuple before stop', async () => {
  for (const fault of ['owner', 'tuple', 'mode', 'missing']) {
    const f = await fixture();
    if (fault === 'tuple') await writeFile(join(f.root, 'installed-1'), 'changed');
    if (fault === 'mode')
      await import('node:fs/promises').then((fs) => fs.chmod(join(f.root, 'installed-1'), 0o644));
    if (fault === 'missing')
      await import('node:fs/promises').then((fs) => fs.unlink(join(f.root, 'installed-1')));
    await withDependencyOwner(
      { ...f.plan, layouts: fault === 'owner' ? [f.layouts.prod] : f.plan.layouts },
      async (owner) => {
        await refuses(
          withSolverDrainUnderOwner(
            owner,
            f.layouts,
            f.pins,
            f.ports,
            performance.now() + 5000,
            () => Promise.resolve(undefined),
          ),
          fault === 'owner' ? 'own layout' : fault === 'missing' ? 'ENOENT' : 'tuple',
        );
        expect(f.commands).not.toContain('stop');
      },
      f.root,
    );
  }
});
test('surviving descendant and busy manual runtime prevent protected action', async () => {
  for (const fault of ['cgroup', 'runtime']) {
    const f = await fixture();
    const ports =
      fault === 'cgroup'
        ? {
            ...f.ports,
            observeCgroup: () => Promise.resolve({ device: '1', inode: '2', populated: true }),
          }
        : f.ports;
    let entered = false;
    const run = () =>
      withDependencyOwner(
        f.plan,
        async (owner) => {
          await refuses(
            withSolverDrainUnderOwner(
              owner,
              f.layouts,
              f.pins,
              ports,
              performance.now() + 5000,
              () => {
                entered = true;
                return Promise.resolve(undefined);
              },
            ),
            fault === 'cgroup' ? 'cgroup' : 'lock held',
          );
        },
        f.root,
      );
    if (fault === 'runtime') await withLock(join(f.root, 'solver-runtime.lock'), run);
    else await run();
    expect(entered).toBe(false);
  }
});

test('installed drift during authority observation refuses before stop', async () => {
  const f = await fixture();
  const ports = {
    ...f.ports,
    runHost: async (command: SolverHostCommand, signal?: AbortSignal) => {
      const stdout = await f.ports.runHost(command, signal);
      if (command.kind === 'show')
        await writeFile(join(f.root, 'installed-1'), 'changed during observation');
      return stdout;
    },
  };
  await withDependencyOwner(
    f.plan,
    async (owner) => {
      await refuses(
        withSolverDrainUnderOwner(owner, f.layouts, f.pins, ports, performance.now() + 5000, () =>
          Promise.resolve(undefined),
        ),
        'tuple',
      );
      expect(f.commands).not.toContain('stop');
    },
    f.root,
  );
});
test('stopped creator with surviving Docker child never enters protected work', async () => {
  const f = await fixture();
  const ports = {
    ...f.ports,
    runDocker: async (args: string[], signal?: AbortSignal) =>
      args[0] === 'kill' ? `${ID}\n` : f.ports.runDocker(args, signal),
  };
  let entered = false;
  await withDependencyOwner(
    f.plan,
    async (owner) => {
      await refuses(
        withSolverDrainUnderOwner(owner, f.layouts, f.pins, ports, performance.now() + 5000, () => {
          entered = true;
          return Promise.resolve(undefined);
        }),
        'terminal',
      );
    },
    f.root,
  );
  expect(entered).toBe(false);
});
test('never-started created attempts are inert and retained without kill wait or removal', async () => {
  const f = await fixture();
  const ports = {
    ...f.ports,
    runDocker: async (args: string[], signal?: AbortSignal) => {
      const stdout = await f.ports.runDocker(args, signal);
      if (args[0] !== 'inspect') return stdout;
      const observed = readFields(JSON.parse(stdout));
      Object.assign(readFields(observed['state']), {
        Running: false,
        Status: 'created',
        Pid: 0,
        StartedAt: '0001-01-01T00:00:00Z',
        FinishedAt: '0001-01-01T00:00:00Z',
      });
      return JSON.stringify(observed);
    },
  };
  await withDependencyOwner(
    f.plan,
    (owner) =>
      withSolverDrainUnderOwner(owner, f.layouts, f.pins, ports, performance.now() + 5000, () =>
        Promise.resolve(undefined),
      ),
    f.root,
  );
  expect(f.commands).not.toContain('kill');
  expect(f.commands).not.toContain('wait');
  expect(f.commands).not.toContain('rm');
});
test('kill errors recover only after independently inspecting the same terminal attempt', async () => {
  for (const terminal of [true, false]) {
    const f = await fixture();
    const ports = {
      ...f.ports,
      runDocker: async (args: string[], signal?: AbortSignal) => {
        if (args[0] !== 'kill') return f.ports.runDocker(args, signal);
        if (terminal) await f.ports.runDocker(args, signal);
        throw new Error('kill raced');
      },
    };
    let entered = false;
    await withDependencyOwner(
      f.plan,
      async (owner) => {
        const drain = withSolverDrainUnderOwner(
          owner,
          f.layouts,
          f.pins,
          ports,
          performance.now() + 5000,
          () => {
            entered = true;
            return Promise.resolve(undefined);
          },
        );
        if (terminal) await drain;
        else await refuses(drain, 'kill raced');
      },
      f.root,
    );
    expect(entered).toBe(terminal);
  }
});
test('final membership and installed readbacks refuse changes made inside the protected callback', async () => {
  for (const fault of ['new', 'missing', 'rename', 'label', 'tuple', 'inode', 'owner']) {
    const f = await fixture();
    let completed = false;
    const ports = {
      ...f.ports,
      runDocker: async (args: string[], signal?: AbortSignal) => {
        const stdout = await f.ports.runDocker(args, signal);
        if (!completed) return stdout;
        if (args[0] === 'ps' && fault === 'new') return `${ID}\n${'e'.repeat(64)}\n`;
        if (args[0] === 'ps' && fault === 'missing') return '';
        if (args[0] === 'inspect' && (fault === 'rename' || fault === 'label')) {
          const observed = readFields(JSON.parse(stdout));
          if (fault === 'rename') observed['name'] = '/renamed';
          else readFields(observed['labels'])['wbs-managed-solver'] = null;
          return JSON.stringify(observed);
        }
        return stdout;
      },
    };
    await withDependencyOwner(
      f.plan,
      async (owner) => {
        await refuses(
          withSolverDrainUnderOwner(
            owner,
            f.layouts,
            f.pins,
            ports,
            performance.now() + 5000,
            async () => {
              completed = true;
              if (fault === 'tuple') await writeFile(join(f.root, 'installed-1'), 'replaced');
              if (fault === 'inode') {
                await writeFile(join(f.root, 'replacement'), 'bundle', { mode: 0o755 });
                await import('node:fs/promises').then((fs) =>
                  fs.rename(join(f.root, 'replacement'), join(f.root, 'installed-1')),
                );
              }
              if (fault === 'owner') await writeFile(join(f.root, 'edge-owner.pending'), 'lost');
            },
          ),
          fault === 'new' || fault === 'missing'
            ? 'membership'
            : fault === 'tuple'
              ? 'tuple'
              : fault === 'owner'
                ? 'publication changed'
                : 'identity',
        );
      },
      f.root,
    );
    expect(completed).toBe(true);
  }
});
test('timeout and owner loss retain stop intent without claiming successful readback', async () => {
  for (const fault of ['timeout', 'owner']) {
    const f = await fixture();
    const ports = {
      ...f.ports,
      runHost: async (command: SolverHostCommand, signal?: AbortSignal) => {
        if (command.kind !== 'stop') return f.ports.runHost(command, signal);
        if (fault === 'timeout')
          return new Promise<string>(() => {
            /* Intentionally stalled external command. */
          });
        await writeFile(join(f.root, 'edge-owner.pending'), 'lost at stop');
        return '';
      },
    };
    let entered = false;
    await withDependencyOwner(
      f.plan,
      async (owner) => {
        await refuses(
          withSolverDrainUnderOwner(
            owner,
            f.layouts,
            f.pins,
            ports,
            performance.now() + (fault === 'timeout' ? 250 : 5000),
            () => {
              entered = true;
              return Promise.resolve(undefined);
            },
          ),
          '',
        );
      },
      f.root,
    );
    expect(entered).toBe(false);
    const names = await import('node:fs/promises').then((fs) => fs.readdir(f.root));
    const stopIntent = names.find((name) => name.endsWith('-solver-stop.json'));
    expect(stopIntent).toBeDefined();
    expect(names.some((name) => name.endsWith('-solver-complete.json'))).toBe(false);
  }
});

async function refuses(promise: Promise<unknown>, message: string): Promise<void> {
  let failure: unknown;
  try {
    await promise;
  } catch (cause) {
    failure = cause;
  }
  expect(failure).toBeInstanceOf(Error);
  if (failure instanceof Error) expect(failure.message).toContain(message);
}

test('unrecognized effective unit and namespace refuse before stop', async () => {
  for (const [field, value] of [
    ['LoadState', 'not-found'],
    ['Names', 'alias.service'],
    ['DropInPaths', '/unknown'],
    ['Transient', 'yes'],
    ['NeedDaemonReload', 'yes'],
    ['ExecStartPre', '/unknown'],
    ['Environment', 'WBS_EDGE_STATE=/different/state'],
    ['KillMode', 'process'],
  ]) {
    const f = await fixture();
    const ports = {
      ...f.ports,
      runHost: async (command: SolverHostCommand, signal?: AbortSignal) => {
        const stdout = await f.ports.runHost(command, signal);
        return stdout.replace(new RegExp(`^${field}=.*$`, 'm'), `${field}=${value}`);
      },
    };
    await withDependencyOwner(
      f.plan,
      async (owner) => {
        await refuses(
          withSolverDrainUnderOwner(owner, f.layouts, f.pins, ports, performance.now() + 5000, () =>
            Promise.resolve(undefined),
          ),
          'authority',
        );
      },
      f.root,
    );
    expect(f.commands).not.toContain('stop');
  }
});

test('name-family discovery exposes containers hidden by a removed managed label', async () => {
  const f = await fixture();
  const ports = {
    ...f.ports,
    runDocker: async (args: string[], signal?: AbortSignal) => {
      const stdout = await f.ports.runDocker(args, signal);
      if (args[0] === 'ps' && args.includes('label=wbs-managed-solver=true')) return '';
      if (args[0] !== 'inspect') return stdout;
      const observed = readFields(JSON.parse(stdout));
      readFields(observed['labels'])['wbs-managed-solver'] = null;
      return JSON.stringify(observed);
    },
  };
  let entered = false;
  await withDependencyOwner(
    f.plan,
    async (owner) => {
      await refuses(
        withSolverDrainUnderOwner(owner, f.layouts, f.pins, ports, performance.now() + 5000, () => {
          entered = true;
          return Promise.resolve(undefined);
        }),
        'identity',
      );
    },
    f.root,
  );
  expect(entered).toBe(false);
});

test('child created during creator stop is included in the first captured Docker cohort', async () => {
  const f = await fixture();
  let childExists = false;
  const ports = {
    ...f.ports,
    runHost: async (command: SolverHostCommand, signal?: AbortSignal) => {
      const stdout = await f.ports.runHost(command, signal);
      if (command.kind === 'stop') childExists = true;
      return stdout;
    },
    runDocker: (args: string[], signal?: AbortSignal) => {
      if (!childExists) return Promise.reject(new Error('cohort captured before creator stopped'));
      return f.ports.runDocker(args, signal);
    },
  };
  await withDependencyOwner(
    f.plan,
    (owner) =>
      withSolverDrainUnderOwner(owner, f.layouts, f.pins, ports, performance.now() + 5000, () => {
        expect(f.commands).toContain('kill');
        return Promise.resolve(undefined);
      }),
    f.root,
  );
});

test('unreviewed solver image or changed resolved image identity refuses before kill', async () => {
  for (const fault of ['reference', 'identity']) {
    const f = await fixture();
    const ports = {
      ...f.ports,
      runDocker: async (args: string[], signal?: AbortSignal) => {
        const stdout = await f.ports.runDocker(args, signal);
        if (args[0] !== 'inspect') return stdout;
        const observed = readFields(JSON.parse(stdout));
        if (fault === 'reference')
          observed['imageRef'] = `registry/unknown@sha256:${'e'.repeat(64)}`;
        else observed['image'] = `sha256:${'e'.repeat(64)}`;
        return JSON.stringify(observed);
      },
    };
    let entered = false;
    await withDependencyOwner(
      f.plan,
      async (owner) => {
        await refuses(
          withSolverDrainUnderOwner(
            owner,
            f.layouts,
            f.pins,
            ports,
            performance.now() + 5000,
            () => {
              entered = true;
              return Promise.resolve(undefined);
            },
          ),
          'image',
        );
      },
      f.root,
    );
    expect(entered).toBe(false);
    expect(f.commands).not.toContain('kill');
  }
});

test('actual owner namespace must match the effective solver admission directory', async () => {
  const f = await fixture();
  const ports = {
    ...f.ports,
    edgeState: `${f.root}/different`,
    runHost: async (command: SolverHostCommand, signal?: AbortSignal) =>
      (await f.ports.runHost(command, signal)).replace(
        `WBS_EDGE_STATE=${f.root}`,
        `WBS_EDGE_STATE=${f.root}/different`,
      ),
  };
  await withDependencyOwner(
    f.plan,
    async (owner) => {
      await refuses(
        withSolverDrainUnderOwner(owner, f.layouts, f.pins, ports, performance.now() + 5000, () =>
          Promise.resolve(undefined),
        ),
        'namespace',
      );
    },
    f.root,
  );
  expect(f.commands).toEqual([]);
});

test('composed callable exposes live owner through the full protected interval and returns blocked activation', async () => {
  const f = await fixture();
  const { excludeSolverUnderDependencyOwner } = await import('./dependency-activation-owner');
  const { assertDependencyOwner } = await import('./edge-ownership');
  const receipt = await excludeSolverUnderDependencyOwner(
    f.plan,
    f.pins,
    f.ports,
    performance.now() + 5000,
    async (owner) => {
      await assertDependencyOwner(owner, f.layouts.prod);
      await assertDependencyOwner(owner, f.layouts.dev);
      await refuses(
        withLock(join(f.root, 'solver-runtime.lock'), () => Promise.resolve(undefined)),
        'lock held',
      );
      return owner;
    },
    f.root,
  );
  expect(receipt.activation).toBe('blocked');
  await refuses(assertDependencyOwner(receipt.value, f.layouts.prod), 'not live');
});

test('zero-exit stop with an active effective unit refuses before protected work', async () => {
  const f = await fixture();
  let observations = 0;
  const ports = {
    ...f.ports,
    runHost: (command: SolverHostCommand, signal?: AbortSignal) =>
      command.kind === 'stop' ? Promise.resolve('') : f.ports.runHost(command, signal),
    observeCgroup: () =>
      Promise.resolve({ device: '1', inode: '2', populated: ++observations === 1 }),
  };
  let entered = false;
  await withDependencyOwner(
    f.plan,
    async (owner) => {
      await refuses(
        withSolverDrainUnderOwner(owner, f.layouts, f.pins, ports, performance.now() + 5000, () => {
          entered = true;
          return Promise.resolve(undefined);
        }),
        'did not stop',
      );
    },
    f.root,
  );
  expect(entered).toBe(false);
});

test('missing unreadable and changed initial process identity refuse before stop', async () => {
  for (const fault of ['missing', 'unreadable', 'identity']) {
    const f = await fixture();
    let observations = 0;
    const ports = {
      ...f.ports,
      observeProcess: () => {
        observations++;
        if (fault !== 'identity') return Promise.reject(new Error(`process ${fault}`));
        return Promise.resolve({
          pid: 123,
          startTime: observations === 1 ? '12345' : '67890',
          cgroup: GROUP,
        });
      },
    };
    await withDependencyOwner(
      f.plan,
      async (owner) => {
        await refuses(
          withSolverDrainUnderOwner(owner, f.layouts, f.pins, ports, performance.now() + 5000, () =>
            Promise.resolve(undefined),
          ),
          fault === 'identity' ? 'identity changed' : fault,
        );
      },
      f.root,
    );
    expect(f.commands).not.toContain('stop');
  }
});
