import {
  type Claim,
  type ClaimIdentity,
  claimIdentityOf,
  type ClaimLease,
  type ClaimOccupancy,
  type ClaimStore,
  type ClaimWriteOutcome,
  type CredentialPin,
  type ExpiredLease,
  type LeaseStanding,
  type OccupancyRow,
  type ProgressKey,
  type StampedClaim,
  unstampClaim,
  type WriteStamp,
} from '@wbs/core';
import { renewalAt } from '@wbs/domain';
import { and, asc, eq, gt, inArray, isNotNull, isNull, lt, lte, or, sql } from 'drizzle-orm';

import { auditOnCreate, auditOnUpdate } from './audit';
import type { Drizzle } from './db';
import { DirectoryRepository } from './directory';
import type { Gate } from './gate';
import type { ImmediateTransaction } from './immediate-write';
import { bumpWorkItems } from './revision';
import {
  claim,
  claimOccupancy,
  machineCredential,
  resource,
  stepProgress,
  workItem,
} from './schema';

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
 * Each claim's occupancy rows (`claim_occupancy`, `wbs-resources` R3) are
 * written with it and go with it by cascade.
 *
 * @throws for a stored claim with no writing account, a stamped read of a claim
 * with no write instant, a removal of a claim that is not stored, and every
 * database failure.
 */
export class ClaimRepository implements ClaimStore {
  private readonly identity: ClaimIdentity;

  constructor(
    private readonly db: Drizzle,
    private readonly gate: Gate,
  ) {
    this.identity = claimIdentityOf(new DirectoryRepository(db, gate));
  }

  async listByProject(projectId: string): Promise<Claim[]> {
    return (await this.read(projectId)).map(unstampClaim);
  }

  async listStampedByProject(projectId: string): Promise<StampedClaim[]> {
    return (await this.read(projectId)).map(({ claimedAt, ...each }) => {
      // Proof: with this check removed, `refuses a stamped read of a claim with
      // no write instant` read it with a null instant; watched 2026-10-19.
      if (claimedAt === null) throw new Error(`claim ${each.id} has no write instant`);
      return { ...each, claimedAt };
    });
  }

  async findById(projectId: string, claimId: string): Promise<Claim | null> {
    const found = (await this.read(projectId, claimId)).at(0);
    return found === undefined ? null : unstampClaim(found);
  }

  async occupancyOf(projectId: string): Promise<OccupancyRow[]> {
    return await this.db
      .select({
        claimId: claimOccupancy.claimId,
        workItemId: claim.workItemId,
        personId: claim.personId,
        runId: claim.runId,
        resourceId: claimOccupancy.resourceId,
        units: claimOccupancy.units,
      })
      .from(claimOccupancy)
      .innerJoin(claim, eq(claim.id, claimOccupancy.claimId))
      .innerJoin(workItem, eq(workItem.id, claim.workItemId))
      .where(eq(workItem.projectId, projectId))
      .orderBy(asc(claim.workItemId), asc(claimOccupancy.resourceId), asc(claimOccupancy.claimId));
  }

  boundAccountOf(personId: string): Promise<string | null> {
    return this.identity.boundAccountOf(personId);
  }

  pinnedPersonOf(credential: CredentialPin | null): Promise<string | null> {
    return this.identity.pinnedPersonOf(credential);
  }

  /**
   * Claims with their write instant as stored, null for a row written outside
   * {@link add}, and their lease's expiry and revocation instants.
   */
  private async read(
    projectId: string,
    claimId?: string,
  ): Promise<
    (Claim & {
      readonly claimedAt: number | null;
      readonly leaseExpiresAt: number | null;
      readonly leaseRevokedAt: number | null;
    })[]
  > {
    const rows = await this.db
      .select({
        id: claim.id,
        workItemId: claim.workItemId,
        stepId: claim.stepId,
        personId: claim.personId,
        runId: claim.runId,
        parentClaimId: claim.parentClaimId,
        accountId: claim.createdBy,
        claimedAt: claim.createdAt,
        leaseExpiresAt: claim.leaseExpiresAt,
        // Proof: with a constant null selected here in place of the column, the
        // SQLite certification's `claims.lease:revoked-instant-read` case read
        // the revoked lease as unrevoked (72 pass, 3 fail); watched 2026-10-23.
        leaseRevokedAt: claim.leaseRevokedAt,
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
    return rows.map(({ accountId, claimedAt, ...row }) => {
      // Proof: with this check removed, `refuses a stored claim with no writing
      // account` read it with a null account; watched 2026-10-19.
      if (accountId === null) throw new Error(`claim ${row.id} has no writing account`);
      return { ...row, accountId, claimedAt };
    });
  }

  async add(
    claims: readonly Claim[],
    stated: readonly ProgressKey[],
    stamp: WriteStamp,
    occupancy: readonly ClaimOccupancy[],
    leases: readonly ClaimLease[] = [],
  ): Promise<ClaimWriteOutcome> {
    const ids = new Set(claims.map(({ id }) => id));
    const stray = occupancy.find(({ claimId }) => !ids.has(claimId));
    if (stray !== undefined) throw new Error(`occupancy names claim ${stray.claimId} not added`);
    const expiryOf = new Map(leases.map(({ claimId, expiresAt }) => [claimId, expiresAt]));
    const strayLease = leases.find(({ claimId }) => !ids.has(claimId));
    if (strayLease !== undefined)
      throw new Error(`a lease names claim ${strayLease.claimId} not added`);
    return await this.gate.enter(async () => {
      await Promise.resolve();
      return this.db.transaction((tx): ClaimWriteOutcome => {
        const resourceIds = [...new Set(occupancy.map(({ resourceId }) => resourceId))];
        const known =
          resourceIds.length === 0
            ? []
            : tx
                .select({ id: resource.id })
                .from(resource)
                .where(inArray(resource.id, resourceIds))
                .all();
        // Proof: with this check removed, the SQLite certification failed its
        // `claims.occupancy:hold-read-cascade` case, which asks for
        // unknown_resource; watched 2026-10-20.
        if (known.length !== resourceIds.length) return 'unknown_resource';
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
            .values({
              ...each,
              leaseExpiresAt: expiryOf.get(each.id) ?? null,
              ...auditOnCreate(stamp),
              createdBy: each.accountId,
            })
            .run();
        }
        for (const row of occupancy) {
          tx.insert(claimOccupancy)
            .values({ ...row, ...auditOnCreate(stamp) })
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
        // Delegated claims under a removed one go with it (`parent_claim_id`
        // cascades), and every removed claim's occupancy rows with it.
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

  async renewLeases(personId: string, now: () => number): Promise<LeaseStanding> {
    const inForceAt = (at: number) =>
      and(eq(claim.personId, personId), isNull(claim.leaseRevokedAt), gt(claim.leaseExpiresAt, at));
    const dueAt = (at: number) =>
      and(inForceAt(at), lt(claim.leaseExpiresAt, renewalAt(at).dueBefore));
    let at = now();
    const anyDue = this.db.select({ id: claim.id }).from(claim).where(dueAt(at)).limit(1).all();
    // Read before the turn: a heartbeat within the resolution answers without
    // waiting for whatever write holds it (issue #668's lesson).
    // Proof: with this read skipped (always entering the turn), `answers a
    // heartbeat within the minute while a batch holds the write turn`
    // (claim-lease.db.test.ts) timed out (9 pass, 1 fail); watched 2026-10-23.
    if (anyDue.length > 0) {
      await this.gate.enter(async () => {
        await Promise.resolve();
        // Again inside the turn, at the turn's own instant: a sweep may have
        // released a claim, another renewal moved it, or its lease ran out
        // while this heartbeat waited behind a long write.
        // Proof: with the instant read before the turn kept here, `does not
        // renew a lease that ran out while the heartbeat waited for the turn`
        // (claim-lease.db.test.ts) renewed it (10 pass, 1 fail); watched 2026-10-23.
        at = now();
        const renewed = renewalAt(at).expiresAt;
        this.db.transaction((tx) => {
          tx.update(claim)
            .set({ leaseExpiresAt: renewed, ...auditOnUpdate({ at }) })
            .where(dueAt(at))
            .run();
        });
      });
    }
    const standing = this.db
      .select({
        leases: sql<number>`count(*)`,
        leaseExpiresAt: sql<number | null>`min(${claim.leaseExpiresAt})`,
      })
      .from(claim)
      .where(inForceAt(at))
      .get();
    if (standing === undefined) throw new Error('a count of leases answered no row');
    return { leases: standing.leases, leaseExpiresAt: standing.leaseExpiresAt };
  }

  async expiredLeasesOf(projectId: string, at: number): Promise<ExpiredLease[]> {
    const rows = await this.db
      .select({ claimId: claim.id, revokedAt: claim.leaseRevokedAt })
      .from(claim)
      .innerJoin(workItem, eq(workItem.id, claim.workItemId))
      .where(and(eq(workItem.projectId, projectId), lte(claim.leaseExpiresAt, at)))
      .orderBy(asc(claim.id));
    return rows.map(({ claimId, revokedAt }) => ({
      claimId,
      reason: revokedAt === null ? 'lease_expired' : 'credential_revoked',
    }));
  }

  async projectsWithExpiredLeases(at: number, limit: number): Promise<string[]> {
    const oldest = sql<number>`min(${claim.leaseExpiresAt})`;
    const rows = await this.db
      .select({ projectId: workItem.projectId, oldest })
      .from(claim)
      .innerJoin(workItem, eq(workItem.id, claim.workItemId))
      .where(and(isNotNull(claim.leaseExpiresAt), lte(claim.leaseExpiresAt, at)))
      .groupBy(workItem.projectId)
      // Oldest expiry first, so a project stuck at the head cannot pin the
      // tick's bound to project-id order (the sweep also catches per project).
      // Proof: ordered by project id alone, the SQLite certification's
      // `claims.lease:write-renew-expire` case failed (74 pass, 1 fail);
      // watched 2026-10-23.
      .orderBy(asc(oldest), asc(workItem.projectId))
      .limit(limit);
    return rows.map(({ projectId }) => projectId);
  }

  async moveAll(fromWorkItemId: string, toWorkItemId: string, stamp: WriteStamp): Promise<void> {
    await this.gate.enter(async () => {
      await Promise.resolve();
      this.db.transaction((tx) => {
        // An update, never a delete and insert: the `parent_claim_id` cascade
        // would take every delegated claim under a moved one.
        // Proof: with the update aimed at no row, the SQLite certification's
        // `claims.moveAll:in-place` case failed; watched 2026-10-20.
        tx.update(claim)
          .set({ workItemId: toWorkItemId, ...auditOnUpdate(stamp) })
          .where(eq(claim.workItemId, fromWorkItemId))
          .run();
        bumpWorkItems(tx, [fromWorkItemId, toWorkItemId], stamp);
      });
    });
  }
}

/**
 * Ends every lease of `personId` at `at` when the person holds no unrevoked
 * machine credential any more (`wbs-claim-leases` L8): each lease's expiry
 * moves to `at` (never later than it was) and `lease_revoked_at` is set, so no
 * renewal touches it again and the next sweep releases its claim as
 * `credential_revoked`. Run inside the revoking transaction, after the
 * revocation's own update, so a second live credential is seen or not in the
 * same snapshot. Answers how many leases it ended.
 */
export function endLeasesOfUncredentialed(
  tx: ImmediateTransaction,
  personId: string,
  at: number,
): number {
  const live = tx
    .select({ id: machineCredential.id })
    .from(machineCredential)
    .where(and(eq(machineCredential.personId, personId), isNull(machineCredential.revokedAt)))
    .limit(1)
    .all();
  // Proof: with this check removed, `keeps the leases when one of two keys is
  // revoked, and ends them with the last` (claim-lease.db.test.ts) ended them
  // at the first (9 pass, 1 fail); watched 2026-10-23.
  if (live.length > 0) return 0;
  return tx
    .update(claim)
    .set({
      leaseExpiresAt: sql`min(${claim.leaseExpiresAt}, ${at})`,
      leaseRevokedAt: at,
      ...auditOnUpdate({ at }),
    })
    .where(
      and(
        eq(claim.personId, personId),
        isNotNull(claim.leaseExpiresAt),
        isNull(claim.leaseRevokedAt),
      ),
    )
    .run().changes;
}
