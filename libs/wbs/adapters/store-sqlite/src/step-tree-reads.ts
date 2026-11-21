import { type LabelledWorkItem, readStepWriteType, type StepUsageTypeRecord } from '@wbs/core';
import { type ResolvedStep, resolveSteps } from '@wbs/domain';
import { sql } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { readSettingTargetIn } from './settings';
import { readCatalogueStepsIn } from './step';
import { captureCatalogueBindingsIn } from './step-catalogue';

/** Synchronous tree display capture; the caller owns this exact read transaction. */
export function readSqliteStepTreeIn<Row extends Pick<LabelledWorkItem, 'id' | 'parentId'>>(
  db: SQLiteBunDatabase,
  workPackageId: string,
  rows: readonly Row[],
): (Row & { readonly steps?: readonly ResolvedStep[] })[] {
  // Validate the complete reached union and its explicit values, including zero-leaf packages.
  // Proof: skipping this dependency returned tree rows after explicit values were physically removed (current-step-tree.db.test.ts).
  readCatalogueStepsIn(db, workPackageId);
  const target = readSettingTargetIn(db, { level: 'work_package', id: workPackageId }, null);
  if (target === null) return [];
  const { bindings } = captureCatalogueBindingsIn(db, target.chain.organizationId, target.chain);
  const memberships = db.all<StepUsageTypeRecord>(
    sql`SELECT m.work_item_id AS "workItemId",m.type_id AS "typeId",t.id AS "actualTypeId",tm.organization_id AS "organizationId",o.id AS "actualOrganizationId" FROM work_item_work_item_type m INNER JOIN work_item i ON i.id=m.work_item_id LEFT JOIN work_item_type t ON t.id=m.type_id LEFT JOIN work_item_type_organization tm ON tm.resource_id=m.type_id LEFT JOIN organization o ON o.id=tm.organization_id WHERE i.work_package_id=${workPackageId}`,
  );
  const typesByRow = new Map<unknown, StepUsageTypeRecord[]>();
  for (const membership of memberships)
    typesByRow.set(membership.workItemId, [
      ...(typesByRow.get(membership.workItemId) ?? []),
      membership,
    ]);
  const parents = new Set(rows.map(({ parentId }) => parentId));
  return rows.map((row) => {
    const typeState = readStepWriteType(
      target.chain.organizationId,
      row.id,
      typesByRow.get(row.id) ?? [],
    );
    return parents.has(row.id)
      ? row
      : { ...row, steps: resolveSteps(target.chain, typeState, bindings) };
  });
}
