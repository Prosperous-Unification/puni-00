import { suggestStepCode } from '../step-code';
import {
  classifySharedStepCodes,
  type CodedReportStep,
  type SharedStepCodeIssue,
} from './classify-shared-step-codes';

export interface MigrationPackage {
  readonly id: string;
  readonly projectId: string;
  readonly organizationId: string;
}

export interface MigrationStep extends Omit<CodedReportStep, 'code'> {
  readonly workPackageId: string;
  readonly projectId: string;
  readonly code: string | null;
  readonly position: number;
  readonly allowanceRevision: number;
  readonly updatedAt: number | null;
  readonly createdBy: string | null;
}

export interface MigrationWorkItem {
  readonly id: string;
  readonly workPackageId: string;
  readonly organizationId: string;
  readonly parentId: string | null;
  readonly typeIds: readonly string[];
}

/** The actual current thirteen tables; typed and external relationships each carry two columns. */
export type StepFactTable =
  | 'estimate'
  | 'actual'
  | 'step_progress'
  | 'step_measure'
  | 'measure_estimate'
  | 'step_node_attempt'
  | 'step_node_attempt_issued'
  | 'assignment'
  | 'claim'
  | 'typed_dependency'
  | 'external_dependency'
  | 'step_blockage'
  | 'step_parallel';
export type StepFactColumn = 'step_id' | 'predecessor_step_id' | 'successor_step_id';

/** Decoded identities refer to the captured collection, not another store or query. */
export interface MigrationStepFact {
  readonly table: StepFactTable;
  readonly column: StepFactColumn;
  readonly workItem: MigrationWorkItem;
  readonly step: MigrationStep | null;
  readonly scope: 'node' | 'whole' | 'descendant-step';
}

export type StepReportCell = string | number | null;
export interface StepReportStorage {
  readonly table: string;
  readonly rows: readonly Readonly<Record<string, StepReportCell>>[];
}

export interface StepMigrationCapture {
  readonly packages: readonly MigrationPackage[];
  readonly steps: readonly MigrationStep[];
  readonly workItems: readonly MigrationWorkItem[];
  readonly facts: readonly MigrationStepFact[];
  /** All captured source cells, including lease/delegation/audit fields, in canonical order. */
  readonly storage: readonly StepReportStorage[];
}

export type StepMigrationIssue =
  | SharedStepCodeIssue
  | {
      readonly kind: 'uncoded';
      readonly organizationId: string;
      readonly stepId: string;
      readonly name: string;
      readonly suggestedCode: string;
    }
  | {
      readonly kind: 'name_clash';
      readonly organizationId: string;
      readonly name: string;
      readonly stepIds: readonly string[];
      readonly codes: readonly string[];
    }
  | {
      readonly kind: 'divergent_project_set';
      readonly organizationId: string;
      readonly projectId: string;
      readonly packages: readonly {
        readonly workPackageId: string;
        readonly codes: readonly string[];
      }[];
    }
  | {
      readonly kind: 'type_conflict_leaf';
      readonly organizationId: string;
      readonly workPackageId: string;
      readonly workItemId: string;
      readonly typeIds: readonly string[];
    }
  | {
      readonly kind: 'foreign_package_fact';
      readonly organizationId: string;
      readonly table: StepFactTable;
      readonly column: StepFactColumn;
      readonly workItemId: string;
      readonly stepId: string;
      readonly workPackageId: string;
      readonly stepWorkPackageId: string;
    };

/** Binary UTF8 ordering is independent of locale and input insertion order. */
function compareText(left: string, right: string): number {
  const encoder = new TextEncoder(),
    bytes = encoder.encode(left).values();
  for (const byte of encoder.encode(right)) {
    const next = bytes.next();
    if (next.done) return -1;
    if (next.value !== byte) return next.value - byte;
  }
  return bytes.next().done ? 0 : 1;
}

/** Models only absence of children; missing parents and cycles are never treated as empty. */
function readChildren(workItems: readonly MigrationWorkItem[]) {
  const identities = new Map(workItems.map((workItem) => [workItem.id, workItem]));
  const children = new Map<string, MigrationWorkItem[]>();
  for (const workItem of workItems) {
    const visited = new Set([workItem.id]);
    let parentId = workItem.parentId;
    while (parentId !== null) {
      if (visited.has(parentId)) throw new Error('step-report cyclic work item ' + workItem.id);
      visited.add(parentId);
      const parent = identities.get(parentId);
      if (parent?.workPackageId !== workItem.workPackageId)
        throw new Error('step-report missing or foreign work-item parent ' + workItem.id);
      parentId = parent.parentId;
    }
    if (workItem.parentId !== null) {
      const held = children.get(workItem.parentId);
      if (held === undefined) children.set(workItem.parentId, [workItem]);
      else held.push(workItem);
    }
  }
  return children;
}

/**
 * Classifies all seven migration-report kinds from one decoded capture. Uncoded suggestions
 * reuse the existing backfill's per-package order/taken-code algorithm, without writing them;
 * their effective proposed codes participate in compatibility checks until explicitly confirmed.
 * Parent-scoped dependency/subtree-claim evidence reaches its actual descendant leaves.
 * Whole endpoints never fabricate a step identity or become a foreign-step report.
 * No fact, identity, historical byte or supplied array is changed.
 */
export function classifyStepMigration(
  capture: StepMigrationCapture,
): readonly StepMigrationIssue[] {
  const issues: StepMigrationIssue[] = [];
  const uncoded: Extract<StepMigrationIssue, { kind: 'uncoded' }>[] = [];
  const byPackage = new Map<string, MigrationStep[]>();
  for (const step of capture.steps) {
    const held = byPackage.get(step.workPackageId);
    if (held === undefined) byPackage.set(step.workPackageId, [step]);
    else held.push(step);
  }
  const effective: CodedReportStep[] = [];
  const packageSets: {
    readonly workPackageId: string;
    readonly projectId: string;
    readonly organizationId: string;
    readonly codes: readonly string[];
  }[] = [];
  for (const workPackage of [...capture.packages].sort((left, right) =>
    compareText(left.id, right.id),
  )) {
    const steps = [...(byPackage.get(workPackage.id) ?? [])].sort(
      (left, right) => left.position - right.position || compareText(left.id, right.id),
    );
    const taken = new Set(steps.flatMap((step) => (step.code === null ? [] : [step.code])));
    const codes: string[] = [];
    for (const step of steps) {
      let code = step.code;
      if (code === null) {
        code = suggestStepCode(step.name, taken);
        taken.add(code);
        uncoded.push({
          kind: 'uncoded',
          organizationId: step.organizationId,
          stepId: step.id,
          name: step.name,
          suggestedCode: code,
        });
      }
      codes.push(code);
      effective.push({ ...step, code });
    }
    packageSets.push({
      workPackageId: workPackage.id,
      projectId: workPackage.projectId,
      organizationId: workPackage.organizationId,
      codes: [...new Set(codes)].sort(compareText),
    });
  }
  const shared = classifySharedStepCodes(effective);
  uncoded.sort(
    (left, right) =>
      compareText(left.organizationId, right.organizationId) ||
      compareText(left.stepId, right.stepId),
  );
  issues.push(...shared, ...uncoded);
  const names = new Map<string, Map<string, CodedReportStep[]>>();
  for (const step of effective) {
    let organization = names.get(step.organizationId);
    if (organization === undefined) {
      organization = new Map();
      names.set(step.organizationId, organization);
    }
    const held = organization.get(step.name);
    if (held === undefined) organization.set(step.name, [step]);
    else held.push(step);
  }
  for (const [organizationId, organization] of [...names].sort(([left], [right]) =>
    compareText(left, right),
  ))
    for (const [name, steps] of [...organization].sort(([left], [right]) =>
      compareText(left, right),
    )) {
      const codes = [...new Set(steps.map((step) => step.code))].sort(compareText);
      if (codes.length > 1)
        issues.push({
          kind: 'name_clash',
          organizationId,
          name,
          stepIds: steps.map((step) => step.id).sort(compareText),
          codes,
        });
    }
  const projects = new Map<
    string,
    {
      readonly organizationId: string;
      readonly packages: { workPackageId: string; codes: readonly string[] }[];
    }
  >();
  for (const workPackage of packageSets) {
    const held = projects.get(workPackage.projectId);
    if (held === undefined)
      projects.set(workPackage.projectId, {
        organizationId: workPackage.organizationId,
        packages: [{ workPackageId: workPackage.workPackageId, codes: workPackage.codes }],
      });
    else held.packages.push({ workPackageId: workPackage.workPackageId, codes: workPackage.codes });
  }
  for (const [projectId, project] of [...projects].sort(([left], [right]) =>
    compareText(left, right),
  )) {
    const sets = new Set(project.packages.map((workPackage) => JSON.stringify(workPackage.codes)));
    if (sets.size > 1)
      issues.push({
        kind: 'divergent_project_set',
        organizationId: project.organizationId,
        projectId,
        packages: project.packages.sort((left, right) =>
          compareText(left.workPackageId, right.workPackageId),
        ),
      });
  }
  const children = readChildren(capture.workItems);
  const protectedLeaves = new Set<string>();
  const foreign = new Map<string, Extract<StepMigrationIssue, { kind: 'foreign_package_fact' }>>();
  for (const fact of capture.facts) {
    if (fact.step !== null && fact.workItem.workPackageId !== fact.step.workPackageId) {
      const issue = {
        kind: 'foreign_package_fact' as const,
        organizationId: fact.workItem.organizationId,
        table: fact.table,
        column: fact.column,
        workItemId: fact.workItem.id,
        stepId: fact.step.id,
        workPackageId: fact.workItem.workPackageId,
        stepWorkPackageId: fact.step.workPackageId,
      };
      foreign.set(
        JSON.stringify([issue.table, issue.column, issue.workItemId, issue.stepId]),
        issue,
      );
    }
    const pending = [fact.workItem];
    for (const workItem of pending) {
      const descendants = children.get(workItem.id);
      if (descendants === undefined) protectedLeaves.add(workItem.id);
      else if (fact.scope !== 'node') pending.push(...descendants);
    }
  }
  for (const workItem of [...capture.workItems].sort(
    (left, right) =>
      compareText(left.organizationId, right.organizationId) || compareText(left.id, right.id),
  ))
    if (
      !children.has(workItem.id) &&
      workItem.typeIds.length > 1 &&
      protectedLeaves.has(workItem.id)
    )
      issues.push({
        kind: 'type_conflict_leaf',
        organizationId: workItem.organizationId,
        workPackageId: workItem.workPackageId,
        workItemId: workItem.id,
        typeIds: [...workItem.typeIds].sort(compareText),
      });
  issues.push(
    ...[...foreign].sort(([left], [right]) => compareText(left, right)).map(([, issue]) => issue),
  );
  return issues;
}
