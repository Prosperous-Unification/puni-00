import {
  type Claim,
  type ClaimIdentity,
  type ClaimStore,
  UNBOUND_CLAIM_IDENTITY,
  type WorkItemStore,
} from '@wbs/core';

import type { MemoryProgressTable } from './progress-fixture';

/** Cloneable claims owned by the memory source. */
export interface MemoryClaimTable {
  readonly rows: Claim[];
}
export function memoryClaimTable(): MemoryClaimTable {
  return { rows: [] };
}

/**
 * A {@link ClaimStore} over an array, holding the SQLite table's rules: one
 * claim per (work item, step), one subtree claim per work item, unique ids,
 * and a removed claim taking every claim delegated under it (the parent
 * reference cascades). The `in_progress` statements it makes and clears live
 * in the source's own progress table, so the progress store reads them.
 *
 * `identity` answers the bound-account and credential-pin reads; the default
 * binds nobody and pins nothing, as SQLite does until `person.account_id` lands.
 *
 * @throws on a read of a claim whose work item is gone, and on a removal of a
 * claim that is not stored: both are trusted state gone wrong.
 */
export function inMemoryClaims(
  workItems: Pick<WorkItemStore, 'findById' | 'listByProject'>,
  progress: MemoryProgressTable,
  table: MemoryClaimTable = memoryClaimTable(),
  identity: ClaimIdentity = UNBOUND_CLAIM_IDENTITY,
): ClaimStore {
  const inProject = async (projectId: string): Promise<Claim[]> => {
    const ids = new Set((await workItems.listByProject(projectId)).map(({ id }) => id));
    const found: Claim[] = [];
    for (const claim of table.rows) {
      if (ids.has(claim.workItemId)) {
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
    listByProject: inProject,
    async findById(projectId, claimId) {
      return (await inProject(projectId)).find(({ id }) => id === claimId) ?? null;
    },
    boundAccountOf: (personId) => identity.boundAccountOf(personId),
    pinnedPersonOf: (actorId) => identity.pinnedPersonOf(actorId),
    add(claims, stated, stamp) {
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
      table.rows.push(...claims.map((claim) => ({ ...claim })));
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
      table.rows.splice(0, table.rows.length, ...table.rows.filter(({ id }) => !gone.has(id)));
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
  };
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
  table.rows.splice(0, table.rows.length, ...table.rows.filter(({ id }) => !removed.has(id)));
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
