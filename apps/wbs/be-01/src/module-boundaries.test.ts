import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'bun:test';
import ts from 'typescript';

const backendRoot = fileURLToPath(new URL('..', import.meta.url));
const backendSource = `${backendRoot}src/`;
const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));
const configPath = `${backendRoot}tsconfig.lib.json`;

/**
 * One group of backend module files and the files none of them may reach.
 *
 * `from` takes a path under `apps/wbs/be-01/src`; `reaches` takes the
 * repository-relative path of a file a module specifier or an identifier
 * resolved to.
 */
interface ImportRule {
  readonly from: (path: string) => boolean;
  readonly reaches: (declared: string) => boolean;
}

/**
 * The routes the backend module map's preparations 7 and 8 closed, so that they
 * cannot return unnoticed.
 *
 * The first is preparation 8 (task 1.6): Optimization takes
 * `SolverObjectiveName` from `@wbs/domain` rather than through the repository
 * schema, and hashes an input through its injected cache-key port rather than
 * through the repository's SHA-256 helper. The second is preparation 7's
 * neutral half (task 1.5): the Optimization contract's spawn, child and event
 * types name no repository row type and nothing of the private solver child
 * lifecycle, so a launcher that imports the contract imports no adapter. The
 * third is preparation 7's other half (tasks 1.5 and 4.2): the Supervisor, a
 * repository module, reaches Optimization only through that contract — never
 * the feature, its private support or the coordinator's compatibility path
 * (K5).
 *
 * Proof (2026-09-24): on the Optimization module as sealed before its
 * cache-key port, this suite failed with exactly
 * `"module/optimization/optimization.feature.ts: '../../repository/schedule-input-hash' reaches apps/wbs/be-01/src/repository/schedule-input-hash.ts"`
 * and `"module/optimization/optimization.feature.ts: scheduleInputHash reaches libs/wbs/adapters/store-sqlite/src/schedule-input-hash.ts"`
 * (0 pass, 1 fail).
 * Proof (2026-09-24): prepending
 * `import type { SolverObjectiveName as StoredObjectiveName } from '../../repository/schema';`
 * to `module/optimization/optimization.feature.ts` failed it with exactly the
 * `'../../repository/schema' reaches apps/wbs/be-01/src/repository/schema.ts` and
 * `SolverObjectiveName reaches libs/wbs/adapters/store-sqlite/src/schema.ts` violations;
 * prepending `import '@wbs/store-sqlite/schema';` instead failed it with exactly
 * `'@wbs/store-sqlite/schema' reaches libs/wbs/adapters/store-sqlite/src/schema.ts` (0 pass, 1 fail each).
 * Proof (2026-09-24): prepending, one at a time, `import '../../repository/optimization-admission';`,
 * `import '@wbs/store-sqlite/optimization-admission';` and `import './solver-child-lifecycle';`
 * to `module/optimization/contract.ts` failed it with exactly one violation each, naming
 * `apps/wbs/be-01/src/repository/optimization-admission.ts`,
 * `libs/wbs/adapters/store-sqlite/src/optimization-admission.ts` and
 * `apps/wbs/be-01/src/module/optimization/solver-child-lifecycle.ts` (0 pass, 1 fail each).
 * Proof (2026-09-24): prepending
 * `import type { ReservedSpawner as FeatureSpawner } from '../../service/optimization-coordinator';`
 * to `module/solver-supervisor/solver-supervisor-spawner.ts` failed it with exactly
 * `'../../service/optimization-coordinator' reaches apps/wbs/be-01/src/service/optimization-coordinator.ts`;
 * prepending `import '../optimization/optimization.feature';` instead failed it with exactly
 * `'../optimization/optimization.feature' reaches apps/wbs/be-01/src/module/optimization/optimization.feature.ts`
 * (0 pass, 1 fail each).
 */
const rules: readonly ImportRule[] = [
  {
    from: (path) => path.startsWith('module/optimization/'),
    reaches: (declared) =>
      [
        'apps/wbs/be-01/src/repository/schema.ts',
        'apps/wbs/be-01/src/repository/schedule-input-hash.ts',
        'libs/wbs/adapters/store-sqlite/src/schema.ts',
        'libs/wbs/adapters/store-sqlite/src/schedule-input-hash.ts',
      ].includes(declared),
  },
  {
    from: (path) => path === 'module/optimization/contract.ts',
    reaches: (declared) =>
      declared.startsWith('apps/wbs/be-01/src/repository/') ||
      declared.startsWith('libs/wbs/adapters/') ||
      declared === 'apps/wbs/be-01/src/module/optimization/solver-child-lifecycle.ts',
  },
  {
    from: (path) => path.startsWith('module/solver-supervisor/'),
    reaches: (declared) =>
      declared === 'apps/wbs/be-01/src/service/optimization-coordinator.ts' ||
      (declared.startsWith('apps/wbs/be-01/src/module/optimization/') &&
        declared !== 'apps/wbs/be-01/src/module/optimization/contract.ts'),
  },
];

function underRepository(fileName: string): string {
  return fileName.startsWith(repositoryRoot) ? fileName.slice(repositoryRoot.length) : fileName;
}

/** Every TypeScript file of the backend's sealed modules, as a path under `src`. */
async function scannedSources(): Promise<readonly string[]> {
  return (await readdir(`${backendSource}module`, { recursive: true }))
    .filter((path) => path.endsWith('.ts'))
    .map((path) => `module/${path.replaceAll('\\', '/')}`)
    .sort();
}

/**
 * The backend compiled as one program, with its own `tsconfig.lib.json` options.
 *
 * Both throws are load-bearing: without the real options there are no path
 * mappings, `@wbs/*` does not resolve, and every identity this rule asks about
 * comes back unresolved — which reads as an empty violation list.
 */
function backendProgram(rootNames: readonly string[]): ts.Program {
  const read = ts.readConfigFile(configPath, (path) => ts.sys.readFile(path));
  // Proof (2026-09-24): pointing `configPath` at `tsconfig.absent.json` threw
  // `Cannot read file '…/apps/wbs/be-01/tsconfig.absent.json'.` (0 pass, 1 fail).
  if (read.error !== undefined) {
    throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, ' '));
  }
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, backendRoot);
  // Proof (2026-09-24): `"module": "invalid"` in the real `tsconfig.lib.json` threw
  // `refused tsconfig.lib.json: 6046` (0 pass, 1 fail).
  if (parsed.errors.length > 0) {
    throw new Error(
      `refused tsconfig.lib.json: ${parsed.errors.map((each) => each.code).join(', ')}`,
    );
  }
  return ts.createProgram({
    rootNames: rootNames.map((path) => `${backendSource}${path}`),
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
  return (symbol.declarations ?? []).map((each) => underRepository(each.getSourceFile().fileName));
}

/** The module specifier of a node that introduces one. */
function moduleSpecifierOf(node: ts.Node): ts.Expression | undefined {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return node.moduleSpecifier;
  if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
    return node.argument.literal;
  }
  if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    return node.arguments[0];
  }
  return undefined;
}

/** What a scan found: the forbidden routes, and every file each scanned file reached. */
interface ImportReport {
  readonly violations: readonly string[];
  readonly reached: ReadonlyMap<string, ReadonlySet<string>>;
}

/**
 * Every route by which a scanned file reaches a file its rules forbid.
 *
 * Two questions are asked of every node, both of **resolved identities**,
 * never of spelling: where a module specifier resolves, and every file an
 * identifier's alias chain is declared in. That covers a named, type-only or
 * bare side-effect import of a forbidden file, a `typeof import(…)` of one, and
 * a name forwarded to it through any number of re-exports.
 *
 * **Not covered, by construction.** A member selected out of an allowed
 * forwarding barrel by a string key — `store['scheduleInputHash']` after
 * `import * as store from '@wbs/store-sqlite'` — has no identifier naming the
 * forbidden declaration and no specifier naming the forbidden file.
 * `libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts`
 * resolves such selections by type identity; this rule does not, and is a
 * tripwire for the routes the two preparations removed, not a proof that no
 * route exists.
 */
function importReport(paths: readonly string[]): ImportReport {
  const program = backendProgram(paths);
  const checker = program.getTypeChecker();
  const violations: string[] = [];
  const reached = new Map<string, Set<string>>();

  for (const path of paths) {
    const file = program.getSourceFile(`${backendSource}${path}`);
    // Proof (2026-09-24): appending `'module/missing.ts'` to what `scannedSources` returns threw
    // `the program holds no module/missing.ts` (0 pass, 1 fail).
    if (file === undefined) throw new Error(`the program holds no ${path}`);
    const applying = rules.filter((rule) => rule.from(path));
    const seen = new Set<string>();
    reached.set(path, seen);
    const judge = (files: readonly string[], how: string): void => {
      for (const declared of files) {
        seen.add(declared);
        if (applying.some((rule) => rule.reaches(declared))) {
          violations.push(`${path}: ${how} reaches ${declared}`);
        }
      }
    };

    const visit = (node: ts.Node): void => {
      const specifier = moduleSpecifierOf(node);
      if (specifier !== undefined) {
        const moduleSymbol = checker.getSymbolAtLocation(specifier);
        if (moduleSymbol !== undefined) judge(declarationFiles(moduleSymbol), specifier.getText());
      }
      if (ts.isIdentifier(node)) {
        const symbol = checker.getSymbolAtLocation(node);
        if (symbol !== undefined) {
          judge(aliasChain(checker, symbol).flatMap(declarationFiles), node.getText());
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return { violations: [...new Set(violations)].sort(), reached };
}

describe('the checked import routes of the backend modules', () => {
  it('rejects every route a rule forbids', async () => {
    const scanned = await scannedSources();
    const report = importReport(scanned);

    // Proof (2026-09-24): filtering `scannedSources` on `.tsx` instead of `.ts` failed here on
    // `Received: []` (0 pass, 1 fail).
    expect(scanned).toContain('module/optimization/contract.ts');
    expect(scanned).toContain('module/solver-supervisor/solver-supervisor-spawner.ts');
    // Proof (2026-09-24): building the program with `paths: undefined` failed here: the feature
    // no longer reached `libs/wbs/domain/domain/src/stored-vocabularies.ts` (0 pass, 1 fail).
    expect(report.reached.get('module/optimization/optimization.feature.ts')).toContain(
      'libs/wbs/domain/domain/src/stored-vocabularies.ts',
    );
    expect(report.violations).toEqual([]);
  }, 120_000);
});
