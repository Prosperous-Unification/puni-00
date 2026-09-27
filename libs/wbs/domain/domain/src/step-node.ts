/**
 * A step node: one leaf work item's occurrence of one project step (ADR 0031).
 *
 * The domain value is the pair, and nothing else. A step node has no row of its
 * own — it exists for every leaf and step whether or not any fact is stored for
 * it — so there is nothing to look up but the two ids.
 */
export interface StepNodeRef {
  workItemId: string;
  stepId: string;
}

/**
 * The version of the step node ID encoding. A later encoding gets a new prefix
 * and can coexist, which is why {@link parseStepNodeId} refuses any other.
 */
const STEP_NODE_ID_PREFIX = 'sn1';

/** What be-01 mints ids as: `crypto.randomUUID()`, lowercase and hyphenated. */
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * A step node's stable identity on the wire: `sn1.<workItemId>.<stepId>`.
 *
 * Unchanged by renumbering, reparenting while the work item stays a leaf, step
 * rename or step reorder, because it holds neither a number nor a code nor a
 * position. Both parts are UUIDs, whose spelling has no dot, so the separator is
 * unambiguous. Not an access path: whoever resolves it checks the project.
 */
export function formatStepNodeId(ref: StepNodeRef): string {
  return `${STEP_NODE_ID_PREFIX}.${ref.workItemId}.${ref.stepId}`;
}

/** Why a string is not a step node ID, before anything is looked up. */
export type StepNodeIdDefect = 'unknown_encoding' | 'malformed';

/**
 * Reads a step node ID back into its pair, or says why it is not one.
 *
 * Structure only: whether the work item and step exist, share a project and
 * make a leaf's node is the caller's question, answered against the store.
 */
export function parseStepNodeId(
  text: string,
): { ok: true; ref: StepNodeRef } | { ok: false; reason: StepNodeIdDefect } {
  const parts = text.split('.');
  const [prefix, workItemId, stepId] = parts;
  if (prefix !== STEP_NODE_ID_PREFIX && /^sn[0-9]+$/.test(prefix)) {
    return { ok: false, reason: 'unknown_encoding' };
  }
  if (parts.length !== 3 || prefix !== STEP_NODE_ID_PREFIX)
    return { ok: false, reason: 'malformed' };
  if (!ID.test(workItemId) || !ID.test(stepId)) return { ok: false, reason: 'malformed' };
  return { ok: true, ref: { workItemId, stepId } };
}

/** Bytewise, the tie-break the store's `ORDER BY position, id` uses. */
function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Steps in displayed order: position, then id bytewise — the store's
 * `ORDER BY position, id`. The one ordering step nodes, ordinals and the
 * address revision are all read in.
 */
export function orderSteps<Step extends { id: string; position: number }>(
  steps: readonly Step[],
): Step[] {
  return [...steps].sort(
    (left, right) => left.position - right.position || compareIds(left.id, right.id),
  );
}

/**
 * A leaf's step nodes: one per project step, in step order.
 *
 * Called for leaves only — a work item with children has no step nodes. A
 * project with no steps answers none; its leaves schedule through a work-item
 * boundary, which is never a step node.
 */
export function listStepNodes(
  leafId: string,
  steps: readonly { id: string; position: number }[],
): StepNodeRef[] {
  return orderSteps(steps).map((each) => ({ workItemId: leafId, stepId: each.id }));
}
