import { addCalendarDays, isMonday, type IsoDate, workdaysBetween } from '@wbs/domain/workday';

/** How many weeks a load view reads, from the Monday of the week it opens in. */
export const LOAD_WEEKS = 8;

/** The dates a load view reads, inclusive, and how many workdays lie between them. */
export interface LoadWindow {
  readonly from: IsoDate;
  readonly to: IsoDate;
  readonly workdays: number;
}

/**
 * The {@link LOAD_WEEKS} weeks starting on the Monday on or before `today`,
 * read in the viewer's own calendar: a person's week is the one they are in.
 */
export function loadWindowFrom(today: IsoDate): LoadWindow {
  let from = today;
  while (!isMonday(from)) from = addCalendarDays(from, -1);
  const to = addCalendarDays(from, LOAD_WEEKS * 7 - 3);
  return { from, to, workdays: workdaysBetween(from, addCalendarDays(to, 1)) };
}

/** Today in the viewer's calendar, as an ISO date. */
export function localToday(now: Date): IsoDate {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${String(now.getFullYear())}-${month}-${day}`;
}

/**
 * Where an inclusive `startsOn`..`endsOn` run sits across `window`, as
 * fractions of its width, clipped to it; null when it lies wholly outside.
 */
export function placeInWindow(
  window: LoadWindow,
  startsOn: IsoDate,
  endsOn: IsoDate,
): { left: number; width: number } | null {
  const first = startsOn < window.from ? 0 : workdaysBetween(window.from, startsOn);
  const last =
    endsOn > window.to ? window.workdays : workdaysBetween(window.from, addCalendarDays(endsOn, 1));
  if (last <= first) return null;
  return { left: first / window.workdays, width: (last - first) / window.workdays };
}
