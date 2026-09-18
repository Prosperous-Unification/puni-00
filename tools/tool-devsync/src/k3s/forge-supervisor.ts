#!/usr/bin/env bun
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type Fingerprint, needsRestart, RESTART_PATHS } from '../sync';

const POLL_MS = 2000;
const STOP_GRACE_MS = 20_000;
const ABSENT = 'absent';
const TERMINATION_LOG = '/dev/termination-log';

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

function startTiers(root: string): Bun.Subprocess {
  // `bin/dev.sh` is the same entrypoint the h2puni dev container runs; its own group lets a
  // restart stop Nx and every watcher it started.
  return Bun.spawn(['bin/dev.sh'], {
    cwd: root,
    stdio: ['ignore', 'inherit', 'inherit'],
    detached: true,
  });
}

async function stopTiers(tiers: Bun.Subprocess): Promise<void> {
  process.kill(-tiers.pid, 'SIGTERM');
  const stopped = await Promise.race([
    tiers.exited.then(() => true),
    Bun.sleep(STOP_GRACE_MS).then(() => false),
  ]);
  if (!stopped) {
    process.kill(-tiers.pid, 'SIGKILL');
    await tiers.exited;
  }
}

/** The supervisor's own sources: a change to them needs a new process, not a tier restart. */
export const SUPERVISOR_PATHS: readonly string[] = ['tools/tool-devsync/src'];

/** The termination-message prefix `dev-env status` reports as INSTALL REQUIRED. */
export const INSTALL_REQUIRED = 'install-required:';

/** Hash only the non-test TypeScript under `tools/tool-devsync/src`, the supervisor's graph. */
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
 * Run `bun install --frozen-lockfile`; on failure report INSTALL REQUIRED and return false.
 *
 * Every tier start goes through here, the first included: a container the kubelet restarted
 * after a failed install must not start the tiers on the stale `node_modules`.
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

function runInstall(root: string): number {
  return Bun.spawnSync(['bun', 'install', '--frozen-lockfile'], {
    cwd: root,
    stdio: ['ignore', 'inherit', 'inherit'],
  }).exitCode;
}

/** The kubelet shows this file's content as the container's termination message. */
function reportTermination(message: string): void {
  console.error(`[forge] ${message}`);
  writeFileSync(TERMINATION_LOG, message);
}

/**
 * Keep `bin/dev.sh` running from `/src`.
 *
 * Source edits reach the watchers through the worktree mount and restart nothing, as on h2puni.
 * A `RESTART_PATHS` change stops the tiers, installs and starts them again, matching `sync.ts`.
 * A failed install, a change to the supervisor's own sources, or tiers that exit on their own
 * end the process, so the kubelet restarts the container visibly; the next start installs first.
 */
export async function superviseForge(root: string): Promise<never> {
  // Proof: without this install before the first start, a live container restarted after a
  // failed install served on stale node_modules; with it the Pod stayed not ready and `status`
  // printed INSTALL REQUIRED (k3s-platform verify.md, F9 review).
  if (!installDependencies(() => runInstall(root), reportTermination)) process.exit(65);
  let baseline = {
    restart: await fingerprintWorktree(root),
    supervisor: await fingerprintSupervisor(root),
  };
  let tiers = startTiers(root);
  process.on('SIGTERM', () => {
    void stopTiers(tiers).then(() => process.exit(143));
  });
  for (;;) {
    const exit = await Promise.race([tiers.exited, Bun.sleep(POLL_MS).then(() => undefined)]);
    if (exit !== undefined) {
      reportTermination(`tiers exited with ${String(exit)}`);
      process.exit(exit === 0 ? 1 : exit);
    }
    const current = {
      restart: await fingerprintWorktree(root),
      supervisor: await fingerprintSupervisor(root),
    };
    const action = supervisorActionOf(baseline, current);
    if (action === 'none') continue;
    await stopTiers(tiers);
    if (action === 'exit') {
      reportTermination('supervisor sources changed; restarting the container to load them');
      process.exit(0);
    }
    const changed = RESTART_PATHS.filter(
      (path) => baseline.restart[path] !== current.restart[path],
    );
    console.error(`[forge] restart required, changed: ${changed.join(', ')}`);
    if (!installDependencies(() => runInstall(root), reportTermination)) process.exit(65);
    baseline = current;
    tiers = startTiers(root);
    console.error('[forge] tiers restarted');
  }
}

if (import.meta.main) {
  await superviseForge(process.cwd());
}
