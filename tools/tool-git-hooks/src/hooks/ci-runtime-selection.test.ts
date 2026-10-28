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

const packetPaths = [
  'openspec/changes/example/.openspec.yaml',
  'openspec/changes/example/proposal.md',
  'openspec/changes/example/design.md',
  'openspec/changes/example/tasks.md',
  'openspec/changes/example/verify.md',
  'openspec/changes/example/specs/capability/spec.md',
];

const unknownSpecPaths = [
  'openspec/config.yaml',
  'openspec/schemas/example/schema.yaml',
  'openspec/hooks/validate.ts',
  'openspec/scripts/check.ts',
  'openspec/fixtures/proposal.md',
  'openspec/changes/example/fixtures/proposal.md',
  'openspec/changes/example/system-prompt.md',
  'openspec/changes/example/specs/capability/fixture.md',
  'openspec/changes/archive/proposal.md',
  'openspec/changes/archive/example/proposal.md',
];

function packetGraph(): ProjectGraph {
  const configured = graph();
  configured.nodes['validator'] = node('validator', {
    test: { inputs: ['{workspaceRoot}/**/*'] },
  });
  configured.nodes['spec-consumer'] = node('spec-consumer', {
    test: { inputs: ['{workspaceRoot}/openspec/changes/example/design.md'] },
  });
  configured.dependencies['spec-consumer'] = [];
  return configured;
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
  initialFiles: Record<string, string> = {},
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
    if (['core', 'middle', 'consumer', 'unrelated'].includes(name))
      delete configured.targets?.['test']?.inputs;
    write(
      root,
      `${configured.root}/project.json`,
      JSON.stringify({
        ...configured,
        implicitDependencies: name === 'middle' ? ['core'] : name === 'consumer' ? ['middle'] : [],
      }),
    );
    write(root, `${configured.root}/source.ts`, 'export const first = 1;\n');
  }
  write(root, 'docs/plans/report.md', 'Original report\n');
  write(root, 'runtime.config.json', '{}\n');
  write(root, 'validator.config.json', '{}\n');
  write(root, 'fixtures/example.md', 'Runtime fixture\n');
  write(root, 'scripts/process.sh', 'exit 0\n');
  write(root, 'generated-contract/schema.json', '{}\n');
  for (const [path, content] of Object.entries(initialFiles)) write(root, path, content);
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
  it.each(packetPaths)(
    'recognizes regular OpenSpec packet input %s beside source',
    async (path) => {
      for (const status of ['A', 'M']) {
        const artifact = change(path);
        if (status === 'A') {
          artifact.status = 'A';
          artifact.oldPath = null;
          artifact.oldMode = '000000';
        }
        expect((await plan([change('modules/core/source.ts'), artifact])).projects).toEqual([
          'consumer',
          'core',
          'middle',
        ]);
      }
    },
  );

  it('keeps explicit OpenSpec consumers and universal validator tests for a packet', async () => {
    expect((await plan(packetPaths.map(change), packetGraph())).projects).toEqual([
      'spec-consumer',
      'validator',
    ]);
  });

  it.each(unknownSpecPaths)('broadens unknown OpenSpec input %s', async (path) => {
    expect((await plan([change('modules/core/source.ts'), change(path)])).projects).toEqual([
      'consumer',
      'core',
      'middle',
      'unrelated',
      'validator',
    ]);
  });

  it.each([
    ['A', '000000', '100755'],
    ['A', '000000', '120000'],
    ['M', '100644', '100755'],
    ['M', '100755', '100644'],
    ['M', '120000', '120000'],
    ['T', '100644', '120000'],
    ['T', '120000', '100644'],
    ['C', '100644', '100644'],
  ])(
    'broadens packet status %s with modes %s -> %s despite declared consumers',
    async (status, oldMode, newMode) => {
      const artifact = { ...change(packetPaths[2]), status, oldMode, newMode };
      if (status === 'A') artifact.oldPath = null;
      expect((await plan([artifact], packetGraph())).projects).toEqual([
        'consumer',
        'core',
        'middle',
        'spec-consumer',
        'unrelated',
        'validator',
      ]);
    },
  );

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
  it.each(['add', 'modify'])(
    'keeps source plus %s OpenSpec packet scoped with actual Nx',
    (operation) => {
      const initialFiles =
        operation === 'modify'
          ? Object.fromEntries(packetPaths.map((path) => [path, 'original\n']))
          : {};
      const history = workspace('modules/core/source.ts', 'modify', packetGraph(), initialFiles);
      for (const path of packetPaths) write(history.root, path, 'updated\n');
      git(history.root, 'add', '.');
      git(history.root, 'commit', '-qm', 'required OpenSpec packet');
      history.head = git(history.root, 'rev-parse', 'HEAD');
      expect(selectChanges(history.root, history.base, history.head).scope).toBe('code');
      const execution = invoke(history);
      expect(execution.exitCode, execution.stderr.toString()).toBe(0);
      expect(parseRuntimeSelection(execution.stdout.toString()).projects).toEqual([
        'consumer',
        'core',
        'middle',
        'spec-consumer',
        'validator',
      ]);
    },
    15000,
  );

  it('retains explicit and universal runtime inputs for a packet without source changes', () => {
    const history = workspace('modules/core/source.ts', 'modify', packetGraph());
    history.base = history.head;
    for (const path of packetPaths) write(history.root, path, 'packet\n');
    git(history.root, 'add', '.');
    git(history.root, 'commit', '-qm', 'packet only');
    history.head = git(history.root, 'rev-parse', 'HEAD');
    expect(selectChanges(history.root, history.base, history.head).scope).toBe('code');
    const execution = invoke(history);
    expect(execution.exitCode, execution.stderr.toString()).toBe(0);
    expect(parseRuntimeSelection(execution.stdout.toString()).projects).toEqual([
      'spec-consumer',
      'validator',
    ]);
  }, 15000);

  it.each(unknownSpecPaths)(
    'broadens committed unknown OpenSpec input %s',
    (path) => {
      const history = workspace();
      write(history.root, path, 'unmodeled\n');
      git(history.root, 'add', '.');
      git(history.root, 'commit', '-qm', 'unknown OpenSpec input');
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
    },
    15000,
  );

  it.each([
    'executable',
    'symlink',
    'type-change',
    'former-executable',
    'former-symlink',
    'delete',
    'rename',
  ])(
    'broadens committed packet %s despite explicit and universal consumers',
    (fault) => {
      const path = packetPaths[2];
      const history = workspace('modules/core/source.ts', 'modify', packetGraph(), {
        [path]: 'original\n',
      });
      if (fault === 'former-executable') chmodSync(join(history.root, path), 0o755);
      if (fault === 'former-symlink') {
        rmSync(join(history.root, path));
        symlinkSync('../../../modules/core/source.ts', join(history.root, path));
      }
      if (fault === 'former-executable' || fault === 'former-symlink') {
        git(history.root, 'add', '.');
        git(history.root, 'commit', '-qm', 'nonregular base');
      }
      if (fault === 'executable' || fault === 'symlink') {
        git(history.root, 'rm', path);
        git(history.root, 'commit', '-qm', 'absent artifact base');
      }
      history.base = git(history.root, 'rev-parse', 'HEAD');
      if (fault === 'delete') rmSync(join(history.root, path));
      else if (fault === 'rename')
        git(history.root, 'mv', path, 'openspec/changes/example/proposal.md');
      else if (fault === 'symlink' || fault === 'type-change') {
        if (fault === 'type-change') rmSync(join(history.root, path));
        mkdirSync(dirname(join(history.root, path)), { recursive: true });
        symlinkSync('../../../modules/core/source.ts', join(history.root, path));
      } else {
        if (fault === 'former-symlink') rmSync(join(history.root, path));
        write(history.root, path, 'updated\n');
        chmodSync(join(history.root, path), fault === 'executable' ? 0o755 : 0o644);
      }
      git(history.root, 'add', '.');
      git(history.root, 'commit', '-qm', fault);
      history.head = git(history.root, 'rev-parse', 'HEAD');
      const execution = invoke(history);
      expect(execution.exitCode, execution.stderr.toString()).toBe(0);
      expect(parseRuntimeSelection(execution.stdout.toString()).projects).toEqual([
        'consumer',
        'core',
        'middle',
        'spec-consumer',
        'unrelated',
        'validator',
      ]);
    },
    15000,
  );

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

  it.each([
    ['namedInputs null', { namedInputs: null }],
    ['namedInputs array', { namedInputs: [] }],
    ['named input null', { namedInputs: { default: null } }],
    ['named input entry null', { namedInputs: { default: [null] } }],
    ['targetDefaults null', { targetDefaults: null }],
    ['targetDefaults array', { targetDefaults: [] }],
    ['target default null', { targetDefaults: { test: null } }],
    ['target inputs null', { targetDefaults: { test: { inputs: null } } }],
    ['target inputs object', { targetDefaults: { test: { inputs: {} } } }],
    ['target dependsOn null', { targetDefaults: { test: { dependsOn: null } } }],
    ['target dependsOn object', { targetDefaults: { test: { dependsOn: {} } } }],
    ['filtered default null', { targetDefaults: { test: [null] } }],
    ['filtered default filter null', { targetDefaults: { test: [{ filter: null }] } }],
    ['filtered default inputs null', { targetDefaults: { test: [{ inputs: null }] } }],
  ] as const)(
    'refuses malformed consumed root configuration: %s',
    (_fault, patch) => {
      const history = workspace();
      write(history.root, 'nx.json', JSON.stringify(patch));
      const execution = invoke(history);
      expect(execution.exitCode).not.toBe(0);
      expect(execution.stdout.toString()).toBe('');
      expect(execution.stderr.toString()).toContain('Invalid runtime configuration in nx.json');
    },
    15000,
  );

  it.each([
    ['namedInputs null', { namedInputs: null }],
    ['namedInputs array', { namedInputs: [] }],
    ['named input null', { namedInputs: { default: null } }],
    ['targets null', { targets: null }],
    ['targets array', { targets: [] }],
    ['target inputs null', { targets: { test: { inputs: null } } }],
    ['target inputs object', { targets: { test: { inputs: {} } } }],
    ['target dependsOn null', { targets: { test: { dependsOn: null } } }],
    ['target dependsOn object', { targets: { test: { dependsOn: {} } } }],
    ['target dependency missing target', { targets: { test: { dependsOn: [{}] } } }],
  ] as const)(
    'refuses malformed consumed project configuration: %s',
    (_fault, patch) => {
      const history = workspace();
      write(history.root, 'modules/core/project.json', JSON.stringify({ name: 'core', ...patch }));
      const execution = invoke(history);
      expect(execution.exitCode).not.toBe(0);
      expect(execution.stdout.toString()).toBe('');
      expect(execution.stderr.toString()).toContain(
        'Invalid runtime configuration in modules/core/project.json',
      );
    },
    15000,
  );

  it.each(['adjacent', 'workspace'])(
    'refuses malformed consumed %s package Nx configuration before normalization',
    (source) => {
      const history = workspace();
      if (source === 'workspace') {
        rmSync(join(history.root, 'modules/core/project.json'));
        write(
          history.root,
          'package.json',
          JSON.stringify({ name: 'workspace', private: true, workspaces: ['modules/*'] }),
        );
      }
      write(
        history.root,
        'modules/core/package.json',
        JSON.stringify({ name: 'core', nx: { targets: null } }),
      );
      const execution = invoke(history);
      expect(execution.exitCode).not.toBe(0);
      expect(execution.stdout.toString()).toBe('');
      expect(execution.stderr.toString()).toContain(
        'Invalid runtime configuration in modules/core/package.json#nx',
      );
    },
    15000,
  );

  it('preserves filtered target defaults and optional configuration with actual Nx', () => {
    const history = workspace('runtime.config.json');
    write(
      history.root,
      'nx.json',
      JSON.stringify({
        namedInputs: nxJson.namedInputs,
        targetDefaults: {
          test: [
            { inputs: ['default'] },
            {
              filter: { projects: ['core'], executor: 'nx:run-commands' },
              inputs: ['default', '{workspaceRoot}/runtime.config.json'],
            },
          ],
        },
        customWorkspaceMetadata: { retained: true },
      }),
    );
    write(history.root, 'modules/validator/project.json', JSON.stringify({ name: 'validator' }));
    const execution = invoke(history);
    expect(execution.exitCode, execution.stderr.toString()).toBe(0);
    expect(parseRuntimeSelection(execution.stdout.toString()).projects).toEqual([
      'consumer',
      'core',
      'middle',
    ]);
  }, 15000);

  it('refuses malformed consumed configuration from an actual Nx plugin', () => {
    const history = workspace('modules/core/source.ts', 'modify', graph(), {
      'plugin.config.json': '{}',
      'configuration-plugin.cjs': `module.exports = {
        name: 'configuration-proof',
        createNodes: ['plugin.config.json', (paths) => paths.map((path) => [path, { projects: {
          'modules/plugin': { name: 'plugin', targets: {
            test: { executor: 'nx:run-commands', inputs: null, options: { command: 'bun --version' } }
          } }
        } }])]
      };`,
    });
    write(
      history.root,
      'nx.json',
      JSON.stringify({ namedInputs: nxJson.namedInputs, plugins: ['./configuration-plugin.cjs'] }),
    );
    const execution = invoke(history);
    expect(execution.exitCode).not.toBe(0);
    expect(execution.stdout.toString()).toBe('');
    expect(execution.stderr.toString()).toContain(
      'Invalid runtime configuration in project graph plugin',
    );
  }, 15000);

  it('accepts absent optional fields and JSONC while ignoring non-workspace package configuration', () => {
    const history = workspace();
    write(history.root, 'nx.json', '{}');
    write(
      history.root,
      'modules/core/project.json',
      `{
      // Nx project files permit JSONC.
      "name": "core", "targets": { "test": { "command": "bun --version" } }
    }`,
    );
    write(
      history.root,
      'fixtures/package.json',
      JSON.stringify({ name: 'unconsumed', nx: { targets: null } }),
    );
    const execution = invoke(history);
    expect(execution.exitCode, execution.stderr.toString()).toBe(0);
    expect(parseRuntimeSelection(execution.stdout.toString()).projects).toEqual([
      'consumer',
      'core',
      'middle',
    ]);
  }, 15000);

  it('selects a package-workspace Nx project without project.json', () => {
    const history = workspace('modules/package-module/source.ts', 'modify', graph(), {
      'package.json': JSON.stringify({
        name: 'workspace',
        private: true,
        workspaces: ['modules/*'],
      }),
      'modules/package-module/package.json': JSON.stringify({
        name: 'package-module',
        nx: { targets: { test: { command: 'bun --version' } } },
      }),
      'modules/package-module/source.ts': 'export const first = 1;',
    });
    const execution = invoke(history);
    expect(execution.exitCode, execution.stderr.toString()).toBe(0);
    expect(parseRuntimeSelection(execution.stdout.toString()).projects).toEqual(['package-module']);
  }, 15000);

  it.each([
    ['null workspaces', { workspaces: null }],
    ['string workspaces', { workspaces: 'modules/*' }],
    ['missing workspace packages', { workspaces: {} }],
    ['null workspace packages', { workspaces: { packages: null } }],
    ['string workspace packages', { workspaces: { packages: 'modules/*' } }],
    ['null workspace pattern', { workspaces: [null] }],
    ['numeric workspace pattern', { workspaces: { packages: [7] } }],
    ['null root nx', { workspaces: ['modules/*'], nx: null }],
    ['false root nx', { workspaces: ['modules/*'], nx: false }],
    ['array root nx', { workspaces: ['modules/*'], nx: [] }],
  ] as const)(
    'refuses malformed root package discovery: %s',
    (_fault, patch) => {
      const history = workspace('modules/package-module/source.ts', 'modify', graph(), {
        'package.json': JSON.stringify({
          name: 'workspace',
          private: true,
          workspaces: ['modules/*'],
        }),
        'modules/package-module/package.json': JSON.stringify({
          name: 'package-module',
          nx: { targets: { test: { command: 'bun --version' } } },
        }),
        'modules/package-module/source.ts': 'export const first = 1;',
      });
      write(
        history.root,
        'package.json',
        JSON.stringify({ name: 'workspace', private: true, ...patch }),
      );
      git(history.root, 'add', 'package.json');
      git(history.root, 'commit', '-qm', 'malformed package discovery');
      history.head = git(history.root, 'rev-parse', 'HEAD');
      const execution = invoke(history);
      expect(execution.exitCode).not.toBe(0);
      expect(execution.stdout.toString()).toBe('');
      expect(execution.stderr.toString()).toContain(
        'Invalid runtime configuration in package.json',
      );
    },
    15000,
  );

  it.each([
    ['array', ['modules/*', '!modules/excluded']],
    ['object', { packages: ['./modules/*', '!modules/excluded'], nohoist: ['optional-package'] }],
  ] as const)(
    'preserves legal %s root workspace patterns and root Nx membership',
    (_shape, workspaces) => {
      const history = workspace('modules/package-module/source.ts', 'modify', graph(), {
        'package.json': JSON.stringify({
          name: 'workspace',
          private: true,
          workspaces,
          nx: {
            targets: {
              test: {
                command: 'bun --version',
                inputs: ['{workspaceRoot}/modules/package-module/**'],
              },
            },
          },
        }),
        'modules/package-module/package.json': JSON.stringify({
          name: 'package-module',
          nx: { targets: { test: { command: 'bun --version' } } },
        }),
        'modules/package-module/source.ts': 'export const first = 1;',
        'modules/excluded/package.json': JSON.stringify({
          name: 'excluded',
          nx: { targets: null },
        }),
      });
      const execution = invoke(history);
      expect(execution.exitCode, execution.stderr.toString()).toBe(0);
      expect(parseRuntimeSelection(execution.stdout.toString()).projects).toEqual([
        'package-module',
        'workspace',
      ]);
    },
    15000,
  );

  it('refuses unreadable discovered project configuration', () => {
    const history = workspace();
    chmodSync(join(history.root, 'modules/core/project.json'), 0o000);
    const execution = invoke(history);
    expect(execution.exitCode).not.toBe(0);
    expect(execution.stdout.toString()).toBe('');
  }, 15000);

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

// Proof: S1–S5 remove each consumed input family; this selection test rejects each omission.
describe('real runtime-dispatch input selection', () => {
  it.each([
    'apps/twilight-structure/twilight-dash/cli/src/runs/dispatch-turn.ts',
    'apps/twilight-structure/twilight-dash/cli/src/bridge/runtime-client.ts',
    'apps/twilight-structure/twilight-dash/cli/src/runs/testing/runtime-dispatch-worker.ts',
    'apps/twilight-structure/twilight-dash/cli/src/runs/testing/fixtures.ts',
    'apps/twilight-structure/twilight-dash/cli/src/agents/activity-executor.ts',
    'apps/twilight-structure/twilight-dash/cli/src/clock.ts',
    'apps/twilight-structure/twilight-burokrat/cli/src/contracts/workflow-binding.ts',
  ])(
    'selects the actual boot consumer from committed declarations for %s',
    (path) => {
      const configured: ProjectGraph = { nodes: {}, dependencies: {}, externalNodes: {} };
      for (const projectPath of [
        'apps/wbs/be-01/project.json',
        'apps/twilight-structure/twilight-dash/cli/project.json',
        'apps/twilight-structure/twilight-burokrat/cli/project.json',
      ]) {
        const declaration = JSON.parse(
          readFileSync(join(ROOT, projectPath), 'utf8'),
        ) as ProjectGraphProjectNode['data'] & { name: string };
        const test = declaration.targets?.['test'];
        if (test === undefined)
          throw new Error('consumed project has no test target: ' + projectPath);
        configured.nodes[declaration.name] = {
          name: declaration.name,
          type: 'app',
          data: {
            root: dirname(projectPath),
            sourceRoot: declaration.sourceRoot,
            targets: { test },
          },
        };
        configured.dependencies[declaration.name] = [];
      }
      const history = workspace(path, 'modify', configured, {
        [path]: 'export const consumed = 1;\n',
      });
      const invocation = invoke(history);
      expect(invocation.exitCode, invocation.stderr.toString()).toBe(0);
      const selected = parseRuntimeSelection(invocation.stdout.toString());
      expect(selected.projects).toContain('wbs-be-01');
      expect(selected.projects).toContain('twilight-dash');
      if (path.includes('twilight-burokrat'))
        expect(selected.projects).toContain('twilight-burokrat');
    },
    30000,
  );
});
