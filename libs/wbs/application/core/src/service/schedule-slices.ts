import {
  allowanceOf,
  chargedWorkdaysOf,
  type EstimateRule,
  estimateUnitOf,
  resolveStepResources,
  type ResourceDemand,
  type Slice,
  sliceKey,
  type StepAllowances,
  type StepPolicy,
  type StoredEstimate,
} from '@wbs/domain';

import type { WorkItem } from '../ports/work-item-store';

/** Undated projects state no deadline offsets; all preparation shares this readonly empty value. */
export const NO_DEADLINES: ReadonlyMap<string, number> = new Map<string, number>();

/**
 * Prepare one slice per leaf and project step, preserving unknown estimates as null.
 * Stepless projects retain a zero-duration boundary for every leaf. Estimate
 * allowances, unit conversion, assignment widths and resource demands are
 * resolved once for live, captured and connected scheduling. Unknown estimated
 * steps throw through the allowance/unit lookups rather than dropping effort.
 */
export function slicesOf(
  rows: readonly Omit<WorkItem, 'factStart' | 'factEnd'>[],
  estimates: readonly StoredEstimate[],
  hasChildren: ReadonlySet<string>,
  /**
   * The project's steps in step order, each with its allowance. Every estimate
   * must name one of them: {@link allowanceOf} throws for a step outside this
   * list rather than charging it at no allowance.
   */
  steps: readonly StepPolicy[],
  /**
   * The project's whole estimate arithmetic — method, weights and rounding.
   * The number a slice runs for is `chargedWorkdaysOf`'s own, so the bar the chart
   * draws and the figure the table prints are one number rather than two
   * roundings of one estimate.
   */
  rule: EstimateRule,
  /**
   * Each work item's assignees by step, from which every slice's person is
   * read.
   *
   * The planner takes the person per slice and never derives one, so this is
   * the only place the assumed assignee becomes a queue: a work item with one
   * named person carries them on **every** slice, which is what "when just one
   * is assigned it is assumed they do both" means once time is involved.
   */
  assigneesOf: ReadonlyMap<string, Record<string, string>>,
  /**
   * Each row's effective team set — its own, or the nearest ancestor's, from
   * {@link effectiveTeamsOf}.
   *
   * Passed in rather than resolved here, because the reading is shared: the
   * table cell, the cards, the Gantt and the export all show the same inherited
   * label, and a second walk here would be the copy that drifts.
   */
  teamOf: ReadonlyMap<string, { teamIds: readonly string[] }>,
  /**
   * How many people each **sized** team may have at work at once. A team nobody
   * has sized is simply absent, and its work draws from no pool.
   */
  teamSizes: ReadonlyMap<string, number>,
  /**
   * Each leaf's charged demand vector, from `chargedDemandsOf`: its own
   * demands on resources the project states a capacity for, clamped to it.
   * Charged on **every** step's slice of the leaf (`wbs-resources` R2), as the
   * team pools are; a leaf absent from the map demands nothing.
   */
  demandsOf: ReadonlyMap<string, readonly ResourceDemand[]>,
): Slice[] {
  const inProject = new Set(rows.map((row) => row.id));
  const allowances: StepAllowances = new Map(steps.map((step) => [step.id, step.allowancePercent]));
  const units = new Map(steps.map((step) => [step.id, step.estimateUnit]));
  const days = new Map<string, number>();
  for (const estimate of estimates) {
    if (hasChildren.has(estimate.workItemId)) continue;
    if (!inProject.has(estimate.workItemId)) continue;
    // The shared slice seam: Fast, the solver request and a saved plan's
    // schedule all read charged effort from here, so the allowance is applied
    // once, before rounding, for every scheduler.
    //
    // Proof: with the allowance replaced by 0 here, `schedules charged effort,
    // and the edit changes the canonical input` failed on `Expected: 3,
    // Received: 2` (2026-09-27).
    days.set(
      sliceKey(estimate.workItemId, estimate.stepId),
      chargedWorkdaysOf(
        estimateUnitOf(units, estimate.stepId),
        estimate,
        rule,
        allowanceOf(allowances, estimate.stepId),
      ),
    );
  }

  const order = steps.map((step) => step.id);
  const slices: Slice[] = [];
  for (const row of rows) {
    if (hasChildren.has(row.id)) continue;
    const resourcesFor = (stepId: string | null) =>
      resolveStepResources(
        row.maxParallel,
        stepId,
        assigneesOf.get(row.id) ?? {},
        teamOf.get(row.id)?.teamIds ?? [],
        teamSizes,
      );
    // Present only on a leaf that demands something, so a plan with no
    // demand hands the engines the slices it always did.
    // Proof: `{}` in place of the vector made `serialises two leaves on the
    // one staging environment and names it` (resource-schedule.test.ts) place
    // demanding blocks on top of each other; watched 2026-10-20.
    const vector = demandsOf.get(row.id) ?? [];
    const demands = vector.length === 0 ? {} : { demands: vector };
    if (order.length === 0) {
      const { personId, width, poolIds } = resourcesFor(null);
      slices.push({
        workItemId: row.id,
        stepId: null,
        days: null,
        personId,
        width,
        poolIds,
        ...demands,
      });
      continue;
    }
    for (const stepId of order) {
      const { personId, width, poolIds } = resourcesFor(stepId);
      slices.push({
        workItemId: row.id,
        stepId,
        days: days.get(sliceKey(row.id, stepId)) ?? null,
        personId,
        width,
        poolIds,
        ...demands,
      });
    }
  }
  return slices;
}
