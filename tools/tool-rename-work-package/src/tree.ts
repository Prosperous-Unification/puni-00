import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import { exclusionOf } from './allow-list';
import { isProtectedSpan, readProtectedSpans } from './protection';
import { renamePath, renameText } from './rename-text';

/** The residual pattern `check` reports (design E12), matched per line and per path. */
export const RESIDUAL = /\bprojects?\b|projectId|ProjectId|project_id/;

/** One residual: a line (1-based) or, with `line` 0, the path itself. */
export interface Residual {
  readonly path: string;
  readonly line: number;
  readonly text: string;
}

/**
 * Runs git in `root` and returns its stdout.
 *
 * @throws when git exits non-zero, with its stderr: the tree is trusted state.
 */
export function git(root: string, args: readonly string[]): string {
  const run = Bun.spawnSync(['git', ...args], { cwd: root, stdout: 'pipe', stderr: 'pipe' });
  if (run.exitCode !== 0) {
    throw new Error(
      `git ${args.join(' ')} exited ${String(run.exitCode)}: ${run.stderr.toString()}`,
    );
  }
  return run.stdout.toString();
}

/** Every tracked path under `root`, repo-relative, that no {@link exclusionOf} covers. */
export function trackedPaths(root: string): string[] {
  return git(root, ['ls-files', '-z'])
    .split('\0')
    .filter((path) => path !== '' && exclusionOf(path) === undefined);
}

/** True for a regular file: symlinks and gitlinks have no text of their own to rename. */
function isRegularFile(root: string, path: string): boolean {
  return lstatSync(join(root, path)).isFile();
}

/** True for content with a NUL byte in its first 8 KiB, the way git decides a file is binary. */
function isBinary(bytes: Buffer): boolean {
  return bytes.subarray(0, 8192).includes(0);
}

/** Every residual in the tree at `root` outside the allow-list, path residuals first per file. */
export function residualsIn(root: string): Residual[] {
  const found: Residual[] = [];
  for (const path of trackedPaths(root)) {
    if (RESIDUAL.test(path)) found.push({ path, line: 0, text: path });
    if (!isRegularFile(root, path)) continue;
    const bytes = readFileSync(join(root, path));
    if (isBinary(bytes)) continue;
    const source = bytes.toString('utf8');
    const spans = readProtectedSpans(source, path);
    let offset = 0;
    source.split('\n').forEach((text, index) => {
      const unprotected = [...text.matchAll(new RegExp(RESIDUAL.source, 'g'))].some(
        (match) =>
          // Proof: span-check-use ignoring protected spans during residual checking failed "apply and check share token protection without hiding a mixed-line residual" (cli.test.ts); restored GREEN.
          !isProtectedSpan(spans, offset + match.index, offset + match.index + match[0].length),
      );
      if (unprotected) found.push({ path, line: index + 1, text });
      offset += text.length + 1;
    });
  }
  return found;
}

/** True when `path` is `scope` or lies beneath it. */
function isWithin(path: string, scope: string): boolean {
  const prefix = scope.replace(/\/+$/, '');
  return prefix === '' || prefix === '.' || path === prefix || path.startsWith(`${prefix}/`);
}

/** What one `apply` did, for its summary line. */
export interface ApplySummary {
  readonly moved: number;
  readonly rewritten: number;
}

/**
 * Renames the tracked, non-excluded files under `scopes` in the tree at `root`: first every
 * path through `git mv` ({@link renamePath}), then every text file's content
 * ({@link renameText}). Running it again changes nothing.
 *
 * Required qualified witnesses are validated before path moves or content writes; this does
 * not promise rollback of a later filesystem/git failure.
 * @throws when `scopes` is empty, a required witness is stale, a move's target exists, or git fails.
 */
export function applyRename(root: string, scopes: readonly string[]): ApplySummary {
  if (scopes.length === 0) throw new Error('apply needs at least one path to rename under');
  const inScope = (path: string): boolean => scopes.some((scope) => isWithin(path, scope));
  const tracked = new Set(git(root, ['ls-files', '-z']).split('\0').filter(Boolean));
  // Required semantic witnesses are observed before this owner starts moving paths.
  for (const path of trackedPaths(root).filter(inScope)) {
    if (!isRegularFile(root, path)) continue;
    const bytes = readFileSync(join(root, path));
    // Proof: span-apply-preflight skipping the before-move witness preflight failed "refuses a stale required span witness before changing paths or file bytes" (cli.test.ts); restored GREEN.
    if (!isBinary(bytes)) renameText(bytes.toString('utf8'), renamePath(path));
  }
  let moved = 0;
  const emptied = new Set<string>();
  for (const path of trackedPaths(root).filter(inScope)) {
    const target = renamePath(path);
    if (target === path) continue;
    if (tracked.has(target)) throw new Error(`cannot move ${path}: ${target} is already tracked`);
    mkdirSync(dirname(join(root, target)), { recursive: true });
    git(root, ['mv', '--', path, target]);
    emptied.add(dirname(path));
    moved += 1;
  }
  for (const directory of [...emptied].sort((a, b) => b.length - a.length)) {
    removeEmptyAncestors(root, directory);
  }
  let rewritten = 0;
  for (const path of trackedPaths(root).filter(inScope)) {
    if (!isRegularFile(root, path)) continue;
    const bytes = readFileSync(join(root, path));
    if (isBinary(bytes)) continue;
    const before = bytes.toString('utf8');
    const after = renameText(before, path);
    if (after === before) continue;
    writeFileSync(join(root, path), after, 'utf8');
    rewritten += 1;
  }
  return { moved, rewritten };
}

/** Removes `directory` and its parents while they are empty, stopping at `root`. */
function removeEmptyAncestors(root: string, directory: string): void {
  let current = directory;
  while (current !== '.' && current !== '') {
    const absolute = join(root, current);
    // A deeper directory of the same move already took this one with it.
    if (!existsSync(absolute)) return;
    if (readdirSync(absolute).length > 0) return;
    rmdirSync(absolute);
    current = dirname(current);
  }
}
