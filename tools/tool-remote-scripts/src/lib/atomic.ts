import { open, unlink } from 'node:fs/promises';
import { rename } from 'node:fs/promises';

/**
 * Write-then-fsync-then-rename, because rename is atomic within a filesystem.
 *
 * A partially written Caddyfile is worse than no Caddyfile: a later Caddy
 * restart will load whatever bytes are on disk. fsync ensures durability
 * through host crashes and power loss.
 */
export async function writeAtomic(path: string, contents: string): Promise<void> {
  const tmp = `${path}.tmp`;
  let fd: Awaited<ReturnType<typeof open>> | null = null;

  try {
    fd = await open(tmp, 'w');
    await fd.write(contents);
    await fd.sync();
    await fd.close();
    fd = null;
    await rename(tmp, path);
  } catch (error) {
    if (fd !== null) {
      try {
        await fd.close();
      } catch {
        // Already closed or error closing.
      }
    }
    try {
      await unlink(tmp);
    } catch {
      // File does not exist or cannot be deleted.
    }
    throw error;
  }
}
