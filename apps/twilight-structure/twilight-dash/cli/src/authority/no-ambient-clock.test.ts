import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { expect, test } from 'bun:test';

const SOURCE_ROOT = join(import.meta.dir, '..');
const AMBIENT_CLOCK = /\bDate\.now\b|\bnew Date\(\s*\)|\bperformance\.now\b|\bprocess\.hrtime\b/;

/** Production modules the authority runs: `authority/**` without tests, plus the dispatcher. */
function productionModules(): string[] {
  const authority = readdirSync(join(SOURCE_ROOT, 'authority'), { recursive: true })
    .map(String)
    .filter((path) => path.endsWith('.ts') && !path.endsWith('.test.ts'))
    .map((path) => join(SOURCE_ROOT, 'authority', path));
  return [...authority, join(SOURCE_ROOT, 'cli.ts')].sort();
}

function codeLines(path: string): string[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => !/^\s*(?:\/\/|\*|\/\*)/.test(line));
}

test('only clock.ts reads the wall clock', () => {
  const modules = productionModules();
  expect(modules.map((path) => relative(SOURCE_ROOT, path))).toContain('authority/clock.ts');
  // Proof: inserting `Date.now()` into claims.ts failed this assertion naming
  // `authority/claims.ts` (2026-10-11).
  const readers = modules
    .filter((path) => codeLines(path).some((line) => AMBIENT_CLOCK.test(line)))
    .map((path) => relative(SOURCE_ROOT, path));
  expect(readers).toEqual(['authority/clock.ts']);
  // Proof: defaulting `runDash`'s clock to `wallClock()` failed this assertion naming `cli.ts`
  // (2026-10-11).
  const composers = [...modules, join(SOURCE_ROOT, 'entrypoint.ts')]
    .filter((path) => codeLines(path).some((line) => /\bwallClock\(\)(?!\s*:)/.test(line)))
    .map((path) => relative(SOURCE_ROOT, path));
  expect(composers).toEqual(['entrypoint.ts']);
});
