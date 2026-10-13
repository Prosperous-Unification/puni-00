import {
  formatStepNodeId,
  type Hold,
  type NodeReading,
  nodeReadingOf,
  type SliceEdgeEnd,
  type StepNodeGraph,
  type StepNodeGraphNode,
  type StepNodeRef,
  type StepState,
  type WorkItemStatus,
} from '@wbs/domain';

/** What {@link nodeReadingsOf} reads each leaf's nodes from. */
export interface NodeReadingInputs {
  /** Complete unreduced topology, including legacy joins and stepless boundaries. */
  readonly graph: StepNodeGraph;
  /** Every row's hold, by id; a leaf absent here is trusted state gone missing. */
  readonly holdOf: ReadonlyMap<string, Hold | null>;
  /** Every row's derived status; proxy status never supplies a node's proxy. */
  readonly statusOf: ReadonlyMap<string, WorkItemStatus>;
  /** Every stored statement, as `step_progress` holds them. */
  readonly stated: readonly (StepNodeRef & { readonly state: StepState })[];
  /** The nodes holding a running attempt. */
  readonly running: readonly StepNodeRef[];
  /** Sparse direct blockage facts, independent of progress (ADR 0053). */
  readonly blocked: readonly StepNodeRef[];
}

/** A root of informational stoppage; a stepless hold has no fabricated step identity. */
export type BlockageRoot =
  | { readonly kind: 'step'; readonly nodeId: string }
  | { readonly kind: 'work-item'; readonly workItemId: string };

/** Canonical readings and their deduplicated roots, keyed by leaf and project step. */
export interface NodeReadingProjection {
  readonly readings: Map<string, Record<string, NodeReading>>;
  readonly causes: Map<string, Record<string, readonly BlockageRoot[]>>;
}

/**
 * Every leaf's canonical readings in project step order, including empty maps
 * for stepless leaves. {@link projectNodeReadings} owns the shared traversal.
 */
export function nodeReadingsOf(
  inputs: NodeReadingInputs,
): Map<string, Record<string, NodeReading>> {
  return projectNodeReadings(inputs).readings;
}

/**
 * Projects canonical node readings and root causes over the complete graph.
 * All directed FS/SS/FF edges carry informational stoppage, including legacy
 * joins; only workflow/authored predecessors supply the existing waiting rule.
 * A running or done node stops incoming causes. Row proxy status never spreads
 * a sibling's blockage into an unrelated step (ADR 0053).
 *
 * Stepless boundaries carry row holds through traversal and remain internal.
 * Causes are stable step-node IDs, or work-item IDs for stepless hold roots;
 * their order is bytewise and does not depend on edge insertion order.
 *
 * @throws for duplicate nodes, absent edge endpoints, absent row facts, direct
 * blockage outside the step graph or a cycle: each is malformed trusted state.
 */
export function projectNodeReadings({
  graph,
  holdOf,
  statusOf,
  stated,
  running,
  blocked,
}: NodeReadingInputs): NodeReadingProjection {
  const formatKey = (end: SliceEdgeEnd): string => `${end.leafId}#${String(end.at)}`;
  const keyOf = (node: StepNodeGraphNode): string =>
    formatKey({
      leafId: node.kind === 'step' ? node.ref.workItemId : node.workItemId,
      at: node.at,
    });
  const nodes = new Map<string, StepNodeGraphNode>();
  const identities = new Set<string>();
  for (const node of graph.nodes) {
    const key = keyOf(node);
    const identity =
      node.kind === 'step' ? formatStepNodeId(node.ref) : `boundary.${node.workItemId}`;
    // Proof: identity guard removed; duplicate identity at another graph
    // position was silently projected instead of refused; watched 2026-10-13.
    if (nodes.has(key) || identities.has(identity))
      throw new Error(`duplicate step node ${identity}`);
    nodes.set(key, node);
    identities.add(identity);
  }
  const blockedIds = new Set<string>();
  for (const ref of blocked) {
    const identity = formatStepNodeId(ref);
    // Proof: reference guard removed; nonexistent step blockage disappeared
    // without throwing in the reference negative; watched 2026-10-13.
    if (!identities.has(identity)) throw new Error(`blockage ${identity} has no step node`);
    blockedIds.add(identity);
  }

  const predecessorsOf = new Map<string, { readonly key: string; readonly isLegacy: boolean }[]>();
  for (const edge of graph.edges) {
    for (const endpoint of [edge.predecessor, edge.successor]) {
      const key = formatKey(endpoint);
      // Proof: endpoint guard removed; absent successor never traversed and
      // the absent-successor negative did not throw; watched 2026-10-13.
      if (!nodes.has(key)) throw new Error(`a step-node edge names ${key}, which is no step node`);
    }
    const into = formatKey(edge.successor);
    predecessorsOf.set(into, [
      ...(predecessorsOf.get(into) ?? []),
      { key: formatKey(edge.predecessor), isLegacy: edge.provenance === 'legacy' },
    ]);
  }
  const stepIds = new Set(
    graph.nodes.flatMap((node) => (node.kind === 'step' ? [node.ref.stepId] : [])),
  );
  for (const said of stated) {
    // Proof: owner guard removed; unknown-progress-owner negative silently
    // dropped its statement instead of throwing; watched 2026-10-13.
    if (!holdOf.has(said.workItemId) || !statusOf.has(said.workItemId)) {
      throw new Error(`progress for unknown work item ${said.workItemId}`);
    }
    // Proof: step guard removed; unknown-progress-step negative silently
    // dropped its statement instead of throwing; watched 2026-10-13.
    if (!stepIds.has(said.stepId)) throw new Error(`progress for unknown step ${said.stepId}`);
  }
  // Historical moves could leave progress on a known parent. Preserve that
  // stored statement and the existing row fold; only leaf nodes are projected.
  // Proof: requiring every statement identity in the leaf graph made both
  // migrated-parent live read modes return 500 instead of 200; watched 2026-10-13.
  const statementOf = new Map(stated.map((said) => [formatStepNodeId(said), said.state]));
  const runningIds = new Set(running.map(formatStepNodeId));
  interface ProjectedNode {
    readonly reading: NodeReading;
    readonly roots: readonly BlockageRoot[];
  }
  const projected = new Map<string, ProjectedNode>();
  const asking = new Set<string>();
  const formatRoot = (root: BlockageRoot): string =>
    root.kind === 'step' ? root.nodeId : `work-item.${root.workItemId}`;
  const projectNode = (key: string): ProjectedNode => {
    const known = projected.get(key);
    if (known !== undefined) return known;
    const node = nodes.get(key);
    if (node === undefined) throw new Error(`a step-node edge names ${key}, which is no step node`);
    // Proof: cycle guard removed; circle negative received Maximum call stack
    // size exceeded instead of the named circle; watched 2026-10-13.
    if (asking.has(key)) throw new Error(`the step-node graph runs in a circle through ${key}`);
    asking.add(key);
    const leafId = node.kind === 'step' ? node.ref.workItemId : node.workItemId;
    const rowHold = holdOf.get(leafId);
    const rowStatus = statusOf.get(leafId);
    // Proof: row-fact refusal removed; missing-row negative did not throw
    // for absent hold and absent status maps; watched 2026-10-13.
    if (rowHold === undefined || rowStatus === undefined) {
      throw new Error(`leaf ${leafId} has a step node and no row on this plan`);
    }
    const incoming = (predecessorsOf.get(key) ?? []).map((predecessor) => ({
      ...predecessor,
      projection: projectNode(predecessor.key),
    }));
    const roots = new Map<string, BlockageRoot>();
    for (const predecessor of incoming) {
      for (const root of predecessor.projection.roots) roots.set(formatRoot(root), root);
    }
    const identity = node.kind === 'step' ? formatStepNodeId(node.ref) : null;
    const reading = nodeReadingOf({
      participation: null,
      statement:
        identity === null
          ? rowStatus === 'done' || rowStatus === 'in_progress'
            ? rowStatus
            : null
          : (statementOf.get(identity) ?? null),
      rowHold,
      isBlocked: identity !== null && blockedIds.has(identity),
      // Proof: attempt lookup replaced with false; running barrier negative
      // read blocked_by_proxy instead of in_progress; watched 2026-10-13.
      runningAttempt: identity !== null && runningIds.has(identity),
      // Proof: OR rowStatus === blocked_by_proxy added; both live read modes
      // incorrectly proxied a done sibling endpoint's successor; watched 2026-10-13.
      blockedByProxy: roots.size > 0,
      // Proof: legacy filter removed; legacy predecessor negative read
      // waiting instead of unknown; watched 2026-10-13.
      predecessors: incoming
        .filter((predecessor) => !predecessor.isLegacy)
        .map((predecessor) => predecessor.projection.reading),
    });
    let ownRoots: readonly BlockageRoot[] = [];
    if (reading === 'blocked' || reading === 'on_hold') {
      ownRoots = [
        identity === null
          ? { kind: 'work-item', workItemId: leafId }
          : { kind: 'step', nodeId: identity },
      ];
    } else if (reading === 'blocked_by_proxy') {
      ownRoots = [...roots]
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([, root]) => root);
    }
    asking.delete(key);
    const projection = { reading, roots: ownRoots };
    projected.set(key, projection);
    return projection;
  };

  const byLeaf = new Map<string, Record<string, NodeReading>>();
  const causesByLeaf = new Map<string, Record<string, readonly BlockageRoot[]>>();
  for (const node of graph.nodes) {
    const leafId = node.kind === 'step' ? node.ref.workItemId : node.workItemId;
    const own = byLeaf.get(leafId) ?? {};
    const ownCauses = causesByLeaf.get(leafId) ?? {};
    const key = keyOf(node);
    const { reading, roots } = projectNode(key);
    if (node.kind === 'step') {
      own[node.ref.stepId] = reading;
      ownCauses[node.ref.stepId] = roots;
    }
    byLeaf.set(leafId, own);
    causesByLeaf.set(leafId, ownCauses);
  }
  return { readings: byLeaf, causes: causesByLeaf };
}
