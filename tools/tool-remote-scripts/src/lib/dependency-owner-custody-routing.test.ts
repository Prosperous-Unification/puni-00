import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { expect, test } from 'bun:test';
import ts from 'typescript';

function readSource(relative: string): ts.SourceFile {
  const file = new URL(relative, import.meta.url);
  return ts.createSourceFile(
    file.pathname,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

function sha256(source: string): string {
  return createHash('sha256').update(source).digest('hex');
}

function callsNamed(source: ts.SourceFile, name: string): ts.CallExpression[] {
  const calls: ts.CallExpression[] = [];
  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === name
    )
      calls.push(node);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return calls;
}

function importPaths(source: ts.SourceFile): string[] {
  return source.statements
    .filter(ts.isImportDeclaration)
    .map((statement) => statement.moduleSpecifier)
    .filter(ts.isStringLiteral)
    .map((specifier) => specifier.text);
}

test('ordinary storage callbacks retain their bodies without native owner bootstrap', () => {
  const source = readSource('./dependency-activation-storage.test.ts');
  const callbacks = callsNamed(source, 'test');
  expect(callbacks).toHaveLength(42);
  if (callbacks.some((call) => call.arguments.length < 2))
    throw new Error('ordinary test callback absent');
  expect(
    sha256(
      callbacks
        .map((call) => `${call.arguments[0].getText(source)}\0${call.arguments[1].getText(source)}`)
        .join('\0'),
    ),
  ).toBe('d1fc77b41acb688944122245eb49705895242cb5bbe6210c3121eb82985da87a');
  const cleanup = callsNamed(source, 'afterEach');
  expect(cleanup).toHaveLength(1);
  if (cleanup[0].arguments.length !== 1) throw new Error('ordinary cleanup callback absent');
  expect(sha256(cleanup[0].arguments[0].getText(source))).toBe(
    '6c7c17458b29fd9151714be44cc3c98ec8f0c919c49ac1d22ffcff5acfed836a',
  );
  const originalOwnerLoop = source.statements
    .filter(ts.isForOfStatement)
    .find((statement) =>
      statement.getText(source).includes('UC2 original ${disposition} ${expiry}'),
    );
  if (originalOwnerLoop === undefined) throw new Error('ordinary four-route owner loop absent');
  expect(sha256(originalOwnerLoop.getText(source))).toBe(
    '80d392c1f706611c6298b9910a0339296de4325d32a0c414a7666c7d3cf22fa2',
  );
  expect(importPaths(source)).not.toContain('../fixtures/dependency-owner-custody');
  expect(callsNamed(source, 'prepareDependencyOwnerCustody')).toHaveLength(0);
  expect(callbacks.some((call) => call.arguments[0].getText(source) === 'row.title')).toBe(false);
});

test('native custody acceptance owns exactly three unconditional observed cases', () => {
  const helper = readSource('../fixtures/dependency-owner-custody.ts');
  const roster = helper.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((declaration) => declaration.name.getText(helper) === 'dependencyOwnerCustodyCases');
  if (roster?.initializer === undefined || !ts.isAsExpression(roster.initializer))
    throw new Error('private custody roster declaration absent');
  const values = roster.initializer.expression;
  if (!ts.isArrayLiteralExpression(values))
    throw new Error('private custody roster is not literal');
  const cases = values.elements.map((entry) => {
    if (!ts.isObjectLiteralExpression(entry)) throw new Error('custody case is not literal');
    const fields = entry.properties.filter(ts.isPropertyAssignment);
    const variant = fields.find((field) => field.name.getText(helper) === 'variant')?.initializer;
    const title = fields.find((field) => field.name.getText(helper) === 'title')?.initializer;
    if (
      variant === undefined ||
      title === undefined ||
      !ts.isStringLiteral(variant) ||
      !ts.isStringLiteral(title)
    )
      throw new Error('custody case variant or title is not literal');
    return { variant: variant.text, title: title.text };
  });
  expect(cases).toEqual([
    {
      variant: 'before',
      title: 'UC2 constructor before-native UNKNOWN retains original runtime and outer locks',
    },
    {
      variant: 'after',
      title: 'UC2 constructor after-known-return UNKNOWN retains original runtime and outer locks',
    },
    {
      variant: 'healthy',
      title:
        'UC2 constructor healthy cleanup preserves primary refusal and releases original locks',
    },
  ]);

  const acceptance = readSource('../../acceptance/dependency-owner-custody.test.ts');
  expect(acceptance.statements).toHaveLength(4);
  expect(importPaths(acceptance)).toEqual(['bun:test', '../src/fixtures/dependency-owner-custody']);
  const preparation = callsNamed(acceptance, 'prepareDependencyOwnerCustody');
  expect(preparation).toHaveLength(1);
  const owner = acceptance.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find(
      (declaration) => declaration.name.getText(acceptance) === 'dependencyCustodyObservations',
    );
  if (owner?.initializer === undefined || !ts.isAwaitExpression(owner.initializer))
    throw new Error('native custody preparation must be top-level awaited');
  expect(owner.initializer.expression).toBe(preparation[0]);
  const loops = acceptance.statements.filter(ts.isForOfStatement);
  expect(loops).toHaveLength(1);
  expect(loops[0].expression.getText(acceptance)).toBe('dependencyOwnerCustodyCases');
  const registrations = callsNamed(acceptance, 'test');
  expect(registrations).toHaveLength(1);
  if (registrations[0].arguments.length !== 3)
    throw new Error('native custody registration arguments differ');
  if (!ts.isExpressionStatement(loops[0].statement))
    throw new Error('native custody registration must be the direct loop body');
  expect(loops[0].statement.expression).toBe(registrations[0]);
  expect(registrations[0].arguments[0].getText(acceptance)).toBe('row.title');
  expect(registrations[0].arguments[2].getText(acceptance)).toBe('10000');
  expect(sha256(registrations[0].arguments[1].getText(acceptance))).toBe(
    'c316aae6562d6e3707d780c56d41896318e99aaa7cff43512c62bd1daed45392',
  );
  expect(acceptance.statements.filter(ts.isIfStatement)).toHaveLength(0);
  expect(callsNamed(acceptance, 'skip')).toHaveLength(0);
  expect(callsNamed(acceptance, 'Map')).toHaveLength(0);
});
