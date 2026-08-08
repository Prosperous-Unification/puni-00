import type { WorkItem } from '../repository';

/** A finish-to-start edge, as written: either end may be a parent. */
export interface DependencyEdge {
  predecessorId: string;
  successorId: string;
}

/**
 * One work item's work for one role — the unit a schedule is computed in.
 *
 * `roleId` is null only in a project that holds no roles at all, which is
 * reachable: a project's last role can be removed. The work item still has to
 * be somewhere in the plan, so it gets one slice belonging to nobody rather
 * than falling out of the graph its neighbours' dependencies run through.
 *
 * `days` is null when nobody has estimated this pair, which is not the same
 * fact as zero — see {@link Scheduled.estimated}.
 */
export interface Slice {
  workItemId: string;
  roleId: string | null;
  days: number | null;
}

/**
 * The key one slice is held under. Opaque: read {@link ScheduledSlice}'s own
 * `workItemId` and `roleId` rather than taking this apart.
 *
 * Separated by a NUL, which no id can contain, so no two pairs can collide by
 * running into each other. Written as an escape rather than typed: a literal
 * NUL in a source file makes git call the file binary.
 */
export function sliceKey(workItemId: string, roleId: string | null): string {
  return `${workItemId}\u0000${roleId ?? ''}`;
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

/** One slice's schedule, carrying what it is the schedule of. */
export interface ScheduledSlice extends Scheduled {
  workItemId: string;
  roleId: string | null;
}

/**
 * A plan, in the unit it is computed in and in the unit it is read in.
 *
 * `slices` is the engine's own output; `workItems` is the projection of it, and
 * is what every reader outside this module uses. Nothing but this module and
 * its tests reads `slices` yet — resource leveling and the Gantt are what will,
 * and they are the reason a plan is computed this way at all.
 */
export interface Schedule {
  slices: Map<string, ScheduledSlice>;
  workItems: Map<string, Scheduled>;
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
 * Kahn's algorithm, throwing on a cycle.
 *
 * Runs over the leaf graph for {@link hasCycle} and over the slice graph for
 * the passes below — the nodes are ids either way, and a cycle is the same
 * refusal in both.
 *
 * The throw is not redundant with the write path's refusal. That guard protects
 * the edges this application creates; this protects the computation from any
 * graph it is handed — a restored database, a future bulk import — because a
 * schedule computed from a cycle is wrong in a way no reader could detect.
 */
function topological(
  leafIds: readonly string[],
  edges: readonly { predecessorId: string; successorId: string }[],
): string[] {
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
 * One leaf's slices in role order, and the running offsets that place them
 * inside its span.
 *
 * `offsets[i]` is how far slice `i` starts after the work item itself does, and
 * `offsets[length]` is the work item's whole duration. Held rather than
 * recomputed because those two facts are what keep the arithmetic exact — see
 * {@link schedule}.
 */
interface WorkItemSlices {
  slices: readonly Slice[];
  offsets: readonly number[];
}

/**
 * The slices grouped by the leaf they belong to, in the order they were handed
 * over — which is the project's role order, and therefore the order they run in.
 *
 * Throws on a slice for something that is not a leaf of `rows`. A parent has no
 * work of its own and a work item from another project has no place in this
 * graph at all; scheduling either would be answering a question about a plan
 * that was not asked for. R5: this is malformed input, not a missing default.
 *
 * Proof: with the check removed, `refuses a slice for a work item that is not a
 * leaf` gets a schedule back in which the parent has become a node of its own
 * and its span no longer covers its children; watched 2026-08-09.
 */
function groupByWorkItem(
  leafIds: readonly string[],
  slices: readonly Slice[],
): Map<string, WorkItemSlices> {
  const leaves = new Set(leafIds);
  const grouped = new Map<string, Slice[]>();
  for (const slice of slices) {
    if (!leaves.has(slice.workItemId)) {
      throw new Error(`slice for ${slice.workItemId}, which is not a leaf of this project`);
    }
    const group = grouped.get(slice.workItemId);
    if (group === undefined) grouped.set(slice.workItemId, [slice]);
    else group.push(slice);
  }

  const sliced = new Map<string, WorkItemSlices>();
  for (const [workItemId, group] of grouped) {
    const offsets = [0];
    for (const slice of group) offsets.push(offsets[offsets.length - 1] + (slice.days ?? 0));
    sliced.set(workItemId, { slices: group, offsets });
  }
  return sliced;
}

/**
 * The critical-path schedule for a project, computed in slices.
 *
 * `slices` holds one entry per leaf and role, in **role order** — the order the
 * work runs in, so a leaf's `Dev` finishes before its `QA` starts. Every leaf
 * needs at least one, which is the adapter's job: a project holding no roles
 * gives each leaf one slice belonging to nobody, so the plan still schedules.
 * A slice nobody has estimated is zero days long and imposes no wait, but it is
 * still a node, which is how an unestimated `Dev` in front of an estimated `QA`
 * hands `QA` its work item's predecessors.
 *
 * Edges are taken as written and expanded here: one declared on a parent means
 * every leaf beneath its predecessor must finish before every leaf beneath its
 * successor starts, which is what a planner means by "the whole of 010 before
 * 020". Between two leaves it joins the predecessor's **last** slice to the
 * successor's **first** — never to the first *estimated* one, which would leave
 * an unestimated `Dev` with no predecessor at all and start the row before the
 * thing it waits for. Because edges only touch an item's ends, a cycle is still
 * a property of the leaf graph alone and {@link hasCycle} still answers for it.
 *
 * **The arithmetic is anchored on each work item's own start**, not accumulated
 * from slice to slice: a slice finishes at `base + offsets[i + 1]` rather than
 * at `start + days`. `(base + a) + b` is not `base + (a + b)` in doubles — with
 * a PERT base of `3.6666666666666665` and two sixth-of-a-day slices the first
 * gives `3.9999999999999996` and the second gives exactly `4`, and `datesOf`
 * reads a finish through `Math.ceil`, so that bit is a whole day on screen.
 * Anchoring is what makes this engine answer what its predecessor answered.
 * Under S1 nothing but the plan constrains a slice, so the anchoring is also
 * what the graph says: only the first slice of a work item has an external
 * predecessor and only the last has an external successor.
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
  slices: readonly Slice[],
  /**
   * The earliest offset each leaf may start at, from a manual constraint.
   *
   * Taken as a floor alongside the predecessors' finishes, never as a pin: a
   * work item told "not before day 10" whose predecessor finishes on day 14
   * starts on day 14. Dany's call — the constraint may only ever push an item
   * later, so the dependency tree and the calendar cannot contradict each
   * other. A leaf absent from the map is unconstrained. It applies to the work
   * item's **first** slice, and thereby to all of them.
   */
  notBefore: ReadonlyMap<string, number> = new Map(),
): Schedule {
  const index = indexTree(rows);
  const { leafIds } = index;
  const sliced = groupByWorkItem(leafIds, slices);

  /**
   * One leaf's slices, or a throw.
   *
   * A leaf the adapter handed no slice for cannot be scheduled and must not be
   * quietly dropped: every edge through it would vanish with it and the rows
   * around it would move.
   *
   * Proof: with this returning an empty group instead, `refuses a leaf it was
   * handed no slice for` gets a schedule back with the leaf missing and its
   * successor starting on day zero; watched 2026-08-09.
   */
  const slicesOf = (workItemId: string): WorkItemSlices => {
    const found = sliced.get(workItemId);
    if (found === undefined) throw new Error(`no slice for work item ${workItemId}`);
    return found;
  };

  // Expanded here rather than stored. Storing it would be a second copy to fall
  // out of date with the tree the moment a leaf is added under either end.
  const leafEdges = expandToLeaves(index, edges);

  /**
   * The keys of one leaf's slices, in the order they run.
   *
   * Never empty, and that is structural rather than checked: a group only
   * exists because a slice created it, and a leaf with no group at all is what
   * `slicesOf` throws over. It matters because an edge end that is not a slice
   * key would be a node the sort has never heard of — and an unreachable node
   * is exactly how the sort reports a **cycle**, so the reader would be told
   * their dependencies run in a circle about a graph with one edge in it.
   */
  const keysOf = (leafId: string): string[] =>
    slicesOf(leafId).slices.map((slice) => sliceKey(slice.workItemId, slice.roleId));

  const keys: string[] = [];
  const sliceEdges: { predecessorId: string; successorId: string }[] = [];
  for (const leafId of leafIds) {
    const own = keysOf(leafId);
    keys.push(...own);
    for (let i = 1; i < own.length; i += 1) {
      sliceEdges.push({ predecessorId: own[i - 1], successorId: own[i] });
    }
  }
  // The predecessor's **last** slice to the successor's **first**: the whole of
  // one work item before the whole of the other, and the successor's own order
  // carries the wait to the roles behind its first.
  for (const { predecessorId, successorId } of leafEdges) {
    const before = keysOf(predecessorId);
    sliceEdges.push({
      predecessorId: before[before.length - 1],
      successorId: keysOf(successorId)[0],
    });
  }

  const order = topological(keys, sliceEdges);
  const predecessorsOf = new Map<string, string[]>();
  const successorsOf = new Map<string, string[]>();
  for (const { predecessorId, successorId } of sliceEdges) {
    predecessorsOf.set(successorId, [...(predecessorsOf.get(successorId) ?? []), predecessorId]);
    successorsOf.set(predecessorId, [...(successorsOf.get(predecessorId) ?? []), successorId]);
  }

  /** Where each work item's own span begins — the anchor every slice of it is placed from. */
  const baseOf = new Map<string, number>();
  const earliestStart = new Map<string, number>();
  const earliestFinish = new Map<string, number>();
  const placeOf = new Map<string, { workItemId: string; at: number }>();
  for (const leafId of leafIds) {
    slicesOf(leafId).slices.forEach((slice, at) => {
      placeOf.set(sliceKey(slice.workItemId, slice.roleId), { workItemId: leafId, at });
    });
  }
  for (const key of order) {
    const place = placeOf.get(key);
    if (place === undefined) throw new Error(`ordered a slice that is not in the plan: ${key}`);
    const { offsets } = slicesOf(place.workItemId);
    const start = Math.max(
      0,
      place.at === 0 ? (notBefore.get(place.workItemId) ?? 0) : 0,
      ...(predecessorsOf.get(key) ?? []).map((p) => earliestFinish.get(p) ?? 0),
    );
    if (place.at === 0) baseOf.set(place.workItemId, start);
    const base = baseOf.get(place.workItemId) ?? start;
    earliestStart.set(key, start);
    earliestFinish.set(key, base + offsets[place.at + 1]);
  }

  const projectFinish = Math.max(0, ...keys.map((key) => earliestFinish.get(key) ?? 0));
  const latestFinish = new Map<string, number>();
  const latestStart = new Map<string, number>();
  /** Where each work item's own span must have ended — the anchor for its late times. */
  const ceilingOf = new Map<string, number>();
  // Backwards through the same order: every successor is already settled.
  for (const key of [...order].reverse()) {
    const place = placeOf.get(key);
    if (place === undefined) throw new Error(`ordered a slice that is not in the plan: ${key}`);
    const { offsets, slices: own } = slicesOf(place.workItemId);
    const successors = successorsOf.get(key) ?? [];
    const finish =
      successors.length === 0
        ? projectFinish
        : Math.min(...successors.map((s) => latestStart.get(s) ?? projectFinish));
    if (place.at === own.length - 1) ceilingOf.set(place.workItemId, finish);
    const ceiling = ceilingOf.get(place.workItemId) ?? finish;
    const total = offsets[own.length];
    latestFinish.set(key, finish);
    latestStart.set(key, ceiling - (total - offsets[place.at]));
  }

  const scheduledSlices = new Map<string, ScheduledSlice>();
  for (const leafId of leafIds) {
    for (const slice of slicesOf(leafId).slices) {
      const key = sliceKey(slice.workItemId, slice.roleId);
      const start = earliestStart.get(key) ?? 0;
      const late = latestStart.get(key) ?? 0;
      scheduledSlices.set(key, {
        workItemId: slice.workItemId,
        roleId: slice.roleId,
        duration: slice.days ?? 0,
        // Proof: hard-coded to `true` and two tests failed — the unestimated leaf
        // and the parent above it both claimed someone had looked.
        estimated: slice.days !== null,
        earliestStart: start,
        earliestFinish: earliestFinish.get(key) ?? 0,
        latestStart: late,
        latestFinish: latestFinish.get(key) ?? 0,
        float: late - start,
        critical: late - start === 0,
      });
    }
  }

  const scheduleOf = (key: string): ScheduledSlice => {
    const found = scheduledSlices.get(key);
    if (found === undefined) throw new Error(`no schedule for slice ${key}`);
    return found;
  };
  return {
    slices: scheduledSlices,
    workItems: projectOntoWorkItems(rows, index, slicesOf, scheduleOf),
  };
}

/**
 * A work item's own schedule, read off the slices beneath it, and a parent's
 * span read off those.
 *
 * A leaf takes the earliest of its slices' starts, the latest of their
 * finishes, their total duration, and is estimated when any of them is. Its
 * **float and critical flag are derived from those projected endpoints** rather
 * than aggregated from the slices' own: under S1 every slice of a work item
 * carries the same float, so the two are the same number in arithmetic — and
 * not in doubles. `(A + p) - (B + p)` differs from `A - B` for a majority of
 * pairs drawn from PERT finals, so aggregating would give a row that has always
 * had a slack of `0` a slack of `-1.1e-16`, and a red row where there was none.
 *
 * A parent spans the leaves beneath it, by the same rule and the same code as
 * before there were slices at all: effort and span are different numbers, and
 * two independent children of 3 and 4 days are 7 days of work in a 4-day branch.
 */
function projectOntoWorkItems(
  rows: readonly WorkItem[],
  index: TreeIndex,
  slicesOf: (workItemId: string) => WorkItemSlices,
  scheduleOf: (key: string) => ScheduledSlice,
): Map<string, Scheduled> {
  const isLeaf = new Set(index.leafIds);
  const projected = new Map<string, Scheduled>();
  for (const leafId of index.leafIds) {
    const own = slicesOf(leafId).slices.map((slice) =>
      scheduleOf(sliceKey(slice.workItemId, slice.roleId)),
    );
    const start = Math.min(...own.map((s) => s.earliestStart));
    const late = Math.min(...own.map((s) => s.latestStart));
    projected.set(leafId, {
      duration: own.reduce((sum, s) => sum + s.duration, 0),
      estimated: own.some((s) => s.estimated),
      earliestStart: start,
      earliestFinish: Math.max(...own.map((s) => s.earliestFinish)),
      latestStart: late,
      latestFinish: Math.max(...own.map((s) => s.latestFinish)),
      float: late - start,
      critical: late - start === 0,
    });
  }

  // A parent's span, not its total. Its rolled-up effort is a different number
  // and is reported separately.
  for (const row of rows) {
    if (isLeaf.has(row.id)) continue;
    const beneath = (index.leavesUnder.get(row.id) ?? [])
      .map((id) => projected.get(id))
      .filter((s): s is Scheduled => s !== undefined);
    const starts = beneath.map((s) => s.earliestStart);
    const finishes = beneath.map((s) => s.earliestFinish);
    const spanStart = Math.min(...starts, Infinity) === Infinity ? 0 : Math.min(...starts);
    // Proof: summed instead of maxed and two `parents` tests failed, reporting
    // a 4-day branch as 7 days long because that is its effort.
    const spanFinish = Math.max(0, ...finishes);
    projected.set(row.id, {
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

  return projected;
}
