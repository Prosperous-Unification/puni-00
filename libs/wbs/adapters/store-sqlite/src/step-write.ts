import {
  decideStepWrite,
  type PackageStepRecord,
  type PackageStepValues,
  readCatalogueId,
  readPackageStepValues,
  readStepIdentity,
  readStepWriteType,
  type StepUsageTypeRecord,
  type StepWriteDecision,
} from '@wbs/core';
import { sql } from 'drizzle-orm';

import type { Drizzle } from './db';
import { readSettingTargetIn } from './settings';
import { captureCatalogueBindingsIn } from './step-catalogue';

/** Same writer/transaction capture; no await, old-step lookup, schema fallback or fact-table scan. */
export function readSqliteStepWriteIn(
  db: Pick<Drizzle, 'all'>,
  workItemId: string,
  stepId: string,
): StepWriteDecision {
  const row = db
    .all<{ id: unknown; workPackageId: unknown; hasChildren: unknown }>(
      sql`SELECT i.id, i.work_package_id AS "workPackageId", EXISTS(SELECT 1 FROM work_item c WHERE c.parent_id=i.id) AS "hasChildren" FROM work_item i WHERE i.id=${workItemId}`,
    )
    .at(0);
  if (row?.id !== workItemId) throw new Error('step write work item is absent or inconsistent');
  if (row.hasChildren !== 0) throw new Error('step write requires a leaf work item');
  const workPackageId = readCatalogueId(row.workPackageId, 'step write package');
  const target = readSettingTargetIn(db, { level: 'work_package', id: workPackageId }, null);
  if (target === null) throw new Error('step write package is absent');
  const chain = target.chain;
  const raw = db
    .all<{
      id: unknown;
      organizationId: unknown;
      actualOrganizationId: unknown;
      code: unknown;
      name: unknown;
    }>(
      sql`SELECT d.id, d.organization_id AS "organizationId", o.id AS "actualOrganizationId", d.code, d.name FROM step_definition d LEFT JOIN organization o ON o.id=d.organization_id WHERE d.id=${stepId}`,
    )
    .at(0);
  if (raw === undefined) return { kind: 'unknown_step' };
  const owner = readCatalogueId(raw.organizationId, 'step write definition organization');
  if (raw.actualOrganizationId !== owner)
    throw new Error('step write definition organization is absent');
  if (owner !== chain.organizationId) return { kind: 'unknown_step' };
  const identity = readStepIdentity(raw);
  const memberships = db.all<StepUsageTypeRecord>(
    sql`SELECT m.work_item_id AS "workItemId", m.type_id AS "typeId", t.id AS "actualTypeId", tm.organization_id AS "organizationId", o.id AS "actualOrganizationId" FROM work_item_work_item_type m LEFT JOIN work_item_type t ON t.id=m.type_id LEFT JOIN work_item_type_organization tm ON tm.resource_id=m.type_id LEFT JOIN organization o ON o.id=tm.organization_id WHERE m.work_item_id=${workItemId}`,
  );
  const typeState = readStepWriteType(chain.organizationId, workItemId, memberships);
  const { bindings } = captureCatalogueBindingsIn(db, chain.organizationId, chain);
  const values = new Map<string, PackageStepValues>();
  const explicit = db
    .all<PackageStepRecord>(
      sql`SELECT work_package_id AS "workPackageId", step_id AS "stepId", estimate_unit AS "estimateUnit", allowance_bps AS "allowanceBps", allowance_revision AS "allowanceRevision" FROM work_package_step WHERE work_package_id=${workPackageId} AND step_id=${stepId}`,
    )
    .at(0);
  if (explicit !== undefined)
    values.set(stepId, readPackageStepValues(explicit, workPackageId, stepId));
  return decideStepWrite(chain, typeState, stepId, identity, bindings, values);
}
