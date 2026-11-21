import { isEstimateUnit, type WorkPackageChain } from '@wbs/domain';
import { sql } from 'drizzle-orm';

import type { Drizzle } from './db';
import { workPackageStep } from './schema';
import { captureStepRetirementsIn } from './step-retirement';

/** Selected binding metadata and defaults remain raw until this borrowed writer validates them. */
interface PackageStepDefaultRecord {
  readonly binding_id: unknown;
  readonly binding_organization_id: unknown;
  readonly binding_step_id: unknown;
  readonly binding_type_id: unknown;
  readonly actual_type_id: unknown;
  readonly type_organization_id: unknown;
  readonly definition_id: unknown;
  readonly definition_organization_id: unknown;
  readonly estimate_unit: unknown;
  readonly allowance_bps: unknown;
  readonly existing_step_id: unknown;
}

/**
 * Materializes the any-type binding union for a package on its existing writer.
 * The chain is the actual target already decoded by readSettingTargetIn on this
 * same transaction. Reached binding/definition/type ownership is checked before
 * deduplication; defaults are decoded only for missing explicit package rows.
 * Existing rows, including authored values and allowance revisions, are never
 * updated. Each inserted row copies the current definition defaults with revision0.
 * Required119 metadata is captured on this supplied writer. No leaf/type assignment, connection, transaction or legacy path
 * is acquired here. A scope with no reaching binding legitimately inserts no rows.
 * @throws for corrupt reached metadata or defaults; the existing owner rolls back
 * the complete package birth together with mapping, grants, settings and allocator.
 */
export function materializePackageStepsIn(db: Drizzle, chain: WorkPackageChain): void {
  const retirements = captureStepRetirementsIn(db, chain.organizationId);
  // Proof: U0 coerced raw hours to workdays in this query; "catalogue package birth
  // refuses an unknown definition default estimate unit and rolls back its complete
  // store" first observed rejected:false (47 expects), before/after passed (50 each).
  // This is raw-unit forwarding evidence, not a literal unit-check omission;
  // the fault's diagnostic and full-state assertions were unreached.
  // Proof: A0 coerced raw BLOB353030 to integer500 in this query; "catalogue package
  // birth refuses a BLOB definition default allowance before coercion and rolls back
  // its complete store" first observed rejected:false (47 expects), before/after
  // passed (50 each). Raw-allowance forwarding only: no independent integer/range
  // predicate or SQLite CHECK necessity; diagnostic/full-state fault tails unreached.
  const rows = db.all<PackageStepDefaultRecord>(sql`
    SELECT binding.id AS binding_id, binding.organization_id AS binding_organization_id,
           binding.step_id AS binding_step_id, binding.work_item_type_id AS binding_type_id,
           actual_type.id AS actual_type_id, type_mapping.organization_id AS type_organization_id,
           definition.id AS definition_id, definition.organization_id AS definition_organization_id,
           definition.estimate_unit, definition.default_allowance_bps AS allowance_bps,
           package_values.step_id AS existing_step_id
    FROM step_binding binding
    LEFT JOIN step_definition definition ON definition.id=binding.step_id
    LEFT JOIN work_item_type actual_type ON actual_type.id=binding.work_item_type_id
    LEFT JOIN work_item_type_organization type_mapping ON type_mapping.resource_id=binding.work_item_type_id
    LEFT JOIN work_package_step package_values
      ON package_values.work_package_id=${chain.workPackageId} AND package_values.step_id=binding.step_id
    WHERE (binding.scope_kind='organization' AND binding.scope_id=${chain.organizationId})
       OR (binding.scope_kind='space' AND binding.scope_id=${chain.spaceId})
       OR (binding.scope_kind='project' AND binding.scope_id=${chain.projectId})
    ORDER BY binding.id COLLATE BINARY
  `);
  const missing = new Map<string, typeof workPackageStep.$inferInsert>();
  for (const row of rows) {
    if (typeof row.binding_step_id === 'string' && retirements.has(row.binding_step_id))
      throw new Error('package step materialization names a retired definition');
    // Proof: B0 omitted this whole check; "catalogue package birth refuses a selected
    // binding with BLOB identity and rolls back its complete store" first observed
    // rejected:false (47 expects). Before/after passed (50 each); this proves the
    // whole check for that BLOB premise, not each conjunct or the unreached rollback tail.
    if (
      typeof row.binding_id !== 'string' ||
      row.binding_id === '' ||
      row.binding_organization_id !== chain.organizationId
    )
      throw new Error(
        'package step materialization has an absent binding or inconsistent organization',
      );
    if (
      typeof row.definition_id !== 'string' ||
      row.definition_id === '' ||
      row.definition_id !== row.binding_step_id ||
      row.definition_organization_id !== chain.organizationId
    )
      throw new Error('package step materialization has an absent or inconsistent definition');
    // Proof: T0 omitted this whole check; "catalogue package birth refuses a selected
    // foreign type attribution and rolls back its complete store" first observed
    // rejected:false (48 expects). Before/after passed (51 each); no per-conjunct
    // necessity or fault-time diagnostic/full-state tail is claimed.
    if (
      row.binding_type_id !== null &&
      (typeof row.binding_type_id !== 'string' ||
        row.binding_type_id === '' ||
        row.actual_type_id !== row.binding_type_id ||
        row.type_organization_id !== chain.organizationId)
    )
      throw new Error('package step materialization has an absent or inconsistent type');
    if (row.existing_step_id !== null) {
      if (row.existing_step_id !== row.definition_id)
        throw new Error('package step materialization has an inconsistent existing identity');
      continue;
    }
    if (!isEstimateUnit(row.estimate_unit))
      throw new Error('package step materialization has a malformed default estimate unit');
    if (
      typeof row.allowance_bps !== 'number' ||
      !Number.isSafeInteger(row.allowance_bps) ||
      row.allowance_bps < 0 ||
      row.allowance_bps > 100000
    )
      throw new Error('package step materialization has a malformed default allowance');
    missing.set(row.definition_id, {
      workPackageId: chain.workPackageId,
      stepId: row.definition_id,
      estimateUnit: row.estimate_unit,
      allowancePercent: row.allowance_bps / 100,
      allowanceRevision: 0,
    });
  }
  // A fixed-size insert per definition avoids a bind count proportional to the union.
  for (const values of missing.values()) db.insert(workPackageStep).values(values).run();
}
