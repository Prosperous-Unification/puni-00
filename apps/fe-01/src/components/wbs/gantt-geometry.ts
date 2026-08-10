import {
  addWorkdays,
  calendarDaysBetween,
  firstWorkdayOf,
  type IsoDate,
  snapWorkdays,
} from '@wbs/domain/workday';

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
 * The ten colours a person's bars are drawn in, handed out in this order.
 *
 * Matplotlib's `tab10`, taken whole rather than sampled from the app's own
 * tokens: the app's palette is one hue in five lightnesses — built to keep
 * chrome quiet — and ten people need ten hues a reader can tell apart at 28px
 * wide. These are the qualitative set that has been squinted at longest.
 *
 * An eleventh person wraps onto the first colour. Two people sharing a colour
 * is a legible chart with an ambiguity in it; a generated eleventh hue next to
 * these ten is an illegible one.
 */
export const PERSON_BAR_COLORS = [
  '#1f77b4',
  '#ff7f0e',
  '#2ca02c',
  '#d62728',
  '#9467bd',
  '#8c564b',
  '#e377c2',
  '#7f7f7f',
  '#bcbd22',
  '#17becf',
] as const;

/**
 * The colour of a slice nobody is on.
 *
 * Deliberately outside {@link PERSON_BAR_COLORS} and deliberately grey: an
 * unassigned slice is the absence of a person, and it must not read as an
 * eleventh one.
 */
export const UNASSIGNED_BAR_COLOR = '#94a3b8';

/**
 * A colour a bar can be painted: one of the ten, or the unassigned grey.
 *
 * A union rather than `string`, and that is what lets {@link inkOn} parse a
 * hex without asking what happens when it is not one. Validate at the boundary,
 * keep the internal type precise.
 */
export type BarColor = (typeof PERSON_BAR_COLORS)[number] | typeof UNASSIGNED_BAR_COLOR;

/** The two colours a bar's own label is ever written in. */
const BAR_LABEL_LIGHT = '#ffffff';
const BAR_LABEL_DARK = '#0f172a';

/**
 * How light a bar has to be before its label is written in dark ink.
 *
 * 0.35 of WCAG relative luminance, chosen against the palette rather than out
 * of the standard: it puts `#bcbd22`, `#17becf` and `#ff7f0e` — the three
 * `tab10` entries white is nearly invisible on — over the line, and leaves the
 * other seven under it.
 */
const BAR_LABEL_DARK_ABOVE = 0.35;

/**
 * The ink a bar's label is written in, so it can be read on that bar.
 *
 * WCAG relative luminance of the fill, and the darker of two inks above
 * {@link BAR_LABEL_DARK_ABOVE}. One white for all ten colours is what a
 * qualitative palette cannot have: `#bcbd22` is a highlighter, and white on it
 * is a label nobody reads.
 *
 * No malformed-input branch, and that is the type's doing rather than an
 * omission: {@link BarColor} is eleven six-digit hexes, so the parse below
 * cannot come back `NaN`.
 */
export function inkOn(barColor: BarColor): string {
  const linear = [1, 3, 5]
    .map((at) => Number.parseInt(barColor.slice(at, at + 2), 16) / 255)
    .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  // Proof: the threshold raised to 99, which no luminance reaches — one white
  // for every bar, which is what this function exists not to do. `writes the
  // label in ink the bar can be read through` alone failed, on `expected
  // '#ffffff' to be '#0f172a'`; watched 2026-08-09.
  return luminance > BAR_LABEL_DARK_ABOVE ? BAR_LABEL_DARK : BAR_LABEL_LIGHT;
}

/**
 * The service team a work item is labelled with, as the chart can state it.
 *
 * Three states and not a `string | null`, because "nobody labelled this" and
 * "the team read this client holds does not name that id" are different facts
 * and a blank says neither. The second is a **modeled** condition rather than a
 * broken payload: the teams come from the directory read and the label from the
 * tree read, two moments, and a team created between them is a stale lookup and
 * not a lost one.
 */
export type ServiceTeamLabel =
  | { state: 'none' }
  | { state: 'named'; name: string }
  | { state: 'unresolved' };

/** The three points a role was estimated with, as the plan holds them. */
export interface EstimateTrio {
  optimistic: number;
  realistic: number;
  pessimistic: number;
}

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
  /**
   * The derived number the plan's Number column shows for this row — `010`,
   * `010.2`. Carried rather than derived here: the table already computes it,
   * and a second derivation is two numbering rules to keep in step.
   */
  number: string;
  name: string;
  /** How deep in the tree, 0 at the root. The label's indent. */
  depth: number;
  /** True when this row's own slices are drawn as bars; false when it draws a summary bracket. */
  leaf: boolean;
  schedule: { earliestStart: number; earliestFinish: number };
  /** The workday its manual start date holds at, or null when it has none. */
  notBeforeOffset: number | null;
  /** The service team this work is labelled with, resolved against the directory read. */
  team: ServiceTeamLabel;
  /**
   * The three points each role was estimated with on this work item, by role id.
   *
   * A role absent from this map is a role nobody has estimated here, which is
   * the fact the bar states in words. Per row and per role rather than per
   * slice, because that is the shape be-01 sends it in and a bar's role is what
   * picks one out.
   */
  trioByRole: ReadonlyMap<string, EstimateTrio>;
  /**
   * What this row waits for, each already named `<number> <name>`.
   *
   * Resolved by the caller from **every** work item in the tree, not from the
   * rows the chart is drawing: a collapsed branch and a search each hide rows a
   * dependency may point at, and a predecessor hidden that way is still named
   * in full. That is why these are words rather than ids — the geometry sees
   * only what is on screen.
   */
  waitsFor: readonly string[];
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
  /** How many workdays this slice can slip before the project's finish moves. */
  float: number;
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
  /** The row's derived number, printed before its name — see {@link GanttRow.number}. */
  number: string;
  name: string;
  depth: number;
  rowIndex: number;
}

/**
 * How many workdays an unestimated slice's bar is **drawn** across.
 *
 * A drawing assumption and not a schedule fact. Nobody has said how long this
 * slice is, so the engine gives it zero days — and a bar of zero days is a mark
 * with no area, which reads as "there is nothing here" when the truth is "we do
 * not know yet". Two workdays is the smallest span that reads as a task at the
 * panel's 28px workday and is short enough that nobody mistakes it for an
 * estimate.
 *
 * **It changes nothing but the drawing.** The engine's numbers are untouched —
 * the slice still starts and finishes where be-01 placed it, the table's Start
 * and End columns are unmoved, `data-start`/`data-finish` still carry the
 * engine's numbers verbatim, and dependency arrows and person links are still
 * drawn between them. Only {@link GanttBar.drawnSpan} and the horizon that has
 * to contain it know about this number, and the bar says it is a guess in its
 * own outline, its translucency and its hover text (`gantt-panel.tsx`).
 */
export const ASSUMED_UNESTIMATED_WORKDAYS = 2;

/**
 * One slice drawn: where it starts and how wide it is on the workday axis,
 * which row it is on, and why it starts there.
 *
 * `start`, `finish`, `duration` and `drawnSpan` are workdays and `rowIndex` is
 * a row — never pixels. The panel's SVG user space is those two units, so these
 * numbers reach `x`, `width` and `y` unconverted.
 */
export interface GanttBar {
  sliceId: string;
  rowIndex: number;
  start: number;
  finish: number;
  duration: number;
  /**
   * How wide the bar is **drawn**, in workdays: `duration` for an estimated
   * slice, and {@link ASSUMED_UNESTIMATED_WORKDAYS} for one nobody has
   * estimated.
   *
   * The one number on this bar that is not the engine's, and the only one the
   * width is ever taken from. `duration` stays what be-01 computed, which is
   * what `data-finish` and the hover text are written from — see
   * {@link ASSUMED_UNESTIMATED_WORKDAYS} for why the two are allowed to differ
   * and what says so on screen.
   */
  drawnSpan: number;
  /** How many workdays this bar can slip before the project's finish moves. */
  float: number;
  critical: boolean;
  /** False when nobody has estimated this slice, which is not the same fact as zero days. */
  estimated: boolean;
  /** The work item this slice is work for — the number on the row the bar sits on. */
  workItemNumber: string;
  /** The work item this slice is work for — the name on the row the bar sits on. */
  workItemName: string;
  /** The role this slice is work for, or null when it belongs to no role. */
  roleName: string | null;
  /** Whose slice this is, or null when nobody is on it. */
  personName: string | null;
  /**
   * The colour the bar is painted, which is **who** is on it.
   *
   * One of {@link PERSON_BAR_COLORS}, or {@link UNASSIGNED_BAR_COLOR} when
   * nobody is. Decided here rather than in the component because the mapping is
   * a fact about the whole chart — the same person is the same colour on every
   * row — and a component that decided it per bar could not be asked whether
   * they are.
   */
  personColor: BarColor;
  /** The binding floor in words — the sentence the bar shows on hover. */
  floorWords: string;
  /** The service team the work item is labelled with — see {@link GanttRow.team}. */
  team: ServiceTeamLabel;
  /**
   * The three points **this bar's own role** was estimated with, or null when
   * that role has no estimate on this work item.
   *
   * The bar's role and not the row's: a leaf estimated Dev `2/3/8` and QA
   * `1/1/1` draws two bars, and a trio taken from the row would put the same
   * three numbers on both.
   */
  trio: EstimateTrio | null;
  /** What the bar's row waits for, in words — see {@link GanttRow.waitsFor}. */
  waitsFor: readonly string[];
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
  /**
   * Where the predecessor's projection begins.
   *
   * Not a coordinate the arrow is drawn at — the line leaves `fromFinish`. It
   * is carried because a **span** is what a calendar reading needs: a
   * projection of no days at all is on no workday, and its finish then has to
   * be read as its own start rather than as the end of the workday before it.
   * See {@link placeOnCalendar}.
   */
  fromStart: number;
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
  /** Where the busy slice begins — carried for {@link GanttDependencyArrow.fromStart}'s reason. */
  fromStart: number;
  fromFinish: number;
  toSliceId: string;
  toRowIndex: number;
  toStart: number;
  /**
   * The colour of the person whose hand-off this is — the same colour as the
   * two bars it joins, which is what makes the line read as theirs rather than
   * as a second kind of dependency.
   */
  personColor: BarColor;
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

/**
 * One reading of a workday offset: where a span that starts there stands, or
 * where one that finishes there stops.
 */
type ReadOffset = (workday: number) => number;

/**
 * One workday offset read as a calendar-day offset, two ways.
 *
 * The two readings differ only where a weekend sits between workday `w − 1` and
 * `w`, and that difference is the whole of what this chart gained: work that
 * finished on the Friday **ends** at the Saturday, while its successor
 * **starts** at the Monday, so the weekend between them is a gap a reader can
 * see. One number could not say both.
 */
export interface CalendarScale {
  /** Where a span that **starts** at this workday offset stands. */
  startOf: ReadOffset;
  /** Where a span that **finishes** at this workday offset stops. */
  endOf: ReadOffset;
}

/**
 * The scale binding the chart to the plan's first working day: workday offsets
 * in, calendar-day offsets from that day out.
 *
 * The origin is `addWorkdays(startDate, 0)` and not `startDate`, so a project
 * whose start date lands on a weekend begins on the Monday — the same
 * normalisation the Start column already makes. Inherited rather than repeated:
 * two copies of that rule are two answers about which day a plan begins on.
 *
 * `startOf(w)` walks working days for the whole part and carries the fraction
 * through untouched, so a slice 3.5 workdays into the schedule is still 3.5
 * workdays into it — the fraction rides **inside** the workday it belongs to
 * rather than being stretched across the weekend after it. `endOf(w)` is the
 * same scale's left limit: `startOf(w − 1) + 1` for a whole `w`, which is the
 * `ceil − 1` nudge `lastWorkdayOf` and be-01's `datesOf` already make.
 *
 * Offsets at or below zero are answered as themselves rather than refused: they
 * are the canvas band the marks route through (`CHART_PAD_PX`) and not schedule
 * time, and {@link addWorkdays} throws on a negative.
 *
 * Proof, twice, `gantt-geometry.test.ts`, watched 2026-08-09:
 *
 * - `endOf` aliased to `startOf` — the end reading taken as the start one.
 *   `2 failed | 51 passed`, both on `expected 7 to be 5`: `ends a span that
 *   finished on the Friday at the Saturday` and the same reading inside
 *   `begins a Saturday project on the Monday`. Every case before the first
 *   weekend stayed green, which is exactly why those two are written at 5
 *   rather than at 3.
 * - the origin taken as `startDate` instead of `addWorkdays(startDate, 0)`.
 *   `2 failed | 51 passed`: `begins a Saturday project on the Monday` on
 *   `expected 9 to be 7` — an origin two days early and every mark on the
 *   chart with it — and `refuses a start date that is not a calendar date` on
 *   `expected [Function] to throw an error`, because with no `addWorkdays` at
 *   construction the refusal is deferred to whichever mark asks first.
 *
 * And twice more for the snap, `gantt-geometry.test.ts`, watched 2026-08-10:
 *
 * - `startOf` floored the raw offset (`Math.floor(workday)`, the fraction
 *   `workday - whole`). `reads a drifted whole offset exactly as the whole
 *   day it is` failed on `expected 10.999999999999998 to be 11` — the ninth
 *   workday's mark standing a bit less than a calendar day early.
 * - `endOf` read the raw offset (`!Number.isInteger(workday)` on a drifted
 *   whole). The same test failed on `expected 21 to be 19`: a finish of
 *   15.000000000000002 was handed the **start** reading, the far side of the
 *   weekend, two calendar days past where day 15's work stops.
 *
 * @throws Whatever {@link addWorkdays} throws when `startDate` is not a
 * calendar date, and it throws here rather than at the first mark placed: a
 * scale that cannot say where day zero is has no answer to give any of them.
 */
export function calendarScale(startDate: IsoDate): CalendarScale {
  const origin = addWorkdays(startDate, 0);
  // Both readings snap before they decide anything discrete: the engine's
  // chained doubles hand this scale 8.999999999999998 for the ninth day, and a
  // bare floor put the whole part a workday early while `Number.isInteger`
  // read a drifted whole finish as a fraction — each standing a mark almost a
  // calendar day away from the dates be-01 prints beside it. The fraction that
  // survives the snap is real work and rides inside its workday untouched.
  const startOf = (workday: number): number => {
    if (workday <= 0) return workday;
    const snapped = snapWorkdays(workday);
    const whole = firstWorkdayOf(snapped);
    return calendarDaysBetween(origin, addWorkdays(origin, whole)) + (snapped - whole);
  };
  return {
    startOf,
    endOf: (workday: number): number => {
      const snapped = snapWorkdays(workday);
      return snapped <= 0 || !Number.isInteger(snapped)
        ? startOf(snapped)
        : startOf(snapped - 1) + 1;
    },
  };
}

/**
 * One bar as it is drawn, and the bar the engine placed.
 *
 * The split is the contract: `x` and `width` are the only two numbers anything
 * about the drawing may read, and `bar` is where `data-start`, `data-finish`
 * and every sentence on hover come from. A bar's width is the span it is
 * **drawn** across and never one taken from the engine's `finish` — an
 * unestimated slice has `finish === start`, and a width from that is a mark of
 * no area at all.
 */
export interface PlacedBar {
  bar: GanttBar;
  x: number;
  width: number;
}

/** A parent's bracket as it is drawn: the two ends of its projection, on the calendar. */
export interface PlacedBracket {
  rowId: string;
  rowIndex: number;
  from: number;
  to: number;
}

/** A dependency as it is drawn: the predecessor's right edge, and the successor's left one. */
export interface PlacedArrow {
  predecessorId: string;
  successorId: string;
  fromRowIndex: number;
  fromX: number;
  toRowIndex: number;
  toX: number;
}

/** One person's hand-off as it is drawn, in the colour of whoever made it. */
export interface PlacedPersonLink {
  fromSliceId: string;
  toSliceId: string;
  fromRowIndex: number;
  fromX: number;
  toRowIndex: number;
  toX: number;
  personColor: BarColor;
}

/**
 * A not-before flag as it is drawn, and the workday it holds at.
 *
 * Both, because the mark and its words answer different questions: `x` is where
 * the caret stands and `workday` is what the date beside it is worked out from.
 * A date read off `x` would name a Saturday.
 */
export interface PlacedFlag {
  rowIndex: number;
  x: number;
  workday: number;
}

/**
 * The whole chart resolved: every mark that has a horizontal coordinate,
 * carrying it, and not one workday number left standing in for one.
 *
 * The panel draws from this and from nothing else. A mark still reading
 * `bar.start` or `flag.offset` for its position is a mark that misaligns from
 * the first weekend on — and the axis, which is placed the same way, is what
 * makes it visible.
 */
export interface PlacedGantt {
  labels: GanttRowLabel[];
  bars: PlacedBar[];
  brackets: PlacedBracket[];
  arrows: PlacedArrow[];
  personLinks: PlacedPersonLink[];
  notBeforeFlags: PlacedFlag[];
  /** How far the drawing reaches, in the unit the marks above are in. */
  horizon: number;
}

/**
 * Every mark placed through one pair of readings — a start's and a finish's.
 *
 * The whole of the conversion lives here rather than in the panel, so that
 * adding a mark to the drawing means adding it to a list that is already
 * resolved instead of remembering to convert it. `layOutGantt` is untouched and
 * stays engine-true: this reads its answer, it does not replace it.
 */
function placeGantt(chart: GanttGeometry, startOf: ReadOffset, endOf: ReadOffset): PlacedGantt {
  /**
   * Where a span running `from → to` in workdays stops.
   *
   * `endOf(to)` for a span with days in it, and its own start for one with
   * none: `endOf` answers for the last workday a span is **on**, and a span of
   * no days is on none. Without this a zero-day mark standing on a Monday
   * would stop at `endOf(w)` — the Friday's right edge, two days behind its own
   * left one — and be drawn backwards.
   */
  const stopOf = (from: number, to: number): number => (to > from ? endOf(to) : startOf(from));
  const bars = chart.bars.map((bar) => ({
    bar,
    x: startOf(bar.start),
    // The **drawn** span, read as a finish. Never a span from the engine's
    // `finish`: an unestimated slice finishes where it starts, and a width
    // from that is a bar of no area at all — the sixteenth check's own shape.
    width: stopOf(bar.start, bar.start + bar.drawnSpan) - startOf(bar.start),
  }));
  const brackets = chart.brackets.map((bracket) => ({
    rowId: bracket.rowId,
    rowIndex: bracket.rowIndex,
    from: startOf(bracket.start),
    to: stopOf(bracket.start, bracket.finish),
  }));
  const arrows = chart.arrows.map((arrow) => ({
    predecessorId: arrow.predecessorId,
    successorId: arrow.successorId,
    fromRowIndex: arrow.fromRowIndex,
    fromX: stopOf(arrow.fromStart, arrow.fromFinish),
    toRowIndex: arrow.toRowIndex,
    toX: startOf(arrow.toStart),
  }));
  const personLinks = chart.personLinks.map((link) => ({
    fromSliceId: link.fromSliceId,
    toSliceId: link.toSliceId,
    fromRowIndex: link.fromRowIndex,
    fromX: stopOf(link.fromStart, link.fromFinish),
    toRowIndex: link.toRowIndex,
    toX: startOf(link.toStart),
    personColor: link.personColor,
  }));
  const notBeforeFlags = chart.notBeforeFlags.map((flag) => ({
    rowIndex: flag.rowIndex,
    x: startOf(flag.offset),
    workday: flag.offset,
  }));

  // The reach of what is actually drawn, in the same unit the marks are in —
  // read off them rather than converted from `chart.horizon`, which is a
  // workday number and two calendar days short of an assumed span drawn over a
  // weekend. At least 1, so an empty plan still has a canvas with a width.
  let horizon = 1;
  for (const placed of bars) horizon = Math.max(horizon, placed.x + placed.width);
  for (const bracket of brackets) horizon = Math.max(horizon, bracket.to);
  for (const arrow of arrows) horizon = Math.max(horizon, arrow.fromX, arrow.toX);
  for (const flag of notBeforeFlags) horizon = Math.max(horizon, flag.x);

  return { labels: chart.labels, bars, brackets, arrows, personLinks, notBeforeFlags, horizon };
}

/**
 * The chart placed on the plan's calendar: every coordinate a calendar-day
 * offset from its first working day.
 *
 * Starts read {@link CalendarScale.startOf} and finishes {@link
 * CalendarScale.endOf}, which is what puts a weekend between a predecessor's
 * right edge and its successor's left one.
 *
 * @throws Whatever {@link calendarScale} throws when `startDate` is not a
 * calendar date.
 */
export function placeOnCalendar(chart: GanttGeometry, startDate: IsoDate): PlacedGantt {
  const scale = calendarScale(startDate);
  return placeGantt(chart, scale.startOf, scale.endOf);
}

/**
 * The chart placed on the workday axis: every coordinate the engine's own
 * number, verbatim.
 *
 * What a plan with no start date is drawn on. Not a fallback and not a scale of
 * one — there is no calendar to be on, so no scale is built and nothing is
 * asked for a date. See "Without a project start date the chart stays on the
 * workday axis" in the spec.
 */
export function placeOnWorkdays(chart: GanttGeometry): PlacedGantt {
  const asItIs: ReadOffset = (workday) => workday;
  return placeGantt(chart, asItIs, asItIs);
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
 * `person` arrives resolved: {@link personNameOf} is what refuses a slice
 * assigned to somebody the plan does not name, and it does so for every bar
 * rather than for the person-floored ones alone. A second check here would be
 * one nothing could ever reach.
 */
function personFloorWords(
  person: string,
  predecessor: GanttSlice,
  rowNames: ReadonlyMap<string, string>,
  rolesById: ReadonlyMap<string, GanttRolePlace>,
): string {
  const workItemName = rowNames.get(predecessor.workItemId);
  if (workItemName === undefined) return `${person} — after work that is not shown`;
  const roleName =
    predecessor.roleId === null ? undefined : rolesById.get(predecessor.roleId)?.name;
  return roleName === undefined
    ? `${person} — after ${workItemName}`
    : `${person} — after ${workItemName} (${roleName})`;
}

/**
 * Whose slice this is, or null when nobody's.
 *
 * @throws GanttDataError when the slice names a person the plan does not. The
 * payload carries the assignment and the roster in one read, so a personId
 * with no name is the wire having lost one of them — and the bar's colour and
 * its on-bar label are both that name, so a chart drawn anyway would be a
 * chart with an anonymous colour on it.
 */
function personNameOf(slice: GanttSlice, personNames: ReadonlyMap<string, string>): string | null {
  if (slice.personId === null) return null;
  const name = personNames.get(slice.personId);
  // Proof: this throw replaced by `return name ?? slice.personId`, so an
  // unknown person drew under their own id. **Two** tests failed, `2 failed |
  // 39 passed`, both on `expected function to throw an error, but it didn't`:
  // `throws when a slice is assigned to somebody the plan does not name` and
  // `throws when a person floor names somebody the plan does not` — the second
  // is the check this one replaced in `personFloorWords`, and it is here that
  // it now fires. Watched 2026-08-09.
  if (name === undefined) {
    throw new GanttDataError(
      `slice ${slice.id} is assigned to ${slice.personId}, whom this plan does not name`,
    );
  }
  return name;
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
  const rolesById: ReadonlyMap<string, GanttRolePlace> = new Map(
    plan.roles.map((role, place) => [role.id, { place, name: role.name }]),
  );

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
    number: row.number,
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

  /**
   * The palette, handed out as the rows are walked.
   *
   * First appearance top-down, which makes the colours a fact about **what is
   * on screen**: collapse a branch whose only person was drawn first and the
   * people below shift up the palette. That is deliberate — the alternative is
   * an order taken from the payload's slice array, which is the engine's
   * placement order and would put the top row's person in whatever colour the
   * scheduler happened to reach them in. Within one drawing every row agrees,
   * which is the property a reader uses.
   *
   * Proof that the **order** is the rows' and not somebody's idea of a stable
   * one: the map pre-seeded from `[...new Set(plan.slices.map((s) =>
   * s.personId))].sort()` before this walk — alphabetical by person id, which
   * is stable and wrong. `hands the palette out in the order people first
   * appear, top-down` failed on `expected [ '#ff7f0e', '#1f77b4' ] to deeply
   * equal [ '#1f77b4', '#ff7f0e' ]`, `wraps the eleventh person…` with it, and
   * `gives one person one colour on every row they are on` went on passing —
   * that one cannot see this fault, which is why the order has a test of its
   * own. Watched 2026-08-09.
   */
  const colorByPerson = new Map<string, BarColor>();
  const colorFor = (personId: string | null): BarColor => {
    // Proof: replaced by `return PERSON_BAR_COLORS[0]`, so an unassigned slice
    // drew as the first person. `paints a slice nobody is on grey, and does not
    // spend a colour on it` alone failed, on `expected '#1f77b4' to be
    // '#94a3b8'`; watched 2026-08-09.
    if (personId === null) return UNASSIGNED_BAR_COLOR;
    const taken = colorByPerson.get(personId);
    if (taken !== undefined) return taken;
    // Wrapping rather than running out: `% length` is what an eleventh person
    // gets, and it is the first colour again.
    //
    // Proof, twice. The `%` dropped: `wraps the eleventh person back onto the
    // first colour` alone failed, on `expected undefined to be '#1f77b4'` — an
    // eleventh person with no colour at all rather than a shared one. And the
    // `set` below removed, so nothing was remembered: **3** failed, `3 failed |
    // 38 passed`, on `expected '#1f77b4' not to be '#1f77b4'` and two lists of
    // one repeated colour. Watched 2026-08-09.
    const next = PERSON_BAR_COLORS[colorByPerson.size % PERSON_BAR_COLORS.length];
    colorByPerson.set(personId, next);
    return next;
  };

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
    for (const { slice, roleName } of inRoleOrder(own, rolesById)) {
      const predecessor = predecessorOf.get(slice.id);
      const personName = personNameOf(slice, plan.personNames);
      const bar: GanttBar = {
        sliceId: slice.id,
        rowIndex,
        start: slice.earliestStart,
        finish: slice.earliestFinish,
        duration: slice.duration,
        // The only place the drawing parts from the engine, and it parts from
        // it here rather than in the panel so the horizon below can contain
        // what is actually drawn. See {@link ASSUMED_UNESTIMATED_WORKDAYS}.
        drawnSpan: slice.estimated ? slice.duration : ASSUMED_UNESTIMATED_WORKDAYS,
        float: slice.float,
        critical: slice.critical,
        estimated: slice.estimated,
        workItemNumber: row.number,
        workItemName: row.name,
        roleName,
        personName,
        personColor: colorFor(slice.personId),
        floorWords: floorWordsOf(slice, predecessor, personName, rowNames, rolesById),
        team: row.team,
        // The bar's own role's trio. A slice under no role has no estimate to
        // look up rather than an empty one, which is the same absence said
        // once.
        trio: (slice.roleId === null ? undefined : row.trioByRole.get(slice.roleId)) ?? null,
        waitsFor: row.waitsFor,
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
      fromStart: busy.start,
      fromFinish: busy.finish,
      toSliceId: slice.id,
      toRowIndex: waiting.rowIndex,
      toStart: waiting.start,
      // The waiting bar's own colour, read off the bar rather than looked up
      // again: the line and the two ends it joins cannot be different colours
      // for the same person if only one of them decides.
      personColor: waiting.personColor,
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
      fromStart: from.row.schedule.earliestStart,
      fromFinish: from.row.schedule.earliestFinish,
      toRowIndex: to.rowIndex,
      toStart: to.row.schedule.earliestStart,
    });
  }

  let horizon = 1;
  // Both ends of every bar: where the engine finishes it, and where the drawing
  // does. An unestimated slice standing on the last workday is drawn
  // {@link ASSUMED_UNESTIMATED_WORKDAYS} past its own finish, and a horizon
  // taken from `finish` alone would end the canvas underneath it —
  // `CHART_PAD_PX` in the panel is a band for pixel excursions and is not a
  // workday span to hide a bar in.
  for (const bar of bars) horizon = Math.max(horizon, bar.finish, bar.start + bar.drawnSpan);
  for (const bracket of brackets) horizon = Math.max(horizon, bracket.finish);
  for (const arrow of arrows) horizon = Math.max(horizon, arrow.fromFinish, arrow.toStart);
  for (const flag of notBeforeFlags) horizon = Math.max(horizon, flag.offset);

  return { labels, bars, brackets, arrows, personLinks, notBeforeFlags, horizon };
}

/** One role as the drawing reads it: where it comes in the plan's order, and what it is called. */
interface GanttRolePlace {
  place: number;
  name: string;
}

/** One of a leaf's slices with its role resolved: the bar's place in the row, and the role's name. */
interface PlacedSlice {
  slice: GanttSlice;
  place: number;
  roleName: string | null;
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
  rolesById: ReadonlyMap<string, GanttRolePlace>,
): PlacedSlice[] {
  // Every place is looked up before the sort rather than inside its comparator:
  // `sort` does not call a comparator for a list of one, so a leaf with a single
  // slice would never have its role resolved and the throw below could not fire
  // on the commonest row in any plan. Watched: with the lookup in the
  // comparator, `throws when a slice is under a role the plan does not list`
  // passed against a slice under role `ops` on a plan that lists Dev and QA.
  const placed = slices.map((slice) => placeOf(slice, rolesById));
  // `sort` is stable, so slices sharing a place — the ones belonging to no role
  // — keep the order the payload had them in.
  return placed.sort((one, other) => one.place - other.place);
}

/**
 * Where a slice's bar sits among its row's bars, and what its role is called:
 * its role's place in the plan's list, and last and nameless when it belongs to
 * no role.
 *
 * @throws GanttDataError when the slice names a role the plan does not list.
 */
function placeOf(slice: GanttSlice, rolesById: ReadonlyMap<string, GanttRolePlace>): PlacedSlice {
  if (slice.roleId === null) {
    return { slice, place: Number.MAX_SAFE_INTEGER, roleName: null };
  }
  const role = rolesById.get(slice.roleId);
  // Proof: this throw replaced by
  // `return { slice, place: Number.MAX_SAFE_INTEGER, roleName: null }` — the
  // unlisted role treated as no role at all. `throws when a slice is under a
  // role the plan does not list` alone failed, on `expected function to throw
  // an error, but it didn't`; re-watched 2026-08-09 in this shape.
  if (role === undefined) {
    throw new GanttDataError(
      `slice ${slice.id} is under role ${slice.roleId}, which this plan does not list`,
    );
  }
  return { slice, place: role.place, roleName: role.name };
}

/**
 * A slice's binding floor in words.
 *
 * A `switch` over the whole union rather than an index into
 * {@link FLOOR_SENTENCE}, and the difference is the `default`. `boundBy`
 * arrives on the wire: the type says five values because that is what be-01
 * sends **today**, and a sixth floor added there — a resource calendar, a
 * fixed date — reaches this module as a string the drawing has no words for.
 * Indexed, it produced `undefined`, and the bar's hover text ended on a bare
 * newline: the one thing the panel exists to say, silently missing. So an
 * unrecognised floor is malformed trusted data like every other broken promise
 * in this file, and it throws into the same error boundary.
 *
 * @throws GanttDataError when a person-floored slice names no resource
 * predecessor. `boundBy: 'person'` means the assignee's last finish was
 * strictly the latest floor, so there is always a slice they were finishing;
 * a payload saying otherwise has lost the one fact the person link is drawn
 * from.
 * @throws GanttDataError on a floor this module does not know.
 */
function floorWordsOf(
  slice: GanttSlice,
  predecessor: GanttSlice | undefined,
  personName: string | null,
  rowNames: ReadonlyMap<string, string>,
  rolesById: ReadonlyMap<string, GanttRolePlace>,
): string {
  switch (slice.boundBy) {
    case 'projectStart':
    case 'predecessor':
    case 'roleOrder':
    case 'notBefore':
      return FLOOR_SENTENCE[slice.boundBy];
    case 'person': {
      // Proof: this throw replaced by `return 'Waits for a person'`, `throws
      // when a person floor names no resource predecessor` failed; watched
      // 2026-08-09.
      if (predecessor === undefined) {
        throw new GanttDataError(
          `slice ${slice.id} is floored by a person but names no resource predecessor`,
        );
      }
      // Proof: this throw replaced by `personFloorWords(personName ?? 'somebody', …)`.
      // `throws when a person floor names nobody at all` alone failed, on `expected
      // function to throw an error, but it didn't`; watched 2026-08-09.
      if (personName === null) {
        throw new GanttDataError(
          `slice ${slice.id} is floored by a person but names no person at all`,
        );
      }
      return personFloorWords(personName, predecessor, rowNames, rolesById);
    }
    default: {
      // `never` here is the type saying the five above are all of them; the
      // throw is for the runtime, where a payload can carry a sixth.
      //
      // Proof: this `default` replaced by
      // `return FLOOR_SENTENCE[slice.boundBy as Exclude<BindingFloor, 'person'>]`
      // — what the code did before. `throws rather than saying nothing at all
      // about what holds a bar` alone failed, on `expected function to throw an
      // error, but it didn't`. What it drew instead, printed in the same run:
      // `floorWords` `undefined`, and a hover title of `"Strip\nDev ·
      // Unassigned\nWorkdays 0 → 3 · 3 days\nFloat 0 days\n"` — the line the
      // panel exists to show, gone, and a bare newline where it was. Watched
      // 2026-08-09.
      const unknownFloor: never = slice.boundBy;
      throw new GanttDataError(
        `slice ${slice.id} is held by ${String(unknownFloor)}, which this chart has no words for`,
      );
    }
  }
}
