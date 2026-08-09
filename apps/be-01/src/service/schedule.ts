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

/** One slice's place inside its work item: which work item, and how many roles into it. */
interface SlicePlace {
  workItemId: string;
  at: number;
}

/**
 * The slice graph the passes run over: the nodes, where each one belongs, and
 * the edges the **plan** declares — dependencies and the intra-item role chain.
 *
 * The resource edges are not in here, because they do not exist until the pass
 * chooses them.
 */
interface SliceGraph {
  keys: readonly string[];
  placeOf: (key: string) => SlicePlace;
  offsetsOf: (workItemId: string) => readonly number[];
  predecessorsOf: ReadonlyMap<string, string[]>;
  successorsOf: ReadonlyMap<string, string[]>;
  notBefore: ReadonlyMap<string, number>;
}

/** Where one slice was put, and what put it there. */
interface Placed {
  start: number;
  finish: number;
  boundBy: ScheduleFloor;
  resourcePredecessorId: string | null;
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
 * A binary heap of slice keys — the eligible set, kept in priority order.
 *
 * A sorted array rescanned for the first eligible slice is quadratic in the
 * slices, and the plans this has to hold are thousands of them. `O(log n)` per
 * placement is what keeps the whole pass at `O(V log V + E)`.
 */
function eligibleSet(goesFirst: (left: string, right: string) => boolean) {
  const heap: string[] = [];
  const swap = (a: number, b: number): void => {
    const held = heap[a];
    heap[a] = heap[b];
    heap[b] = held;
  };
  return {
    get size(): number {
      return heap.length;
    },
    push(key: string): void {
      heap.push(key);
      for (let at = heap.length - 1; at > 0; ) {
        const parent = (at - 1) >> 1;
        if (!goesFirst(heap[at], heap[parent])) break;
        swap(at, parent);
        at = parent;
      }
    },
    take(): string | undefined {
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
 * A map entry the pass itself wrote, or a throw.
 *
 * Every one of these is read after the pass has written it — a predecessor is
 * placed before its successor is looked at. A `?? 0` here would turn a mistake
 * in the ordering into a slice quietly scheduled on day zero, which is the
 * shape of wrongness nobody reading a plan could detect.
 *
 * Proof: it is reached. With the cycle throw below deleted, `throws on a cyclic
 * graph rather than returning a schedule` failed here — `no placement for slice
 * a\0role-dev` — rather than coming back with a plan missing the rows in the
 * loop; watched 2026-08-09.
 */
function written<T>(from: ReadonlyMap<string, T>, key: string, what: string): T {
  const found = from.get(key);
  if (found === undefined) throw new Error(`no ${what} for slice ${key}`);
  return found;
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
  goesFirst: (left: string, right: string) => boolean,
  personOf: (key: string) => string | null,
): { order: string[]; placed: Map<string, Placed>; resourceSuccessors: Map<string, string[]> } {
  const waitingOn = new Map(
    graph.keys.map((key) => [key, (graph.predecessorsOf.get(key) ?? []).length]),
  );
  const eligible = eligibleSet(goesFirst);
  for (const key of graph.keys) if (waitingOn.get(key) === 0) eligible.push(key);

  const placed = new Map<string, Placed>();
  const order: string[] = [];
  const anchorOf = new Map<string, SpanAnchor>();
  /** Each person's last placement — their finishes only ever go up, so it is also their latest. */
  const busyUntil = new Map<string, { key: string; finish: number }>();
  const resourceSuccessors = new Map<string, string[]>();

  for (let key = eligible.take(); key !== undefined; key = eligible.take()) {
    const place = graph.placeOf(key);
    const offsets = graph.offsetsOf(place.workItemId);

    let fromPredecessor = 0;
    let fromRoleOrder = 0;
    for (const earlier of graph.predecessorsOf.get(key) ?? []) {
      const { finish } = written(placed, earlier, 'placement');
      if (graph.placeOf(earlier).workItemId === place.workItemId) {
        fromRoleOrder = Math.max(fromRoleOrder, finish);
      } else fromPredecessor = Math.max(fromPredecessor, finish);
    }
    const personId = personOf(key);
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
      { at: place.at === 0 ? (graph.notBefore.get(place.workItemId) ?? 0) : 0, kind: 'notBefore' },
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
    const anchor = anchorOf.get(place.workItemId);
    const held =
      anchor !== undefined && start === anchor.start + (offsets[place.at] - offsets[anchor.at])
        ? anchor
        : { start, at: place.at };
    anchorOf.set(place.workItemId, held);
    // Proof: written as `start + (offsets[at + 1] - offsets[at])` — the
    // textbook `start + days`, accumulated from slice to slice — and `answers
    // what the previous engine answered` failed at seed 260: a work item's late
    // start of 10.666666666666666 became 10.666666666666668; watched
    // 2026-08-09.
    const finish = held.start + (offsets[place.at + 1] - offsets[held.at]);
    placed.set(key, {
      start,
      finish,
      boundBy,
      resourcePredecessorId: boundBy === 'person' && busy !== undefined ? busy.key : null,
    });
    order.push(key);

    if (personId !== null) {
      // The edge the pass chose: this person's work, in the order it will be
      // done. It is a real precedence constraint of the plan that comes out,
      // so the backward pass runs over it too.
      if (busy !== undefined) {
        resourceSuccessors.set(busy.key, [...(resourceSuccessors.get(busy.key) ?? []), key]);
      }
      // Where the slice actually landed, which is the whole difference between
      // this algorithm and the one it replaced. Proof: recorded as that slice's
      // **critical-path** finish instead — one forward re-run over stale
      // numbers, which is what v1 did — and `does not re-overlap a person
      // downstream of a dependency push` failed, alone: `r` came back at 5→7
      // on top of `q` at 4→6, `boundBy: 'predecessor'`; watched 2026-08-09.
      busyUntil.set(personId, { key, finish });
    }
    for (const next of graph.successorsOf.get(key) ?? []) {
      const left = written(waitingOn, next, 'predecessor count') - 1;
      waitingOn.set(next, left);
      if (left === 0) eligible.push(next);
    }
  }

  // The eligible set emptied with slices left over: the only way that happens
  // is a loop in the plan's own edges, since a resource edge always points from
  // something already placed. Proof: this throw deleted and `throws on a cyclic
  // graph rather than returning a schedule` failed with `no placement for slice
  // a\0role-dev` instead — an untyped error, which `tree` rethrows, so a plan
  // with a loop in it would 500 the whole project instead of coming back with
  // its rows and the banner saying why it has no dates; watched 2026-08-09.
  if (order.length !== graph.keys.length) throw new ScheduleCycleError();
  return { order, placed, resourceSuccessors };
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
 */
function lateTimes(
  graph: SliceGraph,
  order: readonly string[],
  successorsOf: ReadonlyMap<string, readonly string[]>,
  projectFinish: number,
): Map<string, Late> {
  const late = new Map<string, Late>();
  const anchorOf = new Map<string, { finish: number; at: number }>();
  for (const key of [...order].reverse()) {
    const place = graph.placeOf(key);
    const offsets = graph.offsetsOf(place.workItemId);
    const successors = successorsOf.get(key) ?? [];
    const finish =
      successors.length === 0
        ? projectFinish
        : Math.min(...successors.map((next) => written(late, next, 'late time').latestStart));
    const anchor = anchorOf.get(place.workItemId);
    const held =
      anchor !== undefined &&
      finish === anchor.finish - (offsets[anchor.at + 1] - offsets[place.at + 1])
        ? anchor
        : { finish, at: place.at };
    anchorOf.set(place.workItemId, held);
    late.set(key, {
      latestFinish: finish,
      // Proof: written as `finish - (offsets[at + 1] - offsets[at])` — the
      // textbook `finish - days` — and the differential failed at seed 255 with
      // a late start of 0 becoming 6.661338147750939e-16, which is a row that
      // had no slack acquiring some and losing its red; watched 2026-08-09.
      latestStart: held.finish - (offsets[held.at + 1] - offsets[place.at]),
    });
  }
  return late;
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
 * With nobody assigned nothing but the plan constrains a slice, so the
 * anchoring is also what the graph says: only the first slice of a work item
 * has an external predecessor and only the last has an external successor. A
 * person is what breaks that, and the anchor moves to the slice they held back
 * — see {@link SpanAnchor}.
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

  const predecessorsOf = new Map<string, string[]>();
  const successorsOf = new Map<string, string[]>();
  for (const { predecessorId, successorId } of sliceEdges) {
    predecessorsOf.set(successorId, [...(predecessorsOf.get(successorId) ?? []), predecessorId]);
    successorsOf.set(predecessorId, [...(successorsOf.get(predecessorId) ?? []), successorId]);
  }

  const placeOf = new Map<string, SlicePlace>();
  const personOf = new Map<string, string | null>();
  for (const leafId of leafIds) {
    slicesOf(leafId).slices.forEach((slice, at) => {
      const key = sliceKey(slice.workItemId, slice.roleId);
      placeOf.set(key, { workItemId: leafId, at });
      personOf.set(key, slice.personId);
    });
  }
  const graph: SliceGraph = {
    keys,
    placeOf: (key) => written(placeOf, key, 'place'),
    offsetsOf: (workItemId) => slicesOf(workItemId).offsets,
    predecessorsOf,
    successorsOf,
    notBefore,
  };

  // The same plan with nobody's calendar in it — the critical path, computed by
  // the pass below with the people taken out rather than by a second copy of
  // it. Its start and float are what the leveller ranks by, and its numbers are
  // exactly what this engine answers when nobody is assigned.
  const takenIn = new Map(keys.map((key, at) => [key, at]));
  const unleveled = placeSlices(
    graph,
    (left, right) => written(takenIn, left, 'position') < written(takenIn, right, 'position'),
    () => null,
  );
  const criticalPath = lateTimes(
    graph,
    unleveled.order,
    successorsOf,
    Math.max(0, ...keys.map((key) => written(unleveled.placed, key, 'placement').finish)),
  );

  const numbers = deriveNumbers(rows);
  const priorityOf = new Map<string, SlicePriority>(
    keys.map((key) => {
      const start = written(unleveled.placed, key, 'placement').start;
      const place = written(placeOf, key, 'place');
      return [
        key,
        {
          start,
          float: written(criticalPath, key, 'late time').latestStart - start,
          number: numbers.get(place.workItemId) ?? '',
          at: place.at,
        },
      ];
    }),
  );
  /**
   * The priority rule, in full: what the critical path needs first, then what
   * has least room to move, then the plan's own order.
   *
   * The last two are what make it deterministic rather than merely correct.
   * Two slices that tie on time are separated by their work item's number and
   * then by their place in the role order, so the same plan cannot schedule two
   * ways — and no pair can tie on all four, since two slices of one work item
   * differ in the last.
   *
   * Proof: the first two comparisons deleted, so that the plan's own order
   * decided, and two tests failed — `gives the queue to the slice that can
   * start soonest, before the one with less slack` put `kat` on a slice she
   * could not begin for three days and pushed the other out to 5→7, finishing
   * the project two days later than it needs to; watched 2026-08-09.
   */
  const goesFirst = (left: string, right: string): boolean => {
    const first = written(priorityOf, left, 'priority');
    const second = written(priorityOf, right, 'priority');
    if (first.start !== second.start) return first.start < second.start;
    if (first.float !== second.float) return first.float < second.float;
    if (first.number !== second.number) return first.number < second.number;
    return first.at < second.at;
  };

  const leveled = placeSlices(graph, goesFirst, (key) => written(personOf, key, 'person'));
  const projectFinish = Math.max(
    0,
    ...keys.map((key) => written(leveled.placed, key, 'placement').finish),
  );
  // The augmented graph: the plan's edges and the ones the placement chose. A
  // slice held off by a person cannot slip without moving what that person does
  // next, so `float` and `critical` are only true of the plan that comes out if
  // they are computed over both.
  //
  // Proof: the backward pass run over `successorsOf` alone and `counts the
  // person behind a slice as a reason it cannot slip` failed — a slice whose
  // assignee goes straight from it onto the critical path came back with three
  // days of slack it does not have, and no red; watched 2026-08-09.
  const augmented = new Map<string, string[]>(successorsOf);
  for (const [key, next] of leveled.resourceSuccessors) {
    augmented.set(key, [...(augmented.get(key) ?? []), ...next]);
  }
  const late = lateTimes(graph, leveled.order, augmented, projectFinish);

  const scheduledSlices = new Map<string, ScheduledSlice>();
  const waiting = new Set<string>();
  for (const leafId of leafIds) {
    for (const slice of slicesOf(leafId).slices) {
      const key = sliceKey(slice.workItemId, slice.roleId);
      const placed = written(leveled.placed, key, 'placement');
      const { latestStart, latestFinish } = written(late, key, 'late time');
      if (placed.boundBy === 'person') waiting.add(slice.workItemId);
      scheduledSlices.set(key, {
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
        float: latestStart - placed.start,
        critical: latestStart - placed.start === 0,
        personId: slice.personId,
        boundBy: placed.boundBy,
        resourcePredecessorId: placed.resourcePredecessorId,
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
    projected.set(leafId, {
      duration: own.reduce((sum, s) => sum + s.duration, 0),
      estimated: own.some((s) => s.estimated),
      earliestStart: start,
      earliestFinish: Math.max(...own.map((s) => s.earliestFinish)),
      latestStart: late,
      latestFinish: Math.max(...own.map((s) => s.latestFinish)),
      // Proof: with `tiles` forced to `false`, so that tiling slices are
      // aggregated too, `answers what the previous engine answered` failed at
      // seed 256 — a row's slack of 12.333333333333332 became
      // 12.33333333333333; watched 2026-08-09. Forced to `true`, so that a work
      // item a person pulled apart is read off its ends, `reports the least
      // slack of a work item whose slices a person pushed apart` failed with a
      // slack of 5 on a row holding a critical slice.
      float: tiles ? late - start : Math.min(...own.map((s) => s.float)),
      critical: tiles ? late - start === 0 : own.some((s) => s.critical),
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
