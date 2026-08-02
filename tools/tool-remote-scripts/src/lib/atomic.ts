import { rename } from 'node:fs/promises';

/**
 * Write-then-rename, because rename is atomic within a filesystem.
 *
 * A partially written Caddyfile is worse than no Caddyfile: a later Caddy
 * restart will load whatever bytes are on disk.
 */
export async function writeAtomic(path: string, contents: string): Promise<void> {
  const tmp = `${path}.tmp`;
  await Bun.write(tmp, contents);
  await rename(tmp, path);
}
