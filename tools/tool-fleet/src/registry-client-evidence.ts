import { createHash } from 'node:crypto';

import type { RegistryClientCompletion } from './registry-client-completion';
import type { RegistryClientPullPlan } from './registry-client-plan';
import { RegistryRecoveryPreparation, RegistryRecoveryReceipt } from './registry-maintenance-state';
import type { RegistryMaintenanceJournal } from './registry-managed-journal';

/** A recovery client may verify only the durably prepared snapshot target, including after its canonical handoff. */
function selectRegistryClientTarget(
  journal: RegistryMaintenanceJournal,
  scope: RegistryClientCompletion['scope'],
) {
  if (scope === 'current') return journal.enrollment;
  const evidence = journal.maintenanceEvidence;
  // Proof: removing this explicit absence refusal changes the actual session scope negative's required durable-lineage diagnostic.
  if (evidence?.recovery === null || evidence?.recovery === undefined || evidence.backup === null)
    throw new Error('Client completion requires durable recovery lineage');
  const recovery = RegistryRecoveryPreparation.or(RegistryRecoveryReceipt).assert(
    JSON.parse(evidence.recovery),
  );
  // Proof: operation/snapshot/previous-store mutations then pass actual canonical read when this linkage is removed.
  if (
    recovery.operationId !== evidence.operationId ||
    recovery.snapshotId !== evidence.backup.snapshotId ||
    recovery.previousStorageId !== evidence.backup.storageId ||
    recovery.previousRegistryPath !== evidence.backup.registryPath
  )
    throw new Error('Client completion has foreign recovery lineage');
  return recovery;
}

/** The authority accepts only the unchanged held revision and its exact current or durably prepared target. The parent separately binds this physical plan to its complete consumer inventory. */
export function requireRegistryClientPlan(
  journal: RegistryMaintenanceJournal,
  plan: RegistryClientPullPlan,
  scope: RegistryClientCompletion['scope'],
): void {
  const owned = journal.maintenance;
  // Proof: the actual acquired-session negative loses the stopped-backed-up refusal when admission is removed.
  if (
    !journal.fenced ||
    owned === null ||
    !['stopped', 'backed-up', 'deleting', 'collected', 'verified', 'restored'].includes(
      owned.phase,
    ) ||
    journal.maintenanceEvidence?.backup === null ||
    journal.maintenanceEvidence === null
  )
    throw new Error('Client completion requires stopped backed-up maintenance');
  const selected = selectRegistryClientTarget(journal, scope);
  // Proof: removing this guard changes actual session revision/store/path refusal or admits stale revision.
  if (
    plan.binding.journalRevision !== journal.revision ||
    plan.binding.storageId !== selected.storageId ||
    plan.binding.registryPath !== selected.registryPath
  )
    throw new Error('Client completion plan differs from current authority');
}

/** Canonical reads reject receipts whose operation, backup, target, revision or clock cannot have been acknowledged by this authority. Age is checked again at each service restoration, never when reading historical evidence. */
export function validateRegistryClientEvidence(journal: RegistryMaintenanceJournal): void {
  const evidence = journal.maintenanceEvidence;
  const receipt = evidence?.client;
  if (evidence === null || receipt === undefined) return;
  const selected = selectRegistryClientTarget(journal, receipt.scope);
  // Proof: corrupt receipt operation/registry/snapshot/store/revision and extended-year future timestamps pass canonical read with this linkage removed.
  if (
    receipt.operationId !== evidence.operationId ||
    receipt.registryId !== journal.enrollment.registryId ||
    receipt.snapshotId !== evidence.backup?.snapshotId ||
    receipt.storageId !== selected.storageId ||
    receipt.registryPath !== selected.registryPath ||
    receipt.journalRevision >= journal.revision ||
    receipt.journalRevision <= evidence.backup.journalRevision ||
    Date.parse(receipt.completedAt) > Date.parse(journal.updatedAt)
  )
    throw new Error('Inconsistent durable client completion lineage');
}

/** Fresh client completion is mandatory before verified phase, service restoration or recovery activation. Historical canonical reads remain possible after this five-minute use window. */
export function requireRegistryClientRestoration(
  journal: RegistryMaintenanceJournal,
  at: string,
): void {
  validateRegistryClientEvidence(journal);
  const evidence = journal.maintenanceEvidence;
  const receipt = evidence?.client;
  if (receipt === undefined || evidence === null)
    throw new Error('Missing durable client completion');
  const age = Date.parse(at) - Date.parse(receipt.completedAt);
  // Proof: stale root restoration and +300001ms delayed-patch negatives admit reopening after removal.
  if (!Number.isFinite(age) || age < 0 || age > 300000)
    throw new Error('Stale or future client completion');
  if (
    receipt.storageId !== journal.enrollment.storageId ||
    receipt.registryPath !== journal.enrollment.registryPath
  )
    throw new Error('Client completion does not verify the serving store');
  if (evidence.recovery !== null) {
    const recovery = RegistryRecoveryReceipt.assert(JSON.parse(evidence.recovery));
    // Proof: the actual root recovered-census mutation reaches privileged initialization after removal.
    if (receipt.censusSha256 !== recovery.censusSha256)
      throw new Error('Client completion differs from recovered census');
  } else {
    const revisionsSha256 = createHash('sha256')
      .update(
        JSON.stringify(
          evidence.retained
            .map((reference) => reference.repository + '@' + reference.digest)
            .sort(),
        ),
      )
      .digest('hex');
    // Proof: the actual root changed-retained-repository negative reaches privileged initialization after removal.
    if (receipt.scope !== 'current' || receipt.revisionsSha256 !== revisionsSha256)
      throw new Error('Client completion differs from retained revisions');
  }
}
