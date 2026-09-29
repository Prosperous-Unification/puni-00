import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

const ROOT = join(import.meta.dir, '../../../../..');
const DRAIN = 'libs/wbs/adapters/store-sqlite/src/optimization-drain.ts';

/**
 * What a project deletion looks like in source, outside the drain module:
 * any mention of the deletion writer (an import, an alias of one, a callback
 * reference, a namespace call), a drizzle delete of the `project` table under
 * any namespace, and SQL deleting from it.
 */
const DELETES_A_PROJECT: readonly RegExp[] = [
  /\bbeginOptimizationDrain\b/,
  /\.delete\(\s*(?:[\w$]+\.)*project\s*\)/,
  /\bDELETE\s+FROM\s+[`"']?project[`"']?(?![\w$])/i,
];

/**
 * `text` without its comments, so a sentence about a deletion is not one.
 * Rough on purpose: a `//` inside a string drops the rest of that line.
 */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/** Every production source that matches {@link DELETES_A_PROJECT}, drain module aside. */
function deletionCallers(): string[] {
  const found: string[] = [];
  const sources = new Bun.Glob('{apps,libs,tools}/**/src/**/*.{ts,tsx}');
  for (const path of sources.scanSync({ cwd: ROOT })) {
    if (/\.test\.tsx?$|\/testing\/|node_modules/.test(path)) continue;
    if (path === DRAIN) continue;
    const code = withoutComments(readFileSync(join(ROOT, path), 'utf8'));
    if (DELETES_A_PROJECT.some((pattern) => pattern.test(code))) found.push(path);
  }
  return found;
}

/**
 * The standing invariant task 8.0 records (`share-people-across-projects`):
 * **no production path deletes a project.** `beginOptimizationDrain` is the
 * only deletion writer and nothing outside its own module and tests names it.
 *
 * Under shared people a deleted project's bookings leave every project below
 * it, and a deletion publishes nothing, so `ElsewhereFanOut` never hears of it
 * and their plan reads and load memos go stale. The first production
 * deletion path must tell the organization's other projects
 * (`elsewhere_changed`), then take its file out of this guard.
 *
 * What the scan cannot see: a name assembled at run time (a computed property
 * or a string passed to a dispatcher), SQL built from fragments, a delete
 * through a table variable of another name, a cascade from deleting a
 * project's parent row, anything outside `src` of `apps`, `libs` and `tools`
 * (migrations, scripts, tests), and code after a `//` inside a string on the
 * same line, which the comment stripping drops. Those need review, not a
 * regex.
 *
 * Proof: probe files under `apps/wbs/be-01/src` each made this test name them:
 * `import { beginOptimizationDrain as drain }`, `tx.delete(schema.project)`
 * and `db.run('DELETE FROM project WHERE id = ?')`; watched 2026-09-29.
 */
describe('project deletion', () => {
  it('has no production caller, so none owes the organization a notice yet', () => {
    expect(deletionCallers()).toEqual([]);
  });

  it('scans the sources the invariant is about', () => {
    // A glob that matched nothing would pass the case above vacuously.
    const scanned = [
      ...new Bun.Glob('{apps,libs,tools}/**/src/**/*.{ts,tsx}').scanSync({ cwd: ROOT }),
    ];
    expect(scanned).toContain(DRAIN);
    expect(scanned.length).toBeGreaterThan(500);
  });
});
