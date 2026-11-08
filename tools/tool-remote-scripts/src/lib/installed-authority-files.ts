import { createHash } from 'node:crypto';
import { type BigIntStats, constants } from 'node:fs';
import { type FileHandle, lstat, open, realpath } from 'node:fs/promises';
import { isAbsolute, normalize } from 'node:path';

import { readWriterBytes } from './installed-writers';

export interface AuthorityFile {
  readonly path: string;
  readonly device: string;
  readonly inode: string;
  readonly mode: number;
  readonly sha256: string;
}
function identifyFile(metadata: BigIntStats): string {
  return [
    metadata.dev,
    metadata.ino,
    metadata.mode,
    metadata.size,
    metadata.mtimeNs,
    metadata.ctimeNs,
  ].join(':');
}
/** Retains every parent descriptor while action runs, and refuses named-parent or leaf replacement.
 * No symlink, same-inode alias, partial read or changed mode/bytes can satisfy the second observation.
 * This internal filesystem helper constructs no live owner or participant authority.
 */
export async function withAuthorityFiles<T>(
  paths: readonly string[],
  action: (files: readonly AuthorityFile[], recheck: () => Promise<void>) => Promise<T>,
): Promise<T> {
  const parents: { path: string; descriptor: FileHandle; identity: string }[] = [];
  const leaves: { path: string; anchored: string; identity: string; sha256: string }[] = [];
  const files: AuthorityFile[] = [];
  const inodes = new Set<string>();
  try {
    for (const path of paths) {
      // Proof: symlink and parent replacement fixture negatives reject both early and retained path drift.
      if (!isAbsolute(path) || normalize(path) !== path || (await realpath(path)) !== path)
        throw new Error('installed authority path is not canonical');
      let descriptor = await open(
        '/',
        constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
      );
      parents.push({
        path: '/',
        descriptor,
        identity: identifyFile(await descriptor.stat({ bigint: true })),
      });
      let parentPath = '';
      const segments = path.split('/').slice(1);
      for (const segment of segments.slice(0, -1)) {
        parentPath += '/' + segment;
        descriptor = await open(
          `/proc/self/fd/${String(descriptor.fd)}/${segment}`,
          constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
        );
        parents.push({
          path: parentPath,
          descriptor,
          identity: identifyFile(await descriptor.stat({ bigint: true })),
        });
      }
      const leaf = segments.at(-1);
      if (leaf === undefined) throw new Error('installed authority leaf missing');
      const anchored = `/proc/self/fd/${String(descriptor.fd)}/${leaf}`;
      const metadata = await lstat(anchored, { bigint: true });
      const inode = `${String(metadata.dev)}:${String(metadata.ino)}`;
      // Proof: hardlinked installed files negative rejects aliased authority slots.
      if (inodes.has(inode)) throw new Error('installed authority inode alias');
      inodes.add(inode);
      const bytes = await readWriterBytes(anchored);
      const identity = identifyFile(metadata);
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      if (identifyFile(await lstat(anchored, { bigint: true })) !== identity)
        throw new Error('installed authority identity changed');
      leaves.push({ path, anchored, identity, sha256 });
      files.push({
        path,
        device: String(metadata.dev),
        inode: String(metadata.ino),
        mode: Number(metadata.mode & 0o7777n),
        sha256,
      });
    }
    async function recheck(): Promise<void> {
      for (const parent of parents) {
        // Parent size/mtime reflect unrelated child churn and are not directory identity.
        const named = await lstat(parent.path, { bigint: true });
        const held = await parent.descriptor.stat({ bigint: true });
        // Proof: parent-identity omission admitted a same-inode leaf beneath the replaced parent.
        if (
          !named.isDirectory() ||
          named.dev !== held.dev ||
          named.ino !== held.ino ||
          named.mode !== held.mode
        )
          throw new Error('installed authority parent changed');
      }
      for (const leaf of leaves) {
        // Proof: watched byte/inode drift negatives reject changes through retained parents and live names.
        if (
          identifyFile(await lstat(leaf.path, { bigint: true })) !== leaf.identity ||
          identifyFile(await lstat(leaf.anchored, { bigint: true })) !== leaf.identity ||
          createHash('sha256')
            .update(await readWriterBytes(leaf.anchored))
            .digest('hex') !== leaf.sha256
        )
          throw new Error('installed authority file changed');
      }
    }
    await recheck();
    const observed = await action(files, recheck);
    await recheck();
    return observed;
  } finally {
    for (const parent of parents.reverse()) await parent.descriptor.close();
  }
}
