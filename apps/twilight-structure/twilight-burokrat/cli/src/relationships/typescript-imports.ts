import { isBuiltin } from 'node:module';
import { basename } from 'node:path';

import ts from 'typescript';

import { type ParsedProject, workspacePath } from './typescript-compiler';
import type { ImportKind } from './typescript-core';

interface ImportSite {
  specifier: string;
  importKind: ImportKind;
  moduleSpecifier?: ts.StringLiteralLike;
}

type DependencyResolution =
  { readonly kind: 'ambient-non-code' } | { readonly kind: 'target'; readonly target: string };

export function importSites(sourceFile: ts.SourceFile): ImportSite[] {
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

export function resolveDependency(
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
      project.system,
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
    project.system,
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
