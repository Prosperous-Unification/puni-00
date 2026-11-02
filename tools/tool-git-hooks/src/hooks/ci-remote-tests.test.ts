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
  const root = graphRoutingFixture();
  write(root, `${PROJECT}/test/ci-leaf.ts`, readFileSync(CLI, 'utf8'));
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
      join(root, PROJECT, 'test/ci-leaf.ts'),
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
  const canonical = invokeGraphRouting(root, ['canonical']);
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
  expectFullGraphRouting(canonical.stdout.toString());
  expectFullGraphRouting(rest.stdout.toString());
  const singleton = executed(model.stdout.toString());
  const complement = executed(rest.stdout.toString());
  expect(singleton).toEqual([MODEL]);
  expect(complement).toContain('src/new.test.ts');
  expect(complement).toContain('src/lib/initial-handoff-graph-extra.test.ts');
  expect(complement).toContain('elsewhere/src/lib/initial-handoff-graph.test.ts');
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
      'test/run-tests.ts',
      'test/run-other.ts',
    );
  if (fault === 'cwd') canonical.options.cwd = '.';
  if (fault === 'preload') canonical.options.command += ' --preload ../other.ts';
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
    'foreign-root',
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
    const moduleRoot = fault === 'foreign-root' ? fixture() : root;
    const invocation = Bun.spawnSync(
      [
        process.execPath,
        join(moduleRoot, PROJECT, 'test/ci-leaf.ts'),
        root,
        'model',
        `--head=${fault === 'head' ? 'f'.repeat(40) : head}`,
      ],
      {
        env: { ...process.env, CLAUDECODE: fault === 'environment' ? '1' : '0', AGENT: '0' },
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 5000,
      },
    );
    if (fault === 'foreign-root')
      expect(invocation.stderr.toString()).toContain('Remote leaf module/root binding differs');
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
    const child = Bun.spawnSync(
      [process.execPath, join(root, PROJECT, 'test/ci-leaf.ts'), root, 'model', `--head=${head}`],
      {
        env: {
          ...process.env,
          CLAUDECODE: '0',
          AGENT: '0',
          ...(fault === 'selection' ? { BUN_TEST_TIMEOUT: '20000' } : {}),
        },
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 5000,
      },
    );
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
    "\nconst spawn = Bun.spawn;\nBun.spawn = (...args) => {\n  const child = spawn(...args);\n  if (!Array.isArray(args[0]) || args[0][1] !== 'test' || args[0][2] !== 'src') return child;\n  const stderr = new ReadableStream({async start(controller) {\n    try {\n      const text = await new Response(child.stderr).text();\n      const summaries = [...text.matchAll(/Ran (\\d+) tests? across (\\d+) files?\\.[^\\r\\n]*/g)];\n      if (summaries.length !== 2 || summaries[0][2] !== '1' || Number(summaries[1][2]) <= 1)\n        throw new Error('expected one joined nested and one outer receipt');\n      const final = summaries[1][0];\n      if (text.split(final).length !== 2) throw new Error('outer receipt not unique');\n      process.stderr.write('TERMINAL_OUTER_SUMMARY_CORRUPTED_ONCE\\n');\n      controller.enqueue(new TextEncoder().encode(text.replace(final, final.replace('Ran ', 'UNSUPPORTED '))));\n      controller.close();\n    } catch (cause) {controller.error(cause);}\n  }});\n  return new Proxy(child, {get(target, property) {\n    if (property === 'stderr') return stderr;\n    const value = Reflect.get(target, property, target);\n    return typeof value === 'function' ? value.bind(target) : value;\n  }});\n};\n",
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

interface GraphLauncherBoundary {
  readonly repository: string;
  readonly modulePath: string;
  readonly executable: string;
  readonly requiredExecutable: string;
  readonly declaredCount: number;
  readonly declaredTitlesSHA256: string;
}
interface GraphLauncherAdmission {
  readRemoteTestCommand(
    arguments_: readonly string[],
    environment: Readonly<Record<string, string | undefined>>,
  ): string;
  readGraphTestAdmission(
    environment: Readonly<Record<string, string | undefined>>,
    boundary: GraphLauncherBoundary,
  ): string;
}

/** Imports only the test command owner's pure boundary; never imports Graph or starts a child. */
async function graphLauncherAdmission(): Promise<GraphLauncherAdmission> {
  const candidate: unknown = await import(join(ROOT, PROJECT, 'test/run-tests.ts'));
  if (
    typeof candidate !== 'object' ||
    candidate === null ||
    !('readRemoteTestCommand' in candidate) ||
    typeof candidate.readRemoteTestCommand !== 'function' ||
    !('readGraphTestAdmission' in candidate) ||
    typeof candidate.readGraphTestAdmission !== 'function'
  )
    throw new Error('Reviewed typed launcher scaffold is required before this RED invocation');
  // Boundary: both actual module exports were checked callable; this test-local shape declares their input contract.
  return candidate as GraphLauncherAdmission;
}

/** Records actual boundary refusal so an unimplemented behavior fails an owning assertion, not module loading. */
function observeGraphAdmission<T>(
  operation: () => T,
):
  | { readonly status: 'returned'; readonly value: T }
  | { readonly status: 'refused'; readonly message: string } {
  try {
    return { status: 'returned', value: operation() };
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    return { status: 'refused', message: cause.message };
  }
}

const graphAdmissionBoundary: GraphLauncherBoundary = {
  repository: '/review/repository',
  modulePath: '/review/repository/tools/tool-remote-scripts/src/lib/initial-handoff-graph.test.ts',
  executable: '/review/tools/bun',
  requiredExecutable: '/review/tools/bun',
  declaredCount: 228,
  declaredTitlesSHA256: '9676491473de150ee073672db57973de44ec6707f2e1a5f5f5f5b75384e4bd2a',
};
const graphAdmissionEnvelope = {
  PUNI_REMOTE_GRAPH_ADMISSION: 'partitioned-228-v1',
  PUNI_REMOTE_GRAPH_MODE: 'graph-identity',
  PUNI_REMOTE_GRAPH_ROOT: '/review/repository',
  PUNI_REMOTE_GRAPH_EXECUTABLE: '/review/tools/bun',
};

test('graph launcher admission parses only the five public commands', async () => {
  const launcher = await graphLauncherAdmission();
  for (const command of ['canonical', 'graph', 'graph-ordinary', 'graph-legacy', 'graph-identity'])
    expect(observeGraphAdmission(() => launcher.readRemoteTestCommand([command], {}))).toEqual({
      status: 'returned',
      value: command,
    });
});

test('graph launcher admission refuses missing unknown and forwarded selection arguments', async () => {
  const launcher = await graphLauncherAdmission();
  for (const arguments_ of [
    [],
    ['rest'],
    ['unknown'],
    ['graph', 'graph-identity'],
    ['graph', '--test-name-pattern', 'one'],
    ['graph', '--timeout=1'],
    ['graph', '--preload', 'foreign.ts'],
    ['graph', '--path-ignore-patterns=src'],
    ['graph', 'tools/tool-remote-scripts/src/lib/initial-handoff-graph.test.ts'],
  ])
    expect(() => launcher.readRemoteTestCommand(arguments_, {})).toThrow(
      'Unsupported remote graph command',
    );
});

test('graph launcher admission refuses ambient Bun selection controls', async () => {
  const launcher = await graphLauncherAdmission();
  for (const environment of [
    { BUN_OPTIONS: '--preload foreign.ts' },
    { BUN_TEST_TIMEOUT: '1' },
    { BUN_TEST_NAME_PATTERN: 'one' },
    { NODE_OPTIONS: '--require foreign.js' },
    { PUNI_UC1_PREFLIGHT: 'focused-identity-15-v1' },
    { PUNI_REMOTE_GRAPH_MODE: 'graph-identity' },
  ])
    expect(() => launcher.readRemoteTestCommand(['graph'], environment)).toThrow(
      'Unsupported remote graph selection environment',
    );
});

test('graph launcher admission selects each explicit graph partition', async () => {
  const launcher = await graphLauncherAdmission();
  for (const mode of ['graph-ordinary', 'graph-legacy', 'graph-identity'])
    expect(
      observeGraphAdmission(() =>
        launcher.readGraphTestAdmission(
          { ...graphAdmissionEnvelope, PUNI_REMOTE_GRAPH_MODE: mode },
          graphAdmissionBoundary,
        ),
      ),
    ).toEqual({ status: 'returned', value: mode });
});

test('graph launcher admission refuses absent incomplete or unknown envelopes', async () => {
  const launcher = await graphLauncherAdmission();
  for (const environment of [
    {},
    { PUNI_REMOTE_GRAPH_ADMISSION: 'partitioned-228-v1' },
    { ...graphAdmissionEnvelope, PUNI_REMOTE_GRAPH_ADMISSION: 'partitioned-228-v2' },
    { ...graphAdmissionEnvelope, PUNI_REMOTE_GRAPH_MODE: 'graph' },
    { ...graphAdmissionEnvelope, PUNI_REMOTE_GRAPH_ROOT: undefined },
    { ...graphAdmissionEnvelope, PUNI_REMOTE_GRAPH_EXECUTABLE: undefined },
  ])
    expect(() => launcher.readGraphTestAdmission(environment, graphAdmissionBoundary)).toThrow(
      'Unsupported graph test admission',
    );
});

test('graph launcher admission refuses mixed historical and partition admission', async () => {
  const launcher = await graphLauncherAdmission();
  for (const environment of [
    { PUNI_UC1_PREFLIGHT: 'focused-identity-15-v1' },
    { ...graphAdmissionEnvelope, PUNI_UC1_PREFLIGHT: 'focused-identity-15-v1' },
  ])
    expect(() => launcher.readGraphTestAdmission(environment, graphAdmissionBoundary)).toThrow(
      'Unsupported graph test admission',
    );
});

test('graph launcher admission binds the canonical source executable and declaration census', async () => {
  const launcher = await graphLauncherAdmission();
  for (const boundary of [
    {
      ...graphAdmissionBoundary,
      modulePath: '/review/repository/elsewhere/initial-handoff-graph.test.ts',
    },
    { ...graphAdmissionBoundary, repository: '/review/repository/../repository' },
    { ...graphAdmissionBoundary, executable: '/review/foreign/bun' },
    { ...graphAdmissionBoundary, declaredCount: 227 },
    { ...graphAdmissionBoundary, declaredTitlesSHA256: '0'.repeat(64) },
  ])
    expect(() => launcher.readGraphTestAdmission(graphAdmissionEnvelope, boundary)).toThrow(
      'Unsupported graph test admission',
    );
});

test('graph launcher admission refuses forwarded selection controls in child admission', async () => {
  const launcher = await graphLauncherAdmission();
  for (const environment of [
    { ...graphAdmissionEnvelope, BUN_OPTIONS: '--preload foreign.ts' },
    { ...graphAdmissionEnvelope, BUN_TEST_TIMEOUT: '1' },
    { ...graphAdmissionEnvelope, BUN_TEST_NAME_PATTERN: 'one' },
    { ...graphAdmissionEnvelope, NODE_OPTIONS: '--require foreign.js' },
  ])
    expect(() => launcher.readGraphTestAdmission(environment, graphAdmissionBoundary)).toThrow(
      'Unsupported graph test admission',
    );
});

// These marker fixtures exercise only actual CLI routing/receipts; they never construct Graph or emit native ledgers.
const graphRoutingTitles: readonly string[] = [
  'active graph refuses missing committed pointer without creating or scanning evidence',
  'complete owned initial graph captures and closes H6',
  'complete owned initial graph captures and closes H7',
  'complete owned initial graph captures and closes H8',
  'complete graph rejects a hash-bound unknown field in handoff-admission',
  'complete graph rejects a hash-bound unknown field in handoff-intent',
  'complete graph rejects a hash-bound unknown field in exposure-intent',
  'complete graph rejects a hash-bound unknown field in exposure-complete',
  'complete graph rejects a hash-bound unknown field in handoff-complete',
  'complete graph rejects a hash-bound unknown field in solver-restore-intent',
  'complete graph rejects a hash-bound unknown field in solver-restore-complete',
  'complete graph rejects a hash-bound unknown field in activation-participants',
  'complete graph rejects a hash-bound unknown field in activation-capture',
  'complete graph rejects a hash-bound unknown field in activation-backup',
  'complete graph rejects a hash-bound unknown field in activation-intent',
  'complete graph rejects a hash-bound unknown field in activation-committed',
  'complete graph rejects a hash-bound unknown field in activation-participant-restore-intent',
  'complete graph rejects a hash-bound unknown field in activation-participant-ready',
  'complete graph rejects a hash-bound unknown field in activation-participant-policy-intent',
  'complete graph rejects a hash-bound unknown field in activation-participants-restored',
  'dedicated solver-ready edge rejects inherited policy-publication-intent sibling',
  'dedicated solver-ready edge rejects inherited policy-published sibling',
  'independent closing graph refuses changed raw-capture bytes',
  'independent closing graph refuses changed raw-backup bytes',
  'complete graph refuses consistently archived backend database differing from selected database identity',
  'complete graph refuses NUL in otherwise matched historical solver-ready cgroup',
  'complete selected artifact closure accepts ordered roster prod',
  'complete selected artifact closure accepts ordered roster dev',
  'complete selected artifact closure accepts ordered roster prod,dev',
  'selected exact raw capture reader refuses unknown-root with recomputed reference hashes',
  'selected exact raw capture reader refuses unknown-applied-row with recomputed reference hashes',
  'selected exact raw capture reader refuses pending-ledger with recomputed reference hashes',
  'original manifest codec refuses hash-bound writers-input origin',
  'original manifest codec refuses hash-bound source-manifest-input closed',
  'original manifest codec refuses hash-bound migration-manifest-input closed',
  'selected backup reader refuses declared byte bound 0',
  'selected backup reader refuses declared byte bound 1073741825',
  'complete real artifact boundary refuses absent-capture',
  'complete real artifact boundary refuses unreadable-capture',
  'complete real artifact boundary refuses public-capture',
  'complete real artifact boundary refuses symlink-capture',
  'complete real artifact boundary refuses absent-backup',
  'complete real artifact boundary refuses unreadable-backup',
  'complete real artifact boundary refuses extra-artifact',
  'complete real artifact boundary refuses retained-original-fence',
  'full initial pointer/pending/archive state refuses both',
  'full initial pointer/pending/archive state refuses neither',
  'full initial pointer/pending/archive state refuses complete-pending',
  'full initial pointer/pending/archive state refuses unknown-pointer',
  'full initial pointer/pending/archive state refuses wrong-pointer-policy',
  'full graph preserves a nonzero original on-failure retry count',
  'complete hash-bound admission-v2 consumer refuses admission-v1',
  'complete hash-bound admission-v2 consumer refuses missing-pins',
  'complete hash-bound admission-v2 consumer refuses unknown-pin',
  'complete hash-bound admission-v2 consumer refuses foreign-source',
  'complete hash-bound admission-v2 consumer refuses foreign-writer',
  'complete hash-bound admission-v2 consumer refuses foreign-machine',
  'complete hash-bound admission-v2 consumer refuses missing-profile',
  'complete hash-bound admission-v2 consumer refuses reversed-profile',
  'complete hash-bound admission-v2 consumer refuses boolean-uid',
  'complete hash-bound admission-v2 consumer refuses invalid-hash',
  'review crosslink refuses independent writer-build-revision branch with recomputed enclosing hashes',
  'review crosslink refuses independent migration-image-identity branch with recomputed enclosing hashes',
  'review crosslink refuses independent restored-policy-digest branch with recomputed enclosing hashes',
  'INITIAL prerequisite exports content validation and retained raw observation',
  'seeded plan validates prod without terminal publication',
  'seeded plan validates dev without terminal publication',
  'seeded plan validates prod+dev without terminal publication',
  'pure plan refuses closed container',
  'pure plan refuses record cardinality',
  'pure plan refuses duplicate record',
  'pure plan refuses missing reference',
  'pure plan refuses extra record',
  'pure plan refuses record family',
  'pure plan refuses pending bytes',
  'pure plan refuses fence bytes',
  'pure plan refuses unused record bytes',
  'pure plan refuses ill-formed UTF-8',
  'pure plan refuses UTF-8 byte length',
  'pure plan refuses exact owner LF',
  'pure plan refuses snapshot decimal',
  'pure plan refuses snapshot mode',
  'pure plan refuses snapshot parent',
  'pure plan refuses snapshot identity',
  'pure plan refuses relative namespace',
  'pure plan refuses unnormalized namespace',
  'pure plan refuses NUL namespace',
  'pure plan refuses policy unknown field',
  'pure plan refuses policy phase',
  'pure plan refuses policy namespace',
  'pure plan refuses prepared pointer phase',
  'pure plan refuses complete pointer digest',
  'pure plan refuses manifest extra field',
  'pure plan refuses fence cardinality',
  'pure plan refuses artifact projection size',
  'shared plan codec refuses repaired-hash unknown field in handoff-admission',
  'shared plan codec refuses repaired-hash unknown field in handoff-intent',
  'shared plan codec refuses repaired-hash unknown field in exposure-intent',
  'shared plan codec refuses repaired-hash unknown field in exposure-complete',
  'shared plan codec refuses repaired-hash unknown field in handoff-complete',
  'shared plan codec refuses repaired-hash unknown field in solver-restore-intent',
  'shared plan codec refuses repaired-hash unknown field in solver-restore-complete',
  'shared plan codec refuses repaired-hash unknown field in activation-participants',
  'shared plan codec refuses repaired-hash unknown field in activation-capture',
  'shared plan codec refuses repaired-hash unknown field in activation-backup',
  'shared plan codec refuses repaired-hash unknown field in activation-intent',
  'shared plan codec refuses repaired-hash unknown field in activation-committed',
  'shared plan codec refuses repaired-hash unknown field in activation-participant-restore-intent',
  'shared plan codec refuses repaired-hash unknown field in activation-participant-ready',
  'shared plan codec refuses repaired-hash unknown field in activation-participant-policy-intent',
  'shared plan codec refuses repaired-hash unknown field in activation-participants-restored',
  'fixed raw observer refuses owner bound',
  'fixed raw observer refuses owner surrogate',
  'fixed raw observer refuses writer bound',
  'fixed raw observer refuses database cardinality',
  'fixed raw observer refuses database malformed identity',
  'fixed raw observer refuses selected roster',
  'fixed raw observer refuses selected name',
  'fixed raw observer refuses backup zero',
  'fixed raw observer refuses backup over limit',
  'fixed raw observer refuses missing capture',
  'fixed raw observer refuses unreadable capture',
  'fixed raw observer refuses public backup',
  'fixed raw observer refuses symlink backup',
  'fixed raw observer refuses extra raw evidence',
  'fixed raw observer refuses changed capture bytes',
  'fixed raw observer refuses truncated backup',
  'fixed raw observer refuses grown backup',
  'shared raw codec refuses repaired-hash target',
  'shared raw codec refuses repaired-hash attempt',
  'shared raw codec refuses repaired-hash candidate',
  'shared raw codec refuses repaired-hash ledger',
  'shared raw codec refuses repaired-hash rows',
  'raw observation detaches inputs and freezes nested output before retaining closure',
  'raw closing observation refuses replacement',
  'raw closing observation refuses parent',
  'raw closing observation refuses capture',
  'raw closing observation refuses backup',
  'raw close remains available and idempotent after expiry',
  'pure validation refuses expiration at its final successful-return boundary',
  'bounded raw reader refuses actual fifo',
  'bounded raw reader refuses actual invalid-utf8',
  'bounded raw reader refuses actual sparse-over-limit',
  'raw construction failure closes its descriptors and preserves caller descriptor',
  'raw streaming keeps its original deadline between backup chunks',
  'shared graph semantics refuse repaired-hash writer-build through plan and disk',
  'shared graph semantics refuse repaired-hash migration-image through plan and disk',
  'shared graph semantics refuse repaired-hash policy-digest through plan and disk',
  'shared graph semantics refuse repaired-hash receipt-attempt through plan and disk',
  'shared graph semantics refuse repaired-hash ready-phase through plan and disk',
  'shared graph semantics refuse repaired-hash launch-source through plan and disk',
  'shared graph semantics refuse repaired-hash ready-selection through plan and disk',
  'pure graph retains a nonzero original on-failure retry count',
  'raw observation refuses successful return after its original final deadline',
  'dedicated actual ready reread refuses identical bytes on a replacement inode',
  'plan bounds every standalone fence before enumerating supplied records',
  'standalone backup malformed names refuse before raw I/O',
  'standalone backup 161-byte names refuse before raw I/O',
  'standalone backup large names refuse before raw I/O',
  'standalone backup 4097-name names refuse before raw I/O',
  'standalone backup ordinary name passes admission and reaches real downstream I/O',
  'standalone backup 160-byte name passes admission and reaches real downstream I/O',
  'healthy-deadline post-close methods refuse before acquiring descriptors',
  'LF-inclusive public envelope byte boundary limit (valid)',
  'LF-inclusive public envelope byte boundary limit+1 (valid)',
  'LF-inclusive public writers byte boundary limit (valid)',
  'LF-inclusive public writers byte boundary limit+1 (valid)',
  'LF-inclusive public writers-multibyte byte boundary limit (valid)',
  'LF-inclusive public writers-multibyte byte boundary limit+1 (valid)',
  'LF-inclusive public source byte boundary limit (valid)',
  'LF-inclusive public source byte boundary limit+1 (valid)',
  'LF-inclusive public migration byte boundary limit (canonical-refusal)',
  'LF-inclusive public migration byte boundary limit+1 (canonical-refusal)',
  'LF-inclusive public capture byte boundary limit (valid)',
  'LF-inclusive public capture byte boundary limit+1 (valid)',
  'LF-inclusive public policy byte boundary limit (valid)',
  'LF-inclusive public policy byte boundary limit+1 (valid)',
  'LF-inclusive public prepared byte boundary limit (valid)',
  'LF-inclusive public prepared byte boundary limit+1 (valid)',
  'LF-inclusive public complete byte boundary limit (valid)',
  'LF-inclusive public complete byte boundary limit+1 (valid)',
  'LF-inclusive public request-writers byte boundary limit (io-reach)',
  'LF-inclusive public request-writers byte boundary limit+1 (io-reach)',
  'LF-inclusive public request-source byte boundary limit (io-reach)',
  'LF-inclusive public request-source byte boundary limit+1 (io-reach)',
  'plan refuses reachable non-predecessor admission with repaired enclosing hashes',
  'paired intended semantic refusal missing-admission-field after repairing enclosing hashes',
  'paired intended semantic refusal admission-v1 after repairing enclosing hashes',
  'paired intended semantic refusal source-pin after repairing enclosing hashes',
  'paired intended semantic refusal owner-newline after repairing enclosing hashes',
  'paired intended semantic refusal reference-family after repairing enclosing hashes',
  'paired intended semantic refusal conflicting-reference after repairing enclosing hashes',
  'paired intended semantic refusal activation-order after repairing enclosing hashes',
  'paired intended semantic refusal missing-activation after repairing enclosing hashes',
  'paired intended semantic refusal invented-activation after repairing enclosing hashes',
  'paired intended semantic refusal database-binding after repairing enclosing hashes',
  'paired intended semantic refusal capture-link after repairing enclosing hashes',
  'paired intended semantic refusal participant-link after repairing enclosing hashes',
  'paired intended semantic refusal ingress-projection after repairing enclosing hashes',
  'paired intended semantic refusal source-local-attempt after repairing enclosing hashes',
  'paired intended semantic refusal backend-local-attempt after repairing enclosing hashes',
  'paired intended semantic refusal gateway-local-attempt after repairing enclosing hashes',
  'close settlement retained file before delegation attempts every original',
  'close settlement retained file after delegation stays unknown',
  'close settlement retained parent before delegation attempts every original',
  'close settlement retained parent after delegation stays unknown',
  'close settlement multiple failures preserve caller descriptor',
  'close settlement raw construction retains read and cleanup failures',
  'close settlement disk construction retains semantic and cleanup failures',
  'close settlement directory transfer expiry closes original once',
  'close settlement reopened verification failure revokes observation',
  'close settlement roster stream failure retains read and close causes',
  'close settlement complete disk finalization stays unknown',
  'cleanup identity recognizes actual raw construction primary and close UNKNOWN',
  'cleanup identity recognizes actual disk construction semantic and close UNKNOWN',
  'cleanup identity recognizes reopened file UNKNOWN before stable terminal cleanup',
  'cleanup identity recognizes directory stream UNKNOWN before stable terminal cleanup',
  'cleanup identity recognizes retained file UNKNOWN before native delegation',
  'cleanup identity recognizes retained file UNKNOWN after native delegation',
  'cleanup identity recognizes retained parent UNKNOWN before native delegation',
  'cleanup identity recognizes retained parent UNKNOWN after native delegation',
  'cleanup identity recognizes complete disk final close UNKNOWN',
  'cleanup identity recognizes failed original cleanup after work expiry',
  'cleanup identity stays revoked through expiry after transient UNKNOWN',
  'cleanup identity refuses malformed raw construction with known cleanup',
  'cleanup identity refuses malformed disk construction with known cleanup',
  'cleanup identity refuses acquisition transfer expiry with known cleanup',
  'cleanup identity refuses primitive and message field lookalikes',
];

type GraphRoutingFault = 'none' | 'failed-ordinary' | 'missing-ordinary';
const GRAPH_ROUTING_FILE = 'src/lib/initial-handoff-graph.test.ts';

function graphRoutingFixture(fault: GraphRoutingFault = 'none'): string {
  const root = scratchSync('graph-cli-routing-');
  for (const path of ['.bun-version', 'nx.json'])
    write(root, path, readFileSync(join(ROOT, path), 'utf8'));
  const project: unknown = JSON.parse(readFileSync(join(ROOT, PROJECT, 'project.json'), 'utf8'));
  if (
    typeof project !== 'object' ||
    project === null ||
    Array.isArray(project) ||
    !('targets' in project)
  )
    throw new Error('Marker fixture project requires object targets');
  const targets = project.targets;
  if (
    typeof targets !== 'object' ||
    targets === null ||
    Array.isArray(targets) ||
    !('test' in targets)
  )
    throw new Error('Marker fixture project requires object test target');
  const canonical = targets.test;
  if (
    typeof canonical !== 'object' ||
    canonical === null ||
    Array.isArray(canonical) ||
    !('options' in canonical)
  )
    throw new Error('Marker fixture test target requires object options');
  const options = canonical.options;
  if (
    typeof options !== 'object' ||
    options === null ||
    Array.isArray(options) ||
    !('command' in options) ||
    typeof options.command !== 'string'
  )
    throw new Error('Marker fixture test options require string command');
  options.command = 'bun run test/run-tests.ts canonical';
  write(root, `${PROJECT}/project.json`, JSON.stringify(project));
  write(
    root,
    `${PROJECT}/test/run-tests.ts`,
    readFileSync(join(ROOT, PROJECT, 'test/run-tests.ts'), 'utf8'),
  );
  write(root, 'tools/test/scratch/preload.ts', '');
  mkdirSync(join(root, 'child-scratch'));
  write(
    root,
    `${PROJECT}/${GRAPH_ROUTING_FILE}`,
    `
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {test,expect} from 'bun:test';
import {readGraphTestAdmission} from '../../test/run-tests';
const names=${JSON.stringify(graphRoutingTitles)};
const repository=resolve(import.meta.dir,'../../../..');
const mode=readGraphTestAdmission(process.env,{
  repository,modulePath:import.meta.path,executable:process.execPath,requiredExecutable:process.execPath,
  declaredCount:names.length,declaredTitlesSHA256:createHash('sha256').update(JSON.stringify(names)).digest('hex')
});
console.log('GRAPH_ROUTE_ENTER='+mode);
const fault=${JSON.stringify(fault)};
const first=mode==='graph-ordinary'?0:mode==='graph-legacy'?202:213;
const end=mode==='graph-ordinary'?202:mode==='graph-legacy'?213:228;
for(let index=first;index<end;index++){
  if(fault==='missing-ordinary'&&mode==='graph-ordinary'&&index===201)continue;
  const name=names[index];if(name===undefined)throw Error('marker declaration absent');
  test(name,()=>{
    console.log('GRAPH_ROUTE_CASE='+JSON.stringify({mode,index}));
    if(fault==='failed-ordinary'&&mode==='graph-ordinary'&&index===0){
      console.error('GRAPH_ROUTE_EXPECTED_FAILURE');expect(false).toBe(true);
    }else expect(true).toBe(true);
  });
}
`,
  );
  for (const path of [
    ...explicit,
    'src/new.test.ts',
    'src/lib/initial-handoff-graph-extra.test.ts',
    'elsewhere/src/lib/initial-handoff-graph.test.ts',
  ])
    write(
      root,
      `${PROJECT}/${path}`,
      `
import {test,expect} from 'bun:test';
test(${JSON.stringify(path)},()=>{console.log('EXECUTED='+${JSON.stringify(path)});expect(true).toBe(true);});
`,
    );
  return root;
}

/** The actual harmless CLI is waited synchronously with full original captures; no timeout/signal/reader surrogate. */
function invokeGraphRouting(
  root: string,
  tokens: readonly string[],
  selection: Readonly<Record<string, string>> = {},
) {
  const path = process.env['PATH'];
  const home = process.env['HOME'];
  if (path === undefined || home === undefined)
    throw new Error('Marker CLI requires actual PATH and HOME');
  const argv = [process.execPath, 'run', join(root, PROJECT, 'test/run-tests.ts'), ...tokens];
  const invocation = Bun.spawnSync(argv, {
    cwd: root,
    env: {
      PATH: path,
      HOME: home,
      LANG: 'C.UTF-8',
      LC_ALL: 'C.UTF-8',
      TZ: 'UTC',
      TERM: 'dumb',
      NO_COLOR: '1',
      FORCE_COLOR: '0',
      NODE_ENV: 'test',
      CLAUDECODE: '0',
      AGENT: '0',
      BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0',
      TMPDIR: join(root, 'child-scratch'),
      ...selection,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  console.log(
    'GRAPH_ROUTING_DIAGNOSTIC:' +
      JSON.stringify({
        argv,
        cwd: root,
        exitCode: invocation.exitCode,
        stdoutBase64: invocation.stdout.toString('base64'),
        stderrBase64: invocation.stderr.toString('base64'),
      }),
  );
  expect(invocation.signalCode, invocation.stderr.toString()).toBeUndefined();
  return invocation;
}

function graphRoutingEntries(stdout: string): string[] {
  return [...stdout.matchAll(/^GRAPH_ROUTE_ENTER=(.+)$/gm)].map((match) => match[1]);
}
function graphRoutingCases(stdout: string): { readonly mode: string; readonly index: number }[] {
  return [...stdout.matchAll(/^GRAPH_ROUTE_CASE=(.+)$/gm)].map((match) => {
    const entry: unknown = JSON.parse(match[1]);
    if (
      typeof entry !== 'object' ||
      entry === null ||
      !('mode' in entry) ||
      typeof entry.mode !== 'string' ||
      !('index' in entry) ||
      !Number.isInteger(entry.index)
    )
      throw new Error('Actual marker callback record malformed');
    return entry as { readonly mode: string; readonly index: number }; // Boundary: actual closed marker shape checked above.
  });
}

function expectFullGraphRouting(stdout: string): void {
  expect(graphRoutingEntries(stdout)).toEqual(['graph-ordinary', 'graph-legacy', 'graph-identity']);
  const cases = graphRoutingCases(stdout);
  expect(cases).toHaveLength(228);
  expect(cases.map((entry) => entry.index)).toEqual(
    Array.from({ length: 228 }, (_, index) => index),
  );
  expect(cases.slice(0, 202).every((entry) => entry.mode === 'graph-ordinary')).toBe(true);
  expect(cases.slice(202, 213).every((entry) => entry.mode === 'graph-legacy')).toBe(true);
  expect(cases.slice(213).every((entry) => entry.mode === 'graph-identity')).toBe(true);
  const lines = stdout.split('\n');
  expect(lines.indexOf('GRAPH_ROUTE_ENTER=graph-legacy')).toBeGreaterThan(
    lines.findIndex(
      (line) =>
        line === 'GRAPH_ROUTE_CASE=' + JSON.stringify({ mode: 'graph-ordinary', index: 201 }),
    ),
  );
  expect(lines.indexOf('GRAPH_ROUTE_ENTER=graph-identity')).toBeGreaterThan(
    lines.findIndex(
      (line) => line === 'GRAPH_ROUTE_CASE=' + JSON.stringify({ mode: 'graph-legacy', index: 212 }),
    ),
  );
}

test('graph launcher routing refuses public extra arguments before any marker entry', () => {
  const root = graphRoutingFixture();
  for (const tokens of [
    ['graph', 'unexpected'],
    ['graph', '--test-name-pattern', 'one'],
    ['unknown'],
  ]) {
    const invocation = invokeGraphRouting(root, tokens);
    expect(invocation.stderr.toString()).toContain('Unsupported remote graph command');
    expect(invocation.exitCode).toBe(1);
    expect(graphRoutingEntries(invocation.stdout.toString())).toEqual([]);
    expect(executed(invocation.stdout.toString())).toEqual([]);
  }
});

test('graph launcher routing refuses ambient selection families before any marker entry', () => {
  const root = graphRoutingFixture();
  const selections: readonly Readonly<Record<string, string>>[] = [
    { BUN_TEST_UC1_SELECTION: 'one' },
    { PUNI_REMOTE_GRAPH_MODE: 'graph-identity' },
    { PUNI_REMOTE_GRAPH_UNOWNED: 'one' },
  ];
  for (const selection of selections) {
    const invocation = invokeGraphRouting(root, ['graph'], selection);
    expect(invocation.stderr.toString()).toContain(
      'Unsupported remote graph selection environment',
    );
    expect(invocation.exitCode).toBe(1);
    expect(graphRoutingEntries(invocation.stdout.toString())).toEqual([]);
    expect(executed(invocation.stdout.toString())).toEqual([]);
  }
});

test('graph launcher routing executes the marker202 legacy11 identity15 union serially', () => {
  const root = graphRoutingFixture();
  const invocation = invokeGraphRouting(root, ['graph'], { FORCE_COLOR: '1' });
  expect(invocation.exitCode, invocation.stderr.toString()).toBe(0);
  expectFullGraphRouting(invocation.stdout.toString());
  expect(executed(invocation.stdout.toString())).toEqual([]);
});

test('graph launcher routing retains a known failed first phase without starting later phases', () => {
  const root = graphRoutingFixture('failed-ordinary');
  const invocation = invokeGraphRouting(root, ['graph']);
  expect(graphRoutingEntries(invocation.stdout.toString())).toEqual(['graph-ordinary']);
  expect(invocation.stderr.toString()).toContain('GRAPH_ROUTE_EXPECTED_FAILURE');
  expect(invocation.exitCode).toBe(1);
  expect(graphRoutingCases(invocation.stdout.toString())).toHaveLength(202);
  expect(executed(invocation.stdout.toString())).toEqual([]);
});

test('graph launcher routing rejects a successful201 terminal receipt before later phases', () => {
  const root = graphRoutingFixture('missing-ordinary');
  const invocation = invokeGraphRouting(root, ['graph']);
  expect(graphRoutingEntries(invocation.stdout.toString())).toEqual(['graph-ordinary']);
  expect(graphRoutingCases(invocation.stdout.toString())).toHaveLength(201);
  expect(invocation.stderr.toString()).toContain('201 pass');
  expect(invocation.exitCode).toBe(1);
  expect(executed(invocation.stdout.toString())).toEqual([]);
});

test('graph launcher routing owns the canonical graph once while preserving collision remainder files', () => {
  const root = graphRoutingFixture();
  const invocation = invokeGraphRouting(root, ['canonical']);
  expect(invocation.exitCode, invocation.stderr.toString()).toBe(0);
  expectFullGraphRouting(invocation.stdout.toString());
  expect(executed(invocation.stdout.toString())).toEqual(
    [
      ...explicit,
      'src/new.test.ts',
      'src/lib/initial-handoff-graph-extra.test.ts',
      'elsewhere/src/lib/initial-handoff-graph.test.ts',
    ].sort(),
  );
  const lines = invocation.stdout.toString().split('\n');
  const firstRemainder = lines.findIndex((line) => line.startsWith('EXECUTED='));
  const finalGraph = lines.findLastIndex((line) => line.startsWith('GRAPH_ROUTE_CASE='));
  expect(firstRemainder).toBeGreaterThan(finalGraph);
});

function graphRestFixture(fault: GraphRoutingFault = 'none'): string {
  const root = graphRoutingFixture(fault);
  write(root, `${PROJECT}/test/ci-leaf.ts`, readFileSync(CLI, 'utf8'));
  for (const path of [MODEL, CONTINUATION, ...SOURCE, RESTORATION, POLICY, COMPLETE])
    write(
      root,
      `${PROJECT}/${path}`,
      `
import {test,expect} from 'bun:test';
for(let index=0;index<${String(path === RESTORATION ? 23 : path === POLICY ? 8 : path === COMPLETE ? 39 : 1)};index++)
 test(${JSON.stringify(path)}+index,()=>{console.log('ISOLATED_OWNER='+${JSON.stringify(path)});expect(true).toBe(true);});
`,
    );
  for (const path of [
    'src/lib/dependency-product-process-model-extra.test.ts',
    `elsewhere/${MODEL}`,
  ])
    write(
      root,
      `${PROJECT}/${path}`,
      `
import {test,expect} from 'bun:test';
test(${JSON.stringify(path)},()=>{console.log('EXECUTED='+${JSON.stringify(path)});expect(true).toBe(true);});
`,
    );
  for (const args of [
    ['init', '--quiet'],
    ['config', 'user.name', 'Remote graph rest test'],
    ['config', 'user.email', 'remote-graph-rest@example.test'],
    ['add', '.'],
    ['commit', '--quiet', '-m', 'graph rest fixture'],
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

/** Waits the actual copied leaf with full captures; neither timeout nor signal substitutes for return. */
function invokeGraphRest(root: string, preload?: string) {
  const path = process.env['PATH'];
  const home = process.env['HOME'];
  if (path === undefined || home === undefined)
    throw new Error('Graph rest fixture requires PATH and HOME');
  const checkedOut = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], {
    cwd: root,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (checkedOut.exitCode !== 0) throw new Error(checkedOut.stderr.toString());
  const head = checkedOut.stdout.toString().trim();
  const argv = [
    process.execPath,
    ...(preload === undefined ? [] : ['--preload', preload]),
    join(root, PROJECT, 'test/ci-leaf.ts'),
    root,
    'rest',
    `--head=${head}`,
  ];
  const invocation = Bun.spawnSync(argv, {
    cwd: root,
    env: {
      PATH: path,
      HOME: home,
      LANG: 'C.UTF-8',
      LC_ALL: 'C.UTF-8',
      TZ: 'UTC',
      TERM: 'dumb',
      NO_COLOR: '1',
      FORCE_COLOR: '0',
      NODE_ENV: 'test',
      CLAUDECODE: '0',
      AGENT: '0',
      BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0',
      TMPDIR: join(root, 'child-scratch'),
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  console.log(
    'GRAPH_REST_DIAGNOSTIC:' +
      JSON.stringify({
        argv,
        cwd: root,
        exitCode: invocation.exitCode,
        stdoutBase64: invocation.stdout.toString('base64'),
        stderrBase64: invocation.stderr.toString('base64'),
      }),
  );
  expect(invocation.signalCode, invocation.stderr.toString()).toBeUndefined();
  return invocation;
}

function graphRestReceipt(stdout: string): Record<string, unknown> {
  const last = stdout.trimEnd().split('\n').at(-1);
  if (last === undefined) throw new Error('Actual rest receipt absent');
  const receipt: unknown = JSON.parse(last);
  if (typeof receipt !== 'object' || receipt === null || Array.isArray(receipt))
    throw new Error('Actual rest receipt must be an object');
  return receipt as Record<string, unknown>; // Boundary: parsed object/null/array shape checked above.
}

test('graph rest integration composes graph once before the disjoint collision-preserving remainder', () => {
  const root = graphRestFixture();
  const invocation = invokeGraphRest(root);
  expect(invocation.exitCode, invocation.stderr.toString()).toBe(0);
  const stdout = invocation.stdout.toString();
  expectFullGraphRouting(stdout);
  const remainder = [
    ...explicit,
    'src/new.test.ts',
    'src/lib/initial-handoff-graph-extra.test.ts',
    'elsewhere/src/lib/initial-handoff-graph.test.ts',
    'src/lib/dependency-product-process-model-extra.test.ts',
    `elsewhere/${MODEL}`,
  ];
  expect(executed(stdout)).toEqual(remainder.sort());
  expect(stdout).not.toContain('ISOLATED_OWNER=');
  const lines = stdout.split('\n');
  expect(lines.findIndex((line) => line.startsWith('EXECUTED='))).toBeGreaterThan(
    lines.findLastIndex((line) => line.startsWith('GRAPH_ROUTE_CASE=')),
  );
  const graphLines = lines.filter(
    (line) => line.startsWith('{') && line.includes('"kind":"remote-graph-composite"'),
  );
  expect(graphLines).toHaveLength(1);
  const graph: unknown = JSON.parse(graphLines[0]);
  expect(graph).toMatchObject({
    kind: 'remote-graph-composite',
    callbacks: 228,
    uniqueGraphFiles: 1,
  });
  expect(invocation.stderr.toString()).toMatch(
    /12 pass\r?\n[ \t]*0 fail\r?\n[ \t]*12 expect\(\) calls\r?\nRan 12 tests across 12 files\./,
  );
  expect(graphRestReceipt(stdout)).toMatchObject({
    leaf: 'rest',
    fresh: true,
    tests: 240,
    files: 13,
    exitCode: 0,
  });
});

test('graph rest integration stops after a known failed ordinary phase before remainder', () => {
  const invocation = invokeGraphRest(graphRestFixture('failed-ordinary'));
  expect(graphRoutingEntries(invocation.stdout.toString())).toEqual(['graph-ordinary']);
  expect(invocation.exitCode).toBe(1);
  expect(invocation.stderr.toString()).toContain('GRAPH_ROUTE_EXPECTED_FAILURE');
  expect(graphRoutingCases(invocation.stdout.toString())).toHaveLength(202);
  expect(executed(invocation.stdout.toString())).toEqual([]);
  expect(invocation.stdout.toString()).not.toContain('"fresh":true');
});

test('graph rest integration stops after a successful201 phase before remainder', () => {
  const invocation = invokeGraphRest(graphRestFixture('missing-ordinary'));
  expect(graphRoutingEntries(invocation.stdout.toString())).toEqual(['graph-ordinary']);
  expect(invocation.exitCode).toBe(1);
  expect(graphRoutingCases(invocation.stdout.toString())).toHaveLength(201);
  expect(invocation.stderr.toString()).toContain('201 pass');
  expect(executed(invocation.stdout.toString())).toEqual([]);
  expect(invocation.stdout.toString()).not.toContain('"fresh":true');
});

test('graph rest integration refuses a missing exact graph owner before any Bun child dispatch', () => {
  const root = graphRestFixture();
  rmSync(join(root, PROJECT, GRAPH_ROUTING_FILE));
  const starts = recordChildStarts(root);
  const invocation = invokeGraphRest(root, starts.preload);
  expect(invocation.stderr.toString()).toContain('ENOENT');
  expect(invocation.stderr.toString()).toContain(GRAPH_ROUTING_FILE);
  expect(invocation.exitCode).toBe(1);
  expect(existsSync(starts.marker)).toBe(false);
  expect(graphRoutingEntries(invocation.stdout.toString())).toEqual([]);
  expect(executed(invocation.stdout.toString())).toEqual([]);
});

import type { ExpressionStatement, Node } from 'typescript';

const GRAPH_PLACEMENT_SOURCE = 'tools/tool-remote-scripts/src/lib/initial-handoff-graph.test.ts';
const GRAPH_PLACEMENT_SHA256 = 'e0aa42a11dcda58f07c1a38d4ba701e88ff47d488f04f0b4ede3811b84d9bdc9';

type GraphPlacementMode = 'graph-identity' | 'graph-legacy';
type GraphPlacementFault = 'none' | 'early-import' | 'missing-import' | 'preflight-rejection';

/** Source-extracted orchestration with finite modeled providers; no actual native settlement is invoked. */
async function graphPlacementSource() {
  const ts = await import('typescript');
  const { createHash } = await import('node:crypto');
  const source = readFileSync(join(ROOT, GRAPH_PLACEMENT_SOURCE), 'utf8');
  const digest = (contents: string) => createHash('sha256').update(contents).digest('hex');
  expect(digest(source)).toBe(GRAPH_PLACEMENT_SHA256);
  const parsed = ts.createSourceFile(GRAPH_PLACEMENT_SOURCE, source, ts.ScriptTarget.Latest, true);
  const selections: { name: string; start: number; end: number; sha256: string }[] = [];
  function select(name: string, kind: 'function' | 'variable') {
    const matches = parsed.statements.filter((statement) =>
      kind === 'function'
        ? ts.isFunctionDeclaration(statement) && statement.name?.text === name
        : ts.isVariableStatement(statement) &&
          statement.declarationList.declarations.some(
            (declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === name,
          ),
    );
    expect(matches).toHaveLength(1);
    const selected = matches.at(0);
    if (selected === undefined) throw new Error('Graph placement source selection absent: ' + name);
    const start = selected.getStart(parsed);
    const end = selected.end;
    const text = source.slice(start, end);
    selections.push({ name, start, end, sha256: digest(text) });
    return { selected, start, text };
  }
  const rosters = ['closePreflightScenarios', 'closeLegacyScenarios'].map((name) => {
    const selected = select(name, 'variable');
    if (!ts.isVariableStatement(selected.selected))
      throw new Error('Graph roster statement differs');
    expect(selected.selected.declarationList.declarations).toHaveLength(1);
    const initializer = selected.selected.declarationList.declarations.at(0)?.initializer;
    if (
      initializer === undefined ||
      !ts.isAsExpression(initializer) ||
      !ts.isArrayLiteralExpression(initializer.expression)
    )
      throw new Error('Graph literal roster differs');
    return selected.text;
  });
  const bindings = [
    select('closeSettlementOwner', 'variable').text,
    ...[
      'stopCloseSettlement',
      'holdCloseSettlement',
      'assertCloseSettlementStart',
      'assertClosePreflight',
      'readClosePreflight',
      'assertLegacyClosePreflight',
    ].map((name) => select(name, 'function').text),
  ];
  const orchestration = select('prepareClosePreflight', 'function');
  if (
    !ts.isFunctionDeclaration(orchestration.selected) ||
    orchestration.selected.body === undefined
  )
    throw new Error('Graph preflight function body absent');
  const imports: ExpressionStatement[] = [];
  function visit(node: Node): void {
    if (
      ts.isExpressionStatement(node) &&
      ts.isAwaitExpression(node.expression) &&
      ts.isCallExpression(node.expression.expression) &&
      node.expression.expression.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const arguments_ = node.expression.expression.arguments;
      expect(arguments_).toHaveLength(1);
      const specifier = arguments_.at(0);
      if (
        specifier === undefined ||
        !ts.isStringLiteral(specifier) ||
        specifier.text !== '@tools/test-scratch/preload'
      )
        throw new Error('Graph deferred import differs');
      imports.push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(orchestration.selected);
  expect(imports).toHaveLength(1);
  const deferred = imports.at(0);
  const nativeBranches = orchestration.selected.body.statements.filter(
    (statement) =>
      ts.isIfStatement(statement) &&
      ts.isIdentifier(statement.expression) &&
      statement.expression.text === 'hasNativePreflight',
  );
  expect(nativeBranches).toHaveLength(1);
  const branch = nativeBranches.at(0);
  if (deferred === undefined || branch === undefined)
    throw new Error('Graph placement boundary absent');
  const importStart = deferred.getStart(parsed) - orchestration.start;
  const importEnd = deferred.end - orchestration.start;
  const branchStart = branch.getStart(parsed) - orchestration.start;
  expect(branchStart).toBeLessThan(importStart);
  const importText = orchestration.text.slice(importStart, importEnd);
  const omitted = orchestration.text.slice(0, importStart) + orchestration.text.slice(importEnd);
  const early = omitted.slice(0, branchStart) + importText + '\n' + omitted.slice(branchStart);
  return {
    rosters,
    bindings,
    orchestration: orchestration.text,
    omitted,
    early,
    selections,
    sourceSHA256: digest(source),
  };
}

function graphPlacementFixture(
  extracted: Awaited<ReturnType<typeof graphPlacementSource>>,
  mode: GraphPlacementMode,
  fault: GraphPlacementFault,
): { root: string; image: string } {
  const root = scratchSync('graph-deferred-hook-');
  for (const path of ['tools/test/scratch/preload.ts', 'tools/test/scratch/index.ts']) {
    const bytes = readFileSync(join(ROOT, path));
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), bytes);
    expect(readFileSync(join(root, path)).equals(bytes)).toBe(true);
  }
  write(root, 'bunfig.toml', '[test]\n');
  write(
    root,
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: {
        baseUrl: '.',
        paths: {
          '@tools/test-scratch/preload': ['./tools/test/scratch/preload.ts'],
        },
      },
    }),
  );
  const orchestration =
    fault === 'early-import'
      ? extracted.early
      : fault === 'missing-import'
        ? extracted.omitted
        : extracted.orchestration;
  const image = `
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeSync} from 'node:fs';
import {resolve} from 'node:path';
import {afterAll as actualAfterAll, test as actualTest} from 'bun:test';
const graphMode=${JSON.stringify(mode)};
const hasNativePreflight=true;
const graphModuleEntered=performance.now();
const rejected=${String(fault === 'preflight-rejection')};
${extracted.rosters.join('\n')}
${extracted.bindings.join('\n')}
const closePreflightRecords=new Map();
const closeLegacyRecords=new Map();
const modeledOutcomes=[];
const modeledOriginals=[];
const modeledJoins=[];
const modeledFixtures=[];
const expectedHelpers=graphMode==='graph-identity'?14:11;
function allJoined(){
  return closeSettlementOwner.preflightComplete && !closeSettlementOwner.stopped &&
    !closeSettlementOwner.uncertain && closeSettlementOwner.active.length===0 &&
    modeledOutcomes.length===expectedHelpers && new Set(modeledOutcomes).size===expectedHelpers &&
    modeledOriginals.length===expectedHelpers && new Set(modeledOriginals).size===expectedHelpers &&
    modeledJoins.length===expectedHelpers && modeledJoins.every((join,index)=>
      join.known && join.original===modeledOriginals[index] && join.outcome===modeledOutcomes[index]) &&
    closeSettlementOwner.completed.length===expectedHelpers &&
    closeSettlementOwner.completed.every((observed,index)=>observed===modeledOutcomes[index]) &&
    closePreflightRecords.size===(graphMode==='graph-identity'?14:0) &&
    closeLegacyRecords.size===(graphMode==='graph-legacy'?11:0) &&
    (graphMode==='graph-identity'?closePreflightScenarios:closeLegacyScenarios).every((row,index)=>
      (graphMode==='graph-identity'?closePreflightRecords:closeLegacyRecords).get(row.scenario)===modeledOutcomes[index]);
}
function emit(kind,fields={}){writeSync(2,'GRAPH_PLACEMENT:'+JSON.stringify({kind,allJoined:allJoined(),...fields})+'\\n');}
Bun.plugin({name:'observe-exact-deferred-scratch-source',setup(builder){
  builder.onLoad({filter:/preload\\.ts$/},args=>{
    assert.equal(args.path,resolve(import.meta.dir,'../../../test/scratch/preload.ts'),'copied scratch preload path differs');
    const contents=readFileSync(args.path,'utf8');
    emit('preload-load');
    return {contents,loader:'ts'};
  });
}});
async function initialHandoffFixture(phase,unused,mutate){
  const fields={};if(mutate!==undefined)mutate('handoff-intent',fields);
  const fixture=await Promise.resolve({malformed:fields.unrecognized===true});
  modeledFixtures.push(fixture);emit('modeled-fixture',{malformed:fixture.malformed});return fixture;
}
async function runCloseSettlement(scenario,fixture,classify,stages){
  if(rejected)throw new Error('MODELED_PREFLIGHT_REJECTION');
  assert(modeledFixtures.includes(fixture),'modeled fixture identity absent');
  const row=(graphMode==='graph-identity'?closePreflightScenarios:closeLegacyScenarios).find(row=>row.scenario===scenario);
  assert(row!==undefined,'modeled scenario absent');
  assert.equal(fixture.malformed,row.fixture==='malformed-disk');
  assert.equal(classify,graphMode==='graph-identity');
  assert.deepEqual(stages,graphMode==='graph-identity'?row.stages:[]);
  const original=Promise.resolve({scenario,exit:0,classifications:[],original:{accepted:true}});
  assert(!modeledOriginals.includes(original),'modeled original Promise reused');
  modeledOriginals.push(original);
  const join={original,known:false,outcome:undefined};modeledJoins.push(join);
  const outcome=await original;
  assert.equal(modeledOriginals.at(-1),original,'modeled pending Promise identity differs');
  assert.equal(modeledJoins.at(-1),join,'modeled pending join identity differs');
  assert.equal(outcome.scenario,row.scenario,'modeled selected outcome differs');
  assert(!modeledOutcomes.includes(outcome) && !closeSettlementOwner.completed.includes(outcome),
    'modeled completed outcome reused');
  join.outcome=outcome;join.known=true;modeledOutcomes.push(outcome);
  closeSettlementOwner.completed.push(outcome);
  emit('modeled-join',{scenario});return outcome;
}
const names=${JSON.stringify(graphRoutingTitles)};
const graphTestDeclarations=names.map(name=>({name,options:undefined,callback:()=>{
  if(graphMode==='graph-legacy'){
    const row=closeLegacyScenarios.find(row=>row.title===name);assert(row!==undefined);
    assertLegacyClosePreflight(row.scenario);
  }else{
    assertClosePreflight();const row=closePreflightScenarios.find(row=>row.title===name);
    if(row!==undefined)readClosePreflight(row.scenario);
  }
  emit('callback',{name});
}}));
const graphFinalizers=[{callback:()=>emit('file-finalizer'),options:undefined}];
function registerTest(name,callback,options){emit('test-registration',{name});actualTest(name,callback,options);}
function registerAfterAll(callback,options){emit('finalizer-registration');actualAfterAll(callback,options);}
${orchestration}
emit('source-binding',${JSON.stringify({ sourceSHA256: extracted.sourceSHA256, selections: extracted.selections })});
await prepareClosePreflight();
`;
  write(root, GRAPH_PLACEMENT_SOURCE, image);
  return { root, image };
}

function invokeGraphPlacement(root: string) {
  return Bun.spawnSync([process.execPath, 'test', '--timeout=5000', GRAPH_PLACEMENT_SOURCE], {
    cwd: root,
    env: {
      PATH: process.env['PATH'],
      HOME: process.env['HOME'],
      FORCE_COLOR: '0',
      NO_COLOR: '1',
      BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0',
    },
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 5000,
  });
}

/** The same consumer must reject both mutations, even if a mutated child exits successfully. */
function expectGraphPlacement(
  invocation: ReturnType<typeof invokeGraphPlacement>,
  mode: GraphPlacementMode,
): void {
  const stderr = invocation.stderr.toString();
  expect(invocation.signalCode, stderr).toBeUndefined();
  expect(invocation.exitCode, stderr).toBe(0);
  const lines = stderr.split('\n');
  const events = lines
    .filter((line) => line.startsWith('GRAPH_PLACEMENT:'))
    .map((line) => {
      const event: unknown = JSON.parse(line.slice('GRAPH_PLACEMENT:'.length));
      if (event === null || typeof event !== 'object' || !('kind' in event))
        throw new Error('Graph placement event malformed');
      return event as { kind: string; allJoined: boolean; name?: string };
    });
  const loads = events.filter((event) => event.kind === 'preload-load');
  const expected = graphRoutingTitles.slice(
    mode === 'graph-identity' ? 213 : 202,
    mode === 'graph-identity' ? 228 : 213,
  );
  for (const kind of ['test-registration', 'callback']) {
    const selected = events.filter((event) => event.kind === kind);
    expect(selected.map((event) => event.name)).toEqual(expected);
    expect(selected.every((event) => event.allJoined)).toBe(true);
  }
  const finalizers = events.filter((event) => event.kind === 'finalizer-registration');
  expect(finalizers).toHaveLength(1);
  expect(finalizers[0]?.allJoined).toBe(true);
  expect(events.filter((event) => event.kind === 'file-finalizer')).toHaveLength(1);
  const starts = lines.flatMap((line, index) =>
    line === 'scratch cleanup source=afterAll event=start' ? [index] : [],
  );
  const returns = lines.flatMap((line, index) =>
    /^scratch cleanup source=afterAll event=return elapsedMs=\d+$/.test(line) ? [index] : [],
  );
  if (starts.length !== 1 || returns.length !== 1)
    throw new Error('Graph placement actual scratch hook evidence differs');
  const lastCallback = lines.findLastIndex(
    (line) => line.startsWith('GRAPH_PLACEMENT:') && line.includes('"kind":"callback"'),
  );
  expect(starts[0]).toBeGreaterThan(lastCallback);
  expect(returns[0]).toBeGreaterThan(starts[0]);
  expect(loads).toHaveLength(1);
  if (!Object.is(loads.at(0)?.allJoined, true))
    throw new Error('Graph placement scratch hook loaded before modeled joins');
  expect(events.findIndex((event) => event.kind === 'test-registration')).toBeGreaterThan(
    events.findIndex((event) => event.kind === 'preload-load'),
  );
  expect(stderr).toContain('0 fail');
}

test('graph source preflight defers actual scratch hook until modeled joins and retains cleanup', async () => {
  const extracted = await graphPlacementSource();
  const steps = [
    ['graph-identity', 'none'],
    ['graph-legacy', 'none'],
    ['graph-legacy', 'early-import'],
    ['graph-legacy', 'none'],
    ['graph-legacy', 'missing-import'],
    ['graph-legacy', 'none'],
    ['graph-legacy', 'preflight-rejection'],
  ] as const;
  let restoredImage: string | undefined;
  for (const [mode, fault] of steps) {
    const fixture = graphPlacementFixture(extracted, mode, fault);
    if (mode === 'graph-legacy' && fault === 'none') {
      if (restoredImage === undefined) restoredImage = fixture.image;
      else expect(fixture.image).toBe(restoredImage);
    }
    const invocation = invokeGraphPlacement(fixture.root);
    console.log(
      'GRAPH_PLACEMENT_DIAGNOSTIC:' +
        JSON.stringify({
          mode,
          fault,
          sourceSHA256: extracted.sourceSHA256,
          selections: extracted.selections,
          exitCode: invocation.exitCode,
          signalCode: invocation.signalCode,
          stdoutBase64: invocation.stdout.toString('base64'),
          stderrBase64: invocation.stderr.toString('base64'),
        }),
    );
    if (fault === 'preflight-rejection') {
      expect(invocation.signalCode).toBeUndefined();
      expect(invocation.exitCode).not.toBe(0);
      const stderr = invocation.stderr.toString();
      expect(stderr).toContain('MODELED_PREFLIGHT_REJECTION');
      expect(stderr).not.toContain('"kind":"preload-load"');
      expect(stderr).not.toContain('"kind":"test-registration"');
      expect(stderr).not.toContain('"kind":"finalizer-registration"');
      expect(stderr).not.toContain('scratch cleanup source=afterAll event=');
    } else if (fault === 'none') expectGraphPlacement(invocation, mode);
    else {
      expect(invocation.signalCode).toBeUndefined();
      expect(invocation.exitCode, invocation.stderr.toString()).toBe(0);
      if (fault === 'missing-import')
        expect(() => {
          expectGraphPlacement(invocation, mode);
        }).toThrow('Graph placement actual scratch hook evidence differs');
      else
        expect(() => {
          expectGraphPlacement(invocation, mode);
        }).toThrow('Graph placement scratch hook loaded before modeled joins');
    }
  }
});

/** Selects the actual admission callsite and exact full-census assertion without importing Graph. */
async function graphGateSource() {
  const extracted = await graphPlacementSource();
  const ts = await import('typescript');
  const { createHash } = await import('node:crypto');
  const source = readFileSync(join(ROOT, GRAPH_PLACEMENT_SOURCE), 'utf8');
  const digest = (text: string) => createHash('sha256').update(text).digest('hex');
  expect(digest(source)).toBe(extracted.sourceSHA256);
  const parsed = ts.createSourceFile(GRAPH_PLACEMENT_SOURCE, source, ts.ScriptTarget.Latest, true);
  const selections = [...extracted.selections];
  function retain(name: string, node: Node) {
    const start = node.getStart(parsed);
    const end = node.end;
    const text = source.slice(start, end);
    selections.push({ name, start, end, sha256: digest(text) });
    return { start, end, text };
  }
  function variable(name: string) {
    const matches = parsed.statements.filter(
      (statement) =>
        ts.isVariableStatement(statement) &&
        statement.declarationList.declarations.some(
          (declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === name,
        ),
    );
    expect(matches).toHaveLength(1);
    const selected = matches.at(0);
    if (selected === undefined || !ts.isVariableStatement(selected))
      throw new Error('Graph gate variable absent: ' + name);
    expect(selected.declarationList.declarations).toHaveLength(1);
    return { ...retain(name, selected), declaration: selected.declarationList.declarations.at(0) };
  }
  const repository = variable('graphRepository');
  const mode = variable('graphMode');
  const initializer = mode.declaration?.initializer;
  if (
    initializer === undefined ||
    !ts.isCallExpression(initializer) ||
    !ts.isIdentifier(initializer.expression) ||
    initializer.expression.text !== 'readGraphTestAdmission'
  )
    throw new Error('Actual Graph admission initializer call absent');
  const admissionCall = retain('graphMode.initializer', initializer);
  const fixedMode =
    mode.text.slice(0, admissionCall.start - mode.start) +
    "'graph-legacy'" +
    mode.text.slice(admissionCall.end - mode.start);
  function isAssertion(node: Node, label: string): node is ExpressionStatement {
    if (!ts.isExpressionStatement(node) || !ts.isCallExpression(node.expression)) return false;
    const call = node.expression;
    const message = call.arguments.at(-1);
    return (
      ts.isPropertyAccessExpression(call.expression) &&
      ts.isIdentifier(call.expression.expression) &&
      call.expression.expression.text === 'assert' &&
      call.expression.name.text === 'equal' &&
      message !== undefined &&
      ts.isStringLiteral(message) &&
      message.text === label
    );
  }
  const cwdMatches = parsed.statements.filter((node) =>
    isAssertion(node, 'UC1 graph command cwd differs'),
  );
  expect(cwdMatches).toHaveLength(1);
  const cwdNode = cwdMatches.at(0);
  if (cwdNode === undefined) throw new Error('Actual Graph cwd assertion absent');
  const cwd = retain('graph.cwd.assertion', cwdNode);
  const orchestrationMatches = parsed.statements.filter(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'prepareClosePreflight',
  );
  expect(orchestrationMatches).toHaveLength(1);
  const orchestration = orchestrationMatches.at(0);
  if (
    orchestration === undefined ||
    !ts.isFunctionDeclaration(orchestration) ||
    orchestration.body === undefined
  )
    throw new Error('Actual Graph census orchestration absent');
  const hashMatches = orchestration.body.statements.filter((node) =>
    isAssertion(node, 'UC1 frozen graph title census differs'),
  );
  expect(hashMatches).toHaveLength(1);
  const hashNode = hashMatches.at(0);
  if (hashNode === undefined) throw new Error('Actual Graph full-census assertion absent');
  const hashAssertion = retain('graph.full-census.assertion', hashNode);
  const orchestrationStart = orchestration.getStart(parsed);
  expect(source.slice(orchestrationStart, orchestration.end)).toBe(extracted.orchestration);
  const omittedHash =
    extracted.orchestration.slice(0, hashAssertion.start - orchestrationStart) +
    extracted.orchestration.slice(hashAssertion.end - orchestrationStart);
  const launcher = readFileSync(join(ROOT, PROJECT, 'test/run-tests.ts'));
  return {
    extracted,
    repository: repository.text,
    mode: mode.text,
    fixedMode,
    cwd: cwd.text,
    omittedHash,
    selections,
    launcher,
    launcherSHA256: digest(launcher.toString()),
    sourceSHA256: extracted.sourceSHA256,
  };
}

type GraphGateFault = 'none' | 'omit-admission-call' | 'rename-title' | 'omit-census-assertion';
function graphGateFixture(
  source: Awaited<ReturnType<typeof graphGateSource>>,
  fault: GraphGateFault,
) {
  const extracted =
    fault === 'omit-census-assertion'
      ? { ...source.extracted, orchestration: source.omittedHash }
      : source.extracted;
  const fixture = graphPlacementFixture(extracted, 'graph-legacy', 'none');
  write(fixture.root, `${PROJECT}/test/run-tests.ts`, source.launcher.toString());
  expect(
    readFileSync(join(fixture.root, PROJECT, 'test/run-tests.ts')).equals(source.launcher),
  ).toBe(true);
  const binding = {
    sourceSHA256: source.sourceSHA256,
    launcherSHA256: source.launcherSHA256,
    selections: source.selections,
  };
  let image = fixture.image.replace(
    "import assert from 'node:assert/strict';",
    "import assert from 'node:assert/strict';\nimport {readGraphTestAdmission} from '../../test/run-tests';",
  );
  const originalMode = 'const graphMode="graph-legacy";';
  expect(image.split(originalMode)).toHaveLength(2);
  const admission = fault === 'omit-admission-call' ? source.fixedMode : source.mode;
  image = image.replace(
    originalMode,
    `writeSync(2,'GRAPH_GATE_SOURCE:'+${JSON.stringify(JSON.stringify(binding))}+'\\n');\ntry {\n` +
      source.repository +
      '\n' +
      admission +
      '\n' +
      source.cwd,
  );
  if (fault === 'rename-title' || fault === 'omit-census-assertion') {
    const names = [...graphRoutingTitles];
    const first = names.at(0);
    if (first === undefined) throw new Error('Actual ordinary census title absent');
    names[0] = first + ' [unique ordinary census fault]';
    expect(names).toHaveLength(228);
    expect(new Set(names).size).toBe(228);
    expect(names.slice(202)).toEqual(graphRoutingTitles.slice(202));
    const original = 'const names=' + JSON.stringify(graphRoutingTitles) + ';';
    expect(image.split(original)).toHaveLength(2);
    image = image.replace(original, 'const names=' + JSON.stringify(names) + ';');
  }
  image += `\n} catch(cause) {\nif(cause instanceof Error)writeSync(2,'GRAPH_GATE_REFUSAL:'+JSON.stringify({name:cause.name,message:cause.message})+'\\n');\nthrow cause;\n}\n`;
  write(fixture.root, GRAPH_PLACEMENT_SOURCE, image);
  return { root: fixture.root, image, binding };
}

function invokeGraphGate(root: string, admitted: boolean) {
  const admission: Record<string, string> = {
    PUNI_REMOTE_GRAPH_MODE: 'graph-legacy',
    PUNI_REMOTE_GRAPH_ROOT: root,
    PUNI_REMOTE_GRAPH_EXECUTABLE: process.execPath,
  };
  if (admitted) admission['PUNI_REMOTE_GRAPH_ADMISSION'] = 'partitioned-228-v1';
  return Bun.spawnSync([process.execPath, 'test', '--timeout=5000', GRAPH_PLACEMENT_SOURCE], {
    cwd: root,
    env: {
      PATH: process.env['PATH'],
      HOME: process.env['HOME'],
      FORCE_COLOR: '0',
      NO_COLOR: '1',
      BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0',
      ...admission,
    },
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 5000,
  });
}

/** The same unchanged refusal consumer must reject each omission because actual modeled fixture work starts. */
function expectGraphGateRefusal(
  invocation: ReturnType<typeof invokeGraphGate>,
  gate: 'admission' | 'census',
): void {
  const stderr = invocation.stderr.toString();
  if (stderr.includes('"kind":"modeled-fixture"') || stderr.includes('"kind":"modeled-join"'))
    throw new Error('Graph ' + gate + ' guard allowed modeled work');
  expect(invocation.signalCode, stderr).toBeUndefined();
  expect(invocation.exitCode, stderr).toBe(1);
  const frames = stderr.split('\n').filter((line) => line.startsWith('GRAPH_GATE_REFUSAL:'));
  expect(frames).toHaveLength(1);
  const frame = frames.at(0);
  if (frame === undefined) throw new Error('Actual Graph refusal frame absent');
  const refusal: unknown = JSON.parse(frame.slice('GRAPH_GATE_REFUSAL:'.length));
  if (
    refusal === null ||
    typeof refusal !== 'object' ||
    !('name' in refusal) ||
    !('message' in refusal) ||
    typeof refusal.message !== 'string'
  )
    throw new Error('Actual Graph refusal frame malformed');
  expect(refusal.name).toBe(gate === 'admission' ? 'Error' : 'AssertionError');
  expect(refusal.message.split('\n').at(0)).toBe(
    gate === 'admission'
      ? 'Unsupported graph test admission'
      : 'UC1 frozen graph title census differs',
  );
  for (const kind of ['test-registration', 'finalizer-registration', 'preload-load', 'callback'])
    expect(stderr).not.toContain('"kind":"' + kind + '"');
  expect(stderr).not.toContain('scratch cleanup source=afterAll event=');
}

test('graph source admission and full census refuse before modeled work and both omissions break refusal', async () => {
  const source = await graphGateSource();
  const steps = [
    ['none', true, 'control'],
    ['none', false, 'admission'],
    ['omit-admission-call', false, 'admission'],
    ['none', false, 'admission'],
    ['rename-title', true, 'census'],
    ['omit-census-assertion', true, 'census'],
    ['rename-title', true, 'census'],
  ] as const;
  let admissionImage: string | undefined;
  let censusImage: string | undefined;
  for (const [fault, admitted, gate] of steps) {
    const fixture = graphGateFixture(source, fault);
    if (gate === 'admission' && fault === 'none') {
      if (admissionImage === undefined) admissionImage = fixture.image;
      else expect(fixture.image).toBe(admissionImage);
    }
    if (gate === 'census' && fault === 'rename-title') {
      if (censusImage === undefined) censusImage = fixture.image;
      else expect(fixture.image).toBe(censusImage);
    }
    const invocation = invokeGraphGate(fixture.root, admitted);
    console.log(
      'GRAPH_GATE_DIAGNOSTIC:' +
        JSON.stringify({
          fault,
          admitted,
          gate,
          binding: fixture.binding,
          exitCode: invocation.exitCode,
          signalCode: invocation.signalCode,
          stdoutBase64: invocation.stdout.toString('base64'),
          stderrBase64: invocation.stderr.toString('base64'),
        }),
    );
    const bindingLines = invocation.stderr
      .toString()
      .split('\n')
      .filter((line) => line.startsWith('GRAPH_GATE_SOURCE:'));
    expect(bindingLines).toHaveLength(1);
    const binding = bindingLines.at(0);
    if (binding === undefined) throw new Error('Actual Graph gate source binding absent');
    const observedBinding: unknown = JSON.parse(binding.slice('GRAPH_GATE_SOURCE:'.length));
    expect(observedBinding).toEqual(fixture.binding);
    if (gate === 'control') expectGraphPlacement(invocation, 'graph-legacy');
    else if (fault === 'omit-admission-call' || fault === 'omit-census-assertion') {
      expect(invocation.signalCode).toBeUndefined();
      expect(invocation.exitCode, invocation.stderr.toString()).toBe(0);
      expectGraphPlacement(invocation, 'graph-legacy');
      expect(invocation.stderr.toString()).toContain('"kind":"modeled-fixture"');
      expect(() => {
        expectGraphGateRefusal(invocation, gate);
      }).toThrow('Graph ' + gate + ' guard allowed modeled work');
    } else expectGraphGateRefusal(invocation, gate);
  }
});

/** Binds the four actual scenario/membership assertion statements; no modeled predicate replaces a guard. */
async function graphHandoffSource() {
  const extracted = await graphPlacementSource();
  const ts = await import('typescript');
  const { createHash } = await import('node:crypto');
  const source = readFileSync(join(ROOT, GRAPH_PLACEMENT_SOURCE), 'utf8');
  expect(createHash('sha256').update(source).digest('hex')).toBe(extracted.sourceSHA256);
  const parsed = ts.createSourceFile(GRAPH_PLACEMENT_SOURCE, source, ts.ScriptTarget.Latest, true);
  const guards = [
    [
      'graph-identity',
      'scenario',
      'readClosePreflight',
      'UC1 identity observation scenario differs',
    ],
    [
      'graph-legacy',
      'scenario',
      'assertLegacyClosePreflight',
      'UC1 original legacy observation scenario differs',
    ],
    [
      'graph-identity',
      'membership',
      'readClosePreflight',
      'UC1 identity observation foreign to this invocation',
    ],
    [
      'graph-legacy',
      'membership',
      'assertLegacyClosePreflight',
      'UC1 legacy observation foreign to this invocation',
    ],
  ] as const;
  const omissions = new Map<string, readonly string[]>();
  const selections = [];
  for (const [mode, guard, name, message] of guards) {
    const functions = parsed.statements.filter(
      (node) => ts.isFunctionDeclaration(node) && node.name?.text === name,
    );
    expect(functions).toHaveLength(1);
    const selected = functions.at(0);
    if (
      selected === undefined ||
      !ts.isFunctionDeclaration(selected) ||
      selected.body === undefined
    )
      throw new Error('Actual handoff guard function absent: ' + name);
    const statements = selected.body.statements.filter((node) => {
      if (!ts.isExpressionStatement(node) || !ts.isCallExpression(node.expression)) return false;
      const label = node.expression.arguments.at(-1);
      return (
        label !== undefined &&
        ts.isStringLiteral(label) &&
        label.text === message &&
        ((ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === 'assert') ||
          (ts.isPropertyAccessExpression(node.expression.expression) &&
            ts.isIdentifier(node.expression.expression.expression) &&
            node.expression.expression.expression.text === 'assert' &&
            node.expression.expression.name.text === 'equal'))
      );
    });
    expect(statements).toHaveLength(1);
    const statement = statements.at(0);
    if (statement === undefined) throw new Error('Actual handoff assertion absent: ' + message);
    const functionStart = selected.getStart(parsed);
    const original = source.slice(functionStart, selected.end);
    const start = statement.getStart(parsed);
    const end = statement.end;
    const text = source.slice(start, end);
    const omitted = original.slice(0, start - functionStart) + original.slice(end - functionStart);
    expect(extracted.bindings.filter((binding) => binding === original)).toHaveLength(1);
    omissions.set(
      mode + ':' + guard,
      extracted.bindings.map((binding) => (binding === original ? omitted : binding)),
    );
    selections.push({
      mode,
      guard,
      function: name,
      message,
      start,
      end,
      sha256: createHash('sha256').update(text).digest('hex'),
      functionSHA256: createHash('sha256').update(original).digest('hex'),
    });
  }
  return { extracted, omissions, selections };
}

type GraphHandoffFault = 'wrong-scenario' | 'foreign-record' | 'absent-record';
function graphHandoffFixture(
  source: Awaited<ReturnType<typeof graphHandoffSource>>,
  mode: GraphPlacementMode,
  fault: GraphHandoffFault,
  omitted: boolean,
) {
  const guard = fault === 'wrong-scenario' ? 'scenario' : 'membership';
  const bindings = omitted ? source.omissions.get(mode + ':' + guard) : source.extracted.bindings;
  if (bindings === undefined) throw new Error('Actual handoff omitted binding absent');
  const extracted = { ...source.extracted, bindings: [...bindings] };
  const fixture = graphPlacementFixture(extracted, mode, 'none');
  const target = graphRoutingTitles.at(mode === 'graph-identity' ? 213 : 202);
  if (target === undefined) throw new Error('Actual first handoff callback absent');
  const originalRegistration =
    "function registerTest(name,callback,options){emit('test-registration',{name});actualTest(name,callback,options);}";
  expect(fixture.image.split(originalRegistration)).toHaveLength(2);
  let image = fixture.image.replace(
    originalRegistration,
    `
let handoffInjected=false;
const handoffTarget=${JSON.stringify(target)};
function registerTest(name,callback,options){
  if(!handoffInjected){
    assert(allJoined(),'handoff image requires all modeled preflight outcomes first');
    emit('handoff-ready',{target:handoffTarget});
    const rows=graphMode==='graph-identity'?closePreflightScenarios:closeLegacyScenarios;
    const records=graphMode==='graph-identity'?closePreflightRecords:closeLegacyRecords;
    const first=rows[0];assert(first!==undefined,'handoff first selected scenario absent');
    const original=records.get(first.scenario);
    assert(original===modeledOutcomes[0]&&closeSettlementOwner.completed[0]===original,'handoff original observation differs');
    const fault=${JSON.stringify(fault)};
    if(fault==='wrong-scenario'){
      const other=closeSettlementOwner.completed[1];
      assert(other!==undefined&&other!==original&&other.scenario!==first.scenario,'handoff different actual outcome absent');
      records.set(first.scenario,other);
    }else if(fault==='foreign-record'){
      const foreign={...original};
      assert(foreign!==original&&foreign.scenario===original.scenario&&!closeSettlementOwner.completed.includes(foreign),'handoff foreign scenario differs');
      records.set(first.scenario,foreign);
    }else records.delete(first.scenario);
    handoffInjected=true;emit('handoff-corrupted',{fault,target:handoffTarget});
  }
  emit('test-registration',{name});actualTest(name,callback,options);
}
`,
  );
  const callbackStart = 'callback:()=>{';
  expect(image.split(callbackStart)).toHaveLength(2);
  image = image.replace(callbackStart, callbackStart + 'try{');
  const callbackEnd = "  emit('callback',{name});\n}}));";
  expect(image.split(callbackEnd)).toHaveLength(2);
  image = image.replace(
    callbackEnd,
    `
  if(name===handoffTarget)emit('handoff-target-success',{name});
  emit('callback',{name});
}catch(cause){
  if(name===handoffTarget&&cause instanceof Error)emit('handoff-refusal',{name,errorName:cause.name,message:cause.message});
  throw cause;
}
}}));`,
  );
  const binding = { sourceSHA256: source.extracted.sourceSHA256, selections: source.selections };
  const prepare = 'await prepareClosePreflight();';
  expect(image.split(prepare)).toHaveLength(2);
  image = image.replace(
    prepare,
    `writeSync(2,'GRAPH_HANDOFF_SOURCE:'+${JSON.stringify(JSON.stringify(binding))}+'\\n');\n` +
      prepare,
  );
  write(fixture.root, GRAPH_PLACEMENT_SOURCE, image);
  return { root: fixture.root, image, target, binding };
}

function graphHandoffEvents(invocation: ReturnType<typeof invokeGraphPlacement>) {
  return invocation.stderr
    .toString()
    .split('\n')
    .filter((line) => line.startsWith('GRAPH_PLACEMENT:'))
    .map((line) => {
      const event: unknown = JSON.parse(line.slice('GRAPH_PLACEMENT:'.length));
      if (
        event === null ||
        typeof event !== 'object' ||
        !('kind' in event) ||
        typeof event.kind !== 'string'
      )
        throw new Error('Actual handoff event malformed');
      return event as {
        kind: string;
        allJoined: boolean;
        target?: string;
        name?: string;
        errorName?: string;
        message?: string;
      };
    });
}

/** Requires the intended original guard, not an arbitrary failing child or source excerpt. */
function expectGraphHandoffRefusal(
  invocation: ReturnType<typeof invokeGraphPlacement>,
  mode: GraphPlacementMode,
  fault: GraphHandoffFault,
  target: string,
): void {
  const events = graphHandoffEvents(invocation);
  if (events.some((event) => event.kind === 'handoff-target-success' && event.name === target))
    throw new Error('Graph handoff ' + mode + ' ' + fault + ' guard admitted target');
  expect(invocation.signalCode, invocation.stderr.toString()).toBeUndefined();
  expect(invocation.exitCode, invocation.stderr.toString()).toBe(1);
  const refusals = events.filter((event) => event.kind === 'handoff-refusal');
  expect(refusals).toHaveLength(1);
  const refusal = refusals.at(0);
  if (refusal === undefined || typeof refusal.message !== 'string')
    throw new Error('Actual handoff refusal absent');
  expect(refusal.name).toBe(target);
  expect(refusal.errorName).toBe(fault === 'absent-record' ? 'Error' : 'AssertionError');
  const message =
    fault === 'absent-record'
      ? mode === 'graph-identity'
        ? 'UC1 original identity preflight completion unavailable'
        : 'UC1 original legacy preflight completion unavailable'
      : fault === 'wrong-scenario'
        ? mode === 'graph-identity'
          ? 'UC1 identity observation scenario differs'
          : 'UC1 original legacy observation scenario differs'
        : mode === 'graph-identity'
          ? 'UC1 identity observation foreign to this invocation'
          : 'UC1 legacy observation foreign to this invocation';
  expect(refusal.message.split('\n').at(0)).toBe(message);
  expect(events.filter((event) => event.kind === 'callback' && event.name === target)).toHaveLength(
    0,
  );
}

test('graph source handoff rejects wrong or foreign records and exact guard omissions admit only the target', async () => {
  const source = await graphHandoffSource();
  const steps = [
    ['graph-identity', 'wrong-scenario', false],
    ['graph-identity', 'wrong-scenario', true],
    ['graph-identity', 'wrong-scenario', false],
    ['graph-legacy', 'wrong-scenario', false],
    ['graph-legacy', 'wrong-scenario', true],
    ['graph-legacy', 'wrong-scenario', false],
    ['graph-identity', 'foreign-record', false],
    ['graph-identity', 'foreign-record', true],
    ['graph-identity', 'foreign-record', false],
    ['graph-legacy', 'foreign-record', false],
    ['graph-legacy', 'foreign-record', true],
    ['graph-legacy', 'foreign-record', false],
    ['graph-identity', 'absent-record', false],
    ['graph-legacy', 'absent-record', false],
  ] as const;
  const restoredImages = new Map<string, string>();
  for (const [mode, fault, omitted] of steps) {
    const fixture = graphHandoffFixture(source, mode, fault, omitted);
    if (!omitted && fault !== 'absent-record') {
      const key = mode + ':' + fault;
      const original = restoredImages.get(key);
      if (original === undefined) restoredImages.set(key, fixture.image);
      else expect(fixture.image).toBe(original);
    }
    const invocation = invokeGraphPlacement(fixture.root);
    console.log(
      'GRAPH_HANDOFF_DIAGNOSTIC:' +
        JSON.stringify({
          mode,
          fault,
          omitted,
          binding: fixture.binding,
          exitCode: invocation.exitCode,
          signalCode: invocation.signalCode,
          stdoutBase64: invocation.stdout.toString('base64'),
          stderrBase64: invocation.stderr.toString('base64'),
        }),
    );
    const sourceLines = invocation.stderr
      .toString()
      .split('\n')
      .filter((line) => line.startsWith('GRAPH_HANDOFF_SOURCE:'));
    expect(sourceLines).toHaveLength(1);
    const sourceLine = sourceLines.at(0);
    if (sourceLine === undefined) throw new Error('Actual handoff source binding absent');
    const observedBinding: unknown = JSON.parse(sourceLine.slice('GRAPH_HANDOFF_SOURCE:'.length));
    expect(observedBinding).toEqual(fixture.binding);
    const events = graphHandoffEvents(invocation);
    const ready = events.filter((event) => event.kind === 'handoff-ready');
    expect(ready).toHaveLength(1);
    expect(ready.at(0)?.allJoined).toBe(true);
    expect(ready.at(0)?.target).toBe(fixture.target);
    expect(events.filter((event) => event.kind === 'handoff-corrupted')).toHaveLength(1);
    expect(events.filter((event) => event.kind === 'modeled-join')).toHaveLength(
      mode === 'graph-identity' ? 14 : 11,
    );
    const selected = graphRoutingTitles.slice(
      mode === 'graph-identity' ? 213 : 202,
      mode === 'graph-identity' ? 228 : 213,
    );
    expect(
      events.filter((event) => event.kind === 'test-registration').map((event) => event.name),
    ).toEqual(selected);
    const expectedCallbacks = omitted
      ? selected
      : fault === 'absent-record'
        ? []
        : selected.filter((name) => name !== fixture.target);
    expect(events.filter((event) => event.kind === 'callback').map((event) => event.name)).toEqual(
      expectedCallbacks,
    );
    expect(
      invocation.stderr
        .toString()
        .split('\n')
        .filter((line) => line === 'scratch cleanup source=afterAll event=start'),
    ).toHaveLength(1);
    expect(
      invocation.stderr
        .toString()
        .split('\n')
        .filter((line) =>
          /^scratch cleanup source=afterAll event=return elapsedMs=\d+$/.test(line),
        ),
    ).toHaveLength(1);
    if (omitted) {
      expect(invocation.signalCode).toBeUndefined();
      expect(invocation.exitCode, invocation.stderr.toString()).toBe(0);
      expect(
        events.filter(
          (event) => event.kind === 'handoff-target-success' && event.name === fixture.target,
        ),
      ).toHaveLength(1);
      expect(events.filter((event) => event.kind === 'handoff-refusal')).toHaveLength(0);
      expect(() => {
        expectGraphHandoffRefusal(invocation, mode, fault, fixture.target);
      }).toThrow('Graph handoff ' + mode + ' ' + fault + ' guard admitted target');
    } else expectGraphHandoffRefusal(invocation, mode, fault, fixture.target);
  }
});
