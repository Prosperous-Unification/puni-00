import { closeSync, openSync, unlinkSync } from 'node:fs';

/**
 * Exclusive deploy lock via O_EXCL create, which is atomic on POSIX filesystems.
 *
 * Two concurrent deploys interleaving colour swaps is unrecoverable, so this
 * refuses rather than waiting.
 */
export async function withLock<T>(lockPath: string, fn: () => Promise<T>): Promise<T> {
  let fd: number;
  try {
    fd = openSync(lockPath, 'wx');
  } catch {
    throw new Error(`deploy lock held: ${lockPath} — another deploy is running`);
  }
  try {
    return await fn();
  } finally {
    closeSync(fd);
    try {
      unlinkSync(lockPath);
    } catch {
      // Already gone; nothing to release.
    }
  }
}
