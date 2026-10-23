import { Buffer } from 'node:buffer';
import { dirname } from 'node:path';

import { hashCanonical } from '../evidence/content-manifest';
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

/** A complete static project census and exact original bytes, supplied by an IO adapter. */
export interface NxSource {
  projectPaths(): readonly string[];
  read(path: string): Uint8Array;
  /** Installed adapters may refuse a selector before hashing or appending it. */
  acceptSelector?(selector: unknown): void;
}

type UnknownRecord = Record<string, unknown>;

const compareText = (left: string, right: string): number =>
  Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));

function record(value: unknown, context: string): UnknownRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Nx project configuration malformed: ${context} must be an object`);
  }
  // The boundary above rejects null, arrays and primitive values before indexing object fields.
  return value as UnknownRecord;
}

function parseJson(read: () => Uint8Array, displayPath: string): UnknownRecord {
  try {
    const source = new TextDecoder('utf-8', { fatal: true }).decode(read());
    return record(JSON.parse(source) as unknown, displayPath);
  } catch (cause) {
    if (cause instanceof Error && cause.message.startsWith('Nx project configuration malformed:'))
      throw cause;
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Nx project configuration malformed: ${displayPath}: ${detail}`, { cause });
  }
}

function textField(parent: UnknownRecord, field: string, context: string): string {
  const value = parent[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Nx project configuration malformed: ${context}.${field} must be text`);
  }
  return value;
}

function optionalText(parent: UnknownRecord, field: string, context: string): string | undefined {
  const value = parent[field];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(
      `Nx project configuration malformed: ${context}.${field} must be text when present`,
    );
  }
  return value;
}

function textArray(parent: UnknownRecord, field: string, context: string): string[] {
  const value = parent[field];
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new Error(`Nx project configuration malformed: ${context}.${field} must be text[]`);
  }
  // Every array element has passed the string predicate at this parsing boundary.
  const texts = value as string[];
  return [...texts].sort(compareText);
}

function extractorIdentity(): ExtractorIdentity {
  return {
    extractorId: 'nx.project-json',
    version: 'v1',
    blob: hashCanonical({
      algorithm: 'static-project-json',
      dependencies: 'explicit-implicitDependencies',
      targetDefaults: 'target-name-shallow-merge',
      version: 1,
    }),
  };
}

/**
 * Reads Nx's declarative project files without loading plugins or invoking candidate code.
 * Inferred plugin targets are intentionally outside this trust boundary; admitted targets must be
 * explicit project.json data, optionally merged with the matching nx.json target default.
 */
export function extractNxRelationshipsFromSource(source: NxSource): {
  extractor: ExtractorIdentity;
  relationships: NxRelationships;
} {
  const extractor = extractorIdentity();
  const identifySelector = (selector: unknown): string => {
    // Proof: omitting this dependency lost the retained shared-default amplification early refusal.
    source.acceptSelector?.(selector);
    return hashCanonical(selector);
  };
  const nx = parseJson(() => source.read('nx.json'), 'nx.json');
  const targetDefaults =
    nx['targetDefaults'] === undefined
      ? {}
      : record(nx['targetDefaults'], 'nx.json.targetDefaults');
  const projectInputs = source
    .projectPaths()
    .map((path) => ({ path, input: parseJson(() => source.read(path), path) }));
  const names = new Set<string>();
  const projects: NxProjectSelector[] = [];
  const targets: NxTargetSelector[] = [];
  const dependenciesByProject = new Map<string, string[]>();

  for (const { path, input } of projectInputs) {
    const name = textField(input, 'name', path);
    if (names.has(name)) throw new Error(`Nx project configuration unresolved: duplicate ${name}`);
    names.add(name);
    const configuredRoot = optionalText(input, 'root', path);
    const derivedRoot = dirname(path).replaceAll('\\', '/');
    const root = configuredRoot ?? (derivedRoot === '.' ? '.' : derivedRoot);
    const sourceRoot = optionalText(input, 'sourceRoot', path);
    const projectType = optionalText(input, 'projectType', path);
    const selector = {
      name,
      root,
      ...(sourceRoot === undefined ? {} : { sourceRoot }),
      ...(projectType === undefined ? {} : { projectType }),
      tags: textArray(input, 'tags', path),
      extractor,
    };
    projects.push({ ...selector, identity: identifySelector(selector) });
    dependenciesByProject.set(name, textArray(input, 'implicitDependencies', path));

    if (input['targets'] === undefined) continue;
    const projectTargets = record(input['targets'], `${path}.targets`);
    for (const target of Object.keys(projectTargets).sort(compareText)) {
      const projectTarget = record(projectTargets[target], `${path}.targets.${target}`);
      const defaultTarget =
        targetDefaults[target] === undefined
          ? {}
          : record(targetDefaults[target], `nx.json.targetDefaults.${target}`);
      const merged: UnknownRecord = { ...defaultTarget, ...projectTarget };
      if (merged['configurations'] === undefined) merged['configurations'] = {};
      if (merged['parallelism'] === undefined) merged['parallelism'] = true;
      const targetSelector = { project: name, target, configuration: merged, extractor };
      targets.push({ ...targetSelector, identity: identifySelector(targetSelector) });
    }
  }

  projects.sort((left, right) => compareText(left.name, right.name));
  targets.sort((left, right) =>
    compareText(`${left.project}\0${left.target}`, `${right.project}\0${right.target}`),
  );
  const dependencies: NxDependencySelector[] = [];
  for (const source of [...dependenciesByProject.keys()].sort(compareText)) {
    for (const target of dependenciesByProject.get(source) ?? []) {
      if (!names.has(target)) {
        throw new Error(
          `Nx project configuration unresolved: dependency ${source} -> ${target} is not a project`,
        );
      }
      const selector = { source, target, type: 'implicit', extractor };
      dependencies.push({ ...selector, identity: identifySelector(selector) });
    }
  }
  dependencies.sort((left, right) =>
    compareText(`${left.source}\0${left.target}`, `${right.source}\0${right.target}`),
  );
  return { extractor, relationships: { projects, dependencies, targets } };
}
