import {
  projectStepOrders,
  readStepWriteType,
  type StepUsageTypeRecord,
  type WorkItemStepProjection,
} from '@wbs/core';
import { resolveSteps } from '@wbs/domain';
import { sql } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { readSettingTargetIn } from './settings';
import { readCatalogueStepsIn } from './step';
import { captureCatalogueBindingsIn } from './step-catalogue';

/** Required candidate inventory on the caller's exact transaction; actual parent types remain available. */
export function readSqliteStepOrderProjectionIn(
  db: SQLiteBunDatabase,
  workPackageId: string,
  projection: WorkItemStepProjection,
) {
  const target = readSettingTargetIn(db, { level: 'work_package', id: workPackageId }, null);
  if (target === null) throw new Error('step projection work package is absent');
  const steps = readCatalogueStepsIn(db, workPackageId);
  const { bindings } = captureCatalogueBindingsIn(db, target.chain.organizationId, target.chain);
  const ids = JSON.stringify(projection.rows.map((row) => row.id));
  const stored = db.all<{ id: string; workPackageId: string }>(
    sql`SELECT id,work_package_id AS "workPackageId" FROM work_item WHERE work_package_id=${workPackageId} OR id IN (SELECT value FROM json_each(${ids}))`,
  );
  const memberships = db.all<StepUsageTypeRecord>(
    sql`SELECT m.work_item_id AS "workItemId",m.type_id AS "typeId",t.id AS "actualTypeId",tm.organization_id AS "organizationId",o.id AS "actualOrganizationId" FROM work_item_work_item_type m INNER JOIN work_item i ON i.id=m.work_item_id LEFT JOIN work_item_type t ON t.id=m.type_id LEFT JOIN work_item_type_organization tm ON tm.resource_id=m.type_id LEFT JOIN organization o ON o.id=tm.organization_id WHERE i.work_package_id=${workPackageId}`,
  );
  const typesByRow = new Map<unknown, StepUsageTypeRecord[]>();
  for (const membership of memberships)
    typesByRow.set(membership.workItemId, [
      ...(typesByRow.get(membership.workItemId) ?? []),
      membership,
    ]);
  const types = new Map(
    stored
      .filter((row) => row.workPackageId === workPackageId)
      .map((row) => [
        row.id,
        readStepWriteType(target.chain.organizationId, row.id, typesByRow.get(row.id) ?? []),
      ]),
  );
  const proposedIds = JSON.stringify(
    projection.directTypes.flatMap((selection) => [...selection.typeIds]),
  );
  const proposedTypes = db.all<StepUsageTypeRecord>(
    sql`SELECT selected.value AS "typeId",t.id AS "actualTypeId",tm.organization_id AS "organizationId",o.id AS "actualOrganizationId" FROM json_each(${proposedIds}) selected LEFT JOIN work_item_type t ON t.id=selected.value LEFT JOIN work_item_type_organization tm ON tm.resource_id=t.id LEFT JOIN organization o ON o.id=tm.organization_id`,
  );
  const byType = new Map(proposedTypes.map((type) => [type.typeId, type]));
  return projectStepOrders(
    {
      workPackageId,
      owners: new Map(stored.map((row) => [row.id, row.workPackageId])),
      types,
      steps,
      readProposedTypes: (workItemId, typeIds) =>
        readStepWriteType(
          target.chain.organizationId,
          workItemId,
          typeIds.map((typeId) => ({
            workItemId,
            typeId,
            actualTypeId: byType.get(typeId)?.actualTypeId,
            organizationId: byType.get(typeId)?.organizationId,
            actualOrganizationId: byType.get(typeId)?.actualOrganizationId,
          })),
        ),
      resolve: (type) => resolveSteps(target.chain, type, bindings),
    },
    projection,
  );
}
