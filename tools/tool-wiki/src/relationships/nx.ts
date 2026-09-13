import { Buffer } from 'node:buffer';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { hashBytes, hashCanonical } from '../evidence/content-manifest';
import type { ExtractorIdentity } from './typescript';

export interface NxProjectSelector {
  name: string;
  root: string;
  sourceRoot?: string;
  projectType?: string;
  tags: string[];
  extractor: ExtractorIdentity;
  identity: string;
}

export interface NxDependencySelector {
  source: string;
  target: string;
  type: string;
  extractor: ExtractorIdentity;
  identity: string;
}

export interface NxTargetSelector {
  project: string;
  target: string;
  configuration: unknown;
  extractor: ExtractorIdentity;
  identity: string;
}

export interface NxRelationships {
  projects: NxProjectSelector[];
  dependencies: NxDependencySelector[];
  targets: NxTargetSelector[];
}

type UnknownRecord = Record<string, unknown>;

const compareText = (left: string, right: string): number =>
  Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));

function record(value: unknown, context: string): UnknownRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Nx project graph output malformed: ${context} must be an object`);
  }
  // This is checked above at the JSON boundary; Record is the precise internal representation.
  return value as UnknownRecord;
}

function textField(parent: UnknownRecord, field: string, context: string): string {
  const value = parent[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Nx project graph output malformed: ${context}.${field} must be text`);
  }
  return value;
}

function optionalText(parent: UnknownRecord, field: string, context: string): string | undefined {
  const value = parent[field];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(
      `Nx project graph output malformed: ${context}.${field} must be text when present`,
    );
  }
  return value;
}

function textArray(parent: UnknownRecord, field: string, context: string): string[] {
  const value = parent[field];
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error(`Nx project graph output malformed: ${context}.${field} must be text[]`);
  }
  const texts: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') {
      throw new Error(`Nx project graph output malformed: ${context}.${field} must be text[]`);
    }
    texts.push(entry);
  }
  return texts.sort(compareText);
}

interface TrustedNx {
  command: { kind: 'module'; path: string } | { kind: 'injected-cli'; path: string };
  extractor: ExtractorIdentity;
  runtimeCwd: string;
}

/**
 * Resolves the trusted Nx command module and runtime directory relative to this validator, never
 * relative to the candidate workspace. Bun starts in that trusted directory; only the already
 * started bootstrap enters the candidate to read its project graph. `WBS_WIKI_NX_CLI` is a trusted
 * fault-injection boundary used by production path negatives, and the preserved launcher clears it.
 */
function installedNx(): TrustedNx {
  let packagePath: string;
  try {
    packagePath = Bun.resolveSync('nx/package.json', import.meta.dir);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Nx tool unavailable: ${detail}`, { cause });
  }
  let bytes: Uint8Array;
  let input: unknown;
  try {
    bytes = readFileSync(packagePath);
    input = JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown;
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Nx tool identity unreadable: ${detail}`, { cause });
  }
  const version = textField(record(input, 'Nx package'), 'version', 'Nx package');
  const injectedCli = process.env['WBS_WIKI_NX_CLI'];
  const command: TrustedNx['command'] =
    injectedCli === undefined
      ? {
          kind: 'module',
          path: join(dirname(packagePath), 'dist', 'src', 'command-line', 'nx-commands.js'),
        }
      : { kind: 'injected-cli', path: injectedCli };
  return {
    command,
    extractor: {
      extractorId: 'nx.project-graph',
      version: `v${version}`,
      blob: hashBytes(bytes),
    },
    runtimeCwd: dirname(packagePath),
  };
}

/** Refuses Nx configuration forms that can load candidate-owned modules during graph discovery. */
function assertStaticNxConfiguration(workspace: string): void {
  const localNxPaths = [join(workspace, '.nx', 'installation'), join(workspace, '.nx', 'nxw.js')];
  // Proof: without this pre-launch boundary, Nx preferred a candidate `.nx/installation` and
  // required its `.nx/nxw.js`; both the direct extractor and preserved enforce launcher wrote
  // their sentinel before a later missing-graph refusal.
  if (localNxPaths.some((path) => existsSync(path))) {
    throw new Error('candidate-local Nx installation is unsupported');
  }
  const configurationPath = join(workspace, 'nx.json');
  if (!existsSync(configurationPath)) return;
  let input: unknown;
  try {
    const bytes = readFileSync(configurationPath);
    input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Nx configuration unreadable: ${detail}`, { cause });
  }
  const configuration = record(input, 'nx.json');
  // Nx resolves `extends` before exposing the merged plugin list, so inspecting only the local
  // `plugins` field would let an extended candidate configuration load executable modules.
  if (configuration['extends'] !== undefined) {
    throw new Error('candidate Nx configuration extends are unsupported');
  }
  const plugins = configuration['plugins'];
  // Proof: accepting a non-empty candidate plugin list made both the committed extractor and the
  // trusted lint write their sentinel before either path could refuse the candidate.
  if (plugins !== undefined && (!Array.isArray(plugins) || plugins.length > 0)) {
    throw new Error('candidate Nx plugins are unsupported');
  }
}

function readGraph(workspace: string, trustedNx: TrustedNx): UnknownRecord {
  const outputDirectory = mkdtempSync(join(tmpdir(), 'tool-wiki-nx-'));
  const outputPath = join(outputDirectory, 'graph.json');
  try {
    // A graph read is discovery, not a nested execution of the Nx task that launched wiki lint.
    // Proof: inheriting NX_INVOCATION_ROOT_PID from `nx test tool-wiki` made the pilot's
    // production lint fail with `tool-wiki:test -> tool-wiki:test` recursive task invocation.
    const nxTaskEnvironmentNames = new Set([
      'NX_FORKED_TASK_EXECUTOR',
      'NX_INVOCATION_ROOT_PID',
      'NX_INVOKED_BY_RUNNER',
      'NX_PREFIX_OUTPUT',
      'NX_SET_CLI',
      'NX_STREAM_OUTPUT',
      'NX_TASK_HASH',
      'NX_TASK_TARGET_CONFIGURATION',
      'NX_TASK_TARGET_PROJECT',
      'NX_TASK_TARGET_TARGET',
      'NX_TERMINAL_CAPTURE_STDERR',
      'NX_TERMINAL_OUTPUT_PATH',
      'NX_WORKSPACE_ROOT',
    ]);
    const environment = Object.fromEntries(
      Object.entries(process.env).filter(([name]) => !nxTaskEnvironmentNames.has(name)),
    );
    environment['NX_DAEMON'] = 'false';
    environment['NX_ISOLATE_PLUGINS'] = 'false';
    const graphArguments = ['graph', '--view=projects', '--groupByFolder', `--file=${outputPath}`];
    const command =
      trustedNx.command.kind === 'injected-cli'
        ? [process.execPath, trustedNx.command.path, ...graphArguments]
        : [
            process.execPath,
            '-e',
            // Proof: starting Bun in the candidate loaded its bunfig preload before this pinned
            // module; direct and preserved accepted/enforce sentinels were both written.
            'const workspace = process.argv[1]; const command = process.argv[2]; process.argv.splice(1, 2, command); process.chdir(workspace); require(command).commandsObject.argv;',
            workspace,
            trustedNx.command.path,
            ...graphArguments,
          ];
    const invocation = Bun.spawnSync(command, {
      cwd: trustedNx.runtimeCwd,
      env: environment,
      stderr: 'pipe',
      stdout: 'pipe',
    });
    // Proof: ignoring exit 17 made the injected failed graph command report `output missing`;
    // the production assertion requiring `Nx project graph unresolved` failed.
    if (invocation.exitCode !== 0) {
      const detail = invocation.stderr.toString('utf8').trim();
      throw new Error(
        `Nx project graph unresolved: ${detail.length === 0 ? `Nx exited ${String(invocation.exitCode)}` : detail}`,
      );
    }
    // Proof: removing this check made the exit-zero/no-output fixture report ENOENT as unreadable;
    // the production assertion requiring `Nx project graph output missing` failed.
    if (!existsSync(outputPath)) throw new Error('Nx project graph output missing');
    let bytes: Uint8Array;
    try {
      bytes = readFileSync(outputPath);
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      // Proof: removing this context made the mode-000 output report bare EACCES; the production
      // assertion requiring `Nx project graph output unreadable` failed.
      throw new Error(`Nx project graph output unreadable: ${detail}`, { cause });
    }
    let input: unknown;
    try {
      input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      // Proof: removing this boundary emitted bare `JSON Parse error: Expected '}'`; the
      // production assertion requiring malformed Nx graph output failed.
      throw new Error(`Nx project graph output malformed: ${detail}`, { cause });
    }
    return record(record(input, 'root')['graph'], 'graph');
  } finally {
    rmSync(outputDirectory, { force: true, recursive: true });
  }
}

/** Extracts project roots, project dependencies and exact target configurations from Nx output. */
export function extractNxRelationships(workspace: string): {
  extractor: ExtractorIdentity;
  relationships: NxRelationships;
} {
  assertStaticNxConfiguration(workspace);
  const trustedNx = installedNx();
  const graph = readGraph(workspace, trustedNx);
  const { extractor } = trustedNx;
  const nodes = record(graph['nodes'], 'graph.nodes');
  const dependencies = record(graph['dependencies'], 'graph.dependencies');
  const projectNames = Object.keys(nodes).sort(compareText);
  const projects: NxProjectSelector[] = [];
  const targets: NxTargetSelector[] = [];
  for (const name of projectNames) {
    const node = record(nodes[name], `graph.nodes.${name}`);
    if (textField(node, 'name', `graph.nodes.${name}`) !== name) {
      throw new Error(`Nx project graph output unresolved: node key ${name} differs from its name`);
    }
    const project = record(node['data'], `graph.nodes.${name}.data`);
    const sourceRoot = optionalText(project, 'sourceRoot', `graph.nodes.${name}.data`);
    const projectType = optionalText(project, 'projectType', `graph.nodes.${name}.data`);
    const selector = {
      name,
      root: textField(project, 'root', `graph.nodes.${name}.data`),
      // Proof: retaining absent optionals as `undefined` made the minimal real Nx project fail
      // production extraction at canonical hashing instead of publishing an omitted field.
      ...(sourceRoot === undefined ? {} : { sourceRoot }),
      ...(projectType === undefined ? {} : { projectType }),
      tags: textArray(project, 'tags', `graph.nodes.${name}.data`),
      extractor,
    };
    projects.push({ ...selector, identity: hashCanonical(selector) });
    const targetRecord = project['targets'];
    if (targetRecord === undefined) continue;
    const projectTargets = record(targetRecord, `graph.nodes.${name}.data.targets`);
    for (const target of Object.keys(projectTargets).sort(compareText)) {
      const targetSelector = {
        project: name,
        target,
        configuration: projectTargets[target],
        extractor,
      };
      targets.push({ ...targetSelector, identity: hashCanonical(targetSelector) });
    }
  }

  const edges: NxDependencySelector[] = [];
  const knownTargets = new Set([
    ...projectNames,
    ...Object.keys(record(graph['externalNodes'] ?? {}, 'graph.externalNodes')),
  ]);
  for (const source of Object.keys(dependencies).sort(compareText)) {
    if (!projectNames.includes(source)) {
      throw new Error(
        `Nx project graph output unresolved: dependency source ${source} is not a project`,
      );
    }
    const outgoing = dependencies[source];
    if (!Array.isArray(outgoing)) {
      throw new Error(
        `Nx project graph output malformed: graph.dependencies.${source} must be an array`,
      );
    }
    for (const [index, value] of outgoing.entries()) {
      const edge = record(value, `graph.dependencies.${source}[${String(index)}]`);
      const edgeSource = textField(
        edge,
        'source',
        `graph.dependencies.${source}[${String(index)}]`,
      );
      const target = textField(edge, 'target', `graph.dependencies.${source}[${String(index)}]`);
      const type = textField(edge, 'type', `graph.dependencies.${source}[${String(index)}]`);
      if (edgeSource !== source || !knownTargets.has(target)) {
        throw new Error(
          `Nx project graph output unresolved: dependency ${edgeSource} -> ${target} is outside the graph`,
        );
      }
      const selector = { source, target, type, extractor };
      edges.push({ ...selector, identity: hashCanonical(selector) });
    }
  }
  edges.sort((left, right) =>
    compareText(
      `${left.source}\0${left.target}\0${left.type}`,
      `${right.source}\0${right.target}\0${right.type}`,
    ),
  );
  return { extractor, relationships: { projects, dependencies: edges, targets } };
}
