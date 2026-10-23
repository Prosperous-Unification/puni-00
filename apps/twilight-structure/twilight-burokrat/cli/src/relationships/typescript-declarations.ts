import { extname, resolve } from 'node:path';

import ts from 'typescript';

import { hashCanonical } from '../evidence/content-manifest';
import {
  compareText,
  formatDiagnostic,
  isJsonSource,
  type ParsedProject,
  workspacePath,
} from './typescript-compiler';
import type {
  ExtractorIdentity,
  PublicDeclarationSelector,
  ResolvedDeclaration,
} from './typescript-core';
import { importSites, resolveDependency } from './typescript-imports';

function emitSourceDeclaration(
  workspace: string,
  project: ParsedProject,
  sourceFile: ts.SourceFile,
  emitted: Map<string, ResolvedDeclaration>,
): void {
  const sourcePath = workspacePath(workspace, sourceFile.fileName);
  if (sourcePath === undefined) return;
  let output: ResolvedDeclaration | undefined;
  const emission = project.program.emit(
    sourceFile,
    (emittedPath, text) => {
      const normalizedEmitted =
        workspacePath(workspace, emittedPath) ??
        `${sourcePath.slice(0, sourcePath.length - extname(sourcePath).length)}.d.ts`;
      // Proof: removing this charge admitted the exact fixture's one-byte-short observation budget
      // in `observation budget charges every emitted declaration and selector before accumulation`.
      project.system.chargeOutput(text);
      output = { sourcePath, emittedPath: normalizedEmitted, text };
    },
    undefined,
    true,
  );
  if (emission.emitSkipped) {
    throw new Error(
      `TypeScript compiler declaration emit failed for ${project.configPath} source ${sourcePath}: ${emission.diagnostics.map(formatDiagnostic).join('; ') || 'no diagnostic'}`,
    );
  }
  if (output === undefined) {
    throw new Error(
      `TypeScript declaration output missing for ${project.configPath}: ${sourcePath}`,
    );
  }
  emitted.set(sourcePath, output);
}

function emitBundledDeclarations(
  workspace: string,
  project: ParsedProject,
  emitted: Map<string, ResolvedDeclaration>,
): void {
  const emission = project.program.emit(
    undefined,
    (emittedPath, text, _writeByteOrderMark, _onError, sourceFiles) => {
      const sourcePaths = (sourceFiles ?? [])
        .map((sourceFile) => workspacePath(workspace, sourceFile.fileName))
        .filter((sourcePath): sourcePath is string => sourcePath !== undefined)
        .sort(compareText);
      if (sourcePaths.length === 0) {
        throw new Error(`TypeScript declaration emit lost its source for ${emittedPath}`);
      }
      if (sourcePaths.length > 1) {
        throw new Error(
          `TypeScript bundled declaration has multiple candidate sources for ${project.configPath}: ${sourcePaths.join(', ')}`,
        );
      }
      const sourcePath = sourcePaths[0];
      const normalizedEmitted =
        workspacePath(workspace, emittedPath) ??
        `${sourcePath.slice(0, sourcePath.length - extname(sourcePath).length)}.d.ts`;
      // Proof: removing bundled text charging admitted the one-byte-short budget in
      // `observation budget charges bundled declaration text before accumulation`.
      project.system.chargeOutput(text);
      emitted.set(sourcePath, { sourcePath, emittedPath: normalizedEmitted, text });
    },
    undefined,
    true,
  );
  if (emission.emitSkipped) {
    throw new Error(
      `TypeScript compiler declaration emit failed for ${project.configPath}: ${emission.diagnostics
        .map(formatDiagnostic)
        .join('; ')}`,
    );
  }
}

export function emitDeclarations(workspace: string, project: ParsedProject): void {
  const emitted = new Map<string, ResolvedDeclaration>();
  if (project.options.outFile === undefined) {
    const sources = project.program
      .getSourceFiles()
      .map((sourceFile) => ({
        sourceFile,
        sourcePath: workspacePath(workspace, sourceFile.fileName),
      }))
      .filter(
        (source): source is { sourceFile: ts.SourceFile; sourcePath: string } =>
          source.sourcePath !== undefined &&
          !project.program.isSourceFileDefaultLibrary(source.sourceFile) &&
          !project.program.isSourceFileFromExternalLibrary(source.sourceFile),
      )
      .sort((left, right) => compareText(left.sourcePath, right.sourcePath));
    for (const { sourceFile } of sources) {
      if (sourceFile.isDeclarationFile || isJsonSource(sourceFile)) continue;
      emitSourceDeclaration(workspace, project, sourceFile, emitted);
    }
  } else {
    emitBundledDeclarations(workspace, project, emitted);
  }
  for (const sourceFile of project.program.getSourceFiles()) {
    if (
      !sourceFile.isDeclarationFile ||
      project.program.isSourceFileDefaultLibrary(sourceFile) ||
      project.program.isSourceFileFromExternalLibrary(sourceFile)
    ) {
      continue;
    }
    const sourcePath = workspacePath(workspace, sourceFile.fileName);
    if (sourcePath === undefined) continue;
    // Proof: omitting local declarations TypeScript does not re-emit kept the shapes mutation at
    // d2d5e2d6...; the production public-declaration stale assertion failed.
    // Proof: omitting local declaration charging admitted the one-byte-short observation budget.
    project.system.chargeOutput(sourceFile.text);
    emitted.set(sourcePath, { sourcePath, emittedPath: sourcePath, text: sourceFile.text });
  }
  project.declarations = emitted;
}

function declarationDependencies(
  workspace: string,
  project: ParsedProject,
  declaration: ResolvedDeclaration,
): string[] {
  const sourceFile = project.program.getSourceFile(resolve(workspace, declaration.sourcePath));
  if (sourceFile === undefined) {
    throw new Error(`TypeScript compiler lost source declaration ${declaration.sourcePath}`);
  }
  const dependencies = importSites(
    ts.createSourceFile(declaration.emittedPath, declaration.text, ts.ScriptTarget.Latest, true),
  ).flatMap((site) => {
    const resolution = resolveDependency(workspace, project, sourceFile, site);
    return resolution.kind === 'target' ? [resolution.target] : [];
  });
  const sourceReferences = sourceFile.referencedFiles.map((reference) => {
    const resolution = resolveDependency(workspace, project, sourceFile, {
      specifier: reference.fileName,
      importKind: 'reference-path',
    });
    // Proof: misclassifying `./globals.d.ts` as ambient at this declaration-only call made
    // `retains an original TypeScript source path reference in its emitted public closure` exit 1
    // with this exact ambient-reference error on 2026-09-21.
    if (resolution.kind !== 'target') {
      throw new Error(
        `TypeScript reference path resolved as ambient non-code: ${sourceFile.fileName} -> '${reference.fileName}'`,
      );
    }
    return resolution.target;
  });
  // Proof: omitting carried source references kept the public selector at 1fcc9f4f... when the
  // referenced global changed; the committed-candidate CLI stale assertion failed.
  return [...new Set([...dependencies, ...sourceReferences])].filter((path) => {
    if (project.declarations.has(path)) return true;
    const dependency = path.startsWith('external:')
      ? undefined
      : project.program.getSourceFile(resolve(workspace, path));
    if (dependency !== undefined && isJsonSource(dependency)) {
      throw new Error(
        `TypeScript public declaration JSON dependency unsupported: ${declaration.sourcePath} -> ${path}`,
      );
    }
    return false;
  });
}

function semanticDeclarationDependencies(
  workspace: string,
  project: ParsedProject,
  entrypoint: string,
): string[] {
  const sourceFile = project.program.getSourceFile(resolve(workspace, entrypoint));
  if (sourceFile === undefined) {
    throw new Error(`TypeScript compiler lost public entrypoint ${entrypoint}`);
  }
  const checker = project.program.getTypeChecker();
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (moduleSymbol === undefined) {
    throw new Error(`TypeScript compiler lost public module symbol ${entrypoint}`);
  }
  const paths = new Set<string>();
  const seenSymbols = new Set<ts.Symbol>();
  const seenTypes = new Set<ts.Type>();

  const visitTypeSyntax = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) {
      const symbol = checker.getSymbolAtLocation(node);
      if (symbol !== undefined) visitSymbol(symbol);
    }
    ts.forEachChild(node, visitTypeSyntax);
  };

  const visitDeclarationTypeSyntax = (node: ts.Node): void => {
    if (ts.isTypeNode(node)) {
      visitTypeSyntax(node);
      return;
    }
    if (ts.isBlock(node) || ts.isExpression(node)) return;
    ts.forEachChild(node, visitDeclarationTypeSyntax);
  };

  const visitSymbol = (symbol: ts.Symbol): void => {
    if (seenSymbols.has(symbol)) return;
    seenSymbols.add(symbol);
    if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) {
      visitSymbol(checker.getAliasedSymbol(symbol));
    }
    const declarations = symbol.declarations ?? [];
    const localDeclarations: ts.Declaration[] = [];
    for (const declaration of declarations) {
      const path = workspacePath(workspace, declaration.getSourceFile().fileName);
      if (path === undefined || !project.declarations.has(path)) continue;
      localDeclarations.push(declaration);
      paths.add(path);
    }
    if (localDeclarations.length === 0) return;
    const location = symbol.valueDeclaration ?? declarations[0];
    visitType(checker.getTypeOfSymbolAtLocation(symbol, location));
    if ((symbol.flags & ts.SymbolFlags.Type) !== 0) {
      visitType(checker.getDeclaredTypeOfSymbol(symbol));
    }
    // Proof: resolved-type traversal alone reduced `keyof ImplicitAmbient` to literals and skipped
    // a generic default; both ambient edits left the production structural selector unchanged.
    for (const declaration of localDeclarations) visitDeclarationTypeSyntax(declaration);
  };

  const visitType = (type: ts.Type): void => {
    if (seenTypes.has(type)) return;
    seenTypes.add(type);
    if (type.aliasSymbol !== undefined) visitSymbol(type.aliasSymbol);
    const typeSymbol = type.getSymbol();
    if (typeSymbol !== undefined) visitSymbol(typeSymbol);
    if (type.isUnionOrIntersection()) {
      for (const member of type.types) visitType(member);
    }
    if ((type.flags & ts.TypeFlags.Object) !== 0) {
      const objectType = type as ts.ObjectType;
      if ((objectType.objectFlags & ts.ObjectFlags.Reference) !== 0) {
        for (const argument of checker.getTypeArguments(objectType as ts.TypeReference)) {
          visitType(argument);
        }
      }
    }
    for (const property of checker.getPropertiesOfType(type)) visitSymbol(property);
    for (const signature of [
      ...checker.getSignaturesOfType(type, ts.SignatureKind.Call),
      ...checker.getSignaturesOfType(type, ts.SignatureKind.Construct),
    ]) {
      for (const parameter of signature.getParameters()) visitSymbol(parameter);
      visitType(signature.getReturnType());
    }
    for (const index of checker.getIndexInfosOfType(type)) visitType(index.type);
    const baseTypes = type.getBaseTypes();
    if (baseTypes !== undefined) for (const baseType of baseTypes) visitType(baseType);
  };

  for (const exported of checker.getExportsOfModule(moduleSymbol)) visitSymbol(exported);
  return [...paths].sort(compareText);
}

/**
 * Keeps sole-emitter compatibility; shared emissions belong only to the unique emitting
 * program whose parsed compiler roots include the entrypoint. Imports do not establish
 * ownership. Refuses missing emissions or ambiguous roots with configuration provenance.
 */
export function selectDeclarationOwner(
  workspace: string,
  entrypoint: string,
  projects: ParsedProject[],
): ParsedProject {
  const emitters = projects.filter((project) => project.declarations.has(entrypoint));
  if (emitters.length === 1) return emitters[0];
  // Proof: removing this branch lost the missing-entrypoint CLI diagnostic to the shared-root
  // refusal; `refuses a public entrypoint that no configured program emits` failed.
  if (emitters.length === 0) {
    throw new Error(
      `TypeScript public entrypoint ${entrypoint} resolved by 0 configs; expected exactly one emitting owner`,
    );
  }
  // Proof: restoring the emitter-count refusal made the unique-provider production CLI test
  // fail with three emitting configs, before provider identity and transitive closure assertions.
  const roots = emitters.filter((project) =>
    project.program
      .getRootFileNames()
      .some((path) => workspacePath(workspace, path) === entrypoint),
  );
  // Proof: removing this guard made two explicit roots exit 0; the shared-emissions negative
  // also lost its zero-root provenance to an undefined-owner error. Both CLI tests failed.
  if (roots.length !== 1) {
    const configPaths = (roots.length === 0 ? emitters : roots)
      .map((project) => project.configPath)
      .sort(compareText);
    throw new Error(
      `TypeScript public entrypoint ${entrypoint} resolved by ${String(emitters.length)} emitting configs with ${String(roots.length)} explicit root configs; expected exactly one: ${configPaths.join(', ')}`,
    );
  }
  return roots[0];
}

/**
 * Builds the public closure after semantic discovery. The serial legacy caller may collect
 * preceding compiler allocations at that boundary; bounded callers omit the callback so their
 * source observations and charging sequence remain unchanged.
 */
export function publicDeclaration(
  workspace: string,
  entrypoint: string,
  project: ParsedProject,
  extractor: ExtractorIdentity,
  collectBeforeDependencies?: () => void,
): PublicDeclarationSelector {
  if (!project.declarations.has(entrypoint)) {
    throw new Error(
      `TypeScript public entrypoint unresolved by ${project.configPath}: ${entrypoint}`,
    );
  }
  const visited = new Set<string>();
  // Proof: omitting semantic dependencies kept direct ambient use, an applicable augmentation,
  // `keyof` use, and a generic default outside the public closure; changing each declaration left
  // the committed extractor's structural identity unchanged.
  const pending = [entrypoint, ...semanticDeclarationDependencies(workspace, project, entrypoint)];
  collectBeforeDependencies?.();
  while (pending.length > 0) {
    const sourcePath = pending.pop();
    if (sourcePath === undefined || visited.has(sourcePath)) continue;
    const declaration = project.declarations.get(sourcePath);
    if (declaration === undefined) {
      throw new Error(`TypeScript emitted declaration unresolved: ${sourcePath}`);
    }
    visited.add(sourcePath);
    pending.push(...declarationDependencies(workspace, project, declaration));
  }
  const declarations = [...visited].sort(compareText).map((sourcePath) => {
    const declaration = project.declarations.get(sourcePath);
    if (declaration === undefined)
      throw new Error(`TypeScript declaration disappeared: ${sourcePath}`);
    return declaration;
  });
  const selector = {
    configPath: project.configPath,
    entrypoint,
    configurationIdentity: project.configurationIdentity,
    declarations,
    extractor,
  };
  // Proof: omitting public-selector charging admitted the one-byte-short observation budget.
  project.system.chargeOutput(JSON.stringify(selector));
  return { ...selector, identity: hashCanonical(selector) };
}
