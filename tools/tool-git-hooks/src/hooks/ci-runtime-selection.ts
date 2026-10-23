import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import Ajv, { type ValidateFunction } from 'ajv';
import nxSchema from 'nx/schemas/nx-schema.json';
import projectSchema from 'nx/schemas/project-schema.json';
import type { NxJsonConfiguration } from 'nx/src/config/nx-json';
import type { ProjectGraph } from 'nx/src/config/project-graph';
import type { InputDefinition } from 'nx/src/config/workspace-json-project-json';
import type { FileChange } from 'nx/src/project-graph/file-utils';

import { type Change, isProsePath, selectChanges, type Selection } from './ci-selection';

/** Complete module suites selected by runtime inputs, with the evidence for narrowing or widening. */
export interface RuntimeSelection {
  projects: string[];
  reasons: string[];
}

function isStrings(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((entry: unknown) => typeof entry === 'string' && entry.length > 0)
  );
}

const RUNTIME_TARGETS = ['test', 'typecheck', 'build', 'test:package'];

/** Active-change artifacts have known workflow consumers; this does not classify them as prose. */
function isChangeArtifact(path: string): boolean {
  // Proof: accepting all openspec/ paths failed all ten committed unknown-OpenSpec CLI negatives.
  return /^openspec\/changes\/(?!archive\/)[a-z][a-z0-9-]*\/(?:\.openspec\.yaml|(?:proposal|design|tasks|verify)\.md|specs\/[a-z][a-z0-9-]*\/spec\.md)$/.test(
    path,
  );
}

/** Only ordinary file additions and content edits establish an artifact's reviewed input shape. */
function isRegularArtifact(change: Change): boolean {
  // Proof: dropping newMode admitted executable/symlink additions; dropping oldMode admitted
  // a formerly executable design.md. Each committed-packet CLI negative failed with its guard removed.
  return (
    change.newMode === '100644' &&
    ((change.status === 'A' && change.oldMode === '000000' && change.oldPath === null) ||
      (change.status === 'M' && change.oldMode === '100644' && change.oldPath === change.newPath))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates only configuration used to establish runtime ownership and task dependencies.
 * The pinned Nx schemas define input/dependency variants, including filtered defaults; other
 * workspace, project and target properties stay under Nx's own validation policy.
 */
const configurationValidator = new Ajv({ strict: false });
const targetProperties = {
  inputs: projectSchema.properties.targets.additionalProperties.properties.inputs,
  dependsOn: projectSchema.properties.targets.additionalProperties.properties.dependsOn,
};
const validateProjectConfiguration = configurationValidator.compile({
  type: 'object',
  properties: {
    namedInputs: projectSchema.properties.namedInputs,
    targets: {
      type: 'object',
      additionalProperties: { type: 'object', properties: targetProperties },
    },
  },
  definitions: projectSchema.definitions,
});
const defaultProperties = {
  inputs: nxSchema.definitions.targetDefaultsConfig.properties.inputs,
  dependsOn: nxSchema.definitions.targetDefaultsConfig.properties.dependsOn,
};
const validateRootConfiguration = configurationValidator.compile({
  type: 'object',
  properties: {
    namedInputs: nxSchema.properties.namedInputs,
    targetDefaults: {
      type: 'object',
      additionalProperties: {
        anyOf: [
          { type: 'object', properties: defaultProperties },
          {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                ...defaultProperties,
                filter: nxSchema.definitions.targetDefaultArrayEntry.properties.filter,
              },
            },
          },
        ],
      },
    },
  },
  definitions: nxSchema.definitions,
});

/**
 * Nx's package discovery catches malformed patterns and returns an empty workspace set, and
 * includes the root project only for truthy nx. Validate those inputs before discovery so
 * malformed declarations cannot erase package-only runtime projects. Nx accepts either an
 * array of patterns or an object with a packages array; omitted workspaces and nx stay legal.
 */
const validatePackageDiscovery = configurationValidator.compile({
  type: 'object',
  properties: {
    workspaces: {
      anyOf: [
        { type: 'array', items: { type: 'string' } },
        {
          type: 'object',
          required: ['packages'],
          properties: { packages: { type: 'array', items: { type: 'string' } } },
        },
      ],
    },
    nx: { type: 'object' },
  },
});

/** Rejects malformed consumed configuration before Nx normalization can hide invalid containers. */
function validateConfiguration(
  validate: ValidateFunction,
  configuration: unknown,
  location: string,
): void {
  // Proof: disabling this refusal failed all 27 malformed-consumed CLI negatives, including raw
  // root/project/package configuration and null inputs returned by an actual Nx plugin.
  // Proof: disabling the same refusal also failed all ten malformed-root-package-discovery CLI
  // negatives, including null/malformed workspaces and null, false or array root nx declarations.
  if (!validate(configuration)) {
    throw new Error(
      `Invalid runtime configuration in ${location}: ${configurationValidator.errorsText(validate.errors)}`,
    );
  }
}

/**
 * Uses Nx's discovery and package-workspace matching so raw project inputs are checked before
 * graph merging turns malformed targets or namedInputs into empty objects. JSONC remains legal
 * for project files, as in Nx's project-json plugin; unrelated package manifests are not consumers.
 */
async function validateWorkspaceProjects(repository: string): Promise<void> {
  const { globWithWorkspaceContext } = await import('nx/src/utils/workspace-context');
  const { readJsonFile } = await import('nx/src/utils/fileutils');
  const { buildPackageJsonPatterns, buildPackageJsonWorkspacesMatcher } =
    await import('nx/src/plugins/package-json/create-nodes');
  const paths = await globWithWorkspaceContext(repository, ['**/project.json', '**/package.json']);
  const projectRoots = new Set(paths.filter((path) => path.endsWith('project.json')).map(dirname));
  const matchesWorkspace = buildPackageJsonWorkspacesMatcher(
    buildPackageJsonPatterns(repository, (path) =>
      readJsonFile<Record<string, unknown>>(join(repository, path)),
    ),
  );
  for (const path of paths) {
    if (path.endsWith('project.json')) {
      // Proof: chmod 000 on core/project.json made the unreadable-discovered-project CLI case refuse output.
      validateConfiguration(
        validateProjectConfiguration,
        readJsonFile<Record<string, unknown>>(join(repository, path)),
        path,
      );
    } else if (projectRoots.has(dirname(path)) || matchesWorkspace(path)) {
      const manifest = readJsonFile<Record<string, unknown>>(join(repository, path));
      if (manifest['nx'] !== undefined)
        validateConfiguration(validateProjectConfiguration, manifest['nx'], `${path}#nx`);
    }
  }
}

/** Reads trusted workspace configuration without Nx's catch-and-default readers. */
function readConfiguration(repository: string, name: string): Record<string, unknown> {
  // Proof: CLI faults deleted config, substituted a directory, denied reads and broke JSON; all failed without output.
  const configuration: unknown = JSON.parse(readFileSync(join(repository, name), 'utf8'));
  // Proof: removing this guard accepted nx.json=[] in the trusted-config CLI negative.
  if (!isRecord(configuration)) throw new Error(`Runtime selection requires an object in ${name}`);
  return configuration;
}

/** Universal validation inputs prove execution coverage, but cannot establish an unknown file's owner. */
function hasScopedFileset(input: string | InputDefinition): boolean {
  const fileset = typeof input === 'string' ? input : 'fileset' in input ? input.fileset : null;
  // Proof: retaining the universal fileset narrowed unknown/input.xyz to validator in pure/actual-Nx negatives.
  return fileset === null || !/^\{workspaceRoot\}\/(?:\*\*|\*\*\/\*)$/.test(fileset);
}

function retainScopedNames(namedInputs: NxJsonConfiguration['namedInputs']) {
  return Object.fromEntries(
    Object.entries(namedInputs ?? {}).map(([name, inputs]) => [
      name,
      inputs.filter(hasScopedFileset),
    ]),
  );
}

function retainScopedInputs(graph: ProjectGraph): ProjectGraph {
  return {
    ...graph,
    nodes: Object.fromEntries(
      Object.entries(graph.nodes).map(([name, project]) => [
        name,
        {
          ...project,
          data: {
            ...project.data,
            namedInputs: retainScopedNames(project.data.namedInputs),
            targets: Object.fromEntries(
              Object.entries(project.data.targets ?? {}).map(([target, configuration]) => [
                target,
                {
                  ...configuration,
                  inputs: configuration.inputs?.filter(hasScopedFileset),
                },
              ]),
            ),
          },
        },
      ]),
    ),
  };
}

/**
 * Uses Nx's task dependency expansion before its affected-project traversal. Retaining every
 * target would let lint-only workspace inputs select unrelated tests; retaining only root target
 * names would discard runtime inputs of dependency targets such as registry or test:unit.
 * Unknown paths require every module. Ownership, scoped runtime inputs and reviewed prose establish
 * known impact, as do regular active-change OpenSpec artifacts. Universal validation globs alone
 * cannot do so. Actual affected selection keeps every file and every declared runtime input.
 * Deletions and renames also widen because the candidate graph cannot prove former consumers.
 */
export async function selectRuntimeProjectsFromGraph(
  graph: ProjectGraph,
  changes: Change[],
  nxJson: NxJsonConfiguration,
  packageJson: Record<string, unknown>,
): Promise<RuntimeSelection> {
  for (const [name, project] of Object.entries(graph.nodes)) {
    validateConfiguration(validateProjectConfiguration, project.data, `project graph ${name}`);
  }
  const { createTaskGraph } = await import('nx/src/tasks-runner/create-task-graph');
  const { filterAffected } = await import('nx/src/project-graph/affected/affected-project-graph');
  const { WholeFileChange } = await import('nx/src/project-graph/file-utils');
  // Proof: excluding task dependencies broadened generated-contract/schema.json to every suite in the CLI test.
  const tasks = createTaskGraph(
    graph,
    {},
    Object.keys(graph.nodes),
    RUNTIME_TARGETS,
    undefined,
    {},
    false,
  );
  const retained = new Map<string, Set<string>>();
  for (const task of Object.values(tasks.tasks)) {
    const targets = retained.get(task.target.project) ?? new Set<string>();
    targets.add(task.target.target);
    retained.set(task.target.project, targets);
  }
  const dependencies: ProjectGraph['dependencies'] = Object.fromEntries(
    Object.entries(graph.dependencies).map(([project, edges]) => [project, [...edges]]),
  );
  // Proof: omitting explicit task edges produced no runtime consumers for generator inputs;
  // normal and continuous cross-project dependency regressions failed with the projection removed.
  for (const edges of [tasks.dependencies, tasks.continuousDependencies]) {
    for (const [taskId, required] of Object.entries(edges)) {
      const source = tasks.tasks[taskId].target.project;
      for (const requiredId of required) {
        const target = tasks.tasks[requiredId].target.project;
        if (source === target) continue;
        const projectEdges = dependencies[source] ?? [];
        if (!projectEdges.some((edge) => edge.target === target))
          projectEdges.push({ source, target, type: 'implicit' });
        dependencies[source] = projectEdges;
      }
    }
  }
  const runtimeGraph: ProjectGraph = {
    ...graph,
    dependencies,
    nodes: Object.fromEntries(
      Object.entries(graph.nodes).map(([name, project]) => [
        name,
        {
          ...project,
          data: {
            ...project.data,
            targets: Object.fromEntries(
              Object.entries(project.data.targets ?? {})
                // Proof: retaining lint selected validator tests for docs/plans/report.md in the actual-Nx CLI negative.
                .filter(([target]) => retained.get(name)?.has(target))
                .map(([target, configuration]) => [
                  target,
                  {
                    ...configuration,
                    // Proof: replacing omitted inputs with [] broadened core.config.json in the default-input negative.
                    inputs: configuration.inputs ?? ['default', '^default'],
                  },
                ]),
            ),
          },
        },
      ]),
    ),
  };
  const allProjects = Object.keys(graph.nodes)
    .filter((name) =>
      RUNTIME_TARGETS.some((target) => Object.hasOwn(graph.nodes[name].data.targets ?? {}, target)),
    )
    .sort();
  // Proof: removing this guard approved a workspace with no runtime targets in the CLI negative.
  if (allProjects.length === 0)
    throw new Error('Runtime project graph has no configured runtime targets');
  // Proof: removing this widening dropped unrelated/validator in both source delete/rename CLI negatives.
  if (changes.some((change) => change.status === 'D' || change.status === 'R')) {
    return {
      projects: allProjects,
      reasons: [
        'Deletion or rename requires all runtime modules; previous dependency graph is unavailable',
      ],
    };
  }
  for (const change of changes) {
    const artifact = [change.oldPath, change.newPath].find(
      (path): path is string => path !== null && isChangeArtifact(path),
    );
    // Proof: removing this refusal narrowed five nonregular committed packet cases to their declared consumers.
    if (artifact !== undefined && !isRegularArtifact(change)) {
      return {
        projects: allProjects,
        reasons: [
          `Unsupported OpenSpec artifact change for ${artifact}; all runtime modules required`,
        ],
      };
    }
  }
  const paths = new Set<string>();
  for (const change of changes) {
    for (const path of [change.oldPath, change.newPath]) {
      if (path === null) continue;
      paths.add(path);
    }
  }
  // Proof: removing this guard approved base=head with no suites in the empty-committed-diff CLI negative.
  if (paths.size === 0) throw new Error('Runtime diff has no changed paths');
  const files: FileChange[] = [...paths].map((file) => ({
    file,
    getChanges: () => [new WholeFileChange()],
  }));
  const recognitionGraph = retainScopedInputs(runtimeGraph);
  const recognitionConfig = { ...nxJson, namedInputs: retainScopedNames(nxJson.namedInputs) };
  for (const file of files) {
    if (isProsePath(file.file) || isChangeArtifact(file.file)) continue;
    const recognized = await filterAffected(
      recognitionGraph,
      [file],
      recognitionConfig,
      packageJson,
    );
    // Proof: removing this widening dropped modules for committed unknown/input.xyz in the CLI negative.
    if (Object.keys(recognized.nodes).length === 0) {
      return {
        projects: allProjects,
        reasons: [`Unknown runtime impact for ${file.file}; all runtime modules required`],
      };
    }
  }
  // Proof: using recognitionGraph here dropped validator for known core source in the universal-runtime negative.
  // Proof: stripping packet files dropped both consumers; using recognitionGraph dropped the universal
  // validator in the packet-only actual-Nx CLI regression. Both mutations failed before restoration.
  const affected = await filterAffected(runtimeGraph, files, nxJson, packageJson);
  const projects = allProjects.filter((name) => Object.hasOwn(affected.nodes, name));
  return {
    projects,
    reasons: [
      projects.length === 0
        ? `Only non-runtime target inputs changed: ${[...paths.keys()].join(', ')}`
        : `Nx runtime task inputs and transitive module dependencies changed: ${[...paths.keys()].join(', ')}`,
    ],
  };
}

/**
 * Constructs Nx evidence in a process rooted at the requested repository; Nx captures its root
 * at import time. The CLI revalidates immutable Git evidence before reading trusted configuration.
 * Missing tools, invalid configuration, failed graph construction and malformed output throw.
 */
export async function selectRuntimeProjects(
  repository: string,
  selection: Selection,
): Promise<RuntimeSelection> {
  const child = Bun.spawn(
    [process.execPath, import.meta.path, selection.base, selection.head, resolve(repository)],
    {
      cwd: repository,
      env: {
        ...process.env,
        NX_DAEMON: 'false',
        NX_ISOLATE_PLUGINS: 'false',
        // Proof: the former .nx/ci-runtime-selection location made the public-selector/docs-target
        // regression fail because production index validation rejected its untracked graph files.
        NX_WORKSPACE_DATA_DIRECTORY: join(
          resolve(repository),
          '.nx/workspace-data/ci-runtime-selection',
        ),
      },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  // Proof: removing this guard lost graph-failure context in the public-API broken-project negative.
  if (exitCode !== 0) throw new Error(`Runtime selection failed: ${stderr}`);
  return parseRuntimeSelection(stdout);
}

/** Rejects invalid subprocess evidence before consumers can use it to skip suites. */
export function parseRuntimeSelection(content: string): RuntimeSelection {
  const selected: unknown = JSON.parse(content);
  // Proof: removing this guard accepted malformed projects/reasons in subprocess-evidence negatives.
  if (
    !isRecord(selected) ||
    !isStrings(selected['projects']) ||
    !isStrings(selected['reasons']) ||
    selected['reasons'].length === 0
  ) {
    throw new Error('Malformed runtime selection output');
  }
  return { projects: selected['projects'], reasons: selected['reasons'] };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length !== 3) throw new Error('Expected base-sha, head-sha and repository');
  const [base, head, repository] = args;
  if (resolve(repository) !== process.cwd()) {
    throw new Error(
      'Usage: ci-runtime-selection.ts <base-sha> <head-sha> <repository>; cwd must match repository',
    );
  }
  // Proof: removing this reset accepted a broken project after cache warming in the stale-graph CLI negative.
  process.env['NX_FORCE_REUSE_CACHED_GRAPH'] = 'false';
  const selection = selectChanges(repository, base, head);
  const nxJson = readConfiguration(repository, 'nx.json');
  const packageJson = readConfiguration(repository, 'package.json');
  validateConfiguration(validateRootConfiguration, nxJson, 'nx.json');
  validateConfiguration(validatePackageDiscovery, packageJson, 'package.json');
  await validateWorkspaceProjects(repository);
  const { createProjectGraphAsync } = await import('nx/src/project-graph/project-graph');
  const graph = await createProjectGraphAsync({ exitOnError: false });
  process.stdout.write(
    `${JSON.stringify(await selectRuntimeProjectsFromGraph(graph, selection.changes, nxJson, packageJson))}\n`,
  );
}
