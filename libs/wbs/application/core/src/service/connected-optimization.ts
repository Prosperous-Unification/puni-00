import {
  canonicalConnectedStageInput,
  type ConnectedOptimizationStage,
  type ConnectedPublicationDecision,
  guardConnectedPublication,
  replayConnectedStage,
  type Schedule,
  type ScheduleEngine,
  ScheduleInvalidOptimizedStartError,
  scheduleResolved,
  sliceKey,
  type SolverObjectiveName,
} from '@wbs/domain';

import type {
  ConnectedOptimizationQuestion,
  ConnectedOptimizedCapturedAdapter,
  ConnectedOptimizedRead,
} from '../ports/scheduler';

/** Prepared common-axis component, before restoring project-local capacity identities or dates. */
export interface PreparedConnectedOptimization {
  readonly mode: ConnectedOptimizationStage['mode'];
  readonly originOrdinal: number | null;
  readonly input: ConnectedOptimizationStage['input'];
  readonly relationships: ConnectedOptimizationStage['relationships'];
  readonly projects: readonly (ConnectedOptimizationStage['projects'][number] & {
    readonly engine: ScheduleEngine;
    readonly objective: SolverObjectiveName;
    readonly enabled: boolean;
  })[];
}

/** Each record names its own captured boundary, which later selections never rewrite. */
export interface ConnectedOptimizationSelection {
  readonly stage: ConnectedOptimizationStage;
  readonly engine: ScheduleEngine;
  readonly objective: SolverObjectiveName;
  readonly optimization: ConnectedOptimizedRead | null;
  readonly decisions: Readonly<Record<SolverObjectiveName, ConnectedPublicationDecision | null>>;
  readonly chosen: ConnectedPublicationDecision | null;
}

function validatePreparedPlacement(
  prepared: PreparedConnectedOptimization,
  placement: Schedule,
): void {
  const order = prepared.input.order;
  if (order.kind !== 'connected')
    throw new Error('connected optimization requires connected order');
  const projectIds = new Set(prepared.projects.map((project) => project.projectId));
  // Proof: removing this check admitted duplicate projects and missing/nonfinite ranks in the empty membership cases.
  if (
    projectIds.size !== prepared.projects.length ||
    order.rankByProject.size !== projectIds.size ||
    prepared.projects.some(
      (project) =>
        !Number.isFinite(project.rank) ||
        order.rankByProject.get(project.projectId) !== project.rank,
    )
  )
    throw new Error('connected optimization membership');
  // Proof (redundant): removing this check changed unknown ownership to the canonical stage-owner
  // diagnostic. Removing it with canonical/replay and the owner narrowing guard admitted both
  // missing/unknown owners in `unmapped active ownership...`.
  if (
    order.projectIdByWorkItem.size !== prepared.input.rows.length ||
    prepared.input.rows.some((row) => {
      const owner = order.projectIdByWorkItem.get(row.id);
      return owner === undefined || !projectIds.has(owner);
    }) ||
    prepared.input.slices.some((slice) => {
      const owner = order.projectIdByWorkItem.get(slice.workItemId);
      return owner === undefined || !projectIds.has(owner);
    })
  )
    throw new Error('connected optimization ownership');
  const keys = new Set(
    prepared.input.slices.map((slice) => sliceKey(slice.workItemId, slice.stepId)),
  );
  const rowKeys = new Set(prepared.input.rows.map((row) => row.id));
  // Proof: removing this check admitted stale nonempty placement through both empty-component regression paths.
  if (
    keys.size !== prepared.input.slices.length ||
    placement.slices.size !== keys.size ||
    [...keys].some((key) => !placement.slices.has(key)) ||
    rowKeys.size !== prepared.input.rows.length ||
    placement.workItems.size !== rowKeys.size ||
    [...rowKeys].some((id) => !placement.workItems.has(id))
  )
    throw new Error('connected optimization placement keys');
}

/**
 * Detach the exact current placement and replay its hard constraints. Fast deadlines
 * remain wanted dates; only optimized candidates must satisfy their own deadlines.
 * Empty local projects have no solver question. Invalid trusted evidence throws.
 */
export function buildConnectedOptimizationStage(
  prepared: PreparedConnectedOptimization,
  placement: Schedule,
  projectId: string,
): ConnectedOptimizationStage | { readonly kind: 'idle'; readonly projectId: string } {
  validatePreparedPlacement(prepared, placement);
  const order = prepared.input.order;
  // Invariant diagnostic: prepared components use the connected resolver.
  if (order.kind !== 'connected')
    throw new Error('connected optimization requires connected order');
  // Proof: removing membership returned idle in `unknown stage ownership...`.
  if (!prepared.projects.some((project) => project.projectId === projectId))
    throw new Error(`uncaptured optimization project ${projectId}`);
  const hasLocalSlices = prepared.input.slices.some(
    (slice) => order.projectIdByWorkItem.get(slice.workItemId) === projectId,
  );
  const firstSlice = prepared.input.slices.at(0);
  if (firstSlice === undefined) {
    // Proof: removing this replay admitted invented nodes in `empty components validate their resolved graph...`.
    // Empty components have no stage origin; the actual engine validates their graph without one.
    scheduleResolved(prepared.input);
    return { kind: 'idle', projectId };
  }
  // An idle member must validate the real foreign placement too. Use an actual active owner
  // solely for canonical/replay evidence; no optimization question is returned for the idle member.
  const stageOwner = hasLocalSlices
    ? projectId
    : order.projectIdByWorkItem.get(firstSlice.workItemId);
  // Invariant diagnostic: pre-idle ownership validation guarantees this actual active owner.
  if (stageOwner === undefined) throw new Error('connected optimization ownership');
  // Proof (diagnostic): removing this guard changed `an active stage refuses...` to the downstream finite-origin diagnostic.
  if (prepared.originOrdinal === null)
    throw new Error('active connected optimization has no calendar origin');
  // Proof: bypassing detachment failed `stage detaches input maps...`: source floor appeared in the stage.
  const stage: ConnectedOptimizationStage = structuredClone({
    kind: 'connected-stage',
    projectId: stageOwner,
    mode: prepared.mode,
    originOrdinal: prepared.originOrdinal,
    projects: prepared.projects.map(({ projectId: id, rank, anchorOrdinal }) => ({
      projectId: id,
      rank,
      anchorOrdinal,
    })),
    input: prepared.input,
    relationships: prepared.relationships,
    starts: new Map([...placement.slices].map(([key, slice]) => [key, slice.earliestStart])),
    finishes: new Map([...placement.slices].map(([key, slice]) => [key, slice.earliestFinish])),
  });
  // Membership, exact keys and metadata use the shared domain boundary.
  canonicalConnectedStageInput(stage);
  // Proof: removing replay failed `stage detaches input maps...`: forged finish 100 was accepted.
  replayConnectedStage(stage);
  return hasLocalSlices ? stage : { kind: 'idle', projectId };
}

function matchesQuestion(
  question: ConnectedOptimizationQuestion,
  stage: ConnectedOptimizationStage,
  observation: ConnectedOptimizedRead,
  objective: SolverObjectiveName,
): boolean {
  // Proof: independently dropping each identity term failed its mismatched-field case;
  // dropping canonical bytes admitted the stale stage. Hash construction belongs to the adapter.
  return (
    question.projectId === stage.projectId &&
    question.objective === objective &&
    question.stageBytes === canonicalConnectedStageInput(stage) &&
    question.inputHash === observation.inputHash &&
    question.contractVersion === observation.contractVersion &&
    question.budgetMs === observation.budgetMs &&
    question.quantum === observation.quantum &&
    question.wireVersion === observation.wireVersion &&
    question.questionHash.length > 0
  );
}

function validateObservation(
  stage: ConnectedOptimizationStage,
  observation: ConnectedOptimizedRead,
) {
  const variants = { ...observation.variants };
  const candidates = { ...observation.candidates };
  const decisions: Record<SolverObjectiveName, ConnectedPublicationDecision | null> = {
    pri: null,
    time: null,
  };
  const order = stage.input.order;
  if (order.kind !== 'connected')
    throw new Error('connected optimization requires connected order');
  const localKeys = new Set(
    stage.input.slices
      .filter((slice) => order.projectIdByWorkItem.get(slice.workItemId) === stage.projectId)
      .map((slice) => sliceKey(slice.workItemId, slice.stepId)),
  );
  for (const objective of ['pri', 'time'] as const) {
    const state = variants[objective];
    const candidate = candidates[objective];
    let message: string | null = null;
    if (state.state === 'boundary-infeasible') {
      // Proof: bypassing identity failed `a stale boundary certificate...` (terminal instead of corrupt).
      if (!matchesQuestion(state.certificate.question, stage, observation, objective))
        message = 'boundary certificate question mismatch';
    } else if (state.state === 'ready') {
      if (
        candidate === null ||
        !matchesQuestion(candidate.question, stage, observation, objective)
      ) {
        message = 'connected candidate question mismatch';
      } else {
        try {
          // Match the request's integer movement origin without rounding the real baseline or foreign pins.
          // Proof: restoring raw stage.starts failed the saved fractional FS evidence test: baseline movement was 0 instead of 1/120.
          const quantum = candidate.question.quantum;
          const reference = new Map(
            [...stage.starts]
              .filter(([key]) => localKeys.has(key))
              .map(([key, start]) => [key, Math.round(start * quantum) / quantum]),
          );
          // Proof: removing the graph here admitted an invalid final B stage in `whole-component replay...`.
          decisions[objective] = guardConnectedPublication(
            stage,
            candidate.starts,
            objective === 'pri' ? 'priority' : 'makespan',
            reference,
          );
        } catch (failure) {
          if (!(failure instanceof ScheduleInvalidOptimizedStartError)) throw failure;
          message = failure.message;
        }
      }
    }
    if (message !== null) {
      variants[objective] = { state: 'corrupt', message };
      candidates[objective] = null;
    }
  }
  return { optimization: { ...observation, variants, candidates }, decisions };
}

/**
 * Visit each project once in captured rank/bytewise-ID order. Both objective
 * alternatives see one stage and use their question's quantized movement origin
 * against the real baseline; only the configured objective can replace it.
 * Reads are synchronous and non-admitting under the caller's snapshot lifetime.
 * Missing required connected capability is a modeled refusal for the component.
 */
export function selectConnectedOptimizations(
  prepared: PreparedConnectedOptimization,
  baseline: Schedule,
  optimizer: ConnectedOptimizedCapturedAdapter | null,
) {
  validatePreparedPlacement(prepared, baseline);
  // Proof: bypassing sorting failed `visits rank then...`: observed C,B,A instead of A,B,C.
  const members = [...prepared.projects].sort(
    (a, b) =>
      a.rank - b.rank || (a.projectId < b.projectId ? -1 : a.projectId > b.projectId ? 1 : 0),
  );
  const order = prepared.input.order;
  // Invariant diagnostic: prepared components use the connected resolver.
  if (order.kind !== 'connected')
    throw new Error('connected optimization requires connected order');
  const activeProjects = new Set(
    prepared.input.slices.map((slice) => order.projectIdByWorkItem.get(slice.workItemId)),
  );
  // Proof: without active filtering `an entirely empty component...` returned engine_unavailable.
  const required = members.filter(
    (project) =>
      project.enabled && project.engine === 'optimized' && activeProjects.has(project.projectId),
  );
  // Proof: bypassing refusal returned selected in `missing connected capability...`.
  if (optimizer === null && required.length > 0)
    return {
      kind: 'engine_unavailable' as const,
      engine: 'optimized' as const,
      projects: required.map((project) => project.projectId),
    };
  let placement = baseline;
  const stages: ConnectedOptimizationSelection[] = [];
  const idleProjects: string[] = [];
  for (const member of members) {
    // Proof: using baseline here failed `visits rank then...`: later A boundary remained 3 instead of 0.
    const stage = buildConnectedOptimizationStage(prepared, placement, member.projectId);
    if (stage.kind === 'idle') {
      idleProjects.push(member.projectId);
      continue;
    }
    // Proof: ignoring enablement added disabled C to the observed projects in `Fast and disabled...`.
    const observed =
      member.enabled && optimizer !== null
        ? validateObservation(
            stage,
            optimizer.readConnectedCaptured({ stage, objective: member.objective, enabled: true }),
          )
        : null;
    // Proof: removing engine selection moved Fast in `Fast and disabled...`; selecting Time unconditionally
    // moved the PRI-selected project in `a ready nonselected objective...`.
    const chosen =
      member.engine === 'optimized' && observed !== null
        ? observed.decisions[member.objective]
        : null;
    if (chosen !== null) placement = chosen.schedule;
    stages.push({
      stage,
      engine: member.engine,
      objective: member.objective,
      optimization: observed?.optimization ?? null,
      decisions: observed?.decisions ?? { pri: null, time: null },
      chosen,
    });
  }
  return { kind: 'selected' as const, baseline, placement, stages, idleProjects };
}
