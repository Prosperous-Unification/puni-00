import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'bun:test';

import { EXCLUDED_PATHS, PROTECTED_LINES } from './allow-list';
import { renameText } from './rename-text';
import { git, trackedPaths } from './tree';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));

/**
 * Lines of the tree already in the new sense, which `apply` must leave byte-identical. Each is
 * read back from its file, so a witness outlived by its code fails here too.
 */
const NEW_SENSE_WITNESSES: readonly { readonly path: string; readonly line: string }[] = [
  {
    path: 'CONTEXT-MAP.md',
    line: '  development and client projects. Client content and authority remain isolated.',
  },
  {
    path: 'libs/wbs/application/core/src/module/work-item/work-item.resource.test.ts',
    line: "  it('[PROJECT-ASSIGNMENT-READS-003] names only the people assigned in the requested project', async () => {",
  },
];

describe('the allow-list', () => {
  // Proof: a `\bprojectType\b` pattern, whose only lines sit in excluded project.json files,
  // failed this case naming that pattern before it was dropped (2026-10-25).
  it('holds every line pattern to at least one line outside the excluded paths', () => {
    const lines = trackedPaths(REPO).flatMap((path) => {
      const bytes = readFileSync(join(REPO, path));
      return bytes.subarray(0, 8192).includes(0) ? [] : bytes.toString('utf8').split('\n');
    });
    const outlived = PROTECTED_LINES.filter(
      ({ pattern }) => !lines.some((line) => pattern.test(line)),
    ).map(({ pattern }) => pattern.source);
    expect(outlived).toEqual([]);
  }, 30_000);

  it('excludes no glob that matches nothing tracked', () => {
    const tracked = git(REPO, ['ls-files', '-z']).split('\0').filter(Boolean);
    const unused = EXCLUDED_PATHS.filter(({ glob }) => {
      const matcher = new Bun.Glob(glob);
      return !tracked.some((path) => matcher.match(path));
    }).map(({ glob }) => glob);
    expect(unused).toEqual([]);
  });

  // Proof: removing the `client projects` pattern made apply respell the CONTEXT-MAP.md line as
  // "client work packages"; removing the `[PROJECT-ASSIGNMENT-READS-nnn]` pattern made it respell
  // the core test's "requested project" as "requested work package"; each failed here
  // (2026-10-25).
  it('leaves every new-sense witness line as it stands in the tree', () => {
    for (const { path, line } of NEW_SENSE_WITNESSES) {
      expect(readFileSync(join(REPO, path), 'utf8').split('\n')).toContain(line);
      expect(renameText(line, path)).toBe(line);
    }
  });
});
