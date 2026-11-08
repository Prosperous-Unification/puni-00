import { registryClusterFixture } from './registry-maintenance-cluster.fixture';
import { type RegistryRecoveryPreparation } from './registry-maintenance-state';

export function createRegistryClientLineageFixture() {
  const cluster = registryClusterFixture().installed;
  const artifact = { path: '/fixed', sha256: 'a'.repeat(64) };
  const target = {
    ...cluster.ordinary,
    state: 'enrolled' as const,
    path: '/recovery',
    storageId: 'new',
    identityReceipt: '/target.receipt',
    maximumBytes: 50,
    configuration: artifact,
    deletionConfiguration: artifact,
    stagedJournalPath: '/var/lib/puni-registry/recovery/journal/contents' as const,
    stagedJournalIdentityReceipt:
      '/var/lib/puni-registry/journal/identities/recovery-journal.receipt' as const,
    stagedJournalStorageId: 'staged',
    stagedJournalMaximumBytes: 10,
  };
  const installed = {
    ...cluster,
    distribution: artifact,
    recovery: target,
    ordinary: { ...cluster.ordinary, storageId: 'old', maximumBytes: 50 },
  };
  const prepared: RegistryRecoveryPreparation = {
    state: 'prepared',
    operationId: 'client-recovery',
    snapshotId: 'a'.repeat(64),
    previousStorageId: installed.ordinary.storageId,
    previousRegistryPath: installed.ordinary.path,
    storageId: target.storageId,
    registryPath: target.path,
    maximumBytes: target.maximumBytes,
    canonicalJournalPath: installed.journalPath,
    stagedJournalPath: target.stagedJournalPath,
    stagedJournalStorageId: target.stagedJournalStorageId,
    stagedJournalMaximumBytes: target.stagedJournalMaximumBytes,
    node: installed.node.name,
    pvcUid: target.pvc.uid,
    mountIdentity: 'mounted-proof',
    distributionDigest: 'sha256:' + 'a'.repeat(64),
    binarySha256: installed.distribution.sha256,
    preparedAt: '2026-10-31T00:00:00.000Z',
  };
  const journal = {
    enrollment: { storageId: installed.ordinary.storageId, registryPath: installed.ordinary.path },
    maintenance: { operationId: prepared.operationId },
    maintenanceEvidence: {
      recovery: JSON.stringify(prepared),
      backup: {
        snapshotId: prepared.snapshotId,
        storageId: installed.ordinary.storageId,
        registryPath: installed.ordinary.path,
        journalPath: installed.journalPath,
      },
    },
  };
  return { installed, prepared, journal };
}
