import { formatStepNodeId, orderSteps, type StepNodeRef } from '@wbs/domain';
import {
  discoverValidateAndCaptureDag,
  type MaterializedDagTraversalInput,
  materializeMultiEntryDagInputFromRecordCatalog,
  type ValidatedReusableDagTopology,
} from 'configurable-tree-traversal';

/**
 * Materializes a leaf's compatibility sequence using WBS identities and display order.
 * Each step after the first explicitly awaits its predecessor's work, independently of
 * structural discovery. Only the first node has no predecessor. An empty catalog
 * contains no step nodes.
 */
export function materializeOrderedSteps(
  workItemId: string,
  steps: readonly { id: string; position: number }[],
): MaterializedDagTraversalInput<StepNodeRef, string> {
  const predecessors = new Map<StepNodeRef, string>();
  let previous: string | undefined;
  const nodes = orderSteps(steps).map((step) => {
    const node: StepNodeRef = { workItemId, stepId: step.id };
    if (previous !== undefined) predecessors.set(node, previous);
    previous = formatStepNodeId(node);
    return node;
  });
  return materializeMultiEntryDagInputFromRecordCatalog(nodes, {
    selectVertexId: formatStepNodeId,
    selectWorkPrerequisiteVertexIds: (node) => {
      const predecessor = predecessors.get(node);
      return predecessor === undefined ? [] : [predecessor];
    },
  });
}

/**
 * Validates the entire native catalog before exposing sessions or executable work.
 * Throws on invalid topology; source exceptions retain their identity. Preparation and
 * subsequent inspection register no workflow visitors. Native W/C milestones stay distinct.
 */
export function prepareCoordination(
  input: MaterializedDagTraversalInput<StepNodeRef, string>,
): ValidatedReusableDagTopology<StepNodeRef, string> {
  // Proof: omitting CTT's validateDiscoveredGraph call exposed prepared DAGs for a
  // disconnected cycle, absent prerequisite and milestone cycle; the three production
  // refusal tests failed with "Received function did not throw" (2026-10-31); skipping the
  // `invalid` refusal below failed the same three tests on CTT 0.13 (2026-11-04).
  const preparation = discoverValidateAndCaptureDag(input);
  if (preparation.kind === 'invalid') {
    throw new Error('Invalid coordination topology', { cause: preparation.issues });
  }
  return preparation.validatedTopology;
}
