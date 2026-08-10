/**
 * A calendar day, as `YYYY-MM-DD`. No time, no zone.
 *
 * A plan says "this starts on the 12th", never "at 09:00 UTC". Carrying a time
 * would mean carrying a timezone, and a project read in Kyiv and in London
 * would then disagree about which day a work item starts on.
 */
export type IsoDate = string;

const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Whether `value` is a date this module can work with, and a real day. */
export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  // `2026-02-31` matches the shape and is not a day. `Date.parse` accepts it
  // and rolls it into March, so the round-trip is the check.
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Parsed to midnight UTC, so every arithmetic below is whole days apart. */
function toUtc(date: IsoDate): Date {
  if (!isIsoDate(date)) throw new Error(`not a calendar date: ${JSON.stringify(date)}`);
  return new Date(`${date}T00:00:00Z`);
}

const asIso = (at: Date): IsoDate => at.toISOString().slice(0, 10);

/**
 * Whether a date falls on a Saturday or Sunday.
 *
 * Weekends only. Public holidays are deliberately absent: they differ by
 * country, by company and by year, and guessing them would put dates in a plan
 * that nobody can account for. A project that needs them needs a calendar it
 * owns, which is a decision rather than a default.
 */
export function isWeekend(date: IsoDate): boolean {
  const day = toUtc(date).getUTCDay();
  return day === 0 || day === 6;
}

/**
 * Whether a date is a Monday.
 *
 * The day a calendar week begins on, which is where the Gantt's calendar axis
 * puts its heavy gridline: on an axis of seven cells a week, every fifth line
 * falls on a Saturday and says nothing.
 */
export function isMonday(date: IsoDate): boolean {
  return toUtc(date).getUTCDay() === 1;
}

/**
 * How many calendar days `to` is after `from` — weekends counted, and negative
 * when `to` is the earlier of the two.
 *
 * The calendar counterpart of {@link workdaysBetween}, and what the Gantt's
 * calendar scale is built out of: a chart whose x unit is one calendar day has
 * to know that Friday to Monday is three days and not one. Negative is a real
 * answer here where it is not there — this counts days, while
 * {@link workdaysBetween} expresses a constraint that may only ever push later.
 *
 * The answer is a whole number for every pair this can be asked for, and that is
 * {@link toUtc}'s doing rather than a rounding: both ends are midnight UTC, so
 * their difference is a multiple of a day whatever either date's local zone did
 * that night.
 *
 * Proof: the two ends parsed as **local** midnight instead — `new Date(y, m-1,
 * d)` — which is the obvious way to write this and is wrong across a
 * daylight-saving boundary. `crosses a daylight-saving boundary as whole days`
 * alone failed, on `expected 1.9583333333333333 to be 2` for `2026-03-07` →
 * `2026-03-09` with `TZ=America/New_York`: 47 hours over the US spring-forward
 * Sunday. Watched 2026-08-09. Rounding that fault away is **not** the negative
 * — `Math.round` gives 2 either way, and a month-boundary case cannot see it
 * at all, which is the shape R5 exists to stop.
 *
 * @throws Whatever {@link toUtc} throws when either end is not a calendar date.
 */
export function calendarDaysBetween(from: IsoDate, to: IsoDate): number {
  return (toUtc(to).getTime() - toUtc(from).getTime()) / DAY_MS;
}

/**
 * The date `days` calendar days after `from` — over a weekend rather than
 * round it, which is the whole of the difference from {@link addWorkdays}.
 *
 * The inverse of {@link calendarDaysBetween}, and what names the date on each
 * cell of a calendar axis — weekend cells included, which is the one thing
 * `addWorkdays` can never answer.
 *
 * @throws Whatever {@link toUtc} throws when `from` is not a calendar date.
 */
export function addCalendarDays(from: IsoDate, days: number): IsoDate {
  return asIso(new Date(toUtc(from).getTime() + days * DAY_MS));
}

/**
 * How close to a whole day an offset must be before the difference is read as
 * floating-point drift rather than work.
 *
 * A schedule chains `finish = start + days` across work items, and doubles
 * accumulate: three PERT sixths that sum to exactly 15 arrive as
 * 15.000000000000002. At 1e-9 the window is about nine orders of magnitude
 * above any error a plan-sized chain of additions can accumulate, and about
 * eight below the smallest real fraction an estimate can carry (a sixth of a
 * day) — so it can never swallow work someone estimated.
 */
const DRIFT = 1e-9;

/**
 * `workdays` with accumulated floating-point drift removed: within {@link DRIFT}
 * of a whole day it **is** that whole day, and anything further is real work,
 * returned untouched.
 *
 * Applied at the discrete calendar boundaries — {@link addWorkdays}' floor and
 * the three discrete readings {@link firstWorkdayOf}, {@link lastWorkdayOf}
 * and {@link wholeDaysCovering} — and nowhere else: the engine's own numbers
 * stay verbatim on the wire, and only the step from a fractional offset to a
 * whole calendar day may not let one drifted bit mint or eat a day.
 *
 * Proof: with the window widened to 0.5, `keeps a genuine fraction just shy of
 * a boundary as real work` (the production path, `work-item.service.test.ts`)
 * failed — a 14.9-day row's successor started `"2026-08-31"` where
 * `"2026-08-28"` was owed, a shared day rounded away as if it were drift —
 * and `still floors a genuine fraction near a boundary — 14.9 is real work`
 * (`workday.test.ts`) failed on the same pair of dates; watched 2026-08-10.
 */
export function snapWorkdays(workdays: number): number {
  const whole = Math.round(workdays);
  return Math.abs(workdays - whole) < DRIFT ? whole : workdays;
}

/**
 * The whole workday a span standing at `offset` begins on: {@link snapWorkdays},
 * then floor.
 *
 * One of the three discrete calendar readings, shared so that be-01's printed
 * dates and fe-01's Gantt are one arithmetic rather than two copies of a rule
 * — a copy with the snap left out reads a drifted 8.999999999999998 as day 8
 * and starts a row a whole day early on screen. A genuine fraction still
 * floors: half a day is not half a date, and the fraction stays in the
 * schedule, where it means something.
 *
 * Proof: the snap dropped from this floor (a bare `Math.floor(offset)`) and
 * one test failed in each tier — `reads drift on either side of a whole day
 * as that whole day` here; `holds the calendar steady when a chained finish
 * drifts below the whole day` (`work-item.service.test.ts`) on a successor
 * `startsOn` of `"2026-08-20"`, its predecessor's own last day, where
 * `"2026-08-21"` was owed; and `reads a drifted schedule as the same days
 * be-01 prints` (`gantt-panel.test.tsx`) on the bar's sentence losing
 * `13 Aug → 14 Aug` to a bare floor's 12 Aug. Watched 2026-08-10.
 */
export function firstWorkdayOf(offset: number): number {
  return Math.floor(snapWorkdays(offset));
}

/**
 * The last workday a span is still on: {@link snapWorkdays}, then `ceil − 1`,
 * and never before the span's own first workday.
 *
 * A task of any length occupies the day it finishes on, so a two-day task
 * starting on workday 3 is still on workday 4 and not on workday 5 — `ceil −
 * 1` rather than `finish - Number.EPSILON`, which silently does nothing at a
 * whole finish (see `datesOf` in be-01's `work-item.service.ts`, where this
 * arithmetic lived first). The clamp keeps a zero-length span — a parent with
 * nothing under it, an unestimated leaf — on the same day
 * {@link firstWorkdayOf} starts it.
 *
 * The snap is why this is here and not written inline where it is needed: a
 * chain of PERT sixths that sums to exactly 15 arrives as 15.000000000000002,
 * and a bare ceil reads the drifted bit as a sixteenth day — a Monday, three
 * calendar days late on screen.
 *
 * Proof, twice, both watched 2026-08-10:
 *
 * - the snap dropped (a bare `Math.ceil(finish) - 1`): `reads drift on either
 *   side of a whole day as that whole day` failed here, `ends a chain of PERT
 *   estimates on the day the estimates add up to` and `holds the calendar
 *   steady when a chained finish drifts above the whole day`
 *   (`work-item.service.test.ts`) failed on an `endsOn` of `"2026-08-31"`
 *   where `"2026-08-28"` was owed, and `reads a drifted schedule as the same
 *   days be-01 prints` (`gantt-panel.test.tsx`) failed on a `data-last-day`
 *   of `'5'` where `'4'` was owed.
 * - the `- 1` dropped, so a span's last day is the one it spills into: four
 *   cases failed here, and `reads the same dates under a bar as the row's
 *   Start and End cells` (`gantt-panel.test.tsx`) failed on `expected
 *   '2026-08-17' to be '2026-08-14'` — the same failure first watched
 *   2026-08-09 against the panel's own copy of this arithmetic, re-watched
 *   against the shared one.
 */
export function lastWorkdayOf(start: number, finish: number): number {
  return Math.max(firstWorkdayOf(start), Math.ceil(snapWorkdays(finish)) - 1);
}

/**
 * How many whole days cover a span `span` days long: {@link snapWorkdays},
 * then ceil.
 *
 * What sizes a chart axis: a horizon of 5.5 workdays needs six cells, and a
 * horizon of 6.000000000000001 is six days arriving with a drifted bit, not a
 * reason to mint a seventh cell that no mark can ever stand in.
 *
 * Proof: the snap dropped (a bare `Math.ceil(span)`) and `counts the cells a
 * span needs, drift snapped and fractions covered` failed here, with `does
 * not mint an axis cell from a drifted horizon` (`gantt-panel.test.tsx`)
 * failing beside it on a seventh cell — `['0' … '6']` where `['0' … '5']` was
 * owed. Watched 2026-08-10.
 */
export function wholeDaysCovering(span: number): number {
  return Math.ceil(snapWorkdays(span));
}

/** The first workday on or after `date` — `date` itself unless it is a weekend. */
export function nextWorkday(date: IsoDate): IsoDate {
  let at = toUtc(date);
  while (at.getUTCDay() === 0 || at.getUTCDay() === 6) at = new Date(at.getTime() + DAY_MS);
  return asIso(at);
}

/**
 * The date `workdays` working days after `from`, counting `from` as day zero.
 *
 * `addWorkdays(friday, 1)` is the following Monday, and `addWorkdays(x, 0)` is
 * the first workday on or after `x` — so a plan whose start date lands on a
 * Saturday begins on the Monday rather than reporting a day nobody works.
 *
 * Fractional offsets are floored: a task finishing 3.4 workdays in finishes on
 * the fourth working day, and half a day is not half a date. The fraction is
 * kept in the schedule, which is where it means something. The offset is put
 * through {@link snapWorkdays} first: an accumulated 8.999999999999998 is the
 * ninth day arriving with a drifted bit, and flooring it to 8 started a row a
 * whole day early on screen.
 *
 * Proof: the snap removed from this floor and `holds the calendar steady when
 * a chained finish drifts below the whole day` (`work-item.service.test.ts`)
 * failed — the successor started `"2026-08-20"`, its predecessor's own last
 * day, where `"2026-08-21"` was owed — with `reads a whole day arriving with
 * a drifted bit as that whole day` (`workday.test.ts`) failing beside it;
 * watched 2026-08-10.
 *
 * Negative offsets are refused rather than counted backwards. Nothing in this
 * plan happens before its own start, and silently walking into last week is
 * the kind of answer that reads as deliberate.
 */
export function addWorkdays(from: IsoDate, workdays: number): IsoDate {
  if (!Number.isFinite(workdays) || workdays < 0) {
    throw new Error(`workdays must be zero or more, got ${String(workdays)}`);
  }
  let at = toUtc(nextWorkday(from));
  for (let moved = 0; moved < Math.floor(snapWorkdays(workdays)); moved += 1) {
    do {
      at = new Date(at.getTime() + DAY_MS);
    } while (at.getUTCDay() === 0 || at.getUTCDay() === 6);
  }
  return asIso(at);
}

/**
 * How many working days `to` is after `from`, counting `from` as zero.
 *
 * The inverse of {@link addWorkdays} for whole offsets, which is what makes a
 * manual "start no earlier than this date" expressible to a scheduler that
 * counts in offsets. A date before `from` gives 0: the plan cannot start
 * before its own start, and a negative offset would drag the whole tree
 * backwards through a constraint meant only ever to push it later.
 */
export function workdaysBetween(from: IsoDate, to: IsoDate): number {
  const start = toUtc(nextWorkday(from));
  const end = toUtc(nextWorkday(to));
  if (end.getTime() <= start.getTime()) return 0;
  let count = 0;
  let at = start;
  while (at.getTime() < end.getTime()) {
    at = new Date(at.getTime() + DAY_MS);
    if (at.getUTCDay() !== 0 && at.getUTCDay() !== 6) count += 1;
  }
  return count;
}
