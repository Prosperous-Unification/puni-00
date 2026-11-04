import { lstat } from 'node:fs/promises';

import { admitBuilderScratch, measureVerifiedFilesystem } from './registry-capacity';
import { selectRegistryClientArtifact } from './registry-client-software';
import {
  type RegistryMaintenanceInstallation,
  requireRegistryClientInstallation,
  verifyRegistryHostArtifact,
} from './registry-maintenance-installation';

/**
 * Read-only installation preflight for explicitly enrolled client effects. Verify every fixed
 * tool, canonical storage receipt and separate root-owned pool against the trusted profile.
 * A zero scratch envelope measures physical bounds and separation without requiring free
 * download space: an owned full cache must not prevent installing recovery tools. This opens
 * no journal, starts no service, creates no job and grants no runtime permission.
 */
export async function verifyRegistryClientInstallation(
  installed: RegistryMaintenanceInstallation,
): Promise<void> {
  const client = requireRegistryClientInstallation(installed);
  // Proof: removing artifact verification admits the changed-worker negative in the installation fixture.
  for (const selected of [
    { artifact: client.worker, mode: 0o644 },
    ...[client.scope, client.control, client.ip].map((artifact) => ({ artifact, mode: 0o755 })),
    { artifact: client.mount, mode: 0o4755 },
    { artifact: selectRegistryClientArtifact(), mode: 0o755 },
    {
      artifact: {
        path: '/usr/local/libexec/puni-registry-authority/bun',
        sha256: '10702245766b225e70bbf6235fd6b47214fd94b4760d00ffaed8ab0df57ac235',
      },
      mode: 0o755,
    },
    {
      artifact: {
        path: '/usr/bin/unshare',
        sha256: '41c65e55107cbbb1a1f6994784a938dd7dbbe255d1fea6b7a58ec96eabe382ef',
      },
      mode: 0o755,
    },
  ])
    await verifyRegistryHostArtifact(selected.artifact, false, selected.mode);
  const stores = [
    {
      path: installed.journalPath,
      receipt: installed.journalIdentityReceipt,
      maximumBytes: installed.journalMaximumBytes,
      storageId: null,
    },
    {
      path: installed.ordinary.path,
      receipt: installed.ordinary.identityReceipt,
      maximumBytes: installed.ordinary.maximumBytes,
      storageId: installed.ordinary.storageId,
    },
    ...(installed.recovery.state === 'enrolled'
      ? [
          {
            path: installed.recovery.path,
            receipt: installed.recovery.identityReceipt,
            maximumBytes: installed.recovery.maximumBytes,
            storageId: installed.recovery.storageId,
          },
          {
            path: installed.recovery.stagedJournalPath,
            receipt: installed.recovery.stagedJournalIdentityReceipt,
            maximumBytes: installed.recovery.stagedJournalMaximumBytes,
            storageId: installed.recovery.stagedJournalStorageId,
          },
        ]
      : []),
  ];
  // Proof: removing this loop admits an unreadable journal; removed byte/UUID predicates admit their profile faults.
  for (const storage of stores) {
    const measured = await measureVerifiedFilesystem(storage.path, storage.receipt);
    if (
      measured.maximumBytes !== storage.maximumBytes ||
      (storage.storageId !== null && measured.identity !== storage.storageId)
    )
      throw new Error('Canonical client storage differs from installed profile');
  }
  // Proof: charging even one byte refuses the full-owned-pool positive; native ENOSPC still permits installation.
  const scratch = await admitBuilderScratch({
    path: client.scratch.path,
    receiptPath: client.scratch.receiptPath,
    excludedPaths: stores.map((storage) => storage.path),
    envelope: { bytes: 0, inodes: 0 },
  });
  const pool = await lstat(client.scratch.path);
  // Proof: removing each UUID/byte/inode predicate admits its changed-profile negative.
  if (
    scratch.identity !== client.scratch.storageId ||
    scratch.maximumBytes !== client.scratch.maximumBytes ||
    scratch.totalInodes > client.scratch.maximumInodes
  )
    throw new Error('Client scratch differs from installed physical profile');
  // Proof: removing each kind/UID/GID/mode predicate admits its exact pool-metadata negative.
  if (!pool.isDirectory() || pool.uid !== 0 || pool.gid !== 0 || (pool.mode & 0o777) !== 0o711)
    throw new Error('Client installation requires a root-owned0711pool');
}
