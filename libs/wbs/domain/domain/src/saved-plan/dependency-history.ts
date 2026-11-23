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
  workPackageAbbreviation: 'string',
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
  workPackageId: 'string',
  workItemId: 'string',
  step: 'null',
}).or({
  '+': 'reject',
  ...label,
  scope: "'node' | 'descendant-step'",
  workPackageId: 'string',
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
  workPackageId: 'string',
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
    workPackages: type({
      '+': 'reject',
      workPackageId: 'string',
      abbreviation: 'string',
      name: 'string',
    }).array(),
  })
  .or({
    '+': 'reject',
    kind: "'engine_unavailable'",
    engine: "'optimized'",
    workPackages: 'string[]',
    reason: "'adapter_missing' | 'connected_optimization_not_supported'",
  })
  .or({ '+': 'reject', kind: "'unavailable'", reason: "'cycle' | 'calendar_range'" });
/** Closed captured fields retained by the original uniform history grammar. */
export const historicalConnectedHistoryShape = type({
  '+': 'reject',
  kind: "'connected'",
  targetWorkPackageId: 'string',
  mode: "'isolated' | 'shared'",
  placementState,
  workPackages: type({
    '+': 'reject',
    workPackageId: 'string',
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
    workPackageId: 'string',
    type: "'FS' | 'SS' | 'FF'",
    predecessor: endpoint,
    successor: endpoint,
  }).array(),
  graph: { '+': 'reject', nodes: historicalGraphNode.array(), edges: historicalGraphEdge.array() },
  ownership: type(['string', 'string']).array(),
  readiness: readiness.array(),
});
const history = type({ '+': 'reject', kind: "'local'" }).or(historicalConnectedHistoryShape);
/** Captured component vocabulary; all fields required even when collections are empty. */
export type SavedDependencyHistory = Historical<typeof history.infer>;
/** Closed connected arm for converters; no live revisions or directories belong here. */
export type SavedConnectedDependencyHistory = Extract<
  SavedDependencyHistory,
  { kind: 'connected' }
>;
/** Captured member metadata and endpoint labels retain original identities after deletion. */
export type SavedDependencyWorkPackage = SavedConnectedDependencyHistory['workPackages'][number];
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
  validateDependencyReferencesWithInventory(captured, (workPackage) =>
    [...workPackage.steps]
      .sort(
        (left, right) => left.position - right.position || compareHistoryKeys(left.id, right.id),
      )
      .map((entry) => entry.id),
  );
}

/**
 * Validates the common frozen references under an explicitly selected inventory.
 * Original readers supply their package-wide order; leaf-aware formats supply
 * separately validated captured lists. Absence must throw in that supplied lookup.
 */
export function validateDependencyReferencesWithInventory(
  captured: SavedConnectedDependencyHistory,
  readSteps: (workPackage: SavedDependencyWorkPackage, workItemId: string) => readonly string[],
): void {
  const workPackages = indexHistory(
    captured.workPackages,
    (workPackage) => workPackage.workPackageId,
    '$.workPackages',
  );
  requireHistory(workPackages.has(captured.targetWorkPackageId), 'target', '$.targetWorkPackageId');
  const rows = indexHistory(
    captured.workPackages.flatMap((workPackage) =>
      workPackage.workItems.map((row) => ({ ...row, workPackageId: workPackage.workPackageId })),
    ),
    (row) => row.id,
    '$.workItems',
  );
  const owners = indexHistory(captured.ownership, ([id]) => id, '$.ownership');
  requireHistory(owners.size === rows.size, 'ownership', '$.ownership');
  for (const row of rows.values()) {
    requireHistory(
      owners.get(row.id)?.[1] === row.workPackageId,
      'ownership',
      `$.ownership.${row.id}`,
    );
    requireHistory(
      row.parentId === null || rows.get(row.parentId)?.workPackageId === row.workPackageId,
      'parent',
      `$.workItems.${row.id}`,
    );
  }
  for (const workPackage of workPackages.values())
    indexHistory(
      workPackage.steps,
      (entry) => entry.id,
      `$.workPackages.${workPackage.workPackageId}.steps`,
    );
  const relationships = indexHistory(
    captured.relationships,
    (relationship) => relationship.id,
    '$.relationships',
  );
  for (const relationship of relationships.values()) {
    requireHistory(
      relationship.workPackageId === relationship.successor.workPackageId,
      'relationship_owner',
      `$.relationships.${relationship.id}`,
    );
    for (const end of [relationship.predecessor, relationship.successor]) {
      const workPackage = workPackages.get(end.workPackageId);
      const row = rows.get(end.workItemId);
      // Codec diagnostic only: omitting lookup changed `names the missing endpoint lookup boundary` to row.name TypeError; production proof remains pending.
      requireHistory(
        workPackage !== undefined && row?.workPackageId === end.workPackageId,
        'endpoint_lookup',
        `$.relationships.${relationship.id}`,
      );
      requireHistory(
        end.name === row.name &&
          end.workItemNumber === row.number &&
          end.workPackageAbbreviation === workPackage.abbreviation,
        'endpoint_label',
        `$.relationships.${relationship.id}`,
      );
      const isLeaf = !workPackage.workItems.some((child) => child.parentId === row.id);
      requireHistory(end.isLeaf === isLeaf, 'endpoint_scope', `$.relationships.${relationship.id}`);
      if (end.scope === 'whole')
        requireHistory(
          end.stepNodeId === null,
          'endpoint_scope',
          `$.relationships.${relationship.id}`,
        );
      else {
        const ownStep = workPackage.steps.find((entry) => entry.id === end.stepId);
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
    const workPackage = workPackages.get(row.workPackageId);
    requireHistory(workPackage !== undefined, 'graph_owner', '$.graph.nodes');
    requireHistory(Number.isInteger(node.at) && node.at >= 0, 'graph_position', '$.graph.nodes');
    const ownSteps = readSteps(workPackage, rowId);
    requireHistory(
      node.kind === 'step' ? ownSteps.includes(node.ref.stepId) : ownSteps.length === 0,
      'graph_step',
      '$.graph.nodes',
    );
  }
  const expectedNodes = new Map<string, number>();
  for (const workPackage of workPackages.values()) {
    for (const row of workPackage.workItems) {
      if (workPackage.workItems.some((child) => child.parentId === row.id)) continue;
      const ownSteps = readSteps(workPackage, row.id);
      if (ownSteps.length === 0) expectedNodes.set(historicalSliceKey(row.id, null), 0);
      else
        for (const [at, stepId] of ownSteps.entries())
          expectedNodes.set(historicalSliceKey(row.id, stepId), at);
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
          owners.get(edge.predecessor.leafId)?.[1] === relationship.predecessor.workPackageId &&
          owners.get(edge.successor.leafId)?.[1] === relationship.successor.workPackageId,
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
        owners.get(reading.workItemId)?.[1] === reading.workPackageId &&
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
    for (const missing of captured.placementState.workPackages)
      requireHistory(
        workPackages.get(missing.workPackageId)?.name === missing.name &&
          workPackages.get(missing.workPackageId)?.abbreviation === missing.abbreviation,
        'calendar_work_package',
        '$.placementState',
      );
  if (captured.placementState.kind === 'engine_unavailable')
    for (const workPackageId of captured.placementState.workPackages)
      requireHistory(workPackages.has(workPackageId), 'engine_work_package', '$.placementState');
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
    workPackages: byId(checked.workPackages, (workPackage) => workPackage.workPackageId),
    relationships: byId(checked.relationships, (relationship) => relationship.id),
    ownership: byId(checked.ownership, ([id]) => id),
    readiness: byId(checked.readiness, (entry) => entry.key),
    graph: {
      nodes: byId(checked.graph.nodes, graphNodeKey),
      edges: byId(checked.graph.edges, serializeHistory),
    },
  });
}
