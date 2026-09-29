import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

const ROOT = join(import.meta.dir, '../../../../..');

/**
 * Every production source that deletes a project or starts its deletion,
 * outside `optimization-drain.ts`, the one writer that may.
 */
function deletionCallers(): string[] {
  const found: string[] = [];
  const sources = new Bun.Glob('{apps,libs,tools}/**/src/**/*.{ts,tsx}');
  for (const path of sources.scanSync({ cwd: ROOT })) {
    if (/\.test\.tsx?$|\/testing\/|node_modules/.test(path)) continue;
    if (path.endsWith('libs/wbs/adapters/store-sqlite/src/optimization-drain.ts')) continue;
    const text = readFileSync(join(ROOT, path), 'utf8');
    if (/\bbeginOptimizationDrain\(|\.delete\(project\)/.test(text)) found.push(path);
  }
  return found;
}

/**
 * The standing invariant task 8.0 records (`share-people-across-projects`):
 * **no production path deletes a project.** `beginOptimizationDrain` is the
 * only deletion writer and nothing outside its own module and tests calls it.
 *
 * Under shared people a deleted project's bookings leave every project below
 * it, and a deletion publishes nothing, so `ElsewhereFanOut` never hears of it
 * and their plan reads and load memos go stale. The first production
 * deletion path must tell the organization's other projects
 * (`elsewhere_changed`), then take its file out of this guard.
 *
 * Proof: a file under `apps/wbs/be-01/src` calling
 * `beginOptimizationDrain(db, id, stamp)` made this test name it; watched
 * 2026-09-29.
 */
describe('project deletion', () => {
  it('has no production caller, so none owes the organization a notice yet', () => {
    expect(deletionCallers()).toEqual([]);
  });
});
