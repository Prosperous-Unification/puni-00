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
    // Proof: 2026-09-25, d1 — `import { httpDirectoryApi }` in page-nav.tsx failed with
    // `+ …: httpDirectoryApi is a broad HTTP client`. d2 — the renamed `httpDirectoryApi as connect`
    // failed with `connect is …` and `httpDirectoryApi is …`. d4 — `import type * as wbs`,
    // `wbs.DirectoryApi` failed with `+ …: DirectoryApi is a broad HTTP client`.
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
  // Proof: 2026-09-25, d9 — `import { DiBag } from 'di-bag'` in page-nav.tsx failed with
  // `+ …: 'di-bag' is a bag`, `DiBag is a bag` and `createBuilder is a bag`.
  if (/(^|\/)node_modules\/di-bag\//.test(path)) return 'a bag';
  if (path === 'apps/wbs/fe-01/src/lib/project-stream.ts') return 'a socket';
  // Proof: 2026-09-25, d10 — importing `createDirectory` from the directory resource file failed with
  // `+ …: '@/modules/directory/directory.resource' is a resource-service` and
  // `+ …: createDirectory is a resource-service`.
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
  // Proof: 2026-09-25, d8 — `new WebSocket('ws://localhost')` in page-nav.tsx failed with
  // `+ …: WebSocket is a socket`.
  { names: ['WebSocket'], is: 'a socket' },
  {
    names: [
      // Proof: 2026-09-25, d6 — `localStorage.getItem('kept')` in page-nav.tsx failed with
      // `+ …: getItem is storage` and `+ …: localStorage is storage`.
      'localStorage',
      'sessionStorage',
      'indexedDB',
      'Storage',
      'IDBFactory',
      'WindowLocalStorage',
      // Proof: 2026-09-25, d7 — `window.sessionStorage` in page-nav.tsx failed with
      // `+ …: sessionStorage is storage`, a member of `WindowSessionStorage`.
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
  // Proof: 2026-09-25, c1 — `ProjectRuntime` given `readonly client: ProjectApi` failed with
  // `+ "ProjectRuntime.client is a broad HTTP client"`.
  { file: 'src/modules/project/contract.ts', name: 'ProjectRuntime' },
  { file: 'src/app-router.tsx', name: 'SignedInRegion' },
];

/**
 * Every route by which delivery reaches infrastructure today, each with the
 * task that owns removing it. The check refuses any route not listed here, and
 * any route listed here that no longer exists, so this list only shrinks.
 */
// Proof: 2026-09-25, o1 — `SignedInRegion.projectApi` narrowed to `undefined` failed with
// `- "SignedInRegion.projectApi is a broad HTTP client"`: a paid-off route fails until struck.
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
  'src/components/wbs/project-page.tsx: ProjectStream is a socket',
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
 * literal, a `const` holding one, a union of them, or a type parameter constrained to them all name
 * the same members.
 */
function literalKeys(checker: ts.TypeChecker, type: ts.Type): readonly string[] {
  const read =
    // Proof: 2026-09-25, d21 — an uncalled `<K extends 'localStorage' | 'sessionStorage'>(k: K) => window[k]`
    // in page-nav.tsx failed with `+ …: localStorage is storage` and `+ …: sessionStorage is storage`.
    (type.flags & ts.TypeFlags.TypeParameter) === 0
      ? type
      : (checker.getBaseConstraintOfType(type) ?? type);
  return (read.isUnion() ? read.types : [read]).flatMap((part) =>
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
 * the name it resolved to. Eight kinds of node are judged: a module specifier; an identifier, and
 * when it names a namespace object that escapes whole, every export of that module; an `import()`
 * call or `typeof import()` type, by every export of the module it names; a call, by the type of
 * what it returns; an element access or indexed-access type by its key's literal type; a
 * destructured property by its name or its computed key's literal type; and an `export *` or
 * `export * as` by every export it re-exports.
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
      return literalKeys(checker, checker.getTypeAtLocation(key)).flatMap((name) => {
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
      if (ts.isIdentifier(node)) {
        const symbol = checker.getSymbolAtLocation(node);
        judgeSymbol(symbol, node.text);
        // A namespace object that escapes whole (passed, returned, exported) carries every export.
        const end = symbol === undefined ? undefined : aliasChain(checker, symbol).at(-1);
        const parent = node.parent;
        const accessed =
          (ts.isPropertyAccessExpression(parent) && parent.expression === node) ||
          (ts.isElementAccessExpression(parent) && parent.expression === node) ||
          ts.isQualifiedName(parent) ||
          ts.isNamespaceImport(parent);
        if (
          // Proof: 2026-09-25, d16 — `export * as wbs from '@/lib/wbs-api'` failed with four added lines,
          // `DirectoryApi`, `ProjectApi`, `httpDirectoryApi` and `httpProjectApi` each `is a broad HTTP client`;
          // it is caught here with d17 and d20, and the `export * as` widening below catches it too, so
          // removing either one alone lets nothing through (the planner's rehearsal; not re-run in
          // this attempt). d17 — `import * as wbs …; export { wbs };`
          // failed with the same four lines. d20 — `import type * as wbs …; export type Api = typeof wbs;`
          // failed with the same four lines.
          !accessed &&
          end !== undefined &&
          end.declarations?.some((each) => ts.isSourceFile(each)) === true
        ) {
          for (const exported of checker.getExportsOfModule(end))
            judgeSymbol(exported, exported.name);
        }
      }
      // A whole module reached by `import()` or `typeof import()` carries every export.
      const whole =
        (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) ||
        (ts.isImportTypeNode(node) && node.qualifier === undefined);
      const wholeSymbol =
        whole && specifier !== undefined ? checker.getSymbolAtLocation(specifier) : undefined;
      // Proof: 2026-09-25, d19 — `export const load = () => import('@/lib/wbs-api');` failed with the four
      // lines `DirectoryApi`, `ProjectApi`, `httpDirectoryApi`, `httpProjectApi` is a broad HTTP client.
      if (wholeSymbol !== undefined) {
        for (const exported of checker.getExportsOfModule(wholeSymbol))
          judgeSymbol(exported, exported.name);
      }
      // Proof: 2026-09-25, d18 — `Reflect.get(window, 'localStorage')` in page-nav.tsx failed with
      // `+ …: Storage is storage`.
      if (ts.isCallExpression(node)) {
        // What a call hands back, judged by its type: a generic getter or `Reflect.get` names no symbol.
        const type = checker.getTypeAtLocation(node);
        for (const part of type.isUnion() ? type.types : [type]) {
          for (const symbol of [part.aliasSymbol, part.getSymbol()]) {
            if (symbol !== undefined) judgeSymbol(symbol, symbol.name);
          }
        }
      }
      // Proof: 2026-09-25, d3 — `wbs['httpDirectoryApi']` on a namespace import failed with
      // `+ …: httpDirectoryApi is a broad HTTP client`. d11 — `wbs[key]` with
      // `const key = 'httpDirectoryApi'` failed with the same line. d12 — `window[key]` with
      // `const key = 'localStorage'` failed with `+ …: localStorage is storage`.
      if (ts.isElementAccessExpression(node)) {
        for (const property of propertiesOf(node.expression, node.argumentExpression)) {
          judgeSymbol(property, property.name);
        }
      }
      // Proof: 2026-09-25, d14b — `export type Kept = (typeof window)['localStorage']` failed with
      // `+ …: localStorage is storage`, and passed (status 0) with this clause disabled. d14,
      // `(typeof import('@/lib/wbs-api'))['httpDirectoryApi']`, fails with this clause disabled
      // too, through the qualifier-less `import(…)` type clause, so it proves nothing here alone.
      if (ts.isIndexedAccessTypeNode(node)) {
        for (const property of propertiesOf(node.objectType, node.indexType)) {
          judgeSymbol(property, property.name);
        }
      }
      // Proof: 2026-09-25, d5 — `export const { localStorage } = window` failed with
      // `+ …: localStorage is storage`. d13 — `const {{ [key]: kept }} = window` with
      // `const key = 'localStorage'` failed with the same line.
      if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent)) {
        const key = node.propertyName ?? node.name;
        const bound = checker.getTypeAtLocation(node.parent);
        const names = ts.isComputedPropertyName(key)
          ? literalKeys(checker, checker.getTypeAtLocation(key.expression))
          : ts.isIdentifier(key) || ts.isStringLiteralLike(key)
            ? [key.text]
            : [];
        for (const name of names) judgeSymbol(bound.getProperty(name), name);
      }
      if (
        // Proof: 2026-09-25, d15 — `export * from '@/lib/wbs-api'` in page-nav.tsx failed with four added
        // lines, `DirectoryApi`, `ProjectApi`, `httpDirectoryApi` and `httpProjectApi` is a broad HTTP client.
        ts.isExportDeclaration(node) &&
        (node.exportClause === undefined || ts.isNamespaceExport(node.exportClause))
      ) {
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
