import {
  buildConnectedScheduleBody,
  CalendarRangeError,
  canonicalConnectedStageInput,
  canonicalisePlanInputV9,
  type CanonicalPlanInputV9,
  type ConnectedPublicationDecision,
  deriveNumbers,
  encodeSavedPlacement,
  planInputRowsOf,
  readSavedDependencyHistory,
  type SavedConnectedDependencyHistory,
  type SavedConnectedScheduleBody,
  SavedHistoryError,
  type SavedOptimizationStage,
  type SavedOptimizationVariant,
  sliceKey,
} from '@wbs/domain';

import type { LivePlanRead } from '../../ports/shared-people-values';
import {
  createConnectedEndpointProjector,
  validateConnectedMetadata,
} from '../../service/connected-endpoints';
import type { ConnectedOptimizationSelection } from '../../service/connected-optimization';
import { selectConnectedProject } from '../../service/connected-plan-projection';

type ConnectedRead = Extract<LivePlanRead, { kind: 'connected' }>;

/** Prepared historical bodies; callers serialize and hash only after their live snapshot closes. */
export interface ConnectedHistoryCapture {
  readonly input: CanonicalPlanInputV9;
  readonly schedule:
    | { readonly present: true; readonly body: SavedConnectedScheduleBody }
    | { readonly present: false; readonly absentReason: 'unavailable' | 'infeasible' };
}

function requireCaptured<T>(value: T | undefined | null, name: string): T {
  // Proof: defaulting absent foreign status to the target status returned unsafe 201 in both mounted save modes (evidence/mounted-save-refusal/missing-status.log).
  if (value == null) throw new Error(`missing connected history ${name}`);
  return value;
}

/** Historical labels and numbering must describe the same member facts that produced placement/readiness. */
function validateCapturedFacts(captured: ConnectedRead): void {
  const requireFact = (metadata: unknown, read: unknown, path: string) => {
    // Proof: removing this refusal admitted contradictory foreign names with 201 in both mounted save modes (evidence/mounted-save-refusal/contradictory-facts.log).
    if (metadata !== read) throw new SavedHistoryError('metadata_facts', path);
  };
  for (const member of captured.projection.capture.projects) {
    const metadata = requireCaptured(captured.metadataByProject.get(member.projectId), 'metadata');
    const path = `$.projects.${member.projectId}`;
    requireFact(metadata.project.abbreviation, member.abbreviation, `${path}.abbreviation`);
    for (const field of [
      'name',
      'startDate',
      'scheduleEngine',
      'scheduleObjective',
      'optimizationEnabled',
    ] as const) {
      requireFact(metadata.project[field], member.reads.project[field], `${path}.${field}`);
    }
    const rows = new Map(member.reads.workItems.map((row) => [row.id, row]));
    for (const row of metadata.workItems) {
      const read = requireCaptured(rows.get(row.id), 'row');
      for (const field of ['name', 'parentId', 'position', 'frozenNumber', 'hold'] as const) {
        requireFact(row[field], read[field], `${path}.workItems.${row.id}.${field}`);
      }
    }
    const steps = new Map(member.reads.steps.map((step) => [step.id, step]));
    for (const step of metadata.steps) {
      const read = requireCaptured(steps.get(step.id), 'step');
      for (const field of ['code', 'name', 'position'] as const) {
        requireFact(step[field], read[field], `${path}.steps.${step.id}.${field}`);
      }
    }
  }
}

function encodeDecision(decision: ConnectedPublicationDecision) {
  return {
    scope: { ...decision.scope },
    chosen: decision.chosen,
    schedule: encodeSavedPlacement(decision.schedule),
    baseline: encodeSavedPlacement(decision.baseline),
    values: { ...decision.values },
    baselineValues: { ...decision.baselineValues },
    optimizedValues: { ...decision.optimizedValues },
  };
}

function captureStage(selection: ConnectedOptimizationSelection): SavedOptimizationStage {
  const observation = selection.optimization;
  const captureVariant = (objective: 'pri' | 'time'): SavedOptimizationVariant => {
    const current = requireCaptured(observation, 'observation').variants[objective];
    if (current.state !== 'ready') return structuredClone(current);
    const candidate = requireCaptured(observation?.candidates[objective], 'ready candidate');
    const decision = requireCaptured(selection.decisions[objective], 'ready decision');
    return {
      ...current,
      candidate: {
        question: { ...candidate.question },
        // Proof: removing sorting failed `canonicalizes candidate starts regardless of captured map insertion order` on unequal saved bytes (2026-10-22).
        starts: [...candidate.starts].sort(([left], [right]) =>
          left < right ? -1 : left > right ? 1 : 0,
        ),
      },
      decision: encodeDecision(decision),
    };
  };
  return {
    projectId: selection.stage.projectId,
    engine: selection.engine,
    objective: selection.objective,
    format: 'connected-stage-v1',
    // Proof: replacing these bytes with '{}' failed eight converter cases, including exact retained-boundary coverage.
    stageBytes: canonicalConnectedStageInput(selection.stage),
    observation:
      observation === null
        ? null
        : {
            inputHash: observation.inputHash,
            contractVersion: observation.contractVersion,
            budgetMs: observation.budgetMs,
            quantum: observation.quantum,
            wireVersion: observation.wireVersion,
          },
    variants:
      observation === null ? null : { pri: captureVariant('pri'), time: captureVariant('time') },
    // Proof: replacing selection with null failed the optimized-displacement converter case.
    selected: selection.chosen === null ? null : selection.objective,
  };
}

/**
 * Convert one detached authorized connected observation, preserving original identities and stage boundaries.
 * No stores, clock, scheduler or optimizer admission capability is accepted. The target uses its own
 * captured anchor; unavailable placement remains explicit even while graph/readiness stays inspectable.
 * @throws for missing or inconsistent trusted component evidence.
 */
export function captureConnectedHistory(
  captured: ConnectedRead,
  projectId: string,
): ConnectedHistoryCapture {
  validateConnectedMetadata(captured);
  validateCapturedFacts(captured);
  const target = selectConnectedProject(captured.projection, projectId);
  const { capture, authored, placement } = captured.projection;
  const member = requireCaptured(
    capture.projects.find((project) => project.projectId === projectId),
    'target',
  );
  const endpoint = createConnectedEndpointProjector(captured.metadataByProject);
  const projectEndpoint = (selector: Parameters<typeof endpoint>[0]) => {
    const { endpoint: identity, revision: _revision, ...labels } = endpoint(selector);
    return { ...identity, ...labels };
  };
  const projects = capture.projects.map((project) => {
    const metadata = requireCaptured(captured.metadataByProject.get(project.projectId), 'metadata');
    const numbers = deriveNumbers(metadata.workItems);
    return {
      projectId: project.projectId,
      name: metadata.project.name,
      abbreviation: metadata.project.abbreviation,
      startDate: project.reads.project.startDate,
      timezone: project.reads.project.timezone,
      rank: project.rank,
      engine: project.reads.project.scheduleEngine,
      objective: project.reads.project.scheduleObjective,
      enabled: project.reads.project.optimizationEnabled,
      steps: metadata.steps.map(({ id, code, name, position }) => ({ id, code, name, position })),
      workItems: metadata.workItems.map((row) => ({
        id: row.id,
        name: row.name,
        parentId: row.parentId,
        hold: row.hold,
        number: requireCaptured(numbers.get(row.id), 'number'),
        status: requireCaptured(captured.readiness.statuses.get(row.id), 'status'),
      })),
    };
  });
  const readiness = authored.graph.nodes.map((node) => {
    const workItemId = node.kind === 'step' ? node.ref.workItemId : node.workItemId;
    const stepId = node.kind === 'step' ? node.ref.stepId : null;
    const key = sliceKey(workItemId, stepId);
    const base = {
      key,
      projectId: requireCaptured(authored.projectIdByWorkItem.get(workItemId), 'node owner'),
      workItemId,
      status: requireCaptured(captured.readiness.statuses.get(workItemId), 'status'),
      intrinsic: requireCaptured(captured.readiness.evidenceByNode.get(key), 'intrinsic'),
      eligibility: requireCaptured(captured.readiness.eligibilityByNode.get(key), 'eligibility'),
    };
    return node.kind === 'boundary'
      ? { ...base, kind: 'boundary' as const, stepId: null }
      : {
          ...base,
          kind: 'step' as const,
          stepId: node.ref.stepId,
          reading: requireCaptured(
            captured.readiness.nodes.readings.get(workItemId)?.[node.ref.stepId],
            'reading',
          ),
          causes: requireCaptured(
            captured.readiness.nodes.causes.get(workItemId)?.[node.ref.stepId],
            'causes',
          ),
        };
  });
  const historyOf = (
    placementState: SavedConnectedDependencyHistory['placementState'],
  ): SavedConnectedDependencyHistory => {
    const history = readSavedDependencyHistory({
      kind: 'connected',
      targetProjectId: projectId,
      mode: capture.mode,
      placementState,
      projects,
      relationships: capture.relationships.map((relationship) => ({
        id: relationship.id,
        projectId: relationship.projectId,
        type: relationship.type,
        predecessor: projectEndpoint(relationship.predecessor),
        successor: projectEndpoint(relationship.successor),
      })),
      graph: authored.graph,
      ownership: [...authored.projectIdByWorkItem],
      readiness,
    });
    if (history.kind !== 'connected') throw new Error('connected history discriminator');
    return history;
  };
  if (target.kind !== 'scheduled') {
    const history = historyOf(target);
    return {
      input: canonicalisePlanInputV9(planInputRowsOf(member.reads), history),
      schedule: {
        present: false,
        absentReason: target.kind === 'unavailable' ? 'infeasible' : 'unavailable',
      },
    };
  }
  if (placement.kind !== 'scheduled') throw new Error('connected history placement discriminator');
  const history = historyOf({ kind: 'scheduled' });
  try {
    const body = buildConnectedScheduleBody(
      target.schedule,
      member.reads.project.startDate,
      history,
      {
        kind: 'connected',
        targetProjectId: projectId,
        mode: capture.mode,
        originOrdinal: placement.originOrdinal,
        baseline: encodeSavedPlacement(placement.baseline),
        // Proof: substituting baseline failed the optimized-displacement converter case on retained stage-boundary validation.
        composite: encodeSavedPlacement(placement.combined),
        stages: placement.stages.map(captureStage),
        idleProjects: [...placement.idleProjects],
      },
    );
    return {
      input: canonicalisePlanInputV9(planInputRowsOf(member.reads), history),
      schedule: { present: true, body },
    };
  } catch (cause) {
    // Proof: rethrowing CalendarRangeError failed the coherent input-state/schedule-absence converter case.
    if (!(cause instanceof CalendarRangeError)) throw cause;
    return {
      input: canonicalisePlanInputV9(
        planInputRowsOf(member.reads),
        historyOf({ kind: 'unavailable', reason: 'calendar_range' }),
      ),
      schedule: { present: false, absentReason: 'infeasible' },
    };
  }
}
