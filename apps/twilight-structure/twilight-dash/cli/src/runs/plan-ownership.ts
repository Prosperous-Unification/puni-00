import { addInteger, assertInteger } from './record-codecs';
import type { Epoch, OwnerId, Ownership, OwnershipStatus, Timestamp } from './records';
import type { StoreReply } from './run-store';

/** Rejects a regressed or malformed trusted clock observation. */
export function assertClock(observedAt: Timestamp, lastObservedAt: Timestamp): void {
  assertInteger(observedAt);
  assertInteger(lastObservedAt);
  // Proof: removing regression rejection made `clock regression and invalid clock observations throw without changing work` accept 999 after 1000.
  if (observedAt < lastObservedAt) throw new Error('run store clock regressed');
}

/** Compares persisted authority and expiry; request expiry is deliberately irrelevant. */
export function isCurrentOwner(
  current: Ownership,
  requested: Ownership,
  observedAt: Timestamp,
): boolean {
  // Proof: independently bypassing store, organization, owner and epoch equality failed
  // `renewal uses configured duration and rejects store organization owner and epoch mismatches`
  // or `takeover fences writes without freeing surviving work`. Removing live expiry failed
  // `expired ownership refuses all writes even without takeover and ignores forged expiry`.
  return (
    current.storeId === requested.storeId &&
    current.organizationId === requested.organizationId &&
    current.ownerId === requested.ownerId &&
    current.epoch === requested.epoch &&
    observedAt < current.expiresAt
  );
}

/** Plans ownership allocation without changing surviving work or capacity. */
export function planOwnership(
  status: OwnershipStatus,
  ownerId: OwnerId,
  expectedEpoch: Epoch,
  observedAt: Timestamp,
  lastObservedAt: Timestamp,
  leaseMilliseconds: number,
): StoreReply<Ownership> {
  assertClock(observedAt, lastObservedAt);
  assertInteger(expectedEpoch);
  assertInteger(leaseMilliseconds, 1);
  // Proof: removing expected-epoch comparison failed the renewal identity mismatch test.
  if (status.epoch !== expectedEpoch) return { kind: 'refused', reason: 'owner_stale' };
  // Proof: removing the live-owner refusal failed `takeover fences writes without freeing surviving work`.
  if (status.owner !== null && observedAt < status.owner.expiresAt)
    return { kind: 'refused', reason: 'owner_busy' };
  return {
    kind: 'applied',
    value: {
      version: 1,
      storeId: status.storeId,
      organizationId: status.organizationId,
      ownerId,
      epoch: addInteger(status.epoch, 1),
      expiresAt: addInteger(observedAt, leaseMilliseconds),
    },
  };
}

/** Plans renewal only while persisted authority remains live. */
export function planRenewal(
  current: Ownership,
  requested: Ownership,
  observedAt: Timestamp,
  lastObservedAt: Timestamp,
  leaseMilliseconds: number,
): StoreReply<Ownership> {
  assertClock(observedAt, lastObservedAt);
  assertInteger(leaseMilliseconds, 1);
  if (!isCurrentOwner(current, requested, observedAt))
    return { kind: 'refused', reason: 'owner_stale' };
  return {
    kind: 'applied',
    value: { ...current, expiresAt: addInteger(observedAt, leaseMilliseconds) },
  };
}
