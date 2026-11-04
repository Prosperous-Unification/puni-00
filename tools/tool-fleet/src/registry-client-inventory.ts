import type { RegistryClientPullPlan } from './registry-client-plan';
import type { RegistryInventory } from './registry-inventory';

/** Parent-side binding of the independently read physical client plan to the complete API/storage/consumer census, before any privileged client action. Repository identity remains part of every digest reference. */
export function requireRegistryClientInventory(
  plan: RegistryClientPullPlan,
  inventory: Pick<RegistryInventory, 'journal' | 'binding' | 'revisions'>,
): void {
  const binding = inventory.binding;
  const enrollment = inventory.journal.enrollment;
  // Proof: removing this binding admits changed revision/store/path/identity/census/filesystem in the parent inventory negatives.
  if (
    plan.binding.journalRevision !== inventory.journal.revision ||
    plan.binding.journalRevision !== binding.journalRevision ||
    plan.binding.storageId !== enrollment.storageId ||
    plan.binding.registryPath !== enrollment.registryPath ||
    binding.identity.registryId !== enrollment.registryId ||
    binding.identity.storageId !== enrollment.storageId ||
    plan.binding.censusSha256 !== binding.censusSha256 ||
    plan.binding.filesystem !== binding.filesystem
  )
    throw new Error('Client plan differs from complete retained inventory binding');
  const listReferences = (revisions: typeof inventory.revisions) =>
    revisions.map((revision) => revision.repository + '@' + revision.digest).sort();
  // Proof: removing this guard admits missing or repository-changed retained revisions.
  if (
    JSON.stringify(listReferences(plan.revisions)) !==
    JSON.stringify(listReferences(inventory.revisions))
  )
    throw new Error('Client plan differs from retained repository revisions');
}
