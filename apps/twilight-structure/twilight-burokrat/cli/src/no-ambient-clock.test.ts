import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from 'bun:test';
import ts from 'typescript';

interface ClockRead {
  readonly path: string;
  readonly line: number;
  readonly text: string;
}

/**
 * Twilight Burokrat reads no clock (docs/twilight-structure/names.md). The only reads left in the
 * package are Twilight Dash's dynamic half that has not moved yet. Each listed file may keep at
 * most its count of clock references, so a reference in any other file fails, and so does an
 * extra one inside a listed file. A count may only fall. An entry whose file no longer exists
 * fails too, so the list cannot outlive the relocation it records. The cap is a count: replacing
 * one read inside a listed file with another read is not caught.
 *
 * A clock reference is any value use of `Date` other than `new Date(x)` with a defined argument,
 * `Date.parse`, `Date.UTC` or `instanceof Date`; any value use of `performance`, `Temporal` or a
 * global object; any use of `process` or `Bun` other than a literal non-clock member; any member,
 * key, binding or named import called `hrtime`, `uptime`, `nanoseconds` or `timeOrigin`; and any
 * load of `perf_hooks` or of a computed module specifier. Not caught: clocks outside the
 * JavaScript runtime (file times, a subprocess that runs `date`), computed keys on other objects
 * (`os[key]()`, `Reflect.get(os, name)`) and code built at runtime (`eval`, `new Function`).
 */
const dashOwnedClockReads: readonly { readonly paths: readonly string[]; readonly most: number }[] =
  [
    // The review harness launcher: journal timestamps and the journal lock's wait deadline.
    { paths: ['review/invoker.ts'], most: 10 },
    // Candidate check runs: each check's measured start and end.
    { paths: ['policy/prepare-activation-cli.ts'], most: 2 },
    { paths: ['policy/prepare-relocation-activation-cli.ts'], most: 2 },
    // The lease authority's default clock; WBS 080.19 splits `admission/` into
    // `admission-runtime/` and then moves it to Dash with the clock required.
    {
      paths: ['admission/authority-store.ts', 'admission-runtime/authority-store.ts'],
      most: 2,
    },
  ];

const sourceRoot = import.meta.dir;

/** Globals that are a clock, or can reach one, in every value position. */
const clockGlobals = new Set(['performance', 'Temporal', 'globalThis', 'global', 'window', 'self']);
/** Globals whose other members are not clocks: only a literal non-clock member may be read. */
const clockHolders = new Set(['process', 'Bun']);
/** Member names that read a clock on any object (`process`, `os`, `perf_hooks`, `Bun`). */
const clockMembers = new Set(['hrtime', 'uptime', 'nanoseconds', 'timeOrigin']);
/** Named imports that bind a clock, whatever local name they take. */
const clockImports = new Set([...clockMembers, 'performance', 'Temporal']);
const clockModules = new Set(['perf_hooks', 'node:perf_hooks']);

function isInTypePosition(node: ts.Node): boolean {
  for (let current = node.parent; !ts.isSourceFile(current); current = current.parent) {
    if (ts.isExpressionWithTypeArguments(current)) {
      return !(
        ts.isHeritageClause(current.parent) &&
        current.parent.token === ts.SyntaxKind.ExtendsKeyword &&
        ts.isClassLike(current.parent.parent)
      );
    }
    if (ts.isTypeNode(current)) return true;
    if (ts.isStatement(current) || ts.isExpression(current)) return false;
  }
  return false;
}

/** True when the identifier names a member or a key, not a binding in scope. */
function isMemberName(node: ts.Identifier): boolean {
  const parent = node.parent;
  return (
    (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
    (ts.isPropertyAssignment(parent) && parent.name === node) ||
    (ts.isBindingElement(parent) && parent.propertyName === node) ||
    ((ts.isMethodDeclaration(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isMethodSignature(parent) ||
      ts.isGetAccessorDeclaration(parent) ||
      ts.isSetAccessorDeclaration(parent) ||
      ts.isEnumMember(parent)) &&
      parent.name === node) ||
    ts.isImportSpecifier(parent) ||
    ts.isExportSpecifier(parent) ||
    ts.isQualifiedName(parent)
  );
}

function literalKey(node: ts.ElementAccessExpression): string | undefined {
  const key = node.argumentExpression;
  return ts.isStringLiteralLike(key) ? key.text : undefined;
}

function isUndefinedValue(node: ts.Expression): boolean {
  return (ts.isIdentifier(node) && node.text === 'undefined') || ts.isVoidExpression(node);
}

/** `new Date(x)`, `Date.parse`, `Date.UTC` and `instanceof Date` are pure; every other use is not. */
function isPureDateUse(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (ts.isNewExpression(parent) && parent.expression === node) {
    const first = parent.arguments?.[0];
    // Proof (2026-10-11): treating every `new Date(x)` as a read flagged `new Date(1_000)` and
    // `new Date("…")` in the detector test and six pure uses in `contracts/` and `evidence/`.
    return first !== undefined && !ts.isSpreadElement(first) && !isUndefinedValue(first);
  }
  if (ts.isPropertyAccessExpression(parent) && parent.expression === node) {
    return (
      (parent.name.text === 'parse' || parent.name.text === 'UTC') &&
      ts.isCallExpression(parent.parent) &&
      parent.parent.expression === parent
    );
  }
  return (
    ts.isBinaryExpression(parent) &&
    parent.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword &&
    parent.right === node
  );
}

function isNonClockMemberOf(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (ts.isPropertyAccessExpression(parent) && parent.expression === node) {
    return !clockMembers.has(parent.name.text);
  }
  if (ts.isElementAccessExpression(parent) && parent.expression === node) {
    const key = literalKey(parent);
    return key !== undefined && !clockMembers.has(key);
  }
  return false;
}

function isClockIdentifier(node: ts.Identifier): boolean {
  if (isMemberName(node) || isInTypePosition(node)) return false;
  if (node.text === 'Date') return !isPureDateUse(node);
  if (clockGlobals.has(node.text)) return true;
  if (clockHolders.has(node.text)) return !isNonClockMemberOf(node);
  return false;
}

function isClockMemberName(node: ts.Node): boolean {
  if (ts.isPropertyAccessExpression(node)) return clockMembers.has(node.name.text);
  if (ts.isElementAccessExpression(node)) {
    const key = literalKey(node);
    return key !== undefined && clockMembers.has(key);
  }
  if (ts.isBindingElement(node)) {
    const name = node.propertyName ?? node.name;
    return ts.isIdentifier(name) && clockMembers.has(name.text);
  }
  if (ts.isImportSpecifier(node)) return clockImports.has((node.propertyName ?? node.name).text);
  return false;
}

/** Static and dynamic module loads: a clock module, or a specifier no reader can resolve. */
function isClockModuleLoad(node: ts.Node): boolean {
  const specifier =
    ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
      ? node.moduleSpecifier
      : ts.isCallExpression(node) &&
          (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
            (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
        ? node.arguments[0]
        : undefined;
  if (specifier === undefined) return false;
  return !ts.isStringLiteralLike(specifier) || clockModules.has(specifier.text);
}

function isClockRead(node: ts.Node): boolean {
  if (ts.isIdentifier(node)) return isClockIdentifier(node);
  return isClockMemberName(node) || isClockModuleLoad(node);
}

function findClockReads(path: string, source: string): ClockRead[] {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const reads: ClockRead[] = [];
  const visit = (node: ts.Node): void => {
    if (isClockRead(node)) {
      reads.push({
        path,
        line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
        text: node.getText(file),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return reads;
}

function readPackageSources(): string[] {
  return [...new Bun.Glob('**/*.ts').scanSync({ cwd: sourceRoot })]
    .filter((path) => !path.endsWith('.test.ts'))
    .sort();
}

const pureLines = [
  '// new Date() and Date.now() in a comment are not reads',
  'const parsed = new Date(1_000);',
  'const parsedText = new Date("2026-10-11T00:00:00.000Z");',
  'const parsedMillis = Date.parse("2026-10-11T00:00:00.000Z");',
  'const utc = Date.UTC(2026, 9, 11);',
  'const isDate = value instanceof Date;',
  'let typed: Date | undefined;',
  'const env = process.env["HOME"]; const argv = process.argv; const v = Bun.version;',
  'const policy = { performance: 1 }; const threshold = policy.performance === 1;',
  "import { tmpdir } from 'node:os';",
  "const lazy = await import('./review/exhaustive-coverage');",
];

const clockLines = [
  'const a = Date.now();',
  'const b = new Date();',
  'const c = new Date;',
  'const d = Date();',
  'const e = Date.now?.();',
  'const { now } = Date;',
  'const C = Date;',
  'const f = Date["now"]();',
  'const g = new (Date)();',
  'const h = new Date(undefined);',
  'const i = new Date(...[]);',
  'const j = [1].map(Date.now);',
  'const k = Reflect.apply(Date.now, null, []);',
  'const l = Date.now.call(null);',
  'class Clock extends Date {}',
  'const m = globalThis.Date.now();',
  'const n = new globalThis.Date();',
  'const o = performance.now();',
  'const p = performance.timeOrigin;',
  'const q = process.hrtime();',
  'const r = process.hrtime.bigint();',
  'const s = process.uptime();',
  'const t = process["hrtime"]();',
  'const u = process[key];',
  'const { hrtime } = process;',
  'const P = process;',
  'const w = Bun.nanoseconds();',
  'const { nanoseconds } = Bun;',
  'const x = Temporal.Now.instant();',
  'const { Now } = Temporal;',
  'const y = os.uptime();',
  "import { hrtime as clock } from 'node:process';",
  "import { performance as perf } from 'node:perf_hooks';",
  "import * as hooks from 'perf_hooks';",
  "const z = await import('node:perf_hooks');",
  'const dynamic = await import(specifier);',
  "const required = require('perf_hooks');",
];

test('findClockReads names every clock reference and ignores pure dates, types and comments', () => {
  const source = [...pureLines, ...clockLines].join('\n');
  const flaggedLines = new Set(findClockReads('sample.ts', source).map((read) => read.line));
  const expectedLines = clockLines.map((_, index) => pureLines.length + index + 1);
  // Proof (2026-10-11): switching off one rule at a time dropped its lines from this set: the Date
  // rule (15 lines, `Date.now()` to `extends Date`), clock globals (`globalThis`, `performance`,
  // `Temporal`), clock holders (`process[key]`, `const P = process`), clock members
  // (`os.uptime()`, `import { hrtime as clock }`), module loads (the four `perf_hooks` and
  // computed specifiers) and the `undefined` argument test (`new Date(undefined)`). Switching off
  // the type-position skip flagged `let typed: Date` here and four type uses in the package.
  expect([...flaggedLines].sort((left, right) => left - right)).toEqual(expectedLines);
});

test('the Burokrat package reads no clock outside the Dash-owned sites', () => {
  const sources = readPackageSources();
  // Proof (2026-10-11): globbing `**/*.tsx` found no sources and this failed with `Expected to
  // contain: "cli.ts"` instead of passing a scan of nothing.
  expect(sources).toContain('cli.ts');
  const reads = sources.flatMap((path) =>
    findClockReads(path, readFileSync(join(sourceRoot, path), 'utf8')),
  );
  const missing = dashOwnedClockReads.filter((entry) =>
    entry.paths.every((path) => !sources.includes(path)),
  );
  // Proof (2026-10-11): renaming the `policy/prepare-activation-cli.ts` entry to a file that does
  // not exist failed here with the stale path listed.
  expect(missing).toEqual([]);
  const excess = dashOwnedClockReads.reduce<ClockRead[]>((unclaimed, entry) => {
    const owned = unclaimed.filter((read) => entry.paths.includes(read.path));
    return owned.length <= entry.most
      ? unclaimed.filter((read) => !entry.paths.includes(read.path))
      : unclaimed;
  }, reads);
  // Proof (2026-10-11): appending `const { now: sampleNow } = Date` to `evidence/manual.ts`,
  // `globalThis.Date.now()` to `contracts/records.ts`, `process['uptime']()` to `rules/check.ts`
  // or an eleventh `Date.now()` to `review/invoker.ts` each failed here with the reads listed;
  // restoring the file passed.
  expect(excess).toEqual([]);
});
