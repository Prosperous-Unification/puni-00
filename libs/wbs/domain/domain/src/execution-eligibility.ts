import { sliceKey } from './schedule';
import type { StepNodeGraph, StepNodeGraphEdge, StepNodeGraphNode } from './slice-edges';

/** Intrinsic progress, independent of forecasts, priority and presentation proxy readings. */
export interface ExecutionEvidence {
  readonly started: boolean;
  readonly done: boolean;
}

/** The exact resolved prerequisite that prevents a governed transition. */
export interface ExecutionBlocker {
  readonly predecessor: StepNodeGraphNode;
  readonly edge: StepNodeGraphEdge;
}

/** Prerequisite permission; holds, claims, authority and resources remain separate guards. */
export interface ExecutionEligibility {
  readonly canStart: boolean;
  readonly canFinish: boolean;
  readonly startBlockers: readonly ExecutionBlocker[];
  readonly finishBlockers: readonly ExecutionBlocker[];
}

/** Resolve execution prerequisites over the authored graph using intrinsic captured evidence. */
export function executionEligibilityOf(
  graph: StepNodeGraph,
  evidence: ReadonlyMap<string, ExecutionEvidence>,
): ReadonlyMap<string, ExecutionEligibility> {
  const positions = new Map<
    string,
    {
      node: StepNodeGraphNode;
      key: string;
      facts: ExecutionEvidence;
      startBlockers: ExecutionBlocker[];
      finishBlockers: ExecutionBlocker[];
    }
  >();
  const keys = new Set<string>();
  for (const node of graph.nodes) {
    const leafId = node.kind === 'step' ? node.ref.workItemId : node.workItemId;
    const key = sliceKey(leafId, node.kind === 'step' ? node.ref.stepId : null);
    const position = JSON.stringify([leafId, node.at]);
    if (positions.has(position) || keys.has(key))
      throw new Error(`duplicate execution node ${key}`);
    const facts = evidence.get(key);
    if (facts === undefined) throw new Error(`missing execution evidence ${key}`);
    positions.set(position, { node, key, facts, startBlockers: [], finishBlockers: [] });
    keys.add(key);
  }
  for (const edge of graph.edges) {
    const predecessor = positions.get(
      JSON.stringify([edge.predecessor.leafId, edge.predecessor.at]),
    );
    const successor = positions.get(JSON.stringify([edge.successor.leafId, edge.successor.at]));
    if (predecessor === undefined || successor === undefined)
      throw new Error('execution edge endpoint is absent');
    const blocker = { predecessor: predecessor.node, edge };
    if (edge.type === 'FF') {
      if (!predecessor.facts.done) successor.finishBlockers.push(blocker);
    } else if (
      edge.type === 'FS'
        ? !predecessor.facts.done
        : !predecessor.facts.started && !predecessor.facts.done
    ) {
      successor.startBlockers.push(blocker);
    }
  }
  return new Map(
    [...positions.values()].map(({ key, startBlockers, finishBlockers }) => [
      key,
      {
        canStart: startBlockers.length === 0,
        canFinish: finishBlockers.length === 0,
        startBlockers,
        finishBlockers,
      },
    ]),
  );
}
