import {
  canonicalConnectedStageInput,
  type CapacityMode,
  haveSameSliceOrder,
  type Schedule,
  sliceKey,
  type SolverObjectiveName,
} from '@wbs/domain';

import type { ConnectedPlanOptimization } from '../ports/plan-tree';
import type { LivePlanRead } from '../ports/shared-people-values';

type ConnectedRead = Extract<LivePlanRead, { kind: 'connected' }>;

/** Captured foreign placements on the common axis; labels never enter question identity. */
export interface ConnectedOptimizationScope {
  readonly kind: 'connected-stage';
  readonly workPackageId: string;
  readonly originOrdinal: number;
  readonly mode: CapacityMode;
  readonly quantum: number;
  readonly wireVersion: number;
  readonly boundary: {
    readonly format: 'wbs-connected-stage';
    readonly version: 1;
    readonly canonical: string;
  };
  readonly fixed: readonly {
    readonly workPackageId: string;
    readonly workPackageName: string;
    readonly workPackageAbbreviation: string;
    readonly workItemId: string;
    readonly workItemName: string;
    readonly stepId: string | null;
    readonly stepName: string | null;
    readonly start: number;
    readonly finish: number;
  }[];
}

/** Both alternatives compare with one retained stage, independent of final component placement. */
export type ConnectedOptimizationView = ConnectedPlanOptimization;

function requireCaptured<T>(value: T | null | undefined, name: string): T {
  // Proof: removing null and undefined predicates independently admitted absent C
  // work-package/row/step labels through workPackageConnectedTree (view tests, 2026-10-22).
  if (value === null || value === undefined)
    throw new Error(`missing connected optimization ${name}`);
  return value;
}

/**
 * Derive a display view from an already validated detached connected selection without IO,
 * scheduling, hashing or admission. Foreign starts/finishes and canonical bytes belong to the retained
 * pre-selection stage. Displayed dates remain the separate final by-work-package placement.
 * Finish comparisons use only target slices and target-relative workday offsets;
 * ready quantisation-floor decisions use their published baseline placement.
 * Disabled, idle and unavailable observations have no optimization view or invented identity.
 *
 * @throws when a scheduled active member has no stage or captured scope labels.
 */
export function deriveConnectedOptimizationView(
  captured: ConnectedRead,
  workPackageId: string,
): ConnectedOptimizationView | null {
  const { projection, metadataByWorkPackage } = captured;
  const placement = projection.placement;
  if (placement.kind !== 'scheduled') return null;
  const selection = placement.stages.find((entry) => entry.stage.workPackageId === workPackageId);
  if (selection === undefined) {
    if (placement.idleWorkPackages.includes(workPackageId)) return null;
    // Proof: returning null here accepted an active member without its retained
    // stage; `disabled and idle members` failed through workPackageConnectedTree.
    throw new Error(`missing connected optimization stage ${workPackageId}`);
  }
  const observation = selection.optimization;
  if (observation === null) return null;
  const { stage } = selection;
  const member = requireCaptured(
    projection.capture.workPackages.find((entry) => entry.workPackageId === workPackageId),
    `member ${workPackageId}`,
  );
  const order = stage.input.order;
  // canonicalConnectedStageInput validates the connected order and exact retained key sets.
  const canonical = canonicalConnectedStageInput(stage);
  if (order.kind !== 'connected') throw new Error('connected optimization order absent');
  const ownership = order.workPackageIdByWorkItem;
  const target = requireCaptured(
    stage.workPackages.find((entry) => entry.workPackageId === workPackageId),
    'target',
  );
  const shift = requireCaptured(target.anchorOrdinal, 'target anchor') - stage.originOrdinal;
  const localKeys = new Set(
    stage.input.slices
      .filter((slice) => ownership.get(slice.workItemId) === workPackageId)
      .map((slice) => sliceKey(slice.workItemId, slice.stepId)),
  );
  // Proof: removing the target filter made the tree producer compare whole
  // component finishes/order; mixed-engine and floor view assertions failed.
  const localSlices = (schedule: Schedule) =>
    new Map([...schedule.slices].filter(([key]) => localKeys.has(key)));
  const finish = (schedule: Schedule) =>
    Math.max(...[...localSlices(schedule).values()].map((slice) => slice.earliestFinish - shift));
  const finishDays: ConnectedOptimizationView['finishDays'] = {
    fast: Math.max(
      ...[...stage.finishes].filter(([key]) => localKeys.has(key)).map(([, end]) => end - shift),
    ),
  };
  const variantFinishes: Partial<Record<SolverObjectiveName, number>> = {};
  const sameOrderAsFast: Partial<Record<SolverObjectiveName, boolean>> = {};
  for (const objective of ['pri', 'time'] as const) {
    const decision = selection.decisions[objective];
    if (decision === null) continue;
    variantFinishes[objective] = finish(decision.schedule);
    sameOrderAsFast[objective] = haveSameSliceOrder(
      localSlices(decision.baseline),
      localSlices(decision.schedule),
    );
  }
  const fixed = stage.input.slices.flatMap((slice) => {
    const ownerId = requireCaptured(ownership.get(slice.workItemId), 'slice owner');
    if (ownerId === workPackageId) return [];
    const metadata = requireCaptured(metadataByWorkPackage.get(ownerId), `metadata ${ownerId}`);
    const row = requireCaptured(
      metadata.workItems.find((entry) => entry.id === slice.workItemId),
      `row ${slice.workItemId}`,
    );
    const step =
      slice.stepId === null
        ? null
        : requireCaptured(
            metadata.steps.find((entry) => entry.id === slice.stepId),
            `step ${slice.stepId}`,
          );
    const key = sliceKey(slice.workItemId, slice.stepId);
    return [
      {
        workPackageId: ownerId,
        workPackageName: requireCaptured(metadata.workPackage.name, `work package name ${ownerId}`),
        workPackageAbbreviation: requireCaptured(
          metadata.workPackage.abbreviation,
          `work package abbreviation ${ownerId}`,
        ),
        workItemId: row.id,
        workItemName: requireCaptured(row.name, `row name ${row.id}`),
        stepId: slice.stepId,
        stepName: step === null ? null : requireCaptured(step.name, `step name ${step.id}`),
        // Proof: reading final combined starts here changed captured C=8 to C=6
        // in A's earlier scope; both producer-mounted selected-ready table/card
        // cases lost their captured start 8 evidence (2026-10-22).
        start: requireCaptured(stage.starts.get(key), `start ${key}`),
        finish: requireCaptured(stage.finishes.get(key), `finish ${key}`),
      },
    ];
  });
  return {
    enabled: member.reads.workPackage.optimizationEnabled,
    engine: selection.engine,
    objective: selection.objective,
    inputHash: observation.inputHash,
    generation: observation.generation,
    contractVersion: observation.contractVersion,
    budgetMs: observation.budgetMs,
    displayed: selection.chosen === null ? 'fast' : selection.objective,
    // Proof: aliasing this evidence let a consumer mutation rewrite the retained
    // terminal state; `refuses absent captured labels` failed its second read.
    variants: structuredClone(observation.variants),
    finishDays: { ...finishDays, ...variantFinishes },
    sameOrderAsFast,
    scope: {
      kind: 'connected-stage',
      workPackageId,
      originOrdinal: stage.originOrdinal,
      mode: stage.mode,
      quantum: observation.quantum,
      wireVersion: observation.wireVersion,
      // Proof: empty canonical bytes failed the retained descriptor assertion
      // through workPackageConnectedTree; final dates cannot recreate this boundary.
      boundary: { format: 'wbs-connected-stage', version: 1, canonical },
      fixed,
    },
  };
}
