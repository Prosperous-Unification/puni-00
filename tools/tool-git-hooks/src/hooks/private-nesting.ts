import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The `.gitignore` line that keeps every nested private checkout out of the public index. */
export const privateIgnoreLine = '/private/';

/** One `git ls-files -s` entry: mode and path. */
export interface IndexEntry {
  readonly mode: string;
  readonly path: string;
}

/** Parses `git ls-files -s -z`, throwing on a record that is not `<mode> <object> <stage>\t<path>`. */
export function parseIndex(listing: string): IndexEntry[] {
  return listing
    .split('\0')
    .filter((record) => record !== '')
    .map((record) => {
      const match = /^(\d{6}) [0-9a-f]+ \d\t(.+)$/s.exec(record);
      if (match === null) throw new Error(`unreadable index record: ${JSON.stringify(record)}`);
      return { mode: match[1], path: match[2] };
    });
}

/**
 * Every reason the public repository at `root` could publish a nested private checkout, given the
 * file list the caller scanned (lefthook's staged files, or CI's whole tree).
 *
 * In order: an empty file list is refused as a vacuous scan; a `.gitignore` without
 * `/private/` is refused before anything else, because the guard guards itself; then every
 * indexed path under `private/`, every gitlink (mode 160000, what `git submodule add` writes) and
 * a `.gitmodules` file in the tree or the index. An empty return is the only pass.
 */
export function findPrivateLeaks(
  root: string,
  files: readonly string[],
  index: readonly IndexEntry[],
): string[] {
  if (files.length === 0) {
    // Proof: with this guard disabled, private-nesting.test.ts `refuses an empty file list as
    // vacuous` failed (6 pass / 1 fail) on 2026-10-06.
    return ['no files were given, so the private-nesting scan would be vacuous'];
  }
  const ignored = readFileSync(join(root, '.gitignore'), 'utf8')
    .split('\n')
    .map((line) => line.trim());
  if (!ignored.includes(privateIgnoreLine)) {
    // Proof: with this guard disabled, private-nesting.test.ts `refuses a .gitignore without
    // /private/` failed (6 pass / 1 fail) on 2026-10-06.
    return [`.gitignore lacks the ${privateIgnoreLine} line that keeps nested checkouts untracked`];
  }
  const leaks: string[] = [];
  for (const { mode, path } of index) {
    // Proof: with this test disabled, private-nesting.test.ts `refuses a forced add under
    // private/` failed (6 pass / 1 fail) on 2026-10-06.
    if (path === 'private' || path.startsWith('private/')) {
      leaks.push(`${path} is tracked under private/`);
    }
    // Proof: with this test disabled, private-nesting.test.ts `refuses a gitlink` failed
    // (6 pass / 1 fail) on 2026-10-06.
    if (mode === '160000') leaks.push(`${path} is a gitlink (submodule entry)`);
  }
  // Proof: with this test disabled, private-nesting.test.ts `refuses a .gitmodules file` failed
  // (6 pass / 1 fail) on 2026-10-06.
  if (existsSync(join(root, '.gitmodules')) || index.some(({ path }) => path === '.gitmodules')) {
    leaks.push('.gitmodules exists; private companions are nested clones, never submodules');
  }
  return leaks;
}

function main(): void {
  const root = process.cwd();
  const listed = Bun.spawnSync(['git', '-C', root, 'ls-files', '-s', '-z'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (listed.exitCode !== 0) {
    throw new Error(`git ls-files -s failed: ${listed.stderr.toString().trim()}`);
  }
  const leaks = findPrivateLeaks(root, process.argv.slice(2), parseIndex(listed.stdout.toString()));
  if (leaks.length > 0) {
    console.error('[tool-git-hooks] private content would reach the public repository:');
    for (const leak of leaks) console.error(`  ${leak}`);
    process.exit(1);
  }
}

if (import.meta.main) {
  try {
    main();
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : String(cause));
    process.exit(1);
  }
}
