import { readFile } from 'node:fs/promises';

import { expect, test } from 'bun:test';
import { createProjectGraphAsync, type NxJsonConfiguration } from 'nx/src/devkit-exports';
import { InProcessTaskHasher } from 'nx/src/hasher/task-hasher';
import { getFileMap } from 'nx/src/project-graph/build-project-graph';
import { createTaskGraph } from 'nx/src/tasks-runner/create-task-graph';
import { findCycle } from 'nx/src/tasks-runner/task-graph-utils';

const ROOT = new URL('../../../', import.meta.url);
const CONSUMERS = ['test', 'test:unit', 'test:store'];
interface BackendDeclaration {
  readonly targets: Record<
    string,
    {
      readonly executor?: string;
      readonly cache?: boolean;
      readonly inputs?: readonly string[];
      readonly options?: { readonly command?: string };
      readonly outputs?: readonly string[];
      readonly dependsOn?: readonly unknown[];
    }
  >;
  readonly implicitDependencies?: readonly string[];
}
const REQUIRED = [
  'apps/wbs/be-01/src/openapi/emit-openapi-cli.ts',
  'libs/wbs/domain/contracts/src/http/document-from-shapes.ts',
  'apps/wbs/mcp-01/src/main.ts',
  'apps/wbs/mcp-01/src/load/mcp-01-loopback.ts',
  'apps/wbs/mcp-01/src/oauth.ts',
  'apps/wbs/mcp-01/drizzle/20261022130000_mcp_family_person/migration.sql',
  'apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts',
  'apps/twilight-structure/twilight-dash/cli/src/mcp/token-command.ts',
  'apps/twilight-structure/twilight-dash/cli/src/mcp/machine-token.ts',
  'apps/twilight-structure/twilight-dash/cli/src/compute/configuration.ts',
];

// Proof: omitting full-test preparation failed cold-document ordinary Nx Swarm; a missing emitter produced numeric 130 and explicit consumer NOT RUN; exact restoration passed the same 1/28 case (2026-10-29).
test('ordinary backend full unit and store tasks require the local noncached MCP document producer', async () => {
  const project = JSON.parse(
    await readFile(new URL('apps/wbs/be-01/project.json', ROOT), 'utf8'),
  ) as BackendDeclaration;
  expect(project.targets['prepare-mcp-document']).toEqual({
    executor: 'nx:run-commands',
    cache: false,
    inputs: ['mcpAgentRuntime', '^production'],
    options: {
      command:
        'bun apps/wbs/be-01/src/openapi/emit-openapi-cli.ts apps/wbs/mcp-01/src/openapi.json',
    },
    outputs: ['{workspaceRoot}/apps/wbs/mcp-01/src/openapi.json'],
  });
  for (const consumer of CONSUMERS) {
    expect(project.targets[consumer].dependsOn).toEqual(['prepare-mcp-document']);
    expect(project.targets[consumer].inputs).toContain('mcpAgentRuntime');
  }
  expect(project.implicitDependencies ?? []).not.toContain('wbs-mcp-01');
});

// Proof: removing mcpAgentRuntime from full-test inputs failed this actual native input-membership consumer (2026-10-29).
// Proof: separate emitter, descriptor, MCP OAuth and Dash token byte faults changed all three native task hashes and exactly restored them after explicit selected-file refresh; this does not qualify automatic invalidation (2026-10-29).
test('native Nx backend task hashes include spawned production inputs and local prepare dependencies', async () => {
  const nxJson = JSON.parse(
    await readFile(new URL('nx.json', ROOT), 'utf8'),
  ) as NxJsonConfiguration;
  const previous = process.env['NX_DAEMON'];
  process.env['NX_DAEMON'] = 'false';
  try {
    const graph = await createProjectGraphAsync({ exitOnError: true });
    const { rustReferences } = getFileMap();
    if (rustReferences === null) throw new Error('Nx workspace file map absent');
    const taskGraph = createTaskGraph(graph, {}, ['wbs-be-01'], CONSUMERS, undefined, {});
    for (const consumer of CONSUMERS) {
      const id = `wbs-be-01:${consumer}`;
      expect(taskGraph.dependencies[id]).toContain('wbs-be-01:prepare-mcp-document');
      const hasher = new InProcessTaskHasher(graph, nxJson, rustReferences, {});
      const hash = await hasher.hashTask(
        taskGraph.tasks[id],
        taskGraph,
        process.env,
        ROOT.pathname,
        true,
      );
      if (hash.inputs === undefined) throw new Error('Nx task hash input receipt absent');
      expect(REQUIRED.filter((path) => !hash.inputs?.files.includes(path))).toEqual([]);
      expect(hash.inputs.files).not.toContain('apps/wbs/mcp-01/src/openapi-tools.test.ts');
      expect(hash.inputs.files).not.toContain('apps/wbs/mcp-01/src/openapi.json');
    }
    expect(taskGraph.tasks['wbs-be-01:prepare-mcp-document'].cache).toBe(false);
  } finally {
    if (previous === undefined) delete process.env['NX_DAEMON'];
    else process.env['NX_DAEMON'] = previous;
  }
}, 30000);

// Proof: restoring an independent MCP emitter produced two writers in this actual combined graph; exact restoration passed (2026-10-29).
test('combined ordinary backend and MCP test graph has one producer and a noncached noop alias', async () => {
  const project = JSON.parse(
    await readFile(new URL('apps/wbs/mcp-01/project.json', ROOT), 'utf8'),
  ) as BackendDeclaration;
  const previous = process.env['NX_DAEMON'];
  process.env['NX_DAEMON'] = 'false';
  try {
    const graph = await createProjectGraphAsync({ exitOnError: true });
    const tasks = createTaskGraph(graph, {}, ['wbs-be-01', 'wbs-mcp-01'], ['test'], undefined, {});
    const writers = Object.values(tasks.tasks).filter((task) => {
      const options = graph.nodes[task.target.project].data.targets?.[task.target.target]
        .options as { readonly command?: string } | undefined;
      return (
        options?.command ===
        'bun apps/wbs/be-01/src/openapi/emit-openapi-cli.ts apps/wbs/mcp-01/src/openapi.json'
      );
    });
    expect(writers.map((task) => task.id)).toEqual(['wbs-be-01:prepare-mcp-document']);
    expect(findCycle(tasks)).toBeNull();
    expect(project.targets['prepare']).toEqual({
      executor: 'nx:noop',
      outputs: ['{projectRoot}/src/openapi.json'],
      cache: false,
      dependsOn: [{ projects: ['wbs-be-01'], target: 'prepare-mcp-document' }],
    });
    expect(tasks.dependencies['wbs-mcp-01:prepare']).toEqual(['wbs-be-01:prepare-mcp-document']);
    expect(tasks.tasks['wbs-mcp-01:prepare'].cache).toBe(false);
  } finally {
    if (previous === undefined) delete process.env['NX_DAEMON'];
    else process.env['NX_DAEMON'] = previous;
  }
}, 30000);

// Proof: omitting the alias prerequisite removed the backend producer from this actual MCP-only graph; exact restoration passed (2026-10-29).
test('MCP-only prepare reaches the sole backend producer through its alias prerequisite', async () => {
  const previous = process.env['NX_DAEMON'];
  process.env['NX_DAEMON'] = 'false';
  try {
    const graph = await createProjectGraphAsync({ exitOnError: true });
    const tasks = createTaskGraph(graph, {}, ['wbs-mcp-01'], ['prepare'], undefined, {});
    expect(Object.hasOwn(tasks.tasks, 'wbs-be-01:prepare-mcp-document')).toBe(true);
    expect(Object.keys(tasks.tasks).sort()).toEqual([
      'wbs-be-01:prepare-mcp-document',
      'wbs-mcp-01:prepare',
    ]);
    expect(tasks.dependencies['wbs-mcp-01:prepare']).toEqual(['wbs-be-01:prepare-mcp-document']);
    expect(findCycle(tasks)).toBeNull();
    for (const target of ['test', 'serve', 'serve-local-solver'])
      expect(graph.nodes['wbs-mcp-01'].data.targets?.[target].dependsOn).toEqual(['prepare']);
  } finally {
    if (previous === undefined) delete process.env['NX_DAEMON'];
    else process.env['NX_DAEMON'] = previous;
  }
}, 30000);
