import { createHash } from 'node:crypto';

import { type } from 'arktype';

import type { RegistryMaintenanceJournal } from './registry-journal';

const Identity = type('0 < string <= 256');
const Hash = type(/^[a-f0-9]{64}$/);
const Timestamp = type('string').narrow(
  (stamp) => Number.isFinite(Date.parse(stamp)) && new Date(stamp).toISOString() === stamp,
);
/** Allocated filesystem usage observed under the held authority; revision names the durable measurement acknowledgement. */
// Proof: removing the usage narrow admits impossible inode use in the actual pre-planning measurement test.
export const RegistryReclamationMeasurement = type({
  at: Timestamp,
  journalRevision: 'number.safe >= 0',
  maximumBytes: 'number.safe > 0',
  usableBytes: 'number.safe > 0',
  usedBytes: 'number.safe >= 0',
  totalInodes: 'number.safe > 0',
  usedInodes: 'number.safe >= 0',
  rootFreeBytes: 'number.safe >= 0',
  '+': 'reject',
}).narrow(
  (measurement) =>
    measurement.usedBytes <= measurement.usableBytes &&
    measurement.usedInodes <= measurement.totalInodes,
);
const ownership = {
  operationId: Identity,
  storageId: Identity,
  registryPath: Identity,
  snapshotId: Hash,
  before: RegistryReclamationMeasurement,
  '+': 'reject',
} as const;
/** Before-only evidence cannot authorize restoration; completed deltas are signed physical differences, including growth. */
export const RegistryReclamationReceipt = type.or(
  {
    ...ownership,
    after: 'null',
    planSha256: 'null',
    reclaimedBytes: 'null',
    reclaimedInodes: 'null',
  },
  {
    ...ownership,
    after: RegistryReclamationMeasurement,
    planSha256: Hash,
    reclaimedBytes: 'number.safe',
    reclaimedInodes: 'number.safe',
  },
);
export type RegistryReclamationReceipt = typeof RegistryReclamationReceipt.infer;

/** Reject corrupt or foreign persisted measurements, including stale plan lineage and invented reclaimed amounts; old-store evidence remains readable after independent recovery. */
export function validateRegistryReclamation(journal: RegistryMaintenanceJournal): void {
  const evidence = journal.maintenanceEvidence;
  const receipt = evidence?.reclamation;
  if (receipt === undefined) return;
  const backup = evidence?.backup;
  // Proof: operation/snapshot/store/path and before-only future time/revision corruptions become readable when their lineage predicates are removed.
  if (
    backup === undefined ||
    backup === null ||
    receipt.operationId !== evidence?.operationId ||
    receipt.snapshotId !== backup.snapshotId ||
    receipt.storageId !== backup.storageId ||
    receipt.registryPath !== backup.registryPath ||
    receipt.before.journalRevision > journal.revision ||
    // Proof: removing only before-time ordering made before-future-isolated resolve on canonical read in registry-chronology.test.
    Date.parse(receipt.before.at) > Date.parse(journal.updatedAt)
  )
    throw new Error('Reclamation receipt differs from durable operation and backup');
  const after = receipt.after;
  // Proof: named after-order/revision/time/dimension, delta and plan removals each admit the corresponding corrupted canonical journal.
  if (
    after !== null &&
    (after.journalRevision <= receipt.before.journalRevision ||
      after.journalRevision > journal.revision ||
      // Proof: removing only after/before ordering made after-order-isolated resolve on canonical read in registry-chronology.test.
      Date.parse(after.at) < Date.parse(receipt.before.at) ||
      // Proof: removing only after/canonical ordering made after-future-expanded resolve on canonical read in registry-chronology.test; before and after/before remain valid.
      Date.parse(after.at) > Date.parse(journal.updatedAt) ||
      after.maximumBytes !== receipt.before.maximumBytes ||
      after.usableBytes !== receipt.before.usableBytes ||
      after.totalInodes !== receipt.before.totalInodes ||
      receipt.reclaimedBytes !== receipt.before.usedBytes - after.usedBytes ||
      receipt.reclaimedInodes !== receipt.before.usedInodes - after.usedInodes ||
      evidence.plan === null ||
      receipt.planSha256 !== createHash('sha256').update(evidence.plan).digest('hex'))
  )
    throw new Error('Reclamation receipt has inconsistent measurements or plan');
}

/** Only a fresh final measurement acknowledged immediately before verification can restore this unchanged store. Later authority writes require new verification instead of reusing an old measurement. */
export function requireRegistryReclamation(journal: RegistryMaintenanceJournal, at: string): void {
  validateRegistryReclamation(journal);
  const receipt = journal.maintenanceEvidence?.reclamation;
  const phase = journal.maintenance?.phase;
  const offset =
    phase === 'collected' ? 0 : phase === 'verified' ? 1 : phase === 'restored' ? 2 : undefined;
  // Proof: root restoration reaches the first trusted effect for changed revision/capacity when the respective binding predicate is removed.
  if (
    receipt?.after == null ||
    offset === undefined ||
    receipt.operationId !== journal.maintenance?.operationId ||
    receipt.storageId !== journal.enrollment.storageId ||
    receipt.registryPath !== journal.enrollment.registryPath ||
    receipt.after.maximumBytes !== journal.enrollment.maximumBytes ||
    receipt.after.journalRevision !== journal.revision - offset
  )
    throw new Error('Missing current completed reclamation receipt');
  const now = Timestamp.assert(at);
  // Proof: removing stale/future age predicates lets the actual root restoration action reach modeled effects for those clocks.
  if (
    Date.parse(now) - Date.parse(receipt.after.at) < 0 ||
    Date.parse(now) - Date.parse(receipt.after.at) > 60000
  )
    throw new Error('Stale reclamation measurement');
}
