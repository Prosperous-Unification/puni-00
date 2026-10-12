import ts from 'typescript';

/** One clock reference: the file it was found in, its 1-based line and its source text. */
export interface ClockRead {
  readonly path: string;
  readonly line: number;
  readonly text: string;
}

/** Globals that are a clock, or can reach one, in every value position. */
const clockGlobals = new Set(['performance', 'Temporal', 'globalThis', 'global', 'window', 'self']);
/** Globals whose other members are not clocks: only a literal non-clock member may be read. */
const clockHolders = new Set(['process', 'Bun']);
/**
 * Member names that read a clock on any object (`process`, `os`, `perf_hooks`, `Bun`):
 * `randomUUIDv7` embeds the current time and `Intl.DateTimeFormat` formats it by default.
 */
const clockMembers = new Set([
  'hrtime',
  'uptime',
  'nanoseconds',
  'timeOrigin',
  'randomUUIDv7',
  'DateTimeFormat',
]);
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

/**
 * Every clock reference in one TypeScript source, found on its syntax tree rather than its text,
 * so comments and type positions never count.
 *
 * A clock reference is any value use of `Date` other than `new Date(x)` with a defined argument,
 * `Date.parse`, `Date.UTC` or `instanceof Date`; any value use of `performance`, `Temporal` or a
 * global object; any use of `process` or `Bun` other than a literal non-clock member; any member,
 * key, binding or named import called `hrtime`, `uptime`, `nanoseconds`, `timeOrigin`,
 * `randomUUIDv7` or `DateTimeFormat`; and any load of `perf_hooks` or of a computed module
 * specifier. Not caught: clocks outside the JavaScript runtime (file times, a subprocess that runs
 * `date`), computed keys on other objects (`os[key]()`, `Reflect.get(os, name)`), `new Date(arg)`
 * whose argument is undefined only at runtime, and code built at runtime (`eval`, `new Function`).
 * Twilight Burokrat's and Twilight Dash's `no-ambient-clock.test.ts` apply it to their packages.
 */
export function findClockReads(path: string, source: string): ClockRead[] {
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
