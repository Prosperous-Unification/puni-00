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

/** Captured identity labels remain readable after live projects, rows or steps are deleted. */
export interface SavedComparisonProject {
  readonly projectId: string;
  readonly name: string;
  readonly abbreviation: string;
}

/** Exact pre-selection foreign positions on the captured common workday axis. */
export interface SavedComparisonBoundary {
  readonly kind: 'connected-stage';
  readonly projectId: string;
  readonly format: 'connected-stage-v1';
  readonly canonical: string;
  readonly originOrdinal: number;
  readonly fixed: readonly {
    readonly projectId: string;
    readonly workItemId: string;
    readonly stepId: string | null;
    readonly projectName: string;
    readonly projectAbbreviation: string;
    readonly workItemName: string;
    readonly stepName: string | null;
    readonly start: number;
    readonly finish: number;
  }[];
}

/** Both observed objectives and the selected one describe this immutable stage only. */
export interface SavedComparisonStage extends SavedComparisonProject {
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

/** Per-side scope survives an empty diff; legacy formats never imply a capture mode. */
export interface SavedComparisonSide {
  readonly source: SavedPlanSideRef;
  readonly schedule:
    | { readonly present: true; readonly algorithmId: string }
    | { readonly present: false; readonly absentReason: string };
  readonly provenance:
    | { readonly kind: 'legacy-unknown' }
    | { readonly kind: 'local' }
    | {
        readonly kind: 'connected';
        readonly targetProjectId: string;
        readonly mode: SavedConnectedDependencyHistory['mode'];
        readonly placementState: SavedConnectedDependencyHistory['placementState'];
        readonly projects: readonly SavedComparisonProject[];
        readonly idleProjects: readonly SavedComparisonProject[];
        readonly stages: readonly SavedComparisonStage[];
      };
}

/**
 * Project an already resolved, integrity-verified side using frozen historical decoders only.
 * No capture, shelf, directory, settings or scheduler capability is accepted. The existing legacy resolver
 * retains its normalized v8 shape, so only explicitly captured input9 establishes local provenance. Throws for missing captured labels.
 * Comparison HTTP responses require this summary on each side, including empty diffs.
 */
export function summarizeSavedComparisonSide(
  side: PlanSide,
  source: SavedPlanSideRef,
): SavedComparisonSide {
  return detachHistory(projectComparisonSide(side, source));
}

function projectComparisonSide(side: PlanSide, source: SavedPlanSideRef): SavedComparisonSide {
  const schedule = side.schedule.present
    ? { present: true as const, algorithmId: side.schedule.algorithmId }
    : { present: false as const, absentReason: side.schedule.absentReason };
  const base = { source: { ...source }, schedule };
  if (side.input.schemaVersion !== 9) return { ...base, provenance: { kind: 'legacy-unknown' } };
  const history = side.input.dependencyHistory;
  if (history.kind === 'local') return { ...base, provenance: { kind: 'local' } };
  const evidence = side.schedule.present
    ? readSavedConnectedScheduleBody(side.schedule.body).connection
    : null;
  const projects = history.projects.map(projectLabel);
  const stages =
    evidence === null
      ? []
      : evidence.stages.map((stage): SavedComparisonStage => {
          const project = findProject(history, stage.projectId);
          return {
            ...projectLabel(project),
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
      targetProjectId: history.targetProjectId,
      mode: history.mode,
      placementState: structuredClone(history.placementState),
      projects,
      idleProjects:
        evidence === null
          ? []
          : evidence.idleProjects.map((projectId) => projectLabel(findProject(history, projectId))),
      stages,
    },
  };
}

function projectLabel(
  project: SavedConnectedDependencyHistory['projects'][number],
): SavedComparisonProject {
  return { projectId: project.projectId, name: project.name, abbreviation: project.abbreviation };
}

function findProject(history: SavedConnectedDependencyHistory, projectId: string) {
  const project = history.projects.find((member) => member.projectId === projectId);
  // Proof: pure/provisional; removing this guard fails `refuses missing captured project labels` (project-label-guard.log.txt).
  if (project === undefined) throw new Error(`Missing captured project label: ${projectId}`);
  return project;
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
  for (const [workItemId, projectId] of packet.ownership) {
    if (projectId === stage.projectId) continue;
    const project = findProject(history, projectId);
    const row = project.workItems.find((candidate) => candidate.id === workItemId);
    // Proof: pure/provisional; removing this guard fails `refuses missing captured row labels` (row-label-guard.log.txt).
    if (row === undefined) throw new Error(`Missing captured row label: ${workItemId}`);
    for (const group of packet.slices.filter((candidate) => candidate.workItemId === workItemId)) {
      for (const slice of group.steps) {
        const step =
          slice.stepId === null
            ? null
            : project.steps.find((candidate) => candidate.id === slice.stepId);
        // Proof: pure/provisional; removing this guard fails `refuses missing captured step labels` (step-label-guard.log.txt).
        if (step === undefined)
          throw new Error(`Missing captured step label: ${String(slice.stepId)}`);
        const key = `${workItemId}\u0000${slice.stepId ?? ''}`;
        const start = starts[key];
        const finish = finishes[key];
        fixed.push({
          projectId,
          workItemId,
          stepId: slice.stepId,
          projectName: project.name,
          projectAbbreviation: project.abbreviation,
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
    projectId: stage.projectId,
    format: stage.format,
    canonical: stage.stageBytes,
    originOrdinal: packet.originOrdinal,
    fixed,
  };
}
