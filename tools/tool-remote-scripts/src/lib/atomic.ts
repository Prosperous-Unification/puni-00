import { open, unlink } from 'node:fs/promises';
import { rename } from 'node:fs/promises';

/**
 * Write-then-fsync-then-rename, because rename is atomic within a filesystem.
 *
 * A partially written Caddyfile is worse than no Caddyfile: a later Caddy
 * restart will load whatever bytes are on disk. fsync ensures durability
 * through host crashes and power loss.
 *
 * `mode`, when given, is passed to the temp file's own `open()` — i.e. the
 * permission bits exist from the moment the file is created, not applied
 * afterward. This matters for a secret-bearing destination (the derived
 * `<app>.secrets.env` files — see `lib/docker.ts`'s `deriveTierSecrets` and
 * `swap.ts`'s `start-green` step): a caller that instead created the temp
 * file at the process umask's default (typically 0644, world-readable) and
 * `chmod`ed it to 0600 only AFTER `rename` left the file briefly
 * world-readable on every swap, and permanently world-readable if the
 * process died between the two calls — `rename` and a separate `chmod` are
 * not atomic with each other. Passing `mode` here instead of chmod-ing after
 * the fact closes that window entirely: there is no state the file can be
 * observed in between "does not exist" and "exists with the right mode".
 * Omitted, this behaves exactly as before (temp file created at the process
 * umask's default) — every non-secret caller (site.caddy, the rendered
 * per-colour compose files) is unaffected.
 */
export async function writeAtomic(path: string, contents: string, mode?: number): Promise<void> {
  const tmp = `${path}.tmp`;
  let fd: Awaited<ReturnType<typeof open>> | null = null;

  try {
    fd = mode === undefined ? await open(tmp, 'w') : await open(tmp, 'w', mode);
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
