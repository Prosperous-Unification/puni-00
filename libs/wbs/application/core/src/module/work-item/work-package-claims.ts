import { deriveNumbers, treeOrder } from '@wbs/domain';

import type { ClaimedTreeRow, StampedClaim } from '../../ports/claim-store';
import type { NamedPerson, WorkItemAddress } from './startable';

/**
 * One claim held in a work package as the claims read lists it
 * (`wbs-claim-display` C2): a step of a leaf, or (`stepId` null) the subtree
 * of a non-leaf, with its holder, run, the subtree claim it is delegated
 * under, and its lease.
 */
export interface WorkPackageClaim extends WorkItemAddress {
  readonly stepId: string | null;
  readonly claimId: string;
  readonly holder: NamedPerson;
  readonly runId: string | null;
  readonly parentClaimId: string | null;
  /** When the claim was written, epoch milliseconds. */
  readonly claimedAt: number;
  /** When its lease runs out, epoch milliseconds; null for a claim no agent renews. */
  readonly leaseExpiresAt: number | null;
  /** When the holder's last credential was revoked, ending the lease; null while it was not. */
  readonly leaseRevokedAt: number | null;
}

/** Every claim of one work package and the server instant they were read at. */
export interface WorkPackageClaims {
  /** be-01's clock at the read, epoch milliseconds: what a lease's remaining time counts from. */
  readonly readAt: number;
  readonly claims: WorkPackageClaim[];
}

/** Everything {@link findWorkPackageClaims} reads, gathered in one observation. */
export interface WorkPackageClaimsReads {
  readonly rows: readonly ClaimedTreeRow[];
  /** Each actual leaf's resolved SC18 order, including explicit zero-step leaves. */
  readonly leafSteps: ReadonlyMap<string, readonly string[]>;
  readonly claims: readonly StampedClaim[];
  /** The holders' display names as the caller's access names them. */
  readonly personNames: ReadonlyMap<string, string>;
  readonly readAt: number;
}

/**
 * Every claim of one work package (`wbs-claim-display` spec `claim-reads`),
 * whatever its leaf's status: no status, startability or team filter applies.
 * Ordered by the work item's tree position, a subtree claim before the step
 * claims of the same item, step claims in their own leaf's resolved order.
 *
 * @throws when a claim sits on a row or names a step this read does not hold,
 * or its holder has no name in this read: claims, rows, steps and names come
 * from one observation (`ClaimStore.observeWorkPackage`) no write lands inside, and
 * a claim's row, step and person are foreign keys, so a miss is corrupt
 * trusted state.
 */
export function findWorkPackageClaims(reads: WorkPackageClaimsReads): WorkPackageClaims {
  const { rows } = reads;
  const numbers = deriveNumbers(rows);
  const order = treeOrder(rows);
  const byId = new Map(rows.map((row) => [row.id, row]));
  // Proof: leaf-order applies the first actual leaf inventory globally; both
  // opposing-type Source regressions reverse the second leaf's public claims.
  const stepPlaces = new Map(
    [...reads.leafSteps].map(([id, steps]) => [
      id,
      new Map(steps.map((stepId, index) => [stepId, index])),
    ]),
  );
  const listed = reads.claims.map((each) => {
    const row = byId.get(each.workItemId);
    const number = numbers.get(each.workItemId);
    const place = order.get(each.workItemId);
    if (row === undefined || number === undefined || place === undefined)
      throw new Error(`claim ${each.id} is on no row of this read`);
    const stepPlace = stepPlaces.get(each.workItemId);
    // Proof: required-leaf-order omits this combined missing/unresolved boundary;
    // both actual-observation controls answer the first missing inventory instead
    // of throwing. The later explicit-empty assertion earns no separate credit.
    if (each.stepId !== null && stepPlace === undefined)
      throw new Error(`claim ${each.id} has no resolved step order for ${each.workItemId}`);
    const step = each.stepId === null ? -1 : stepPlace?.get(each.stepId);
    if (step === undefined)
      throw new Error(
        `claim ${each.id} names step ${String(each.stepId)}, not resolved for ${each.workItemId}`,
      );
    const name = reads.personNames.get(each.personId);
    // Proof: with this check never true, `throws for a holder the read cannot
    // name` (work-package-claims.test.ts) answered instead of throwing (4 pass,
    // 1 fail); watched 2026-10-23.
    if (name === undefined) throw new Error(`person ${each.personId} has no name in this read`);
    const claim: WorkPackageClaim = {
      workItemId: each.workItemId,
      number,
      numberIsFrozen: row.frozenNumber !== null,
      name: row.name,
      stepId: each.stepId,
      claimId: each.id,
      holder: { personId: each.personId, name },
      runId: each.runId,
      parentClaimId: each.parentClaimId,
      claimedAt: each.claimedAt,
      leaseExpiresAt: each.leaseExpiresAt,
      leaseRevokedAt: each.leaseRevokedAt,
    };
    return { claim, place, step };
  });
  return {
    readAt: reads.readAt,
    claims: listed
      // Proof, each watched 2026-10-23 on work-package-claims.test.ts, whose step
      // ids sort the reverse of step order: sorted by claim id, 2 pass, 3 fail;
      // steps compared by id, 3 pass, 2 fail; a subtree claim placed after its
      // item's step claims, 3 pass, 2 fail.
      .toSorted((left, right) => left.place - right.place || left.step - right.step)
      .map(({ claim }) => claim),
  };
}
