import {
  isDependencyEndpointScope,
  isRelationshipType,
  type MigrationPackage,
  type MigrationStep,
  type MigrationStepFact,
  type MigrationWorkItem,
  type StepFactTable,
  type StepMigrationCapture,
  type StepReportCell,
  type StepReportStorage,
} from '@wbs/domain';
import { sql } from 'drizzle-orm';

import type { Drizzle } from './db';

/** Actual current step-FK inventory: eleven single columns plus four dependency endpoints. */
export const STEP_FACT_REGISTRY = [
  { table: 'estimate', kind: 'point', columns: ['step_id'], nullable: false },
  { table: 'actual', kind: 'point', columns: ['step_id'], nullable: false },
  { table: 'step_progress', kind: 'point', columns: ['step_id'], nullable: false },
  { table: 'step_measure', kind: 'point', columns: ['step_id'], nullable: false },
  { table: 'measure_estimate', kind: 'point', columns: ['step_id'], nullable: false },
  { table: 'step_node_attempt', kind: 'point', columns: ['step_id'], nullable: false },
  { table: 'step_node_attempt_issued', kind: 'point', columns: ['step_id'], nullable: false },
  { table: 'assignment', kind: 'point', columns: ['step_id'], nullable: false },
  { table: 'claim', kind: 'point', columns: ['step_id'], nullable: true },
  { table: 'step_blockage', kind: 'point', columns: ['step_id'], nullable: false },
  { table: 'step_parallel', kind: 'point', columns: ['step_id'], nullable: false },
  {
    table: 'typed_dependency',
    kind: 'internal',
    columns: ['predecessor_step_id', 'successor_step_id'],
  },
  {
    table: 'external_dependency',
    kind: 'external',
    columns: ['predecessor_step_id', 'successor_step_id'],
  },
] as const satisfies readonly {
  readonly table: StepFactTable;
  readonly kind: 'point' | 'internal' | 'external';
  readonly columns: readonly string[];
  readonly nullable?: boolean;
}[];

interface StoredStep {
  readonly id: unknown;
  readonly workPackageId: unknown;
  readonly name: unknown;
  readonly position: unknown;
  readonly code: unknown;
  readonly estimateUnit: unknown;
  readonly allowanceBps: unknown;
  readonly allowanceRevision: unknown;
  readonly createdAt: unknown;
  readonly updatedAt: unknown;
  readonly createdBy: unknown;
  readonly packageIdentity: unknown;
  readonly projectId: unknown;
  readonly organizationId: unknown;
  readonly projectIdentity: unknown;
  readonly parentOrganizationId: unknown;
  readonly organizationIdentity: unknown;
}

function readText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new Error('step-report ' + field + ' is not nonempty text');
  return value;
}

function readInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    throw new Error('step-report ' + field + ' is not an integer');
  return value;
}

function readStep(row: StoredStep): MigrationStep {
  const id = readText(row.id, 'step identity');
  const workPackageId = readText(row.workPackageId, 'package identity');
  const organizationId = readText(row.organizationId, 'organization mapping');
  const projectId = readText(row.projectId, 'parent identity');
  if (row.packageIdentity !== workPackageId || row.projectIdentity !== projectId)
    throw new Error('step-report missing package or parent for ' + id);
  if (row.organizationIdentity !== organizationId || row.parentOrganizationId !== organizationId)
    throw new Error('step-report inconsistent organization for ' + id);
  if (row.estimateUnit !== 'workdays' && row.estimateUnit !== 'minutes')
    throw new Error('step-report malformed estimate unit for ' + id);
  const allowanceBps = readInteger(row.allowanceBps, 'allowance');
  const allowanceRevision = readInteger(row.allowanceRevision, 'allowance revision');
  if (allowanceBps < 0 || allowanceBps > 100000 || allowanceRevision < 0)
    throw new Error('step-report malformed allowance for ' + id);
  return {
    id,
    workPackageId,
    projectId,
    organizationId,
    name: readText(row.name, 'name'),
    position: readInteger(row.position, 'position'),
    code: row.code === null ? null : readText(row.code, 'code'),
    estimateUnit: row.estimateUnit,
    allowanceBps,
    allowanceRevision,
    createdAt: row.createdAt === null ? null : readInteger(row.createdAt, 'creation time'),
    updatedAt: row.updatedAt === null ? null : readInteger(row.updatedAt, 'update time'),
    createdBy: row.createdBy === null ? null : readText(row.createdBy, 'creation actor'),
  };
}

function readStorage(db: Drizzle, table: string): StepReportStorage {
  const rows = db
    .all<Record<string, unknown>>(sql.raw('SELECT * FROM "' + table.replaceAll('"', '""') + '"'))
    .map((row) => {
      const cells: Record<string, StepReportCell> = {};
      for (const column of Object.keys(row).sort()) {
        const value = row[column];
        if (
          value !== null &&
          typeof value !== 'string' &&
          (typeof value !== 'number' || !Number.isFinite(value))
        )
          throw new Error('step-report malformed ' + table + '.' + column);
        cells[column] = value;
      }
      return cells;
    });
  rows.sort((left, right) =>
    Buffer.compare(Buffer.from(JSON.stringify(left)), Buffer.from(JSON.stringify(right))),
  );
  return { table, rows };
}

function readNullableText(value: unknown, field: string): string | null {
  return value === null ? null : readText(value, field);
}

function selectIdentity<T>(selected: ReadonlyMap<string, T>, id: string, field: string): T {
  const value = selected.get(id);
  if (value === undefined) throw new Error('step-report missing ' + field + ' ' + id);
  return value;
}

/**
 * Captures real rows only on the supplied writer snapshot. All participating cells are retained
 * canonically for the fingerprint, while classification receives precise decoded associations.
 * No store, connection, callback, authority default or historical reader is constructed.
 * Missing/malformed references throw; an existing step in another package is a reported foreign
 * fact, not a silently filtered row. Nullable whole endpoints remain explicit null identities.
 */
export function captureStepMigration(db: Drizzle): StepMigrationCapture {
  const organizations = readStorage(db, 'organization');
  const projects = readStorage(db, 'project');
  const packages = readStorage(db, 'work_package');
  const packageMappings = readStorage(db, 'work_package_organization');
  const items = readStorage(db, 'work_item');
  const types = readStorage(db, 'work_item_type');
  const typeMappings = readStorage(db, 'work_item_type_organization');
  const memberships = readStorage(db, 'work_item_work_item_type');
  const factTables = STEP_FACT_REGISTRY.map((entry) => ({
    entry,
    storage: readStorage(db, entry.table),
  }));
  const organizationIds = new Set(
    organizations.rows.map((row) => readText(row['id'], 'organization identity')),
  );
  const projectIds = new Map(
    projects.rows.map((row) => {
      const id = readText(row['id'], 'project identity'),
        organizationId = readText(row['organization_id'], 'project organization');
      if (!organizationIds.has(organizationId))
        throw new Error('step-report missing project organization ' + id);
      return [id, { id, organizationId }] as const;
    }),
  );
  const ownership = new Map(
    packageMappings.rows.map(
      (row) =>
        [
          readText(row['resource_id'], 'mapped package identity'),
          readText(row['organization_id'], 'organization mapping'),
        ] as const,
    ),
  );
  const capturedPackages: MigrationPackage[] = packages.rows.map((row) => {
    const id = readText(row['id'], 'package identity'),
      projectId = readText(row['project_id'], 'parent identity');
    const organizationId = readText(ownership.get(id), 'organization mapping');
    const project = projectIds.get(projectId);
    if (project === undefined) throw new Error('step-report missing package or parent for ' + id);
    if (!organizationIds.has(organizationId) || project.organizationId !== organizationId)
      throw new Error('step-report inconsistent organization for ' + id);
    return { id, projectId, organizationId };
  });
  const packageIds = new Map(capturedPackages.map((workPackage) => [workPackage.id, workPackage]));
  for (const id of ownership.keys()) selectIdentity(packageIds, id, 'mapped package');
  const steps = db
    .all<StoredStep>(
      sql`
    SELECT s.id,s.work_package_id AS workPackageId,s.name,s.position,s.code,
      s.estimate_unit AS estimateUnit,s.allowance_bps AS allowanceBps,
      s.allowance_revision AS allowanceRevision,s.created_at AS createdAt,
      s.updated_at AS updatedAt,s.created_by AS createdBy,
      w.id AS packageIdentity,w.project_id AS projectId,
      wo.organization_id AS organizationId,p.id AS projectIdentity,
      p.organization_id AS parentOrganizationId,o.id AS organizationIdentity
    FROM step s
    LEFT JOIN work_package w ON w.id=s.work_package_id
    LEFT JOIN work_package_organization wo ON wo.resource_id=w.id
    LEFT JOIN project p ON p.id=w.project_id
    LEFT JOIN organization o ON o.id=wo.organization_id
    ORDER BY s.id COLLATE BINARY`,
    )
    .map(readStep);
  const stepCells = readStorage(db, 'step');
  const stepIds = new Map(steps.map((step) => [step.id, step]));
  const typeRoots = new Set(types.rows.map((row) => readText(row['id'], 'type identity')));
  const typeOrganizations = new Map(
    typeMappings.rows.map((row) => {
      const id = readText(row['resource_id'], 'mapped type identity'),
        organizationId = readText(row['organization_id'], 'type organization');
      if (!typeRoots.has(id) || !organizationIds.has(organizationId))
        throw new Error('step-report missing type or organization ' + id);
      return [id, organizationId] as const;
    }),
  );
  for (const id of typeRoots) selectIdentity(typeOrganizations, id, 'type organization mapping');
  const bases = items.rows.map((row) => {
    const id = readText(row['id'], 'work-item identity'),
      workPackageId = readText(row['work_package_id'], 'work-item package');
    const workPackage = selectIdentity(packageIds, workPackageId, 'work-item package');
    return {
      id,
      workPackageId,
      organizationId: workPackage.organizationId,
      parentId: readNullableText(row['parent_id'], 'work-item parent'),
    };
  });
  const baseIds = new Map(bases.map((workItem) => [workItem.id, workItem]));
  const typeSets = new Map<string, string[]>();
  for (const row of memberships.rows) {
    const workItemId = readText(row['work_item_id'], 'typed work-item identity'),
      typeId = readText(row['type_id'], 'assigned type identity');
    const workItem = selectIdentity(baseIds, workItemId, 'typed work item'),
      organizationId = selectIdentity(typeOrganizations, typeId, 'assigned type mapping');
    if (workItem.organizationId !== organizationId)
      throw new Error('step-report foreign work-item type ' + workItemId);
    const held = typeSets.get(workItemId);
    if (held === undefined) typeSets.set(workItemId, [typeId]);
    else held.push(typeId);
  }
  const workItems: MigrationWorkItem[] = bases.map((workItem) => ({
    ...workItem,
    typeIds: [...(typeSets.get(workItem.id) ?? [])].sort((left, right) =>
      Buffer.compare(Buffer.from(left), Buffer.from(right)),
    ),
  }));
  const workItemIds = new Map(workItems.map((workItem) => [workItem.id, workItem]));
  const parents = new Set(
    workItems.flatMap((workItem) => (workItem.parentId === null ? [] : [workItem.parentId])),
  );
  const facts: MigrationStepFact[] = [];
  for (const { entry, storage } of factTables)
    for (const row of storage.rows) {
      if (entry.kind === 'point') {
        const workItem = selectIdentity(
          workItemIds,
          readText(row['work_item_id'], 'fact work item'),
          'fact work item',
        );
        const column = entry.columns[0];
        const stepId = entry.nullable
          ? readNullableText(row[column], 'claim step')
          : readText(row[column], 'fact step');
        const step = stepId === null ? null : selectIdentity(stepIds, stepId, 'fact step');
        facts.push({
          table: entry.table,
          column,
          workItem,
          step,
          scope: step === null ? 'whole' : 'node',
        });
        continue;
      }
      const relation = readText(row['type'], 'dependency type');
      if (!isRelationshipType(relation))
        throw new Error('step-report unknown dependency type ' + relation);
      const isExternal = entry.kind === 'external';
      const predecessorPackage = readText(
        row[isExternal ? 'predecessor_work_package_id' : 'work_package_id'],
        'predecessor package',
      );
      const successorPackage = readText(
        row[isExternal ? 'successor_work_package_id' : 'work_package_id'],
        'successor package',
      );
      if (isExternal && predecessorPackage === successorPackage)
        throw new Error('step-report external dependency has equal packages');
      const organizationId = isExternal
        ? readText(row['organization_id'], 'dependency organization')
        : null;
      for (const column of entry.columns) {
        const end = column === 'predecessor_step_id' ? 'predecessor' : 'successor';
        const workItem = selectIdentity(
          workItemIds,
          readText(row[end + '_work_item_id'], 'dependency work item'),
          'dependency work item',
        );
        const workPackageId = end === 'predecessor' ? predecessorPackage : successorPackage;
        const workPackage = selectIdentity(packageIds, workPackageId, 'dependency package');
        if (
          workItem.workPackageId !== workPackageId ||
          (organizationId !== null && workPackage.organizationId !== organizationId)
        )
          throw new Error('step-report inconsistent dependency ownership');
        const scope = readText(row[end + '_scope'], 'dependency scope');
        if (!isDependencyEndpointScope(scope))
          throw new Error('step-report unknown dependency scope ' + scope);
        const stepId = readNullableText(row[column], 'dependency step');
        if ((scope === 'whole') !== (stepId === null))
          throw new Error('step-report inconsistent dependency scope and step');
        const step = stepId === null ? null : selectIdentity(stepIds, stepId, 'dependency step');
        if (
          (scope === 'node' && parents.has(workItem.id)) ||
          (scope === 'descendant-step' && !parents.has(workItem.id))
        )
          throw new Error('step-report inconsistent dependency endpoint shape');
        facts.push({ table: entry.table, column, workItem, step, scope });
      }
    }
  return {
    packages: capturedPackages,
    steps,
    workItems,
    facts,
    storage: [
      organizations,
      projects,
      packages,
      packageMappings,
      stepCells,
      items,
      types,
      typeMappings,
      memberships,
      ...factTables.map((selected) => selected.storage),
    ],
  };
}
