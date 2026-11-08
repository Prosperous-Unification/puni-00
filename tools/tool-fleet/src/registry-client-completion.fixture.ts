import { createRegistryClientCompletion } from './registry-client-completion';
import type { RegistryClientPullPlan } from './registry-client-plan';
import type { RegistryInventory } from './registry-inventory';
import type { RegistryMaintenanceAuthority } from './registry-maintenance';

/** Modeled authenticated client completion for caller/journal fixtures, including the Distribution/GC component rehearsal. This performs no image pulls and proves no namespace, resource, binary, transport or client interoperability behavior. Those require the installed client rehearsal. */
export async function settleRegistryClientFixture(
  authority: RegistryMaintenanceAuthority,
  inventory: RegistryInventory,
  scope: 'current' | 'recovery' = 'current',
): Promise<void> {
  const journal = authority.read();
  const backup = journal.maintenanceEvidence?.backup;
  if (backup === null || backup === undefined || journal.maintenance === null)
    throw new Error('Missing fixture client owner');
  const plan: RegistryClientPullPlan = {
    binding: {
      journalRevision: journal.revision,
      storageId: inventory.journal.enrollment.storageId,
      registryPath: inventory.journal.enrollment.registryPath,
      censusSha256: inventory.binding.censusSha256,
      filesystem: inventory.binding.filesystem,
    },
    revisions: structuredClone([...inventory.revisions]),
    pulls: [],
  };
  await authority.settleClient(
    createRegistryClientCompletion(
      plan,
      {
        operationId: journal.maintenance.operationId,
        registryId: journal.enrollment.registryId,
        snapshotId: backup.snapshotId,
        scope,
      },
      journal.updatedAt,
    ),
    plan,
  );
}
