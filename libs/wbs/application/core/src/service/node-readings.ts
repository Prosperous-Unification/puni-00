import {
  type BlockageRoot,
  formatStepNodeId,
  type Hold,
  type NodeFacts,
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
 * blockage outside the step graph: each is malformed trusted state. Stored
 * cycles converge over the finite root set; the schedule reports its existing
 * cycle refusal while the plan remains readable. Write-time cycle guards remain
 * in `DependencyGraphGuard`.
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
    // position was silently projected instead of refused. Independently,
    // nodes.has removed made distinct identities at one position fail its
    // refusal negative (did not throw); both watched 2026-10-13.
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

  const stepIds = new Set(
    graph.nodes.flatMap((node) => (node.kind === 'step' ? [node.ref.stepId] : [])),
  );
  for (const said of stated) {
    // Proof: owner guard removed; unknown-progress-owner negative silently
    // dropped its statement instead of throwing; watched 2026-10-13.
    // The live tree negative also resolved after this guard was disabled.
    if (!holdOf.has(said.workItemId) || !statusOf.has(said.workItemId)) {
      throw new Error(`progress for unknown work item ${said.workItemId}`);
    }
    // Proof: step guard removed; unknown-progress-step negative silently
    // dropped its statement instead of throwing; watched 2026-10-13.
    // The live tree negative resolved after this guard was disabled.
    if (!stepIds.has(said.stepId)) throw new Error(`progress for unknown step ${said.stepId}`);
  }
  // Historical moves could leave progress on a known parent. Preserve that
  // stored statement and the existing row fold; only leaf nodes are projected.
  // Proof: requiring every statement identity in the leaf graph made both
  // migrated-parent live read modes return 500 instead of 200; watched 2026-10-13.
  const statementOf = new Map(stated.map((said) => [formatStepNodeId(said), said.state]));
  const runningIds = new Set(running.map(formatStepNodeId));
  interface ProjectedNode {
    readonly node: StepNodeGraphNode;
    readonly facts: NodeFacts;
    readonly intrinsic: NodeReading;
    readonly roots: Map<string, BlockageRoot>;
    readonly successors: ProjectedNode[];
    readonly predecessors: ProjectedNode[];
  }
  const projected = new Map<string, ProjectedNode>();
  for (const node of nodes.values()) {
    const leafId = node.kind === 'step' ? node.ref.workItemId : node.workItemId;
    const rowHold = holdOf.get(leafId);
    const rowStatus = statusOf.get(leafId);
    // Proof: row-fact refusal removed; missing-row negative did not throw
    // for absent hold and absent status maps; watched 2026-10-13.
    if (rowHold === undefined || rowStatus === undefined) {
      throw new Error(`leaf ${leafId} has a step node and no row on this plan`);
    }
    const identity = node.kind === 'step' ? formatStepNodeId(node.ref) : null;
    const facts: NodeFacts = {
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
      blockedByProxy: false,
      predecessors: [],
    };
    const intrinsic = nodeReadingOf(facts);
    const roots = new Map<string, BlockageRoot>();
    if (intrinsic === 'blocked' || intrinsic === 'on_hold') {
      const root: BlockageRoot =
        identity === null
          ? { kind: 'work-item', workItemId: leafId }
          : { kind: 'step', nodeId: identity };
      roots.set(identity ?? `work-item.${leafId}`, root);
    }
    projected.set(keyOf(node), { node, facts, intrinsic, roots, successors: [], predecessors: [] });
  }
  for (const edge of graph.edges) {
    const predecessorKey = formatKey(edge.predecessor);
    const successorKey = formatKey(edge.successor);
    const predecessor = projected.get(predecessorKey);
    const successor = projected.get(successorKey);
    // Proof: predecessor guard removed; absent-predecessor negative received
    // a TypeError instead of the named missing-node refusal; watched 2026-10-13.
    if (predecessor === undefined) {
      throw new Error(`a step-node edge names ${predecessorKey}, which is no step node`);
    }
    // Proof: successor guard removed; absent-successor negative received
    // function did not throw instead of the named refusal; watched 2026-10-13.
    if (successor === undefined) {
      throw new Error(`a step-node edge names ${successorKey}, which is no step node`);
    }
    predecessor.successors.push(successor);
    // Proof: legacy filter removed; legacy predecessor negative read
    // waiting instead of unknown; watched 2026-10-13.
    if (edge.provenance !== 'legacy') successor.predecessors.push(predecessor);
  }

  // A stored cycle is a modeled unschedulable plan, not an unreadable one.
  // Each root enters each silent node at most once. Requeue only after a new
  // root, so even cyclic topology converges in at most nodes × roots additions.
  // Intrinsic done/running/held/blocked readings never accept incoming roots.
  // Proof: a cycle refusal reintroduced made the main tree caller throw
  // instead of returning its readable unscheduled plan; watched 2026-10-13.
  const pending = [...projected.values()].filter((projection) => projection.roots.size > 0);
  for (const predecessor of pending) {
    for (const successor of predecessor.successors) {
      if (successor.intrinsic !== 'unknown') continue;
      let changed = false;
      for (const [identity, root] of predecessor.roots) {
        // Proof: this deduplication removed; external-root silent-cycle test
        // did not terminate within 5s and its process was killed; watched 2026-10-13.
        if (successor.roots.has(identity)) continue;
        successor.roots.set(identity, root);
        changed = true;
      }
      // Proof: forwarding removed; direct-hold and external-root cycle tests
      // lost downstream causes and failed; watched 2026-10-13.
      if (changed) pending.push(successor);
    }
  }

  const byLeaf = new Map<string, Record<string, NodeReading>>();
  const causesByLeaf = new Map<string, Record<string, readonly BlockageRoot[]>>();
  for (const projection of projected.values()) {
    const { node, facts, roots } = projection;
    const leafId = node.kind === 'step' ? node.ref.workItemId : node.workItemId;
    const own = byLeaf.get(leafId) ?? {};
    const ownCauses = causesByLeaf.get(leafId) ?? {};
    const reading = nodeReadingOf({
      ...facts,
      // Proof: OR rowStatus === blocked_by_proxy added; both live read modes
      // incorrectly proxied a done sibling endpoint's successor; watched 2026-10-13.
      blockedByProxy: roots.size > 0,
      // Only intrinsic done can make a predecessor done; waiting and proxy
      // cannot. Reading these fixed facts avoids recursion even in a cycle.
      predecessors: projection.predecessors.map((predecessor) => predecessor.intrinsic),
    });
    if (node.kind === 'step') {
      own[node.ref.stepId] = reading;
      ownCauses[node.ref.stepId] = [...roots]
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([, root]) => root);
    }
    byLeaf.set(leafId, own);
    causesByLeaf.set(leafId, ownCauses);
  }
  return { readings: byLeaf, causes: causesByLeaf };
}
