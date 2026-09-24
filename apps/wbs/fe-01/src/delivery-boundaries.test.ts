import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * `apps/wbs/fe-01`, where every config runs; `process.cwd()` for the reason
 * `src/test-tiers.test.ts` gives — under jsdom a module URL is a `/@fs/…` path.
 */
const APP = process.cwd();
const REPOSITORY = join(APP, '../../..');

/**
 * What delivery is: every production file under `src/components`, the router
 * that hands the signed-in region to its pages, and a module's own `view/`
 * adapters. Composition roots — `main.tsx`, `app.tsx`, `src/runtime` and each
 * module's `composition.ts` — are allowed to see everything, and `src/lib`
 * mixes adapters with hooks, so neither is delivery here.
 */
function deliveryFiles(): readonly string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(join(APP, dir), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) found.push(path);
    }
  };
  walk('src/components');
  for (const module of readdirSync(join(APP, 'src/modules'), { withFileTypes: true })) {
    if (!module.isDirectory()) continue;
    const view = `src/modules/${module.name}/view`;
    if (readdirSync(join(APP, 'src/modules', module.name)).includes('view')) walk(view);
  }
  found.push('src/app-router.tsx');
  return found.sort();
}

/**
 * The infrastructure delivery may not reach, each by the symbols that are it.
 *
 * A symbol is named here once, by the export or global that declares it, and
 * everything after that compares identities: a use is judged by where its
 * alias chain ends and where that symbol and each member it was reached
 * through are declared, never by how the use is spelled.
 */
const FORBIDDEN_EXPORTS: readonly { file: string; names: readonly string[]; is: string }[] = [
  {
    file: 'src/lib/wbs-api.ts',
    names: ['ProjectApi', 'DirectoryApi', 'httpProjectApi', 'httpDirectoryApi'],
    is: 'a broad HTTP client',
  },
  {
    file: 'src/lib/saved-plan-api.ts',
    names: ['SavedPlanApi', 'httpSavedPlanApi'],
    is: 'a broad HTTP client',
  },
  { file: 'src/lib/plan-refresh.ts', names: ['PlanReadRoutes'], is: 'a repository port' },
  {
    file: 'src/modules/plan-feed/contract.ts',
    names: ['PlanReadingPorts'],
    is: 'a repository port',
  },
  {
    file: 'src/modules/calendar-markers/contract.ts',
    names: ['CalendarMarkerRoutes', 'CalendarMarkerPorts'],
    is: 'a repository port',
  },
  {
    file: 'src/modules/plan-commands/contract.ts',
    names: ['PlanCommandRoutes', 'PlanCommandPorts'],
    is: 'a repository port',
  },
  {
    file: 'src/modules/preferences/contract.ts',
    names: ['BrowserStorage', 'RevocableBrowserStorage'],
    is: 'a repository',
  },
  { file: 'src/modules/preferences/contract.ts', names: ['Preferences'], is: 'a resource-service' },
  {
    file: 'src/modules/directory/contract.ts',
    names: ['DirectoryResource'],
    is: 'a resource-service',
  },
  {
    file: 'src/modules/project/composition.ts',
    names: ['projectServicesOver'],
    is: 'a composition root',
  },
];

/** Files every declaration of which is infrastructure, by what the file is. */
function forbiddenFile(path: string): string | undefined {
  // Wherever the package is installed: a linked `node_modules` resolves outside the checkout.
  if (/(^|\/)node_modules\/di-bag\//.test(path)) return 'a bag';
  if (path === 'apps/wbs/fe-01/src/lib/project-stream.ts') return 'a socket';
  if (/^apps\/wbs\/fe-01\/src\/modules\/[^/]+\/[^/]+\.resource\.ts$/.test(path)) {
    return 'a resource-service';
  }
  if (/^apps\/wbs\/fe-01\/src\/modules\/[^/]+\/[^/]+\.repository\.ts$/.test(path))
    return 'a repository';
  if (/^apps\/wbs\/fe-01\/src\/modules\/[^/]+\/composition\.ts$/.test(path))
    return 'a composition root';
  return undefined;
}

/** The browser globals that are a socket or storage, as the DOM library declares them. */
const FORBIDDEN_GLOBALS: readonly { names: readonly string[]; is: string }[] = [
  { names: ['WebSocket'], is: 'a socket' },
  {
    names: [
      'localStorage',
      'sessionStorage',
      'indexedDB',
      'Storage',
      'IDBFactory',
      'WindowLocalStorage',
      'WindowSessionStorage',
    ],
    is: 'storage',
  },
];

/**
 * The types delivery is handed by a context, a route or a runtime: none of
 * their members may be typed as infrastructure.
 */
const CONTEXT_TYPES: readonly { file: string; name: string }[] = [
  { file: 'src/runtime/application-runtime.ts', name: 'ApplicationServices' },
  { file: 'src/runtime/session-runtime.ts', name: 'SessionRuntime' },
  { file: 'src/modules/project/contract.ts', name: 'ProjectRuntime' },
  { file: 'src/app-router.tsx', name: 'SignedInRegion' },
];

/**
 * Every route by which delivery reaches infrastructure today, each with the
 * task that owns removing it. The check refuses any route not listed here, and
 * any route listed here that no longer exists, so this list only shrinks.
 */
const OWED: readonly string[] = [
  // The project catalog and the archival import: the catalog facade, task 13's remainder.
  'src/app-router.tsx: ProjectApi is a broad HTTP client',
  'src/components/wbs/project-page.tsx: ProjectApi is a broad HTTP client',
  'src/components/wbs/project-page.tsx: createProject is a broad HTTP client',
  'src/components/wbs/project-page.tsx: httpProjectApi is a broad HTTP client',
  'src/components/wbs/project-page.tsx: listProjects is a broad HTTP client',
  'src/components/wbs/project-page.tsx: openProject is a broad HTTP client',
  'src/components/wbs/project-page.tsx: renameProject is a broad HTTP client',
  'src/components/wbs/use-plan-import.ts: ProjectApi is a broad HTTP client',
  'src/components/wbs/use-plan-import.ts: importPlan is a broad HTTP client',
  'SignedInRegion.projectApi is a broad HTTP client',
  // The project runtime's source, which the page still builds: task 13's remainder.
  "src/components/wbs/project-page.tsx: '@/lib/project-stream' is a socket",
  "src/components/wbs/project-page.tsx: '@/modules/project/composition' is a composition root",
  'src/components/wbs/project-page.tsx: ProjectStreamDeps is a socket',
  'src/components/wbs/project-page.tsx: projectServicesOver is a composition root',
  'src/components/wbs/project-page.tsx: subscribeToProject is a socket',
  // The saved-plan shelf, which has no feature facade yet: task 10's.
  'src/components/wbs/saved-plans-panel.tsx: SavedPlanApi is a broad HTTP client',
  'src/components/wbs/saved-plans-panel.tsx: compare is a broad HTTP client',
  'src/components/wbs/saved-plans-panel.tsx: httpSavedPlanApi is a broad HTTP client',
  'src/components/wbs/saved-plans-panel.tsx: rename is a broad HTTP client',
  // The resource beneath `remembered`, for `src/lib/remembered.ts` alone: task 12's accepted debt.
  'ApplicationServices.preferences is a resource-service',
];

function underRepository(fileName: string): string {
  return relative(REPOSITORY, fileName).replaceAll('\\', '/');
}

/** The fe-01 application program, with its own `tsconfig.app.json` options. */
function applicationProgram(rootNames: readonly string[]): ts.Program {
  const configPath = join(APP, 'tsconfig.app.json');
  const read = ts.readConfigFile(configPath, (path) => ts.sys.readFile(path));
  if (read.error !== undefined) {
    throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, ' '));
  }
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, APP);
  if (parsed.errors.length > 0) {
    throw new Error(
      `refused tsconfig.app.json: ${parsed.errors.map((each) => each.code).join(', ')}`,
    );
  }
  return ts.createProgram({
    rootNames: rootNames.map((path) => join(APP, path)),
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

/** The module specifier of a node that introduces one. */
function moduleSpecifierOf(node: ts.Node): ts.Expression | undefined {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return node.moduleSpecifier;
  if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
    return node.argument.literal;
  if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    return node.arguments[0];
  }
  return undefined;
}

/**
 * Every member name a key can denote, read from the key's type rather than its spelling: a string
 * literal, a `const` holding one, or a union of them all name the same members.
 */
function literalKeys(type: ts.Type): readonly string[] {
  return (type.isUnion() ? type.types : [type]).flatMap((part) =>
    part.isStringLiteral() ? [part.value] : [],
  );
}

/** The declarations whose members are also forbidden: interfaces, classes and type literals. */
function containerOf(declaration: ts.Node): ts.Node | undefined {
  if (ts.isSourceFile(declaration)) return undefined;
  const parent = declaration.parent;
  if (ts.isInterfaceDeclaration(parent) || ts.isClassDeclaration(parent)) return parent;
  if (ts.isTypeLiteralNode(parent) && ts.isTypeAliasDeclaration(parent.parent))
    return parent.parent;
  return undefined;
}

function nameOf(container: ts.Node): ts.Identifier | undefined {
  if (
    ts.isInterfaceDeclaration(container) ||
    ts.isClassDeclaration(container) ||
    ts.isTypeAliasDeclaration(container)
  ) {
    return container.name;
  }
  return undefined;
}

interface Judge {
  /** What a symbol is, when it is infrastructure. */
  readonly infrastructure: (symbol: ts.Symbol) => string | undefined;
  readonly checker: ts.TypeChecker;
  readonly program: ts.Program;
}

function judgeOver(program: ts.Program): Judge {
  const checker = program.getTypeChecker();
  const forbidden = new Map<ts.Symbol, string>();
  for (const { file, names, is } of FORBIDDEN_EXPORTS) {
    const source = program.getSourceFile(join(APP, file));
    if (source === undefined) throw new Error(`the program holds no ${file}`);
    const moduleSymbol = checker.getSymbolAtLocation(source);
    if (moduleSymbol === undefined) throw new Error(`${file} is not a module`);
    const exports = checker.getExportsOfModule(moduleSymbol);
    for (const name of names) {
      const exported = exports.find((each) => each.name === name);
      if (exported === undefined) throw new Error(`${file} exports no ${name}`);
      for (const symbol of aliasChain(checker, exported)) forbidden.set(symbol, is);
    }
  }
  const dom = program.getSourceFiles().find((each) => each.fileName.endsWith('/lib.dom.d.ts'));
  if (dom === undefined) throw new Error('the program holds no DOM library');
  const globals = checker.getSymbolsInScope(dom, ts.SymbolFlags.Value | ts.SymbolFlags.Type);
  for (const { names, is } of FORBIDDEN_GLOBALS) {
    for (const name of names) {
      const symbol = globals.find((each) => each.name === name);
      if (symbol === undefined) throw new Error(`the DOM library declares no ${name}`);
      forbidden.set(symbol, is);
    }
  }

  const infrastructure = (symbol: ts.Symbol): string | undefined => {
    for (const each of aliasChain(checker, symbol)) {
      const named = forbidden.get(each);
      if (named !== undefined) return named;
      for (const declaration of each.declarations ?? []) {
        const byFile = forbiddenFile(underRepository(declaration.getSourceFile().fileName));
        if (byFile !== undefined) return byFile;
        const container = containerOf(declaration);
        const name = container === undefined ? undefined : nameOf(container);
        const owner = name === undefined ? undefined : checker.getSymbolAtLocation(name);
        const byOwner = owner === undefined ? undefined : forbidden.get(owner);
        if (byOwner !== undefined) return byOwner;
      }
    }
    return undefined;
  };
  return { infrastructure, checker, program };
}

/**
 * The routes by which delivery reaches infrastructure, one per file and symbol, each labelled by
 * the name it resolved to. Five kinds of node are judged: a module specifier, an identifier, an
 * element access or indexed-access type by its key's literal type, a destructured property by its
 * name or its computed key's literal type, and a bare `export *` by every export it re-exports.
 */
function deliveryRoutes(judge: Judge, files: readonly string[]): readonly string[] {
  const { checker, program, infrastructure } = judge;
  const routes = new Set<string>();
  for (const path of files) {
    const source = program.getSourceFile(join(APP, path));
    if (source === undefined) throw new Error(`the program holds no ${path}`);
    const judgeSymbol = (symbol: ts.Symbol | undefined, how: string): void => {
      if (symbol === undefined) return;
      const is = infrastructure(symbol);
      if (is !== undefined) routes.add(`${path}: ${how} is ${is}`);
    };
    const propertiesOf = (object: ts.Node, key: ts.Node): readonly ts.Symbol[] => {
      const owner = checker.getTypeAtLocation(object);
      return literalKeys(checker.getTypeAtLocation(key)).flatMap((name) => {
        const property = owner.getProperty(name);
        return property === undefined ? [] : [property];
      });
    };
    const visit = (node: ts.Node): void => {
      const specifier = moduleSpecifierOf(node);
      if (specifier !== undefined) {
        const moduleSymbol = checker.getSymbolAtLocation(specifier);
        const declared = moduleSymbol?.declarations?.[0]?.getSourceFile().fileName;
        const byFile =
          declared === undefined ? undefined : forbiddenFile(underRepository(declared));
        if (byFile !== undefined) routes.add(`${path}: ${specifier.getText()} is ${byFile}`);
      }
      if (ts.isIdentifier(node)) judgeSymbol(checker.getSymbolAtLocation(node), node.text);
      if (ts.isElementAccessExpression(node)) {
        for (const property of propertiesOf(node.expression, node.argumentExpression)) {
          judgeSymbol(property, property.name);
        }
      }
      if (ts.isIndexedAccessTypeNode(node)) {
        for (const property of propertiesOf(node.objectType, node.indexType)) {
          judgeSymbol(property, property.name);
        }
      }
      if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent)) {
        const key = node.propertyName ?? node.name;
        const bound = checker.getTypeAtLocation(node.parent);
        const names = ts.isComputedPropertyName(key)
          ? literalKeys(checker.getTypeAtLocation(key.expression))
          : ts.isIdentifier(key) || ts.isStringLiteralLike(key)
            ? [key.text]
            : [];
        for (const name of names) judgeSymbol(bound.getProperty(name), name);
      }
      if (ts.isExportDeclaration(node) && node.exportClause === undefined) {
        const specifier = node.moduleSpecifier;
        const moduleSymbol =
          specifier === undefined ? undefined : checker.getSymbolAtLocation(specifier);
        const exported = moduleSymbol === undefined ? [] : checker.getExportsOfModule(moduleSymbol);
        for (const symbol of exported) judgeSymbol(symbol, symbol.name);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return [...routes].sort();
}

/** The members of each context type that are typed as infrastructure. */
function contextRoutes(judge: Judge): readonly string[] {
  const { checker, program, infrastructure } = judge;
  const routes: string[] = [];
  for (const { file, name } of CONTEXT_TYPES) {
    const source = program.getSourceFile(join(APP, file));
    if (source === undefined) throw new Error(`the program holds no ${file}`);
    const moduleSymbol = checker.getSymbolAtLocation(source);
    const declared =
      moduleSymbol === undefined
        ? undefined
        : checker.getExportsOfModule(moduleSymbol).find((each) => each.name === name);
    if (declared === undefined) throw new Error(`${file} exports no ${name}`);
    for (const member of checker.getDeclaredTypeOfSymbol(declared).getProperties()) {
      const type = checker.getNonNullableType(checker.getTypeOfSymbol(member));
      const parts = type.isUnion() ? type.types : [type];
      for (const part of parts) {
        const symbols = [part.aliasSymbol, part.getSymbol()].filter((each) => each !== undefined);
        const is = symbols.map(infrastructure).find((each) => each !== undefined);
        if (is !== undefined) routes.push(`${name}.${member.name} is ${is}`);
      }
    }
  }
  return [...new Set(routes)].sort();
}

describe('delivery reaches no infrastructure', () => {
  it('refuses every route but the ones still owed', () => {
    const files = deliveryFiles();
    expect(files).toContain('src/components/wbs/project-page.tsx');
    const program = applicationProgram([
      ...files,
      ...FORBIDDEN_EXPORTS.map(({ file }) => file),
      ...CONTEXT_TYPES.map(({ file }) => file),
    ]);
    const judge = judgeOver(program);
    const found = [...deliveryRoutes(judge, files), ...contextRoutes(judge)].sort();
    expect(found).toEqual([...OWED].sort());
  }, 120_000);
});
