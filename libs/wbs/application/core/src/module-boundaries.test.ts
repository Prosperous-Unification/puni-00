import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'bun:test';
import ts from 'typescript';

const root = fileURLToPath(new URL('..', import.meta.url));
const sourceRoot = `${root}src/`;
/**
 * The baseline permits only removal; a new feature cannot nominate itself as debt.
 * Empty since WBS 040.11 closed Plan import and Plan commands, so every audited
 * module is closed and any entry is refused as new debt.
 */
const allowedDebt = new Set<string>();
const debt = new Set(allowedDebt);
const auditedModules = [
  'plan-commands',
  'plan-history',
  'realtime',
  'bounded-replay-sweep',
  'authentication',
  'saved-plans',
  'plan-import',
] as const;

/**
 * A repository port is a declaration owned by a store file, regardless of its
 * name. `*-store.ts` owns individual store contracts; `stores.ts` owns their
 * aggregate. Value declarations in those files are equally repository-owned.
 * Proof: disabling the repository-file check let the named PlanEvent import
 * negative pass through the audit (0 pass, 1 fail).
 */
function isRepositoryPort(declaration: ts.Declaration): boolean {
  const path = declaration.getSourceFile().fileName;
  return path.startsWith(`${sourceRoot}ports/`) && /\/(?:[^/]+-store|stores)\.ts$/.test(path);
}

/**
 * Check a resolved type and its immediate public fields for repository ownership.
 * Class fields are private resource implementation, not feature dependencies.
 * Proof: before resolved-type inspection, the alias and compatibility-options
 * negatives both received no violation (each 0 pass, 1 fail).
 */
function reachesRepositoryType(checker: ts.TypeChecker, type: ts.Type, location: ts.Node): boolean {
  const seen = new Set<ts.Type>();
  const inspect = (current: ts.Type, fields: boolean): boolean => {
    if (seen.has(current)) return false;
    seen.add(current);
    const symbol = Reflect.get(current, 'symbol') as ts.Symbol | undefined;
    if (symbol !== undefined && reachesRepositoryPort(checker, symbol)) return true;
    if (current.aliasSymbol !== undefined && reachesRepositoryPort(checker, current.aliasSymbol))
      return true;
    if (current.isUnionOrIntersection() && current.types.some((member) => inspect(member, false)))
      return true;
    if (checker.isArrayType(current) || checker.isTupleType(current)) {
      if (
        checker
          .getTypeArguments(current as ts.TypeReference)
          .some((argument) => inspect(argument, false))
      )
        return true;
    }
    const isClass = symbol?.declarations?.some(ts.isClassDeclaration) ?? false;
    if (fields && !isClass) {
      for (const property of current.getProperties()) {
        if (reachesRepositoryPort(checker, property)) return true;
        if (inspect(checker.getTypeOfSymbolAtLocation(property, location), false)) return true;
      }
    }
    return false;
  };
  return inspect(type, true);
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

/**
 * Inspect every production file, reserving store access for resource and wiring files.
 * Proof: a real ReviewPortAlias declaration in plan-history.feature.ts made the
 * production audit fail with that declaration (0 pass, 1 fail).
 * Proof: a real wildcard export from project-store in the same feature also
 * failed, naming that file (0 pass, 1 fail).
 */
function findViolations(program: ts.Program, moduleName: string): string[] {
  const checker = program.getTypeChecker();
  const found: string[] = [];
  const files = program
    .getSourceFiles()
    .filter(
      (source) =>
        source.fileName.startsWith(`${sourceRoot}module/${moduleName}/`) &&
        source.fileName.endsWith('.ts') &&
        !source.fileName.endsWith('.test.ts'),
    );
  if (files.length === 0) return [`${moduleName}: no production files`];
  for (const source of files) {
    // Resource implementations and module wiring are the permitted store owners.
    if (
      source.fileName.endsWith('.resource.ts') ||
      /\/(contract|module|check)\.ts$/.test(source.fileName)
    )
      continue;
    const report = (node: ts.Node, name: string): void => {
      found.push(
        `${source.fileName.slice(sourceRoot.length)}:${String(node.getStart(source))}: ${name}`,
      );
    };
    const visit = (node: ts.Node): void => {
      if (
        ts.isImportDeclaration(node) ||
        ts.isImportTypeNode(node) ||
        ts.isExportDeclaration(node)
      ) {
        const specifier = ts.isImportDeclaration(node)
          ? node.moduleSpecifier
          : ts.isExportDeclaration(node)
            ? node.moduleSpecifier
            : ts.isLiteralTypeNode(node.argument)
              ? node.argument.literal
              : undefined;

        // Proof: removing this guard let a malformed import type leave the audit
        // silently (0 pass, 1 fail).
        if (specifier === undefined && !ts.isExportDeclaration(node))
          throw new Error(`Missing import specifier in ${source.fileName}`);
        if (specifier !== undefined && !ts.isStringLiteral(specifier))
          throw new Error(`Nonliteral import in ${source.fileName}`);
        if (specifier !== undefined) {
          const path = ts.resolveModuleName(
            specifier.text,
            source.fileName,
            program.getCompilerOptions(),
            ts.sys,
          ).resolvedModule?.resolvedFileName;
          // Proof: disabling this branch let a named PlanEvent import and a
          // wildcard ProjectStore export escape (0 pass, 1 fail each).
          if (path !== undefined && /\/ports\/(?:[^/]+-store|stores)\.ts$/.test(path))
            report(node, specifier.getText(source));
        }
      }
      if (ts.isIdentifier(node)) {
        const symbol = checker.getSymbolAtLocation(node);
        if (symbol !== undefined && reachesRepositoryPort(checker, symbol)) report(node, node.text);
      }
      if (
        ts.isTypeAliasDeclaration(node) ||
        ts.isVariableDeclaration(node) ||
        ts.isParameter(node) ||
        ts.isPropertyDeclaration(node) ||
        ts.isPropertySignature(node) ||
        ts.isPropertyAccessExpression(node)
      ) {
        const type = checker.getTypeAtLocation(node);
        if (reachesRepositoryType(checker, type, node))
          report(node, node.getText(source).slice(0, 80));
      }
      if (
        ts.isPropertyAccessExpression(node) &&
        node.name.text === 'stores' &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'scope'
      ) {
        report(node, 'scope.stores');
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return found;
}

/**
 * A feature directory must be explicitly closed or in the shrink-only debt ledger.
 * Proof: removing Authentication from both lists reported `unlisted feature module`;
 * renaming its audited entry also reported `no production files` (0 pass, 1 fail each).
 * Proof: adding `new-feature` only to the debt set failed with `new debt is not allowed`
 * (0 pass, 1 fail).
 * Proof: adding the real Authentication module to debt also failed with that
 * refusal (0 pass, 1 fail).
 */
function findCoverageFailures(
  files: readonly string[],
  closed: ReadonlySet<string>,
  debtSet: ReadonlySet<string>,
): string[] {
  const features = new Set(
    files.flatMap((file) => {
      const match = /\/module\/([^/]+)\/[^/]+\.feature\.ts$/.exec(file);
      return match === null ? [] : [match[1]];
    }),
  );
  const addedDebt = [...debtSet]
    .filter((name) => !allowedDebt.has(name))
    .map((name) => `${name}: new debt is not allowed`);
  return [
    ...addedDebt,
    ...[...features]
      .filter((name) => !closed.has(name) && !debtSet.has(name))
      .map((name) => `${name}: unlisted feature module`),
  ];
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
  const failed = findCoverageFailures(
    files,
    new Set(auditedModules.filter((name) => !debt.has(name))),
    debt,
  );
  for (const moduleName of auditedModules) {
    const found = findViolations(program, moduleName);
    if (found.includes(`${moduleName}: no production files`)) {
      failed.push(...found);
      continue;
    }
    if (debt.has(moduleName) && found.length === 0) failed.push(`${moduleName}: stale debt ledger`);
    if (!debt.has(moduleName)) failed.push(...found);
  }
  // Proof (2026-09-27): injecting an import() type reference to ProjectStore into
  // plan-history.feature.ts made this assertion report that resolved declaration
  // with 0 pass and 1 fail; removing the import restored 1 pass.
  // Proof (2026-09-27): injecting aliased, namespace, and index-barrel
  // ProjectStore type references into plan-history.feature.ts separately made
  // this assertion fail (0 pass, 1 fail for each injected reference).
  // Proof (2026-09-27): adding the clean plan-history module to the debt
  // ledger made this assertion report stale debt (0 pass, 1 fail).
  // Proof (2026-09-27): injecting an import() type reference to EventLogStore
  // into gateway-broadcaster.ts made this assertion fail (0 pass, 1 fail).
  // Proof (2026-09-27): injecting the same import() type into retention-timer.ts
  // made this assertion fail (0 pass, 1 fail).
  // Proof (2026-09-27): injecting an import() type reference to UserStore into
  // authentication.feature.ts made this assertion fail (0 pass, 1 fail).
  // Proof (2026-09-27): injecting an import() type reference to
  // SavedPlanCaptureStore into saved-plan-schedule.ts failed (0 pass, 1 fail).
  // Proof: a real ReviewPortAlias in plan-history.feature.ts
  // reported that declaration (0 pass, 1 fail); removing it restored green.
  // Proof (2026-09-29): with Plan import and Plan commands closed, an import()
  // type of SubtreeCopy in plan-import.feature.ts, a work-item-store import in
  // plan-commands.feature.ts, a Scope-typed parameter in admitted-write.ts and a
  // cast reaching AdmittedScope's private scope in plan-commands.feature.ts each
  // failed this assertion (0 pass, 1 fail each); adding plan-import back to
  // `debt` reported `new debt is not allowed` (0 pass, 1 fail).
  expect(failed).toEqual([]);
}, 120_000);

/** Build the real core program with one source change visible only to this test. */
async function createProgramWith(path: string, addition: string): Promise<ts.Program> {
  const read = ts.readConfigFile(`${root}tsconfig.lib.json`, (file) => ts.sys.readFile(file));
  if (read.error !== undefined)
    throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, ' '));
  const config = ts.parseJsonConfigFileContent(read.config, ts.sys, root);
  if (config.errors.length > 0)
    throw new Error(config.errors.map((error) => error.code).join(', '));
  const files = (await readdir(sourceRoot, { recursive: true }))
    .filter((file) => file.endsWith('.ts'))
    .map((file) => `${sourceRoot}${file}`);
  const target = `${sourceRoot}${path}`;
  const original = await readFile(target, 'utf8');
  const host = ts.createCompilerHost({ ...config.options, noEmit: true });
  const readSource = host.readFile.bind(host);
  host.readFile = (file) => (file === target ? `${original}\n${addition}\n` : readSource(file));
  return ts.createProgram({ rootNames: files, options: { ...config.options, noEmit: true }, host });
}

test('resolved alias type from a repository port is refused', async () => {
  const program = await createProgramWith(
    'module/plan-history/plan-history.feature.ts',
    "export type EscapedHistoryStore = import('../../ports/project-store').ProjectStore;",
  );
  expect(
    findViolations(program, 'plan-history').some((violation) =>
      violation.includes('EscapedHistoryStore'),
    ),
  ).toBe(true);
}, 120_000);

test('repository method reached through compatibility options is refused', async () => {
  const program = await createProgramWith(
    'module/saved-plans/saved-plans.feature.ts',
    "export function escapedRead(opts: import('../../service/saved-plan.service').SavedPlanServiceOptions) { return opts.plans.readOf('x'); }",
  );
  expect(
    findViolations(program, 'saved-plans').some((violation) => violation.includes('plans')),
  ).toBe(true);
}, 120_000);

test('repository-owned value types are refused without a Store suffix', async () => {
  const program = await createProgramWith(
    'module/plan-history/plan-history.feature.ts',
    "export type EscapedPlanEvent = import('../../ports/plan-event-store').PlanEvent;",
  );
  expect(
    findViolations(program, 'plan-history').some((violation) =>
      violation.includes('plan-event-store'),
    ),
  ).toBe(true);
}, 120_000);

test('named value import from a repository port is refused', async () => {
  const program = await createProgramWith(
    'module/plan-history/plan-history.feature.ts',
    "import type { PlanEvent as EscapedEvent } from '../../ports/plan-event-store'; export type ExportedEvent = EscapedEvent;",
  );
  expect(
    findViolations(program, 'plan-history').some((violation) =>
      violation.includes('plan-event-store'),
    ),
  ).toBe(true);
}, 120_000);

test('wildcard export of a repository port is refused', async () => {
  const program = await createProgramWith(
    'module/plan-history/plan-history.feature.ts',
    "export * from '../../ports/project-store';",
  );
  expect(
    findViolations(program, 'plan-history').some((violation) =>
      violation.includes('project-store'),
    ),
  ).toBe(true);
}, 120_000);

test('malformed import type cannot silently leave the audit', async () => {
  const program = await createProgramWith(
    'module/plan-history/plan-history.feature.ts',
    'type BrokenImport = import(ProjectStore).ProjectStore;',
  );
  expect(() => findViolations(program, 'plan-history')).toThrow('Missing import specifier');
}, 120_000);

test('new feature debt cannot be added to the shrink-only ledger', () => {
  const files = [`${sourceRoot}module/new-feature/new-feature.feature.ts`];
  expect(findCoverageFailures(files, new Set(), new Set(['new-feature']))).toContain(
    'new-feature: new debt is not allowed',
  );
});

test('a closed module with no directory is refused', async () => {
  const program = await createProgramWith('module/plan-history/plan-history.feature.ts', '');
  expect(findViolations(program, 'renamed-plan-history')).toContain(
    'renamed-plan-history: no production files',
  );
}, 120_000);

test('every feature module is closed or recorded as debt', async () => {
  const program = await createProgramWith('module/plan-history/plan-history.feature.ts', '');
  const files = program.getSourceFiles().map((source) => source.fileName);
  expect(findCoverageFailures(files, new Set(['plan-history']), new Set())).toContain(
    'authentication: unlisted feature module',
  );
}, 120_000);
