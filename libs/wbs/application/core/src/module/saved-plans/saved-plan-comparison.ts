import {
  detachHistory,
  type PlanSide,
  readSavedCanonicalStage,
  readSavedConnectedScheduleBody,
  type SavedConnectedDependencyHistory,
  type SavedConnectedScheduleBody,
} from '@wbs/domain';

import type { SavedPlanSideRef } from './saved-plan-values';

type CapturedStage = SavedConnectedScheduleBody['connection']['stages'][number];
type CapturedVariant = NonNullable<CapturedStage['variants']>['pri'];

/** Historical objective outcomes retain their scope and chosen fallback without raw optimizer packets. */
export type SavedComparisonVariant =
  | {
      readonly state: 'ready';
      readonly questionHash: string;
      readonly proof: Extract<CapturedVariant, { state: 'ready' }>['proof'];
      readonly chosen: Extract<CapturedVariant, { state: 'ready' }>['decision']['chosen'];
    }
  | {
      readonly state: 'boundary-infeasible';
      readonly questionHash: string;
      readonly evidence: 'contradictory-bounds' | 'initial-model-infeasible';
    }
  | Exclude<CapturedVariant, { state: 'ready' | 'boundary-infeasible' }>;

/** Captured identity labels remain readable after live work packages, rows or steps are deleted. */
export interface SavedComparisonWorkPackage {
  readonly workPackageId: string;
  readonly name: string;
  readonly abbreviation: string;
}

/** Exact pre-selection foreign positions on the captured common workday axis. */
export interface SavedComparisonBoundary {
  readonly kind: 'connected-stage';
  readonly workPackageId: string;
  readonly format: 'connected-stage-v1' | 'connected-stage-v2';
  readonly canonical: string;
  readonly originOrdinal: number;
  readonly fixed: readonly {
    readonly workPackageId: string;
    readonly workItemId: string;
    readonly stepId: string | null;
    readonly workPackageName: string;
    readonly workPackageAbbreviation: string;
    readonly workItemName: string;
    readonly stepName: string | null;
    readonly start: number;
    readonly finish: number;
  }[];
}

/** Both observed objectives and the selected one describe this immutable stage only. */
export interface SavedComparisonStage extends SavedComparisonWorkPackage {
  readonly engine: CapturedStage['engine'];
  readonly objective: CapturedStage['objective'];
  readonly observation: CapturedStage['observation'];
  readonly selected: CapturedStage['selected'];
  readonly variants: {
    readonly pri: SavedComparisonVariant;
    readonly time: SavedComparisonVariant;
  } | null;
  readonly boundary: SavedComparisonBoundary;
}

/** Per-side dependency and parent evidence survive an empty diff without inferring unrecorded facts. */
export interface SavedComparisonSide {
  readonly source: SavedPlanSideRef;
  readonly parent: PlanSide['inputEvidence']['parent'];
  readonly schedule:
    | { readonly present: true; readonly algorithmId: string }
    | { readonly present: false; readonly absentReason: string };
  readonly provenance:
    | { readonly kind: 'legacy-unknown' }
    | { readonly kind: 'local' }
    | {
        readonly kind: 'connected';
        readonly targetWorkPackageId: string;
        readonly mode: SavedConnectedDependencyHistory['mode'];
        readonly placementState: SavedConnectedDependencyHistory['placementState'];
        readonly workPackages: readonly SavedComparisonWorkPackage[];
        readonly idleWorkPackages: readonly SavedComparisonWorkPackage[];
        readonly stages: readonly SavedComparisonStage[];
      };
}

/**
 * Summarize an already resolved, integrity-verified side using frozen historical decoders only.
 * No capture, shelf, directory, settings or scheduler capability is accepted.
 * The verified original-version projection supplies explicit dependency and parent evidence:
 * pre10 dependencies and original1–11 parents stay unrecorded; recorded facts remain distinct.
 * @throws for missing captured labels; no live lookup substitutes for absent historical evidence.
 * Comparison HTTP responses require this summary on each side, including empty diffs.
 */
export function summarizeSavedComparisonSide(
  side: PlanSide,
  source: SavedPlanSideRef,
): SavedComparisonSide {
  return detachHistory(deriveComparisonSide(side, source));
}

function deriveComparisonSide(side: PlanSide, source: SavedPlanSideRef): SavedComparisonSide {
  const schedule = side.schedule.present
    ? { present: true as const, algorithmId: side.schedule.algorithmId }
    : { present: false as const, absentReason: side.schedule.absentReason };
  const base = { source: { ...source }, schedule, parent: { ...side.inputEvidence.parent } };
  const dependencies = side.inputEvidence.dependencies;
  if (dependencies.kind === 'unrecorded')
    return { ...base, provenance: { kind: 'legacy-unknown' } };
  const history = dependencies.history;
  if (history.kind === 'local') return { ...base, provenance: { kind: 'local' } };
  const evidence = side.schedule.present
    ? readSavedConnectedScheduleBody(side.schedule.body).connection
    : null;
  const workPackages = history.workPackages.map(workPackageLabel);
  const stages =
    evidence === null
      ? []
      : evidence.stages.map((stage): SavedComparisonStage => {
          const workPackage = findWorkPackage(history, stage.workPackageId);
          return {
            ...workPackageLabel(workPackage),
            engine: stage.engine,
            objective: stage.objective,
            observation: stage.observation,
            selected: stage.selected,
            variants:
              stage.variants === null
                ? null
                : {
                    pri: summarizeVariant(stage.variants.pri),
                    time: summarizeVariant(stage.variants.time),
                  },
            // Proof: removing foreign members or substituting final composite positions failed mounted historical comparisons.
            boundary: summarizeBoundary(history, stage),
          };
        });
  return {
    ...base,
    provenance: {
      kind: 'connected',
      targetWorkPackageId: history.targetWorkPackageId,
      mode: history.mode,
      placementState: structuredClone(history.placementState),
      workPackages,
      idleWorkPackages:
        evidence === null
          ? []
          : evidence.idleWorkPackages.map((workPackageId) =>
              workPackageLabel(findWorkPackage(history, workPackageId)),
            ),
      stages,
    },
  };
}

function workPackageLabel(
  workPackage: SavedConnectedDependencyHistory['workPackages'][number],
): SavedComparisonWorkPackage {
  return {
    workPackageId: workPackage.workPackageId,
    name: workPackage.name,
    abbreviation: workPackage.abbreviation,
  };
}

function findWorkPackage(history: SavedConnectedDependencyHistory, workPackageId: string) {
  const workPackage = history.workPackages.find((member) => member.workPackageId === workPackageId);
  // Proof: pure/provisional; removing this guard fails `refuses missing captured workPackage labels` (work-package-label-guard.log.txt).
  if (workPackage === undefined)
    throw new Error(`Missing captured work package label: ${workPackageId}`);
  return workPackage;
}

function summarizeVariant(variant: CapturedVariant): SavedComparisonVariant {
  if (variant.state === 'ready')
    return {
      state: variant.state,
      questionHash: variant.candidate.question.questionHash,
      proof: variant.proof,
      chosen: variant.decision.chosen,
    };
  // Proof: relabeling this as plan-infeasible failed the mounted boundary objective case.
  if (variant.state === 'boundary-infeasible')
    return {
      state: variant.state,
      questionHash: variant.certificate.question.questionHash,
      evidence: variant.certificate.evidence,
    };
  return structuredClone(variant);
}

function summarizeBoundary(
  history: SavedConnectedDependencyHistory,
  stage: CapturedStage,
): SavedComparisonBoundary {
  const packet = readSavedCanonicalStage(stage.format, stage.stageBytes);
  const fixed: SavedComparisonBoundary['fixed'][number][] = [];
  // Boundary: the frozen decoder proves each slice has exactly one numeric start and finish.
  const starts = Object.fromEntries(packet.starts);
  const finishes = Object.fromEntries(packet.finishes);
  for (const [workItemId, workPackageId] of packet.ownership) {
    if (workPackageId === stage.workPackageId) continue;
    const workPackage = findWorkPackage(history, workPackageId);
    const row = workPackage.workItems.find((candidate) => candidate.id === workItemId);
    // Proof: pure/provisional; removing this guard fails `refuses missing captured row labels` (row-label-guard.log.txt).
    if (row === undefined) throw new Error(`Missing captured row label: ${workItemId}`);
    for (const group of packet.slices.filter((candidate) => candidate.workItemId === workItemId)) {
      for (const slice of group.steps) {
        const step =
          slice.stepId === null
            ? null
            : workPackage.steps.find((candidate) => candidate.id === slice.stepId);
        // Proof: pure/provisional; removing this guard fails `refuses missing captured step labels` (step-label-guard.log.txt).
        if (step === undefined)
          throw new Error(`Missing captured step label: ${String(slice.stepId)}`);
        const key = `${workItemId}\u0000${slice.stepId ?? ''}`;
        const start = starts[key];
        const finish = finishes[key];
        fixed.push({
          workPackageId,
          workItemId,
          stepId: slice.stepId,
          workPackageName: workPackage.name,
          workPackageAbbreviation: workPackage.abbreviation,
          workItemName: row.name,
          stepName: step === null ? null : step.name,
          start,
          finish,
        });
      }
    }
  }
  return {
    kind: 'connected-stage',
    workPackageId: stage.workPackageId,
    format: stage.format,
    canonical: stage.stageBytes,
    originOrdinal: packet.originOrdinal,
    fixed,
  };
}
