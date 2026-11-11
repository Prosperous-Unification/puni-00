import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { buildPackage } from './packaging/build';
import * as runtime from './runtime-facade';
import type { Request } from './validator-request';

const directories: string[] = [];
function readSearchPath(): string {
  const selected = process.env['PATH'];
  if (selected === undefined) throw new Error('runtime test requires an explicit trusted PATH');
  return selected;
}
const trustedPath = readSearchPath();
let installedDirectory: string;
function createDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'puni Burokrat parent = '));
  directories.push(directory);
  return directory;
}
beforeAll(async () => {
  const packageDirectory = createDirectory();
  await buildPackage(packageDirectory);
  installedDirectory = join(packageDirectory, 'dist');
}, 120_000);
afterAll(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function runGit(repository: string, args: readonly string[]): string {
  const child = Bun.spawnSync(['git', '-C', repository, ...args], {
    env: { PATH: trustedPath, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  return child.stdout.toString().trim();
}
function createRepository(directory = createDirectory()): string {
  runGit(directory, ['init', '--initial-branch=main']);
  runGit(directory, ['config', 'user.name', 'PUNI Parent Fixture']);
  runGit(directory, ['config', 'user.email', 'puni-parent@example.test']);
  writeFileSync(join(directory, 'plain.ts'), 'export function plain(): void {}\n');
  runGit(directory, ['add', '--all']);
  runGit(directory, ['commit', '--message', 'fixture']);
  return directory;
}

async function invokeRequest(
  request: Request,
  callerDirectory = createDirectory(),
  overrides: Partial<runtime.Context> = {},
) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const launches: string[] = [];
  const executeRequest = () =>
    runtime.executeRequest(request, {
      installedDirectory,
      callerDirectory,
      path: trustedPath,
      launch(entrypoint: string) {
        launches.push(entrypoint);
        return [
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
          entrypoint,
        ];
      },
      stdout: (chunk: string | Uint8Array) => {
        stdout.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
      },
      stderr: (chunk: string | Uint8Array) => {
        stderr.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
      },
      ...overrides,
    });
  const settlement = await Promise.resolve()
    .then(executeRequest)
    .then(
      (exitCode) => ({ kind: 'returned' as const, exitCode }),
      (cause: unknown) => ({
        kind: 'threw' as const,
        message: cause instanceof Error ? cause.message : String(cause),
      }),
    );
  return { ...settlement, stdout: stdout.join(''), stderr: stderr.join(''), launches };
}

interface GitObservation {
  readonly args: readonly string[];
  readonly cwd: string;
  readonly environment: Readonly<Record<string, string>>;
  readonly unexpected: readonly string[];
}

function createGitProbe(version?: string, status = 0) {
  const directory = createDirectory();
  const record = join(directory, 'observations.jsonl');
  const realGit = Bun.which('git');
  if (realGit === null) throw new Error('Git test prerequisite is absent');
  const allowed = [
    'PATH',
    'TOOL_WIKI_TRUSTED_NODE_MODULES',
    'TOOL_WIKI_CI_TRUSTED_BINDING',
    'GIT_CONFIG_GLOBAL',
    'GIT_CONFIG_SYSTEM',
    'GIT_CONFIG_COUNT',
    'GIT_CONFIG_KEY_0',
    'GIT_CONFIG_VALUE_0',
    'GIT_CONFIG_KEY_1',
    'GIT_CONFIG_VALUE_1',
    'GIT_NO_REPLACE_OBJECTS',
    'GIT_ALLOW_PROTOCOL',
    'GIT_TERMINAL_PROMPT',
  ];
  const program =
    'import { appendFileSync } from "node:fs";\n' +
    'const args = process.argv.slice(2);\n' +
    'const allowed = ' +
    JSON.stringify(allowed) +
    ';\n' +
    'const environment = Object.fromEntries(allowed.flatMap((key) => process.env[key] === undefined ? [] : [[key, process.env[key]]]));\n' +
    'const unexpected = Object.keys(process.env).filter((key) => !allowed.includes(key) && key !== "GIT_INDEX_FILE");\n' +
    'appendFileSync(' +
    JSON.stringify(record) +
    ', JSON.stringify({ args, environment, unexpected, cwd: process.cwd() }) + "\\n");\n' +
    'const version = ' +
    JSON.stringify(version) +
    ';\n' +
    'if (args.length === 1 && args[0] === "--version" && version !== undefined) { process.stdout.write(version + "\\n"); process.exit(' +
    String(status) +
    '); }\n' +
    'const stdin = args[2] === "cat-file" ? await Bun.stdin.bytes() : "ignore";\n' +
    'const child = Bun.spawnSync([' +
    JSON.stringify(realGit) +
    ', ...args], { stdin, stdout: "pipe", stderr: "pipe" });\n' +
    'process.stdout.write(child.stdout); process.stderr.write(child.stderr); process.exit(child.exitCode);\n';
  const wrapper = join(directory, 'git');
  writeFileSync(
    wrapper,
    '#!/usr/bin/env -S -u BUN_OPTIONS -u BUN_INSPECT_PRELOAD -u NODE_OPTIONS -u BUN_BE_BUN bun --no-env-file --config=/dev/null\n' +
      program,
  );
  chmodSync(wrapper, 0o755);
  symlinkSync(process.execPath, join(directory, 'bun'));
  return { path: directory + delimiter + trustedPath, record };
}

function readGitObservations(record: string): GitObservation[] {
  return readFileSync(record, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as GitObservation);
}

describe('Burokrat verified parent runtime', () => {
  it('runs a typed installed template request through the verified role', async () => {
    const execution = await invokeRequest({ command: 'template', action: 'list' });
    expect(execution).toMatchObject({ kind: 'returned', exitCode: 0, stderr: '' });
    expect(execution.stdout).toContain('"id":"module"');
    expect(execution.launches).toEqual([join(installedDirectory, 'toolkit/validator.mjs')]);
  });

  it('retains the selected committed repository and revision', async () => {
    const selected = createRepository();
    const execution = await invokeRequest({
      command: 'read-candidate',
      kind: 'committed',
      repository: selected,
      revision: 'HEAD',
    });
    expect(execution).toMatchObject({ kind: 'returned', exitCode: 0, stderr: '' });
    expect(JSON.parse(execution.stdout) as unknown).toMatchObject({
      selection: { kind: 'committed', revision: runGit(selected, ['rev-parse', 'HEAD']) },
      entries: [{ path: 'plain.ts' }],
    });
  });

  it('passes through a structured nonpassing verdict without another error', async () => {
    const execution = await invokeRequest({
      command: 'template',
      action: 'verify',
      template: 'feature-service',
      kind: 'committed',
      repository: createRepository(),
      revision: 'HEAD',
      subject: 'plain.ts',
    });
    expect(execution).toMatchObject({ kind: 'returned', exitCode: 1, stderr: '' });
    expect(JSON.parse(execution.stdout) as unknown).toMatchObject({ conforms: false });
    expect(execution.stdout).not.toContain('validator exited');
  });

  it('anchors relative host input to the captured caller directory', async () => {
    const callerDirectory = createDirectory();
    writeFileSync(join(callerDirectory, 'selected.json'), '{malformed selected input');
    const execution = await invokeRequest(
      { command: 'validate-plan-tasks', planReference: 'selected.json', tasks: 'later.json' },
      callerDirectory,
    );
    expect(execution).toMatchObject({ kind: 'returned', exitCode: 1, stdout: '' });
    expect(execution.stderr).toContain(
      'malformed JSON input ' + callerDirectory + '/selected.json:',
    );
    expect(execution.stderr).not.toContain('validator exited');
  });

  it('refuses a tampered role before launching it or reading operation inputs', async () => {
    const validator = join(installedDirectory, 'toolkit/validator.mjs');
    const bytes = readFileSync(validator);
    const mode = statSync(validator).mode & 0o777;
    chmodSync(validator, 0o644);
    try {
      writeFileSync(validator, Buffer.concat([bytes, Buffer.from('\n// altered role\n')]));
      const execution = await invokeRequest({ command: 'template', action: 'list' });
      expect(execution).toMatchObject({ kind: 'threw', stdout: '', stderr: '', launches: [] });
      if (execution.kind !== 'threw') throw new Error('tampered toolkit unexpectedly executed');
      expect(execution.message).toContain('toolkit role differs from toolkit.json: validator.mjs');
    } finally {
      writeFileSync(validator, bytes);
      chmodSync(validator, mode);
    }
  });
  it('refuses a candidate-local installation even when its assets point outside', async () => {
    const selected = createRepository();
    const local = join(selected, 'node_modules/puni/dist');
    mkdirSync(local, { recursive: true });
    mkdirSync(join(selected, 'nested'));
    symlinkSync(
      join(installedDirectory, 'package-manifest.json'),
      join(local, 'package-manifest.json'),
    );
    symlinkSync(join(installedDirectory, 'toolkit'), join(local, 'toolkit'), 'dir');
    const execution = await invokeRequest(
      {
        command: 'read-candidate',
        kind: 'committed',
        repository: join(selected, 'nested'),
        revision: 'HEAD',
      },
      createDirectory(),
      { installedDirectory: local },
    );
    expect(execution).toMatchObject({ kind: 'threw', stdout: '', stderr: '', launches: [] });
    if (execution.kind !== 'threw')
      throw new Error('candidate-local installation unexpectedly ran');
    expect(execution.message).toContain(
      'installed Burokrat runtime must be outside the selected candidate',
    );
  });

  for (const relative of [
    'package-manifest.json',
    'toolkit/toolkit.json',
    'toolkit/launcher.sh',
    'toolkit/snapshotter.ts',
    'toolkit/validator.mjs',
    'toolkit/prepare-activation.mjs',
    'toolkit/prepare-relocation-activation.mjs',
    'toolkit/trusted-node-modules',
  ]) {
    it('refuses a candidate symlink target for ' + relative, async () => {
      const selected = createRepository();
      const asset = join(installedDirectory, relative);
      const destination = join(selected, 'moved-' + relative.replaceAll('/', '_'));
      const kind = statSync(asset).isDirectory() ? 'dir' : 'file';
      renameSync(asset, destination);
      symlinkSync(destination, asset, kind);
      try {
        const execution = await invokeRequest({
          command: 'read-candidate',
          kind: 'committed',
          repository: selected,
          revision: 'HEAD',
        });
        expect(execution).toMatchObject({ kind: 'threw', stdout: '', stderr: '', launches: [] });
        if (execution.kind !== 'threw')
          throw new Error('candidate-owned runtime asset unexpectedly ran');
        expect(execution.message).toContain(
          'installed Burokrat runtime must be outside the selected candidate',
        );
      } finally {
        rmSync(asset);
        renameSync(destination, asset);
      }
    });
  }

  it('refuses candidate-local child cwd even when all its files resolve outside', async () => {
    const selected = createRepository();
    const toolkit = join(installedDirectory, 'toolkit');
    const retained = join(createDirectory(), 'retained-toolkit');
    const local = join(selected, 'toolkit');
    renameSync(toolkit, retained);
    mkdirSync(local);
    for (const name of readdirSync(retained)) symlinkSync(join(retained, name), join(local, name));
    symlinkSync(local, toolkit, 'dir');
    try {
      const execution = await invokeRequest({
        command: 'read-candidate',
        kind: 'committed',
        repository: selected,
        revision: 'HEAD',
      });
      expect(execution).toMatchObject({ kind: 'threw', stdout: '', stderr: '', launches: [] });
      if (execution.kind !== 'threw') throw new Error('candidate-local child cwd unexpectedly ran');
      expect(execution.message).toContain(
        'installed Burokrat runtime must be outside the selected candidate',
      );
    } finally {
      rmSync(toolkit);
      renameSync(retained, toolkit);
    }
  });

  it('allows a physical installation with a neighboring candidate path prefix', async () => {
    const selected = createRepository();
    const neighbor = selected + '-external';
    mkdirSync(neighbor);
    directories.push(neighbor);
    symlinkSync(
      join(installedDirectory, 'package-manifest.json'),
      join(neighbor, 'package-manifest.json'),
    );
    symlinkSync(join(installedDirectory, 'toolkit'), join(neighbor, 'toolkit'), 'dir');
    const execution = await invokeRequest(
      { command: 'read-candidate', kind: 'committed', repository: selected, revision: 'HEAD' },
      createDirectory(),
      { installedDirectory: neighbor },
    );
    expect(execution).toMatchObject({ kind: 'returned', exitCode: 0, stderr: '' });
  });

  for (const version of ['git version 1.99.0', 'git version 2.35.1', 'git version 2.35.99']) {
    it(
      'refuses unsupported ' + version + ' before querying the repository or launching a validator',
      async () => {
        const selected = createRepository();
        const probe = createGitProbe(version);
        const execution = await invokeRequest(
          { command: 'read-candidate', kind: 'committed', repository: selected, revision: 'HEAD' },
          createDirectory(),
          { path: probe.path },
        );
        expect(execution).toMatchObject({ kind: 'threw', stdout: '', stderr: '', launches: [] });
        if (execution.kind !== 'threw') throw new Error('unsupported Git unexpectedly ran');
        expect(execution.message).toContain('Git 2.36.0 or newer is required');
        expect(readGitObservations(probe.record).map(({ args }) => args)).toEqual([['--version']]);
      },
    );
  }

  for (const version of [
    'git version 2.36.0',
    'git version 2.43.0',
    'git version 3.0.0',
    'git version 2.39.5 (Apple Git-154)',
  ]) {
    it('accepts supported ' + version, async () => {
      const selected = createRepository();
      const probe = createGitProbe(version);
      const execution = await invokeRequest(
        { command: 'read-candidate', kind: 'committed', repository: selected, revision: 'HEAD' },
        createDirectory(),
        { path: probe.path },
      );
      expect(execution).toMatchObject({ kind: 'returned', exitCode: 0, stderr: '' });
      expect(readGitObservations(probe.record)[0]?.args).toEqual(['--version']);
    });
  }

  for (const version of [
    'not Git',
    'prefix git version 2.43.0',
    'git version 2.36',
    'git version 2.43.0\nextra',
    'git version 999999999999999999.0.0',
    'git version 2.43.0 (Unknown Vendor)',
    'git version 2.36.0 (release candidate)',
    'git version 2.43.0 (Apple Git-154-rc1)',
    'git version 2.43.0\n',
  ]) {
    it('refuses malformed version response ' + JSON.stringify(version), async () => {
      const selected = createRepository();
      const probe = createGitProbe(version);
      const execution = await invokeRequest(
        { command: 'read-candidate', kind: 'committed', repository: selected, revision: 'HEAD' },
        createDirectory(),
        { path: probe.path },
      );
      expect(execution).toMatchObject({ kind: 'threw', launches: [] });
      if (execution.kind !== 'threw') throw new Error('malformed Git response unexpectedly ran');
      expect(execution.message).toContain('Git version response is malformed');
    });
  }

  it('refuses a failed Git version query without parsing its successful-looking stdout', async () => {
    const probe = createGitProbe('git version 2.43.0', 42);
    const execution = await invokeRequest(
      {
        command: 'read-candidate',
        kind: 'committed',
        repository: createRepository(),
        revision: 'HEAD',
      },
      createDirectory(),
      { path: probe.path },
    );
    expect(execution).toMatchObject({ kind: 'threw', launches: [] });
    if (execution.kind !== 'threw') throw new Error('failed Git version query unexpectedly ran');
    expect(execution.message).toContain('cannot inspect required Git version');
  });

  it('reports absent Git before the validator is launched', async () => {
    const execution = await invokeRequest(
      {
        command: 'read-candidate',
        kind: 'committed',
        repository: createRepository(),
        revision: 'HEAD',
      },
      createDirectory(),
      { path: createDirectory() },
    );
    expect(execution).toMatchObject({ kind: 'threw', launches: [] });
    if (execution.kind !== 'threw') throw new Error('absent Git unexpectedly ran');
    expect(execution.message).toContain('cannot inspect required Git version');
  });

  it('keeps non-Git template commands usable without Git on the selected PATH', async () => {
    const execution = await invokeRequest(
      { command: 'template', action: 'list' },
      createDirectory(),
      { path: createDirectory() },
    );
    expect(execution).toMatchObject({ kind: 'returned', exitCode: 0, stderr: '' });
  });

  it('gives every ordinary Git process only the declared runtime environment', async () => {
    const selected = createRepository();
    const probe = createGitProbe();
    const inherited = process.env['PUNI_TEST_UNLISTED_SECRET'];
    process.env['PUNI_TEST_UNLISTED_SECRET'] = 'unlisted-test-sentinel';
    try {
      const execution = await invokeRequest(
        { command: 'read-candidate', kind: 'committed', repository: selected, revision: 'HEAD' },
        createDirectory(),
        { path: probe.path, ciTrustedBinding: './must-not-be-forwarded' },
      );
      expect(execution).toMatchObject({ kind: 'returned', exitCode: 0, stderr: '' });
      const observations = readGitObservations(probe.record);
      expect(observations.length).toBeGreaterThan(1);
      expect(observations.some(({ args }) => args.includes('ls-tree'))).toBe(true);
      for (const observation of observations) {
        expect(observation.unexpected).toEqual([]);
        expect(observation.environment).toMatchObject({
          PATH: probe.path,
          TOOL_WIKI_TRUSTED_NODE_MODULES: join(installedDirectory, 'toolkit/trusted-node-modules'),
          GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_CONFIG_SYSTEM: '/dev/null',
          GIT_CONFIG_COUNT: '2',
          GIT_CONFIG_KEY_0: 'core.hooksPath',
          GIT_CONFIG_VALUE_0: '/dev/null',
          GIT_CONFIG_KEY_1: 'core.fsmonitor',
          GIT_CONFIG_VALUE_1: 'false',
          GIT_NO_REPLACE_OBJECTS: '1',
          GIT_ALLOW_PROTOCOL: '',
          GIT_TERMINAL_PROMPT: '0',
        });
        expect(observation.environment['TOOL_WIKI_CI_TRUSTED_BINDING']).toBeUndefined();
        expect(observation.cwd).not.toBe(selected);
      }
    } finally {
      if (inherited === undefined) Reflect.deleteProperty(process.env, 'PUNI_TEST_UNLISTED_SECRET');
      else process.env['PUNI_TEST_UNLISTED_SECRET'] = inherited;
    }
  });

  for (const hook of ['fsmonitor', 'post-index-change'] as const) {
    it('disables an actually reachable candidate ' + hook + ' program', async () => {
      const selected = mkdtempSync(join(tmpdir(), 'puni-parent-hooks-'));
      directories.push(selected);
      createRepository(selected);
      writeFileSync(join(selected, 'plain.ts'), 'export function changed(): void {}\n');
      const blob = runGit(selected, ['hash-object', '--no-filters', 'plain.ts']);
      const marker = join(createDirectory(), 'hook-executed');
      const hooks = join(selected, '.candidate-hooks');
      mkdirSync(hooks);
      const executable = join(hooks, hook);
      writeFileSync(
        executable,
        '#!/usr/bin/env -S -u BUN_OPTIONS -u BUN_INSPECT_PRELOAD -u NODE_OPTIONS -u BUN_BE_BUN bun --no-env-file --config=/dev/null\n' +
          'await Bun.write(' +
          JSON.stringify(marker) +
          ', "executed");\n' +
          (hook === 'fsmonitor' ? 'process.stdout.write("token\\0");\n' : ''),
      );
      chmodSync(executable, 0o755);
      if (hook === 'fsmonitor') {
        runGit(selected, ['config', 'core.fsmonitor', executable]);
        runGit(selected, ['config', 'core.fsmonitorHookVersion', '2']);
        runGit(selected, ['status', '--porcelain']);
      } else {
        runGit(selected, ['config', 'core.hooksPath', hooks]);
        runGit(selected, ['add', '--update']);
      }
      expect(readFileSync(marker, 'utf8')).toBe('executed');
      rmSync(marker);
      const execution = await invokeRequest({
        command: 'read-candidate',
        kind: 'working',
        repository: selected,
        revision: 'HEAD',
      });
      expect(execution).toMatchObject({ kind: 'returned', exitCode: 0, stderr: '' });
      expect(existsSync(marker)).toBe(false);
      expect(JSON.parse(execution.stdout) as unknown).toMatchObject({
        entries: [{ path: 'plain.ts', blob }],
      });
    });
  }

  for (const variable of ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM'] as const) {
    it('excludes the caller-selected ' + variable + ' configuration', async () => {
      const selected = createRepository();
      writeFileSync(join(selected, 'plain.ts'), 'export function changed(): void {}\n');
      const configuration = join(createDirectory(), 'operator.gitconfig');
      runGit(selected, [
        'config',
        '--file',
        configuration,
        'filter.operator.clean',
        'controlled-unused-filter',
      ]);
      const previous = process.env[variable];
      process.env[variable] = configuration;
      try {
        const execution = await invokeRequest({
          command: 'read-candidate',
          kind: 'working',
          repository: selected,
          revision: 'HEAD',
        });
        expect(execution).toMatchObject({ kind: 'returned', exitCode: 0, stderr: '' });
      } finally {
        if (previous === undefined) Reflect.deleteProperty(process.env, variable);
        else process.env[variable] = previous;
      }
    });
  }

  it('forwards only lint-ci caller-relative binding against the captured caller directory', async () => {
    const selected = createRepository();
    const caller = createDirectory();
    const probe = createGitProbe();
    const binding = './missing-trusted-binding.json';
    const execution = await invokeRequest(
      {
        command: 'lint-ci',
        kind: 'committed',
        repository: selected,
        revision: 'HEAD',
        evidence: './evidence.json',
      },
      caller,
      { path: probe.path, ciTrustedBinding: binding },
    );
    expect(execution).toMatchObject({ kind: 'returned', exitCode: 1, stdout: '' });
    expect(execution.stderr).toContain(caller + '/' + binding);
    expect(execution.stderr).not.toContain('CI trusted binding was not preselected');
    for (const observation of readGitObservations(probe.record))
      expect(observation.environment['TOOL_WIKI_CI_TRUSTED_BINDING']).toBe(caller + '/' + binding);
  });

  it('retains an explicitly empty lint-ci binding as the existing missing-selection refusal', async () => {
    const probe = createGitProbe();
    const execution = await invokeRequest(
      {
        command: 'lint-ci',
        kind: 'committed',
        repository: createRepository(),
        revision: 'HEAD',
        evidence: './evidence.json',
      },
      createDirectory(),
      { path: probe.path, ciTrustedBinding: '' },
    );
    expect(execution).toMatchObject({ kind: 'returned', exitCode: 1, stdout: '' });
    expect(execution.stderr).toContain('CI trusted binding was not preselected by the caller');
    for (const observation of readGitObservations(probe.record))
      expect(observation.environment['TOOL_WIKI_CI_TRUSTED_BINDING']).toBe('');
  });

  it('reports a signaled validator and retains its partial output', async () => {
    const program = join(createDirectory(), 'signaled-validator.ts');
    writeFileSync(
      program,
      'await Bun.stdin.bytes();\nawait Bun.write(Bun.stdout, "partial-before-signal\\n");\nprocess.kill(process.pid, "SIGTERM");\n',
    );
    const execution = await invokeRequest(
      { command: 'template', action: 'list' },
      createDirectory(),
      {
        launch: () => [process.execPath, '--no-env-file', '--config=/dev/null', program],
      },
    );
    expect(execution).toMatchObject({ kind: 'threw', stdout: 'partial-before-signal\n' });
    if (execution.kind !== 'threw') throw new Error('signal was mistaken for a normal verdict');
    expect(execution.message).toContain('verified Burokrat validator ended by SIGTERM');
  });

  it('adds context when the selected validator process cannot start', async () => {
    const missing = join(createDirectory(), 'absent-Bun');
    const execution = await invokeRequest(
      { command: 'template', action: 'list' },
      createDirectory(),
      { launch: (entrypoint) => [missing, entrypoint] },
    );
    expect(execution).toMatchObject({ kind: 'threw', stdout: '', stderr: '' });
    if (execution.kind !== 'threw')
      throw new Error('missing executable was mistaken for a verdict');
    expect(execution.message).toContain('cannot start verified Burokrat validator');
  });

  it('preserves a protected launch prerequisite refusal', async () => {
    const execution = await invokeRequest(
      { command: 'template', action: 'list' },
      createDirectory(),
      {
        launch: () => {
          throw new Error('protected launch prerequisite refused');
        },
      },
    );
    expect(execution).toMatchObject({
      kind: 'threw',
      message: 'protected launch prerequisite refused',
      stdout: '',
      stderr: '',
    });
  });

  it('denies a reachable lazy-fetch remote helper for a missing promised object', async () => {
    const selected = createDirectory();
    createRepository(selected);
    const probe = createGitProbe();
    const marker = join(createDirectory(), 'remote-helper-executed');
    const executable = join(dirname(probe.record), 'git-remote-puni-proof');
    writeFileSync(
      executable,
      '#!/usr/bin/env -S -u BUN_OPTIONS -u BUN_INSPECT_PRELOAD -u NODE_OPTIONS -u BUN_BE_BUN bun --no-env-file --config=/dev/null\n' +
        'await Bun.write(' +
        JSON.stringify(marker) +
        ', "remote executed");\nprocess.exit(1);\n',
    );
    chmodSync(executable, 0o755);
    const blob = runGit(selected, ['rev-parse', 'HEAD:plain.ts']);
    runGit(selected, ['config', 'core.repositoryformatversion', '1']);
    runGit(selected, ['config', 'extensions.partialClone', 'origin']);
    runGit(selected, ['config', 'remote.origin.url', 'puni-proof::controlled']);
    runGit(selected, ['config', 'remote.origin.promisor', 'true']);
    runGit(selected, ['config', 'remote.origin.partialclonefilter', 'blob:none']);
    runGit(selected, ['config', 'protocol.puni-proof.allow', 'always']);
    rmSync(join(selected, '.git/objects', blob.slice(0, 2), blob.slice(2)));
    const control = Bun.spawnSync(['git', '-C', selected, 'cat-file', 'blob', blob], {
      env: {
        PATH: probe.path,
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_SYSTEM: '/dev/null',
        GIT_TERMINAL_PROMPT: '0',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(control.exitCode).not.toBe(0);
    expect(readFileSync(marker, 'utf8')).toBe('remote executed');
    rmSync(marker);
    const execution = await invokeRequest(
      {
        command: 'template',
        action: 'verify',
        template: 'feature-service',
        kind: 'committed',
        repository: selected,
        revision: 'HEAD',
        subject: 'plain.ts',
      },
      createDirectory(),
      { path: probe.path },
    );
    expect(existsSync(marker)).toBe(false);
    expect(execution).toMatchObject({ kind: 'returned', exitCode: 1 });
  });
  for (const version of [
    'git version 2.36.0-rc0',
    'git version 2.36.0.rc0',
    'git version 3.0.0-rc0',
  ]) {
    it('refuses an unsupported prerelease form ' + version, async () => {
      const probe = createGitProbe(version);
      const execution = await invokeRequest(
        {
          command: 'read-candidate',
          kind: 'committed',
          repository: createRepository(),
          revision: 'HEAD',
        },
        createDirectory(),
        { path: probe.path },
      );
      expect(execution).toMatchObject({ kind: 'threw', launches: [] });
      if (execution.kind !== 'threw') throw new Error('prerelease Git unexpectedly ran');
      expect(execution.message).toContain('Git version response is malformed or unsupported');
    });
  }

  it('accepts the canonical stable Windows vendor version form', async () => {
    const probe = createGitProbe('git version 2.43.0.windows.1');
    const execution = await invokeRequest(
      {
        command: 'read-candidate',
        kind: 'committed',
        repository: createRepository(),
        revision: 'HEAD',
      },
      createDirectory(),
      { path: probe.path },
    );
    expect(execution).toMatchObject({ kind: 'returned', exitCode: 0, stderr: '' });
  });

  for (const selection of ['explain', 'workflow binding'] as const) {
    it('refuses a candidate-local installation for ' + selection, async () => {
      const selected = createRepository();
      const local = join(selected, 'local-installation');
      mkdirSync(local);
      symlinkSync(
        join(installedDirectory, 'package-manifest.json'),
        join(local, 'package-manifest.json'),
      );
      symlinkSync(join(installedDirectory, 'toolkit'), join(local, 'toolkit'), 'dir');
      const request: Request =
        selection === 'explain'
          ? {
              command: 'explain',
              rule: 'MOD-INDEX',
              policy: { repository: selected, rulePolicy: './missing-policy.json' },
            }
          : { command: 'validate workflow-binding', file: './missing-binding.json', steps: ['a'] };
      const execution = await invokeRequest(request, selected, { installedDirectory: local });
      expect(execution).toMatchObject({ kind: 'threw', stdout: '', stderr: '', launches: [] });
      if (execution.kind !== 'threw') throw new Error('candidate-local runtime unexpectedly ran');
      expect(execution.message).toContain(
        'installed Burokrat runtime must be outside the selected candidate',
      );
    });
  }

  it('preserves arbitrary child output bytes and an exact nonbinary verdict status', async () => {
    const program = join(createDirectory(), 'binary-output.ts');
    writeFileSync(
      program,
      'await Bun.stdin.bytes();\nawait Bun.write(Bun.stdout, new Uint8Array([0, 255, 192, 10]));\nawait Bun.write(Bun.stderr, new Uint8Array([128, 254, 0, 13]));\nprocess.exit(37);\n',
    );
    const output: number[] = [];
    const errors: number[] = [];
    const execution = await invokeRequest(
      { command: 'template', action: 'list' },
      createDirectory(),
      {
        launch: () => [process.execPath, '--no-env-file', '--config=/dev/null', program],
        stdout: (chunk) => {
          output.push(...(typeof chunk === 'string' ? Buffer.from(chunk) : chunk));
        },
        stderr: (chunk) => {
          errors.push(...(typeof chunk === 'string' ? Buffer.from(chunk) : chunk));
        },
      },
    );
    expect(execution).toMatchObject({ kind: 'returned', exitCode: 37 });
    expect(output).toEqual([0, 255, 192, 10]);
    expect(errors).toEqual([128, 254, 0, 13]);
  });

  it('refuses absent selected CI binding without inheriting ambient selection', async () => {
    const previous = process.env['TOOL_WIKI_CI_TRUSTED_BINDING'];
    process.env['TOOL_WIKI_CI_TRUSTED_BINDING'] = '/operator/ambient-binding-sentinel.json';
    try {
      const execution = await invokeRequest({
        command: 'lint-ci',
        kind: 'committed',
        repository: createRepository(),
        revision: 'HEAD',
        evidence: './evidence.json',
      });
      expect(execution).toMatchObject({ kind: 'returned', exitCode: 1, stdout: '' });
      expect(execution.stderr).toContain('CI trusted binding was not preselected by the caller');
      expect(execution.stderr).not.toContain('ambient-binding-sentinel');
    } finally {
      if (previous === undefined)
        Reflect.deleteProperty(process.env, 'TOOL_WIKI_CI_TRUSTED_BINDING');
      else process.env['TOOL_WIKI_CI_TRUSTED_BINDING'] = previous;
    }
  });

  it('keeps child cwd in the selected verified toolkit', async () => {
    const program = join(createDirectory(), 'read-cwd.ts');
    writeFileSync(
      program,
      'await Bun.stdin.bytes();\nprocess.stdout.write(JSON.stringify(process.cwd()));\n',
    );
    const execution = await invokeRequest(
      { command: 'template', action: 'list' },
      createDirectory(),
      {
        launch: () => [process.execPath, '--no-env-file', '--config=/dev/null', program],
      },
    );
    expect(execution).toMatchObject({ kind: 'returned', exitCode: 0, stderr: '' });
    expect(JSON.parse(execution.stdout) as unknown).toBe(join(installedDirectory, 'toolkit'));
  });
});
