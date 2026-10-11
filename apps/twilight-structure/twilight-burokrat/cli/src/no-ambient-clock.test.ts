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
 * package are Twilight Dash's dynamic half that has not moved yet; each file may keep at most its
 * listed count, so a new read anywhere else, or an extra one inside a listed file, fails. A count
 * may only fall. An entry whose file no longer exists fails too, so the list cannot outlive the
 * relocation it records.
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

function isNamedAccess(node: ts.Node, owner: string, member: string): boolean {
  return (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === owner &&
    node.name.text === member
  );
}

function isClockRead(node: ts.Node): boolean {
  if (ts.isNewExpression(node)) {
    // Proof (2026-10-11): dropping the argument test flagged `new Date(1_000)` and
    // `new Date("…")` in the detector test (lines 2 and 3) and `new Date(epochMs)` in the scan.
    return (
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'Date' &&
      (node.arguments === undefined || node.arguments.length === 0)
    );
  }
  if (ts.isCallExpression(node)) {
    const callee = node.expression;
    return (
      (ts.isIdentifier(callee) && callee.text === 'Date') ||
      isNamedAccess(callee, 'Date', 'now') ||
      isNamedAccess(callee, 'performance', 'now') ||
      isNamedAccess(callee, 'Bun', 'nanoseconds') ||
      isNamedAccess(callee, 'process', 'hrtime') ||
      (ts.isPropertyAccessExpression(callee) &&
        isNamedAccess(callee.expression, 'process', 'hrtime'))
    );
  }
  return isNamedAccess(node, 'Temporal', 'Now');
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

test('findClockReads names every ambient clock and ignores explicit instants and comments', () => {
  const source = [
    '// new Date() and Date.now() in a comment are not reads',
    'const parsed = new Date(1_000);',
    'const parsedText = new Date("2026-10-11T00:00:00.000Z");',
    'const a = Date.now();',
    'const b = new Date();',
    'const c = new Date;',
    'const d = Date();',
    'const e = performance.now();',
    'const f = Bun.nanoseconds();',
    'const g = process.hrtime();',
    'const h = process.hrtime.bigint();',
    'const i = Temporal.Now.instant();',
  ].join('\n');
  expect(findClockReads('sample.ts', source).map((read) => read.line)).toEqual([
    4, 5, 6, 7, 8, 9, 10, 11, 12,
  ]);
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
  // Proof (2026-10-11): appending `Date.now()` to `evidence/manual.ts`, `Date()` to
  // `contracts/records.ts`, or an eleventh `new Date()` to `review/invoker.ts` each failed here
  // with the reads listed; restoring the file passed.
  expect(excess).toEqual([]);
});
