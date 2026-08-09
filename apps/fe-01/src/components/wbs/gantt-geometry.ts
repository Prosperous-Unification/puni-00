/**
 * The payload promised something the drawing needs and did not keep it.
 *
 * Malformed trusted data, which is an invariant failure and not a state to
 * render: a `resourcePredecessorId` naming no slice in the same payload, a
 * person floor with nobody to name, a slice under a role the plan does not
 * list. be-01 computes all four facts in one pass from one graph, so a
 * mismatch means the wire lost something between them — drawing a chart with
 * a silently missing link would hide exactly the fact the panel exists to
 * show. The panel lets this reach the error boundary.
 *
 * Not thrown for a mark whose row is off screen: a collapsed branch or a
 * search is a modeled absence, and the mark is skipped. See
 * {@link layOutGantt}.
 */
export class GanttDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GanttDataError';
  }
}

/**
 * The one thing a slice's start is set by, named — the wire's `boundBy`.
 *
 * Structurally the same union as be-01's `ScheduleFloor` and deliberately
 * declared again here: this module knows nothing about fetching, and the
 * geometry's tests build slices by hand.
 */
export type BindingFloor = 'projectStart' | 'predecessor' | 'roleOrder' | 'notBefore' | 'person';

/**
 * A row of the plan as the panel draws it.
 *
 * The shown rows only — the panel passes the same list its renderer draws, so
 * mirroring the tree is identity rather than synchronisation. `schedule` is
 * the work item's projection and carries no more of it than the drawing
 * reads: a summary bracket spans it, and a dependency arrow leaves one row's
 * finish for another's start.
 */
export interface GanttRow {
  id: string;
  name: string;
  /** How deep in the tree, 0 at the root. The label's indent. */
  depth: number;
  /** True when this row's own slices are drawn as bars; false when it draws a summary bracket. */
  leaf: boolean;
  schedule: { earliestStart: number; earliestFinish: number };
  /** The workday its manual start date holds at, or null when it has none. */
  notBeforeOffset: number | null;
}

/**
 * One scheduled slice as it arrives on the wire.
 *
 * `id` and `resourcePredecessorId` are the engine's own keys and are opaque:
 * looked up, never taken apart. `duration` rides alongside
 * `earliestStart`/`earliestFinish` because a bar is drawn from a start and a
 * width, and recomputing the width as a subtraction is how a rounding creeps
 * into numbers the panel promises to draw verbatim.
 */
export interface GanttSlice {
  id: string;
  workItemId: string;
  roleId: string | null;
  personId: string | null;
  duration: number;
  estimated: boolean;
  earliestStart: number;
  earliestFinish: number;
  critical: boolean;
  boundBy: BindingFloor;
  /** The slice this one's assignee was busy with, or null when nobody waited. */
  resourcePredecessorId: string | null;
}

/** A stored dependency between two work items, either end of which may be a parent. */
export interface DependencyEdge {
  predecessorId: string;
  successorId: string;
}

/** A role of the plan: its id, its name for the words on a bar, and its place in the list. */
export interface GanttRole {
  id: string;
  name: string;
}

/**
 * Everything the panel knows, in the units the engine computed it in.
 *
 * `roles` is a list rather than a lookup because its **order** is load-bearing
 * — a leaf's bars sit in role order, which is the order the plan lists its
 * roles in. `personNames` is a lookup because nothing about the drawing
 * depends on the order people are in.
 */
export interface GanttPlan {
  rows: readonly GanttRow[];
  slices: readonly GanttSlice[];
  dependencies: readonly DependencyEdge[];
  roles: readonly GanttRole[];
  personNames: ReadonlyMap<string, string>;
}

/** A row's label: what the sticky-left column prints, and which row of the chart it belongs to. */
export interface GanttRowLabel {
  id: string;
  name: string;
  depth: number;
  rowIndex: number;
}

/**
 * One slice drawn: where it starts and how wide it is on the workday axis,
 * which row it is on, and why it starts there.
 *
 * `start`, `finish` and `duration` are workdays and `rowIndex` is a row —
 * never pixels. The panel's SVG user space is those two units, so these
 * numbers reach `x`, `width` and `y` unconverted.
 */
export interface GanttBar {
  sliceId: string;
  rowIndex: number;
  start: number;
  finish: number;
  duration: number;
  critical: boolean;
  /** False when nobody has estimated this slice, which is not the same fact as zero days. */
  estimated: boolean;
  /** The binding floor in words — the sentence the bar shows on hover. */
  floorWords: string;
}

/**
 * A parent drawn: the span of its projection, never the sum of what is under
 * it. Two independent children of 3 and 4 days are 7 days of work in a 4-day
 * branch, and this is the branch.
 */
export interface GanttSummaryBracket {
  rowId: string;
  rowIndex: number;
  start: number;
  finish: number;
}

/** A stored dependency drawn: the predecessor's projection finish to the successor's start. */
export interface GanttDependencyArrow {
  predecessorId: string;
  successorId: string;
  fromRowIndex: number;
  fromFinish: number;
  toRowIndex: number;
  toStart: number;
}

/**
 * One person's hand-off drawn: the slice they were busy with, to the slice
 * that waited for them. Never a dependency — the two are drawn unalike
 * because they are different facts.
 */
export interface GanttPersonLink {
  fromSliceId: string;
  fromRowIndex: number;
  fromFinish: number;
  toSliceId: string;
  toRowIndex: number;
  toStart: number;
}

/** Where a row's manual start date holds, on the workday axis. */
export interface GanttNotBeforeFlag {
  rowIndex: number;
  offset: number;
}

/**
 * The whole chart as plain data: workdays on x, row indices on y, and not one
 * pixel anywhere.
 */
export interface GanttGeometry {
  labels: GanttRowLabel[];
  bars: GanttBar[];
  brackets: GanttSummaryBracket[];
  arrows: GanttDependencyArrow[];
  personLinks: GanttPersonLink[];
  notBeforeFlags: GanttNotBeforeFlag[];
  /**
   * How far the schedule reaches, in workdays: the latest finish of anything
   * drawn. At least 1, so an empty plan still has a viewBox with a width.
   */
  horizon: number;
}

const FLOOR_SENTENCE: Record<Exclude<BindingFloor, 'person'>, string> = {
  projectStart: 'Starts with the project',
  predecessor: 'Waits for a dependency to finish',
  roleOrder: 'Waits for an earlier role on this item',
  notBefore: 'Held by its start-no-earlier-than date',
};

/**
 * The sentence a person-floored bar shows: who was in the way, and what they
 * were finishing.
 *
 * The predecessor slice is always in the payload — {@link layOutGantt}
 * refuses one that is not — but its **row** may be collapsed away or narrowed
 * off by a search, and then there is no name to print. That absence is
 * modeled and says so in the words rather than being papered over with the
 * person's name alone.
 *
 * @throws GanttDataError when the person floor names nobody, or names
 * somebody the plan does not.
 */
function personFloorWords(
  slice: GanttSlice,
  predecessor: GanttSlice,
  rowNames: ReadonlyMap<string, string>,
  roleNames: ReadonlyMap<string, string>,
  personNames: ReadonlyMap<string, string>,
): string {
  const person = slice.personId === null ? undefined : personNames.get(slice.personId);
  // Proof: this throw replaced by `?? 'somebody'`, `throws when a person floor
  // names somebody the plan does not` failed; watched 2026-08-09.
  if (person === undefined) {
    throw new GanttDataError(
      `slice ${slice.id} is floored by a person the plan does not name ` +
        `(personId ${slice.personId ?? 'null'})`,
    );
  }
  const workItemName = rowNames.get(predecessor.workItemId);
  if (workItemName === undefined) return `${person} — after work that is not shown`;
  const roleName = predecessor.roleId === null ? undefined : roleNames.get(predecessor.roleId);
  return roleName === undefined
    ? `${person} — after ${workItemName}`
    : `${person} — after ${workItemName} (${roleName})`;
}

/**
 * Every mark the Gantt panel draws, from the rows it is showing, the payload's
 * slices and the plan's dependencies — in workdays on x and row indices on y.
 *
 * Pure: no DOM, no React, no fetching, and no schedule math. Engine numbers
 * pass through verbatim, fractions included, because the panel's SVG user
 * space *is* the workday axis and any arithmetic here is a rounding waiting to
 * disagree with the Start/End columns.
 *
 * What is missing and what is broken are different answers. A slice whose
 * work item is not among {@link GanttPlan.rows} is on a collapsed branch or
 * behind a search: its bar is skipped, and so are the person link and the
 * dependency arrow that would have ended on it. A `resourcePredecessorId`
 * that names no slice **in the payload** is a broken promise and throws —
 * the row it belongs to may well be on screen, and a chart quietly short one
 * hand-off is the chart lying about who is waiting for whom.
 *
 * @throws GanttDataError on a dangling `resourcePredecessorId`, a
 * person-floored slice with no resource predecessor or an unnamed person, and
 * a slice under a role the plan does not list.
 */
export function layOutGantt(plan: GanttPlan): GanttGeometry {
  const rowNames = new Map(plan.rows.map((row) => [row.id, row.name]));
  const placedRows = new Map(plan.rows.map((row, rowIndex) => [row.id, { row, rowIndex }]));
  const sliceById = new Map(plan.slices.map((slice) => [slice.id, slice]));
  const rolePlaces = new Map(plan.roles.map((role, place) => [role.id, place]));
  const roleNames = new Map(plan.roles.map((role) => [role.id, role.name]));

  const predecessorOf = new Map<string, GanttSlice>();
  for (const slice of plan.slices) {
    if (slice.resourcePredecessorId === null) continue;
    const predecessor = sliceById.get(slice.resourcePredecessorId);
    // Proof: this throw replaced by a `continue`, so a dangling id was skipped
    // exactly as a hidden one is — `throws when a resource predecessor names no
    // slice in the payload` and `throws on a dangling resource predecessor even
    // where no bar would be drawn` both failed; watched 2026-08-09.
    if (predecessor === undefined) {
      throw new GanttDataError(
        `slice ${slice.id} names resource predecessor ${slice.resourcePredecessorId}, ` +
          `which is not a slice in this payload`,
      );
    }
    predecessorOf.set(slice.id, predecessor);
  }

  const labels: GanttRowLabel[] = plan.rows.map((row, rowIndex) => ({
    id: row.id,
    name: row.name,
    depth: row.depth,
    rowIndex,
  }));

  const slicesByWorkItem = new Map<string, GanttSlice[]>();
  for (const slice of plan.slices) {
    const own = slicesByWorkItem.get(slice.workItemId);
    if (own === undefined) slicesByWorkItem.set(slice.workItemId, [slice]);
    else own.push(slice);
  }

  const bars: GanttBar[] = [];
  const barBySliceId = new Map<string, GanttBar>();
  const brackets: GanttSummaryBracket[] = [];
  const notBeforeFlags: GanttNotBeforeFlag[] = [];

  plan.rows.forEach((row, rowIndex) => {
    if (row.notBeforeOffset !== null) {
      notBeforeFlags.push({ rowIndex, offset: row.notBeforeOffset });
    }
    if (!row.leaf) {
      // The projection, taken whole: a parent's bracket is a span, and be-01
      // already computed it as one. Nothing here adds up what is underneath.
      //
      // Proof: this replaced by a walk over the rows beneath this one summing
      // their slices' durations onto `earliestStart` — `is a span and not the
      // sum of what is under it` failed with 7 where the branch runs 0→6, and
      // `spans a parent over staggered children` and `reaches as far as the
      // latest finish of anything drawn` with it; watched 2026-08-09.
      brackets.push({
        rowId: row.id,
        rowIndex,
        start: row.schedule.earliestStart,
        finish: row.schedule.earliestFinish,
      });
      return;
    }
    const own = slicesByWorkItem.get(row.id) ?? [];
    for (const slice of inRoleOrder(own, rolePlaces)) {
      const predecessor = predecessorOf.get(slice.id);
      const bar: GanttBar = {
        sliceId: slice.id,
        rowIndex,
        start: slice.earliestStart,
        finish: slice.earliestFinish,
        duration: slice.duration,
        critical: slice.critical,
        estimated: slice.estimated,
        floorWords: floorWordsOf(slice, predecessor, rowNames, roleNames, plan.personNames),
      };
      bars.push(bar);
      barBySliceId.set(slice.id, bar);
    }
  });

  const personLinks: GanttPersonLink[] = [];
  for (const slice of plan.slices) {
    if (slice.boundBy !== 'person') continue;
    const predecessor = predecessorOf.get(slice.id);
    if (predecessor === undefined) continue;
    const waiting = barBySliceId.get(slice.id);
    const busy = barBySliceId.get(predecessor.id);
    if (waiting === undefined || busy === undefined) continue;
    personLinks.push({
      fromSliceId: predecessor.id,
      fromRowIndex: busy.rowIndex,
      fromFinish: busy.finish,
      toSliceId: slice.id,
      toRowIndex: waiting.rowIndex,
      toStart: waiting.start,
    });
  }

  const arrows: GanttDependencyArrow[] = [];
  for (const edge of plan.dependencies) {
    const from = placedRows.get(edge.predecessorId);
    const to = placedRows.get(edge.successorId);
    if (from === undefined || to === undefined) continue;
    arrows.push({
      predecessorId: edge.predecessorId,
      successorId: edge.successorId,
      fromRowIndex: from.rowIndex,
      fromFinish: from.row.schedule.earliestFinish,
      toRowIndex: to.rowIndex,
      toStart: to.row.schedule.earliestStart,
    });
  }

  let horizon = 1;
  for (const bar of bars) horizon = Math.max(horizon, bar.finish);
  for (const bracket of brackets) horizon = Math.max(horizon, bracket.finish);
  for (const arrow of arrows) horizon = Math.max(horizon, arrow.fromFinish, arrow.toStart);
  for (const flag of notBeforeFlags) horizon = Math.max(horizon, flag.offset);

  return { labels, bars, brackets, arrows, personLinks, notBeforeFlags, horizon };
}

/**
 * One leaf's slices in the order its bars sit in: the order the plan lists
 * the roles in, with a slice belonging to no role last.
 *
 * A work item with no roles still gets a slice — it has to be somewhere in the
 * plan — and it has no place among the roles, so it takes the end.
 *
 * @throws GanttDataError when a slice names a role the plan does not list.
 */
function inRoleOrder(
  slices: readonly GanttSlice[],
  rolePlaces: ReadonlyMap<string, number>,
): GanttSlice[] {
  // Every place is looked up before the sort rather than inside its comparator:
  // `sort` does not call a comparator for a list of one, so a leaf with a single
  // slice would never have its role resolved and the throw below could not fire
  // on the commonest row in any plan. Watched: with the lookup in the
  // comparator, `throws when a slice is under a role the plan does not list`
  // passed against a slice under role `ops` on a plan that lists Dev and QA.
  const placed = slices.map((slice) => ({ slice, place: placeOf(slice, rolePlaces) }));
  // `sort` is stable, so slices sharing a place — the ones belonging to no role
  // — keep the order the payload had them in.
  return placed.sort((one, other) => one.place - other.place).map(({ slice }) => slice);
}

/**
 * Where a slice's bar sits among its row's bars: its role's place in the plan's
 * list, and last when it belongs to no role.
 *
 * @throws GanttDataError when the slice names a role the plan does not list.
 */
function placeOf(slice: GanttSlice, rolePlaces: ReadonlyMap<string, number>): number {
  if (slice.roleId === null) return Number.MAX_SAFE_INTEGER;
  const place = rolePlaces.get(slice.roleId);
  // Proof: this throw replaced by `return Number.MAX_SAFE_INTEGER`, `throws when
  // a slice is under a role the plan does not list` failed; watched 2026-08-09.
  if (place === undefined) {
    throw new GanttDataError(
      `slice ${slice.id} is under role ${slice.roleId}, which this plan does not list`,
    );
  }
  return place;
}

/**
 * A slice's binding floor in words.
 *
 * @throws GanttDataError when a person-floored slice names no resource
 * predecessor. `boundBy: 'person'` means the assignee's last finish was
 * strictly the latest floor, so there is always a slice they were finishing;
 * a payload saying otherwise has lost the one fact the person link is drawn
 * from.
 */
function floorWordsOf(
  slice: GanttSlice,
  predecessor: GanttSlice | undefined,
  rowNames: ReadonlyMap<string, string>,
  roleNames: ReadonlyMap<string, string>,
  personNames: ReadonlyMap<string, string>,
): string {
  if (slice.boundBy !== 'person') return FLOOR_SENTENCE[slice.boundBy];
  // Proof: this throw replaced by `return 'Waits for a person'`, `throws when a
  // person floor names no resource predecessor` failed; watched 2026-08-09.
  if (predecessor === undefined) {
    throw new GanttDataError(
      `slice ${slice.id} is floored by a person but names no resource predecessor`,
    );
  }
  return personFloorWords(slice, predecessor, rowNames, roleNames, personNames);
}
