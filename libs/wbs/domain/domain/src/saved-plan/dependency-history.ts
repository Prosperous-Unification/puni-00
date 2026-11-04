import { type } from 'arktype';

import {
  compareHistoryKeys,
  detachHistory,
  type Historical,
  historicalSliceKey,
  indexHistory,
  requireHistory,
  SavedHistoryError,
  serializeHistory,
} from './history-json';

const status =
  "'unknown' | 'draft' | 'ready' | 'in_progress' | 'blocked_by_proxy' | 'on_hold' | 'blocked' | 'done'";
const step = type({
  '+': 'reject',
  id: 'string',
  // Proof: accepting numeric or absent codes returned 200 in mounted codec-fit read/compare negatives (2026-10-22).
  code: 'string | null',
  name: 'string',
  position: 'number',
});
const label = {
  name: 'string',
  projectAbbreviation: 'string',
  workItemNumber: 'string',
  stepNodeId: 'string | null',
  stepReference: 'string | null',
  qualifiedReference: 'string | null',
  isLeaf: 'boolean',
} as const;
const endpoint = type({
  '+': 'reject',
  ...label,
  scope: "'whole'",
  projectId: 'string',
  workItemId: 'string',
  step: 'null',
}).or({
  '+': 'reject',
  ...label,
  scope: "'node' | 'descendant-step'",
  projectId: 'string',
  workItemId: 'string',
  stepId: 'string',
  step,
});
/** Frozen graph schema shared only by historical formats, never the live engine decoder. */
export const historicalGraphNode = type({
  '+': 'reject',
  kind: "'step'",
  ref: { '+': 'reject', workItemId: 'string', stepId: 'string' },
  at: 'number',
}).or({ '+': 'reject', kind: "'boundary'", workItemId: 'string', at: 'number' });
const edgeEnd = type({ '+': 'reject', leafId: 'string', at: 'number' });
/** Historical graph edge fields, with authored provenance retaining its relationship identity. */
export const historicalGraphEdge = type({
  '+': 'reject',
  predecessor: edgeEnd,
  successor: edgeEnd,
  type: "'FS'",
  provenance: "'workflow' | 'legacy'",
}).or({
  '+': 'reject',
  predecessor: edgeEnd,
  successor: edgeEnd,
  type: "'FS' | 'SS' | 'FF'",
  provenance: "'authored'",
  relationshipId: 'string',
});
const blocker = type({
  '+': 'reject',
  predecessor: historicalGraphNode,
  edge: historicalGraphEdge,
});
const readinessBase = {
  key: 'string',
  projectId: 'string',
  workItemId: 'string',
  status,
  intrinsic: { '+': 'reject', started: 'boolean', done: 'boolean' },
  eligibility: {
    '+': 'reject',
    canStart: 'boolean',
    canFinish: 'boolean',
    startBlockers: blocker.array(),
    finishBlockers: blocker.array(),
  },
} as const;
const cause = type({ '+': 'reject', kind: "'step'", nodeId: 'string' }).or({
  '+': 'reject',
  kind: "'work-item'",
  workItemId: 'string',
});
const readiness = type({
  '+': 'reject',
  ...readinessBase,
  kind: "'step'",
  stepId: 'string',
  reading:
    "'skipped' | 'done' | 'on_hold' | 'blocked' | 'in_progress' | 'blocked_by_proxy' | 'waiting' | 'unknown'",
  causes: cause.array(),
}).or({ '+': 'reject', ...readinessBase, kind: "'boundary'", stepId: 'null' });
const placementState = type({ '+': 'reject', kind: "'scheduled'" })
  .or({
    '+': 'reject',
    kind: "'dependency_calendar_missing'",
    projects: type({
      '+': 'reject',
      projectId: 'string',
      abbreviation: 'string',
      name: 'string',
    }).array(),
  })
  .or({
    '+': 'reject',
    kind: "'engine_unavailable'",
    engine: "'optimized'",
    projects: 'string[]',
    reason: "'adapter_missing' | 'connected_optimization_not_supported'",
  })
  .or({ '+': 'reject', kind: "'unavailable'", reason: "'cycle' | 'calendar_range'" });
const connected = type({
  '+': 'reject',
  kind: "'connected'",
  targetProjectId: 'string',
  mode: "'isolated' | 'shared'",
  placementState,
  projects: type({
    '+': 'reject',
    projectId: 'string',
    name: 'string',
    abbreviation: 'string',
    startDate: 'string | null',
    timezone: 'string',
    rank: 'number',
    engine: "'fast' | 'optimized'",
    objective: "'pri' | 'time'",
    enabled: 'boolean',
    steps: step.array(),
    workItems: type({
      '+': 'reject',
      id: 'string',
      name: 'string',
      parentId: 'string | null',
      number: 'string',
      hold: "'on_hold' | 'blocked' | null",
      status,
    }).array(),
  }).array(),
  relationships: type({
    '+': 'reject',
    id: 'string',
    projectId: 'string',
    type: "'FS' | 'SS' | 'FF'",
    predecessor: endpoint,
    successor: endpoint,
  }).array(),
  graph: { '+': 'reject', nodes: historicalGraphNode.array(), edges: historicalGraphEdge.array() },
  ownership: type(['string', 'string']).array(),
  readiness: readiness.array(),
});
const history = type({ '+': 'reject', kind: "'local'" }).or(connected);
/** Captured component vocabulary; all fields required even when collections are empty. */
export type SavedDependencyHistory = Historical<typeof history.infer>;
/** Closed connected arm for converters; no live revisions or directories belong here. */
export type SavedConnectedDependencyHistory = Extract<
  SavedDependencyHistory,
  { kind: 'connected' }
>;
/** Captured member metadata and endpoint labels retain original identities after deletion. */
export type SavedDependencyProject = SavedConnectedDependencyHistory['projects'][number];
/** Authored selector scope survives independently of resolved leaf graph edges. */
export type SavedDependencyRelationship = SavedConnectedDependencyHistory['relationships'][number];
/** A graph node's captured execution facts, with no invented boundary node reading. */
export type SavedNodeReadiness = SavedConnectedDependencyHistory['readiness'][number];

/** Parse and detach required historical facts; throws SavedHistoryError for malformed or conflicting evidence. */
export function readSavedDependencyHistory(raw: unknown): SavedDependencyHistory {
  let captured: SavedDependencyHistory;
  try {
    // Codec evidence only: bypassing detach failed `detaches nested caller mutations`; save/read integration proof remains pending.
    captured = detachHistory(history.assert(detachHistory(raw)));
  } catch (cause) {
    if (cause instanceof SavedHistoryError) throw cause;
    throw new SavedHistoryError('shape', '$.dependencyHistory', { cause });
  }
  if (captured.kind === 'connected') validateDependencyReferences(captured);
  return captured;
}

/** Validate ownership and graph/readiness references without deriving live readiness or dates. */
export function validateDependencyReferences(captured: SavedConnectedDependencyHistory): void {
  const projects = indexHistory(captured.projects, (project) => project.projectId, '$.projects');
  requireHistory(projects.has(captured.targetProjectId), 'target', '$.targetProjectId');
  const rows = indexHistory(
    captured.projects.flatMap((project) =>
      project.workItems.map((row) => ({ ...row, projectId: project.projectId })),
    ),
    (row) => row.id,
    '$.workItems',
  );
  const owners = indexHistory(captured.ownership, ([id]) => id, '$.ownership');
  requireHistory(owners.size === rows.size, 'ownership', '$.ownership');
  for (const row of rows.values()) {
    requireHistory(owners.get(row.id)?.[1] === row.projectId, 'ownership', `$.ownership.${row.id}`);
    requireHistory(
      row.parentId === null || rows.get(row.parentId)?.projectId === row.projectId,
      'parent',
      `$.workItems.${row.id}`,
    );
  }
  for (const project of projects.values())
    indexHistory(project.steps, (entry) => entry.id, `$.projects.${project.projectId}.steps`);
  const relationships = indexHistory(
    captured.relationships,
    (relationship) => relationship.id,
    '$.relationships',
  );
  for (const relationship of relationships.values()) {
    requireHistory(
      relationship.projectId === relationship.successor.projectId,
      'relationship_owner',
      `$.relationships.${relationship.id}`,
    );
    for (const end of [relationship.predecessor, relationship.successor]) {
      const project = projects.get(end.projectId);
      const row = rows.get(end.workItemId);
      // Codec diagnostic only: omitting lookup changed `names the missing endpoint lookup boundary` to row.name TypeError; production proof remains pending.
      requireHistory(
        project !== undefined && row?.projectId === end.projectId,
        'endpoint_lookup',
        `$.relationships.${relationship.id}`,
      );
      requireHistory(
        end.name === row.name &&
          end.workItemNumber === row.number &&
          end.projectAbbreviation === project.abbreviation,
        'endpoint_label',
        `$.relationships.${relationship.id}`,
      );
      const isLeaf = !project.workItems.some((child) => child.parentId === row.id);
      requireHistory(end.isLeaf === isLeaf, 'endpoint_scope', `$.relationships.${relationship.id}`);
      if (end.scope === 'whole')
        requireHistory(
          end.stepNodeId === null,
          'endpoint_scope',
          `$.relationships.${relationship.id}`,
        );
      else {
        const ownStep = project.steps.find((entry) => entry.id === end.stepId);
        requireHistory(
          ownStep !== undefined && serializeHistory(ownStep) === serializeHistory(end.step),
          'endpoint_step',
          `$.relationships.${relationship.id}`,
        );
        requireHistory(
          end.scope === 'node'
            ? isLeaf && end.stepNodeId === `sn1.${row.id}.${end.stepId}`
            : !isLeaf && end.stepNodeId === null,
          'endpoint_scope',
          `$.relationships.${relationship.id}`,
        );
      }
    }
  }
  const nodes = indexHistory(captured.graph.nodes, graphNodeKey, '$.graph.nodes');
  const positions = indexHistory(
    captured.graph.nodes,
    (node) =>
      JSON.stringify([node.kind === 'step' ? node.ref.workItemId : node.workItemId, node.at]),
    '$.graph.positions',
  );
  for (const node of nodes.values()) {
    const rowId = node.kind === 'step' ? node.ref.workItemId : node.workItemId;
    const row = rows.get(rowId);
    requireHistory(row !== undefined, 'graph_owner', '$.graph.nodes');
    const project = projects.get(row.projectId);
    requireHistory(project !== undefined, 'graph_owner', '$.graph.nodes');
    requireHistory(Number.isInteger(node.at) && node.at >= 0, 'graph_position', '$.graph.nodes');
    requireHistory(
      node.kind === 'step'
        ? project.steps.some((entry) => entry.id === node.ref.stepId)
        : project.steps.length === 0,
      'graph_step',
      '$.graph.nodes',
    );
  }
  const expectedNodes = new Map<string, number>();
  for (const project of projects.values()) {
    const ownSteps = [...project.steps].sort(
      (left, right) => left.position - right.position || compareHistoryKeys(left.id, right.id),
    );
    for (const row of project.workItems) {
      if (project.workItems.some((child) => child.parentId === row.id)) continue;
      if (ownSteps.length === 0) expectedNodes.set(historicalSliceKey(row.id, null), 0);
      else
        for (const [at, step] of ownSteps.entries())
          expectedNodes.set(historicalSliceKey(row.id, step.id), at);
    }
  }
  requireHistory(
    nodes.size === expectedNodes.size &&
      [...nodes].every(([key, node]) => expectedNodes.get(key) === node.at),
    'graph_completeness',
    '$.graph.nodes',
  );
  const edges = new Set(captured.graph.edges.map((edge) => serializeHistory(edge)));
  requireHistory(edges.size === captured.graph.edges.length, 'duplicate', '$.graph.edges');
  for (const edge of captured.graph.edges) {
    requireHistory(
      [edge.predecessor, edge.successor].every((end) =>
        positions.has(JSON.stringify([end.leafId, end.at])),
      ),
      'graph_endpoint',
      '$.graph.edges',
    );
    if (edge.provenance === 'authored') {
      const relationship = relationships.get(edge.relationshipId);
      requireHistory(
        relationship?.type === edge.type &&
          owners.get(edge.predecessor.leafId)?.[1] === relationship.predecessor.projectId &&
          owners.get(edge.successor.leafId)?.[1] === relationship.successor.projectId,
        'graph_relationship',
        '$.graph.edges',
      );
    }
  }
  const readings = indexHistory(captured.readiness, (entry) => entry.key, '$.readiness');
  requireHistory(readings.size === nodes.size, 'readiness_keys', '$.readiness');
  const nodeIds = new Set(
    captured.graph.nodes.flatMap((node) =>
      node.kind === 'step' ? [`sn1.${node.ref.workItemId}.${node.ref.stepId}`] : [],
    ),
  );
  for (const reading of readings.values()) {
    const node = nodes.get(reading.key);
    requireHistory(
      node?.kind === reading.kind &&
        reading.key === historicalSliceKey(reading.workItemId, reading.stepId) &&
        owners.get(reading.workItemId)?.[1] === reading.projectId &&
        rows.get(reading.workItemId)?.status === reading.status,
      'readiness_identity',
      '$.readiness',
    );
    if (reading.kind === 'step')
      for (const root of reading.causes)
        requireHistory(
          root.kind === 'step' ? nodeIds.has(root.nodeId) : rows.has(root.workItemId),
          'readiness_cause',
          '$.readiness.causes',
        );
    for (const blocked of [
      ...reading.eligibility.startBlockers,
      ...reading.eligibility.finishBlockers,
    ])
      requireHistory(
        nodes.has(graphNodeKey(blocked.predecessor)) && edges.has(serializeHistory(blocked.edge)),
        'readiness_blocker',
        '$.readiness.eligibility',
      );
  }
  if (captured.placementState.kind === 'dependency_calendar_missing')
    for (const missing of captured.placementState.projects)
      requireHistory(
        projects.get(missing.projectId)?.name === missing.name &&
          projects.get(missing.projectId)?.abbreviation === missing.abbreviation,
        'calendar_project',
        '$.placementState',
      );
  if (captured.placementState.kind === 'engine_unavailable')
    for (const projectId of captured.placementState.projects)
      requireHistory(projects.has(projectId), 'engine_project', '$.placementState');
}

/** Frozen stable graph identity; graph positions remain a separate identity space. */
export function graphNodeKey(node: Historical<typeof historicalGraphNode.infer>): string {
  return node.kind === 'step'
    ? historicalSliceKey(node.ref.workItemId, node.ref.stepId)
    : historicalSliceKey(node.workItemId, null);
}

/** Encode detached captured evidence deterministically; original stage execution order belongs to schedule evidence. */
export function serializeSavedDependencyHistory(captured: SavedDependencyHistory): string {
  const checked = readSavedDependencyHistory(captured);
  if (checked.kind === 'local') return serializeHistory(checked);
  const byId = <Entry>(entries: readonly Entry[], keyOf: (entry: Entry) => string) =>
    [...entries].sort((left, right) => compareHistoryKeys(keyOf(left), keyOf(right)));
  return serializeHistory({
    ...checked,
    projects: byId(checked.projects, (project) => project.projectId),
    relationships: byId(checked.relationships, (relationship) => relationship.id),
    ownership: byId(checked.ownership, ([id]) => id),
    readiness: byId(checked.readiness, (entry) => entry.key),
    graph: {
      nodes: byId(checked.graph.nodes, graphNodeKey),
      edges: byId(checked.graph.edges, serializeHistory),
    },
  });
}
