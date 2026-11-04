import type { RegistryMaintenanceInstallation } from './registry-maintenance-installation';
import { requireRegistryRecoveryInstallation } from './registry-maintenance-installation';
import { RegistryRecoveryPreparation } from './registry-maintenance-state';

/**
 * Staged-target client verification precedes the recovery receipt and enrollment handoff. Require
 * the durable preparation to bind the exact old store, current operation/snapshot and installed
 * target. After handoff the selected store uses ordinary current-store verification. This lineage
 * gate supplements the root dispatcher's fresh target device/controller audit and parent census.
 */
export function requireRegistryClientRecovery(
  journal: {
    enrollment: { storageId: string; registryPath: string };
    maintenance: { operationId: string } | null;
    maintenanceEvidence: {
      recovery: string | null;
      backup: {
        snapshotId: string;
        storageId: string;
        registryPath: string;
        journalPath: string;
      } | null;
    } | null;
  },
  installed: RegistryMaintenanceInstallation,
) {
  const target = requireRegistryRecoveryInstallation(installed);
  const evidence = journal.maintenanceEvidence;
  if (
    journal.maintenance === null ||
    evidence?.recovery === null ||
    evidence?.recovery === undefined ||
    evidence.backup === null
  )
    throw new Error('Client recovery requires durable prepared snapshot lineage');
  const prepared = RegistryRecoveryPreparation.assert(JSON.parse(evidence.recovery));
  const backup = evidence.backup;
  // Proof: each foreign prepared-field test fails when its corresponding comparison is removed.
  if (
    prepared.operationId !== journal.maintenance.operationId ||
    prepared.snapshotId !== backup.snapshotId ||
    prepared.previousStorageId !== journal.enrollment.storageId ||
    prepared.previousRegistryPath !== journal.enrollment.registryPath ||
    backup.storageId !== journal.enrollment.storageId ||
    backup.registryPath !== journal.enrollment.registryPath ||
    backup.journalPath !== installed.journalPath ||
    prepared.storageId !== target.storageId ||
    prepared.registryPath !== target.path ||
    prepared.maximumBytes !== target.maximumBytes ||
    prepared.stagedJournalPath !== target.stagedJournalPath ||
    prepared.stagedJournalStorageId !== target.stagedJournalStorageId ||
    prepared.stagedJournalMaximumBytes !== target.stagedJournalMaximumBytes ||
    prepared.canonicalJournalPath !== installed.journalPath ||
    prepared.node !== installed.node.name ||
    prepared.pvcUid !== target.pvc.uid ||
    prepared.binarySha256 !== installed.distribution.sha256
  )
    throw new Error('Client recovery differs from canonical and installed lineage');
  return { target, prepared };
}
