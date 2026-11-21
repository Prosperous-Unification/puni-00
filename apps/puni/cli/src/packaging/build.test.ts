import { createHash } from 'node:crypto';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import { $ } from 'bun';
import { afterAll, expect, it } from 'bun:test';

import { buildPackage } from './build';
import {
  assertInstalledTestLevels,
  assertSourceTestLevels,
} from './test-level-installation.test.fixture';

const workspace = resolve(import.meta.dir, '../../../../..');
const roots: string[] = [];
afterAll(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function git(repository: string, args: string[], raw = false) {
  const child = Bun.spawnSync(['/usr/bin/git', '-C', repository, ...args], {
    env: { PATH: '/usr/bin:/bin', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 30000,
  });
  if (child.exitCode !== 0) throw new Error(child.stderr.toString());
  return raw ? child.stdout.toString() : child.stdout.toString().trim();
}
it('packs and installs the captured PUNI package outside its checkout with protected startup and all three providers', async () => {
  const root = mkdtempSync(join(tmpdir(), 'puni captured package integration '));
  roots.push(root);
  const repository = join(root, 'captured source'),
    runtime = join(root, 'trusted runtime'),
    destination = join(root, 'package output');
  mkdirSync(runtime);
  git(root, ['clone', '--quiet', '--no-hardlinks', workspace, repository]);
  const changed = new Set(
    [
      ...git(workspace, ['diff', '--name-only', '-z', 'HEAD'], true).split('\0'),
      ...git(workspace, ['ls-files', '--others', '--exclude-standard', '-z'], true).split('\0'),
    ].filter(Boolean),
  );
  for (const path of changed) {
    const origin = join(workspace, path),
      target = join(repository, path);
    if (existsSync(origin)) {
      mkdirSync(dirname(target), { recursive: true });
      cpSync(origin, target, { dereference: false });
    } else rmSync(target, { force: true });
  }
  // This captured test commit substitutes only the fixed canonical inode literal. The installed
  // owner gets no path override; real-host pathname qualification remains a separate gate.
  const lockPath = join(root, 'controlled native mutex');
  const queuePath = join(repository, 'libs/shared/adapters/heavy-lock/src/queue.ts');
  const queueSource = readFileSync(queuePath, 'utf8'),
    canonical = "return '/home/puni1/.cache/wbs-heavy-work.lock';";
  expect(queueSource.split(canonical)).toHaveLength(2);
  writeFileSync(
    queuePath,
    queueSource.replace(canonical, 'return ' + JSON.stringify(lockPath) + ';'),
  );
  git(repository, ['config', 'user.name', 'PUNI package integration']);
  git(repository, ['config', 'user.email', 'package@example.test']);
  git(repository, ['add', '--all']);
  git(repository, ['commit', '--allow-empty', '-m', 'capture current PUNI package']);
  const revision = git(repository, ['rev-parse', 'HEAD']);
  const interior = join(repository, 'apps/puni/cli'),
    insideWork = join(repository, 'work outside interior');
  const protection: unknown = await buildPackage(
    {
      repository: interior,
      revision,
      installationDirectory: workspace,
      work: insideWork,
      destination: join(root, 'must not become package'),
    },
    {
      callerDirectory: root,
      runtime: {
        directory: runtime,
        environment: {
          PATH: '/usr/bin:/bin',
          GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_CONFIG_SYSTEM: '/dev/null',
        },
      },
      subscribeInterrupts: () => () => undefined,
    },
  ).then(
    () => undefined,
    (cause: unknown) => cause,
  );
  expect(protection).toBeInstanceOf(Error);
  if (!(protection instanceof Error)) throw new Error('missing whole-worktree output protection');
  const producer = protection.cause;
  if (!(producer instanceof Error)) throw new Error('missing nested producer failure');
  expect(String(producer.cause)).toContain(
    'materialization output is beneath protected source authority',
  );
  expect(existsSync(insideWork)).toBe(false);
  symlinkSync(join(workspace, 'apps'), join(root, 'installation-child'));
  const built = await buildPackage(
    {
      repository: 'captured source/apps/puni/cli',
      revision,
      installationDirectory: 'installation-child/..',
      work: join(root, 'build work'),
      destination,
    },
    {
      callerDirectory: root,
      runtime: {
        directory: runtime,
        environment: {
          PATH: '/usr/bin:/bin',
          GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_CONFIG_SYSTEM: '/dev/null',
          GIT_TERMINAL_PROMPT: '0',
        },
      },
      subscribeInterrupts: () => () => undefined,
    },
  );
  if (built.kind !== 'built') throw new Error('actual package build unexpectedly cancelled');
  expect(built.toolkit.sourceRevision).toBe(revision);
  expect(JSON.parse(readFileSync(join(destination, 'package.json'), 'utf8'))).toEqual({
    name: 'puni',
    version: '0.4.0',
    type: 'module',
    description: 'PUNI Navigator, Burokrat and Dash',
    license: 'MIT',
    bin: { puni: 'dist/puni.mjs' },
    files: ['dist/', 'README.md', 'LICENSE', 'NOTICE'],
    engines: { bun: Bun.version },
  });
  for (const program of ['puni.mjs', 'observation-service.mjs']) {
    const text = readFileSync(join(destination, 'dist', program), 'utf8');
    expect(text).not.toContain(repository);
    expect(text).not.toContain(workspace);
  }
  const observation = readFileSync(join(destination, 'dist/observation-service.mjs'), 'utf8');
  expect(observation).toContain('activation_observation');
  for (const marker of ['authority_generation', '@tools/fleet-plan', 'plan-enrollment', '/home/'])
    expect(observation).not.toContain(marker);
  const packedDirectory = join(root, 'packed');
  mkdirSync(packedDirectory);
  const packed = Bun.spawnSync(
    [
      process.execPath,
      '--no-env-file',
      '--config=/dev/null',
      'pm',
      'pack',
      '--ignore-scripts',
      '--gzip-level',
      '1',
      '--destination',
      packedDirectory,
      '--quiet',
    ],
    {
      cwd: destination,
      env: { PATH: '/usr/bin:/bin' },
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 60000,
    },
  );
  expect(packed.exitCode, packed.stderr.toString()).toBe(0);
  const archive = join(packedDirectory, 'puni-0.4.0.tgz');
  expect(existsSync(archive)).toBe(true);
  const install = join(root, 'outside installed client'),
    candidate = join(root, 'poisoned candidate'),
    bin = join(root, 'bun and git only');
  for (const path of [install, candidate, bin]) mkdirSync(path);
  writeFileSync(join(install, 'package.json'), '{}\n');
  const added = Bun.spawnSync(
    [process.execPath, '--no-env-file', '--config=/dev/null', 'add', '--ignore-scripts', archive],
    {
      cwd: install,
      env: { PATH: '/usr/bin:/bin', BUN_INSTALL_CACHE_DIR: join(root, 'private bun cache') },
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 60000,
    },
  );
  expect(added.exitCode, added.stderr.toString()).toBe(0);
  symlinkSync(process.execPath, join(bin, 'bun'));
  symlinkSync('/usr/bin/git', join(bin, 'git'));
  const sentinel = join(root, 'candidate startup executed'),
    preload = join(candidate, 'preload.ts');
  writeFileSync(
    preload,
    'import{writeFileSync}from"node:fs";writeFileSync(' +
      JSON.stringify(sentinel) +
      ',"executed");throw new Error("candidate preload");',
  );
  writeFileSync(join(candidate, 'bunfig.toml'), 'preload = ["./preload.ts"]\n');
  writeFileSync(join(candidate, '.env'), 'PUNI_POISONED=1\n');
  const executable = join(install, 'node_modules/.bin/puni');
  const trustedHome = join(root, 'trusted caller home'),
    runtimeCache = join(root, 'runtime bun cache');
  mkdirSync(trustedHome);
  mkdirSync(runtimeCache);
  const environment = {
    PATH: bin,
    HOME: trustedHome,
    BUN_INSTALL_CACHE_DIR: runtimeCache,
    BUN_OPTIONS: '--preload=' + preload,
    BUN_INSPECT_PRELOAD: preload,
    NODE_OPTIONS: '--require=' + preload,
    BUN_BE_BUN: '1',
  };
  function invoke(args: string[], expectedStatus = 0) {
    const child = Bun.spawnSync([executable, ...args], {
      cwd: candidate,
      env: environment,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 20000,
    });
    expect(child.exitCode, child.stderr.toString()).toBe(expectedStatus);
    expect(existsSync(sentinel)).toBe(false);
    return child.stdout.toString();
  }
  const sourceRegistration = roots.indexOf(root);
  if (sourceRegistration < 0) throw new Error('source test-level owner lost its fixture namespace');
  roots.splice(sourceRegistration, 1);
  try {
    await assertSourceTestLevels(
      {
        root,
        installation: install,
        archive,
        entrypoint: join(install, 'node_modules/puni/dist/puni.mjs'),
        revision,
        environment,
      },
      repository,
    );
  } catch (cause: unknown) {
    throw new Error('Actual source test-level owner failed; retained ' + root, { cause });
  }
  roots.push(root);
  rmSync(repository, { recursive: true, force: true });
  rmSync(destination, { recursive: true, force: true });
  const backendRequests: {
    readonly path: string;
    readonly authorization: string | null;
    readonly cookie: string | null;
  }[] = [];
  let backendStatus = 200;
  let backendIdentity: unknown = {
    user: null,
    features: { onboarding: false, organizations: false },
  };
  const backend = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      backendRequests.push({
        path: new URL(request.url).pathname,
        authorization: request.headers.get('authorization'),
        cookie: request.headers.get('cookie'),
      });
      return Response.json(backendIdentity, { status: backendStatus });
    },
  });
  try {
    for (const namespace of ['dash', 'd']) {
      for (const scenario of ['healthy', 'wrong-status', 'authenticated']) {
        backendStatus = scenario === 'wrong-status' ? 201 : 200;
        backendIdentity = {
          user: scenario === 'authenticated' ? { id: 'signed-in' } : null,
          features: { onboarding: false, organizations: false },
        };
        const previousRequests = backendRequests.length;
        const child = Bun.spawn(
          [executable, namespace, 'dev-probe', 'be', 'http://127.0.0.1:' + String(backend.port)],
          {
            cwd: candidate,
            env: { ...environment, AUTHORIZATION: 'must-not-be-sent', COOKIE: 'must-not-be-sent' },
            stdin: 'ignore',
            stdout: 'pipe',
            stderr: 'pipe',
            timeout: 20000,
          },
        );
        const [status, stdout, stderr] = await Promise.all([
          child.exited,
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
        ]);
        expect(child.signalCode, stderr).toBeNull();
        expect(status, stderr).toBe(scenario === 'healthy' ? 0 : 1);
        expect(stdout).toBe(
          scenario === 'healthy'
            ? '[dev-deploy] ' + 'be (auth routes mounted)'.padEnd(28) + ' ok\n'
            : '',
        );
        if (scenario === 'healthy') expect(stderr).toBe('');
        else expect(stderr).toContain('backend probe:');
        expect(backendRequests).toHaveLength(previousRequests + 1);
        expect(backendRequests.at(-1)).toEqual({
          path: '/api/auth/me',
          authorization: null,
          cookie: null,
        });
        expect(existsSync(sentinel)).toBe(false);
      }
    }
  } finally {
    await backend.stop(true);
  }
  const backendCaller = join(workspace, 'bin/dev-be-probe.ts');
  const backendCallerEnvironment = {
    ...environment,
    PUNI_EXECUTABLE: join(install, 'node_modules/puni/dist/puni.mjs'),
  };
  const preflight = Bun.spawn([backendCaller, '--preflight'], {
    cwd: candidate,
    env: backendCallerEnvironment,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 20000,
  });
  const [preflightStatus, preflightStdout, preflightStderr] = await Promise.all([
    preflight.exited,
    new Response(preflight.stdout).text(),
    new Response(preflight.stderr).text(),
  ]);
  expect(preflight.signalCode).toBeNull();
  expect(preflightStatus, preflightStderr).toBe(0);
  expect(preflightStdout).toBe('');
  expect(preflightStderr).toBe('');
  const callerBackend = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () =>
      Response.json({ user: null, features: { onboarding: false, organizations: false } }),
  });
  try {
    const child = Bun.spawn([backendCaller, 'http://127.0.0.1:' + String(callerBackend.port)], {
      cwd: candidate,
      env: backendCallerEnvironment,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 20000,
    });
    const [status, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(child.signalCode).toBeNull();
    expect(status, stderr).toBe(0);
    expect(stdout).toBe('[dev-deploy] ' + 'be (auth routes mounted)'.padEnd(28) + ' ok\n');
    expect(stderr).toBe('');
    expect(existsSync(sentinel)).toBe(false);
  } finally {
    await callerBackend.stop(true);
  }
  expect(invoke(['--version'])).toBe('0.4.0');
  expect(invoke(['--help'])).toContain('navigator');
  expect(invoke(['bur', 'template', 'list'])).toContain('"id":"module"');
  expect(invoke(['dash', 'ops', 'lock', 'status'])).toBe(
    'heavy lock: holder none' + String.fromCharCode(10),
  );
  expect(existsSync(lockPath)).toBe(false);
  expect(existsSync(lockPath + '.queue')).toBe(false);
  // This one actual build/pack/add session has removed its producer checkout and output.
  // Keep the known-owned archive/install on the first new-profile failure for later readback.
  const profileRegistration = roots.indexOf(root);
  if (profileRegistration < 0)
    throw new Error('test-level profile owner lost its fixture namespace');
  roots.splice(profileRegistration, 1);
  try {
    expect(existsSync(repository)).toBe(false);
    expect(existsSync(destination)).toBe(false);
    const installedPackage: unknown = JSON.parse(
      readFileSync(join(install, 'node_modules/puni/package.json'), 'utf8'),
    );
    // Required-profile presence only until the actual new runtime/payload owners are installed.
    expect(installedPackage).toMatchObject({ name: 'puni', version: '0.4.0' });
    const testLevels: unknown = JSON.parse(
      readFileSync(join(install, 'node_modules/puni/dist/test-level-assets.json'), 'utf8'),
    );
    expect(testLevels).toMatchObject({
      format: 'puni-test-level-assets',
      version: 1,
      sourceRevision: revision,
    });
    const manifest: unknown = JSON.parse(
      readFileSync(join(install, 'node_modules/puni/dist/package-manifest.json'), 'utf8'),
    );
    expect(manifest).toMatchObject({
      packageVersion: '0.4.0',
      testLevelIdentity: createHash('sha256')
        .update(readFileSync(join(install, 'node_modules/puni/dist/test-level-assets.json')))
        .digest('hex'),
    });
    await assertInstalledTestLevels({
      root,
      installation: install,
      archive,
      entrypoint: join(install, 'node_modules/puni/dist/puni.mjs'),
      revision,
      environment,
    });
  } catch (cause: unknown) {
    throw new Error(
      'Required test-level profile first owner failed; retained known-owned ' + root,
      { cause },
    );
  }
  roots.push(root);

  const nativePayload = join(candidate, 'native payload.ts');
  const kernel = readFileSync(executable, 'utf8').split(String.fromCharCode(10)).at(0);
  if (!kernel?.startsWith('#!')) throw new Error('installed protected interpreter absent');
  writeFileSync(
    nativePayload,
    [
      kernel,
      'console.log(JSON.stringify({cwd:process.cwd(),argv:process.argv.slice(2)}));process.exit(37);',
    ].join(String.fromCharCode(10)),
    { mode: 0o755 },
  );
  const nativeArgs = ['a b', '', '$(literal)', '--literal'];
  expect(
    JSON.parse(
      invoke(
        [
          'd',
          'ops',
          'lock',
          'run',
          '--label',
          'installed native',
          '--',
          nativePayload,
          ...nativeArgs,
        ],
        37,
      ),
    ),
  ).toEqual({ cwd: candidate, argv: nativeArgs });
  expect(existsSync(lockPath + '.d')).toBe(false);
  expect(readdirSync(lockPath + '.queue')).toEqual([]);
  // Historical shim bytes are inspected as committed enrollment evidence, never executed.
  // The installed native parent/helper must work with only Bun and Git on PATH.
  const launcher = join(root, 'historical enrolled checkout'),
    poolRoot = join(root, 'installed managed root'),
    poolConfig = join(root, 'installed pool.json');
  mkdirSync(join(launcher, 'bin'), { recursive: true });
  mkdirSync(join(launcher, 'infra', 'jobs'), { recursive: true });
  mkdirSync(poolRoot, { mode: 0o700 });
  writeFileSync(join(launcher, 'bin', 'heavy-lock-lib.sh'), 'run_heavy_job() {\n  :\n}\n');
  writeFileSync(
    join(launcher, 'infra', 'jobs', 'catalogue.json'),
    JSON.stringify({ schemaVersion: 1, jobs: [] }),
  );
  git(launcher, ['init', '--initial-branch=main']);
  git(launcher, ['config', 'user.name', 'Installed holder fixture']);
  git(launcher, ['config', 'user.email', 'installed-holder@example.invalid']);
  git(launcher, ['add', '.']);
  git(launcher, ['commit', '-m', 'historical enrollment evidence']);
  writeFileSync(
    poolConfig,
    JSON.stringify({
      schemaVersion: 3,
      root: poolRoot,
      authorityId: 'installed-authority',
      epoch: 'installed-epoch',
      providerId: 'installed-provider',
      mcpResource: 'http://127.0.0.1:3100/mcp',
      credential: `wbs_mk_${crypto.randomUUID()}.${'k'.repeat(43)}`,
      diskUnitBytes: 1073741824,
      diskBudgetUnits: 1,
      workspaceSlots: 1,
      headroomBytes: 0,
      cpuCores: 1,
      memoryGib: 2,
      headroom: { cpuCores: 0, memoryGib: 1 },
      exclusiveUnits: {},
      enrollmentId: 'installed-enrollment',
      launcherCheckouts: [launcher],
      concurrencyEligible: [],
    }),
    { mode: 0o600 },
  );
  invoke(['d', 'ops', 'pool', 'init', '--config', poolConfig]);
  expect(
    JSON.parse(
      invoke([
        'dash',
        'ops',
        'pool',
        'switch-mode',
        'concurrent',
        '--config',
        poolConfig,
        '--operator',
        'installed fixture',
        '--allow-empty',
        '--wait-seconds',
        '10',
        '--poll-seconds',
        '1',
      ]),
    ),
  ).toMatchObject({ to: 'concurrent' });
  expect(readdirSync(join(poolRoot, '.dash', 'legacy-holds'))).toEqual([]);
  expect(existsSync(lockPath + '.d')).toBe(false);
  expect(readdirSync(lockPath + '.queue')).toEqual([]);
  expect(
    JSON.parse(
      invoke([
        'd',
        'ops',
        'pool',
        'switch-mode',
        'observe',
        '--config',
        poolConfig,
        '--operator',
        'installed fixture',
        '--wait-seconds',
        '10',
        '--poll-seconds',
        '1',
      ]),
    ),
  ).toMatchObject({ to: 'observe' });
  git(candidate, ['init', '--initial-branch=main']);
  for (const namespace of ['burokrat', 'bur', 'b']) {
    expect(invoke([namespace, 'audit-push', '.', 'HEAD'])).toBe(
      '{"schemaVersion":1,"status":"inactive","certified":false,"reason":"external activation marker is not provisioned"}\n',
    );
  }
  const requiredAudit = Bun.spawnSync([executable, 'b', 'audit-push', '.', 'HEAD'], {
    cwd: candidate,
    env: {
      ...environment,
      TOOL_WIKI_ACTIVATION_ROOT: join(root, 'absent configured audit archive'),
      TOOL_WIKI_REQUIRE_CERTIFIED: 'invalid',
    },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 20000,
  });
  expect(requiredAudit.exitCode, requiredAudit.stderr.toString()).toBe(78);
  expect(requiredAudit.stdout.length).toBe(0);
  expect(requiredAudit.stderr.toString()).toContain('cannot read configured push audit authority');
  expect(existsSync(sentinel)).toBe(false);
  expect(existsSync(repository)).toBe(false);
  expect(existsSync(destination)).toBe(false);
  const installedEntrypoint = join(install, 'node_modules/puni/dist/puni.mjs');
  expect(statSync(installedEntrypoint).isFile()).toBe(true);
  const forgeCore = join(install, 'node_modules/puni/dist/forge-supervisor.mjs');
  const forgeManifest = join(install, 'node_modules/puni/dist/forge-supervisor.json');
  expect(existsSync(forgeCore)).toBe(true);
  expect(existsSync(forgeManifest)).toBe(true);
  const forgeText = readFileSync(forgeCore, 'utf8');
  expect(forgeText).not.toContain(repository);
  expect(forgeText).not.toContain(workspace);
  const forgeRecord: unknown = JSON.parse(readFileSync(forgeManifest, 'utf8'));
  if (
    typeof forgeRecord !== 'object' ||
    forgeRecord === null ||
    !('format' in forgeRecord) ||
    !('version' in forgeRecord) ||
    !('entrypoint' in forgeRecord) ||
    !('sha256' in forgeRecord) ||
    !('sourceRevision' in forgeRecord)
  )
    throw new Error('installed Forge core manifest is not the declared closed producer record');
  expect(Object.keys(forgeRecord).sort()).toEqual([
    'entrypoint',
    'format',
    'sha256',
    'sourceRevision',
    'version',
  ]);
  expect(forgeRecord).toEqual({
    format: 'puni-forge-runtime',
    version: 1,
    entrypoint: 'forge-supervisor.mjs',
    sha256: createHash('sha256').update(readFileSync(forgeCore)).digest('hex'),
    sourceRevision: revision,
  });

  const runtimeAssetRecord: unknown = JSON.parse(
    readFileSync(join(install, 'node_modules/puni/dist/runtime-asset-loads.json'), 'utf8'),
  );
  if (
    typeof runtimeAssetRecord !== 'object' ||
    runtimeAssetRecord === null ||
    !('loaders' in runtimeAssetRecord) ||
    !Array.isArray(runtimeAssetRecord.loaders)
  )
    throw new Error('installed package lost its producer runtime-asset record');
  expect(Object.keys(runtimeAssetRecord).sort()).toEqual([
    'format',
    'loaders',
    'sourceRevision',
    'version',
  ]);
  const normalizedAssets: unknown = { ...runtimeAssetRecord, loaders: [] };
  expect(normalizedAssets).toEqual({
    format: 'puni-runtime-asset-loads',
    version: 1,
    sourceRevision: revision,
    loaders: [],
  });
  expect(runtimeAssetRecord.loaders).toHaveLength(1);
  const loaderRecord: unknown = runtimeAssetRecord.loaders.at(0);
  if (
    typeof loaderRecord !== 'object' ||
    loaderRecord === null ||
    !('emittedSha256' in loaderRecord) ||
    typeof loaderRecord.emittedSha256 !== 'string'
  )
    throw new Error('installed loader record lacks its captured emitted digest');
  expect(loaderRecord.emittedSha256).toMatch(/^[0-9a-f]{64}$/u);
  const normalizedLoader: unknown = { ...loaderRecord, emittedSha256: '<checked digest>' };
  expect(normalizedLoader).toEqual({
    kind: 'retained-forge-core',
    sourcePath: 'apps/puni/cli/src/packaging/forge-runtime-loader.ts',
    sourceSha256: createHash('sha256')
      .update(readFileSync(join(workspace, 'apps/puni/cli/src/packaging/forge-runtime-loader.ts')))
      .digest('hex'),
    emittedSha256: '<checked digest>',
    role: 'puni.mjs',
    importCalls: 1,
    payloadFormat: 'puni-forge-runtime',
    payloadVersion: 1,
    cacheIdentity: 'sha256-data-url',
  });

  const callerScratch = join(root, 'installed caller scratch');
  mkdirSync(callerScratch);
  const inactiveReport =
    '{"schemaVersion":1,"status":"inactive","certified":false,"reason":"external activation root is not provisioned"}\n';
  const completionPath = join(root, 'packed main completion.json');
  const mainHarness = join(root, 'packed main contract.mjs');
  writeFileSync(
    mainHarness,
    [
      kernel,
      'import{writeFileSync}from"node:fs";import{dirname}from"node:path";import{tmpdir}from"node:os";import{pathToFileURL}from"node:url";',
      'const entrypoint=' + JSON.stringify(installedEntrypoint) + ';',
      'const directory=dirname(entrypoint),environment={...process.env};',
      'const stdout=process.stdout.write.bind(process.stdout),stderr=process.stderr.write.bind(process.stderr);',
      'const context={installation:{directory,entrypoint},lookup:{directory,path:environment.PATH},callerDirectory:process.cwd(),runtime:process.execPath,temporaryDirectory:tmpdir(),environment,stdout:(chunk)=>{stdout(chunk)},stderr:(chunk)=>{stderr(chunk)}};',
      'process.argv.splice(2,process.argv.length,"--version");',
      'const delivered=await import(pathToFileURL(entrypoint).href);if(typeof delivered.main!=="function")throw new Error("packed PUNI main export is absent");',
      'const completion=await delivered.main(["bur","lint","working",".","HEAD"],context);',
      'writeFileSync(' + JSON.stringify(completionPath) + ',JSON.stringify(completion));',
      'if(completion.kind==="exit")process.exit(completion.status);process.exitCode=completion.status;',
    ].join(String.fromCharCode(10)),
    { mode: 0o755 },
  );
  const imported = Bun.spawnSync([mainHarness], {
    cwd: candidate,
    env: { ...environment, TMPDIR: callerScratch },
    stdin: Buffer.from('import must not dispatch ambient argv or consume stdin'),
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 12000,
  });
  expect(imported.signalCode).toBeUndefined();
  expect(imported.exitCode, imported.stderr.toString()).toBe(0);
  expect(imported.stdout.toString()).toBe(inactiveReport);
  expect(imported.stderr.length).toBe(0);
  expect(JSON.parse(readFileSync(completionPath, 'utf8'))).toEqual({ kind: 'exit', status: 0 });
  expect(existsSync(sentinel)).toBe(false);
  expect(readdirSync(callerScratch)).toEqual([]);

  const configured = JSON.parse(
    readFileSync(
      join(workspace, 'apps/twilight-structure/twilight-burokrat/cli/project.json'),
      'utf8',
    ),
  ) as { targets: { lint: { cache: boolean; inputs: string[]; options: { command: string } } } };
  expect(configured.targets.lint.cache).toBe(false);
  expect(configured.targets.lint.inputs).toEqual(['{workspaceRoot}/**/*']);
  const callerWords = configured.targets.lint.options.command.trim().split(/\s+/u);
  expect(callerWords.slice(-3)).toEqual(['working', '.', 'HEAD']);
  if (callerWords.some((word) => /[\s'";|&`$<>]/u.test(word)))
    throw new Error('installed caller requires its supported literal Nx vector');
  const callerEntry = callerWords.findIndex((word) => word.startsWith('bin/'));
  if (callerEntry < 1) throw new Error('installed caller requires its repository entrypoint');
  expect(callerWords[callerEntry]).toBe('bin/tool-wiki-lint.ts');
  callerWords[callerEntry] = join(workspace, callerWords[callerEntry]);
  const called = Bun.spawnSync(callerWords, {
    cwd: candidate,
    env: {
      ...environment,
      PUNI_EXECUTABLE: installedEntrypoint,
      TOOL_WIKI_REQUIRE_CERTIFIED: '0',
      TMPDIR: callerScratch,
    },
    stdin: Buffer.from('the installed caller must not parse stdin'),
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 12000,
  });
  expect(called.signalCode).toBeUndefined();
  expect(called.exitCode, called.stderr.toString()).toBe(0);
  expect(called.stdout.toString()).toBe(inactiveReport);
  expect(called.stderr.length).toBe(0);
  expect(existsSync(sentinel)).toBe(false);
  expect(readdirSync(callerScratch)).toEqual([]);
  const requiredCaller = Bun.spawnSync(callerWords, {
    cwd: candidate,
    env: {
      ...environment,
      PUNI_EXECUTABLE: installedEntrypoint,
      TOOL_WIKI_REQUIRE_CERTIFIED: '1',
      TMPDIR: callerScratch,
    },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 12000,
  });
  expect(requiredCaller.signalCode).toBeUndefined();
  expect(requiredCaller.exitCode, requiredCaller.stderr.toString()).toBe(78);
  expect(requiredCaller.stdout.length).toBe(0);
  expect(requiredCaller.stderr.toString()).toBe(
    'tool-wiki lint: required admission has no external activation root\n',
  );
  expect(existsSync(sentinel)).toBe(false);
  expect(readdirSync(callerScratch)).toEqual([]);
  const archiveSha256 = createHash('sha256').update(readFileSync(archive)).digest('hex');
  expect(archiveSha256).toMatch(/^[0-9a-f]{64}$/u);
  expect(invoke(['--version'])).toBe('0.4.0');
  const provisioned = join(root, 'new provisioned client with spaces');
  expect(existsSync(provisioned)).toBe(false);
  const installed = Bun.spawnSync(
    [
      executable,
      'dash',
      'install-puni',
      archive,
      '--sha256',
      archiveSha256,
      '--destination',
      provisioned,
    ],
    {
      cwd: candidate,
      env: environment,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 60000,
    },
  );
  expect(installed.signalCode).toBeUndefined();
  expect(installed.exitCode, installed.stderr.toString()).toBe(0);
  expect(installed.stderr.length).toBe(0);
  const selection: unknown = JSON.parse(installed.stdout.toString());
  if (
    typeof selection !== 'object' ||
    selection === null ||
    !('entrypoint' in selection) ||
    typeof selection.entrypoint !== 'string'
  )
    throw new Error('installed PUNI selection has no entrypoint');
  expect(selection).toEqual<{ schemaVersion: 1; archiveSha256: string; entrypoint: string }>({
    schemaVersion: 1,
    archiveSha256,
    entrypoint: selection.entrypoint,
  });
  expect(installed.stdout.toString()).toBe(
    JSON.stringify({ schemaVersion: 1, archiveSha256, entrypoint: selection.entrypoint }) + '\n',
  );
  expect(isAbsolute(selection.entrypoint)).toBe(true);
  const selectedEntry = realpathSync.native(selection.entrypoint);
  expect(selection.entrypoint).toBe(selectedEntry);
  const selectedDirectory = realpathSync.native(provisioned);
  const offset = relative(selectedDirectory, selectedEntry);
  expect(offset).not.toBe('');
  expect(offset).not.toBe('..');
  expect(offset.startsWith('..' + sep)).toBe(false);
  expect(isAbsolute(offset)).toBe(false);
  expect(readFileSync(selectedEntry)).toEqual(readFileSync(installedEntrypoint));
  expect(createHash('sha256').update(readFileSync(archive)).digest('hex')).toBe(archiveSha256);
  expect(existsSync(sentinel)).toBe(false);
  const provisionedCaller = Bun.spawnSync(callerWords, {
    cwd: candidate,
    env: {
      ...environment,
      PUNI_EXECUTABLE: selectedEntry,
      TOOL_WIKI_REQUIRE_CERTIFIED: '0',
      TMPDIR: callerScratch,
    },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 12000,
  });
  expect(provisionedCaller.signalCode).toBeUndefined();
  expect(provisionedCaller.exitCode, provisionedCaller.stderr.toString()).toBe(0);
  expect(provisionedCaller.stdout.toString()).toBe(inactiveReport);
  expect(provisionedCaller.stderr.length).toBe(0);
  expect(existsSync(sentinel)).toBe(false);
  expect(readdirSync(callerScratch)).toEqual([]);
  const wrongSha256 = (archiveSha256.startsWith('0') ? '1' : '0') + archiveSha256.slice(1);
  const rejectedDestination = join(root, 'digest rejection must not install');
  const refusedDigest = Bun.spawnSync(
    [
      executable,
      'd',
      'install-puni',
      archive,
      '--sha256',
      wrongSha256,
      '--destination',
      rejectedDestination,
    ],
    {
      cwd: candidate,
      env: environment,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 12000,
    },
  );
  expect(refusedDigest.signalCode).toBeUndefined();
  expect(refusedDigest.exitCode, refusedDigest.stderr.toString()).toBe(78);
  expect(refusedDigest.stdout.length).toBe(0);
  expect(refusedDigest.stderr.toString()).toBe('puni install-puni: archive digest mismatch\n');
  expect(existsSync(rejectedDestination)).toBe(false);
  const beforeReuse = readFileSync(selectedEntry);
  const refusedReuse = Bun.spawnSync(
    [
      executable,
      'd',
      'install-puni',
      archive,
      '--sha256',
      archiveSha256,
      '--destination',
      provisioned,
    ],
    {
      cwd: candidate,
      env: environment,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 12000,
    },
  );
  expect(refusedReuse.signalCode).toBeUndefined();
  expect(refusedReuse.exitCode, refusedReuse.stderr.toString()).toBe(78);
  expect(refusedReuse.stdout.length).toBe(0);
  expect(refusedReuse.stderr.toString()).toBe('puni install-puni: destination already exists\n');
  expect(readFileSync(selectedEntry)).toEqual(beforeReuse);
  expect(existsSync(sentinel)).toBe(false);
  function observePackedForge(
    argv: readonly string[],
    cwd: string,
    variables: Record<string, string>,
    timeout: number,
    purpose: 'direct' | 'supervision' = 'direct',
  ) {
    const registered = roots.indexOf(root);
    if (registered < 0) throw new Error('Forge packaging fixture is not registered for cleanup');
    roots.splice(registered, 1);
    const observation = (() => {
      try {
        return Bun.spawnSync([...argv], {
          cwd,
          env: variables,
          stdin: 'ignore',
          stdout: 'pipe',
          stderr: 'pipe',
          timeout,
          killSignal: 'SIGKILL',
          maxBuffer: 1024 * 1024,
        });
      } catch (cause: unknown) {
        throw new Error('Forge packaging direct child acquisition unconfirmed; retained ' + root, {
          cause,
        });
      }
    })();
    if (
      observation.signalCode !== undefined ||
      observation.exitedDueToTimeout ||
      observation.exitedDueToMaxBuffer ||
      !Number.isInteger(observation.exitCode) ||
      observation.exitCode < 0 ||
      observation.exitCode > 255
    ) {
      function describePackedOutput(bytes: Uint8Array) {
        const retained = Buffer.from(bytes);
        return {
          bytes: retained.length,
          sha256: createHash('sha256').update(retained).digest('hex'),
          prefixHex: retained.subarray(0, 2048).toString('hex'),
          suffixHex: retained.subarray(Math.max(2048, retained.length - 2048)).toString('hex'),
        };
      }
      throw new Error(
        'Forge packaging direct native/pipe settlement unconfirmed; retained ' + root,
        {
          cause: {
            purpose,
            argv: [...argv],
            cwd,
            timeoutMs: timeout,
            pid: observation.pid,
            exitCode: observation.exitCode,
            signalCode: observation.signalCode,
            exitedDueToTimeout: observation.exitedDueToTimeout,
            exitedDueToMaxBuffer: observation.exitedDueToMaxBuffer,
            stdout: describePackedOutput(observation.stdout),
            stderr: describePackedOutput(observation.stderr),
          },
        },
      );
    }
    if (purpose === 'direct') roots.push(root);
    return observation;
  }
  const forgeConsumer = join(root, 'installed Forge frozen-install refusal');
  mkdirSync(forgeConsumer);
  writeFileSync(join(forgeConsumer, 'package.json'), '{"private":true}\n');
  writeFileSync(join(forgeConsumer, 'bun.lock'), 'owned malformed lockfile; no dependency URL\n');
  const directFrozen = observePackedForge(
    [process.execPath, '--no-env-file', '--config=/dev/null', 'install', '--frozen-lockfile'],
    forgeConsumer,
    { PATH: bin, BUN_INSTALL_CACHE_DIR: join(root, 'forge cache') },
    15000,
  );
  expect(directFrozen.signalCode).toBeUndefined();
  expect(directFrozen.exitedDueToTimeout).toBe(false);
  expect(directFrozen.exitedDueToMaxBuffer).toBe(false);
  expect(directFrozen.exitCode).not.toBe(0);
  const retainedSelection = readFileSync(join(provisioned, 'puni-selection.json'));
  const forgeLog = join(root, 'installed Forge termination.log');
  const packedForge = observePackedForge(
    [
      selectedEntry,
      'dash',
      'dev-env',
      'supervise',
      '--repository',
      forgeConsumer,
      '--termination-log',
      forgeLog,
    ],
    forgeConsumer,
    {
      ...environment,
      PUNI_SELECTION: retainedSelection.toString('utf8'),
      PUNI_SELECTION_SHA256: createHash('sha256').update(retainedSelection).digest('hex'),
      PUNI_INSTALLATION_DIRECTORY: provisioned,
      PUNI_EXECUTABLE: selectedEntry,
      BUN_INSTALL_CACHE_DIR: join(root, 'forge cache'),
    },
    // Four full selection checks precede install. The current178MiB profile takes6.5s per
    // check; the actual retained installed entry returns its named refusal in27.329s.
    // Proof: canonical-package-budget-v118 hit the20s observation deadline and refused
    // native/pipe settlement; canonical-forge-entry-probe-v118 settled normally with65.
    // This is the test observer's budget; Forge's20s stop grace remains unchanged.
    60000,
    'supervision',
  );
  expect(packedForge.signalCode).toBeUndefined();
  expect(packedForge.exitedDueToTimeout).toBe(false);
  expect(packedForge.exitedDueToMaxBuffer).toBe(false);
  expect(packedForge.exitCode, packedForge.stderr.toString()).toBe(65);
  expect(readFileSync(forgeLog, 'utf8')).toBe(
    'install-required: bun install --frozen-lockfile exited ' + String(directFrozen.exitCode),
  );
  // Only this named install-refusal outcome establishes the packed core's nested install settlement.
  roots.push(root);
  expect(packedForge.stderr.toString()).toContain('[forge] install-required:');
  expect(existsSync(repository)).toBe(false);
  expect(existsSync(destination)).toBe(false);
  expect(existsSync(sentinel)).toBe(false);
  const devConsumer = join(root, 'installed development consumer checkout');
  mkdirSync(devConsumer);
  const devMetadata: unknown = JSON.parse(readFileSync(join(workspace, 'package.json'), 'utf8'));
  if (
    devMetadata === null ||
    typeof devMetadata !== 'object' ||
    !('scripts' in devMetadata) ||
    devMetadata.scripts === null ||
    typeof devMetadata.scripts !== 'object'
  )
    throw new Error('installed development caller requires actual package scripts');
  const ordinaryDev: unknown = Reflect.get(devMetadata.scripts, 'dev');
  const solverDev: unknown = Reflect.get(devMetadata.scripts, 'dev:local-solver');
  if (typeof ordinaryDev !== 'string' || typeof solverDev !== 'string')
    throw new Error('installed development package aliases are absent');
  writeFileSync(
    join(devConsumer, 'package.json'),
    JSON.stringify({
      private: true,
      type: 'module',
      scripts: { dev: ordinaryDev, 'dev:local-solver': solverDev },
    }) + '\n',
  );
  for (const relative of [
    'bin/dev.ts',
    'libs/shared/adapters/bun-output/src/index.ts',
    'libs/shared/adapters/bun-output/src/interrupts.ts',
  ]) {
    const origin = join(workspace, relative),
      copied = join(devConsumer, relative);
    mkdirSync(dirname(copied), { recursive: true });
    writeFileSync(copied, readFileSync(origin), { mode: statSync(origin).mode & 0o777 });
  }
  expect(existsSync(join(devConsumer, 'apps'))).toBe(false);
  expect(existsSync(repository)).toBe(false);
  expect(existsSync(destination)).toBe(false);
  expect(readdirSync(bin).sort()).toEqual(['bun', 'git']);
  const devNxDirectory = join(devConsumer, 'node_modules/nx');
  mkdirSync(join(devNxDirectory, 'dist/bin'), { recursive: true });
  writeFileSync(
    join(devNxDirectory, 'package.json'),
    JSON.stringify({ name: 'nx', type: 'commonjs', bin: { nx: './dist/bin/nx.js' } }),
  );
  const devNx = join(devNxDirectory, 'dist/bin/nx.js');
  const devProjects = '--projects=wbs-be-01,wbs-gw-01,wbs-fe-01,wbs-mcp-01';
  const devHeader = Buffer.from('\u001b[32mINSTALLED-DEV\u001b[39m\n');
  const devBinary = Buffer.from([0, 128, 255, 65, 10]);
  const devWarning = Buffer.from('\u001b[31mINSTALLED-WARNING\u001b[39m\n');
  const devStdout = Buffer.concat([devHeader, devBinary]);
  const devMerged = Buffer.concat([devStdout, devWarning]);
  const devCaptured = Buffer.concat([
    Buffer.from('INSTALLED-DEV\n'),
    devBinary,
    Buffer.from('INSTALLED-WARNING\n'),
  ]);
  writeFileSync(
    devNx,
    [
      'const fs=require("node:fs");',
      'const path=process.env.PUNI_DEV_RECORD;const state={phase:"launched",pid:process.pid,ppid:process.ppid,argv:process.argv.slice(2)};',
      'fs.appendFileSync(process.env.PUNI_DEV_LAUNCHES,JSON.stringify(state)+"\\n");',
      'const publish=()=>{fs.writeFileSync(path+".next",JSON.stringify(state));fs.renameSync(path+".next",path)};publish();',
      'const deadline=setTimeout(()=>process.exit(72),5000);',
      'fs.writeSync(1,Buffer.from(' +
        JSON.stringify([...devStdout]) +
        '));fs.writeSync(2,Buffer.from(' +
        JSON.stringify([...devWarning]) +
        '));',
      'state.phase="finished";publish();clearTimeout(deadline);process.exit(Number(process.env.PUNI_DEV_STATUS));',
    ].join('\n'),
  );
  function readInstalledDevRecord(path: string): {
    readonly phase: string;
    readonly pid: number;
    readonly ppid: number;
    readonly argv: readonly string[];
  } {
    const observed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (
      observed === null ||
      typeof observed !== 'object' ||
      !('phase' in observed) ||
      typeof observed.phase !== 'string' ||
      !('pid' in observed) ||
      typeof observed.pid !== 'number' ||
      !Number.isSafeInteger(observed.pid) ||
      observed.pid <= 0 ||
      !('ppid' in observed) ||
      typeof observed.ppid !== 'number' ||
      !Number.isSafeInteger(observed.ppid) ||
      observed.ppid <= 0 ||
      !('argv' in observed) ||
      !Array.isArray(observed.argv)
    )
      throw new Error('installed development producer record is malformed');
    const argv: string[] = [];
    for (const value of observed.argv) {
      const word: unknown = value;
      if (typeof word !== 'string')
        throw new Error('installed development producer argv is malformed');
      argv.push(word);
    }
    return { phase: observed.phase, pid: observed.pid, ppid: observed.ppid, argv };
  }
  async function observeInstalledDev(
    argv: readonly string[],
    variables: Record<string, string>,
    record: string,
  ) {
    // Returning this registered root to afterAll is conditional on this new direct native/EOF
    // observation and the controlled producer's finished record, never a generic cleanup claim.
    const registered = roots.indexOf(root);
    if (registered < 0) throw new Error('installed development root is not registered for cleanup');
    roots.splice(registered, 1);
    const native = Promise.withResolvers<{
      readonly code: number | null;
      readonly signal: unknown;
      readonly failure: unknown;
    }>();
    const custody = { hasEnded: false, hasNumeric: false, stdoutEOF: false, stderrEOF: false };
    let child: Bun.Subprocess<'ignore', 'pipe', 'pipe'>;
    try {
      child = Bun.spawn([...argv], {
        cwd: devConsumer,
        env: variables,
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        detached: true,
        onExit(_child, code, signal, failure) {
          custody.hasEnded = true;
          native.resolve({ code, signal, failure });
        },
      });
    } catch (cause: unknown) {
      throw new Error('installed development child acquisition unconfirmed; retained ' + root, {
        cause,
      });
    }
    const launched = child;
    const numeric = launched.exited.then((status) => {
      custody.hasNumeric = true;
      return status;
    });
    const stdout = (async () => {
      const bytes = await new Response(launched.stdout).arrayBuffer();
      custody.stdoutEOF = true;
      return Buffer.from(bytes);
    })();
    const stderr = (async () => {
      const bytes = await new Response(launched.stderr).arrayBuffer();
      custody.stderrEOF = true;
      return Buffer.from(bytes);
    })();
    const joined = Promise.all([native.promise, numeric, stdout, stderr]);
    void joined.catch(() => undefined);
    let observation: Awaited<typeof joined> | undefined;
    let primary: { readonly cause: unknown } | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      observation = await Promise.race([
        joined,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            reject(new Error('installed development observation exceeded15seconds'));
          }, 15000);
        }),
      ]);
    } catch (cause: unknown) {
      primary = { cause };
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
    const cleanup: unknown[] = [];
    if (observation === undefined) {
      if (!custody.hasEnded) {
        try {
          launched.kill('SIGKILL');
        } catch (cause: unknown) {
          cleanup.push(cause);
        }
      }
      let retirement: ReturnType<typeof setTimeout> | undefined;
      try {
        observation = await Promise.race([
          joined,
          new Promise<never>((_resolve, reject) => {
            retirement = setTimeout(() => {
              reject(
                new Error('installed development native/EOF join unconfirmed; retained ' + root),
              );
            }, 12000);
          }),
        ]);
      } catch (cause: unknown) {
        cleanup.push(cause);
      } finally {
        if (retirement !== undefined) clearTimeout(retirement);
      }
    }
    if (primary !== undefined || cleanup.length > 0)
      throw new AggregateError(
        primary === undefined ? cleanup : [primary.cause, ...cleanup],
        'installed development failed; retained ' + root,
        primary === undefined ? undefined : { cause: primary.cause },
      );
    if (
      observation === undefined ||
      !custody.hasEnded ||
      !custody.hasNumeric ||
      !custody.stdoutEOF ||
      !custody.stderrEOF
    )
      throw new Error('installed development direct custody is unconfirmed; retained ' + root);
    const [termination, status, out, err] = observation;
    if (termination.failure !== undefined && termination.failure !== null)
      throw new Error('installed development native callback failed; retained ' + root, {
        cause: termination.failure,
      });
    if (
      termination.code === null ||
      termination.signal !== null ||
      !Number.isInteger(termination.code) ||
      termination.code < 0 ||
      termination.code > 255 ||
      termination.code !== status
    )
      throw new Error(
        'installed development native/numeric normal status disagrees; retained ' + root,
      );
    const produced = readInstalledDevRecord(record);
    if (produced.phase !== 'finished')
      throw new Error('controlled installed producer did not finish; retained ' + root);
    roots.push(root);
    return { pid: launched.pid, termination, status, stdout: out, stderr: err, produced, custody };
  }
  for (const mode of [
    { script: 'dev', target: 'serve', status: 0, capture: false },
    { script: 'dev:local-solver', target: 'serve-local-solver', status: 3, capture: true },
  ]) {
    const record = join(devConsumer, mode.target + '.json'),
      launches = join(devConsumer, mode.target + '.jsonl');
    const log = join(devConsumer, mode.target + '.log');
    const variables: Record<string, string> = {
      ...environment,
      TMPDIR: callerScratch,
      PUNI_EXECUTABLE: installedEntrypoint,
      WBS_DEV_PORTS: '',
      PUNI_DEV_RECORD: record,
      PUNI_DEV_LAUNCHES: launches,
      PUNI_DEV_STATUS: String(mode.status),
    };
    // This declared initial package-manager launch erases startup variables before Bun starts;
    // bare bun run cannot sanitize its own pre-start inputs. The actual package scripts stay exact.
    const initial = [
      '/usr/bin/env',
      '-u',
      'BUN_OPTIONS',
      '-u',
      'BUN_INSPECT_PRELOAD',
      '-u',
      'NODE_OPTIONS',
      '-u',
      'BUN_BE_BUN',
      process.execPath,
      '--no-env-file',
      '--config=/dev/null',
    ];
    const baseline = await observeInstalledDev(
      [...initial, devNx, 'run-many', '-t', mode.target, devProjects],
      variables,
      record,
    );
    expect(baseline.termination.code).toBe(mode.status);
    expect(baseline.status).toBe(mode.status);
    expect(baseline.produced).toEqual({
      phase: 'finished',
      pid: baseline.pid,
      ppid: process.pid,
      argv: ['run-many', '-t', mode.target, devProjects],
    });
    expect<Uint8Array>(baseline.stdout).toEqual(devStdout);
    expect<Uint8Array>(baseline.stderr).toEqual(devWarning);
    const baselineLines = readFileSync(launches, 'utf8').split('\n');
    expect(baselineLines).toHaveLength(2);
    expect(baselineLines.at(1)).toBe('');
    expect(JSON.parse(baselineLines[0])).toEqual({
      phase: 'launched',
      pid: baseline.pid,
      ppid: process.pid,
      argv: ['run-many', '-t', mode.target, devProjects],
    });
    rmSync(record);
    rmSync(launches);
    expect(existsSync(record) || existsSync(launches)).toBe(false);
    const observed = await observeInstalledDev(
      [...initial, 'run', '--shell=bun', mode.script],
      mode.capture ? { ...variables, WBS_DEV_LOG: log } : variables,
      record,
    );
    expect(observed.termination.code).toBe(mode.status);
    expect(observed.status).toBe(mode.status);
    expect(observed.produced.argv).toEqual(['run-many', '-t', mode.target, devProjects]);
    const lines = readFileSync(launches, 'utf8').split('\n');
    expect(lines).toHaveLength(2);
    expect(lines.at(1)).toBe('');
    expect(JSON.parse(lines[0])).toEqual({
      phase: 'launched',
      pid: observed.produced.pid,
      ppid: observed.produced.ppid,
      argv: ['run-many', '-t', mode.target, devProjects],
    });
    if (mode.capture) {
      expect<Uint8Array>(observed.stdout).toEqual(devMerged);
      expect<Uint8Array>(readFileSync(log)).toEqual(devCaptured);
    } else {
      expect<Uint8Array>(observed.stdout).toEqual(devStdout);
      expect(observed.stderr.toString()).toContain(devWarning.toString());
      expect(existsSync(log)).toBe(false);
    }
    expect(observed.stderr.toString()).toContain(
      'WBS_DEV_PORTS is set and empty: no dev port is being checked\n',
    );
    expect(existsSync(sentinel)).toBe(false);
    expect(existsSync(repository)).toBe(false);
    expect(existsSync(destination)).toBe(false);
    expect(existsSync(join(devConsumer, 'apps'))).toBe(false);
  }
  expect(JSON.parse(invoke(['d', 'bootstrap-authority', candidate]))).toMatchObject({
    status: 'bootstrapped',
  });
  const requirements = join(candidate, 'requirements.md'),
    output = join(candidate, 'planning');
  mkdirSync(output);
  writeFileSync(requirements, '## ADDED Requirements\n');
  const plan = join(candidate, 'plan.json');
  cpSync(
    join(
      workspace,
      'apps/twilight-structure/twilight-navigator/cli/src/fixtures/plan-export.v7.json',
    ),
    plan,
  );
  expect(
    invoke([
      'n',
      'plan-reference',
      '--export',
      plan,
      '--repository',
      'https://example.test/puni',
      '--change',
      'installed',
      '--planning-commit',
      '1'.repeat(40),
      '--source-base',
      '2'.repeat(40),
      '--requirements',
      requirements,
      '--output',
      output,
    ]),
  ).toMatch(/^[0-9a-f]{64}\n$/);
  const tokenRequests: string[] = [];
  const endpoint = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      tokenRequests.push(new URL(request.url).pathname);
      return tokenRequests.length > 2
        ? Response.json({ error: 'invalid_client' }, { status: 401 })
        : Response.json({ access_token: 'installed-helper-token', token_type: 'Bearer' });
    },
  });
  try {
    const resource = new URL('mcp', endpoint.url).href,
      credentialId = '0b9f6c1e-4a1d-4c5e-9a7b-000100000001',
      key = 'wbs_mk_' + credentialId + '.' + 'a'.repeat(43);
    const document = join(candidate, 'pool keys.json'),
      store = join(candidate, 'pool store');
    writeFileSync(
      document,
      JSON.stringify({
        format: 'wbs-agent-pool-keys',
        version: 1,
        organizationId: 'org-a',
        authorizationServer: resource + '/oauth',
        mcpResource: resource,
        poolId: 'pool-a',
        name: 'fleet',
        expiresAt: null,
        issuedAt: 1800000000000,
        agents: [{ personId: 'person-a', personName: 'agent', credentialId, key }],
      }),
      { mode: 0o600 },
    );
    const importing = Bun.spawn([executable, 'd', 'pool', 'import', document, '--store', store], {
      cwd: candidate,
      env: environment,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 10000,
    });
    const [status, stdout, stderr] = await Promise.all([
      importing.exited,
      new Response(importing.stdout).text(),
      new Response(importing.stderr).text(),
    ]);
    expect(status, stderr).toBe(0);
    expect(stdout).toContain('imported pool fleet');
    expect(stdout + stderr).not.toContain(key);
    const helperFile = join(store, 'pool-pool-a/person-a.mcp.json');
    const configuration: unknown = JSON.parse(readFileSync(helperFile, 'utf8'));
    if (
      typeof configuration !== 'object' ||
      configuration === null ||
      !('mcpServers' in configuration) ||
      typeof configuration.mcpServers !== 'object' ||
      configuration.mcpServers === null ||
      !('wbs' in configuration.mcpServers) ||
      typeof configuration.mcpServers.wbs !== 'object' ||
      configuration.mcpServers.wbs === null ||
      !('headersHelper' in configuration.mcpServers.wbs) ||
      typeof configuration.mcpServers.wbs.headersHelper !== 'string'
    )
      throw new Error('installed generated header helper absent');
    const helper = configuration.mcpServers.wbs.headersHelper;
    expect(helper).toContain("'dash' 'mcp' 'token'");
    expect(helper).toContain(join(install, 'node_modules/puni/dist/puni.mjs'));
    expect(helper).not.toContain(key);
    const started = performance.now();
    const answered = await $`${{ raw: helper }}`.cwd(candidate).env(environment).quiet().nothrow();
    expect(answered.exitCode, answered.stderr.toString()).toBe(0);
    expect(JSON.parse(answered.stdout.toString())).toEqual({
      Authorization: 'Bearer installed-helper-token',
    });
    expect(answered.stderr.length).toBe(0);
    expect(performance.now() - started).toBeLessThan(10000);
    expect(existsSync(sentinel)).toBe(false);
    expect(tokenRequests).toEqual(['/mcp/oauth/token', '/mcp/oauth/token']);
    const refused = await $`${{ raw: helper }}`.cwd(candidate).env(environment).quiet().nothrow();
    expect(refused.exitCode).toBe(1);
    expect(refused.stdout.length).toBe(0);
    expect(refused.stderr.toString()).toContain('HTTP 401 invalid_client');
    expect(refused.stderr.toString()).not.toContain(key);
    expect(refused.stderr.toString()).not.toContain('installed-helper-token');
    const pasted = Bun.spawnSync(
      [executable, 'dash', 'mcp', 'token', '--resource', resource, '--key-file', key],
      {
        cwd: candidate,
        env: environment,
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 10000,
      },
    );
    expect(pasted.exitCode).toBe(1);
    expect(pasted.stdout.length).toBe(0);
    expect(pasted.stderr.toString()).not.toContain(key);
    expect(pasted.stderr.toString()).toContain('--key-file');
    expect(tokenRequests).toHaveLength(3);
  } finally {
    await endpoint.stop(true);
  }
  const dist = join(install, 'node_modules/puni/dist');
  for (const relative of [
    'package-manifest.json',
    'toolkit/toolkit.json',
    'toolkit/launcher.mjs',
    'toolkit/snapshotter.ts',
    'toolkit/validator.mjs',
    'toolkit/prepare-activation.mjs',
    'toolkit/prepare-relocation-activation.mjs',
    'toolkit/node_modules/typescript/package.json',
  ]) {
    const path = join(dist, relative),
      original = readFileSync(path),
      mode = statSync(path).mode & 0o777;
    for (const fault of ['missing', 'changed']) {
      rmSync(path);
      if (fault === 'changed') {
        let changed: Uint8Array;
        if (relative === 'package-manifest.json') {
          const manifest = JSON.parse(original.toString()) as Record<string, unknown>;
          manifest['toolkitIdentity'] = 'f'.repeat(64);
          changed = Buffer.from(JSON.stringify(manifest));
        } else if (relative === 'toolkit/toolkit.json' || relative.endsWith('/package.json'))
          changed = Buffer.concat([original, Buffer.from(' ')]);
        else
          changed = Buffer.from(
            'await Bun.stdin.bytes();process.stdout.write("tampered execution");process.exitCode=0;',
          );
        writeFileSync(path, changed, { mode });
      }
      try {
        const refused = Bun.spawnSync([executable, 'b', 'template', 'list'], {
          cwd: candidate,
          env: environment,
          stdin: 'ignore',
          stdout: 'pipe',
          stderr: 'pipe',
          timeout: 20000,
        });
        expect(refused.exitCode, relative + ' ' + fault + ' ' + refused.stderr.toString()).toBe(1);
        expect(refused.stdout.length).toBe(0);
        expect(refused.stderr.toString()).toMatch(/^error: [^\n]+\n$/u);
        expect(existsSync(sentinel)).toBe(false);
      } finally {
        if (existsSync(path)) rmSync(path);
        writeFileSync(path, original, { mode });
      }
    }
  }
  expect(invoke(['b', 'template', 'list'])).toContain('"id":"module"');
  const service = Bun.spawnSync(
    [
      process.execPath,
      '--no-env-file',
      '--config=/dev/null',
      join(install, 'node_modules/puni/dist/observation-service.mjs'),
    ],
    { cwd: candidate, env: { PATH: bin }, stdout: 'pipe', stderr: 'pipe', timeout: 10000 },
  );
  expect(service.exitCode).toBe(64);
  expect(service.stderr.toString()).toContain('service-config-invalid');
  // The current profile adds source/installed Browser and Performance plus source-corruption
  // controls to this aggregate build/pack/add session. The 300s owner expired at Forge after
  // 352 assertions. Subprocess budgets remain per purpose; the measured current-profile
  // Forge observer budget is recorded beside its invocation above.
}, 600000);
it('returns prior package cancellation before malformed revision or absent authority IO', async () => {
  let released = 0;
  const outcome = await buildPackage(
    {
      repository: '/absent-source',
      revision: 'HEAD',
      installationDirectory: '/absent-installation',
      work: '/absent-work',
      destination: '/absent-package',
    },
    {
      callerDirectory: '/absent-caller',
      runtime: { directory: '/absent-runtime', environment: {} },
      subscribeInterrupts(listener) {
        listener('SIGTERM');
        return () => {
          released++;
        };
      },
    },
  );
  expect(outcome).toEqual({ kind: 'cancelled', status: 143, ownedDirectories: [] });
  expect(released).toBe(1);
});

it('requires supported Git before source capture install reads or package output', async () => {
  const root = mkdtempSync(join(tmpdir(), 'puni package unsupported Git '));
  roots.push(root);
  const bin = join(root, 'bin');
  mkdirSync(bin);
  const marker = join(root, 'git-args'),
    gitPath = join(bin, 'git');
  writeFileSync(
    gitPath,
    '#!' +
      process.execPath +
      '\nimport{appendFileSync}from"node:fs";appendFileSync(' +
      JSON.stringify(marker) +
      ',JSON.stringify(process.argv.slice(2))+"\\n");console.log("git version 2.19.0");',
  );
  chmodSync(gitPath, 0o755);
  const failure: unknown = await buildPackage(
    {
      repository: '/absent-source',
      revision: 'a'.repeat(40),
      installationDirectory: '/absent-installation',
      work: join(root, 'work'),
      destination: join(root, 'package'),
    },
    {
      callerDirectory: root,
      runtime: { directory: root, environment: { PATH: bin } },
      subscribeInterrupts: () => () => undefined,
    },
  ).then(
    () => undefined,
    (cause: unknown) => cause,
  );
  expect(failure).toBeInstanceOf(Error);
  if (!(failure instanceof Error)) throw new Error('missing unsupported Git refusal');
  expect(readFileSync(marker, 'utf8')).toBe('["--version"]\n');
  expect(String(failure.cause)).toContain('Git 2.36.0 or newer is required');
  expect(existsSync(join(root, 'work'))).toBe(false);
  expect(existsSync(join(root, 'package'))).toBe(false);
});

it('refuses malformed package revision before any Git query capture install read or output', async () => {
  const root = mkdtempSync(join(tmpdir(), 'puni package malformed revision '));
  roots.push(root);
  const bin = join(root, 'bin');
  mkdirSync(bin);
  const marker = join(root, 'git-queried'),
    entry = join(bin, 'git');
  writeFileSync(
    entry,
    '#!' +
      process.execPath +
      '\nawait Bun.write(' +
      JSON.stringify(marker) +
      ',"queried");console.log("git version 2.43.0");',
  );
  chmodSync(entry, 0o755);
  const cause: unknown = await buildPackage(
    {
      repository: root,
      revision: 'HEAD',
      installationDirectory: '/absent-installation',
      work: join(root, 'work'),
      destination: join(root, 'package'),
    },
    {
      callerDirectory: root,
      runtime: { directory: root, environment: { PATH: bin } },
      subscribeInterrupts: () => () => undefined,
    },
  ).then(
    () => undefined,
    (failure: unknown) => failure,
  );
  expect(cause).toBeInstanceOf(Error);
  if (!(cause instanceof Error)) throw new Error('missing malformed revision refusal');
  expect(existsSync(marker)).toBe(false);
  expect(String(cause.cause)).toContain('PUNI package revision must be a full commit identity');
  expect(existsSync(join(root, 'work'))).toBe(false);
  expect(existsSync(join(root, 'package'))).toBe(false);
});
