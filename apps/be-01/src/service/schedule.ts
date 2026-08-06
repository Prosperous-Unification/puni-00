import type { WorkItem } from '../repository';

/** A finish-to-start edge, as written: either end may be a parent. */
export interface DependencyEdge {
  predecessorId: string;
  successorId: string;
}

/**
 * When a work item can happen, in whole days from the project's day zero.
 *
 * `duration` is a leaf's own expected days and is 0 for a parent — a parent has
 * no work of its own, it has a span. `estimated` is what stops that zero being
 * read as "instant" when it means "nobody has looked".
 */
export interface Scheduled {
  duration: number;
  estimated: boolean;
  earliestStart: number;
  earliestFinish: number;
  latestStart: number;
  latestFinish: number;
  float: number;
  critical: boolean;
}

/** Every work item that has no children — the only things with a duration. */
function leavesOf(rows: readonly WorkItem[]): WorkItem[] {
  const parents = new Set(rows.map((row) => row.parentId).filter((id) => id !== null));
  return rows.filter((row) => !parents.has(row.id));
}

/** `rootId` and every work item beneath it; a leaf is its own only leaf. */
function leavesUnder(rows: readonly WorkItem[], rootId: string): string[] {
  const childrenOf = new Map<string, WorkItem[]>();
  for (const row of rows) {
    if (row.parentId === null) continue;
    childrenOf.set(row.parentId, [...(childrenOf.get(row.parentId) ?? []), row]);
  }
  const found: string[] = [];
  const walk = (id: string): void => {
    const children = childrenOf.get(id);
    if (children === undefined) {
      found.push(id);
      return;
    }
    for (const child of children) walk(child.id);
  };
  walk(rootId);
  return found;
}

/**
 * Kahn's algorithm over the leaf graph, throwing on a cycle.
 *
 * The throw is not redundant with the write path's refusal. That guard protects
 * the edges this application creates; this protects the computation from any
 * graph it is handed — a restored database, a future bulk import — because a
 * schedule computed from a cycle is wrong in a way no reader could detect.
 */
function topological(leafIds: readonly string[], edges: readonly DependencyEdge[]): string[] {
  const incoming = new Map(leafIds.map((id) => [id, 0]));
  const outgoing = new Map<string, string[]>();
  for (const { predecessorId, successorId } of edges) {
    outgoing.set(predecessorId, [...(outgoing.get(predecessorId) ?? []), successorId]);
    incoming.set(successorId, (incoming.get(successorId) ?? 0) + 1);
  }

  const ready = leafIds.filter((id) => incoming.get(id) === 0);
  const order: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift();
    if (id === undefined) break;
    order.push(id);
    for (const next of outgoing.get(id) ?? []) {
      const left = (incoming.get(next) ?? 0) - 1;
      incoming.set(next, left);
      if (left === 0) ready.push(next);
    }
  }

  // Proof: this throw deleted and only `throws on a cyclic graph rather than
  // returning a schedule` failed — it returned a schedule with the cycle's rows
  // silently missing, which is exactly the undetectable wrongness it guards.
  if (order.length !== leafIds.length) {
    throw new Error('dependency cycle: the schedule cannot be ordered');
  }
  return order;
}

/**
 * The critical-path schedule for a project.
 *
 * `durations` holds expected days per **leaf**; a leaf missing from it is
 * unestimated rather than instant, and both facts are reported. Edges are taken
 * as written and expanded here: one declared on a parent means every leaf
 * beneath its predecessor must finish before every leaf beneath its successor
 * starts, which is what a planner means by "the whole of 010 before 020".
 *
 * Everything is a whole-number offset from day zero. No calendar, no weekends —
 * see `design.md` D3 for why that is a decision rather than an omission.
 */
export function schedule(
  rows: readonly WorkItem[],
  edges: readonly DependencyEdge[],
  durations: ReadonlyMap<string, number>,
): Map<string, Scheduled> {
  const leaves = leavesOf(rows);
  const leafIds = leaves.map((leaf) => leaf.id);
  const isLeaf = new Set(leafIds);

  // Expanded once, here. Storing the expansion would be a second copy to fall
  // out of date with the tree the moment a leaf is added under either end.
  const leafEdges: DependencyEdge[] = [];
  for (const { predecessorId, successorId } of edges) {
    for (const from of leavesUnder(rows, predecessorId)) {
      for (const to of leavesUnder(rows, successorId)) {
        if (isLeaf.has(from) && isLeaf.has(to))
          leafEdges.push({ predecessorId: from, successorId: to });
      }
    }
  }

  const order = topological(leafIds, leafEdges);
  const predecessorsOf = new Map<string, string[]>();
  const successorsOf = new Map<string, string[]>();
  for (const { predecessorId, successorId } of leafEdges) {
    predecessorsOf.set(successorId, [...(predecessorsOf.get(successorId) ?? []), predecessorId]);
    successorsOf.set(predecessorId, [...(successorsOf.get(predecessorId) ?? []), successorId]);
  }

  const durationOf = (id: string): number => durations.get(id) ?? 0;
  const earliestStart = new Map<string, number>();
  const earliestFinish = new Map<string, number>();
  for (const id of order) {
    const start = Math.max(
      0,
      ...(predecessorsOf.get(id) ?? []).map((p) => earliestFinish.get(p) ?? 0),
    );
    earliestStart.set(id, start);
    earliestFinish.set(id, start + durationOf(id));
  }

  const projectFinish = Math.max(0, ...leafIds.map((id) => earliestFinish.get(id) ?? 0));
  const latestFinish = new Map<string, number>();
  const latestStart = new Map<string, number>();
  // Backwards through the same order: every successor is already settled.
  for (const id of [...order].reverse()) {
    const successors = successorsOf.get(id) ?? [];
    const finish =
      successors.length === 0
        ? projectFinish
        : Math.min(...successors.map((s) => latestStart.get(s) ?? projectFinish));
    latestFinish.set(id, finish);
    latestStart.set(id, finish - durationOf(id));
  }

  const scheduled = new Map<string, Scheduled>();
  for (const id of leafIds) {
    const start = earliestStart.get(id) ?? 0;
    const late = latestStart.get(id) ?? 0;
    scheduled.set(id, {
      duration: durationOf(id),
      // Proof: hard-coded to `true` and two tests failed — the unestimated leaf
      // and the parent above it both claimed someone had looked.
      estimated: durations.has(id),
      earliestStart: start,
      earliestFinish: earliestFinish.get(id) ?? 0,
      latestStart: late,
      latestFinish: latestFinish.get(id) ?? 0,
      float: late - start,
      critical: late - start === 0,
    });
  }

  // A parent's span, not its total. Its rolled-up effort is a different number
  // and is reported separately; two independent children of 3 and 4 days are 7
  // days of work in a 4-day branch, and both are true.
  for (const row of rows) {
    if (isLeaf.has(row.id)) continue;
    const beneath = leavesUnder(rows, row.id)
      .map((id) => scheduled.get(id))
      .filter((s): s is Scheduled => s !== undefined);
    const starts = beneath.map((s) => s.earliestStart);
    const finishes = beneath.map((s) => s.earliestFinish);
    const spanStart = Math.min(...starts, Infinity) === Infinity ? 0 : Math.min(...starts);
    // Proof: summed instead of maxed and two `parents` tests failed, reporting
    // a 4-day branch as 7 days long because that is its effort.
    const spanFinish = Math.max(0, ...finishes);
    scheduled.set(row.id, {
      duration: 0,
      estimated: beneath.some((s) => s.estimated),
      earliestStart: spanStart,
      earliestFinish: spanFinish,
      latestStart: Math.min(...beneath.map((s) => s.latestStart), spanStart),
      latestFinish: Math.max(0, ...beneath.map((s) => s.latestFinish)),
      float:
        Math.min(...beneath.map((s) => s.float), Infinity) === Infinity
          ? 0
          : Math.min(...beneath.map((s) => s.float)),
      // A branch is critical when anything inside it is: shortening that leaf
      // shortens the project, and the branch is where a reader looks first.
      critical: beneath.some((s) => s.critical),
    });
  }

  return scheduled;
}
