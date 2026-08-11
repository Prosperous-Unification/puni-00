import { snapWorkdays } from '@wbs/domain';

import type { WorkItem } from '../repository';
import { deriveNumbers } from './derive-numbers';

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
  /**
   * Who is doing this work, or nobody — **resolved by the caller**.
   *
   * A work item with exactly one assignment is taken to be that person's
   * whole — the assumed assignee — so every slice of it carries them, and a
   * work item with two carries each role's own. The reading is
   * `assumedAssignee`, and it is made here rather than in the pass because a
   * second implementation of it would put people in queues nobody assigned
   * them to. The pass only ever asks "the same person as that slice?".
   */
  personId: string | null;
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

/**
 * What decided a slice's start: the latest of its floors, named.
 *
 * `projectStart` means nothing did — it starts on day zero. `predecessor` is a
 * dependency onto another work item, `roleOrder` the work item's own earlier
 * role, `notBefore` a manual date, and `person` the assignee finishing
 * something else.
 *
 * A tie is **not** `person`: when the assignee comes free exactly as the
 * dependency clears, nobody is waiting for them, and a plan that said otherwise
 * would count that row into "N tasks wait for a person". `person` therefore
 * means the person floor was strictly the latest of them.
 */
export type ScheduleFloor = 'projectStart' | 'predecessor' | 'roleOrder' | 'notBefore' | 'person';

/** One slice's schedule, carrying what it is the schedule of and what held it there. */
export interface ScheduledSlice extends Scheduled {
  workItemId: string;
  roleId: string | null;
  /** The person this work is queued behind, as the caller resolved it. */
  personId: string | null;
  boundBy: ScheduleFloor;
  /**
   * The slice this one's assignee was busy with, or null.
   *
   * Set only when `boundBy` is `person` — an arrow drawn for a resource edge
   * that did not bind would claim a wait that is not there. It is a key into
   * {@link Schedule.slices}: look it up rather than taking it apart, exactly as
   * {@link sliceKey} says.
   */
  resourcePredecessorId: string | null;
}

/**
 * A plan, in the unit it is computed in and in the unit it is read in.
 *
 * `slices` is the engine's own output; `workItems` is the projection of it, and
 * is what the table reads. The Gantt is what will read the slices — one bar
 * each, and the person links drawn from `resourcePredecessorId`.
 */
export interface Schedule {
  slices: Map<string, ScheduledSlice>;
  workItems: Map<string, Scheduled>;
  /**
   * How many work items hold a slice a **person** is the reason for.
   *
   * Counted per work item rather than per slice, because that is the sentence
   * the schedule header says: "N tasks wait for a person". Zero on every plan
   * with nobody assigned, which is the state this tool shipped in until now.
   */
  waitingForPerson: number;
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
 * Kahn's algorithm over the leaf graph, throwing on a cycle — the question
 * {@link hasCycle} asks before an edge is written.
 *
 * The pass below asks the same question of the slice graph and answers it the
 * same way, from its own eligible set: a plan whose slices cannot all be
 * placed is a plan with a loop in it.
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

  // Proof: this throw deleted and six `canDepend` tests failed, among them
  // `refuses an edge that closes a cycle` and `refuses an edge whose expansion
  // closes a cycle through a parent` — the write path accepted every loop it
  // exists to refuse; watched 2026-08-09.
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
 * One slice as the passes see it: what it is, where it sits, and what the
 * **plan** says it waits for.
 *
 * The node is the unit of the graph and its index in {@link SliceGraph.nodes}
 * is its name there — every edge, order and result below is an index into the
 * same array. That is not a micro-optimisation: keyed by string, each of those
 * reads is a lookup that can miss, and a schedule made of maps grows a fence of
 * "this cannot happen" throws whose failure nobody has ever seen. An index into
 * an array the pass built cannot miss, and the type says so.
 *
 * The resource edges are not here, because they do not exist until the
 * placement chooses them.
 */
interface SliceNode {
  key: string;
  slice: Slice;
  /** Which work item's span it belongs to, as an index into the pass's own arrays. */
  item: number;
  /** How many roles into that work item it is. */
  at: number;
  /** Its work item's running offsets — one shared array per work item. */
  offsets: readonly number[];
  /** The earliest day its work item may start; only its first slice carries one. */
  notBefore: number;
  predecessors: number[];
  successors: number[];
}

/** The plan as the passes run over it. */
interface SliceGraph {
  nodes: readonly SliceNode[];
  /** How many work items the nodes belong to — the width of the anchor arrays. */
  items: number;
}

/**
 * No node — what a slice with nobody in front of it carries where a resource
 * predecessor would go.
 *
 * A sentinel rather than `null` because the field is read on every slice of
 * every plan and the union would be one narrowing per read for a case the
 * placement already knows the answer to. -1 is not an index any array has.
 */
const NOBODY = -1;

/** Where one slice was put, and what put it there. */
interface Placed {
  start: number;
  finish: number;
  boundBy: ScheduleFloor;
  /** The node its assignee was busy with, or -1 when nobody held it up. */
  resourcePredecessor: number;
}

/**
 * Where a work item's span is currently measured from: a start, and the slice
 * it is the start of.
 *
 * A work item's slices are placed from one anchor for as long as they tile —
 * which keeps the arithmetic identical to a single node of the summed length,
 * see {@link schedule}. The first slice a person holds back does not tile, and
 * the anchor moves to it: from there the span is measured again.
 */
interface SpanAnchor {
  start: number;
  at: number;
}

/** What a slice's turn is decided by, in the order the decision is made. */
interface SlicePriority {
  /**
   * What somebody said this work is worth, smaller first — or `Infinity` where
   * nobody has said anything.
   *
   * The only one of these four a person writes, and therefore the first asked:
   * a planner who priorities two work items is overruling the engine's own guess at
   * which of them matters, and a rule that asked the guess first would make the
   * priority decide only the cases the guess could not.
   *
   * `Infinity` rather than a large number or a null: it is the value that makes
   * "no priority goes last" arithmetic rather than a special case, and it is what
   * makes a plan that priorities nothing schedule byte for byte as it did before
   * this field existed — every slice ties here and the three below decide alone.
   */
  priority: number;
  /** Where the critical path puts it, with nobody's calendar in the way. */
  start: number;
  /** How much it could slip there without moving the project. */
  float: number;
  /** Its work item's number — the tie goes to the row that reads first. */
  number: string;
  /** Its place in the role order, which is the last thing two slices can differ by. */
  at: number;
}

/**
 * A binary heap of slice nodes — the eligible set, kept in priority order.
 *
 * A sorted array rescanned for the first eligible slice is quadratic in the
 * slices, and the plans this has to hold are thousands of them. `O(log n)` per
 * placement is what keeps the whole pass at `O(V log V + E)`.
 */
function eligibleSet(goesFirst: (left: number, right: number) => boolean) {
  const heap: number[] = [];
  const swap = (a: number, b: number): void => {
    const held = heap[a];
    heap[a] = heap[b];
    heap[b] = held;
  };
  return {
    push(node: number): void {
      heap.push(node);
      for (let at = heap.length - 1; at > 0; ) {
        const parent = (at - 1) >> 1;
        if (!goesFirst(heap[at], heap[parent])) break;
        swap(at, parent);
        at = parent;
      }
    },
    take(): number | undefined {
      const top = heap[0];
      const last = heap.pop();
      if (last !== undefined && heap.length > 0) {
        heap[0] = last;
        for (let at = 0; ; ) {
          const left = at * 2 + 1;
          const right = left + 1;
          let first = at;
          if (left < heap.length && goesFirst(heap[left], heap[first])) first = left;
          if (right < heap.length && goesFirst(heap[right], heap[first])) first = right;
          if (first === at) break;
          swap(at, first);
          at = first;
        }
      }
      return top;
    },
  };
}

/**
 * **Deterministic serial list scheduling**: one pass, one eligible set, every
 * slice placed once and never moved.
 *
 * Repeatedly: take the highest-priority slice whose plan predecessors are all
 * placed, and put it at the latest of its floors — those predecessors'
 * finishes, its work item's manual floor, and the finish of whatever its
 * assignee is already doing. Its successors become eligible, and the pass moves
 * on. Nothing is revisited.
 *
 * **Non-overlap holds by construction.** A person's next slice is only ever
 * placed after their previous one is final, so two slices of one person cannot
 * share a day — no re-run can re-open what one pass never opened. This is what
 * the algorithm it replaced could not say: that one levelled at critical-path
 * times, then re-ran the forward pass once, and a dependency push could land a
 * slice on top of a person's later work that had not overlapped anything when
 * the overlaps were looked for.
 *
 * **It terminates, and it is not optimal.** Termination is structural: the plan
 * edges are acyclic or nothing is eligible at all, and a resource edge always
 * points from a slice already placed to one that is not, so it can never close
 * a loop. Optimality is not claimed and is not true — list scheduling is a
 * heuristic, and a different priority rule can finish a resource-constrained
 * plan sooner. What it is instead is **deterministic**: the same plan schedules
 * the same way every time, which is what a person reading dates needs.
 *
 * `personOf` rather than the slice's own `personId` so the same pass can be run
 * with the people taken out — that run is the critical path this one ranks by,
 * and running it through this code rather than a second implementation is what
 * makes "a plan with nobody assigned does not move" true by construction.
 */
function placeSlices(
  graph: SliceGraph,
  goesFirst: (left: number, right: number) => boolean,
  withPeople: boolean,
): { order: number[]; placed: Placed[]; resourceSuccessors: number[][] } {
  const { nodes } = graph;
  const waitingOn = nodes.map((node) => node.predecessors.length);
  const eligible = eligibleSet(goesFirst);
  for (let node = 0; node < nodes.length; node += 1) if (waitingOn[node] === 0) eligible.push(node);

  const placed: Placed[] = [];
  const order: number[] = [];
  const anchorOf = new Array<SpanAnchor | undefined>(graph.items);
  /** Each person's last placement — their finishes only ever go up, so it is also their latest. */
  const busyUntil = new Map<string, { node: number; finish: number }>();
  const resourceSuccessors = nodes.map((): number[] => []);

  for (let taken = eligible.take(); taken !== undefined; taken = eligible.take()) {
    const node = nodes[taken];
    const { offsets, at } = node;

    let fromPredecessor = 0;
    let fromRoleOrder = 0;
    for (const earlier of node.predecessors) {
      const { finish } = placed[earlier];
      if (nodes[earlier].item === node.item) fromRoleOrder = Math.max(fromRoleOrder, finish);
      else fromPredecessor = Math.max(fromPredecessor, finish);
    }
    // A slice of no length is not work, so it neither waits for its assignee
    // nor makes them busy: nobody is occupied for zero days. Without this an
    // unestimated `QA` belonging to somebody would queue behind everything else
    // they are doing and drag its work item's finish along with it — a row that
    // ends on day 3 reported as ending on day 5 because a slice with nothing in
    // it was placed there.
    //
    // Proof: the length dropped from this condition and `gives a slice nobody
    // has estimated no place in the queue` failed — the empty `QA` came back at
    // day 5 rather than day 3, `boundBy: 'person'`, taking its work item's
    // finish with it; watched 2026-08-09.
    const personId = withPeople && offsets[at + 1] - offsets[at] > 0 ? node.slice.personId : null;
    const busy = personId === null ? undefined : busyUntil.get(personId);
    // Latest wins, and a tie keeps the reason listed first — which is why the
    // person is last of them; see {@link ScheduleFloor}.
    //
    // Proof: the person floor deleted from this list and nine leveling tests
    // failed, `runs two work items assigned to one person one after the other`
    // among them — `b` came back at 0→2 while `kat` was on `a` until day 3;
    // watched 2026-08-09.
    const floors: { at: number; kind: ScheduleFloor }[] = [
      { at: fromPredecessor, kind: 'predecessor' },
      { at: fromRoleOrder, kind: 'roleOrder' },
      { at: node.notBefore, kind: 'notBefore' },
      ...(busy === undefined ? [] : [{ at: busy.finish, kind: 'person' as const }]),
    ];
    let start = 0;
    let boundBy: ScheduleFloor = 'projectStart';
    for (const floor of floors) {
      // Strictly later, so a tie keeps the floor named first. Proof: written as
      // `<`, so that a later floor takes a tie, and `names the predecessor, not
      // the person, when the two land on the same day` failed — a row whose
      // assignee came free exactly as its dependency cleared was reported as
      // waiting for her, and counted into "N tasks wait for a person"; watched
      // 2026-08-09.
      if (floor.at <= start) continue;
      start = floor.at;
      boundBy = floor.kind;
    }

    // The anchor is kept while the work item's slices tile — the arithmetic
    // then reads `base + offsets[i]`, which is what the engine before slices
    // computed and what the identity claim rests on. A slice a person held
    // back does not tile, and becomes the anchor the rest are measured from.
    const anchor = anchorOf[node.item];
    const held =
      anchor !== undefined && start === anchor.start + (offsets[at] - offsets[anchor.at])
        ? anchor
        : { start, at };
    anchorOf[node.item] = held;
    // Proof: written as `start + (offsets[at + 1] - offsets[at])` — the
    // textbook `start + days`, accumulated from slice to slice — and `answers
    // what the previous engine answered` failed at seed 260: a work item's late
    // start of 10.666666666666666 became 10.666666666666668; watched
    // 2026-08-09.
    const finish = held.start + (offsets[at + 1] - offsets[held.at]);
    placed[taken] = {
      start,
      finish,
      boundBy,
      resourcePredecessor: boundBy === 'person' && busy !== undefined ? busy.node : NOBODY,
    };
    order.push(taken);

    if (personId !== null) {
      // The edge the pass chose: this person's work, in the order it will be
      // done. It is a real precedence constraint of the plan that comes out,
      // so the backward pass runs over it too.
      if (busy !== undefined) resourceSuccessors[busy.node].push(taken);
      // Where the slice actually landed, which is the whole difference between
      // this algorithm and the one it replaced. Proof: recorded as that slice's
      // **critical-path** finish instead — one forward re-run over stale
      // numbers, which is what v1 did — and `does not re-overlap a person
      // downstream of a dependency push` failed, alone: `r` came back at 5→7 on
      // top of `q` at 4→6, `boundBy: 'predecessor'`; watched 2026-08-09.
      busyUntil.set(personId, { node: taken, finish });
    }
    for (const next of node.successors) {
      waitingOn[next] -= 1;
      if (waitingOn[next] === 0) eligible.push(next);
    }
  }

  // The eligible set emptied with slices left over: the only way that happens
  // is a loop in the plan's own edges, since a resource edge always points from
  // something already placed. Proof: this throw deleted and `throws on a cyclic
  // graph rather than returning a schedule` failed with `undefined is not an
  // object (evaluating 'unleveled.placed[at].start')` — an untyped error a
  // reader would meet as a 500 on the whole project, where this one is what
  // `tree` turns into the banner saying why the plan has no dates; watched
  // 2026-08-09.
  if (order.length !== nodes.length) throw new ScheduleCycleError();
  return { order, placed, resourceSuccessors };
}

/**
 * Every leaf's priority, taken from the nearest row above it that carries one.
 *
 * A priority written on a parent reaches every leaf beneath it, exactly as a
 * dependency and a floor do — and it resolves by the **most specific**
 * statement, which is deliberately not the floor rule. A floor takes the latest
 * of everything that applies because a floor is a hard constraint and the
 * strictest of them must hold; a priority is somebody's statement of what
 * matters, and the one written closest to the work is the one that meant that
 * work. So a leaf's own beats its parent's in **both** directions, and the
 * nearer of two ancestors beats the further.
 *
 * Leaves with nobody's priority above them are simply absent, which is what
 * `goesFirst` reads as `Infinity`.
 *
 * The upward walk terminates because {@link indexTree} has already walked the
 * same tree downward: a loop among the parents is a loop among the children,
 * and that walk would not have returned.
 *
 * Proof: written as the floor rule — the smallest priority of the leaf and
 * every ancestor — and two tests in `schedule-priority.test.ts` failed: `lets a
 * leaf's own priority beat its parent's, in both directions` on the leaf carrying
 * 5 under a parent carrying 1 taking the person at day 0 from the standalone 2,
 * and `gives the nearer ancestor's priority to a leaf between two` on the same
 * inversion; watched 2026-08-11.
 */
function priorityByLeaf(rows: readonly WorkItem[], index: TreeIndex): Map<string, number> {
  const parentOf = new Map(rows.map((row) => [row.id, row.parentId]));
  const ownPriority = new Map(rows.map((row) => [row.id, row.priority]));
  const found = new Map<string, number>();
  for (const leafId of index.leafIds) {
    for (
      let cursor: string | null | undefined = leafId;
      cursor !== null && cursor !== undefined;
    ) {
      const own = ownPriority.get(cursor);
      if (own !== undefined && own !== null) {
        found.set(leafId, own);
        break;
      }
      cursor = parentOf.get(cursor);
    }
  }
  return found;
}

/** One slice's late times: the last it may finish, and the last it may start. */
interface Late {
  latestStart: number;
  latestFinish: number;
}

/**
 * How late every slice may run without moving the project, over the graph it is
 * handed — which for the schedule that comes out includes the resource edges.
 *
 * Backwards through the order the slices were placed in, which is a topological
 * order of that graph: every successor is settled before the slice it follows.
 *
 * The late times are anchored from the **end** of a work item's span for the
 * same reason the early ones are anchored from its start: `ceiling - (total -
 * offsets[i])` is what the engine before slices computed, and accumulating
 * `finish - days` down the chain differs from it in the last bits — which
 * `datesOf` can turn into a whole day. The anchor moves when a slice's late
 * finish is not the one the tiling implies, which is what a person's queue
 * pulling one slice earlier than its own chain does.
 *
 * `hasQueues` turns on the **tight-path rule**: a slice that cannot move at all
 * takes its late start from the early pass rather than reconstructing it by
 * subtraction. Both are the same number in arithmetic — `latestFinish ===
 * earliestFinish` means `latestFinish - days === earliestStart` — and not in
 * doubles: `(4/3 + 1) - 1` is not `4/3`, so a queue that is the longest path
 * there is reports a float of `-2.2e-16` and paints neither of its rows red.
 *
 * It is on only when the placement made a queue, and that scoping is the whole
 * identity claim rather than caution: a plan with nobody assigned has to answer
 * what the engine before this one answered, **including** where that engine
 * drifted the same way on an ordinary critical path. Fixing that is a change
 * that moves numbers in every plan that exists, and it is not this one.
 *
 * Proof that the scoping is load-bearing: with `hasQueues` dropped, so the rule
 * applies to every plan, the differential failed at seed 2 —
 * `r1c0g0.latestStart` `4.666666666666666` became `4.666666666666667`, on a
 * plan nobody is assigned to; watched 2026-08-09.
 */
function lateTimes(
  graph: SliceGraph,
  order: readonly number[],
  successorsOf: readonly (readonly number[])[],
  projectFinish: number,
  placed: readonly Placed[],
  hasQueues: boolean,
): Late[] {
  const { nodes } = graph;
  const late: Late[] = [];
  const anchorOf = new Array<{ finish: number; at: number } | undefined>(graph.items);
  for (let step = order.length - 1; step >= 0; step -= 1) {
    const taken = order[step];
    const node = nodes[taken];
    const { offsets, at } = node;
    const successors = successorsOf[taken];
    let finish = projectFinish;
    for (const next of successors) {
      const settled = late[next].latestStart;
      if (settled < finish) finish = settled;
    }

    // The tight-path rule. Proof: with this branch removed, `reports a queue
    // that ends the project as critical, exactly` failed on `a`'s late start —
    // `Expected: 0 Received: -2.220446049250313e-16` — and, with that
    // assertion taken out of the way, on `b`'s: `Expected: 1.3333333333333333
    // Received: 1.333333333333333`; watched 2026-08-11.
    //
    // It is watched on the late starts and nowhere else. Under the same fault
    // the whole of `apps/be-01` was green before those two assertions existed:
    // the -2.2e-16 the rule exists to prevent is inside `slackOf`'s window, so
    // the `float` and `critical` assertions in that test — and every
    // differential — report the snapped answer either way. What the rule buys
    // is the number the engine hands out verbatim, not the colour.
    const early = placed[taken];
    if (hasQueues && finish === early.finish) {
      anchorOf[node.item] = { finish, at };
      late[taken] = { latestFinish: finish, latestStart: early.start };
      continue;
    }

    const anchor = anchorOf[node.item];
    const held =
      anchor !== undefined && finish === anchor.finish - (offsets[anchor.at + 1] - offsets[at + 1])
        ? anchor
        : { finish, at };
    anchorOf[node.item] = held;
    late[taken] = {
      latestFinish: finish,
      // Proof: written as `finish - (offsets[at + 1] - offsets[at])` — the
      // textbook `finish - days` — and the differential failed at seed 255 with
      // a late start of 0 becoming 6.661338147750939e-16, which is a row that
      // had no slack acquiring some and losing its red; watched 2026-08-09.
      latestStart: held.finish - (offsets[held.at + 1] - offsets[at]),
    };
  }
  return late;
}

/**
 * A row's slack: how far its late start is after its early one, with
 * accumulated floating-point drift snapped out — and therefore the one number
 * `critical` is read off.
 *
 * Both ends come out of chains of double additions the engine deliberately
 * reports verbatim, so a row that cannot slip by so much as an hour subtracts
 * to ±1e-15 rather than to 0. Three PERT sixths summing to exactly 15 arrive as
 * 15.000000000000002 (`snapWorkdays`' own example), every row that ends there
 * inherits the drifted bit, and an exact `=== 0` reads it as slack: cloud case
 * A1, live on dev — a chain and a flat row all ending the project, Slack
 * printing `0` on each of them and only one carrying `critical`.
 *
 * {@link snapWorkdays}, at the same 1e-9 window the calendar boundaries use,
 * because this is the same step: a continuous offset becoming a discrete
 * answer, here `critical` rather than a date. Sharing the window is what makes
 * the two agree — a difference the calendar has already decided is not a day
 * cannot be a difference the Slack column decides is float. Applied to the
 * **reported** slack and not only to the comparison, so what the column prints
 * and what the red says are the same number.
 *
 * The snap is on slack alone. `latestStart` and `latestFinish` stay verbatim,
 * and so does the leveller's own float — its priority rule ranks genuinely
 * different floats and must keep separating two rows the schedule can tell
 * apart. Real slack survives untouched at the sizes plans are written in: a
 * PERT final over whole-day estimates lands on a multiple of a sixth of a day,
 * eight orders of magnitude above the window, and a test on this path holds it.
 *
 * Smaller is expressible, and the window does eat it. `ThreePointEstimate` is
 * three `number>=0` with no floor under them, so a plan may put 5e-10 of a day
 * against a row, and slack that size snaps to `0` and reads `critical`. That is
 * an accepted edge rather than a case this cannot reach: a row with less than a
 * billionth of a workday to spare is a row that cannot move, and red is the
 * answer a reader wants for it. The window is chosen against the fractions
 * estimates are given in, not against every double the type admits.
 *
 * `-0` is normalised because a drifted zero is as often below as above. It is
 * `0` to `===` and to the reader — same colour, same printed slack — and it is
 * **not** `0` to `Object.is`, which is what `toBe` and `toMatchObject` compare
 * with, so leaving it would make the fixed answer unassertable.
 *
 * Proof, both watched 2026-08-11 and each fault then reverted:
 *
 * - the `snapWorkdays` call dropped (a bare `latestStart - earliestStart`) and
 *   four tests failed — `paints every row that ends the project red, drift and
 *   all` on `critical: false` with a float of `8.881784197001252e-16` for
 *   `chain-a`, which is case A1's own shape; `reports no float on a row a
 *   notBefore floor stands at the project finish` on `Expected: 0 Received:
 *   -1.7763568394002505e-15`; and both differential tests in
 *   `schedule-identity.test.ts`, `seed 1, r0c0g0.float: 0 became
 *   -1.7763568394002505e-15`.
 * - the `-0` normalisation dropped instead, and the floor test failed alone,
 *   on `Expected: 0 Received: -0` — the same day on screen and a different
 *   number to `Object.is`.
 */
function slackOf(latestStart: number, earliestStart: number): number {
  const slack = snapWorkdays(latestStart - earliestStart);
  return slack === 0 ? 0 : slack;
}

/**
 * The schedule for a project: computed in slices, and levelled so that one
 * person does one thing at a time.
 *
 * Two passes of {@link placeSlices}. The first has the people taken out and is
 * the ordinary critical path — the numbers this engine has always answered, and
 * the priorities the second ranks by. The second is the plan that comes out:
 * the highest-priority eligible slice placed at the latest of its floors, one
 * of which is its assignee's last finish. {@link lateTimes} then runs backwards
 * over the **augmented** graph — the plan's edges and the resource ones the
 * placement chose — so slack and `critical` describe the plan a person will
 * actually work, not one where everybody is in two places at once.
 *
 * A plan with nobody assigned has no resource edges and no person floors, so
 * the second pass is the first pass and every number is what it was before
 * leveling existed. That is asserted rather than argued: a thousand seeded
 * plans and one captured live plan go through this engine and the one it
 * replaced, and every field is compared with `toBe`.
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
 * every leaf beneath its predecessor has its **anchor slice** — its first slice
 * in role order — finish before every leaf beneath its successor starts, which
 * is "all of 010's first-role work before any of 020" (Dany's rule,
 * 2026-08-11: a dependency waits on the predecessor's Dev, never on its QA).
 * Between two leaves it joins the predecessor's **first** slice to the
 * successor's **first** — on the successor side never the first *estimated*
 * one, which would leave an unestimated `Dev` with no predecessor at all and
 * start the row before the thing it waits for. The predecessor's later slices
 * are free to run in parallel with the successor. Edges still touch only
 * slices at an item's boundary and the intra-item chains are private,
 * forward-only paths, so a cycle is still a property of the leaf graph alone
 * and {@link hasCycle} still answers for it.
 *
 * **The arithmetic is anchored on each work item's own start**, not accumulated
 * from slice to slice: a slice finishes at `base + offsets[i + 1]` rather than
 * at `start + days`. `(base + a) + b` is not `base + (a + b)` in doubles — with
 * a PERT base of `3.6666666666666665` and two sixth-of-a-day slices the first
 * gives `3.9999999999999996` and the second gives exactly `4`, and `datesOf`
 * reads a finish through `Math.ceil`, so that bit is a whole day on screen.
 * Anchoring is what makes this engine answer what its predecessor answered.
 * With nobody assigned nothing but the plan constrains a slice, so the
 * anchoring is also what the graph says: external edges *arrive* only at a
 * work item's first slice, and where they *leave* from does not matter — an
 * outgoing edge imposes no floor on the slice it leaves. (They now leave the
 * first slice too; the backward pass never assumed otherwise — it walks the
 * adjacency as built.) A person is what breaks that, and the anchor moves to
 * the slice they held back — see {@link SpanAnchor}.
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
   * The earliest offset each work item may start at, from a manual constraint.
   *
   * Taken as a floor alongside the predecessors' finishes, never as a pin: a
   * work item told "not before day 10" whose predecessor finishes on day 14
   * starts on day 14. Dany's call — the constraint may only ever push an item
   * later, so the dependency tree and the calendar cannot contradict each
   * other. A work item absent from the map is unconstrained. It applies to the
   * work item's **first** slice, and thereby to all of them.
   *
   * A floor keyed by a **parent** reaches every leaf beneath it, exactly as a
   * dependency declared on a parent does: "this phase starts no earlier than
   * the 12th" means none of its work does. Each leaf takes the latest of its
   * own floor and every ancestor's — see the expansion below.
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

  // Floors expanded down the tree the same way the edges are: a floor keyed by
  // any row constrains every leaf beneath it, and each leaf keeps the
  // **latest** of its own floor and every ancestor's. `Math.max`, never a
  // copy-down — a parent's day 3 must not overwrite a child's own day 9.
  // Until 2026-08-10 this map was read for leaf ids alone, so a floor written
  // on a parent was accepted, stored, echoed back — and constrained nothing;
  // `floors every leaf beneath a parent told not to start before a day`
  // (`work-item.service.test.ts`) was watched failing on the leaf starting
  // `2026-08-06` under a parent floored to `2026-08-12`.
  //
  // Proof: the `Math.max` replaced with a bare copy-down (`set(leafId,
  // atLeast)`) and two tests in `schedule-shapes.test.ts` failed — `composes
  // ancestor floors with a dependency, each leaf keeping its own maximum` on
  // `L2` at `earliestStart: 5` where its own day-9 floor was owed, and
  // `carries a grandparent's floor two levels down to the leaf` on
  // `earliestStart: 3` where the grandparent's day 6 was; watched 2026-08-10.
  const leafFloors = new Map<string, number>();
  for (const [flooredId, atLeast] of notBefore) {
    for (const leafId of index.leavesUnder.get(flooredId) ?? []) {
      leafFloors.set(leafId, Math.max(leafFloors.get(leafId) ?? 0, atLeast));
    }
  }

  /**
   * The nodes, in the order they run: every leaf's slices in role order, and
   * the intra-item chain between them.
   *
   * A group is never empty — {@link groupByWorkItem} only creates one because a
   * slice went into it — so a leaf's first and last node are its first and last
   * slice. A leaf with no group at all is what `slicesOf` refuses, which is why
   * this loop asks it for every leaf before any edge is drawn.
   */
  const nodes: SliceNode[] = [];
  const firstNode = new Map<string, number>();
  let items = 0;
  for (const leafId of leafIds) {
    const { slices: own, offsets } = slicesOf(leafId);
    const item = items;
    items += 1;
    const first = nodes.length;
    own.forEach((slice, at) => {
      nodes.push({
        key: sliceKey(slice.workItemId, slice.roleId),
        slice,
        item,
        at,
        offsets,
        notBefore: at === 0 ? (leafFloors.get(leafId) ?? 0) : 0,
        predecessors: [],
        successors: [],
      });
    });
    for (let node = first + 1; node < nodes.length; node += 1) {
      nodes[node - 1].successors.push(node);
      nodes[node].predecessors.push(node - 1);
    }
    // Recorded only if the group put a node in. It always does — a group exists
    // because a slice created it — and the one thing that could make it not is
    // the fault `firstNodeOf` below names, which is why nothing is written for
    // a leaf with no node rather than a dangling index.
    if (nodes.length > first) firstNode.set(leafId, first);
  }

  /**
   * Where a leaf's slices begin among the nodes — the node every external edge
   * touches, on either side (the anchor going out, the attachment coming in).
   *
   * Every leaf has an entry: the loop above made one for each of them, and
   * refused the leaf it was handed no slice for. It throws rather than skipping
   * because a dependency quietly dropped is a plan whose rows are all real and
   * whose dates are for a different plan.
   *
   * Proof: with `slicesOf` returning an empty group instead of throwing — the
   * fault `schedule-on-item-role` documents — `refuses a dependency onto a leaf
   * it has no slice for` failed here, `no slice for work item leaf-2`, instead
   * of coming back with the row missing and the edge ignored; watched
   * 2026-08-09.
   */
  const firstNodeOf = (leafId: string): number => {
    const found = firstNode.get(leafId);
    if (found === undefined) throw new Error(`no slice for work item ${leafId}`);
    return found;
  };

  // The predecessor's **first** slice — its anchor — to the successor's
  // **first**: the anchor finishes before any of the successor starts, the
  // predecessor's later roles run in parallel with it, and the successor's own
  // order carries the wait to the roles behind its first. Pushed onto the two
  // nodes rather than rebuilt into a map — the adjacency is written once per
  // edge.
  //
  // Proof: the join reverted to the predecessor's **last** node — then spelt
  // `endsOf(predecessorId).last`, the whole-item rule this replaced — and
  // `waits for the first role, not the last` failed on `Expected: 3,
  // Received: 5`, `a branch releases at its anchors` on `Expected: 4,
  // Received: 5`, `a zero-length anchor clears immediately` on `Expected: 0,
  // Received: 4` (`schedule-shapes.test.ts`); watched 2026-08-11.
  for (const { predecessorId, successorId } of leafEdges) {
    const before = firstNodeOf(predecessorId);
    const after = firstNodeOf(successorId);
    nodes[before].successors.push(after);
    nodes[after].predecessors.push(before);
  }
  const graph: SliceGraph = { nodes, items };

  // The same plan with nobody's calendar in it — the critical path, computed by
  // the pass above with the people taken out rather than by a second copy of
  // it. Its start and float are what the leveller ranks by, and its numbers are
  // exactly what this engine answers when nobody is assigned. The order it is
  // computed in is the order the nodes were built in, which is all a plan with
  // no queues in it needs.
  const unleveled = placeSlices(graph, (left, right) => left < right, false);
  const criticalPath = lateTimes(
    graph,
    unleveled.order,
    nodes.map((node) => node.successors),
    Math.max(0, ...unleveled.placed.map((each) => each.finish)),
    unleveled.placed,
    // The critical path is a ranking, not an answer, and it is the plan with
    // nobody in it by construction — there are no queues here to be tight about.
    false,
  );

  const numbers = deriveNumbers(rows);
  const leafPriorities = priorityByLeaf(rows, index);
  const priorityOf: SlicePriority[] = nodes.map((node, at) => ({
    // Both slices of one work item carry its priority, which is what keeps a priority a
    // fact about the work rather than about one of its phases.
    priority: leafPriorities.get(node.slice.workItemId) ?? Infinity,
    start: unleveled.placed[at].start,
    float: criticalPath[at].latestStart - unleveled.placed[at].start,
    // `deriveNumbers` covers every row or throws, so the fallback is
    // unreachable; it is a default rather than a throw because this is the
    // third of four tie-breaks and an empty string only ever reorders slices
    // that are already equal on time.
    number: numbers.get(node.slice.workItemId) ?? '',
    at: node.at,
  }));
  /**
   * The priority rule, in full: what somebody said matters most, then what the
   * critical path needs first, then what has least room to move, then the
   * plan's own order.
   *
   * The last two are what make it deterministic rather than merely correct.
   * Two slices that tie on time are separated by their work item's number and
   * then by their place in the role order, so the same plan cannot schedule two
   * ways — and no pair can tie on all five, since two slices of one work item
   * differ in the last.
   *
   * **This rule decides an order, never a date.** Whichever slice is taken
   * first is still placed at the latest of its own floors, so a priority cannot
   * put a work item in front of its dependencies, its floor or its earlier
   * roles — it decides who goes first where the schedule has a choice, which is
   * exactly the case where two slices are both eligible and want one person.
   *
   * Proof: the first two comparisons deleted, so that the plan's own order
   * decided, and two tests failed — `gives the queue to the slice that can
   * start soonest, before the one with less slack` put `kat` on a slice she
   * could not begin for three days and pushed the other out to 5→7, finishing
   * the project two days later than it needs to; watched 2026-08-09.
   *
   * Proof: the priority comparison deleted and 8 of the 11 tests in
   * `schedule-priority.test.ts` failed — `starts the smaller priority first
   * when two work items want one person` on the work item with the smaller
   * priority coming back at 3→5, behind the one it outranks and bound by
   * `person`; watched 2026-08-11.
   */
  const goesFirst = (left: number, right: number): boolean => {
    const first = priorityOf[left];
    const second = priorityOf[right];
    if (first.priority !== second.priority) return first.priority < second.priority;
    if (first.start !== second.start) return first.start < second.start;
    if (first.float !== second.float) return first.float < second.float;
    if (first.number !== second.number) return first.number < second.number;
    return first.at < second.at;
  };

  const leveled = placeSlices(graph, goesFirst, true);
  const projectFinish = Math.max(0, ...leveled.placed.map((each) => each.finish));
  // The augmented graph: the plan's edges and the ones the placement chose. A
  // slice held off by a person cannot slip without moving what that person does
  // next, so `float` and `critical` are only true of the plan that comes out if
  // they are computed over both.
  //
  // Proof: the backward pass run over the plan's successors alone and `counts
  // the person behind a slice as a reason it cannot slip` failed — a slice
  // whose assignee goes straight from it onto the critical path came back with
  // three days of slack it does not have, and no red; watched 2026-08-09.
  const queues = leveled.resourceSuccessors;
  const augmented = nodes.map((node, at) =>
    queues[at].length === 0 ? node.successors : [...node.successors, ...queues[at]],
  );
  const late = lateTimes(
    graph,
    leveled.order,
    augmented,
    projectFinish,
    leveled.placed,
    queues.some((next) => next.length > 0),
  );

  const scheduledSlices = new Map<string, ScheduledSlice>();
  const waiting = new Set<string>();
  nodes.forEach((node, at) => {
    const { slice } = node;
    const placed = leveled.placed[at];
    const { latestStart, latestFinish } = late[at];
    const slack = slackOf(latestStart, placed.start);
    if (placed.boundBy === 'person') waiting.add(slice.workItemId);
    scheduledSlices.set(node.key, {
      workItemId: slice.workItemId,
      roleId: slice.roleId,
      duration: slice.days ?? 0,
      // Proof: hard-coded to `true` and the captured live plan came back with
      // three of its rows claiming somebody had estimated them, along with
      // `reports an unestimated leaf as unestimated, not merely as zero` and
      // the parent above it; watched 2026-08-09.
      estimated: slice.days !== null,
      earliestStart: placed.start,
      earliestFinish: placed.finish,
      latestStart,
      latestFinish,
      float: slack,
      critical: slack === 0,
      personId: slice.personId,
      boundBy: placed.boundBy,
      resourcePredecessorId:
        placed.resourcePredecessor === NOBODY ? null : nodes[placed.resourcePredecessor].key,
    });
  });

  const scheduleOf = (key: string): ScheduledSlice => {
    const found = scheduledSlices.get(key);
    if (found === undefined) throw new Error(`no schedule for slice ${key}`);
    return found;
  };
  return {
    slices: scheduledSlices,
    workItems: projectOntoWorkItems(rows, index, slicesOf, scheduleOf),
    waitingForPerson: waiting.size,
  };
}

/**
 * A work item's own schedule, read off the slices beneath it, and a parent's
 * span read off those.
 *
 * A leaf takes the earliest of its slices' starts, the latest of their
 * finishes, their total duration, and is estimated when any of them is.
 *
 * Its **slack is the least any of its slices has**, and it is critical when any
 * of them is — but where its slices **tile**, that least slack is read off the
 * projected endpoints instead. Tiling slices all carry the same float in
 * arithmetic and not in doubles: `(A + p) - (B + p)` differs from `A - B` for a
 * majority of pairs drawn from PERT finals, so taking the minimum would give a
 * row that has always had a slack of `0` a slack of `-1.1e-16` and a red row
 * where there was none. The endpoints are the first slice's own two numbers, so
 * reading them is the same answer with none of that noise.
 *
 * A work item a person has pulled apart does not tile, and then the endpoints
 * are not the answer at all: a row whose `QA` was held back until its assignee
 * came free has a critical `QA` and a slack `Dev`, and the difference of its
 * ends would report the slack of the `Dev` and no red.
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
    // Whether the slices tile: each one begins where the one before it ended,
    // early and late. That is exactly the condition under which the placement
    // kept one anchor for the whole work item, so the endpoints below are the
    // first slice's own numbers rather than a subtraction across a gap.
    const tiles = own.every(
      (s, at) =>
        at === 0 ||
        (s.earliestStart === own[at - 1].earliestFinish &&
          s.latestStart === own[at - 1].latestFinish),
    );
    // Proof: with `tiles` forced to `false`, so that tiling slices are
    // aggregated too, `answers what the previous engine answered` failed at
    // seed 256 — a row's slack of 12.333333333333332 became 12.33333333333333;
    // watched 2026-08-09. Forced to `true`, so that a work item a person pulled
    // apart is read off its ends, `reports the least slack of a work item whose
    // slices a person pushed apart` failed with a slack of 5 on a row holding a
    // critical slice.
    //
    // The aggregated side — a row a person pulled apart — needs no
    // {@link slackOf} of its own: every slice's float is snapped before it gets
    // here, and the least of snapped numbers is one of them. Its `critical` is
    // left as it was, read off the slices rather than off the aggregate, which
    // is that branch's own rule and not this change's to move.
    const slack = tiles ? slackOf(late, start) : Math.min(...own.map((s) => s.float));
    projected.set(leafId, {
      duration: own.reduce((sum, s) => sum + s.duration, 0),
      estimated: own.some((s) => s.estimated),
      earliestStart: start,
      earliestFinish: Math.max(...own.map((s) => s.earliestFinish)),
      latestStart: late,
      latestFinish: Math.max(...own.map((s) => s.latestFinish)),
      float: slack,
      critical: tiles ? slack === 0 : own.some((s) => s.critical),
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
