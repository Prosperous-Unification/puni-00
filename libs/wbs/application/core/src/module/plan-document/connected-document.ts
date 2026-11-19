import {
  type DocumentConnected,
  documentConnected,
  type DocumentV14TypedDependency,
} from '@wbs/contracts';
import {
  canonicalConnectedStageInput,
  type ConnectedPublicationDecision,
  type Schedule,
} from '@wbs/domain';
import { type } from '@wbs/validation';

import type { ConnectedOptimizedCandidate } from '../../ports/scheduler';
import type { LivePlanRead } from '../../ports/shared-people-values';
import { type ConnectedTreeEndpoint, workPackageConnectedTree } from '../../service/connected-tree';

type ConnectedRead = Extract<LivePlanRead, { kind: 'connected' }>;
const compare = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

function internalEndpoint(
  endpoint: ConnectedTreeEndpoint,
): DocumentV14TypedDependency['successor'] {
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
  workPackageId: string,
): DocumentV14TypedDependency['predecessor'] {
  if (endpoint.endpoint.workPackageId === workPackageId) return internalEndpoint(endpoint);
  const owner = captured.metadataByWorkPackage.get(endpoint.endpoint.workPackageId);
  if (owner === undefined) throw new Error('missing connected document endpoint owner');
  const display = {
    workPackageName: owner.workPackage.name,
    abbreviation: endpoint.workPackageAbbreviation,
    workItemName: endpoint.name,
    address: `${endpoint.workPackageAbbreviation}.${endpoint.workItemNumber}`,
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
function decisionOf(decision: ConnectedPublicationDecision | null, workPackageId: string) {
  if (decision === null) return null;
  // Proof: comparison-scope.txt: removing this predicate accepted a comparison attributed to a foreign stage.
  if (decision.scope.workPackageId !== workPackageId)
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
 * Work packages complete detached capture into transfer content and read-only history.
 * No repository or scheduler capability is accepted; stage bytes come from the
 * retained stage rather than rebuilding a boundary from selected placement.
 * @throws for incomplete trusted metadata, foreign positions or mismatched owners.
 */
export function workPackageConnectedDocument(
  captured: ConnectedRead,
  workPackageId: string,
): {
  typedDependencies: DocumentV14TypedDependency[];
  connected: DocumentConnected;
} {
  const target = workPackageConnectedTree(captured, workPackageId);
  const capture = captured.projection.capture;
  const members = [...capture.workPackages].sort(
    (left, right) => left.rank - right.rank || compare(left.workPackageId, right.workPackageId),
  );
  const workPackages = members.map((member) => {
    const metadata = captured.metadataByWorkPackage.get(member.workPackageId);
    if (metadata === undefined) throw new Error('missing connected document member metadata');
    return {
      workPackageId: member.workPackageId,
      name: metadata.workPackage.name,
      abbreviation: metadata.workPackage.abbreviation,
      rank: member.rank,
      startDate: member.reads.workPackage.startDate,
      timezone: member.reads.workPackage.timezone,
      revision: metadata.workPackage.revision,
      seq: metadata.seq,
    };
  });
  const relationships = [...capture.relationships]
    .sort((left, right) => compare(left.id, right.id))
    .map((relationship) => {
      // Proof: relationship-owner.txt: removing this guard accepted a foreign stored owner.
      if (relationship.workPackageId !== relationship.successor.workPackageId)
        throw new Error('connected document relationship owner');
      return {
        ...relationship,
        predecessor: { ...relationship.predecessor },
        successor: { ...relationship.successor },
      };
    });
  const typedDependencies = target.dependencies
    // Proof: incident-transfer.txt: incident selection emitted outgoing authored links.
    .filter((relationship) => relationship.successor.endpoint.workPackageId === workPackageId)
    .sort((left, right) => compare(left.id, right.id))
    .map((relationship) => ({
      id: relationship.id,
      type: relationship.type,
      predecessor: predecessorEndpoint(captured, relationship.predecessor, workPackageId),
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
        const ownerId = placement.identities.workPackageIdByWorkItem.get(slice.workItemId);
        const owner =
          ownerId === undefined ? undefined : captured.metadataByWorkPackage.get(ownerId);
        // Proof: position-ownership.txt: bypassing row ownership accepted an A slice attributed to B.
        if (
          owner === undefined ||
          !owner.workItems.some((row) => row.id === slice.workItemId) ||
          (slice.stepId !== null && !owner.steps.some((step) => step.id === slice.stepId))
        )
          throw new Error('connected document position ownership');
        return {
          workPackageId: owner.workPackage.id,
          workItemId: slice.workItemId,
          stepId: slice.stepId,
          start: slice.earliestStart,
          finish: slice.earliestFinish,
        };
      })
      .sort(
        (left, right) =>
          compare(left.workPackageId, right.workPackageId) ||
          compare(left.workItemId, right.workItemId) ||
          compare(left.stepId ?? '', right.stepId ?? ''),
      );
  const evidence = {
    kind: 'connected' as const,
    workPackageId,
    mode: capture.mode,
    workPackages,
    relationships,
    placement:
      placement.kind !== 'scheduled'
        ? // Proof: returning the source placement emptied exported calendar work packages in
          // `unavailable document evidence is detached from later capture mutation`.
          structuredClone(placement)
        : {
            kind: 'scheduled' as const,
            originOrdinal: placement.originOrdinal,
            baseline: positions(placement.baseline),
            // Proof: selected-baseline.txt: serializing baseline lost selected start 0 (received 3).
            selected: positions(placement.combined),
            idleWorkPackages: [...placement.idleWorkPackages],
            stages: placement.stages.map((selection) => {
              const stage = selection.stage;
              const member = members.find(
                (candidate) => candidate.workPackageId === stage.workPackageId,
              );
              // Proof: stage-metadata.txt: bypassing this predicate accepted a Fast capture as an optimized stage.
              if (
                selection.engine !== member?.reads.workPackage.scheduleEngine ||
                selection.objective !== member.reads.workPackage.scheduleObjective
              )
                throw new Error('connected document stage metadata');
              // Proof: stage-boundary.txt: replacing these retained bytes failed exact stage equality.
              const canonical = canonicalConnectedStageInput(stage);
              const optimization = selection.optimization;
              return {
                workPackageId: stage.workPackageId,
                engine: selection.engine,
                objective: selection.objective,
                boundary: {
                  format: 'wbs-connected-stage' as const,
                  version: 2 as const,
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
                  pri: decisionOf(selection.decisions.pri, stage.workPackageId),
                  time: decisionOf(selection.decisions.time, stage.workPackageId),
                },
                chosen: decisionOf(selection.chosen, stage.workPackageId),
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
