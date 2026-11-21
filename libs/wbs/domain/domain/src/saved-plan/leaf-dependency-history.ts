import { type } from 'arktype';

import type { LeafStepOrder } from '../leaf-step-order';
import {
  graphNodeKey,
  historicalConnectedHistoryShape,
  validateDependencyReferencesWithInventory,
} from './dependency-history';
import {
  compareHistoryKeys,
  detachHistory,
  type Historical,
  indexHistory,
  requireHistory,
  SavedHistoryError,
  serializeHistory,
} from './history-json';

// Proof: accepting undeclared history fields failed the root/member/leaf codec negatives (input13-fault-strict-history-shape-v1).
const leafSteps = type({ '+': 'reject', workItemId: 'string', stepIds: 'string[]' });
const connected = historicalConnectedHistoryShape.merge({
  '+': 'reject',
  workPackages: historicalConnectedHistoryShape
    .get('workPackages', 0)
    .exclude('undefined')
    .merge({
      '+': 'reject',
      leafSteps: leafSteps.array(),
    })
    .array(),
});
const history = type({ '+': 'reject', kind: "'local'" }).or(connected);

/** Captured own leaf inventories; only formats explicitly declaring leaf semantics may decode this grammar. */
export type SavedLeafDependencyHistory = Historical<typeof history.infer>;
export type SavedLeafConnectedHistory = Extract<SavedLeafDependencyHistory, { kind: 'connected' }>;
type Member = SavedLeafConnectedHistory['workPackages'][number];
type Relationship = SavedLeafConnectedHistory['relationships'][number];
type EdgeEnd = SavedLeafConnectedHistory['graph']['edges'][number]['predecessor'];

/**
 * Reads exact captured leaf inventories and their graph, without live bindings,
 * scheduling or predecessor-body conversion. Missing evidence never selects a
 * uniform interpretation. The original uniform reader remains independent.
 * @throws SavedHistoryError for shape, inventory or graph/reference contradictions.
 */
export function readLeafDependencyHistory(raw: unknown): SavedLeafDependencyHistory {
  let captured: SavedLeafDependencyHistory;
  try {
    captured = detachHistory(history.assert(detachHistory(raw)));
  } catch (cause) {
    if (cause instanceof SavedHistoryError) throw cause;
    throw new SavedHistoryError('shape', '$.dependencyHistory', { cause });
  }
  if (captured.kind === 'local') return captured;
  const orders = indexLeafSteps(captured);
  const readSteps = (workItemId: string): readonly string[] => {
    const ordered = orders.get(workItemId);
    // Proof: breaking the required own-list lookup failed the valid mixed-history read (input13-fault-own-lookup-v1); dependency/availability proof.
    requireHistory(ordered !== undefined, 'leaf_inventory', '$.workPackages.leafSteps');
    return ordered;
  };
  // Proof: supplying uniform policy IDs here failed the valid mixed/zero graph read (input13-fault-own-graph-v1).
  validateDependencyReferencesWithInventory(captured, (_workPackage, workItemId) =>
    readSteps(workItemId),
  );
  validateLeafEdges(captured, readSteps);
  return captured;
}

/** A complete leaf census precedes graph validation, including leaves with no step. */
function indexLeafSteps(captured: SavedLeafConnectedHistory): Map<string, readonly string[]> {
  const orders = new Map<string, readonly string[]>();
  for (const member of captured.workPackages) {
    for (const [workItemId, ordered] of indexCapturedLeafSteps(
      member.workItems,
      member.steps,
      member.leafSteps,
    )) {
      orders.set(workItemId, ordered);
    }
  }
  return orders;
}

/**
 * Validates a captured package's complete own leaf census and ordered policy identities.
 * Used by declared leaf-aware body grammars; original uniform readers never infer this model.
 * @throws SavedHistoryError for duplicate identities, broken ancestry or missing/foreign leaf entries.
 */
export function indexCapturedLeafSteps(
  workItems: readonly { readonly id: string; readonly parentId: string | null }[],
  steps: readonly { readonly id: string }[],
  leafSteps: readonly LeafStepOrder[],
): Map<string, readonly string[]> {
  validateCapturedTree(workItems);
  const parents = new Set(workItems.map((row) => row.parentId));
  const leaves = workItems.filter((row) => !parents.has(row.id));
  // Proof: bypassing this duplicate index admitted repeated leaf evidence (input13-fault-duplicate-leaf-v1).
  const declared = indexHistory(leafSteps, (leaf) => leaf.workItemId, '$.leafSteps');
  // Proof: omitting the census admitted missing, foreign and parent leaf entries in local input13 (input13-fault-census-v1).
  requireHistory(
    declared.size === leaves.length && leaves.every((leaf) => declared.has(leaf.id)),
    'leaf_inventory',
    '$.leafSteps',
  );
  const policies = indexHistory(steps, (step) => step.id, '$.steps');
  const orders = new Map<string, readonly string[]>();
  for (const leaf of declared.values()) {
    // Proof: omission admitted repeated and unknown own policy IDs (input13-fault-own-list-v1).
    requireHistory(
      new Set(leaf.stepIds).size === leaf.stepIds.length &&
        leaf.stepIds.every((stepId) => policies.has(stepId)),
      'leaf_step',
      '$.leafSteps',
    );
    orders.set(leaf.workItemId, leaf.stepIds);
  }
  return orders;
}

/** Validates every parent chain, including components with no relationships or leaves. */
function validateCapturedTree(
  workItems: readonly { readonly id: string; readonly parentId: string | null }[],
): void {
  const rows = indexHistory(workItems, (row) => row.id, '$.workItems');
  const complete = new Set<string>();
  for (const first of rows.values()) {
    const chain = new Set<string>();
    let current = first;
    while (!complete.has(current.id)) {
      // Proof: replacing refusal with a bounded break admitted a parent cycle with no graph (input13-fault-cycle-v1).
      requireHistory(!chain.has(current.id), 'parent_cycle', '$.workItems');
      chain.add(current.id);
      if (current.parentId === null) break;
      const parent = rows.get(current.parentId);
      // Proof: omission lost the modeled parent refusal to a later native error (input13-fault-parent-v1); diagnostic proof only.
      requireHistory(parent !== undefined, 'parent', '$.workItems');
      current = parent;
    }
    for (const id of chain) complete.add(id);
  }
}

/** Traverse an already validated captured tree without the live tree implementation. */
function readDescendants(member: Member, workItemId: string): string[] {
  const visit = (id: string): string[] => {
    const children = member.workItems.filter((row) => row.parentId === id);
    const leaves = children.length === 0 ? [id] : children.flatMap((child) => visit(child.id));
    return leaves;
  };
  return visit(workItemId);
}

/** Relationship scope selects positions in declared own lists, including whole boundaries. */
function readEndpointPositions(
  captured: SavedLeafConnectedHistory,
  relationship: Relationship,
  side: 'predecessor' | 'successor',
  readSteps: (workItemId: string) => readonly string[],
): EdgeEnd[] {
  const endpoint = relationship[side];
  const member = captured.workPackages.find(
    (candidate) => candidate.workPackageId === endpoint.workPackageId,
  );
  // Proof: breaking the member lookup failed valid mixed history before traversal (input13-fault-endpoint-lookup-v1); dependency/availability proof.
  requireHistory(member !== undefined, 'endpoint_lookup', '$.relationships');
  const leaves = readDescendants(member, endpoint.workItemId);
  if (endpoint.scope === 'whole') {
    const last =
      (side === 'predecessor' && relationship.type !== 'SS') ||
      (side === 'successor' && relationship.type === 'FF');
    return leaves.map((leafId) => ({
      leafId,
      at: last ? Math.max(0, readSteps(leafId).length - 1) : 0,
    }));
  }
  const positions = leaves.flatMap((leafId) => {
    const at = readSteps(leafId).indexOf(endpoint.stepId);
    return at < 0 ? [] : [{ leafId, at }];
  });
  // Proof: omission admitted an unresolved node and both no-matching-descendant selectors (input13-fault-endpoint-resolution-v1).
  requireHistory(positions.length > 0, 'endpoint_step_resolution', '$.relationships');
  return positions;
}

/** Complete workflow chains and authored selector pairs retain every captured constraint. */
function validateLeafEdges(
  captured: SavedLeafConnectedHistory,
  readSteps: (workItemId: string) => readonly string[],
): void {
  const workflowKey = (before: EdgeEnd, after: EdgeEnd) =>
    JSON.stringify([before.leafId, before.at, after.leafId, after.at]);
  const workflow = new Set<string>();
  for (const member of captured.workPackages)
    for (const leaf of member.leafSteps)
      for (let at = 1; at < leaf.stepIds.length; at += 1)
        workflow.add(
          workflowKey({ leafId: leaf.workItemId, at: at - 1 }, { leafId: leaf.workItemId, at }),
        );
  const capturedWorkflow = captured.graph.edges.filter((edge) => edge.provenance === 'workflow');
  // Proof: omission admitted a missing workflow chain edge (input13-fault-workflow-v1).
  requireHistory(
    capturedWorkflow.length === workflow.size &&
      capturedWorkflow.every((edge) => workflow.has(workflowKey(edge.predecessor, edge.successor))),
    'graph_workflow',
    '$.graph.edges',
  );
  const authoredKey = (relationshipId: string, before: EdgeEnd, after: EdgeEnd) =>
    JSON.stringify([relationshipId, before.leafId, before.at, after.leafId, after.at]);
  const expected = new Set<string>();
  for (const relationship of captured.relationships) {
    const before = readEndpointPositions(captured, relationship, 'predecessor', readSteps);
    const after = readEndpointPositions(captured, relationship, 'successor', readSteps);
    for (const predecessor of before)
      for (const successor of after)
        expected.add(authoredKey(relationship.id, predecessor, successor));
  }
  const authored = captured.graph.edges.filter((edge) => edge.provenance === 'authored');
  // Proof: omission admitted an edge from a descendant outside the authored selector (input13-fault-authored-resolution-v1).
  requireHistory(
    authored.every((edge) =>
      expected.has(authoredKey(edge.relationshipId, edge.predecessor, edge.successor)),
    ),
    'graph_relationship_resolution',
    '$.graph.edges',
  );
  // Proof: omission admitted a missing authored selector pair (input13-fault-authored-completeness-v1).
  requireHistory(
    authored.length === expected.size,
    'graph_relationship_completeness',
    '$.graph.edges',
  );
}

/** Canonicalizes identity sets while preserving each leaf's meaningful step order. */
export function serializeLeafDependencyHistory(raw: unknown): string {
  const captured = readLeafDependencyHistory(raw);
  if (captured.kind === 'local') return serializeHistory(captured);
  const byKey = <Entry>(entries: readonly Entry[], keyOf: (entry: Entry) => string) =>
    [...entries].sort((left, right) => compareHistoryKeys(keyOf(left), keyOf(right)));
  return serializeHistory({
    ...captured,
    workPackages: byKey(captured.workPackages, (member) => member.workPackageId).map((member) => ({
      ...member,
      leafSteps: byKey(member.leafSteps, (leaf) => leaf.workItemId),
      workItems: byKey(member.workItems, (row) => row.id),
      steps: byKey(member.steps, (step) => step.id),
    })),
    relationships: byKey(captured.relationships, (relationship) => relationship.id),
    ownership: byKey(captured.ownership, ([id]) => id),
    readiness: byKey(captured.readiness, (reading) => reading.key),
    graph: {
      nodes: byKey(captured.graph.nodes, graphNodeKey),
      edges: byKey(captured.graph.edges, serializeHistory),
    },
  });
}
