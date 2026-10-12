import {
  type Hold,
  type NodeReading,
  nodeReadingOf,
  type SliceEdgeEnd,
  type StepNodeGraph,
  type StepNodeRef,
  type StepState,
  type WorkItemStatus,
} from '@wbs/domain';

/** What {@link nodeReadingsOf} reads each leaf's nodes from. */
export interface NodeReadingInputs {
  /** The project's resolved step-node graph; its legacy joins are not read. */
  readonly graph: StepNodeGraph;
  /** Every row's hold, by id; a leaf absent here is trusted state gone missing. */
  readonly holdOf: ReadonlyMap<string, Hold | null>;
  /** Every row's derived status, by id, `blocked_by_proxy` already applied. */
  readonly statusOf: ReadonlyMap<string, WorkItemStatus>;
  /** Every stored statement, as `step_progress` holds them. */
  readonly stated: readonly (StepNodeRef & { readonly state: StepState })[];
  /** The nodes holding a running attempt. */
  readonly running: readonly StepNodeRef[];
}

/**
 * Every leaf's node readings by step id, in step order, from
 * {@link nodeReadingOf} over the resolved step-node graph
 * (`step-node-readings` D1, D3).
 *
 * A node's predecessors are the nodes with a **workflow** or **authored** edge
 * into it — the leaf's own previous step, and any typed dependency resolved
 * onto it — never a re-derived step order. Legacy joins are a leaf-level
 * reach rule, not a hand-off between nodes, and are not read. Participation is
 * not stored yet (010.4.13.3), so it is `null` and no node reads `skipped`.
 *
 * Readings are memoised and asked in dependency order, a predecessor before
 * its successor, across leaves. A stepless project's boundary nodes have no
 * step and no reading, so its leaves answer an empty map.
 *
 * @throws when the workflow and authored edges close a cycle (the dependency
 * guard refuses every write that would), when an edge names a node the graph
 * does not hold, or when a leaf has no hold or no status in the inputs: each is
 * trusted state that moved underneath the read.
 */
export function nodeReadingsOf({
  graph,
  holdOf,
  statusOf,
  stated,
  running,
}: NodeReadingInputs): Map<string, Record<string, NodeReading>> {
  const formatKey = (end: SliceEdgeEnd): string => `${end.leafId}#${String(end.at)}`;
  const refOf = new Map<string, StepNodeRef>();
  for (const node of graph.nodes) {
    if (node.kind === 'step')
      refOf.set(formatKey({ leafId: node.ref.workItemId, at: node.at }), node.ref);
  }
  // Proof: predecessors taken from step order (the previous node in the same
  // leaf) instead of these edges and `reads readings per node from the
  // resolved step graph` failed in both modes on the authored edge's
  // successor, `- "waiting"` / `+ "unknown"`; watched 2026-10-12.
  const predecessorsOf = new Map<string, string[]>();
  for (const edge of graph.edges) {
    // Proof: this skip removed and `never reads a legacy join as a
    // predecessor` failed on `b`'s Dev, `- "unknown"` / `+ "waiting"`; watched
    // 2026-10-12.
    if (edge.provenance === 'legacy') continue;
    const into = formatKey(edge.successor);
    predecessorsOf.set(into, [...(predecessorsOf.get(into) ?? []), formatKey(edge.predecessor)]);
  }
  const statementOf = new Map<string, Map<string, StepState>>();
  for (const said of stated) {
    const byStep = statementOf.get(said.workItemId) ?? new Map<string, StepState>();
    byStep.set(said.stepId, said.state);
    statementOf.set(said.workItemId, byStep);
  }
  const runningOf = new Map<string, Set<string>>();
  for (const attempt of running) {
    runningOf.set(
      attempt.workItemId,
      new Set([...(runningOf.get(attempt.workItemId) ?? []), attempt.stepId]),
    );
  }

  const readings = new Map<string, NodeReading>();
  const asking = new Set<string>();
  const readingFor = (key: string): NodeReading => {
    const known = readings.get(key);
    if (known !== undefined) return known;
    const ref = refOf.get(key);
    // Proof: answered `unknown` here instead and `throws on an edge naming a
    // node the graph does not hold` failed on `Received function did not
    // throw`; watched 2026-10-12.
    if (ref === undefined) throw new Error(`a step-node edge names ${key}, which is no step node`);
    // Proof: removed and `throws on a circle the workflow and authored edges
    // close` failed on `Received message: "Maximum call stack size
    // exceeded."`; watched 2026-10-12.
    if (asking.has(key)) throw new Error(`the step-node graph runs in a circle through ${key}`);
    asking.add(key);
    const leafId = ref.workItemId;
    const rowHold = holdOf.get(leafId);
    const rowStatus = statusOf.get(leafId);
    // Proof: this refusal removed and `throws on a leaf with no row on the
    // plan` failed on `Received function did not throw`; watched 2026-10-12.
    if (rowHold === undefined || rowStatus === undefined) {
      throw new Error(`leaf ${leafId} has a step node and no row on this plan`);
    }
    const reading = nodeReadingOf({
      participation: null,
      statement: statementOf.get(leafId)?.get(ref.stepId) ?? null,
      rowHold,
      runningAttempt: runningOf.get(leafId)?.has(ref.stepId) ?? false,
      rowBlockedByProxy: rowStatus === 'blocked_by_proxy',
      predecessors: (predecessorsOf.get(key) ?? []).map(readingFor),
    });
    asking.delete(key);
    readings.set(key, reading);
    return reading;
  };

  const byLeaf = new Map<string, Record<string, NodeReading>>();
  for (const node of graph.nodes) {
    const leafId = node.kind === 'step' ? node.ref.workItemId : node.workItemId;
    const own = byLeaf.get(leafId) ?? {};
    if (node.kind === 'step') own[node.ref.stepId] = readingFor(formatKey({ leafId, at: node.at }));
    byLeaf.set(leafId, own);
  }
  return byLeaf;
}
