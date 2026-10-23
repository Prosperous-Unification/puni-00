import { lstat } from 'node:fs/promises';
import { join } from 'node:path';

import { assertInheritedLock, withLock } from './lock';

/** Canonical host-wide state; dev and prod share the same Caddy process. */
export function edgeStateDirectory(): string {
  return process.env['WBS_EDGE_STATE'] ?? '/home/puni1/wbs/state';
}

/**
 * Refuses every retained owner publication, including incomplete or unreadable
 * publications. Absence means legacy deployment, never activation permission.
 * Marker contents cannot reopen admission. Only ENOENT is ordinary absence;
 * dangling links and directories close admission as well.
 */
export async function assertNoEdgeOwner(stateDirectory = edgeStateDirectory()): Promise<void> {
  for (const name of ['edge-owner.json', 'edge-owner.pending']) {
    const path = join(stateDirectory, name);
    try {
      await lstat(path);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue;
      throw error;
    }
    // Proof: omitted this refusal; both retained-marker swap and devsync CLI negatives reached later preflight.
    throw new Error(`shared edge owner admission closed: ${path}; retained marker; no activation`);
  }
}

/**
 * Lock order is edge.lock, optional poll.lock, optional devsync.lock, then the
 * selected deploy.lock. The publisher must use the
 * same lock and retain its marker before releasing it; this is admission only.
 */
export async function withEdgeAdmission<T>(action: () => Promise<T>): Promise<T> {
  const stateDirectory = edgeStateDirectory();
  const lockPath = join(stateDirectory, 'edge.lock');
  const inherited = process.env['WBS_EDGE_LOCK_FD'];
  if (inherited !== undefined) {
    // Proof: removing token syntax validation failed the bogus inherited-descriptor CLI negative.
    if (!/^[0-9]+$/.test(inherited)) throw new Error('invalid inherited shared edge descriptor');
    // Proof: skipping descriptor identity and flock failed forged numeric FD and independent-open CLI negatives (3 failures).
    assertInheritedLock(lockPath, Number(inherited));
    await assertNoEdgeOwner(stateDirectory);
    return action();
  }
  // Proof: removed this outer lock; the concurrent swap CLI negative reached argument validation.
  return withLock(lockPath, async (descriptor) => {
    await assertNoEdgeOwner(stateDirectory);
    process.env['WBS_EDGE_LOCK_FD'] = String(descriptor);
    try {
      return await action();
    } finally {
      delete process.env['WBS_EDGE_LOCK_FD'];
    }
  });
}
