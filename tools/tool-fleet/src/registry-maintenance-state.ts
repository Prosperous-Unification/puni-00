import { createHash } from 'node:crypto';

import { type } from 'arktype';

import { RegistryBackupAttempt } from './registry-backup-attempt';
import { RegistryBackupLockRecovery, RegistryBackupLockReservation } from './registry-backup-locks';
import { RegistryClientCompletion } from './registry-client-completion';
import { requireRegistryClientRestoration } from './registry-client-evidence';
import type { RegistryMaintenanceJournal } from './registry-managed-journal';
import { RegistryReclamationReceipt, requireRegistryReclamation } from './registry-reclamation';

const Identity = type('0 < string <= 256');
const Hash = type(/^[a-f0-9]{64}$/);
const Digest = type(/^sha256:[a-f0-9]{64}$/);
const Timestamp = type('string').narrow(
  (stamp) => Number.isFinite(Date.parse(stamp)) && new Date(stamp).toISOString() === stamp,
);
const Reference = type({ repository: Identity, digest: Digest, '+': 'reject' });
/** Exact snapshot identities survive failure; verification covers both mounted contents trees, never backing images. */
export const RegistryBackupReceipt = type({
  snapshotId: Hash,
  verifiedAt: Timestamp,
  registryId: Identity,
  storageId: Identity,
  registryPath: Identity,
  journalPath: Identity,
  journalRevision: 'number.safe >= 0',
  journalSha256: Hash,
  censusSha256: Hash,
  bytes: 'number.safe > 0',
  '+': 'reject',
});
/** Bounded plans/runtime receipts are revalidated by their owning adapters. Reclamation may be absent in backup, pre-measurement or legacy evidence; {@link requireRegistryRestorationEvidence} still refuses ordinary retirement restoration without its current completed receipt. */
export const RegistryMaintenanceEvidence = type({
  operationId: Identity,
  'reclamation?': RegistryReclamationReceipt,
  'client?': RegistryClientCompletion,
  runtime: type('0 < string <= 16384').or('null'),
  plan: type('0 < string <= 49152').or('null'),
  backup: RegistryBackupReceipt.or('null'),
  backupCensusSha256: Hash.or('null'),
  backupAttempts: RegistryBackupAttempt.array().atMostLength(32),
  backupReconciliation: RegistryBackupLockReservation.or('null'),
  backupReconciliations: RegistryBackupLockRecovery.array().atMostLength(8),
  uploadsVerified: Hash.or('null'),
  retained: Reference.array().atMostLength(2048),
  deletions: type({
    repository: Identity,
    digest: Digest,
    tags: Identity.array().atMostLength(2048),
    state: "'pending'|'accepted'|'verified'",
    '+': 'reject',
  })
    .array()
    .atMostLength(2048),
  recovery: type('0 < string <= 16384').or('null'),
  '+': 'reject',
});
export type RegistryBackupReceipt = typeof RegistryBackupReceipt.infer;
export type RegistryMaintenanceEvidence = typeof RegistryMaintenanceEvidence.infer;

/** Verified retirement relinquishes present-content obligations, preserving original publication/history evidence. */
export const RegistryRetirementReceipt = type({
  operationId: Identity,
  operations: Identity.array().atLeastLength(1).atMostLength(2048),
  planSha256: Hash,
  retireBlobs: Digest.array().atMostLength(2048),
  neverUploaded: Reference.merge({ operationId: Identity }).array().atMostLength(2048),
  uploadsSha256: Hash,
  snapshotId: Hash,
  at: Timestamp,
  deletions: type({
    repository: Identity,
    digest: Digest,
    tags: Identity.array().atMostLength(2048),
    '+': 'reject',
  })
    .array()
    .atMostLength(2048),
  '+': 'reject',
});
export type RegistryRetirementReceipt = typeof RegistryRetirementReceipt.infer;

/** Matching snapshot journal is staged offline; this receipt never authorizes replacing the live authority lock or state. */
export const RegistryRecoveryReceipt = type({
  operationId: Identity,
  snapshotId: Hash,
  previousStorageId: Identity,
  previousRegistryPath: Identity,
  storageId: Identity,
  registryPath: Identity,
  maximumBytes: 'number.safe > 0',
  canonicalJournalPath: Identity,
  stagedJournalPath: Identity,
  stagedJournalRevision: 'number.safe >= 0',
  stagedJournalSha256: Hash,
  currentJournalRevision: 'number.safe >= 0',
  censusSha256: Hash,
  verifiedAt: Timestamp,
  handoff: "'offline-exclusion-and-current-obligation-reconciliation-required'",
  '+': 'reject',
});
export type RegistryRecoveryReceipt = typeof RegistryRecoveryReceipt.infer;

/** Persisted before extraction so an interrupted restore can reuse only its exact independently audited empty target. */
export const RegistryRecoveryPreparation = type({
  state: "'prepared'",
  operationId: Identity,
  snapshotId: Hash,
  previousStorageId: Identity,
  previousRegistryPath: Identity,
  storageId: Identity,
  registryPath: Identity,
  maximumBytes: 'number.safe > 0',
  canonicalJournalPath: Identity,
  stagedJournalPath: Identity,
  stagedJournalStorageId: Identity,
  stagedJournalMaximumBytes: 'number.safe > 0',
  node: Identity,
  pvcUid: Identity,
  mountIdentity: Identity,
  distributionDigest: Digest,
  binarySha256: Hash,
  preparedAt: Timestamp,
  '+': 'reject',
});
export type RegistryRecoveryPreparation = typeof RegistryRecoveryPreparation.infer;

/** Reuse of a restored receipt requires its exact active operation, current store and matching old snapshot/journal lineage; this check never replaces fresh host/content verification. */
export function requireRegistryRecoveryReceipt(
  journal: {
    revision: number;
    enrollment: { storageId: string; registryPath: string; maximumBytes: number };
    maintenance: { operationId: string } | null;
    maintenanceEvidence: {
      recovery: string | null;
      backup: Pick<
        RegistryBackupReceipt,
        | 'snapshotId'
        | 'storageId'
        | 'registryPath'
        | 'journalPath'
        | 'journalRevision'
        | 'journalSha256'
      > | null;
    } | null;
  },
  directory: string,
): RegistryRecoveryReceipt {
  const evidence = journal.maintenanceEvidence;
  if (
    evidence?.recovery === null ||
    evidence?.recovery === undefined ||
    evidence.backup === null ||
    journal.maintenance === null
  )
    throw new Error('Missing verified recovery lineage');
  const receipt = RegistryRecoveryReceipt.assert(JSON.parse(evidence.recovery));
  const backup = evidence.backup;
  // Proof: target/operation/snapshot/journal/revision/old-store/staging-alias mutations refuse activation lineage.
  if (
    receipt.operationId !== journal.maintenance.operationId ||
    receipt.snapshotId !== backup.snapshotId ||
    receipt.previousStorageId !== backup.storageId ||
    receipt.previousRegistryPath !== backup.registryPath ||
    receipt.storageId !== journal.enrollment.storageId ||
    receipt.registryPath !== journal.enrollment.registryPath ||
    receipt.maximumBytes !== journal.enrollment.maximumBytes ||
    receipt.currentJournalRevision >= journal.revision ||
    receipt.canonicalJournalPath !== directory ||
    backup.journalPath !== directory ||
    receipt.stagedJournalRevision !== backup.journalRevision ||
    receipt.stagedJournalSha256 !== backup.journalSha256 ||
    new Set([
      directory,
      receipt.stagedJournalPath,
      receipt.registryPath,
      receipt.previousRegistryPath,
    ]).size !== 4 ||
    receipt.storageId === receipt.previousStorageId
  )
    throw new Error('Restored receipt differs from current authority and verified backup lineage');
  return receipt;
}

/** GC requires the receipt already persisted after exact unlink reconciliation, including staging and snapshot lineage. */
export function requireRegistryCollectionEvidence(journal: RegistryMaintenanceJournal): void {
  const evidence = journal.maintenanceEvidence;
  const hasEvidence = evidence !== null;
  // Proof: the missing-evidence case requires this explicit refusal; the unsafe optional-chain rewrite throws later instead of preserving its GC diagnostic.
  if (
    journal.maintenance?.kind !== 'retirement' ||
    journal.maintenance.phase !== 'deleting' ||
    !hasEvidence ||
    evidence.backup === null ||
    evidence.plan === null ||
    evidence.operationId !== journal.maintenance.operationId ||
    evidence.deletions.some((deletion) => deletion.state !== 'verified')
  )
    throw new Error('GC requires verified backup and exact reconciled deletion evidence');
  const plan = type({
    policy: { retireOperations: 'string[]' },
    retireRevisions: Reference.array(),
    retireUploads: 'unknown[]',
    retireBlobs: Digest.array(),
    neverUploaded: Reference.merge({ operationId: Identity }).array(),
  }).assert(JSON.parse(evidence.plan));
  const hash = (text: string) => createHash('sha256').update(text).digest('hex');
  const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
  if (
    evidence.uploadsVerified !== hash(JSON.stringify(plan.retireUploads)) ||
    !same(
      evidence.deletions.map(({ repository, digest }) => ({ repository, digest })),
      plan.retireRevisions,
    )
  )
    throw new Error('GC unlink evidence differs from the exact plan');
  if (plan.policy.retireOperations.length === 0) {
    if (
      plan.retireRevisions.length !== 0 ||
      plan.retireUploads.length !== 0 ||
      plan.retireBlobs.length !== 0 ||
      plan.neverUploaded.length !== 0
    )
      throw new Error('GC discard plan has no eligible publication owner');
    return;
  }
  const receipts = journal.retirements.filter(
    (receipt) => receipt.operationId === evidence.operationId,
  );
  const receipt = receipts.at(0);
  const hasReceipt = receipt !== undefined;
  // Proof: the production receipt predicate rejects absent/foreign/changed snapshot, plan, upload, blob and deletion evidence; this scoped predicate test does not certify dispatcher wiring.
  if (
    receipts.length !== 1 ||
    !hasReceipt ||
    receipt.snapshotId !== evidence.backup.snapshotId ||
    receipt.planSha256 !== hash(evidence.plan) ||
    receipt.uploadsSha256 !== evidence.uploadsVerified ||
    !same(receipt.operations, plan.policy.retireOperations) ||
    !same(receipt.retireBlobs, plan.retireBlobs) ||
    !same(receipt.neverUploaded, plan.neverUploaded) ||
    !same(
      receipt.deletions,
      evidence.deletions.map(({ repository, digest, tags }) => ({ repository, digest, tags })),
    )
  )
    throw new Error('GC requires the exact durable retirement receipt');
}

/** Legacy/pre-measurement evidence may omit reclamation; retirement restoration cannot. Independently verified recovery proves a different store, never GC savings on the original. */
export function requireRegistryRestorationEvidence(
  journal: RegistryMaintenanceJournal,
  directory: string,
  at: string,
): void {
  if (
    journal.maintenanceEvidence?.recovery !== null &&
    journal.maintenanceEvidence?.recovery !== undefined
  )
    requireRegistryRecoveryReceipt(journal, directory);
  else if (journal.maintenance?.kind === 'retirement') requireRegistryReclamation(journal, at);
  requireRegistryClientRestoration(journal, at);
}
