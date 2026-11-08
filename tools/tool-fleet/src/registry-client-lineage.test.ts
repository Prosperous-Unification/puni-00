import { expect, test } from 'bun:test';

import { requireRegistryClientRecovery } from './registry-client-lineage';
import { createRegistryClientLineageFixture as fixture } from './registry-client-lineage.fixture';

test('client recovery selects only the durably prepared installed target and current snapshot', () => {
  const proof = fixture();
  expect(requireRegistryClientRecovery(proof.journal, proof.installed).target).toBe(
    proof.installed.recovery,
  );
});
for (const field of [
  'operationId',
  'snapshotId',
  'previousStorageId',
  'previousRegistryPath',
  'storageId',
  'registryPath',
  'canonicalJournalPath',
  'stagedJournalPath',
  'stagedJournalStorageId',
  'maximumBytes',
  'stagedJournalMaximumBytes',
  'node',
  'pvcUid',
  'binarySha256',
] as const) {
  test('client recovery refuses foreign prepared ' + field, () => {
    const proof = fixture();
    const changed = {
      ...proof.prepared,
      [field]:
        typeof proof.prepared[field] === 'number'
          ? 1
          : field === 'snapshotId' || field === 'binarySha256'
            ? 'b'.repeat(64)
            : 'foreign',
    };
    proof.journal.maintenanceEvidence.recovery = JSON.stringify(changed);
    expect(() => requireRegistryClientRecovery(proof.journal, proof.installed)).toThrow();
  });
}
