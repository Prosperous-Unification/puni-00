import {
  type Claim,
  type ClaimIdentity,
  claimIdentityOf,
  type ClaimStore,
  type ClaimWriteOutcome,
  type CredentialPair,
  type ProgressKey,
  type WriteStamp,
} from '@wbs/core';
import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm';

import { auditOnCreate } from './audit';
import type { Drizzle } from './db';
import { DirectoryRepository } from './directory';
import type { Gate } from './gate';
import { bumpWorkItems } from './revision';
import { claim, stepProgress, workItem } from './schema';

/**
 * Claims in the `claim` table (`20261019120000_add_claim`) and the
 * `in_progress` statements a claim makes, written together in one transaction
 * with one revision bump per work item.
 *
 * `created_by` is the claim's writing account and is written from the claim,
 * not the stamp: an undo of a release puts the claim back as its claimant's,
 * whoever pressed the key, so `parent_claim_foreign` keeps meaning the same.
 *
 * The identity reads are the directory's: `person.account_id` and
 * `external_identity.person_id` (`wbs-team-claims` D5, D6).
 *
 * @throws for a stored claim with no writing account, a removal of a claim
 * that is not stored, and every database failure.
 */
export class ClaimRepository implements ClaimStore {
  private readonly identity: ClaimIdentity;

  constructor(
    private readonly db: Drizzle,
    private readonly gate: Gate,
  ) {
    this.identity = claimIdentityOf(new DirectoryRepository(db, gate));
  }

  listByProject(projectId: string): Promise<Claim[]> {
    return this.read(projectId);
  }

  async findById(projectId: string, claimId: string): Promise<Claim | null> {
    return (await this.read(projectId, claimId)).at(0) ?? null;
  }

  boundAccountOf(personId: string): Promise<string | null> {
    return this.identity.boundAccountOf(personId);
  }

  pinnedPersonOf(credential: CredentialPair | null): Promise<string | null> {
    return this.identity.pinnedPersonOf(credential);
  }

  private async read(projectId: string, claimId?: string): Promise<Claim[]> {
    const rows = await this.db
      .select({
        id: claim.id,
        workItemId: claim.workItemId,
        stepId: claim.stepId,
        personId: claim.personId,
        runId: claim.runId,
        parentClaimId: claim.parentClaimId,
        accountId: claim.createdBy,
      })
      .from(claim)
      .innerJoin(workItem, eq(workItem.id, claim.workItemId))
      .where(
        and(
          eq(workItem.projectId, projectId),
          claimId === undefined ? undefined : eq(claim.id, claimId),
        ),
      )
      .orderBy(asc(claim.workItemId), asc(claim.stepId), asc(claim.id));
    return rows.map(({ accountId, ...row }) => {
      // Proof: with this check removed, `refuses a stored claim with no writing
      // account` read it with a null account; watched 2026-10-19.
      if (accountId === null) throw new Error(`claim ${row.id} has no writing account`);
      return { ...row, accountId };
    });
  }

  async add(
    claims: readonly Claim[],
    stated: readonly ProgressKey[],
    stamp: WriteStamp,
  ): Promise<ClaimWriteOutcome> {
    return await this.gate.enter(async () => {
      await Promise.resolve();
      return this.db.transaction((tx): ClaimWriteOutcome => {
        for (const each of claims) {
          const held = tx
            .select({ id: claim.id })
            .from(claim)
            .where(
              or(
                eq(claim.id, each.id),
                and(
                  eq(claim.workItemId, each.workItemId),
                  each.stepId === null ? isNull(claim.stepId) : eq(claim.stepId, each.stepId),
                ),
              ),
            )
            .all();
          // Proof: with this check disabled, the SQLite certification's
          // `claims.add:taken-stated-remove` case failed; watched 2026-10-19.
          if (held.length > 0) return 'taken';
        }
        for (const { workItemId, stepId } of stated) {
          const spoken = tx
            .select({ stepId: stepProgress.stepId })
            .from(stepProgress)
            .where(and(eq(stepProgress.workItemId, workItemId), eq(stepProgress.stepId, stepId)))
            .all();
          if (spoken.length > 0) return 'progress_stated';
        }
        for (const each of claims) {
          // Proof: without the `createdBy` override, `writes the claim as its
          // claimant’s account, whoever applies it` read the applier; watched 2026-10-19.
          tx.insert(claim)
            .values({ ...each, ...auditOnCreate(stamp), createdBy: each.accountId })
            .run();
        }
        for (const key of stated) {
          tx.insert(stepProgress)
            .values({ ...key, state: 'in_progress', statedAt: stamp.at, ...auditOnCreate(stamp) })
            .run();
        }
        bumpWorkItems(
          tx,
          [...claims, ...stated].map(({ workItemId }) => workItemId),
          stamp,
        );
        return 'written';
      });
    });
  }

  async remove(
    claims: readonly Claim[],
    cleared: readonly ProgressKey[],
    stamp: WriteStamp,
  ): Promise<void> {
    await this.gate.enter(async () => {
      await Promise.resolve();
      this.db.transaction((tx) => {
        const ids = claims.map(({ id }) => id);
        const stored =
          ids.length === 0
            ? []
            : tx.select({ id: claim.id }).from(claim).where(inArray(claim.id, ids)).all();
        if (stored.length !== new Set(ids).size)
          throw new Error(`a claim to remove is not stored: ${ids.join(', ')}`);
        // Delegated claims under a removed one go with it: `parent_claim_id` cascades.
        if (ids.length > 0) tx.delete(claim).where(inArray(claim.id, ids)).run();
        for (const { workItemId, stepId } of cleared) {
          tx.delete(stepProgress)
            .where(and(eq(stepProgress.workItemId, workItemId), eq(stepProgress.stepId, stepId)))
            .run();
        }
        bumpWorkItems(
          tx,
          [...claims, ...cleared].map(({ workItemId }) => workItemId),
          stamp,
        );
      });
    });
  }
}
