import {
  chargedDemandsOf,
  deadlineOffsetsOf,
  effectiveTeamsOf,
  type Elsewhere,
  type EstimateRule,
  indexCapturedLeafSteps,
  type IsoDate,
  type PlanInputReads,
  type ResolvedPlanInputReads,
  withoutHeldSubtrees,
  workdaysBetween,
} from '@wbs/domain';
import type { ScheduleInput } from '@wbs/domain/canonical-schedule-input';

import { NO_DEADLINES, slicesOf, type SliceStepOrder } from './schedule-slices';

/** Canonical placement input and display facts prepared under one work package's own settings. */
export interface ScheduleParts {
  readonly input: ScheduleInput;
  readonly unreducedInput: ScheduleInput;
  readonly hasChildren: ReadonlySet<string>;
  readonly assigneesOf: ReadonlyMap<string, Record<string, string>>;
  readonly rule: EstimateRule;
}

/** Prepare real charged slices, inherited capacities, calendar constraints and held reduction once. */
export function prepareScheduleParts(
  workPackage: Pick<
    PlanInputReads['workPackage'],
    'estimateMethod' | 'pertWeights' | 'estimateRounding' | 'startDate' | 'depReach'
  >,
  rows: readonly (Parameters<typeof slicesOf>[0][number] & {
    readonly teamIds: readonly string[];
  })[],
  estimates: PlanInputReads['estimates'],
  edges: ScheduleInput['edges'],
  typed: ScheduleInput['typed'],
  assignments: PlanInputReads['assignments'],
  steps: PlanInputReads['steps'],
  poolSizes: PlanInputReads['capacity'],
  demands: PlanInputReads['demands'],
  resourceCapacities: PlanInputReads['resourceCapacities'],
  stepOrder: SliceStepOrder,
): ScheduleParts {
  const hasChildren = new Set(rows.map((row) => row.parentId).filter((id) => id !== null));
  const capacityByResource = new Map(
    resourceCapacities.map(({ resourceId, units }) => [resourceId, units] as const),
  );
  const assigneesOf = new Map<string, Record<string, string>>();
  for (const assignment of assignments) {
    assigneesOf.set(assignment.workItemId, {
      ...(assigneesOf.get(assignment.workItemId) ?? {}),
      [assignment.stepId]: assignment.personId,
    });
  }
  const rule: EstimateRule = {
    // Proof: forcing realistic failed `applies each workPackage minute conversion, estimate method and allowance exactly once` (B effort 2 instead of 3).
    method: workPackage.estimateMethod,
    pertWeights: workPackage.pertWeights,
    // Proof: forcing ceil failed `uses own rounding, units, allowance, team capacity and width before injective namespacing` (B duration 1.5 instead of 1.05).
    rounding: workPackage.estimateRounding,
  };
  const slices = slicesOf(
    rows,
    estimates,
    hasChildren,
    steps,
    rule,
    assigneesOf,
    effectiveTeamsOf(rows),
    poolSizes,
    chargedDemandsOf(demands, capacityByResource),
    stepOrder,
  );
  const notBefore = new Map<string, number>();
  if (workPackage.startDate !== null) {
    for (const row of rows) {
      if (row.startNoEarlierThan === null) continue;
      notBefore.set(row.id, workdaysBetween(workPackage.startDate, row.startNoEarlierThan));
    }
  }
  const deadlines =
    workPackage.startDate === null
      ? NO_DEADLINES
      : deadlineOffsetsOf(
          workPackage.startDate,
          new Map(
            rows
              .filter((row): row is typeof row & { deadline: IsoDate } => row.deadline !== null)
              .map((row) => [row.id, row.deadline]),
          ),
        );
  // On hold takes a leaf, and every ancestor all of whose leaves are held, out
  // of the input before either engine reads it (ADR 0032). Blocked, readiness
  // and blocked by proxy change nothing here.
  // Proof: this reduction bypassed (an empty held set) made `lets a successor
  // start at day zero, and reports the held row with no schedule` fail — the
  // held row came back scheduled over days 0 to 5; watched 2026-09-29.
  const heldLeafIds = new Set(
    rows.filter((row) => row.hold === 'on_hold' && !hasChildren.has(row.id)).map((row) => row.id),
  );
  const unreducedInput: ScheduleInput = {
    rows,
    edges,
    slices,
    notBefore,
    poolSizes,
    // Proof: forcing whole-item failed `resolves every workPackage local dependency under its own reach and step order` (successor 2 instead of 1).
    reach: workPackage.depReach,
    deadlines,
    typed,
    // Stated only when the work package states one, so every plan with no
    // resource keeps the input, and the hash, it had before.
    // Proof: left out, both levelling cases of resource-schedule.test.ts
    // threw `no capacity for resource …`; watched 2026-10-20.
    ...(capacityByResource.size === 0 ? {} : { resourceCapacities: capacityByResource }),
  };
  return {
    // Proof: emptying heldLeafIds failed `retains authored held endpoints but schedules no held work` and both partial-parent placement cases.
    input: withoutHeldSubtrees(unreducedInput, heldLeafIds),
    unreducedInput,
    hasChildren,
    assigneesOf,
    rule,
  };
}

/** Current detached captures require every own leaf order and contain no actual dates to invent. */
export function prepareCapturedScheduleParts(
  reads: ResolvedPlanInputReads,
  elsewhere?: Elsewhere,
): ScheduleParts {
  const prepared = prepareScheduleParts(
    reads.workPackage,
    reads.workItems.map((row) => ({ ...row, factStart: null, factEnd: null })),
    reads.estimates,
    reads.dependencies,
    reads.typedDependencies,
    reads.assignments,
    reads.steps,
    reads.capacity,
    reads.demands,
    reads.resourceCapacities,
    // Proof: uniform interpretation lost actual SQLite own orders/boundaries; index bypass
    // separately admitted parent/foreign entries and lost the modeled missing-list refusal
    // (current-writer13-fault-captured-uniform/census-parent/census-foreign/census-missing-v5).
    { kind: 'leaf', byLeaf: indexCapturedLeafSteps(reads.workItems, reads.steps, reads.leafSteps) },
  );
  return elsewhere === undefined
    ? prepared
    : { ...prepared, input: { ...prepared.input, elsewhere } };
}
