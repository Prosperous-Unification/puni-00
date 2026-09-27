import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'bun:test';
import ts from 'typescript';

const root = fileURLToPath(new URL('..', import.meta.url));
const sourceRoot = `${root}src/`;
const debt = new Set(['plan-import']);
const inspected = [
  'plan-history',
  'realtime',
  'bounded-replay-sweep',
  'authentication',
  'saved-plans',
  'plan-import',
] as const;

/** Repository port declarations are identified by their resolved declaration, not import spelling. */
function isRepositoryPort(declaration: ts.Declaration): boolean {
  const path = declaration.getSourceFile().fileName;
  return (
    path.startsWith(`${sourceRoot}ports/`) &&
    path.endsWith('-store.ts') &&
    (ts.isInterfaceDeclaration(declaration) || ts.isTypeAliasDeclaration(declaration)) &&
    declaration.name.text.endsWith('Store')
  );
}

/** Follow named imports, forwarding barrels, and aliases to their declaration. */
function reachesRepositoryPort(checker: ts.TypeChecker, symbol: ts.Symbol): boolean {
  const visited = new Set<ts.Symbol>();
  let current = symbol;
  while (!visited.has(current)) {
    visited.add(current);
    if (current.declarations?.some(isRepositoryPort)) return true;
    if ((current.flags & ts.SymbolFlags.Alias) === 0) return false;
    current = checker.getAliasedSymbol(current);
  }
  return false;
}

/** Find each feature's references while excluding resource implementations and DI wiring. */
function violations(program: ts.Program, moduleName: string): string[] {
  const checker = program.getTypeChecker();
  const found: string[] = [];
  for (const source of program.getSourceFiles()) {
    if (!source.fileName.startsWith(`${sourceRoot}module/${moduleName}/`)) continue;
    if (
      source.fileName.endsWith('.test.ts') ||
      source.fileName.endsWith('.resource.ts') ||
      /\/(contract|module|check)\.ts$/.test(source.fileName)
    )
      continue;
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node)) {
        const symbol = checker.getSymbolAtLocation(node);
        if (symbol !== undefined && reachesRepositoryPort(checker, symbol)) {
          found.push(
            `${source.fileName.slice(sourceRoot.length)}:${String(node.getStart(source))}: ${node.text}`,
          );
        }
      }
      if (
        ts.isPropertyAccessExpression(node) &&
        node.name.text === 'stores' &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'scope'
      ) {
        found.push(
          `${source.fileName.slice(sourceRoot.length)}:${String(node.getStart(source))}: scope.stores`,
        );
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return found;
}

test('closed feature modules do not reference repository ports and debt stays live', async () => {
  const read = ts.readConfigFile(`${root}tsconfig.lib.json`, (path) => ts.sys.readFile(path));
  if (read.error !== undefined)
    throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, ' '));
  const config = ts.parseJsonConfigFileContent(read.config, ts.sys, root);
  if (config.errors.length > 0)
    throw new Error(config.errors.map((error) => error.code).join(', '));
  const files = (await readdir(sourceRoot, { recursive: true }))
    .filter((path) => path.endsWith('.ts'))
    .map((path) => `${sourceRoot}${path}`);
  const program = ts.createProgram({
    rootNames: files,
    options: { ...config.options, noEmit: true },
  });
  const failed: string[] = [];
  for (const moduleName of inspected) {
    const found = violations(program, moduleName);
    if (debt.has(moduleName) && found.length === 0) failed.push(`${moduleName}: stale debt ledger`);
    if (!debt.has(moduleName)) failed.push(...found);
  }
  // Proof (2026-09-27): injecting an import() type reference to ProjectStore into
  // plan-history.feature.ts made this assertion report that resolved declaration
  // with 0 pass and 1 fail; removing the import restored 1 pass.
  // Proof (2026-09-27): injecting an import() type reference to EventLogStore
  // into gateway-broadcaster.ts made this assertion fail (0 pass, 1 fail).
  // Proof (2026-09-27): injecting the same import() type into retention-timer.ts
  // made this assertion fail (0 pass, 1 fail).
  // Proof (2026-09-27): injecting an import() type reference to UserStore into
  // authentication.feature.ts made this assertion fail (0 pass, 1 fail).
  // Proof (2026-09-27): injecting an import() type reference to
  // SavedPlanCaptureStore into saved-plan-schedule.ts failed (0 pass, 1 fail).
  expect(failed).toEqual([]);
}, 120_000);
