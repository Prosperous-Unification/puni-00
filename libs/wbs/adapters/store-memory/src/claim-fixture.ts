import {
  type Claim,
  type ClaimIdentity,
  type ClaimOccupancy,
  type ClaimStore,
  type StampedClaim,
  unstampClaim,
  type WorkItemStore,
} from '@wbs/core';
import { renewalAt } from '@wbs/domain';

import type { MemoryProgressTable } from './progress-fixture';

/**
 * Cloneable claims owned by the memory source, each with the instant it was
 * written, and their `claim_occupancy` rows (`wbs-resources` R3).
 */
export interface MemoryClaimTable {
  readonly rows: StampedClaim[];
  readonly occupancy: ClaimOccupancy[];
}
export function memoryClaimTable(): MemoryClaimTable {
  return { rows: [], occupancy: [] };
}

/**
 * A {@link ClaimStore} over an array, holding the SQLite table's rules: one
 * claim per (work item, step), one subtree claim per work item, unique ids,
 * and a removed claim taking every claim delegated under it (the parent
 * reference cascades). The `in_progress` statements it makes and clears live
 * in the source's own progress table, so the progress store reads them.
 *
 * Each claim keeps the instant of the write that stored it, as SQLite's
 * `created_at` does, and its lease's expiry and revocation instants;
 * {@link ClaimStore.listStampedByProject} answers them. No memory port revokes
 * a lease: {@link endMemoryLeases} is the revocation's seam.
 *
 * `identity` answers the bound-account and credential-pin reads: the source's
 * directory, through `claimIdentityOf`, as SQLite's claims read theirs.
 * `holdsResource` answers whether the directory still holds a resource, which
 * SQLite's foreign key on `claim_occupancy.resource_id` answers there.
 *
 * @throws on a read of a claim whose work item is gone, and on a removal of a
 * claim that is not stored: both are trusted state gone wrong.
 */
export function inMemoryClaims(
  workItems: Pick<WorkItemStore, 'findById' | 'listByProject'>,
  progress: MemoryProgressTable,
  table: MemoryClaimTable,
  identity: ClaimIdentity,
  holdsResource: (resourceId: string) => boolean,
): ClaimStore {
  const inProject = async (projectId: string): Promise<StampedClaim[]> => {
    const ids = new Set((await workItems.listByProject(projectId)).map(({ id }) => id));
    const found: StampedClaim[] = [];
    for (const claim of table.rows) {
      if (ids.has(claim.workItemId)) {
        // Proof: with the revocation instant read as null here, the memory
        // certification's `claims.lease:revoked-instant-read` case failed
        // (74 pass, 1 fail); watched 2026-10-23.
        found.push({ ...claim });
        continue;
      }
      if ((await workItems.findById(claim.workItemId)) === null)
        throw new Error(`claim ${claim.id} names an absent work item`);
    }
    return found.sort(
      (left, right) =>
        compare(left.workItemId, right.workItemId) ||
        compare(left.stepId ?? '', right.stepId ?? '') ||
        compare(left.id, right.id),
    );
  };
  return {
    listByProject: async (projectId) => (await inProject(projectId)).map(unstampClaim),
    listStampedByProject: inProject,
    async findById(projectId, claimId) {
      const found = (await inProject(projectId)).find(({ id }) => id === claimId);
      return found === undefined ? null : unstampClaim(found);
    },
    async occupancyOf(projectId) {
      const claims = new Map((await inProject(projectId)).map((claim) => [claim.id, claim]));
      return table.occupancy
        .flatMap(({ claimId, resourceId, units }) => {
          const claim = claims.get(claimId);
          if (claim === undefined) return [];
          const { workItemId, personId, runId } = claim;
          return [{ claimId, workItemId, personId, runId, resourceId, units }];
        })
        .sort(
          (left, right) =>
            compare(left.workItemId, right.workItemId) ||
            compare(left.resourceId, right.resourceId) ||
            compare(left.claimId, right.claimId),
        );
    },
    boundAccountOf: (personId) => identity.boundAccountOf(personId),
    pinnedPersonOf: (credential) => identity.pinnedPersonOf(credential),
    add(claims, stated, stamp, occupancy, leases = []) {
      const ids = new Set(claims.map(({ id }) => id));
      const stray = occupancy.find(({ claimId }) => !ids.has(claimId));
      if (stray !== undefined)
        return Promise.reject(new Error(`occupancy names claim ${stray.claimId} not added`));
      const strayLease = leases.find(({ claimId }) => !ids.has(claimId));
      if (strayLease !== undefined)
        return Promise.reject(new Error(`a lease names claim ${strayLease.claimId} not added`));
      const expiryOf = new Map(leases.map(({ claimId, expiresAt }) => [claimId, expiresAt]));
      const held = (claim: Claim): boolean =>
        table.rows.some(
          (row) =>
            row.id === claim.id ||
            (row.workItemId === claim.workItemId && row.stepId === claim.stepId),
        );
      // Proof: with this check disabled, the memory certification's
      // `claims.add:taken-stated-remove` case failed; watched 2026-10-19.
      if (claims.some(held)) return Promise.resolve('taken' as const);
      const spoken = stated.some(({ workItemId, stepId }) =>
        progress.rows.some((row) => row.workItemId === workItemId && row.stepId === stepId),
      );
      if (spoken) return Promise.resolve('progress_stated' as const);
      // Proof: with this check removed, the memory certification's
      // `claims.occupancy:hold-read-cascade` case answered written for an
      // absent resource; watched 2026-10-20.
      if (occupancy.some(({ resourceId }) => !holdsResource(resourceId)))
        return Promise.resolve('unknown_resource' as const);
      table.occupancy.push(...occupancy.map((row) => ({ ...row })));
      // The instant stored is this write's, as SQLite's `created_at` is.
      // Proof: storing 0 here failed the memory certification's
      // `claims.listStampedByProject:write-instant` case; watched 2026-10-19.
      table.rows.push(
        ...claims.map((claim) => ({
          ...claim,
          claimedAt: stamp.at,
          leaseExpiresAt: expiryOf.get(claim.id) ?? null,
          leaseRevokedAt: null,
        })),
      );
      progress.rows.push(
        ...stated.map(({ workItemId, stepId }) => ({
          workItemId,
          stepId,
          state: 'in_progress' as const,
          statedAt: stamp.at,
        })),
      );
      return Promise.resolve('written' as const);
    },
    remove(claims, cleared, _stamp) {
      const gone = new Set<string>();
      for (const claim of claims) {
        if (!table.rows.some(({ id }) => id === claim.id))
          throw new Error(`claim ${claim.id} is not stored`);
        gone.add(claim.id);
      }
      for (let grew = true; grew;) {
        grew = false;
        for (const row of table.rows) {
          if (!gone.has(row.id) && row.parentClaimId !== null && gone.has(row.parentClaimId)) {
            gone.add(row.id);
            grew = true;
          }
        }
      }
      dropClaims(table, gone);
      progress.rows.splice(
        0,
        progress.rows.length,
        ...progress.rows.filter(
          (row) =>
            !cleared.some(
              ({ workItemId, stepId }) => row.workItemId === workItemId && row.stepId === stepId,
            ),
        ),
      );
      return Promise.resolve();
    },
    renewLeases(personId, now) {
      // One instant: the memory source has no write turn to wait behind.
      const at = now();
      const renewal = renewalAt(at);
      // In force is unrevoked and unexpired, as SQLite's renewal reads it.
      // Proof: with the revocation test dropped, the memory certification's
      // `claims.lease:revoked-instant-read` case renewed a revoked lease
      // (74 pass, 1 fail); watched 2026-10-23.
      const isInForce = (row: StampedClaim): boolean =>
        row.personId === personId &&
        row.leaseRevokedAt === null &&
        row.leaseExpiresAt !== null &&
        at < row.leaseExpiresAt;
      // Proof: with the in-force test dropped (an expired lease renewed), the
      // memory certification's `claims.lease:write-renew-expire` case revived
      // it (74 pass, 1 fail); watched 2026-10-23.
      table.rows.splice(
        0,
        table.rows.length,
        ...table.rows.map((row) =>
          isInForce(row) && row.leaseExpiresAt !== null && row.leaseExpiresAt < renewal.dueBefore
            ? { ...row, leaseExpiresAt: renewal.expiresAt }
            : row,
        ),
      );
      const expiries = table.rows
        .filter(isInForce)
        .flatMap(({ leaseExpiresAt }) => (leaseExpiresAt === null ? [] : [leaseExpiresAt]));
      return Promise.resolve({
        leases: expiries.length,
        leaseExpiresAt: expiries.length === 0 ? null : Math.min(...expiries),
      });
    },
    async expiredLeasesOf(projectId, at) {
      return (
        (await inProject(projectId))
          .filter(({ leaseExpiresAt }) => leaseExpiresAt !== null && leaseExpiresAt <= at)
          .sort((left, right) => compare(left.id, right.id))
          // Proof: answering `lease_expired` for every claim failed the memory
          // certification's `claims.lease:revoked-instant-read` case (74 pass,
          // 1 fail); watched 2026-10-23.
          .map(({ id, leaseRevokedAt }) => ({
            claimId: id,
            reason:
              leaseRevokedAt === null
                ? ('lease_expired' as const)
                : ('credential_revoked' as const),
          }))
      );
    },
    async projectsWithExpiredLeases(at, limit) {
      const oldest = new Map<string, number>();
      for (const row of table.rows) {
        if (row.leaseExpiresAt === null || row.leaseExpiresAt > at) continue;
        const item = await workItems.findById(row.workItemId);
        if (item === null) throw new Error(`claim ${row.id} names an absent work item`);
        oldest.set(
          item.projectId,
          Math.min(oldest.get(item.projectId) ?? row.leaseExpiresAt, row.leaseExpiresAt),
        );
      }
      return [...oldest]
        .sort(([left, a], [right, b]) => a - b || compare(left, right))
        .slice(0, limit)
        .map(([projectId]) => projectId);
    },
    moveAll(fromWorkItemId, toWorkItemId, _stamp) {
      const moving = table.rows.filter(({ workItemId }) => workItemId === fromWorkItemId);
      const clash = moving.find((claim) =>
        table.rows.some((row) => row.workItemId === toWorkItemId && row.stepId === claim.stepId),
      );
      // The SQLite unique index `claim_step` / `claim_subtree` refuses the same.
      // Proof: with this refusal disabled, the memory certification's
      // `claims.moveAll:in-place` case failed (`the promise resolved`); watched 2026-10-20.
      if (clash !== undefined) {
        return Promise.reject(
          new Error(`work item ${toWorkItemId} already holds a claim on ${String(clash.stepId)}`),
        );
      }
      table.rows.splice(
        0,
        table.rows.length,
        ...table.rows.map((row) =>
          row.workItemId === fromWorkItemId ? { ...row, workItemId: toWorkItemId } : row,
        ),
      );
      return Promise.resolve();
    },
  };
}

/**
 * Ends every unrevoked lease of `personId` at `at`, as SQLite's
 * `endLeasesOfUncredentialed` does when the person's last machine credential
 * is revoked: each expiry moves to `at` (never later than it was) and the
 * revocation instant is set, so no renewal moves it again and its expiry
 * reads `credential_revoked`. Answers how many leases it ended.
 */
export function endMemoryLeases(table: MemoryClaimTable, personId: string, at: number): number {
  let ended = 0;
  table.rows.splice(
    0,
    table.rows.length,
    ...table.rows.map((row) => {
      if (row.personId !== personId || row.leaseExpiresAt === null || row.leaseRevokedAt !== null)
        return row;
      ended += 1;
      return { ...row, leaseExpiresAt: Math.min(row.leaseExpiresAt, at), leaseRevokedAt: at };
    }),
  );
  return ended;
}

/**
 * Every claim deleting `personId` would take: their own and every claim
 * delegated under one, transitively, ordered by work item then step.
 *
 * Proof: with the loop never entered, the memory certification's
 * `directory.removePerson:delegated-claims` case read the superagent's claim
 * alone in the usage; watched 2026-10-20.
 */
export function claimsTakenWith(table: MemoryClaimTable, personId: string): Claim[] {
  const taken = new Set(
    table.rows.filter((each) => each.personId === personId).map(({ id }) => id),
  );
  for (let grew = true; grew;) {
    grew = false;
    for (const row of table.rows) {
      if (!taken.has(row.id) && row.parentClaimId !== null && taken.has(row.parentClaimId)) {
        taken.add(row.id);
        grew = true;
      }
    }
  }
  return table.rows
    .filter(({ id }) => taken.has(id))
    .map(unstampClaim)
    .sort(
      (left, right) =>
        compare(left.workItemId, right.workItemId) ||
        compare(left.stepId ?? '', right.stepId ?? ''),
    );
}

/**
 * Removes every claim `gone` selects and every claim delegated under one, as the
 * SQLite cascades do for a deleted work item, person or parent claim.
 */
export function cascadeClaims(table: MemoryClaimTable, gone: (claim: Claim) => boolean): void {
  const removed = new Set(table.rows.filter(gone).map(({ id }) => id));
  for (let grew = true; grew;) {
    grew = false;
    for (const row of table.rows) {
      if (!removed.has(row.id) && row.parentClaimId !== null && removed.has(row.parentClaimId)) {
        removed.add(row.id);
        grew = true;
      }
    }
  }
  dropClaims(table, removed);
}

/** Removes the claims `gone` names and their occupancy rows, as SQLite's cascade does. */
function dropClaims(table: MemoryClaimTable, gone: ReadonlySet<string>): void {
  table.rows.splice(0, table.rows.length, ...table.rows.filter(({ id }) => !gone.has(id)));
  table.occupancy.splice(
    0,
    table.occupancy.length,
    ...table.occupancy.filter(({ claimId }) => !gone.has(claimId)),
  );
}

/** Removes every occupancy row of one resource, as SQLite's resource cascade does. */
export function cascadeOccupancy(table: MemoryClaimTable, resourceId: string): void {
  table.occupancy.splice(
    0,
    table.occupancy.length,
    ...table.occupancy.filter((row) => row.resourceId !== resourceId),
  );
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
