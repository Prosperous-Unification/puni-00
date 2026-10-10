import type { DependencyReach } from './dependency-reach';
import type { PlannedRow } from './derive-numbers';
import { leafDeadlinesOf, leafFloorsOf } from './leaf-constraints';
import { WORK_ITEM_PROJECTION_START, workdaysLateBy } from './on-time';
import { validateRealBoundaries } from './real-boundaries';
import { resolveStepNodeGraph, type StepNodeGraphEdge } from './slice-edges';
import { groupSlicesByLeaf } from './slice-groups';
import { treeOrder } from './tree-order';
import type { TypedDependency } from './typed-dependency';
import { lastWorkdayOf, snapWorkdays, withinDrift } from './workday';

/** A finish-to-start edge, as written: either end may be a parent. */
export interface DependencyEdge {
  predecessorId: string;
  successorId: string;
}

/**
 * One work item's work for one step — the unit a schedule is computed in.
 *
 * `stepId` is null only in a project that holds no steps at all, which is
 * reachable: a project's last step can be removed. The work item still has to
 * be somewhere in the plan, so it gets one slice belonging to nobody rather
 * than falling out of the graph its neighbours' dependencies run through.
 *
 * `days` is **effort**, not duration: a slice of 6 days' effort that three
 * people may work at once runs for 2. Duration is `days / width`, and the two
 * are the same number for every slice of width 1 — which is every slice of
 * every plan that sets neither capacity field.
 *
 * `days` is null when nobody has estimated this pair, which is not the same
 * fact as zero — see {@link Scheduled.estimated}.
 */
export interface Slice {
  workItemId: string;
  stepId: string | null;
  days: number | null;
  /**
   * Who is doing this work, or nobody — **resolved by the caller**.
   *
   * A work item with exactly one assignment is taken to be that person's
   * whole — the assumed assignee — so every slice of it carries them, and a
   * work item with two carries each step's own. The reading is
   * `assumedAssignee`, and it is made here rather than in the pass because a
   * second implementation of it would put people in queues nobody assigned
   * them to. The pass only ever asks "the same person as that slice?".
   */
  personId: string | null;
  /**
   * How many slots this block holds at once — 1 unless the plan says
   * otherwise, and **resolved by the caller**.
   *
   * `personId`'s rule for `personId`'s reason: a second implementation of the
   * clamp inside the pass would put work on widths nobody asked for. The
   * caller's reading is the item's `maxParallel`, clamped down by its pool's
   * size and dropped to 1 for a named assignee — one human cannot work beside
   * themselves.
   *
   * The block is **indivisible**: `width` slots for `days / width` days, or it
   * waits. It never runs narrow and widens later, because a duration that
   * depended on what was free when the block was popped would depend on
   * placement order, and `offsets[]` is summed before any of that is known.
   */
  width: number;
  /**
   * The pools this block draws its slots from — one per **sized** team the row
   * is effectively labelled with, from `effectiveTeamsOf`, and **resolved by
   * the caller** for `width`'s reason.
   *
   * **Every member spends the block's whole width for the block's whole
   * duration** (Dany, 2026-08-13): three teams on a five-day slice block five
   * days in each of the three pools, not five days split between them. So the
   * block starts at the earliest instant *all* of them have room, and takes a
   * slot from each.
   *
   * Empty is the state of every plan that names no team and of every plan whose
   * teams are unsized: an empty set reserves nothing and waits for nothing,
   * which is the `null` this replaced, verbatim.
   *
   * Deliberately not `string | null` widened to an array of at most one: the
   * shape changed so that every reader of the old field is a compile error
   * rather than a silent first-member read (`team-sets` design.md D3/D4, one
   * layer down).
   */
  poolIds: readonly string[];
}

/**
 * How many slots each pool holds — the sizes the placement is bounded by.
 *
 * A separate argument rather than a field on the slice, because the bound is a
 * fact about the **team** and every slice on one pool must read one number:
 * carried per slice, two slices could disagree about the size of the pool they
 * share and the profile would have no answer to give.
 *
 * A pool id this map has no entry for is a caller fault and the pass throws:
 * the caller only ever puts a team in `poolIds` when it **has** a size, so an
 * absent entry means the two readings came apart. R5 — a default of `Infinity`
 * here would be a pool constraint silently not applied.
 */
export type PoolSizes = ReadonlyMap<string, number>;

/**
 * The key one slice is held under. Opaque: read {@link ScheduledSlice}'s own
 * `workItemId` and `stepId` rather than taking this apart.
 *
 * Separated by a NUL, so no two pairs can collide by running into each other.
 * Written as an escape rather than typed: a literal NUL in a source file makes
 * git call the file binary.
 *
 * **The separator is refused in the halves rather than assumed absent from
 * them.** This doc used to say "which no id can contain", and nothing enforced
 * it: both halves are plain `string`s and no boundary above here rejects the
 * byte. A work item id ending in one and a step id beginning with one are two
 * different slices of two different work items with a single key — they would
 * overwrite each other in {@link Schedule.slices}, and, each being its own
 * group's only slice, would both sit at `at === 0` and so tie in
 * {@link SlicePriority}'s last two rules together, which is the exact
 * ambiguity the key was added to close. Found by review 2026-09-06, against
 * the claim rather than against the behaviour.
 */
export function sliceKey(workItemId: string, stepId: string | null): string {
  if (workItemId.includes('\u0000') || (stepId ?? '').includes('\u0000')) {
    throw new Error(
      `slice key: neither a work item id nor a step id may contain a NUL, and ${JSON.stringify(workItemId)} / ${JSON.stringify(stepId)} does`,
    );
  }
  return `${workItemId}\u0000${stepId ?? ''}`;
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
 * dependency onto another work item, `stepOrder` the work item's own earlier
 * step, `notBefore` a manual date, `person` the assignee finishing something
 * else, and `capacity` the team having no free slot wide enough for the whole
 * of this block.
 *
 * A tie is **not** the later kind in this list: when the assignee comes free
 * exactly as the dependency clears, nobody is waiting for them, and a plan
 * that said otherwise would count that row into "N tasks wait for a person".
 * Each kind therefore means its floor was strictly the latest of them.
 *
 * `capacity` sits after `person` because a slice can now carry both — the work
 * item's team spends a slot whether or not somebody is named on the work — so
 * the order decides a real case rather than a hypothetical one: kat free on
 * day 4 with a slot opening on day 6 says capacity, and both landing on day 6
 * says person.
 */
/**
 * One booking a person holds in a project that outranks the one being
 * scheduled, on that project's own workday offsets (`[start, end)`, fractions
 * kept) — CONTEXT "Elsewhere", ADR 0034.
 */
export interface ElsewhereBooking {
  readonly start: number;
  readonly end: number;
  readonly projectId: string;
  readonly workItemId: string;
}

/** The project and work item a person is booked on elsewhere. */
export interface ElsewhereHolder {
  readonly projectId: string;
  readonly workItemId: string;
}

/**
 * Every person's bookings elsewhere, by person id: each list sorted by start
 * and disjoint (a booking may touch the next, never overlap it). A person
 * absent from the map is booked nowhere else.
 */
export type Elsewhere = ReadonlyMap<string, readonly ElsewhereBooking[]>;

export type ScheduleFloor =
  | 'projectStart'
  | 'predecessor'
  | 'stepOrder'
  | 'notBefore'
  | 'person'
  /**
   * The assignee is booked by a project that outranks this one (CONTEXT
   * "Elsewhere", ADR 0034), and that booking is what set the start.
   *
   * Listed after `person` and before `capacity`, so a tie keeps the plan's own
   * reasons first and a pool that binds on the same instant as a foreign
   * booking is not named for it. Only ever produced when `schedule()` is given
   * a non-empty `elsewhere`; the slice then names the holder in
   * {@link ScheduledSlice.elsewhereHolder}. It points at no slice of this plan,
   * so {@link resourcePredecessorOf} answers {@link NOBODY} for it.
   */
  | 'elsewhere'
  | 'capacity'
  /**
   * The optimizer put it here, and nothing about the plan did — task 4.10.
   *
   * Used **exactly** when a pinned start is strictly later than every floor the
   * slice has, which is a state Fast cannot produce: an optimizer may idle a
   * low-priority slice to make room for a high-priority one, and that start has
   * no value in the six floors above it. It is last in the precedence list for
   * the same reason `capacity` is second to last — the earlier list stopped at
   * `notBefore` and would have labelled a person-bound or capacity-bound
   * optimized slice `optimizer`, erasing its resource predecessor, its team and
   * both wait counts.
   *
   * The render invariant survives additively: under this floor
   * {@link resourcePredecessorOf} returns {@link NOBODY} by the same rule that
   * already covers `projectStart`, and {@link annotateCapacity} leaves
   * `capacityPredecessors` empty and `capacityTeamId` null, so "set exactly when
   * `boundBy === 'capacity'`" is still true.
   */
  | 'optimizer';

/** One slice's schedule, carrying what it is the schedule of and what held it there. */
export interface ScheduledSlice extends Scheduled {
  workItemId: string;
  stepId: string | null;
  /** The person this work is queued behind, as the caller resolved it. */
  personId: string | null;
  boundBy: ScheduleFloor;
  /**
   * The booking elsewhere this slice waited for: the project and work item
   * holding its person when it could have started.
   *
   * **Present exactly when `boundBy` is `'elsewhere'`, and absent otherwise**,
   * rather than `null` on every slice: a plan scheduled without `elsewhere`
   * must serialize byte for byte as it did before the floor existed, which is
   * what `fast-golden-corpus.test.ts` holds this engine to.
   */
  elsewhereHolder?: ElsewhereHolder;
  /**
   * The slice this one waited behind, or null — the **display referent**, not
   * the graph.
   *
   * For a `person` floor it is the slice the assignee was busy with. For a
   * `capacity` floor it is one of {@link capacityPredecessorIds}: the latest
   * finisher of the blocking set, ties broken by placement order. The graph
   * carries the whole set; a chart draws one arrow, and the hover says "and N
   * others" when the set is larger.
   *
   * Set only when `boundBy` is `person` or `capacity` — an arrow drawn for a
   * resource edge that did not bind would claim a wait that is not there. It is
   * a key into {@link Schedule.slices}: look it up rather than taking it apart,
   * exactly as {@link sliceKey} says.
   */
  resourcePredecessorId: string | null;
  /**
   * Every reservation that had to end for this block to fit — the **whole**
   * blocking set, as keys into {@link Schedule.slices}.
   *
   * Empty for every slice a pool did not hold up. Non-empty exactly when
   * `boundBy` is `capacity`, which is an invariant the render path relies on
   * and `floorWordsOf` refuses to work around.
   *
   * The set rather than one edge, because one edge reports float that is not
   * there. Pool of 2, width-1 blocks A and B ending on days 5 and 7, width-2
   * block X therefore starting on day 7: with only B→X in the graph, A appears
   * free to slip for ever — and A ending on day 8 pushes X and the project with
   * it. That is a row reported as having slack it has none of, which is the
   * class of fault that killed the first leveling algorithm.
   *
   * **The error is one-sided by construction.** "At least one of these must
   * move" is a disjunction, and a DAG cannot express one, so edging all of them
   * makes the graph at least as tight as reality: float can come out *smaller*
   * than it truly is, never larger. No row is ever reported movable when it is
   * not.
   */
  capacityPredecessorIds: string[];
  /**
   * Which pool ran out — the team whose slots this slice waited for, or null.
   *
   * Set exactly when `boundBy` is `capacity`, and null on every other slice:
   * the same invariant shape as {@link capacityPredecessorIds}, and the render
   * path relies on both together.
   *
   * **Named here rather than read off the row's labels**, because a row may
   * carry several teams and the binding one is not the first of them by any
   * ordering the chart knows. A sentence naming the wrong team is worse than no
   * sentence — it explains a date with a name that had room.
   *
   * Where two pools both pin the final start, this is the one whose blocking
   * set holds the latest finisher, ties by pool id — the display referent's own
   * rule, one level up, so the team named and the slice pointed at are answers
   * to the same question. The rest of the tie is the chart's to say ("and N
   * other teams"), and the whole set is not carried: the reader is owed the
   * blocking *slices*, which {@link capacityPredecessorIds} already holds.
   */
  capacityTeamId: string | null;
  /**
   * How many slots this slice held while it ran — the caller's
   * {@link Slice.width}, carried out so a reader can see why the duration is
   * what it is.
   */
  width: number;
  /**
   * The work itself, in days, before it was divided among {@link width}
   * people.
   *
   * `duration` is what the block occupied — `effort / width` — and the two are
   * the same number at width 1, which is every slice of every plan that sets
   * neither capacity field.
   */
  effort: number;
  /**
   * How many whole **workdays** past its effective deadline this slice runs, or
   * `null` where it is not late — tasks.md 5.2, and the number the
   * `Late by N workdays` label prints.
   *
   * **`null` rather than `0`, and that is a type-level claim about the copy.**
   * The spec says `N >= 1` when late; a nullable number says it once, where a
   * plain number leaves every label layer to re-decide whether 0 means "on
   * time" or "late by nothing", and one of them will render `Late by 0
   * workdays`. A slice with no effective deadline and a slice that met one are
   * both `null` on purpose: they are the same answer to "how late is this", and
   * whether the work item *has* a deadline is the work item's own field.
   *
   * **The effective deadline, not the authored one** — the leaf's own date
   * folded against every ancestor's by `leafDeadlinesOf`, where the earliest
   * binds. Published here rather than left to callers because a caller that
   * re-folds is a second answer to the fold, and one that skips the fold
   * reports a leaf on time against a parent's date it never read.
   *
   * From {@link workdaysLateBy} and therefore from `lastWorkdayOf`, the same
   * arithmetic that decided lateness at all: the day the slice is still on
   * minus the day it owed. `finish <= deadline` is nowhere in this file, and is
   * the wrong question — a deadline names a day, and work occupies the day it
   * finishes on.
   */
  lateBy: number | null;
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
  /**
   * How many work items hold a slice a **team's capacity** is the reason for.
   *
   * Counted per work item exactly as {@link waitingForPerson} is, and beside it
   * rather than folded into it: "waiting for a person" and "waiting for a slot"
   * are different sentences and a planner acts on them differently — one is
   * somebody's calendar, the other is a headcount. Zero on every plan with no
   * team sized, which is the state this tool shipped in until now.
   */
  waitingForCapacity: number;
  /**
   * How many work items hold a slice a booking **elsewhere** is the reason for
   * — the header's "N tasks wait elsewhere".
   *
   * **Present exactly when the call was given a non-empty `elsewhere`**, for
   * {@link ScheduledSlice.elsewhereHolder}'s reason: a plan nothing outranks
   * must serialize as it did before the floor existed.
   */
  waitingElsewhere?: number;
  /**
   * How many aggregated pool events the levelling pass's window searches
   * visited, together.
   *
   * Instrumentation rather than an answer, and it is on the return type
   * because the alternative is a wall-clock assertion: a millisecond figure is
   * not an R5 proof and is flaky in CI, while this counts the work the stated
   * complexity is a claim about. `schedule-capacity.test.ts` asserts it against
   * a bound derived from that complexity, and it is the reason the missing
   * `W <= N` clamp fails as a bounded number rather than as a hang.
   * `verify.md` records the wall-clock figures, where an observation belongs.
   */
  eventsVisited: number;
}

/** The cycle a graph cannot be ordered around. Typed so callers catch this and nothing else. */
export class ScheduleCycleError extends Error {
  override name = 'ScheduleCycleError' as const;
  constructor() {
    super('dependency cycle: the schedule cannot be ordered');
  }
}

/**
 * A pinned start the plan itself refuses — the materialiser's `invalid-output`.
 *
 * Typed separately from {@link ScheduleCycleError} because the two say opposite
 * things about whose fault it is: a cycle is the plan's, and this is the
 * solver's. The caller maps it onto the `invalid-output` disposition and falls
 * back to Fast; it must never reach a reader as a schedule, because a start
 * before a predecessor's finish or inside a full pool is not a plan, it is a
 * number.
 */
export class ScheduleInvalidOptimizedStartError extends Error {
  override name = 'ScheduleInvalidOptimizedStartError' as const;
  constructor(
    readonly sliceKey: string,
    message: string,
  ) {
    super(`optimized start for ${sliceKey} is invalid: ${message}`);
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

export function indexTree(rows: readonly PlannedRow[]): TreeIndex {
  const childrenOf = new Map<string, PlannedRow[]>();
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

/**
 * The leaves beneath a work item of this tree, a leaf answering itself.
 *
 * Throws for a work item the tree does not hold: a typed endpoint naming one
 * is stored state from another plan, and resolving it to no leaves would drop
 * the relationship silently.
 */
export function leavesUnderOf(index: TreeIndex): (workItemId: string) => readonly string[] {
  return (workItemId) => {
    const found = index.leavesUnder.get(workItemId);
    // Proof: `return []` here made `refuses rather than dropping the
    // relationship` fail on `Received function did not throw`; watched
    // 2026-09-27.
    if (found === undefined) throw new Error(`no work item ${workItemId} in this plan`);
    return found;
  };
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
  // A moving head rather than `ready.shift()`, which is O(V) per pop and made
  // this O(V²) in leaves. `canDepend` runs a whole sort per `addDependency`, and
  // `applyRestore` runs one per external edge it puts back, so a restore of a
  // branch with E edges over a plan of V leaves was O(E·V²).
  let taken = 0;
  while (taken < ready.length) {
    // No `undefined` guard: `shift()` needed one and an index below `length`
    // does not — this project does not run `noUncheckedIndexedAccess`, and
    // eslint's typed rule refuses the check as unreachable.
    const id = ready[taken];
    taken += 1;
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
 * One leaf's slices in step order, and the running offsets that place them
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
 * The slices grouped by the leaf they belong to, with each group's running
 * start offsets.
 *
 * The grouping and both of its refusals moved to {@link groupSlicesByLeaf}, so
 * that the solver request builder groups the same way this pass does — an edge
 * names its ends by leaf and position, and two groupings would disagree about
 * which slice a position is. What is left here is the `offsets` half, which is
 * `durationOf`'s calendar arithmetic and has no place on the wire.
 */
function groupByWorkItem(
  leafIds: readonly string[],
  slices: readonly Slice[],
): Map<string, WorkItemSlices> {
  const sliced = new Map<string, WorkItemSlices>();
  for (const [workItemId, group] of groupSlicesByLeaf(leafIds, slices)) {
    const offsets = [0];
    for (const slice of group) offsets.push(offsets[offsets.length - 1] + durationOf(slice));
    sliced.set(workItemId, { slices: group, offsets });
  }
  return sliced;
}

/**
 * How long a slice occupies the calendar: its effort divided among the people
 * working on it at once, or zero where nobody has estimated it.
 *
 * **An unknown length is zero schedule time.** The Gantt draws such a slice
 * `ASSUMED_SLICE_WORKDAYS` wide as a placeholder, and that width is a
 * drawing only: it delays no successor, occupies no assignee, spends no pool
 * and moves no projected date (OpenSpec
 * `unestimated-steps-take-no-schedule-time`). The slice stays a node, and
 * `Slice.days` stays `null`, so `estimated` and the anchor walk still tell it
 * apart from an explicit zero, which follows the same arithmetic.
 *
 * **`E / 1 === E` exactly**, for every value that can reach {@link Slice.days}.
 * `days` arrives only through `finalDays()` over a validated
 * `ThreePointEstimate`, whose three fields are `number>=0` — finite and
 * non-negative — or through `null`. Division by one is exact in IEEE-754 for
 * every finite value, so `offsets[]` is the same array of doubles for every
 * plan that sets no capacity field. A non-finite estimate cannot reach
 * `Slice.days` (`estimate.test.ts`).
 *
 * Proof: the division dropped, so duration is effort again, and `compresses six
 * days of effort into two when three may work at once` failed with a duration
 * of 6 where 2 was owed; watched 2026-08-12.
 *
 * Proof: `slice.days === null` answered with `ASSUMED_SLICE_WORKDAYS` again,
 * and `reproduces every stored schedule value for value` in
 * `fast-golden-corpus.test.ts` failed on `unestimated-middle` with `c` moved
 * from 2 to 4; watched 2026-09-27.
 *
 * Exported so that the solver's `durationUnits` quantises this number rather
 * than restating the rule: one function, two callers, so a Fast plan and a
 * solver plan cannot disagree about how long a slice is.
 */
export function durationOf(slice: Slice): number {
  if (slice.days === null) return 0;
  return slice.days / slice.width;
}

/**
 * Work-item identities whose supplied durations contain positive work.
 *
 * The grouping is shared by Fast and the solver wire, but the duration space
 * is deliberately supplied by the caller. Fast passes real workdays; the wire
 * passes integer solver units after snapping and rounding. A sub-drift positive
 * estimate can consequently be a real-domain span and a quantised milestone,
 * which is the honest contract for the two models rather than an accidental
 * second implementation of this grouping rule.
 */
export function workItemIdsWithPositiveDuration(
  slices: readonly Slice[],
  durations: readonly number[],
): ReadonlySet<string> {
  // Proof: removing this precondition made `requires one supplied duration per
  // slice` accept a truncated duration vector; watched on h2puni 2026-09-13.
  if (slices.length !== durations.length) {
    throw new Error('positive-duration classification requires one duration per slice');
  }
  return new Set(slices.filter((_, at) => durations[at] > 0).map((slice) => slice.workItemId));
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
  /** How many steps into that work item it is. */
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

/** A real start inequality, `start[after] >= start[before] + weight`. */
interface WeightedEdge {
  before: number;
  after: number;
  type: StepNodeGraphEdge['type'];
  weight: number;
  provenance: StepNodeGraphEdge['provenance'] | 'resource';
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

/** No bookings elsewhere: the critical-path pass, and every plan nothing outranks. */
const NOWHERE: Elsewhere = new Map();

/** Where one slice was put, and what put it there. */
interface Placed {
  start: number;
  finish: number;
  boundBy: ScheduleFloor;
  /**
   * The node it waited behind, or -1 when nobody held it up — the display
   * referent for both resource kinds. See
   * {@link ScheduledSlice.resourcePredecessorId}.
   */
  resourcePredecessor: number;
  /**
   * Every reservation that had to end for this block to fit, as node indices.
   *
   * Empty unless a pool held the block up. The **whole** set, because one edge
   * reports float that is not there — see
   * {@link ScheduledSlice.capacityPredecessorIds}.
   */
  capacityPredecessors: number[];
  /** Which pool ran out — see {@link ScheduledSlice.capacityTeamId}. */
  capacityTeamId: string | null;
  /** Who held the person elsewhere; non-null exactly when `boundBy` is `'elsewhere'`. */
  elsewhereHolder: ElsewhereHolder | null;
}

/**
 * One instant at which a pool's usage changes, with everything that changes at
 * it collected together.
 *
 * **Aggregated by timestamp, and that is not tidiness.** Reservations are
 * half-open `[start, finish)`, so at an instant where one block ends and
 * another begins the release must be seen before the acquisition; raw
 * `+W`/`-W` entries evaluated in insertion order can report a transient
 * over-capacity that never existed and push a block to a later window. Summing
 * every delta at one timestamp before the instant is evaluated is what makes
 * the answer independent of the order the entries arrived in, which is the
 * determinism claim.
 *
 * Proof: the merge in `eventAt` removed, so each reservation writes its own
 * entry, and `lets a block run through the instant another hands its slot over`
 * failed — the block came back at 4→8 instead of 0→4, pushed off a slot that
 * was never taken; watched 2026-08-12.
 */
interface PoolEvent {
  at: number;
  /** The net change in slots in use at this instant: acquisitions less releases. */
  delta: number;
  /** The nodes acquiring here, so the scan can keep an active set as it walks. */
  acquires: number[];
  /** The nodes releasing here, for the same reason. */
  releases: number[];
}

/**
 * A pool's usage over time, as the events that change it — plus how many slots
 * it has.
 *
 * The events are held sorted and aggregated; nothing else about the profile is
 * stored, because a reservation is written once and never moved and the usage
 * at any instant is therefore a function of them alone.
 */
interface Pool {
  size: number;
  events: PoolEvent[];
}

/**
 * A block wider than the pool it draws from, which no placement can satisfy.
 *
 * R5, and deliberately not a silent widening or an unbounded search: the width
 * is clamped to the pool's size by the caller (`widthFor` in
 * `work-item.service.ts`), so reaching this means the clamp and the sizes came
 * apart, and a scan that kept looking for a window would run past the last
 * event for ever. Bounded and named beats hanging.
 *
 * `where` names **which** of the two refusals fired, and it is not decoration.
 * The refusal below the window search is a backstop for the same property, and
 * with one message between them removing the up-front check left the negative
 * green — the backstop caught the same plan and said the same words. Watched
 * 2026-08-12: the two were one message, `refuses a block wider than the pool it
 * draws from` passed with the up-front check deleted, and the check was a claim
 * rather than a gate.
 */
class CapacityTooNarrowError extends Error {
  override name = 'CapacityTooNarrowError' as const;
  constructor(
    poolId: string,
    width: number,
    size: number,
    where: 'before the search' | 'past the last event',
  ) {
    super(
      `a block of width ${String(width)} cannot fit pool ${poolId}, which holds ` +
        `${String(size)}: the caller's clamp and the pool sizes disagree ` +
        `(refused ${where})`,
    );
  }
}

/**
 * The pools, the reservations on them, and the window search that places a
 * block against them.
 *
 * One object rather than free functions over a map, because the scan counter
 * below has to be a fact about **this** run: the instrumented perf bound
 * (`schedule-capacity.test.ts`) asserts how many aggregated events one plan
 * makes the placement visit, and a module-level counter would be a number about
 * whatever else the suite had run.
 */
function capacityProfile(sizes: PoolSizes) {
  const pools = new Map<string, Pool>();
  /**
   * How many aggregated events every window search has visited, together.
   *
   * The instrumented bound R5 asks for in place of a wall-clock assertion: a
   * wall-clock number is not a proof and is flaky in CI, while this counts the
   * work the stated complexity is a claim about.
   */
  let visited = 0;

  const poolFor = (poolId: string): Pool => {
    const already = pools.get(poolId);
    if (already !== undefined) return already;
    const size = sizes.get(poolId);
    // R5: the caller sets `poolId` only for a team that has a size, so an
    // absent entry means the adapter's reading and this map came apart. A
    // default here would be a capacity constraint quietly not applied.
    //
    // Proof: replaced with `?? Infinity` and `refuses a pooled slice whose pool
    // has no size` failed on `expected [Function] to throw` — the pool bounded
    // nothing and the plan came back unconstrained; watched 2026-08-12.
    if (size === undefined) throw new Error(`no size for pool ${poolId}`);
    const fresh: Pool = { size, events: [] };
    pools.set(poolId, fresh);
    return fresh;
  };

  /** Where `at` belongs in a pool's sorted events — the first entry not before it. */
  const indexOf = (events: readonly PoolEvent[], at: number): number => {
    let low = 0;
    let high = events.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (events[mid].at < at) low = mid + 1;
      else high = mid;
    }
    return low;
  };

  const eventAt = (pool: Pool, at: number): PoolEvent => {
    const index = indexOf(pool.events, at);
    if (index < pool.events.length && pool.events[index].at === at) return pool.events[index];
    const fresh: PoolEvent = { at, delta: 0, acquires: [], releases: [] };
    pool.events.splice(index, 0, fresh);
    return fresh;
  };

  // Named rather than returned anonymously so `jointWindowFor` can call
  // `windowFor` by name: the joint search is defined as a fixpoint over the
  // single-pool one, and `this` inside an object literal is a weaker way to say
  // that than the binding itself.
  const searches = {
    /**
     * The earliest instant at or after `floor` where `width` slots are free for
     * the **whole** of `duration`, and every reservation that had to end for
     * that to be true.
     *
     * One forward scan over the aggregated events, keeping the running usage
     * and the set of nodes currently holding slots. Where `usage + width` runs
     * past the pool, every active reservation goes into the blocking set and
     * the candidate window restarts at the next instant the aggregate changes —
     * no candidate between the current one and the violation can help, since
     * every one of them still contains it.
     *
     * **Whole-window, not the start instant.** A pool with a short gap followed
     * by a reservation overlapping the middle of the candidate duration must
     * not let the block take the gap.
     *
     * Proof: the interior walk disabled, so only the start instant is tested,
     * and `skips a gap it cannot fit inside and waits for the whole window`
     * failed — the block took the one-day hole and ran on top of the four-day
     * reservation behind it; watched 2026-08-12.
     *
     * **It terminates**, and the argument is immutable reservations rather than
     * chronology: every reservation is written once and never moved, so a
     * search reads a profile that cannot change under it, the candidate walks
     * strictly forward through a finite event list, and past the last event
     * usage is 0 — where `width <= size` always fits, which is what the throw
     * above guarantees.
     */
    windowFor(
      poolId: string | null,
      width: number,
      duration: number,
      floor: number,
    ): { start: number; blocking: number[] } {
      // Reserves nothing and waits for nothing: a slice of no length is not
      // work and a slice on no pool spends nobody's slots. The twin of the
      // existing person rule and of its watched proof.
      if (poolId === null || duration === 0 || width === 0) return { start: floor, blocking: [] };
      const pool = poolFor(poolId);
      // Refused here rather than found out at the end of the scan: this is the
      // statement that the caller's clamp and these sizes are one reading, and
      // it says so before any work is done. The backstop in `advancePast` holds
      // the same property from the other side; the two are told apart by the
      // clause they end with, because with one message between them this check
      // could be deleted and its negative stayed green.
      //
      // Proof: deleted, and `refuses a block wider than the pool it draws from`
      // failed on the message — the backstop caught the same plan and refused
      // `past the last event`, which is the same refusal arriving after a full
      // scan instead of before it; watched 2026-08-12.
      if (width > pool.size) {
        throw new CapacityTooNarrowError(poolId, width, pool.size, 'before the search');
      }

      const blocking = new Set<number>();
      const { events, size } = pool;
      let usage = 0;
      const active = new Set<number>();
      let at = 0;
      let start = floor;
      // Everything already over by the floor, folded in before the window is
      // considered at all — the profile does not begin at the floor.
      for (; at < events.length && events[at].at <= start; at += 1) {
        visited += 1;
        usage += events[at].delta;
        for (const node of events[at].acquires) active.add(node);
        for (const node of events[at].releases) active.delete(node);
      }

      /** Steps the scan past `instant`, then onto the next candidate start. */
      const advancePast = (instant: number): void => {
        for (; at < events.length && events[at].at <= instant; at += 1) {
          visited += 1;
          usage += events[at].delta;
          for (const node of events[at].acquires) active.add(node);
          for (const node of events[at].releases) active.delete(node);
        }
        // The backstop, and unreachable while the check above stands: past the
        // last event usage is 0, and `width <= size` therefore always fits, so
        // a scan can only run out of events when a block wider than its pool
        // got this far. Kept anyway, and bounded — a search that instead kept
        // looking would never come back — and told apart from the up-front
        // refusal by its clause so neither can stand in for the other.
        if (at >= events.length) {
          throw new CapacityTooNarrowError(poolId, width, size, 'past the last event');
        }
        const next = events[at];
        start = next.at;
        visited += 1;
        usage += next.delta;
        for (const node of next.acquires) active.add(node);
        for (const node of next.releases) active.delete(node);
        at += 1;
      };

      for (;;) {
        if (usage + width > size) {
          for (const node of active) blocking.add(node);
          // No candidate at or before this instant can work: every one of them
          // contains it. The next one is the next instant the aggregate moves.
          advancePast(start);
          continue;
        }
        // The interior of the candidate window, on a copy of the running state
        // so a violation leaves the scan where it can resume.
        let interior = at;
        let inside = usage;
        const held = new Set(active);
        let violatedAt: number | null = null;
        for (; interior < events.length && events[interior].at < start + duration; interior += 1) {
          visited += 1;
          inside += events[interior].delta;
          for (const node of events[interior].acquires) held.add(node);
          for (const node of events[interior].releases) held.delete(node);
          if (inside + width > size) {
            for (const node of held) blocking.add(node);
            violatedAt = events[interior].at;
            break;
          }
        }
        if (violatedAt === null) break;
        // Every candidate up to and including the violation contains it, so the
        // next one is the first instant after it.
        advancePast(violatedAt);
      }

      return { start, blocking: [...blocking] };
    },

    /**
     * The earliest instant at or after `floor` where **every** pool in the set
     * has `width` slots free for the whole of `duration` — the joint search.
     *
     * A fixpoint over {@link windowFor}, which is left byte-for-byte as it is:
     * every proof it carries — the interior walk, the aggregation, the two
     * refusals, the termination argument — is a statement about one pool, and
     * rewriting the tightest loop in the engine to say them about several is
     * the last thing this change should contain.
     *
     * ```
     * candidate = floor
     * loop: ask every pool for its window at candidate
     *       best = the latest of their answers
     *       if best === candidate: that is the answer
     *       candidate = best
     * ```
     *
     * **It terminates**, for `windowFor`'s reason plus one. Reservations are
     * immutable, so each pool's answer is a function of the candidate alone;
     * every round that does not finish moves the candidate **strictly** forward
     * onto an instant some pool's event list holds; the union of those lists is
     * finite; and past the last of them every pool is empty, where `width <=
     * size` always fits. A round that moves nothing is the answer by
     * definition.
     *
     * **The blocking set is accumulated across rounds, not taken from the last
     * one**, and that is not an optimisation — it is the whole set. At the
     * fixpoint every pool answers `candidate` *because it fits there*, so every
     * scan of the final round records nothing. What each round records is why
     * the block could not start where it was asked to, which is exactly the set
     * of reservations that had to end.
     *
     * `binding` is the pools whose own earliest fit is the final start — the
     * ones that ran out — carried with the blocking set of the round they
     * pushed in, so a caller can say which team the reader is waiting for. A
     * pool that pushed the candidate earlier and had room at the answer is not
     * binding: it is no longer the reason.
     *
     * **A set of one is `windowFor` itself**, and the short-circuit below says
     * so rather than leaving it to be inferred: a second round would ask a pool
     * for its window at its own answer, where the block provably fits for the
     * whole duration, and get the same instant back with an empty blocking set.
     * The saving is not the point — `eventsVisited` is a measured claim about
     * the work a placement does, and doubling it for every plan on the
     * deployment to re-derive an answer already in hand would be a real cost
     * paid for a uniformity nothing reads.
     */
    jointWindowFor(
      poolIds: readonly string[],
      width: number,
      duration: number,
      floor: number,
    ): {
      start: number;
      blocking: number[];
      binding: { poolId: string; blocking: number[] }[];
    } {
      // Spends nothing and waits for nothing — the `poolId === null` line,
      // under a set, and **only** that line: a zero duration and a zero width
      // are left to `windowFor`'s own short-circuit below rather than repeated
      // here, so that check keeps firing and the proof it carries keeps being
      // about a path something takes.
      if (poolIds.length === 0) return { start: floor, blocking: [], binding: [] };
      if (poolIds.length === 1) {
        const only = poolIds[0];
        const window = searches.windowFor(only, width, duration, floor);
        return {
          start: window.start,
          blocking: window.blocking,
          // The pool bound the slice exactly where it moved it off the floor.
          // At the floor it is the placement's tie rule that decides, and
          // `capacity` loses a tie — see {@link ScheduleFloor} — so a binding
          // entry there would be a team named on a slice nothing held up.
          binding: window.start > floor ? [{ poolId: only, blocking: window.blocking }] : [],
        };
      }

      const blocking = new Set<number>();
      let candidate = floor;
      let binding: { poolId: string; blocking: number[] }[] = [];
      for (;;) {
        let best = candidate;
        let reached: { poolId: string; blocking: number[] }[] = [];
        for (const poolId of poolIds) {
          const window = searches.windowFor(poolId, width, duration, candidate);
          for (const node of window.blocking) blocking.add(node);
          if (window.start > best) {
            best = window.start;
            reached = [{ poolId, blocking: window.blocking }];
          } else if (window.start === best && window.start > candidate) {
            reached.push({ poolId, blocking: window.blocking });
          }
        }
        if (best === candidate) return { start: candidate, blocking: [...blocking], binding };
        binding = reached;
        candidate = best;
      }
    },

    /** Writes a placed block's two events onto every pool it spends, tagged with the node holding them. */
    reserve(
      poolIds: readonly string[],
      node: number,
      width: number,
      start: number,
      finish: number,
    ): void {
      if (width === 0 || finish === start) return;
      // One reservation per pool, of the block's **whole** width: every named
      // team spends its own days (Dany, 2026-08-13, decision 3). Splitting the
      // width between them would be the other reading of "three teams on a
      // five-day slice", and it is the one he ruled out.
      for (const poolId of poolIds) {
        const pool = poolFor(poolId);
        const opens = eventAt(pool, start);
        opens.delta += width;
        opens.acquires.push(node);
        const closes = eventAt(pool, finish);
        closes.delta -= width;
        closes.releases.push(node);
      }
    },

    /** How many aggregated events every search of this run has visited together. */
    eventsVisited: (): number => visited,
  };

  return searches;
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
  /**
   * How many whole workdays of room this slice has against its effective
   * deadline, smaller first — or `Infinity` where it has no deadline.
   *
   * `deadlineOffset − lastWorkdayOf(start, finish)` over the **deadline-free**
   * placement, so it is negative exactly when that placement already misses,
   * and it is the same subtraction `workdaysLateBy` prints with its sign
   * flipped. Asked before {@link priority} because a date somebody committed to
   * outranks a number somebody ranked by: a priority says which work matters
   * more, a deadline says which work is running out of time, and only the
   * second can stop being true tomorrow.
   *
   * `Infinity` for an undeadlined slice by the same arithmetic that gives
   * {@link priority} its `Infinity` — `Infinity − finite` is `Infinity`, so an
   * undeadlined slice sorts behind every deadlined one, two undeadlined slices
   * tie here and fall through to the rules below unchanged, and a plan with no
   * deadlines at all schedules byte for byte as it did before this field
   * existed. That is what `fast-golden-corpus.test.ts` asserts.
   */
  slack: number;
  /**
   * Its effective deadline offset, smaller first — or `Infinity` where it has
   * none.
   *
   * Second and not first, because slack already carries the deadline *and* the
   * work in front of it: two slices due the same day are not equally urgent if
   * one of them is three days of work and the other is one. This separates the
   * pair that slack cannot — equal room, different dates — and there the
   * earlier date is the one that cannot wait.
   */
  deadline: number;
  /** Where the critical path puts it, with nobody's calendar in the way. */
  start: number;
  /** How much it could slip there without moving the project. */
  float: number;
  /**
   * Its work item's place in **tree order** — the tie goes to the row that
   * reads first.
   *
   * The work item *number* until ADR 0023, which is the same answer on every
   * plan whose labels ascend along position and a different one the moment a
   * frozen work item moves. A frozen number is a name now; the place is the
   * thing this rule was always reaching for, so it asks for it directly.
   */
  treePlace: number;
  /** Its place in the step order — what separates two slices of one work item. */
  at: number;
  /**
   * Its slice key — `sliceKey(workItemId, stepId)`, asked last.
   *
   * **It is {@link at} *and* this that cannot both tie, and neither alone is
   * enough.** The five rules above them are all facts a planner can repeat: two
   * work items may carry one priority, one date, one start and one float. Two
   * slices of **one** work item then share a {@link treePlace} as well, which
   * is what the pair below is really for: `at` does not separate them either,
   * being the step index *inside* a work item, so two one-slice items both
   * sit at 0. (Before ADR 0023 this paragraph named a second way to tie — two
   * work items sharing a verbatim `frozenNumber` — which a place cannot do.)
   * And the
   * key does not separate every pair either: `slice-edges.ts` records that a
   * plan may hand two slices of one leaf the same `stepId`, `groupByWorkItem`
   * accepts it, and those two nodes share a key. {@link Schedule.slices} being
   * a `Map` hides that rather than preventing it.
   *
   * The pair is total, and each half covers what the other cannot. Two nodes
   * that tie on `at` are in different groups — `at` is the index within one —
   * so they have different `workItemId`, and therefore different keys, because
   * {@link sliceKey} now **refuses** a NUL in either half rather than assuming
   * one is absent; without that refusal two different pairs could run into
   * each other across the separator and produce one key. Two nodes that tie
   * on the key are in one group, so they have different `at`. Without both,
   * `goesFirst(a, b)` and `goesFirst(b, a)` are false together, the eligible
   * set is a heap, and the order the rows arrived in decides who takes the
   * person — the same plan written down twice schedules two ways.
   *
   * A node index would be unique on its own, and would be the wrong choice: it
   * is assigned by the order the rows were handed over, so it would make the
   * comparator total while leaving the plan's answer dependent on that order.
   * A key made of the work's own identity is the same answer either way.
   */
  key: string;
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
      for (let at = heap.length - 1; at > 0;) {
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
        for (let at = 0; ;) {
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

/** One candidate start and the word that would explain it. */
interface FloorCandidate {
  at: number;
  kind: ScheduleFloor;
}

/**
 * The latest of a slice's floors, and the word for it.
 *
 * **Strictly later wins, so a tie keeps the floor named first** — which is why
 * the caller lists `person` second to last and `capacity` last, and why the
 * order of {@link ScheduleFloor} is a rule rather than a spelling.
 *
 * Proof: written as `<`, so that a later floor takes a tie, and `names the
 * predecessor, not the person, when the two land on the same day` failed — a
 * row whose assignee came free exactly as its dependency cleared was reported
 * as waiting for her, and counted into "N tasks wait for a person"; watched
 * 2026-08-09.
 *
 * **Lifted out of {@link placeSlices} for 4.9 and for nothing else.** The
 * optimized materialiser must resolve a slice's floor by *this* loop rather
 * than by comparing the joint window to the pinned start (tasks.md 4.9, Sol r8
 * Critical 1 and kimi r8 Critical 1): the struck three-way split reported
 * `capacity` for the common unmoved slice, where `jointWindowFor` returns
 * `binding: []` by construction and `capacityTeamId` therefore had no rule.
 * Two callers of one function cannot drift the way two transcriptions of one
 * rule can, and the drift is the defect those reviews found. The body is
 * unchanged from the loop it replaces; the empty list still answers
 * `projectStart` at 0, which is what a slice with no floor above the project's
 * own start has always meant.
 */
function resolveFloor(candidates: readonly FloorCandidate[]): {
  start: number;
  boundBy: ScheduleFloor;
} {
  let start = 0;
  let boundBy: ScheduleFloor = 'projectStart';
  for (const floor of candidates) {
    if (floor.at <= start) continue;
    start = floor.at;
    boundBy = floor.kind;
  }
  return { start, boundBy };
}

/**
 * What an optimizer's pinned start does to a floor the plan already resolved.
 *
 * Three cases and no fourth, which is why this is a function rather than three
 * lines inside the loop: it is the whole of task 4.9's comparison, and the
 * struck version of it — comparing the pinned start to the **joint window**
 * instead of to the resolved floor — is a mistake that reads as correct.
 *
 * - **Equal** is the common case, and it keeps the resolved `boundBy` — and the
 *   resolved `start`, not the pin's own double. An optimizer that leaves a slice
 *   where the plan already put it has explained nothing about it; the
 *   predecessor, the person or the pool that held it is still what a reader is
 *   owed. **Equal means {@link withinDrift}, not `===`**, because the two sides
 *   are two different roundings of the same real number: the pin divides back
 *   from `k / SOLVER_QUANTUM` and the floor accumulated through `days / width`.
 *   With `===` here the plan's OWN quantised baseline came back as a refusal —
 *   `0.08333333333333333 is before its stepOrder floor at 0.08333333333333334`,
 *   on `days: 5/12, width: 5` — and one ulp the other way labelled a slice
 *   sitting on its floor `'optimizer'`. Neither is rare: 106,142 of 480,000
 *   (width, offset) pairs drift one way or the other (run 40 chunk 2). The
 *   window cannot hide a real violation, because the solver places integers and
 *   a genuinely early start is early by at least one unit, 0.0208 of a day
 *   against a 1e-9 window.
 * - **Strictly later** is `'optimizer'`, and only then. The pin is re-asked of
 *   the pool from its own instant: `jointWindowFor(…, pinned)` must answer
 *   `pinned` — **within {@link withinDrift}, for the floor's reason and not a
 *   second one**. A pool release is `start + days / width` accumulated and the
 *   pin divides back from `k / SOLVER_QUANTUM`, so the two abut on the solver's
 *   integer axis and miss by a ulp on the plan's: measured, `1 / 48` of a day
 *   pinned at unit 7 releases one ulp above unit 8, and `!==` refused the
 *   commonest thing an optimizer does. The accepted start is then the POOL's
 *   double, and the window is re-asked from it so it is the search's own
 *   fixpoint — `binding: []`, which is what keeps {@link annotateCapacity}'s
 *   render invariant true, since a non-empty `binding` under `'optimizer'`
 *   would name a team on a slice no pool held up and that invariant throws.
 *   The window hides nothing: a pin that genuinely has no room is short by at
 *   least one unit, 0.0208 of a day against 1e-9.
 * - **Strictly earlier** is not a schedule. A start below the resolved floor is
 *   below a predecessor's finish, a manual not-before, a person's queue or a
 *   pool's capacity, and there is no reading of it that is merely suboptimal.
 *
 * `windowFrom` is a callback rather than a window because only the later branch
 * may re-ask the profile: asking on every slice would double the joint-window
 * search on the common path, which is exactly the cost 4.9 forbids.
 */
function pinFloor(
  key: string,
  resolved: { start: number; boundBy: ScheduleFloor },
  pinned: number | undefined,
  windowFrom: (from: number) => JointWindow,
): { start: number; boundBy: ScheduleFloor } {
  if (pinned === undefined || withinDrift(pinned, resolved.start)) return resolved;
  if (pinned < resolved.start) {
    throw new ScheduleInvalidOptimizedStartError(
      key,
      `${String(pinned)} is before its ${resolved.boundBy} floor at ${String(resolved.start)}`,
    );
  }
  let window = windowFrom(pinned);
  if (!withinDrift(window.start, pinned)) {
    throw new ScheduleInvalidOptimizedStartError(
      key,
      `no room in its pools at ${String(pinned)}; the earliest is ${String(window.start)}`,
    );
  }
  // The release and the pin are the same two roundings the floor branch above
  // reconciles — the pin divides back from `k / SOLVER_QUANTUM`, the release
  // accumulated through `start + days / width` — so the pool's own double wins
  // here exactly as the floor's does there, and the schedule stays on one axis.
  // Taking the pin instead would place a block one ulp inside a live
  // reservation, which is a real over-allocation of the profile, however small.
  //
  // The re-ask is what makes that safe rather than merely tidy: `windowFrom`
  // hands the caller's `window` back too, and a window whose start is later
  // than the instant it was asked from carries a `binding` entry — a team named
  // on a slice `'optimizer'` says nothing held up, which {@link annotateCapacity}
  // throws on. Asked from its own answer the search is a fixpoint by
  // construction (the block provably fits there, for the whole duration), so it
  // returns the same instant with `binding: []` and costs one search on a
  // branch nothing common takes.
  if (window.start !== pinned) window = windowFrom(window.start);
  return { start: window.start, boundBy: 'optimizer' };
}

/**
 * The one resource a slice's bar names as the reason it waited, or
 * {@link NOBODY}.
 *
 * **A display referent and nothing more** — the graph the backward pass walks
 * keeps the whole valid set, and the two are deliberately different: a bar
 * points at one end a reader can look at, a float computation cannot drop a
 * single edge without reporting slack that is not there.
 *
 * `boundBy` decides which ledger answers. **The order of the two branches is not
 * a rule and carries no meaning** — `boundBy` holds exactly one floor, so they
 * are disjoint by construction; swapping them is an equivalent program, measured
 * rather than assumed (run 38, chunk 7: asking `capacity` first reddens 0 of
 * 416). What IS load-bearing is the `boundBy === 'person'` guard on `busy`: a
 * slice whose assignee happened to be busy but which a **pool** held up must
 * name the pool's referent, not the person. Drop that guard and three cases
 * redden, the Fast golden corpus among them.
 *
 * **Lifted out of {@link placeSlices} for 4.9**, with {@link resolveFloor},
 * {@link annotateCapacity} and {@link tileFinish}: the optimized materialiser
 * produces `resourcePredecessorId` from the same three inputs and must not
 * restate the choice. Under 4.10's `'optimizer'` floor this returns
 * {@link NOBODY} by the same rule that already covers `projectStart` — neither
 * is a resource — which is what keeps the render invariant true additively.
 */
function resourcePredecessorOf(
  boundBy: ScheduleFloor,
  busy: { node: number; finish: number } | undefined,
  referent: number,
): number {
  if (boundBy === 'person' && busy !== undefined) return busy.node;
  return boundBy === 'capacity' ? referent : NOBODY;
}

/**
 * Where a slice finishes, and the anchor the rest of its work item tiles from.
 *
 * **The anchor is kept while the work item's slices tile** — the arithmetic then
 * reads `base + offsets[i]`, which is what the engine before slices computed and
 * what the identity claim rests on. A slice a person or a pool held back does
 * not tile, and becomes the anchor the rest are measured from.
 *
 * Proof: written as `start + (offsets[at + 1] - offsets[at])` — the textbook
 * `start + days`, accumulated from slice to slice — and `answers what the
 * previous engine answered` failed at seed 260: a work item's late start of
 * 10.666666666666666 became 10.666666666666668; watched 2026-08-09.
 *
 * **Lifted out of {@link placeSlices} for 4.9, unchanged.** It is the third of
 * the three rules the optimized materialiser must apply and not restate — the
 * floor ({@link resolveFloor}), the pool's explanation
 * ({@link annotateCapacity}) and this one. A materialiser that accumulated
 * `start + days` instead would reproduce seed 260's drift on every optimized
 * plan, and the differential that caught it once does not run over the
 * optimized path.
 */
function tileFinish(
  anchor: SpanAnchor | undefined,
  start: number,
  at: number,
  offsets: readonly number[],
): { held: SpanAnchor; finish: number } {
  const held =
    anchor !== undefined && start === anchor.start + (offsets[at] - offsets[anchor.at])
      ? anchor
      : { start, at };
  return { held, finish: held.start + (offsets[at + 1] - offsets[held.at]) };
}

/** What `capacityProfile(...).jointWindowFor` answers, named so the annotator can take one. */
interface JointWindow {
  start: number;
  blocking: number[];
  binding: { poolId: string; blocking: number[] }[];
}

/**
 * Everything a pool explains about one placed slice: which reservations were
 * its predecessors, which team ran out, and which end the arrow points at.
 *
 * **Lifted out of {@link placeSlices} for 4.9, unchanged.** The optimized
 * materialiser derives these three from the same joint window over the same
 * replayed ledgers, and every review finding in this area — the `finish <=
 * start` filter (Sol r8 Critical 1), the chosen pool's own blockers rather
 * than an independently ordered union, the referent's placement-order tie-break
 * — is a rule that must hold identically on both paths. One function, two
 * callers.
 *
 * The two ledgers are reached through `finishOf` and `placedAtOf` rather than
 * passed as arrays, because the materialiser holds its own and they are not
 * the same shape. `placedAtOf` is a **position in the pass's own order**, which
 * is what breaks a tie between two blockers finishing at the same instant;
 * `finishOf` is the early finish of an already-placed slice.
 *
 * Both invariants stay here with the code they guard: a capacity-floored slice
 * with nothing holding the pool, and a `capacityTeamId` that disagrees with
 * `boundBy`, are throws rather than nulls the render path would have to invent
 * words for.
 */
function annotateCapacity(
  key: string,
  boundBy: ScheduleFloor,
  start: number,
  window: JointWindow,
  finishOf: (node: number) => number,
  placedAtOf: (node: number) => number,
): { capacityPredecessors: number[]; capacityTeamId: string | null; referent: number } {
  // Only where the pool is what held it: a set carried on a slice the pool
  // let through would be a wait that is not there, in the same way an arrow
  // for a resource edge that did not bind would be.
  // A conservative scan records every reservation present at a violated
  // instant. Only reservations that finish by the accepted start are actual
  // predecessors: a narrower reservation may continue alongside this slice.
  // Promoting that overlap into the backward graph gives it a late finish
  // before its early finish and exposes negative public float.
  const finishesByStart = (blocker: number): boolean => finishOf(blocker) <= start;
  const capacityPredecessors =
    boundBy === 'capacity' ? window.blocking.filter(finishesByStart) : [];
  /**
   * Which pool ran out, of the ones that pinned the start.
   *
   * The tightest team, and where two are equally tight the one whose blocking
   * set holds the latest valid finisher. Ties past that by pool id. Keep the
   * chosen pool's valid blockers with it: the public referent below must come
   * from the team the sentence names, not from an independently ordered union.
   *
   * A slice a pool did not hold up carries null, exactly as it carries an
   * empty blocking set: a team named on a slice nothing held up is a wait
   * that is not there, in the same way a resource arrow would be.
   */
  let capacityTeamId: string | null = null;
  let capacityTeamBlockers: number[] = [];
  let bestFinish = -Infinity;
  for (const pool of window.binding) {
    const validBlockers = pool.blocking.filter(finishesByStart);
    let finish = -Infinity;
    for (const blocker of validBlockers) finish = Math.max(finish, finishOf(blocker));
    if (
      finish > bestFinish ||
      (finish === bestFinish && capacityTeamId !== null && pool.poolId < capacityTeamId)
    ) {
      bestFinish = finish;
      capacityTeamId = pool.poolId;
      capacityTeamBlockers = validBlockers;
    }
  }
  /**
   * Which of the blocking set the arrow points at: the latest finisher, ties
   * to the one placed first.
   *
   * A display referent and nothing more — the graph below keeps the complete
   * valid union. Selection is restricted to the chosen binding pool so the
   * named team and arrow remain one causal explanation. Within that pool the
   * latest finisher is the end the reader is looking at; ties use placement
   * order rather than node index, preserving the pass's own total order.
   */
  let referent = NOBODY;
  for (const blocker of capacityTeamBlockers) {
    if (referent === NOBODY) {
      referent = blocker;
      continue;
    }
    if (finishOf(blocker) > finishOf(referent)) referent = blocker;
    else if (
      finishOf(blocker) === finishOf(referent) &&
      placedAtOf(blocker) < placedAtOf(referent)
    ) {
      referent = blocker;
    }
  }
  // A capacity-floored slice with an empty blocking set is impossible — the
  // floor is the search's own answer and the search records what it stepped
  // over — so it is a throw rather than a null the render path would have to
  // invent words for. `floorWordsOf`'s existing refusal, one layer down.
  //
  // Proof: the search made to hand back an empty set (its dependency
  // deliberately broken) **and** this throw replaced by the fall-through it
  // refuses — the two faults the invariant stands between — and `waits for a
  // team's slots to come free before it starts` failed on
  // `resourcePredecessorId: null` with `boundBy: 'capacity'`: a bar claiming
  // a wait and naming nothing. With the throw restored the same broken search
  // fails here instead, which is the point of it; watched 2026-08-12.
  if (boundBy === 'capacity' && referent === NOBODY) {
    throw new Error(`${key} waited for capacity with nothing holding the pool`);
  }
  // **Read off the search rather than gated on `boundBy`, and then checked
  // against it.** The two are the same fact — a pool binds exactly where it
  // pushed the block off the plan floor, and a floor strictly past the plan's
  // own is what `capacity` means — so a gate here would be a restatement
  // that cannot fail, which is the one thing this repo has been bitten by
  // repeatedly. Written as the invariant instead, where an injected fault on
  // either side of it reddens.
  //
  // Proof: `binding` handed back without its `start > floor` condition — the
  // shape of a pool that had room being called the reason — and `names no
  // team on a slice no pool held up` failed here on `first step-dev names
  // team-alpha with no pool binding it`; watched 2026-08-14.
  if ((boundBy === 'capacity') !== (capacityTeamId !== null)) {
    throw new Error(
      capacityTeamId === null
        ? `${key} waited for capacity with no pool binding it`
        : `${key} names ${capacityTeamId} with no pool binding it`,
    );
  }
  return { capacityPredecessors, capacityTeamId, referent };
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
  /**
   * Whether people's queues and teams' pools constrain this run.
   *
   * Both together, because they are the same kind of fact — a resource the plan
   * does not create more of — and the run with them off is the critical path
   * this one ranks by. Splitting them would make the ranking depend on
   * capacity, which is a placement decision.
   */
  withResources: boolean,
  sizes: PoolSizes,
  /**
   * The people's bookings elsewhere, placed around only when `withResources`.
   * A person absent from it takes the path this pass always took, unchanged.
   */
  elsewhere: Elsewhere,
  /**
   * Task 4.9's `annotate`: one start per node, or `undefined` for Fast's own.
   *
   * **A mode of this pass, never a second implementation and never a
   * composition.** `annotate(input, chooseStarts(input))` run *inside*
   * `placeSlices` would double the placement loop, and the 600-slice
   * benchmark's 20ms budget is modelled at a 3.81ms geometric mean with p99.99
   * 13.3ms, so doubling puts the extrapolated p99.99 past it. So the loop stays
   * one loop and this argument overrides the start it lands on — every other
   * rule in the body, the floor ({@link resolveFloor}), the tiling
   * ({@link tileFinish}), the pool's explanation ({@link annotateCapacity}) and
   * the resource referent ({@link resourcePredecessorOf}), runs unchanged and
   * once.
   *
   * The floor is still **resolved**, not skipped: it is what decides whether a
   * pinned start is the plan's own answer (keep the resolved `boundBy`),
   * strictly later than every floor (`optimizer`), or strictly earlier than one
   * of them — which is a solver output the plan refuses, and a throw.
   *
   * The caller supplies a `goesFirst` that drains the eligible set in ascending
   * `(start, canonical slice order)`; task 4.10b's chronological replay and its
   * topological order are then the same order, because the eligible set is
   * Kahn's ready set and admits a node only once its plan predecessors are
   * placed.
   */
  pinnedStarts?: readonly number[],
): {
  order: number[];
  placed: Placed[];
  resourceSuccessors: number[][];
  resourceEdges: WeightedEdge[];
  eventsVisited: number;
} {
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
  const profile = capacityProfile(sizes);
  /** Which step of `order` each node was placed at, which breaks the display referent's ties. */
  const placedAt = new Array<number>(nodes.length).fill(0);

  for (let taken = eligible.take(); taken !== undefined; taken = eligible.take()) {
    const node = nodes[taken];
    const { offsets, at } = node;

    let fromPredecessor = 0;
    let fromStepOrder = 0;
    for (const earlier of node.predecessors) {
      const { finish } = placed[earlier];
      if (nodes[earlier].item === node.item) fromStepOrder = Math.max(fromStepOrder, finish);
      else fromPredecessor = Math.max(fromPredecessor, finish);
    }
    // A slice of no length is not work, so it neither waits for its assignee
    // nor makes them busy: nobody is occupied for zero days. Without this a
    // `QA` somebody sized at zero would queue behind everything else its
    // assignee is doing and drag its work item's finish along with it — a row
    // that ends on day 3 reported as ending on day 5 because a slice with
    // nothing in it was placed there.
    //
    // An unestimated slice is zero schedule time too (see {@link durationOf}),
    // so it falls under this line and occupies nobody, however wide the Gantt
    // draws its placeholder.
    //
    // Proof: the length dropped from this condition and `gives a slice
    // somebody sized at zero no place in the queue` failed — the empty `QA`
    // came back at day 5 rather than day 3, `boundBy: 'person'`, taking its
    // work item's finish with it; watched 2026-08-09, re-watched 2026-08-29
    // against the renamed test.
    const duration = offsets[at + 1] - offsets[at];
    const personId = withResources && duration > 0 ? node.slice.personId : null;
    const busy = personId === null ? undefined : busyUntil.get(personId);
    // The same rule as the person's, one line along: a slice of no length
    // spends nobody's slots, and neither does one no sized team labels. The run
    // with the resources taken out is the critical path, and it has no pools in
    // it at all.
    const poolIds = withResources ? node.slice.poolIds : [];
    const { width } = node.slice;
    // Where the plan alone would put it: the floors that do not depend on a
    // resource, plus the person's queue. The pool is asked **from** here, which
    // is what "at or after the floor" means.
    const planFloor = Math.max(
      fromPredecessor,
      fromStepOrder,
      node.notBefore,
      busy === undefined ? 0 : busy.finish,
    );
    // Proof: this lookup made to answer `undefined` always, so the interval
    // search is bypassed, made `waits for a booking elsewhere before it
    // starts` (`schedule-elsewhere.test.ts`) place the slice across the
    // foreign interval at 0 with `boundBy: 'projectStart'`; watched 2026-09-29.
    const booked = personId === null ? undefined : elsewhere.get(personId);
    let away: { start: number; holder: ElsewhereBooking } | null = null;
    let window: JointWindow;
    // The pool's own evidence: the search that moved the start, when one did.
    let pushed: JointWindow | null = null;
    if (booked === undefined) {
      window = profile.jointWindowFor(poolIds, width, duration, planFloor);
    } else {
      // The search is asked for `[start, start + duration)`, and the slice then
      // reserves up to {@link tileFinish}'s finish, which can exceed that by
      // floating-point drift (under {@link withinDrift}) when a work item's
      // slices tile. A booking starting exactly there is therefore touched,
      // never entered, beyond drift — the tolerance the weighted replay and
      // `schedule-elsewhere.test.ts`'s overlap property both apply. The
      // weighted path re-searches with the tiled length; this pass keeps
      // Fast's placement unchanged instead, and states the tolerance here.
      ({ window, pushed, away } = windowAroundElsewhere(
        booked,
        profile,
        poolIds,
        width,
        duration,
        planFloor,
      ));
    }
    // Latest wins, and a tie keeps the reason listed first — which is why the
    // person is second to last and capacity is last; see {@link ScheduleFloor}.
    // A slice can carry both, because a team's slot is spent whether or not
    // somebody is named on the work, so the order decides a real case.
    //
    // Proof: the person floor deleted from this list and nine leveling tests
    // failed, `runs two work items assigned to one person one after the other`
    // among them — `b` came back at 0→2 while `kat` was on `a` until day 3;
    // watched 2026-08-09.
    //
    // Proof: the capacity entry deleted from this list and `waits for a team's
    // slots to come free before it starts` failed — the third block on a team
    // of two came back at day 0 with `boundBy: 'projectStart'`; watched
    // 2026-08-12.
    //
    // Proof: the capacity entry moved above `person` and `names the person, not
    // the pool, when the two land on the same day` failed — not by naming
    // `capacity` where the assignee was owed the sentence, which is what the
    // reorder was predicted to do, but one layer earlier. In that fixture both
    // floors are day 3, so the window search starts at its answer and steps
    // over nothing: `capacity` takes the tie with an **empty** blocking set,
    // the referent below stays `NOBODY`, and the invariant at the end of this
    // block throws `b step-dev waited for capacity with nothing holding the
    // pool`. Recorded as observed, which is also what `verify.md`'s F8 row
    // says; watched 2026-08-12.
    const floors: FloorCandidate[] = [
      { at: fromPredecessor, kind: 'predecessor' },
      { at: fromStepOrder, kind: 'stepOrder' },
      { at: node.notBefore, kind: 'notBefore' },
      ...(busy === undefined ? [] : [{ at: busy.finish, kind: 'person' as const }]),
      ...(away === null ? [] : [{ at: away.start, kind: 'elsewhere' as const }]),
      { at: (pushed ?? window).start, kind: 'capacity' as const },
    ];
    // The tie rule and its proof live on {@link resolveFloor}, which the
    // optimized materialiser calls too — see 4.9.
    const resolved = resolveFloor(floors);
    // Task 4.9's three-way comparison, and the only place a pinned start enters
    // the pass. It is written against the **resolved** floor rather than
    // against the joint window because the struck version compared the window
    // to the pin and reported `capacity` for the common unmoved slice — where
    // `jointWindowFor` returns `binding: []` by construction, so `capacityTeamId`
    // had no rule and `capacityPredecessorIds` was empty beside
    // `boundBy: 'capacity'`, violating the render invariant — and reported
    // `optimizer` for a slice merely pinned at its predecessor floor.
    const { start, boundBy } = pinFloor(node.key, resolved, pinnedStarts?.[taken], (from) => {
      // Proof: asking pools alone accepted a later FS pin inside a booking
      // (1 pass / 1 fail for the FS/SS negatives in elsewhere-wire.test.ts).
      window =
        booked === undefined
          ? profile.jointWindowFor(poolIds, width, duration, from)
          : windowAroundElsewhere(booked, profile, poolIds, width, duration, from).window;
      return window;
    });

    const { held, finish } = tileFinish(anchorOf[node.item], start, at, offsets);
    anchorOf[node.item] = held;
    // Proof: the final window handed over for a capacity floor too made
    // `names the pool when a pool pushes past the booking, with its blocking
    // set` (`schedule-elsewhere.test.ts`) throw `waited for capacity with
    // nothing holding the pool`; handing `pushed` for every floor made `names
    // the booking when it pushes past the pool` throw `names t with no pool
    // binding it`; watched 2026-09-29.
    const { capacityPredecessors, capacityTeamId, referent } = annotateCapacity(
      node.key,
      boundBy,
      start,
      boundBy === 'capacity' && pushed !== null ? pushed : window,
      (blocker) => placed[blocker].finish,
      (blocker) => placedAt[blocker],
    );
    placed[taken] = {
      start,
      finish,
      boundBy,
      resourcePredecessor: resourcePredecessorOf(boundBy, busy, referent),
      capacityPredecessors,
      capacityTeamId,
      elsewhereHolder: boundBy === 'elsewhere' ? holderOf(node.key, away) : null,
    };
    placedAt[taken] = order.length;
    order.push(taken);

    // The reservation, written once and never moved — which is what makes the
    // scan above read a profile that cannot change under it, and therefore what
    // makes the placement terminate.
    profile.reserve(poolIds, taken, width, start, finish);
    // The edges the pool chose: every reservation that had to end for this
    // block to fit, each pointing at the block. The **whole** set, because a
    // single edge reports float that is not there — see
    // {@link ScheduledSlice.capacityPredecessorIds}. Every one of them is
    // already placed, so the augmented graph stays acyclic in placement order.
    //
    // Proof: narrowed to the display referent alone — one edge, from the latest
    // finisher — and `reports no float on a block whose slack another block's
    // finish is holding` failed with A's float coming back as 5 rather than 2:
    // a row reported as movable that cannot move; watched 2026-08-12.
    for (const blocker of capacityPredecessors) resourceSuccessors[blocker].push(taken);

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
  return {
    order,
    placed,
    resourceSuccessors,
    resourceEdges: [],
    eventsVisited: profile.eventsVisited(),
  };
}

/** Earliest nonoverlapping person interval at or after a weighted floor. */
function findPersonWindow(
  intervals: readonly { node: number; start: number; finish: number }[],
  floor: number,
  duration: number,
): { start: number; blocking: number[] } {
  // Proof: replacing this gap scan's initial start with the last interval's
  // finish made `places a longer FF successor earlier, in a person gap` fail:
  // B moved from day 0 to day 11; watched 2026-09-28.
  let start = floor;
  const blocking: number[] = [];
  if (duration === 0) return { start, blocking };
  for (const interval of intervals) {
    if (interval.finish <= start) continue;
    if (interval.start >= start + duration) break;
    blocking.push(interval.node);
    start = interval.finish;
  }
  return { start, blocking };
}

/**
 * The earliest start at or after `floor` where `duration` fits between one
 * person's bookings elsewhere, and the booking that ended last before it — or
 * `null` when no booking moved it. Half-open, as every reservation here is: a
 * booking ending at an instant leaves that instant free.
 *
 * Proof: both comparisons made inclusive made `fits in a gap between bookings,
 * and a touching booking holds nothing` (`schedule-elsewhere.test.ts`) push a
 * slice off a booking it only touched; watched 2026-09-29.
 */
function elsewhereWindow(
  bookings: readonly ElsewhereBooking[],
  floor: number,
  duration: number,
): { start: number; holder: ElsewhereBooking | null } {
  let start = floor;
  let holder: ElsewhereBooking | null = null;
  if (duration === 0) return { start, holder };
  for (const booking of bookings) {
    if (booking.end <= start) continue;
    if (booking.start >= start + duration) break;
    start = booking.end;
    holder = booking;
  }
  return { start, holder };
}

/** Latest start no later than `ceiling` that still fits before a person's bookings. */
function latestStartAroundElsewhere(
  bookings: readonly ElsewhereBooking[],
  ceiling: number,
  duration: number,
): number {
  let start = ceiling;
  if (duration === 0) return start;
  for (let at = bookings.length - 1; at >= 0; at -= 1) {
    const booking = bookings[at];
    if (booking.end <= start) break;
    if (booking.start >= start + duration) continue;
    start = booking.start - duration;
  }
  return start;
}

/**
 * {@link placeSlices}' window for a person booked elsewhere: move between the
 * bookings and the pools until both accept one instant.
 *
 * Each side keeps its own evidence — the last search that moved the start —
 * as {@link findResourceWindow} does, because the one that moved last is the
 * reason. `pushed` is the pool's: the window whose blocking set explains a
 * `capacity` floor. `window` is the final search, asked from its own answer,
 * so its blocking set is empty — what {@link annotateCapacity} must be handed
 * for any other floor, since a team named on a slice no pool held up throws.
 *
 * Terminates: every round starts strictly later than the last, and both the
 * bookings and the pool's events are finite.
 */
function windowAroundElsewhere(
  bookings: readonly ElsewhereBooking[],
  profile: ReturnType<typeof capacityProfile>,
  poolIds: readonly string[],
  width: number,
  duration: number,
  floor: number,
): {
  window: JointWindow;
  pushed: JointWindow | null;
  away: { start: number; holder: ElsewhereBooking } | null;
} {
  let from = floor;
  let away: { start: number; holder: ElsewhereBooking } | null = null;
  let pushed: JointWindow | null = null;
  for (;;) {
    const found = elsewhereWindow(bookings, from, duration);
    if (found.holder !== null) away = { start: found.start, holder: found.holder };
    const window = profile.jointWindowFor(poolIds, width, duration, found.start);
    if (window.start === found.start) return { window, pushed, away };
    pushed = window;
    from = window.start;
  }
}

/** The holder a slice bound by `elsewhere` names, or a throw when none bound it. */
function holderOf(key: string, away: { holder: ElsewhereBooking } | null): ElsewhereHolder {
  if (away === null) throw new Error(`${key} waited elsewhere with no booking holding it`);
  return { projectId: away.holder.projectId, workItemId: away.holder.workItemId };
}

/**
 * Refuses an `elsewhere` the engine cannot place around: a person listed with
 * no booking, or a booking that is not finite, holds no time, or overlaps or
 * precedes the one listed before it. The chain read builds these from other
 * projects' schedules, so a malformed one is a broken caller and never a plan
 * to place around.
 *
 * **A listed person holds at least one booking**, and that is what makes
 * "non-empty" one fact everywhere: `elsewhere.size > 0` in `schedule()`, in
 * {@link canonicalScheduleInput}, which calls this, and in the solver request
 * builder. A person with `[]` would otherwise hash as the booking-free plan
 * while the engine answered `waitingElsewhere: 0` and refused pinned starts.
 *
 * Proof: the call to this removed made `refuses a malformed map`
 * (`schedule-elsewhere.test.ts`) schedule all five maps; the empty-list refusal
 * alone removed made it schedule `{ ana: [] }`, and `refuses a person listed
 * with no booking` (`canonical-schedule-input.test.ts`) hash it; watched
 * 2026-09-29.
 */
export function checkElsewhere(elsewhere: Elsewhere): void {
  for (const [personId, bookings] of elsewhere) {
    if (bookings.length === 0) {
      throw new Error(`elsewhere for ${personId}: a person is listed with no booking`);
    }
    let previousEnd = -Infinity;
    for (const booking of bookings) {
      if (!Number.isFinite(booking.start) || !Number.isFinite(booking.end)) {
        throw new Error(`elsewhere for ${personId}: a booking is not finite`);
      }
      if (booking.end <= booking.start) {
        throw new Error(`elsewhere for ${personId}: a booking holds no time`);
      }
      if (booking.start < previousEnd) {
        throw new Error(`elsewhere for ${personId}: bookings overlap or are out of order`);
      }
      previousEnd = booking.end;
    }
  }
}

/** Revisit person and pool windows until both accept the same interval. */
function findResourceWindow(
  intervals: readonly { node: number; start: number; finish: number }[],
  profile: ReturnType<typeof capacityProfile>,
  poolIds: readonly string[],
  width: number,
  floor: number,
  duration: number,
): { start: number; person: ReturnType<typeof findPersonWindow>; pool: JointWindow } {
  let start = floor;
  let person = findPersonWindow(intervals, start, duration);
  let pool = profile.jointWindowFor(poolIds, width, duration, start);
  let personEvidence = person;
  let poolEvidence = pool;
  for (;;) {
    if (person.start > start) personEvidence = person;
    if (pool.start > start) poolEvidence = pool;
    const next = Math.max(person.start, pool.start);
    // Proof: returning after one pass made `explains a person delay after a
    // pool delay` label C at day 5 `optimizer` with no person predecessor;
    // watched 2026-09-28 (13 pass / 1 fail).
    if (next === start) return { start, person: personEvidence, pool: poolEvidence };
    start = next;
    person = findPersonWindow(intervals, start, duration);
    pool = profile.jointWindowFor(poolIds, width, duration, start);
  }
}

/**
 * Where a pinned slice's person and pools let it start: the pin itself, or a
 * release within {@link withinDrift} after it, whose own double is returned
 * for the caller to move the pin onto (see {@link pinFloor} for why the
 * release's double and not the pin's).
 *
 * Throws {@link ScheduleInvalidOptimizedStartError} naming the person
 * reservation or the pool when the pin sits inside one by more than drift —
 * at least one solver unit, since pins are whole units.
 */
function holdPinnedResources(
  key: string,
  intervals: readonly { node: number; start: number; finish: number }[],
  profile: ReturnType<typeof capacityProfile>,
  poolIds: readonly string[],
  width: number,
  start: number,
  duration: number,
): number {
  const held = findResourceWindow(intervals, profile, poolIds, width, start, duration).start;
  // Proof: comparing these three with `===`/`!==` instead of drift made
  // `accepts every person-abutting answer on the solver axis` and `…every
  // pool-abutting answer…` each report 1438 of 9216 refusals through
  // materialiseOptimized (44 pass / 2 fail). Returning `held` without the
  // refusals below moved a pin a whole unit and accepted it: `rejects a pinned
  // person overlap even when an earlier gap is free`, `rejects a pinned pool
  // overlap in resource-order replay` and both `still refuses a person-/pool-
  // sharing answer one solver unit early` did not throw (42 pass / 4 fail).
  // Watched 2026-09-28.
  if (withinDrift(held, start)) return held;
  // Only a refusal pays for naming its cause, so the common path costs one
  // joint search.
  if (!withinDrift(findPersonWindow(intervals, start, duration).start, start)) {
    throw new ScheduleInvalidOptimizedStartError(key, 'overlaps a resource reservation');
  }
  const blocked = poolIds.find(
    (poolId) => !withinDrift(profile.jointWindowFor([poolId], width, duration, start).start, start),
  );
  throw new ScheduleInvalidOptimizedStartError(
    key,
    blocked === undefined ? 'overlaps its joint pools' : `overlaps pool ${blocked}`,
  );
}

/** Rebuild actual chronological resource edges, independent of Kahn placement order. */
function rebuildResourceOrder(
  graph: SliceGraph,
  placed: readonly Placed[],
  sizes: PoolSizes,
): WeightedEdge[] {
  const edges: WeightedEdge[] = [];
  const seen = new Set<string>();
  const add = (before: number, after: number): void => {
    if (before === after) return;
    const key = `${String(before)}:${String(after)}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({
      before,
      after,
      type: 'FS',
      weight: durationOf(graph.nodes[before].slice),
      provenance: 'resource',
    });
  };
  const byPerson = new Map<string, number[]>();
  const byPool = new Map<string, number[]>();
  graph.nodes.forEach((node, at) => {
    if (placed[at].finish <= placed[at].start) return;
    if (node.slice.personId !== null) {
      const assigned = byPerson.get(node.slice.personId) ?? [];
      assigned.push(at);
      byPerson.set(node.slice.personId, assigned);
    }
    for (const poolId of node.slice.poolIds) {
      const reserved = byPool.get(poolId) ?? [];
      reserved.push(at);
      byPool.set(poolId, reserved);
    }
  });
  const chronological = (left: number, right: number): number =>
    placed[left].start - placed[right].start || left - right;
  for (const assigned of byPerson.values()) {
    // Proof: leaving these in node/plan order instead of sorting by actual
    // start made `computes float through a feasible augmented cycle` report
    // latest starts 9/0/10 rather than 10/0/9; watched 2026-09-28.
    assigned.sort(chronological);
    // Proof: omitting these actual-order person edges made `computes float
    // through a feasible augmented cycle` report C latest start 10 instead
    // of 9, and the longer cycle report 20 instead of 9; watched 2026-09-28.
    for (let at = 1; at < assigned.length; at += 1) add(assigned[at - 1], assigned[at]);
  }
  for (const [poolId, reserved] of byPool) {
    const size = sizes.get(poolId);
    if (size === undefined) throw new Error(`no size for pool ${poolId}`);
    const slots = Array.from(
      { length: size },
      (): { owner: number; finish: number } | null => null,
    );
    reserved.sort(chronological);
    for (const at of reserved) {
      let taken = 0;
      for (let slot = 0; slot < size && taken < graph.nodes[at].slice.width; slot += 1) {
        const previous = slots[slot];
        if (previous !== null && previous.finish > placed[at].start) continue;
        if (previous !== null) add(previous.owner, at);
        slots[slot] = { owner: at, finish: placed[at].finish };
        taken += 1;
      }
      if (taken !== graph.nodes[at].slice.width) {
        // An invariant now, not the refusal: {@link holdPinnedResources}
        // refuses a pinned pool overlap during the replay, before this runs.
        // Disabling this branch left wbs-domain and wbs-contracts green
        // (791 / 430 pass), 2026-09-28; the watched refusal is that one's.
        // R5-29 in docs/findings/checks-that-cannot-fail.md.
        throw new ScheduleInvalidOptimizedStartError(
          graph.nodes[at].key,
          `overlaps pool ${poolId}`,
        );
      }
    }
  }
  return edges;
}

/**
 * Place weighted DAG nodes; pins materialize in plan order, then resources replay in actual time.
 * A pin must meet its explicit floor and the dependency's materialized boundary;
 * nominal weighted sums can round above a valid fractional FF pin. A pin short
 * of a materialized boundary by less than {@link withinDrift} is moved onto it
 * (start for FS/SS, finish for FF), because the pin divides back from
 * `k / SOLVER_QUANTUM` while the boundary accumulated `start + days`; a real
 * violation is short by at least one solver unit and still throws
 * {@link ScheduleInvalidOptimizedStartError}.
 *
 * The resource replay applies the same rule to a person's or pool's release:
 * a pin within drift of it is moved onto the release's own double, as
 * {@link pinFloor} does, rather than left one ulp inside a live reservation.
 * A move shifts that slice's finish and so every boundary downstream of it, so
 * placement reruns from the moved starts until no replay moves anything; the
 * starts only rise, by drift each time, and `round` bounds the reruns. The
 * returned `eventsVisited` is the final round's; discarded rounds' are dropped.
 */
function placeWeightedSlices(
  graph: SliceGraph,
  edges: readonly WeightedEdge[],
  goesFirst: (left: number, right: number) => boolean,
  withResources: boolean,
  sizes: PoolSizes,
  /** See {@link placeSlices}; seeded into each person's interval list as fixed intervals. */
  elsewhere: Elsewhere,
  pinned?: readonly number[],
  round = 0,
): {
  order: number[];
  placed: Placed[];
  resourceSuccessors: number[][];
  resourceEdges: WeightedEdge[];
  eventsVisited: number;
} {
  const { nodes } = graph;
  const incoming = nodes.map((): WeightedEdge[] => []);
  for (const edge of edges) incoming[edge.after].push(edge);
  const waitingOn = nodes.map((node) => node.predecessors.length);
  const eligible = eligibleSet(goesFirst);
  nodes.forEach((_, at) => {
    if (waitingOn[at] === 0) eligible.push(at);
  });
  const placed: Placed[] = [];
  const order: number[] = [];
  const anchors = new Array<SpanAnchor | undefined>(graph.items);
  const profile = capacityProfile(sizes);
  // Bookings elsewhere enter each person's interval list as fixed intervals
  // under node indices below NOBODY, so the window search steps over them like
  // any other reservation and a blocking list can say which kind held it.
  // Proof: the seeding skipped made `waits for a booking elsewhere across a
  // typed dependency` (`schedule-elsewhere.test.ts`) place the slice across
  // the foreign interval; watched 2026-09-29.
  const away: ElsewhereBooking[] = [];
  const awayIntervals = new Map<string, { node: number; start: number; finish: number }[]>();
  if (withResources) {
    for (const [personId, bookings] of elsewhere) {
      awayIntervals.set(
        personId,
        bookings.map((booking) => ({
          node: NOBODY - away.push(booking),
          start: booking.start,
          finish: booking.end,
        })),
      );
    }
  }
  const awayOf = (node: number | undefined): ElsewhereBooking | undefined =>
    node === undefined || node >= NOBODY ? undefined : away[NOBODY - node - 1];
  const seededPeople = () =>
    new Map([...awayIntervals].map(([personId, intervals]) => [personId, [...intervals]]));
  const people = seededPeople();
  for (let taken = eligible.take(); taken !== undefined; taken = eligible.take()) {
    const node = nodes[taken];
    const duration = durationOf(node.slice);
    const explicitFloor = Math.max(0, node.notBefore);
    let floor = explicitFloor;
    for (const edge of incoming[taken])
      floor = Math.max(floor, placed[edge.before].start + edge.weight);
    let start = pinned === undefined ? floor : pinned[taken];
    // Proof: removing the finite check let an Infinity pin return a plan and
    // made a NaN pin throw `weighted boundary did not converge` instead of the
    // named refusal (1 pass / 2 fail); removing the explicit-floor check accepted B at 1
    // despite its floor at 2 (0 pass / 1 fail). Restoring the nominal weighted
    // comparison refused a valid FF replay at 1.6666666666666665 (0 pass / 1
    // fail); both materialized finishes were 2.6666666666666665. Watched
    // 2026-09-28 through schedule().
    if (pinned !== undefined && (!Number.isFinite(start) || start < explicitFloor)) {
      throw new ScheduleInvalidOptimizedStartError(
        node.key,
        'violates a weighted floor or has a non-finite start',
      );
    }
    let tiled: ReturnType<typeof tileFinish> | undefined;
    for (let attempt = 0; attempt < 16; attempt += 1) {
      if (pinned === undefined && withResources) {
        const personId = duration > 0 ? node.slice.personId : null;
        const intervals = personId === null ? [] : (people.get(personId) ?? []);
        start = findResourceWindow(
          intervals,
          profile,
          node.slice.poolIds,
          node.slice.width,
          start,
          duration,
        ).start;
      }
      const candidate = tileFinish(anchors[node.item], start, node.at, node.offsets);
      let required = start;
      // Proof: deleting this materialized-window search made `reconciles a
      // tiled fractional interval before reserving a pool` throw `C waited
      // for capacity with nothing holding the pool` during replay; watched
      // 2026-09-28 (13 pass / 1 fail).
      if (pinned === undefined && withResources && candidate.finish > start) {
        const intervals =
          node.slice.personId === null ? [] : (people.get(node.slice.personId) ?? []);
        required = findResourceWindow(
          intervals,
          profile,
          node.slice.poolIds,
          node.slice.width,
          start,
          candidate.finish - start,
        ).start;
      }
      for (const edge of incoming[taken]) {
        const before = placed[edge.before];
        const boundary = edge.type === 'SS' ? before.start : before.finish;
        // Proof: forcing this comparison false made `reconciles an FF
        // successor against the materialized predecessor finish` fail:
        // B finished at 32024810461.572468 before A at
        // 32024810461.57247; watched 2026-09-28.
        const observed = edge.type === 'FF' ? candidate.finish : start;
        if (observed >= boundary) continue;
        // A pin within DRIFT below its boundary is the solver's tight answer
        // read on another rounding, as in {@link pinFloor}; it snaps onto the
        // boundary through the Fast adjustment below. Proof: throwing on every
        // `observed < boundary` again made `accepts every tight FS and FF pin
        // on the solver axis` report 1867 refusals (868 FS, 999 FF, 0 on the
        // all-FS control) and `accepts 7/48 + 0.25 against a pin at 19/48
        // across FS` throw; watched 2026-09-28 (21 pass / 2 fail).
        if (pinned !== undefined && !withinDrift(observed, boundary)) {
          throw new ScheduleInvalidOptimizedStartError(
            node.key,
            `violates ${edge.type} materialized boundary at placement`,
          );
        }
        required = Math.max(required, edge.type === 'FF' ? boundary - duration : boundary);
        if (required <= start) required = start + Number.EPSILON * Math.max(1, Math.abs(start));
      }
      if (required === start) {
        tiled = candidate;
        break;
      }
      start = required;
    }
    if (tiled === undefined) throw new Error(`weighted boundary did not converge for ${node.key}`);
    anchors[node.item] = tiled.held;
    placed[taken] = {
      start,
      finish: tiled.finish,
      boundBy: 'projectStart',
      resourcePredecessor: NOBODY,
      capacityPredecessors: [],
      capacityTeamId: null,
      elsewhereHolder: null,
    };
    order.push(taken);
    if (pinned === undefined && withResources && duration > 0) {
      if (node.slice.personId !== null) {
        const intervals = people.get(node.slice.personId) ?? [];
        intervals.push({ node: taken, start, finish: tiled.finish });
        intervals.sort((left, right) => left.start - right.start);
        people.set(node.slice.personId, intervals);
      }
      profile.reserve(node.slice.poolIds, taken, node.slice.width, start, tiled.finish);
    }
    for (const next of node.successors) {
      waitingOn[next] -= 1;
      if (waitingOn[next] === 0) eligible.push(next);
    }
  }
  if (order.length !== nodes.length) throw new ScheduleCycleError();

  if (withResources) {
    // Traverse actual intervals rather than Kahn order: a long FF successor
    // may begin before the predecessor that made it eligible.
    // Actual starts decide resource order; plan order only materializes pins.
    const replayProfile = capacityProfile(sizes);
    const replayPeople = seededPeople();
    const chronology = [...order].sort(
      (left, right) => placed[left].start - placed[right].start || left - right,
    );
    const chronologicalAt = new Array<number>(nodes.length);
    chronology.forEach((node, at) => {
      chronologicalAt[node] = at;
    });
    const reserveReplayed = (at: number, from: number, until: number): void => {
      const { slice } = nodes[at];
      if (durationOf(slice) === 0) return;
      if (slice.personId !== null) {
        const assigned = replayPeople.get(slice.personId) ?? [];
        assigned.push({ node: at, start: from, finish: until });
        // Chronological pushes keep a list sorted by start; a seeded one needs
        // the sort, because its bookings elsewhere were all there first.
        if (awayIntervals.has(slice.personId))
          assigned.sort((left, right) => left.start - right.start);
        replayPeople.set(slice.personId, assigned);
      }
      replayProfile.reserve(slice.poolIds, at, slice.width, from, until);
    };
    const moved = new Map<number, number>();
    for (const taken of chronology) {
      const node = nodes[taken];
      const duration = durationOf(node.slice);
      const start = placed[taken].start;
      const personId = duration > 0 ? node.slice.personId : null;
      const intervals = personId === null ? [] : (replayPeople.get(personId) ?? []);
      const actualDuration = placed[taken].finish - start;
      // Kept for the Fast replay only, where no reachable input fires it: Fast
      // placed every slice in a person window over the same intervals. See
      // R5-30 in docs/findings/checks-that-cannot-fail.md.
      if (
        pinned === undefined &&
        findPersonWindow(intervals, start, actualDuration).start !== start
      )
        throw new ScheduleInvalidOptimizedStartError(node.key, 'overlaps a resource reservation');
      const held =
        pinned === undefined
          ? start
          : holdPinnedResources(
              node.key,
              intervals,
              replayProfile,
              node.slice.poolIds,
              node.slice.width,
              start,
              actualDuration,
            );
      if (held !== start) moved.set(taken, held);
      if (moved.size > 0) {
        // This round is discarded; it only reserves, so later slices meet the
        // moved intervals and move in the same rerun. The finish is the one the
        // rerun will tile from `held`: `placed.finish + (held - start)` lands
        // an ulp short of it, and a same-person chain then moved one link per
        // rerun instead of all at once.
        reserveReplayed(taken, held, tileFinish(undefined, held, node.at, node.offsets).finish);
        continue;
      }
      let planFloor = node.notBefore;
      let planKind: ScheduleFloor = node.notBefore > 0 ? 'notBefore' : 'projectStart';
      for (const edge of incoming[taken]) {
        const before = placed[edge.before];
        // The reported floor follows actual boundaries after numerical
        // reconciliation. An exactly tiled FF finish is predecessor-bound,
        // even when its raw start weight differs by one or two ulps.
        // Proof: reverting to `before.start + edge.weight` made `reconciles an
        // FF successor against the materialized predecessor finish` report
        // `optimizer` instead of `predecessor`; watched 2026-09-28.
        const bound =
          edge.type === 'SS'
            ? before.start
            : edge.type === 'FS'
              ? before.finish
              : placed[taken].finish === before.finish
                ? start
                : before.finish - duration;
        if (bound > planFloor) {
          planFloor = bound;
          planKind = edge.provenance === 'workflow' ? 'stepOrder' : 'predecessor';
        }
      }
      planFloor = Math.max(0, planFloor);
      const { person, pool } = findResourceWindow(
        intervals,
        replayProfile,
        node.slice.poolIds,
        node.slice.width,
        planFloor,
        actualDuration,
      );
      const candidates: FloorCandidate[] = [{ at: planFloor, kind: planKind }];
      // The last interval that pushed says which kind held it: a slice of
      // this plan (`person`) or a booking elsewhere.
      // Proof: every push named `person` made `waits for a booking elsewhere
      // across a typed dependency` (`schedule-elsewhere.test.ts`) read
      // `boundBy: 'person'`; watched 2026-09-29.
      const holder = awayOf(person.blocking.at(-1));
      if (person.start > planFloor) {
        candidates.push({ at: person.start, kind: holder === undefined ? 'person' : 'elsewhere' });
      }
      if (pool.start > Math.max(planFloor, person.start))
        candidates.push({ at: pool.start, kind: 'capacity' });
      const resolved = resolveFloor(candidates);
      const boundBy =
        start > resolved.start && !withinDrift(start, resolved.start)
          ? 'optimizer'
          : resolved.boundBy;
      placed[taken].boundBy = boundBy;
      if (boundBy === 'person')
        placed[taken].resourcePredecessor = person.blocking.at(-1) ?? NOBODY;
      if (boundBy === 'elsewhere')
        placed[taken].elsewhereHolder = holderOf(
          node.key,
          holder === undefined ? null : { holder },
        );
      if (boundBy === 'capacity') {
        const annotation = annotateCapacity(
          node.key,
          boundBy,
          start,
          pool,
          (at) => placed[at].finish,
          (at) => chronologicalAt[at],
        );
        placed[taken].capacityPredecessors = annotation.capacityPredecessors;
        placed[taken].capacityTeamId = annotation.capacityTeamId;
        placed[taken].resourcePredecessor = annotation.referent;
      }
      reserveReplayed(taken, start, placed[taken].finish);
    }
    if (pinned !== undefined && moved.size > 0) {
      const [first] = moved.keys();
      // Bounded convergence. A rerun that moves nothing returns, and a moved
      // start only rises. The bound is the slice count: even one moved link
      // per rerun, the propagation seen before the discarded round reserved
      // the rerun's own finish, settles an n-slice chain within n reruns.
      // Proof: a bound of 0 made `settles a 17-slice same-person chain in one
      // rerun` throw `resource releases did not converge within drift` for S5;
      // a bound of 1 passed it (one rerun suffices). With the old
      // `placed.finish + (held - start)` reservation, a bound of 3 threw for
      // S10. Watched 2026-09-29.
      if (round >= nodes.length) {
        throw new ScheduleInvalidOptimizedStartError(
          nodes[first].key,
          'resource releases did not converge within drift',
        );
      }
      const repinned = placed.map((slice, at) => moved.get(at) ?? slice.start);
      return placeWeightedSlices(
        graph,
        edges,
        goesFirst,
        withResources,
        sizes,
        elsewhere,
        repinned,
        round + 1,
      );
    }
    const resourceEdges = rebuildResourceOrder(graph, placed, sizes);
    const resourceSuccessors = nodes.map((): number[] => []);
    for (const edge of resourceEdges) resourceSuccessors[edge.before].push(edge.after);
    return {
      order,
      placed,
      resourceSuccessors,
      resourceEdges,
      eventsVisited: replayProfile.eventsVisited(),
    };
  }
  return {
    order,
    placed,
    resourceSuccessors: nodes.map((): number[] => []),
    resourceEdges: [],
    eventsVisited: 0,
  };
}

/** Relax a cyclic weighted graph to its latest starts, refusing positive cycles. */
export function relaxWeightedStarts(
  starts: number[],
  edges: readonly { before: number; after: number; weight: number }[],
): void {
  // Upper-bound relaxation handles non-positive augmented cycles that Kahn
  // cannot order. A positive-weight cycle changes on the final pass.
  // Proof: limiting this to one pass made `relaxes latest dates beyond a
  // reverse placement pass` fail: A/C latest starts became 20/19, expected
  // 10/9; watched 2026-09-28.
  for (let pass = 0; pass < starts.length; pass += 1) {
    let changed = false;
    for (const edge of edges) {
      const bound = starts[edge.after] - edge.weight;
      if (bound < starts[edge.before] && !withinDrift(bound, starts[edge.before])) {
        starts[edge.before] = bound;
        changed = true;
      }
    }
    if (!changed) break;
    // Proof: deleting this refusal made `refuses a positive cycle in the
    // production backward relaxation` return undefined for the two-node
    // positive cycle; watched 2026-09-28 (13 pass / 1 fail).
    if (pass === starts.length - 1) throw new Error('positive-weight resource constraint cycle');
  }
}

/** Latest starts under weighted plan and selected resource constraints, including feasible cycles. */
function weightedLateTimes(
  graph: SliceGraph,
  edges: readonly WeightedEdge[],
  finish: number,
  placed: readonly Placed[],
  elsewhere: Elsewhere = NOWHERE,
): Late[] {
  const starts = graph.nodes.map((node) => finish - durationOf(node.slice));
  const capStart = (at: number): number => {
    const { slice } = graph.nodes[at];
    const bookings = slice.personId === null ? undefined : elsewhere.get(slice.personId);
    return bookings === undefined
      ? starts[at]
      : latestStartAroundElsewhere(bookings, starts[at], durationOf(slice));
  };
  const outgoing = graph.nodes.map((): WeightedEdge[] => []);
  const incoming = graph.nodes.map(() => 0);
  for (const edge of edges) {
    outgoing[edge.before].push(edge);
    incoming[edge.after] += 1;
  }
  const ready = incoming.flatMap((count, at) => (count === 0 ? [at] : []));
  const topology: number[] = [];
  let at = 0;
  while (at < ready.length) {
    const before = ready[at];
    topology.push(before);
    for (const edge of outgoing[before]) {
      incoming[edge.after] -= 1;
      if (incoming[edge.after] === 0) ready.push(edge.after);
    }
    at += 1;
  }
  if (topology.length === graph.nodes.length) {
    for (let at = topology.length - 1; at >= 0; at -= 1) {
      const before = topology[at];
      for (const edge of outgoing[before]) {
        starts[before] = Math.min(starts[before], starts[edge.after] - edge.weight);
      }
      // Proof: omitting this cap made `caps latest starts in the weighted pass
      // and passes the cap to a predecessor` report A's latestStart as 9 and
      // its predecessor's as 8 across Ana's [2,10) booking; watched 2026-10-05.
      starts[before] = capStart(before);
    }
  } else {
    // A weighted resource cycle can relax one start into a booking after an
    // earlier pass capped it. Each cap crosses at least one booking for that
    // slice, so the number of relevant intervals bounds convergence.
    const capLimit = graph.nodes.reduce((count, node) => {
      const personId = node.slice.personId;
      return count + (personId === null ? 0 : (elsewhere.get(personId)?.length ?? 0));
    }, 0);
    for (let pass = 0; pass <= capLimit; pass += 1) {
      relaxWeightedStarts(starts, edges);
      let capped = false;
      for (let taken = 0; taken < starts.length; taken += 1) {
        const next = capStart(taken);
        if (next < starts[taken]) {
          starts[taken] = next;
          capped = true;
        }
      }
      // Proof: stopping after the first cap made `propagates booking caps
      // around a feasible weighted resource cycle` return [10,14,10], not
      // [10,9,9]; watched 2026-10-05.
      if (!capped) break;
      // Proof: with the interval budget broken to zero, the same production
      // test threw here; removing this refusal returned [10,14,10] instead
      // of [10,9,9]; both faults watched 2026-10-05.
      if (pass === capLimit) throw new Error('backward booking bounds did not converge');
    }
  }
  return graph.nodes.map((node, at) => {
    const latestStart = withinDrift(starts[at], placed[at].start) ? placed[at].start : starts[at];
    return {
      latestStart,
      latestFinish:
        latestStart === placed[at].start ? placed[at].finish : latestStart + durationOf(node.slice),
    };
  });
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
 *
 * **Exported on 2026-09-03 for `durationOf`'s reason and no other.** The
 * solver's request builder needs each leaf's priority to derive its weight, and
 * the resolution above — most-specific override, not a floor, not a minimum
 * across ancestors — is precisely the rule a second implementation gets
 * backwards, because the floor rule is the one every neighbouring field uses.
 * Nothing else changes: same signature, same body, and Fast still calls it, so
 * the existing golden corpus is the proof that publishing it changed nothing.
 * The weight itself is the builder's business and is deliberately not computed
 * here — an absolute priority is never a weight.
 */
export function priorityByLeaf(rows: readonly PlannedRow[], index: TreeIndex): Map<string, number> {
  const parentOf = new Map(rows.map((row) => [row.id, row.parentId]));
  const ownPriority = new Map(rows.map((row) => [row.id, row.priority]));
  const found = new Map<string, number>();
  for (const leafId of index.leafIds) {
    for (let cursor: string | null | undefined = leafId; cursor !== null && cursor !== undefined;) {
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
  elsewhere: Elsewhere = NOWHERE,
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

    const personId = node.slice.personId;
    const bookings = personId === null ? undefined : elsewhere.get(personId);
    if (bookings !== undefined) {
      const duration = offsets[at + 1] - offsets[at];
      const latestStart = latestStartAroundElsewhere(bookings, finish - duration, duration);
      // Proof: removing this booking cap made `does not give a slice false
      // float across its next booking` report latest [9,10), float 9 for Ana's
      // [0,1) slice with a fixed booking [1,10); watched 2026-10-05.
      finish = latestStart + duration;
    }

    // The tight-path rule. Proof: with this branch removed, `reports a queue
    // that ends the project as critical, exactly` failed on `a`'s late start —
    // `Expected: 0 Received: -2.220446049250313e-16` — and, with that
    // assertion taken out of the way, on `b`'s: `Expected: 1.3333333333333333
    // Received: 1.333333333333333`; watched 2026-08-11.
    //
    // It is watched on the late starts and nowhere else. Under the same fault
    // the whole of `apps/wbs/be-01` was green before those two assertions existed:
    // the -2.2e-16 the rule exists to prevent is inside `slackOf`'s window, so
    // the `float` and `critical` assertions in that test — and every
    // differential — report the snapped answer either way. What the rule buys
    // is the number the engine hands out verbatim, not the colour.
    const early = placed[taken];
    if ((hasQueues || bookings !== undefined) && finish === early.finish) {
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
 * Which of one leaf's slices a dependency on it waits for — moved to
 * `slice-edges.ts` and re-exported from `libs/wbs/domain/domain`'s barrel, so this is the
 * only line about it left here.
 *
 * It moved with the edge join it decides. The solver request builder must reach
 * the same slice this pass reaches; a reach read in two places is two rules the
 * moment either is edited, and the join around it has already been got wrong
 * three ways (see that module's header).
 */
/**
 * Which algorithm produced a schedule — the identity a saved plan stores.
 *
 * **The rule that moves it: any change to {@link schedule}'s semantics bumps
 * this in the same commit.** A semantics change is any edit after which some
 * input produces a different {@link Schedule} — a new floor kind, a changed
 * tie-break, a different reservation order, a bound that clamps where it did
 * not. TASK-219's dual objective and TASK-240's deadline both qualify.
 * Refactors, renames, comments and performance work that leave every output
 * identical do not.
 *
 * Without that rule the column is a constant and the feature it exists for
 * fails silently. `saved_plan.scheduler_algorithm_id` is how a stored plan
 * answers "were these dates computed by the engine running now?"; a snapshot
 * taken before a semantics change and one taken after both read the **same**
 * id — whichever it is — a reader concludes "same algorithm, same input, so these
 * dates still hold", and the silent restatement this feature exists to prevent
 * happens anyway — now with a stored provenance field asserting it did not.
 *
 * It is deliberately **not** a hash of this file. A source hash moves on every
 * comment edit, so it would be bumped by rote until nobody read it, and it
 * cannot be written into a migration, a fixture or a review by hand.
 * `schedule-algorithm-id.test.ts` supplies the enforcement a bare constant
 * cannot: a behavioural digest over a fixed corpus, pinned beside this value,
 * so a semantics change lands as one red test naming both.
 *
 * Format is `<engine>-v<n>` with `n` a monotonically increasing integer. The
 * value is stored, so it is never reused for a different meaning.
 *
 * **`v2` because the deadline named above arrived** (tasks.md 5.1 and 5.2). Two
 * edits, one identity: ready slices are now ordered by minimum slack and
 * earliest deadline in front of the four priority tie-breaks, and every slice
 * publishes {@link ScheduledSlice.lateBy}. A plan stamped `v1` was computed by
 * an engine that could not have ordered a deadlined project the way this one
 * does and could not have reported a missed date at all, so re-reading its
 * dates as current is exactly the restatement this constant exists to refuse.
 *
 * **`v3` because an unestimated slice takes zero schedule time** (WBS 010.4.4,
 * `unestimated-steps-take-no-schedule-time`). A `v2` plan gave it the assumed
 * two workdays, so its successors, people and pools moved with a length nobody
 * estimated.
 *
 * **`v4` adds weighted SS/FF placement, replay and float.** FS-only graphs
 * still dispatch to the v3 passes and retain their measured digest.
 */
export const SCHEDULE_ALGORITHM_ID = 'slice-leveling-v4';

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
 * `slices` holds one entry per leaf and step, in **step order** — the order the
 * work runs in, so a leaf's `Dev` finishes before its `QA` starts. Every leaf
 * needs at least one, which is the adapter's job: a project holding no steps
 * gives each leaf one slice belonging to nobody, so the plan still schedules.
 * A slice nobody has estimated is zero days long and imposes no wait, but it is
 * still a node, which is how an unestimated `Dev` in front of an estimated `QA`
 * hands `QA` its work item's predecessors.
 *
 * Edges are taken as written and expanded here: one declared on a parent means
 * every leaf beneath its predecessor has its **reached slice** finish before
 * every leaf beneath its successor starts. Which slice that is comes from the
 * project's own `reach` and from nothing else — {@link reachedSliceOf} — so
 * this pass holds "all of 010 before any of 020" and "all of 010's first
 * estimated step before any of 020" with one line of difference between them.
 * `whole-item` is the default and Dany's 2026-08-29 call; `anchor-slice` is the
 * rule of 2026-08-11, which a project now asks for.
 *
 * On the **successor** side the edge lands on the first slice plain under
 * either reach, never the first estimated one and never the last: either would
 * leave an unestimated `Dev` with no predecessor at all and start the row
 * before the thing it waits for. The asymmetry is the point — see
 * `dep-waits-on-first-role`'s `design.md` D2. Under `anchor-slice` the
 * predecessor's slices behind its anchor are then free to run in parallel with
 * the successor; under `whole-item` there are none behind it. Edges still touch
 * only slices of one item's own chain and those chains are private,
 * forward-only paths, so a cycle is still a property of the leaf graph alone
 * and {@link hasCycle} still answers for it under either reach.
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
 *
 * **This lived in `apps/wbs/be-01/src/service/` until 2026-09-02**, held there by a
 * single `import type { WorkItem } from '../repository'` — a storage row read
 * for five of its fields. {@link PlannedRow} names those five instead, and
 * `WorkItem` satisfies it structurally, so nothing maps anything. The engine
 * now sits beside the rules it always shared: {@link snapWorkdays},
 * `ASSUMED_SLICE_WORKDAYS`, {@link DependencyReach},
 * {@link treeOrder}. It reads those four modules and {@link leafFloorsOf},
 * and no others — the fifth is the floor fold, moved out on 2026-09-03 so the
 * solver request builder reads the same walk rather than writing a second one.
 *
 * What keeps it that way is `@nx/enforce-module-boundaries`: `domain` is tagged
 * `runtime:isomorphic` and may depend only on other isomorphic libs, so a
 * storage type cannot come back without lint failing.
 *
 * Proof: `import { verifyToken } from '@wbs/auth'` (auth is `runtime:bun`)
 * watched failing on `A project tagged with "runtime:isomorphic" can only
 * depend on libs tagged with "runtime:isomorphic"`, and clean with it removed
 * (2026-09-02). The same rule also fires on a relative reach into
 * `'../../../apps/wbs/be-01/src/repository'`, but reports it as an ENOENT stack out
 * of its own autofix — be-01 is an app with no `src/index.ts` for the fixer to
 * rewrite against. Lint still exits non-zero there, so CI still blocks; only
 * the message is an upstream Nx bug rather than a sentence.
 */
export function schedule(
  rows: readonly PlannedRow[],
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
   * dependency declared on a parent does: "this step starts no earlier than
   * the 12th" means none of its work does. Each leaf takes the latest of its
   * own floor and every ancestor's — see the expansion below.
   */
  notBefore: ReadonlyMap<string, number> = new Map(),
  /**
   * How many slots each pool holds, by pool id — see {@link PoolSizes}.
   *
   * Empty by default, which is every plan whose teams nobody has sized and
   * therefore every plan that exists today: with no entry here no slice can
   * carry a pool, so nothing reserves anything and the placement is the one
   * this engine performed before capacity existed.
   */
  poolSizes: PoolSizes = new Map(),
  /**
   * How far into a predecessor a dependency reaches — the project's own
   * setting, read from `project.dep_reach` and never supplied by a client.
   *
   * Defaulted to `whole-item` because that is the column's default and the rule
   * every plan takes unless it asks otherwise; a call that omits it schedules
   * the way an unmigrated caller's project would. The arm it selects is
   * {@link reachedSliceOf}'s, and nothing downstream of the edge join knows
   * which one produced the answer.
   */
  reach: DependencyReach = 'whole-item',
  /**
   * The latest offset each work item may finish on, from a manual deadline.
   *
   * The **seventh** argument, which is the slot
   * {@link ScheduleInput} has always declared for it: this parameter exists so
   * the canonical hash tuple and the call it hashes are the same tuple, rather
   * than one describing an argument the other does not take.
   *
   * Empty by default, and **defaulted rather than optional on purpose**. An
   * empty map and an absent map mean the same thing here — no work item is
   * constrained — so there is nothing for a reader to distinguish and no
   * `undefined` arm to get wrong. That is the opposite of {@link pinnedStarts}
   * below, where the two states are different questions and the distinction is
   * load-bearing; the asymmetry is deliberate, not an oversight.
   *
   * A deadline expands down the tree the way a floor does — see
   * `leafDeadlinesOf`, which takes each leaf the **earliest** of its own
   * deadline and every ancestor's, where a floor takes the latest.
   *
   * **It moves no slice earlier, and it overrides no floor.** A deadline is a
   * statement about when work was *wanted*, not about when it may run. Slice
   * 5.1 reads it in exactly one place — the ready-slice comparator, which
   * decides who goes first where two slices are both eligible and want one
   * person — and a comparator cannot place anything: whichever slice is taken
   * first is still placed at the latest of its own floors. So a leaf whose
   * floor stands after its deadline starts at its floor and is reported late,
   * which is tasks.md 4.5, and a deadline that pulled work earlier would be a
   * wish the calendar granted, which is the one thing it must never be.
   *
   * With this map empty the comparator ties on both of its deadline rules and
   * the four rules behind them decide alone, so an undeadlined plan schedules
   * byte for byte as it did before this argument existed —
   * `fast-golden-corpus.test.ts` compares the whole corpus character by
   * character to say so.
   */
  deadlines: ReadonlyMap<string, number> = new Map(),
  /**
   * The typed dependencies — `openspec/changes/add-step-finish-start-dependencies`
   * — each an FS relationship between a whole work item, one step node, or one
   * step in every leaf under a parent. The eighth field of {@link ScheduleInput},
   * in its order.
   *
   * Resolved at the one graph seam, {@link resolveStepNodeGraph}, beside the
   * workflow chain and the legacy joins, so every resolved pair becomes an FS
   * edge into whichever node it names — a later step of the successor included —
   * and the solver request builder derives the same edges.
   *
   * Empty by default for {@link deadlines}' reason: no typed dependency and an
   * absent list mean the same plan, and every plan that predates typed
   * dependencies is scheduled byte for byte as before.
   */
  typed: readonly TypedDependency[] = [],
  /**
   * Task 4.9's `materialiseOptimized`: a start per slice key, or Fast's own.
   *
   * **This argument is the whole of the optimized materialiser.** Everything
   * that produces a {@link ScheduledSlice} — the durations, the tiling, the
   * capacity explanation, the resource edges, the backward pass, the work-item
   * projections and both wait counters — is the code below, run once, and the
   * offsets map an optimizer returns is never persisted or handed back as a
   * schedule. A second implementation of this function is the failure this
   * design exists to prevent: five of its rules are subtle enough that a
   * transcription gets one wrong (seed 260's tiling drift, the `finish <= start`
   * filter, the referent's placement-order tie-break), and the differential that
   * caught each of them once does not run over the optimized path.
   *
   * A key absent from the map is a refusal rather than a fallback: a partial
   * optimized schedule is two engines' answers interleaved, and no reader could
   * tell which slice came from which.
   */
  pinnedStarts?: ReadonlyMap<string, number>,
  /**
   * Every person's bookings in the projects that outrank this one, on this
   * project's workday offsets — the ninth field of {@link ScheduleInput}, and
   * the tenth argument here, after `pinnedStarts`, so every existing caller's
   * positions stand;
   * `share-people-across-projects` slice 4, ADR 0034.
   *
   * No slice of a person is placed across one of their bookings, and a slice
   * whose start a booking set reads `boundBy: 'elsewhere'` with the holder.
   * Resources only: the critical-path pass the leveller ranks by is the plan
   * with nobody in it, and nobody is booked there.
   *
   * **Empty by default, and empty places byte for byte as before**: the lookup
   * that finds a person's bookings misses, and the pass takes the path it
   * always took. `schedule-elsewhere.test.ts` holds the whole golden corpus to
   * that, argument supplied and not.
   *
   * @throws for a malformed map (see {@link checkElsewhere}), or an invalid
   * pinned start (see {@link ScheduleInvalidOptimizedStartError}).
   */
  elsewhere: Elsewhere = new Map(),
): Schedule {
  checkElsewhere(elsewhere);

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

  // Floors expanded down the tree the same way the edges are — see
  // {@link leafFloorsOf}, which holds the rule and the 2026-08-10 proof.
  //
  // The walk lives there and not here because the solver request builder needs
  // the identical numbers: every wire slice carries `notBeforeUnits` already
  // folded, so Python never receives the tree. Two walks would be two rules the
  // moment either is edited, and this is the exact fold that was already wrong
  // once for a month.
  const leafFloors = leafFloorsOf(notBefore, index);

  /**
   * The nodes, in the order they run: every leaf's slices in step order, and
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
        key: sliceKey(slice.workItemId, slice.stepId),
        slice,
        item,
        at,
        offsets,
        notBefore: at === 0 ? (leafFloors.get(leafId) ?? 0) : 0,
        predecessors: [],
        successors: [],
      });
    });
    // Recorded only if the group put a node in. It always does — a group exists
    // because a slice created it — and the one thing that could make it not is
    // the fault `firstNodeOf` below names, which is why nothing is written for
    // a leaf with no node rather than a dangling index.
    if (nodes.length > first) firstNode.set(leafId, first);
  }

  const nodeSlices = nodes.map((node) => node.slice);
  const workItemsWithDuration = workItemIdsWithPositiveDuration(
    nodeSlices,
    nodeSlices.map(durationOf),
  );

  /**
   * Where a leaf's slices begin among the nodes.
   *
   * Every edge {@link resolveStepNodeGraph} returns names its ends as a leaf and a
   * position within that leaf's own group, so this is the offset that turns one
   * into a node index. It is the leaf's first node because the groups were
   * pushed in `leafIds` order and contiguously.
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

  // The slice graph's edges, derived once in {@link resolveStepNodeGraph} rather
  // than built here: each leaf's own step chain, then the predecessor's
  // **reached** slice to the successor's **first**. Both rules moved with the
  // reach they depend on, because the solver request builder must derive the
  // very same graph and a second copy is the copy that gets the join backwards
  // — that module's header carries the three watched reds that fix each half.
  //
  // Pushed onto the two nodes rather than rebuilt into a map: the adjacency is
  // written once per edge, and the order the edges arrive in is the order these
  // arrays are walked in later.
  // Proof: the typed list replaced by `[]` at this call made four of the five
  // `schedule-typed-dependency.test.ts` cases fail — `holds a later successor
  // step` on `Expected: 3, Received: 1` among them; watched 2026-09-27.
  const resolvedEdges = resolveStepNodeGraph(
    leafIds,
    (id) => slicesOf(id).slices,
    leafEdges,
    reach,
    { dependencies: typed, leavesUnder: leavesUnderOf(index) },
  ).edges;
  const weightedEdges: WeightedEdge[] = [];
  for (const { predecessor, successor, type, provenance } of resolvedEdges) {
    const before = firstNodeOf(predecessor.leafId) + predecessor.at;
    const after = firstNodeOf(successor.leafId) + successor.at;
    nodes[before].successors.push(after);
    nodes[after].predecessors.push(before);
    const beforeDuration = durationOf(nodes[before].slice);
    const afterDuration = durationOf(nodes[after].slice);
    weightedEdges.push({
      before,
      after,
      type,
      provenance,
      // Proof: clamping FF to zero made `keeps a negative FF weight in latest
      // dates and critical path` fail with B at day 4 instead of day 0;
      // watched 2026-09-28.
      weight: type === 'FS' ? beforeDuration : type === 'SS' ? 0 : beforeDuration - afterDuration,
    });
  }
  const graph: SliceGraph = { nodes, items };
  const isWeighted = resolvedEdges.some((edge) => edge.type !== 'FS');

  // The same plan with nobody's calendar in it — the critical path, computed by
  // the pass above with the people taken out rather than by a second copy of
  // it. Its start and float are what the leveller ranks by, and its numbers are
  // exactly what this engine answers when nobody is assigned. The order it is
  // computed in is the order the nodes were built in, which is all a plan with
  // no queues in it needs.
  const unleveled = isWeighted
    ? placeWeightedSlices(
        graph,
        weightedEdges,
        (left, right) => left < right,
        false,
        poolSizes,
        NOWHERE,
      )
    : placeSlices(graph, (left, right) => left < right, false, poolSizes, NOWHERE);
  const criticalPath = isWeighted
    ? weightedLateTimes(
        graph,
        weightedEdges,
        Math.max(0, ...unleveled.placed.map((each) => each.finish)),
        unleveled.placed,
      )
    : lateTimes(
        graph,
        unleveled.order,
        nodes.map((node) => node.successors),
        Math.max(0, ...unleveled.placed.map((each) => each.finish)),
        unleveled.placed,
        // The critical path is a ranking, not an answer, and it is the plan with
        // nobody in it by construction — there are no queues here to be tight about.
        false,
      );

  const places = treeOrder(rows);
  const leafPriorities = priorityByLeaf(rows, index);
  // Deadlines expanded down the tree by the same walk the floors take and the
  // solver wire takes — see {@link leafDeadlinesOf}, which holds the rule that
  // the *earliest* date binds where a floor takes the latest. Read here rather
  // than re-folded, so Fast's ordering and `deadlineUnits` on the wire cannot
  // disagree about which day a leaf owes.
  const leafDeadlines = leafDeadlinesOf(deadlines, index);
  const priorityOf: SlicePriority[] = nodes.map((node, at) => {
    // Both slices of one work item carry its deadline, exactly as they carry its
    // priority: the date is a fact about the work, and a step that inherited no
    // deadline would be a step the ordering stops hurrying half way through.
    const deadline = leafDeadlines.get(node.slice.workItemId) ?? Infinity;
    return {
      // Both slices of one work item carry its priority, which is what keeps a priority a
      // fact about the work rather than about one of its steps.
      priority: leafPriorities.get(node.slice.workItemId) ?? Infinity,
      deadline,
      // Measured against the placement with nobody's calendar in it, which is
      // the same pass `start` and `float` already read. Slack against the
      // *leveled* placement would be circular: the leveler is the thing this
      // number is about to order.
      slack: deadline - lastWorkdayOf(unleveled.placed[at].start, unleveled.placed[at].finish),
      start: unleveled.placed[at].start,
      float: criticalPath[at].latestStart - unleveled.placed[at].start,
      // `treeOrder` covers every row or throws, so the fallback is
      // unreachable; it is a default rather than a throw because this is the
      // third of four tie-breaks and one shared place only ever reorders
      // slices that are already equal on time.
      treePlace: places.get(node.slice.workItemId) ?? 0,
      at: node.at,
      key: node.key,
    };
  });
  /**
   * The priority rule, in full: what is closest to running out of time, then
   * what is due soonest, then what somebody said matters most, then what the
   * critical path needs first, then what has least room to move, then the
   * plan's own order.
   *
   * **The two deadline rules are in front, and the four behind them are
   * untouched** (tasks.md 5.1). A plan that carries no deadlines ties on both
   * of the new comparisons — every slice's slack and deadline are `Infinity` —
   * so the rule below it decides alone and the placement is byte for byte the
   * one this engine produced before deadlines existed. That is not an argument;
   * it is what `fast-golden-corpus.test.ts` compares character by character.
   *
   * **Why a deadline outranks a priority rather than tying into it.** A
   * priority is a standing opinion about which work is worth more; a deadline
   * is a date that stops being satisfiable. Asking the opinion first would let
   * a p1 with three weeks of room take the person a p3 needed on Thursday, and
   * the plan would come back with a missed date whose reason was a ranking
   * nobody thought applied to it. The reverse ordering cannot make that
   * mistake, and it costs the priority rule nothing on the plans that have no
   * deadlines — which today is all of them.
   *
   * The last three are what make it deterministic rather than merely correct.
   * Two slices that tie on time are separated by their work item's number, then
   * by their place in the step order, and finally by their slice key — and it
   * is those **last two together** that cannot tie, neither of them alone. The
   * step index read as though it were enough and is not: two one-slice work
   * items both sit at 0, and a `frozenNumber` is reported verbatim, so a pair
   * could tie on all five and the heap's insertion order decided between them.
   * See {@link SlicePriority.key} for why the key does not close it single
   * handed either, and `schedules the same plan from either row order when two
   * slices tie on every key`, which reversed the rows and got the other
   * answer; watched 2026-09-06.
   *
   * **This rule decides an order, never a date.** Whichever slice is taken
   * first is still placed at the latest of its own floors, so a priority cannot
   * put a work item in front of its dependencies, its floor or its earlier
   * steps — it decides who goes first where the schedule has a choice, which is
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
    if (first.slack !== second.slack) return first.slack < second.slack;
    if (first.deadline !== second.deadline) return first.deadline < second.deadline;
    if (first.priority !== second.priority) return first.priority < second.priority;
    if (first.start !== second.start) return first.start < second.start;
    if (first.float !== second.float) return first.float < second.float;
    if (first.treePlace !== second.treePlace) return first.treePlace < second.treePlace;
    if (first.at !== second.at) return first.at < second.at;
    return first.key < second.key;
  };

  /**
   * The optimizer's starts, resolved onto node indices — or `undefined`, which
   * is Fast.
   *
   * Resolved here and not inside the pass because the pass knows nothing about
   * slice keys, and because the refusal belongs at the boundary where the map
   * arrived: a key the plan has no slice for, or a slice the map has no key
   * for, is a solver answer to a different question.
   */
  const pinnedByNode =
    pinnedStarts === undefined
      ? undefined
      : nodes.map((node) => {
          const at = pinnedStarts.get(node.key);
          if (at === undefined) {
            throw new ScheduleInvalidOptimizedStartError(node.key, 'no start was returned for it');
          }
          return at;
        });
  /**
   * Task 4.10b's one order, twice over.
   *
   * Ledger replay must be chronological — a person's queue edge points at
   * whoever they were doing **before**, and a pool's blocking set is whatever
   * had already reserved — while the order handed to {@link lateTimes} must be
   * topological, and chronological order is not topological on legal data: an
   * explicit `days: 0` predecessor and its successor can share a start, and an
   * id tie-break can order them backwards. Draining the **eligible set** in
   * ascending `(start, canonical slice order)` is both at once, because the
   * eligible set is Kahn's ready set and admits a node only once its plan
   * predecessors are placed. So the hazard cannot arise here rather than being
   * detected: precedence wins over the comparator by construction.
   */
  const levelOrder =
    pinnedByNode === undefined
      ? goesFirst
      : (left: number, right: number): boolean =>
          pinnedByNode[left] === pinnedByNode[right]
            ? left < right
            : pinnedByNode[left] < pinnedByNode[right];

  const leveled = isWeighted
    ? placeWeightedSlices(
        graph,
        weightedEdges,
        levelOrder,
        true,
        poolSizes,
        elsewhere,
        pinnedByNode,
      )
    : placeSlices(graph, levelOrder, true, poolSizes, elsewhere, pinnedByNode);
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
  const late = isWeighted
    ? weightedLateTimes(
        graph,
        [...weightedEdges, ...leveled.resourceEdges],
        projectFinish,
        leveled.placed,
        elsewhere,
      )
    : lateTimes(
        graph,
        leveled.order,
        augmented,
        projectFinish,
        leveled.placed,
        queues.some((next) => next.length > 0),
        elsewhere,
      );

  const scheduledSlices = new Map<string, ScheduledSlice>();
  const waiting = new Set<string>();
  const waitingOnSlots = new Set<string>();
  const waitingAway = new Set<string>();
  const projectionFinishes = Array.from({ length: items }, () => 0);
  nodes.forEach((node, at) => {
    projectionFinishes[node.item] = Math.max(
      projectionFinishes[node.item],
      leveled.placed[at].finish,
    );
  });
  nodes.forEach((node, at) => {
    const { slice } = node;
    const placed = leveled.placed[at];
    const { latestStart, latestFinish } = late[at];
    const slack = slackOf(latestStart, placed.start);
    // The same folded map the ordering read, so the row's place in the queue
    // and the number printed beside it answer to one date. Read against the
    // *leveled* placement — where the slice actually landed — rather than
    // against the deadline-free pass `slack` is measured on: slack asks how
    // much room the work had, and this asks what day it will really be done.
    const deadlineOffset = leafDeadlines.get(slice.workItemId);
    // `workdaysLateBy` answers 0 for "met it", and the field says `null` — one
    // narrowing here rather than a truthiness check in every reader.
    // The deadline constrains the work-item projection, not every zero step as
    // a fresh point. Leading, interior and trailing zero steps of a positive
    // item therefore read the item's final finish. Only a genuinely all-zero
    // work item uses the point's own start so the day on which it stands counts.
    // Proof: replacing a positive item's final finish with each zero step's own
    // `placed.finish` made `reads every zero step from the positive work-item
    // projection but all-zero items as points` report the leading step on time
    // instead of late by 1; watched on h2puni 2026-09-13.
    const hasPositiveDuration = workItemsWithDuration.has(slice.workItemId);
    const deadlineStart = hasPositiveDuration ? WORK_ITEM_PROJECTION_START : placed.start;
    const deadlineFinish =
      hasPositiveDuration && durationOf(slice) === 0
        ? projectionFinishes[node.item]
        : placed.finish;
    const missed =
      deadlineOffset === undefined
        ? 0
        : workdaysLateBy(deadlineStart, deadlineFinish, deadlineOffset);
    if (placed.boundBy === 'person') waiting.add(slice.workItemId);
    // Beside the person's count, never folded into it: "waiting for a person"
    // and "waiting for a slot" are different sentences, and `boundBy` names
    // exactly one of them for any slice.
    if (placed.boundBy === 'capacity') waitingOnSlots.add(slice.workItemId);
    if (placed.boundBy === 'elsewhere') waitingAway.add(slice.workItemId);
    scheduledSlices.set(node.key, {
      workItemId: slice.workItemId,
      stepId: slice.stepId,
      // What the block occupied, which is its effort divided among the people
      // on it. The same number as the effort at width 1, which is every slice
      // of every plan that sets no capacity field.
      duration: (slice.days ?? 0) / slice.width,
      effort: slice.days ?? 0,
      width: slice.width,
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
      capacityPredecessorIds: placed.capacityPredecessors.map((blocker) => nodes[blocker].key),
      capacityTeamId: placed.capacityTeamId,
      ...(placed.elsewhereHolder === null ? {} : { elsewhereHolder: placed.elsewhereHolder }),
      lateBy: missed === 0 ? null : missed,
    });
  });

  const scheduleOf = (key: string): ScheduledSlice => {
    const found = scheduledSlices.get(key);
    if (found === undefined) throw new Error(`no schedule for slice ${key}`);
    return found;
  };
  const plan: Schedule = {
    slices: scheduledSlices,
    workItems: projectOntoWorkItems(rows, index, slicesOf, scheduleOf),
    waitingForPerson: waiting.size,
    waitingForCapacity: waitingOnSlots.size,
    // Proof: present on every plan made `keeps every golden corpus case byte
    // for byte, the map supplied empty` (`schedule-elsewhere.test.ts`) fail on
    // the extra key; watched 2026-09-29.
    ...(elsewhere.size === 0 ? {} : { waitingElsewhere: waitingAway.size }),
    eventsVisited: leveled.eventsVisited,
  };
  validateRealBoundaries(
    { rows, edges, slices, notBefore, poolSizes, reach, deadlines, typed },
    plan,
  );
  return plan;
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
 * A work item stops tiling when a person pulled it apart — or, under the
 * `anchor-slice` reach, whenever a successor's edge leaves a middle slice and
 * splits the late times with nobody assigned (`dep-waits-on-first-role`'s
 * design.md D5: on that reach the non-tiling arm is ordinary, not rare). Under
 * `whole-item` the edge leaves the last slice, so nothing behind it is split
 * and the arm is back to being about people. Then the endpoints are not the answer at all: a row whose `QA` was held back until its assignee
 * came free has a critical `QA` and a slack `Dev`, and the difference of its
 * ends would report the slack of the `Dev` and no red.
 *
 * A parent spans the leaves beneath it, by the same rule and the same code as
 * before there were slices at all: effort and span are different numbers, and
 * two independent children of 3 and 4 days are 7 days of work in a 4-day branch.
 */
function projectOntoWorkItems(
  rows: readonly PlannedRow[],
  index: TreeIndex,
  slicesOf: (workItemId: string) => WorkItemSlices,
  scheduleOf: (key: string) => ScheduledSlice,
): Map<string, Scheduled> {
  const isLeaf = new Set(index.leafIds);
  const projected = new Map<string, Scheduled>();
  for (const leafId of index.leafIds) {
    const own = slicesOf(leafId).slices.map((slice) =>
      scheduleOf(sliceKey(slice.workItemId, slice.stepId)),
    );
    // One pass rather than six `own.map(...)` allocations and six spreads. The
    // spread also has a cliff: `Math.min(...xs)` throws `RangeError: Maximum
    // call stack size exceeded.` past somewhere between 500,000 and 1,000,000
    // arguments in this runtime (measured 2026-09-02). A work item has a
    // handful of slices so that end was never in reach here — it is the parent
    // loop below, over every leaf in the plan, where the number could grow.
    let start = Infinity;
    let late = Infinity;
    for (const s of own) {
      if (s.earliestStart < start) start = s.earliestStart;
      if (s.latestStart < late) late = s.latestStart;
    }
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
    // The aggregated side — a row pulled apart by a person or by an
    // anchor-split of its late times — needs no
    // {@link slackOf} of its own: every slice's float is snapped before it gets
    // here, and the least of snapped numbers is one of them. Its `critical` is
    // left as it was, read off the slices rather than off the aggregate, which
    // is that branch's own rule and not this change's to move.
    let effort = 0;
    let leastFloat = Infinity;
    let lastEarly = -Infinity;
    let lastLate = -Infinity;
    let anyEstimated = false;
    let anyCritical = false;
    for (const s of own) {
      effort += s.duration;
      if (s.float < leastFloat) leastFloat = s.float;
      if (s.earliestFinish > lastEarly) lastEarly = s.earliestFinish;
      if (s.latestFinish > lastLate) lastLate = s.latestFinish;
      if (s.estimated) anyEstimated = true;
      if (s.critical) anyCritical = true;
    }
    const slack = tiles ? slackOf(late, start) : leastFloat;
    projected.set(leafId, {
      duration: effort,
      estimated: anyEstimated,
      earliestStart: start,
      earliestFinish: lastEarly,
      latestStart: late,
      latestFinish: lastLate,
      float: slack,
      critical: tiles ? slack === 0 : anyCritical,
    });
  }

  // A parent's span, not its total. Its rolled-up effort is a different number
  // and is reported separately.
  for (const row of rows) {
    if (isLeaf.has(row.id)) continue;
    // One pass over the leaves beneath, rather than eight `beneath.map(...)`
    // allocations feeding eight spreads. The spread is also the only thing here
    // with a cliff: `Math.min(...xs)` throws `RangeError: Maximum call stack
    // size exceeded.` past somewhere between 500,000 and 1,000,000 arguments in
    // this runtime, and `beneath` for a root parent is every leaf in the plan.
    // Nothing this tool plans comes near half a million leaves under one row, so
    // that was never a live defect — but a loop has no such number at all, and
    // it is what made the flat shape below twice as slow as the nested one.
    let anyLeaf = false;
    let spanStart = Infinity;
    let spanFinish = 0;
    let latestStart = Infinity;
    let latestFinish = 0;
    let leastFloat = Infinity;
    let anyEstimated = false;
    let anyCritical = false;
    // Three invariants of {@link indexTree}'s output, thrown rather than
    // defaulted. `leafIds` is every row with no children, so a row reaching
    // here has children; `walk` returns `[id]` for a childless id and
    // `flatMap`s its children otherwise, so in a finite tree every non-leaf
    // resolves to at least one leaf, every one of those is a `leafId`, and the
    // loop above placed all of them. Reading a missing one as an empty span at
    // day zero — which is what `?? []`, a `continue` and a `Math.min(..., Infinity)`
    // sentinel used to do between them — would draw a silently wrong bar rather
    // than say the index is broken.
    //
    // Proof, all three injected into {@link indexTree} after its walk and
    // watched in `schedule-shapes.test.ts` (2026-09-02): deleting every
    // top-level row's entry failed on `no leaves indexed under P`; appending a
    // `'ghost-leaf'` to every non-empty entry failed on `leaf ghost-leaf under
    // P was never placed`; and emptying a top-level row's entry failed on `P is
    // not a leaf and has no leaves under it`. Under the defaults these three
    // replaced, all three faults were silent.
    const under = index.leavesUnder.get(row.id);
    if (under === undefined) throw new Error(`no leaves indexed under ${row.id}`);
    for (const leafId of under) {
      const beneath = projected.get(leafId);
      if (beneath === undefined) throw new Error(`leaf ${leafId} under ${row.id} was never placed`);
      anyLeaf = true;
      if (beneath.earliestStart < spanStart) spanStart = beneath.earliestStart;
      // Proof: `spanFinish` summed instead of maxed and two `parents` tests
      // failed, reporting a 4-day branch as 7 days long because that is its
      // effort.
      if (beneath.earliestFinish > spanFinish) spanFinish = beneath.earliestFinish;
      if (beneath.latestStart < latestStart) latestStart = beneath.latestStart;
      if (beneath.latestFinish > latestFinish) latestFinish = beneath.latestFinish;
      if (beneath.float < leastFloat) leastFloat = beneath.float;
      if (beneath.estimated) anyEstimated = true;
      if (beneath.critical) anyCritical = true;
    }
    if (!anyLeaf) throw new Error(`${row.id} is not a leaf and has no leaves under it`);
    projected.set(row.id, {
      duration: 0,
      estimated: anyEstimated,
      earliestStart: spanStart,
      earliestFinish: spanFinish,
      latestStart: Math.min(latestStart, spanStart),
      latestFinish,
      float: leastFloat,
      // A branch is critical when anything inside it is: shortening that leaf
      // shortens the project, and the branch is where a reader looks first.
      critical: anyCritical,
    });
  }

  return projected;
}
