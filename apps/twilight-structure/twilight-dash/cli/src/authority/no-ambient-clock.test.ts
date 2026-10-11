import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { expect, test } from 'bun:test';

const SOURCE_ROOT = join(import.meta.dir, '..');
/** Zero-argument `Date` (with or without `new`), `Date.now` and every monotonic or origin read. */
const AMBIENT_CLOCK =
  /\bDate\.now\b|\bDate\(\s*\)|\bperformance\.(?:now|timeOrigin)\b|\bprocess\.hrtime\b|\bBun\.nanoseconds\b/;

/** Production modules: `authority/**` without tests, the dispatcher and the entrypoint. */
function productionModules(): string[] {
  const authority = readdirSync(join(SOURCE_ROOT, 'authority'), { recursive: true })
    .map(String)
    .filter((path) => path.endsWith('.ts') && !path.endsWith('.test.ts'))
    .map((path) => join(SOURCE_ROOT, 'authority', path));
  return [...authority, join(SOURCE_ROOT, 'cli.ts'), join(SOURCE_ROOT, 'entrypoint.ts')].sort();
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
  // `authority/claims.ts`; appending `Bun.nanoseconds()`, `performance.timeOrigin` or `Date()` to
  // entrypoint.ts each failed it naming `entrypoint.ts` (2026-10-11).
  const readers = modules
    .filter((path) => codeLines(path).some((line) => AMBIENT_CLOCK.test(line)))
    .map((path) => relative(SOURCE_ROOT, path));
  expect(readers).toEqual(['authority/clock.ts']);
  // Proof: defaulting `runDash`'s clock to `wallClock()` failed this assertion naming `cli.ts`
  // (2026-10-11).
  const composers = modules
    .filter((path) => codeLines(path).some((line) => /\bwallClock\(\)(?!\s*:)/.test(line)))
    .map((path) => relative(SOURCE_ROOT, path));
  expect(composers).toEqual(['entrypoint.ts']);
});
