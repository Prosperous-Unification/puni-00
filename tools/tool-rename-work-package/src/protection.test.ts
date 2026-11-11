import { readFileSync } from 'node:fs';

import { expect, it } from 'bun:test';

import { PROTECTED_LITERALS, readProtectedSpans } from './protection';
import { renameText } from './rename-text';

const MODEL_PATH = 'libs/wbs/domain/domain/src/access-role.ts';
const MODEL = readFileSync(new URL('../../../' + MODEL_PATH, import.meta.url), 'utf8');

it('refuses malformed syntax before selecting a required permission-model enclosure', () => {
  expect(() => renameText(MODEL + '\nconst = ;\n', MODEL_PATH)).toThrow(
    'protected source syntax is malformed',
  );
});

it('refuses a missing required model declaration without treating another declaration as its context', () => {
  expect(() =>
    renameText(MODEL.replace('export const PERMISSIONS =', 'export const OTHER ='), MODEL_PATH),
  ).toThrow('protected declaration must occur exactly once');
});

it('refuses two required parent declarations instead of selecting the first', () => {
  expect(() => renameText(MODEL + '\nexport interface ProjectChain {}\n', MODEL_PATH)).toThrow(
    'protected enclosure must occur exactly once',
  );
});

function replacePackageMembers(transform: (members: string) => string): string {
  const start = MODEL.indexOf('export interface WorkPackageChain {');
  const end = MODEL.indexOf('}', start);
  if (start < 0 || end < 0) throw new Error('actual package-chain declaration absent');
  return MODEL.slice(0, start) + transform(MODEL.slice(start, end)) + MODEL.slice(end);
}

it('refuses an absent parent member in the actual package-chain declaration', () => {
  const changed = replacePackageMembers((members) =>
    members.replace('readonly projectId:', 'readonly removedParent:'),
  );
  expect(() => renameText(changed, MODEL_PATH)).toThrow(
    'protected parent field must occur exactly once',
  );
});

it('refuses duplicate parent members rather than silently widening their protection', () => {
  const changed = replacePackageMembers((members) => members + 'readonly projectId: string;\n');
  expect(() => renameText(changed, MODEL_PATH)).toThrow(
    'protected parent field must occur exactly once',
  );
});

it('holds every closed catalogue literal rule to an actual current tracked model occurrence', () => {
  const spans = readProtectedSpans(MODEL, MODEL_PATH);
  for (const literal of PROTECTED_LITERALS)
    expect(
      spans.some((span) => span.rule === 'catalogue-' + literal),
      literal,
    ).toBe(true);
});

it('does not let an already-new Markdown link token hide an old path segment', () => {
  expect(renameText('[window](../old-project/work-package-windows.md)', 'docs/window.md')).toBe(
    '[window](../old-work-package/work-package-windows.md)',
  );
});

it('does not infer a new grant target from an unqualified object kind or field', () => {
  expect(renameText("const target = {kind: 'project', projectId: 'old'};", 'src/legacy.ts')).toBe(
    "const target = {kind: 'work_package', workPackageId: 'old'};",
  );
});

function replaceBreadthStatement(transform: (statement: string) => string): string {
  const start = MODEL.indexOf('const BREADTH:');
  const close = MODEL.indexOf('\n};', start);
  if (start < 0 || close < 0) throw new Error('actual breadth declaration absent');
  const end = close + 3;
  return MODEL.slice(0, start) + transform(MODEL.slice(start, end)) + MODEL.slice(end);
}

it('a named variable cannot protect an unrelated sibling declarator on its statement', () => {
  const changed = replaceBreadthStatement(
    (statement) => statement.slice(0, -1) + ", legacy = { project: 'old' };",
  );
  expect(renameText(changed, MODEL_PATH)).toContain("legacy = { workPackage: 'old' }");
});

it('refuses duplicate named variable declarators even when they share one statement', () => {
  const changed = replaceBreadthStatement(
    (statement) => statement.slice(0, -1) + ', BREADTH = {};',
  );
  expect(() => renameText(changed, MODEL_PATH)).toThrow(
    'protected declaration must occur exactly once',
  );
});

it('refuses a variable enclosure replaced by a same-name function instead of widening its context', () => {
  const changed = replaceBreadthStatement(() => "function BREADTH() { return {project: 'old'}; }");
  expect(() => renameText(changed, MODEL_PATH)).toThrow('protected declaration kind changed');
});

it('refuses a named literal map replaced by a callable initializer', () => {
  const changed = replaceBreadthStatement(() => "const BREADTH = () => ({project: 'old'});");
  expect(() => {
    renameText(changed, MODEL_PATH);
  }).toThrow('protected literal initializer kind changed');
});

for (const executable of [
  "callback: () => ({project: 'old'}),",
  "callback: function () { return {project: 'old'}; },",
  "callback() { return {project: 'old'}; },",
  "get callback() { return {project: 'old'}; },",
]) {
  it('refuses executable descendants in protected catalogue literals: ' + executable, () => {
    const changed = replaceBreadthStatement((statement) =>
      statement.replace('= {', '= {' + executable),
    );
    expect(changed).not.toBe(MODEL);
    expect(() => renameText(changed, MODEL_PATH)).toThrow(
      'protected literal contains executable descendant',
    );
  });
}
