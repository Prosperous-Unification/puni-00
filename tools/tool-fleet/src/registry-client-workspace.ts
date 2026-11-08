import { randomUUID } from 'node:crypto';
import { type BigIntStats, constants } from 'node:fs';
import {
  type FileHandle,
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rmdir,
  unlink,
} from 'node:fs/promises';

import { completeRegistryOperation } from './registry-operation-completion';

interface Directory {
  descriptor: FileHandle;
  metadata: BigIntStats;
}
function at(directory: Directory, name?: string): string {
  return `/proc/self/fd/${String(directory.descriptor.fd)}${name === undefined ? '' : '/' + name}`;
}
function sameNode(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}
function requireEntry(metadata: BigIntStats, device: bigint): void {
  // Proof: workspace-hardlink removal admits the real hardlinked child in registry-client-workspace.test.ts.
  if (
    metadata.dev !== device ||
    ![0n, 59001n].includes(metadata.uid) ||
    ![0n, 59001n].includes(metadata.gid) ||
    (metadata.mode & 0o022n) !== 0n ||
    (!metadata.isDirectory() && (!metadata.isFile() || metadata.nlink !== 1n))
  )
    throw new Error('Untrusted client workspace entry');
}
async function withChild<T>(
  parent: Directory,
  name: string,
  operate: (directory: Directory) => Promise<T>,
): Promise<T> {
  const before = await lstat(at(parent, name), { bigint: true });
  requireEntry(before, parent.metadata.dev);
  const descriptor = await open(
    at(parent, name),
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  return completeRegistryOperation(
    async () => {
      const metadata = await descriptor.stat({ bigint: true });
      if (!sameNode(before, metadata)) throw new Error('Client workspace directory changed');
      requireEntry(metadata, parent.metadata.dev);
      return operate({ descriptor, metadata });
    },
    () => descriptor.close(),
  );
}
async function walk(directory: Directory, remove: boolean, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  requireEntry(await directory.descriptor.stat({ bigint: true }), directory.metadata.dev);
  for (const name of await readdir(at(directory))) {
    signal?.throwIfAborted();
    const before = await lstat(at(directory, name), { bigint: true });
    requireEntry(before, directory.metadata.dev);
    if (before.isDirectory()) {
      await withChild(directory, name, async (child) => {
        await walk(child, remove, signal);
        if (remove) {
          if (!sameNode(child.metadata, await lstat(at(directory, name), { bigint: true })))
            throw new Error('Client workspace cleanup directory changed');
          await rmdir(at(directory, name));
        }
      });
    } else if (remove) {
      const current = await lstat(at(directory, name), { bigint: true });
      requireEntry(current, directory.metadata.dev);
      if (!sameNode(before, current)) throw new Error('Client workspace cleanup file changed');
      await unlink(at(directory, name));
    }
  }
}

/**
 * Create one job beneath a canonical root-owned 0711 pool, inaccessible to client writes at its
 * parent. Hold the pool and job directory descriptors through cleanup; relative no-follow child
 * opens keep a renamed path prefix from redirecting privileged operations. The caller admits the
 * independent bounded filesystem and reaps all client descendants before close. The returned path
 * is for this root process only; pass the descriptor explicitly to each child and construct that
 * child's /proc/self/fd path from its fixed inherited slot. A rejected close
 * retains uncertain content for whole-filesystem teardown and closes every held descriptor.
 */
export async function createRegistryClientWorkspace(pool: string): Promise<{
  path: string;
  descriptor: FileHandle;
  grantClient: () => Promise<void>;
  close: () => Promise<void>;
}> {
  if ((await realpath(pool)) !== pool) throw new Error('Noncanonical root-owned client pool');
  const descriptor = await open(
    pool,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  let childDescriptor: FileHandle | undefined;
  try {
    const metadata = await descriptor.stat({ bigint: true });
    // Proof: pool-mode removal admits the actual chmod0777 pool in the root-namespace workspace fixture.
    if (
      !metadata.isDirectory() ||
      metadata.uid !== 0n ||
      metadata.gid !== 0n ||
      (metadata.mode & 0o777n) !== 0o711n
    )
      throw new Error('Expected root-owned client pool with mode0711');
    const parent = { descriptor, metadata };
    const name = 'pull-' + randomUUID();
    await mkdir(at(parent, name), { mode: 0o700 });
    childDescriptor = await open(
      at(parent, name),
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    const job = {
      descriptor: childDescriptor,
      metadata: await childDescriptor.stat({ bigint: true }),
    };
    if (
      job.metadata.dev !== metadata.dev ||
      job.metadata.uid !== 0n ||
      job.metadata.gid !== 0n ||
      job.metadata.nlink !== 2n ||
      (job.metadata.mode & 0o777n) !== 0o700n
    )
      throw new Error('Unacknowledged root-owned client workspace');
    const held = job;
    let stage: 'private' | 'client' | 'closed' = 'private';
    return {
      // Proof: setup-path-capability removal makes setup fail after the actual pool rename/symlink replacement.
      path: at(held),
      descriptor: held.descriptor,
      grantClient: async () => {
        if (stage !== 'private') throw new Error('Client workspace grant outside private stage');
        await held.descriptor.chown(0, 59001);
        await held.descriptor.chmod(0o750);
        stage = 'client';
      },
      close: async () => {
        if (stage === 'closed') throw new Error('Client workspace already closed');
        const previous = stage;
        stage = 'closed';
        await completeRegistryOperation(
          async () => {
            const current = await held.descriptor.stat({ bigint: true });
            if (
              !sameNode(current, held.metadata) ||
              current.uid !== 0n ||
              current.gid !== (previous === 'private' ? 0n : 59001n) ||
              (current.mode & 0o777n) !== (previous === 'private' ? 0o700n : 0o750n)
            )
              throw new Error('Client workspace root ownership changed');
            await walk(held, false);
            await walk(held, true);
            if (!sameNode(current, await lstat(at(parent, name), { bigint: true })))
              throw new Error('Client workspace root path changed');
            // Proof: cleanup-parent-capability removal follows the replaced pool path and fails the native namespace regression.
            await rmdir(at(parent, name));
          },
          () =>
            completeRegistryOperation(
              () => held.descriptor.close(),
              () => descriptor.close(),
            ),
        );
      },
    };
  } catch (cause) {
    return completeRegistryOperation(
      () => {
        throw cause;
      },
      () =>
        completeRegistryOperation(
          async () => {
            if (childDescriptor !== undefined) await childDescriptor.close();
          },
          () => descriptor.close(),
        ),
    );
  }
}

/** Recover one recorded attempt's abandoned job only after its outside owner proves the exact scope dead. The whole pool is dedicated to that one durable attempt; anchored no-follow traversal never follows renamed prefixes, symlinks, special files or foreign/hardlinked entries. */
export async function recoverRegistryClientWorkspace(
  descriptor: FileHandle,
  name: string,
  identity: { device: string; inode: string },
  signal: AbortSignal,
): Promise<void> {
  if (!/^pull-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(name))
    throw new Error('Unknown client recovery job name');
  {
    const metadata = await descriptor.stat({ bigint: true });
    if (
      !metadata.isDirectory() ||
      metadata.uid !== 0n ||
      metadata.gid !== 0n ||
      (metadata.mode & 0o777n) !== 0o711n ||
      metadata.dev.toString() !== identity.device ||
      metadata.ino.toString() !== identity.inode
    )
      throw new Error('Client recovery pool identity changed');
    const parent = { descriptor, metadata };
    await withChild(parent, name, async (child) => {
      const owner = child.metadata;
      if (
        owner.uid !== 0n ||
        !(
          (owner.gid === 0n && (owner.mode & 0o777n) === 0o700n) ||
          (owner.gid === 59001n && [0o700n, 0o750n].includes(owner.mode & 0o777n))
        )
      )
        throw new Error('Unknown client recovery job ownership');
      await walk(child, false, signal);
      await walk(child, true, signal);
      if (!sameNode(owner, await lstat(at(parent, name), { bigint: true })))
        throw new Error('Client recovery job path changed');
      await rmdir(at(parent, name));
    });
    await descriptor.sync();
  }
}
