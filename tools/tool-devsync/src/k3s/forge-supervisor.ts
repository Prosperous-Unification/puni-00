#!/usr/bin/env bun
import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type Fingerprint, needsRestart, RESTART_PATHS } from '../sync';

const POLL_MS = 2000;
const STOP_GRACE_MS = 20_000;
const ABSENT = 'absent';

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

/**
 * Keep `bin/dev.sh` running from `/src`, restarting it when a `RESTART_PATHS` entry changes.
 *
 * Source edits reach the watchers directly through the worktree mount and restart nothing, as on
 * h2puni. A restart path first runs `bun install --frozen-lockfile`, then starts the tiers again,
 * matching `sync.ts`. If the tiers exit on their own the supervisor exits with their status, so
 * the kubelet restarts the container and counts it.
 */
export async function superviseForge(root: string): Promise<never> {
  let baseline = await fingerprintWorktree(root);
  let tiers = startTiers(root);
  process.on('SIGTERM', () => {
    void stopTiers(tiers).then(() => process.exit(143));
  });
  for (;;) {
    const exit = await Promise.race([tiers.exited, Bun.sleep(POLL_MS).then(() => undefined)]);
    if (exit !== undefined) {
      console.error(
        `[forge] tiers exited with ${String(exit)}; the kubelet restarts the container`,
      );
      process.exit(exit === 0 ? 1 : exit);
    }
    const current = await fingerprintWorktree(root);
    if (!needsRestart(baseline, current)) continue;
    const changed = RESTART_PATHS.filter((path) => baseline[path] !== current[path]);
    console.error(`[forge] restart required, changed: ${changed.join(', ')}`);
    await stopTiers(tiers);
    const install = Bun.spawnSync(['bun', 'install', '--frozen-lockfile'], {
      cwd: root,
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    if (install.exitCode !== 0) {
      console.error(`[forge] bun install --frozen-lockfile exited ${String(install.exitCode)}`);
      process.exit(install.exitCode);
    }
    baseline = await fingerprintWorktree(root);
    tiers = startTiers(root);
    console.error('[forge] tiers restarted');
  }
}

if (import.meta.main) {
  await superviseForge(process.cwd());
}
