import { expect, test } from 'bun:test';

import { requireRegistryRecoveryReceipt } from './registry-maintenance-state';

function fixture() {
  const receipt = {
    operationId: 'operation',
    snapshotId: 'a'.repeat(64),
    previousStorageId: 'old',
    previousRegistryPath: '/old',
    storageId: 'new',
    registryPath: '/new',
    maximumBytes: 50,
    canonicalJournalPath: '/journal',
    stagedJournalPath: '/staged',
    stagedJournalRevision: 5,
    stagedJournalSha256: 'b'.repeat(64),
    currentJournalRevision: 10,
    censusSha256: 'c'.repeat(64),
    verifiedAt: '2026-10-25T00:00:00.000Z',
    handoff: 'offline-exclusion-and-current-obligation-reconciliation-required',
  };
  const journal = {
    revision: 11,
    enrollment: { storageId: 'new', registryPath: '/new', maximumBytes: 50 },
    maintenance: { operationId: 'operation' },
    maintenanceEvidence: {
      recovery: JSON.stringify(receipt),
      backup: {
        snapshotId: receipt.snapshotId,
        storageId: 'old',
        registryPath: '/old',
        journalPath: '/journal',
        journalRevision: 5,
        journalSha256: receipt.stagedJournalSha256,
      },
    },
  };
  return { receipt, journal };
}
test('restored receipt binds current target and matching old snapshot journal lineage', () => {
  const proof = fixture();
  expect(requireRegistryRecoveryReceipt(proof.journal, '/journal').storageId).toBe('new');
});
for (const fault of [
  'target',
  'operation',
  'snapshot',
  'journal',
  'revision',
  'old-store',
  'staging-alias',
] as const) {
  test(`activation refuses mismatched recovery ${fault}`, () => {
    const proof = fixture();
    if (fault === 'target') proof.journal.enrollment.storageId = 'foreign';
    if (fault === 'operation') proof.receipt.operationId = 'foreign';
    if (fault === 'snapshot') proof.receipt.snapshotId = 'd'.repeat(64);
    if (fault === 'journal') proof.receipt.stagedJournalSha256 = 'd'.repeat(64);
    if (fault === 'revision') proof.receipt.currentJournalRevision = 12;
    if (fault === 'old-store') proof.receipt.previousRegistryPath = '/foreign';
    if (fault === 'staging-alias') proof.receipt.stagedJournalPath = '/journal';
    proof.journal.maintenanceEvidence.recovery = JSON.stringify(proof.receipt);
    expect(() => requireRegistryRecoveryReceipt(proof.journal, '/journal')).toThrow();
  });
}
