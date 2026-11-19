import {
  encodeStepUsageLink,
  type PackageStepRecord,
  readCatalogueId,
  readPackageStepValues,
  readStepUsageClaims,
  readStepUsageFacts,
  readStoredIssued,
  readStepUsagePackages,
  type StepFactKind,
  type StepIdentity,
  type StepUsageClaimRecord,
  type StepUsageFactRecord,
  type StepUsageTypeRecord,
  type StepUsageWorkItemRecord,
} from '@wbs/core';
import { isRelationshipType, type StepFactTable, type WorkPackageChain } from '@wbs/domain';
import { sql } from 'drizzle-orm';

import type { Drizzle } from './db';
import { STEP_FACT_REGISTRY } from './step-catalogue-report-capture';

const FACT_KIND: Readonly<Record<StepFactTable, StepFactKind>> = {
  estimate: 'estimate',
  actual: 'actual',
  step_progress: 'progress',
  step_measure: 'measure',
  measure_estimate: 'measure_estimate',
  step_node_attempt: 'attempt',
  step_node_attempt_issued: 'attempt_issued',
  assignment: 'assignment',
  claim: 'claim',
  step_blockage: 'blockage',
  step_parallel: 'parallel',
  typed_dependency: 'typed_dependency',
  external_dependency: 'external_dependency',
};

/**
 * Actual117 protected keys from the supplied writer; old step/report capture is never used.
 * Constant-bind JSON membership retains both incoming and outgoing external endpoints.
 * Whole endpoints and subtree reservations retain null; lease/expiry/revocation/counter
 * payloads never filter a stored fact out. Scalar/relational decoding is shared with memory.
 */
export function captureSqliteStepUsage(
  db: Drizzle,
  organizationId: string,
  chains: readonly WorkPackageChain[],
  definitions: ReadonlyMap<string, StepIdentity>,
) {
  const packageIds = JSON.stringify(chains.map(({ workPackageId }) => workPackageId));
  const workItemRows = db.all<StepUsageWorkItemRecord>(
    sql`SELECT i.id, i.work_package_id AS "workPackageId", i.parent_id AS "parentId", i.name, i.position FROM work_item i WHERE i.work_package_id IN (SELECT value FROM json_each(${packageIds}))`,
  );
  const memberships =
    db.all<StepUsageTypeRecord>(sql`SELECT m.work_item_id AS "workItemId", m.type_id AS "typeId", t.id AS "actualTypeId", tm.organization_id AS "organizationId", o.id AS "actualOrganizationId"
    FROM work_item_work_item_type m LEFT JOIN work_item i ON i.id=m.work_item_id LEFT JOIN work_item_type t ON t.id=m.type_id LEFT JOIN work_item_type_organization tm ON tm.resource_id=m.type_id LEFT JOIN organization o ON o.id=tm.organization_id
    WHERE i.work_package_id IN (SELECT value FROM json_each(${packageIds})) OR i.id IS NULL`);
  const packages = readStepUsagePackages(chains, workItemRows, memberships);
  const values = db.all<PackageStepRecord>(
    sql`SELECT work_package_id AS "workPackageId", step_id AS "stepId", estimate_unit AS "estimateUnit", allowance_bps AS "allowanceBps", allowance_revision AS "allowanceRevision" FROM work_package_step WHERE work_package_id IN (SELECT value FROM json_each(${packageIds}))`,
  );
  const links = new Set<string>();
  for (const row of values) {
    const packageId = readCatalogueId(row.workPackageId, 'usage package value'),
      stepId = readCatalogueId(row.stepId, 'usage package step');
    readPackageStepValues(row, packageId, stepId);
    links.add(encodeStepUsageLink(packageId, stepId));
  }
  const facts: StepUsageFactRecord[] = [];
  for (const entry of STEP_FACT_REGISTRY) {
    const table = sql.raw('"' + entry.table + '"');
    if (entry.table === 'claim') {
      const claims =
        db.all<StepUsageClaimRecord>(sql`SELECT f.id, i.work_package_id AS "workPackageId", f.work_item_id AS "workItemId", f.step_id AS "stepId", f.parent_claim_id AS "parentClaimId", f.person_id AS "personId", p.id AS "actualPersonId", pm.organization_id AS "personOrganizationId", o.id AS "actualPersonOrganizationId", f.created_by AS "accountId", u.id AS "actualAccountId", f.run_id AS "runId", f.created_at AS "claimedAt", f.lease_expires_at AS "leaseExpiresAt", f.lease_revoked_at AS "leaseRevokedAt"
        FROM claim f LEFT JOIN work_item i ON i.id=f.work_item_id LEFT JOIN person p ON p.id=f.person_id LEFT JOIN person_organization pm ON pm.resource_id=f.person_id LEFT JOIN organization o ON o.id=pm.organization_id LEFT JOIN users u ON u.id=f.created_by
        WHERE i.work_package_id IN (SELECT value FROM json_each(${packageIds})) OR i.id IS NULL`);
      facts.push(...readStepUsageClaims(packages, claims));
      continue;
    }
    if (entry.table === 'step_node_attempt_issued') {
      const selected = db.all<{ workPackageId: unknown; workItemId: unknown; stepId: unknown; issued: unknown }>(
        sql`SELECT i.work_package_id AS "workPackageId", f.work_item_id AS "workItemId", f.step_id AS "stepId", f.issued FROM step_node_attempt_issued f LEFT JOIN work_item i ON i.id=f.work_item_id WHERE i.work_package_id IN (SELECT value FROM json_each(${packageIds})) OR i.id IS NULL`,
      );
      for (const row of selected) {
        const mark = readStoredIssued(row);
        facts.push({ kind: 'attempt_issued', scope: 'allocator', workPackageId: row.workPackageId, workItemId: mark.workItemId, stepId: mark.stepId });
      }
      continue;
    }
    if (entry.kind === 'point') {
      const selected = db.all<{ workPackageId: unknown; workItemId: unknown; stepId: unknown }>(
        sql`SELECT i.work_package_id AS "workPackageId", f.work_item_id AS "workItemId", f.step_id AS "stepId" FROM ${table} f LEFT JOIN work_item i ON i.id=f.work_item_id WHERE i.work_package_id IN (SELECT value FROM json_each(${packageIds})) OR i.id IS NULL`,
      );
      for (const row of selected)
        facts.push({ kind: FACT_KIND[entry.table], scope: 'node', ...row });
      continue;
    }
    const predecessorPackage =
      entry.kind === 'external'
        ? sql.raw('f.predecessor_work_package_id')
        : sql.raw('f.work_package_id');
    const successorPackage =
      entry.kind === 'external'
        ? sql.raw('f.successor_work_package_id')
        : sql.raw('f.work_package_id');
    const owner = entry.kind === 'external' ? sql.raw('f.organization_id') : sql`${organizationId}`;
    const selected = db.all<{
      organizationId: unknown;
      type: unknown;
      predecessorPackage: unknown;
      successorPackage: unknown;
      predecessorItem: unknown;
      successorItem: unknown;
      predecessorScope: unknown;
      successorScope: unknown;
      predecessorStep: unknown;
      successorStep: unknown;
    }>(sql`SELECT ${owner} AS "organizationId", f.type, ${predecessorPackage} AS "predecessorPackage", ${successorPackage} AS "successorPackage",
      f.predecessor_work_item_id AS "predecessorItem", f.successor_work_item_id AS "successorItem", f.predecessor_scope AS "predecessorScope", f.successor_scope AS "successorScope", f.predecessor_step_id AS "predecessorStep", f.successor_step_id AS "successorStep"
      FROM ${table} f WHERE ${predecessorPackage} IN (SELECT value FROM json_each(${packageIds})) OR ${successorPackage} IN (SELECT value FROM json_each(${packageIds}))`);
    for (const row of selected) {
      if (row.organizationId !== organizationId || !isRelationshipType(row.type))
        throw new Error('step usage dependency ownership or type is inconsistent');
      if (entry.kind === 'external' && row.predecessorPackage === row.successorPackage)
        throw new Error('step usage external dependency has equal packages');
      facts.push({
        kind: FACT_KIND[entry.table],
        workPackageId: row.predecessorPackage,
        workItemId: row.predecessorItem,
        scope: row.predecessorScope,
        stepId: row.predecessorStep,
      });
      facts.push({
        kind: FACT_KIND[entry.table],
        workPackageId: row.successorPackage,
        workItemId: row.successorItem,
        scope: row.successorScope,
        stepId: row.successorStep,
      });
    }
  }
  return { packages, facts: readStepUsageFacts(packages, definitions, links, facts) };
}
