import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

/**
 * `envLayout` is only a seam if it is the ONLY place `WBS_ENV` is read. A
 * second reader anywhere — a default here, a fallback there — is how one
 * module ends up believing it is deploying dev while another builds prod's
 * paths, and the resulting swap writes dev's containers into prod's state.
 *
 * This scans source rather than asserting on behaviour because that is the
 * property: not "the code does the right thing for dev", but "there is no
 * second opinion about which environment this is".
 *
 * Proof: adding `const e = process.env['WBS_ENV'] ?? 'prod';` to swap.ts makes
 * this fail with a count of 2 naming both files. Observed 2026-08-04.
 */
const SRC = join(import.meta.dir, '..');
const NEEDLE = "process.env['WBS_ENV']";

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...sourceFiles(path));
      continue;
    }
    if (!entry.name.endsWith('.ts')) continue;
    // Test files legitimately mention the variable while describing the rule.
    if (entry.name.endsWith('.test.ts')) continue;
    out.push(path);
  }
  return out;
}

describe('WBS_ENV is read in exactly one place', () => {
  const files = sourceFiles(SRC);

  it('finds source files to scan at all', () => {
    // Without this, a broken path would make the assertion below vacuously
    // true: zero files scanned, zero readers found, green.
    expect(files.length).toBeGreaterThan(5);
  });

  it('is read only by lib/env.ts', () => {
    const readers = files.filter((f) => readFileSync(f, 'utf8').includes(NEEDLE));
    expect(readers.map((f) => f.slice(SRC.length + 1))).toEqual(['lib/env.ts']);
  });
});
