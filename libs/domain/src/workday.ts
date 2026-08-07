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
 * kept in the schedule, which is where it means something.
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
  for (let moved = 0; moved < Math.floor(workdays); moved += 1) {
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
