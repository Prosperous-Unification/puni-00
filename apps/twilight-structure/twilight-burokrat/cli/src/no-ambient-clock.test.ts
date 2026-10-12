import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type ClockRead, findClockReads } from '@tools/test-clock-reads';
import { expect, test } from 'bun:test';

/**
 * Twilight Burokrat reads no clock (docs/twilight-structure/names.md). The only reads left in the
 * package are the prepare-activation check runners' measured instants. Each listed file may keep at
 * most its count of clock references, so a reference in any other file fails, and so does an
 * extra one inside a listed file. A count may only fall. An entry whose file no longer exists
 * fails too, so the list cannot outlive the relocation it records. The cap is a count: replacing
 * one read inside a listed file with another read is not caught.
 *
 * A clock reference is what `findClockReads` in `@tools/test-clock-reads` names; its JSDoc lists
 * what it catches and what it cannot.
 */
const dashOwnedClockReads: readonly { readonly paths: readonly string[]; readonly most: number }[] =
  [
    // Candidate check runs: each check's measured start and end. They stay with the
    // prepare-activation commands the packed suite runs (WBS a81d93a0, A32) until a CheckRun
    // receipt protocol lets Dash measure them.
    { paths: ['policy/prepare-activation-cli.ts'], most: 2 },
    { paths: ['policy/prepare-relocation-activation-cli.ts'], most: 2 },
  ];

const sourceRoot = import.meta.dir;

function readPackageSources(): string[] {
  return [...new Bun.Glob('**/*.ts').scanSync({ cwd: sourceRoot })]
    .filter((path) => !path.endsWith('.test.ts'))
    .sort();
}

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
  // restoring the file passed. Proof (2026-10-12): with the detector imported from
  // `@tools/test-clock-reads`, appending `Date.now()` to `evidence/manual.ts` failed here listing
  // `{ path: "evidence/manual.ts", text: "Date" }`; restoring the file passed.
  expect(excess).toEqual([]);
});
