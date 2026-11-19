import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type Fingerprint, needsRestart, RESTART_PATHS } from '../restart-inputs';
const ABSENT = 'absent';
/** The termination-message prefix dev-env status reports as INSTALL REQUIRED. */
export const INSTALL_REQUIRED = 'install-required:';
/**
 * Hash one worktree path: a file by content, a directory by its sorted recursive listing and
 * contents. A missing path hashes to a fixed marker, so a path that appears or disappears is a
 * change; an unreadable one throws and takes the Pod down visibly.
 */
export async function hashWorktreePath(root: string, path: string): Promise<string> {
  const absolute = join(root, path);
  let status;
  try {
    status = await lstat(absolute);
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return ABSENT;
    throw cause;
  }
  const hash = createHash('sha256');
  if (status.isDirectory()) {
    const entries = (await readdir(absolute, { recursive: true, withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => join(entry.parentPath, entry.name))
      .sort();
    for (const entry of entries) {
      hash
        .update(entry.slice(root.length))
        .update('\0')
        .update(await readFile(entry));
    }
  } else {
    hash.update(await readFile(absolute));
  }
  return hash.digest('hex');
}

/** Fingerprint `RESTART_PATHS` inside the mounted worktree, exactly the set `sync.ts` watches. */
export async function fingerprintWorktree(
  root: string,
  paths: readonly string[] = RESTART_PATHS,
): Promise<Fingerprint> {
  const entries = await Promise.all(
    paths.map(async (path) => [path, await hashWorktreePath(root, path)] as const),
  );
  return Object.fromEntries(entries);
}

/** The supervisor's own sources: a change to them needs a new process, not a tier restart. */
export const SUPERVISOR_PATHS: readonly string[] = ['tools/tool-devsync/src'];


/** Historical directory-only diagnostic retained for existing pure callers. Actual supervision requires the producer-owned execution inspection; this hash is not loaded-closure evidence. */
export async function fingerprintSupervisor(root: string): Promise<string> {
  const directory = join(root, 'tools/tool-devsync/src');
  const files = (await readdir(directory, { recursive: true, withFileTypes: true }))
    .filter(
      (entry) => entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts'),
    )
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
  const hash = createHash('sha256');
  for (const file of files)
    hash
      .update(file.slice(root.length))
      .update('\0')
      .update(await readFile(file));
  return hash.digest('hex');
}

export type SupervisorAction = 'none' | 'restart-tiers' | 'exit';

/**
 * What a poll requires. A changed supervisor source outranks a restart path: restarting the tiers
 * under an outdated supervisor would keep applying the old restart rules.
 */
export function supervisorActionOf(
  baseline: { readonly restart: Fingerprint; readonly supervisor: string },
  current: { readonly restart: Fingerprint; readonly supervisor: string },
): SupervisorAction {
  // Proof: with this comparison removed, `exits when its own sources change` failed; the old
  // supervisor would keep running after sync.ts changed RESTART_PATHS.
  if (baseline.supervisor !== current.supervisor) return 'exit';
  return needsRestart(baseline.restart, current.restart) ? 'restart-tiers' : 'none';
}

/**
 * Preserve the historical synchronous install-decision fixture and its original refusal text.
 * The retained first-install Proof describes that earlier path; current supervision owns its asynchronous
 * install child and must qualify install-first behavior through its native owner tests.
 */
export function installDependencies(
  install: () => number,
  report: (message: string) => void,
): boolean {
  const exitCode = install();
  if (exitCode === 0) return true;
  report(`${INSTALL_REQUIRED} bun install --frozen-lockfile exited ${String(exitCode)}`);
  return false;
}

