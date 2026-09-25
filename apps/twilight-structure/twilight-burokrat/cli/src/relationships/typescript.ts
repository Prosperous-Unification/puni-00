import { Buffer } from 'node:buffer';
import { existsSync, readFileSync } from 'node:fs';
import { isBuiltin } from 'node:module';
import { basename, dirname, extname, isAbsolute, relative, resolve } from 'node:path';

import ts from 'typescript';

import type { RelationshipRequest } from '../contracts/records';
import { hashCanonical } from '../evidence/content-manifest';

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

interface ParsedProject {
  configPath: string;
  configurationIdentity: string;
  options: ts.CompilerOptions;
  program: ts.Program;
  declarations: Map<string, ResolvedDeclaration>;
}

interface ImportSite {
  specifier: string;
  importKind: ImportKind;
  moduleSpecifier?: ts.StringLiteralLike;
}

type DependencyResolution =
  { readonly kind: 'ambient-non-code' } | { readonly kind: 'target'; readonly target: string };

const compareText = (left: string, right: string): number =>
  Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));

function workspacePath(workspace: string, path: string): string | undefined {
  const fromRoot = relative(workspace, path).replaceAll('\\', '/');
  // Proof: returning the temporary absolute root for `rootDir: '.'` made repeated extraction of
  // one commit receive configuration identities cc163641... and 0ec9a7e... instead of equality.
  if (fromRoot === '') return '.';
  return fromRoot === '..' || fromRoot.startsWith('../') || isAbsolute(fromRoot)
    ? undefined
    : fromRoot;
}

function formatDiagnostic(diagnostic: ts.Diagnostic): string {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
}

function isJsonSource(sourceFile: ts.SourceFile): boolean {
  return (sourceFile.flags & ts.NodeFlags.JsonFile) !== 0;
}

function normalizedCompilerValue(value: unknown, workspace: string): unknown {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') {
    const selectedPath = workspacePath(workspace, value);
    return selectedPath ?? value;
  }
  if (Array.isArray(value)) return value.map((entry) => normalizedCompilerValue(entry, workspace));
  if (typeof value !== 'object') {
    throw new Error(`TypeScript compiler configuration contains unsupported ${typeof value}`);
  }
  const normalized: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value)) {
    if (field !== undefined) normalized[key] = normalizedCompilerValue(field, workspace);
  }
  return normalized;
}

function parseProject(workspace: string, configPath: string): ParsedProject {
  const absoluteConfig = resolve(workspace, configPath);
  // Proof: removing this boundary made the production CLI report the absent
  // `missing-tsconfig.json` as unreadable; the exact absent assertion failed.
  if (!existsSync(absoluteConfig)) throw new Error(`TypeScript config absent: ${configPath}`);
  const config = ts.readConfigFile(absoluteConfig, (path) => ts.sys.readFile(path));
  if (config.error !== undefined) {
    // Proof: removing this branch made the directory supplied as config exit 0; the production
    // unreadable-config oracle expected exit 1 and failed before the malformed case.
    const detail = formatDiagnostic(config.error);
    const failure = config.error.code === 5083 ? 'unreadable' : 'malformed';
    throw new Error(`TypeScript config ${failure}: ${configPath}: ${detail}`);
  }
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    dirname(absoluteConfig),
    {},
    absoluteConfig,
  );
  if (parsed.errors.length > 0) {
    throw new Error(
      `TypeScript config malformed: ${configPath}: ${parsed.errors.map(formatDiagnostic).join('; ')}`,
    );
  }
  const options: ts.CompilerOptions = {
    ...parsed.options,
    declaration: true,
    declarationMap: false,
    emitDeclarationOnly: true,
    noEmit: false,
  };
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options,
    projectReferences: parsed.projectReferences,
  });
  const configurationIdentity = hashCanonical({
    configPath,
    fileNames: parsed.fileNames
      .map((fileName) => workspacePath(workspace, fileName))
      .filter((path): path is string => path !== undefined)
      .sort(compareText),
    options: normalizedCompilerValue(options, workspace),
  });
  return {
    configPath,
    configurationIdentity,
    options,
    program,
    declarations: new Map(),
  };
}

function importSites(sourceFile: ts.SourceFile): ImportSite[] {
  const sites: ImportSite[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const namedBindings = clause?.namedBindings;
      const allNamedTypeOnly =
        namedBindings !== undefined &&
        ts.isNamedImports(namedBindings) &&
        namedBindings.elements.length > 0 &&
        namedBindings.elements.every((element) => element.isTypeOnly);
      sites.push({
        specifier: node.moduleSpecifier.text,
        moduleSpecifier: node.moduleSpecifier,
        // Proof: treating named bindings alone as decisive made a default-value plus named-type
        // import receive `type`; the exact production selector expected `value` and failed.
        importKind:
          clause?.phaseModifier === ts.SyntaxKind.TypeKeyword ||
          (clause?.name === undefined && allNamedTypeOnly)
            ? 'type'
            : 'value',
      });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) {
      if (!ts.isStringLiteral(node.moduleSpecifier)) {
        throw new Error(`TypeScript export specifier is not a string in ${sourceFile.fileName}`);
      }
      const allNamedTypeOnly =
        node.exportClause !== undefined &&
        ts.isNamedExports(node.exportClause) &&
        node.exportClause.elements.length > 0 &&
        node.exportClause.elements.every((element) => element.isTypeOnly);
      sites.push({
        specifier: node.moduleSpecifier.text,
        moduleSpecifier: node.moduleSpecifier,
        // Proof: ignoring inline `type` modifiers made the production selector receive
        // `re-export` for `export { type PublicThing }`; its exact kind assertion failed.
        importKind: node.isTypeOnly || allNamedTypeOnly ? 'type-re-export' : 're-export',
      });
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      sites.push({
        specifier: node.moduleReference.expression.text,
        importKind: 'import-equals',
        moduleSpecifier: node.moduleReference.expression,
      });
    } else if (ts.isImportTypeNode(node)) {
      if (!ts.isLiteralTypeNode(node.argument) || !ts.isStringLiteral(node.argument.literal)) {
        throw new Error(
          `TypeScript import type specifier is not a string in ${sourceFile.fileName}`,
        );
      }
      // Proof: omitting ImportTypeNode traversal kept the hidden-type mutation at
      // 502b6f24...; the production public-declaration stale assertion failed.
      sites.push({
        specifier: node.argument.literal.text,
        importKind: 'type',
        moduleSpecifier: node.argument.literal,
      });
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      sites.push({
        specifier: node.arguments[0].text,
        importKind: 'dynamic',
        moduleSpecifier: node.arguments[0],
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  sites.push(
    // Proof: omitting path references kept the public selector at 53ad5864... after the referenced
    // global's `code` changed to number; the production stale-identity assertion failed.
    ...sourceFile.referencedFiles.map((reference) => ({
      specifier: reference.fileName,
      importKind: 'reference-path' as const,
    })),
    ...sourceFile.typeReferenceDirectives.map((reference) => ({
      specifier: reference.fileName,
      importKind: 'reference-types' as const,
    })),
    ...sourceFile.libReferenceDirectives.map((reference) => ({
      specifier: reference.fileName,
      importKind: 'reference-lib' as const,
    })),
  );
  return sites;
}

function externalTarget(specifier: string): string {
  if (specifier.startsWith('@')) {
    return `external:${specifier.split('/').slice(0, 2).join('/')}`;
  }
  return `external:${specifier.split('/')[0]}`;
}

/** Maps an emitted declaration import, whose synthetic AST has no checker binding, to its original program-bound source site. */
function boundImportSite(sourceFile: ts.SourceFile, site: ImportSite): ImportSite | undefined {
  if (site.moduleSpecifier?.getSourceFile() === sourceFile) return site;
  return importSites(sourceFile).find(
    (candidate) =>
      candidate.specifier === site.specifier &&
      candidate.importKind === site.importKind &&
      candidate.moduleSpecifier !== undefined,
  );
}

function isCompilerSupportedAmbientImport(
  project: ParsedProject,
  sourceFile: ts.SourceFile,
  site: ImportSite,
): boolean {
  // Proof: forcing this predicate false made the production ambient-non-code test fail with
  // `TypeScript import unresolved: ... -> './styles.css'` on 2026-09-21.
  const bound = boundImportSite(sourceFile, site);
  if (bound?.moduleSpecifier === undefined) return false;
  const symbol = project.program.getTypeChecker().getSymbolAtLocation(bound.moduleSpecifier);
  const declarations = symbol?.declarations ?? [];
  return (
    declarations.length > 0 &&
    declarations.every(
      (declaration) => ts.isModuleDeclaration(declaration) && ts.isStringLiteral(declaration.name),
    )
  );
}

function resolveDependency(
  workspace: string,
  project: ParsedProject,
  sourceFile: ts.SourceFile,
  site: ImportSite,
): DependencyResolution {
  if (site.importKind === 'reference-path') {
    const resolvedName = ts.resolveTripleslashReference(site.specifier, sourceFile.fileName);
    const referenced = project.program.getSourceFile(resolvedName);
    if (referenced === undefined) {
      const source = workspacePath(workspace, sourceFile.fileName) ?? sourceFile.fileName;
      // Proof: classifying the absent path as external lost this exact boundary to a later
      // compiler diagnostic; the production refusal test received only "File ... not found".
      throw new Error(`TypeScript reference path unresolved: ${source} -> '${site.specifier}'`);
    }
    if (
      project.program.isSourceFileDefaultLibrary(referenced) ||
      project.program.isSourceFileFromExternalLibrary(referenced)
    ) {
      return { kind: 'target', target: `external:typescript/reference-path:${site.specifier}` };
    }
    const target = workspacePath(workspace, referenced.fileName);
    if (target === undefined) {
      throw new Error(
        `TypeScript reference path resolved outside candidate: ${sourceFile.fileName} -> '${site.specifier}'`,
      );
    }
    return { kind: 'target', target };
  }
  if (site.importKind === 'reference-types') {
    const resolved = ts.resolveTypeReferenceDirective(
      site.specifier,
      sourceFile.fileName,
      project.options,
      ts.sys,
    ).resolvedTypeReferenceDirective;
    if (resolved?.resolvedFileName === undefined) {
      const source = workspacePath(workspace, sourceFile.fileName) ?? sourceFile.fileName;
      // Proof: classifying an unresolved types directive as external lost this boundary to the
      // later "Cannot find type definition file" diagnostic in the production refusal test.
      throw new Error(`TypeScript types reference unresolved: ${source} -> '${site.specifier}'`);
    }
    const referenced = project.program.getSourceFile(resolved.resolvedFileName);
    if (referenced === undefined) {
      throw new Error(
        `TypeScript types reference absent from compiler program: ${sourceFile.fileName} -> '${site.specifier}'`,
      );
    }
    if (
      resolved.isExternalLibraryImport === true ||
      project.program.isSourceFileDefaultLibrary(referenced) ||
      project.program.isSourceFileFromExternalLibrary(referenced)
    ) {
      return { kind: 'target', target: externalTarget(site.specifier) };
    }
    const target = workspacePath(workspace, referenced.fileName);
    if (target === undefined) {
      throw new Error(
        `TypeScript types reference resolved outside candidate: ${sourceFile.fileName} -> '${site.specifier}'`,
      );
    }
    return { kind: 'target', target };
  }
  if (site.importKind === 'reference-lib') {
    const expectedName = `lib.${site.specifier.toLowerCase()}.d.ts`;
    const libraries = project.program
      .getSourceFiles()
      .filter(
        (candidate) =>
          project.program.isSourceFileDefaultLibrary(candidate) &&
          basename(candidate.fileName).toLowerCase() === expectedName,
      );
    if (libraries.length !== 1) {
      const source = workspacePath(workspace, sourceFile.fileName) ?? sourceFile.fileName;
      // Proof: inventing an external target for the missing lib lost this exact boundary to the
      // later "Cannot find lib definition" diagnostic in the production refusal test.
      throw new Error(
        `TypeScript lib reference ${site.specifier} from ${source} resolved ${String(libraries.length)} default libraries; expected exactly one`,
      );
    }
    return { kind: 'target', target: `external:typescript/${expectedName}` };
  }
  // Proof: removing built-in classification made the production CLI fail on the fixture's
  // `node:fs` edge with `TypeScript import unresolved: packages/provider/src/hidden.ts`.
  if (isBuiltin(site.specifier)) {
    return { kind: 'target', target: externalTarget(site.specifier) };
  }
  const resolved = ts.resolveModuleName(
    site.specifier,
    sourceFile.fileName,
    project.options,
    ts.sys,
  ).resolvedModule;
  // Proof: treating the unresolved import as external made the production CLI report only
  // `Cannot find module './absent'`; the exact source/specifier assertion failed.
  if (resolved === undefined) {
    if (isCompilerSupportedAmbientImport(project, sourceFile, site)) {
      // Proof: requiring the specifier to exist on disk made the virtual-stylesheet production
      // test fail with its exact CSS unresolved diagnostic on 2026-09-21.
      return { kind: 'ambient-non-code' };
    }
    const source = workspacePath(workspace, sourceFile.fileName) ?? sourceFile.fileName;
    // Proof: classifying every unresolved module as ambient made the real `./absent` production
    // test lose this exact source/specifier refusal on 2026-09-21.
    throw new Error(`TypeScript import unresolved: ${source} -> '${site.specifier}'`);
  }
  if (resolved.isExternalLibraryImport === true) {
    return { kind: 'target', target: externalTarget(site.specifier) };
  }
  return {
    kind: 'target',
    target: workspacePath(workspace, resolved.resolvedFileName) ?? externalTarget(site.specifier),
  };
}

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

function emitDeclarations(workspace: string, project: ParsedProject): void {
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

function publicDeclaration(
  workspace: string,
  entrypoint: string,
  project: ParsedProject,
  extractor: ExtractorIdentity,
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
  return { ...selector, identity: hashCanonical(selector) };
}

function readCompilerIdentity(workspace: string): ExtractorIdentity {
  if (ts.version.length === 0) throw new Error('TypeScript compiler version unavailable');
  let packageBytes: Uint8Array;
  try {
    packageBytes = readFileSync(resolve(workspace, 'node_modules/typescript/package.json'));
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

/** Extracts resolved imports, provider reverse edges and transitive public declaration surfaces. */
export function extractTypeScriptRelationships(
  workspace: string,
  request: RelationshipRequest['typescript'],
): { extractor: ExtractorIdentity; relationships: TypeScriptRelationships } {
  const extractor = readCompilerIdentity(workspace);
  const projects = request.configPaths.map((configPath) => parseProject(workspace, configPath));
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
      for (const site of importSites(sourceFile)) {
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
  const diagnostics = projects.flatMap((project) => ts.getPreEmitDiagnostics(project.program));
  if (diagnostics.length > 0) {
    // Proof: removing this refusal made the `MissingType` fixture emit declarations and exit 0;
    // the production compiler-failure oracle expected exit 1.
    throw new Error(`TypeScript compiler failed: ${diagnostics.map(formatDiagnostic).join('; ')}`);
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
      return { ...selector, identity: hashCanonical(selector) };
    });

  const publicDeclarations = request.publicEntrypoints
    .map((entrypoint) => {
      const owners = projects.filter((project) => project.declarations.has(entrypoint));
      if (owners.length !== 1) {
        throw new Error(
          `TypeScript public entrypoint ${entrypoint} resolved by ${String(owners.length)} configs; expected exactly one`,
        );
      }
      const owner = owners[0];
      return publicDeclaration(workspace, entrypoint, owner, extractor);
    })
    .sort((left, right) => compareText(left.entrypoint, right.entrypoint));
  return { extractor, relationships: { imports, reverseEdges, publicDeclarations } };
}
