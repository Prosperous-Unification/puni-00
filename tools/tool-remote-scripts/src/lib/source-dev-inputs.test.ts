import { rejects } from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { sourceFixture } from '../fixtures/source-dev';
import { prepareImageProbe, runImageProbe } from '../fixtures/source-image-probe';
import { artifact, roots } from '../fixtures/source-startup';
import { type DependencyOwner, withDependencyOwner } from './edge-ownership';
import { envLayout, sourceDevContract } from './env';
import { type SourceDevExclusion, withSourceDevExcluded } from './source-dev-exclusion';
import {
  inspectSourceDevInputs,
  observeSourceDevInputs,
  type SourceDevInputObservation,
} from './source-dev-inputs';

const digest = (contents: string) => createHash('sha256').update(contents).digest('hex');
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
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const prepared = await artifact();
  const root = await mkdtemp(join(tmpdir(), 'source-owner-'));
  roots.push(root);
  await mkdir(join(root, 'dev'), { mode: 0o755 });
  const layouts = {
    prod: { ...envLayout('prod'), root, stateDir: root },
    dev: { ...envLayout('dev'), root: join(root, 'dev'), stateDir: join(root, 'dev') },
  };
  const sourceRoot = join(layouts.dev.root, 'src');
  await cp(prepared.root, sourceRoot, { recursive: true, verbatimSymlinks: true });
  for (const tier of ['be-01', 'gw-01', 'mcp-01', 'fe-01']) {
    const path = join(sourceRoot, 'apps/wbs', tier, '.env');
    await writeFile(path, 'MIGRATE_ON_STARTUP=false\n#\n');
    await chmod(path, 0o600);
  }
  const source = {
    ...sourceFixture(),
    Config: { ...sourceFixture().Config, Env: [...controls] },
    Image: prepared.pins.runtimeImageId,
  };
  source.Mounts = sourceDevContract(layouts.dev).mounts.map((mount) => ({
    Type: 'bind',
    Source: mount.source,
    Destination: mount.target,
    RW: mount.writable,
  }));
  const inventory = [source];
  const commands: string[][] = [];
  let fault = '';
  let imageEnvironment: string[] = [];
  let imageProbeRoot: string | undefined;
  let probes = 0;
  let stallNextInspection = false;
  let releaseInspection: (() => void) | undefined;
  let inspectionSignal: AbortSignal | undefined;
  const docker = async (args: string[], signal?: AbortSignal) => {
    commands.push(args);
    if (args[0] === 'ps') return inventory.map((member) => member.Id).join('\n');
    if (args[0] === 'inspect') {
      if (stallNextInspection) {
        stallNextInspection = false;
        inspectionSignal = signal;
        return new Promise<string>((resolve, reject) => {
          releaseInspection = () => {
            resolve(JSON.stringify(inventory));
          };
          signal?.addEventListener(
            'abort',
            () => {
              reject(new Error('stalled source read aborted'));
            },
            { once: true },
          );
        });
      }
      return JSON.stringify(inventory);
    }
    if (args[0] === 'image')
      return args.includes('--format')
        ? source.Image
        : JSON.stringify([
            {
              Id: source.Image,
              Config: { Entrypoint: source.Config.Entrypoint, Env: imageEnvironment },
            },
          ]);
    if (args[0] === 'update') {
      source.HostConfig.RestartPolicy.Name = 'no';
      return '';
    }
    if (args[0] === 'stop') {
      source.State.Running = false;
      source.State.Pid = 0;
      source.State.Status = 'exited';
      source.State.FinishedAt = '2026-10-23T01:00:00Z';
      return '';
    }
    if (args[0] === 'diff') return fault === 'diff' ? 'C /usr/local/bin/bun\n' : 'C /tmp\n';
    if (args[0] === 'run') {
      if (args.includes('--eval') || args.at(-2) === '-c') {
        if (imageProbeRoot !== undefined) {
          const observed = await runImageProbe(args, imageProbeRoot, signal);
          if (observed.code !== 0) throw new Error('native image config probe failed');
          return observed.stdout;
        }
        if (fault === 'global') throw new Error('SECRET_SENTINEL');
        return 'wbs-source-image-config-absent-v1\n';
      }
      probes++;
      if (fault === 'timeout')
        return new Promise<string>((_resolve, reject) => {
          signal?.addEventListener(
            'abort',
            () => {
              reject(new Error('SECRET_SENTINEL'));
            },
            {
              once: true,
            },
          );
        });
      if (fault === 'drift' && probes === 4)
        await writeFile(join(sourceRoot, 'node_modules/module.js'), 'changed');
      if (fault === 'stderr') throw new Error('SECRET_SENTINEL');
      if (fault === 'malformed') return 'SECRET_SENTINEL';
      const workdir = args[args.indexOf('--workdir') + 1];
      const role = workdir.endsWith('be-01')
        ? 'backend'
        : workdir.endsWith('gw-01')
          ? 'gateway'
          : 'mcp';
      return JSON.stringify({
        protocol: 'wbs-dependency-runtime',
        version: 1,
        role: fault === 'role' ? 'frontend' : role,
        semantics: fault === 'empty' ? [] : ['cross-project-dependencies-v1'],
      });
    }
    throw new Error('unexpected Docker command');
  };
  const pins = { ...prepared.pins, environmentSha256: digest(JSON.stringify(source.Config.Env)) };
  async function scoped(
    action: (owner: DependencyOwner, token: SourceDevExclusion) => Promise<void>,
  ) {
    await withDependencyOwner(
      { sha: prepared.sourceSha, layouts: [layouts.prod, layouts.dev] },
      async (owner) => {
        await withSourceDevExcluded(
          owner,
          layouts,
          prepared.sourceSha,
          docker,
          performance.now() + 10000,
          (token) => action(owner, token),
        );
      },
      root,
    );
  }
  return {
    prepared,
    sourceRoot,
    source,
    inventory,
    layouts,
    docker,
    commands,
    pins,
    scoped,
    stallSourceInspection: () => {
      stallNextInspection = true;
    },
    releaseSourceInspection: () => {
      releaseInspection?.();
    },
    sourceInspectionAborted: () => inspectionSignal?.aborted,
    setImageEnvironment: (environment: string[]) => {
      imageEnvironment = [...environment];
    },
    setImageProbeRoot: (root: string) => {
      imageProbeRoot = root;
    },
    setFault: (value: string) => {
      fault = value;
    },
    probes: () => probes,
  };
}
test('source input observations are private hash-only blocked records bound to live owner and source', async () => {
  const f = await fixture();
  let retained: SourceDevInputObservation | undefined;
  let previous: DependencyOwner | undefined;
  await f.scoped(async (owner, token) => {
    previous = owner;
    const observed = await observeSourceDevInputs(
      owner,
      f.layouts,
      token,
      f.pins,
      f.prepared.contents,
      f.docker,
      performance.now() + 5000,
    );
    retained = observed;
    expect(observed.activation).toBe('blocked');
    expect(
      observed.capabilities.map((capability) => `${capability.role}/${capability.purpose}`),
    ).toEqual(['backend/candidate', 'backend/retained', 'gateway/candidate', 'mcp/candidate']);
    expect(JSON.stringify(observed)).not.toContain('MIGRATE_ON_STARTUP');
    await inspectSourceDevInputs(owner, observed);
    await rejects(
      inspectSourceDevInputs(
        owner,
        JSON.parse(JSON.stringify(observed)) as SourceDevInputObservation,
      ),
    );
  });
  if (previous === undefined || retained === undefined) throw new Error('missing observation');
  await rejects(inspectSourceDevInputs(previous, retained));
  expect(f.probes()).toBe(4);
  const runs = f.commands.filter(
    (command) => command[0] === 'run' && !command.includes('--eval') && command.at(-2) !== '-c',
  );
  expect(runs).toHaveLength(4);
  for (const command of runs) {
    expect(command).toContain('--no-env-file');
    expect(command).toContain('none');
    expect(command).toContain(f.pins.runtimeImageId);
    expect(command.join(' ')).not.toContain('/data');
    expect(command.join(' ')).not.toContain('DB_PATH');
    expect(command.join(' ')).toContain(
      'readonly,bind-propagation=rprivate,bind-recursive=readonly',
    );
  }
});
for (const fault of ['diff', 'global', 'role', 'empty', 'stderr', 'malformed', 'drift', 'timeout'])
  test(`observer refuses ${fault} and scrubs private failures`, async () => {
    const f = await fixture();
    await f.scoped(async (owner, token) => {
      f.setFault(fault);
      try {
        await observeSourceDevInputs(
          owner,
          f.layouts,
          token,
          f.pins,
          f.prepared.contents,
          f.docker,
          performance.now() + (fault === 'timeout' ? 1000 : 5000),
        );
        throw new Error('accepted');
      } catch (error) {
        expect(String(error)).not.toContain('SECRET_SENTINEL');
        expect(String(error)).not.toContain('accepted');
      }
      if (['diff', 'global'].includes(fault)) expect(f.probes()).toBe(0);
    });
  });
test('expected manifest digest wrong owner SHA image or ordered environment refuses before role CLI', async () => {
  for (const fault of ['manifest', 'sha', 'image', 'env', 'control']) {
    const f = await fixture();
    if (fault === 'env') f.source.Config.Env.reverse();
    if (fault === 'control') f.source.Config.Env.push('NODE_OPTIONS=SECRET_SENTINEL');
    await f.scoped(async (owner, token) => {
      const pins = {
        ...f.pins,
        ...(fault === 'manifest' ? { manifestSha256: '0'.repeat(64) } : {}),
        ...(fault === 'sha' ? { sourceSha: 'f'.repeat(40) } : {}),
        ...(fault === 'image' ? { runtimeImageId: `sha256:${'f'.repeat(64)}` } : {}),
      };
      if (fault === 'control') pins.environmentSha256 = digest(JSON.stringify(f.source.Config.Env));
      await rejects(
        observeSourceDevInputs(
          owner,
          f.layouts,
          token,
          pins,
          f.prepared.contents,
          f.docker,
          performance.now() + (fault === 'timeout' ? 1000 : 5000),
        ),
      );
      expect(f.probes()).toBe(0);
    });
  }
});
test('foreign copied source token refuses before Docker or filesystem probes', async () => {
  const f = await fixture();
  await f.scoped(async (owner, token) => {
    const before = f.commands.length;
    await rejects(
      observeSourceDevInputs(
        owner,
        f.layouts,
        JSON.parse(JSON.stringify(token)) as SourceDevExclusion,
        f.pins,
        f.prepared.contents,
        f.docker,
        performance.now() + 5000,
      ),
    );
    expect(f.commands.length).toBe(before);
  });
});

test('real pinned Bun suppresses poisoned dotenv and executes each actual DB-free role independently', async () => {
  expect(Bun.version).toBe('1.4.2');
  const root = await mkdtemp(join(tmpdir(), 'source-role-'));
  roots.push(root);
  await writeFile(
    join(root, '.env'),
    'SOURCE_SECRET=SECRET_SENTINEL\nDB_PATH=./forbidden.sqlite\n',
  );
  const probe = async (noEnv: boolean) => {
    const child = Bun.spawn(
      [
        process.execPath,
        ...(noEnv ? ['--no-env-file'] : []),
        '--eval',
        'console.log(process.env.SOURCE_SECRET === undefined ? "absent" : "loaded")',
      ],
      {
        cwd: root,
        env: { PATH: '/usr/local/bin:/usr/bin:/bin', BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0' },
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(code).toBe(0);
    expect(stderr).toBe('');
    return stdout;
  };
  expect(await probe(false)).toBe('loaded\n');
  expect(await probe(true)).toBe('absent\n');
  const { decodeRoleDependencyCapabilities } = await import('./dependency-capability');
  for (const [role, tier] of [
    ['backend', 'be-01'],
    ['backend', 'be-01'],
    ['gateway', 'gw-01'],
    ['mcp', 'mcp-01'],
  ] as const) {
    const child = Bun.spawn(
      [
        process.execPath,
        '--no-env-file',
        'run',
        join(
          import.meta.dir,
          '../../../..',
          'apps/wbs',
          tier,
          'src/dependency-capabilities-cli.ts',
        ),
      ],
      {
        cwd: root,
        env: { PATH: '/usr/local/bin:/usr/bin:/bin', BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0' },
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(code).toBe(0);
    expect(stderr).toBe('');
    expect(decodeRoleDependencyCapabilities(stdout, role)).toEqual([
      'cross-project-dependencies-v1',
    ]);
    for (const wrongRole of ['backend', 'gateway', 'mcp'] as const)
      if (wrongRole !== role)
        expect(() => decodeRoleDependencyCapabilities(stdout, wrongRole)).toThrow();
  }
  expect(await Bun.file(join(root, 'forbidden.sqlite')).exists()).toBe(false);
});

test('actual pinned Nx selects explicit local caches and false daemon/plugin controls', async () => {
  const root = await mkdtemp(join(tmpdir(), 'source-nx-'));
  roots.push(root);
  await writeFile(
    join(root, 'nx.json'),
    JSON.stringify({ plugins: [], useInferencePlugins: false }),
  );
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({ name: 'source-profile-fixture', private: true }),
  );
  await writeFile(join(root, '.env.serve'), 'NX_SOURCE_SECRET=SECRET_SENTINEL\n');
  await mkdir(join(root, 'poisoned-home/.nx'), { recursive: true });
  await writeFile(join(root, 'poisoned-home/.nx/cache'), 'SECRET_SENTINEL');
  const dependencyRoot = join(import.meta.dir, '../../../../node_modules/nx/dist/src');
  const cache = join(root, '.nx/cache');
  const workspace = join(root, '.nx/workspace-data');
  const native = join(root, '.nx/native');
  const script = `
const paths=require(${JSON.stringify(join(dependencyRoot, 'utils/cache-directory.js'))});
const native=require(${JSON.stringify(join(dependencyRoot, 'native/native-file-cache-location.js'))});
const plugins=require(${JSON.stringify(join(dependencyRoot, 'project-graph/plugins/isolation/enabled.js'))});
const daemon=require(${JSON.stringify(join(dependencyRoot, 'daemon/client/client.js'))}).daemonClient;
const taskEnv=require(${JSON.stringify(join(dependencyRoot, 'tasks-runner/task-env.js'))});
const caches=require(${JSON.stringify(join(dependencyRoot, 'project-graph/nx-deps-cache.js'))});
let graphCacheRead=false;
caches.readFileMapCache=()=>{graphCacheRead=true;throw new Error('poisoned file-map cache selected');};
const graph=require(${JSON.stringify(join(dependencyRoot, 'project-graph/project-graph.js'))});
await graph.buildProjectGraphAndSourceMapsWithoutDaemon();
const task=taskEnv.getGraphTimeDotEnvForTask('', 'serve', undefined, undefined);
console.log(JSON.stringify({cache:paths.cacheDirectoryForWorkspace(process.cwd()),workspace:paths.workspaceDataDirectoryForWorkspace(process.cwd()),native:native.ensureSecureNativeFileCacheLocation(),isolated:plugins.isIsolationEnabled(),daemon:daemon.enabled(),graphCacheRead,dotenv:task.NX_SOURCE_SECRET===undefined,version:require(${JSON.stringify(join(dependencyRoot, '../../package.json'))}).version}));`;
  const child = Bun.spawn([process.execPath, '--no-env-file', '--eval', script], {
    cwd: root,
    env: {
      PATH: process.env['PATH'],
      HOME: join(root, 'poisoned-home'),
      NX_DAEMON: 'false',
      NX_CACHE_PROJECT_GRAPH: 'false',
      NX_SKIP_NX_CACHE: 'true',
      NX_LOAD_DOT_ENV_FILES: 'false',
      NX_ISOLATE_PLUGINS: 'false',
      NX_CACHE_DIRECTORY: cache,
      NX_WORKSPACE_DATA_DIRECTORY: workspace,
      NX_NATIVE_FILE_CACHE_DIRECTORY: native,
      BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0',
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(code).toBe(0);
  expect(stderr).toBe('');
  expect(JSON.parse(stdout)).toEqual({
    cache,
    workspace,
    native,
    isolated: false,
    daemon: false,
    graphCacheRead: false,
    dotenv: true,
    version: '23.2.1',
  });
});

test('manifest source identity must agree with owner even when expected pins and digest agree', async () => {
  const f = await fixture();
  await f.scoped(async (owner, token) => {
    const sourceSha = 'f'.repeat(40);
    const contents = JSON.stringify({ ...f.prepared.manifest, sourceSha }) + '\n';
    await rejects(
      observeSourceDevInputs(
        owner,
        f.layouts,
        token,
        { ...f.pins, sourceSha, manifestSha256: digest(contents) },
        contents,
        f.docker,
        performance.now() + 5000,
      ),
    );
    expect(f.probes()).toBe(0);
  });
});

test('effective environment hash and forbidden controls are independently checked', async () => {
  const { assertSourceEnvironment } = await import('./source-startup-manifest');
  const expected = digest(JSON.stringify(controls));
  assertSourceEnvironment(controls, [], expected);
  expect(() => {
    assertSourceEnvironment([...controls].reverse(), [], expected);
  }).toThrow();
  for (const assignment of [
    'NODE_OPTIONS=SECRET_SENTINEL',
    'BUN_OPTIONS=',
    'NX_PLUGIN_ISOLATE=false',
    'NX_TASKS_RUNNER=x',
    'NPM_CONFIG_PREFIX=x',
    'XDG_CONFIG_HOME=/tmp',
  ]) {
    const environment = [...controls, assignment];
    expect(() => {
      assertSourceEnvironment(environment, [], digest(JSON.stringify(environment)));
    }).toThrow();
  }
  expect(() => {
    assertSourceEnvironment(
      [...controls, ...controls],
      [],
      digest(JSON.stringify([...controls, ...controls])),
    );
  }).toThrow();
});

test('actual native image config probe refuses present and dangling passwd-home bunfig files', async () => {
  const f = await fixture();
  const root = await mkdtemp('/tmp/source-image-');
  roots.push(root);
  await prepareImageProbe(root);
  f.setImageProbeRoot(root);
  await f.scoped(async (owner, token) => {
    await observeSourceDevInputs(
      owner,
      f.layouts,
      token,
      f.pins,
      f.prepared.contents,
      f.docker,
      performance.now() + 5000,
    );
  });
  const command = f.commands.find((command) => command.at(-2) === '-c');
  if (command === undefined) throw new Error('missing native image probe');
  expect(await runImageProbe(command, root)).toEqual({
    stdout: 'wbs-source-image-config-absent-v1\n',
    stderr: '',
    code: 0,
  });
  await writeFile(join(root, 'passwd-home/.bunfig.toml'), 'SECRET_SENTINEL');
  expect((await runImageProbe(command, root)).code).not.toBe(0);
  await rm(join(root, 'passwd-home/.bunfig.toml'));
  const { symlink } = await import('node:fs/promises');
  await symlink('missing', join(root, 'passwd-home/.bunfig.toml'));
  expect((await runImageProbe(command, root)).code).not.toBe(0);
});

test('private application environment stays absent from observation and durable Docker records', async () => {
  const f = await fixture();
  const desired = [...controls, 'APP_SECRET=SECRET_SENTINEL'];
  f.source.Config.Env = [...desired];
  await f.scoped(async (owner, token) => {
    const observed = await observeSourceDevInputs(
      owner,
      f.layouts,
      token,
      { ...f.pins, environmentSha256: digest(JSON.stringify(desired)) },
      f.prepared.contents,
      f.docker,
      performance.now() + 5000,
    );
    expect(JSON.stringify(observed)).not.toContain('SECRET_SENTINEL');
    const { readdir, readFile } = await import('node:fs/promises');
    for (const directory of [f.layouts.prod.stateDir, f.layouts.dev.stateDir])
      for (const name of await readdir(directory))
        if (name.endsWith('.json'))
          expect(await readFile(join(directory, name), 'utf8')).not.toContain('SECRET_SENTINEL');
  });
});
test('filesystem or private config drift cannot reach any role executable', async () => {
  for (const path of [
    'node_modules/module.js',
    'apps/wbs/be-01/.env',
    'apps/wbs/gw-01/.env.prepare',
  ]) {
    const f = await fixture();
    await writeFile(join(f.sourceRoot, path), 'SECRET_SENTINEL', { mode: 0o644 });
    await f.scoped(async (owner, token) => {
      await rejects(
        observeSourceDevInputs(
          owner,
          f.layouts,
          token,
          f.pins,
          f.prepared.contents,
          f.docker,
          performance.now() + 5000,
        ),
      );
      expect(f.probes()).toBe(0);
    });
  }
});

test('cold profile requires every control assignment with its exact value', async () => {
  const { assertSourceEnvironment } = await import('./source-startup-manifest');
  for (const environment of [
    controls.filter((assignment) => assignment !== 'NX_DAEMON=false'),
    controls.map((assignment) =>
      assignment === 'NX_ISOLATE_PLUGINS=false' ? 'NX_ISOLATE_PLUGINS=true' : assignment,
    ),
  ])
    expect(() => {
      assertSourceEnvironment(environment, [], digest(JSON.stringify(environment)));
    }).toThrow();
});

test('image config checks use native tools in both passwd and unchanged image HOME contexts', async () => {
  const f = await fixture();
  const root = await mkdtemp('/tmp/source-image-');
  roots.push(root);
  await prepareImageProbe(root);
  const desired = [...controls, `HOME=${root}/image-home`];
  f.source.Config.Env = [...desired];
  f.setImageEnvironment([`HOME=${root}/image-home`]);
  f.setImageProbeRoot(root);
  await f.scoped(async (owner, token) => {
    await observeSourceDevInputs(
      owner,
      f.layouts,
      token,
      { ...f.pins, environmentSha256: digest(JSON.stringify(desired)) },
      f.prepared.contents,
      f.docker,
      performance.now() + 5000,
    );
  });
  const probes = f.commands.filter(
    (command) => command[0] === 'run' && (command.includes('--eval') || command.at(-2) === '-c'),
  );
  expect(probes).toHaveLength(4);
  expect(probes.filter((command) => command.includes(`HOME=${root}/image-home`))).toHaveLength(2);
  expect(
    probes.filter((command) => !command.some((argument) => argument.startsWith('HOME='))),
  ).toHaveLength(2);
  for (const probe of probes) {
    expect(probe).toContain('/bin/sh');
    expect(probe).not.toContain('/usr/local/bin/bun');
    expect(probe.join(' ')).not.toContain('--mount');
    expect(probe.join(' ')).not.toContain('XDG_CONFIG_HOME=');
  }
});
for (const home of ['passwd-home', 'image-home'] as const)
  test(`only ${home} bunfig poison independently refuses before any role CLI`, async () => {
    const f = await fixture();
    const root = await mkdtemp('/tmp/source-image-');
    roots.push(root);
    await prepareImageProbe(root);
    await writeFile(join(root, home, '.bunfig.toml'), 'SECRET_SENTINEL');
    const desired = [...controls, `HOME=${root}/image-home`];
    f.source.Config.Env = [...desired];
    f.setImageEnvironment([`HOME=${root}/image-home`]);
    f.setImageProbeRoot(root);
    await f.scoped(async (owner, token) => {
      await rejects(
        observeSourceDevInputs(
          owner,
          f.layouts,
          token,
          { ...f.pins, environmentSha256: digest(JSON.stringify(desired)) },
          f.prepared.contents,
          f.docker,
          performance.now() + 5000,
        ),
      );
      expect(f.probes()).toBe(0);
    });
  });

test('absent image HOME still runs the native passwd context before and after capabilities', async () => {
  const f = await fixture();
  const root = await mkdtemp('/tmp/source-image-');
  roots.push(root);
  await prepareImageProbe(root);
  f.setImageProbeRoot(root);
  await f.scoped(async (owner, token) => {
    await observeSourceDevInputs(
      owner,
      f.layouts,
      token,
      f.pins,
      f.prepared.contents,
      f.docker,
      performance.now() + 5000,
    );
  });
  const probes = f.commands.filter((command) => command.at(-2) === '-c');
  expect(probes).toHaveLength(2);
  for (const command of probes)
    expect(command.some((argument) => argument.startsWith('HOME='))).toBe(false);
  expect(f.probes()).toBe(4);
});
for (const fault of [
  'resolver-missing',
  'resolver-unreadable',
  'resolver-malformed',
  'resolver-oversized',
  'resolver-wrong-uid',
  'home-relative',
  'home-overlong',
  'enumeration-failed',
  'enumeration-malformed',
  'home-missing',
  'home-unreadable',
  'home-symlink',
  'src-config',
  'src-dangling',
  'src-unreadable',
] as const)
  test(`native image input check refuses ${fault} before a role CLI`, async () => {
    const f = await fixture();
    const root = await mkdtemp('/tmp/source-image-');
    roots.push(root);
    await prepareImageProbe(root);
    f.setImageProbeRoot(root);
    const { symlink, rename } = await import('node:fs/promises');
    if (fault === 'resolver-missing') await rm(join(root, 'getent'));
    if (fault === 'resolver-unreadable') await chmod(join(root, 'getent'), 0);
    if (fault === 'enumeration-failed') await writeFile(join(root, 'find'), '#!/bin/sh\nexit 74\n');
    if (fault === 'enumeration-malformed')
      await writeFile(
        join(root, 'find'),
        '#!/bin/sh\ncase "$8" in .bunfig.toml) printf SECRET_SENTINEL ;; *) exec /usr/bin/find "$@" ;; esac\n',
      );
    if (fault === 'resolver-malformed')
      await writeFile(join(root, 'getent'), '#!/bin/sh\nprintf broken\n');
    if (fault === 'resolver-oversized')
      await writeFile(
        join(root, 'getent'),
        `#!/bin/sh\nprintf '%s' '${'x'.repeat(16385)}:x:1000:1000:fixture:${root}/passwd-home:/bin/sh'\n`,
      );
    if (fault === 'resolver-wrong-uid')
      await writeFile(
        join(root, 'getent'),
        `#!/bin/sh\nprintf '%s' 'fixture:x:1001:1000:fixture:${root}/passwd-home:/bin/sh'\n`,
      );
    if (fault === 'home-relative')
      await writeFile(
        join(root, 'getent'),
        "#!/bin/sh\nprintf '%s' 'fixture:x:1000:1000:fixture:relative:/bin/sh'\n",
      );
    if (fault === 'home-overlong')
      await writeFile(
        join(root, 'getent'),
        `#!/bin/sh\nprintf '%s' 'fixture:x:1000:1000:fixture:/${'x'.repeat(4096)}:/bin/sh'\n`,
      );
    if (fault === 'home-missing') await rm(join(root, 'passwd-home'), { recursive: true });
    if (fault === 'home-unreadable') await chmod(join(root, 'passwd-home'), 0);
    if (fault === 'home-symlink') {
      await rename(join(root, 'passwd-home'), join(root, 'elsewhere'));
      await symlink('elsewhere', join(root, 'passwd-home'));
    }
    if (fault === 'src-config') await writeFile(join(root, 'src/bunfig.toml'), 'SECRET_SENTINEL');
    if (fault === 'src-dangling') await symlink('missing', join(root, 'src/bunfig.toml'));
    if (fault === 'src-unreadable') await chmod(join(root, 'src'), 0);
    try {
      await f.scoped(async (owner, token) => {
        await rejects(
          observeSourceDevInputs(
            owner,
            f.layouts,
            token,
            f.pins,
            f.prepared.contents,
            f.docker,
            performance.now() + 5000,
          ),
        );
        expect(f.probes()).toBe(0);
      });
    } finally {
      if (fault === 'home-unreadable') await chmod(join(root, 'passwd-home'), 0o700);
      if (fault === 'src-unreadable') await chmod(join(root, 'src'), 0o700);
    }
  });

test('actual pinned Bun without HOME resolves the same passwd directory checked natively', async () => {
  expect(Bun.version).toBe('1.4.2');
  const f = await fixture();
  await f.scoped(async (owner, token) => {
    await observeSourceDevInputs(
      owner,
      f.layouts,
      token,
      f.pins,
      f.prepared.contents,
      f.docker,
      performance.now() + 5000,
    );
  });
  const command = f.commands.find((command) => command.at(-2) === '-c');
  const program = command?.at(-1);
  if (program === undefined) throw new Error('missing native probe');
  const execute = async (args: string[]) => {
    const child = Bun.spawn(
      [
        '/usr/bin/env',
        '-i',
        'PATH=/usr/local/bin:/usr/bin:/bin',
        'BUN_RUNTIME_TRANSPILER_CACHE_PATH=0',
        ...args,
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(code).toBe(0);
    expect(stderr).toBe('');
    return stdout;
  };
  expect(await execute(['/bin/sh', '-c', program])).toBe('wbs-source-image-config-absent-v1\n');
  const passwd = (await execute(['/usr/bin/getent', 'passwd', '1000'])).trimEnd().split(':');
  const observed: unknown = JSON.parse(
    await execute([
      process.execPath,
      '--no-env-file',
      '--eval',
      `import { homedir } from 'node:os'; console.log(JSON.stringify({home:homedir(),hasHome:Object.hasOwn(process.env,'HOME')}));`,
    ]),
  );
  expect(observed).toEqual({ home: passwd.at(5), hasHome: false });
});

test('shorter observation deadline aborts the source token read and returns no evidence', async () => {
  const f = await fixture();
  await f.scoped(async (owner, token) => {
    f.stallSourceInspection();
    const pending = observeSourceDevInputs(
      owner,
      f.layouts,
      token,
      f.pins,
      f.prepared.contents,
      f.docker,
      performance.now() + 200,
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    let outcome: 'refused' | 'evidence' | 'late';
    try {
      outcome = await Promise.race([
        pending.then(
          () => 'evidence' as const,
          () => 'refused' as const,
        ),
        new Promise<'late'>((resolve) => {
          timer = setTimeout(() => {
            resolve('late');
          }, 1000);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      f.releaseSourceInspection();
      await rejects(pending);
    }
    expect(outcome).toBe('refused');
    expect(f.sourceInspectionAborted()).toBe(true);
    expect(f.probes()).toBe(0);
  });
});

for (const [operation, completion] of [
  ['image', 'complete'],
  ['role', 'complete'],
  ['image', 'failed'],
  ['role', 'failed'],
] as const) {
  test(`aborted ${operation} read joins ${completion} runner and owner boundary before refusing evidence`, async () => {
    const f = await fixture();
    await f.scoped(async (owner, token) => {
      let release: (() => void) | undefined;
      let aborted: (() => void) | undefined;
      const reachedAbort = new Promise<void>((resolve) => {
        aborted = resolve;
      });
      let settled = false;
      let runnerSettled = false;
      let targetedArgs: string[] = [];
      const docker = async (args: string[], signal?: AbortSignal) => {
        const target =
          operation === 'image'
            ? args[0] === 'image'
            : args[0] === 'run' && args.includes('--workdir');
        if (!target) return f.docker(args, signal);
        targetedArgs = args;
        return new Promise<string>((resolve, reject) => {
          release = () => {
            runnerSettled = true;
            if (completion === 'failed') reject(new Error('SECRET_SENTINEL'));
            else resolve(operation === 'image' ? f.source.Image : '{}');
          };
          signal?.addEventListener(
            'abort',
            () => {
              aborted?.();
            },
            { once: true },
          );
        });
      };
      const pending = observeSourceDevInputs(
        owner,
        f.layouts,
        token,
        f.pins,
        f.prepared.contents,
        docker,
        performance.now() + 500,
      ).finally(() => {
        settled = true;
      });
      // Attach immediately so a broken early-return implementation cannot leak rejection.
      const refused = rejects(pending);
      try {
        await reachedAbort;
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(settled).toBe(false);
        expect(runnerSettled).toBe(false);
      } finally {
        release?.();
        await refused;
      }
      expect(runnerSettled).toBe(true);
      const { readdir, readFile } = await import('node:fs/promises');
      const retained = await readdir(f.layouts.prod.stateDir);
      const intents = await Promise.all(
        retained
          .filter((name) => name.endsWith('-intent.json'))
          .map(async (name) => ({
            name,
            contents: JSON.parse(await readFile(join(f.layouts.prod.stateDir, name), 'utf8')) as {
              args: unknown;
            },
          })),
      );
      const intent = intents
        .filter(({ contents }) => JSON.stringify(contents.args) === JSON.stringify(targetedArgs))
        .sort((left, right) => left.name.localeCompare(right.name))
        .at(-1);
      expect(intent).toBeDefined();
      expect(retained.includes(intent?.name.replace('-intent.json', '-readback.json') ?? '')).toBe(
        completion === 'complete',
      );
    });
  });
}

test('successive independently recognized source mount permutations preserve complete inventory identity', async () => {
  const f = await fixture();
  await f.scoped(async (owner, token) => {
    let inspections = 0;
    const docker = async (args: string[], signal?: AbortSignal) => {
      const response = await f.docker(args, signal);
      if (args[0] !== 'inspect') return response;
      const members = JSON.parse(response) as (typeof f.source)[];
      if (++inspections % 2 === 1) members[0].Mounts.reverse();
      return JSON.stringify(members);
    };
    const observed = await observeSourceDevInputs(
      owner,
      f.layouts,
      token,
      f.pins,
      f.prepared.contents,
      docker,
      performance.now() + 5000,
    );
    expect(observed.activation).toBe('blocked');
    await inspectSourceDevInputs(owner, observed);
    expect(inspections).toBeGreaterThan(2);
  });
});

for (const fault of [
  'changed-source-field',
  'duplicate-source-mount',
  'unrelated-mount-order',
  'unrelated-mount-field',
  'unrelated-mount-add',
  'unrelated-mount-remove',
  'unrelated-mount-duplicate',
  'unrelated-process',
  'unrelated-config',
] as const) {
  test(`source inventory projection ${fault === 'unrelated-mount-order' ? 'accepts' : 'refuses'} ${fault}`, async () => {
    const f = await fixture();
    await f.scoped(async (owner, token) => {
      const unrelated = structuredClone(f.source);
      unrelated.Id = 'd'.repeat(64);
      unrelated.Name = '/unrelated';
      unrelated.Config.Labels['com.docker.compose.project'] = 'unrelated';
      unrelated.Config.Labels['com.docker.compose.service'] = 'unrelated';
      unrelated.Config.Image = 'unrelated:1';
      unrelated.Image = `sha256:${'e'.repeat(64)}`;
      unrelated.NetworkSettings.Networks = {};
      unrelated.Mounts = [
        { Type: 'bind', Source: '/unrelated/a', Destination: '/a', RW: false },
        { Type: 'bind', Source: '/unrelated/b', Destination: '/b', RW: false },
      ];
      if (fault.startsWith('unrelated-')) f.inventory.push(unrelated);
      let inspections = 0;
      let reordered = false;
      const docker = async (args: string[], signal?: AbortSignal) => {
        if (
          fault.startsWith('unrelated-') &&
          args[0] === 'run' &&
          args.includes('--workdir') &&
          !reordered
        ) {
          if (fault === 'unrelated-mount-order') unrelated.Mounts.reverse();
          if (fault === 'unrelated-mount-field') unrelated.Mounts[0].RW = true;
          if (fault === 'unrelated-mount-add')
            unrelated.Mounts.push({
              Type: 'bind',
              Source: '/unrelated/c',
              Destination: '/c',
              RW: false,
            });
          if (fault === 'unrelated-mount-remove') unrelated.Mounts.pop();
          if (fault === 'unrelated-mount-duplicate')
            unrelated.Mounts.push({ ...unrelated.Mounts[0] });
          if (fault === 'unrelated-process') unrelated.State.Pid += 1;
          if (fault === 'unrelated-config') unrelated.Config.User = '2000:2000';
          reordered = true;
        }
        const response = await f.docker(args, signal);
        if (args[0] !== 'inspect') return response;
        const members = JSON.parse(response) as (typeof f.source)[];
        if (++inspections > 1) {
          if (fault === 'changed-source-field') members[0].Mounts[0].RW = !members[0].Mounts[0].RW;
          if (fault === 'duplicate-source-mount') members[0].Mounts.push(members[0].Mounts[0]);
        }
        return JSON.stringify(members);
      };
      const pending = observeSourceDevInputs(
        owner,
        f.layouts,
        token,
        f.pins,
        f.prepared.contents,
        docker,
        performance.now() + 5000,
      );
      if (fault === 'unrelated-mount-order') {
        const observed = await pending;
        expect(observed.activation).toBe('blocked');
        await inspectSourceDevInputs(owner, observed);
      } else await rejects(pending);
      expect(f.probes()).toBe(fault.startsWith('unrelated-') ? 4 : 0);
    });
  });
}

test('successful final image probe must be absent from complete inventory before evidence returns', async () => {
  const f = await fixture();
  await f.scoped(async (owner, token) => {
    let checks = 0;
    const docker = async (args: string[], signal?: AbortSignal) => {
      const response = await f.docker(args, signal);
      if (args[0] === 'run' && args.at(-2) === '-c' && ++checks === 2) {
        const retained = structuredClone(f.source);
        retained.Id = 'f'.repeat(64);
        retained.Name = '/retained-read-only-probe';
        retained.Config.Image = 'independent-probe:1';
        retained.Config.Labels['com.docker.compose.project'] = 'probe';
        retained.Config.Labels['com.docker.compose.service'] = 'probe';
        retained.Mounts = [];
        retained.NetworkSettings.Networks = {};
        f.inventory.push(retained);
      }
      return response;
    };
    await rejects(
      observeSourceDevInputs(
        owner,
        f.layouts,
        token,
        f.pins,
        f.prepared.contents,
        docker,
        performance.now() + 5000,
      ),
    );
    expect(checks).toBe(2);
    expect(f.probes()).toBe(4);
  });
});
