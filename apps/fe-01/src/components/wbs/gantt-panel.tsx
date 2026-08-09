import {
  addCalendarDays,
  addWorkdays,
  isMonday,
  type IsoDate,
  isWeekend,
} from '@wbs/domain/workday';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ASSUMED_UNESTIMATED_WORKDAYS,
  type EstimateTrio,
  type GanttBar,
  type GanttPlan,
  type GanttRowLabel,
  inkOn,
  layOutGantt,
  type PlacedArrow,
  placeOnCalendar,
  placeOnWorkdays,
  type ServiceTeamLabel,
} from './gantt-geometry';
import { type AnchorRect, HoverCard } from './hover-card';
import { shortIsoDate } from './short-date';
import { indentFor } from './table-frame';

/**
 * How wide one workday is on screen, in CSS pixels.
 *
 * The one number that turns the chart's user space into pixels, and it is used
 * in exactly two places: the SVG's CSS width (`horizon × DAY_PX`) and the width
 * of one cell of the HTML axis above it. Nothing inside the SVG multiplies by
 * it — that is the whole of the coordinate contract (design §1), and a bar
 * whose `x` were computed here would be pixels asserted against pixels.
 *
 * 28 is the narrowest a two-digit day-of-month reads at, measured against
 * nothing but the eye; the browser gate is what judges it after scaling.
 */
export const DAY_PX = 28;

/**
 * How tall one row of the chart is, in CSS pixels.
 *
 * The SVG's y unit is one row, so this is both the height of a label in the
 * sticky-left column and the scale factor of the y axis — the two cannot
 * disagree, which is what keeps a bar level with the name beside it.
 */
export const ROW_PX = 28;

/** How wide the sticky-left column of row labels is, in CSS pixels. */
const LABEL_COLUMN_PX = 176;

/**
 * How much of a row's height a bar leaves empty above and below it, in rows.
 *
 * A fraction of a row rather than a pixel padding: the SVG's y unit is a row,
 * so this is the only unit available inside it — and it stays correct at any
 * {@link ROW_PX}.
 */
const BAR_INSET = 0.18;
const BAR_HEIGHT = 1 - 2 * BAR_INSET;

/** Half a row down, which is where a line between two rows leaves and arrives. */
const ROW_MIDDLE = 0.5;

/**
 * How many workdays a working week is on the **workday** axis.
 *
 * Five, and that axis holds no weekends, so every fifth line **is** a week
 * boundary — the rhythm a reader counts by without anything being written down.
 * It is not a `Date` question there: on a weekend-free axis, workday 5 is the
 * Monday whatever the project started on.
 *
 * It belongs to the no-start-date axis alone. On a calendar a week is **seven**
 * cells, every fifth one is a Saturday, and the week boundary is a Monday —
 * see {@link calendarAxis}.
 */
const WEEK_DAYS = 5;

/**
 * The not-before caret: how far it reaches, in CSS pixels, and how much clear
 * air it keeps between itself and the bar below it, in rows.
 *
 * It lives in the {@link BAR_INSET} band **above** the bar, and that is the
 * whole of the fix it exists for: drawn on the bar's own left edge — which is
 * where it is in every plan where the date is what holds the row — it was
 * painted over by the bar and, on a critical row, by a 2px ring as well. A
 * marker nobody can see is not a marker.
 *
 * The clearance is what keeps the caret's box off the bar's box, and it is
 * asserted as rectangles in `e2e/gantt.spec.ts` rather than as path data: two
 * `d` strings can be provably apart and still overlap once one of them is
 * stroked.
 *
 * Pixels for the length and rows for the band, because the band **is** a
 * fraction of a row and the length is a decision about legibility — the same
 * split {@link BAR_RADIUS_PX} documents.
 */
const NOT_BEFORE_LENGTH_PX = 8;
const NOT_BEFORE_CLEARANCE = 0.03;

/**
 * How round a bar's corners are, in CSS pixels — turned into the user space's
 * **two** units to get there.
 *
 * `rx` is measured on x and `ry` on y, and this chart's two axes are scaled by
 * different amounts, so a single number in user units comes out as an ellipse:
 * `rx={0.1}` is 2.8px across and 0.1 of a row down. Dividing by each axis's own
 * scale is what makes the corner square.
 *
 * This is not the pixel arithmetic design §1 rejects. That rule is about the
 * **engine's** numbers — a start, a duration — which reach `x` and `width`
 * unconverted and are asserted against the payload. A corner radius is a
 * decision made in pixels in the first place and has no other honest unit.
 */
const BAR_RADIUS_PX = 3;

/**
 * A dependency arrow's approach and its head, in CSS pixels — turned into the
 * user space's two units where they are used.
 *
 * `ARROW_APPROACH_PX` is how far the line steps clear of a bar before it turns,
 * and `ARROW_HEAD_PX`/`ARROW_HEAD_HALF_PX` are the head's length and half its
 * base. Pixels rather than workdays for the reason {@link BAR_RADIUS_PX} gives:
 * an arrowhead is a decision about how big a mark has to be to be seen, and a
 * workday is not a size. Divided by {@link DAY_PX} and {@link ROW_PX} at the
 * point of use, so the head stays a triangle rather than becoming a sliver if
 * the two scales ever part.
 *
 * The approach is longer than the head on purpose: the head sits **inside** the
 * final horizontal run, so a head longer than the run it is drawn on would
 * start before the corner and read as a bend rather than as a point.
 */
const ARROW_APPROACH_PX = 10;
const ARROW_HEAD_PX = 7;
const ARROW_HEAD_HALF_PX = 3.5;

/**
 * The heaviest stroke anything on this chart is drawn with, in CSS pixels.
 *
 * Every stroke here is `non-scaling-stroke`, so it is centred on its geometry
 * and half of it lies outside: a mark standing exactly on the canvas edge is
 * painted half. Named rather than folded into the number below, because it is
 * why {@link CHART_PAD_PX} is not simply the excursion.
 */
const HEAVIEST_STROKE_PX = 2;

/**
 * How much canvas the chart keeps **outside** the schedule, at each end, in CSS
 * pixels.
 *
 * The marks are not all inside the engine's numbers. A dependency arrow steps
 * {@link ARROW_APPROACH_PX} clear of a bar before it turns and carries a head
 * back to the bar's own edge, and a not-before caret reaches
 * {@link NOT_BEFORE_LENGTH_PX} to the right of the day it holds — so a
 * successor at workday 0 routes through **negative** x, and an arrow off the
 * last bar routes past the horizon. The `viewBox` used to start at 0 and end at
 * the horizon, and a browser's own `overflow: hidden` on an `<svg>` clipped
 * both: at workday 0 the head painted **nothing at all**, measured in
 * Chromium, while `getBoundingClientRect` went on reporting the box it would
 * have had.
 *
 * So the drawn canvas is the schedule plus this band at either side, and the
 * viewBox says so: `-pad 0 (horizon + 2·pad) rowCount`. The coordinate contract
 * is untouched — a bar's `x` is still `earliestStart` and its `width` still its
 * drawn span, which for every estimated slice is `duration` verbatim (design
 * §1; the one exception is {@link ASSUMED_UNESTIMATED_WORKDAYS}, which the
 * horizon accounts for rather than this band). What moves is where the
 * **canvas** ends,
 * which the contract says nothing about, and the axis and the on-bar labels are
 * shifted by the same number so the workday a bar starts on is still the pixel
 * its axis cell starts at.
 *
 * Symmetric, because both edges have the fault and one number is one thing to
 * keep true. Wide enough for the widest excursion any mark makes plus the
 * heaviest stroke it is drawn with, so a mark standing on the boundary is
 * painted whole rather than halved.
 */
export const CHART_PAD_PX = Math.max(ARROW_APPROACH_PX, NOT_BEFORE_LENGTH_PX) + HEAVIEST_STROKE_PX;

/**
 * The two paths one dependency arrow is drawn from: the elbow, and the filled
 * head at the end of it.
 *
 * **The head is a path and not a `<marker>`.** A marker's contents are laid out
 * in the marker's own viewport, but the element is placed by the referencing
 * geometry's user space — which here is `preserveAspectRatio="none"` over a
 * viewBox measured in workdays by rows, so `markerUnits="userSpaceOnUse"` buys
 * a triangle that is still stretched by whatever ratio the panel happens to be
 * sized at. A path in the same units the rest of the chart is drawn in, with
 * each axis divided by its own scale, is the only shape that stays a triangle —
 * and it is an element a test can find and a browser can measure the box of.
 *
 * **Two routes, and the second one is the fault this was rewritten for.** A
 * finish-to-start dependency very often has `toStart === fromFinish`: the
 * successor begins the day the predecessor ends. The old elbow then collapsed
 * into a vertical line **on** the successor's left edge, underneath its bar and
 * — on a critical row — underneath a 2px ring, which is a dependency drawn and
 * invisible. So when there is no room between the two, the line steps out past
 * the predecessor's right edge, crosses in the clear band at the far side of
 * the predecessor's row, and comes back to enter the successor's left edge from
 * **outside** it. With room, the plain elbow does the same thing in three
 * points.
 *
 * Either way the last run is horizontal and arrives at the successor's start,
 * so the head always points right and never has to be rotated.
 */
function arrowRoute(arrow: PlacedArrow): { elbow: string; head: string } {
  const at = (x: number, y: number): string => `${String(x)} ${String(y)}`;
  const approach = ARROW_APPROACH_PX / DAY_PX;
  const fromY = arrow.fromRowIndex + ROW_MIDDLE;
  const toY = arrow.toRowIndex + ROW_MIDDLE;
  // Where the line turns down onto the successor's row: one approach clear of
  // its left edge, so the head has a straight run to sit on.
  const turn = arrow.toX - approach;
  // Which band a jogging arrow crosses in: the clear inset at the far side of
  // the **predecessor's** row, on the side the successor is on. Not the inset
  // above the successor's own bar, which is where a not-before caret stands —
  // the browser showed those two marks crossing, and a line running through an
  // arrowhead-sized triangle makes a puzzle of both. Either way it is air: no
  // bar is ever drawn inside {@link BAR_INSET}.
  const crossing =
    arrow.toRowIndex > arrow.fromRowIndex
      ? arrow.fromRowIndex + 1 - BAR_INSET / 2
      : arrow.fromRowIndex + BAR_INSET / 2;
  const elbow =
    arrow.toX - arrow.fromX >= 2 * approach
      ? [
          `M ${at(arrow.fromX, fromY)}`,
          `L ${at(turn, fromY)}`,
          `L ${at(turn, toY)}`,
          `L ${at(arrow.toX, toY)}`,
        ]
      : [
          `M ${at(arrow.fromX, fromY)}`,
          `L ${at(arrow.fromX + approach, fromY)}`,
          `L ${at(arrow.fromX + approach, crossing)}`,
          `L ${at(turn, crossing)}`,
          `L ${at(turn, toY)}`,
          `L ${at(arrow.toX, toY)}`,
        ];
  const headX = ARROW_HEAD_PX / DAY_PX;
  const headY = ARROW_HEAD_HALF_PX / ROW_PX;
  return {
    elbow: elbow.join(' '),
    head:
      `M ${at(arrow.toX, toY)} ` +
      `L ${at(arrow.toX - headX, toY - headY)} ` +
      `L ${at(arrow.toX - headX, toY + headY)} Z`,
  };
}

/**
 * What an unestimated slice's bar is drawn with beyond its colour: a fill it can
 * be seen through and an outline that is not solid.
 *
 * Both, and not either alone. The bar now has a **width nobody gave it**
 * ({@link ASSUMED_UNESTIMATED_WORKDAYS}), so it has to be unmistakable at a
 * glance against every estimated bar on the chart: translucent says the block is
 * not solid ground, and the dashes say the edges are not where anybody put them.
 * A solid bar at 35% could still read as a pale assignee colour; a dashed bar at
 * full strength reads as a bar with a border.
 *
 * Arbitrary properties rather than a stylesheet for the same reason
 * {@link BAR_RADIUS_PX} is divided by two scales: these land on an SVG element
 * inside a non-uniformly scaled user space, and `stroke-dasharray` there is in
 * user units unless the stroke is non-scaling — which every stroke here is.
 */
const ASSUMED_BAR_CLASSES = '[fill-opacity:0.35] [stroke-dasharray:3_2]';

/**
 * The classes a bar carries beyond its two colours, and the two facts they say.
 *
 * The critical path is a ring rather than a fill, because the fill is the
 * assignee: it is asserted by name in `gantt-panel.test.tsx` rather than through
 * a `data-` attribute that could be right while the bar drew like every other
 * one. `data-critical` rides along for the browser gate, which needs to find the
 * bar before it can measure it.
 *
 * `[stroke-width:2]` and not a border: strokes here carry
 * `vector-effect="non-scaling-stroke"`, so 2 is 2 CSS pixels at any zoom of a
 * user space measured in workdays.
 */
function barClasses(critical: boolean, estimated: boolean): string {
  return [
    critical ? 'stroke-foreground [stroke-width:2]' : '',
    estimated ? '' : ASSUMED_BAR_CLASSES,
  ]
    .filter((part) => part !== '')
    .join(' ');
}

/**
 * How much room the on-bar label leaves at each end of the bar, in CSS pixels,
 * and roughly how wide one of its characters is at `text-[10px]` semibold.
 *
 * `LABEL_CHAR_PX` is an estimate and is allowed to be: it decides only whether a name
 * is swapped for initials or dropped, and it is deliberately generous so the
 * swap happens before a name is clipped rather than after. The browser gate is
 * what judges the result.
 */
const LABEL_PAD_PX = 3;
const LABEL_CHAR_PX = 5.5;

/**
 * Somebody's initials: the first letter of their first and last names.
 *
 * What a bar too narrow for a name gets. Two letters at most, because a third
 * costs as much room again and says almost nothing.
 */
export function initialsOf(personName: string): string {
  const words = personName.split(/\s+/).filter((word) => word !== '');
  const first = words.at(0);
  if (first === undefined) return '';
  // The last word only when there is one: `Anna` is `A`, and `Anna Adams` is
  // `AA` — repeating the first letter for a one-word name would be a wrong
  // answer rather than a short one.
  const last = words.length > 1 ? (words.at(-1) ?? '') : '';
  return (first.slice(0, 1) + last.slice(0, 1)).toUpperCase();
}

/**
 * What a bar writes on itself: the person's name, their initials, or nothing.
 *
 * The three answers are one measurement — how many pixels the bar is, which is
 * its **drawn** span through {@link DAY_PX} — so the threshold is not a second
 * constant to keep in step with the drawing. A bar with nobody on it writes
 * nothing: its colour already says so.
 *
 * Null rather than an empty string, so a caller cannot render a label that is
 * there and blank.
 */
export function barLabelFor(personName: string | null, drawnSpan: number): string | null {
  if (personName === null || personName.trim() === '') return null;
  const room = drawnSpan * DAY_PX - 2 * LABEL_PAD_PX;
  if (room >= personName.length * LABEL_CHAR_PX) return personName;
  const initials = initialsOf(personName);
  if (initials !== '' && room >= initials.length * LABEL_CHAR_PX) return initials;
  return null;
}

/**
 * What an unestimated bar writes on itself: the `?` always, and whoever is on it
 * if there is room for them too.
 *
 * The `?` is the point and is never dropped for the name: this bar's width is
 * {@link ASSUMED_UNESTIMATED_WORKDAYS} and not an estimate, and a bar that says
 * `Kat` and nothing else is a bar claiming two days of Kat's time. So the
 * candidates are tried longest-first and the bare `?` is the last of them —
 * which at two workdays always fits, and is what a bar drawn narrower than that
 * would fall back to.
 *
 * Null rather than an empty string, for {@link barLabelFor}'s reason: a caller
 * cannot render a label that is there and blank.
 */
export function assumedLabelFor(personName: string | null, drawnSpan: number): string | null {
  const room = drawnSpan * DAY_PX - 2 * LABEL_PAD_PX;
  const who = personName === null ? '' : personName.trim();
  const candidates = who === '' ? ['?'] : [`${who} · ?`, `${initialsOf(who)} · ?`, '?'];
  return candidates.find((label) => room >= label.length * LABEL_CHAR_PX) ?? null;
}

/**
 * One cell of the axis: where it stands, what it prints, and what it is.
 *
 * `offset` is the cell's own place in the chart's user space — one unit per
 * cell, so cell `k` stands at `x = k` and the axis and the canvas under it
 * cannot drift. `date` and `workday` are the two things a cell may or may not
 * have: a plan with no start date has no dates at all, and a weekend cell of a
 * calendar has no workday number.
 */
interface AxisDay {
  offset: number;
  /** The workday this cell is, or null on a weekend and on a plan with no calendar. */
  workday: number | null;
  date: IsoDate | null;
  shown: string;
  weekend: boolean;
  /** Whether the heavy gridline falls here — a Monday, or every fifth workday off a calendar. */
  heavy: boolean;
}

/**
 * The workday axis: one cell per whole workday the horizon reaches, printing
 * the offset itself.
 *
 * What a plan with **no start date** is drawn on, and nothing else. It holds no
 * weekend anywhere — there is no calendar to have one on — so the week boundary
 * is {@link WEEK_DAYS} arithmetic rather than a date.
 */
function workdayAxis(horizon: number): AxisDay[] {
  return Array.from({ length: Math.ceil(horizon) }, (_, workday) => ({
    offset: workday,
    workday,
    date: null,
    shown: String(workday),
    weekend: false,
    heavy: workday % WEEK_DAYS === 0,
  }));
}

/**
 * The calendar axis: one cell per calendar day from the plan's first working
 * day, weekends among them.
 *
 * Cell `k` is `origin + k` calendar days and stands at user-space `x = k`,
 * which is the same reading {@link placeOnCalendar} gives every mark under it —
 * the two cannot drift because they are one scale. The weekend cells are the
 * point of the whole change: a bar that used to cross a Saturday of no width
 * now stops at one two cells wide.
 *
 * The origin is `addWorkdays(startDate, 0)`, the same normalisation the Start
 * column and {@link calendarScale} make, so a project beginning on a weekend
 * begins on the Monday. The dates come from the module be-01 prints the Start
 * column with, imported directly rather than through `libs/domain`'s index,
 * which re-exports arktype-touching validators this bundle excludes
 * (`wbs-api.ts:1-9`).
 *
 * The heavy line falls on a **Monday** and not on every fifth cell: a calendar
 * week is seven cells wide and its fifth is a Saturday.
 *
 * @throws Whatever `addWorkdays` throws when `startDate` is not a calendar
 * date. be-01 validated it at its boundary; a string that reaches here and is
 * not one is malformed trusted data, and the panel lets it reach the error
 * boundary rather than drawing an axis of `Invalid Date`.
 */
function calendarAxis(startDate: IsoDate, horizon: number): AxisDay[] {
  const origin = addWorkdays(startDate, 0);
  // Counted as the days are walked rather than asked for per cell: the workday
  // a calendar day is, is how many working days have gone before it, and the
  // walk already knows. The origin is a workday by construction, so the first
  // cell takes 0.
  let workday = -1;
  return Array.from({ length: Math.ceil(horizon) }, (_, offset) => {
    const date = addCalendarDays(origin, offset);
    const weekend = isWeekend(date);
    if (!weekend) workday += 1;
    return {
      offset,
      workday: weekend ? null : workday,
      date,
      weekend,
      heavy: isMonday(date),
      // The day of the month alone: 28px is not a date. The whole date is on
      // the cell — in `data-axis-date` and in the `title` — and the corner
      // above the labels says which month these numbers are days of.
      shown: date.slice(8),
    };
  });
}

/**
 * The last workday a span is still on: the same `ceil − 1` nudge be-01's
 * `datesOf` makes, for the same reason.
 *
 * A task of any length occupies the day it finishes on, so a two-day task
 * starting on workday 3 is still on workday 4 and not on workday 5.
 *
 * Proof: the `- 1` dropped, so a bar's last day is `ceil(finish)`. `reads the
 * same dates under a bar as the row's Start and End cells` in
 * `gantt-panel.test.tsx` failed on `expected '2026-08-17' to be '2026-08-14'`
 * and nothing else in the file did — one workday late is three calendar days
 * late over a weekend, the chart naming the Monday for work the End column
 * says finished on the Friday. Watched, 2026-08-09.
 */
export const lastWorkdayOf = (start: number, finish: number): number =>
  Math.max(start, Math.ceil(finish) - 1);

/**
 * The days a bar runs over, for the sentence it shows on hover.
 *
 * The same two dates the row's Start and End columns print, computed the same
 * way rather than read off the row: this is the panel's own reading of the
 * engine's numbers, and a test comparing the two is what says they agree.
 * Without a project start date there are no days to name, so the workday
 * offsets stand in — the same fallback the axis above makes.
 *
 * **Workday arithmetic on the engine's own offsets, never the calendar scale's
 * coordinates.** `placeOnCalendar` answers where a mark is *drawn*, and a
 * coordinate is not an index into working days: a slice running 3 → 5 has its
 * right edge at calendar day 5, which off a Monday origin is the Saturday
 * nobody worked, while `addWorkdays(origin, 5)` is the Monday after it. The
 * floor is explicit for the same reason it is written in the spec — a
 * fractional start is half-way through a working day, and half a day is not
 * half a date.
 *
 * Printed by {@link shortIsoDate} and by nothing else: `shortInstant` formats an
 * epoch in the browser's zone, and a `new Date(iso)` of its own parses midnight
 * UTC and reads the day back in the reader's, one day early for everybody west
 * of Greenwich.
 */
function spanWords(startDate: IsoDate | null, start: number, finish: number, today: Date): string {
  if (startDate === null) return `Workdays ${daysNumber(start)} → ${daysNumber(finish)}`;
  const from = addWorkdays(startDate, Math.floor(start));
  const to = addWorkdays(startDate, lastWorkdayOf(start, finish));
  return `${shortIsoDate(from, today)} → ${shortIsoDate(to, today)}`;
}

/**
 * A number of days as prose reads it: two decimals at most, and no trailing
 * zeroes.
 *
 * The one place a schedule number is **not** carried verbatim, and deliberately
 * so: PERT hands out 3.6666666666666665, which is the right number to draw with
 * and an unreadable thing to write in a sentence. The drawing and the
 * `data-start`/`data-finish` attributes beside it still carry it whole — this
 * is prose, and it says so by rounding.
 */
const daysNumber = (days: number): string => String(Number(days.toFixed(2)));

/** `1 day`, `2 days`, `3.67 days`. */
function dayWords(days: number): string {
  const shown = daysNumber(days);
  return `${shown} ${shown === '1' ? 'day' : 'days'}`;
}

/** How long a bar runs, and what an unestimated slice says instead of a length. */
const durationWords = (bar: GanttBar): string =>
  bar.estimated ? dayWords(bar.duration) : 'not estimated';

/** The service team a bar is labelled with, in words, absences included. */
function teamWords(team: ServiceTeamLabel): string {
  switch (team.state) {
    case 'named':
      return `Team ${team.name}`;
    case 'none':
      return 'No team';
    // Not a blank and not a throw: the label and the team list are two reads at
    // two moments, so a team added between them is stale rather than lost. See
    // {@link ServiceTeamLabel}.
    case 'unresolved':
      return 'Team not in this directory read';
  }
}

/** A bar's own role's three points, or the absence of them, in words. */
function trioWords(trio: EstimateTrio | null): string {
  if (trio === null) return 'No estimate for this role';
  return [trio.optimistic, trio.realistic, trio.pessimistic].map(daysNumber).join('/');
}

/**
 * Everything a bar can say about itself, one fact to a line, in the order a
 * reader meets them: which row, who and what, the team, the dates, the trio,
 * the float, what holds it where it is, and what it waits for.
 *
 * Lines rather than one string, because the same facts are rendered twice — as
 * paragraphs in the hover surface and joined onto the bar's `aria-label`, which
 * is what carries them once the native `<title>` is off the bars. One
 * derivation, so the two cannot drift.
 *
 * Every absence is a named state: no role, nobody assigned, no team, a team the
 * directory read does not hold, no estimate for this role — each says so in
 * words rather than leaving a blank or dropping its line, because a reader
 * cannot tell a missing fact from a fact nobody wrote down. The one line that
 * _is_ dropped is what the row waits for, and only when it waits for nothing:
 * `after` with nothing after it is not a fact.
 *
 * The floor keeps its place near the end because it is the sentence the panel
 * was built to show.
 *
 * @param bar the slice this states the facts of.
 * @param startDate the day the plan begins, or null while it is not on a
 * calendar and the words are workday offsets.
 * @param today the reader's own today, which is the year {@link shortIsoDate}
 * measures its omission against.
 */
export function barFacts(bar: GanttBar, startDate: IsoDate | null, today: Date): string[] {
  return [
    // The row's own label, word for word — {@link rowWords} and not a second
    // spelling of it, so the surface opens on the same line the chart's label
    // column and the plan's Number column read.
    rowWords(bar.workItemNumber, bar.workItemName),
    `${bar.roleName ?? 'No role'} · ${bar.personName ?? 'Unassigned'}`,
    teamWords(bar.team),
    `${spanWords(startDate, bar.start, bar.finish, today)} · ${durationWords(bar)}`,
    // A line of its own rather than a word tucked into the duration: the bar is
    // drawn a width nobody gave it, and the sentence that says so has to be as
    // findable as the dates above it. See {@link ASSUMED_UNESTIMATED_WORKDAYS}.
    bar.estimated ? null : `Not estimated — drawn as ${dayWords(ASSUMED_UNESTIMATED_WORKDAYS)}`,
    trioWords(bar.trio),
    bar.critical ? 'On the critical path — no float' : `Float ${dayWords(bar.float)}`,
    bar.floorWords,
    bar.waitsFor.length === 0 ? null : `after ${bar.waitsFor.join(', ')}`,
  ].filter((line): line is string => line !== null);
}

/**
 * A row named the way the plan names it: its number, then its name.
 *
 * The number is what a person says out loud about a row — it is what the
 * Depends on chips carry, what the toasts name and what the keyboard's labels
 * are written from — and a chart label of names alone made the two drawings of
 * one plan read as two plans. An unnamed row still has a number, which is the
 * whole of why the empty name has words of its own here.
 */
export const rowWords = (number: string, name: string): string =>
  `${number} - ${name === '' ? '(unnamed)' : name}`;

/**
 * What a not-before caret says on hover: the date the row cannot start before.
 *
 * The mark itself can only say *where*, and a workday on a scaled axis is not a
 * date anybody can read off. The offset is turned back into a date by the same
 * `addWorkdays` the axis above it is printed with — `wbs-table.tsx`'s
 * `notBeforeOffsetOf` got the offset out of the stored date with that function's
 * own inverse, so this reads back the day that was typed.
 *
 * Without a project start date there is no date to name, and the axis is
 * offsets: the sentence says the offset, exactly as {@link spanWords} does.
 */
function notBeforeWords(startDate: IsoDate | null, offset: number): string {
  if (startDate === null) return `No earlier than workday ${daysNumber(offset)}`;
  return `No earlier than ${addWorkdays(startDate, offset)}`;
}

/**
 * The Gantt panel: the placed schedule drawn, in the units it was placed in.
 *
 * **One SVG whose user space is the schedule, one day per unit.** With a start
 * date that unit is a **calendar** day and every horizontal coordinate on the
 * chart — the axis included — comes from {@link placeOnCalendar}; without one
 * it is a workday and the engine's numbers stand as they are
 * ({@link placeOnWorkdays}). Nothing in here reads a workday number as a
 * position, and nothing multiplies by {@link DAY_PX} except the two arrangements
 * of HTML around the SVG. A bar's `data-start`/`data-finish` stay the engine's
 * workday numbers whatever the unit is: the test hook is engine-true, the
 * drawing is the scale's, and the difference between them is what says the
 * conversion happened.
 *
 * The one width that is not the engine's is an unestimated slice's; it is
 * marked as a guess in the paint and in the words. See
 * {@link ASSUMED_UNESTIMATED_WORKDAYS}.
 *
 * **The words are not marks.** The dates a bar and a caret say are
 * `addWorkdays`/{@link lastWorkdayOf} on the engine's workday numbers and are
 * never read off a coordinate — a bar that stops at calendar day 5 stops at a
 * Saturday nobody worked, while the fifth working day is the Monday after it.
 *
 * The cost of that non-uniform scale is that glyphs and stroke widths would be
 * stretched with it, so **the SVG holds geometry and nothing else**: every word
 * is HTML around it — the row labels in the sticky-left column, the calendar in
 * the axis row, and the assignee written **over** each bar by the same
 * {@link DAY_PX} arithmetic — and every stroke carries
 * `vector-effect="non-scaling-stroke"`.
 *
 * **A bar says what it is in a surface, not in a tooltip.** The `<title>`
 * children the bars used to carry are gone: they were browser-placed and
 * browser-timed, and a second tooltip beside the one this application draws is
 * a bug. What a bar knows is now {@link barFacts}, rendered into the same
 * {@link HoverCard} the Name cell opens — portalled, because the SVG can hold
 * no HTML — and joined onto the bar's `aria-label`, which is the accessible
 * name that had to arrive **before** the `<title>` left. The not-before caret
 * keeps its own `<title>`: it is the one mark here with no surface, and its
 * words are a single stored date rather than a slice's facts.
 *
 * **A bar's colour is who is on it** — `PERSON_BAR_COLORS` in
 * `gantt-geometry.ts`, handed out there so the whole chart agrees — which is
 * why the critical path is an outline here and not a fill. See
 * {@link barClasses}.
 *
 * A cycle draws no bars at all. be-01 sends an empty slice array with it and
 * the row projections are meaningless, so the honest answer is the sentence
 * rather than a chart of zeroes — the same thing the banner above the plan
 * says, in the place somebody looking at the schedule is looking.
 *
 * @throws GanttDataError out of {@link layOutGantt} when the payload's slices
 * name something the payload has not got. See there.
 */
export function GanttPanel({ plan, startDate, scheduleError, generation, onPickRow }: GanttProps) {
  // The cycle answer is a different panel rather than a branch inside one, and
  // that is what lets {@link GanttChart} hold its hooks unconditionally: this
  // component has none, so the early return below cannot be a hook order that
  // changes with the payload.
  if (scheduleError === 'cycle') {
    return (
      <section data-gantt-panel aria-label="Gantt chart" className="border-border border-t p-3">
        <p role="status" className="text-sm">
          Nothing can be drawn while these dependencies run in a circle — no dates could be worked
          out. Remove one and the chart comes back.
        </p>
      </section>
    );
  }
  return (
    <GanttChart plan={plan} startDate={startDate} generation={generation} onPickRow={onPickRow} />
  );
}

/** What the panel is given: one chart read, and what to do with a click on it. */
interface GanttProps {
  plan: GanttPlan;
  /** The day the plan begins, or null while it is not on a calendar. */
  startDate: IsoDate | null;
  /** be-01's answer when no dates could be worked out at all. */
  scheduleError: 'cycle' | null;
  /**
   * Which chart read this is drawn from — a number that moves whenever a new
   * one lands.
   *
   * An open hover surface is closed when this moves, and that is the whole of
   * why it is a prop rather than something the panel could work out. A slice
   * that keeps its id across a refetch keeps its `<rect>`: React reuses the
   * node, nothing unmounts, and a surface left open would go on stating the
   * numbers of a read that has been replaced.
   */
  generation: number;
  /** Takes the plan to a row — the caller decides what "takes" means. */
  onPickRow: (rowId: string) => void;
}

/**
 * How long the pointer has to rest on a bar before its surface opens, in ms.
 *
 * The one delay in this application's hover cards — the table's open with none
 * (`instant-hovers`) — and it is here because the marks are 28px apart on a
 * chart a reader crosses to get anywhere. A pointer travelling over eight bars
 * would otherwise open eight surfaces on its way to the ninth.
 *
 * The keyboard has no delay: focus is deliberate and there is no crossing.
 */
const HOVER_OPEN_MS = 220;

/** The surface that is open: whose bar it belongs to, and the rectangle it was placed against. */
interface OpenSurface {
  sliceId: string;
  anchor: AnchorRect;
}

/**
 * The chart itself — every hook this panel has, and the drawing.
 *
 * Separate from {@link GanttPanel} for the cycle answer's sake alone; see
 * there.
 */
function GanttChart({ plan, startDate, generation, onPickRow }: Omit<GanttProps, 'scheduleError'>) {
  // How far the chart is scrolled, in CSS pixels. Held only so the caption can
  // name the month actually on screen.
  const [scrolledPx, setScrolledPx] = useState(0);
  const [open, setOpen] = useState<OpenSurface | null>(null);
  /** The opening that has been asked for and not yet happened. */
  const opening = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelOpening = useCallback(() => {
    if (opening.current !== null) clearTimeout(opening.current);
    opening.current = null;
  }, []);
  const dismiss = useCallback(() => {
    cancelOpening();
    setOpen(null);
  }, [cancelOpening]);

  // Every timer this panel started, stopped when it goes: a surface opening
  // 220ms after the chart was closed is a state update on a component nobody
  // is looking at.
  useEffect(() => cancelOpening, [cancelOpening]);

  const chart = layOutGantt(plan);
  /** The bar the open surface belongs to, or null when there is no surface or no such bar. */
  const openBar =
    open === null ? null : (chart.bars.find((bar) => bar.sliceId === open.sliceId) ?? null);

  // The anchor has gone: its row was collapsed away, narrowed off by a search,
  // or is simply no longer drawn. A surface pointing at a mark that is not on
  // the chart is worse than none.
  useEffect(() => {
    if (open !== null && openBar === null) setOpen(null);
  }, [open, openBar]);

  // The chart read has been replaced, **whether or not the anchor survived**.
  // A slice keeping its id across a refetch keeps its `<rect>` — React reuses
  // the node and nothing unmounts — so the check above cannot see this at all
  // while every number under the surface has changed. See
  // {@link GanttProps.generation}.
  useEffect(() => {
    setOpen(null);
  }, [generation]);

  // At least one row of user space, so an empty plan still has a viewBox with a
  // height rather than one the browser divides by.
  const rowCount = Math.max(1, chart.labels.length);
  /** The reader's own today, which is the year {@link shortIsoDate} omits. */
  const today = new Date();
  /**
   * The chart resolved into the unit it is drawn in, and the axis over it.
   *
   * The two are one decision made once: with a start date every mark is a
   * calendar-day offset and the axis is a calendar; without one the engine's
   * workday numbers stand as they are, no scale is built and nothing is asked
   * for a date. That is a state this panel is in, not a path it falls through.
   */
  const placed = startDate === null ? placeOnWorkdays(chart) : placeOnCalendar(chart, startDate);
  const axis =
    startDate === null ? workdayAxis(placed.horizon) : calendarAxis(startDate, placed.horizon);
  // How many cells the axis holds — every whole day of the schedule. Read off
  // the axis rather than rounded again here, and deliberately **not** what the
  // canvas below is sized from: the two are computed apart so that a test can
  // ask whether they agree. An axis built from a horizon the canvas is not on
  // is two cells short of the chart under it and every label drifts right.
  const days = axis.length;
  // The band outside the schedule, in the user space's own unit: a day is
  // {@link DAY_PX} across, so this is what {@link CHART_PAD_PX} is worth in
  // them. See there for why the canvas is wider than the horizon.
  const pad = CHART_PAD_PX / DAY_PX;
  const chartWidth = days * DAY_PX + 2 * CHART_PAD_PX;
  const rowIdAt = (rowIndex: number): string | undefined => chart.labels[rowIndex]?.id;
  /**
   * The first cell at least partly visible right of the sticky labels. The
   * labels overlay the scroll content's left edge, so the first chart pixel on
   * screen sits `scrolledPx` past the pad in the chart's own coordinates.
   * Clamped so an overscroll or an empty axis still names a real day.
   *
   * Proof: the caption pinned back to `axis[0]` — `names the month that is on
   * screen, not the one it started in` failed on `Unable to find an element
   * with the text: 2026-09` while the opening-month test beside it stayed
   * green. Watched, 2026-08-09.
   */
  const firstVisibleCell = Math.min(
    Math.max(0, Math.floor((scrolledPx - CHART_PAD_PX) / DAY_PX)),
    Math.max(0, days - 1),
  );

  /**
   * Opens a surface on one bar, against the rectangle the browser has that
   * mark at.
   *
   * The rectangle is read here and kept, rather than the element: the surface
   * is a fixed layer outside this scroll box, so a live measurement would
   * follow the bar while the card stayed where it was put. Scrolling dismisses
   * instead — see the panel's `onScroll`.
   */
  const showSurface = (sliceId: string, mark: SVGRectElement): void => {
    const box = mark.getBoundingClientRect();
    setOpen({ sliceId, anchor: { left: box.left, top: box.top, bottom: box.bottom } });
  };

  return (
    <section
      data-gantt-panel
      aria-label="Gantt chart"
      // Its own scroll area, in both directions: the plan above keeps its frame
      // and this takes a bounded share of what is left, so neither the page nor
      // the section it sits in ever scrolls sideways. `shrink-0` with a max
      // height rather than a flex basis — the table stays the editor and the
      // chart takes what it needs up to the cap.
      className="border-border max-h-[40vh] shrink-0 overflow-auto border-t"
      onScroll={(scrollEvent) => {
        setScrolledPx(scrollEvent.currentTarget.scrollLeft);
        // The surface is a fixed layer and is not in this scroll box, so the
        // bar moves out from under it and the card stays where it was put. A
        // surface pointing at the wrong bar is worse than none.
        dismiss();
      }}
    >
      <div className="flex w-max">
        {/*
          Holds the left edge while the chart scrolls under it. `sticky left-0`
          inside this scroll container, with a background of its own — a
          transparent one would have the bars painted through the names.
        */}
        <div
          data-gantt-labels
          className="bg-background border-border sticky left-0 z-10 shrink-0 border-r"
          style={{ width: LABEL_COLUMN_PX }}
        >
          <div
            className="text-muted-foreground border-border bg-muted/40 flex items-center border-b px-2 text-[10px] font-semibold tracking-wide uppercase"
            style={{ height: ROW_PX }}
          >
            {startDate === null
              ? 'Workday'
              : (axis[firstVisibleCell]?.date?.slice(0, 7) ?? 'Workday')}
          </div>
          {chart.labels.map((label: GanttRowLabel) => (
            <button
              key={label.id}
              type="button"
              data-gantt-label={label.id}
              // The same words the button shows, so a label the column has
              // truncated can still be read whole on hover.
              //
              // Proof: the button's text put back to `label.name === '' ?
              // '(unnamed)' : label.name` — the chart labelled by name alone.
              // **Four** tests failed, `4 failed | 39 passed`: `leaves a
              // collapsed branch's children off the chart`, `draws exactly the
              // rows a search narrowed the plan to` and `draws under the roles
              // the payload carried…` on `expected [ 'Hull', 'Sanding',
              // 'Sealing', …(1) ] to deeply equal [ '010 - Hull', '011 -
              // Sanding', …(2) ]`, and `takes the plan to a row when its label
              // is clicked` on the button no longer being findable by its
              // number. Watched, 2026-08-09.
              title={rowWords(label.number, label.name)}
              // The house indent, so the chart's outline is the plan's outline.
              style={{ height: ROW_PX, paddingLeft: indentFor(label.depth) + 8 }}
              className="hover:bg-accent block w-full truncate pr-2 text-left text-xs"
              onClick={() => {
                onPickRow(label.id);
              }}
            >
              {rowWords(label.number, label.name)}
            </button>
          ))}
        </div>

        <div className="shrink-0" style={{ width: chartWidth }}>
          {/*
            The calendar, in HTML and positioned by the same {@link DAY_PX} the
            SVG is sized by — which is what lets a browser check that a bar's
            left edge is under its own date. Inside the SVG it would be text in
            a stretched user space.
          */}
          <div
            data-gantt-axis
            className="border-border bg-muted/40 flex border-b"
            // The same band the SVG keeps at its left, so workday 0's cell
            // starts where the SVG's user x=0 does. Without it the whole
            // calendar sits {@link CHART_PAD_PX} left of the bars it labels.
            style={{ height: ROW_PX, paddingLeft: CHART_PAD_PX }}
          >
            {axis.map((day) => (
              <span
                key={day.offset}
                // Where the cell stands, which is the same number every mark
                // under it is placed at. The workday it **is** rides beside it
                // — a weekend cell is nobody's workday, and a bar's
                // `data-start` is a workday, so the two attributes are how a
                // test says the conversion happened.
                data-axis-day={day.offset}
                {...(day.date === null ? {} : { 'data-axis-date': day.date })}
                {...(day.workday === null ? {} : { 'data-axis-workday': day.workday })}
                {...(day.weekend ? { 'data-axis-weekend': 'true' } : {})}
                title={day.date ?? `Workday ${String(day.workday ?? day.offset)}`}
                // The first day of each week reads as the heading it is, over
                // the heavier gridline under it; a weekend cell is greyed back,
                // like the column beneath it.
                className={[
                  'shrink-0 text-center text-[10px] leading-7',
                  day.heavy ? 'text-foreground font-semibold' : 'text-muted-foreground',
                  day.weekend ? 'bg-muted-foreground/10' : '',
                ]
                  .filter((part) => part !== '')
                  .join(' ')}
                style={{ width: DAY_PX }}
              >
                {day.shown}
              </span>
            ))}
          </div>
          {/*
            The chart and the words on it, stacked: the SVG lays the geometry
            out and the spans below sit on top of it, positioned by the same
            {@link DAY_PX} and {@link ROW_PX} the SVG is sized by. `relative` is
            what they are absolute against.
          */}
          <div className="relative">
            <svg
              data-gantt-chart
              // The contract, in three attributes: the user space is days by
              // rows, and the CSS size is the only place either becomes a pixel.
              // The schedule band is the **horizon** the marks were placed
              // against, so one user unit is exactly {@link DAY_PX} however
              // fractional the last day is.
              viewBox={`${String(-pad)} 0 ${String(placed.horizon + 2 * pad)} ${String(rowCount)}`}
              preserveAspectRatio="none"
              width={placed.horizon * DAY_PX + 2 * CHART_PAD_PX}
              height={rowCount * ROW_PX}
              style={{ display: 'block' }}
            >
              {/*
                The weekends, as columns. Drawn first and so **under** the row
                bands and every mark: this is the change's whole point on
                screen, and it is a column of the chart rather than a seam
                between two days. A plan with no start date has none — there is
                no calendar to have a Saturday on.
              */}
              {axis
                .filter((day) => day.weekend)
                .map((day) => (
                  <rect
                    key={`${String(day.offset)}-weekend`}
                    data-gantt-weekend={day.offset}
                    x={day.offset}
                    y={0}
                    width={1}
                    height={rowCount}
                    className="fill-muted-foreground/10"
                  />
                ))}

              {/*
                A band behind every other row, so an eye tracking one row across
                a chart wider than the window does not land a row out. Over the
                weekend columns and under everything else, in the user space's
                own units — a row is 1.
              */}
              {chart.labels
                .filter((label) => label.rowIndex % 2 === 1)
                .map((label) => (
                  <rect
                    key={`${label.id}-band`}
                    data-gantt-band={label.rowIndex}
                    x={0}
                    y={label.rowIndex}
                    width={days}
                    height={1}
                    className="fill-muted/40"
                  />
                ))}

              {axis.map((day) => (
                <line
                  key={day.offset}
                  x1={day.offset}
                  y1={0}
                  x2={day.offset}
                  y2={rowCount}
                  data-gantt-gridline={day.offset}
                  // The week boundary heavier: a Monday on a calendar, and every
                  // fifth workday on an axis that holds no weekends to count
                  // from. See {@link WEEK_DAYS} and {@link calendarAxis}.
                  className={day.heavy ? 'stroke-border' : 'stroke-border/40'}
                  vectorEffect="non-scaling-stroke"
                />
              ))}

              {/*
                A summary row's span, drawn as a bracket whose legs **drop**:
                the top line sits where a bar's top would be and the two ends
                fall to the row's middle, which is the shape a reader already
                reads as "everything under here". It used to be the same four
                points the other way up — a 1px trough that read as a scratch.
                2px non-scaling, at the foreground's full strength, because it
                is one of the two marks on the chart that says something no bar
                says.
              */}
              {placed.brackets.map((bracket) => (
                <path
                  key={bracket.rowId}
                  data-gantt-bracket={bracket.rowId}
                  d={
                    `M ${String(bracket.from)} ${String(bracket.rowIndex + ROW_MIDDLE)} ` +
                    `L ${String(bracket.from)} ${String(bracket.rowIndex + BAR_INSET)} ` +
                    `L ${String(bracket.to)} ${String(bracket.rowIndex + BAR_INSET)} ` +
                    `L ${String(bracket.to)} ${String(bracket.rowIndex + ROW_MIDDLE)}`
                  }
                  className="stroke-foreground fill-none [stroke-width:2]"
                  vectorEffect="non-scaling-stroke"
                />
              ))}

              {/*
                A stored dependency: an elbow that always arrives horizontally at
                the successor's left edge, and a filled head on the end of it.
                See {@link arrowRoute} — the head is a path rather than a
                `<marker>`, and the route jogs when the two bars touch.
              */}
              {placed.arrows.map((arrow) => {
                const route = arrowRoute(arrow);
                const id = `${arrow.predecessorId}->${arrow.successorId}`;
                return (
                  <g key={id}>
                    <path
                      data-gantt-arrow={id}
                      d={route.elbow}
                      className="stroke-foreground fill-none [stroke-width:1.5]"
                      vectorEffect="non-scaling-stroke"
                    />
                    {/*
                      No `vector-effect` and no stroke: the head is filled, so
                      nothing about it is a stroke width to hold steady.
                    */}
                    <path data-gantt-arrow-head={id} d={route.head} className="fill-foreground" />
                  </g>
                );
              })}

              {/*
              Drawn unlike a dependency, because it is not one: nobody wrote this
              down. It is where one person's queue put a slice behind another.
            */}
              {placed.personLinks.map((link) => (
                <path
                  key={`${link.fromSliceId}->${link.toSliceId}`}
                  data-gantt-person-link={`${link.fromSliceId}->${link.toSliceId}`}
                  d={
                    `M ${String(link.fromX)} ${String(link.fromRowIndex + ROW_MIDDLE)} ` +
                    `L ${String(link.toX)} ${String(link.toRowIndex + ROW_MIDDLE)}`
                  }
                  // The person's own colour, so the line and the two bars it
                  // joins read as one queue rather than as a third kind of edge.
                  stroke={link.personColor}
                  className="fill-none [stroke-dasharray:4_3]"
                  vectorEffect="non-scaling-stroke"
                />
              ))}

              {/*
                Where a row's own start date holds it: a caret in the clear band
                above the bar, pointing at the day. Above and not on, because on
                is where it was and where nothing could see it — see
                {@link NOT_BEFORE_LENGTH_PX}. The `<title>` names the date,
                which is the one thing the mark's position cannot say.
              */}
              {placed.notBeforeFlags.map((flag) => (
                <path
                  key={`${String(flag.rowIndex)}@${String(flag.workday)}`}
                  data-gantt-not-before={flag.rowIndex}
                  d={
                    `M ${String(flag.x)} ${String(flag.rowIndex + NOT_BEFORE_CLEARANCE)} ` +
                    `L ${String(flag.x + NOT_BEFORE_LENGTH_PX / DAY_PX)} ` +
                    `${String(flag.rowIndex + BAR_INSET / 2)} ` +
                    `L ${String(flag.x)} ` +
                    `${String(flag.rowIndex + BAR_INSET - NOT_BEFORE_CLEARANCE)} Z`
                  }
                  className="fill-foreground"
                >
                  {/*
                    The **workday**, not the coordinate: the caret stands where
                    the calendar puts it and says the date the row was held at,
                    and `x` is a position on a canvas rather than an index into
                    the working days.
                  */}
                  <title>{notBeforeWords(startDate, flag.workday)}</title>
                </path>
              ))}

              {placed.bars.map(({ bar, x, width }) => (
                <rect
                  key={bar.sliceId}
                  data-gantt-bar={bar.sliceId}
                  // The engine's own **workday** numbers, and the geometry
                  // beside them is the calendar's: the two are allowed to
                  // disagree, and the difference between them is exactly what a
                  // test reads to say the conversion happened. A bar at workday
                  // 5 on a Monday-start plan carries `data-start="5"` and stands
                  // at `x="7"`.
                  data-start={bar.start}
                  data-finish={bar.finish}
                  // The last workday this bar is still on, which is the axis cell
                  // its right edge stops inside rather than the one it stops at.
                  // See {@link lastWorkdayOf} — it is the one number about a bar
                  // that cannot be read off `x` and `width` without repeating the
                  // nudge, and the browser gate has to know it to say which label
                  // the edge should line up with.
                  data-last-day={lastWorkdayOf(bar.start, bar.finish)}
                  {...(bar.critical ? { 'data-critical': 'true' } : {})}
                  // The bar whose width is an assumption, findable as such. The
                  // styling below is what a reader sees; this is what the
                  // browser gate selects on, and it has to tell a drawn span
                  // from a measured one before it measures anything.
                  {...(bar.estimated ? {} : { 'data-assumed': 'true' })}
                  x={x}
                  // The **drawn** span in calendar days — the end reading of
                  // the drawn finish less the start reading of the start, so a
                  // bar working through a weekend is drawn across it and one
                  // stopping on the Friday stops at the Saturday. Never a span
                  // from the engine's `finish`: an unestimated slice finishes
                  // where it starts, and that width is no bar at all.
                  width={width}
                  y={bar.rowIndex + BAR_INSET}
                  height={BAR_HEIGHT}
                  rx={BAR_RADIUS_PX / DAY_PX}
                  ry={BAR_RADIUS_PX / ROW_PX}
                  // Who is on it — an unestimated slice included, at 35% through
                  // {@link ASSUMED_BAR_CLASSES}. It used to be hollow, which was
                  // honest about the length and cost the reader the assignee;
                  // now it keeps the person and says "guessed" in how it is
                  // painted rather than by having no paint.
                  fill={bar.personColor}
                  // The critical path is the **outline**, because the fill is
                  // already saying who. A ring in the foreground colour rather
                  // than the destructive one: `#d62728` is the fourth person's
                  // colour, and a red ring on a red bar is no ring at all.
                  stroke={bar.critical ? undefined : bar.personColor}
                  className={barClasses(bar.critical, bar.estimated)}
                  vectorEffect="non-scaling-stroke"
                  // A control, because it is one: it takes the keyboard, it has
                  // a name, and Enter and Space act on it. The role is what
                  // makes the `aria-label` below a name a screen reader reads —
                  // a bare `<rect>` is presentational whatever it is labelled.
                  role="button"
                  tabIndex={0}
                  // **The bar's only accessible name**, and the reason it is
                  // here rather than in the `<title>` this change took off the
                  // bars: two tooltips on one mark is a bug, and the browser's
                  // is the one nothing can place or style. The same facts the
                  // surface shows, from the same derivation.
                  aria-label={barFacts(bar, startDate, today).join('. ')}
                  onClick={() => {
                    const rowId = rowIdAt(bar.rowIndex);
                    // A bar with no row is not a state this can be in — the bar
                    // was placed on that row by {@link layOutGantt} — so there is
                    // nothing to do about it but leave the click alone.
                    if (rowId !== undefined) onPickRow(rowId);
                  }}
                  onKeyDown={(key) => {
                    if (key.key !== 'Enter' && key.key !== ' ') return;
                    // Before anything else: Space's own default is to scroll
                    // the panel, and a reader who asked to go to a row and got
                    // the chart scrolled out from under them is R5 #14's fault
                    // wearing another hat. jsdom performs no default action, so
                    // this line is guarded in a browser (`e2e/gantt.spec.ts`).
                    key.preventDefault();
                    const rowId = rowIdAt(bar.rowIndex);
                    if (rowId !== undefined) onPickRow(rowId);
                  }}
                  onPointerOver={(pointer) => {
                    // **The touch seam.** Chromium synthesizes a whole mouse
                    // sequence from a tap — `mouseover` included — so a surface
                    // opened on a mouse event opens on every tap as well, over
                    // the row the tap was taking the reader to. The pointer
                    // events are the only ones that say which they came from.
                    if (pointer.pointerType !== 'mouse') return;
                    const mark = pointer.currentTarget;
                    cancelOpening();
                    opening.current = setTimeout(() => {
                      showSurface(bar.sliceId, mark);
                    }, HOVER_OPEN_MS);
                  }}
                  onPointerOut={dismiss}
                  // No delay on the keyboard: focus is deliberate, and there is
                  // no crossing of the chart to protect a reader from.
                  onFocus={(focus) => {
                    cancelOpening();
                    showSurface(bar.sliceId, focus.currentTarget);
                  }}
                  onBlur={dismiss}
                />
              ))}

              {/*
              A slice **estimated** at no days is a real answer, and a
              zero-width rect draws nothing at all: the tick is where it starts,
              so the row does not read as empty. `drawnSpan` and not `duration`,
              which is the whole of what changed — an unestimated slice has a
              drawn span of {@link ASSUMED_UNESTIMATED_WORKDAYS} now and gets a
              bar of its own, so the tick is left to the zero the engine was
              actually given (`expectedDays({0,0,0})` is 0, and
              `libs/domain/src/estimate.test.ts` says so).
            */}
              {placed.bars
                .filter(({ bar }) => bar.drawnSpan === 0)
                .map(({ bar, x }) => (
                  <line
                    key={`${bar.sliceId}-tick`}
                    x1={x}
                    y1={bar.rowIndex + BAR_INSET}
                    x2={x}
                    y2={bar.rowIndex + BAR_INSET + BAR_HEIGHT}
                    data-gantt-tick={bar.sliceId}
                    stroke={bar.critical ? undefined : bar.personColor}
                    className={bar.critical ? 'stroke-foreground [stroke-width:2]' : ''}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
            </svg>

            {/*
              Who is on each bar, written **in HTML over the SVG** and never in
              it: the user space is non-uniformly scaled and would stretch every
              glyph (design §1). The position is the same arithmetic the axis
              above makes — the engine's workday through {@link DAY_PX} — which
              is what lets a browser check that this span and the rect under it
              start at the same pixel.

              `pointer-events-none` so the label is not a hole in the bar: the
              click that takes the plan to a row belongs to the rect underneath,
              and a span on top would swallow it in its middle.
            */}
            {placed.bars.map(({ bar, x, width }) => {
              // An unestimated bar writes the `?` its width is a guess about —
              // see {@link assumedLabelFor} — and an estimated one writes who is
              // on it. The room is the **drawn** width, weekend cells included:
              // a bar stretched over a Saturday has those pixels to write in.
              const shown = bar.estimated
                ? barLabelFor(bar.personName, width)
                : assumedLabelFor(bar.personName, width);
              if (shown === null) return null;
              return (
                <span
                  key={`${bar.sliceId}-label`}
                  data-gantt-bar-label={bar.sliceId}
                  aria-hidden="true"
                  className={
                    bar.estimated
                      ? 'pointer-events-none absolute overflow-hidden text-[10px] font-semibold text-ellipsis whitespace-nowrap'
                      : // The page's own ink on an assumed bar: `inkOn` picks a
                        // colour to be read on a **solid** fill, and this one is
                        // 35% of that colour over whatever the page is.
                        'text-foreground pointer-events-none absolute overflow-hidden text-[10px] font-semibold text-ellipsis whitespace-nowrap'
                  }
                  style={{
                    // Dark ink on the three light entries of the palette and
                    // white on the other seven, never one white for all ten.
                    // See {@link inkOn}.
                    ...(bar.estimated ? { color: inkOn(bar.personColor) } : {}),
                    // Over the SVG, which now begins one band left of the
                    // schedule: the label's pixel is the bar's pixel only with
                    // the same band added. See {@link CHART_PAD_PX}.
                    left: x * DAY_PX + CHART_PAD_PX,
                    top: (bar.rowIndex + BAR_INSET) * ROW_PX,
                    width: width * DAY_PX,
                    height: BAR_HEIGHT * ROW_PX,
                    lineHeight: `${String(BAR_HEIGHT * ROW_PX)}px`,
                    paddingLeft: LABEL_PAD_PX,
                    paddingRight: LABEL_PAD_PX,
                  }}
                >
                  {shown}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/*
        The one surface, and one at a time by construction: there is a single
        piece of state for it, so a second bar's opening replaces the first's
        rather than adding to it. Notes are deliberately absent — they belong
        to the Name cell's preview, which is the same {@link HoverCard} with a
        different body.
      */}
      {openBar !== null && open !== null && (
        <HoverCard label={`Facts for ${openBar.workItemNumber}`} anchor={open.anchor}>
          {barFacts(openBar, startDate, today).map((line) => (
            <p key={line} className="text-xs">
              {line}
            </p>
          ))}
        </HoverCard>
      )}
    </section>
  );
}
