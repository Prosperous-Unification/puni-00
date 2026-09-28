import type { LeafStatus, WorkItemStatus } from './progress';
import { type DependencyEdge, leavesUnderOf, type TreeIndex } from './schedule';
import type { TypedDependency } from './typed-dependency';

/** Every authored dependency of a plan, legacy and typed, as written. */
export interface AuthoredDependencyGraph {
  readonly edges: readonly DependencyEdge[];
  readonly typed: readonly TypedDependency[];
}

/** Statuses a leaf may still be moved off by the graph: nobody has started it. */
const UNSTARTED: ReadonlySet<WorkItemStatus> = new Set(['unknown', 'draft', 'ready']);

/**
 * Each leaf's successor leaves over every legacy and typed dependency, of any
 * relationship type and endpoint scope, whether or not either end takes part
 * in the schedule. A leaf never succeeds itself here: a dependency between two
 * step nodes of one leaf orders its steps, not the leaf.
 *
 * Throws for an endpoint the tree does not hold, as {@link leavesUnderOf} does.
 */
function successorLeavesOf(
  index: TreeIndex,
  { edges, typed }: AuthoredDependencyGraph,
): Map<string, Set<string>> {
  const leavesUnder = leavesUnderOf(index);
  const successors = new Map<string, Set<string>>();
  const link = (predecessorId: string, successorId: string) => {
    for (const from of leavesUnder(predecessorId)) {
      for (const to of leavesUnder(successorId)) {
        if (from === to) continue;
        const found = successors.get(from);
        if (found === undefined) successors.set(from, new Set([to]));
        else found.add(to);
      }
    }
  };
  for (const { predecessorId, successorId } of edges) link(predecessorId, successorId);
  for (const { predecessor, successor } of typed)
    link(predecessor.workItemId, successor.workItemId);
  return successors;
}

/**
 * Every leaf's status with `blocked_by_proxy` applied: an unstarted leaf
 * (`unknown`, `draft`, `ready`) any of whose predecessor leaves reads
 * `on_hold`, `blocked` or `blocked_by_proxy` reads `blocked_by_proxy`.
 *
 * The reading spreads through successive unstarted leaves and stops at
 * running, finished or held work, so the answer is the **least** fixed point:
 * every proxy traces back to a hold through proxies. A breadth-first spread
 * from the held and blocked leaves computes it and visits each leaf once,
 * which is why a leaf-level cycle — legal whenever the step-node graph is
 * acyclic — terminates. Held leaves are spread from too: a successor of held
 * work is the case this reading exists for, even though the held leaf itself
 * takes no part in the schedule.
 *
 * **Known over-approximation until 010.4.13.3:** holds are leaf-grain, so a
 * node-scoped dependency from `A.dev` (done) to `B.dev` still reads B as
 * `blocked_by_proxy` when A is held on another step.
 *
 * Throws when a leaf of `index` has no status, when a status is given for
 * anything but a leaf, and for a dependency naming a work item the tree does
 * not hold.
 */
export function blockedByProxyOf(
  index: TreeIndex,
  dependencies: AuthoredDependencyGraph,
  leafStatuses: ReadonlyMap<string, LeafStatus>,
): Map<string, WorkItemStatus> {
  const statuses = new Map<string, WorkItemStatus>();
  for (const leafId of index.leafIds) {
    const status = leafStatuses.get(leafId);
    // Proof: `continue` in place of this throw and `refuses a leaf with no
    // status` failed on `Received function did not throw`; watched 2026-09-28.
    if (status === undefined) throw new Error(`no status for leaf ${leafId}`);
    statuses.set(leafId, status);
  }
  for (const id of leafStatuses.keys()) {
    // Proof: this check disabled and `refuses a status for anything but a
    // leaf` failed on `Received function did not throw`; watched 2026-09-28.
    if (!statuses.has(id)) throw new Error(`status for ${id}, which is not a leaf`);
  }

  const successors = successorLeavesOf(index, dependencies);
  const queue = index.leafIds.filter((leafId) => {
    const status = statuses.get(leafId);
    return status === 'on_hold' || status === 'blocked';
  });
  // `for…of` over an array reads its length afresh each step, so the leaves
  // pushed below are visited in turn: a breadth-first queue.
  for (const stoppedId of queue) {
    for (const successorId of successors.get(stoppedId) ?? []) {
      const status = statuses.get(successorId);
      // Unreachable narrowing: successors are leaves of the same `index`, and
      // every leaf of it was given a status above.
      if (status === undefined) throw new Error(`no status for leaf ${successorId}`);
      if (!UNSTARTED.has(status)) continue;
      statuses.set(successorId, 'blocked_by_proxy');
      // Proof: this push commented out and `marks C behind a held A through
      // B` failed, with three more example cases and the least-fixed-point
      // property (counterexample `l0 blocked → l2 draft → l5 ready`); watched
      // 2026-09-28.
      queue.push(successorId);
    }
  }
  return statuses;
}
