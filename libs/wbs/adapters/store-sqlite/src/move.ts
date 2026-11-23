import {
  decideMoveWrite,
  type Demand,
  type MoveWrite,
  type MoveWriteOutcome,
  readCatalogueId,
  type WorkItem,
  type WriteStamp,
} from '@wbs/core';
import { eq, sql } from 'drizzle-orm';

import { auditOnUpdate } from './audit';
import type { Drizzle } from './db';
import { bumpedWorkItem } from './revision';
import { workItem, workItemResourceDemand } from './schema';
import { readSettingTargetIn } from './settings';
import { captureFirstChildCatalogueIn } from './step-catalogue';

/** Synchronous move under the caller's actual gate and method-local rollback owner. */
export function writeMoveIn(
  db: Drizzle,
  write: MoveWrite,
  stamp: WriteStamp,
  rows: readonly WorkItem[],
): MoveWriteOutcome {
  if (
    !rows.some(
      ({ id, workPackageId }) => id === write.workItemId && workPackageId === write.workPackageId,
    )
  )
    return { kind: 'not_found' };
  if (
    write.parentId !== null &&
    !rows.some(
      ({ id, workPackageId }) => id === write.parentId && workPackageId === write.workPackageId,
    )
  )
    return { kind: 'not_found' };
  const target = readSettingTargetIn(db, { level: 'work_package', id: write.workPackageId }, null);
  if (target === null) throw new Error('move package is absent');
  const captured = captureFirstChildCatalogueIn(db, target.chain.organizationId);
  const decision = decideMoveWrite(captured, rows, write);
  if (decision.kind !== 'ready') return decision;
  const destination = decision.record.destinationStatements;
  const clearedDemands: Demand[] = [];
  if (destination !== null) {
    for (const row of db.all<{
      resourceId: unknown;
      actualResourceId: unknown;
      organizationId: unknown;
      units: unknown;
    }>(
      sql`SELECT d.resource_id AS "resourceId", r.id AS "actualResourceId", m.organization_id AS "organizationId", d.units FROM work_item_resource_demand d LEFT JOIN resource r ON r.id=d.resource_id LEFT JOIN resource_organization m ON m.resource_id=d.resource_id WHERE d.work_item_id=${destination.workItemId} ORDER BY d.resource_id COLLATE BINARY`,
    )) {
      const resourceId = readCatalogueId(row.resourceId, 'move demand resource');
      if (
        resourceId !== row.actualResourceId ||
        row.organizationId !== target.chain.organizationId ||
        typeof row.units !== 'number' ||
        !Number.isSafeInteger(row.units) ||
        row.units < 1
      )
        throw new Error('move demand resource or units are inconsistent');
      clearedDemands.push({ workItemId: destination.workItemId, resourceId, units: row.units });
    }
    db.delete(workItemResourceDemand)
      .where(eq(workItemResourceDemand.workItemId, destination.workItemId))
      .run();
    db.update(workItem)
      .set({ readiness: null, hold: null, revision: bumpedWorkItem, ...auditOnUpdate(stamp) })
      .where(eq(workItem.id, destination.workItemId))
      .run();
  }
  for (const placement of write.respaced)
    db.update(workItem)
      .set({ position: placement.position, ...auditOnUpdate(stamp) })
      .where(eq(workItem.id, placement.id))
      .run();
  db.update(workItem)
    .set({
      parentId: write.parentId,
      position: write.position,
      revision: bumpedWorkItem,
      ...auditOnUpdate(stamp),
    })
    .where(eq(workItem.id, write.workItemId))
    .run();
  return { kind: 'written', record: { ...decision.record, clearedDemands } };
}
