import { expect, test } from 'bun:test';

import { requireRegistryClientInventory } from './registry-client-inventory';
import { planRegistryClientPulls } from './registry-client-plan';
import { createRegistryClientPlanFixture } from './registry-client-plan.fixture';
import type { RegistryInventory } from './registry-inventory';

async function fixture() {
  const physical = await createRegistryClientPlanFixture();
  await physical.image('kept');
  const plan = await planRegistryClientPulls(physical.journal, 4096, new AbortController().signal);
  const inventory: Pick<RegistryInventory, 'journal' | 'binding' | 'revisions'> = {
    journal: physical.journal,
    revisions: structuredClone(plan.revisions),
    binding: {
      journalRevision: physical.journal.revision,
      obligationsSha256: 'a'.repeat(64),
      censusSha256: plan.binding.censusSha256,
      filesystem: plan.binding.filesystem,
      identity: {
        registryId: 'proof',
        storageId: 'proof',
        node: 'fixture',
        pvcUid: 'fixture',
        mountIdentity: 'fixture',
        distributionDigest: 'sha256:' + 'a'.repeat(64),
        binarySha256: 'b'.repeat(64),
      },
    },
  };
  return { plan, inventory };
}
test('independent client plan must cover the same physical census and repository-qualified revisions as complete consumer inventory', async () => {
  const proof = await fixture();
  expect(() => {
    requireRegistryClientInventory(proof.plan, proof.inventory);
  }).not.toThrow();
});
for (const fault of [
  'revision',
  'binding-revision',
  'store',
  'identity-store',
  'path',
  'registry',
  'census',
  'filesystem',
  'missing-revision',
  'repository',
] as const)
  test('parent refuses client plan against changed inventory ' + fault, async () => {
    const proof = await fixture();
    if (fault === 'revision') proof.inventory.journal.revision++;
    if (fault === 'binding-revision')
      proof.inventory = {
        ...proof.inventory,
        binding: { ...proof.inventory.binding, journalRevision: 1 },
      };
    if (fault === 'store')
      proof.plan = { ...proof.plan, binding: { ...proof.plan.binding, storageId: 'foreign' } };
    if (fault === 'identity-store')
      proof.inventory = {
        ...proof.inventory,
        binding: {
          ...proof.inventory.binding,
          identity: { ...proof.inventory.binding.identity, storageId: 'foreign' },
        },
      };
    if (fault === 'path') proof.inventory.journal.enrollment.registryPath = '/foreign';
    if (fault === 'registry')
      proof.inventory = {
        ...proof.inventory,
        binding: {
          ...proof.inventory.binding,
          identity: { ...proof.inventory.binding.identity, registryId: 'foreign' },
        },
      };
    if (fault === 'census')
      proof.inventory = {
        ...proof.inventory,
        binding: { ...proof.inventory.binding, censusSha256: 'd'.repeat(64) },
      };
    if (fault === 'filesystem')
      proof.inventory = {
        ...proof.inventory,
        binding: { ...proof.inventory.binding, filesystem: '2:3' },
      };
    if (fault === 'missing-revision') proof.inventory = { ...proof.inventory, revisions: [] };
    if (fault === 'repository')
      proof.inventory = {
        ...proof.inventory,
        revisions: proof.inventory.revisions.map((revision) => ({
          ...revision,
          repository: 'foreign',
        })),
      };
    expect(() => {
      requireRegistryClientInventory(proof.plan, proof.inventory);
    }).toThrow();
  });
