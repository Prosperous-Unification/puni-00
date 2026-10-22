import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { readJUnitReport } from '@shared/test-evidence';
import ts from 'typescript';

import { selectChanges, type Selection } from './ci-selection';

/** An explicit complete-module fallback or a proven nonempty local test closure. */
export type TestSelection =
  | { mode: 'module'; project: string; reasons: string[] }
  | { mode: 'files'; project: string; files: string[]; reasons: string[] };

/**
 * Reviewed opt-in boundary: website contracts are pure TypeScript with local static imports and
 * the named noble hash functions below. Every source/test is audited before narrowing. This is
 * a reviewed module contract, not a JavaScript sandbox or a general capability detector. Changes
 * outside its source tree (including this manifest, dependencies and configuration), new files,
 * deletion/rename, unsupported imports/capabilities and uncovered sources use complete suites.
 * Tests sharing transitive local imports run together to retain shared module state coverage.
 * Changed base sources receive the same audit; import/re-export declaration drift always widens.
 * Free runtime globals are limited to the reviewed direct calls/constructors in supportsReference;
 * external noble and test-runner bindings may only appear as direct callees, without alias escape.
 */
const REVIEWED_MODULE = {
  project: 'website-contracts',
  root: 'libs/website/domain/contracts',
  source: 'libs/website/domain/contracts/src',
  imports: new Map([
    ['bun:test', new Set(['describe', 'expect', 'it', 'test'])],
    ['@noble/hashes/sha2.js', new Set(['sha256'])],
    ['@noble/hashes/utils.js', new Set(['bytesToHex', 'hexToBytes', 'utf8ToBytes'])],
  ]),
};

const UNSUPPORTED_IDENTIFIERS = new Set([
  'Bun',
  'process',
  'global',
  'globalThis',
  'Deno',
  'fetch',
  'require',
  'eval',
  'Function',
  'Worker',
  'WebSocket',
  'XMLHttpRequest',
  'WebAssembly',
  'navigator',
  'document',
  'window',
  'setTimeout',
  'setInterval',
  'setImmediate',
  'queueMicrotask',
  'Date',
  'performance',
  'crypto',
  'prototype',
  '__proto__',
  'constructor',
]);

function fullModule(project: string, reason: string): TestSelection {
  return { mode: 'module', project, reasons: [reason] };
}

/** Discovers every source file; symlinks and non-TypeScript inputs cannot establish pure coverage. */
function discoverSources(
  repository: string,
  directory: string,
): { files: string[]; unsupported: string[] } {
  const files: string[] = [];
  const unsupported: string[] = [];
  for (const entry of readdirSync(join(repository, directory), { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      const children = discoverSources(repository, path);
      files.push(...children.files);
      unsupported.push(...children.unsupported);
    } else if (entry.isFile() && path.endsWith('.ts')) files.push(path);
    else unsupported.push(path);
  }
  return { files: files.sort(), unsupported };
}

/** Local bindings may carry state; reviewed global/imported functions may only be called directly. */
function supportsReference(
  node: ts.Identifier,
  checker: ts.TypeChecker,
  callBindings: ReadonlySet<string>,
): boolean {
  const parent = node.parent;
  // Proof: removing call binding checks admitted assert.extend before its hoisted import in the regression.
  if (callBindings.has(node.text)) return ts.isCallExpression(parent) && parent.expression === node;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return true;
  if (
    (ts.isPropertyAssignment(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isMethodSignature(parent)) &&
    parent.name === node
  )
    return true;
  const symbol = ts.isShorthandPropertyAssignment(parent)
    ? checker.getShorthandAssignmentValueSymbol(parent)
    : checker.getSymbolAtLocation(node);
  if (symbol !== undefined) return true;
  if (node.text === 'undefined') return true;
  if (ts.isNewExpression(parent) && parent.expression === node)
    return ['Error', 'Uint8Array'].includes(node.text);
  if (ts.isCallExpression(parent) && parent.expression === node) return node.text === 'String';
  if (
    ts.isPropertyAccessExpression(parent) &&
    parent.expression === node &&
    ts.isCallExpression(parent.parent) &&
    parent.parent.expression === parent
  ) {
    return ['Number.isSafeInteger', 'Reflect.get', 'console.log'].includes(parent.getText());
  }
  // Proof: disabling reference validation selected only one suite after Math.random mutation.
  return false;
}

function readImports(
  repository: string,
  path: string,
  files: ReadonlySet<string>,
  previous?: string,
): { imports: string[]; unsupported: string[] } {
  // Proof: missing middle.ts and mode-000 source failed the source-evidence negative instead of narrowing.
  const content = previous ?? readFileSync(join(repository, path), 'utf8');
  const emitted = ts.transpileModule(content, {
    fileName: path,
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
  });
  // Proof: malformed middle.ts failed the source-evidence negative before any successful selection.
  if (
    emitted.diagnostics?.some((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)
  ) {
    throw new Error(`Malformed source prevents test selection: ${path}`);
  }
  const source = ts.createSourceFile(
    resolve(repository, path),
    content,
    ts.ScriptTarget.Latest,
    true,
  );
  const options: ts.CompilerOptions = { noLib: true, noResolve: true };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = (name) => (name === source.fileName ? source : undefined);
  const checker = ts.createProgram([source.fileName], options, host).getTypeChecker();
  const callBindings = new Set<string>();
  const imports: string[] = [];
  const unsupported: string[] = [];
  // Proof: removing the alias prepass admitted assert.extend before its unchanged hoisted import.
  for (const statement of source.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      REVIEWED_MODULE.imports.has(statement.moduleSpecifier.text)
    ) {
      const bindings = statement.importClause?.namedBindings;
      if (bindings !== undefined && ts.isNamedImports(bindings)) {
        for (const binding of bindings.elements) callBindings.add(binding.name.text);
      }
    }
  }

  const visit = (node: ts.Node): void => {
    if (ts.isTypeNode(node)) return;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const specifier = node.moduleSpecifier;
      if (specifier !== undefined) {
        if (!ts.isStringLiteral(specifier)) unsupported.push(`Nonliteral import in ${path}`);
        else if (specifier.text.startsWith('.')) {
          const base = resolve(repository, dirname(path), specifier.text);
          const candidates = [base, `${base}.ts`, join(base, 'index.ts')];
          const dependency = candidates.find((candidate) => files.has(candidate));
          if (dependency === undefined)
            throw new Error(`Missing or outside-module import ${specifier.text} in ${path}`);
          imports.push(dependency);
        } else {
          const allowed = REVIEWED_MODULE.imports.get(specifier.text);
          const bindings = ts.isImportDeclaration(node)
            ? node.importClause?.namedBindings
            : undefined;
          // Proof: removing import-member validation accepted unchanged sha512 outside the reviewed package contract.
          if (
            allowed === undefined ||
            !ts.isImportDeclaration(node) ||
            node.importClause?.name !== undefined ||
            bindings === undefined ||
            !ts.isNamedImports(bindings) ||
            bindings.elements.some(
              (binding) => !allowed.has((binding.propertyName ?? binding.name).text),
            )
          ) {
            unsupported.push(`Unreviewed import ${specifier.text} in ${path}`);
          }
        }
      }
      return;
    }
    if (ts.isIdentifier(node) && !supportsReference(node, checker, callBindings)) {
      unsupported.push(`Unsupported global/import reference ${node.text} in ${path}`);
    }
    if (
      node.kind === ts.SyntaxKind.ImportKeyword ||
      ts.isImportEqualsDeclaration(node) ||
      ts.isMetaProperty(node) ||
      ts.isModuleDeclaration(node) ||
      node.kind === ts.SyntaxKind.DeclareKeyword ||
      (ts.isIdentifier(node) && UNSUPPORTED_IDENTIFIERS.has(node.text))
    ) {
      unsupported.push(`Unsupported capability ${node.getText(source)} in ${path}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { imports, unsupported };
}

function readDeclarations(content: string, path: string): string[] {
  const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true);
  return source.statements
    .filter((statement) => ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))
    .map((statement) => statement.getText(source));
}

function readPrevious(repository: string, base: string, path: string): string {
  const execution = Bun.spawnSync(
    ['git', '--no-replace-objects', '-C', repository, 'show', `${base}:${path}`],
    {
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  if (execution.exitCode !== 0)
    throw new Error(`Cannot read previous import evidence: ${execution.stderr.toString()}`);
  return execution.stdout.toString();
}

/**
 * Selects within the reviewed module only; Nx remains the authority for transitive module consumers.
 * Missing/unreadable/malformed source evidence throws. Unsupported impact returns an explained
 * complete-module verdict. Paths are repository-relative and are never shell-expanded.
 */
export function selectTestFiles(
  repository: string,
  selection: Selection,
  project: string,
): TestSelection {
  // Proof: removing this guard granted files mode to unreviewed wbs-domain in the opt-in negative.
  if (project !== REVIEWED_MODULE.project)
    return fullModule(project, 'Module has no reviewed file-selection contract');
  // Proof: removing this guard approved files=[] for base=head in the empty-selection negative.
  if (selection.changes.length === 0)
    throw new Error('File selection requires a nonempty immutable diff');
  const changed = new Set<string>();
  for (const change of selection.changes) {
    // Proof: removing this boundary failed delete/rename/fixture/config/external/new-file negatives.
    if (
      change.status !== 'M' ||
      change.oldMode !== '100644' ||
      change.newMode !== '100644' ||
      change.newPath === null ||
      change.oldPath !== change.newPath ||
      !change.newPath.startsWith(`${REVIEWED_MODULE.source}/`) ||
      !change.newPath.endsWith('.ts')
    ) {
      return fullModule(
        project,
        'New/deleted/renamed, nonregular, external, fixture or configuration input requires the complete module',
      );
    }
    changed.add(resolve(repository, change.newPath));
  }
  for (const path of changed) {
    const previous = readDeclarations(
      readPrevious(repository, selection.base, path.slice(resolve(repository).length + 1)),
      path,
    );
    const current = readDeclarations(readFileSync(path, 'utf8'), path);
    // Proof: removing this guard omitted former shared consumers after an import was removed.
    if (JSON.stringify(previous) !== JSON.stringify(current)) {
      return fullModule(
        project,
        'Import or re-export declarations changed; previous consumers require the complete module',
      );
    }
  }
  const discovered = discoverSources(repository, REVIEWED_MODULE.source);
  const tests = discovered.files.filter((path) => /\.(?:test|spec)\.ts$/.test(path));
  // Proof: removing this guard turned empty discovery into a full-module verdict in its negative.
  if (tests.length === 0) throw new Error('Reviewed module has no discovered test files');
  if (discovered.unsupported.length > 0)
    return fullModule(project, `Unsupported source input: ${discovered.unsupported.join(', ')}`);
  const paths = new Set(discovered.files.map((path) => resolve(repository, path)));
  const dependencies = new Map<string, string[]>();
  const unsupported: string[] = [];
  for (const path of discovered.files) {
    const audited = readImports(repository, path, paths);
    dependencies.set(resolve(repository, path), audited.imports);
    unsupported.push(...audited.unsupported);
    if (changed.has(resolve(repository, path))) {
      const former = readImports(
        repository,
        path,
        paths,
        readPrevious(repository, selection.base, path),
      );
      // Proof: removing former audit hid the old Number.isSafeInteger mutation and its disconnected consumer.
      unsupported.push(...former.unsupported);
    }
  }
  if (unsupported.length > 0) return fullModule(project, unsupported.join('; '));
  const closures = new Map<string, Set<string>>();
  for (const test of tests) {
    const closure = new Set<string>();
    const visit = (path: string): void => {
      if (closure.has(path)) return;
      closure.add(path);
      const imports = dependencies.get(path);
      if (imports === undefined) throw new Error(`Missing import evidence for ${path}`);
      for (const dependency of imports) visit(dependency);
    };
    visit(resolve(repository, test));
    closures.set(test, closure);
  }
  // Proof: removing this guard narrowed covered core.ts alongside uncovered index.ts.
  if ([...changed].some((path) => ![...closures.values()].some((closure) => closure.has(path)))) {
    return fullModule(
      project,
      'At least one changed source has no proven test consumer; complete module required',
    );
  }
  const selected = new Set<string>();
  for (const [test, closure] of closures)
    // Proof: removing this guard narrowed covered core.ts alongside uncovered index.ts.
    if ([...changed].some((path) => closure.has(path))) selected.add(test);
  let expanded = true;
  // Proof: disabling this expansion omitted a second suite sharing the first suite's local imports.
  while (expanded) {
    expanded = false;
    const shared = new Set(
      [...closures].filter(([test]) => selected.has(test)).flatMap(([, closure]) => [...closure]),
    );
    for (const [test, closure] of closures) {
      if (!selected.has(test) && [...closure].some((path) => shared.has(path))) {
        selected.add(test);
        expanded = true;
      }
    }
  }
  return {
    mode: 'files',
    project,
    files: [...selected].sort(),
    reasons: [
      'Reviewed pure module: static import/re-export consumers and tests sharing local dependencies selected',
    ],
  };
}

/** Executes the additional Nx entrypoint and retains the canonical trailing TypeScript check. */
export function runTestFiles(
  repository: string,
  selection: Selection,
  project: string,
): TestSelection {
  if (project !== REVIEWED_MODULE.project)
    throw new Error(`No selected-test entrypoint for ${project}`);
  const selected = selectTestFiles(repository, selection, project);
  const reportRoot = mkdtempSync(join(tmpdir(), 'puni-ci-selected-tests-'));
  try {
    const report = join(reportRoot, 'junit.xml');
    const files = selected.mode === 'files' ? selected.files : [REVIEWED_MODULE.source];
    const execution = Bun.spawnSync(
      [
        process.execPath,
        'test',
        '--bail',
        '--timeout=30000',
        '--reporter=junit',
        `--reporter-outfile=${report}`,
        ...files.map((path) => `./${path}`),
      ],
      { cwd: repository, stdout: 'inherit', stderr: 'inherit' },
    );
    // Proof: removing this check lost test-failure context from a deliberately failing FIRST case.
    if (execution.exitCode !== 0) throw new Error('Selected module tests failed');
    // Proof: Bun 1.4.2 returned zero for an empty selected file; existing JUnit parsing rejected its zero cases.
    const cases = readJUnitReport(readFileSync(report, 'utf8'));
    // Proof: removing this guard approved a full-module fallback containing only skipped cases.
    if (selected.mode === 'module' && !cases.some((test) => test.outcome === 'passed')) {
      throw new Error('Complete module registered no passed test cases');
    }
    // Proof: removing this guard omitted one empty selected file while another selected file passed.
    if (
      selected.mode === 'files' &&
      selected.files.some(
        (path) =>
          !cases.some(
            (test) =>
              resolve(repository, test.file) === resolve(repository, path) &&
              test.outcome === 'passed',
          ),
      )
    ) {
      throw new Error('A selected file registered no passed test cases');
    }
    const checked = Bun.spawnSync(
      [process.execPath, 'x', 'tsc', '-p', `${REVIEWED_MODULE.root}/tsconfig.json`, '--noEmit'],
      {
        cwd: repository,
        stdout: 'inherit',
        stderr: 'inherit',
      },
    );
    // Proof: removing this check approved an unselected source's TS2322 after selected tests passed.
    if (checked.exitCode !== 0) throw new Error('Selected module TypeScript check failed');
    return selected;
  } finally {
    rmSync(reportRoot, { recursive: true });
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const operation = args.at(0);
  const project = args.at(1);
  const base = args.at(2);
  const head = args.at(3);
  if (
    args.length !== 4 ||
    operation !== 'run' ||
    project === undefined ||
    base === undefined ||
    head === undefined
  ) {
    throw new Error('Usage: ci-test-selection.ts run <project> <base-sha> <head-sha>');
  }
  const repository = process.cwd();
  const selection = selectChanges(repository, base, head);
  process.stdout.write(`${JSON.stringify(runTestFiles(repository, selection, project))}\n`);
}
