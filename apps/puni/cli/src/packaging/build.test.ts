import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { $ } from 'bun';
import { afterAll, expect, it } from 'bun:test';

import { buildPackage } from './build';

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
    version: '0.3.0',
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
  const archive = join(packedDirectory, 'puni-0.3.0.tgz');
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
  const environment = {
    PATH: bin,
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
  rmSync(repository, { recursive: true, force: true });
  rmSync(destination, { recursive: true, force: true });
  expect(invoke(['--version'])).toBe('0.3.0');
  expect(invoke(['--help'])).toContain('navigator');
  expect(invoke(['bur', 'template', 'list'])).toContain('"id":"module"');
  expect(invoke(['dash', 'ops', 'lock', 'status'])).toBe(
    'heavy lock: holder none' + String.fromCharCode(10),
  );
  expect(existsSync(lockPath)).toBe(false);
  expect(existsSync(lockPath + '.queue')).toBe(false);
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
    'toolkit/trusted-node-modules/typescript/package.json',
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
}, 180000);
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
