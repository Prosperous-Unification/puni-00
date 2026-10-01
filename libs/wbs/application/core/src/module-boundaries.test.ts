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
 * Raw transactions and operation-bearing repository interfaces grant authority; DTOs do not.
 * Proof: replacing this with the blanket repository-port predicate made the
 * private-scope/public-DTO fixture fail (0 pass, 1 fail).
 */
function isRepositoryCapability(checker: ts.TypeChecker, declaration: ts.Declaration): boolean {
  const path = declaration.getSourceFile().fileName;
  if (!path.startsWith(`${sourceRoot}ports/`)) return false;
  if (/\/(?:unit-of-work|stores)\.ts$/.test(path)) return true;
  if (!/\/[^/]+-store\.ts$/.test(path)) return false;
  const isOperation = (member: ts.TypeElement): boolean =>
    ts.isMethodSignature(member) ||
    ts.isCallSignatureDeclaration(member) ||
    (ts.isPropertySignature(member) &&
      checker.getTypeAtLocation(member).getCallSignatures().length > 0);
  if (ts.isInterfaceDeclaration(declaration)) return declaration.members.some(isOperation);
  if (ts.isFunctionTypeNode(declaration) && ts.isPropertySignature(declaration.parent))
    return isRepositoryCapability(checker, declaration.parent);
  return (
    (ts.isMethodSignature(declaration) || ts.isPropertySignature(declaration)) &&
    ts.isInterfaceDeclaration(declaration.parent) &&
    declaration.parent.members.some(isOperation) &&
    isOperation(declaration)
  );
}

/** Resource constructors and hidden members may retain their admitted scope privately. */
function isHiddenClassMember(declaration: ts.Declaration): boolean {
  const privateName =
    (ts.isPropertyDeclaration(declaration) ||
      ts.isMethodDeclaration(declaration) ||
      ts.isGetAccessorDeclaration(declaration) ||
      ts.isSetAccessorDeclaration(declaration)) &&
    ts.isPrivateIdentifier(declaration.name);
  const restricted =
    ts.canHaveModifiers(declaration) &&
    (ts
      .getModifiers(declaration)
      ?.some(
        (modifier) =>
          modifier.kind === ts.SyntaxKind.PrivateKeyword ||
          modifier.kind === ts.SyntaxKind.ProtectedKeyword,
      ) ??
      false);
  return privateName || restricted;
}

/**
 * Direct feature types cannot depend on repository declarations. Public resource
 * members are checked for authority only: a DTO from a store file is still a
 * value, while Scope, UnitOfWork and repository interfaces grant store access.
 * Private/protected/# members and constructors are composition implementation.
 * Proof: before resolved-type inspection, the alias and compatibility-options
 * negatives both received no violation (each 0 pass, 1 fail).
 */
function reachesRepositoryType(
  checker: ts.TypeChecker,
  type: ts.Type,
  location: ts.Node,
  signatures: boolean,
): boolean {
  const seenOwnershipFields = new Set<ts.Type>();
  const seenOwnershipShape = new Set<ts.Type>();
  const seenCapabilityFields = new Set<ts.Type>();
  const seenCapabilityShape = new Set<ts.Type>();
  const inspect = (current: ts.Type, fields: boolean, capabilityOnly = false): boolean => {
    const seen = capabilityOnly
      ? fields
        ? seenCapabilityFields
        : seenCapabilityShape
      : fields
        ? seenOwnershipFields
        : seenOwnershipShape;
    if (seen.has(current)) return false;
    seen.add(current);
    const symbol = Reflect.get(current, 'symbol') as ts.Symbol | undefined;
    const forbidden = capabilityOnly ? reachesRepositoryCapability : reachesRepositoryPort;
    if (symbol !== undefined && forbidden(checker, symbol)) return true;
    if (current.aliasSymbol !== undefined && forbidden(checker, current.aliasSymbol)) return true;
    // Proof: reverting union members to shape-only inspection missed
    // `UnionEscape.read()`'s Scope field (0 pass, 1 fail).
    if (
      current.isUnionOrIntersection() &&
      current.types.some((member) => inspect(member, capabilityOnly, capabilityOnly))
    )
      return true;
    if (
      (current.flags & ts.TypeFlags.Object) !== 0 &&
      ((current as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference) !== 0
    ) {
      if (
        checker
          .getTypeArguments(current as ts.TypeReference)
          .some((argument) => inspect(argument, true, capabilityOnly))
      )
        return true;
    }
    if (signatures) {
      for (const kind of [ts.SignatureKind.Call, ts.SignatureKind.Construct]) {
        for (const signature of checker.getSignaturesOfType(current, kind)) {
          // Proof: omitting the resolved callable declaration missed a selected
          // repository property (`SyntheticCallableRepository['find']`, 0/1).
          if (
            signature.declaration !== undefined &&
            isRepositoryCapability(checker, signature.declaration)
          )
            return true;
          for (const parameter of signature.getParameters()) {
            if (forbidden(checker, parameter)) return true;
            if (
              inspect(checker.getTypeOfSymbolAtLocation(parameter, location), true, capabilityOnly)
            )
              return true;
          }
          if (inspect(checker.getReturnTypeOfSignature(signature), true, capabilityOnly))
            return true;
          for (const parameter of signature.getTypeParameters() ?? []) {
            const constraint = checker.getBaseConstraintOfType(parameter);
            if (constraint !== undefined && inspect(constraint, true, capabilityOnly)) return true;
          }
        }
      }
    }
    const isClass = symbol?.declarations?.some(ts.isClassDeclaration) ?? false;
    const local = symbol?.declarations?.some((declaration) =>
      declaration.getSourceFile().fileName.startsWith(sourceRoot),
    );
    if (fields && (local ?? true)) {
      for (const property of current.getProperties()) {
        if (isClass && property.declarations?.some(isHiddenClassMember)) continue;
        const memberCapability = capabilityOnly || isClass;
        if (
          (memberCapability ? reachesRepositoryCapability : reachesRepositoryPort)(
            checker,
            property,
          )
        )
          return true;
        if (inspect(checker.getTypeOfSymbolAtLocation(property, location), true, memberCapability))
          return true;
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
 * Resolve aliases before deciding whether a public resource type grants repository authority.
 * Proof: ignoring the resolved capability declaration made the public resource
 * escape fixture fail (0 pass, 1 fail), while its DTO-only class stayed allowed.
 */
function reachesRepositoryCapability(checker: ts.TypeChecker, symbol: ts.Symbol): boolean {
  const visited = new Set<ts.Symbol>();
  let current = symbol;
  while (!visited.has(current)) {
    visited.add(current);
    if (current.declarations?.some((declaration) => isRepositoryCapability(checker, declaration)))
      return true;
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
    // Resource implementations and composition wiring are the permitted store owners.
    if (
      source.fileName.endsWith('.resource.ts') ||
      /\/(contract|composition|module|check)\.ts$/.test(source.fileName)
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
        if (reachesRepositoryType(checker, type, node, !ts.isPropertyAccessExpression(node)))
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
  // failed this assertion (whole file 9 pass, 1 fail each; re-observed
  // 2026-09-30); adding plan-import back to `debt` reported `new debt is not
  // allowed` (9 pass, 1 fail). The audit reads types only: a runtime
  // `Reflect.get(scope, 'scope')` passes it, which is why AdmittedScope and
  // ImportedPlanResource keep the scope in a `#` field with their own tests.
  expect(failed).toEqual([]);
}, 120_000);

/** Build the real core program with one source change visible only to this test. */
async function createProgramWith(
  path: string,
  addition: string,
  extras: readonly { path: string; addition: string }[] = [],
): Promise<ts.Program> {
  const read = ts.readConfigFile(`${root}tsconfig.lib.json`, (file) => ts.sys.readFile(file));
  if (read.error !== undefined)
    throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, ' '));
  const config = ts.parseJsonConfigFileContent(read.config, ts.sys, root);
  if (config.errors.length > 0)
    throw new Error(config.errors.map((error) => error.code).join(', '));
  const files = (await readdir(sourceRoot, { recursive: true }))
    .filter((file) => file.endsWith('.ts'))
    .map((file) => `${sourceRoot}${file}`);
  const additions = new Map<string, string>();
  for (const change of [{ path, addition }, ...extras]) {
    const target = `${sourceRoot}${change.path}`;
    const original = await readFile(target, 'utf8');
    additions.set(target, `${original}\n${change.addition}\n`);
  }
  const host = ts.createCompilerHost({ ...config.options, noEmit: true });
  const readSource = host.readFile.bind(host);
  host.readFile = (file) => additions.get(file) ?? readSource(file);
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

test('renamed scope inside a nested transaction callback is refused', async () => {
  const program = await createProgramWith(
    'module/plan-commands/plan-commands.feature.ts',
    "export type EscapedTransaction = { mapped: { run: (act: (admitted: import('../../ports/unit-of-work').Scope) => Promise<void>) => Promise<void> } };",
  );
  // Proof: omitting signature traversal missed the injected `admitted` Scope
  // and reported no violation; watched on the isolated candidate.
  expect(
    findViolations(program, 'plan-commands').some((violation) =>
      violation.includes('EscapedTransaction'),
    ),
  ).toBe(true);
}, 120_000);

test('import transaction cannot return a raw scope through a nested resource callback', async () => {
  const program = await createProgramWith(
    'module/plan-import/plan-import.feature.ts',
    "export type EscapedImportTransaction = { run: (act: (resources: { next: () => import('../../ports/unit-of-work').Scope }) => Promise<void>) => Promise<void> };",
  );
  // Proof: removing signature traversal made this renamed nested return
  // produce no violation (0 pass, 1 fail); watched in the isolated candidate.
  expect(
    findViolations(program, 'plan-import').some((violation) =>
      violation.includes('EscapedImportTransaction'),
    ),
  ).toBe(true);
}, 120_000);

test('public resource surfaces cannot pass raw repository authority to a feature', async () => {
  const program = await createProgramWith(
    'module/plan-import/plan-import.feature.ts',
    "import type { PublicScopeEscape, ReturnedScopeEscape, UnitEscape, StoreEscape, AggregateEscape, ConstraintEscape, UnionEscape, MethodEscape, CallablePropertyEscape, PrivateDtoResource, DtoUnionResource } from './imported-plan.resource'; export type EscapedPublicResource = { resource: PublicScopeEscape }; export type EscapedReturnedScope = { resource: ReturnedScopeEscape }; export type EscapedUnit = { resource: UnitEscape }; export type EscapedStore = { resource: StoreEscape }; export type EscapedAggregate = { resource: AggregateEscape }; export type EscapedConstraint = { resource: ConstraintEscape }; export type EscapedUnion = { resource: UnionEscape }; export type EscapedMethod = { resource: MethodEscape }; export type EscapedCallableProperty = { resource: CallablePropertyEscape }; export type AllowedPrivateDto = { resource: PrivateDtoResource }; export type AllowedDtoUnion = { resource: DtoUnionResource };",
    [
      {
        path: 'module/plan-import/imported-plan.resource.ts',
        addition:
          "export class PublicScopeEscape { expose<T>(act: (admitted: Scope) => T): T { throw new Error('fixture'); } } export class ReturnedScopeEscape { get pending(): Promise<Scope> { throw new Error('fixture'); } } export class UnitEscape { expose(unit: import('../../ports/unit-of-work').UnitOfWork): void { throw new Error('fixture'); } } export class StoreEscape { expose(store: import('../../ports/project-store').ProjectStore): void { throw new Error('fixture'); } } export class AggregateEscape { expose(stores: import('../../ports/stores').PlanTransactionalStores): void { throw new Error('fixture'); } } export class ConstraintEscape { expose<T extends Scope>(value: T): void { throw new Error('fixture'); } } export class UnionEscape { read(): {kind:'empty'} | {kind:'scope'; scope: Scope} { throw new Error('fixture'); } } export class MethodEscape { get find(): import('../../ports/project-store').ProjectStore['findById'] { throw new Error('fixture'); } } export class CallablePropertyEscape { get find(): import('../../ports/project-store').SyntheticCallableRepository['find'] { throw new Error('fixture'); } } export class PrivateDtoResource { readonly #scope: Scope; constructor(scope: Scope) { this.#scope = scope; } private hidden(): Scope { throw new Error('fixture'); } createProject(steps: Step[], callback: (step: Step) => CalendarMarker): CalendarMarker { throw new Error('fixture'); } } export class DtoUnionResource { read(): {kind:'marker'; marker: CalendarMarker} | {kind:'steps'; steps: Step[]} { throw new Error('fixture'); } }",
      },
      {
        path: 'ports/project-store.ts',
        addition:
          'export interface SyntheticCallableRepository { find: (id: string) => Promise<void>; }',
      },
    ],
  );
  // Proof: skipping all class members made this synthetic public `expose`
  // callback return no violation (0 pass, 1 fail), even with a raw Scope.
  // Proof: shape-only union traversal missed EscapedUnion; disabling selected
  // method classification missed EscapedMethod (each 0/1). Omitting resolved
  // callable declarations missed EscapedCallableProperty (0/1).
  const violations = findViolations(program, 'plan-import');
  const escapes = [
    'EscapedPublicResource',
    'EscapedReturnedScope',
    'EscapedUnit',
    'EscapedStore',
    'EscapedAggregate',
    'EscapedConstraint',
    'EscapedUnion',
    'EscapedMethod',
    'EscapedCallableProperty',
  ];
  expect(
    escapes.filter((escaped) => !violations.some((violation) => violation.includes(escaped))),
  ).toEqual([]);
  expect(violations.some((violation) => violation.includes('AllowedPrivateDto'))).toBe(false);
  expect(violations.some((violation) => violation.includes('AllowedDtoUnion'))).toBe(false);
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
