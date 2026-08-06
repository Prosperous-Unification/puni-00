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

/** The cycle a graph cannot be ordered around. Typed so callers catch this and nothing else. */
export class ScheduleCycleError extends Error {
  override name = 'ScheduleCycleError' as const;
  constructor() {
    super('dependency cycle: the schedule cannot be ordered');
  }
}

/**
 * The tree, indexed once: children by parent, and the leaves beneath every id.
 *
 * Built in one pass and shared by everything that needs it. The first version
 * rebuilt the child index inside a helper called twice per edge and once per
 * parent, which is quadratic in the rows before the edges are even expanded.
 */
export interface TreeIndex {
  /** Every work item with no children — the only things with a duration. */
  leafIds: string[];
  /** For any id: the leaves beneath it. A leaf maps to itself. */
  leavesUnder: Map<string, string[]>;
}

export function indexTree(rows: readonly WorkItem[]): TreeIndex {
  const childrenOf = new Map<string, WorkItem[]>();
  for (const row of rows) {
    if (row.parentId === null) continue;
    const group = childrenOf.get(row.parentId);
    if (group === undefined) childrenOf.set(row.parentId, [row]);
    else group.push(row);
  }

  const leavesUnder = new Map<string, string[]>();
  const walk = (id: string): string[] => {
    const already = leavesUnder.get(id);
    if (already !== undefined) return already;
    const children = childrenOf.get(id);
    const found = children === undefined ? [id] : children.flatMap((child) => walk(child.id));
    leavesUnder.set(id, found);
    return found;
  };
  for (const row of rows) walk(row.id);

  return {
    leafIds: rows.filter((row) => !childrenOf.has(row.id)).map((row) => row.id),
    leavesUnder,
  };
}

/**
 * The edges as the schedule sees them: every pair of leaves the written edges
 * imply.
 *
 * Exported because `canDepend` must ask its question of **this** graph. Asking
 * it of the written edges instead let through an edge whose expansion closed a
 * cycle — the API accepted it, and every later read of the project threw. Two
 * reviewers found that independently, with different examples.
 */
export function expandToLeaves(
  index: TreeIndex,
  edges: readonly DependencyEdge[],
): DependencyEdge[] {
  const isLeaf = new Set(index.leafIds);
  const expanded: DependencyEdge[] = [];
  for (const { predecessorId, successorId } of edges) {
    for (const from of index.leavesUnder.get(predecessorId) ?? []) {
      if (!isLeaf.has(from)) continue;
      for (const to of index.leavesUnder.get(successorId) ?? []) {
        if (isLeaf.has(to)) expanded.push({ predecessorId: from, successorId: to });
      }
    }
  }
  return expanded;
}

/** Whether the leaf graph can be ordered at all — the same question the sort asks. */
export function hasCycle(index: TreeIndex, edges: readonly DependencyEdge[]): boolean {
  try {
    topological(index.leafIds, expandToLeaves(index, edges));
    return false;
  } catch {
    return true;
  }
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
    const group = outgoing.get(predecessorId);
    if (group === undefined) outgoing.set(predecessorId, [successorId]);
    else group.push(successorId);
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
  if (order.length !== leafIds.length) throw new ScheduleCycleError();
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
 * Everything here is an offset from day zero, in **working days**. The calendar
 * lives one layer up: `work-item.service` turns the project's start date and
 * these offsets into dates with `addWorkdays`, and turns a manual "start no
 * earlier than" date back into the `notBefore` offsets below. Keeping the pass
 * itself in numbers means weekends are counted in exactly one place.
 */
export function schedule(
  rows: readonly WorkItem[],
  edges: readonly DependencyEdge[],
  durations: ReadonlyMap<string, number>,
  /**
   * The earliest offset each leaf may start at, from a manual constraint.
   *
   * Taken as a floor alongside the predecessors' finishes, never as a pin: a
   * work item told "not before day 10" whose predecessor finishes on day 14
   * starts on day 14. Dany's call — the constraint may only ever push an item
   * later, so the dependency tree and the calendar cannot contradict each
   * other. A leaf absent from the map is unconstrained.
   */
  notBefore: ReadonlyMap<string, number> = new Map(),
): Map<string, Scheduled> {
  const index = indexTree(rows);
  const { leafIds } = index;
  const isLeaf = new Set(leafIds);

  // Expanded here rather than stored. Storing it would be a second copy to fall
  // out of date with the tree the moment a leaf is added under either end.
  const leafEdges = expandToLeaves(index, edges);

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
      notBefore.get(id) ?? 0,
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
    const beneath = (index.leavesUnder.get(row.id) ?? [])
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
