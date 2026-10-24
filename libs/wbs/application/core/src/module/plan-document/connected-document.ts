import {
  type DocumentConnected,
  documentConnected,
  type DocumentV12TypedDependency,
} from '@wbs/contracts';
import {
  canonicalConnectedStageInput,
  type ConnectedPublicationDecision,
  type Schedule,
} from '@wbs/domain';
import { type } from '@wbs/validation';

import type { ConnectedOptimizedCandidate } from '../../ports/scheduler';
import type { LivePlanRead } from '../../ports/shared-people-values';
import { type ConnectedTreeEndpoint, projectConnectedTree } from '../../service/connected-tree';

type ConnectedRead = Extract<LivePlanRead, { kind: 'connected' }>;
const compare = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

function internalEndpoint(
  endpoint: ConnectedTreeEndpoint,
): DocumentV12TypedDependency['successor'] {
  const identity = endpoint.endpoint;
  return identity.scope === 'whole'
    ? { kind: 'internal', scope: 'whole', workItem: identity.workItemId }
    : {
        kind: 'internal',
        scope: identity.scope,
        workItem: identity.workItemId,
        step: identity.stepId,
      };
}
function predecessorEndpoint(
  captured: ConnectedRead,
  endpoint: ConnectedTreeEndpoint,
  projectId: string,
): DocumentV12TypedDependency['predecessor'] {
  if (endpoint.endpoint.projectId === projectId) return internalEndpoint(endpoint);
  const owner = captured.metadataByProject.get(endpoint.endpoint.projectId);
  if (owner === undefined) throw new Error('missing connected document endpoint owner');
  const display = {
    projectName: owner.project.name,
    abbreviation: endpoint.projectAbbreviation,
    workItemName: endpoint.name,
    address: `${endpoint.projectAbbreviation}.${endpoint.workItemNumber}`,
  };
  return endpoint.endpoint.scope === 'whole'
    ? { kind: 'external', ...endpoint.endpoint, display }
    : {
        kind: 'external',
        ...endpoint.endpoint,
        display: { ...display, stepName: requireStepName(endpoint) },
      };
}
function requireStepName(endpoint: ConnectedTreeEndpoint): string {
  if (endpoint.step === null) throw new Error('missing connected document endpoint step');
  return endpoint.step.name;
}
function decisionOf(decision: ConnectedPublicationDecision | null, projectId: string) {
  if (decision === null) return null;
  // Proof: comparison-scope.txt: removing this predicate accepted a comparison attributed to a foreign stage.
  if (decision.scope.projectId !== projectId)
    throw new Error('connected document comparison scope');
  return {
    scope: { ...decision.scope },
    chosen: decision.chosen,
    values: { ...decision.values },
    optimizedValues: { ...decision.optimizedValues },
    baselineValues: { ...decision.baselineValues },
  };
}
function candidateOf(candidate: ConnectedOptimizedCandidate | null) {
  return candidate === null
    ? null
    : {
        question: { ...candidate.question },
        starts: [...candidate.starts]
          .sort(([left], [right]) => compare(left, right))
          .map(([sliceId, start]) => ({ sliceId, start })),
      };
}

/**
 * Projects complete detached capture into transfer content and read-only history.
 * No repository or scheduler capability is accepted; stage bytes come from the
 * retained stage rather than rebuilding a boundary from selected placement.
 * @throws for incomplete trusted metadata, foreign positions or mismatched owners.
 */
export function projectConnectedDocument(
  captured: ConnectedRead,
  projectId: string,
): {
  typedDependencies: DocumentV12TypedDependency[];
  connected: DocumentConnected;
} {
  const target = projectConnectedTree(captured, projectId);
  const capture = captured.projection.capture;
  const members = [...capture.projects].sort(
    (left, right) => left.rank - right.rank || compare(left.projectId, right.projectId),
  );
  const projects = members.map((member) => {
    const metadata = captured.metadataByProject.get(member.projectId);
    if (metadata === undefined) throw new Error('missing connected document member metadata');
    return {
      projectId: member.projectId,
      name: metadata.project.name,
      abbreviation: metadata.project.abbreviation,
      rank: member.rank,
      startDate: member.reads.project.startDate,
      timezone: member.reads.project.timezone,
      revision: metadata.project.revision,
      seq: metadata.seq,
    };
  });
  const relationships = [...capture.relationships]
    .sort((left, right) => compare(left.id, right.id))
    .map((relationship) => {
      // Proof: relationship-owner.txt: removing this guard accepted a foreign stored owner.
      if (relationship.projectId !== relationship.successor.projectId)
        throw new Error('connected document relationship owner');
      return {
        ...relationship,
        predecessor: { ...relationship.predecessor },
        successor: { ...relationship.successor },
      };
    });
  const typedDependencies = target.dependencies
    // Proof: incident-transfer.txt: incident selection emitted outgoing authored links.
    .filter((relationship) => relationship.successor.endpoint.projectId === projectId)
    .sort((left, right) => compare(left.id, right.id))
    .map((relationship) => ({
      id: relationship.id,
      type: relationship.type,
      predecessor: predecessorEndpoint(captured, relationship.predecessor, projectId),
      successor: internalEndpoint(relationship.successor),
    }));
  const placement = captured.projection.placement;
  if (
    placement.kind === 'scheduled' &&
    (placement.baseline.slices.size !== placement.combined.slices.size ||
      [...placement.baseline.slices.keys()].some((key) => !placement.combined.slices.has(key)))
  )
    // Proof: the missing selected slice failed `positions require complete matching baseline and selected ownership` before this check was added.
    throw new Error('connected document position set');
  const positions = (schedule: Schedule) =>
    [...schedule.slices.values()]
      .map((slice) => {
        if (placement.kind !== 'scheduled') throw new Error('missing connected document placement');
        const ownerId = placement.identities.projectIdByWorkItem.get(slice.workItemId);
        const owner = ownerId === undefined ? undefined : captured.metadataByProject.get(ownerId);
        // Proof: position-ownership.txt: bypassing row ownership accepted an A slice attributed to B.
        if (
          owner === undefined ||
          !owner.workItems.some((row) => row.id === slice.workItemId) ||
          (slice.stepId !== null && !owner.steps.some((step) => step.id === slice.stepId))
        )
          throw new Error('connected document position ownership');
        return {
          projectId: owner.project.id,
          workItemId: slice.workItemId,
          stepId: slice.stepId,
          start: slice.earliestStart,
          finish: slice.earliestFinish,
        };
      })
      .sort(
        (left, right) =>
          compare(left.projectId, right.projectId) ||
          compare(left.workItemId, right.workItemId) ||
          compare(left.stepId ?? '', right.stepId ?? ''),
      );
  const evidence = {
    kind: 'connected' as const,
    projectId,
    mode: capture.mode,
    projects,
    relationships,
    placement:
      placement.kind !== 'scheduled'
        ? // Proof: returning the source placement emptied exported calendar projects in
          // `unavailable document evidence is detached from later capture mutation`.
          structuredClone(placement)
        : {
            kind: 'scheduled' as const,
            originOrdinal: placement.originOrdinal,
            baseline: positions(placement.baseline),
            // Proof: selected-baseline.txt: serializing baseline lost selected start 0 (received 3).
            selected: positions(placement.combined),
            idleProjects: [...placement.idleProjects],
            stages: placement.stages.map((selection) => {
              const stage = selection.stage;
              const member = members.find((candidate) => candidate.projectId === stage.projectId);
              // Proof: stage-metadata.txt: bypassing this predicate accepted a Fast capture as an optimized stage.
              if (
                selection.engine !== member?.reads.project.scheduleEngine ||
                selection.objective !== member.reads.project.scheduleObjective
              )
                throw new Error('connected document stage metadata');
              // Proof: stage-boundary.txt: replacing these retained bytes failed exact stage equality.
              const canonical = canonicalConnectedStageInput(stage);
              const optimization = selection.optimization;
              return {
                projectId: stage.projectId,
                engine: selection.engine,
                objective: selection.objective,
                boundary: {
                  format: 'wbs-connected-stage' as const,
                  version: 1 as const,
                  canonical,
                },
                optimization:
                  optimization === null
                    ? null
                    : {
                        ...optimization,
                        // Proof: drop-certificate.txt lost the exact terminal certificate. Shallow variants
                        // changed exported bounds and stage bytes in
                        // `terminal boundary certificate stays distinct from authored plan infeasibility`.
                        variants: structuredClone(optimization.variants),
                        candidates: {
                          pri: candidateOf(optimization.candidates.pri),
                          time: candidateOf(optimization.candidates.time),
                        },
                      },
                decisions: {
                  pri: decisionOf(selection.decisions.pri, stage.projectId),
                  time: decisionOf(selection.decisions.time, stage.projectId),
                },
                chosen: decisionOf(selection.chosen, stage.projectId),
              };
            }),
          },
  };
  const checked = documentConnected(evidence);
  // Proof: producer-validation.txt: bypassing this refusal admitted missing sequence and infinite revision.
  if (checked instanceof type.errors)
    throw new Error(`invalid connected document evidence: ${checked.summary}`);
  return { typedDependencies, connected: checked };
}
