import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type ClockRead, findClockReads } from '@tools/test-clock-reads';
import { expect, test } from 'bun:test';

/**
 * Twilight Burokrat reads no clock (docs/twilight-structure/names.md). Twilight Dash measures the
 * activation checks and records their instants (`twilight-dash run-activation-checks`); both
 * preparers judge those recorded instants (`policy/check-runs.ts`). No package source may hold a
 * clock reference, so there is no list of exceptions to outlive.
 *
 * A clock reference is what `findClockReads` in `@tools/test-clock-reads` names; its JSDoc lists
 * what it catches and what it cannot.
 */
const sourceRoot = import.meta.dir;

function readPackageSources(): string[] {
  return [...new Bun.Glob('**/*.ts').scanSync({ cwd: sourceRoot })]
    .filter((path) => !path.endsWith('.test.ts'))
    .sort();
}

test('the Burokrat package reads no clock', () => {
  const sources = readPackageSources();
  // Proof (2026-10-11): globbing `**/*.tsx` found no sources and this failed with `Expected to
  // contain: "cli.ts"` instead of passing a scan of nothing.
  expect(sources).toContain('cli.ts');
  const reads: ClockRead[] = sources.flatMap((path) =>
    findClockReads(path, readFileSync(join(sourceRoot, path), 'utf8')),
  );
  // Proof (2026-10-11): appending `const { now: sampleNow } = Date` to `evidence/manual.ts`,
  // `globalThis.Date.now()` to `contracts/records.ts`, `process['uptime']()` to `rules/check.ts`
  // or an eleventh `Date.now()` to `review/invoker.ts` each failed here with the reads listed;
  // restoring the file passed. Proof (2026-10-12): with the detector imported from
  // `@tools/test-clock-reads`, appending `Date.now()` to `evidence/manual.ts` failed here listing
  // `{ path: "evidence/manual.ts", text: "Date" }`; restoring the file passed. Proof (2026-10-12,
  // allow-list removed): appending `new Date().toISOString()` to `policy/prepare-activation-cli.ts`
  // failed here listing `"path": "policy/prepare-activation-cli.ts"`; restoring the file passed.
  expect(reads).toEqual([]);
});
