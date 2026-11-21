import {
  readCatalogueId,
  readPackageStepValues,
  readStepIdentity,
  type WorkPackageCrossReference,
  type WorkPackageCrossReferenceKind,
} from '@wbs/core';
import { isDependencyEndpointScope, isRelationshipType } from '@wbs/domain';
import { type SQL, sql } from 'drizzle-orm';

import type { Drizzle } from './db';

interface CapturedReference {
  /** Both literals originate exclusively in the closed query arms below. */
  readonly kind: WorkPackageCrossReferenceKind;
  readonly factTable: string | null;
  readonly id: unknown;
  readonly workItemId: unknown;
  readonly actualWorkItemId: unknown;
  readonly actualWorkPackageId: unknown;
  readonly declaredWorkPackageId: unknown;
  readonly actualPackageId: unknown;
  readonly packageOrganizationId: unknown;
  readonly actualOrganizationId: unknown;
  readonly declaredOrganizationId: unknown;
  readonly stepId: unknown;
  readonly scope: unknown;
  readonly relationshipType: unknown;
  readonly definitionId: unknown;
  readonly definitionOrganizationId: unknown;
  readonly definitionActualOrganizationId: unknown;
  readonly definitionCode: unknown;
  readonly definitionName: unknown;
  readonly valuesWorkPackageId: unknown;
  readonly valuesStepId: unknown;
  readonly estimateUnit: unknown;
  readonly allowanceBps: unknown;
  readonly allowanceRevision: unknown;
}

const POINTS = [
  ['estimate', 'estimate_step', "l.work_item_id || '/' || l.step_id"],
  ['actual', 'actual_step', "l.work_item_id || '/' || l.step_id"],
  ['step_progress', 'step_progress_step', "l.work_item_id || '/' || l.step_id"],
  [
    'step_measure',
    'step_measure_step',
    "l.work_item_id || '/' || l.step_id || '/' || coalesce(l.metric,l.measure_id)",
  ],
  [
    'measure_estimate',
    'measure_estimate_step',
    "l.work_item_id || '/' || l.step_id || '/' || l.measure_key",
  ],
  [
    'step_node_attempt',
    'step_node_attempt_step',
    "l.work_item_id || '/' || l.step_id || '/' || l.attempt_number",
  ],
  [
    'step_node_attempt_issued',
    'step_node_attempt_issued_step',
    "l.work_item_id || '/' || l.step_id",
  ],
  ['assignment', 'assignment_step', "l.work_item_id || '/' || l.step_id || '/' || l.person_id"],
  ['claim', 'claim_step', 'l.id'],
  ['step_blockage', 'step_blockage_step', "l.work_item_id || '/' || l.step_id"],
  ['step_parallel', 'step_parallel_step', "l.work_item_id || '/' || l.step_id"],
] as const;

/** Builds only the fixed internal arms; no caller-controlled identifier or SQL expression enters it. */
function captureFact(
  table: string,
  kind: WorkPackageCrossReferenceKind,
  id: string,
  workItem: string,
  declaredPackage: string,
  declaredOrganization: string,
  scope: string,
  step: string,
  relationshipType: string,
  selected: SQL,
): SQL {
  return sql`SELECT ${kind} AS kind,${table} AS "factTable",${sql.raw(id)} AS id,
      ${sql.raw(workItem)} AS "workItemId",w.id AS "actualWorkItemId",
      w.work_package_id AS "actualWorkPackageId",${sql.raw(declaredPackage)} AS "declaredWorkPackageId",
      package.id AS "actualPackageId",mapping.organization_id AS "packageOrganizationId",
      actual_organization.id AS "actualOrganizationId",${sql.raw(declaredOrganization)} AS "declaredOrganizationId",
      ${sql.raw(step)} AS "stepId",${sql.raw(scope)} AS scope,${sql.raw(relationshipType)} AS "relationshipType",
      definition.id AS "definitionId",definition.organization_id AS "definitionOrganizationId",
      definition_organization.id AS "definitionActualOrganizationId",
      definition.code AS "definitionCode",definition.name AS "definitionName",
      package_values.work_package_id AS "valuesWorkPackageId",package_values.step_id AS "valuesStepId",
      package_values.estimate_unit AS "estimateUnit",package_values.allowance_bps AS "allowanceBps",
      package_values.allowance_revision AS "allowanceRevision"
    FROM ${sql.raw(table)} AS l
    LEFT JOIN work_item AS w ON w.id=${sql.raw(workItem)}
    LEFT JOIN work_package AS package ON package.id=w.work_package_id
    LEFT JOIN work_package_organization AS mapping ON mapping.resource_id=package.id
    LEFT JOIN organization AS actual_organization ON actual_organization.id=mapping.organization_id
    -- Proof: C03 changed this LEFT join to INNER; the missing-definition estimate
    -- vanished instead of refusing. Selected baseline/after passed1 each.
    LEFT JOIN step_definition AS definition ON definition.id=${sql.raw(step)}
    LEFT JOIN organization AS definition_organization ON definition_organization.id=definition.organization_id
    LEFT JOIN work_package_step AS package_values ON package_values.work_package_id=${sql.raw(declaredPackage)}
      AND package_values.step_id=${sql.raw(step)}
    WHERE ${selected}`;
}

/** Indexed incident selection retains actual endpoint placement as well as declared package identity. */
function selectRelationships(
  table: 'typed_dependency' | 'external_dependency',
  workPackageId: string,
): SQL {
  const declared =
    table === 'typed_dependency'
      ? sql`SELECT id FROM typed_dependency WHERE work_package_id=${workPackageId}`
      : sql`SELECT id FROM external_dependency WHERE predecessor_work_package_id=${workPackageId}
      UNION SELECT id FROM external_dependency WHERE successor_work_package_id=${workPackageId}`;
  return sql`l.id IN (${declared}
    UNION SELECT id FROM ${sql.raw(table)} WHERE predecessor_work_item_id IN
      (SELECT id FROM work_item WHERE work_package_id=${workPackageId})
    UNION SELECT id FROM ${sql.raw(table)} WHERE successor_work_item_id IN
      (SELECT id FROM work_item WHERE work_package_id=${workPackageId}))`;
}

function readCapturedReference(
  row: CapturedReference,
  organizationId: string,
): WorkPackageCrossReference | undefined {
  const id = readCatalogueId(row.id, 'cross-reference identity');
  if (row.factTable === null) return { kind: row.kind, id };
  const workItemId = readCatalogueId(row.workItemId, 'cross-reference work item');
  if (row.actualWorkItemId !== workItemId)
    throw new Error('cross-reference work item is absent or malformed');
  const actualPackage = readCatalogueId(row.actualWorkPackageId, 'cross-reference actual package');
  if (row.actualPackageId !== actualPackage)
    throw new Error('cross-reference package is absent or malformed');
  const actualOrganization = readCatalogueId(
    row.packageOrganizationId,
    'cross-reference organization',
  );
  if (row.actualOrganizationId !== actualOrganization)
    throw new Error('cross-reference organization is absent or malformed');
  const declaredPackage = readCatalogueId(
    row.declaredWorkPackageId,
    'cross-reference declared package',
  );
  const isRelationship =
    row.factTable === 'typed_dependency' || row.factTable === 'external_dependency';
  if (isRelationship) {
    if (!isDependencyEndpointScope(row.scope) || !isRelationshipType(row.relationshipType))
      throw new Error('cross-reference relationship scope or type is malformed');
    if (declaredPackage !== actualPackage || actualOrganization !== organizationId)
      return { kind: 'dependency_endpoint', id };
    if (row.factTable === 'external_dependency') {
      const declaredOrganization = readCatalogueId(
        row.declaredOrganizationId,
        'external relationship organization',
      );
      if (declaredOrganization !== actualOrganization) return { kind: 'dependency_endpoint', id };
    }
    if (row.scope === 'whole') {
      if (row.stepId !== null) throw new Error('cross-reference whole endpoint carries a step');
      return undefined;
    }
  } else if (
    declaredPackage !== actualPackage ||
    actualOrganization !== organizationId ||
    row.scope !== 'point'
  ) {
    throw new Error('cross-reference point package attribution is inconsistent');
  }
  const stepId = readCatalogueId(row.stepId, 'cross-reference step');
  if (row.definitionId !== stepId)
    throw new Error('cross-reference definition is absent or malformed');
  const definition = readStepIdentity({
    id: row.definitionId,
    organizationId: row.definitionOrganizationId,
    code: row.definitionCode,
    name: row.definitionName,
  });
  if (row.definitionActualOrganizationId !== definition.organizationId)
    throw new Error('cross-reference definition organization is absent or malformed');
  // Proof: C02 omitted this foreign-definition comparison; the actual estimate
  // crossing array became empty. Selected baseline/after passed1 each.
  if (definition.organizationId !== actualOrganization) return { kind: row.kind, id };
  // Proof: C01 omitted this whole values decoder; the actual missing estimate pair
  // resolved instead of refusing. Selected baseline/after passed1 each.
  readPackageStepValues(
    {
      workPackageId: row.valuesWorkPackageId,
      stepId: row.valuesStepId,
      estimateUnit: row.estimateUnit,
      allowanceBps: row.allowanceBps,
      allowanceRevision: row.allowanceRevision,
    },
    declaredPackage,
    stepId,
  );
  return undefined;
}

/**
 * Captures the current thirteen fact families and the unchanged non-step arms in ONE
 * statement on the supplied connection/snapshot. Point identity belongs to the actual
 * work item's package plus shared definition, never to another package's matching id.
 * Both explicit relationship ends remain incident even when a corrupt declared package
 * differs from the actual work item. Whole/null and parent-issued history acquire no
 * fabricated point or leaf applicability gate. All nullable metadata is captured before
 * decoding, so a missing definition, organization or package-value row cannot vanish.
 * Foreign definitions return precise crossing kinds; missing explicit values use SC21's
 * WorkPackageStepMissing. This read owns no connection, transaction, permission, schema
 * fallback, state mutation or new authority. Historical pre117 incoming-step proofs do
 * not certify this catalogue implementation; new finite omission observations remain owed.
 */
export function readWorkPackageCrossReferencesIn(
  db: Pick<Drizzle, 'all'>,
  workPackageId: string,
  organizationId: string,
  nonStepArms: SQL,
): readonly WorkPackageCrossReference[] {
  const arms: SQL[] = POINTS.map(([table, kind, id]) =>
    captureFact(
      table,
      kind,
      id,
      'l.work_item_id',
      'w.work_package_id',
      'NULL',
      "'point'",
      'l.step_id',
      'NULL',
      table === 'claim'
        ? sql`w.work_package_id=${workPackageId} AND l.step_id IS NOT NULL`
        : sql`w.work_package_id=${workPackageId}`,
    ),
  );
  for (const table of ['typed_dependency', 'external_dependency'] as const) {
    const kind =
      table === 'typed_dependency' ? 'typed_dependency_step' : 'external_dependency_step';
    for (const side of ['predecessor', 'successor'] as const) {
      arms.push(
        captureFact(
          table,
          kind,
          `l.id || '/${side}'`,
          `l.${side}_work_item_id`,
          table === 'typed_dependency' ? 'l.work_package_id' : `l.${side}_work_package_id`,
          table === 'external_dependency' ? 'l.organization_id' : 'NULL',
          `l.${side}_scope`,
          `l.${side}_step_id`,
          'l.type',
          selectRelationships(table, workPackageId),
        ),
      );
    }
  }
  arms.push(sql`SELECT crossing.kind,NULL AS "factTable",crossing.id,NULL AS "workItemId",NULL AS "actualWorkItemId",
    NULL AS "actualWorkPackageId",NULL AS "declaredWorkPackageId",NULL AS "actualPackageId",
    NULL AS "packageOrganizationId",NULL AS "actualOrganizationId",NULL AS "declaredOrganizationId",
    NULL AS "stepId",NULL AS scope,NULL AS "relationshipType",NULL AS "definitionId",
    NULL AS "definitionOrganizationId",NULL AS "definitionActualOrganizationId",NULL AS "definitionCode",
    NULL AS "definitionName",NULL AS "valuesWorkPackageId",NULL AS "valuesStepId",NULL AS "estimateUnit",
    NULL AS "allowanceBps",NULL AS "allowanceRevision" FROM (${nonStepArms}) AS crossing`);
  // kind/factTable are exact literals from these closed arms, not values read from stored rows.
  // Every stored scalar crosses the unknown-valued decoder above before being admitted.
  const rows = db.all<CapturedReference>(sql.join(arms, sql` UNION ALL `));
  const crossings: WorkPackageCrossReference[] = [];
  for (const row of rows) {
    const crossing = readCapturedReference(row, organizationId);
    if (crossing !== undefined) crossings.push(crossing);
  }
  return crossings;
}
