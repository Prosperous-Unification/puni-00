import type {
  Demand,
  DemandStore,
  DemandWritten,
  ResourceCapacity,
  ResourceCapacityStore,
  ResourceCapacityWritten,
  WriteStamp,
} from '@wbs/core';
import { and, asc, eq } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { auditOnCreate, auditOnUpdate } from './audit';
import type { Gate } from './gate';
import { bumpWorkItems } from './revision';
import {
  workPackage,
  workPackageResourceCapacity,
  resource,
  workItem,
  workItemResourceDemand,
} from './schema';

/**
 * How many units of each resource each work package's plan may use
 * (`wbs-resources` R1): {@link CapacityRepository}'s shape for resources. No
 * revision moves on a write here, for that class's reason: a capacity is a fact
 * about the work package, not about a work item.
 */
export class ResourceCapacityRepository implements ResourceCapacityStore {
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly gate: Gate,
  ) {}

  /** One primary-key prefix read, ordered by resource id as the contract promises. */
  async listFor(workPackageId: string): Promise<ResourceCapacity[]> {
    return this.db
      .select({
        resourceId: workPackageResourceCapacity.resourceId,
        units: workPackageResourceCapacity.units,
      })
      .from(workPackageResourceCapacity)
      .where(eq(workPackageResourceCapacity.workPackageId, workPackageId))
      .orderBy(asc(workPackageResourceCapacity.resourceId));
  }

  /**
   * States or clears one pair, reading both ids inside the write's own
   * transaction so an absent one is a modeled refusal rather than a foreign
   * key failure. A clear of a pair never stated deletes nothing and is `ok`.
   *
   * Proof: with the work package read removed, the shared conformance case
   * `resourceCapacity.set:missing-reference` failed SQLite certification on the
   * insert's escaped foreign-key failure; watched 2026-10-20.
   */
  async set(
    workPackageId: string,
    resourceId: string,
    units: number | null,
    stamp: WriteStamp,
  ): Promise<ResourceCapacityWritten> {
    return await this.gate.enter(async () => {
      await Promise.resolve();
      return this.db.transaction((tx) => {
        const held = tx
          .select({ id: workPackage.id })
          .from(workPackage)
          .where(eq(workPackage.id, workPackageId))
          .all();
        if (held.length === 0) return { ok: false, reason: 'unknown_work_package' };
        const named = tx
          .select({ id: resource.id })
          .from(resource)
          .where(eq(resource.id, resourceId))
          .all();
        if (named.length === 0) return { ok: false, reason: 'unknown_resource' };
        const pair = and(
          eq(workPackageResourceCapacity.workPackageId, workPackageId),
          eq(workPackageResourceCapacity.resourceId, resourceId),
        );
        if (units === null) {
          tx.delete(workPackageResourceCapacity).where(pair).run();
          return { ok: true };
        }
        tx.insert(workPackageResourceCapacity)
          .values({ workPackageId, resourceId, units, ...auditOnCreate(stamp) })
          .onConflictDoUpdate({
            target: [
              workPackageResourceCapacity.workPackageId,
              workPackageResourceCapacity.resourceId,
            ],
            set: { units, ...auditOnUpdate(stamp) },
          })
          .run();
        return { ok: true };
      });
    });
  }
}

/**
 * What each work item needs of each resource (`wbs-resources` R1): a
 * satellite, so every write moves the work item's revision in the same
 * transaction, as an assignment's does. The rows go with their work item and
 * their resource through the foreign keys' cascades, and nothing here deletes
 * them on the way to either.
 */
export class DemandRepository implements DemandStore {
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly gate: Gate,
  ) {}

  /** Joined through the work item's work package index; ordered by work item then resource. */
  async listByWorkPackage(workPackageId: string): Promise<Demand[]> {
    return this.db
      .select({
        workItemId: workItemResourceDemand.workItemId,
        resourceId: workItemResourceDemand.resourceId,
        units: workItemResourceDemand.units,
      })
      .from(workItemResourceDemand)
      .innerJoin(workItem, eq(workItem.id, workItemResourceDemand.workItemId))
      .where(eq(workItem.workPackageId, workPackageId))
      .orderBy(asc(workItemResourceDemand.workItemId), asc(workItemResourceDemand.resourceId));
  }

  /**
   * States or removes one demand and moves the work item's revision, reading
   * both ids inside the transaction so an absent one is a modeled refusal.
   *
   * Proof: with `bumpWorkItems` removed, `moves the work item’s revision on every
   * demand write, a clear included` (resource.db.test.ts) read revision 0; with
   * both existence reads removed, the conformance case `demands.set:missing-reference`
   * failed SQLite certification; both watched 2026-10-20.
   */
  async set(
    workItemId: string,
    resourceId: string,
    units: number | null,
    stamp: WriteStamp,
  ): Promise<DemandWritten> {
    return await this.gate.enter(async () => {
      await Promise.resolve();
      return this.db.transaction((tx) => {
        const owner = tx
          .select({ id: workItem.id })
          .from(workItem)
          .where(eq(workItem.id, workItemId))
          .all();
        if (owner.length === 0) return 'unknown_work_item';
        const named = tx
          .select({ id: resource.id })
          .from(resource)
          .where(eq(resource.id, resourceId))
          .all();
        if (named.length === 0) return 'unknown_resource';
        if (units === null) {
          tx.delete(workItemResourceDemand)
            .where(
              and(
                eq(workItemResourceDemand.workItemId, workItemId),
                eq(workItemResourceDemand.resourceId, resourceId),
              ),
            )
            .run();
        } else {
          tx.insert(workItemResourceDemand)
            .values({ workItemId, resourceId, units, ...auditOnCreate(stamp) })
            .onConflictDoUpdate({
              target: [workItemResourceDemand.workItemId, workItemResourceDemand.resourceId],
              set: { units, ...auditOnUpdate(stamp) },
            })
            .run();
        }
        bumpWorkItems(tx, [workItemId], stamp);
        return 'written';
      });
    });
  }
}
