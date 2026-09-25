import { lstat, readFile, readlink } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'bun:test';

const WORKSPACE = fileURLToPath(new URL('../../../', import.meta.url));
/** This file's own workspace-relative path, derived so a move cannot leave its excuse behind. */
const SELF = relative(WORKSPACE, fileURLToPath(import.meta.url));

/**
 * Twilight Burokrat's old root, retired when it moved into the Twilight Structure suite
 * (`openspec/changes/adopt-suite-directory-layout`), in both spellings a reference takes: a path,
 * where the lookahead keeps a longer directory name that merely starts with it from matching, and
 * quoted segments handed to `join`, which may break across lines.
 */
const RETIRED_ROOT_SPELLINGS = [
  /apps\/wiki(?![\w-])/g,
  // Proof: a new document holding only the two quoted segments handed to `join` failed
  // `no current file names …` with its `path:1`; without this spelling every case passed
  // (2026-09-25).
  /(['"`])apps\1\s*,\s*(['"`])wiki\2/g,
] as const;
/** Where files under the retired root would sit. */
const RETIRED_DIRECTORY = 'apps/wiki/';

/**
 * Trees that record what was done, in the words of the day it was done. Rewriting their paths
 * would falsify them, so the retired root may stay there in any number.
 */
const HISTORICAL_TREES = [
  'docs/superpowers/',
  'openspec/changes/archive/',
  'openspec/changes/adopt-suite-directory-layout/',
] as const;

/** Every change's verification record: observed commands and output, never current guidance. */
const VERIFICATION_RECORD = /^openspec\/changes\/[^/]+\/verify\.md$/;

/**
 * Current files that also keep dated history naming the retired root: a proof observed before
 * the move, a finished task, a superseded design. Each excuses exactly the occurrences it counts,
 * so a current reference added to one of them still fails.
 */
const DATED_MENTIONS: readonly (readonly [path: string, occurrences: number])[] = [
  ['apps/twilight-structure/twilight-burokrat/cli/src/policy/pilot-policy.test.ts', 2],
  ['docs/plans/2026-09-13-tool-wiki-precedents-and-extraction.md', 1],
  ['openspec/changes/adopt-di-composition/tasks.md', 1],
  ['openspec/changes/trusted-activation-relocation/design.md', 2],
  ['openspec/changes/twilight-burokrat-package/design.md', 4],
  ['openspec/changes/twilight-burokrat-package/proposal.md', 2],
  ['openspec/changes/wiki-release/proposal.md', 2],
  ['openspec/changes/wiki-release/tasks.md', 4],
  ['tools/tool-devsync/src/repo-namespacing-handoff.test.ts', 4],
  ['tools/tool-devsync/src/workspace-inventory.test.ts', 2],
  [SELF, 3],
];

interface RetiredRootScan {
  /** Paths below the retired root, whatever they contain. */
  readonly leftovers: readonly string[];
  /** `path:line` of every occurrence no excuse covers. */
  readonly current: readonly string[];
  /** Every excuse that no longer matches what it names. */
  readonly staleExcuses: readonly string[];
}

/**
 * Every path Git tracks or would track: the index plus untracked files `.gitignore` admits.
 *
 * @throws When Git cannot list the workspace, or a listed path cannot be read.
 */
function candidatePaths(): string[] {
  const listing = Bun.spawnSync(
    // Proof: a new untracked document naming the retired root failed `no current file names …`
    // with its `path:1`; without `--others` that case passed (2026-09-25).
    ['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: WORKSPACE, stdout: 'pipe', stderr: 'pipe' },
  );
  // Proof: with `ls-files` misspelled `ls-filez`, all three cases failed on `cannot list the
  // workspace: git: 'ls-filez' is not a git command`; with this refusal removed as well, only
  // the excuse case failed, on every excuse holding 0 (2026-09-25).
  if (listing.exitCode !== 0) {
    throw new Error(`cannot list the workspace: ${listing.stderr.toString()}`);
  }
  return [...new Set(listing.stdout.toString().split('\0').filter(Boolean))].sort();
}

/**
 * What Git stores for a path: a symbolic link's target, or a file's bytes read as text.
 *
 * @throws When the path is absent or unreadable.
 */
async function readText(path: string): Promise<string> {
  const full = join(WORKSPACE, path);
  return (await lstat(full)).isSymbolicLink() ? await readlink(full) : await readFile(full, 'utf8');
}

async function scanRetiredRoot(): Promise<RetiredRootScan> {
  const paths = candidatePaths();
  const counted = new Map<string, number>(DATED_MENTIONS.map(([path]) => [path, 0]));
  const perTree = new Map<string, number>(HISTORICAL_TREES.map((tree) => [tree, 0]));
  const current: string[] = [];
  for (const path of paths) {
    const text = await readText(path);
    const tree = HISTORICAL_TREES.find((prefix) => path.startsWith(prefix));
    const lines: number[] = [];
    for (const spelling of RETIRED_ROOT_SPELLINGS) {
      for (const match of text.matchAll(spelling)) {
        const dated = counted.get(path);
        if (tree !== undefined) perTree.set(tree, (perTree.get(tree) ?? 0) + 1);
        else if (VERIFICATION_RECORD.test(path)) continue;
        else if (dated !== undefined) counted.set(path, dated + 1);
        // Proof: the retired root written into the first line of the tracked docs/local-dev.md
        // failed `no current file names …` with `docs/local-dev.md:1`; with this branch spelled
        // `else continue;` every case passed (2026-09-25).
        else lines.push(text.slice(0, match.index).split('\n').length);
      }
    }
    current.push(
      ...lines.sort((left, right) => left - right).map((line) => `${path}:${String(line)}`),
    );
  }
  const staleExcuses = [
    // Proof: a `docs/no-such-tree/` entry added to the historical trees failed `every excuse …
    // still matches …` with `docs/no-such-tree/: excuses nothing`; with this filter answering
    // `false` every case passed (2026-09-25).
    ...HISTORICAL_TREES.filter((tree) => perTree.get(tree) === 0).map(
      (tree) => `${tree}: excuses nothing`,
    ),
    // Proof: one more mention added to the top of openspec/changes/wiki-release/tasks.md failed
    // `every excuse … still matches …` with `excuses 4, holds 5` while `no current file names …`
    // passed; with this filter answering `false` every case passed (2026-09-25).
    ...DATED_MENTIONS.filter(([path, occurrences]) => counted.get(path) !== occurrences).map(
      ([path, occurrences]) =>
        `${path}: excuses ${String(occurrences)}, holds ${String(counted.get(path))}`,
    ),
  ];
  return {
    // Proof: an untracked `stray.txt` planted under the retired root, naming nothing, failed
    // `no file remains under …` alone with its path; with this filter answering `false` as
    // well, all three cases passed (2026-09-25).
    leftovers: paths.filter((path) => path.startsWith(RETIRED_DIRECTORY)),
    current,
    staleExcuses,
  };
}

let scan: Promise<RetiredRootScan> | undefined;

/** The one scan the three cases share, started by whichever case runs first. */
async function scanned(): Promise<RetiredRootScan> {
  scan ??= scanRetiredRoot();
  return await scan;
}

test('no file remains under the retired apps/wiki root', async () => {
  expect((await scanned()).leftovers).toEqual([]);
});

test('no current file names the retired apps/wiki root', async () => {
  expect((await scanned()).current).toEqual([]);
});

test('every excuse for the retired root still matches exactly what it names', async () => {
  expect((await scanned()).staleExcuses).toEqual([]);
});
