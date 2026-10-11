import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

const read = (path: string): string => readFileSync(join(import.meta.dir, path), 'utf8');

const walkthrough = read('../../../../docs/website/walkthrough.md');

/** Where each evidence prefix in the walkthrough table points, and how a named case is declared. */
const sources = new Map<string, { text: string; declares: (name: string) => string[] }>(
  Object.entries({
    'screens.mjs': {
      text: read('../browser/screens.mjs'),
      declares: (name: string) => [`name: '${name}',`],
    },
    'conversation.mjs': {
      text: read('../browser/conversation.mjs'),
      declares: (name: string) => [`    // ${name}. `],
    },
    'conversation.test.ts': {
      text: read('../../be-01/src/conversation/conversation.test.ts'),
      declares: (name: string) => [`test('${name}',`, `test("${name}",`],
    },
    'conversation-harness.test.tsx': {
      text: read('./conversation-harness.test.tsx'),
      declares: (name: string) => [`test('${name}',`, `test("${name}",`],
    },
  }),
);

/** The table's rows below its header and separator, as cells. */
function readScenarioRows(): string[][] {
  const lines = walkthrough.split('\n').filter((line) => line.startsWith('| '));
  return lines
    .slice(2)
    .map((line) => line.split(' | ').map((cell) => cell.replace(/^\| |\s*\|$/g, '').trim()));
}

test('every scenario row names at least one capture or test', () => {
  const rows = readScenarioRows();
  expect(rows.map((row) => row[0])).toEqual([
    'Home request, AI off',
    'Home request, AI live',
    'Early conversion',
    'Eighth-turn cap',
    'AI disabled',
    'AI paused',
    'Bot check refused',
    'Lost or missing claim',
    'Cancelled sign-in',
    'Operator inbox',
  ]);
  for (const row of rows) expect(row[2]?.match(/`[^`]+:[^`]+`/g)?.length ?? 0).toBeGreaterThan(0);
});

test('every capture, browser case and test the walkthrough names exists', () => {
  const references = [...walkthrough.matchAll(/`([\w.-]+\.(?:mjs|ts|tsx)):([^`]+)`/g)];
  expect(references.length).toBeGreaterThan(10);
  const missing = references.flatMap(([, file = '', name = '']) => {
    const source = sources.get(file);
    if (source === undefined) return [`${file} is not a known evidence source`];
    // Proof: renaming the `build-paused` capture in the table to `build-pausd` failed this list.
    return source.declares(name).some((declaration) => source.text.includes(declaration))
      ? []
      : [`${file}:${name}`];
  });
  expect(missing).toEqual([]);
});
