import { randomUUID } from 'node:crypto';
import { link, open, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';

async function syncDirectory(path: string): Promise<void> {
  const directory = await open(path, 'r');
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

/**
 * Persist one deploy attempt before migration. A hard link publishes the fully
 * synced file without replacing an existing capture; syncing the containing
 * directory makes the published name durable across a host crash.
 * Proof: replacing the exclusive link with overwrite made
 * `persists a private capture and refuses replacement` accept a second attempt.
 */
export async function writeNewMigrationCapture(
  path: string,
  contents: string,
  syncPublishedDirectory: (path: string) => Promise<void> = syncDirectory,
): Promise<void> {
  const stagingPath = `${path}.${randomUUID()}.tmp`;
  const file = await open(stagingPath, 'wx', 0o600);
  try {
    try {
      await file.writeFile(contents);
      await file.sync();
    } finally {
      await file.close();
    }
    await link(stagingPath, path);
    // Proof: removing this call made `syncs the published directory` observe no durability fence.
    await syncPublishedDirectory(dirname(path));
  } finally {
    await unlink(stagingPath);
  }
}
