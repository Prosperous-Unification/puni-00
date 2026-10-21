import { chmodSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { afterEach, describe, expect, it } from 'bun:test';
import type { NxJsonConfiguration } from 'nx/src/config/nx-json';
import type { ProjectGraph, ProjectGraphProjectNode } from 'nx/src/config/project-graph';

import {
  parseRuntimeSelection,
  selectRuntimeProjects,
  selectRuntimeProjectsFromGraph,
} from './ci-runtime-selection';
import { type Change, selectChanges } from './ci-selection';

const ROOT = resolve(import.meta.dir, '../../../..');
const SCRIPT = join(import.meta.dir, 'ci-runtime-selection.ts');
const roots: string[] = [];
const nxJson: NxJsonConfiguration = {
  namedInputs: {
    default: ['{projectRoot}/**/*'],
    production: ['default'],
    lintGlobals: ['{workspaceRoot}/docs/**/*.md'],
  },
};

function node(
  name: string,
  targets: NonNullable<ProjectGraphProjectNode['data']['targets']> = {
    test: { inputs: ['default', '^production'] },
  },
): ProjectGraphProjectNode {
  return {
    name,
    type: 'lib',
    data: {
      root: `modules/${name}`,
      targets: Object.fromEntries(
        Object.entries(targets).map(([target, configuration]) => [
          target,
          { executor: 'nx:run-commands', options: { command: 'bun --version' }, ...configuration },
        ]),
      ),
    },
  };
}

function graph(): ProjectGraph {
  return {
    externalNodes: {},
    nodes: {
      core: node('core'),
      middle: node('middle'),
      consumer: node('consumer'),
      validator: node('validator', {
        test: {
          inputs: [
            'default',
            '{workspaceRoot}/fixtures/**',
            '{workspaceRoot}/scripts/**',
            'runtimeConfig',
          ],
          dependsOn: ['prepare'],
        },
        prepare: { inputs: ['{workspaceRoot}/generated-contract/**'] },
        lint: { inputs: ['default', 'lintGlobals'] },
      }),
      unrelated: node('unrelated'),
    },
    dependencies: {
      core: [],
      middle: [{ source: 'middle', target: 'core', type: 'static' }],
      consumer: [{ source: 'consumer', target: 'middle', type: 'static' }],
      validator: [],
      unrelated: [],
    },
  };
}

function change(path: string): Change {
  return { status: 'M', oldMode: '100644', newMode: '100644', oldPath: path, newPath: path };
}

async function plan(changes: Change[], configured = graph()) {
  return selectRuntimeProjectsFromGraph(
    configured,
    changes,
    {
      ...nxJson,
      namedInputs: {
        ...nxJson.namedInputs,
        runtimeConfig: ['{workspaceRoot}/runtime.config.json'],
      },
    },
    { name: 'selection-proof', version: '1.0.0' },
  );
}

function git(root: string, ...args: string[]): string {
  const invocation = Bun.spawnSync(['git', ...args], { cwd: root, stdout: 'pipe', stderr: 'pipe' });
  if (invocation.exitCode !== 0) throw new Error(invocation.stderr.toString());
  return invocation.stdout.toString().trim();
}

function write(root: string, path: string, content: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function workspace(
  path = 'modules/core/source.ts',
  operation: 'modify' | 'delete' | 'rename' = 'modify',
  configuredGraph = graph(),
) {
  const root = scratchSync('ci-runtime-selection-');
  roots.push(root);
  symlinkSync(join(ROOT, 'node_modules'), join(root, 'node_modules'));
  write(root, '.gitignore', 'node_modules\n.nx\n');
  write(root, 'package.json', JSON.stringify({ name: 'runtime-selection-proof', private: true }));
  write(
    root,
    'nx.json',
    JSON.stringify({
      namedInputs: {
        ...nxJson.namedInputs,
        runtimeConfig: ['{workspaceRoot}/validator.config.json'],
      },
      targetDefaults: {
        test: { inputs: ['default', '^production', '{workspaceRoot}/runtime.config.json'] },
      },
    }),
  );
  for (const [name, project] of Object.entries(configuredGraph.nodes)) {
    const configured = { ...project.data, name };
    if (name !== 'validator') delete configured.targets?.['test']?.inputs;
    write(
      root,
      `modules/${name}/project.json`,
      JSON.stringify({
        ...configured,
        implicitDependencies: name === 'middle' ? ['core'] : name === 'consumer' ? ['middle'] : [],
      }),
    );
    write(root, `modules/${name}/source.ts`, 'export const first = 1;\n');
  }
  write(root, 'docs/plans/report.md', 'Original report\n');
  write(root, 'runtime.config.json', '{}\n');
  write(root, 'validator.config.json', '{}\n');
  write(root, 'fixtures/example.md', 'Runtime fixture\n');
  write(root, 'scripts/process.sh', 'exit 0\n');
  write(root, 'generated-contract/schema.json', '{}\n');
  git(root, 'init', '-q');
  git(root, 'config', 'user.name', 'CI runtime proof');
  git(root, 'config', 'user.email', 'runtime@example.invalid');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'base');
  const base = git(root, 'rev-parse', 'HEAD');
  if (operation === 'delete') rmSync(join(root, path));
  else if (operation === 'rename') git(root, 'mv', path, `${path}.renamed`);
  else write(root, path, `${readFileSync(join(root, path), 'utf8')}changed\n`);
  git(root, 'add', '.');
  git(root, 'commit', '-qm', operation);
  const head = git(root, 'rev-parse', 'HEAD');
  return { root, base, head };
}

function invoke(
  history: ReturnType<typeof workspace>,
  script = SCRIPT,
  env: Record<string, string> = {},
) {
  return Bun.spawnSync([process.execPath, script, history.base, history.head, history.root], {
    cwd: history.root,
    env: {
      ...process.env,
      NX_DAEMON: 'false',
      NX_ISOLATE_PLUGINS: 'false',
      NX_WORKSPACE_DATA_DIRECTORY: join(history.root, '.nx/runtime-selection'),
      ...env,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function taskDependencyGraph(continuous: boolean): ProjectGraph {
  return {
    externalNodes: {},
    nodes: {
      app: node('app', { test: { dependsOn: [{ projects: ['generator'], target: 'prepare' }] } }),
      generator: node('generator', {
        prepare: { inputs: ['{workspaceRoot}/generated-contract/**'], continuous },
      }),
      independent: node('independent'),
    },
    dependencies: { app: [], generator: [], independent: [] },
  };
}

describe('runtime task graph selection', () => {
  it.each([false, true])(
    'preserves cross-project task dependency consumers, continuous=%s',
    async (continuous) => {
      const configured = taskDependencyGraph(continuous);
      expect((await plan([change('generated-contract/schema.json')], configured)).projects).toEqual(
        ['app'],
      );
      const candidate = workspace('generated-contract/schema.json', 'modify', configured);
      const invocation = invoke(candidate);
      expect(invocation.exitCode, invocation.stderr.toString()).toBe(0);
      expect(parseRuntimeSelection(invocation.stdout.toString()).projects).toEqual(['app']);
    },
  );

  it('does not promote repository-wide lint inputs to validator tests', async () => {
    expect((await plan([change('docs/plans/report.md')])).projects).toEqual([]);
  });

  it('retains owning modules and every transitive consumer', async () => {
    expect((await plan([change('modules/core/source.ts')])).projects).toEqual([
      'consumer',
      'core',
      'middle',
    ]);
  });

  it.each([
    'fixtures/example.md',
    'scripts/process.sh',
    'runtime.config.json',
    'generated-contract/schema.json',
  ])('retains explicitly consumed %s including task dependencies', async (path) => {
    expect((await plan([change(path)])).projects).toEqual(['validator']);
  });

  it.each(['delete', 'rename'] as const)(
    'broadens %s because the former dependency graph is unavailable',
    async (operation) => {
      const altered = change('modules/core/source.ts');
      altered.status = operation === 'delete' ? 'D' : 'R';
      altered.newPath = operation === 'delete' ? null : 'modules/unrelated/renamed.ts';
      const selection = await plan([altered]);
      expect(selection.projects).toEqual(['consumer', 'core', 'middle', 'unrelated', 'validator']);
      expect(selection.reasons.join(' ')).toMatch(/previous|former|base graph/i);
    },
  );

  it('broadens unknown input even beside a recognized source change', async () => {
    const selection = await plan([change('modules/core/source.ts'), change('unknown/input.xyz')]);
    expect(selection.projects).toEqual(['consumer', 'core', 'middle', 'unrelated', 'validator']);
    expect(selection.reasons.join(' ')).toContain('unknown/input.xyz');
  });

  it('preserves universal runtime coverage for a known owning source module', async () => {
    const configured = graph();
    configured.nodes['validator'] = node('validator', {
      test: { inputs: ['{workspaceRoot}/**/*'] },
    });
    expect((await plan([change('modules/core/source.ts')], configured)).projects).toEqual([
      'consumer',
      'core',
      'middle',
      'validator',
    ]);
  });

  it.each(['nx.json', 'package.json', 'bun.lock', 'tsconfig.base.json'])(
    'keeps whole-repository configuration coverage for %s',
    async (path) => {
      expect((await plan([change(path)])).projects).toEqual([
        'consumer',
        'core',
        'middle',
        'unrelated',
        'validator',
      ]);
    },
  );

  it('retains project default inputs when a runtime target omits its input array', async () => {
    const configured = graph();
    configured.nodes['core'] = node('core', { test: {} });
    configured.nodes['core'].data.namedInputs = { default: ['{workspaceRoot}/core.config.json'] };
    expect((await plan([change('core.config.json')], configured)).projects).toEqual([
      'consumer',
      'core',
      'middle',
    ]);
  });

  it('does not mistake universal validator lint or test inputs for known application impact', async () => {
    const configured = graph();
    configured.nodes['validator'] = node('validator', {
      test: { inputs: ['{workspaceRoot}/**/*'] },
      lint: { inputs: ['{workspaceRoot}/**/*'] },
    });
    expect((await plan([change('unknown/input.xyz')], configured)).projects).toEqual([
      'consumer',
      'core',
      'middle',
      'unrelated',
      'validator',
    ]);
  });

  it('refuses empty diff and empty trusted graph instead of certifying no work', () => {
    expect(plan([])).rejects.toThrow();
    expect(
      plan([change('modules/core/source.ts')], { nodes: {}, dependencies: {} }),
    ).rejects.toThrow();
  });
});

describe('production runtime selector with actual Nx workspaces', () => {
  it('uses the requested graph, merges target defaults and preserves transitive modules through the public API', async () => {
    const history = workspace();
    const selection = await selectRuntimeProjects(
      history.root,
      selectChanges(history.root, history.base, history.head),
    );
    expect(selection.projects).toEqual(['consumer', 'core', 'middle']);
    expect(selection.reasons.length).toBeGreaterThan(0);
  }, 15000);

  it.each([
    ['docs/plans/report.md', []],
    ['fixtures/example.md', ['validator']],
    ['scripts/process.sh', ['validator']],
    ['generated-contract/schema.json', ['validator']],
    ['runtime.config.json', ['consumer', 'core', 'middle', 'unrelated']],
  ] as const)(
    'uses configured runtime inputs for %s',
    (path, expected) => {
      const execution = invoke(workspace(path));
      expect(execution.exitCode, execution.stderr.toString()).toBe(0);
      const selected = JSON.parse(execution.stdout.toString()) as { projects: string[] };
      expect(selected.projects).toEqual([...expected]);
    },
    15000,
  );

  it.each(['delete', 'rename'] as const)(
    'retains every module after source %s removes previous edges',
    (operation) => {
      const execution = invoke(workspace('modules/core/source.ts', operation));
      expect(execution.exitCode, execution.stderr.toString()).toBe(0);
      expect((JSON.parse(execution.stdout.toString()) as { projects: string[] }).projects).toEqual([
        'consumer',
        'core',
        'middle',
        'unrelated',
        'validator',
      ]);
    },
    15000,
  );

  it.each(['nx.json', 'package.json'])(
    'refuses missing, unreadable or malformed trusted %s',
    (path) => {
      for (const fault of ['missing', 'unreadable', 'denied', 'malformed', 'non-object']) {
        const history = workspace();
        rmSync(join(history.root, path));
        if (fault === 'unreadable') mkdirSync(join(history.root, path));
        if (fault === 'denied') {
          write(history.root, path, '{}');
          chmodSync(join(history.root, path), 0o000);
        }
        if (fault === 'malformed') write(history.root, path, '{');
        if (fault === 'non-object') write(history.root, path, '[]');
        const execution = invoke(history);
        expect(execution.exitCode).not.toBe(0);
        expect(execution.stdout.toString()).toBe('');
      }
    },
    15000,
  );

  it('refuses a broken Nx project configuration and an absent Nx plugin', () => {
    for (const fault of ['malformed project', 'absent plugin']) {
      const history = workspace();
      if (fault === 'malformed project') write(history.root, 'modules/core/project.json', '{');
      else write(history.root, 'nx.json', JSON.stringify({ plugins: ['./missing-plugin.cjs'] }));
      const execution = invoke(history);
      expect(execution.exitCode).not.toBe(0);
      expect(execution.stdout.toString()).toBe('');
    }
  }, 15000);

  it('broadens unknown committed input through the production CLI', () => {
    const history = workspace();
    write(history.root, 'unknown/input.xyz', 'unmodeled');
    git(history.root, 'add', '.');
    git(history.root, 'commit', '-qm', 'unknown input');
    history.head = git(history.root, 'rev-parse', 'HEAD');
    const execution = invoke(history);
    expect(execution.exitCode, execution.stderr.toString()).toBe(0);
    expect(parseRuntimeSelection(execution.stdout.toString()).projects).toEqual([
      'consumer',
      'core',
      'middle',
      'unrelated',
      'validator',
    ]);
  }, 15000);

  it('broadens unknown input even when real validator runtime and lint targets consume the entire tree', () => {
    const history = workspace();
    write(
      history.root,
      'modules/validator/project.json',
      JSON.stringify({
        name: 'validator',
        targets: {
          test: {
            executor: 'nx:run-commands',
            inputs: ['{workspaceRoot}/**/*'],
            options: { command: 'bun --version' },
          },
          lint: {
            executor: 'nx:run-commands',
            inputs: ['{workspaceRoot}/**/*'],
            options: { command: 'bun --version' },
          },
        },
      }),
    );
    write(history.root, 'unknown/input.xyz', 'unmodeled');
    git(history.root, 'add', '.');
    git(history.root, 'commit', '-qm', 'unknown input beside universal validation');
    history.head = git(history.root, 'rev-parse', 'HEAD');
    const execution = invoke(history);
    expect(execution.exitCode, execution.stderr.toString()).toBe(0);
    expect(parseRuntimeSelection(execution.stdout.toString()).projects).toEqual([
      'consumer',
      'core',
      'middle',
      'unrelated',
      'validator',
    ]);
  }, 15000);

  it('refuses an empty committed diff through the production CLI', () => {
    const history = workspace();
    const execution = invoke({ ...history, base: history.head });
    expect(execution.exitCode).not.toBe(0);
    expect(execution.stdout.toString()).toBe('');
  }, 15000);

  it('refuses a workspace without runtime targets', () => {
    const history = workspace();
    for (const name of ['consumer', 'core', 'middle', 'unrelated', 'validator']) {
      write(history.root, `modules/${name}/project.json`, JSON.stringify({ name, targets: {} }));
    }
    const execution = invoke(history);
    expect(execution.exitCode).not.toBe(0);
    expect(execution.stdout.toString()).toBe('');
  }, 15000);

  it('does not accept forced stale graph reuse after a project configuration breaks', () => {
    const history = workspace();
    expect(invoke(history).exitCode).toBe(0);
    write(history.root, 'modules/core/project.json', '{');
    const execution = invoke(history, SCRIPT, { NX_FORCE_REUSE_CACHED_GRAPH: 'true' });
    expect(execution.exitCode).not.toBe(0);
    expect(execution.stdout.toString()).toBe('');
  }, 15000);

  it('propagates graph failure through the public API', () => {
    const history = workspace();
    const selection = selectChanges(history.root, history.base, history.head);
    write(history.root, 'modules/core/project.json', '{');
    expect(selectRuntimeProjects(history.root, selection)).rejects.toThrow(
      'Runtime selection failed',
    );
  }, 15000);

  it('refuses invalid immutable diff evidence on the production path', () => {
    const history = workspace();
    const execution = invoke({ ...history, base: 'missing' });
    expect(execution.exitCode).not.toBe(0);
    expect(execution.stdout.toString()).toBe('');
  });
});

describe('runtime subprocess evidence boundary', () => {
  it.each([
    'null',
    '{}',
    '{"projects":[4],"reasons":["selected"]}',
    '{"projects":[""],"reasons":["selected"]}',
    '{"projects":[],"reasons":[]}',
    '{"projects":[],"reasons":[4]}',
    '{"projects":[],"reasons":[""]}',
  ])('refuses malformed output %s instead of approving omitted suites', (content) => {
    expect(() => parseRuntimeSelection(content)).toThrow();
  });
});
