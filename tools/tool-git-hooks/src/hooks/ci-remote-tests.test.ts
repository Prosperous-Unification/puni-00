import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

const ROOT = resolve(import.meta.dir, '../../../..');
const CLI = join(ROOT, 'tools/tool-remote-scripts/test/ci-leaf.ts');
const PROJECT = 'tools/tool-remote-scripts';
const MODEL = 'src/lib/dependency-product-process-model.test.ts';
const explicit = [
  'test/edge-init.test.ts',
  'test/solver-drain-transport.test.ts',
  'test/solver-drain-fixture.test.ts',
  'test/source-exclusion-transport.test.ts',
  'test/source-exclusion-topology.test.ts',
  'test/source-exclusion-native.test.ts',
  'test/fixture-failure.test.ts',
];

function write(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function fixture(): string {
  const root = scratchSync('remote-ci-leaves-');
  for (const path of [`${PROJECT}/project.json`, 'nx.json', '.bun-version'])
    write(root, path, readFileSync(join(ROOT, path), 'utf8'));
  write(root, 'tools/test/scratch/preload.ts', '');
  for (const path of [
    MODEL,
    ...explicit,
    'src/new.test.ts',
    'src/lib/dependency-product-process-model-extra.test.ts',
    'elsewhere/src-shadow/new.test.ts',
    `elsewhere/${MODEL}`,
  ])
    write(
      root,
      `${PROJECT}/${path}`,
      `import { test, expect } from 'bun:test';
       test(${JSON.stringify(path)}, () => {
         console.log('EXECUTED=' + ${JSON.stringify(path)});
         expect(process.env.CLAUDECODE).toBe('0'); expect(process.env.AGENT).toBe('0');
       });`,
    );
  for (const args of [
    ['init', '--quiet'],
    ['config', 'user.name', 'Remote leaf test'],
    ['config', 'user.email', 'remote@example.test'],
    ['add', '.'],
    ['commit', '--quiet', '-m', 'fixture'],
  ]) {
    const invocation = Bun.spawnSync(['git', ...args], {
      cwd: root,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (invocation.exitCode !== 0) throw new Error(invocation.stderr.toString());
  }
  return root;
}

function invoke(root: string, leaf: string) {
  const head = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: root, stdout: 'pipe' })
    .stdout.toString()
    .trim();
  return Bun.spawnSync([process.execPath, CLI, root, leaf, `--head=${head}`], {
    env: { ...process.env, FORCE_COLOR: '0', CLAUDECODE: '0', AGENT: '0' },
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 5000,
  });
}

function executed(output: string): string[] {
  return [...output.matchAll(/^EXECUTED=(.+)$/gm)].map((match) => match[1]).sort();
}

test('fresh fixed leaves preserve real canonical Bun discovery including future and collision files', () => {
  const root = fixture();
  const canonical = Bun.spawnSync(
    [
      process.execPath,
      'test',
      'src',
      ...explicit,
      '--preload',
      '../test/scratch/preload.ts',
      '--timeout=10000',
    ],
    {
      cwd: join(root, PROJECT),
      env: { ...process.env, CLAUDECODE: '0', AGENT: '0' },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  expect(canonical.exitCode).toBe(0);
  const model = invoke(root, 'model');
  const rest = invoke(root, 'rest');
  expect(model.exitCode, model.stderr.toString()).toBe(0);
  expect(rest.exitCode, rest.stderr.toString()).toBe(0);
  const singleton = executed(model.stdout.toString());
  const complement = executed(rest.stdout.toString());
  expect(singleton).toEqual([MODEL]);
  expect(complement).toContain('src/new.test.ts');
  expect(complement).toContain('elsewhere/src-shadow/new.test.ts');
  expect(complement).toContain(`elsewhere/${MODEL}`);
  expect(complement).toContain('src/lib/dependency-product-process-model-extra.test.ts');
  expect(complement).not.toContain(MODEL);
  expect([...singleton, ...complement].sort()).toEqual(executed(canonical.stdout.toString()));
  expect(new Set([...singleton, ...complement]).size).toBe(singleton.length + complement.length);
  expect(model.stdout.toString()).toContain('"fresh":true');
  expect(rest.stdout.toString()).toContain('"fresh":true');
});

test.each(['model', 'rest'])(
  'each leaf refuses absent, renamed, unreadable or aliased model and missing explicit tests: %s',
  (leaf) => {
    for (const fault of ['absent', 'renamed', 'unreadable', 'alias', 'parent-alias', 'explicit']) {
      const root = fixture();
      const model = join(root, PROJECT, MODEL);
      if (fault === 'absent') rmSync(model);
      if (fault === 'renamed') renameSync(model, `${model}.renamed`);
      if (fault === 'unreadable') chmodSync(model, 0);
      if (fault === 'alias') {
        renameSync(model, `${model}.owned`);
        symlinkSync(`${model}.owned`, model);
      }
      if (fault === 'parent-alias') {
        renameSync(dirname(model), `${dirname(model)}-owned`);
        symlinkSync(`${dirname(model)}-owned`, dirname(model));
      }
      if (fault === 'explicit') rmSync(join(root, PROJECT, explicit[0]));
      const invocation = invoke(root, leaf);
      expect(invocation.exitCode, fault).not.toBe(0);
      expect(executed(invocation.stdout.toString()), fault).toEqual([]);
      if (fault === 'unreadable') chmodSync(model, 0o644);
    }
  },
);

test.each([
  'command',
  'cwd',
  'preload',
  'dependency',
  'environment',
  'inputs',
  'bunfig',
  'empty',
  'failed',
  'unknown',
])('refuses changed contract or invalid execution: %s', (fault) => {
  const root = fixture();
  const path = join(root, PROJECT, 'project.json');
  const project = JSON.parse(readFileSync(path, 'utf8')) as {
    targets: Record<
      string,
      {
        inputs?: string[];
        dependsOn?: string[];
        options: { command: string; cwd?: string; env?: Record<string, string> };
      }
    >;
  };
  const canonical = project.targets['test'];
  if (fault === 'command')
    canonical.options.command = canonical.options.command.replace(
      'test/fixture-failure.test.ts ',
      '',
    );
  if (fault === 'cwd') canonical.options.cwd = '.';
  if (fault === 'preload')
    canonical.options.command = canonical.options.command.replace(
      '../test/scratch/preload.ts',
      '../other.ts',
    );
  if (fault === 'dependency') canonical.dependsOn = [];
  if (fault === 'environment')
    project.targets['test:ci:model'].options.env = { CLAUDECODE: '1', AGENT: '0' };
  if (fault === 'inputs') project.targets['test:ci:model'].inputs = ['default'];
  writeFileSync(path, JSON.stringify(project));
  if (fault === 'bunfig') write(root, `${PROJECT}/bunfig.toml`, '[test]\nroot="elsewhere"\n');
  if (fault === 'empty') write(root, `${PROJECT}/${MODEL}`, 'export const empty = true;');
  if (fault === 'failed')
    write(
      root,
      `${PROJECT}/${MODEL}`,
      "import { test } from 'bun:test'; test('actual failure', () => { throw new Error('owned failure'); });",
    );
  const invocation = invoke(root, fault === 'unknown' ? 'unknown' : 'model');
  expect(invocation.exitCode).not.toBe(0);
  expect(invocation.stdout.toString()).not.toContain('"fresh":true');
});

test('actual noncached Nx leaf targets preserve environment and run dependency builds with Caddy only in rest', () => {
  const root = fixture();
  write(root, 'package.json', JSON.stringify({ name: 'remote-ci-leaf-fixture', private: true }));
  symlinkSync(join(ROOT, 'node_modules'), join(root, 'node_modules'), 'dir');
  write(root, `${PROJECT}/test/ci-leaf.ts`, readFileSync(CLI, 'utf8'));
  const projectPath = join(root, PROJECT, 'project.json');
  const project = JSON.parse(readFileSync(projectPath, 'utf8')) as {
    implicitDependencies?: string[];
    targets: Record<string, unknown>;
  };
  const dependencyMarker = join(root, 'built.txt');
  const caddyMarker = join(root, 'caddy.txt');
  write(
    root,
    'fixture-build.ts',
    `import { appendFileSync } from 'node:fs'; appendFileSync(${JSON.stringify(dependencyMarker)}, 'built\\n');`,
  );
  write(
    root,
    'fixture-caddy.ts',
    `import { appendFileSync } from 'node:fs'; appendFileSync(${JSON.stringify(caddyMarker)}, 'caddy\\n');`,
  );
  write(
    root,
    'prerequisite/project.json',
    JSON.stringify({
      name: 'remote-fixture-build',
      targets: {
        build: {
          executor: 'nx:run-commands',
          cache: false,
          options: { command: 'bun fixture-build.ts' },
        },
      },
    }),
  );
  project.implicitDependencies = ['remote-fixture-build'];
  project.targets['test:caddy'] = {
    executor: 'nx:run-commands',
    cache: false,
    options: { command: 'bun fixture-caddy.ts' },
  };
  writeFileSync(projectPath, JSON.stringify(project));
  const head = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: root, stdout: 'pipe' })
    .stdout.toString()
    .trim();
  for (const leaf of ['model', 'rest']) {
    const child = Bun.spawnSync(
      [
        process.execPath,
        join(ROOT, 'node_modules/nx/dist/bin/nx.js'),
        'run',
        `tool-remote-scripts:test:ci:${leaf}`,
        `--head=${head}`,
        '--skip-nx-cache',
        '--parallel=2',
        '--output-style=stream',
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          NX_DAEMON: 'false',
          NX_ISOLATE_PLUGINS: 'false',
          NX_SKIP_NX_CACHE: 'true',
          CLAUDECODE: 'fixture-must-override',
          AGENT: 'fixture-must-override',
        },
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 9000,
      },
    );
    expect(child.exitCode, `${child.stdout.toString()}\n${child.stderr.toString()}`).toBe(0);
    expect(child.stdout.toString()).toContain('"fresh":true');
    if (leaf === 'model') expect(existsSync(caddyMarker)).toBe(false);
  }
  expect(readFileSync(dependencyMarker, 'utf8').trim().split('\n')).toHaveLength(2);
  expect(readFileSync(caddyMarker, 'utf8')).toBe('caddy\n');
}, 20000);

test('the leaf refuses immutable-head and discovery/environment overrides before execution', () => {
  for (const fault of [
    'head',
    'default-env',
    'default-dependency',
    'leaf-defaults',
    'target-configuration',
    'environment',
  ]) {
    const root = fixture();
    if (fault === 'default-env' || fault === 'default-dependency' || fault === 'leaf-defaults') {
      const path = join(root, 'nx.json');
      const nx = JSON.parse(readFileSync(path, 'utf8')) as {
        targetDefaults: Record<string, Record<string, unknown>>;
      };
      if (fault === 'default-env')
        nx.targetDefaults['test']['options'] = { env: { CLAUDECODE: '1', AGENT: '0' } };
      if (fault === 'default-dependency') nx.targetDefaults['test']['dependsOn'] = ['another-test'];
      if (fault === 'leaf-defaults')
        nx.targetDefaults['test:ci:*'] = { options: { env: { AGENT: '1' } } };
      writeFileSync(path, JSON.stringify(nx));
    }
    if (fault === 'target-configuration') {
      const path = join(root, PROJECT, 'project.json');
      const project = JSON.parse(readFileSync(path, 'utf8')) as {
        targets: Record<string, Record<string, unknown>>;
      };
      project.targets['test']['configurations'] = { dangerous: { command: 'bun test other' } };
      writeFileSync(path, JSON.stringify(project));
    }
    const head = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: root, stdout: 'pipe' })
      .stdout.toString()
      .trim();
    const invocation = Bun.spawnSync(
      [process.execPath, CLI, root, 'model', `--head=${fault === 'head' ? 'f'.repeat(40) : head}`],
      {
        env: { ...process.env, CLAUDECODE: fault === 'environment' ? '1' : '0', AGENT: '0' },
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 5000,
      },
    );
    expect(invocation.exitCode, fault).not.toBe(0);
    expect(executed(invocation.stdout.toString()), fault).toEqual([]);
  }
});

test('the actual child nonzero exit is preserved without a successful receipt', () => {
  const root = fixture();
  write(root, `${PROJECT}/${MODEL}`, 'process.exit(23);');
  const invocation = invoke(root, 'model');
  expect(invocation.exitCode).toBe(23);
  expect(invocation.stdout.toString()).not.toContain('"fresh":true');
});

test('the leaf refuses an unsupported Bun pin or test-selection environment', () => {
  for (const fault of ['version', 'selection']) {
    const root = fixture();
    if (fault === 'version') write(root, '.bun-version', '0.0.0\n');
    const head = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: root, stdout: 'pipe' })
      .stdout.toString()
      .trim();
    const child = Bun.spawnSync([process.execPath, CLI, root, 'model', `--head=${head}`], {
      env: {
        ...process.env,
        CLAUDECODE: '0',
        AGENT: '0',
        ...(fault === 'selection' ? { BUN_TEST_TIMEOUT: '20000' } : {}),
      },
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 5000,
    });
    expect(child.exitCode, fault).not.toBe(0);
    expect(executed(child.stdout.toString()), fault).toEqual([]);
  }
});
