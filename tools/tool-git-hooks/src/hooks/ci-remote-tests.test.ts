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
const CONTINUATION = 'src/lib/dependency-participant-continuation-model.test.ts';
const RESTORATION = 'src/lib/dependency-source-restoration.test.ts';
const POLICY = 'src/lib/dependency-participant-policy-restoration.test.ts';
const COMPLETE = 'src/lib/complete-dependency-exclusion.test.ts';
const SOURCE = [
  'src/lib/source-role-process.test.ts',
  'src/lib/source-inner-command.test.ts',
  'src/lib/source-inner-program.test.ts',
  'src/lib/source-inner-transport.test.ts',
  'src/lib/source-frontend-http.test.ts',
  'src/lib/source-frontend-profile.test.ts',
  'src/lib/source-readiness.test.ts',
];
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
    CONTINUATION,
    RESTORATION,
    POLICY,
    COMPLETE,
    `elsewhere/${COMPLETE}`,
    'src/lib/complete-dependency-exclusion-extra.test.ts',
    `elsewhere/${POLICY}`,
    'src/lib/dependency-participant-policy-restoration-extra.test.ts',
    `elsewhere/${RESTORATION}`,
    'src/lib/dependency-source-restoration-extra.test.ts',
    ...explicit,
    ...SOURCE,
    'src/new.test.ts',
    'src/lib/source-role-process-extra.test.ts',
    `elsewhere/${SOURCE[0]}`,
    'src/lib/dependency-product-process-model-extra.test.ts',
    'src/lib/dependency-participant-continuation-model-extra.test.ts',
    `elsewhere/${CONTINUATION}`,
    'elsewhere/src-shadow/new.test.ts',
    `elsewhere/${MODEL}`,
  ])
    write(
      root,
      `${PROJECT}/${path}`,
      `import { test, expect } from 'bun:test';
       for (let index = 0; index < ${String(path === RESTORATION ? 23 : path === POLICY ? 8 : path === COMPLETE ? 39 : 1)}; index++) test(${JSON.stringify(path)} + index, () => {
         if (index === 0) console.log('EXECUTED=' + ${JSON.stringify(path)});
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

function invoke(root: string, leaf: string, preload?: string) {
  const head = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: root, stdout: 'pipe' })
    .stdout.toString()
    .trim();
  return Bun.spawnSync(
    [
      process.execPath,
      ...(preload === undefined ? [] : ['--preload', preload]),
      CLI,
      root,
      leaf,
      `--head=${head}`,
    ],
    {
      env: { ...process.env, FORCE_COLOR: '0', CLAUDECODE: '0', AGENT: '0' },
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 5000,
    },
  );
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
  const continuation = invoke(root, 'model-continuation');
  expect(continuation.exitCode, continuation.stderr.toString()).toBe(0);
  const moved = executed(continuation.stdout.toString());
  expect(moved).toEqual([CONTINUATION]);
  const source = invoke(root, 'source');
  expect(source.exitCode, source.stderr.toString()).toBe(0);
  const sourceCases = executed(source.stdout.toString());
  expect(sourceCases).toEqual([...SOURCE].sort());
  const restoration = invoke(root, 'source-restoration');
  expect(restoration.exitCode, restoration.stderr.toString()).toBe(0);
  const restorationCases = executed(restoration.stdout.toString());
  expect(restorationCases).toEqual([RESTORATION]);
  const policy = invoke(root, 'participant-policy');
  expect(policy.exitCode, policy.stderr.toString()).toBe(0);
  const policyCases = executed(policy.stdout.toString());
  expect(policyCases).toEqual([POLICY]);
  const complete = invoke(root, 'complete-activation');
  expect(complete.exitCode, complete.stderr.toString()).toBe(0);
  const completeCases = executed(complete.stdout.toString());
  expect(completeCases).toEqual([COMPLETE]);
  const rest = invoke(root, 'rest');
  expect(model.exitCode, model.stderr.toString()).toBe(0);
  expect(rest.exitCode, rest.stderr.toString()).toBe(0);
  const singleton = executed(model.stdout.toString());
  const complement = executed(rest.stdout.toString());
  expect(singleton).toEqual([MODEL]);
  expect(complement).toContain('src/new.test.ts');
  expect(complement).toContain('src/lib/source-role-process-extra.test.ts');
  expect(complement).toContain(`elsewhere/${SOURCE[0]}`);
  expect(complement).toContain('elsewhere/src-shadow/new.test.ts');
  expect(complement).toContain(`elsewhere/${MODEL}`);
  expect(complement).toContain('src/lib/dependency-product-process-model-extra.test.ts');
  expect(complement).not.toContain(MODEL);
  expect(complement).not.toContain(CONTINUATION);
  expect(complement).not.toContain(RESTORATION);
  expect(complement).not.toContain(POLICY);
  expect(complement).not.toContain(COMPLETE);
  expect(complement).toContain(`elsewhere/${COMPLETE}`);
  expect(complement).toContain('src/lib/complete-dependency-exclusion-extra.test.ts');
  expect(complement).toContain(`elsewhere/${POLICY}`);
  expect(complement).toContain('src/lib/dependency-participant-policy-restoration-extra.test.ts');
  expect(complement).toContain(`elsewhere/${RESTORATION}`);
  expect(complement).toContain('src/lib/dependency-source-restoration-extra.test.ts');
  expect(complement).toContain(`elsewhere/${CONTINUATION}`);
  expect(complement).toContain('src/lib/dependency-participant-continuation-model-extra.test.ts');
  expect(
    [
      ...singleton,
      ...moved,
      ...sourceCases,
      ...restorationCases,
      ...policyCases,
      ...completeCases,
      ...complement,
    ].sort(),
  ).toEqual(executed(canonical.stdout.toString()));
  expect(
    new Set([
      ...singleton,
      ...moved,
      ...sourceCases,
      ...restorationCases,
      ...policyCases,
      ...completeCases,
      ...complement,
    ]).size,
  ).toBe(
    singleton.length +
      moved.length +
      sourceCases.length +
      restorationCases.length +
      policyCases.length +
      completeCases.length +
      complement.length,
  );
  expect(model.stdout.toString()).toContain('"fresh":true');
  expect(rest.stdout.toString()).toContain('"fresh":true');
});

test.each(['model', 'model-continuation', 'rest'])(
  'each leaf refuses absent, renamed, unreadable or aliased model and missing explicit tests: %s',
  (leaf) => {
    for (const owner of [MODEL, CONTINUATION])
      for (const fault of [
        'absent',
        'renamed',
        'unreadable',
        'alias',
        'parent-alias',
        'explicit',
      ]) {
        const root = fixture();
        const model = join(root, PROJECT, owner);
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

test('runtime refuses an absent selected raw target before actual Nx canonical fallback', () => {
  const root = fixture();
  write(
    root,
    'package.json',
    JSON.stringify({ name: 'remote-target-admission-fixture', private: true }),
  );
  symlinkSync(join(ROOT, 'node_modules'), join(root, 'node_modules'), 'dir');
  for (const name of ['wbs-be-01', 'wbs-fe-01'])
    write(root, `modules/${name}/project.json`, JSON.stringify({ name, targets: {} }));
  const marker = join(root, 'canonical-test-started');
  write(
    root,
    `${PROJECT}/test/canonical.test.ts`,
    `import { writeFileSync } from 'node:fs'; import { test } from 'bun:test';
     test('canonical fallback child', () => writeFileSync(${JSON.stringify(marker)}, 'started\\n'));`,
  );
  const path = join(root, PROJECT, 'project.json');
  const project = JSON.parse(readFileSync(path, 'utf8')) as {
    targets: Record<string, unknown>;
  };
  project.targets['test'] = {
    executor: 'nx:run-commands',
    inputs: ['default', '^production'],
    options: { command: 'bun test ./test/canonical.test.ts --timeout=10000', cwd: PROJECT },
  };
  delete project.targets['test:ci:complete-activation'];
  writeFileSync(path, JSON.stringify(project));
  const head = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: root, stdout: 'pipe' })
    .stdout.toString()
    .trim();
  const invocation = Bun.spawnSync(
    [
      process.execPath,
      join(ROOT, 'tools/tool-git-hooks/src/hooks/ci-run-runtime.ts'),
      'remote-complete-activation',
      '',
      head,
      root,
      'full',
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        NX_DAEMON: 'false',
        NX_ISOLATE_PLUGINS: 'false',
        CLAUDECODE: '0',
        AGENT: '0',
      },
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 9000,
    },
  );
  if (existsSync(marker))
    console.error(
      `CANONICAL_FALLBACK_CHILD_STARTED\n${invocation.stdout.toString()}\n${invocation.stderr.toString()}`,
    );
  expect(
    existsSync(marker),
    'missing selected target must refuse before canonical test child',
  ).toBe(false);
  expect(invocation.exitCode, invocation.stderr.toString()).not.toBe(0);
  expect(invocation.stderr.toString()).toContain('Unsupported selected remote leaf target');
}, 10000);

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
  for (const leaf of [
    'model',
    'model-continuation',
    'source-restoration',
    'participant-policy',
    'complete-activation',
    'rest',
  ]) {
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
    if (leaf !== 'rest') expect(existsSync(caddyMarker)).toBe(false);
  }
  expect(readFileSync(dependencyMarker, 'utf8').trim().split('\n')).toHaveLength(6);
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

test.each(['empty', 'failed'])('continuation refuses invalid actual child: %s', (fault) => {
  const root = fixture();
  write(
    root,
    `${PROJECT}/${CONTINUATION}`,
    fault === 'empty' ? 'export const empty = true;' : 'process.exit(23);',
  );
  const invocation = invoke(root, 'model-continuation');
  expect(invocation.exitCode).toBe(fault === 'empty' ? 1 : 23);
  expect(invocation.stdout.toString()).not.toContain('"fresh":true');
});

test.each(['absent', 'environment', 'inputs'])(
  'every leaf validates the continuation target before discovery: %s',
  (fault) => {
    const root = fixture();
    const path = join(root, PROJECT, 'project.json');
    const project = JSON.parse(readFileSync(path, 'utf8')) as {
      targets: Record<string, Record<string, unknown>>;
    };
    if (fault === 'absent') delete project.targets['test:ci:model-continuation'];
    if (fault === 'inputs') project.targets['test:ci:model-continuation']['inputs'] = ['default'];
    if (fault === 'environment') project.targets['test:ci:model-continuation']['options'] = {};
    writeFileSync(path, JSON.stringify(project));
    for (const leaf of ['model', 'model-continuation', 'rest']) {
      const invocation = invoke(root, leaf);
      expect(invocation.exitCode).not.toBe(0);
      expect(executed(invocation.stdout.toString())).toEqual([]);
    }
  },
);

test.each(['missing', 'unreadable', 'alias'] as const)(
  'source owners refuse invalid parents before actual child selection: %s',
  (fault) => {
    for (const owner of SOURCE) {
      const root = fixture();
      const path = join(root, PROJECT, owner);
      if (fault === 'missing') rmSync(path);
      if (fault === 'unreadable') chmodSync(path, 0);
      if (fault === 'alias') {
        renameSync(path, `${path}.owned`);
        symlinkSync(`${path}.owned`, path);
      }
      for (const leaf of ['source', 'rest']) {
        const refused = invoke(root, leaf);
        expect(refused.exitCode, `${owner} ${fault} ${leaf}`).not.toBe(0);
        expect(executed(refused.stdout.toString())).toEqual([]);
      }
    }
  },
  20000,
);

test.each(['absent', 'inputs', 'environment'])(
  'all leaves refuse a malformed source target before actual children: %s',
  (fault) => {
    const root = fixture();
    const path = join(root, PROJECT, 'project.json');
    const project = JSON.parse(readFileSync(path, 'utf8')) as {
      targets: Record<string, { inputs?: string[]; options?: Record<string, unknown> }>;
    };
    if (fault === 'absent') delete project.targets['test:ci:source'];
    if (fault === 'inputs') project.targets['test:ci:source'].inputs = ['default'];
    if (fault === 'environment') project.targets['test:ci:source'].options = {};
    writeFileSync(path, JSON.stringify(project));
    for (const leaf of ['model', 'model-continuation', 'source', 'rest']) {
      const refused = invoke(root, leaf);
      expect(refused.exitCode).not.toBe(0);
      expect(executed(refused.stdout.toString())).toEqual([]);
    }
  },
);

test('source summary receipt mismatch refuses after actual seven-parent child execution', () => {
  const root = fixture();
  const preload = join(root, 'source-summary-view.ts');
  writeFileSync(
    preload,
    `
    const spawn = Bun.spawn;
    Bun.spawn = (...args) => {
      const child = spawn(...args);
      const stderr = new ReadableStream({
        async start(controller) {
          try {
            const text = await new Response(child.stderr).text();
            const matches = [...text.matchAll(/Ran (\\d+) tests across 7 files\\./g)];
            if (matches.length !== 1) throw new Error('source summary view expected exactly one seven-file receipt');
            process.stderr.write('source summary count transform observed exactly once\\n');
            controller.enqueue(new TextEncoder().encode(text.replace(matches[0][0],
              matches[0][0].replace('7 files', '6 files'))));
            controller.close();
          } catch (cause) { controller.error(cause); }
        }
      });
      return new Proxy(child, {
        get(target, property) {
          if (property === 'stderr') return stderr;
          const value = Reflect.get(target, property, target);
          return typeof value === 'function' ? value.bind(target) : value;
        }
      });
    };
  `,
  );
  const refused = invoke(root, 'source', preload);
  expect(executed(refused.stdout.toString())).toEqual([...SOURCE].sort());
  expect(refused.stderr.toString()).toContain(
    'source summary count transform observed exactly once',
  );
  expect(refused.exitCode, refused.stderr.toString()).toBe(1);
  expect(refused.stderr.toString()).toContain(
    'Remote leaf produced no successful nonempty execution receipt',
  );
});

test('source fresh summary consumes coherent final outer evidence after real nested Bun joins', () => {
  const root = fixture();
  const nested = join(root, 'nested-source-child.test.ts');
  writeFileSync(
    nested,
    `import { test, expect } from 'bun:test'; test('nested source child', () => expect(true).toBe(true));`,
  );
  writeFileSync(
    join(root, PROJECT, SOURCE[0]),
    `
    import { test, expect } from 'bun:test';
    test(${JSON.stringify(SOURCE[0])}, () => {
      const child = Bun.spawnSync([process.execPath, 'test', ${JSON.stringify(nested)}, '--timeout=10000'], {
        stdout: 'pipe', stderr: 'pipe', timeout: 5000
      });
      process.stderr.write(child.stderr);
      expect(child.exitCode).toBe(0);
      expect(child.signalCode).toBeUndefined();
      console.error('NESTED_SOURCE_CHILD_JOINED');
      console.log('EXECUTED=' + ${JSON.stringify(SOURCE[0])});
    });
  `,
  );
  const source = invoke(root, 'source');
  expect(source.stderr.toString()).toContain('NESTED_SOURCE_CHILD_JOINED');
  expect(source.exitCode, source.stderr.toString()).toBe(0);
  expect(executed(source.stdout.toString())).toEqual([...SOURCE].sort());
  expect(source.stdout.toString()).toContain('"files":7');
});

test('remainder rejects a malformed terminal outer summary after a real nested child joins', () => {
  const root = fixture();
  const nested = join(root, 'nested-remainder-child.test.ts');
  writeFileSync(
    nested,
    `import { test, expect } from 'bun:test'; test('nested remainder child', () => expect(true).toBe(true));`,
  );
  writeFileSync(
    join(root, PROJECT, 'src/new.test.ts'),
    `
    import { test, expect } from 'bun:test';
    test('src/new.test.ts', () => {
      const child = Bun.spawnSync([process.execPath, 'test', ${JSON.stringify(nested)}, '--timeout=10000'], {
        stdout: 'pipe', stderr: 'pipe', timeout: 5000
      });
      process.stderr.write(child.stderr);
      expect(child.exitCode).toBe(0);
      expect(child.signalCode).toBeUndefined();
      console.error('NESTED_REMAINDER_CHILD_JOINED');
      console.log('EXECUTED=src/new.test.ts');
    });
  `,
  );
  const preload = join(root, 'terminal-summary-view.ts');
  writeFileSync(
    preload,
    "\nconst spawn = Bun.spawn;\nBun.spawn = (...args) => {\n  const child = spawn(...args);\n  const stderr = new ReadableStream({async start(controller) {\n    try {\n      const text = await new Response(child.stderr).text();\n      const summaries = [...text.matchAll(/Ran (\\d+) tests? across (\\d+) files?\\.[^\\r\\n]*/g)];\n      if (summaries.length !== 2 || summaries[0][2] !== '1' || Number(summaries[1][2]) <= 1)\n        throw new Error('expected one joined nested and one outer receipt');\n      const final = summaries[1][0];\n      if (text.split(final).length !== 2) throw new Error('outer receipt not unique');\n      process.stderr.write('TERMINAL_OUTER_SUMMARY_CORRUPTED_ONCE\\n');\n      controller.enqueue(new TextEncoder().encode(text.replace(final, final.replace('Ran ', 'UNSUPPORTED '))));\n      controller.close();\n    } catch (cause) {controller.error(cause);}\n  }});\n  return new Proxy(child, {get(target, property) {\n    if (property === 'stderr') return stderr;\n    const value = Reflect.get(target, property, target);\n    return typeof value === 'function' ? value.bind(target) : value;\n  }});\n};\n",
  );
  const refused = invoke(root, 'rest', preload);
  expect(executed(refused.stdout.toString())).toContain('src/new.test.ts');
  expect(refused.stderr.toString()).toContain('NESTED_REMAINDER_CHILD_JOINED');
  expect(refused.stderr.toString()).toContain('TERMINAL_OUTER_SUMMARY_CORRUPTED_ONCE');
  expect(refused.exitCode, refused.stderr.toString()).toBe(1);
  expect(refused.stderr.toString()).toContain(
    'Remote leaf produced no successful nonempty execution receipt',
  );
});

function recordChildStarts(root: string) {
  const marker = join(root, 'restoration-test-child-started');
  const preload = join(root, 'record-restoration-child.ts');
  writeFileSync(
    preload,
    `
    import { appendFileSync } from 'node:fs';
    const spawn = Bun.spawn;
    Bun.spawn = (...args) => {
      appendFileSync(${JSON.stringify(marker)}, 'child\\n');
      return spawn(...args);
    };
  `,
  );
  return { marker, preload };
}

test.each(['missing', 'unreadable', 'alias'] as const)(
  'restoration owner refuses invalid parent before actual child selection: %s',
  (fault) => {
    const root = fixture();
    const path = join(root, PROJECT, RESTORATION);
    if (fault === 'missing') rmSync(path);
    if (fault === 'unreadable') chmodSync(path, 0);
    if (fault === 'alias') {
      renameSync(path, `${path}.owned`);
      symlinkSync(`${path}.owned`, path);
    }
    const starts = recordChildStarts(root);
    for (const leaf of ['source-restoration', 'rest']) {
      const refused = invoke(root, leaf, starts.preload);
      if (existsSync(starts.marker))
        console.error(
          `RESTORATION_PARENT_CHILD: ${JSON.stringify({ leaf, executed: executed(refused.stdout.toString()) })}`,
        );
      expect(refused.exitCode, fault).not.toBe(0);
      expect(executed(refused.stdout.toString())).toEqual([]);
      expect(existsSync(starts.marker), 'no test child before required-parent validation').toBe(
        false,
      );
    }
    if (fault === 'unreadable') chmodSync(path, 0o644);
  },
);

test.each(['absent', 'inputs', 'environment'])(
  'all leaves refuse malformed restoration target before actual children: %s',
  (fault) => {
    const root = fixture();
    const path = join(root, PROJECT, 'project.json');
    const project = JSON.parse(readFileSync(path, 'utf8')) as {
      targets: Record<string, { inputs?: string[]; options?: Record<string, unknown> }>;
    };
    if (fault === 'absent') delete project.targets['test:ci:source-restoration'];
    if (fault === 'inputs') project.targets['test:ci:source-restoration'].inputs = ['default'];
    if (fault === 'environment') project.targets['test:ci:source-restoration'].options = {};
    writeFileSync(path, JSON.stringify(project));
    const starts = recordChildStarts(root);
    for (const leaf of ['model', 'model-continuation', 'source', 'source-restoration', 'rest']) {
      const refused = invoke(root, leaf, starts.preload);
      if (existsSync(starts.marker))
        console.error(
          `RESTORATION_TARGET_CHILD: ${JSON.stringify({ leaf, executed: executed(refused.stdout.toString()) })}`,
        );
      expect(refused.exitCode).not.toBe(0);
      expect(executed(refused.stdout.toString())).toEqual([]);
      expect(existsSync(starts.marker), 'no test child before required-target validation').toBe(
        false,
      );
    }
  },
);

test.each(['missing', 'unreadable', 'alias'] as const)(
  'policy owner refuses invalid parent before actual child selection: %s',
  (fault) => {
    const root = fixture();
    const path = join(root, PROJECT, POLICY);
    if (fault === 'missing') rmSync(path);
    if (fault === 'unreadable') chmodSync(path, 0);
    if (fault === 'alias') {
      renameSync(path, `${path}.owned`);
      symlinkSync(`${path}.owned`, path);
    }
    const starts = recordChildStarts(root);
    for (const leaf of ['participant-policy', 'rest']) {
      const refused = invoke(root, leaf, starts.preload);
      if (existsSync(starts.marker))
        console.error(
          `RESTORATION_PARENT_CHILD: ${JSON.stringify({ leaf, executed: executed(refused.stdout.toString()) })}`,
        );
      expect(refused.exitCode, fault).not.toBe(0);
      expect(executed(refused.stdout.toString())).toEqual([]);
      expect(existsSync(starts.marker), 'no test child before required-parent validation').toBe(
        false,
      );
    }
    if (fault === 'unreadable') chmodSync(path, 0o644);
  },
);

test.each(['absent', 'inputs', 'environment'])(
  'all leaves refuse malformed policy target before actual children: %s',
  (fault) => {
    const root = fixture();
    const path = join(root, PROJECT, 'project.json');
    const project = JSON.parse(readFileSync(path, 'utf8')) as {
      targets: Record<string, { inputs?: string[]; options?: Record<string, unknown> }>;
    };
    if (fault === 'absent') delete project.targets['test:ci:participant-policy'];
    if (fault === 'inputs') project.targets['test:ci:participant-policy'].inputs = ['default'];
    if (fault === 'environment') project.targets['test:ci:participant-policy'].options = {};
    writeFileSync(path, JSON.stringify(project));
    const starts = recordChildStarts(root);
    for (const leaf of [
      'model',
      'model-continuation',
      'source',
      'source-restoration',
      'participant-policy',
      'complete-activation',
      'rest',
    ]) {
      const refused = invoke(root, leaf, starts.preload);
      if (existsSync(starts.marker))
        console.error(
          `RESTORATION_TARGET_CHILD: ${JSON.stringify({ leaf, executed: executed(refused.stdout.toString()) })}`,
        );
      expect(refused.exitCode).not.toBe(0);
      expect(executed(refused.stdout.toString())).toEqual([]);
      expect(existsSync(starts.marker), 'no test child before required-target validation').toBe(
        false,
      );
    }
  },
);

test.each(['missing', 'unreadable', 'alias'] as const)(
  'complete-activation owner refuses invalid parent before actual child selection: %s',
  (fault) => {
    const root = fixture();
    const path = join(root, PROJECT, COMPLETE);
    if (fault === 'missing') rmSync(path);
    if (fault === 'unreadable') chmodSync(path, 0);
    if (fault === 'alias') {
      renameSync(path, `${path}.owned`);
      symlinkSync(`${path}.owned`, path);
    }
    const starts = recordChildStarts(root);
    for (const leaf of ['complete-activation', 'rest']) {
      const refused = invoke(root, leaf, starts.preload);
      if (existsSync(starts.marker))
        console.error(
          `RESTORATION_PARENT_CHILD: ${JSON.stringify({ leaf, executed: executed(refused.stdout.toString()) })}`,
        );
      expect(refused.exitCode, fault).not.toBe(0);
      expect(executed(refused.stdout.toString())).toEqual([]);
      expect(existsSync(starts.marker), 'no test child before required-parent validation').toBe(
        false,
      );
    }
    if (fault === 'unreadable') chmodSync(path, 0o644);
  },
);

test.each(['absent', 'inputs', 'environment'])(
  'all leaves refuse malformed complete-activation target before actual children: %s',
  (fault) => {
    const root = fixture();
    const path = join(root, PROJECT, 'project.json');
    const project = JSON.parse(readFileSync(path, 'utf8')) as {
      targets: Record<string, { inputs?: string[]; options?: Record<string, unknown> }>;
    };
    if (fault === 'absent') delete project.targets['test:ci:complete-activation'];
    if (fault === 'inputs') project.targets['test:ci:complete-activation'].inputs = ['default'];
    if (fault === 'environment') project.targets['test:ci:complete-activation'].options = {};
    writeFileSync(path, JSON.stringify(project));
    const starts = recordChildStarts(root);
    for (const leaf of [
      'model',
      'model-continuation',
      'source',
      'source-restoration',
      'participant-policy',
      'complete-activation',
      'rest',
    ]) {
      const refused = invoke(root, leaf, starts.preload);
      if (existsSync(starts.marker))
        console.error(
          `RESTORATION_TARGET_CHILD: ${JSON.stringify({ leaf, executed: executed(refused.stdout.toString()) })}`,
        );
      expect(refused.exitCode).not.toBe(0);
      expect(executed(refused.stdout.toString())).toEqual([]);
      expect(existsSync(starts.marker), 'no test child before required-target validation').toBe(
        false,
      );
    }
  },
);

test.each([
  ['source-restoration', RESTORATION, 23],
  ['participant-policy', POLICY, 8],
  ['complete-activation', COMPLETE, 39],
] as const)(
  'complete %s outer receipts reject successful but incomplete execution',
  (leaf, owner, count) => {
    for (const fault of ['passes', 'tests', 'files', 'skip', 'todo', 'filtered', 'malformed']) {
      const root = fixture();
      if (leaf === 'complete-activation') {
        const nested = join(root, 'nested-complete-child.test.ts');
        writeFileSync(
          nested,
          `import { test } from 'bun:test'; for (let index = 0; index < 39; index++) test('nested-' + index, () => {});`,
        );
        writeFileSync(
          join(root, PROJECT, owner),
          `
          import { test, expect } from 'bun:test';
          for (let index = 0; index < 39; index++) test('outer-' + index, () => {
            if (index !== 0) return;
            const child = Bun.spawnSync([process.execPath, 'test', ${JSON.stringify(nested)}, '--timeout=10000'], {
              stdout: 'pipe', stderr: 'pipe', timeout: 5000
            });
            process.stdout.write(child.stdout);
            process.stderr.write(child.stderr);
            expect(child.exitCode).toBe(0);
            expect(child.signalCode).toBeUndefined();
            console.log('EXECUTED=' + ${JSON.stringify(owner)});
            console.error('NESTED_COMPLETE_CHILD_JOINED');
          });
          `,
        );
      }
      const preload = join(root, 'outer-receipt-view.ts');
      writeFileSync(
        preload,
        `
      const spawn = Bun.spawn;
      Bun.spawn = (...args) => {
        const child = spawn(...args);
        const stderr = new ReadableStream({async start(controller) {
          try {
            const text = await new Response(child.stderr).text();
            const status = await child.exited;
            if (status !== 0) throw new Error('receipt view requires successful original child');
            const summary = /(?:^|\\n)[ \\t]*${String(count)} pass\\r?\\n[ \\t]*0 fail\\r?\\n(?:[ \\t]*\\d+ expect\\(\\) calls\\r?\\n)?Ran ${String(count)} tests across 1 file\\.[^\\r\\n]*\\s*$/.exec(text);
            if (summary === null) throw new Error('receipt view expected complete original outer execution');
            const fault = ${JSON.stringify(fault)};
            const original = summary[0];
            const changed = fault === 'passes' ? original.replace('${String(count)} pass', '${String(count - 1)} pass')
              : fault === 'tests' ? original.replace('Ran ${String(count)} tests', 'Ran ${String(count - 1)} tests')
              : fault === 'files' ? original.replace('across 1 file.', 'across 2 files.')
              : fault === 'malformed' ? original.replace('Ran ', 'UNSUPPORTED ')
              : original.replace('0 fail', '1 ' + (fault === 'filtered' ? 'filtered out' : fault) + '\\n 0 fail');
            process.stderr.write('SUCCESSFUL_ORIGINAL_OUTER_TRANSFORMED_ONCE\\n');
            controller.enqueue(new TextEncoder().encode(text.slice(0, summary.index) + changed));
            controller.close();
          } catch (cause) { controller.error(cause); }
        }});
        return new Proxy(child, {get(target, property) {
          if (property === 'stderr') return stderr;
          const value = Reflect.get(target, property, target);
          return typeof value === 'function' ? value.bind(target) : value;
        }});
      };
    `,
      );
      const refused = invoke(root, leaf, preload);
      expect(executed(refused.stdout.toString()), fault).toEqual([owner]);
      if (leaf === 'complete-activation')
        expect(refused.stderr.toString(), fault).toContain('NESTED_COMPLETE_CHILD_JOINED');
      expect(refused.stderr.toString(), fault).toContain(
        'SUCCESSFUL_ORIGINAL_OUTER_TRANSFORMED_ONCE',
      );
      expect(refused.exitCode, fault).toBe(1);
      expect(refused.stderr.toString(), fault).toContain(
        'Remote leaf produced no successful nonempty execution receipt',
      );
      expect(refused.stdout.toString(), fault).not.toContain('"fresh":true');
    }
  },
);

test.each([
  ['source-restoration', RESTORATION, 23],
  ['participant-policy', POLICY, 8],
  ['complete-activation', COMPLETE, 39],
] as const)(
  'complete %s outer receipt permits expected nested child filtering',
  (leaf, owner, count) => {
    const root = fixture();
    const nested = join(root, 'nested-restoration-child.test.ts');
    writeFileSync(
      nested,
      `import { test } from 'bun:test'; for (let index = 0; index < 31; index++) test('child-' + index, () => {});`,
    );
    writeFileSync(
      join(root, PROJECT, owner),
      `
    import { test, expect } from 'bun:test';
    for (let index = 0; index < ${String(count)}; index++) test('outer-' + index, () => {
      if (index !== 0) return;
      const child = Bun.spawnSync([process.execPath, 'test', ${JSON.stringify(nested)}, '--test-name-pattern=^child-0$'], {stdout: 'pipe', stderr: 'pipe', timeout: 5000});
      process.stdout.write(child.stdout);
      process.stderr.write(child.stderr);
      expect(child.exitCode).toBe(0);
      expect(child.signalCode).toBeUndefined();
      expect(child.stderr.toString()).toContain('30 filtered out');
      console.log('EXECUTED=' + ${JSON.stringify(owner)});
      console.error('FILTERED_NESTED_CHILD_JOINED');
    });
  `,
    );
    const invocation = invoke(root, leaf);
    expect(invocation.exitCode, invocation.stderr.toString()).toBe(0);
    expect(invocation.stderr.toString()).toContain('FILTERED_NESTED_CHILD_JOINED');
    expect(invocation.stdout.toString()).toContain('"tests":' + String(count));
    expect(invocation.stdout.toString()).toContain('"files":1');
  },
);
