import { Buffer } from 'node:buffer';
import { resolve } from 'node:path';

import type { RelationshipRequest } from '../contracts/records';
import { hashCanonical, serializeCanonical } from '../evidence/content-manifest';
import {
  boundSource,
  compareText,
  formatDiagnostic,
  parseProject,
  type TypeScriptConfigurationMode,
  type TypeScriptLimits,
  type TypeScriptPolicy,
  type TypeScriptRuntime,
  type TypeScriptSource,
  type TypeScriptSystem,
  workspacePath,
} from './typescript-compiler';
export type {
  TypeScriptConfigurationMode,
  TypeScriptLimits,
  TypeScriptSource,
} from './typescript-compiler';
import {
  emitDeclarations,
  publicDeclaration,
  selectDeclarationOwner,
} from './typescript-declarations';
import type { TypeScriptExecution } from './typescript-execution';
import { importSites, resolveDependency } from './typescript-imports';

export interface ExtractorIdentity {
  extractorId: string;
  version: string;
  blob: string;
}

export type ImportKind =
  | 'dynamic'
  | 'import-equals'
  | 're-export'
  | 'reference-lib'
  | 'reference-path'
  | 'reference-types'
  | 'type'
  | 'type-re-export'
  | 'value';

export interface TypeScriptImportSelector {
  source: string;
  specifier: string;
  target: string;
  importKind: ImportKind;
  extractor: ExtractorIdentity;
  identity: string;
}

export interface TypeScriptReverseEdgeSelector {
  provider: string;
  importers: { source: string; specifier: string; importKind: ImportKind }[];
  extractor: ExtractorIdentity;
  identity: string;
}

export interface ResolvedDeclaration {
  sourcePath: string;
  emittedPath: string;
  text: string;
}

export interface PublicDeclarationSelector {
  configPath: string;
  entrypoint: string;
  configurationIdentity: string;
  declarations: ResolvedDeclaration[];
  extractor: ExtractorIdentity;
  identity: string;
}

export interface TypeScriptRelationships {
  imports: TypeScriptImportSelector[];
  reverseEdges: TypeScriptReverseEdgeSelector[];
  publicDeclarations: PublicDeclarationSelector[];
}

function readCompilerIdentity(workspace: string, system: TypeScriptSystem): ExtractorIdentity {
  // Proof: ambient identity selection changed the retained selected-runtime version assertion.
  const ts = system.compiler;
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

/** Detached core observations shared by selected compatibility and internal derivative execution. */
export interface TypeScriptExtraction {
  extractor: ExtractorIdentity;
  relationships: TypeScriptRelationships;
}

function selectExtractor(
  workspace: string,
  system: TypeScriptSystem,
  execution: TypeScriptExecution,
): ExtractorIdentity {
  switch (execution.kind) {
    case 'selected':
      return readCompilerIdentity(workspace, system);
    // Proof: legacy identity substitution lost the independently pinned import selector digest
    // and reached the forbidden wrapper-package read in actual derivative core execution.
    case 'derivative':
      return Object.freeze({
        extractorId: 'typescript.compiler.paths-observer',
        version: 'v6.0.3.paths-observer.1',
        blob: execution.provenance.compilerExecutionIdentity,
      });
    // Proof: selecting legacy identity here reached forbidden source IO for the unknown branch.
    default:
      throw new Error('TypeScript execution selection invalid');
  }
}

/**
 * Internal shared runner; derivative selections are privately built by owned composition.
 * Selects execution identity before any import, reverse-edge or declaration selector hash.
 * It does not establish retained source ownership or install strict paths admission.
 * @internal
 */
export function runTypeScriptExtraction(
  workspace: string,
  request: RelationshipRequest['typescript'],
  source: TypeScriptSource,
  policy: TypeScriptPolicy,
  execution: TypeScriptExecution,
  mode: TypeScriptConfigurationMode,
): TypeScriptExtraction {
  // Proof: validation omission reached the source getter in
  // `compiler configuration mode rejects unknown before source callbacks`.
  if (!['compatible', 'retained-type-roots', 'retained-config-roots'].includes(mode))
    throw new Error('TypeScript configuration mode invalid');
  // Proof: installed namespace substitution lost the authenticated createProgram sentinel.
  const system = boundSource(workspace, source, policy, execution.compiler);
  const extractor = selectExtractor(workspace, system, execution);
  const projects = request.configPaths.map((configPath) =>
    parseProject(workspace, configPath, system, mode),
  );
  const importsByIdentity = new Map<string, TypeScriptImportSelector>();
  for (const project of projects) {
    for (const sourceFile of project.program.getSourceFiles()) {
      const source = workspacePath(workspace, sourceFile.fileName);
      // Proof: restoring the declaration-file exclusion kept the hidden provider at
      // cb10d2d3... after `additional.d.ts` was added; the production topology test failed.
      if (
        source === undefined ||
        project.program.isSourceFileDefaultLibrary(sourceFile) ||
        project.program.isSourceFileFromExternalLibrary(sourceFile)
      ) {
        continue;
      }
      for (const site of importSites(system.compiler, sourceFile)) {
        const resolution = resolveDependency(workspace, project, sourceFile, site);
        // Proof: replacing ambient omission with `external:ambient` made the production test
        // observe a fabricated CSS import selector on 2026-09-21.
        if (resolution.kind === 'ambient-non-code') continue;
        const selector = {
          source,
          specifier: site.specifier,
          target: resolution.target,
          importKind: site.importKind,
          extractor,
        };
        // Proof: omitting this charge admitted the one-byte-short observation budget
        // in `observation budget charges every emitted declaration and selector before accumulation`.
        system.chargeOutput(JSON.stringify(selector));
        // Proof: post-hash extractor replacement lost the independent actual import preimage digest.
        const identity = hashCanonical(selector);
        importsByIdentity.set(identity, { ...selector, identity });
      }
    }
  }
  const imports = [...importsByIdentity.values()].sort((left, right) =>
    compareText(
      `${left.source}\0${left.specifier}\0${left.importKind}`,
      `${right.source}\0${right.specifier}\0${right.importKind}`,
    ),
  );
  // Proof: ambient diagnostics lost the selected diagnostic sentinel through the bounded entry.
  const diagnostics = projects.flatMap((project) =>
    system.compiler.getPreEmitDiagnostics(project.program),
  );
  if (diagnostics.length > 0) {
    // Proof: removing this refusal made the `MissingType` fixture emit declarations and exit 0;
    // the production compiler-failure oracle expected exit 1.
    throw new Error(
      `TypeScript compiler failed: ${diagnostics.map((diagnostic) => formatDiagnostic(system.compiler, diagnostic)).join('; ')}`,
    );
  }
  for (const project of projects) emitDeclarations(workspace, project);

  const importersByProvider = new Map<string, TypeScriptReverseEdgeSelector['importers']>();
  for (const edge of imports) {
    if (edge.target.startsWith('external:')) continue;
    const importers = importersByProvider.get(edge.target) ?? [];
    importers.push({ source: edge.source, specifier: edge.specifier, importKind: edge.importKind });
    importersByProvider.set(edge.target, importers);
  }
  const reverseEdges = [...importersByProvider]
    .sort(([left], [right]) => compareText(left, right))
    .map(([provider, importers]) => {
      importers.sort((left, right) =>
        compareText(
          `${left.source}\0${left.specifier}\0${left.importKind}`,
          `${right.source}\0${right.specifier}\0${right.importKind}`,
        ),
      );
      const selector = { provider, importers, extractor };
      // Proof: omitting reverse-selector charging admitted the same one-byte-short observation budget.
      system.chargeOutput(JSON.stringify(selector));
      // Proof: post-hash extractor replacement lost the independent reverse-edge preimage digest.
      return { ...selector, identity: hashCanonical(selector) };
    });

  const publicDeclarations = request.publicEntrypoints
    .map((entrypoint) => {
      const owner = selectDeclarationOwner(workspace, entrypoint, projects);
      return publicDeclaration(workspace, entrypoint, owner, extractor);
    })
    .sort((left, right) => compareText(left.entrypoint, right.entrypoint));
  const extraction = { extractor, relationships: { imports, reverseEdges, publicDeclarations } };
  // Proof: removing this final check admitted one byte less than the complete empty-family
  // envelope in `exact final output bytes include identity and empty selector families`.
  if (
    policy.kind === 'bounded' &&
    Buffer.byteLength(serializeCanonical(extraction), 'utf8') > policy.limits.maximumOutputBytes
  )
    throw new Error('TypeScript output byte limit exceeded');
  return extraction;
}

/**
 * Shared selected-runtime compatibility entry. Only the filesystem wrapper chooses legacy policy.
 * The explicitly selected compiler grants no executable-byte authentication.
 * @internal
 */
export function extractTypeScriptRelationshipsWithPolicy(
  workspace: string,
  request: RelationshipRequest['typescript'],
  source: TypeScriptSource,
  policy: TypeScriptPolicy,
  compiler: TypeScriptRuntime,
  mode: TypeScriptConfigurationMode = 'compatible',
): TypeScriptExtraction {
  return runTypeScriptExtraction(
    workspace,
    request,
    source,
    policy,
    { kind: 'selected', compiler },
    mode,
  );
}

/**
 * Extracts through explicit compiler IO. Limits count every probe, returned read byte,
 * enumerated path and declaration/selector observation, including repeated work. Namespace
 * misses never reach the source except effective explicit typeRoots admission in retained mode.
 * Source implementations must bound their own return allocation;
 * this seam bounds compiler accumulation. The required compiler selects executable operations
 * without authenticating them, even when its version matches retained package metadata.
 */
export function extractTypeScriptRelationshipsFromSource(
  workspace: string,
  request: RelationshipRequest['typescript'],
  source: TypeScriptSource,
  limits: TypeScriptLimits,
  compiler: TypeScriptRuntime,
  mode: TypeScriptConfigurationMode = 'compatible',
): ReturnType<typeof extractTypeScriptRelationshipsWithPolicy> {
  const snapshot = captureTypeScriptLimits(limits);
  return extractTypeScriptRelationshipsWithPolicy(
    workspace,
    request,
    source,
    { kind: 'bounded', limits: snapshot },
    compiler,
    mode,
  );
}

/** Captures each finite compiler allowance once before source callbacks or owned execution. */
export function captureTypeScriptLimits(limits: TypeScriptLimits): TypeScriptLimits {
  const names: readonly (keyof TypeScriptLimits)[] = [
    'maximumProbes',
    'maximumReadBytes',
    'maximumDirectoryEntries',
    'maximumObservedOutputBytes',
    'maximumOutputBytes',
  ];
  // Proof: retaining caller limits let a source callback change the final ceiling to Infinity;
  // `compiler snapshots finite limits before source callbacks mutate caller policy` then failed.
  const snapshot = {
    maximumProbes: limits.maximumProbes,
    maximumReadBytes: limits.maximumReadBytes,
    maximumDirectoryEntries: limits.maximumDirectoryEntries,
    maximumObservedOutputBytes: limits.maximumObservedOutputBytes,
    maximumOutputBytes: limits.maximumOutputBytes,
  };
  for (const name of names) {
    const ceiling = snapshot[name];
    // Proof: omitting validation reached IO for every missing/nonfinite/fractional/negative
    // field; `compiler source rejects nonfinite, negative and fractional limits before IO` failed.
    if (!Number.isSafeInteger(ceiling) || ceiling < 0)
      throw new Error(`TypeScript ${name} must be a nonnegative safe integer`);
  }
  return snapshot;
}
