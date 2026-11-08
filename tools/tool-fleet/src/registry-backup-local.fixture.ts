import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readdir, realpath, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import type { RegistryBackupLockVersion } from './registry-backup-locks';
import type { RegistryBackupVersionStore } from './registry-backup-provider';
import type { RegistryBackupSnapshotVersion } from './registry-backup-retention';
import { assertRegistryMaintenanceLock } from './registry-maintenance-process';

/**
 * Owned disposable local-repository adapter only; production uses the complete S3-backed
 * version store. Real files are immutable ciphertext-ID objects; inode/ctime/size identifies a local
 * version. Pinned restic publishes owner-only files and marks final ciphertext readonly (0400);
 * owner-only0600 remains valid if the writer was killed after rename before readonly chmod.
 * The private fixture namespace admits no independent repository writers and retains
 * the SAME authority lock. Revalidation immediately before unlink is valid under that exclusion;
 * this is not a claim of an atomic filesystem compare-and-unlink against arbitrary root writers.
 */
export async function createRegistryLocalLockVersions(input: {
  repository: string;
  journalPath: string;
  descriptor: number;
  authorityUid: number;
  repositoryUid: number;
}): Promise<RegistryBackupVersionStore> {
  await assertRegistryMaintenanceLock(input.journalPath, input.descriptor, input.authorityUid);
  const locks = join(input.repository, 'locks');
  const directory = async (path: string) => {
    const status = await lstat(path, { bigint: true });
    if (
      (await realpath(path)) !== path ||
      !status.isDirectory() ||
      status.uid !== BigInt(input.repositoryUid) ||
      (status.mode & 0o777n) !== 0o700n
    )
      throw new Error('Untrusted owned local lock repository');
    return `${String(status.dev)}:${String(status.ino)}`;
  };
  const repositoryIdentity = await directory(input.repository);
  const locksIdentity = await directory(locks);
  const verify = async () => {
    await assertRegistryMaintenanceLock(input.journalPath, input.descriptor, input.authorityUid);
    if (
      (await directory(input.repository)) !== repositoryIdentity ||
      (await directory(locks)) !== locksIdentity
    )
      throw new Error('Owned local backup repository changed');
  };
  const inspect = async (id: string): Promise<RegistryBackupLockVersion> => {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Unknown local backup lock entry');
    const file = await open(
      join(locks, id),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const before = await file.stat({ bigint: true });
      // Proof: pinned native final locks are0400; removing this mode guard makes the0644 metadata negative resolve.
      if (
        !before.isFile() ||
        before.uid !== BigInt(input.repositoryUid) ||
        before.nlink !== 1n ||
        ![0o400n, 0o600n].includes(before.mode & 0o777n) ||
        before.size <= 0n ||
        before.size > 4096n
      )
        throw new Error('Untrusted local backup lock object');
      const bytes = await file.readFile();
      const after = await file.stat({ bigint: true });
      const version = (status: typeof before) =>
        `${String(status.dev)}:${String(status.ino)}:${String(status.ctimeNs)}:${String(status.size)}`;
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      // Proof: actual corrupt ciphertext/name and replaced-inode negatives passed the RED adapter.
      if (
        version(before) !== version(after) ||
        BigInt(bytes.length) !== before.size ||
        sha256 !== id
      )
        throw new Error('Local backup lock version changed or ciphertext is corrupt');
      return {
        key: `locks/${id}`,
        versionId: version(after),
        visible: true,
        kind: 'object',
        sha256,
        bytes: bytes.length,
      };
    } finally {
      await file.close();
    }
  };
  const census = async () => {
    await verify();
    const names = (await readdir(locks)).sort();
    if (names.length > 65536) throw new Error('Local backup lock census exceeds bound');
    const versions: RegistryBackupLockVersion[] = [];
    for (const name of names) versions.push(await inspect(name));
    if (JSON.stringify((await readdir(locks)).sort()) !== JSON.stringify(names))
      throw new Error('Local backup lock census changed during observation');
    await verify();
    return versions;
  };
  let snapshotDirectoryIdentity: string | undefined;
  return {
    census,
    /** Fixture-only current snapshots; private repository exclusion supplies no historical versions or production provider evidence. */
    async snapshotVersions(signal) {
      // Proof: removing the signal boundary and its cycle checks accepted absent/invalid/aborted and enumeration-abort local negatives.
      if (!(signal instanceof AbortSignal)) throw new Error('Missing local retention signal');
      signal.throwIfAborted();
      // Proof: removing this callback's authority dependency accepted its unlocked-descriptor local negative.
      await verify();
      const snapshots = join(input.repository, 'snapshots');
      const identity = await directory(snapshots);
      // Proof: removing this check accepted a replaced snapshots directory between local observations.
      if (snapshotDirectoryIdentity !== undefined && snapshotDirectoryIdentity !== identity)
        throw new Error('Owned local snapshot directory changed');
      snapshotDirectoryIdentity = identity;
      const beforeDirectory = await lstat(snapshots, { bigint: true });
      const names = (await readdir(snapshots)).sort();
      // Proof: removing this bound accepted 8,193 repeated valid names from a broken readdir producer.
      if (names.length > 8192) throw new Error('Local snapshot census exceeds count bound');
      const versions: RegistryBackupSnapshotVersion[] = [];
      let totalBytes = 0;
      for (const snapshotId of names) {
        signal.throwIfAborted();
        await verify();
        // Proof: paired removal of name and ciphertext identity checks accepted an unknown local filename.
        if (!/^[a-f0-9]{64}$/.test(snapshotId)) throw new Error('Unknown local snapshot name');
        const path = join(snapshots, snapshotId);
        const file = await open(
          path,
          constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
        );
        try {
          const before = await file.stat({ bigint: true });
          // Proof: removing this metadata check accepted owner-writable, extra-hardlink and correctly named oversized local ciphertext negatives.
          if (
            !before.isFile() ||
            before.uid !== BigInt(input.repositoryUid) ||
            before.nlink !== 1n ||
            (before.mode & 0o777n) !== 0o400n ||
            before.size <= 0n ||
            before.size > 1024n ** 2n
          )
            throw new Error('Untrusted readonly local snapshot object');
          totalBytes += Number(before.size);
          // Proof: removing this bound accepted 65 independently named 1MiB local objects.
          if (totalBytes > 64 * 1024 ** 2)
            throw new Error('Local snapshot census exceeds ciphertext byte bound');
          const bytes = await file.readFile();
          signal.throwIfAborted();
          const after = await file.stat({ bigint: true });
          const version = (status: typeof before) =>
            `${String(status.dev)}:${String(status.ino)}:${String(status.ctimeNs)}:${String(status.size)}`;
          // Proof: removing this identity check accepted corrupted local ciphertext under its original filename.
          if (
            version(before) !== version(after) ||
            version(after) !== version(await lstat(path, { bigint: true })) ||
            BigInt(bytes.length) !== before.size ||
            createHash('sha256').update(bytes).digest('hex') !== snapshotId
          )
            throw new Error('Local snapshot version changed or ciphertext is corrupt');
          versions.push({
            snapshotId,
            versionId: version(after),
            kind: 'object',
            visible: true,
            bytes: bytes.length,
          });
        } finally {
          await file.close();
        }
      }
      const afterDirectory = await lstat(snapshots, { bigint: true });
      // Proof: removing this bookend accepted directory replacement during the real local enumeration consumer.
      if (
        (await directory(snapshots)) !== identity ||
        beforeDirectory.ctimeNs !== afterDirectory.ctimeNs ||
        JSON.stringify((await readdir(snapshots)).sort()) !== JSON.stringify(names)
      )
        throw new Error('Local snapshot census changed during observation');
      signal.throwIfAborted();
      await verify();
      return versions;
    },
    async removeVersion(observed) {
      await verify();
      if (
        observed.kind !== 'object' ||
        !observed.visible ||
        !/^locks\/[a-f0-9]{64}$/.test(observed.key)
      )
        throw new Error('Invalid exact local backup lock removal');
      const current = await inspect(observed.key.slice(6));
      if (
        current.versionId !== observed.versionId ||
        current.kind !== 'object' ||
        current.sha256 !== observed.sha256 ||
        current.bytes !== observed.bytes
      )
        throw new Error('Exact local backup lock version changed before removal');
      await unlink(join(input.repository, observed.key));
      await verify();
    },
  };
}
