import {
  orderSteps,
  type PlanInputReads,
  type ResolvedPlanInputReads,
  type ResolvedStep,
} from '@wbs/domain';

/** Authors uniform execution in synthetic unit inputs only; never supplies Source authority or genuine predecessor evidence. */
export function authorUniformFixtureReads(reads: PlanInputReads): ResolvedPlanInputReads {
  const parents = new Set(reads.workItems.map((row) => row.parentId));
  const stepIds = orderSteps(reads.steps).map((step) => step.id);
  return {
    ...reads,
    leafSteps: reads.workItems
      .filter((row) => !parents.has(row.id))
      .map((row) => ({ workItemId: row.id, stepIds: [...stepIds] })),
  };
}

/**
 * Authors explicit uniform leaf inventories for detached projection fixtures only.
 * Historical input rows/codes stay untouched. An uncoded historical step receives a
 * synthetic sidecar code; label tests still read its original nullable catalogue code.
 * This is neither a Source capture nor evidence from a genuine predecessor producer.
 */
export function authorFixtureLeafSteps<
  Row extends { readonly id: string; readonly parentId: string | null },
>(
  rows: readonly Row[],
  steps: readonly {
    readonly id: string;
    readonly code: string | null;
    readonly name: string;
    readonly position: number;
  }[],
): (Row & { readonly steps?: readonly ResolvedStep[] })[] {
  const parents = new Set(rows.map((row) => row.parentId));
  return rows.map((row) =>
    parents.has(row.id)
      ? row
      : {
          ...row,
          steps: orderSteps(steps).map((step): ResolvedStep => ({
            stepId: step.id,
            code: step.code ?? 'fixture-' + step.id,
            name: step.name,
            via: [
              {
                bindingId: 'fixture-' + step.id,
                scopeKind: 'project',
                scopeId: 'captured-parent',
                workItemTypeId: null,
              },
            ],
          })),
        },
  );
}
