import { Buffer } from 'node:buffer';
import { resolve } from 'node:path';

import ts from 'typescript';

import type { RelationshipRequest } from '../contracts/records';
import { hashCanonical } from '../evidence/content-manifest';
import {
  boundSource,
  compareText,
  formatDiagnostic,
  type ParsedProject,
  type TypeScriptSource,
  type TypeScriptSystem,
  workspacePath,
} from './typescript-compiler';
import type {
  ExtractorIdentity,
  PublicDeclarationSelector,
  TypeScriptImportSelector,
  TypeScriptRelationships,
  TypeScriptReverseEdgeSelector,
} from './typescript-core';
import { emitDeclarations, publicDeclaration } from './typescript-declarations';
import { importSites, resolveDependency } from './typescript-imports';
import {
  captureProject,
  type ProjectConfiguration,
  reconstructProject,
} from './typescript-project';

interface EmittingProject {
  configuration: ProjectConfiguration;
  roots: readonly string[];
  entrypoints: readonly string[];
}

function readCompilerIdentity(workspace: string, system: TypeScriptSystem): ExtractorIdentity {
  if (ts.version.length === 0) throw new Error('TypeScript compiler version unavailable');
  let packageBytes: Uint8Array;
  try {
    const source = system.readFile(resolve(workspace, 'node_modules/typescript/package.json'));
    if (source === undefined) throw new Error('trusted compiler package absent');
    packageBytes = Buffer.from(source);
  } catch (cause) {
    throw new Error('trusted TypeScript compiler identity is unreadable', { cause });
  }
  return {
    extractorId: 'typescript.compiler',
    version: `v${ts.version}`,
    blob: hashCanonical({
      implementation: 'bundled-typescript',
      packageBytes: Buffer.from(packageBytes).toString('base64'),
      version: ts.version,
    }),
  };
}

function collectImports(
  workspace: string,
  project: ParsedProject,
  extractor: ExtractorIdentity,
): TypeScriptImportSelector[] {
  const imports: TypeScriptImportSelector[] = [];
  for (const sourceFile of project.program.getSourceFiles()) {
    const source = workspacePath(workspace, sourceFile.fileName);
    if (
      source === undefined ||
      project.program.isSourceFileDefaultLibrary(sourceFile) ||
      project.program.isSourceFileFromExternalLibrary(sourceFile)
    )
      continue;
    for (const site of importSites(sourceFile)) {
      const resolution = resolveDependency(workspace, project, sourceFile, site);
      if (resolution.kind === 'ambient-non-code') continue;
      const selector = {
        source,
        specifier: site.specifier,
        target: resolution.target,
        importKind: site.importKind,
        extractor,
      };
      imports.push({ ...selector, identity: hashCanonical(selector) });
    }
  }
  return imports;
}

function observeImports(
  workspace: string,
  configuration: ProjectConfiguration,
  system: TypeScriptSystem,
  extractor: ExtractorIdentity,
): TypeScriptImportSelector[] {
  return collectImports(workspace, reconstructProject(workspace, configuration, system), extractor);
}

function observeDiagnostics(
  workspace: string,
  configuration: ProjectConfiguration,
  system: TypeScriptSystem,
  extractor: ExtractorIdentity,
): string[] {
  const project = reconstructProject(workspace, configuration, system);
  collectImports(workspace, project, extractor);
  // Proof: a gateway-only pre-diagnostic collection reclaimed preceding work and let gateway
  // finish; without it the frozen baseline exceeded 4 GiB during gateway diagnostics.
  Bun.gc(true);
  return ts.getPreEmitDiagnostics(project.program).map(formatDiagnostic);
}

function prepareEmission(
  workspace: string,
  configuration: ProjectConfiguration,
  system: TypeScriptSystem,
  extractor: ExtractorIdentity,
): ParsedProject {
  const project = reconstructProject(workspace, configuration, system);
  collectImports(workspace, project, extractor);
  // Emission/public replay reaches the same measured live-project diagnostic boundary above.
  Bun.gc(true);
  const diagnostics = ts.getPreEmitDiagnostics(project.program).map(formatDiagnostic);
  if (diagnostics.length > 0)
    throw new Error(`TypeScript compiler failed: ${diagnostics.join('; ')}`);
  emitDeclarations(workspace, project);
  return project;
}

function observeEmission(
  workspace: string,
  configuration: ProjectConfiguration,
  system: TypeScriptSystem,
  extractor: ExtractorIdentity,
  entrypoints: readonly string[],
): EmittingProject {
  const project = prepareEmission(workspace, configuration, system, extractor);
  return {
    configuration,
    roots: configuration.roots
      .map((path) => workspacePath(workspace, path))
      .filter((path): path is string => path !== undefined),
    entrypoints: entrypoints.filter((path) => project.declarations.has(path)),
  };
}

function selectOwner(
  entrypoint: string,
  projects: readonly EmittingProject[],
): ProjectConfiguration {
  const emitters = projects.filter((project) => project.entrypoints.includes(entrypoint));
  if (emitters.length === 1) return emitters[0].configuration;
  // Proof: disabling the zero-emitter guard failed the missing-emitter parity test.
  if (emitters.length === 0)
    throw new Error(
      `TypeScript public entrypoint ${entrypoint} resolved by 0 configs; expected exactly one emitting owner`,
    );
  const roots = emitters.filter((project) => project.roots.includes(entrypoint));
  // Proof: allowing zero or multiple roots failed the rootless/ambiguous-owner parity tests.
  if (roots.length !== 1) {
    const configPaths = (roots.length === 0 ? emitters : roots)
      .map((project) => project.configuration.configPath)
      .sort(compareText);
    throw new Error(
      `TypeScript public entrypoint ${entrypoint} resolved by ${String(emitters.length)} emitting configs with ${String(roots.length)} explicit root configs; expected exactly one: ${configPaths.join(', ')}`,
    );
  }
  return roots[0].configuration;
}

function observePublicDeclaration(
  workspace: string,
  configuration: ProjectConfiguration,
  system: TypeScriptSystem,
  extractor: ExtractorIdentity,
  entrypoint: string,
): PublicDeclarationSelector {
  const project = prepareEmission(workspace, configuration, system, extractor);
  // Proof: the frozen baseline exceeded 4 GiB during emitted dependency traversal; a targeted
  // pre-schema collection reclaimed preceding work and completed the diagnostic baseline.
  return publicDeclaration(workspace, entrypoint, project, extractor, () => {
    Bun.gc(true);
  });
}

function collectReverseEdges(
  imports: readonly TypeScriptImportSelector[],
  extractor: ExtractorIdentity,
): TypeScriptReverseEdgeSelector[] {
  const importersByProvider = new Map<string, TypeScriptReverseEdgeSelector['importers']>();
  for (const edge of imports) {
    if (edge.target.startsWith('external:')) continue;
    const importers = importersByProvider.get(edge.target) ?? [];
    importers.push({ source: edge.source, specifier: edge.specifier, importKind: edge.importKind });
    importersByProvider.set(edge.target, importers);
  }
  return [...importersByProvider]
    .sort(([left], [right]) => compareText(left, right))
    .map(([provider, importers]) => {
      importers.sort((left, right) =>
        compareText(
          `${left.source}\0${left.specifier}\0${left.importKind}`,
          `${right.source}\0${right.specifier}\0${right.importKind}`,
        ),
      );
      const selector = { provider, importers, extractor };
      return { ...selector, identity: hashCanonical(selector) };
    });
}

/**
 * Filesystem compatibility extraction trades repeated compiler work for one live program.
 * Initial configuration selections include only config ASTs; phase observations contain plain
 * selectors and diagnostic strings. Collection runs after each program-owning helper returns.
 * Proof: restoring eager filesystem routing exceeded 2 GiB on the committed 25-config
 * workload; restored serial routing completed below 850 MiB with the identical report.
 * The bounded-source runner is separate: its callback budgets never pay for these replays.
 * @throws Error in parse, import, diagnostic, emission and public-entrypoint order.
 */
export function extractSerialRelationships(
  workspace: string,
  request: RelationshipRequest['typescript'],
  source: TypeScriptSource,
): { extractor: ExtractorIdentity; relationships: TypeScriptRelationships } {
  const system = boundSource(workspace, source, { kind: 'legacy' });
  const extractor = readCompilerIdentity(workspace, system);
  try {
    const configurations: ProjectConfiguration[] = [];
    for (const configPath of request.configPaths) {
      configurations.push(captureProject(workspace, configPath, system));
      Bun.gc(true);
    }
    const importsByIdentity = new Map<string, TypeScriptImportSelector>();
    for (const configuration of configurations) {
      for (const selector of observeImports(workspace, configuration, system, extractor))
        importsByIdentity.set(selector.identity, selector);
      Bun.gc(true);
    }
    const imports = [...importsByIdentity.values()].sort((left, right) =>
      compareText(
        `${left.source}\0${left.specifier}\0${left.importKind}`,
        `${right.source}\0${right.specifier}\0${right.importKind}`,
      ),
    );
    const diagnostics: string[] = [];
    for (const configuration of configurations) {
      for (const message of observeDiagnostics(workspace, configuration, system, extractor))
        diagnostics.push(message);
      Bun.gc(true);
    }
    // Proof: disabling diagnostic refusal failed the later-diagnostic/earlier-emission
    // compound-fault parity test (fault-diagnostic-refusal receipt).
    if (diagnostics.length > 0)
      throw new Error(`TypeScript compiler failed: ${diagnostics.join('; ')}`);
    const emitters: EmittingProject[] = [];
    for (const configuration of configurations) {
      emitters.push(
        observeEmission(workspace, configuration, system, extractor, request.publicEntrypoints),
      );
      Bun.gc(true);
    }
    const reverseEdges = collectReverseEdges(imports, extractor);
    const publicDeclarations: PublicDeclarationSelector[] = [];
    for (const entrypoint of request.publicEntrypoints) {
      const owner = selectOwner(entrypoint, emitters);
      publicDeclarations.push(
        observePublicDeclaration(workspace, owner, system, extractor, entrypoint),
      );
      Bun.gc(true);
    }
    publicDeclarations.sort((left, right) => compareText(left.entrypoint, right.entrypoint));
    return { extractor, relationships: { imports, reverseEdges, publicDeclarations } };
  } finally {
    Bun.gc(true);
  }
}
