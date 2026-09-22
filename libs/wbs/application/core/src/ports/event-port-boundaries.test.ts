import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'bun:test';
import ts from 'typescript';

const coreRoot = fileURLToPath(new URL('../..', import.meta.url));
const coreSource = `${coreRoot}src/`;
const configPath = `${coreRoot}tsconfig.lib.json`;
const portHome = 'ports/project-event.ts';
const collectorHome = 'service/broadcast.ts';
const barrelHome = 'index.ts';

function underSrc(fileName: string): string {
  return fileName.startsWith(coreSource) ? fileName.slice(coreSource.length) : fileName;
}

/** Every production file of the core, as a path under `src`. */
async function scannedSources(): Promise<readonly string[]> {
  return (await readdir(coreSource, { recursive: true }))
    .filter((path) => path.endsWith('.ts') && !path.includes('.test.'))
    .map((path) => path.replaceAll('\\', '/'))
    .sort();
}

/**
 * The core compiled as one program, with its own `tsconfig.lib.json` options.
 *
 * Both throws are load-bearing: without the real options there are no path
 * mappings, `@wbs/domain` and `@wbs/contracts` do not resolve, and every symbol
 * this rule asks about comes back unresolved — which reads as an empty violation
 * list. They are not the wrong-root throw in {@link contractUses}: that one fires
 * when the program is built correctly over the wrong directory.
 */
function coreProgram(rootNames: readonly string[]): ts.Program {
  const read = ts.readConfigFile(configPath, (path) => ts.sys.readFile(path));
  if (read.error !== undefined) {
    throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, ' '));
  }
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, coreRoot);
  if (parsed.errors.length > 0) {
    throw new Error(
      `refused tsconfig.lib.json: ${parsed.errors.map((each) => each.code).join(', ')}`,
    );
  }
  return ts.createProgram({
    rootNames: rootNames.map((path) => `${coreSource}${path}`),
    options: { ...parsed.options, noEmit: true },
  });
}

/** The end of an alias chain, and every symbol passed through on the way. */
function aliasChain(checker: ts.TypeChecker, symbol: ts.Symbol): readonly ts.Symbol[] {
  const chain = [symbol];
  let current = symbol;
  while ((current.flags & ts.SymbolFlags.Alias) !== 0) {
    const next = checker.getAliasedSymbol(current);
    if (chain.includes(next)) break;
    chain.push(next);
    current = next;
  }
  return chain;
}

function declarationFiles(symbol: ts.Symbol): readonly string[] {
  return (symbol.declarations ?? []).map((each) => underSrc(each.getSourceFile().fileName));
}

/**
 * The module specifier that introduced a binding, if the identifier is one.
 *
 * A binding's module is what decides whether a contract was reached from the port
 * or from something that re-exports it, and `export * from` creates no alias for
 * the checker to follow — so the module has to be asked for directly.
 */
function moduleOfBinding(node: ts.Node): ts.Expression | undefined {
  let here = node;
  while (!ts.isSourceFile(here)) {
    if (ts.isImportDeclaration(here) || ts.isExportDeclaration(here)) return here.moduleSpecifier;
    if (ts.isImportTypeNode(here) && ts.isLiteralTypeNode(here.argument)) {
      return here.argument.literal;
    }
    if (ts.isImportEqualsDeclaration(here) && ts.isExternalModuleReference(here.moduleReference)) {
      return here.moduleReference.expression;
    }
    here = here.parent;
  }
  return undefined;
}

/** Every reference that reached a port contract through something other than the port. */
type ContractUse = readonly string[];

/**
 * Every checked import route by which a file of the core reaches one of the port's
 * exported symbols other than from the port itself.
 *
 * **The contract, exactly as proven.** The checker examines module exports and
 * identifier alias chains by symbol identity, and property, element and
 * indexed-access expressions by type identity when their base resolves to a module.
 * It does not trace value-binding indirection. An exported binding such as
 * `export const routeFor = subscriptionFor`, consumed through a named import, is not
 * prevented even though its type retains the port function's symbol. This joins
 * duplicate or merged declarations, structural copies and type aliases as an explicit
 * residual for subsequent kind-rule work.
 *
 * A name-based "sole declaration" promise cannot be kept against declaration merging —
 * a `declare module` augmentation merges into the port's own symbol — so no such
 * promise is made here. The residuals are assigned follow-up work under K2 to K6 in
 * `docs/superpowers/specs/2026-09-19-code-organization-design.md` and preparations 3
 * and 4 of the 040.6 map; naming them there is not evidence that anything prevents
 * them today.
 */
function contractUses(paths: readonly string[]): ContractUse {
  const program = coreProgram(paths);
  const checker = program.getTypeChecker();
  const portFile = program.getSourceFile(`${coreSource}${portHome}`);
  if (portFile === undefined) throw new Error(`the program holds no ${portHome}`);
  const portModule = checker.getSymbolAtLocation(portFile);
  if (portModule === undefined) throw new Error(`${portHome} is not a module`);
  const portSymbols = new Set(
    checker.getExportsOfModule(portModule).map((each) => {
      const chain = aliasChain(checker, each);
      return chain[chain.length - 1] ?? each;
    }),
  );
  const reached: string[] = [];

  /** Whether a module hands out a port symbol, following `export *` graphs. */
  function handsOutContract(moduleSymbol: ts.Symbol, seen: Set<ts.Symbol>): boolean {
    if (seen.has(moduleSymbol)) return false;
    seen.add(moduleSymbol);
    for (const exported of checker.getExportsOfModule(moduleSymbol)) {
      const chain = aliasChain(checker, exported);
      const end = chain[chain.length - 1] ?? exported;
      if (portSymbols.has(end)) return true;
      if ((end.flags & ts.SymbolFlags.Module) !== 0 && handsOutContract(end, seen)) return true;
    }
    return false;
  }

  for (const path of paths) {
    const file = program.getSourceFile(`${coreSource}${path}`);
    if (file === undefined) throw new Error(`the program holds no ${path}`);
    if (path === portHome) continue;
    /** A module reference that exposes a whole module object, and the module it names. */
    function wholeModuleReference(node: ts.Node): ts.Expression | undefined {
      if (ts.isImportDeclaration(node)) {
        const bindings = node.importClause?.namedBindings;
        return bindings !== undefined && ts.isNamespaceImport(bindings)
          ? node.moduleSpecifier
          : undefined;
      }
      if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) {
        const clause = node.exportClause;
        return clause === undefined || ts.isNamespaceExport(clause)
          ? node.moduleSpecifier
          : undefined;
      }
      if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference)
      ) {
        return node.moduleReference.expression;
      }
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
        return node.argument.literal;
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        return node.arguments.length > 0 ? node.arguments[0] : undefined;
      }
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'require'
      ) {
        return node.arguments.length > 0 ? node.arguments[0] : undefined;
      }
      return undefined;
    }

    /** The source file a type's symbol is declared in, when that symbol is a module. */
    function moduleFileOfType(type: ts.Type): string | undefined {
      const symbol = type.aliasSymbol ?? type.getSymbol();
      if (symbol === undefined) return undefined;
      const resolvedSymbol = aliasChain(checker, symbol);
      const end = resolvedSymbol[resolvedSymbol.length - 1] ?? symbol;
      const declaration = end.declarations?.find((each) => ts.isSourceFile(each));
      return declaration === undefined ? undefined : underSrc(declaration.getSourceFile().fileName);
    }

    /** Whether a type is one of the port's contracts, by the symbol the checker gives it. */
    function isPortType(type: ts.Type): boolean {
      for (const candidate of [type.aliasSymbol, type.getSymbol()]) {
        if (candidate === undefined) continue;
        const chain = aliasChain(checker, candidate);
        const end = chain[chain.length - 1] ?? candidate;
        if (portSymbols.has(end)) return true;
      }
      return false;
    }

    const visit = (node: ts.Node): void => {
      const exposed = wholeModuleReference(node);
      if (exposed !== undefined) {
        const moduleSymbol = checker.getSymbolAtLocation(exposed);
        if (moduleSymbol !== undefined) {
          const chain = aliasChain(checker, moduleSymbol);
          const end = chain[chain.length - 1] ?? moduleSymbol;
          const from = declarationFiles(end)[0];
          // The compatibility barrel is the one permitted wildcard: `index.ts` re-exports the
          // collector's file, which re-exports the contracts, and that is what keeps every
          // `@wbs/core` name working while the collector lives there.
          // Proof: deleting this `permitted` clause made the rule report
          // `index.ts: './service/broadcast' hands out the contracts from service/broadcast.ts`,
          // 0 pass and 1 fail (2026-09-22).
          const permitted = path === barrelHome && from === collectorHome;
          if (!permitted && from !== portHome && handsOutContract(end, new Set())) {
            reached.push(`${path}: ${exposed.getText()} hands out the contracts from ${from}`);
          }
        }
      }
      if (
        ts.isElementAccessExpression(node) ||
        ts.isPropertyAccessExpression(node) ||
        ts.isIndexedAccessTypeNode(node)
      ) {
        const base = ts.isIndexedAccessTypeNode(node) ? node.objectType : node.expression;
        const baseModule = moduleFileOfType(checker.getTypeAtLocation(base));
        if (
          baseModule !== undefined &&
          baseModule !== portHome &&
          isPortType(checker.getTypeAtLocation(node))
        ) {
          reached.push(`${path}: ${node.getText()} reads a contract out of ${baseModule}`);
        }
      }
      if (ts.isIdentifier(node)) {
        const symbol = checker.getSymbolAtLocation(node);
        if (symbol !== undefined) {
          const chain = aliasChain(checker, symbol);
          const end = chain[chain.length - 1] ?? symbol;
          if (portSymbols.has(end)) {
            const route = new Set(
              chain
                .slice(0, -1)
                .flatMap((each) => declarationFiles(each))
                .filter((file) => file !== path && file !== portHome),
            );
            const binding = moduleOfBinding(node);
            if (binding !== undefined) {
              const bound = checker.getSymbolAtLocation(binding);
              const boundFile =
                bound === undefined ? binding.getText() : declarationFiles(bound)[0];
              if (boundFile !== portHome) route.add(boundFile);
            }
            if (route.size > 0) {
              reached.push(`${path}: ${node.getText()} via ${[...route].sort().join(', ')}`);
            }
          } else if ((end.flags & ts.SymbolFlags.Module) !== 0) {
            const from = declarationFiles(end)[0];
            if (from !== portHome && handsOutContract(end, new Set())) {
              reached.push(`${path}: ${node.getText()} hands out the contracts from ${from}`);
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return [...new Set(reached)].sort();
}

describe('the neutral project-event port', () => {
  it('rejects the checked event-contract import routes', async () => {
    // Proof: thirteen routes into the contracts each failed here with `wbs-core:typecheck` exit 0 — a
    // named import and an `import` type through service/broadcast.ts; a type-only namespace of it; a value
    // namespace of it read by element access; a barrel import through index.ts; an awaited dynamic import
    // consumed as a property and, separately, by element access; a `typeof import(…)` indexed type; a
    // rename (`subscriptionFor as routeFor`); a `default` re-export; an `export * as events` namespace
    // consumed as a nested property and as a qualified `import` type; and a two-hop re-export chain, which
    // named both hops. Reported as `<file>: <name> via <route>`,
    // `<file>: <specifier> hands out the contracts from <route>`, or
    // `<file>: <expression> reads a contract out of <route>` (2026-09-22).
    expect(contractUses(await scannedSources())).toEqual([]);
  }, 120_000);
});
