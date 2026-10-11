import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'bun:test';

const WORKSPACE = new URL('../../../../../', import.meta.url).pathname;

/** Every production TypeScript file under the WBS apps and libs. */
function productionSources(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) found.push(path);
    }
  };
  walk(join(WORKSPACE, 'apps', 'wbs'));
  walk(join(WORKSPACE, 'libs', 'wbs'));
  return found;
}

const WRITES = [
  /\.update\(\s*organizationAudit\s*\)/,
  /\.delete\(\s*organizationAudit\s*\)/,
  /\bUPDATE\s+[`"]?organization_audit\b/i,
  /\bDELETE\s+FROM\s+[`"]?organization_audit\b/i,
];

/**
 * `organization_audit` is append-only (`organization-audit`): the triggers of
 * `20261012090200_widen_organization_audit` refuse any update or delete, so a
 * writer that tried one would fail its own act. This reads every production
 * source and names any such writer.
 *
 * What it cannot see, stated: a statement assembled from variables. The
 * triggers are the enforcement; this is the search task 1.1 asks for.
 *
 * Proof: adding `tx.update(organizationAudit)` to `project.ts`'s
 * `recordRecovery` made this name `project.ts`; watched 2026-10-12.
 */
describe('the organization audit writers', () => {
  it('never update or delete a row', () => {
    const sources = productionSources();
    expect(sources.length).toBeGreaterThan(200);
    const offenders = sources.filter((file) => {
      const text = readFileSync(file, 'utf8');
      return WRITES.some((pattern) => pattern.test(text));
    });
    expect(offenders.map((file) => relative(WORKSPACE, file))).toEqual([]);
  });
});
