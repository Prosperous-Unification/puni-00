import { type } from 'arktype';

import type { Schedule } from '../schedule';
import {
  type SavedConnectedDependencyHistory,
  type SavedDependencyHistory,
  validateDependencyReferences,
} from './dependency-history';
import {
  compareHistoryKeys,
  detachHistory,
  type Historical,
  historicalSliceKey,
  indexHistory,
  readHistoryKey,
  requireHistory,
  SavedHistoryError,
  serializeHistory,
} from './history-json';

const numberPair = type(['string', 'number']);
const ownerPair = type(['string', 'string']);
const spanFields = {
  duration: 'number',
  estimated: 'boolean',
  earliestStart: 'number',
  earliestFinish: 'number',
  latestStart: 'number',
  latestFinish: 'number',
  float: 'number',
  critical: 'boolean',
} as const;
const span = type({ '+': 'reject', ...spanFields });
const slice = type({
  '+': 'reject',
  ...spanFields,
  workItemId: 'string',
  stepId: 'string | null',
  personId: 'string | null',
  boundBy:
    "'projectStart' | 'predecessor' | 'stepOrder' | 'notBefore' | 'person' | 'capacity' | 'elsewhere'",
  resourcePredecessorId: 'string | null',
  capacityPredecessorIds: 'string[]',
  capacityTeamId: 'string | null',
  width: 'number',
  effort: 'number',
  lateBy: 'number | null',
  'elsewhereHolder?': { '+': 'reject', projectId: 'string', workItemId: 'string' },
  'capacityResource?': { '+': 'reject', resourceId: 'string', units: 'number' },
});
const placement = type({
  '+': 'reject',
  workItems: { '[string]': span },
  slices: { '[string]': slice },
  waitingForPerson: 'number',
  waitingForCapacity: 'number',
  'waitingElsewhere?': 'number',
});
const end = type({ '+': 'reject', leafId: 'string', at: 'number' });
const stageEdge = type({
  '+': 'reject',
  predecessor: end,
  successor: end,
  type: "'FS'",
  provenance: "'workflow' | 'legacy'",
}).or({
  '+': 'reject',
  predecessor: end,
  successor: end,
  type: "'FS' | 'SS' | 'FF'",
  provenance: "'authored'",
  relationshipId: 'string',
});
const stageNode = type({
  '+': 'reject',
  kind: "'step'",
  workItemId: 'string',
  stepId: 'string',
  at: 'number',
}).or({ '+': 'reject', kind: "'boundary'", workItemId: 'string', at: 'number' });
const selector = type(['string', "'whole'", 'string']).or([
  'string',
  "'node' | 'descendant-step'",
  'string',
  'string',
]);
const canonicalStageV1 = type({
  '+': 'reject',
  kind: "'connected-stage'",
  projectId: 'string',
  mode: "'isolated' | 'shared'",
  originOrdinal: 'number',
  projects: type({
    '+': 'reject',
    projectId: 'string',
    rank: 'number',
    anchorOrdinal: 'number | null',
  }).array(),
  rows: type({
    '+': 'reject',
    id: 'string',
    parentId: 'string | null',
    position: 'number',
    priority: 'number | null',
  }).array(),
  ownership: ownerPair.array(),
  ranks: numberPair.array(),
  slices: type({
    '+': 'reject',
    workItemId: 'string',
    steps: type({
      '+': 'reject',
      stepId: 'string | null',
      days: 'number | null',
      width: 'number',
      personId: 'string | null',
      poolIds: 'string[]',
      demands: type({ '+': 'reject', resourceId: 'string', units: 'number' }).array(),
    }).array(),
  }).array(),
  nodes: stageNode.array(),
  edges: stageEdge.array(),
  relationships: type({
    '+': 'reject',
    id: 'string',
    type: "'FS' | 'SS' | 'FF'",
    predecessor: selector,
    successor: selector,
  }).array(),
  notBefore: numberPair.array(),
  deadlines: numberPair.array(),
  poolSizes: numberPair.array(),
  resourceCapacities: numberPair.array(),
  elsewhere: type({
    '+': 'reject',
    personId: 'string',
    bookings: type({
      '+': 'reject',
      start: 'number',
      end: 'number',
      projectId: 'string',
      workItemId: 'string',
    }).array(),
  }).array(),
  starts: numberPair.array(),
  finishes: numberPair.array(),
});
const question = type({
  '+': 'reject',
  projectId: 'string',
  inputHash: 'string',
  questionHash: 'string',
  objective: "'pri' | 'time'",
  contractVersion: 'string',
  budgetMs: 'number',
  quantum: 'number',
  wireVersion: 'number',
  stageBytes: 'string',
});
const scores = type({ '+': 'reject', makespan: 'number', priority: 'number', movement: 'number' });
const decision = type({
  '+': 'reject',
  scope: { '+': 'reject', kind: "'connected-stage'", projectId: 'string' },
  chosen: "'baseline' | 'optimized'",
  schedule: placement,
  baseline: placement,
  values: scores,
  optimizedValues: scores,
  baselineValues: scores,
});
const variant = type({
  '+': 'reject',
  state: "'ready'",
  proof: "'proven' | 'incomplete' | 'quantisation-floor'",
  candidate: { '+': 'reject', question, starts: numberPair.array() },
  decision,
})
  .or({
    '+': 'reject',
    state: "'boundary-infeasible'",
    certificate: {
      '+': 'reject',
      kind: "'boundary-infeasible'",
      question,
      evidence: "'contradictory-bounds' | 'initial-model-infeasible'",
    },
  })
  .or({ '+': 'reject', state: "'pending' | 'retrying' | 'idle'" })
  .or({
    '+': 'reject',
    state: "'failed'",
    reason:
      "'timeout' | 'invalid-output' | 'no-solution' | 'internal-error' | 'oom' | 'horizon-overflow' | 'objective-overflow'",
  })
  .or({ '+': 'reject', state: "'corrupt'", message: 'string' })
  .or({
    '+': 'reject',
    state: "'plan-infeasible'",
    items: type({
      '+': 'reject',
      ownerWorkItemId: 'string',
      boundWorkItemId: 'string',
      effectiveDeadlineOffset: 'number',
    }).array(),
  });
const optimizationStage = type({
  '+': 'reject',
  projectId: 'string',
  engine: "'fast' | 'optimized'",
  objective: "'pri' | 'time'",
  format: "'connected-stage-v1'",
  stageBytes: 'string',
  variants: type({ '+': 'reject', pri: variant, time: variant }).or('null'),
  selected: "'pri' | 'time' | null",
});
const evidence = type({
  '+': 'reject',
  kind: "'connected'",
  targetProjectId: 'string',
  mode: "'isolated' | 'shared'",
  originOrdinal: 'number | null',
  baseline: placement,
  composite: placement,
  stages: optimizationStage.array(),
  idleProjects: 'string[]',
});
/** JSON timing values on the common captured axis; instrumentation is deliberately excluded. */
export type SavedPlacement = Historical<typeof placement.infer>;
/** Captured objective/candidate/certificate union independent of core ports. */
export type SavedOptimizationVariant = Historical<typeof variant.infer>;
/** Exact pre-selection stage bytes and both objective outcomes; array order records execution. */
export type SavedOptimizationStage = Historical<typeof optimizationStage.infer>;
/** Connected selected schedule evidence, independent of any current scheduler runtime. */
export type SavedConnectedScheduleEvidence = Historical<typeof evidence.infer>;
/** Frozen v1 canonical packet; future engines must add a different historical format reader. */
export type SavedCanonicalStageV1 = Historical<typeof canonicalStageV1.infer>;

/** Read canonical v1 structure and references without replay, re-canonicalization or engine imports. */
export function readSavedCanonicalStage(format: string, bytes: string): SavedCanonicalStageV1 {
  requireHistory(format === 'connected-stage-v1', 'stage_format', '$.stages.format');
  let captured: SavedCanonicalStageV1;
  try {
    captured = detachHistory(canonicalStageV1.assert(detachHistory(JSON.parse(bytes))));
  } catch (cause) {
    if (cause instanceof SavedHistoryError) throw cause;
    throw new SavedHistoryError('stage_shape', '$.stages.stageBytes', { cause });
  }
  const projects = indexHistory(
    captured.projects,
    (project) => project.projectId,
    '$.stage.projects',
  );
  requireHistory(projects.has(captured.projectId), 'stage_owner', '$.stage.projectId');
  const rows = indexHistory(captured.rows, (row) => row.id, '$.stage.rows');
  const ownership = indexHistory(captured.ownership, ([id]) => id, '$.stage.ownership');
  const ranks = indexHistory(captured.ranks, ([id]) => id, '$.stage.ranks');
  requireHistory(
    ownership.size === rows.size && ranks.size === projects.size,
    'stage_ownership',
    '$.stage',
  );
  for (const row of rows.values())
    requireHistory(
      projects.has(ownership.get(row.id)?.[1] ?? '') &&
        (row.parentId === null || rows.has(row.parentId)),
      'stage_ownership',
      '$.stage.rows',
    );
  for (const project of projects.values())
    requireHistory(
      ranks.get(project.projectId)?.[1] === project.rank,
      'stage_rank',
      '$.stage.projects',
    );
  const slices = indexHistory(captured.slices, (group) => group.workItemId, '$.stage.slices');
  const keys = new Set<string>();
  const positions = new Set<string>();
  const expectedPositionByKey = new Map<string, number>();
  for (const group of slices.values()) {
    requireHistory(
      rows.has(group.workItemId) && group.steps.length > 0,
      'stage_slice',
      '$.stage.slices',
    );
    for (const [at, step] of group.steps.entries()) {
      const key = historicalSliceKey(group.workItemId, step.stepId);
      requireHistory(!keys.has(key), 'duplicate', '$.stage.slices');
      keys.add(key);
      expectedPositionByKey.set(key, at);
      positions.add(JSON.stringify([group.workItemId, at]));
    }
  }
  const nodes = indexHistory(
    captured.nodes,
    (node) => historicalSliceKey(node.workItemId, node.kind === 'step' ? node.stepId : null),
    '$.stage.nodes',
  );
  requireHistory(
    nodes.size === keys.size && [...keys].every((key) => nodes.has(key)),
    'stage_nodes',
    '$.stage.nodes',
  );
  const nodePositions = indexHistory(
    captured.nodes,
    (node) => JSON.stringify([node.workItemId, node.at]),
    '$.stage.nodePositions',
  );
  requireHistory(
    [...nodePositions.keys()].every((position) => positions.has(position)),
    'stage_nodes',
    '$.stage.nodes',
  );
  // Codec evidence only: omitting identity/position equality admitted swapped design/test nodes; production read proof remains pending.
  requireHistory(
    [...nodes].every(([key, node]) => expectedPositionByKey.get(key) === node.at),
    'stage_node_position',
    '$.stage.nodes',
  );
  const starts = indexHistory(captured.starts, ([key]) => key, '$.stage.starts');
  const finishes = indexHistory(captured.finishes, ([key]) => key, '$.stage.finishes');
  requireHistory(
    starts.size === keys.size &&
      finishes.size === keys.size &&
      [...keys].every((key) => starts.has(key) && finishes.has(key)),
    'stage_placement_keys',
    '$.stage',
  );
  for (const [key, [, start]] of starts) {
    const finish = finishes.get(key)?.[1];
    requireHistory(
      finish !== undefined && start >= 0 && finish >= start,
      'stage_interval',
      `$.stage.starts.${key}`,
    );
  }
  for (const [name, pairs] of [
    ['notBefore', captured.notBefore],
    ['deadlines', captured.deadlines],
    ['poolSizes', captured.poolSizes],
    ['resourceCapacities', captured.resourceCapacities],
  ] as const)
    indexHistory(pairs, ([key]) => key, `$.stage.${name}`);
  indexHistory(captured.elsewhere, (entry) => entry.personId, '$.stage.elsewhere');
  const relationships = indexHistory(
    captured.relationships,
    (relationship) => relationship.id,
    '$.stage.relationships',
  );
  for (const relationship of relationships.values())
    for (const selector of [relationship.predecessor, relationship.successor])
      requireHistory(
        projects.has(selector[0]) &&
          (ownership.get(selector[2]) === undefined ||
            ownership.get(selector[2])?.[1] === selector[0]),
        'stage_selector',
        '$.stage.relationships',
      );
  for (const edge of captured.edges) {
    requireHistory(
      [edge.predecessor, edge.successor].every((end) =>
        nodePositions.has(JSON.stringify([end.leafId, end.at])),
      ),
      'stage_edge',
      '$.stage.edges',
    );
    if (edge.provenance === 'authored') {
      const relationship = relationships.get(edge.relationshipId);
      requireHistory(relationship?.type === edge.type, 'stage_relationship', '$.stage.edges');
      // Codec evidence only: independently bypassing predecessor/successor ownership admitted each foreign edge endpoint; production read proof remains pending.
      requireHistory(
        ownership.get(edge.predecessor.leafId)?.[1] === relationship.predecessor[0] &&
          ownership.get(edge.successor.leafId)?.[1] === relationship.successor[0],
        'stage_edge_ownership',
        '$.stage.edges',
      );
    }
  }
  return captured;
}

function validatePlacement(captured: SavedPlacement): void {
  for (const [key, projected] of Object.entries(captured.workItems)) {
    // Codec evidence only: bypassing either interval comparison admitted baseline/composite/decision reversals; production read proof remains pending.
    requireHistory(
      projected.earliestFinish >= projected.earliestStart &&
        projected.latestFinish >= projected.latestStart,
      'placement_interval',
      `$.workItems.${key}`,
    );
  }
  for (const [key, projected] of Object.entries(captured.slices)) {
    requireHistory(
      key === historicalSliceKey(projected.workItemId, projected.stepId) &&
        Object.hasOwn(captured.workItems, projected.workItemId),
      'placement_identity',
      `$.slices.${key}`,
    );
    requireHistory(
      projected.earliestFinish >= projected.earliestStart &&
        projected.latestFinish >= projected.latestStart,
      'placement_interval',
      `$.slices.${key}`,
    );
    for (const predecessor of [
      ...projected.capacityPredecessorIds,
      ...(projected.resourcePredecessorId === null ? [] : [projected.resourcePredecessorId]),
    ])
      requireHistory(
        Object.hasOwn(captured.slices, predecessor),
        'placement_predecessor',
        `$.slices.${key}`,
      );
  }
}

/** Explicitly encode Schedule maps; required timing values survive map insertion order and caller mutation. */
export function encodeSavedPlacement(schedule: Schedule): SavedPlacement {
  const captured = detachHistory(
    placement.assert(
      detachHistory({
        workItems: Object.fromEntries(schedule.workItems),
        // Codec evidence only: serializing Map directly failed `explicit map encoding retains every slice and work item`; production proof remains pending.
        slices: Object.fromEntries(schedule.slices),
        waitingForPerson: schedule.waitingForPerson,
        waitingForCapacity: schedule.waitingForCapacity,
        ...(schedule.waitingElsewhere === undefined
          ? {}
          : { waitingElsewhere: schedule.waitingElsewhere }),
      }),
    ),
  );
  validatePlacement(captured);
  return captured;
}

/** Parse selected evidence and objective identity at the historical boundary; throws named corruption. */
export function readSavedConnectedScheduleEvidence(raw: unknown): SavedConnectedScheduleEvidence {
  let captured: SavedConnectedScheduleEvidence;
  try {
    captured = detachHistory(evidence.assert(detachHistory(raw)));
  } catch (cause) {
    if (cause instanceof SavedHistoryError) throw cause;
    throw new SavedHistoryError('shape', '$.connection', { cause });
  }
  validatePlacement(captured.baseline);
  validatePlacement(captured.composite);
  indexHistory(captured.stages, (stage) => stage.projectId, '$.stages');
  indexHistory(captured.idleProjects, (id) => id, '$.idleProjects');
  for (const stage of captured.stages) {
    const packet = readSavedCanonicalStage(stage.format, stage.stageBytes);
    requireHistory(
      packet.projectId === stage.projectId &&
        packet.mode === captured.mode &&
        packet.originOrdinal === captured.originOrdinal,
      'stage_identity',
      '$.stages',
    );
    // Codec evidence only: restoring engine/observation coupling rejected enabled Fast and disabled optimized captures; bypassing selection admitted Fast replacement.
    // Observation depends on captured enablement/capability; only configured optimized selection changes placement. Production integration proof remains pending.
    const selectedObjective =
      stage.engine === 'optimized' && stage.variants?.[stage.objective].state === 'ready'
        ? stage.objective
        : null;
    requireHistory(stage.selected === selectedObjective, 'selected_objective', '$.stages.selected');
    if (stage.variants === null) continue;
    for (const objective of ['pri', 'time'] as const) {
      const variant = stage.variants[objective];
      if (variant.state !== 'ready' && variant.state !== 'boundary-infeasible') continue;
      const question =
        variant.state === 'ready' ? variant.candidate.question : variant.certificate.question;
      requireHistory(
        question.projectId === stage.projectId &&
          question.objective === objective &&
          // Codec evidence only: omitting byte equality admitted the mismatched-stage candidate; production save/read proof remains pending.
          question.stageBytes === stage.stageBytes,
        'question_identity',
        '$.stages.variants',
      );
      requireHistory(
        question.budgetMs > 0 &&
          question.quantum > 0 &&
          Number.isInteger(question.wireVersion) &&
          question.wireVersion > 0,
        'question_contract',
        '$.stages.variants',
      );
      if (variant.state === 'ready') {
        validatePlacement(variant.decision.baseline);
        validatePlacement(variant.decision.schedule);
        requireHistory(
          packet.starts.length === Object.keys(variant.decision.baseline.slices).length &&
            packet.starts.every(
              ([key, start]) =>
                readHistoryKey(variant.decision.baseline.slices, key)?.earliestStart === start,
            ) &&
            packet.finishes.every(
              ([key, finish]) =>
                readHistoryKey(variant.decision.baseline.slices, key)?.earliestFinish === finish,
            ),
          'decision_baseline',
          '$.stages.variants',
        );
        requireHistory(
          serializeHistory(variant.decision.values) ===
            serializeHistory(
              variant.decision.chosen === 'baseline'
                ? variant.decision.baselineValues
                : variant.decision.optimizedValues,
            ),
          'decision_scores',
          '$.stages.variants',
        );

        requireHistory(
          variant.decision.scope.projectId === stage.projectId,
          'decision_scope',
          '$.stages.variants',
        );
        const starts = indexHistory(
          variant.candidate.starts,
          ([key]) => key,
          '$.stages.candidate.starts',
        );
        const ownRows = new Set(
          packet.ownership.filter(([, owner]) => owner === stage.projectId).map(([id]) => id),
        );
        const localKeys = packet.slices
          .filter((group) => ownRows.has(group.workItemId))
          .flatMap((group) =>
            group.steps.map((step) => historicalSliceKey(group.workItemId, step.stepId)),
          );
        requireHistory(
          starts.size === localKeys.length &&
            localKeys.every((key) => starts.has(key)) &&
            [...starts.values()].every(([, start]) => start >= 0),
          'candidate_keys',
          '$.stages.candidate.starts',
        );
        requireHistory(
          Object.keys(variant.decision.schedule.slices).length === packet.starts.length &&
            packet.starts.every(([key, start]) => {
              const chosen = readHistoryKey(variant.decision.schedule.slices, key);
              const isLocal = starts.has(key);
              return (
                chosen !== undefined &&
                chosen.earliestStart ===
                  (isLocal && variant.decision.chosen === 'optimized'
                    ? starts.get(key)?.[1]
                    : start)
              );
            }) &&
            packet.finishes.every(([key, finish]) =>
              starts.has(key) && variant.decision.chosen === 'optimized'
                ? true
                : readHistoryKey(variant.decision.schedule.slices, key)?.earliestFinish === finish,
            ),
          'decision_selection',
          '$.stages.variants',
        );
      }
    }
  }
  return captured;
}

/** Validate cross-body identities and execution order; never replay a historical schedule. Null means absent schedule. */
export function validateSavedConnectedHistory(
  history: SavedDependencyHistory,
  schedule: SavedConnectedScheduleEvidence | null,
): void {
  if (history.kind === 'local') {
    requireHistory(schedule === null, 'local_schedule', '$.connection');
    return;
  }
  validateDependencyReferences(history);
  requireHistory(
    history.placementState.kind === 'scheduled' ? schedule !== null : schedule === null,
    'placement_state',
    '$.connection',
  );
  if (schedule === null) return;
  requireHistory(
    history.targetProjectId === schedule.targetProjectId && history.mode === schedule.mode,
    'connection_identity',
    '$.connection',
  );
  validateComponentPlacement(history, schedule.baseline);
  validateComponentPlacement(history, schedule.composite);
  const projects = [...history.projects].sort(
    (left, right) => left.rank - right.rank || compareHistoryKeys(left.projectId, right.projectId),
  );
  const activeOwners = new Set(
    Object.values(schedule.composite.slices).map(
      (slice) => history.ownership.find(([id]) => id === slice.workItemId)?.[1],
    ),
  );
  const active = projects.filter((project) => activeOwners.has(project.projectId));
  requireHistory(
    active.length === schedule.stages.length &&
      active.every((project, index) => project.projectId === schedule.stages[index]?.projectId),
    'stage_order',
    '$.stages',
  );
  const idle = projects
    .filter((project) => !activeOwners.has(project.projectId))
    .map((project) => project.projectId)
    .sort(compareHistoryKeys);
  requireHistory(
    serializeHistory(idle) ===
      serializeHistory([...schedule.idleProjects].sort(compareHistoryKeys)),
    'idle_projects',
    '$.idleProjects',
  );
  const expectedStarts = new Map(
    Object.entries(schedule.baseline.slices).map(([key, projected]) => [
      key,
      projected.earliestStart,
    ]),
  );
  const expectedFinishes = new Map(
    Object.entries(schedule.baseline.slices).map(([key, projected]) => [
      key,
      projected.earliestFinish,
    ]),
  );
  for (const stage of schedule.stages) {
    const packet = readSavedCanonicalStage(stage.format, stage.stageBytes);
    requireHistory(
      packet.starts.length === expectedStarts.size &&
        packet.finishes.length === expectedFinishes.size &&
        packet.starts.every(([key, start]) => expectedStarts.get(key) === start) &&
        packet.finishes.every(([key, finish]) => expectedFinishes.get(key) === finish),
      'stage_boundary',
      '$.stages.stageBytes',
    );
    if (stage.selected !== null && stage.variants !== null) {
      const selected = stage.variants[stage.selected];
      if (selected.state === 'ready') {
        for (const [key, projected] of Object.entries(selected.decision.schedule.slices)) {
          expectedStarts.set(key, projected.earliestStart);
          expectedFinishes.set(key, projected.earliestFinish);
        }
      }
    }
    const project = projects.find((entry) => entry.projectId === stage.projectId);
    requireHistory(
      project?.engine === stage.engine && project.objective === stage.objective,
      'stage_configuration',
      '$.stages',
    );
    // Codec evidence only: bypassing enablement admitted disabled observations and missing required optimized observations; production read proof remains pending.
    requireHistory(
      project.enabled
        ? stage.engine === 'fast' || stage.variants !== null
        : stage.variants === null,
      'stage_enablement',
      '$.stages',
    );
    const owners = new Map(history.ownership);
    for (const [id, owner] of packet.ownership)
      requireHistory(owners.get(id) === owner, 'stage_ownership', '$.stages');
    const relationshipSelectors = (
      end: SavedConnectedDependencyHistory['relationships'][number]['predecessor'],
    ): readonly string[] =>
      end.scope === 'whole'
        ? [end.projectId, end.scope, end.workItemId]
        : [end.projectId, end.scope, end.workItemId, end.stepId];
    const capturedRelationships = new Map(
      history.relationships.map((relationship) => [relationship.id, relationship]),
    );
    requireHistory(
      packet.relationships.length === capturedRelationships.size,
      'stage_relationships',
      '$.stages',
    );
    for (const relationship of packet.relationships) {
      const authored = capturedRelationships.get(relationship.id);
      requireHistory(
        authored?.type === relationship.type &&
          serializeHistory(relationshipSelectors(authored.predecessor)) ===
            serializeHistory(relationship.predecessor) &&
          serializeHistory(relationshipSelectors(authored.successor)) ===
            serializeHistory(relationship.successor),
        'stage_relationships',
        '$.stages',
      );
    }
    requireHistory(packet.projects.length === projects.length, 'stage_membership', '$.stages');
    for (const member of packet.projects)
      requireHistory(
        projects.some(
          (entry) => entry.projectId === member.projectId && entry.rank === member.rank,
        ),
        'stage_membership',
        '$.stages',
      );
  }
  requireHistory(
    Object.keys(schedule.composite.slices).length === expectedStarts.size &&
      Object.entries(schedule.composite.slices).every(
        ([key, projected]) =>
          projected.earliestStart === expectedStarts.get(key) &&
          projected.earliestFinish === expectedFinishes.get(key),
      ),
    'composite_selection',
    '$.composite',
  );
  requireHistory(
    Object.keys(schedule.composite.slices).length === 0
      ? schedule.originOrdinal === null && schedule.stages.length === 0
      : schedule.originOrdinal !== null,
    'origin',
    '$.originOrdinal',
  );
}

function validateComponentPlacement(
  history: SavedConnectedDependencyHistory,
  captured: SavedPlacement,
): void {
  const owners = new Map(history.ownership);
  for (const id of Object.keys(captured.workItems))
    requireHistory(owners.has(id), 'placement_owner', '$.workItems');
  for (const projected of Object.values(captured.slices)) {
    const project = history.projects.find(
      (entry) => entry.projectId === owners.get(projected.workItemId),
    );
    requireHistory(
      project !== undefined &&
        (projected.stepId === null
          ? project.steps.length === 0
          : project.steps.some((entry) => entry.id === projected.stepId)),
      'placement_step',
      '$.slices',
    );
  }
}

/** Stable bytes sort unordered record keys while preserving exact stage bytes and execution order. */
export function serializeSavedConnectedScheduleEvidence(
  captured: SavedConnectedScheduleEvidence,
): string {
  const checked = readSavedConnectedScheduleEvidence(captured);
  return serializeHistory({
    ...checked,
    idleProjects: [...checked.idleProjects].sort(compareHistoryKeys),
  });
}
